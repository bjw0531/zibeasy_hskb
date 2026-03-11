/**
 * index.html UI 함수 모음 (메인 스크립트)
 * - 검색 페이지 열기/닫기
 * - 역 주변 모달 열기/닫기/선택
 * - 테마별 검색 모달 열기/닫기/적용
 * - 동/역 선택 해제 전역 함수
 * - 전체 필터 초기화 (새로고침 버튼)
 * - 가격 포맷팅 헬퍼
 *
 * 의존성:
 *   - main.js, map.js (window.appManager)
 *   - stations.js (window.stationManager, initStationManager)
 *   - dong-boundary.js (window.dongBoundaryManager)
 *   - full-filter.js (resetAllFiltersConfirmed, showResetConfirm)
 *   - property-type-filter.js (window.propertyTypeFilter)
 *
 * ⚠️ HTML onclick 핸들러에서 직접 호출되므로 모든 함수를 window에 노출
 */

console.log('🎯 index-ui.js 로드됨');

/* ── 전역 상태 초기화 ── */
window.currentThemeFilter = null;
window.currentRecommendFilter = null;  /* 레거시 호환 */
window.selectedThemes = [];

/* ─────────────────────────────────────────
   관심목록 상태 복구
───────────────────────────────────────── */
window.restoreFromLikedFilter = function() {
    if (window.appManager && window.appManager.mapManager) {
        window.appManager.mapManager.restoreFromLikedFilter();
    }
};

/* ─────────────────────────────────────────
   검색 페이지 열기/닫기
───────────────────────────────────────── */
window.openSearchPage = function() {
    /* 관심목록 상태 복구 */
    window.restoreFromLikedFilter();

    /* 검색 모드 초기화 */
    if (window.appManager) {
        window.appManager.isSearchMode = false;
    }

    /* 이전 검색 결과 타이틀 초기화 (지역명 숨기기) */
    const locationElement = document.getElementById('propertyLocation');
    if (locationElement) {
        locationElement.textContent = '';
        locationElement.style.display = 'none';
    }

    /* 지역 검색 상태 초기화 */
    window.currentLocationSearch = null;

    /* 역 필터 해제 (이전 역 검색 결과 초기화) */
    if (window.stationManager && window.stationManager.isStationFilterActive) {
        window.stationManager.clearStationFilter();
    }

    /* 동 선택 해제 (동 경계, 마커 색상, 패널 헤더 초기화) */
    clearDongSelectionGlobal();

    /* 히스토리에 상태 추가 (뒤로가기 지원) */
    history.pushState({ page: 'search' }, '', '');
    window.searchPageHistoryPushed = true;

    /* 검색 페이지 열기 */
    document.getElementById('searchPage').classList.add('active');

    /* 검색창 초기화 및 포커스 */
    const searchInput = document.getElementById('searchPageInput');
    if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
    }
};

window.closeSearchPage = function() {
    /* 뒤로가기로 닫힌 게 아니면 히스토리 뒤로가기 */
    if (!window.isClosingByBackButton && window.searchPageHistoryPushed) {
        window.searchPageHistoryPushed = false;
        history.back();
    }
    document.getElementById('searchPage').classList.remove('active');

    /* 지도 영역 기반 매물 개수 다시 계산 */
    if (window.appManager && window.appManager.mapManager) {
        const mapManager = window.appManager.mapManager;
        if (mapManager.map && mapManager.properties && mapManager.properties.length > 0) {
            const bounds = mapManager.map.getBounds();
            const sw = bounds.getSW();
            const ne = bounds.getNE();

            const visibleProperties = mapManager.properties.filter(property => {
                const lat = parseFloat(property.lat);
                const lng = parseFloat(property.lng);
                return lat >= sw.lat() && lat <= ne.lat() &&
                    lng >= sw.lng() && lng <= ne.lng();
            });

            const countElement = document.getElementById('propertyCount');
            if (countElement) {
                countElement.textContent = visibleProperties.length;
            }
        }
    }
};

