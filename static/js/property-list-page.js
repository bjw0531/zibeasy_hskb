/**
 * property-list-page.js
 * 매물 목록 별도 페이지 전용 스크립트
 * main.js의 카드 생성/포맷팅 함수를 복사하여 독립 실행
 */

// ✅ View Transitions API 크로스 문서 전환 지원 여부
// (pagereveal/pageswap 핸들러는 property_list.html head에서 인라인으로 등록)
const hasViewTransitions = 'onpagereveal' in window;

// ✅ 페이지네이션 상태
const PAGE_SIZE = 20;
let allProperties = [];      // 전체 매물 데이터 (역 필터 시에만 사용)
let currentPage = 1;          // 현재 페이지 (클라이언트 페이지네이션, 역 필터 시)
let currentOffset = 0;        // 서버 페이지네이션 offset
let hasMore = true;           // 더 로드할 데이터가 있는지
let isStationFilter = false;  // 역 주변 필터 여부 (클라이언트 거리 계산 필요)
let isLoading = false;        // 로딩 중 여부
let intersectionObserver = null; // 무한 스크롤 옵저버

// ✅ 정렬 상태 ('recent': 최근 수정순, 'distance': 거리 가까운순)
let currentSort = 'recent';
let mapCenterLat = NaN;  // 지도 중심 위도 (URL center_lat)
let mapCenterLng = NaN;  // 지도 중심 경도 (URL center_lng)
let hasMapCenter = false; // 지도 중심 좌표 보유 여부

/* ✅ 광역 클러스터 필터 코드 (sessionStorage → 모듈 변수로 이관)
   페이지네이션 시 buildApiParams()가 재호출되므로 sessionStorage에서
   한 번만 읽고 모듈 변수에 보존, sessionStorage는 즉시 정리 */
const _clusterCodes = (function() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('from_cluster') !== '1') return null;
    const saved = sessionStorage.getItem('clusterFilterCodes');
    if (saved) sessionStorage.removeItem('clusterFilterCodes');
    return saved || null;
})();

/**
 * ✅ 페이지 초기화
 * URL 파라미터에서 필터 조건을 읽어 API 호출
 */
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📋 매물 목록 페이지 초기화');

    // ✅ pushState 버퍼의 fake→real 이동 시 브라우저 스크롤 자동 복원 방지
    // (뒤로가기 시 스크롤이 맨 위로 튀었다가 페이지가 닫히는 문제 해결)
    if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
    }

    // 뒤로가기 버튼 이벤트
    const backBtn = document.getElementById('listPageBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', handleBack);
    }

    // ✅ 네이티브 뒤로가기 인터셉트 — VT 지원 여부 무관하게 항상 등록
    // pushState 버퍼: 앱 탭바 네이티브 뒤로가기가 VT를 우회하는 문제 해결
    // 원리: native back → fake→real (popstate) → JS에서 programmatic history.back()
    //       → cross-document VT 정상 작동 (양쪽 페이지 동시 합성, 그림자 없음)
    // ✅ 중복 pushState 방지: 상세 페이지에서 뒤로가기로 돌아올 때 list page가 reload되면
    //    이미 fake 엔트리(state.listPage=true) 위치에 있으므로 pushState를 건너뜀
    //    (중복 호출 시 fake 엔트리가 2개 쌓여 뒤로가기를 두 번 눌러야 하는 문제 발생)
    if (!history.state || !history.state.listPage) {
        history.pushState({ listPage: true }, '');
    }
    window.addEventListener('popstate', function(e) {
        // 앞으로가기(state=listPage)면 스킵
        if (e.state && e.state.listPage) return;

        const wrapper = document.querySelector('.list-page-wrapper');
        if (!wrapper) { history.back(); return; }

        // handleBack() 진행 중이든 네이티브 뒤로가기든 동일하게 VT로 처리
        if (!wrapper.dataset.animatingOut) {
            wrapper.dataset.animatingOut = '1';
        }
        // ✅ VT 방향 명시 설정 → index.html pagereveal에서 vt-slide-down 클래스 적용
        // pageswap도 traverse 시 자동 설정하지만 popstate 시점에 미리 보장
        sessionStorage.setItem('navDirection', 'slide-down');
        history.back(); // real list → index.html (cross-document, VT가 양쪽 페이지 동시 애니메이션)
    });

    // 찜하기 상태 복원
    if (typeof restoreLikedState === 'function') {
        restoreLikedState();
    }

    // ✅ 지도 중심 좌표 URL 파라미터에서 읽기 (정렬에 사용)
    const _initParams = new URLSearchParams(window.location.search);
    mapCenterLat = parseFloat(_initParams.get('center_lat'));
    mapCenterLng = parseFloat(_initParams.get('center_lng'));
    hasMapCenter = !isNaN(mapCenterLat) && !isNaN(mapCenterLng);

    // ✅ 기본 정렬 설정: 크로스헤어(표적 아이콘) 활성 상태로 진입하면 거리 가까운순
    //    그 외의 경우(일반 진입, 크로스헤어 꺼짐)는 최근 수정순
    const defaultSort = _initParams.get('default_sort');
    if (defaultSort === 'distance' && hasMapCenter) {
        currentSort = 'distance';
    }

    // ✅ 정렬 탭바 표시 조건
    // show_sort_tabs=1 인 경우에만 노출 (파라미터 미지정은 하위호환으로 노출)
    // 단, 관심목록(label=관심목록)은 기존 정책대로 항상 숨김
    const sortTabBar = document.getElementById('sortTabBar');
    const showSortTabsParam = _initParams.get('show_sort_tabs');
    const allowSortTabsByEntry = (showSortTabsParam === null || showSortTabsParam === '1');
    const isLikedListPage = (_initParams.get('label') === '관심목록');
    const shouldShowSortTabs = allowSortTabsByEntry && !isLikedListPage;

    if (sortTabBar && !shouldShowSortTabs) {
        sortTabBar.style.display = 'none';
    }

    // ✅ 정렬 탭이 보일 때만 초기화 (좌표 없으면 거리순 버튼 비활성화)
    if (shouldShowSortTabs) {
        initSortToggle();
    }

    // ✅ 상세 페이지에서 뒤로가기로 돌아온 경우: 저장된 상태 복원
    const restored = tryRestoreState();
    if (restored) {
        console.log('✅ 저장된 목록 상태 복원 완료');
        return; // API 호출 스킵
    }

    // API 호출하여 매물 로드
    await loadProperties();
});

