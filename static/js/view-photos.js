import Swiper from 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.mjs';

document.addEventListener('DOMContentLoaded', () => {
    const photoCards = Array.from(document.querySelectorAll('[data-photo-card]'));
    const viewer = document.getElementById('photoStoryViewer');
    const viewerCloseBtn = document.getElementById('photoStoryViewerClose');
    const viewerCurrentEl = document.getElementById('photoStoryViewerCurrent');
    const viewerTotalEl = document.getElementById('photoStoryViewerTotal');

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

    function openViewer(startIndex) {
        if (!viewer) return;
        viewer.classList.add('open');
        viewer.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
        document.body.style.touchAction = 'none';
        viewerSwiper.update();
        viewerSwiper.slideTo(startIndex, 0);
        if (viewerCurrentEl) viewerCurrentEl.textContent = String(startIndex + 1);
    }

    function closeViewer() {
        if (!viewer) return;
        viewer.classList.remove('open');
        viewer.setAttribute('aria-hidden', 'true');
        if (viewerSwiper.zoom && viewerSwiper.zoom.scale !== 1) viewerSwiper.zoom.out();
        document.body.style.overflow = '';
        document.body.style.touchAction = '';
    }

    photoCards.forEach((card) => {
        card.addEventListener('click', () => {
            const startIndex = Number(card.dataset.photoIndex || 0);
            openViewer(startIndex);
        });
    });

    if (viewerCloseBtn) {
        viewerCloseBtn.addEventListener('click', closeViewer);
    }

    if (viewer) {
        viewer.addEventListener('click', (event) => {
            if (event.target === viewer) closeViewer();
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && viewer?.classList.contains('open')) {
            closeViewer();
        }
    });
});
