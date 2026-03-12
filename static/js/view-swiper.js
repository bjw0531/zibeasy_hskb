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
});