/**
 * ✅ 뒤로가기 처리 (X/← 버튼 클릭 시)
 * pushState 버퍼 소진 → popstate 발생 → VT로 index.html 이동
 */
function handleBack() {
    const wrapper = document.querySelector('.list-page-wrapper');
    if (wrapper) {
        // ✅ 중복 실행 방지
        if (wrapper.dataset.animatingOut) return;
        // ✅ 플래그 설정 — popstate 핸들러와 협조
        wrapper.dataset.animatingOut = '1';
        // pushState 버퍼 소진 (fake→real, 같은 페이지)
        // → popstate 핸들러에서 navDirection 설정 후 index.html로 이동 (VT 처리)
        history.back();
    } else {
        history.back();
    }
}

/**
 * ✅ URL 파라미터에서 API 호출 파라미터 구성
 * @param {number} offset - 서버 페이지네이션 시작 위치
 */
function buildApiParams(offset = 0) {
    const urlParams = new URLSearchParams(window.location.search);
    const apiParams = new URLSearchParams();

    /* ✅ 역 주변 필터 여부를 먼저 판단 (bounds 포함 여부 결정에 사용) */
    isStationFilter = urlParams.has('station_lat') && urlParams.has('station_lng');

    /* ✅ 지도 영역 파라미터 — 역 필터 시 제외
       역 반경은 현재 지도 화면보다 넓을 수 있으므로 bounds로 제한하면
       실제 반경 내 매물이 누락됨. 역 필터는 limit=1000 + 클라이언트 거리 계산으로 처리 */
    if (!isStationFilter) {
        ['sw_lat', 'sw_lng', 'ne_lat', 'ne_lng'].forEach(key => {
            if (urlParams.has(key)) apiParams.set(key, urlParams.get(key));
        });
    }

    // 필터 파라미터들
    const filterKeys = [
        'category', 'trade_type',
        'deposit_min', 'deposit_max',
        'monthly_min', 'monthly_max',
        'include_management',
        'kitchen', 'balcony', 'room_type',
        'area_min', 'area_max',
        'floor', 'building_age',
        'options', 'thema', 'thema_categories',
        'dong', 'codes',
        'property_status', 'listing_scope'
    ];

    filterKeys.forEach(key => {
        if (urlParams.has(key)) apiParams.set(key, urlParams.get(key));
    });

    /* 광역 클러스터 codes는 URL에 포함하지 않고 fetchProperties()에서 POST body로 전달 */

    if (isStationFilter) {
        // 역 주변: 전체 데이터를 가져와서 클라이언트에서 거리 필터링 (기존 유지)
        apiParams.set('limit', '1000');
    } else {
        // ✅ 최근 수정순 / 거리 가까운순 모두 서버 페이지네이션 (20개씩)
        apiParams.set('limit', String(PAGE_SIZE));
        apiParams.set('offset', String(offset));

        // ✅ 거리순 정렬: 서버에 sort=distance + 지도 중심 좌표 전달
        //    → 서버가 ST_Distance_Sphere로 정렬 후 20개씩 반환 (버퍼링 없음)
        if (currentSort === 'distance' && hasMapCenter) {
            apiParams.set('sort', 'distance');
            apiParams.set('center_lat', String(mapCenterLat));
            apiParams.set('center_lng', String(mapCenterLng));
        }
    }

    apiParams.set('mode', 'full');

    return apiParams;
}

