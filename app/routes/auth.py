"""
사용자 로그인 라우트
- 카카오 OAuth 2.0
- 네이버 OAuth 2.0
- 일반 회원가입 (이메일 + 비밀번호)
- 일반 로그인 (이메일 또는 기존 아이디 + 비밀번호)
- 로그아웃
- 현재 로그인 사용자 정보 API
"""
import os
import re
import secrets
import urllib.parse

import requests
from flask import (Blueprint, redirect, request, session,
                   url_for, jsonify, render_template)
from werkzeug.security import generate_password_hash, check_password_hash

from app.models import engine
from app.security import check_rate_limit, client_ip
from sqlalchemy import text

bp = Blueprint('auth', __name__, url_prefix='/auth')

# ── 환경변수 ────────────────────────────────────────────────────
KAKAO_REST_KEY     = os.environ.get('KAKAO_REST_API_KEY', '')
KAKAO_CLIENT_SECRET = os.environ.get('KAKAO_CLIENT_SECRET', '')  # 클라이언트 시크릿 (활성화 시 필수)
NAVER_CLIENT_ID    = os.environ.get('NAVER_CLIENT_ID', '')
NAVER_SECRET       = os.environ.get('NAVER_CLIENT_SECRET', '')

# ── 카카오 OAuth 엔드포인트 ──────────────────────────────────────
KAKAO_AUTH_URL  = 'https://kauth.kakao.com/oauth/authorize'
KAKAO_TOKEN_URL = 'https://kauth.kakao.com/oauth/token'
KAKAO_USER_URL  = 'https://kapi.kakao.com/v2/user/me'

# ── 네이버 OAuth 엔드포인트 ─────────────────────────────────────
NAVER_AUTH_URL  = 'https://nid.naver.com/oauth2.0/authorize'
NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token'
NAVER_USER_URL  = 'https://openapi.naver.com/v1/nid/me'

# ── 일반 회원가입 유효성 검사 정규식 ─────────────────────────────
_EMAIL_RE    = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')  # 기본 이메일 형식


def _normalize_email(value: str) -> str:
    """이메일 비교/저장을 위해 소문자 기준으로 정규화."""
    return (value or '').strip().lower()


def _default_nickname_from_email(email: str) -> str:
    """이메일 가입자의 기본 표시 이름."""
    local_part = (email or '').split('@', 1)[0].strip()
    return (local_part or email or '사용자')[:30]


def _get_redirect_uri(provider: str) -> str:
    """배포 환경과 로컬 환경 모두 지원하는 callback URI 반환"""
    return url_for(f'auth.{provider}_callback', _external=True)


def _upsert_user(kakao_id=None, naver_id=None,
                 nickname='', profile_img=None, email=None) -> dict:
    """
    users 테이블에 소셜 계정 upsert 후 세션용 사용자 dict 반환.
    카카오/네이버 ID 중 하나만 넘어오므로 기존 계정이 있으면 업데이트.
    """
    with engine.begin() as conn:
        if kakao_id:
            row = conn.execute(
                text('SELECT idx, nickname, profile_img FROM users WHERE kakao_id = :kid'),
                {'kid': kakao_id}
            ).fetchone()
            if row:
                # 기존 계정 — last_login 갱신
                conn.execute(
                    text('UPDATE users SET last_login=NOW(), nickname=:n, profile_img=:p WHERE kakao_id=:kid'),
                    {'n': nickname, 'p': profile_img, 'kid': kakao_id}
                )
                return {'idx': row[0], 'name': nickname, 'profile': profile_img}
            else:
                # 신규 계정 생성
                result = conn.execute(
                    text('INSERT INTO users (kakao_id, nickname, profile_img, email, last_login) '
                         'VALUES (:kid, :n, :p, :e, NOW())'),
                    {'kid': kakao_id, 'n': nickname, 'p': profile_img, 'e': email}
                )
                return {'idx': result.lastrowid, 'name': nickname, 'profile': profile_img}

        elif naver_id:
            row = conn.execute(
                text('SELECT idx, nickname, profile_img FROM users WHERE naver_id = :nid'),
                {'nid': naver_id}
            ).fetchone()
            if row:
                conn.execute(
                    text('UPDATE users SET last_login=NOW(), nickname=:n, profile_img=:p WHERE naver_id=:nid'),
                    {'n': nickname, 'p': profile_img, 'nid': naver_id}
                )
                return {'idx': row[0], 'name': nickname, 'profile': profile_img}
            else:
                result = conn.execute(
                    text('INSERT INTO users (naver_id, nickname, profile_img, email, last_login) '
                         'VALUES (:nid, :n, :p, :e, NOW())'),
                    {'nid': naver_id, 'n': nickname, 'p': profile_img, 'e': email}
                )
                return {'idx': result.lastrowid, 'name': nickname, 'profile': profile_img}


