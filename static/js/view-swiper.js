/* ─────────────────────────────────────────────────────────────
   view-swiper.js — 매물 상세 이미지 스와이퍼 초기화 (ES Module)
   Swiper CDN을 ESM import 방식으로 사용
   ───────────────────────────────────────────────────────────── */
import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.mjs';

document.addEventListener('DOMContentLoaded', () => {
    /* ── DOM 요소 캐싱 ── */
    const totalSlidesEl         = document.getElementById('total-slides');
    const currentSlideEl        = document.getElementById('current-slide');
    const photoViewerOverlay    = document.getElementById('photoViewerOverlay');
    const photoViewerCloseBtn   = document.getElementById('photoViewerCloseBtn');
    const photoViewerCurrentEl  = document.getElementById('photoViewerCurrent');
    const photoViewerTotalEl    = document.getElementById('photoViewerTotal');
    /* 뷰어 슬라이드 개수: init 이전에 DOM에서 미리 계산 */
    const photoViewerSlideCount =
        document.querySelectorAll('.photo-viewer-swiper .swiper-slide').length;

    /* ── 썸네일 스와이퍼 ── */
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

    /* ── 전체화면 뷰어 스와이퍼 (핀치 줌 지원) ── */
    const photoViewerSwiper = new Swiper('.photo-viewer-swiper', {
        loop: false,
        zoom: { maxRatio: 4, minRatio: 1, toggle: true },
        on: {
            init() {
                if (photoViewerTotalEl)
                    photoViewerTotalEl.textContent = this.slides.length || photoViewerSlideCount;
            },
            slideChange() {
                if (photoViewerCurrentEl)
                    photoViewerCurrentEl.textContent = this.realIndex + 1;
                /* 슬라이드 변경 시 줌 초기화 */
                if (this.zoom && this.zoom.scale !== 1) this.zoom.out();
            }
        }
    });

    /* 뷰어 총 슬라이드 수 초기 세팅 */
    if (photoViewerTotalEl) photoViewerTotalEl.textContent = photoViewerSlideCount;

    /* ── 전체화면 뷰어 열기 ── */
    function openPhotoViewer(startIndex) {
        if (!photoViewerOverlay || !photoViewerSwiper) return;
        photoViewerOverlay.classList.add('open');
        photoViewerOverlay.setAttribute('aria-hidden', 'false');
        document.body.style.overflow    = 'hidden';
        document.body.style.touchAction = 'none';
        photoViewerSwiper.update();
        photoViewerSwiper.slideTo(startIndex, 0);
        if (photoViewerCurrentEl) photoViewerCurrentEl.textContent = startIndex + 1;
        if (photoViewerTotalEl)
            photoViewerTotalEl.textContent = photoViewerSwiper.slides.length || photoViewerSlideCount;
        if (photoViewerSwiper.zoom && photoViewerSwiper.zoom.scale !== 1)
            photoViewerSwiper.zoom.out();
    }

    /* ── 전체화면 뷰어 닫기 ── */
    function closePhotoViewer() {
        if (!photoViewerOverlay || !photoViewerSwiper) return;
        photoViewerOverlay.classList.remove('open');
        photoViewerOverlay.setAttribute('aria-hidden', 'true');
        if (photoViewerSwiper.zoom && photoViewerSwiper.zoom.scale !== 1)
            photoViewerSwiper.zoom.out();
        document.body.style.overflow    = '';
        document.body.style.touchAction = '';
    }

    /* ── 이벤트 바인딩 ── */
    if (photoViewerCloseBtn)
        photoViewerCloseBtn.addEventListener('click', closePhotoViewer);

    /* ESC 키로 뷰어 닫기 */
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && photoViewerOverlay?.classList.contains('open'))
            closePhotoViewer();
    });

    /* 썸네일 클릭 시 해당 인덱스로 뷰어 열기 */
    document.querySelectorAll('.mySwiper .swiper-slide img').forEach((imgEl, index) => {
        imgEl.style.cursor = 'zoom-in';
        imgEl.addEventListener('click', () => openPhotoViewer(index));
    });
});