/**
 * ✅ API 호출 헬퍼: 광역 클러스터 codes가 있을 때 POST body로 전달하여 URL 길이 한계 회피
 * 일반적인 경우(codes 없음)는 기존 GET 방식 그대로 유지
 * @param {URLSearchParams} apiParams - buildApiParams()로 생성된 파라미터
 * @returns {Promise<Response>}
 */
async function fetchProperties(apiParams) {
    if (_clusterCodes) {
        /* 광역 클러스터: codes를 JSON body로 전달 (POST) */
        return fetch('/api/properties?' + apiParams.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codes: _clusterCodes })
        });
    }
    /* 일반: GET 방식 */
    return fetch('/api/properties?' + apiParams.toString());
}

/**
 * ✅ 매물 데이터 초기 로드
 */
async function loadProperties() {
    const contentEl = document.getElementById('listPageContent');
    const countEl = document.getElementById('listPageCount');
    const labelEl = document.getElementById('listPageLabel');

    if (!contentEl) return;

    // 로딩 표시
    contentEl.innerHTML = `
        <div class="list-page-loading">
            <div class="spinner"></div>
            <p>매물을 불러오는 중...</p>
        </div>
    `;

    try {
        // ✅ 초기 상태 리셋
        currentOffset = 0;
        currentPage = 1;
        hasMore = true;
        allProperties = [];

        const apiParams = buildApiParams(0);
        /* ✅ 광역 클러스터 시 POST, 일반 시 GET */
        const response = await fetchProperties(apiParams);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (!data.success || !data.data || data.data.length === 0) {
            showEmpty(contentEl);
            if (countEl) countEl.textContent = '0';
            return;
        }

        let properties = data.data;

        const urlParams = new URLSearchParams(window.location.search);

        // ✅ 역 주변 필터: 클라이언트 사이드 거리 필터링 (limit=1000으로 전체 로드됨)
        if (isStationFilter) {
            const stationLat = parseFloat(urlParams.get('station_lat'));
            const stationLng = parseFloat(urlParams.get('station_lng'));
            const radius = parseFloat(urlParams.get('station_radius') || '500');

            properties = properties.filter(p => {
                const dist = calculateDistance(stationLat, stationLng, parseFloat(p.lat), parseFloat(p.lng));
                return dist <= radius / 1000; // km 단위
            });

            // 역 필터 + 거리순: 지도 중심 기준 거리 계산 및 정렬
            if (currentSort === 'distance' && hasMapCenter) {
                properties = properties.map(p => {
                    const dist = calculateDistance(mapCenterLat, mapCenterLng, parseFloat(p.lat), parseFloat(p.lng));
                    return { ...p, _distance: dist };
                }).sort((a, b) => a._distance - b._distance);
            } else {
                // 역 필터 + 최근 수정순: ldate 기준 내림차순 정렬
                properties = properties.sort((a, b) => {
                    const da = new Date((a.ldate || '') + '+09:00');
                    const db = new Date((b.ldate || '') + '+09:00');
                    return db - da;
                });
            }

            // 역 필터: 클라이언트 페이지네이션 사용
            allProperties = properties;
            hasMore = allProperties.length > PAGE_SIZE;
        }

        // 레이블 업데이트 (label 파라미터 없으면 빈 문자열로 숨김)
        if (labelEl) {
            const label = urlParams.get('label') || '';
            labelEl.textContent = label;
            // ✅ 라벨이 없으면 여백도 제거
            labelEl.style.marginRight = label ? '4px' : '0';
        }

        // ✅ 매물 수량 업데이트
        const urlTotalCount = urlParams.get('total_count');

        if (isStationFilter) {
            // 역 필터(클라이언트 페이지네이션): 필터링된 실제 개수
            if (countEl) countEl.textContent = allProperties.length;
        } else {
            // ✅ 최근 수정순 / 거리순 모두 서버 페이지네이션
            if (countEl) countEl.textContent = urlTotalCount || data.count || properties.length;
            // 반환된 개수가 PAGE_SIZE 미만이면 마지막 페이지
            hasMore = properties.length >= PAGE_SIZE;
            currentOffset = properties.length;
        }

        // ✅ 첫 페이지 렌더링
        const displayProperties = isStationFilter
            ? allProperties.slice(0, PAGE_SIZE)
            : properties;

        renderCards(contentEl, displayProperties, false);

        console.log(`✅ 매물 ${displayProperties.length}개 표시 완료 (sort: ${currentSort}, 서버 페이지네이션: ${!isStationFilter})`);

    } catch (error) {
        console.error('❌ 매물 로드 실패:', error);
        contentEl.innerHTML = `
            <div class="list-page-empty">
                <div class="list-page-empty-icon">⚠️</div>
                <div class="list-page-empty-title">매물을 불러올 수 없습니다</div>
                <div class="list-page-empty-message">
                    네트워크 연결을 확인하고<br>다시 시도해주세요.
                </div>
            </div>
        `;
    }
}