/* 매물 목록 토글 */
window.toggleListPanel = function() {
    if (window.appManager) {
        window.appManager.toggleListPanel();
    }
};

/* ─────────────────────────────────────────
   역 주변 모달
───────────────────────────────────────── */
window.openStationModal = function() {
    /* 역 필터가 이미 활성화되어 있으면 해제 */
    if (window.stationManager && window.stationManager.isStationFilterActive) {
        window.stationManager.clearStationFilter();
    }
    /* 히스토리에 상태 추가 (뒤로가기 지원) */
    history.pushState({ modal: 'station' }, '', '');
    window.stationModalHistoryPushed = true;
    document.getElementById('stationModal').classList.add('active');
};

window.closeStationModal = function(event) {
    if (event && event.target !== event.currentTarget) return;
    /* 뒤로가기로 닫힌 게 아니면 히스토리 뒤로가기 */
    if (!window.isClosingByBackButton && window.stationModalHistoryPushed) {
        window.stationModalHistoryPushed = false;
        /* ✅ 모달 닫기로 인한 popstate에서 동/역 선택 해제 방지 */
        window.isClosingByStationModal = true;
        history.back();
    }
    document.getElementById('stationModal').classList.remove('active');
};

window.selectStationFromModal = function(stationId) {
    if (window.stationManager) {
        window.stationManager.selectStationFromModal(stationId);
    }
};

/* StationManager 초기화 + 홈 검색창 진입 처리 (앱 로드 후) */
document.addEventListener('DOMContentLoaded', () => {
    /* StationManager 초기화 */
    const checkAndInit = () => {
        if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.map) {
            window.initStationManager();
        } else {
            setTimeout(checkAndInit, 100); /* 100ms마다 체크 */
        }
    };
    setTimeout(checkAndInit, 0);

    /* ── 홈 화면 검색창에서 넘어온 경우: 검색 모달 자동 오픈 ── */
    if (new URLSearchParams(location.search).get('search') === 'open') {
        /* URL 파라미터 제거 (뒤로가기 시 홈으로 돌아가도록) */
        history.replaceState(null, '', '/map');
        /* openSearchPage 및 searchPage DOM 준비 대기 후 실행 (폴링) */
        var _attempts = 0;
        var _searchTimer = setInterval(function() {
            _attempts++;
            var searchPageEl = document.getElementById('searchPage');
            if (typeof window.openSearchPage === 'function' && searchPageEl) {
                clearInterval(_searchTimer);
                window.openSearchPage();
            } else if (_attempts > 60) {
                /* 6초 이상 대기 시 포기 */
                clearInterval(_searchTimer);
            }
        }, 100);
    }
});

/* ─────────────────────────────────────────
   동/역 선택 해제 전역 함수
───────────────────────────────────────── */
function clearDongSelectionGlobal() {
    /* 동 검색 상태 초기화 */
    if (window.currentDongSearch) {
        window.currentDongSearch = null;
    }

    /* 동 경계 폴리곤 제거 */
    if (window.dongBoundaryManager) {
        window.dongBoundaryManager.clearBoundary();
    }

    /* 동 마커 색상 반전 효과 해제 및 마커 재렌더링 */
    if (window.appManager && window.appManager.mapManager &&
        window.appManager.mapManager.clusteringManager) {
        window.appManager.mapManager.clusteringManager.selectedDongName = null;
        window.appManager.mapManager.clusteringManager.showClusteredMarkers();
    }

    /* 패널 헤더의 지역명 숨기기 */
    const locationElement = document.getElementById('propertyLocation');
    if (locationElement) {
        locationElement.textContent = '';
        locationElement.style.display = 'none';
    }

    console.log('🏠 동 선택 해제됨 (전역)');
}
window.clearDongSelectionGlobal = clearDongSelectionGlobal;

window.clearStationSelectionGlobal = function() {
    if (window.stationManager && window.stationManager.isStationFilterActive) {
        window.stationManager.clearStationFilter();
        console.log('🚇 역 선택 해제됨 (전역)');
    }
};

