"""
Flask 애플리케이션 팩토리
"""
import re
import time
import logging
import threading
import os
import uuid
from urllib.parse import parse_qs, urlparse
from flask import Flask, request, abort, jsonify, g
from flask_cors import CORS
from sqlalchemy import text
from config import Config
from app.models import init_db
from app.security import get_csrf_token, validate_csrf
from app.utils.logging import setup_logging
from app.utils.ua_parser import parse_user_agent

# ── 페이지 접근 로그 설정 ──────────────────────────────────────────
# 로깅할 페이지 경로 (정확한 경로 또는 prefix)
_LOG_EXACT   = {
    '/', '/map', '/map-list', '/list',
    '/liked', '/recent', '/recents', '/profile',
    '/login', '/signup', '/terms', '/privacy',
    '/feedback', '/request', '/compass', '/about',
    '/fee-calc/',
}
_LOG_PREFIX  = ('/view/', '/fee-calc/')
# 제외할 경로 (API·정적파일·이미지·관리자 등)
_SKIP_PREFIX = ('/api/', '/static/', '/images/', '/admin/', '/sync/')
# /view/<숫자> 에서 code 추출용 패턴
_VIEW_CODE_RE = re.compile(r'^/view/(\d+)')
_SITE_DOMAIN_SUFFIXES = ('zibeasy.com', 'localhost', '127.0.0.1')
_SEARCH_SOURCES = {'naver', 'google', 'daum', 'bing'}
_SOCIAL_SOURCES = {'kakao', 'instagram', 'facebook', 'youtube'}
_AD_MEDIUM_KEYWORDS = ('cpc', 'ppc', 'paid', 'display', 'banner', 'ad', 'ads', 'paid_social')
_SOCIAL_MEDIUM_KEYWORDS = ('social', 'sns')
_EMAIL_MEDIUM_KEYWORDS = ('email', 'newsletter', 'mail')

# ── 블랙리스트 인메모리 캐시 (60초 TTL) ──────────────────────────
# DB 조회 부하를 줄이기 위해 60초간 캐시 유지
_blocklist_cache = {'data': None, 'expires': 0}
_CACHE_TTL = 60  # 캐시 유효시간 (초)
_CSRF_EXEMPT_PATHS = (
    '/api/properties',
    '/api/sync-property',
    '/api/delete-property',
    '/api/update-ldate',
    '/api/update-see',
)


def invalidate_blocklist_cache():
    """블랙리스트 캐시 즉시 무효화 (차단 추가/수정 시 호출)"""
    _blocklist_cache['data']    = None
    _blocklist_cache['expires'] = 0


def _get_blocklist(engine):
    """활성 블랙리스트 목록 반환 (60초 캐시 적용)"""
    from sqlalchemy import text
    now = time.time()
    # 캐시가 유효하면 DB 조회 없이 반환
    if _blocklist_cache['data'] is not None and now < _blocklist_cache['expires']:
        return _blocklist_cache['data']

    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text("SELECT ip, visitor_id FROM zibeasy_blocklist WHERE is_active = 1")
            ).fetchall()
            # { 'ips': set(...), 'visitor_ids': set(...) } 형태로 캐시
            data = {
                'ips':        {r[0] for r in rows if r[0]},
                'visitor_ids': {r[1] for r in rows if r[1]},
            }
            _blocklist_cache['data']    = data
            _blocklist_cache['expires'] = now + _CACHE_TTL
            return data
    except Exception as e:
        logging.warning(f"블랙리스트 캐시 로드 실패: {e}")
        # 실패 시 빈 목록 반환 (서비스 중단 방지)
        return {'ips': set(), 'visitor_ids': set()}


def _truncate(value, limit):
    """문자열 길이 제한"""
    return (value or '')[:limit]


def _normalize_host(host):
    """호스트를 비교 가능한 형태로 정규화"""
    return (host or '').split(':', 1)[0].strip().lower()