/**
 * ✅ 다음 페이지 로드 (무한 스크롤 트리거)
 */
async function loadNextPage() {
    if (isLoading || !hasMore) return;
    isLoading = true;

    const contentEl = document.getElementById('listPageContent');
    if (!contentEl) { isLoading = false; return; }

    // ✅ 클라이언트 페이지네이션 여부 (역 필터만 해당 / 거리순은 서버 페이지네이션으로 통합)
    const needsClientPaging = isStationFilter;

    if (needsClientPaging) {
        // ── 클라이언트 페이지네이션 (메모리에서 슬라이싱) ──
        currentPage++;
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageProperties = allProperties.slice(startIndex, startIndex + PAGE_SIZE);

        if (pageProperties.length === 0) {
            hasMore = false;
            isLoading = false;
            return;
        }

        renderCards(contentEl, pageProperties, true);
        // 더 이상 로드할 데이터 확인
        hasMore = (currentPage * PAGE_SIZE) < allProperties.length;
        isLoading = false;
        console.log(`📄 클라이언트 페이지 ${currentPage}: ${pageProperties.length}개 추가`);

    } else {
        // ── 일반: 서버 페이지네이션 (API에서 다음 20개 요청) ──
        try {
            const apiParams = buildApiParams(currentOffset);
            /* ✅ 광역 클러스터 시 POST, 일반 시 GET */
            const response = await fetchProperties(apiParams);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            if (!data.success || !data.data || data.data.length === 0) {
                hasMore = false;
                isLoading = false;
                return;
            }

            const properties = data.data;
            currentOffset += properties.length;
            hasMore = properties.length >= PAGE_SIZE;

            renderCards(contentEl, properties, true);
            isLoading = false;
            console.log(`📄 서버 페이지 로드: offset=${currentOffset}, ${properties.length}개 추가`);

        } catch (error) {
            console.error('❌ 추가 매물 로드 실패:', error);
            isLoading = false;
        }
    }
}

/**
 * ✅ 카드 렌더링 (공통)
 * @param {HTMLElement} contentEl - 카드를 삽입할 컨테이너
 * @param {Array} properties - 렌더링할 매물 배열
 * @param {boolean} append - true면 기존 카드 뒤에 추가, false면 전체 교체
 */
function renderCards(contentEl, properties, append = false) {
    if (properties.length === 0) {
        if (!append) showEmpty(contentEl);
        return;
    }

    const html = properties.map(p => createPropertyCard(p)).join('');

    if (append) {
        contentEl.insertAdjacentHTML('beforeend', html);
    } else {
        contentEl.innerHTML = html;
    }

    // 찜하기 상태 복원
    if (typeof restoreLikedState === 'function') {
        restoreLikedState();
    }

    if (window.propertyPreviewSlider && typeof window.propertyPreviewSlider.init === 'function') {
        window.propertyPreviewSlider.init(contentEl);
    }

    // 무한 스크롤 설정
    setupInfiniteScroll(contentEl);
}

/**
 * ✅ 무한 스크롤 설정 (Intersection Observer)
 */
function setupInfiniteScroll(contentEl) {
    // 기존 옵저버 정리
    if (intersectionObserver) {
        intersectionObserver.disconnect();
    }

    // 더 로드할 데이터가 없으면 설정하지 않음
    if (!hasMore) return;

    const cards = contentEl.querySelectorAll('.property-card');
    const totalCards = cards.length;

    // 카드가 3개 미만이면 설정하지 않음
    if (totalCards < 3) return;

    // 끝에서 3번째 카드 감지
    const targetCard = cards[totalCards - 3];
    if (!targetCard) return;

    intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoading) {
                console.log('📜 다음 페이지 로드 트리거');
                loadNextPage();
            }
        });
    }, {
        root: document.getElementById('listPageContent'),
        threshold: 0.1
    });

    intersectionObserver.observe(targetCard);
}