/* ─────────────────────────────────────────
   테마별 검색 기능
───────────────────────────────────────── */

/* 테마 DB 컬럼명 및 라벨 매핑 */
const themeConfig = {
    'realtime':         { column: 'good6',   label: '실시간 추천' },
    'premium':          { column: 'thema1',  label: '신축 고급형' },
    'budget_oneroom':   { column: 'thema9',  label: '알뜰 원룸' },
    'budget_twobay':    { column: 'thema10', label: '알뜰 투베이/투룸' },
    'deposit100':       { column: 'thema2',  label: '보 100 가능' },
    'big_oneroom':      { column: 'thema8',  label: '큰 원룸' },
    'separate_oneroom': { column: 'thema11', label: '분리형 원룸' },
    'arch_twobay':      { column: 'thema4',  label: '아치형 투베이' },
    'living_twobay':    { column: 'thema12', label: '분리형 투베이' },
    'wide_tworoom':     { column: 'thema13', label: '거실있는 투룸' },
    'unique':           { column: 'thema5',  label: '독특한 집' }
};

/* 테마별 검색 모달 열기 */
window.openRecommendModal = function() {
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
        console.log('🎯 기존 테마 선택 복원:', window.selectedThemes);
    } else {
        /* 적용된 테마 없으면 초기 상태 */
        window.selectedThemes = [];
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
    }

    /* 히스토리에 상태 추가 (뒤로가기 지원) */
    history.pushState({ modal: 'recommend' }, '', '');
    window.recommendModalHistoryPushed = true;
    document.getElementById('recommendModal').classList.add('active');
};

/* 테마별 검색 모달 닫기 */
window.closeRecommendModal = function(event) {
    if (event && event.target !== event.currentTarget) return;
    /* 뒤로가기로 닫힌 게 아니면 히스토리 뒤로가기 */
    if (!window.isClosingByBackButton && window.recommendModalHistoryPushed) {
        window.recommendModalHistoryPushed = false;
        /* ✅ 모달 닫기로 인한 popstate에서 동/역 선택 해제 방지 */
        window.isClosingByRecommendModal = true;
        history.back();
    }
    document.getElementById('recommendModal').classList.remove('active');
};

/* 테마 옵션 토글 (단일 선택) */
window.toggleThemeOption = function(btn, type) {
    const index = window.selectedThemes.indexOf(type);

    if (index > -1) {
        /* 이미 선택됨 → 해제 */
        window.selectedThemes.splice(index, 1);
        btn.classList.remove('selected');
    } else {
        /* 기존 선택 모두 해제 */
        document.querySelectorAll('.theme-btn.selected').forEach(b => b.classList.remove('selected'));
        window.selectedThemes = [];

        /* 새로 선택 */
        window.selectedThemes.push(type);
        btn.classList.add('selected');
    }

    console.log('📌 선택된 테마:', window.selectedThemes);
};

/* 테마 초기화 버튼 - 테마별 검색만 독립적으로 초기화 (전체 필터와 무관) */
window.resetThemeSelection = function() {
    // 모달 내 선택 버튼 초기화
    window.selectedThemes = [];
    document.querySelectorAll('.theme-btn.selected').forEach(btn => {
        btn.classList.remove('selected');
    });

    // 이미 적용된 테마 필터 해제 (버튼 상태 복원 + 지도 재로드)
    if (typeof clearThemeFilter === 'function') {
        clearThemeFilter();
    }

    console.log('🔄 테마 필터 초기화 (전체 필터 유지)');
};

/* (레거시) 단일 선택용 함수 - 하위 호환성 유지 */
window.selectThemeType = async function(btn, type) {
    btn.classList.add('clicked');

    setTimeout(async () => {
        window.isApplyingThemeFilter = true;
        window.closeRecommendModal();
        setTimeout(() => { window.isApplyingThemeFilter = false; }, 300);

        btn.classList.remove('clicked');

        const config = themeConfig[type];
        if (config) {
            await applyThemeFilterSingle(type, config.column, config.label);
        } else {
            console.error('알 수 없는 테마 유형:', type);
        }
    }, 150);
};

