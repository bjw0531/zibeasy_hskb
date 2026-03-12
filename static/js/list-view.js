/**
 * list-view.js
 * 리스트형 매물 검색 페이지 전용 스크립트 (/browse)
 * - 전체 매물 2열 그리드 표시 (무한 스크롤)
 * - 검색 오버레이 (지역/역/매물번호)
 * - 매물종류 필터
 */

'use strict';

/* ── 상수 ─────────────────────────────────────────────────── */
const LV_PAGE_SIZE = 20;  /* 한 번에 불러올 매물 수 */
const LV_PREVIEW_SLOTS = [1, 3, 5, 7];
const LV_SWIPE_LOCK_THRESHOLD = 12;
const LV_SWIPE_CHANGE_THRESHOLD = 48;

/* ── 상태 변수 ────────────────────────────────────────────── */
let lvOffset        = 0;     /* 서버 페이지네이션 offset */
let lvHasMore       = true;  /* 추가 로드 가능 여부 */
let lvIsLoading     = false; /* 로딩 중 여부 */
let lvTotalCount    = 0;     /* 전체 매물 수 */
let lvSelectedTypes = [];    /* 선택된 매물종류 (category 코드 배열) */
let lvBackupTypes   = [];    /* 모달 열기 시 백업 (닫기 시 복원용) */
let lvTypeLabel     = '매물종류'; /* 현재 선택된 매물종류 표시 텍스트 */
let lvObserver      = null;  /* IntersectionObserver (무한 스크롤) */
/* 검색 필터 상태 */
let lvSearchFilter  = null;  /* null = 전체 / { type:'dong', dong, ri } / { type:'station', lat, lng, radius } / { type:'code', code } */
/* 최근 검색어 */
let lvRecentSearches = [];

/* ── 역 정적 데이터 ───────────────────────────────────────── */
const LV_STATIONS = [
    { id: 'dujeong',   name: '두정역',  lat: 36.834037, lng: 127.152885 },
    { id: 'cheonan',   name: '천안역',  lat: 36.809692, lng: 127.146224 },
    { id: 'bongmyeong',name: '봉명역',  lat: 36.801410, lng: 127.136079 },
    { id: 'ssangyong', name: '쌍용역',  lat: 36.793721, lng: 127.121369 },
];

/* ── 초기화 ───────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    /* 최근 검색어 로드 */
    lvLoadRecentSearches();

    /* 검색창 이벤트 */
    const realInput = document.getElementById('searchPageInput');
    if (realInput) {
        realInput.addEventListener('input', (e) => lvHandleInput(e.target.value));
        realInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') lvPerformSearch(e.target.value);
        });
    }

    /* 첫 매물 로드 */
    lvLoadProperties(true);
});

/* ════════════════════════════════════════════════════════════
   API 호출 & 카드 렌더링
   ════════════════════════════════════════════════════════════ */

/**
 * 매물 로드
 * @param {boolean} reset - true면 목록 초기화 후 첫 페이지 로드
 */
async function lvLoadProperties(reset = false) {
    if (lvIsLoading) return;
    if (!reset && !lvHasMore) return;

    lvIsLoading = true;

    const gridEl = document.getElementById('lvGrid');
    if (!gridEl) { lvIsLoading = false; return; }

    /* 초기화 시 스피너 표시 */
    if (reset) {
        lvOffset = 0;
        lvHasMore = true;
        lvObserver && lvObserver.disconnect();
        gridEl.innerHTML = `
            <div class="lv-loading">
                <div class="lv-spinner"></div>
                <span>매물을 불러오는 중...</span>
            </div>
        `;
    }

    try {
        const params = lvBuildParams(lvOffset);
        let response;

        /* 역 주변: 클라이언트 거리 필터이므로 limit 크게 */
        if (lvSearchFilter && lvSearchFilter.type === 'station') {
            params.set('limit', '1000');
            params.delete('offset');
        }

        response = await fetch('/api/properties?' + params.toString());
        if (!response.ok) throw new Error('HTTP ' + response.status);

        const data = await response.json();

        if (!data.success) throw new Error('API 오류');

        let properties = data.data || [];

        /* 역 주변 클라이언트 거리 필터링 */
        if (lvSearchFilter && lvSearchFilter.type === 'station') {
            const { lat, lng, radius } = lvSearchFilter;
            properties = properties.filter(p => {
                const dist = lvCalcDistance(lat, lng, parseFloat(p.lat), parseFloat(p.lng));
                return dist <= radius / 1000;
            });
            /* 최근 수정순 정렬 */
            properties.sort((a, b) => new Date(b.ldate + '+09:00') - new Date(a.ldate + '+09:00'));
            lvTotalCount = properties.length;
            lvHasMore = false; /* 역 필터는 클라이언트 처리이므로 무한 스크롤 없음 */
        } else {
            /* 서버 페이지네이션 — total_count가 있으면 전체 매물 수 사용 */
            lvTotalCount = parseInt(data.total_count || data.count || properties.length);
            lvHasMore = properties.length >= LV_PAGE_SIZE;
            lvOffset += properties.length;
        }

        /* 그리드 렌더링 */
        if (reset) {
            gridEl.innerHTML = '';
            /* 결과 카운트 바 — 매물종류 레이블 + 수량 */
            const bar = document.createElement('div');
            bar.className = 'lv-result-bar';
            bar.id = 'lvResultBar';
            bar.innerHTML = `<span class="lv-result-count"><span id="lvCountLabel">${lvBuildCountLabel()}</span> <strong id="lvCountNum">${lvTotalCount}</strong>개 매물</span>`;
            gridEl.appendChild(bar);
        }

        if (reset && properties.length === 0) {
            lvShowEmpty(gridEl);
            lvIsLoading = false;
            return;
        }

        /* 카드 삽입 */
        properties.forEach(p => {
            const card = lvCreateCard(p);
            gridEl.insertAdjacentHTML('beforeend', card);
        });

        lvInitCardSliders(gridEl);

        /* 찜하기 상태 복원 (카드가 동적 렌더링된 후 하트 상태 적용) */
        if (typeof initLikedHearts === 'function') initLikedHearts();

        /* 무한 스크롤 옵저버 설정 */
        lvSetupObserver(gridEl);

        /* 카운트 업데이트 (역 필터 시 클라이언트 count로 갱신) */
        const countEl   = document.getElementById('lvCountNum');
        const labelEl   = document.getElementById('lvCountLabel');
        if (countEl) countEl.textContent  = lvTotalCount;
        if (labelEl) labelEl.textContent  = lvBuildCountLabel();

    } catch (err) {
        console.error('매물 로드 실패:', err);
        if (reset) {
            gridEl.innerHTML = `
                <div class="lv-empty">
                    <div class="lv-empty-icon">⚠️</div>
                    <div class="lv-empty-title">불러오기 실패</div>
                    <div class="lv-empty-msg">네트워크 연결을 확인해주세요.</div>
                </div>
            `;
        }
    } finally {
        lvIsLoading = false;
    }
}