/**
 * ✅ 빈 상태 표시
 */
function showEmpty(contentEl) {
    contentEl.innerHTML = `
        <div class="list-page-empty">
            <div class="list-page-empty-icon">🏠</div>
            <div class="list-page-empty-title">매물이 없습니다</div>
            <div class="list-page-empty-message">
                검색 조건을 변경하거나<br>다른 지역을 확인해보세요.
            </div>
        </div>
    `;
}

// ============================================
// 아래 함수들은 main.js에서 복사 (독립 실행)
// ============================================

/**
 * ✅ 매물 카드 HTML 생성 (main.js createPropertyCard 복사)
 */
function createPropertyCard(property) {
    const address = formatAddress(property);
    const thumbInner = (window.propertyPreviewSlider && typeof window.propertyPreviewSlider.buildThumbMarkup === 'function')
        ? window.propertyPreviewSlider.buildThumbMarkup(property)
        : (property.picname1
            ? `<img src="/images/maemul/thumb/${property.picname1}" alt="${property.title || '매물 이미지'}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'property-image-placeholder\\'>📷</div>'">`
            : `<div class="property-image-placeholder">📷</div>`);

    // 계약완료 여부 확인
    const isContractCompleted = property.contract === '계약완료';

    // 계약완료가 아닐 때만 가격/관리비/시간 표시
    const price = isContractCompleted ? '계약완료' : formatPrice(property);
    const publicMoney = isContractCompleted ? '' : formatPublicMoney(property.public_money);
    const timeAgo = isContractCompleted ? '' : formatTimeAgo(property.ldate);

    // 매물 종류와 층 정보 포맷팅
    const getCategoryName = (category) => {
        const categoryMap = {
            '90': '"원룸"',
            '91': '"투베이"',
            '92': '"무보증/단기"',
            '93': '"투룸"',
            '94': '"쓰리룸"'
        };
        return categoryMap[String(category)] || '';
    };

    const propertyType = property.category
        ? getCategoryName(property.category)
        : (property.build_use_type || '');

    // 계약완료면 층정보 숨김
    const floorInfo = isContractCompleted ? '' : (
        property.now_floor && property.total_floor
            ? `총 ${property.total_floor}층 중 ${property.now_floor}층`
            : property.now_floor
                ? `${property.now_floor}층`
                : ''
    );

    const propertyInfo = [];
    if (propertyType) propertyInfo.push(`<span style="font-size: 13px;">${propertyType}</span>`);
    if (floorInfo) propertyInfo.push(floorInfo);
    const infoText = propertyInfo.length > 0 ? ` ${propertyInfo.join(' ')}` : '';

    // 계약완료면 빨간색 볼드
    const priceStyle = isContractCompleted ? 'color: #e53935; font-weight: bold;' : '';

    // 확인필요면 빨간색 스타일
    const timeStyle = timeAgo === '확인필요'
        ? 'font-size: 12px; color: #e53935; font-weight: 500;'
        : 'font-size: 12px; color: rgb(100, 100, 100);';

    // ✅ 거리순 정렬 시 거리 배지 표시 (지도 중심으로부터의 거리)
    const distanceBadge = (currentSort === 'distance' && property._distance !== undefined)
        ? `<span class="distance-badge"><svg width="11" height="11" viewBox="0 -960 960 960" fill="currentColor" style="vertical-align:-1px;flex-shrink:0"><path d="M480-480q33 0 56.5-23.5T560-560q0-33-23.5-56.5T480-640q-33 0-56.5 23.5T480-480Zm0 400Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Z"/></svg> ${formatDistance(property._distance)}</span>`
        : '';

    // 계약완료면 end.png 오버레이 표시
    const contractOverlay = isContractCompleted
        ? `<img src="/static/images/end.png" alt="계약완료" class="absolute inset-0 w-full h-full object-cover z-[6]">`
        : '';

    return `
        <div class="property-card" data-property-id="${property.idx}" onclick="navigateToDetail('${property.code}')">
            <div class="property-image">
                <div class="absolute top-0 right-0 z-10 pr-1 pl-2 pb-2 pt-1" onclick="event.stopPropagation(); toggleLike('${property.code || property.idx}')">
                    <svg class="w-6 h-6 heart-unliked"
                        data-like-btn="${property.code || property.idx}"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 256 256"
                        stroke="white"
                        stroke-width="10"
                        fill="currentColor">
                        <path d="M223,57a58.07,58.07,0,0,0-81.92-.1L128,69.05 114.91,56.86A58,58,0,0,0,33,139l89.35,90.66a8,8,0,0,0,11.4,0L223,139a58,58,0,0,0,0-82Z"></path>
                    </svg>
                </div>
                ${thumbInner}
                ${contractOverlay}
                ${!isContractCompleted && property.movie && property.movie.trim() !== ''
            ? `<div class="absolute bottom-[6%] left-[6%] z-[6] flex items-center justify-center" style="width: clamp(20px, 16%, 44px); height: clamp(20px, 16%, 44px);" title="영상 있음">
                    <img src="/static/images/movie_icon.png" alt="영상 있음" class="w-full h-full object-contain">
                </div>`
            : ''}
            </div>
            <div class="property-card-info">
                <div class="flex" style="align-items: center; gap: 6px; flex-wrap: wrap;">
                    <div class="property-card-number" style="display: inline-block; padding: 2px 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 11px; color: #666; background: #f9f9f9;">매물번호 ${property.code || property.idx}</div>
                </div>
                <div class="property-card-price" style="${priceStyle}">
                    <span class="price-main">${price}</span>
                    ${publicMoney ? `<span class="price-management">${publicMoney}</span>` : ''}
                </div>
                <div class="property-card-address" style="color: rgb(120, 120, 120);">${address}${infoText}</div>
                <div class="property-card-title" style="color: rgb(50, 50, 50);">${(property.title || '상세 설명이 없습니다.').replace(/\[.*?\]/g, '').trim()}</div>
                ${(timeAgo || distanceBadge) ? `<div class="property-card-time text-xs font-normal" style="${timeStyle}; display: flex; justify-content: flex-end; align-items: center; width: 100%; text-align: right; gap: 8px; padding-right: 10px;"><span>${timeAgo || ''}</span>${distanceBadge ? `<span>${distanceBadge}</span>` : ''}</div>` : ''}
            </div>
        </div>
    `;
}