/* 테마 필터 적용 (적용하기 버튼 클릭 시)
   아무것도 선택 안 한 상태에서 적용 → 테마 필터 초기화(해제) 후 모달 닫기 */
window.applyThemeFilter = async function() {
    if (window.selectedThemes.length === 0) {
        // ✅ isApplyingThemeFilter 플래그 먼저 설정 (모달 닫기 시 history.back() → popstate 이벤트에서 동/역 초기화 방지)
        window.isApplyingThemeFilter = true;
        window.closeRecommendModal();
        setTimeout(() => { window.isApplyingThemeFilter = false; }, 300);

        // 테마 상태·UI만 초기화 (동/역 선택 유지)
        window.currentThemeFilter = null;
        const recommendBtn = document.getElementById('recommendFilterBtn');
        const recommendText = document.getElementById('recommendFilterText');
        if (recommendBtn) recommendBtn.classList.remove('active');
        if (recommendText) recommendText.textContent = '테마별 검색';

        if (window.appManager && window.appManager.mapManager) {
            window.appManager.mapManager.themeFilterParams = null;
            if (window.appManager.mapManager.propertyCache) {
                window.appManager.mapManager.propertyCache.clear();
            }
            // 역 필터 활성 상태면 역 반경 재로드 (역 선택 유지), 그 외 전체 재로드
            if (window.stationManager && window.stationManager.isStationFilterActive && window.stationManager.selectedStation) {
                await window.stationManager.filterPropertiesByRadius(window.stationManager.selectedStation);
            } else {
                await window.appManager.mapManager.loadPropertiesInBounds();
            }
        }

        // 패널 레이블 업데이트
        if (typeof updatePanelLabel === 'function') {
            updatePanelLabel();
        }

        console.log('🔄 테마 미선택 적용 → 테마 필터 초기화 (동/역 유지)');
        return;
    }

    window.isApplyingThemeFilter = true;
    window.closeRecommendModal();
    setTimeout(() => { window.isApplyingThemeFilter = false; }, 300);

    const columns = [];
    const labels = [];
    const themeCategories = [];

    window.selectedThemes.forEach(type => {
        const config = themeConfig[type];
        if (config) {
            if (config.category) {
                themeCategories.push(`${config.column}:${config.category}`);
            } else {
                columns.push(config.column);
            }
            labels.push(config.label);
        }
    });

    /* 라벨 조합 (1개면 그대로, 2개 이상이면 "N개 테마") */
    let displayLabel;
    if (labels.length === 1) {
        displayLabel = labels[0];
    } else {
        displayLabel = `${labels.length}개 테마`;
    }

    try {
        console.log(`🎯 테마 필터 적용: ${displayLabel}`);

        /* 좌표 클러스터 선택 해제 (동/역 선택은 유지) */
        if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.clusteringManager) {
            if (window.appManager.mapManager.clusteringManager.selectedClusterIndex !== null) {
                window.appManager.mapManager.clusteringManager.selectedClusterIndex = null;
                const locationElement = document.getElementById('propertyLocation');
                if (locationElement) {
                    locationElement.textContent = '';
                    locationElement.style.display = 'none';
                }
            }
        }

        /* 테마 필터 상태 저장 */
        window.currentThemeFilter = {
            types: window.selectedThemes,
            columns: columns,
            themeCategories: themeCategories,
            label: displayLabel
        };

        /* 버튼 활성화 표시 */
        document.getElementById('recommendFilterBtn').classList.add('active');
        document.getElementById('recommendFilterText').textContent = displayLabel;

        /* 현재 지도 위치/줌 유지하면서 매물 로드 */
        if (window.appManager && window.appManager.mapManager) {
            const mapManager = window.appManager.mapManager;

            mapManager.themeFilterParams = {
                thema: columns.length > 0 ? columns.join(',') : null,
                thema_categories: themeCategories.length > 0 ? themeCategories.join(',') : null
            };

            if (mapManager.propertyCache) {
                mapManager.propertyCache.clear();
            }

            // ✅ 역 필터 활성 상태면 역 반경 재로드 (역 선택 유지), 그 외 전체 재로드
            if (window.stationManager && window.stationManager.isStationFilterActive && window.stationManager.selectedStation) {
                await window.stationManager.filterPropertiesByRadius(window.stationManager.selectedStation);
            } else {
                await mapManager.loadPropertiesInBounds();
            }
            console.log(`✅ 테마 필터 적용 완료: ${displayLabel}`);

            // ✅ 동/역 선택 시 매물 없음 체크 후 필요 시 선택 해제 및 팝업
            if (typeof window.checkNoPropertiesAndDeselect === 'function') {
                window.checkNoPropertiesAndDeselect();
            }
        }

    } catch (error) {
        console.error('테마 필터 적용 오류:', error);
        alert('필터 적용 중 오류가 발생했습니다.');
    }
};

