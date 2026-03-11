/**
 * 재사용 가능한 전역 로딩 스피너
 *
 * 사용법:
 *   1. CSS/JS 포함:
 *      <link rel="stylesheet" href="/static/css/loading-spinner.css">
 *      <script src="/static/js/loading-spinner.js"></script>
 *
 *   2. API 호출:
 *      LoadingSpinner.show()           — 스피너 표시
 *      LoadingSpinner.show('문구')     — 서브 텍스트 변경 후 표시
 *      LoadingSpinner.hide()           — 즉시 페이드 아웃
 *      LoadingSpinner.hide(300)        — 300ms 후 페이드 아웃
 *
 * 동작 방식:
 *   - HTML에 <div id="global-loading-overlay"> 가 이미 있으면 그것을 사용
 *   - 없으면 DOM에 자동 생성
 *
 * 의존성:
 *   - loading-spinner.css
 */
var LoadingSpinner = (function () {
    'use strict';

    /* 오버레이 요소 ID */
    var OVERLAY_ID = 'global-loading-overlay';

    /* 숨기기 타이머 핸들 (중복 호출 방지) */
    var hideTimer = null;

    /* ── 오버레이 DOM 생성 (HTML에 직접 삽입되지 않은 경우) ── */
    function createOverlay() {
        if (document.getElementById(OVERLAY_ID)) return;

        var el = document.createElement('div');
        el.id = OVERLAY_ID;
        /* 링 스피너만 표시 (텍스트 없음 — 여러 페이지에서 범용 사용) */
        el.innerHTML = '<div class="gls-ring"></div>';

        /* body 준비 여부에 따라 즉시 삽입 또는 이벤트 대기 */
        if (document.body) {
            document.body.appendChild(el);
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                document.body.appendChild(el);
            });
        }
    }

    /* ── 오버레이 요소 반환 ── */
    function getOverlay() {
        return document.getElementById(OVERLAY_ID);
    }

    return {
        /**
         * 스피너 표시
         * @param {string} [text] - 변경할 서브 텍스트 (생략 시 기존 텍스트 유지)
         */
        show: function (text) {
            /* 진행 중인 숨기기 타이머 취소 */
            clearTimeout(hideTimer);

            var el = getOverlay();
            if (!el) {
                createOverlay();
                el = getOverlay();
                if (!el) return;
            }

            /* 서브 텍스트 변경 (요청 시) */
            if (text) {
                var textEl = el.querySelector('.gls-text');
                if (textEl) textEl.textContent = text;
            }

            el.classList.remove('is-hiding');
            el.style.display = 'flex';
        },

        /**
         * 스피너 숨기기 (페이드 아웃)
         * @param {number} [delay=0] - 숨기기 전 대기 시간(ms)
         */
        hide: function (delay) {
            var el = getOverlay();
            if (!el) return;

            clearTimeout(hideTimer);
            hideTimer = setTimeout(function () {
                /* 페이드 아웃 시작 */
                el.classList.add('is-hiding');

                /* CSS transition(0.45s) 완료 후 display:none 처리 */
                setTimeout(function () {
                    if (el.classList.contains('is-hiding')) {
                        el.style.display = 'none';
                    }
                }, 500);
            }, delay || 0);
        }
    };
})();