/**
 * ✅ 가격 포맷팅 (main.js formatPrice 복사)
 */
function formatPrice(property) {
    const maemae = property.maemae_money || 0;
    const jeonse = property.jen_money || 0;
    const deposit = property.security_money || 0;
    const monthly = property.month_money || 0;

    if (maemae > 0) {
        return `매매 ${maemae}만원`;
    } else if (jeonse > 0) {
        return `전세 ${jeonse}만원`;
    } else if (deposit > 0 || monthly > 0) {
        const depositText = deposit > 0 ? deposit : "";
        const monthlyText = monthly > 0 ? monthly : "";
        return `월세 ${depositText}/${monthlyText}`.replace(/\/$/, '').trim();
    } else {
        return '';
    }
}

/**
 * ✅ 관리비 포맷팅 (main.js formatPublicMoney 복사)
 */
function formatPublicMoney(amount) {
    if (!amount || amount === 0) return '';
    const amountNum = parseFloat(amount);
    const manwon = Math.floor(amountNum / 10000);
    if (manwon > 0) {
        return `관리비 ${manwon}만원`;
    }
    return '';
}

/**
 * ✅ 주소 포맷팅 (main.js formatAddress 복사)
 */
function formatAddress(property) {
    const parts = property.ri || property.dong;
    return parts || '주소 정보 없음';
}

/**
 * ✅ 시간 포맷팅 (main.js formatTimeAgo 복사)
 */
function formatTimeAgo(dateString) {
    if (!dateString) return '확인필요';

    try {
        const date = new Date(dateString + "+09:00");
        const now = new Date();
        const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
        const diffDay = Math.floor(diffSec / 86400);

        if (diffSec < 60) return '방금 전';
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffSec / 3600);
        const diffWeek = Math.floor(diffSec / 604800);

        if (diffMin < 60) return `${diffMin}분 전`;
        else if (diffHour < 24) return `${diffHour}시간 전`;
        else if (diffDay <= 15) return `${diffDay}일 전`;
        else if (diffDay < 30) return `${diffWeek}주 전`;
        else return '확인필요';

    } catch (e) {
        return '확인필요';
    }
}

/**
 * ✅ Haversine 거리 계산 (main.js 복사)
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // 지구 반경 (km)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * ✅ 매물 상세 페이지 이동 (슬라이드 애니메이션 적용)
 * 이동 전에 현재 목록 상태를 sessionStorage에 저장
 */