/* 단일 테마 필터 적용 함수 (레거시 지원) */
async function applyThemeFilterSingle(type, column, label) {
    try {
        console.log(`🎯 ${label} 필터 적용 중...`);

        if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.clusteringManager) {
            if (window.appManager.mapManager.clusteringManager.selectedClusterIndex !== null) {
                window.appManager.mapManager.clusteringManager.selectedClusterIndex = null;
                const locationElement = document.getElementById('propertyLocation');
                if (locationElement) {
                    locationElement.textContent = '';
                    locationElement.style.display = 'none';
                }
            }
        }

        window.currentThemeFilter = { type, column, label };

        document.getElementById('recommendFilterBtn').classList.add('active');
        document.getElementById('recommendFilterText').textContent = label;

        if (window.appManager && window.appManager.mapManager) {
            const mapManager = window.appManager.mapManager;
            mapManager.themeFilterParams = { thema: column };

            if (mapManager.propertyCache) {
                mapManager.propertyCache.clear();
            }

            // ✅ 역 필터 활성 상태면 역 반경 재로드 (역 선택 유지), 그 외 전체 재로드
            if (window.stationManager && window.stationManager.isStationFilterActive && window.stationManager.selectedStation) {
                await window.stationManager.filterPropertiesByRadius(window.stationManager.selectedStation);
            } else {
                await mapManager.loadPropertiesInBounds();
            }
            console.log(`✅ ${label} 필터 적용 완료`);
        }

    } catch (error) {
        console.error('테마 필터 적용 오류:', error);
        alert('필터 적용 중 오류가 발생했습니다.');
    }
}

/* 테마 필터 해제 */
function clearThemeFilter() {
    window.currentThemeFilter = null;
    document.getElementById('recommendFilterBtn').classList.remove('active');
    document.getElementById('recommendFilterText').textContent = '테마별 검색';

    if (window.appManager && window.appManager.mapManager) {
        window.appManager.mapManager.themeFilterParams = null;

        if (window.appManager.mapManager.propertyCache) {
            window.appManager.mapManager.propertyCache.clear();
        }
        window.appManager.mapManager.loadPropertiesInBounds();
    }
}
window.clearThemeFilter = clearThemeFilter;

/* 레거시 호환 */
window.clearRecommendFilter = function() {
    clearThemeFilter();
};

