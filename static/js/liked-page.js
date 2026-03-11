/**
 * liked-page.js — 관심목록/최근 본 매물 통합 탭 페이지 UI 로직
 *
 * - 탭 전환 (관심목록 ↔ 최근 본 매물)
 * - 찜 해제 / 최근 본 개별삭제 / 전체삭제 (DB API 호출)
 * - 쿠키/localStorage 의존 제거 (DB 기반으로 전환)
 */
(function () {
  'use strict';

  var body = document.body;
  if (!body) return;

  var tabLiked     = document.getElementById('tab-liked');
  var tabRecent    = document.getElementById('tab-recent');
  var likedBadge   = document.getElementById('liked-tab-cnt');
  var recentBadge  = document.getElementById('recent-tab-cnt');
  var tabIndicator = document.getElementById('tab-indicator');

  var panelLiked  = document.getElementById('panel-liked');
  var panelRecent = document.getElementById('panel-recent');
  var heroLiked   = document.getElementById('hero-copy-liked');
  var heroRecent  = document.getElementById('hero-copy-recent');

  var clearBtn        = document.getElementById('btn-clear-recent');
  var swipeResetTimer = null;

  function normalizeTab(tab) {
    return tab === 'recent' ? 'recent' : 'liked';
  }

  function getInitialTab() {
    var fromData   = normalizeTab((body.dataset && body.dataset.activeTab) || 'liked');
    var params     = new URLSearchParams(location.search);
    var fromQuery  = params.get('tab');

    if (fromQuery === 'recent' || fromQuery === 'liked') return normalizeTab(fromQuery);
    if (location.pathname.indexOf('/recents') === 0) return 'recent';
    return fromData;
  }

  var activeTab = getInitialTab();

  function tabUrl(tab) {
    var t    = normalizeTab(tab);
    var next = new URL(location.href);
    next.pathname = '/liked';
    if (t === 'recent') next.searchParams.set('tab', 'recent');
    else next.searchParams.delete('tab');
    return next.pathname + (next.search || '');
  }

  function setButtonState(btn, badge, isActive) {
    if (!btn) return;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    if (badge) badge.classList.toggle('active', isActive);
  }

  function toggleHidden(el, isHidden) {
    if (!el) return;
    el.classList.toggle('is-hidden', isHidden);
  }

  function setActiveTab(tab, options) {
    var opts    = options || {};
    var nextTab = normalizeTab(tab);

    if (!opts.force && nextTab === activeTab) return;
    activeTab = nextTab;

    body.dataset.activeTab = activeTab;
    body.classList.toggle('tab-liked-active',  activeTab === 'liked');
    body.classList.toggle('tab-recent-active', activeTab === 'recent');

    setButtonState(tabLiked,  likedBadge,  activeTab === 'liked');
    setButtonState(tabRecent, recentBadge, activeTab === 'recent');

    toggleHidden(panelLiked,  activeTab !== 'liked');
    toggleHidden(panelRecent, activeTab !== 'recent');
    toggleHidden(heroLiked,   activeTab !== 'liked');
    toggleHidden(heroRecent,  activeTab !== 'recent');

    if (opts.bySwipe) applySwipeAnimClass(opts.swipeDir);
    if (opts.updateHistory !== false) history.replaceState({ tab: activeTab }, '', tabUrl(activeTab));

    positionIndicator();
  }

  function applySwipeAnimClass(dir) {
    if (swipeResetTimer) { clearTimeout(swipeResetTimer); swipeResetTimer = null; }
    body.classList.remove('tab-swipe-left', 'tab-swipe-right');
    if (dir === 'left')  body.classList.add('tab-swipe-left');
    if (dir === 'right') body.classList.add('tab-swipe-right');
    swipeResetTimer = setTimeout(function () {
      body.classList.remove('tab-swipe-left', 'tab-swipe-right');
      swipeResetTimer = null;
    }, 240);
  }

  function positionIndicator() {
    if (!tabIndicator || !tabLiked || !tabRecent) return;
    var activeBtn = activeTab === 'recent' ? tabRecent : tabLiked;
    var barRect   = tabIndicator.parentElement.getBoundingClientRect();
    var btnRect   = activeBtn.getBoundingClientRect();
    tabIndicator.style.left  = (btnRect.left - barRect.left) + 'px';
    tabIndicator.style.width = btnRect.width + 'px';
  }

  if (tabLiked)  tabLiked.addEventListener('click',  function () { setActiveTab('liked'); });
  if (tabRecent) tabRecent.addEventListener('click', function () { setActiveTab('recent'); });
  window.addEventListener('resize', positionIndicator);

  /* ── 좌우 스와이프 탭 전환 ─────────────────────────────────── */
  function bindSwipeSwitch() {
    var shell = document.querySelector('.liked-content-shell');
    if (!shell || !window.PointerEvent) return;

    var startX = 0;
    var startY = 0;
    var startAt = 0;
    var tracking = false;
    var dragging = false;
    var activePointerId = null;
    var suppressClickUntil = 0;

    function canStart(target) {
      return target && !target.closest('button, input, textarea, select, label, .lv-heart-btn, .recent-delete-btn, .unlike-hidden');
    }

    function setDragOffset(dx) {
      var limited = Math.max(-84, Math.min(84, dx));
      body.style.setProperty('--tab-drag-offset', limited + 'px');
    }

    function clearDragState() {
      tracking = false;
      dragging = false;
      activePointerId = null;
      body.classList.remove('tab-dragging');
      body.style.removeProperty('--tab-drag-offset');
    }

    function finishGesture(endX, endY) {
      var dx = endX - startX;
      var dy = endY - startY;
      var adx = Math.abs(dx);
      var ady = Math.abs(dy);
      var elapsed = Date.now() - startAt;
      var switched = false;

      if (dragging && adx > 14) suppressClickUntil = Date.now() + 320;

      if (elapsed <= 650 && adx >= 52 && adx > ady * 1.15) {
        if (dx < 0 && activeTab === 'liked') {
          setActiveTab('recent', { bySwipe: true, swipeDir: 'left' });
          switched = true;
        } else if (dx > 0 && activeTab === 'recent') {
          setActiveTab('liked', { bySwipe: true, swipeDir: 'right' });
          switched = true;
        }
      }

      clearDragState();
      return switched;
    }

    shell.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!canStart(e.target)) return;

      startX = e.clientX;
      startY = e.clientY;
      startAt = Date.now();
      tracking = true;
      dragging = false;
      activePointerId = e.pointerId;

      try { shell.setPointerCapture(e.pointerId); } catch (err) {}
    });

    window.addEventListener('pointermove', function (e) {
      if (!tracking || e.pointerId !== activePointerId) return;

      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      var adx = Math.abs(dx);
      var ady = Math.abs(dy);

      if (!dragging) {
        if (adx < 8) return;
        if (adx <= ady * 1.05) return;
        dragging = true;
        body.classList.add('tab-dragging');
      }

      setDragOffset(dx);
    });

    function handlePointerEnd(e) {
      if (!tracking || e.pointerId !== activePointerId) return;
      finishGesture(e.clientX, e.clientY);
    }

    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    document.addEventListener('click', function (e) {
      if (Date.now() >= suppressClickUntil) return;
      if (!e.target.closest('.lv-card')) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
  }
  bindSwipeSwitch();

  function reloadCurrentTab() {
    location.replace(tabUrl(activeTab));
  }

  /* ── 관심목록: 찜 해제 (DB API) ──────────────────────────── */
  window.unlikeProperty = function (btn, id) {
    fetch('/api/user/liked/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ code: String(id) })
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (!d.success) return;
      /* 뱃지 카운트 즉시 감소 */
      if (likedBadge) {
        var cur = parseInt(likedBadge.textContent, 10) || 0;
        likedBadge.textContent = String(Math.max(0, cur - 1));
      }
      /* 카드 제거 애니메이션 후 리로드 */
      var card = btn ? btn.closest('.lv-card') : null;
      if (card) {
        card.classList.add('card-removing');
        setTimeout(reloadCurrentTab, 260);
      } else {
        reloadCurrentTab();
      }
    })
    .catch(function () { reloadCurrentTab(); });
  };

  /* ── 최근 본: 개별 삭제 (DB API) ─────────────────────────── */
  window.deleteRecent = function (id) {
    fetch('/api/user/recent/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ code: String(id) })
    })
    .then(function () { reloadCurrentTab(); })
    .catch(function () { reloadCurrentTab(); });
  };

  /* ── 최근 본: 전체 삭제 (DB API) ─────────────────────────── */
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      if (!confirm('최근 본 매물 기록을 모두 삭제할까요?')) return;
      fetch('/api/user/recent/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin'
      })
      .then(function () { reloadCurrentTab(); })
      .catch(function () { reloadCurrentTab(); });
    });
  }

  /* ── bfcache 복원 시 강제 재로드 ───────────────────────────── */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) location.reload();
  });

  /* ── 최근수정 상대시간 ─────────────────────────────────────── */
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

  /* ── 카드 클릭 -> 상세 이동 ────────────────────────────────── */
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.lv-card');
    if (!card || e.target.closest('.lv-heart-btn, .recent-delete-btn')) return;
    e.preventDefault();
    sessionStorage.setItem('navDirection', 'slide-right');
    sessionStorage.setItem('navFrom', 'liked');
    sessionStorage.setItem('fromListPage', 'true');
    var bn = document.querySelector('.bottom-nav');
    if (bn) bn.style.viewTransitionName = 'none';
    window.location.href = card.href;
  });

  setActiveTab(activeTab, { updateHistory: false, force: true });
})();