function navigateToDetail(propertyCode) {
    // ✅ 현재 목록 상태 저장 (뒤로가기 시 복원용)
    saveListState();

    // 목록에서 상세로 이동했음을 표시 (상세 페이지에서 슬라이드 애니메이션용)
    sessionStorage.setItem('fromListPage', 'true');

    // 탭바 활성 탭 전달 (지도형 패널 목록에서 이동 → 지도 탭 활성화)
    sessionStorage.setItem('navFrom', 'map');

    // ✅ VT 방향 설정 (목록→상세: 오른쪽에서 왼쪽으로 슬라이드)
    sessionStorage.setItem('navDirection', 'slide-right');

    // ✅ bottom-nav를 root 스냅샷에 포함시킴
    //    → 별도 VT 레이어(z-index:9999)가 사라져 새 페이지 contact-bar를 가리지 않음
    var bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) bottomNav.style.viewTransitionName = 'none';

    window.location.href = `/view/${propertyCode}`;
}

// 전역 등록
window.navigateToDetail = navigateToDetail;

/**
 * ✅ 목록 상태 저장 (상세 페이지 이동 전)
 * 카드 HTML, 스크롤 위치, 페이지네이션 상태를 sessionStorage에 저장
 */
function saveListState() {
    const contentEl = document.getElementById('listPageContent');
    const countEl = document.getElementById('listPageCount');
    const labelEl = document.getElementById('listPageLabel');

    if (!contentEl) return;

    const state = {
        // 렌더링된 카드 HTML
        html: contentEl.innerHTML,
        // 스크롤 위치
        scrollTop: contentEl.scrollTop,
        // 헤더 정보
        count: countEl ? countEl.textContent : '0',
        label: labelEl ? labelEl.textContent : '전체',
        // 페이지네이션 상태
        currentOffset: currentOffset,
        currentPage: currentPage,
        hasMore: hasMore,
        isStationFilter: isStationFilter,
        // ✅ 정렬 상태
        currentSort: currentSort,
        // 현재 URL (같은 필터 조건인지 확인용)
        url: window.location.href
    };

    try {
        sessionStorage.setItem('listPageState', JSON.stringify(state));
        console.log('💾 목록 상태 저장 완료 (스크롤:', state.scrollTop + 'px)');
    } catch (e) {
        // sessionStorage 용량 초과 시 무시 (정상 로딩으로 폴백)
        console.warn('⚠️ 목록 상태 저장 실패:', e);
    }
}

/**
 * ✅ 목록 상태 복원 (상세 페이지에서 뒤로가기 시)
 * @returns {boolean} 복원 성공 여부
 */
function tryRestoreState() {
    const saved = sessionStorage.getItem('listPageState');
    if (!saved) return false;

    // 사용 후 즉시 삭제 (다음 방문 시 새로 로드)
    sessionStorage.removeItem('listPageState');

    try {
        const state = JSON.parse(saved);

        // ✅ URL이 다르면 복원하지 않음 (다른 필터 조건)
        if (state.url !== window.location.href) return false;

        const contentEl = document.getElementById('listPageContent');
        const countEl = document.getElementById('listPageCount');
        const labelEl = document.getElementById('listPageLabel');
        const wrapper = document.querySelector('.list-page-wrapper');

        if (!contentEl || !state.html) return false;

        // ✅ 슬라이드 인 애니메이션 제거 (즉시 표시)
        if (wrapper) {
            wrapper.classList.add('no-animation');
        }

        // ✅ 카드 HTML 즉시 복원
        contentEl.innerHTML = state.html;

        // ✅ 헤더 정보 복원
        if (countEl) countEl.textContent = state.count;
        if (labelEl) labelEl.textContent = state.label;

        // ✅ 페이지네이션 상태 복원
        currentOffset = state.currentOffset || 0;
        currentPage = state.currentPage || 1;
        hasMore = state.hasMore !== undefined ? state.hasMore : true;
        isStationFilter = state.isStationFilter || false;

        // ✅ 정렬 상태 복원
        if (state.currentSort) {
            currentSort = state.currentSort;
            updateSortUI(currentSort);
        }

        // ✅ 스크롤 위치 복원 (DOM 렌더링 후)
        requestAnimationFrame(() => {
            contentEl.scrollTop = state.scrollTop || 0;
        });

        // ✅ 찜하기 상태 복원
        if (typeof restoreLikedState === 'function') {
            restoreLikedState();
        }

        if (window.propertyPreviewSlider && typeof window.propertyPreviewSlider.init === 'function') {
            window.propertyPreviewSlider.init(contentEl);
        }

        // ✅ 무한 스크롤 재설정
        setupInfiniteScroll(contentEl);

        return true;

    } catch (e) {
        console.warn('⚠️ 목록 상태 복원 실패:', e);
        return false;
    }
}

