"""
메인 페이지 및 상세 페이지 라우트
"""
from flask import Blueprint, render_template, request, jsonify, make_response, redirect, send_from_directory, current_app, session, url_for
import os
from sqlalchemy import text
import logging
import json
import uuid
import time
import urllib.parse
import re
import threading
from werkzeug.utils import secure_filename
from app.models import engine
from app.security import check_rate_limit, client_ip
from app.utils.time import time_ago
from app.utils.price import get_price_text, format_number
from app.utils.cheonan_sync import update_see_to_cheonan
from app.utils.mail import send_plain_mail

bp = Blueprint('main', __name__)
_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
# 카테고리 코드 → 한글 이름 매핑 (모듈 수준 상수, 매 요청마다 재생성 방지)
CATEGORY_MAP = {
    '90': '원룸',
    '91': '투베이',
    '92': '무보증/단기',
    '93': '투룸',
    '94': '쓰리룸',
}
# 테이블 초기화 여부 플래그 (프로세스당 1회만 CREATE TABLE 실행)
_feedback_table_ready = False
_request_table_ready = False
FEEDBACK_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'data', 'feedback_uploads')
ALLOWED_FEEDBACK_EXT = {'jpg', 'jpeg', 'png', 'webp', 'gif', 'mp4', 'mov', 'avi', 'mkv', 'webm'}
MAX_FEEDBACK_FILE_BYTES = 5 * 1024 * 1024
POLICY_EFFECTIVE_DATE = '2026년 3월 6일'
POLICY_UPDATED_DATE = '2026년 3월 6일'


def _policy_context():
    """약관/개인정보 관련 템플릿 공통 컨텍스트."""
    contact_email = (
        current_app.config.get('PRIVACY_CONTACT_EMAIL')
        or current_app.config.get('ADMIN_NOTIFY_EMAIL')
        or ''
    )
    return {
        'policy_effective_date': POLICY_EFFECTIVE_DATE,
        'policy_updated_date': POLICY_UPDATED_DATE,
        'privacy_contact_email': contact_email,
        'house_request_retention_days': int(current_app.config.get('HOUSE_REQUEST_RETENTION_DAYS', 365)),
        'feedback_retention_days': int(current_app.config.get('FEEDBACK_RETENTION_DAYS', 365)),
        'consign_google_smtp': bool(current_app.config.get('CONSIGN_GOOGLE_SMTP', True)),
    }

@bp.route('/')
def home():
    """메인 홈 화면"""
    recent_ids = []

    if 'user_idx' in session:
        try:
            with engine.connect() as conn:
                recent_rows = conn.execute(
                    text('SELECT code FROM user_recent WHERE user_idx=:uid ORDER BY viewed_at DESC LIMIT 2'),
                    {'uid': session['user_idx']}
                ).fetchall()
            recent_ids = [str(r[0]) for r in recent_rows]
        except Exception as e:
            logging.error(f"홈 최근 본 매물 DB 조회 오류: {e}")
    else:
        try:
            recent_ids = _parse_ids_cookie(request.cookies.get('recentViewed', ''))[:2]
        except Exception:
            recent_ids = []

    recent_preview_map = _fetch_previews(recent_ids)
    recent_home_props = []
    for recent_id in recent_ids:
        if recent_id not in recent_preview_map:
            continue
        item = recent_preview_map[recent_id]
        price_parts = (item.get('price_text') or '').split(' ', 1)
        item['home_price_text'] = price_parts[1] if len(price_parts) > 1 and price_parts[0] == '월세' else (item.get('price_text') or '')
        item['home_summary_text'] = ', '.join(filter(None, [item.get('category_name'), item.get('home_price_text')]))
        recent_home_props.append(item)

    return render_template('home.html', recent_home_props=recent_home_props[:2])

@bp.route('/fee-calc')
def fee_calc_redirect():
    """중개보수 계산기 - 슬래시 없는 경우 슬래시 있는 버전으로 리다이렉트 (상대경로 정상 작동)"""
    return redirect('/fee-calc/', code=301)

@bp.route('/fee-calc/')
def fee_calc():
    """중개보수 계산기 페이지"""
    fee_calc_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'fee_calc')
    return send_from_directory(fee_calc_dir, 'index.html')

@bp.route('/fee-calc/<path:filename>')
def fee_calc_static(filename):
    """중개보수 계산기 정적 파일"""
    fee_calc_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'fee_calc')
    return send_from_directory(fee_calc_dir, filename)

@bp.route('/map')
def index():
    """지도형 매물 검색 페이지"""
    return render_template('index.html')

@bp.route('/clear-liked')
def clear_liked():
    """찜 목록 초기화 페이지"""
    return render_template('clear-liked.html')

def _normalize_ids(values, max_items=None) -> list:
    """ID 리스트 정규화: 문자열 변환 + 빈값/중복 제거 + 길이 제한."""
    if not isinstance(values, list):
        return []
    out = []
    seen = set()
    for v in values:
        s = str(v or '').strip()
        if not s or s in ('undefined', 'null') or s in seen:
            continue
        seen.add(s)
        out.append(s)
        if max_items and len(out) >= max_items:
            break
    return out