def _is_internal_host(host, current_host):
    """리퍼러 호스트가 현재 서비스 내부인지 판별"""
    host = _normalize_host(host)
    current_host = _normalize_host(current_host)

    if not host:
        return False
    if host == current_host:
        return True
    return any(host == suffix or host.endswith(f'.{suffix}') for suffix in _SITE_DOMAIN_SUFFIXES)


def _detect_source_name(value):
    """referrer/utm_source 문자열에서 대표 유입처 식별"""
    value = (value or '').lower()
    if not value:
        return ''

    if 'naver' in value:
        return 'naver'
    if 'google' in value or 'gclid' in value:
        return 'google'
    if 'daum' in value:
        return 'daum'
    if 'bing' in value:
        return 'bing'
    if 'kakao' in value:
        return 'kakao'
    if 'instagram' in value or 'insta' in value:
        return 'instagram'
    if 'facebook' in value or 'fbclid' in value or value == 'meta':
        return 'facebook'
    if 'youtube' in value or 'youtu.be' in value:
        return 'youtube'
    if 'openai' in value or 'chatgpt' in value:
        return 'chatgpt'
    return ''


def _classify_source_type(source_name, utm_medium, has_external_referrer):
    """유입처를 broad channel 로 분류"""
    medium = (utm_medium or '').lower()

    if source_name == 'internal':
        return 'internal'
    if source_name == 'direct':
        return 'direct'
    if any(keyword in medium for keyword in _AD_MEDIUM_KEYWORDS):
        return 'ad'
    if any(keyword in medium for keyword in _SOCIAL_MEDIUM_KEYWORDS):
        return 'social'
    if any(keyword in medium for keyword in _EMAIL_MEDIUM_KEYWORDS):
        return 'email'
    if source_name in _SEARCH_SOURCES:
        return 'search'
    if source_name in _SOCIAL_SOURCES or source_name == 'chatgpt':
        return 'social'
    if has_external_referrer:
        return 'referral'
    return 'unknown'


def _extract_traffic_metadata(path, referrer, current_host, query_string):
    """요청별 유입 메타데이터 추출"""
    params = parse_qs(query_string or '', keep_blank_values=False)
    utm_source = _truncate((params.get('utm_source') or [''])[0].strip(), 100)
    utm_medium = _truncate((params.get('utm_medium') or [''])[0].strip(), 100)
    utm_campaign = _truncate((params.get('utm_campaign') or [''])[0].strip(), 150)
    utm_content = _truncate((params.get('utm_content') or [''])[0].strip(), 150)
    utm_term = _truncate((params.get('utm_term') or [''])[0].strip(), 150)

    referrer_host = _normalize_host(urlparse(referrer or '').netloc)
    is_internal_referrer = bool(referrer_host) and _is_internal_host(referrer_host, current_host)
    is_entry = 0 if is_internal_referrer else 1

    source_name = ''
    if not is_entry:
        source_name = 'internal'
    elif params.get('gclid'):
        source_name = 'google'
    elif params.get('fbclid'):
        source_name = 'facebook'
    elif utm_source:
        source_name = _detect_source_name(utm_source) or utm_source.lower()[:80]
    elif referrer_host:
        source_name = _detect_source_name(referrer_host) or 'referral'
    else:
        source_name = 'direct'

    source_type = _classify_source_type(
        source_name=source_name,
        utm_medium=utm_medium,
        has_external_referrer=bool(referrer_host and not is_internal_referrer),
    )

    landing_page = ''
    if is_entry:
        landing_page = path
        if query_string:
            landing_page = f'{path}?{query_string}'

    source_host = ''
    if referrer_host and not is_internal_referrer:
        source_host = referrer_host

    return {
        'source_type': _truncate(source_type, 30),
        'source_name': _truncate(source_name, 80),
        'source_host': _truncate(source_host, 255),
        'is_entry': is_entry,
        'landing_page': _truncate(landing_page, 500),
        'query_string': _truncate(query_string, 500),
        'utm_source': utm_source,
        'utm_medium': utm_medium,
        'utm_campaign': utm_campaign,
        'utm_content': utm_content,
        'utm_term': utm_term,
    }


