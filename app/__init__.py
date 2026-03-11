"""
Flask 애플리케이션 팩토리
"""
import re
import time
import logging
import threading
import os
from flask import Flask, request, abort, jsonify
from flask_cors import CORS
from sqlalchemy import text
from config import Config
from app.models import init_db
from app.security import get_csrf_token, validate_csrf
from app.utils.logging import setup_logging
from app.utils.ua_parser import parse_user_agent

# ── 페이지 접근 로그 설정 ──────────────────────────────────────────
# 로깅할 페이지 경로 (정확한 경로 또는 prefix)
_LOG_EXACT   = {'/', '/map', '/liked', '/profile', '/fee-calc/'}
_LOG_PREFIX  = ('/view/', '/fee-calc/')
# 제외할 경로 (API·정적파일·이미지·관리자 등)
_SKIP_PREFIX = ('/api/', '/static/', '/images/', '/admin/', '/sync/')
# /view/<숫자> 에서 code 추출용 패턴
_VIEW_CODE_RE = re.compile(r'^/view/(\d+)')

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
        visitor_id  = request.cookies.get('visitor_id', '')
        referrer    = (request.referrer or '')[:500]
        language    = (request.accept_languages.best or '')[:50]
        ua_string   = (request.user_agent.string or '')[:500]
        page        = path[:200]

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
                                 referrer, page, language, ua_string, wdate)
                            VALUES
                                (:code, :visitor_id, :ip, :browser, :os, :device,
                                 :referrer, :page, :language, :ua_string, NOW())
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
                        }
                    )
                    conn.commit()
            except Exception as e:
                logging.warning(f"access_log 기록 실패: {e}")

        threading.Thread(target=_insert_log, daemon=True).start()
        return response

    return app
