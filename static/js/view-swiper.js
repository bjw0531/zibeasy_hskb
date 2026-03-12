/* ─────────────────────────────────────────────────────────────
   view-swiper.js — 매물 상세 이미지 스와이퍼 초기화
   상세 사진 클릭 시 사진 전용 페이지로 이동
   ───────────────────────────────────────────────────────────── */
import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.mjs';

document.addEventListener('DOMContentLoaded', () => {
    const totalSlidesEl = document.getElementById('total-slides');
    const currentSlideEl = document.getElementById('current-slide');
    const propertyCode = window.viewData?.code;
    const autoplayToggleBtn = document.getElementById('slide-autoplay-toggle');
    const autoplayPlayIconEl = document.getElementById('slide-autoplay-play-icon');
    const autoplayPauseIconEl = document.getElementById('slide-autoplay-pause-icon');
    const autoplayTextEl = document.getElementById('slide-autoplay-text');
    const AUTOPLAY_DELAY = 3000;
    let autoplayTimerId = null;
    let isAutoplayRunning = false;

    const swiper = new Swiper('.mySwiper', {
        loop: false,
        lazy: true,
        on: {
            init() {
                if (totalSlidesEl) totalSlidesEl.textContent = this.slides.length;
            },
            slideChange() {
                if (currentSlideEl) currentSlideEl.textContent = this.realIndex + 1;
            }
        }
    });

    function clearAutoplayTimer() {
        if (autoplayTimerId !== null) {
            window.clearTimeout(autoplayTimerId);
            autoplayTimerId = null;
        }
    }

    function updateAutoplayButton() {
        if (!autoplayToggleBtn) return;
        const isRunning = isAutoplayRunning;
        autoplayToggleBtn.setAttribute('aria-pressed', isRunning ? 'true' : 'false');
        autoplayToggleBtn.setAttribute('aria-label', isRunning ? '자동 슬라이드 일시정지' : '자동 슬라이드 재생');
        if (autoplayPlayIconEl) autoplayPlayIconEl.style.display = isRunning ? 'none' : 'block';
        if (autoplayPauseIconEl) autoplayPauseIconEl.style.display = isRunning ? 'block' : 'none';
        if (autoplayTextEl) autoplayTextEl.textContent = isRunning ? '자동 슬라이드 일시정지' : '자동 슬라이드 재생';
    }

    function stopAutoplay(resetToFirstSlide = false) {
        clearAutoplayTimer();
        isAutoplayRunning = false;

        if (resetToFirstSlide && swiper.slides.length > 0 && swiper.activeIndex !== 0) {
            swiper.slideTo(0);
        }

        updateAutoplayButton();
    }

    function scheduleNextAutoplayStep() {
        clearAutoplayTimer();

        if (!isAutoplayRunning || swiper.slides.length <= 1) {
            updateAutoplayButton();
            return;
        }

        autoplayTimerId = window.setTimeout(() => {
            if (!isAutoplayRunning) return;

            if (swiper.activeIndex >= swiper.slides.length - 1) {
                stopAutoplay(true);
                return;
            }

            swiper.slideNext();
            scheduleNextAutoplayStep();
        }, AUTOPLAY_DELAY);
    }

    function startAutoplay() {
        if (swiper.slides.length <= 1) {
            stopAutoplay(false);
            if (autoplayToggleBtn) autoplayToggleBtn.hidden = true;
            return;
        }

        isAutoplayRunning = true;
        updateAutoplayButton();
        scheduleNextAutoplayStep();
    }

    /* 계약완료 매물은 사진 클릭 차단 */
    const isContractCompleted = window.viewData?.contract === '계약완료';

    document.querySelectorAll('.mySwiper .swiper-slide img').forEach((imgEl) => {
        imgEl.style.cursor = isContractCompleted ? 'default' : 'pointer';
        if (isContractCompleted) return; /* 클릭 이벤트 등록 안 함 */
        imgEl.addEventListener('click', () => {
            if (!propertyCode) return;
            window.location.href = `/view/${encodeURIComponent(propertyCode)}/photos`;
        });
    });

    if (totalSlidesEl && !totalSlidesEl.textContent) {
        totalSlidesEl.textContent = swiper.slides.length;
    }

    if (autoplayToggleBtn) {
        autoplayToggleBtn.hidden = isContractCompleted || swiper.slides.length <= 1;
        autoplayToggleBtn.addEventListener('click', () => {
            if (isAutoplayRunning) {
                stopAutoplay(false);
                return;
            }

            startAutoplay();
        });
    }

    swiper.on('touchStart', () => {
        if (isAutoplayRunning) {
            stopAutoplay(false);
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && isAutoplayRunning) {
            stopAutoplay(false);
        }
    });

    window.addEventListener('pagehide', () => {
        stopAutoplay(false);
    });

    if (!isContractCompleted && swiper.slides.length > 1) {
        startAutoplay();
    } else {
        updateAutoplayButton();
    }
});