def _parse_ids_payload(raw: str, max_items=None) -> list:
    """JSON(권장) 또는 콤마 문자열에서 ID 목록을 파싱."""
    if not raw:
        return []
    decoded = urllib.parse.unquote(raw)
    try:
        parsed = json.loads(decoded)
        return _normalize_ids(parsed, max_items=max_items)
    except Exception:
        # JSON이 아니면 "1,2,3" 형태 폴백 지원
        return _normalize_ids(decoded.split(','), max_items=max_items)


def _parse_ids_cookie(raw: str) -> list:
    """쿠키 문자열에서 ID 목록을 파싱해 문자열 리스트로 반환"""
    return _parse_ids_payload(raw)

def _to_int(value) -> int:
    try:
        return int(float(value or 0))
    except Exception:
        return 0

def _format_lv_price(row: dict) -> str:
    """리스트 페이지(list-view.js lvFormatPrice)와 동일한 가격 텍스트."""
    maemae = _to_int(row.get('maemae_money'))
    jeonse = _to_int(row.get('jen_money'))
    deposit = _to_int(row.get('security_money'))
    monthly = _to_int(row.get('month_money'))

    if maemae > 0:
        return f"매매 {maemae}"
    if jeonse > 0:
        return f"전세 {jeonse}"
    if deposit > 0 or monthly > 0:
        if deposit > 0 and monthly > 0:
            return f"월세 {deposit}/{monthly}"
        if deposit > 0:
            return f"월세 {deposit}"
        return f"월세 {monthly}"
    return ''

def _format_lv_mgmt(public_money) -> str:
    """리스트 페이지(list-view.js lvFormatMgmt)와 동일한 관리비 텍스트."""
    try:
        amount = float(public_money or 0)
    except Exception:
        amount = 0
    if amount <= 0:
        return ''
    million = int(amount / 10000)
    return f"관리비 {million}만원" if million > 0 else ''

def _format_floor_text(row: dict) -> str:
    now_floor = row.get('now_floor')
    total_floor = row.get('total_floor')
    if now_floor and total_floor:
        return f"총 {total_floor}층 중 {now_floor}층"
    if now_floor:
        return f"{now_floor}층"
    return ''

def _clean_text(value, max_len=500):
    return (value or '').strip()[:max_len]

def _ensure_house_request_table():
    global _request_table_ready
    if _request_table_ready:
        return
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
    _request_table_ready = True

def _ensure_feedback_table():
    global _feedback_table_ready
    if _feedback_table_ready:
        return
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
    _feedback_table_ready = True

def _save_feedback_files(files):
    os.makedirs(FEEDBACK_UPLOAD_DIR, exist_ok=True)
    saved = []

    if len(files) > 5:
        return None, '첨부 파일은 최대 5개까지 가능합니다.'

    for f in files:
        if not f or not f.filename:
            continue

        filename = secure_filename(f.filename)
        if not filename:
            return None, '첨부 파일명이 올바르지 않습니다.'

        ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
        if ext not in ALLOWED_FEEDBACK_EXT:
            return None, f'지원하지 않는 파일 형식입니다: {filename}'

        f.stream.seek(0, os.SEEK_END)
        size = f.stream.tell()
        f.stream.seek(0)
        if size > MAX_FEEDBACK_FILE_BYTES:
            return None, f'파일 크기는 5MB 이하여야 합니다: {filename}'

        unique_name = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}_{filename}"
        full_path = os.path.join(FEEDBACK_UPLOAD_DIR, unique_name)
        f.save(full_path)
        saved.append(unique_name)

    return saved, None