/* ─────────────────────────────────────────
   전체 필터 초기화 (새로고침 버튼)
───────────────────────────────────────── */
window.resetAllFilters = function() {
    console.log('🔄 모든 필터 초기화 시작...');

    /* 새로고침 오버레이 표시 */
    const refreshOverlay = document.getElementById('refreshOverlay');
    if (refreshOverlay) {
        refreshOverlay.classList.add('active');
    }

    /* 새로고침 버튼 회전 효과 */
    const refreshBtn = document.querySelector('.refresh-floating-btn');
    if (refreshBtn) {
        refreshBtn.classList.add('spinning');
        setTimeout(() => {
            refreshBtn.classList.remove('spinning');
        }, 600);
    }

    /* 1. 동 선택 해제 */
    clearDongSelectionGlobal();

    /* 좌표 클러스터 선택 해제 */
    if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.clusteringManager) {
        if (window.appManager.mapManager.clusteringManager.selectedClusterIndex !== null) {
            window.appManager.mapManager.clusteringManager.selectedClusterIndex = null;
            console.log('📍 좌표 클러스터 선택 해제됨');
        }
    }

    /* 2. 역 필터 해제 */
    if (window.stationManager && window.stationManager.isStationFilterActive) {
        window.stationManager.clearStationFilter();
        console.log('🚇 역 필터 해제됨');
    }

    /* 테마 필터 해제 */
    if (window.currentThemeFilter) {
        clearThemeFilter();
        console.log('🎯 테마 필터 해제됨');
    }

    /* 3. 매물종류 필터 초기화 (전체 선택) */
    if (window.propertyTypeFilter) {
        window.propertyTypeFilter.resetToDefault();
        console.log('🏠 매물종류 필터 초기화됨');
    }

    /* 전체 필터 초기화 */
    if (typeof resetAllFiltersConfirmed === 'function') {
        window.fullFilterState = {
            tradeType: ['monthly', 'jeonse', 'short_term'],
            depositMin: 0, depositMax: 20,
            monthlyMin: 0, monthlyMax: 20,
            includeManagement: false,
            kitchen: ['separate', 'open'],
            balcony: ['separate', 'extended'],
            roomType: [],
            areaMin: 0, areaMax: 8,
            floor: ['all'],
            buildingAge: ['all'],
            options: []
        };
        const filterIconBtn = document.getElementById('filterIconBtn');
        if (filterIconBtn) {
            filterIconBtn.classList.remove('active');
        }
        console.log('🔍 전체 필터 초기화됨');
    }

    /* 4. 관심목록 필터 해제 */
    if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.isLikedFilterActive) {
        window.appManager.mapManager.restoreFromLikedFilter();
        console.log('❤️ 관심목록 필터 해제됨');
    }

    /* 5. 매물 캐시 및 카테고리 필터 초기화 */
    if (window.appManager && window.appManager.mapManager) {
        window.appManager.mapManager.currentCategory = null;
        window.appManager.mapManager.fullFilterParams = null;
        if (window.appManager.mapManager.propertyCache) {
            window.appManager.mapManager.propertyCache.clear();
        }
        console.log('🗑️ 캐시 및 카테고리 초기화됨');
    }

    /* 드래그패널 헤더 지역명 숨기기 */
    const locationElement = document.getElementById('propertyLocation');
    if (locationElement) {
        locationElement.textContent = '';
        locationElement.style.display = 'none';
    }

    /* 6. 지도에 영역 내 매물 다시 로드 */
    if (window.appManager && window.appManager.mapManager) {
        window.appManager.mapManager.loadPropertiesInBounds();
        console.log('🗺️ 지도 매물 다시 로드');
    }

    /* 7. 클러스터링 마커 재렌더링 */
    if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.clusteringManager) {
        window.appManager.mapManager.clusteringManager.showClusteredMarkers();
    }

    console.log('✅ 모든 필터 초기화 완료');

    /* 새로고침 오버레이 숨기기 (약간의 지연 후) */
    setTimeout(() => {
        const refreshOverlay = document.getElementById('refreshOverlay');
        if (refreshOverlay) {
            refreshOverlay.classList.remove('active');
        }
    }, 500);
};

/* ─────────────────────────────────────────
   가격 포맷팅 헬퍼
───────────────────────────────────────── */
window.formatPropertyPrice = function(prop) {
    if (prop.jen_money && parseInt(prop.jen_money) > 0) {
        return `전세 ${window.formatMoney(prop.jen_money)}`;
    } else if (prop.security_money && prop.month_money) {
        return `${window.formatMoney(prop.security_money)}/${prop.month_money}`;
    } else if (prop.maemae_money && parseInt(prop.maemae_money) > 0) {
        return `매매 ${window.formatMoney(prop.maemae_money)}`;
    }
    return '가격 문의';
};

