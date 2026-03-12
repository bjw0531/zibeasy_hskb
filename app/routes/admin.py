"""
관리자 페이지 라우트
- 로그인/로그아웃/어드민 메인
- 매물 목록/등록/수정/삭제
- sswp_member 테이블 SHA1 해시 인증
- 이미지: big 폴더(770×513)에 리사이징 저장
"""
import hashlib
import json
import os
import time
from functools import wraps

from flask import (Blueprint, render_template, request,
                   session, redirect, url_for, jsonify, send_from_directory, abort, current_app)
from sqlalchemy import text
from PIL import Image

from app.models import engine
from app.security import check_rate_limit, client_ip

bp = Blueprint('admin', __name__, url_prefix='/admin')

# big 이미지 저장 경로 (app/routes 기준 2단계 상위 → housekb/data/maemul/big)
BIG_DIR = os.path.join(os.path.dirname(__file__), '../../data/maemul/big')
BIG_W, BIG_H = 770, 513  # PHP 원본 big 사이즈
FEEDBACK_UPLOAD_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), '../../data/feedback_uploads'))


# ─── PHP 호환 비밀번호 해시 함수 ───────────────────────────────

def php_addslashes(s: str) -> str:
    """PHP addslashes() 동일 동작: ', ", \\, null 앞에 백슬래시 추가"""
    s = s.replace('\\', '\\\\')
    s = s.replace('\x00', '\\0')
    s = s.replace("'", "\\'")
    s = s.replace('"', '\\"')
    return s


def php_htmlspecialchars(s: str) -> str:
    """PHP htmlspecialchars() 기본 동작: &, ", <, > 를 HTML 엔티티로 변환"""
    s = s.replace('&', '&amp;')
    s = s.replace('"', '&quot;')
    s = s.replace('<', '&lt;')
    s = s.replace('>', '&gt;')
    return s


def make_password_hash(raw_password: str) -> str:
    """PHP의 sha1(htmlspecialchars(addslashes($pass)))와 동일한 해시"""
    processed = php_addslashes(raw_password)
    processed = php_htmlspecialchars(processed)
    return hashlib.sha1(processed.encode('utf-8')).hexdigest()


# ─── 로그인 필요 데코레이터 ────────────────────────────────────

def login_required(f):
    """로그인하지 않은 사용자는 로그인 페이지로 리다이렉트"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get('admin_logged_in'):
            return redirect(url_for('admin.login'))
        return f(*args, **kwargs)
    return decorated_function


# ─── 이미지 처리 헬퍼 ──────────────────────────────────────────

def save_image_big(file_storage) -> str:
    """
    업로드된 이미지를 big 폴더에 770×513으로 리사이징 후 저장.
    저장된 파일명(확장자 포함)을 반환.
    실패 시 None 반환.
    """
    try:
        # PHP microtime() 방식과 유사한 고유 파일명 생성
        filename = str(time.time()).replace('.', '') + '.jpg'
        save_path = os.path.normpath(os.path.join(
            os.path.dirname(__file__), '../../data/maemul/big', filename
        ))

        img = Image.open(file_storage.stream)
        img = img.convert('RGB')  # PNG/WEBP 등 알파채널 제거

        # 원본 비율 유지하며 big 사이즈 내에 맞춤 (contain)
        img.thumbnail((BIG_W, BIG_H), Image.LANCZOS)

        # 배경(흰색) 캔버스에 중앙 배치
        canvas = Image.new('RGB', (BIG_W, BIG_H), (255, 255, 255))
        offset_x = (BIG_W - img.width) // 2
        offset_y = (BIG_H - img.height) // 2
        canvas.paste(img, (offset_x, offset_y))
        canvas.save(save_path, 'JPEG', quality=88)

        return filename
    except Exception as e:
        return None


def delete_image_file(filename: str):
    """big 폴더에서 이미지 파일 삭제"""
    if not filename:
        return
    path = os.path.normpath(os.path.join(
        os.path.dirname(__file__), '../../data/maemul/big', filename
    ))
    try:
        if os.path.exists(path):
            os.remove(path)
    except Exception:
        pass


# ─── 라우트: 로그인/로그아웃/메인 ──────────────────────────────

@bp.route('/')
@login_required
def index():
    """어드민 메인 페이지"""
    admin_name = session.get('admin_name', '관리자')
    return render_template('admin/index.html', admin_name=admin_name)


def _ensure_house_request_table():
    """집 구하기/내놓기 요청 테이블이 없으면 생성"""
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS house_request_forms (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                request_type VARCHAR(20) NOT NULL COMMENT 'lease_out|find_home',
                name VARCHAR(50) NOT NULL,
                phone VARCHAR(30) NOT NULL,
                email VARCHAR(120) NULL,
                category VARCHAR(30) NULL,
                location_text VARCHAR(255) NOT NULL,
                budget_text VARCHAR(255) NULL,
                move_in_date VARCHAR(40) NULL,
                details TEXT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'new',
                ip_address VARCHAR(45) NULL,
                user_agent VARCHAR(500) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_request_type (request_type),
                KEY idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """))
        conn.commit()