def _build_feedback_payload(form, files):
    report_type = _clean_text(form.get('report_type'), 30)
    name = _clean_text(form.get('name'), 50)
    phone = _clean_text(form.get('phone'), 30)
    privacy_agree = _clean_text(form.get('privacy_agree'), 5)

    if report_type not in ('error_report', 'feature_suggestion', 'improvement_opinion'):
        return None, '제보 유형을 선택해주세요.'
    if not name:
        return None, '이름을 입력해주세요.'
    if not phone:
        return None, '연락처를 입력해주세요.'
    if privacy_agree != 'Y':
        return None, '개인정보 활용 동의가 필요합니다.'

    payload = {
        'report_type': report_type,
        'name': name,
        'phone': phone,
        'device_type': None,
        'device_etc': None,
        'browser_type': None,
        'browser_etc': None,
        'page_url': None,
        'error_description': None,
        'feature_description': None,
        'feature_reason': None,
        'reference_service': None,
        'reference_service_etc': None,
        'improvement_description': None,
    }

    if report_type == 'error_report':
        device_type = _clean_text(form.get('device_type'), 50)
        browser_type = _clean_text(form.get('browser_type'), 50)
        error_description = _clean_text(form.get('error_description'), 4000)
        device_etc = _clean_text(form.get('device_etc'), 120)
        browser_etc = _clean_text(form.get('browser_etc'), 120)

        if not device_type:
            return None, '문제가 발생한 기기를 선택해주세요.'
        if not browser_type:
            return None, '문제가 발생한 앱/브라우저를 선택해주세요.'
        if device_type == '기타' and not device_etc:
            return None, '기타 기기 내용을 입력해주세요.'
        if browser_type == '기타' and not browser_etc:
            return None, '기타 앱/브라우저 내용을 입력해주세요.'
        if not error_description:
            return None, '문제 내용을 입력해주세요.'

        payload.update({
            'device_type': device_type,
            'device_etc': device_etc if device_type == '기타' else None,
            'browser_type': browser_type,
            'browser_etc': browser_etc if browser_type == '기타' else None,
            'page_url': _clean_text(form.get('page_url'), 500),
            'error_description': error_description
        })

    elif report_type == 'feature_suggestion':
        feature_description = _clean_text(form.get('feature_description'), 4000)
        if not feature_description:
            return None, '제안 기능 내용을 입력해주세요.'

        reference_service = _clean_text(form.get('reference_service'), 50)
        reference_service_etc = _clean_text(form.get('reference_service_etc'), 120)
        if reference_service == '기타' and not reference_service_etc:
            return None, '기타 참고 서비스 내용을 입력해주세요.'
        payload.update({
            'feature_description': feature_description,
            'feature_reason': _clean_text(form.get('feature_reason'), 4000),
            'reference_service': reference_service or None,
            'reference_service_etc': reference_service_etc if reference_service == '기타' else None
        })

    else:
        improvement_description = _clean_text(form.get('improvement_description'), 4000)
        if not improvement_description:
            return None, '개선 의견 내용을 입력해주세요.'
        payload['improvement_description'] = improvement_description

    attachment_names, file_error = _save_feedback_files(files)
    if file_error:
        return None, file_error

    payload['attachments_json'] = json.dumps(attachment_names, ensure_ascii=False) if attachment_names else None

    # 메일 본문
    type_map = {
        'error_report': '오류 제보',
        'feature_suggestion': '기능 제안',
        'improvement_opinion': '개선 의견'
    }
    body_lines = [
        "새로운 제보/제안이 접수되었습니다.",
        "",
        f"- 유형: {type_map.get(report_type, report_type)}",
        f"- 이름: {name}",
        f"- 연락처: {phone}",
    ]

    if report_type == 'error_report':
        body_lines += [
            f"- 기기: {payload['device_type']}{(' / ' + payload['device_etc']) if payload['device_etc'] else ''}",
            f"- 브라우저: {payload['browser_type']}{(' / ' + payload['browser_etc']) if payload['browser_etc'] else ''}",
            f"- 화면 URL: {payload['page_url'] or '-'}",
            f"- 문제 내용: {payload['error_description'] or '-'}",
        ]
    elif report_type == 'feature_suggestion':
        body_lines += [
            f"- 제안 기능: {payload['feature_description'] or '-'}",
            f"- 필요 이유: {payload['feature_reason'] or '-'}",
            f"- 참고 서비스: {payload['reference_service'] or '-'}{(' / ' + payload['reference_service_etc']) if payload['reference_service_etc'] else ''}",
        ]
    else:
        body_lines += [f"- 개선 의견: {payload['improvement_description'] or '-'}"]

    body_lines.append(f"- 첨부 파일 수: {len(attachment_names)}개")
    payload['mail_subject'] = f"[천안하우스] 제보/제안 접수 - {type_map.get(report_type, report_type)}"
    payload['mail_body'] = "\n".join(body_lines)

    return payload, None