def _set_user_session(user: dict):
    """로그인 성공 후 세션에 사용자 정보 저장"""
    session['user_idx']      = user['idx']
    session['user_name']     = user['name']
    session['user_profile']  = user.get('profile') or ''
    session['user_login_type'] = user.get('login_type', 'email')  # kakao / naver / email
    session.permanent = True  # 브라우저 닫아도 세션 유지


# ── 카카오 로그인 ─────────────────────────────────────────────

@bp.route('/kakao')
def kakao_login():
    """카카오 OAuth 인증 페이지로 리다이렉트"""
    redirect_uri = _get_redirect_uri('kakao')
    params = {
        'client_id':    KAKAO_REST_KEY,
        'redirect_uri': redirect_uri,
        'response_type': 'code',
    }
    return redirect(f"{KAKAO_AUTH_URL}?{urllib.parse.urlencode(params)}")


@bp.route('/kakao/callback')
def kakao_callback():
    """카카오 인증 완료 후 콜백 처리"""
    code  = request.args.get('code')
    error = request.args.get('error')

    if error or not code:
        return redirect(url_for('main.login_page', error='kakao_cancel'))

    redirect_uri = _get_redirect_uri('kakao')

    # 1) code → access_token 교환 (client_secret 활성화 시 필수 포함)
    token_payload = {
        'grant_type':   'authorization_code',
        'client_id':    KAKAO_REST_KEY,
        'redirect_uri': redirect_uri,
        'code':         code,
    }
    if KAKAO_CLIENT_SECRET:
        token_payload['client_secret'] = KAKAO_CLIENT_SECRET

    token_res = requests.post(KAKAO_TOKEN_URL, data=token_payload, timeout=10)

    if not token_res.ok:
        # 카카오 토큰 교환 실패 — 정확한 에러를 로그에 기록
        import logging
        logging.error(
            f"[카카오] 토큰 교환 실패 | status={token_res.status_code} "
            f"| redirect_uri={redirect_uri} "
            f"| body={token_res.text[:500]}"
        )
        return redirect(url_for('main.login_page', error='kakao_token'))

    access_token = token_res.json().get('access_token')

    # 2) access_token → 사용자 정보 조회
    user_res = requests.get(KAKAO_USER_URL, headers={
        'Authorization': f'Bearer {access_token}'
    }, timeout=10)

    if not user_res.ok:
        return redirect(url_for('main.login_page', error='kakao_user'))

    data    = user_res.json()
    kakao_id    = str(data['id'])
    kakao_account = data.get('kakao_account', {})
    profile = kakao_account.get('profile', {})

    nickname    = profile.get('nickname', '카카오 사용자')
    profile_img = profile.get('profile_image_url', '')
    email       = kakao_account.get('email', '')

    # 3) DB upsert + 세션 저장
    user = _upsert_user(kakao_id=kakao_id, nickname=nickname,
                        profile_img=profile_img, email=email)
    user['login_type'] = 'kakao'  # 카카오 로그인 표시
    _set_user_session(user)

    # 4) 로그인 전 페이지로 복귀 (없으면 홈)
    next_url = session.pop('next_url', None) or url_for('main.home')
    return redirect(next_url)