window.formatMoney = function(value) {
    const num = parseInt(value) || 0;
    if (num >= 10000) {
        const uk = Math.floor(num / 10000);
        const man = num % 10000;
        return man > 0 ? `${uk}억 ${man}` : `${uk}억`;
    }
    return `${num}`;
};

/**
 * ✅ "원하시는 조건에 맞는 매물이 없습니다." 토스트 팝업 표시
 * 동/역 선택 해제 시 함께 호출
 */
window.showNoPropertiesAlert = function() {
    /* 기존 토스트가 있으면 제거 후 재생성 */
    const existing = document.querySelector('.no-properties-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'no-properties-toast';
    toast.textContent = '원하시는 조건에 맞는 매물이 없습니다.';
    document.body.appendChild(toast);

    /* 기존 방식과 동일하게 2.5초 후 JS로 제거 */
    setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 2500);

    console.log('⚠️ 매물 없음 토스트 표시');
};

/**
 * ✅ 필터 적용 후 동/역별 매물 없음 체크 → 자동 해제 처리
 * applyFullFilter() 및 applyThemeFilter() 완료 후 호출
 *
 * 처리 규칙:
 *   - 역 선택 중: 반경 내 매물 0개 → 역 해제 + 팝업
 *   - 동 단일/복수 선택 중:
 *       · 모든 동 매물 없음 → 전체 해제 + 팝업
 *       · 일부 동만 매물 없음 → 해당 동만 해제, 나머지 유지
 */
window.checkNoPropertiesAndDeselect = function() {
    const mapManager = window.appManager?.mapManager;
    if (!mapManager) return;

    /* ── 역 선택 상태 체크 ── */
    if (window.stationManager && window.stationManager.isStationFilterActive) {
        const viewportProps = window.stationManager.viewportFilteredProperties || [];
        if (viewportProps.length === 0) {
            console.log('⚠️ 역 반경 내 매물 없음 → 역 선택 해제');
            window.stationManager.clearStationFilter();
            window.showNoPropertiesAlert();
        }
        return; /* 역 처리 후 동 체크는 하지 않음 */
    }

    /* ── 동 선택 상태 체크 ── */
    const cm = mapManager.clusteringManager;
    if (!cm || cm.selectedDongNames.size === 0) return;

    const names = Array.from(cm.selectedDongNames);
    const withProps    = [];  /* 매물 있는 동 */
    const withoutProps = [];  /* 매물 없는 동 */

    names.forEach(name => {
        const data = cm._dongClusterData.get(name);
        const count = data?.properties?.length ?? 0;
        if (count > 0) withProps.push(name);
        else           withoutProps.push(name);
    });

    if (withoutProps.length === 0) return; /* 모든 동 매물 있음 → 처리 불필요 */

    if (withProps.length === 0) {
        /* 모든 동에 매물 없음 → 전체 해제 + 팝업 */
        console.log(`⚠️ 선택된 동 전체 매물 없음 → 전체 해제: [${names.join(', ')}]`);
        cm.clearSelectedDong();
        if (mapManager.updateStats) mapManager.updateStats();
        window.showNoPropertiesAlert();
    } else {
        /* 일부 동만 매물 없음 → 해당 동만 해제 */
        console.log(`⚠️ 매물 없는 동 해제: [${withoutProps.join(', ')}] / 유지: [${withProps.join(', ')}]`);
        withoutProps.forEach(name => {
            cm.selectedDongNames.delete(name);
            cm._dongClusterData.delete(name);
            /* 경계 폴리곤도 재그리기 (showBoundaries 호출 전 제거) */
        });
        /* 남은 동으로 상태 재계산 (경계선 + 패널 레이블 + currentDongSearch 갱신) */
        cm._buildMultiDongState();
        cm.showClusteredMarkers();
        if (mapManager.updateStats) mapManager.updateStats();
    }
};