@bp.route('/house-requests')
@login_required
def house_requests():
    """집 구하기/내놓기 요청 목록"""
    _ensure_house_request_table()

    request_type = request.args.get('request_type', '').strip()
    status = request.args.get('status', '').strip()
    keyword = request.args.get('keyword', '').strip()
    page = max(int(request.args.get('page', 1)), 1)
    per_page = 20

    conditions = ['1=1']
    params = {}

    if request_type in ('lease_out', 'find_home'):
        conditions.append('request_type = :request_type')
        params['request_type'] = request_type

    if status in ('new', 'contacted', 'done'):
        conditions.append('status = :status')
        params['status'] = status

    if keyword:
        conditions.append('(name LIKE :kw OR phone LIKE :kw OR location_text LIKE :kw OR details LIKE :kw)')
        params['kw'] = f'%{keyword}%'

    where = ' AND '.join(conditions)
    offset = (page - 1) * per_page

    with engine.connect() as conn:
        total = conn.execute(
            text(f"SELECT COUNT(*) FROM house_request_forms WHERE {where}"),
            params
        ).scalar() or 0

        rows = conn.execute(
            text(f"""
                SELECT id, request_type, name, phone, email, category, location_text, budget_text,
                       move_in_date, details, status, created_at
                FROM house_request_forms
                WHERE {where}
                ORDER BY id DESC
                LIMIT :limit OFFSET :offset
            """),
            {**params, 'limit': per_page, 'offset': offset}
        ).fetchall()

    total_pages = max((total + per_page - 1) // per_page, 1)

    return render_template(
        'admin/house_requests.html',
        rows=rows,
        total=total,
        page=page,
        total_pages=total_pages,
        request_type=request_type,
        status=status,
        keyword=keyword,
        admin_name=session.get('admin_name', '관리자')
    )


@bp.route('/house-requests/<int:req_id>/status', methods=['POST'])
@login_required
def update_house_request_status(req_id):
    """요청 상태 변경"""
    next_status = request.form.get('status', '').strip()
    if next_status not in ('new', 'contacted', 'done'):
        return redirect(url_for('admin.house_requests'))

    _ensure_house_request_table()

    with engine.connect() as conn:
        conn.execute(
            text("UPDATE house_request_forms SET status = :status WHERE id = :id"),
            {'status': next_status, 'id': req_id}
        )
        conn.commit()

    # 현재 필터 상태 유지
    request_type = request.form.get('request_type', '')
    status = request.form.get('current_status', '')
    keyword = request.form.get('keyword', '')
    page = request.form.get('page', '1')

    return redirect(url_for(
        'admin.house_requests',
        request_type=request_type,
        status=status,
        keyword=keyword,
        page=page
    ))


def _ensure_feedback_table():
    """오류 제보/기능 제안 테이블이 없으면 생성"""
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS feedback_reports (
                id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
                report_type VARCHAR(30) NOT NULL COMMENT 'error_report|feature_suggestion|improvement_opinion',
                device_type VARCHAR(50) NULL,
                device_etc VARCHAR(120) NULL,
                browser_type VARCHAR(50) NULL,
                browser_etc VARCHAR(120) NULL,
                page_url VARCHAR(500) NULL,
                error_description TEXT NULL,
                feature_description TEXT NULL,
                feature_reason TEXT NULL,
                reference_service VARCHAR(50) NULL,
                reference_service_etc VARCHAR(120) NULL,
                improvement_description TEXT NULL,
                attachments_json TEXT NULL,
                name VARCHAR(50) NOT NULL,
                phone VARCHAR(30) NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'new',
                ip_address VARCHAR(45) NULL,
                user_agent VARCHAR(500) NULL,
                created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                KEY idx_report_type (report_type),
                KEY idx_status (status),
                KEY idx_created_at (created_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """))
        conn.commit()


@bp.route('/feedback-reports')
@login_required
def feedback_reports():
    """오류 제보/기능 제안 목록"""
    _ensure_feedback_table()

    report_type = request.args.get('report_type', '').strip()
    status = request.args.get('status', '').strip()
    keyword = request.args.get('keyword', '').strip()
    page = max(int(request.args.get('page', 1)), 1)
    per_page = 20

    conditions = ['1=1']
    params = {}

    if report_type in ('error_report', 'feature_suggestion', 'improvement_opinion'):
        conditions.append('report_type = :report_type')
        params['report_type'] = report_type

    if status in ('new', 'contacted', 'done'):
        conditions.append('status = :status')
        params['status'] = status

    if keyword:
        conditions.append('(name LIKE :kw OR phone LIKE :kw OR page_url LIKE :kw OR error_description LIKE :kw OR feature_description LIKE :kw OR improvement_description LIKE :kw)')
        params['kw'] = f'%{keyword}%'

    where = ' AND '.join(conditions)
    offset = (page - 1) * per_page

    with engine.connect() as conn:
        total = conn.execute(
            text(f"SELECT COUNT(*) FROM feedback_reports WHERE {where}"),
            params
        ).scalar() or 0

        rows = conn.execute(
            text(f"""
                SELECT id, report_type, device_type, device_etc, browser_type, browser_etc, page_url,
                       error_description, feature_description, feature_reason, reference_service, reference_service_etc,
                       improvement_description, attachments_json, name, phone, status, created_at
                FROM feedback_reports
                WHERE {where}
                ORDER BY id DESC
                LIMIT :limit OFFSET :offset
            """),
            {**params, 'limit': per_page, 'offset': offset}
        ).fetchall()

    # 첨부파일 JSON 파싱
    parsed_rows = []
    for row in rows:
        d = dict(row._mapping)
        try:
            d['attachments'] = json.loads(d.get('attachments_json') or '[]')
        except Exception:
            d['attachments'] = []
        parsed_rows.append(d)

    total_pages = max((total + per_page - 1) // per_page, 1)

    return render_template(
        'admin/feedback_reports.html',
        rows=parsed_rows,
        total=total,
        page=page,
        total_pages=total_pages,
        report_type=report_type,
        status=status,
        keyword=keyword,
        admin_name=session.get('admin_name', '관리자')
    )


@bp.route('/feedback-reports/<int:report_id>/status', methods=['POST'])
@login_required
def update_feedback_report_status(report_id):
    """오류 제보 상태 변경"""
    next_status = request.form.get('status', '').strip()
    if next_status not in ('new', 'contacted', 'done'):
        return redirect(url_for('admin.feedback_reports'))

    _ensure_feedback_table()

    with engine.connect() as conn:
        conn.execute(
            text("UPDATE feedback_reports SET status = :status WHERE id = :id"),
            {'status': next_status, 'id': report_id}
        )
        conn.commit()

    return redirect(url_for(
        'admin.feedback_reports',
        report_type=request.form.get('report_type', ''),
        status=request.form.get('current_status', ''),
        keyword=request.form.get('keyword', ''),
        page=request.form.get('page', '1')
    ))


@bp.route('/feedback-files/<path:filename>')
@login_required
def feedback_file(filename):
    """제보 첨부파일 다운로드"""
    safe_name = os.path.basename(filename)
    if not safe_name:
        abort(404)
    return send_from_directory(FEEDBACK_UPLOAD_DIR, safe_name, as_attachment=False)


@bp.route('/login', methods=['GET', 'POST'])
def login():
    """로그인 페이지"""
    if session.get('admin_logged_in'):
        return redirect(url_for('admin.index'))

    error = None

    if request.method == 'POST':
        allowed, retry_after = check_rate_limit('admin_login', client_ip(), limit=8, window_sec=300)
        if not allowed:
            error = f'로그인 시도가 너무 많습니다. {retry_after}초 후 다시 시도해주세요.'
            return render_template('admin/login.html', error=error)

        input_id = request.form.get('id', '').strip()
        input_pw = request.form.get('pass', '')

        if not input_id or not input_pw:
            error = '아이디와 비밀번호를 입력해주세요.'
        else:
            hashed_pw = make_password_hash(input_pw)
            try:
                with engine.connect() as conn:
                    result = conn.execute(
                        text('SELECT idx, id, name, level FROM sswp_member '
                             'WHERE id = :id AND pass = :pass LIMIT 1'),
                        {'id': input_id, 'pass': hashed_pw}
                    )
                    member = result.fetchone()

                if member:
                    session['admin_logged_in'] = True
                    session['admin_id']         = member.id
                    session['admin_name']        = member.name
                    session['admin_level']       = member.level
                    return redirect(url_for('admin.index'))
                else:
                    error = '아이디 또는 비밀번호가 올바르지 않습니다.'
            except Exception:
                error = '로그인 처리 중 오류가 발생했습니다.'

    return render_template('admin/login.html', error=error)


@bp.route('/logout')
def logout():
    """로그아웃 - 세션 초기화"""
    session.clear()
    return redirect(url_for('admin.login'))


# ─── 라우트: 매물 목록 ──────────────────────────────────────────

@bp.route('/maemul')
@login_required
def maemul_list():
    """매물 목록 페이지 (검색 + 페이징)"""
    # 검색 파라미터
    keyword  = request.args.get('keyword', '').strip()
    category = request.args.get('category', '')
    state    = request.args.get('state', '')
    contract = request.args.get('contract', '')
    deleted  = request.args.get('deleted', 'active').strip().lower()
    scope    = request.args.get('scope', 'default').strip().lower()
    page     = max(int(request.args.get('page', 1)), 1)
    per_page = 20

    if deleted not in ('active', 'deleted', 'all'):
        deleted = 'active'
    if scope not in ('default', 'month'):
        scope = 'default'

    # WHERE 조건 동적 생성
    conditions = []
    params: dict = {}

    if scope == 'month':
        # 사용자 노출 기준과 동일: 미삭제 + 등록 + 최근 30일 + 계약가능
        deleted = 'active'
        conditions.extend([
            'COALESCE(m.is_deleted, 0) = 0',
            "m.state = '등록'",
            'm.ldate >= DATE_SUB(NOW(), INTERVAL 30 DAY)',
            "(m.contract IS NULL OR m.contract = '' OR m.contract = '계약가능')"
        ])
    else:
        if deleted == 'active':
            conditions.append('COALESCE(m.is_deleted, 0) = 0')
        elif deleted == 'deleted':
            conditions.append('COALESCE(m.is_deleted, 0) = 1')

    if keyword:
        conditions.append(
            '(m.title LIKE :kw OR m.dong LIKE :kw OR m.code LIKE :kw OR m.admin_memo LIKE :kw)'
        )
        params['kw'] = f'%{keyword}%'
    if category:
        conditions.append('m.category = :category')
        params['category'] = category
    if state:
        conditions.append('m.state = :state')
        params['state'] = state
    if contract:
        conditions.append('m.contract = :contract')
        params['contract'] = contract

    where = ' AND '.join(conditions) if conditions else '1=1'
    offset = (page - 1) * per_page

    try:
        with engine.connect() as conn:
            # 전체 건수
            total = conn.execute(
                text(f'SELECT COUNT(*) FROM sswp_maemul m WHERE {where}'), params
            ).scalar()

            # 목록 조회 (형태·층·등록자·조회수 등 추가)
            rows = conn.execute(
                text(f'''
                    SELECT m.idx, m.code, m.title, m.part, m.dong,
                           m.security_money, m.month_money, m.jen_money,
                           m.maemae_money, m.size, m.state, m.contract,
                           m.picname1, m.ldate, m.wdate,
                           m.is_deleted, m.deleted_at,
                           m.gudxo, m.now_floor, m.total_floor,
                           m.id AS registrant, m.see,
                           c.name AS category_name
                    FROM sswp_maemul m
                    LEFT JOIN sswp_category c ON c.idx = m.category
                    WHERE {where}
                    ORDER BY m.ldate DESC
                    LIMIT :limit OFFSET :offset
                '''),
                {**params, 'limit': per_page, 'offset': offset}
            ).fetchall()

            # 카테고리 목록 (검색 필터용)
            categories = conn.execute(
                text('SELECT idx, name FROM sswp_category ORDER BY level ASC')
            ).fetchall()

    except Exception:
        current_app.logger.exception('admin.maemul_list 조회 실패')
        rows, total, categories = [], 0, []

    total_pages = max((total + per_page - 1) // per_page, 1)

    return render_template(
        'admin/maemul_list.html',
        rows=rows,
        total=total,
        page=page,
        total_pages=total_pages,
        keyword=keyword,
        category=category,
        state=state,
        contract=contract,
        deleted=deleted,
        scope=scope,
        categories=categories,
        admin_name=session.get('admin_name', '관리자'),
    )


# ─── 라우트: 매물 등록 ──────────────────────────────────────────

@bp.route('/maemul/new', methods=['GET', 'POST'])
@login_required
def maemul_new():
    """매물 등록 페이지"""
    if request.method == 'POST':
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        error = _save_maemul(None)  # idx=None → INSERT
        if error:
            if is_ajax:
                return jsonify({'ok': False, 'error': error})
            categories = _get_categories()
            main_goods, sub_goods, themas = _get_recommend_data()
            # 등록 오류 시 기존 사진 없음 (신규 등록)
            return render_template('admin/maemul_form.html',
                                   mode='new', row=request.form,
                                   categories=categories, error=error,
                                   main_goods=main_goods, sub_goods=sub_goods, themas=themas,
                                   existing_photos=[],
                                   admin_name=session.get('admin_name'))
        if is_ajax:
            return jsonify({'ok': True, 'redirect': url_for('admin.maemul_list') + '?saved=1'})
        return redirect(url_for('admin.maemul_list') + '?saved=1')

    categories = _get_categories()
    main_goods, sub_goods, themas = _get_recommend_data()
    # 신규 등록: 기존 사진 없음
    return render_template('admin/maemul_form.html',
                           mode='new', row={},
                           categories=categories, error=None,
                           main_goods=main_goods, sub_goods=sub_goods, themas=themas,
                           existing_photos=[],
                           admin_name=session.get('admin_name'))


# ─── 라우트: 매물 수정 ──────────────────────────────────────────

@bp.route('/maemul/<int:idx>/edit', methods=['GET', 'POST'])
@login_required
def maemul_edit(idx):
    """매물 수정 페이지"""
    if request.method == 'POST':
        is_ajax = request.headers.get('X-Requested-With') == 'XMLHttpRequest'
        error = _save_maemul(idx)  # idx 있음 → UPDATE
        if error:
            if is_ajax:
                return jsonify({'ok': False, 'error': error})
            row = _get_maemul(idx)
            categories = _get_categories()
            main_goods, sub_goods, themas = _get_recommend_data()
            # 수정 오류 시 현재 DB 사진 목록 전달
            ep = [row.get(f'picname{i}', '') or '' for i in range(1, 21)] if row else []
            return render_template('admin/maemul_form.html',
                                   mode='edit', row=row or {},
                                   categories=categories, error=error,
                                   main_goods=main_goods, sub_goods=sub_goods, themas=themas,
                                   existing_photos=ep,
                                   admin_name=session.get('admin_name'))
        if is_ajax:
            return jsonify({'ok': True, 'redirect': url_for('admin.maemul_list') + '?saved=1'})
        return redirect(url_for('admin.maemul_list') + '?saved=1')

    row = _get_maemul(idx)
    if not row:
        return '매물을 찾을 수 없습니다.', 404

    categories = _get_categories()
    main_goods, sub_goods, themas = _get_recommend_data()
    # 수정 모드: DB에서 picname1~20 읽어서 전달 (빈 값 포함)
    existing_photos = [row.get(f'picname{i}', '') or '' for i in range(1, 21)]
    return render_template('admin/maemul_form.html',
                           mode='edit', row=row,
                           categories=categories, error=None,
                           main_goods=main_goods, sub_goods=sub_goods, themas=themas,
                           existing_photos=existing_photos,
                           admin_name=session.get('admin_name'))


# ─── 라우트: 매물 삭제 ──────────────────────────────────────────

@bp.route('/maemul/<int:idx>/delete', methods=['POST'])
@login_required
def maemul_delete(idx):
    """매물 소프트 삭제 (is_deleted=1)"""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                UPDATE sswp_maemul
                SET is_deleted = 1,
                    deleted_at = NOW(),
                    ldate = NOW()
                WHERE idx = :idx
                  AND COALESCE(is_deleted, 0) = 0
            """), {'idx': idx})
            conn.commit()

        if (result.rowcount or 0) == 0:
            return jsonify({'ok': False, 'error': '매물을 찾을 수 없거나 이미 삭제되었습니다.'}), 404
        return jsonify({'ok': True})
    except Exception:
        return jsonify({'ok': False, 'error': '서버 내부 오류가 발생했습니다.'}), 500


@bp.route('/maemul/<int:idx>/restore', methods=['POST'])
@login_required
def maemul_restore(idx):
    """매물 소프트 삭제 복구 (is_deleted=0)"""
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                UPDATE sswp_maemul
                SET is_deleted = 0,
                    deleted_at = NULL,
                    ldate = NOW()
                WHERE idx = :idx
                  AND COALESCE(is_deleted, 0) = 1
            """), {'idx': idx})
            conn.commit()

        if (result.rowcount or 0) == 0:
            return jsonify({'ok': False, 'error': '복구할 매물을 찾을 수 없습니다.'}), 404
        return jsonify({'ok': True})
    except Exception:
        return jsonify({'ok': False, 'error': '서버 내부 오류가 발생했습니다.'}), 500


# ─── 라우트: 매물 일괄 삭제 ──────────────────────────────────────

@bp.route('/maemul/bulk-delete', methods=['POST'])
@login_required
def maemul_bulk_delete():
    """선택된 매물 일괄 소프트 삭제"""
    data = request.get_json(silent=True) or {}
    idxs = data.get('idxs', [])
    if not idxs:
        return jsonify({'ok': False, 'error': '선택된 매물이 없습니다.'})

    try:
        with engine.connect() as conn:
            placeholders = ','.join(f':id{i}' for i in range(len(idxs)))
            params = {f'id{i}': idx for i, idx in enumerate(idxs)}
            result = conn.execute(text(f"""
                UPDATE sswp_maemul
                SET is_deleted = 1,
                    deleted_at = NOW(),
                    ldate = NOW()
                WHERE idx IN ({placeholders})
                  AND COALESCE(is_deleted, 0) = 0
            """), params)
            conn.commit()
        return jsonify({'ok': True, 'count': int(result.rowcount or 0)})
    except Exception:
        return jsonify({'ok': False, 'error': '서버 내부 오류가 발생했습니다.'}), 500


@bp.route('/maemul/bulk-restore', methods=['POST'])
@login_required
def maemul_bulk_restore():
    """선택된 매물 일괄 복구"""
    data = request.get_json(silent=True) or {}
    idxs = data.get('idxs', [])
    if not idxs:
        return jsonify({'ok': False, 'error': '선택된 매물이 없습니다.'})

    try:
        with engine.connect() as conn:
            placeholders = ','.join(f':id{i}' for i in range(len(idxs)))
            params = {f'id{i}': idx for i, idx in enumerate(idxs)}
            result = conn.execute(text(f"""
                UPDATE sswp_maemul
                SET is_deleted = 0,
                    deleted_at = NULL,
                    ldate = NOW()
                WHERE idx IN ({placeholders})
                  AND COALESCE(is_deleted, 0) = 1
            """), params)
            conn.commit()
        return jsonify({'ok': True, 'count': int(result.rowcount or 0)})
    except Exception:
        return jsonify({'ok': False, 'error': '서버 내부 오류가 발생했습니다.'}), 500


# ─── 라우트: 매물 일괄 날짜 최신화 ────────────────────────────────

@bp.route('/maemul/bulk-date-update', methods=['POST'])
@login_required
def maemul_bulk_date_update():
    """선택된 매물의 ldate를 현재 시각으로 일괄 업데이트"""
    data = request.get_json(silent=True) or {}
    idxs = data.get('idxs', [])
    if not idxs:
        return jsonify({'ok': False, 'error': '선택된 매물이 없습니다.'})

    try:
        with engine.connect() as conn:
            # 바인딩 파라미터로 IN 절 구성 (SQL 인젝션 방지)
            placeholders = ','.join(f':id{i}' for i in range(len(idxs)))
            params = {f'id{i}': idx for i, idx in enumerate(idxs)}
            conn.execute(
                text(f"""
                    UPDATE sswp_maemul
                    SET ldate=NOW()
                    WHERE idx IN ({placeholders})
                      AND COALESCE(is_deleted, 0) = 0
                """),
                params
            )
            conn.commit()
        return jsonify({'ok': True, 'count': len(idxs)})
    except Exception:
        return jsonify({'ok': False, 'error': '서버 내부 오류가 발생했습니다.'}), 500


# ─── 라우트: 매물 일괄 복사 ──────────────────────────────────────

@bp.route('/maemul/bulk-copy', methods=['POST'])
@login_required
def maemul_bulk_copy():
    """선택된 매물 일괄 복사 (code 새로 발번, wdate/ldate 현재 시각)"""
    data = request.get_json(silent=True) or {}
    idxs = data.get('idxs', [])
    if not idxs:
        return jsonify({'ok': False, 'error': '선택된 매물이 없습니다.'})

    try:
        with engine.connect() as conn:
            # 현재 최대 code로 다음 발번 번호 계산
            max_code = conn.execute(
                text('SELECT MAX(CAST(code AS UNSIGNED)) FROM sswp_maemul')
            ).scalar() or 10000
            next_code = max(int(max_code) + 1, 10001)

            copied = 0
            for idx in idxs:
                row = conn.execute(
                    text('SELECT * FROM sswp_maemul WHERE idx=:idx AND COALESCE(is_deleted, 0) = 0'),
                    {'idx': idx}
                ).fetchone()
                if not row:
                    continue

                d = dict(row._mapping)
                d.pop('idx', None)          # auto_increment 제거
                d['code'] = str(next_code)  # 새 매물번호
                d.pop('wdate', None)        # NOW()로 대체
                d.pop('ldate', None)        # NOW()로 대체

                col_names   = ', '.join(d.keys()) + ', wdate, ldate'
                param_holders = ', '.join(f':{k}' for k in d.keys()) + ', NOW(), NOW()'

                conn.execute(
                    text(f'INSERT INTO sswp_maemul ({col_names}) VALUES ({param_holders})'),
                    d
                )
                next_code += 1
                copied += 1

            conn.commit()
        return jsonify({'ok': True, 'count': copied})
    except Exception:
        return jsonify({'ok': False, 'error': '서버 내부 오류가 발생했습니다.'}), 500


# ─── 라우트: 개별 이미지 삭제 (AJAX) ──────────────────────────

@bp.route('/maemul/<int:idx>/image/<int:num>', methods=['DELETE'])
@login_required
def maemul_image_delete(idx, num):
    """특정 매물의 n번째 사진 삭제"""
    col = f'picname{num}'
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text(f'SELECT {col} FROM sswp_maemul WHERE idx = :idx AND COALESCE(is_deleted, 0) = 0'),
                {'idx': idx}
            ).fetchone()
            if row and row[0]:
                delete_image_file(row[0])
                conn.execute(
                    text(f'UPDATE sswp_maemul SET {col} = NULL WHERE idx = :idx AND COALESCE(is_deleted, 0) = 0'),
                    {'idx': idx}
                )
                conn.commit()
        return jsonify({'ok': True})
    except Exception:
        return jsonify({'ok': False, 'error': '서버 내부 오류가 발생했습니다.'}), 500


# ─── 라우트: 주소 연동 드롭다운 AJAX API ─────────────────────

@bp.route('/address/gu')
@login_required
def address_gu():
    """시/도 → 시/군/구 목록 반환 (sswp_zipcode 테이블)"""
    si = request.args.get('si', '').strip()
    if not si:
        return jsonify([])
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text('SELECT DISTINCT GUGUN FROM sswp_zipcode WHERE SIDO = :si ORDER BY GUGUN ASC'),
                {'si': si}
            ).fetchall()
        return jsonify([r[0] for r in rows if r[0]])
    except Exception as e:
        return jsonify([])


@bp.route('/address/dong')
@login_required
def address_dong():
    """시/도 + 시/군/구 → 읍/면/동 목록 반환 (sswp_zipcode 테이블)"""
    si  = request.args.get('si', '').strip()
    gu  = request.args.get('gu', '').strip()
    if not si or not gu:
        return jsonify([])
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text('SELECT DISTINCT DONG FROM sswp_zipcode WHERE SIDO = :si AND GUGUN = :gu ORDER BY DONG ASC'),
                {'si': si, 'gu': gu}
            ).fetchall()
        return jsonify([r[0] for r in rows if r[0]])
    except Exception as e:
        return jsonify([])


@bp.route('/address/ri')
@login_required
def address_ri():
    """시/도 + 시/군/구 + 읍/면/동 → 리 목록 반환 (sswp_zipcode 테이블)"""
    si   = request.args.get('si', '').strip()
    gu   = request.args.get('gu', '').strip()
    dong = request.args.get('dong', '').strip()
    if not si or not gu or not dong:
        return jsonify([])
    try:
        with engine.connect() as conn:
            rows = conn.execute(
                text('SELECT DISTINCT RI FROM sswp_zipcode WHERE SIDO = :si AND GUGUN = :gu AND DONG = :dong ORDER BY RI ASC'),
                {'si': si, 'gu': gu, 'dong': dong}
            ).fetchall()
        # 빈 문자열 제거 후 반환
        return jsonify([r[0] for r in rows if r[0] and r[0].strip()])
    except Exception as e:
        return jsonify([])


# ─── 내부 헬퍼 함수 ───────────────────────────────────────────

def _get_categories():
    """카테고리 목록 반환"""
    with engine.connect() as conn:
        return conn.execute(
            text('SELECT idx, name FROM sswp_category ORDER BY level ASC')
        ).fetchall()


def _get_recommend_data():
    """
    추천매물(sswp_main)과 테마(sswp_thema) 목록 반환.
    PHP와 동일하게:
      - 메인 추천매물: part='메인'
      - 써브 추천매물: part='써브' AND idx<>5
      - 테마별 매물: sswp_thema 전체
    반환: (main_goods, sub_goods, themas) 튜플
    """
    with engine.connect() as conn:
        main_goods = conn.execute(
            text("SELECT good, category FROM sswp_main WHERE part='메인' ORDER BY level ASC")
        ).fetchall()
        sub_goods = conn.execute(
            text("SELECT good, category FROM sswp_main WHERE part='써브' AND idx<>5 ORDER BY level ASC")
        ).fetchall()
        themas = conn.execute(
            text("SELECT thema, name FROM sswp_thema ORDER BY level ASC")
        ).fetchall()
    return main_goods, sub_goods, themas


def _get_maemul(idx: int):
    """idx로 매물 단건 조회 → dict 반환"""
    with engine.connect() as conn:
        row = conn.execute(
            text('SELECT * FROM sswp_maemul WHERE idx = :idx AND COALESCE(is_deleted, 0) = 0'),
            {'idx': idx}
        ).fetchone()
    if row:
        return dict(row._mapping)
    return None


def _save_maemul(idx):
    """
    매물 등록(idx=None) 또는 수정(idx=int).
    오류 있으면 오류 문자열 반환, 성공하면 None 반환.
    """
    f = request.form

    # ── 필수값 검증 ──
    if not f.get('title', '').strip():
        return '제목을 입력해주세요.'
    if not f.get('dong', '').strip():
        return '동(읍/면)을 입력해주세요.'

    # ── 이미지 처리: photo_order JSON 기반 최대 20장 ──
    # photo_order: [{type:'existing', filename:'...'} | {type:'new', newIdx:N}]
    try:
        photo_order = json.loads(f.get('photo_order', '[]'))
    except Exception:
        photo_order = []

    # 수정 시: DB의 기존 picname 목록 파악 → 제거된 파일 삭제
    old_picnames = set()
    if idx:
        try:
            with engine.connect() as conn:
                cols = ','.join(f'picname{i}' for i in range(1, 21))
                old_row = conn.execute(
                    text(f'SELECT {cols} FROM sswp_maemul WHERE idx=:idx AND COALESCE(is_deleted, 0) = 0'),
                    {'idx': idx}
                ).fetchone()
                if old_row:
                    old_picnames = {v for v in old_row if v}
        except Exception:
            pass

    pic_cols = {}
    new_picnames = set()
    for slot, item in enumerate(photo_order[:20], start=1):
        if item.get('type') == 'existing' and item.get('filename'):
            fname = item['filename']
            pic_cols[f'picname{slot}'] = fname
            new_picnames.add(fname)
        elif item.get('type') == 'new':
            file = request.files.get(f'pic_new_{item.get("newIdx", -1)}')
            if file and file.filename:
                # 파일 크기 확인: 1MB(1,048,576 bytes) 초과 시 오류 반환
                file.stream.seek(0, 2)        # 스트림 끝으로 이동해 크기 측정
                file_size = file.stream.tell()
                file.stream.seek(0)           # 스트림 위치 초기화 (PIL이 읽을 수 있게)
                if file_size > 1 * 1024 * 1024:
                    return f'사진 1장당 크기는 1MB를 초과할 수 없습니다. ({file.filename})'
                saved = save_image_big(file)
                if saved:
                    pic_cols[f'picname{slot}'] = saved
                    new_picnames.add(saved)

    # picname 열을 20개 모두 명시 (그리드에서 제거된 슬롯은 NULL)
    for i in range(1, 21):
        if f'picname{i}' not in pic_cols:
            pic_cols[f'picname{i}'] = None

    # 더 이상 사용하지 않는 파일 디스크에서 삭제
    for old_fn in old_picnames:
        if old_fn not in new_picnames:
            delete_image_file(old_fn)

    # ── 공통 필드 매핑 ──
    def iv(key, default=None):
        """정수 변환, 빈 문자열→None"""
        v = f.get(key, '').strip()
        try:
            return int(v) if v else default
        except ValueError:
            return default

    def fv(key, default=None):
        """실수(소수점) 변환, 빈 문자열→None (면적 등 소수점 필드용)"""
        v = f.get(key, '').strip()
        try:
            return float(v) if v else default
        except ValueError:
            return default

    def sv(key, default=''):
        """문자열 trim"""
        return f.get(key, default).strip()

    fields = {
        'category':      sv('category'),
        'part':          sv('part', '임대'),
        'build_check':   sv('build_check', '2'),
        'id':            session.get('admin_id', ''),
        'title':         sv('title'),
        'si':            sv('si'),
        'gu':            sv('gu'),
        'dong':          sv('dong'),
        'ri':            sv('ri'),
        'area':          sv('area'),
        'addr':          sv('addr'),
        'state':         sv('state', '등록'),
        'contract':      sv('contract', '계약가능'),
        'size':          fv('size'),    # 소수점 허용 (㎡)
        'sil_size':      fv('sil_size'),  # 소수점 허용 (㎡)
        'maemae_money':  iv('maemae_money'),
        'jen_money':     iv('jen_money'),
        'security_money': iv('security_money'),
        'month_money':   iv('month_money'),
        'public_money':  sv('public_money'),
        'public_money1': sv('public_money1'),
        'public_money_opt': sv('public_money_opt'),
        'total_floor':      sv('total_floor'),
        'now_floor':        sv('now_floor'),
        'room1':            sv('room1'),
        'room2':            sv('room2'),
        'build_use_type':    sv('build_use_type'),     # 건물종류
        'build_access_date': sv('build_access_date'),  # 사용승인일
        'movein_day':       sv('movein_day'),
        'parking':          sv('parking'),          # 주차여부
        'gudxo':            sv('gudxo'),            # 형태(방 수)
        'gudxo1':           sv('gudxo1'),           # 형태(거실)
        'gudxo2':           sv('gudxo2'),           # 형태(욕실 수)
        'aspect':           sv('aspect'),           # 방향
        'traffice':         sv('traffice'),         # 소재지
        'memo':          f.get('memo', '').strip(),
        'admin_memo':    f.get('admin_memo', '').strip(),
        **pic_cols,
    }

    # ── 추천매물(good1~15): 체크 시 1, 미체크 시 0 ──
    for i in range(1, 16):
        fields[f'good{i}'] = 1 if f.get(f'good{i}') else 0

    # ── 테마별 매물(thema1~15): 체크 시 1, 미체크 시 0 ──
    for i in range(1, 16):
        fields[f'thema{i}'] = 1 if f.get(f'thema{i}') else 0

    # ── 옵션정보 숨기기 ──
    fields['opt_check'] = 1 if f.get('opt_check') else 0

    # ── 옵션정보 체크박스 (각 6개씩): 체크 시 1, 미체크 시 0 ──
    for i in range(1, 7):
        fields[f'household{i}'] = 1 if f.get(f'household{i}') else 0
        fields[f'electron{i}']  = 1 if f.get(f'electron{i}')  else 0
        fields[f'bathroom{i}']  = 1 if f.get(f'bathroom{i}')  else 0
        fields[f'security{i}']  = 1 if f.get(f'security{i}')  else 0
        fields[f'etc{i}']       = 1 if f.get(f'etc{i}')       else 0
        fields[f'around{i}']    = 1 if f.get(f'around{i}')    else 0

    try:
        with engine.connect() as conn:
            if idx is None:
                # ── INSERT: code 자동 생성 ──
                max_code = conn.execute(
                    text('SELECT MAX(CAST(code AS UNSIGNED)) FROM sswp_maemul')
                ).scalar() or 10000
                new_code = max(int(max_code) + 1, 10001)
                fields['code']  = str(new_code)
                fields['wdate'] = text('NOW()')
                fields['ldate'] = text('NOW()')

                col_names = ', '.join(fields.keys())
                placeholders = ', '.join(
                    v.text if hasattr(v, 'text') else f':{k}'
                    for k, v in fields.items()
                )
                bind_params = {
                    k: v for k, v in fields.items()
                    if not hasattr(v, 'text')
                }
                conn.execute(
                    text(f'INSERT INTO sswp_maemul ({col_names}) VALUES ({placeholders})'),
                    bind_params
                )
            else:
                # ── UPDATE ──
                fields['ldate'] = text('NOW()')
                set_clause = ', '.join(
                    f'{k} = NOW()' if hasattr(v, 'text') else f'{k} = :{k}'
                    for k, v in fields.items()
                )
                bind_params = {
                    k: v for k, v in fields.items()
                    if not hasattr(v, 'text')
                }
                bind_params['idx'] = idx
                conn.execute(
                    text(f'UPDATE sswp_maemul SET {set_clause} WHERE idx = :idx AND COALESCE(is_deleted, 0) = 0'),
                    bind_params
                )

            conn.commit()
        return None  # 성공

    except Exception as e:
        return f'저장 중 오류가 발생했습니다: {str(e)}'


# ─── 블랙리스트 관리 라우트 ────────────────────────────────────────

@bp.route('/blocklist')
@login_required
def blocklist():
    """블랙리스트 목록 + 최근 의심 접속자 페이지"""
    with engine.connect() as conn:
        # 블랙리스트 전체 목록 (최신 등록 순)
        bl_rows = conn.execute(
            text("""
                SELECT id, ip, visitor_id, reason, is_active, created_at
                FROM zibeasy_blocklist
                ORDER BY id DESC
            """)
        ).fetchall()
        blocklist_items = [dict(r._mapping) for r in bl_rows]

        # 현재 활성 차단 건수
        active_count = sum(1 for r in blocklist_items if r['is_active'])

        # 최근 1시간 내 20회 이상 접속한 의심 IP 목록
        suspect_rows = conn.execute(
            text("""
                SELECT ip,
                       COUNT(*)            AS cnt,
                       COUNT(DISTINCT code) AS codes
                FROM zibeasy_access_log
                WHERE wdate >= NOW() - INTERVAL 1 HOUR
                  AND ip != ''
                GROUP BY ip
                HAVING cnt >= 20
                ORDER BY cnt DESC
                LIMIT 20
            """)
        ).fetchall()
        suspects = [dict(r._mapping) for r in suspect_rows]

    return render_template(
        'admin/blocklist.html',
        blocklist_items=blocklist_items,
        active_count=active_count,
        suspects=suspects,
    )


@bp.route('/blocklist/add', methods=['POST'])
@login_required
def blocklist_add():
    """블랙리스트 항목 추가 (IP 또는 visitor_id)"""
    ip         = request.form.get('ip', '').strip()
    visitor_id = request.form.get('visitor_id', '').strip()
    reason     = request.form.get('reason', '').strip()[:200]

    # IP와 visitor_id 중 하나 이상 입력 필수
    if not ip and not visitor_id:
        return redirect(url_for('admin.blocklist'))

    with engine.connect() as conn:
        conn.execute(
            text("""
                INSERT INTO zibeasy_blocklist (ip, visitor_id, reason, is_active)
                VALUES (:ip, :vid, :reason, 1)
            """),
            {'ip': ip, 'vid': visitor_id, 'reason': reason}
        )
        conn.commit()

    # 블랙리스트 캐시 즉시 무효화
    from app import invalidate_blocklist_cache
    invalidate_blocklist_cache()

    return redirect(url_for('admin.blocklist'))


@bp.route('/blocklist/<int:bl_id>/toggle', methods=['POST'])
@login_required
def blocklist_toggle(bl_id):
    """블랙리스트 활성(차단 중) ↔ 비활성(해제) 전환"""
    with engine.connect() as conn:
        conn.execute(
            text("UPDATE zibeasy_blocklist SET is_active = 1 - is_active WHERE id = :id"),
            {'id': bl_id}
        )
        conn.commit()

    from app import invalidate_blocklist_cache
    invalidate_blocklist_cache()

    return redirect(url_for('admin.blocklist'))


@bp.route('/blocklist/<int:bl_id>/delete', methods=['POST'])
@login_required
def blocklist_delete(bl_id):
    """블랙리스트 항목 영구 삭제"""
    with engine.connect() as conn:
        conn.execute(
            text("DELETE FROM zibeasy_blocklist WHERE id = :id"),
            {'id': bl_id}
        )
        conn.commit()

    from app import invalidate_blocklist_cache
    invalidate_blocklist_cache()

    return redirect(url_for('admin.blocklist'))


# ─── 접속 통계 라우트 ────────────────────────────────────────────────

import re as _analytics_re  # 모듈 수준에서 import (반복 방지)


def _build_date_cond(mode, date):
    """
    mode/date 파라미터로 WHERE 조건과 바인드 파라미터 반환
      mode=daily  + date=YYYY-MM-DD → 해당 날짜
      mode=weekly                   → 최근 7일
      mode=monthly                  → 최근 30일
      mode=all                      → 전체
    """
    # date 유효성 확인
    if date and not _analytics_re.match(r'^\d{4}-\d{2}-\d{2}$', date):
        date = ''

    if mode == 'weekly':
        return 'wdate >= CURDATE() - INTERVAL 7 DAY', {}
    if mode == 'monthly':
        return 'wdate >= CURDATE() - INTERVAL 30 DAY', {}
    if mode == 'all':
        return '1 = 1', {}
    # daily (기본)
    if date:
        return 'DATE(wdate) = :date', {'date': date}
    return 'DATE(wdate) = CURDATE()', {}


@bp.route('/analytics')
@login_required
def analytics():
    """접속 통계 메인 페이지"""
    return render_template('admin/analytics.html')


@bp.route('/analytics/api/summary')
@login_required
def analytics_summary():
    """요약 통계 JSON — 총 접속, 순방문자, 순IP, 조회 매물 수, 전일 대비 증감"""
    mode = request.args.get('mode', 'daily')
    date = request.args.get('date', '')
    date_cond, bind = _build_date_cond(mode, date)

    # 비교 기간 조건 (daily만 전일 대비 지원)
    if mode == 'daily':
        if date:
            prev_cond = 'DATE(wdate) = DATE(:date) - INTERVAL 1 DAY'
            prev_bind = bind
        else:
            prev_cond = 'DATE(wdate) = CURDATE() - INTERVAL 1 DAY'
            prev_bind = {}
    else:
        prev_cond = '1 = 0'  # 주간/월간/전체는 전일 비교 없음
        prev_bind = {}

    with engine.connect() as conn:
        row = conn.execute(
            text(f"""
                SELECT
                    COUNT(*)                    AS total,
                    COUNT(DISTINCT visitor_id)  AS visitors,
                    COUNT(DISTINCT ip)          AS ips,
                    COUNT(DISTINCT CASE WHEN code IS NOT NULL
                                   THEN CONCAT(ip, '-', code, '-', DATE(wdate)) END) AS properties
                FROM zibeasy_access_log
                WHERE {date_cond}
            """),
            bind
        ).fetchone()

        prev_row = conn.execute(
            text(f"""
                SELECT COUNT(*) AS total, COUNT(DISTINCT visitor_id) AS visitors
                FROM zibeasy_access_log
                WHERE {prev_cond}
            """),
            prev_bind
        ).fetchone()

    def pct(today, yesterday):
        """전일 대비 증감 퍼센트"""
        if not yesterday:
            return None
        return round((today - yesterday) / yesterday * 100, 1)

    return jsonify({
        'total':         row[0],
        'visitors':      row[1],
        'ips':           row[2],
        'properties':    row[3],
        'total_diff':    pct(row[0], prev_row[0]) if mode == 'daily' else None,
        'visitors_diff': pct(row[1], prev_row[1]) if mode == 'daily' else None,
    })


@bp.route('/analytics/api/daily')
@login_required
def analytics_daily():
    """일별 방문자/접속 추이 JSON (mode에 따라 기간 조정)"""
    mode = request.args.get('mode', 'daily')

    # 기간별 일수 설정
    interval_map = {'weekly': 7, 'monthly': 30, 'all': 365}
    interval = interval_map.get(mode, 30)  # daily 선택 시에도 30일 추이 표시

    with engine.connect() as conn:
        rows = conn.execute(
            text(f"""
                SELECT
                    DATE(wdate)                 AS day,
                    COUNT(*)                    AS total,
                    COUNT(DISTINCT visitor_id)  AS visitors,
                    COUNT(DISTINCT ip)          AS ips
                FROM zibeasy_access_log
                WHERE wdate >= CURDATE() - INTERVAL {interval} DAY
                GROUP BY day
                ORDER BY day
            """)
        ).fetchall()

    return jsonify([
        {'day': str(r[0]), 'total': r[1], 'visitors': r[2], 'ips': r[3]}
        for r in rows
    ])


@bp.route('/analytics/api/hourly')
@login_required
def analytics_hourly():
    """시간대별 접속 분포 JSON (daily 모드 전용)"""
    date = request.args.get('date', '')
    if date and not _analytics_re.match(r'^\d{4}-\d{2}-\d{2}$', date):
        date = ''

    date_cond = 'DATE(wdate) = :date' if date else 'DATE(wdate) = CURDATE()'
    bind = {'date': date} if date else {}

    with engine.connect() as conn:
        rows = conn.execute(
            text(f"""
                SELECT HOUR(wdate) AS hour, COUNT(*) AS cnt
                FROM zibeasy_access_log
                WHERE {date_cond}
                GROUP BY hour
                ORDER BY hour
            """),
            bind
        ).fetchall()

    # 0~23시 빈 시간대는 0으로 채움
    hour_map = {r[0]: r[1] for r in rows}
    return jsonify([{'hour': h, 'cnt': hour_map.get(h, 0)} for h in range(24)])


@bp.route('/analytics/api/breakdown')
@login_required
def analytics_breakdown():
    """브라우저/OS/기기 분포 + 유입 출처 + TOP 목록 JSON"""
    mode = request.args.get('mode', 'daily')
    date = request.args.get('date', '')
    date_cond, bind = _build_date_cond(mode, date)

    with engine.connect() as conn:
        # ── 분포 조회 헬퍼 (conn 블록 내부에서 호출해야 함) ──
        def fetch(col):
            """특정 컬럼의 분포 조회 — with 블록 안에서만 호출"""
            rs = conn.execute(
                text(f"""
                    SELECT {col}, COUNT(*) AS cnt
                    FROM zibeasy_access_log
                    WHERE {date_cond}
                    GROUP BY {col}
                    ORDER BY cnt DESC
                """),
                bind
            ).fetchall()
            return [{'label': r[0] or 'unknown', 'cnt': r[1]} for r in rs]

        # fetch()는 반드시 with 블록 안에서 호출
        browser_data = fetch('browser')
        os_data      = fetch('os')
        device_data  = fetch('device')
        source_data  = conn.execute(
            text(f"""
                SELECT COALESCE(NULLIF(source_name, ''), 'unknown') AS label,
                       COUNT(*) AS cnt
                FROM zibeasy_access_log
                WHERE {date_cond} AND is_entry = 1
                GROUP BY label
                ORDER BY cnt DESC
            """),
            bind
        ).fetchall()

        # 인기 매물 TOP 10 — 실제 조회수 로직 동일 적용 (ip + code + 날짜 기준 중복 제거)
        top_props = conn.execute(
            text(f"""
                SELECT code, COUNT(DISTINCT CONCAT(ip, '-', DATE(wdate))) AS cnt
                FROM zibeasy_access_log
                WHERE {date_cond} AND code IS NOT NULL
                GROUP BY code
                ORDER BY cnt DESC
                LIMIT 10
            """),
            bind
        ).fetchall()

        # IP별 매물 방문 횟수 TOP 20 — 동일 IP가 매물 페이지를 몇 번 방문했는지 (중복 포함 원시 횟수)
        top_ips = conn.execute(
            text(f"""
                SELECT ip,
                       COUNT(*)               AS visit_cnt,
                       COUNT(DISTINCT code)   AS prop_cnt
                FROM zibeasy_access_log
                WHERE {date_cond} AND code IS NOT NULL
                GROUP BY ip
                ORDER BY visit_cnt DESC
                LIMIT 20
            """),
            bind
        ).fetchall()

        top_referrers = conn.execute(
            text(f"""
                SELECT COALESCE(NULLIF(source_host, ''), 'direct') AS host,
                       COUNT(*) AS cnt
                FROM zibeasy_access_log
                WHERE {date_cond} AND is_entry = 1
                GROUP BY host
                ORDER BY cnt DESC
                LIMIT 15
            """),
            bind
        ).fetchall()

        top_landings = conn.execute(
            text(f"""
                SELECT COALESCE(NULLIF(landing_page, ''), page) AS landing,
                       COUNT(*) AS cnt
                FROM zibeasy_access_log
                WHERE {date_cond} AND is_entry = 1
                GROUP BY landing
                ORDER BY cnt DESC
                LIMIT 15
            """),
            bind
        ).fetchall()

        top_campaigns = conn.execute(
            text(f"""
                SELECT utm_campaign, COUNT(*) AS cnt
                FROM zibeasy_access_log
                WHERE {date_cond}
                  AND is_entry = 1
                  AND utm_campaign IS NOT NULL
                  AND utm_campaign <> ''
                GROUP BY utm_campaign
                ORDER BY cnt DESC
                LIMIT 15
            """),
            bind
        ).fetchall()

    # with 블록 종료 후 이미 fetch 결과가 변수에 저장되어 있음
    return jsonify({
        'browser':    browser_data,
        'os':         os_data,
        'device':     device_data,
        'sources':    [{'label': r[0], 'cnt': r[1]} for r in source_data],
        'properties': [{'code': r[0], 'cnt': r[1]} for r in top_props],
        'top_ips':    [{'ip': r[0], 'visit_cnt': r[1], 'prop_cnt': r[2]} for r in top_ips],
        'top_referrers': [{'host': r[0], 'cnt': r[1]} for r in top_referrers],
        'top_landings': [{'landing': r[0], 'cnt': r[1]} for r in top_landings],
        'top_campaigns': [{'campaign': r[0], 'cnt': r[1]} for r in top_campaigns],
    })


@bp.route('/analytics/api/logs')
@login_required
def analytics_logs():
    """상세 로그 목록 JSON (정렬/필터/페이징)"""
    # 파라미터 수집
    mode    = request.args.get('mode', 'daily')
    date    = request.args.get('date', '')
    ip      = request.args.get('ip', '').strip()
    device  = request.args.get('device', '').strip()
    browser = request.args.get('browser', '').strip()
    source  = request.args.get('source', '').strip().lower()
    sort    = request.args.get('sort', 'wdate_desc')
    page    = max(1, int(request.args.get('page', 1)))
    per     = 50  # 페이지당 로그 수

    # 정렬 컬럼 화이트리스트 (SQL 인젝션 방지)
    sort_map = {
        'wdate_desc': 'wdate DESC',
        'wdate_asc':  'wdate ASC',
        'ip':         'ip ASC',
        'browser':    'browser ASC',
        'os':         'os ASC',
        'device':     'device ASC',
        'source':     'source_name ASC',
    }
    order_by = sort_map.get(sort, 'wdate DESC')

    # WHERE 조건 동적 생성: 기간 조건은 _build_date_cond() 재사용
    date_cond, bind = _build_date_cond(mode, date)
    conditions = [date_cond]

    if ip:
        conditions.append('ip LIKE :ip')
        bind['ip'] = f'%{ip}%'
    if device:
        conditions.append('device = :device')
        bind['device'] = device
    if browser:
        conditions.append('browser = :browser')
        bind['browser'] = browser
    if source:
        conditions.append('source_name = :source')
        bind['source'] = source

    where = ' AND '.join(conditions)
    offset = (page - 1) * per

    with engine.connect() as conn:
        total_count = conn.execute(
            text(f"SELECT COUNT(*) FROM zibeasy_access_log WHERE {where}"),
            bind
        ).scalar()

        rows = conn.execute(
            text(f"""
                SELECT id, wdate, ip, visitor_id, browser, os, device,
                       page, referrer, language, code,
                       source_type, source_name, source_host,
                       landing_page, utm_source, utm_medium, utm_campaign
                FROM zibeasy_access_log
                WHERE {where}
                ORDER BY {order_by}
                LIMIT {per} OFFSET {offset}
            """),
            bind
        ).fetchall()

    return jsonify({
        'total': total_count,
        'page':  page,
        'pages': (total_count + per - 1) // per,
        'logs': [
            {
                'id':         r[0],
                'wdate':      r[1].strftime('%m-%d %H:%M:%S') if r[1] else '',
                'ip':         r[2],
                'visitor_id': r[3],
                'browser':    r[4],
                'os':         r[5],
                'device':     r[6],
                'page':       r[7],
                'referrer':   r[8],
                'language':   r[9],
                'code':       r[10],
                'source_type': r[11],
                'source_name': r[12],
                'source_host': r[13],
                'landing_page': r[14],
                'utm_source': r[15],
                'utm_medium': r[16],
                'utm_campaign': r[17],
            }
            for r in rows
        ],
    })


# ─── 회원 관리 ─────────────────────────────────────────────────

@bp.route('/members')
@login_required
def members():
    """회원 목록 페이지 (검색 + 가입유형 필터 + 페이징)"""
    keyword    = request.args.get('keyword', '').strip()
    login_type = request.args.get('login_type', '').strip()   # email / kakao / naver
    page       = max(int(request.args.get('page', 1)), 1)
    per_page   = 20

    # WHERE 조건 동적 생성
    conditions = []
    params: dict = {}

    if keyword:
        conditions.append(
            '(u.nickname LIKE :kw OR u.email LIKE :kw OR u.username LIKE :kw)'
        )
        params['kw'] = f'%{keyword}%'

    if login_type == 'kakao':
        conditions.append('u.kakao_id IS NOT NULL')
    elif login_type == 'naver':
        conditions.append('u.naver_id IS NOT NULL')
    elif login_type == 'email':
        conditions.append('u.kakao_id IS NULL AND u.naver_id IS NULL')

    where = ' AND '.join(conditions) if conditions else '1=1'
    offset = (page - 1) * per_page

    try:
        with engine.connect() as conn:
            # 전체 건수
            total = conn.execute(
                text(f'SELECT COUNT(*) FROM users u WHERE {where}'), params
            ).scalar()

            # 목록 조회
            rows = conn.execute(
                text(f'''
                    SELECT u.idx, u.username, u.email, u.nickname,
                           u.kakao_id, u.naver_id, u.profile_img,
                           u.created_at, u.last_login,
                           (SELECT COUNT(*) FROM user_liked l WHERE l.user_idx = u.idx) AS liked_cnt
                    FROM users u
                    WHERE {where}
                    ORDER BY u.idx DESC
                    LIMIT :limit OFFSET :offset
                '''),
                {**params, 'limit': per_page, 'offset': offset}
            ).fetchall()

        total_pages = max((total + per_page - 1) // per_page, 1)

        return render_template('admin/members.html',
                               rows=rows, total=total,
                               page=page, total_pages=total_pages,
                               keyword=keyword, login_type=login_type,
                               admin_name=session.get('admin_name', ''))
    except Exception as e:
        return render_template('admin/members.html',
                               rows=[], total=0,
                               page=1, total_pages=1,
                               keyword=keyword, login_type=login_type,
                               admin_name=session.get('admin_name', ''),
                               error=str(e))