# ── 네이버 로그인 ─────────────────────────────────────────────

@bp.route('/naver')
def naver_login():
    """네이버 OAuth 인증 페이지로 리다이렉트"""
    state = secrets.token_urlsafe(16)
    session['naver_state'] = state  # CSRF 방지용 state 저장

    redirect_uri = _get_redirect_uri('naver')
    params = {
        'response_type': 'code',
        'client_id':     NAVER_CLIENT_ID,
        'redirect_uri':  redirect_uri,
        'state':         state,
    }
    return redirect(f"{NAVER_AUTH_URL}?{urllib.parse.urlencode(params)}")


@bp.route('/naver/callback')
def naver_callback():
    """네이버 인증 완료 후 콜백 처리"""
    code  = request.args.get('code')
    state = request.args.get('state')
    error = request.args.get('error')

    # CSRF state 검증
    if error or not code or state != session.pop('naver_state', None):
        return redirect(url_for('main.login_page', error='naver_cancel'))

    redirect_uri = _get_redirect_uri('naver')

    # 1) code → access_token 교환
    token_res = requests.post(NAVER_TOKEN_URL, params={
        'grant_type':    'authorization_code',
        'client_id':     NAVER_CLIENT_ID,
        'client_secret': NAVER_SECRET,
        'redirect_uri':  redirect_uri,
        'code':          code,
        'state':         state,
    }, timeout=10)

    if not token_res.ok:
        return redirect(url_for('main.login_page', error='naver_token'))

    access_token = token_res.json().get('access_token')

    # 2) access_token → 사용자 정보 조회
    user_res = requests.get(NAVER_USER_URL, headers={
        'Authorization': f'Bearer {access_token}'
    }, timeout=10)

    if not user_res.ok:
        return redirect(url_for('main.login_page', error='naver_user'))

    resp    = user_res.json().get('response', {})
    naver_id    = str(resp.get('id', ''))
    nickname    = resp.get('name') or resp.get('nickname', '네이버 사용자')
    profile_img = resp.get('profile_image', '')
    email       = resp.get('email', '')

    # 3) DB upsert + 세션 저장
    user = _upsert_user(naver_id=naver_id, nickname=nickname,
                        profile_img=profile_img, email=email)
    user['login_type'] = 'naver'  # 네이버 로그인 표시
    _set_user_session(user)

    next_url = session.pop('next_url', None) or url_for('main.home')
    return redirect(next_url)


# ── 일반 회원가입 ──────────────────────────────────────────────

@bp.route('/register', methods=['POST'])
def register():
    """일반 회원가입 처리 (이메일 + 비밀번호)"""
    allowed, _ = check_rate_limit('auth_register', client_ip(), limit=5, window_sec=600)
    if not allowed:
        return redirect(url_for('main.signup_page', error='too_many_requests'))

    email            = _normalize_email(request.form.get('email', ''))
    password         = request.form.get('password', '')
    password_confirm = request.form.get('password_confirm', '')

    # ── 입력값 검증 ──────────────────────────────────────────
    if not _EMAIL_RE.match(email):
        return redirect(url_for('main.signup_page', error='invalid_email'))

    if len(password) < 8:
        return redirect(url_for('main.signup_page', error='invalid_password'))

    if password != password_confirm:
        return redirect(url_for('main.signup_page', error='password_mismatch'))

    # ── 중복 체크 (email / email을 username으로 쓰는 기존 데이터 포함) ──
    try:
        with engine.connect() as conn:
            dup_email = conn.execute(
                text('SELECT idx FROM users WHERE username = :login_id OR email = :email LIMIT 1'),
                {'login_id': email, 'email': email}
            ).fetchone()
            if dup_email:
                return redirect(url_for('main.signup_page', error='email_taken'))

        # ── 비밀번호 해싱 후 신규 계정 생성 ──────────────────
        pw_hash = generate_password_hash(password)
        nickname = _default_nickname_from_email(email)

        with engine.begin() as conn:
            result = conn.execute(
                text('INSERT INTO users (username, email, nickname, password, last_login) '
                     'VALUES (:u, :e, :n, :pw, NOW())'),
                {'u': email, 'e': email, 'n': nickname, 'pw': pw_hash}
            )
            user_idx = result.lastrowid

        # ── 자동 로그인 + 홈 리다이렉트 ──────────────────────
        _set_user_session({'idx': user_idx, 'name': nickname, 'profile': ''})
        next_url = session.pop('next_url', None) or url_for('main.home')
        return redirect(next_url)

    except Exception as e:
        import logging
        err_str = str(e)
        logging.error(f"회원가입 오류: {e}")
        # DB 유니크 제약 위반 (SELECT 체크 통과 후 동시 가입 등 엣지 케이스)
        if '1062' in err_str or 'Duplicate entry' in err_str:
            if 'username' in err_str or 'email' in err_str:
                return redirect(url_for('main.signup_page', error='email_taken'))
        return redirect(url_for('main.signup_page', error='server_error'))