def _build_request_payload(form):
    request_type = _clean_text(form.get('request_type'), 20)
    name = _clean_text(form.get('name'), 50)
    phone = _clean_text(form.get('phone'), 30)
    email = _clean_text(form.get('email'), 120)
    privacy_agree = _clean_text(form.get('privacy_agree'), 5)
    move_in_date = _clean_text(form.get('move_in_date'), 40)
    details = _clean_text(form.get('details'), 3000)

    if request_type not in ('lease_out', 'find_home'):
        return None, '요청 유형이 올바르지 않습니다.'
    if not name:
        return None, '이름을 입력해주세요.'
    if not phone:
        return None, '연락처를 입력해주세요.'
    if privacy_agree != 'Y':
        return None, '개인정보 활용 동의가 필요합니다.'
    if email and not _EMAIL_RE.match(email):
        return None, '이메일 형식이 올바르지 않습니다.'

    if request_type == 'lease_out':
        location_text = _clean_text(form.get('property_address'), 255)
        property_type = _clean_text(form.get('property_type'), 30)
        transaction_type = _clean_text(form.get('transaction_type'), 20)
        deposit = _clean_text(form.get('deposit'), 30)
        monthly_rent = _clean_text(form.get('monthly_rent'), 30)
        sale_price = _clean_text(form.get('sale_price'), 30)

        if not location_text:
            return None, '매물 주소를 입력해주세요.'

        budget_text = f"거래:{transaction_type} / 보증금:{deposit} / 월세:{monthly_rent} / 매매가:{sale_price}"
        category = property_type or transaction_type or '미기입'

        mail_subject = f"[천안하우스] 집 내놓기 신청 - {name}"
        mail_body = (
            "집 내놓기 신청이 접수되었습니다.\n\n"
            f"- 이름: {name}\n"
            f"- 연락처: {phone}\n"
            f"- 이메일: {email or '-'}\n"
            f"- 매물 주소: {location_text}\n"
            f"- 매물 유형: {property_type or '-'}\n"
            f"- 거래 유형: {transaction_type or '-'}\n"
            f"- 보증금: {deposit or '-'}\n"
            f"- 월세: {monthly_rent or '-'}\n"
            f"- 매매가: {sale_price or '-'}\n"
            f"- 입주 가능일: {move_in_date or '-'}\n"
            f"- 추가 내용: {details or '-'}\n"
        )
    else:
        location_text = _clean_text(form.get('preferred_area'), 255)
        preferred_type = _clean_text(form.get('preferred_type'), 30)
        budget_deposit = _clean_text(form.get('budget_deposit'), 30)
        budget_monthly = _clean_text(form.get('budget_monthly'), 30)
        budget_jeonse = _clean_text(form.get('budget_jeonse'), 30)
        budget_sale = _clean_text(form.get('budget_sale'), 30)

        if not location_text:
            return None, '희망 지역을 입력해주세요.'

        budget_text = (
            f"보증금:{budget_deposit} / 월세:{budget_monthly} / "
            f"전세:{budget_jeonse} / 매매:{budget_sale}"
        )
        category = preferred_type or '미기입'

        mail_subject = f"[천안하우스] 집 구하기 신청 - {name}"
        mail_body = (
            "집 구하기 신청이 접수되었습니다.\n\n"
            f"- 이름: {name}\n"
            f"- 연락처: {phone}\n"
            f"- 이메일: {email or '-'}\n"
            f"- 희망 지역: {location_text}\n"
            f"- 희망 유형: {preferred_type or '-'}\n"
            f"- 희망 보증금: {budget_deposit or '-'}\n"
            f"- 희망 월세: {budget_monthly or '-'}\n"
            f"- 희망 전세: {budget_jeonse or '-'}\n"
            f"- 희망 매매가: {budget_sale or '-'}\n"
            f"- 입주 희망일: {move_in_date or '-'}\n"
            f"- 추가 내용: {details or '-'}\n"
        )

    payload = {
        'request_type': request_type,
        'name': name,
        'phone': phone,
        'email': email or None,
        'category': category,
        'location_text': location_text,
        'budget_text': budget_text,
        'move_in_date': move_in_date or None,
        'details': details or None,
        'mail_subject': mail_subject,
        'mail_body': mail_body
    }
    return payload, None

def _fetch_previews(ids):
    """매물 ID 목록을 받아 미리보기 데이터 dict(code→data) 반환.
    관심목록·최근 본 매물 양쪽에서 공통으로 사용한다."""
    if not ids:
        return {}
    try:
        FIELDS = ('code, category, title, picname1, contract, ldate, movie, '
                  'maemae_money, jen_money, security_money, month_money, '
                  'public_money, dong, ri, now_floor, total_floor')
        placeholders = ', '.join([f':id{i}' for i in range(len(ids))])
        params = {f'id{i}': ids[i] for i in range(len(ids))}

        with engine.connect() as conn:
            rows = conn.execute(
                text(f'''
                    SELECT {FIELDS}
                    FROM sswp_maemul
                    WHERE code IN ({placeholders})
                      AND COALESCE(is_deleted, 0) = 0
                '''),
                params
            ).fetchall()

        row_map = {}
        for row in rows:
            d = dict(row._mapping)
            d['price_text']      = _format_lv_price(d)
            d['mgmt_text']       = _format_lv_mgmt(d.get('public_money'))
            d['category_name']   = CATEGORY_MAP.get(str(d.get('category', '')), '기타')
            d['category_quoted'] = f"\"{d['category_name']}\""
            d['address_text']    = d.get('ri') or d.get('dong') or '주소 정보 없음'
            d['floor_text']      = _format_floor_text(d)
            d['title_text']      = re.sub(r'\[.*?\]', '', (d.get('title') or '')).strip() or '상세 설명이 없습니다.'
            d['is_contracted']   = (d.get('contract') == '계약완료')
            row_map[str(d['code'])] = d
        return row_map
    except Exception as e:
        logging.error(f"매물 미리보기 DB 조회 오류: {e}")
        return {}


