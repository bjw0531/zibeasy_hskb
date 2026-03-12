/**
 * liked.js — 하트(좋아요) 기능
 *
 * 로그인 사용자: /api/user/liked/toggle API 호출로 DB 저장
 * 비로그인 사용자: 로그인 유도 토스트 표시
 */

/* ── 상태 변수 ── */
var _likedCache  = null;   /* 찜 코드 배열 캐시 (로그인 시) */
var _isLoggedIn  = false;  /* 로그인 상태 */
var _authChecked = false;  /* /auth/me 확인 완료 여부 */
var _pendingInit = false;  /* initLikedHearts 재실행 필요 플래그 */

/* ── 로그인 상태 초기화 (서버 주입 우선, 없으면 /auth/me 조회) ── */
(function detectLoginState() {
    if (typeof window.isLoggedIn !== 'undefined') {
        _isLoggedIn  = !!window.isLoggedIn;
        _authChecked = true;
        if (_isLoggedIn) _fetchLikedFromServer();
        return;
    }
    fetch('/auth/me', { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(d) {
            _isLoggedIn  = !!d.logged_in;
            _authChecked = true;
            if (_isLoggedIn) _fetchLikedFromServer();
            if (_pendingInit) { _pendingInit = false; initLikedHearts(); }
        })
        .catch(function() { _authChecked = true; });
})();

/* ── 서버에서 찜 목록 조회 후 하트 상태 갱신 ── */
function _fetchLikedFromServer() {
    fetch('/api/user/liked', { credentials: 'same-origin' })
        .then(function(r) { return r.json(); })
        .then(function(d) {
            if (d.success && Array.isArray(d.codes)) {
                _likedCache = d.codes.map(String);
                /* localStorage 동기화 → 하단 탭바 배지 갱신용 */
                localStorage.setItem('liked', JSON.stringify(_likedCache));
                _applyHeartState(_likedCache);
                window.dispatchEvent(new CustomEvent('likedUpdated'));
            }
        })
        .catch(function() {});
}

/* ── DOM 하트 상태 일괄 적용 ── */
function _applyHeartState(likedCodes) {
    document.querySelectorAll('[data-like-btn]').forEach(function(btn) {
        var id = String(btn.getAttribute('data-like-btn'));
        btn.classList.toggle('heart-liked',   likedCodes.indexOf(id) !== -1);
        btn.classList.toggle('heart-unliked', likedCodes.indexOf(id) === -1);
    });
}

/* ── 비로그인 시 로그인 유도 토스트 ── */
function _showLoginPrompt() {
    if (!document.getElementById('_likedToastStyle')) {
        var style = document.createElement('style');
        style.id = '_likedToastStyle';
        style.textContent = '@keyframes _lkFade{0%{opacity:0;transform:translateX(-50%) translateY(6px)}15%{opacity:1;transform:translateX(-50%)}80%{opacity:1}100%{opacity:0}}';
        document.head.appendChild(style);
    }
    var toast = document.createElement('div');
    toast.textContent = '로그인 후 이용할 수 있어요.';
    toast.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#222;color:#fff;padding:11px 20px;border-radius:24px;font-size:14px;z-index:9999;pointer-events:none;animation:_lkFade 2.2s ease forwards;white-space:nowrap;';
    document.body.appendChild(toast);
    setTimeout(function() { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 2200);
}

/* ── 찜 토글 (전역 노출) ── */
function toggleLike(id) {
    if (!_isLoggedIn) {
        _showLoginPrompt();
        return;
    }
    var strId = String(id);
    fetch('/api/user/liked/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ code: strId })
    })
    .then(function(r) { return r.json(); })
    .then(function(d) {
        if (!d.success) return;
        /* 캐시 업데이트 */
        if (!_likedCache) _likedCache = [];
        if (d.liked) {
            if (_likedCache.indexOf(strId) === -1) _likedCache.push(strId);
        } else {
            _likedCache = _likedCache.filter(function(c) { return c !== strId; });
        }
        /* localStorage 동기화 → 하단 탭바 배지 갱신용 */
        localStorage.setItem('liked', JSON.stringify(_likedCache));
        /* 하트 즉시 반영 */
        var btn = document.querySelector('[data-like-btn="' + strId + '"]');
        if (btn) {
            btn.classList.toggle('heart-liked',   d.liked);
            btn.classList.toggle('heart-unliked', !d.liked);
        }
        window.dispatchEvent(new CustomEvent('likedUpdated'));
    })
    .catch(function(err) { console.warn('[liked.js] 찜 토글 실패:', err); });
}

/* ── 초기화: 페이지 로드 시 하트 상태 적용 ── */
function initLikedHearts() {
    if (!_authChecked) { _pendingInit = true; return; }
    if (!_isLoggedIn)  { _applyHeartState([]); return; }
    if (_likedCache !== null) {
        _applyHeartState(_likedCache);
    } else {
        _fetchLikedFromServer();
    }
}

/* ── 레거시 호환 stub ── */
function getLikedList()  { return _likedCache || []; }
function saveLikedList() { /* DB 기반 전환 — stub */ }

document.addEventListener('DOMContentLoaded', initLikedHearts);
