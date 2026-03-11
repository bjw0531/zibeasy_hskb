import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.mjs';

document.addEventListener('DOMContentLoaded', () => {
    const photoCards = Array.from(document.querySelectorAll('[data-photo-card]'));
    const viewer = document.getElementById('photoStoryViewer');
    const viewerCloseBtn = document.getElementById('photoStoryViewerClose');
    const viewerCurrentEl = document.getElementById('photoStoryViewerCurrent');
    const viewerTotalEl = document.getElementById('photoStoryViewerTotal');
    let viewerHistoryPushed = false;
    let unlockTimer = null;

    document.querySelectorAll('.detail-contact-bar, .bottom-nav').forEach((element) => {
        element.style.display = 'none';
    });

    if (viewerTotalEl) {
        viewerTotalEl.textContent = String(window.viewPhotosData?.totalPhotos || photoCards.length || 0);
    }

    photoCards.forEach((card, index) => {
        window.setTimeout(() => {
            card.classList.add('is-visible');
        }, index * 90);
    });

    const viewerSwiper = new Swiper('.photo-story-viewer-swiper', {
        loop: false,
        zoom: { maxRatio: 4, minRatio: 1, toggle: true },
        on: {
            init() {
                if (viewerTotalEl) viewerTotalEl.textContent = String(this.slides.length);
            },
            slideChange() {
                if (viewerCurrentEl) viewerCurrentEl.textContent = String(this.realIndex + 1);
                if (this.zoom && this.zoom.scale !== 1) this.zoom.out();
            }
        }
    });

    function lockBodyScroll() {
        if (unlockTimer) {
            clearTimeout(unlockTimer);
            unlockTimer = null;
        }
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
    }

    function unlockBodyScroll() {
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
    }

    function openViewer(startIndex) {
        if (!viewer) return;
        lockBodyScroll();
        viewer.setAttribute('aria-hidden', 'false');
        viewerSwiper.update();
        viewerSwiper.slideTo(startIndex, 0);
        if (viewerCurrentEl) viewerCurrentEl.textContent = String(startIndex + 1);
        if (!viewerHistoryPushed) {
            history.pushState({ photoViewer: true }, '', window.location.href);
            viewerHistoryPushed = true;
        }
        requestAnimationFrame(() => {
            viewer.classList.add('open');
        });
    }

    function closeViewer() {
        if (!viewer) return;
        viewer.classList.remove('open');
        viewer.setAttribute('aria-hidden', 'true');
        if (viewerSwiper.zoom && viewerSwiper.zoom.scale !== 1) viewerSwiper.zoom.out();
        unlockTimer = window.setTimeout(() => {
            unlockBodyScroll();
            unlockTimer = null;
        }, 260);
    }

    function requestCloseViewer() {
        if (!viewer?.classList.contains('open')) return;
        if (viewerHistoryPushed) {
            history.back();
            return;
        }
        closeViewer();
    }

    photoCards.forEach((card) => {
        card.addEventListener('click', () => {
            const startIndex = Number(card.dataset.photoIndex || 0);
            openViewer(startIndex);
        });
    });

    if (viewerCloseBtn) {
        viewerCloseBtn.addEventListener('click', requestCloseViewer);
    }

    if (viewer) {
        viewer.addEventListener('click', (event) => {
            if (event.target === viewer) requestCloseViewer();
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && viewer?.classList.contains('open')) {
            requestCloseViewer();
        }
    });

    window.addEventListener('popstate', () => {
        if (!viewerHistoryPushed || !viewer?.classList.contains('open')) return;
        viewerHistoryPushed = false;
        closeViewer();
    });
});