def _prepare_property_view_data(property: dict) -> dict:
    """상세/사진 페이지에서 공통으로 쓰는 매물 표시용 필드 정리."""
    property['price_text'] = get_price_text(property)
    _price_parts = property['price_text'].split(' ', 1) if property['price_text'] else []
    property['price_type'] = _price_parts[0] if _price_parts else ''
    property['price_only'] = _price_parts[1] if len(_price_parts) > 1 else ''

    try:
        property['public_money'] = int(property.get('public_money') or 0) // 10000
    except Exception:
        property['public_money'] = 0

    property['last_edit'] = time_ago(property.get('ldate'))
    _add_public_money_details(property)
    property['title'] = re.sub(r'\[.*?\]', '', property.get('title') or '').strip()

    if property.get('movie'):
        match = re.search(r'src=\\?["\'](.*?)\\?["\']', property['movie'])
        property['youtube_url'] = match.group(1).replace('\\', '') if match else None
    else:
        property['youtube_url'] = None

    if property.get('youtube_url'):
        video_id = property['youtube_url'].split('/')[-1].split('?')[0]
        property['youtube_thumb'] = f"https://img.youtube.com/vi/{video_id}/0.jpg"
        property['video_id'] = video_id

    return property


def _render_saved_properties_page(default_tab='liked'):
    """관심목록/최근 본 매물 통합 페이지 렌더링."""
    active_tab = request.args.get('tab', default_tab)
    if active_tab not in ('liked', 'recent'):
        active_tab = default_tab

    is_guest = 'user_idx' not in session
    if is_guest:
        # 로그인/회원가입 후 다시 이 페이지로 돌아오도록 현재 URL 저장
        session['next_url'] = request.url
        resp = make_response(render_template(
            'liked.html',
            liked=[],
            recent=[],
            active_tab=active_tab,
            is_guest=True
        ))
        resp.headers['Cache-Control'] = 'no-store'
        return resp

    uid = session['user_idx']

    # ── DB에서 관심목록 ID 조회 ──────────────────────────────────────
    try:
        with engine.connect() as conn:
            liked_rows = conn.execute(
                text('SELECT code FROM user_liked WHERE user_idx=:uid ORDER BY created_at DESC'),
                {'uid': uid}
            ).fetchall()
        liked_ids = [str(r[0]) for r in liked_rows]
    except Exception as e:
        logging.error(f"관심목록 DB 조회 오류: {e}")
        liked_ids = []

    # ── DB에서 최근 본 매물 ID 조회 ─────────────────────────────────
    try:
        with engine.connect() as conn:
            recent_rows = conn.execute(
                text('SELECT code FROM user_recent WHERE user_idx=:uid ORDER BY viewed_at DESC LIMIT 50'),
                {'uid': uid}
            ).fetchall()
        recent_ids = [str(r[0]) for r in recent_rows]
    except Exception as e:
        logging.error(f"최근 본 매물 DB 조회 오류: {e}")
        recent_ids = []

    # ── 매물 미리보기 DB 조회 (중복 제거 후 1회) ────────────────────
    merged_ids = list(dict.fromkeys(liked_ids + recent_ids))
    row_map = _fetch_previews(merged_ids)
    liked_props  = [row_map[i] for i in liked_ids  if i in row_map]
    recent_props = [row_map[i] for i in recent_ids if i in row_map]

    resp = make_response(render_template(
        'liked.html',
        liked=liked_props,
        recent=recent_props,
        active_tab=active_tab,
        is_guest=False
    ))
    resp.headers['Cache-Control'] = 'no-store'
    return resp


@bp.route('/liked')
def liked():
    """관심목록 페이지."""
    return _render_saved_properties_page(default_tab='liked')


@bp.route('/recent')
def recent_legacy():
    """구 URL /recent → /recents 302 리다이렉트."""
    return redirect('/recents', code=302)


@bp.route('/recents')
def recent():
    """최근 본 매물 페이지."""
    return _render_saved_properties_page(default_tab='recent')


@bp.route('/profile')
def profile():
    """내 프로필 페이지 — 로그인 사용자만 접근, 미로그인 시 로그인 페이지로"""
    if 'user_idx' not in session:
        # 로그인 후 다시 이 페이지로 돌아올 수 있도록 next_url 저장
        session['next_url'] = url_for('main.profile')
        return redirect(url_for('main.login_page'))
    uid = session['user_idx']
    # ── DB에서 찜/최근 본 매물 카운트 조회 ──────────────────────
    liked_count  = 0
    recent_count = 0
    try:
        with engine.connect() as conn:
            liked_count = conn.execute(
                text('SELECT COUNT(*) FROM user_liked WHERE user_idx=:uid'),
                {'uid': uid}
            ).scalar() or 0
            recent_count = conn.execute(
                text('SELECT COUNT(*) FROM user_recent WHERE user_idx=:uid'),
                {'uid': uid}
            ).scalar() or 0
    except Exception as e:
        logging.error(f"프로필 카운트 조회 오류: {e}")

    return render_template('profile.html',
                           user_name=session['user_name'],
                           user_profile=session['user_profile'],
                           liked_count=liked_count,
                           recent_count=recent_count)


