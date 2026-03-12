(function() {
    'use strict';

    const PREVIEW_SLOTS = [1, 3, 5, 7];
    const SWIPE_LOCK_THRESHOLD = 12;
    const SWIPE_CHANGE_THRESHOLD = 48;

    function buildPreviewImages(property) {
        const previewImages = [];
        const seen = new Set();

        PREVIEW_SLOTS.forEach((slot) => {
            const filename = String(property[`picname${slot}`] || '').trim();
            if (!filename || seen.has(filename)) return;
            seen.add(filename);
            previewImages.push(filename);
        });

        return previewImages;
    }

    function buildThumbMarkup(property) {
        const title = property.title || '매물 이미지';
        const previewImages = buildPreviewImages(property);

        if (previewImages.length === 0) {
            return `<div class="property-image-placeholder">📷</div>`;
        }

        if (previewImages.length === 1) {
            return `<img src="/images/maemul/thumb/${previewImages[0]}" alt="${title}" loading="lazy"
                onerror="this.parentElement.innerHTML='<div class=\\'property-image-placeholder\\'>📷</div>'">`;
        }

        const slides = previewImages.map((filename, index) => {
            const srcAttr = index === 0 ? `src="/images/maemul/thumb/${filename}"` : '';
            const dataSrcAttr = index === 0 ? '' : `data-src="/images/maemul/thumb/${filename}"`;
            return `
                <div class="property-image-slide" data-slide-index="${index}">
                    <img ${srcAttr} ${dataSrcAttr} alt="${title}" loading="lazy"
                        onerror="this.parentElement.innerHTML='<div class=\\'property-image-placeholder\\'>📷</div>'">
                </div>
            `;
        }).join('');

        const dots = previewImages.map((_, index) => `
            <span class="property-image-dot${index === 0 ? ' is-active' : ''}" aria-hidden="true"></span>
        `).join('');

        return `
            <div class="property-image-slider" data-preview-images="${previewImages.join('|')}">
                <div class="property-image-track">${slides}</div>
                <div class="property-image-dots" aria-hidden="true">${dots}</div>
            </div>
        `;
    }

    function init(scopeEl) {
        const root = scopeEl || document;
        root.querySelectorAll('.property-image-slider[data-preview-images]:not([data-slider-ready="1"])').forEach((sliderEl) => {
            sliderEl.dataset.sliderReady = '1';

            const previewImages = (sliderEl.dataset.previewImages || '').split('|').filter(Boolean);
            if (previewImages.length <= 1) return;

            const trackEl = sliderEl.querySelector('.property-image-track');
            const dotEls = Array.from(sliderEl.querySelectorAll('.property-image-dot'));
            const cardEl = sliderEl.closest('.property-card');
            const state = {
                index: 0,
                pointerId: null,
                startX: 0,
                startY: 0,
                deltaX: 0,
                width: 0,
                isPointerDown: false,
                isDragging: false,
                isVerticalScroll: false,
                suppressClick: false,
                deferredLoaded: false,
            };

            function updateDots() {
                dotEls.forEach((dotEl, index) => {
                    dotEl.classList.toggle('is-active', index === state.index);
                });
            }

            function snapTo(index, animate) {
                state.index = Math.max(0, Math.min(index, previewImages.length - 1));
                trackEl.style.transition = animate ? 'transform 0.22s ease' : 'none';
                trackEl.style.transform = `translate3d(${-state.index * 100}%, 0, 0)`;
                updateDots();
            }

            function loadDeferredSlides() {
                if (state.deferredLoaded) return;
                state.deferredLoaded = true;

                sliderEl.querySelectorAll('img[data-src]').forEach((imgEl) => {
                    imgEl.src = imgEl.dataset.src || '';
                    imgEl.removeAttribute('data-src');
                });
            }

            function resetPointerState(keepSuppressClick) {
                state.pointerId = null;
                state.startX = 0;
                state.startY = 0;
                state.deltaX = 0;
                state.width = 0;
                state.isPointerDown = false;
                state.isDragging = false;
                state.isVerticalScroll = false;
                if (cardEl) cardEl.classList.remove('property-card--swiping');

                if (keepSuppressClick) {
                    window.setTimeout(() => {
                        state.suppressClick = false;
                    }, 120);
                } else {
                    state.suppressClick = false;
                }
            }

            sliderEl.addEventListener('pointerdown', (event) => {
                if (event.pointerType === 'mouse' && event.button !== 0) return;

                state.pointerId = event.pointerId;
                state.startX = event.clientX;
                state.startY = event.clientY;
                state.deltaX = 0;
                state.width = sliderEl.clientWidth || 1;
                state.isPointerDown = true;
                state.isDragging = false;
                state.isVerticalScroll = false;
                trackEl.style.transition = 'none';

                if (sliderEl.setPointerCapture) {
                    try { sliderEl.setPointerCapture(event.pointerId); } catch (e) {}
                }
            });

            sliderEl.addEventListener('pointermove', (event) => {
                if (!state.isPointerDown || state.pointerId !== event.pointerId) return;

                const deltaX = event.clientX - state.startX;
                const deltaY = event.clientY - state.startY;

                if (!state.isDragging && !state.isVerticalScroll) {
                    if (Math.abs(deltaX) < SWIPE_LOCK_THRESHOLD && Math.abs(deltaY) < SWIPE_LOCK_THRESHOLD) {
                        return;
                    }

                    if (Math.abs(deltaY) > Math.abs(deltaX)) {
                        state.isVerticalScroll = true;
                        return;
                    }

                    state.isDragging = true;
                    state.suppressClick = true;
                    if (cardEl) cardEl.classList.add('property-card--swiping');
                    loadDeferredSlides();
                }

                if (!state.isDragging) return;

                event.preventDefault();
                state.deltaX = deltaX;

                const edgeResistance = (
                    (state.index === 0 && deltaX > 0) ||
                    (state.index === previewImages.length - 1 && deltaX < 0)
                ) ? 0.35 : 1;

                const offsetX = (-state.index * state.width) + (deltaX * edgeResistance);
                trackEl.style.transform = `translate3d(${offsetX}px, 0, 0)`;
            });

            function finishSwipe(event) {
                if (!state.isPointerDown) return;
                if (event && state.pointerId !== null && event.pointerId !== state.pointerId) return;

                const hadDrag = state.isDragging;
                const movedHorizontally = Math.abs(state.deltaX) > 6;

                if (hadDrag) {
                    const nextThreshold = Math.max(SWIPE_CHANGE_THRESHOLD, state.width * 0.18);
                    let nextIndex = state.index;

                    if (Math.abs(state.deltaX) > nextThreshold) {
                        if (state.deltaX < 0 && state.index < previewImages.length - 1) nextIndex += 1;
                        if (state.deltaX > 0 && state.index > 0) nextIndex -= 1;
                    }

                    snapTo(nextIndex, true);
                } else {
                    snapTo(state.index, false);
                }

                if (sliderEl.releasePointerCapture && state.pointerId !== null) {
                    try { sliderEl.releasePointerCapture(state.pointerId); } catch (e) {}
                }

                resetPointerState(movedHorizontally);
            }

            sliderEl.addEventListener('pointerup', finishSwipe);
            sliderEl.addEventListener('pointercancel', finishSwipe);
            sliderEl.addEventListener('lostpointercapture', finishSwipe);
            sliderEl.addEventListener('click', (event) => {
                if (!state.suppressClick) return;
                event.preventDefault();
                event.stopPropagation();
                state.suppressClick = false;
            }, true);

            snapTo(0, false);
        });
    }

    window.propertyPreviewSlider = {
        buildPreviewImages: buildPreviewImages,
        buildThumbMarkup: buildThumbMarkup,
        init: init,
    };
})();