/**
 * 카운트 레이블 생성
 * 필터 없음: "전체" / 1종 선택: "원룸" / 복수: "2개 선택"
 */
function lvBuildCountLabel() {
    if (lvSelectedTypes.length === 0) return '전체';
    if (lvSelectedTypes.length === 1) {
        const sel = document.querySelector(`.lv-type-option[data-code="${lvSelectedTypes[0]}"]`);
        return sel ? sel.dataset.label : '전체';
    }
    return `${lvSelectedTypes.length}개 선택`;
}

/**
 * API 파라미터 구성
 */
function lvBuildParams(offset) {
    const params = new URLSearchParams();
    params.set('limit', String(LV_PAGE_SIZE));
    params.set('offset', String(offset));
    params.set('mode', 'full');

    /* 매물종류 필터 */
    if (lvSelectedTypes.length > 0) {
        params.set('category', lvSelectedTypes.join(','));
    }

    /* 검색 필터 */
    if (lvSearchFilter) {
        if (lvSearchFilter.type === 'dong') {
            params.set('dong', lvSearchFilter.dong);
            if (lvSearchFilter.ri) params.set('ri', lvSearchFilter.ri);
            params.set('limit', '200');  /* 지역 검색은 충분히 */
            params.delete('offset');
        } else if (lvSearchFilter.type === 'code') {
            params.set('code', lvSearchFilter.code);
            params.set('limit', '1');
            params.delete('offset');
        } else if (lvSearchFilter.type === 'station') {
            /* 역 필터 시 params는 위에서 처리 */
        }
    }

    /* ── 전체 필터 파라미터 병합 ── */
    if (typeof buildFilterParams === 'function') {
        const filterParams = buildFilterParams();
        Object.entries(filterParams).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                params.set(key, String(value));
            }
        });
    }

    /* ── 테마 필터 파라미터 병합 ── */
    if (window.currentThemeFilter) {
        const { columns, themeCategories } = window.currentThemeFilter;
        if (columns && columns.length > 0) {
            params.set('thema', columns.join(','));
        }
        if (themeCategories && themeCategories.length > 0) {
            params.set('thema_categories', themeCategories.join(','));
        }
    }

    return params;
}

/**
 * 무한 스크롤 옵저버 설정
 */
function lvSetupObserver(gridEl) {
    if (lvObserver) lvObserver.disconnect();
    if (!lvHasMore) return;

    const cards = gridEl.querySelectorAll('.lv-card');
    if (cards.length < 4) return; /* 카드 너무 적으면 스킵 */

    /* 마지막 카드에서 4번째 카드를 감시 */
    const sentinel = cards[Math.max(0, cards.length - 4)];

    lvObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && lvHasMore && !lvIsLoading) {
            lvLoadProperties(false);
        }
    }, { rootMargin: '200px' });

    lvObserver.observe(sentinel);
}

function lvBuildPreviewImages(property) {
    const previewImages = [];
    const seen = new Set();

    LV_PREVIEW_SLOTS.forEach((slot) => {
        const filename = String(property[`picname${slot}`] || '').trim();
        if (!filename || seen.has(filename)) return;
        seen.add(filename);
        previewImages.push(filename);
    });

    return previewImages;
}