/**
 * ✅ 찜하기 상태 복원 (liked.js의 getLikedList 활용)
 */
function restoreLikedState() {
    if (typeof getLikedList !== 'function') return;

    const likedList = getLikedList();
    if (!likedList || likedList.length === 0) return;

    // 모든 하트 버튼 확인
    document.querySelectorAll('[data-like-btn]').forEach(btn => {
        const id = btn.getAttribute('data-like-btn');
        if (likedList.includes(String(id))) {
            btn.classList.remove('heart-unliked');
            btn.classList.add('heart-liked');
        }
    });
}

// ============================================
// 정렬 탭 관련 함수
// ============================================

/**
 * ✅ 정렬 탭 초기화
 * 지도 중심 좌표가 없으면 '거리 가까운순' 버튼 비활성화
 */
function initSortToggle() {
    const tabDistance = document.getElementById('sortTabDistance');
    if (!tabDistance) return;

    if (!hasMapCenter) {
        // 지도 중심 좌표 없으면 거리순 버튼 + 인포 아이콘 비활성화
        tabDistance.disabled = true;
        const infoDistance = document.querySelector('[data-popover="popoverDistance"]');
        if (infoDistance) infoDistance.disabled = true;
    }

    // ✅ 현재 정렬 상태 반영 (복원된 경우 대비)
    updateSortUI(currentSort);

    // ✅ 인포 아이콘 클릭 — 말풍선 팝오버 토글 + 5초 자동 닫기
    var autoCloseTimer = null; // 자동 닫기 타이머 핸들

    function closeAllPopovers() {
        document.querySelectorAll('.sort-info-popover').forEach(function(p) {
            p.classList.remove('visible');
        });
        if (autoCloseTimer) {
            clearTimeout(autoCloseTimer);
            autoCloseTimer = null;
        }
    }

    document.querySelectorAll('.sort-info-btn').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.stopPropagation(); // 탭바 클릭 이벤트 버블링 방지
            var targetId = this.dataset.popover;
            var popover = document.getElementById(targetId);
            if (!popover) return;

            var isVisible = popover.classList.contains('visible');
            // 모든 팝오버 먼저 닫기 + 기존 타이머 해제
            closeAllPopovers();

            // 이미 열려 있지 않았으면 열기
            if (!isVisible) {
                popover.classList.add('visible');
                // ✅ 5초 후 자동으로 닫기
                autoCloseTimer = setTimeout(function() {
                    popover.classList.remove('visible');
                    autoCloseTimer = null;
                }, 5000);
            }
        });
    });

    // ✅ 팝오버 외부 영역 클릭 시 모두 닫기
    document.addEventListener('click', function() {
        closeAllPopovers();
    });
}

/**
 * ✅ 정렬 탭 UI 업데이트
 * @param {string} mode - 'recent' | 'distance'
 */
function updateSortUI(mode) {
    const tabRecent   = document.getElementById('sortTabRecent');
    const tabDistance = document.getElementById('sortTabDistance');
    if (!tabRecent || !tabDistance) return;

    if (mode === 'distance') {
        tabRecent.classList.remove('sort-tab--active');
        tabDistance.classList.add('sort-tab--active');
    } else {
        tabRecent.classList.add('sort-tab--active');
        tabDistance.classList.remove('sort-tab--active');
    }
}

/**
 * ✅ 정렬 모드 변경 (탭 클릭 시 호출)
 * 모드가 바뀌면 데이터를 처음부터 다시 로드
 * @param {string} mode - 'recent' | 'distance'
 */
function changeSortMode(mode) {
    // 이미 같은 모드면 무시
    if (mode === currentSort) return;

    // 거리순 선택 시 중심 좌표 없으면 무시
    if (mode === 'distance' && !hasMapCenter) return;

    currentSort = mode;
    updateSortUI(mode);

    // ✅ 상태 초기화 후 재로드
    currentOffset = 0;
    currentPage   = 1;
    hasMore       = true;
    allProperties = [];

    loadProperties();
    console.log(`🔃 정렬 변경: ${mode === 'recent' ? '최근 수정순' : '거리 가까운순'}`);
}

// ✅ changeSortMode 전역 등록 (HTML onclick에서 사용)
window.changeSortMode = changeSortMode;

/**
 * ✅ 거리 포맷팅 (km → 읽기 좋은 문자열)
 * @param {number} km - 킬로미터 단위 거리
 * @returns {string} 포맷된 거리 문자열
 */
function formatDistance(km) {
    if (km < 1) return Math.round(km * 1000) + 'm';
    return km.toFixed(1) + 'km';
}