# ── 일반 로그인 ───────────────────────────────────────────────

@bp.route('/login', methods=['POST'])
def email_login():
    """일반 로그인 처리 (이메일 또는 기존 아이디 + 비밀번호)"""
    allowed, _ = check_rate_limit('auth_login', client_ip(), limit=10, window_sec=300)
    if not allowed:
        return redirect(url_for('main.login_page', error='too_many_requests'))

    username = request.form.get('username', '').strip()
    normalized_email = _normalize_email(username)
    password = request.form.get('password', '')

    if not username or not password:
        return redirect(url_for('main.login_page', error='invalid_credentials'))

    try:
        with engine.connect() as conn:
            row = conn.execute(
                text('SELECT idx, nickname, profile_img, password, username, email FROM users '
                     'WHERE username = :login_id OR email = :email_id LIMIT 1'),
                {'login_id': username, 'email_id': normalized_email}
            ).fetchone()

        # ── 아이디 없거나 비밀번호 없는 계정(소셜 전용)이면 실패 ──
        if not row or not row[3]:
            return redirect(url_for('main.login_page', error='invalid_credentials'))

        # ── 비밀번호 검증 ────────────────────────────────────
        if not check_password_hash(row[3], password):
            return redirect(url_for('main.login_page', error='invalid_credentials'))

        # ── last_login 갱신 ──────────────────────────────────
        with engine.begin() as conn:
            conn.execute(
                text('UPDATE users SET last_login=NOW() WHERE idx=:idx'),
                {'idx': row[0]}
            )

        # ── 세션 저장 + 리다이렉트 ────────────────────────────
        _set_user_session({
            'idx':     row[0],
            'name':    row[1] or row[5] or row[4] or username,
            'profile': row[2] or '',
        })
        next_url = session.pop('next_url', None) or url_for('main.home')
        return redirect(next_url)

    except Exception as e:
        import logging
        logging.error(f"로그인 오류: {e}")
        return redirect(url_for('main.login_page', error='invalid_credentials'))


# ── 로그아웃 ─────────────────────────────────────────────────

@bp.route('/logout')
def logout():
    """사용자 세션 클리어 후 홈으로"""
    session.pop('user_idx',     None)
    session.pop('user_name',    None)
    session.pop('user_profile', None)
    return redirect(url_for('main.home'))


# ── 현재 사용자 정보 API ─────────────────────────────────────

@bp.route('/me')
def me():
    """현재 로그인 사용자 정보 JSON 반환 (프론트엔드용)"""
    if 'user_idx' not in session:
        return jsonify({'logged_in': False}), 200

    return jsonify({
        'logged_in': True,
        'idx':       session['user_idx'],
        'name':      session['user_name'],
        'profile':   session['user_profile'],
    })