function lvBuildThumbMarkup(property) {
    const title = property.title || '매물 이미지';
    const previewImages = lvBuildPreviewImages(property);

    if (previewImages.length === 0) {
        return `<div class="lv-thumb-placeholder">📷</div>`;
    }

    if (previewImages.length === 1) {
        return `<img src="/images/maemul/thumb/${previewImages[0]}" alt="${title}" loading="lazy"
               onerror="this.parentElement.innerHTML='<div class=\\'lv-thumb-placeholder\\'>📷</div>'">`;
    }

    const slides = previewImages.map((filename, index) => {
        const srcAttr = index === 0 ? `src="/images/maemul/thumb/${filename}"` : '';
        const dataSrcAttr = index === 0 ? '' : `data-src="/images/maemul/thumb/${filename}"`;
        return `
            <div class="lv-thumb-slide" data-slide-index="${index}">
                <img ${srcAttr} ${dataSrcAttr} alt="${title}" loading="lazy"
                     onerror="this.parentElement.innerHTML='<div class=\\'lv-thumb-placeholder\\'>📷</div>'">
            </div>
        `;
    }).join('');

    const dots = previewImages.map((_, index) => `
        <span class="lv-thumb-dot${index === 0 ? ' is-active' : ''}" aria-hidden="true"></span>
    `).join('');

    return `
        <div class="lv-thumb-slider" data-preview-images="${previewImages.join('|')}">
            <div class="lv-thumb-track">${slides}</div>
            <div class="lv-thumb-dots" aria-hidden="true">${dots}</div>
        </div>
    `;
}

