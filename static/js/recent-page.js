/**
 * recent-page.js — 최근 본 매물 페이지(/recent) UI 로직
 *
 * 탭 인디케이터 위치, 개별/전체 삭제, bfcache 대응,
 * 카드 클릭 슬라이드 이동
 */
(function () {
  'use strict';

  /* ── 탭 이동 헬퍼 (HTML onclick에서도 사용) ─────────────────── */
  window.tabNav = function (url, direction) {
    sessionStorage.setItem('navDirection', direction);
    window.location.href = url;
  };

  /* ── 탭 인디케이터: 최근 본 매물 탭 위치에 고정 ─────────────── */
  var tabRecent    = document.getElementById('tab-recent');
  var tabIndicator = document.getElementById('tab-indicator');

  function positionIndicator() {
    if (!tabIndicator || !tabRecent) return;
    var barRect = tabIndicator.parentElement.getBoundingClientRect();
    var btnRect = tabRecent.getBoundingClientRect();
    tabIndicator.style.left  = (btnRect.left - barRect.left) + 'px';
    tabIndicator.style.width = btnRect.width + 'px';
  }
  positionIndicator();
  window.addEventListener('resize', positionIndicator);

  /* ── 쿠키 헬퍼 ───────────────────────────────────────────────── */
  function getCookieIds(name) {
    var match = document.cookie.match(new RegExp('(?:^| )' + name + '=([^;]+)'));
    if (!match) return [];
    try { return JSON.parse(decodeURIComponent(match[1])); } catch (e) { return []; }
  }

  function setCookieIds(name, ids, maxAge) {
    document.cookie = name + '=' + encodeURIComponent(JSON.stringify(ids))
      + '; path=/; max-age=' + (maxAge || 31536000);
  }

  /* ── localStorage ID 읽기 (웹뷰 폴백용) ─────────────────────── */
  function getLocalIds(name, maxLen) {
    try {
      var raw = localStorage.getItem(name);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var out = [], seen = Object.create(null);
      for (var i = 0; i < parsed.length; i++) {
        var s = String(parsed[i] || '').trim();
        if (!s || s === 'undefined' || s === 'null' || seen[s]) continue;
        seen[s] = true;
        out.push(s);
        if (maxLen && out.length >= maxLen) break;
      }
      return out;
    } catch (e) { return []; }
  }

  /* ── 웹뷰 폴백: 쿠키 없으면 localStorage → ?recent_ls= 로 복구 ── */
  function recoverSSRFromLocalStorage() {
    var hasCard = !!document.querySelector('.lv-card');
    if (hasCard) {
      try { sessionStorage.removeItem('recent_ssr_recover_tried'); } catch (e) {}
      return;
    }
    var params = new URLSearchParams(location.search);
    if (params.has('recent_ls')) return;

    var ids = getLocalIds('recentViewed', 50);
    if (!ids.length) return;

    var tried = false;
    try { tried = sessionStorage.getItem('recent_ssr_recover_tried') === '1'; } catch (e) {}
    if (tried) return;
    try { sessionStorage.setItem('recent_ssr_recover_tried', '1'); } catch (e) {}

    var next = new URL('/recents', location.origin);
    next.searchParams.set('recent_ls', JSON.stringify(ids));
    location.replace(next.toString());
  }
  recoverSSRFromLocalStorage();

  /* ── 개별 삭제 ────────────────────────────────────────────────── */
  window.deleteRecent = function (id) {
    var recent = getCookieIds('recentViewed');
    recent = recent.filter(function (v) { return String(v) !== String(id); });
    setCookieIds('recentViewed', recent, 2592000); /* 30일 */
    localStorage.setItem('recentViewed', JSON.stringify(recent));
    location.reload();
  };

  /* ── 전체 삭제 버튼 ───────────────────────────────────────────── */
  var clearBtn = document.getElementById('btn-clear-recent');
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (!confirm('최근 본 매물 기록을 모두 삭제할까요?')) return;
      document.cookie = 'recentViewed=; path=/; max-age=0';
      localStorage.removeItem('recentViewed');
      location.reload();
    });
  }

  /* ── bfcache 복원 시 강제 재로드 ─────────────────────────────── */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) location.reload();
  });

  /* ── 최근수정 시간 상대 표시 ─────────────────────────────────── */
  function formatRelativeLdate(dateStr) {
    if (!dateStr) return '확인필요';
    try {
      var date = new Date(String(dateStr).replace(' ', 'T') + '+09:00');
      if (isNaN(date.getTime())) return '확인필요';
      var sec = Math.floor((new Date() - date) / 1000);
      if (sec < 60)  return '방금 전';
      var min = Math.floor(sec / 60);
      if (min < 60)  return min + '분 전';
      var hour = Math.floor(sec / 3600);
      if (hour < 24) return hour + '시간 전';
      var day = Math.floor(sec / 86400);
      if (day < 30)  return day + '일 전';
      return '확인필요';
    } catch (e) { return '확인필요'; }
  }

  function renderRelativeLdate() {
    document.querySelectorAll('.js-relative-ldate').forEach(function (el) {
      var t = formatRelativeLdate(el.dataset.ldate || '');
      el.textContent = t;
      el.classList.toggle('needs-check', t === '확인필요');
    });
  }
  renderRelativeLdate();

  /* ── 카드 클릭 → 상세 페이지 슬라이드 이동 ──────────────────── */
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.lv-card');
    if (!card || e.target.closest('.recent-delete-btn')) return;
    e.preventDefault();
    sessionStorage.setItem('navDirection', 'slide-right');
    sessionStorage.setItem('navFrom', 'liked');
    sessionStorage.setItem('fromListPage', 'true');
    /* bottom-nav를 root 스냅샷에 포함 → contact-bar와 함께 슬라이드 */
    var bn = document.querySelector('.bottom-nav');
    if (bn) bn.style.viewTransitionName = 'none';
    window.location.href = card.href;
  });


})();