@bp.route('/login')
def login_page():
    """소셜 로그인 선택 페이지"""
    # 이미 로그인된 경우 홈으로
    if 'user_idx' in session:
        return redirect(url_for('main.home'))
    error = request.args.get('error', '')
    return render_template('login.html', error=error)


@bp.route('/signup')
def signup_page():
    """일반 회원가입 페이지"""
    # 이미 로그인된 경우 홈으로
    if 'user_idx' in session:
        return redirect(url_for('main.home'))
    error = request.args.get('error', '')
    return render_template('signup.html', error=error)


@bp.route('/terms')
def terms_page():
    """이용약관 페이지"""
    return render_template('terms.html', **_policy_context())


@bp.route('/privacy')
def privacy_page():
    """개인정보처리방침 페이지"""
    return render_template('privacy.html', **_policy_context())

@bp.route('/feedback')
def feedback_page():
    """오류 제보/기능 제안 페이지"""
    return render_template('feedback_form.html', **_policy_context())

@bp.route('/feedback/submit', methods=['POST'])
def submit_feedback_form():
    """오류 제보/기능 제안 제출"""
    allowed, retry_after = check_rate_limit('feedback_submit', client_ip(), limit=8, window_sec=300)
    if not allowed:
        return jsonify({
            'success': False,
            'message': f'요청이 너무 많습니다. {retry_after}초 후 다시 시도해주세요.'
        }), 429

    form = request.form
    files = request.files.getlist('attachments')

    if _clean_text(form.get('website'), 100):
        return jsonify({'success': False, 'message': '비정상 요청입니다.'}), 400

    payload, error = _build_feedback_payload(form, files)
    if error:
        return jsonify({'success': False, 'message': error}), 400

    try:
        _ensure_feedback_table()
        visitor_ip = client_ip()  # security.py 유틸 활용
        ua = (request.user_agent.string or '')[:500]

        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO feedback_reports
                    (report_type, device_type, device_etc, browser_type, browser_etc,
                     page_url, error_description, feature_description, feature_reason,
                     reference_service, reference_service_etc, improvement_description,
                     attachments_json, name, phone, ip_address, user_agent)
                VALUES
                    (:report_type, :device_type, :device_etc, :browser_type, :browser_etc,
                     :page_url, :error_description, :feature_description, :feature_reason,
                     :reference_service, :reference_service_etc, :improvement_description,
                     :attachments_json, :name, :phone, :ip_address, :user_agent)
            """), {
                'report_type': payload['report_type'],
                'device_type': payload['device_type'],
                'device_etc': payload['device_etc'],
                'browser_type': payload['browser_type'],
                'browser_etc': payload['browser_etc'],
                'page_url': payload['page_url'],
                'error_description': payload['error_description'],
                'feature_description': payload['feature_description'],
                'feature_reason': payload['feature_reason'],
                'reference_service': payload['reference_service'],
                'reference_service_etc': payload['reference_service_etc'],
                'improvement_description': payload['improvement_description'],
                'attachments_json': payload['attachments_json'],
                'name': payload['name'],
                'phone': payload['phone'],
                'ip_address': visitor_ip,
                'user_agent': ua
            })
            conn.commit()

        admin_email = current_app.config.get('ADMIN_NOTIFY_EMAIL', '')
        mail_sent = False
        mail_error = None

        if admin_email:
            mail_sent, mail_error = send_plain_mail(
                current_app,
                payload['mail_subject'],
                payload['mail_body'],
                admin_email
            )
        else:
            mail_error = 'admin_email_missing'

        if not mail_sent:
            logging.warning(f"제보 접수 메일 전송 실패: {mail_error}")

        return jsonify({
            'success': True,
            'message': '소중한 의견 감사합니다. 접수가 완료되었습니다.',
            'mail_sent': mail_sent
        })
    except Exception as e:
        logging.exception(f"제보 접수 실패: {e}")
        return jsonify({'success': False, 'message': '접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'}), 500

@bp.route('/request')
def request_page():
    """집 구하기/내놓기 통합 요청 페이지"""
    # 디자인 수정이 즉시 반영되도록 HTML 문서는 캐시하지 않는다.
    response = make_response(render_template('request_form.html', **_policy_context()))
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

@bp.route('/request/submit', methods=['POST'])
def submit_request_form():
    """집 구하기/내놓기 요청 제출"""
    allowed, retry_after = check_rate_limit('request_submit', client_ip(), limit=8, window_sec=300)
    if not allowed:
        return jsonify({
            'success': False,
            'message': f'요청이 너무 많습니다. {retry_after}초 후 다시 시도해주세요.'
        }), 429

    form = request.get_json(silent=True) or request.form

    # 간단한 스팸 방지용 허니팟
    if _clean_text(form.get('website'), 100):
        return jsonify({'success': False, 'message': '비정상 요청입니다.'}), 400

    payload, error = _build_request_payload(form)
    if error:
        return jsonify({'success': False, 'message': error}), 400

    try:
        _ensure_house_request_table()
        visitor_ip = client_ip()  # security.py 유틸 활용
        ua = (request.user_agent.string or '')[:500]

        with engine.connect() as conn:
            conn.execute(text("""
                INSERT INTO house_request_forms
                    (request_type, name, phone, email, category, location_text, budget_text,
                     move_in_date, details, ip_address, user_agent)
                VALUES
                    (:request_type, :name, :phone, :email, :category, :location_text, :budget_text,
                     :move_in_date, :details, :ip_address, :user_agent)
            """), {
                'request_type': payload['request_type'],
                'name': payload['name'],
                'phone': payload['phone'],
                'email': payload['email'],
                'category': payload['category'],
                'location_text': payload['location_text'],
                'budget_text': payload['budget_text'],
                'move_in_date': payload['move_in_date'],
                'details': payload['details'],
                'ip_address': visitor_ip,
                'user_agent': ua
            })
            conn.commit()

        admin_email = current_app.config.get('ADMIN_NOTIFY_EMAIL', '')
        mail_sent = False
        mail_error = None

        if admin_email:
            mail_sent, mail_error = send_plain_mail(
                current_app,
                payload['mail_subject'],
                payload['mail_body'],
                admin_email
            )
        else:
            mail_error = 'admin_email_missing'

        if not mail_sent:
            logging.warning(f"요청 접수 메일 전송 실패: {mail_error}")

        return jsonify({
            'success': True,
            'message': '접수되었습니다. 빠르게 연락드리겠습니다.',
            'mail_sent': mail_sent
        })
    except Exception as e:
        logging.exception(f"요청 접수 실패: {e}")
        return jsonify({'success': False, 'message': '접수 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'}), 500

@bp.route('/compass')
def compass_page():
    """나침반 페이지"""
    return render_template('compass.html')


@bp.route('/about')
def about_page():
    """회사소개 페이지"""
    return render_template('about.html')


@bp.route('/map-list')
def property_list():
    """매물 목록 페이지 (지도화면 → 목록 이동용, 내부용)"""
    return render_template('property_list.html')

@bp.route('/list')
def browse():
    """리스트형 매물 검색 페이지 (하단 탭 → 리스트로 매물보기)"""
    return render_template('list_view.html')

@bp.route('/view/<code>')
def view_property(code):
    """매물 상세 페이지"""
    # 쿠키에서 liked 매물 리스트 파싱 (공통 헬퍼 사용)
    liked_list = _parse_ids_cookie(request.cookies.get('liked', ''))
    is_liked = str(code) in liked_list

    try:
        with engine.connect() as conn:
            # code로 매물 검색
            result = conn.execute(
                text("""
                    SELECT *
                    FROM sswp_maemul
                    WHERE code = :code
                      AND COALESCE(is_deleted, 0) = 0
                    LIMIT 1
                """),
                {'code': code}
            )
            property_data = result.fetchone()

            if not property_data:
                return f"매물번호 {code}를 찾을 수 없습니다.", 404

            # 딕셔너리로 변환
            property = dict(property_data._mapping)

            # ──────────────────────────────────────────────────────
            # 조회수 증가 처리 (IP + code + 오늘 날짜 중복 방지)
            # ──────────────────────────────────────────────────────
            # X-Forwarded-For 우선 사용 (Nginx → Flask 경유 시 실제 IP)
            visitor_ip = client_ip()  # security.py 유틸 활용

            dup_check = conn.execute(
                text("""
                    SELECT idx FROM sswp_maemul_analyzer
                    WHERE code  = :code
                      AND ip    = :ip
                      AND wdate >= CURDATE()
                      AND wdate <  CURDATE() + INTERVAL 1 DAY
                    LIMIT 1
                """),
                {'ip': visitor_ip, 'code': int(code)}
            ).fetchone()

            if not dup_check:
                # 천안하우스 공유 조회수 +1 업데이트
                conn.execute(
                    text('''
                        UPDATE sswp_maemul
                        SET see = see + 1
                        WHERE code = :code
                          AND COALESCE(is_deleted, 0) = 0
                    '''),
                    {'code': int(code)}
                )
                # 중복 방지 분석 테이블에 방문 기록 저장
                conn.execute(
                    text('INSERT INTO sswp_maemul_analyzer (ip, code, wdate) VALUES (:ip, :code, NOW())'),
                    {'ip': visitor_ip, 'code': int(code)}
                )

                # ✅ 집이지 독립 조회수 증가 (zibeasy_views — 천안하우스 동기화 무관)
                try:
                    conn.execute(
                        text("""
                            INSERT INTO zibeasy_views (code, z_see)
                            VALUES (:code, 1)
                            ON DUPLICATE KEY UPDATE z_see = z_see + 1
                        """),
                        {'code': int(code)}
                    )
                except Exception as zv_err:
                    logging.warning(f"zibeasy_views 업데이트 실패: {zv_err}")

                conn.commit()

                # property 딕셔너리에도 반영
                new_see = (property.get('see') or 0) + 1
                property['see'] = new_see

                # 천안하우스 서버로 조회수 역방향 동기화 - 백그라운드 스레드로 실행 (페이지 로딩 블로킹 방지)
                threading.Thread(
                    target=update_see_to_cheonan,
                    args=(int(code), new_see),
                    daemon=True  # 메인 프로세스 종료 시 스레드도 함께 종료
                ).start()

            # ℹ️ 접속 로그는 app/__init__.py after_request 미들웨어에서 통합 처리
            # ──────────────────────────────────────────────────────

            logging.info(f"매물 조회 성공: code={code}")

            property = _prepare_property_view_data(property)

            resp = make_response(render_template(
                'view.html',
                property=property,
                is_liked=is_liked,
                kakao_js_api_key=current_app.config.get('KAKAO_JS_API_KEY', '')
            ))

            # 최근 본 매물 DB 기록 (로그인 사용자만)
            if 'user_idx' in session:
                try:
                    current_code = str(property.get('code') or code)
                    with engine.begin() as conn:
                        # 있으면 viewed_at 갱신, 없으면 삽입
                        conn.execute(
                            text('''
                                INSERT INTO user_recent (user_idx, code, viewed_at)
                                VALUES (:uid, :code, NOW())
                                ON DUPLICATE KEY UPDATE viewed_at = NOW()
                            '''),
                            {'uid': session['user_idx'], 'code': current_code}
                        )
                        # 50개 초과 시 오래된 것 삭제
                        conn.execute(
                            text('''
                                DELETE FROM user_recent
                                WHERE user_idx = :uid
                                  AND idx NOT IN (
                                      SELECT idx FROM (
                                          SELECT idx FROM user_recent
                                          WHERE user_idx = :uid
                                          ORDER BY viewed_at DESC
                                          LIMIT 50
                                      ) sub
                                  )
                            '''),
                            {'uid': session['user_idx']}
                        )
                except Exception as e:
                    logging.error(f"최근 본 매물 기록 오류: {e}")

            return resp

    except Exception as e:
        logging.error(f"매물 조회 오류: {str(e)}")
        return "요청을 처리하는 중 오류가 발생했습니다.", 500


@bp.route('/view/<code>/photos')
def view_property_photos(code):
    """매물 사진 전용 페이지."""
    try:
        with engine.connect() as conn:
            result = conn.execute(
                text("""
                    SELECT *
                    FROM sswp_maemul
                    WHERE code = :code
                      AND COALESCE(is_deleted, 0) = 0
                    LIMIT 1
                """),
                {'code': code}
            )
            property_data = result.fetchone()

        if not property_data:
            return f"매물번호 {code}를 찾을 수 없습니다.", 404

        property = _prepare_property_view_data(dict(property_data._mapping))
        return render_template('view_photos.html', property=property)

    except Exception as e:
        logging.error(f"매물 사진 페이지 조회 오류: {str(e)}")
        return "요청을 처리하는 중 오류가 발생했습니다.", 500


def _add_public_money_details(property):
    """관리비 상세 정보 추가 (public_money는 호출 전 이미 만원 단위 정수로 변환됨)"""
    if property['public_money'] < 10:
        property['public_money_detail'] = False
        return

    property['public_money_detail'] = True
    public_type = property.get('public_money1', '')
    
    # 기본값 설정
    details = {
        'main': "5만원",
        'electric': "사용량에 따른 별도 부과",
        'gas': "사용량에 따른 별도 부과",
        'heat': "사용량에 따른 별도 부과",
        'water': "사용량에 따른 별도 부과",
        'tv': "사용량에 따른 별도 부과",
        'internet': "사용량에 따른 별도 부과",
        'etc': f"{property['public_money'] - 5}만원"
    }
    
    # 타입별 설정
    if public_type == "유선/수도/인터넷포함":
        details.update({
            'water': "1만원",
            'tv': "1만원",
            'internet': "1만원",
            'etc': f"{property['public_money'] - 8}만원"
        })
    elif public_type == "유선/수도포함":
        details.update({
            'water': "1만원",
            'tv': "1만원",
            'etc': f"{property['public_money'] - 7}만원"
        })
    elif public_type == "모든공과금포함":
        details.update({
            'main': "3만원",
            'electric': "1만원",
            'gas': "1만원",
            'heat': "1만원",
            'water': "1만원",
            'tv': "1만원",
            'internet': "1만원",
            'etc': f"{property['public_money'] - 9}만원"
        })
    elif public_type == "유선포함":
        details.update({
            'tv': "1만원",
            'internet': "1만원",
            'etc': f"{property['public_money'] - 7}만원"
        })
    
    # property에 추가
    for key, value in details.items():
        property[f'public_money_{key}'] = value
