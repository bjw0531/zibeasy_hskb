/**
 * 매물 목록 페이지 버튼 연동 스크립트
 * - listPageBtn 버튼의 수량/레이블을 기존 패널과 동기화
 * - openListPage(): 현재 필터 상태를 저장하고 목록 페이지로 이동
 * - updatePanelLabel 래핑: 레이블 우선순위 로직 적용
 *
 * 의존성:
 *   - list.js (updatePanelLabel, getThemeDisplayName)
 *   - property-type-filter.js (getPropertyTypeDisplayName)
 *   - window.appManager, window.stationManager, window.currentDongSearch 등
 *
 * ⚠️ body 최하단에서 로드해야 DOM 요소 접근 가능
 */
(function() {
    'use strict';

    /* 새 버튼의 수량/레이블 요소 */
    const btnCount = document.getElementById('listPageBtnCount');
    const btnLabel = document.getElementById('listPageBtnLabel');

    /* 기존 패널의 수량 요소 (숨겨진 상태지만 여전히 업데이트됨) */
    const panelCount = document.getElementById('propertyCount');

    /* ── 1. MutationObserver로 수량 실시간 동기화 ──
       기존 코드가 #propertyCount를 업데이트하면 새 버튼에도 반영 */
    if (panelCount && btnCount) {
        const countObserver = new MutationObserver(function() {
            btnCount.textContent = panelCount.textContent;
        });
        countObserver.observe(panelCount, {
            childList: true,
            characterData: true,
            subtree: true
        });
        /* 초기값 동기화 */
        btnCount.textContent = panelCount.textContent;
    }

    /* ── 2. updatePanelLabel 래핑하여 새 버튼 레이블도 업데이트 ──
       기존 updatePanelLabel이 호출될 때 새 버튼의 레이블도 함께 갱신 */
    const originalUpdatePanelLabel = window.updatePanelLabel;

    function syncBtnLabel() {
        /* 기존 함수 먼저 실행 (패널이 숨겨져 있어도 내부 상태는 갱신됨) */
        if (typeof originalUpdatePanelLabel === 'function') {
            originalUpdatePanelLabel();
        }
        /* 레이블 텍스트 결정 */
        if (!btnLabel) return;

        /* ✅ 1순위: 지역 텍스트 추출 (동, 역, 지역 검색)
           조합 규칙: 지역이 있으면 지역 표시, 매물종류도 있으면 "지역 매물종류", 테마는 무시
                     지역 없이 매물종류만: 매물종류만 표시, 테마 무시
                     지역/매물종류 없이 테마만: 테마 표시
                     아무것도 없으면: '전체' */
        let locationText = '';
        let isMultiDong = false; // ✅ 동 2개 이상 선택 여부
        if (window.currentDongSearch && window.currentDongSearch.locationName) {
            const dongNames = window.currentDongSearch.locationNames;
            if (dongNames && dongNames.length >= 2) {
                // ✅ 2개 이상 동 선택 시 "N개 지역" 형식
                locationText = `${dongNames.length}개 지역`;
                isMultiDong = true;
            } else {
                locationText = window.currentDongSearch.locationName;
            }
        } else if (window.stationManager && window.stationManager.isStationFilterActive && window.stationManager.selectedStation) {
            locationText = window.stationManager.selectedStation.name;
        } else if (window.currentLocationSearch && window.currentLocationSearch.locationName) {
            locationText = window.currentLocationSearch.locationName;
        }

        /* ✅ 2순위: 매물종류 텍스트 추출 */
        let propertyTypeText = '';
        if (window.selectedPropertyCategory && window.selectedPropertyCategory.length > 0) {
            const cats = window.selectedPropertyCategory;
            if (cats.length === 1 && typeof getPropertyTypeDisplayName === 'function') {
                propertyTypeText = getPropertyTypeDisplayName(cats[0]);
            } else if (typeof getPropertyTypeDisplayName === 'function') {
                propertyTypeText = getPropertyTypeDisplayName(cats[0]) + ' 외';
            }
        }

        /* ✅ 3순위: 테마 텍스트 추출 */
        let themeText = '';
        if (window.currentThemeFilter) {
            if (window.currentThemeFilter.label) {
                themeText = window.currentThemeFilter.label;
            } else if (typeof window.currentThemeFilter === 'string' && typeof getThemeDisplayName === 'function') {
                themeText = getThemeDisplayName(window.currentThemeFilter);
            } else if (window.currentThemeFilter.column && typeof getThemeDisplayName === 'function') {
                themeText = getThemeDisplayName(window.currentThemeFilter.column);
            }
        } else if (window.currentRecommendFilter) {
            if (window.currentRecommendFilter.label) {
                themeText = window.currentRecommendFilter.label;
            } else if (typeof getThemeDisplayName === 'function') {
                themeText = getThemeDisplayName(window.currentRecommendFilter);
            }
        }

        /* ✅ 조합 규칙 적용
           동 2개 이상 + 매물종류 있음  → "N개 지역 투룸" or "N개 지역 투룸 외"
           동 2개 이상 + 매물종류 없음  → "N개 지역 전체"
           동 1개 + 매물종류 있음       → "두정동 투룸" or "두정동 투룸 외"
           동 1개 + 매물종류 없음       → "두정동" */
        let labelText = '';
        if (locationText) {
            if (isMultiDong && !propertyTypeText) {
                // ✅ 다중 동 선택 + 매물종류 미선택 → "N개 지역 전체"
                labelText = locationText + ' 전체';
            } else {
                labelText = locationText;
                if (propertyTypeText) {
                    labelText += ' ' + propertyTypeText;
                }
            }
        } else if (propertyTypeText) {
            labelText = propertyTypeText;
        } else if (themeText) {
            labelText = themeText;
        } else {
            labelText = '전체';
        }

        btnLabel.textContent = labelText ? labelText + ' ' : '';
    }

    /* 기존 함수 오버라이드 */
    window.updatePanelLabel = syncBtnLabel;

    /* 초기 레이블 설정 (DOMContentLoaded 이후 약간 지연) */
    setTimeout(syncBtnLabel, 500);

    /* ── 3. 지도 상태 저장 함수 (목록 페이지 이동 전 호출) ── */
    function saveMapStateBeforeListPage() {
        const mapManager = window.appManager && window.appManager.mapManager;

        /* 지도 위치/줌 저장 */
        if (mapManager && mapManager.map) {
            const center = mapManager.map.getCenter();
            const zoom   = mapManager.map.getZoom();

            /* sessionStorage: 복원 플래그용 */
            sessionStorage.setItem('mapState', JSON.stringify({
                lat: center.lat(),
                lng: center.lng(),
                zoom: zoom
            }));

            /* ✅ localStorage.lastMapViewLocation 갱신
               지도 초기화 시 GPSManager.getMapViewFromCache()가 이 값을 읽어
               지도 중심을 설정하므로, 목록 이동 전 현재 위치로 덮어써야
               뒤로가기 후 올바른 위치(역/동 선택 당시)로 복원됨 */
            try {
                localStorage.setItem('lastMapViewLocation', JSON.stringify({
                    latitude:  center.lat(),
                    longitude: center.lng(),
                    zoom:      zoom,
                    timestamp: Date.now()
                }));
            } catch (e) {
                console.warn('lastMapViewLocation 저장 실패:', e);
            }
        }

        /* 필터 상태 저장 */
        if (window.fullFilterState) {
            sessionStorage.setItem('fullFilterState', JSON.stringify(window.fullFilterState));
        }
        if (mapManager) {
            if (mapManager.fullFilterParams) {
                sessionStorage.setItem('fullFilterParams', JSON.stringify(mapManager.fullFilterParams));
            }
            if (mapManager.currentCategory) {
                sessionStorage.setItem('currentCategory', JSON.stringify(mapManager.currentCategory));
            }
            if (mapManager.themeFilterParams) {
                sessionStorage.setItem('themeFilterParams', JSON.stringify(mapManager.themeFilterParams));
            }
        }

        /* 매물종류 필터 UI 저장 */
        if (window.selectedPropertyCategory && window.selectedPropertyCategory.length > 0) {
            sessionStorage.setItem('selectedPropertyCategory', JSON.stringify(window.selectedPropertyCategory));
            const typeText = document.getElementById('propertyTypeText');
            if (typeText) {
                sessionStorage.setItem('propertyTypeText', typeText.textContent);
            }
        }

        /* 동 선택 상태 저장 (다중 선택 지원) */
        if (window.currentDongSearch) {
            sessionStorage.setItem('currentDongSearch', JSON.stringify(window.currentDongSearch));
            // ✅ selectedDongNames (Set) → JSON 배열로 저장 (뒤로가기 시 다중 선택 복원)
            const cm = mapManager && mapManager.clusteringManager;
            if (cm && cm.selectedDongNames && cm.selectedDongNames.size > 0) {
                sessionStorage.setItem('selectedDongNames', JSON.stringify(Array.from(cm.selectedDongNames)));
            }
        }

        /* 역 선택 상태 저장 (localStorage — 네이버앱 호환) */
        if (window.stationManager && window.stationManager.isStationFilterActive) {
            const stationState = {
                isActive: true,
                selectedStation: window.stationManager.selectedStation,
                selectedZoomLevel: window.stationManager.selectedZoomLevel,
                filteredProperties: window.stationManager.filteredProperties,
                /* ✅ viewportFilteredProperties 포함: 복원 후 목록 이동 시 동일한 codes 사용 */
                viewportFilteredProperties: window.stationManager.viewportFilteredProperties,
                currentRadius: window.stationManager.RADIUS_METERS || window.stationManager.currentRadius,
                timestamp: Date.now()
            };
            localStorage.setItem('stationFilterState', JSON.stringify(stationState));
        }

        /* 테마 필터 상태 저장 */
        if (window.currentThemeFilter) {
            sessionStorage.setItem('currentThemeFilter', JSON.stringify(window.currentThemeFilter));
        }

        /* 패널 레이블 저장 */
        if (btnLabel && btnLabel.textContent.trim()) {
            sessionStorage.setItem('panelLabel', btnLabel.textContent.trim());
        }
        if (btnCount && btnCount.textContent.trim()) {
            sessionStorage.setItem('panelCount', btnCount.textContent.trim());
        }

        /* 목록 페이지에서 돌아왔음을 표시하는 플래그 */
        sessionStorage.setItem('returningFromList', 'true');

        console.log('💾 지도 상태 저장 완료 (목록 페이지 이동 전)');
    }

    /* ── 3-1. saveMapStateBeforeListPage 전역 노출 ──
       clustering.js 등 외부 모듈에서 호출 가능하도록 전역 등록 */
    window.saveMapStateBeforeListPage = saveMapStateBeforeListPage;

    /* ── 4. openListPage() — 매물 목록 페이지로 이동 ── */
    window.openListPage = function() {
        /* 목록 페이지 이동 전 지도 상태 전체 저장 (뒤로가기 시 복원용) */
        saveMapStateBeforeListPage();

        const params = new URLSearchParams();
        const mapManager = window.appManager && window.appManager.mapManager;
        const clusteringManager = mapManager && mapManager.clusteringManager;

        /* 지도 영역 좌표 (현재 화면 범위) */
        if (mapManager && mapManager.map) {
            const bounds = mapManager.map.getBounds();
            const sw = bounds.getSW();
            const ne = bounds.getNE();
            params.set('sw_lat', sw.lat().toFixed(6));
            params.set('sw_lng', sw.lng().toFixed(6));
            params.set('ne_lat', ne.lat().toFixed(6));
            params.set('ne_lng', ne.lng().toFixed(6));

            /* 지도 중심 좌표 (뒤로가기 시 복원용) */
            const center = mapManager.map.getCenter();
            params.set('center_lat', center.lat().toFixed(6));
            params.set('center_lng', center.lng().toFixed(6));
        }

        /* 카테고리 필터 (매물 종류) */
        if (mapManager && mapManager.currentCategory) {
            const cat = Array.isArray(mapManager.currentCategory)
                ? mapManager.currentCategory.join(',')
                : mapManager.currentCategory;
            if (cat) params.set('category', cat);
        }

        /* 전체 필터 파라미터 */
        if (mapManager && mapManager.fullFilterParams) {
            Object.entries(mapManager.fullFilterParams).forEach(function(entry) {
                if (entry[1] !== undefined && entry[1] !== null && entry[1] !== '') {
                    params.set(entry[0], entry[1]);
                }
            });
        }

        /* 테마 필터 파라미터 */
        if (mapManager && mapManager.themeFilterParams) {
            Object.entries(mapManager.themeFilterParams).forEach(function(entry) {
                if (entry[1] !== undefined && entry[1] !== null && entry[1] !== '') {
                    params.set(entry[0], entry[1]);
                }
            });
        }

        /* 역 선택 필터 */
        if (window.stationManager && window.stationManager.isStationFilterActive && window.stationManager.selectedStation) {
            const station = window.stationManager.selectedStation;
            params.set('station', station.name);

            /* ✅ 패널 카운트와 동일한 매물 목록 전달
               viewportFilteredProperties = 역 필터 적용 시점에 고정된 목록
               (mapManager.properties는 이후 idle 이벤트로 재갱신될 수 있어 사용 불가)
               이 codes를 sessionStorage로 전달 → 목록 페이지 카운트 = 패널 카운트 */
            const stationProps = window.stationManager.viewportFilteredProperties || [];
            const stationCodes = stationProps.map(function(p) { return p.code; }).filter(Boolean);

            if (stationCodes.length > 0) {
                /* codes를 sessionStorage 경유 전달 (URL 길이 초과 방지 — 클러스터와 동일 방식) */
                sessionStorage.setItem('clusterFilterCodes', stationCodes.join(','));
                params.set('from_cluster', '1');
                /* station_lat/lng 미포함 → isStationFilter=false → 거리 재필터링 없음 */
            } else {
                /* codes 없을 때 fallback: 거리 필터 방식 */
                params.set('station_lat', station.lat || station.latitude);
                params.set('station_lng', station.lng || station.longitude);
                params.set('station_radius', window.stationManager.RADIUS_METERS || window.stationManager.currentRadius || 500);
            }
        }

        /* 동 검색 필터
           - 단일 동: 기존 방식 (dong= URL 파라미터 → 백엔드 API 직접 조회)
           - 다중 동: codes를 sessionStorage 경유 전달 (from_cluster 방식 — 백엔드 미지원 우회) */
        if (window.currentDongSearch && window.currentDongSearch.locationName) {
            const dongNames = window.currentDongSearch.locationNames;
            if (dongNames && dongNames.length > 1) {
                // ✅ 다중 동: 합산된 매물 codes를 sessionStorage에 저장 후 from_cluster 방식으로 이동
                const dongProps = window.currentDongSearch.properties || [];
                const codes = dongProps.map(p => p.code).filter(Boolean);
                if (codes.length > 0) {
                    sessionStorage.setItem('clusterFilterCodes', codes.join(','));
                    params.set('from_cluster', '1');
                    console.log(`📋 다중 동 목록 이동: [${dongNames.join(', ')}] ${codes.length}개 codes → sessionStorage`);
                } else {
                    // codes 없을 경우 fallback: 첫 번째 동만 전달
                    params.set('dong', dongNames[0]);
                }
            } else {
                // ✅ 단일 동: 기존 방식 유지
                params.set('dong', window.currentDongSearch.locationName);
            }
        }

        /* 지역 검색 필터 */
        if (window.currentLocationSearch && window.currentLocationSearch.locationName) {
            params.set('location', window.currentLocationSearch.locationName);
        }

        /* 테마 필터 (레이블용) */
        if (window.currentThemeFilter) {
            if (window.currentThemeFilter.column) {
                params.set('thema', window.currentThemeFilter.column);
            } else if (typeof window.currentThemeFilter === 'string') {
                params.set('thema', window.currentThemeFilter);
            }
        }

        /* 버튼 레이블 전달 (목록 페이지 헤더에 표시) */
        if (btnLabel && btnLabel.textContent.trim()) {
            params.set('label', btnLabel.textContent.trim());
        }

        /* 전체 매물 수량 전달 (목록 페이지 헤더에 표시) */
        if (btnCount && btnCount.textContent.trim()) {
            params.set('total_count', btnCount.textContent.trim());
        }

        /* ✅ 크로스헤어(표적 아이콘) 활성 상태이면 거리 가까운순 기본값으로 목록 열기
           crosshair-user-hidden 클래스가 없으면 = 사용자가 켜놓은 상태 */
        const crosshairEl = document.getElementById('mapCrosshair');
        const isCrosshairActive = crosshairEl &&
            !crosshairEl.classList.contains('crosshair-user-hidden');
        if (isCrosshairActive) {
            params.set('default_sort', 'distance');
        }

        /* ✅ 정렬 탭 노출 조건
           "마커 미선택 + 하단 패널 버튼으로 진입"인 경우에만 표시 */
        const isCoordinateMarkerSelected = !!(clusteringManager && clusteringManager.selectedClusterIndex !== null);
        const isDongMarkerSelected = !!(window.currentDongSearch && window.currentDongSearch.locationName);
        const isStationMarkerSelected = !!(
            window.stationManager &&
            window.stationManager.isStationFilterActive &&
            window.stationManager.selectedStation
        );
        const shouldShowSortTabs = !(
            isCoordinateMarkerSelected ||
            isDongMarkerSelected ||
            isStationMarkerSelected
        );
        params.set('show_sort_tabs', shouldShowSortTabs ? '1' : '0');

        /* VT 방향 설정 (지도→목록: 아래에서 위로 슬라이드) */
        sessionStorage.setItem('navDirection', 'slide-up');

        /* 페이지 이동 */
        const url = '/map-list?' + params.toString();
        console.log('📋 매물 목록 페이지 이동:', url);
        window.location.href = url;
    };

})();