def _ensure_access_log_schema(db_engine):
    """접속 로그 테이블과 유입 분석 컬럼 보장"""
    with db_engine.connect() as conn:
        table_exists = conn.execute(text("""
            SELECT COUNT(*)
            FROM information_schema.tables
            WHERE table_schema = DATABASE()
              AND table_name = 'zibeasy_access_log'
        """)).scalar() or 0

        if not table_exists:
            conn.execute(text("""
                CREATE TABLE zibeasy_access_log (
                    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                    code INT NULL,
                    visitor_id VARCHAR(64) NULL,
                    ip VARCHAR(45) NULL,
                    browser VARCHAR(80) NULL,
                    os VARCHAR(80) NULL,
                    device VARCHAR(30) NULL,
                    referrer VARCHAR(500) NULL,
                    page VARCHAR(200) NULL,
                    language VARCHAR(50) NULL,
                    ua_string VARCHAR(500) NULL,
                    wdate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    source_type VARCHAR(30) NULL,
                    source_name VARCHAR(80) NULL,
                    source_host VARCHAR(255) NULL,
                    is_entry TINYINT(1) NOT NULL DEFAULT 0,
                    landing_page VARCHAR(500) NULL,
                    query_string VARCHAR(500) NULL,
                    utm_source VARCHAR(100) NULL,
                    utm_medium VARCHAR(100) NULL,
                    utm_campaign VARCHAR(150) NULL,
                    utm_content VARCHAR(150) NULL,
                    utm_term VARCHAR(150) NULL,
                    PRIMARY KEY (id),
                    KEY idx_access_log_wdate (wdate),
                    KEY idx_access_log_source_name (source_name),
                    KEY idx_access_log_entry_wdate (is_entry, wdate)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """))

        column_ddls = {
            'source_type': "ALTER TABLE zibeasy_access_log ADD COLUMN source_type VARCHAR(30) NULL",
            'source_name': "ALTER TABLE zibeasy_access_log ADD COLUMN source_name VARCHAR(80) NULL",
            'source_host': "ALTER TABLE zibeasy_access_log ADD COLUMN source_host VARCHAR(255) NULL",
            'is_entry': "ALTER TABLE zibeasy_access_log ADD COLUMN is_entry TINYINT(1) NOT NULL DEFAULT 0",
            'landing_page': "ALTER TABLE zibeasy_access_log ADD COLUMN landing_page VARCHAR(500) NULL",
            'query_string': "ALTER TABLE zibeasy_access_log ADD COLUMN query_string VARCHAR(500) NULL",
            'utm_source': "ALTER TABLE zibeasy_access_log ADD COLUMN utm_source VARCHAR(100) NULL",
            'utm_medium': "ALTER TABLE zibeasy_access_log ADD COLUMN utm_medium VARCHAR(100) NULL",
            'utm_campaign': "ALTER TABLE zibeasy_access_log ADD COLUMN utm_campaign VARCHAR(150) NULL",
            'utm_content': "ALTER TABLE zibeasy_access_log ADD COLUMN utm_content VARCHAR(150) NULL",
            'utm_term': "ALTER TABLE zibeasy_access_log ADD COLUMN utm_term VARCHAR(150) NULL",
        }

        for column_name, ddl in column_ddls.items():
            exists = conn.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'zibeasy_access_log'
                  AND column_name = :column_name
            """), {'column_name': column_name}).scalar() or 0
            if not exists:
                try:
                    conn.execute(text(ddl))
                except Exception as e:
                    # 1060: Duplicate column name
                    if '1060' in str(e):
                        pass
                    else:
                        raise

        index_ddls = {
            'idx_access_log_wdate': """
                CREATE INDEX idx_access_log_wdate
                ON zibeasy_access_log (wdate)
            """,
            'idx_access_log_source_name': """
                CREATE INDEX idx_access_log_source_name
                ON zibeasy_access_log (source_name)
            """,
            'idx_access_log_entry_wdate': """
                CREATE INDEX idx_access_log_entry_wdate
                ON zibeasy_access_log (is_entry, wdate)
            """,
        }

        for index_name, ddl in index_ddls.items():
            exists = conn.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = 'zibeasy_access_log'
                  AND index_name = :index_name
            """), {'index_name': index_name}).scalar() or 0
            if not exists:
                try:
                    conn.execute(text(ddl))
                except Exception as e:
                    # 1061: Duplicate key name
                    if '1061' in str(e):
                        pass
                    else:
                        raise

        conn.commit()


