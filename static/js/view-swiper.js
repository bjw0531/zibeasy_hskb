/* ─────────────────────────────────────────────────────────────
   view-swiper.js — 매물 상세 이미지 스와이퍼 초기화
   상세 사진 클릭 시 사진 전용 페이지로 이동
   ───────────────────────────────────────────────────────────── */
import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.mjs';

document.addEventListener('DOMContentLoaded', () => {
    const totalSlidesEl = document.getElementById('total-slides');
    const currentSlideEl = document.getElementById('current-slide');
    const propertyCode = window.viewData?.code;

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

    document.querySelectorAll('.mySwiper .swiper-slide img').forEach((imgEl) => {
        imgEl.style.cursor = 'pointer';
        imgEl.addEventListener('click', () => {
            if (!propertyCode) return;
            window.location.href = `/view/${encodeURIComponent(propertyCode)}/photos`;
        });
    });

    if (totalSlidesEl && !totalSlidesEl.textContent) {
        totalSlidesEl.textContent = swiper.slides.length;
    }
});