function lvInitCardSliders(scopeEl) {
    const root = scopeEl || document;
    root.querySelectorAll('.lv-thumb-slider[data-preview-images]:not([data-slider-ready="1"])').forEach((sliderEl) => {
        sliderEl.dataset.sliderReady = '1';

        const previewImages = (sliderEl.dataset.previewImages || '').split('|').filter(Boolean);
        if (previewImages.length <= 1) return;

        const trackEl = sliderEl.querySelector('.lv-thumb-track');
        const dotEls = Array.from(sliderEl.querySelectorAll('.lv-thumb-dot'));
        const cardEl = sliderEl.closest('.lv-card');
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
            cardEl && cardEl.classList.remove('lv-card--swiping');

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
                if (Math.abs(deltaX) < LV_SWIPE_LOCK_THRESHOLD && Math.abs(deltaY) < LV_SWIPE_LOCK_THRESHOLD) {
                    return;
                }

                if (Math.abs(deltaY) > Math.abs(deltaX)) {
                    state.isVerticalScroll = true;
                    return;
                }

                state.isDragging = true;
                state.suppressClick = true;
                cardEl && cardEl.classList.add('lv-card--swiping');
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
                const nextThreshold = Math.max(LV_SWIPE_CHANGE_THRESHOLD, state.width * 0.18);
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

/**
 * 빈 결과 표시
 */
function lvShowEmpty(gridEl) {
    gridEl.innerHTML = `
        <div class="lv-empty">
            <div class="lv-empty-icon">🏠</div>
            <div class="lv-empty-title">매물이 없습니다</div>
            <div class="lv-empty-msg">조건을 변경하거나<br>다른 지역을 검색해보세요.</div>
        </div>
    `;
}

/* ════════════════════════════════════════════════════════════
   카드 HTML 생성
   ════════════════════════════════════════════════════════════ */

/**
 * 매물 카드 HTML 생성
 */
function lvCreateCard(p) {
    /* 계약완료 여부 — API 필드: contract */
    const isContractDone = (p.contract === '계약완료');

    const thumbInner = lvBuildThumbMarkup(p);

    /* 가격 */
    const price = isContractDone ? '계약완료' : lvFormatPrice(p);
    const mgmt  = isContractDone ? '' : lvFormatMgmt(p.public_money);

    /* 주소 */
    const addr = p.ri || p.dong || '주소 정보 없음';

    /* 매물 종류 */
    const catMap = { '90':'"원룸"','91':'"투베이"','92':'"무보증/단기"','93':'"투룸"','94':'"쓰리룸"' };
    const catName = p.category ? (catMap[String(p.category)] || '') : (p.build_use_type || '');

    /* 층 — 공백 포함 표기: "총 4층 중 3층" */
    const floor = isContractDone ? '' :
        (p.now_floor && p.total_floor ? `총 ${p.total_floor}층 중 ${p.now_floor}층` :
        (p.now_floor ? `${p.now_floor}층` : ''));

    /* 시간 */
    const timeAgo = isContractDone ? '' : lvFormatTime(p.ldate);
    const timeClass = timeAgo === '확인필요' ? 'lv-card-time needs-check' : 'lv-card-time';

    /* 찜하기 버튼 */
    const likeKey = p.code || p.idx;
    const heartBtn = `
        <div class="lv-heart-btn" onclick="event.stopPropagation(); toggleLike('${likeKey}')">
            <svg class="w-6 h-6 heart-unliked"
                data-like-btn="${likeKey}"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 256 256"
                stroke="white"
                stroke-width="10"
                fill="currentColor">
                <path d="M223,57a58.07,58.07,0,0,0-81.92-.1L128,69.05 114.91,56.86A58,58,0,0,0,33,139l89.35,90.66a8,8,0,0,0,11.4,0L223,139a58,58,0,0,0,0-82Z"></path>
            </svg>
        </div>
    `;

    /* 썸네일 */
    /* 영상 아이콘 */
    const movieIcon = (!isContractDone && p.movie && p.movie.trim())
        ? `<div class="lv-movie-icon"><img src="/static/images/movie_icon.png" alt="영상 있음"></div>`
        : '';

    /* 계약완료 오버레이 */
    const contractOverlay = isContractDone
        ? `<img src="/static/images/end.png" alt="계약완료" class="lv-end-overlay">`
        : '';

    /* 주소 + 종류 텍스트 (종류명만 별도 span으로 감싸 11px 적용) */
    const catSpan = catName ? `<span class="lv-card-cat">${catName}</span>` : '';
    const addrLine = [addr, catSpan, floor].filter(Boolean).join(' ');

    /* 설명 */
    const titleText = (p.title || '').replace(/\[.*?\]/g, '').trim() || '상세 설명이 없습니다.';

    return `
        <div class="lv-card" data-property-id="${p.idx}" onclick="lvNavigate('${p.code}')">
            <div class="lv-card-thumb">
                ${thumbInner}
                ${contractOverlay}
                ${movieIcon}
                ${heartBtn}
            </div>
            <div class="lv-card-info">
                <span class="lv-card-num">매물번호 ${p.code || p.idx}</span>
                <div class="lv-card-price ${isContractDone ? 'contract-done' : ''}">
                    ${price}
                    ${mgmt ? `<span class="lv-price-mgmt"> ${mgmt}</span>` : ''}
                </div>
                <div class="lv-card-addr">${addrLine}</div>
                <div class="lv-card-title">${titleText}</div>
                ${timeAgo ? `<div class="${timeClass}">${timeAgo}</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * 매물 상세 페이지 이동
 * - navFrom='list'       → view.html 탭바에서 리스트 탭 활성화
 * - fromListPage='true'  → view.html 슬라이드 인 애니메이션 트리거
 * - navDirection         → VT API 지원 브라우저 우→좌 슬라이드
 */
function lvNavigate(code) {
    sessionStorage.setItem('fromListView', 'true');        /* 기존 키 유지 */
    sessionStorage.setItem('fromListPage', 'true');        /* view.html 슬라이드 애니메이션 트리거 */
    sessionStorage.setItem('navDirection', 'slide-right'); /* VT: 우→좌 슬라이드 */
    sessionStorage.setItem('navFrom', 'list');             /* 탭바 활성 탭 전달 */

    // ✅ bottom-nav를 root 스냅샷에 포함시킴
    //    → 별도 VT 레이어(z-index:9999)가 사라져 새 페이지 contact-bar를 가리지 않음
    var bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.viewTransitionName = 'none';

    window.location.href = `/view/${code}`;
}

/* 전역 등록 */
window.lvNavigate = lvNavigate;

/* ════════════════════════════════════════════════════════════
   포맷팅 유틸
   ════════════════════════════════════════════════════════════ */

function lvFormatPrice(p) {
    const maemae  = p.maemae_money || 0;
    const jeonse  = p.jen_money    || 0;
    const deposit = p.security_money || 0;
    const monthly = p.month_money  || 0;

    if (maemae  > 0) return `매매 ${maemae}만원`;
    if (jeonse  > 0) return `전세 ${jeonse}만원`;
    if (deposit > 0 || monthly > 0) {
        return `월세 ${deposit > 0 ? deposit : ''}/${monthly > 0 ? monthly : ''}`.replace(/\/$/, '').trim();
    }
    return '';
}

function lvFormatMgmt(amount) {
    if (!amount || amount === 0) return '';
    const n = parseFloat(amount);
    const m = Math.floor(n / 10000);
    return m > 0 ? `관리비 ${m}만원` : '';
}

function lvFormatTime(dateStr) {
    if (!dateStr) return '확인필요';
    try {
        const date = new Date(dateStr + '+09:00');
        const now  = new Date();
        const sec  = Math.floor((now - date) / 1000);
        if (sec < 60)   return '방금 전';
        const min  = Math.floor(sec / 60);
        const hour = Math.floor(sec / 3600);
        const day  = Math.floor(sec / 86400);
        const week = Math.floor(sec / 604800);
        if (min  < 60) return `${min}분 전`;
        if (hour < 24) return `${hour}시간 전`;
        if (day  <= 15) return `${day}일 전`;
        if (day  < 30)  return `${week}주 전`;
        return '확인필요';
    } catch (e) {
        return '확인필요';
    }
}

/**
 * Haversine 거리 계산 (km)
 */
function lvCalcDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

/* ════════════════════════════════════════════════════════════
   매물종류 필터
   ════════════════════════════════════════════════════════════ */

/**
 * 매물종류 모달 열기
 * - 현재 선택 상태를 백업 (X 닫기 시 복원용)
 * - 버튼 UI를 현재 lvSelectedTypes와 동기화
 */
function lvOpenTypeModal() {
    /* 현재 상태 백업 (X 닫기 시 복원용) */
    lvBackupTypes = [...lvSelectedTypes];

    /* 팝업 내 버튼 UI를 현재 선택 상태와 동기화 */
    document.querySelectorAll('.lv-type-option').forEach(opt => opt.classList.remove('selected'));
    if (lvSelectedTypes.length === 0) {
        const allBtn = document.querySelector('.lv-type-option[data-code=""]');
        if (allBtn) allBtn.classList.add('selected');
    } else {
        lvSelectedTypes.forEach(code => {
            const btn = document.querySelector(`.lv-type-option[data-code="${code}"]`);
            if (btn) btn.classList.add('selected');
        });
    }

    const backdrop = document.getElementById('lvTypeModalBackdrop');
    const typeBtn  = document.getElementById('lvTypeBtn');
    if (backdrop) backdrop.classList.add('open');
    if (typeBtn)  typeBtn.classList.add('active');  /* 화살표 위쪽 회전 */
}

/**
 * 매물종류 모달 닫기 (적용 없이)
 * - 백업된 이전 상태로 복원
 */
function lvCloseTypeModal(e) {
    /* 배경 div 클릭이 아닌 경우 (모달 콘텐츠 클릭) 무시 */
    if (e && e.target !== e.currentTarget) return;

    /* 선택 상태 복원 */
    lvSelectedTypes = [...lvBackupTypes];

    /* 버튼 UI도 복원 */
    document.querySelectorAll('.lv-type-option').forEach(opt => opt.classList.remove('selected'));
    if (lvSelectedTypes.length === 0) {
        const allBtn = document.querySelector('.lv-type-option[data-code=""]');
        if (allBtn) allBtn.classList.add('selected');
    } else {
        lvSelectedTypes.forEach(code => {
            const btn = document.querySelector(`.lv-type-option[data-code="${code}"]`);
            if (btn) btn.classList.add('selected');
        });
    }

    const backdrop = document.getElementById('lvTypeModalBackdrop');
    const typeBtn  = document.getElementById('lvTypeBtn');
    if (backdrop) backdrop.classList.remove('open');
    if (typeBtn)  typeBtn.classList.remove('active');
}

/**
 * 매물종류 옵션 토글
 */
function lvToggleType(el, code, label) {
    const options = document.querySelectorAll('.lv-type-option');

    if (code === '') {
        /* 전체 선택 */
        options.forEach(opt => opt.classList.remove('selected'));
        el.classList.add('selected');
        lvSelectedTypes = [];
        return;
    }

    /* 전체 버튼 해제 */
    const allBtn = document.querySelector('.lv-type-option[data-code=""]');
    if (allBtn) allBtn.classList.remove('selected');

    /* 토글 */
    el.classList.toggle('selected');

    /* 선택 목록 재구성 */
    lvSelectedTypes = [];
    document.querySelectorAll('.lv-type-option[data-code]:not([data-code=""])').forEach(opt => {
        if (opt.classList.contains('selected')) {
            lvSelectedTypes.push(opt.dataset.code);
        }
    });

    /* 아무것도 선택 안 됐으면 전체 선택 */
    if (lvSelectedTypes.length === 0 && allBtn) {
        allBtn.classList.add('selected');
    }
}

/**
 * 매물종류 적용 (지도형과 동일 — applying/closing 애니메이션)
 */
function lvApplyType() {
    const applyBtn  = document.getElementById('lvTypeApplyBtn');
    const modal     = document.getElementById('lvTypeModal');
    const backdrop  = document.getElementById('lvTypeModalBackdrop');
    const typeBtn   = document.getElementById('lvTypeBtn');
    const btnText   = document.getElementById('lvTypeBtnText');

    /* ── 상단 버튼 텍스트 업데이트 ── */
    const allBtn       = document.querySelector('.lv-type-option[data-code=""]');
    const isAllSelected = allBtn && allBtn.classList.contains('selected');

    if (isAllSelected || lvSelectedTypes.length === 0) {
        lvTypeLabel = '매물종류';
        if (btnText) btnText.textContent = '매물종류';
    } else if (lvSelectedTypes.length === 1) {
        const sel = document.querySelector(`.lv-type-option[data-code="${lvSelectedTypes[0]}"]`);
        let label = sel ? sel.dataset.label : '매물종류';
        if (label === '무보증/단기') label = '무보증';
        lvTypeLabel = label;
        if (btnText) btnText.textContent = label;
    } else {
        lvTypeLabel = `${lvSelectedTypes.length}개 선택`;
        if (btnText) btnText.textContent = lvTypeLabel;
    }

    /* ── 1단계: 적용 버튼 배경 채움 애니메이션 ── */
    if (applyBtn) applyBtn.classList.add('applying');

    /* ── 2단계: 0.1초 후 모달 닫힘 애니메이션 ── */
    setTimeout(() => {
        if (modal) modal.classList.add('closing');

        /* ── 3단계: 0.2초 후 실제 닫기 + 매물 재로드 ── */
        setTimeout(() => {
            if (backdrop) backdrop.classList.remove('open');
            if (typeBtn)  typeBtn.classList.remove('active');
            if (modal)    modal.classList.remove('closing');
            if (applyBtn) applyBtn.classList.remove('applying');
            /* 카운트 레이블 즉시 갱신 (재로드 전 선행) */
            const labelEl = document.getElementById('lvCountLabel');
            if (labelEl) labelEl.textContent = lvBuildCountLabel();
            lvLoadProperties(true);
        }, 200);
    }, 100);
}

/* ════════════════════════════════════════════════════════════
   검색 오버레이
   ════════════════════════════════════════════════════════════ */

/**
 * 검색 오버레이 열기
 */
function lvOpenSearch() {
    const overlay = document.getElementById('searchPage');
    if (!overlay) return;
    overlay.classList.add('active');

    /* 입력 포커스 */
    const input = document.getElementById('searchPageInput');
    if (input) {
        setTimeout(() => input.focus(), 100);
    }

    /* 최근 검색어 표시 */
    lvShowRecent();

    /* 뒤로가기 지원 */
    history.pushState({ lvSearch: true }, '');
    window._lvSearchPushed = true;
}

/**
 * 검색 오버레이 닫기
 */
function lvCloseSearch() {
    const overlay = document.getElementById('searchPage');
    if (!overlay) return;
    overlay.classList.remove('active');

    /* 입력값 초기화 */
    const input = document.getElementById('searchPageInput');
    if (input) input.value = '';

    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';

    if (window._lvSearchPushed) {
        window._lvSearchPushed = false;
        history.back();
    }
}

/* 뒤로가기로 검색 오버레이 / 테마 모달 / 전체 필터 닫기 */
window.addEventListener('popstate', function(e) {
    /* 검색 오버레이 */
    const overlay = document.getElementById('searchPage');
    if (overlay && overlay.classList.contains('active')) {
        overlay.classList.remove('active');
        const input = document.getElementById('searchPageInput');
        if (input) input.value = '';
        window._lvSearchPushed = false;
        return;
    }

    /* 테마 모달 */
    const recommendModal = document.getElementById('recommendModal');
    if (recommendModal && recommendModal.classList.contains('active')) {
        window.isClosingByBackButton = true;
        recommendModal.classList.remove('active');
        window.recommendModalHistoryPushed = false;
        setTimeout(() => { window.isClosingByBackButton = false; }, 100);
        return;
    }

    /* 전체 필터 */
    const filterPage = document.getElementById('fullFilterPage');
    if (filterPage && filterPage.classList.contains('active')) {
        window.isClosingByBackButton = true;
        filterPage.classList.remove('active');
        document.body.style.overflow = '';
        window.fullFilterHistoryPushed = false;
        setTimeout(() => { window.isClosingByBackButton = false; }, 100);
        return;
    }
});

/**
 * 검색 입력 처리 (실시간)
 */
function lvHandleInput(query) {
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.style.display = query.length > 0 ? 'flex' : 'none';

    const q = (query || '').trim();
    if (q.length < 1) {
        lvShowRecent();
        return;
    }

    /* 매물번호(숫자)만 허용 */
    if (/^\d+$/.test(q)) {
        lvShowCodeSuggest(q);
        return;
    }

    const body = document.getElementById('searchResults');
    if (body) {
        body.innerHTML = `<div class="search-no-results-msg"><p>리스트 페이지에서는 매물번호만 검색할 수 있습니다.</p></div>`;
    }
}

/**
 * 검색 실행 (엔터키)
 */
async function lvPerformSearch(query) {
    if (!query || !query.trim()) return;
    const q = query.trim();

    if (/^\d+$/.test(q)) {
        /* 매물번호 검색: 지도 페이지와 동일하게 /api/search 사용 */
        await lvSearchCodeAndNavigate(q);
    } else {
        const body = document.getElementById('searchResults');
        if (body) {
            body.innerHTML = `<div class="search-no-results-msg"><p>리스트 페이지에서는 매물번호만 검색할 수 있습니다.</p></div>`;
        }
    }
}

/**
 * 매물번호 제안 표시
 */
function lvShowCodeSuggest(query) {
    const body = document.getElementById('searchResults');
    if (!body) return;
    body.innerHTML = `
        <div class="search-suggestions">
            <div class="search-suggestion-item" onclick="lvSelectCode('${query}')">
                <span class="suggestion-icon">🏠</span>
                <div class="suggestion-text">
                    <span class="suggestion-main">매물번호 ${query}</span>
                    <span class="suggestion-sub">엔터를 눌러 검색</span>
                </div>
            </div>
        </div>
    `;
}

/**
 * 매물번호 선택
 */
async function lvSelectCode(code) {
    await lvSearchCodeAndNavigate(code);
}

/**
 * 매물번호 검색 (지도 페이지와 동일 방식)
 * - /api/search?q=코드 호출
 * - 결과가 있으면 상세 페이지로 이동
 * - 없으면 검색창에 안내 문구 표시
 */
async function lvSearchCodeAndNavigate(code) {
    const body = document.getElementById('searchResults');

    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(code)}`);
        if (!response.ok) throw new Error('검색 API 오류');

        const results = await response.json();
        if (Array.isArray(results) && results.length > 0) {
            lvSaveRecent(code);
            /* 전환 플래그를 먼저 설정해 상세 진입 슬라이드가 누락되지 않도록 보장 */
            sessionStorage.setItem('fromListPage', 'true');
            sessionStorage.setItem('navDirection', 'slide-right');
            sessionStorage.setItem('navFrom', 'list');
            lvCloseSearch();
            window.location.href = `/view/${results[0].code}`;
            return;
        }

        if (body) {
            body.innerHTML = `<div class="search-no-results-msg"><p>매물번호 ${code}에 해당하는 매물이 없습니다.</p></div>`;
        }
    } catch (e) {
        console.error('매물번호 검색 실패:', e);
        if (body) {
            body.innerHTML = `<div class="search-no-results-msg"><p>검색 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.</p></div>`;
        }
    }
}

/**
 * 지역/역 검색
 */
async function lvSearchLocationStation(query) {
    const body = document.getElementById('searchResults');
    if (!body) return;

    /* 역 검색 (정적) */
    const matchedStations = LV_STATIONS.filter(s =>
        s.name.includes(query) || s.name.replace('역', '').includes(query)
    );

    /* 지역 검색 (API) */
    let matchedLocations = [];
    try {
        const res = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        matchedLocations = data.locations || [];
    } catch (e) { /* 무시 */ }

    if (matchedLocations.length === 0 && matchedStations.length === 0) {
        body.innerHTML = `<div class="search-no-results-msg"><p>"${query}"에 해당하는 지역 또는 역을 찾을 수 없습니다.</p></div>`;
        return;
    }

    let html = '<div class="search-suggestions">';

    /* 지역 결과 */
    matchedLocations.forEach(loc => {
        html += `
            <div class="search-suggestion-item" onclick="lvSelectLocation('${loc.dong}', '${loc.ri || ''}', '${loc.full_address}')">
                <span class="suggestion-icon">📍</span>
                <div class="suggestion-text">
                    <span class="suggestion-main">${loc.name}</span>
                    <span class="suggestion-sub">${loc.full_address} (${loc.property_count}개 매물)</span>
                </div>
            </div>
        `;
    });

    /* 역 결과 */
    matchedStations.forEach(station => {
        html += `
            <div class="search-suggestion-item" onclick="lvSelectStation('${station.id}')">
                <span class="suggestion-icon station-icon-circle">
                    <img src="/static/images/station_icon.png" alt="역">
                </span>
                <div class="suggestion-text">
                    <span class="suggestion-main">${station.name}</span>
                    <span class="suggestion-sub">반경 800m 내 매물 검색</span>
                </div>
            </div>
        `;
    });

    html += '</div>';
    body.innerHTML = html;
}

/**
 * 지역 선택
 */
function lvSelectLocation(dong, ri, fullAddress) {
    const name = ri || dong;
    lvSaveRecent(name);
    lvCloseSearch();
    lvSearchFilter = { type: 'dong', dong, ri };
    lvLoadProperties(true);

    /* 검색창 텍스트 표시 */
    const placeholder = document.getElementById('lvSearchPlaceholder');
    if (placeholder) placeholder.textContent = name + ' 검색 중';
}

/**
 * 역 선택
 */
function lvSelectStation(stationId) {
    const station = LV_STATIONS.find(s => s.id === stationId);
    if (!station) return;

    lvSaveRecent(station.name);
    lvCloseSearch();
    lvSearchFilter = { type: 'station', lat: station.lat, lng: station.lng, radius: 800 };
    lvLoadProperties(true);

    const placeholder = document.getElementById('lvSearchPlaceholder');
    if (placeholder) placeholder.textContent = station.name + ' 주변 검색 중';
}

/**
 * 검색 초기화 (플레이스홀더 클릭 시 전체 다시 로드)
 */
function lvClearSearch() {
    lvSearchFilter = null;
    const placeholder = document.getElementById('lvSearchPlaceholder');
    if (placeholder) placeholder.textContent = '매물번호로 검색';
    lvLoadProperties(true);
}

/* ── 검색 입력창 X 버튼 클릭 ────────────────────────────── */
function lvClearInput() {
    const input = document.getElementById('searchPageInput');
    if (input) { input.value = ''; input.focus(); }
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    lvShowRecent();
}

/* 지도 페이지와 동일한 핸들러명 호환 */
function closeSearchPage() {
    lvCloseSearch();
}

function clearSearchInput() {
    lvClearInput();
}

/* ════════════════════════════════════════════════════════════
   필터 버튼 핸들러 (전체필터 / 가격 / 지역 / 테마별)
   ════════════════════════════════════════════════════════════ */

/* ── 테마 설정 (index-ui.js의 themeConfig와 동일) ── */
const lvThemeConfig = {
    'realtime':         { column: 'thema1',  label: '실시간 추천' },
    'premium':          { column: 'thema2',  label: '신축 고급형', category: '신축' },
    'deposit100':       { column: 'thema6',  label: '보증금 100가능' },
    'budget_oneroom':   { column: 'thema7',  label: '알뜰형 원룸', category: '원룸' },
    'budget_twobay':    { column: 'thema8',  label: '알뜰형 투베이/투룸', category: '투베이' },
    'big_oneroom':      { column: 'thema3',  label: '큰 원룸' },
    'separate_oneroom': { column: 'thema11', label: '분리형 원룸' },
    'arch_twobay':      { column: 'thema4',  label: '아치형 투베이' },
    'living_twobay':    { column: 'thema12', label: '분리형 투베이' },
    'wide_tworoom':     { column: 'thema13', label: '거실있는 투룸' },
    'unique':           { column: 'thema5',  label: '독특한 집' }
};

/* 테마 필터 상태 */
window.selectedThemes = [];
window.currentThemeFilter = null;

/**
 * 전체 필터 열기
 */
function lvOpenFullFilter() {
    openFullFilterPage();
}

/**
 * 가격 필터 (Phase 2 — 지금은 전체 필터로 대체)
 */
function lvOpenPriceFilter() {
    openFullFilterPage();
}

/**
 * 지역 필터 (Phase 2 — 지금은 검색 오버레이로 대체)
 */
function lvOpenAreaFilter() {
    lvOpenSearch();
}

/**
 * 테마별 검색 모달 열기
 */
function lvOpenThemeFilter() {
    /* 기존 적용된 테마가 있으면 선택 상태 복원 */
    if (window.currentThemeFilter && window.currentThemeFilter.types && window.currentThemeFilter.types.length > 0) {
        window.selectedThemes = [...window.currentThemeFilter.types];
        document.querySelectorAll('.theme-btn').forEach(btn => {
            const type = btn.getAttribute('onclick')?.match(/,\s*'(\w+)'/)?.[1];
            if (type && window.selectedThemes.includes(type)) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    } else {
        window.selectedThemes = [];
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
    }

    /* 히스토리에 상태 추가 (뒤로가기 지원) */
    history.pushState({ modal: 'recommend' }, '', '');
    window.recommendModalHistoryPushed = true;
    document.getElementById('recommendModal').classList.add('active');
}

/**
 * 테마 모달 닫기
 */
window.closeRecommendModal = function(event) {
    if (event && event.target !== event.currentTarget) return;
    if (!window.isClosingByBackButton && window.recommendModalHistoryPushed) {
        window.recommendModalHistoryPushed = false;
        history.back();
    }
    document.getElementById('recommendModal').classList.remove('active');
};

/**
 * 테마 옵션 토글 (단일 선택)
 */
window.toggleThemeOption = function(btn, type) {
    const index = window.selectedThemes.indexOf(type);
    if (index > -1) {
        window.selectedThemes.splice(index, 1);
        btn.classList.remove('selected');
    } else {
        document.querySelectorAll('.theme-btn.selected').forEach(b => b.classList.remove('selected'));
        window.selectedThemes = [];
        window.selectedThemes.push(type);
        btn.classList.add('selected');
    }
};

/**
 * 테마 필터 적용 (리스트 페이지용)
 */
window.applyThemeFilter = function() {
    const themeChip = document.getElementById('lvFilterTheme');

    if (window.selectedThemes.length === 0) {
        /* 테마 해제 */
        window.currentThemeFilter = null;
        if (themeChip) themeChip.classList.remove('active');
        document.getElementById('recommendModal').classList.remove('active');
        if (window.recommendModalHistoryPushed) {
            window.recommendModalHistoryPushed = false;
            history.back();
        }
        lvLoadProperties(true);
        return;
    }

    /* 테마 적용 */
    const columns = [];
    const labels = [];
    const themeCategories = [];

    window.selectedThemes.forEach(type => {
        const config = lvThemeConfig[type];
        if (config) {
            if (config.category) {
                themeCategories.push(`${config.column}:${config.category}`);
            } else {
                columns.push(config.column);
            }
            labels.push(config.label);
        }
    });

    const displayLabel = labels.length === 1 ? labels[0] : `${labels.length}개 테마`;

    window.currentThemeFilter = {
        types: window.selectedThemes,
        columns: columns,
        themeCategories: themeCategories,
        label: displayLabel
    };

    /* 칩 버튼 활성화 */
    if (themeChip) themeChip.classList.add('active');

    /* 모달 닫기 */
    document.getElementById('recommendModal').classList.remove('active');
    if (window.recommendModalHistoryPushed) {
        window.recommendModalHistoryPushed = false;
        history.back();
    }

    /* 매물 재로드 */
    lvLoadProperties(true);
};

/**
 * 전체 필터 적용 오버라이드 (리스트 페이지용)
 * full-filter.js의 map 전용 applyFullFilter를 리스트 페이지에 맞게 재정의
 */
window.applyFullFilter = async function() {
    console.log('✅ 전체 필터 적용 (리스트 페이지)');

    const filterChip = document.getElementById('filterIconBtn');

    /* 필터 활성 상태 확인 → 칩 버튼 표시 */
    const isActive = checkIfFilterActive();
    if (filterChip) {
        if (isActive) {
            filterChip.classList.add('active');
        } else {
            filterChip.classList.remove('active');
        }
    }

    /* 필터 아이콘 상태 업데이트 */
    updateFilterIconState();

    /* 필터 페이지 닫기 */
    closeFullFilterPage();

    /* 매물 재로드 */
    lvLoadProperties(true);
};

/* ════════════════════════════════════════════════════════════
   최근 검색어
   ════════════════════════════════════════════════════════════ */

function lvLoadRecentSearches() {
    try {
        const loaded = JSON.parse(localStorage.getItem('lvRecentSearches') || '[]');
        lvRecentSearches = Array.isArray(loaded)
            ? loaded.map(v => String(v).trim()).filter(v => /^\d+$/.test(v))
            : [];
    } catch (e) {
        lvRecentSearches = [];
    }
}

function lvSaveRecent(keyword) {
    if (!/^\d+$/.test(String(keyword || '').trim())) return;
    lvRecentSearches = [keyword, ...lvRecentSearches.filter(k => k !== keyword)].slice(0, 8);
    try {
        localStorage.setItem('lvRecentSearches', JSON.stringify(lvRecentSearches));
    } catch (e) { /* 무시 */ }
}

function lvClearRecent() {
    lvRecentSearches = [];
    localStorage.removeItem('lvRecentSearches');
    lvShowRecent();
}

/**
 * 최근 검색어 표시
 */
function lvShowRecent() {
    const body = document.getElementById('searchResults');
    if (!body) return;

    if (lvRecentSearches.length === 0) {
        body.innerHTML = `<div class="search-no-results-msg"><p>검색어를 입력해 주세요.<br>매물번호로 검색할 수 있습니다.</p></div>`;
        return;
    }

    let html = `
        <div class="search-recent-section">
            <h4>최근 검색</h4>
            <button class="lv-recent-clear" onclick="lvClearRecent()">전체 삭제</button>
        </div>
    `;

    lvRecentSearches.forEach(keyword => {
        html += `
            <div class="search-recent-item" onclick="lvPerformSearch('${keyword}')">${keyword}</div>
        `;
    });

    body.innerHTML = html;
}