def _get_request_visitor_id():
    """현재 요청에서 사용할 visitor_id 반환"""
    visitor_id = getattr(g, 'visitor_id', '')
    if visitor_id:
        return visitor_id
    return request.cookies.get('visitor_id', '')


def create_app(config_class=Config):
    """Flask 앱 생성 및 초기화"""
    app = Flask(__name__,
                template_folder='../templates',
                static_folder='../static')

    # 설정 로드
    app.config.from_object(config_class)

    # CORS 설정 (허용 오리진만 제한적으로 개방)
    raw_origins = os.environ.get(
        'CORS_ALLOWED_ORIGINS',
        'https://house.zibeasy.com,https://www.house.zibeasy.com'
    )
    allowed_origins = [o.strip() for o in raw_origins.split(',') if o.strip()]
    CORS(
        app,
        resources={r"/api/*": {"origins": allowed_origins}},
        supports_credentials=True,
    )

    # 로깅 설정
    setup_logging()

    # DB 초기화
    init_db(app)

    try:
        from app.models import engine as db_engine
        _ensure_access_log_schema(db_engine)
    except Exception as e:
        logging.warning(f"접속 로그 스키마 보장 실패: {e}")

    # ── 매물 소프트 삭제 컬럼 보장 ──────────────────────────────────
    try:
        from app.models import engine as db_engine
        with db_engine.connect() as conn:
            col_is_deleted = conn.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'sswp_maemul'
                  AND column_name = 'is_deleted'
            """)).scalar() or 0
            if not col_is_deleted:
                conn.execute(text("""
                    ALTER TABLE sswp_maemul
                    ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0
                """))

            col_deleted_at = conn.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_schema = DATABASE()
                  AND table_name = 'sswp_maemul'
                  AND column_name = 'deleted_at'
            """)).scalar() or 0
            if not col_deleted_at:
                conn.execute(text("""
                    ALTER TABLE sswp_maemul
                    ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL
                """))

            idx_exists = conn.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.statistics
                WHERE table_schema = DATABASE()
                  AND table_name = 'sswp_maemul'
                  AND index_name = 'idx_maemul_is_deleted'
            """)).scalar() or 0
            if not idx_exists:
                conn.execute(text("""
                    CREATE INDEX idx_maemul_is_deleted
                    ON sswp_maemul (is_deleted, ldate)
                """))
            conn.commit()
    except Exception as e:
        logging.warning(f"소프트 삭제 컬럼/인덱스 보장 실패: {e}")

    # ── 전역 템플릿 컨텍스트: 모든 페이지에서 로그인 정보 사용 가능 ──────────
    @app.context_processor
    def inject_current_user():
        """모든 Jinja2 템플릿에 current_user 딕셔너리를 자동 주입"""
        from flask import session as _session
        csrf_token = get_csrf_token()
        return {
            'current_user': {
                'logged_in':   'user_idx' in _session,
                'idx':         _session.get('user_idx'),
                'name':        _session.get('user_name', ''),
                'profile':     _session.get('user_profile', ''),
                'login_type':  _session.get('user_login_type', 'email'),  # kakao / naver / email
            },
            'csrf_token': csrf_token,
        }

    # 라우트 등록
    from app.routes import main, api, sync, images, admin, auth
    app.register_blueprint(main.bp)
    app.register_blueprint(api.bp, url_prefix='/api')
    app.register_blueprint(sync.bp, url_prefix='/api')
    app.register_blueprint(images.bp, url_prefix='/images')
    app.register_blueprint(admin.bp)         # 어드민 블루프린트 (/admin)
    app.register_blueprint(auth.bp)          # 소셜 로그인 블루프린트 (/auth)

    # ── 블랙리스트 미들웨어 ────────────────────────────────────────
    # 관리자 페이지(/admin)는 차단 제외 — 관리자 본인이 잠기는 상황 방지
    @app.before_request
    def check_blocklist():
        """요청마다 IP/visitor_id 블랙리스트 확인 후 403 반환"""
        if request.path.startswith('/admin'):
            return  # 관리자 경로는 차단하지 않음

        from app.models import engine as db_engine
        blocklist = _get_blocklist(db_engine)

        # X-Forwarded-For 우선 (Nginx 프록시 경유 시 실제 IP)
        client_ip = request.headers.get('X-Forwarded-For', request.remote_addr or '')
        client_ip = client_ip.split(',')[0].strip()

        # visitor_id 쿠키
        visitor_id = request.cookies.get('visitor_id', '')

        # IP 또는 visitor_id가 블랙리스트에 있으면 403
        if client_ip and client_ip in blocklist['ips']:
            logging.info(f"블랙리스트 차단(IP): {client_ip} — {request.path}")
            abort(403)
        if visitor_id and visitor_id in blocklist['visitor_ids']:
            logging.info(f"블랙리스트 차단(visitor_id): {visitor_id} — {request.path}")
            abort(403)

    @app.before_request
    def ensure_visitor_id_context():
        """첫 요청부터 visitor_id를 만들고 현재 요청 컨텍스트에 보관"""
        path = request.path or '/'
        if any(path.startswith(p) for p in _SKIP_PREFIX):
            g.visitor_id = request.cookies.get('visitor_id', '')
            g.should_set_visitor_id = False
            return

        cookie_visitor_id = request.cookies.get('visitor_id', '').strip()
        if cookie_visitor_id:
            g.visitor_id = cookie_visitor_id
            g.should_set_visitor_id = False
            return

        g.visitor_id = str(uuid.uuid4())
        g.should_set_visitor_id = True

    # ── CSRF 보호 미들웨어 ────────────────────────────────────────
    @app.before_request
    def enforce_csrf():
        """브라우저 기반 상태 변경 요청에 CSRF 토큰을 강제."""
        if request.method not in ('POST', 'PUT', 'PATCH', 'DELETE'):
            return

        if request.path.startswith(_CSRF_EXEMPT_PATHS):
            return

        if validate_csrf():
            return

        # API 요청은 JSON으로 에러 반환
        if request.path.startswith('/api/') or request.is_json:
            return jsonify({'success': False, 'error': 'invalid_csrf'}), 400

        abort(400)

    @app.after_request
    def persist_visitor_cookie(response):
        """신규 방문자에게 visitor_id 쿠키 발급"""
        if not getattr(g, 'should_set_visitor_id', False):
            return response

        visitor_id = getattr(g, 'visitor_id', '')
        if not visitor_id:
            return response

        response.set_cookie(
            'visitor_id',
            visitor_id,
            max_age=365 * 24 * 60 * 60,
            httponly=True,
            samesite='Lax',
            secure=bool(app.config.get('SESSION_COOKIE_SECURE', False)),
        )
        return response

    # ── 페이지 접근 로그 미들웨어 ─────────────────────────────────
    @app.after_request
    def log_page_access(response):
        """
        사용자가 방문한 페이지를 zibeasy_access_log에 기록.
        - API·정적파일·이미지·관리자 경로는 제외
        - 200 응답만 기록 (404·500 등 에러 제외)
        - 비동기 스레드로 DB INSERT → 응답 지연 없음
        """
        path = request.path

        # ── 제외 경로 먼저 체크 ──────────────────────────────────
        if any(path.startswith(p) for p in _SKIP_PREFIX):
            return response

        # ── 로깅 대상 경로 확인 ──────────────────────────────────
        is_log_target = (
            path in _LOG_EXACT
            or any(path.startswith(p) for p in _LOG_PREFIX)
        )
        if not is_log_target:
            return response

        # 에러 응답은 기록하지 않음
        if response.status_code != 200:
            return response

        # ── 요청 데이터 스냅샷 (스레드에서 request context 없으므로 미리 캡처) ──
        visitor_ip  = request.headers.get('X-Forwarded-For', request.remote_addr or '')
        visitor_ip  = visitor_ip.split(',')[0].strip()
        visitor_id  = _get_request_visitor_id()
        referrer    = (request.referrer or '')[:500]
        language    = (request.accept_languages.best or '')[:50]
        ua_string   = (request.user_agent.string or '')[:500]
        page        = path[:200]
        query_string = request.query_string.decode('utf-8', 'ignore')[:500]
        traffic = _extract_traffic_metadata(
            path=path,
            referrer=referrer,
            current_host=request.host,
            query_string=query_string,
        )

        # /view/<code> 경로에서 매물 code 추출 (다른 페이지는 NULL)
        code = None
        m = _VIEW_CODE_RE.match(path)
        if m:
            try:
                code = int(m.group(1))
            except ValueError:
                code = None

        browser, os_name, device = parse_user_agent(ua_string)

        # ── 비동기 스레드로 DB 기록 ──────────────────────────────
        def _insert_log():
            try:
                from app.models import engine as db_engine
                from sqlalchemy import text as sa_text
                with db_engine.connect() as conn:
                    conn.execute(
                        sa_text("""
                            INSERT INTO zibeasy_access_log
                                (code, visitor_id, ip, browser, os, device,
                                 referrer, page, language, ua_string, wdate,
                                 source_type, source_name, source_host, is_entry,
                                 landing_page, query_string,
                                 utm_source, utm_medium, utm_campaign, utm_content, utm_term)
                            VALUES
                                (:code, :visitor_id, :ip, :browser, :os, :device,
                                 :referrer, :page, :language, :ua_string, UTC_TIMESTAMP(),
                                 :source_type, :source_name, :source_host, :is_entry,
                                 :landing_page, :query_string,
                                 :utm_source, :utm_medium, :utm_campaign, :utm_content, :utm_term)
                        """),
                        {
                            'code'      : code,
                            'visitor_id': visitor_id,
                            'ip'        : visitor_ip,
                            'browser'   : browser,
                            'os'        : os_name,
                            'device'    : device,
                            'referrer'  : referrer,
                            'page'      : page,
                            'language'  : language,
                            'ua_string' : ua_string,
                            'source_type': traffic['source_type'],
                            'source_name': traffic['source_name'],
                            'source_host': traffic['source_host'],
                            'is_entry': traffic['is_entry'],
                            'landing_page': traffic['landing_page'],
                            'query_string': traffic['query_string'],
                            'utm_source': traffic['utm_source'],
                            'utm_medium': traffic['utm_medium'],
                            'utm_campaign': traffic['utm_campaign'],
                            'utm_content': traffic['utm_content'],
                            'utm_term': traffic['utm_term'],
                        }
                    )
                    conn.commit()
            except Exception as e:
                logging.warning(f"access_log 기록 실패: {e}")

        threading.Thread(target=_insert_log, daemon=True).start()
        return response

    return app
