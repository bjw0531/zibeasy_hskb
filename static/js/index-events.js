/**
 * index.html 이벤트 핸들러 모음
 * - MutationObserver: 매물 목록 변화 시 하트 상태 재적용
 * - 매물 수량 클릭 이벤트: 관심목록 필터 해제
 * - 지도 클릭 이벤트: 관심목록 필터 해제
 * - popstate 뒤로가기 핸들러: 우선순위 기반 모달/필터 순차 닫기
 * - pageshow: bfcache 복원 시 하트 재초기화
 * - visibilitychange: 탭 복귀 시 하트 재초기화
 *
 * 의존성:
 *   - liked.js (initLikedHearts)
 *   - index-ui.js (closeSearchPage, closeFullFilterPage, closePropertyTypeModal,
 *                  closeStationModal, closeRecommendModal)
 *   - full-filter.js (closeFullFilterPage)
 *   - window.appManager, window.stationManager, window.dongBoundaryManager
 */
document.addEventListener('DOMContentLoaded', () => {
    /* ── MutationObserver: listContent 변화 시 하트 상태 재적용 ── */
    const target = document.getElementById('listContent');
    if (!target) return;

    const observer = new MutationObserver(() => {
        /* 하트 상태 다시 적용 */
        initLikedHearts();
    });

    observer.observe(target, {
        childList: true,  /* 자식 추가/삭제 */
        subtree: true     /* 하위 요소 변화도 감지 */
    });

    /* ── 1. 드래그 패널 상단 매물 수량 클릭 이벤트 ── */
    const propertyCount = document.getElementById('propertyCount');
    if (propertyCount) {
        propertyCount.addEventListener('click', function (e) {
            if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.isLikedFilterActive) {
                e.stopPropagation();
                window.appManager.mapManager.restoreFromLikedFilter();
            }
        });
    }

    /* ── 2. 지도 클릭 이벤트: 관심목록 필터 활성 시 해제 ── */
    const mapElement = document.getElementById('map');
    if (mapElement) {
        mapElement.addEventListener('click', function (e) {
            if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.isLikedFilterActive) {
                window.appManager.mapManager.restoreFromLikedFilter();
            }
        });
    }

    /* ── 3. 브라우저 뒤로가기 이벤트: 전역 뒤로가기 핸들러 ──
       우선순위에 따라 하나씩 닫기 (가장 위에 있는 것부터) */
    window.addEventListener('popstate', function (event) {
        console.log('⬅️ 뒤로가기 감지');

        /* 1순위: 검색창 페이지가 열려있으면 닫기 */
        const searchPage = document.getElementById('searchPage');
        if (searchPage && searchPage.classList.contains('active')) {
            console.log('⬅️ 검색창 닫기');
            window.isClosingByBackButton = true;
            closeSearchPage();
            window.isClosingByBackButton = false;
            return;
        }

        /* 2순위: 전체 필터 페이지가 열려있으면 닫기 */
        const fullFilterPage = document.getElementById('fullFilterPage');
        if (fullFilterPage && fullFilterPage.classList.contains('active')) {
            console.log('⬅️ 전체 필터 페이지 닫기');
            window.isClosingByBackButton = true;
            closeFullFilterPage();
            window.isClosingByBackButton = false;
            return;
        }

        /* 3순위: 매물종류 팝업이 열려있으면 닫기 */
        const propertyTypeModal = document.getElementById('propertyTypeModal');
        if (propertyTypeModal && propertyTypeModal.classList.contains('active')) {
            console.log('⬅️ 매물종류 팝업 닫기');
            window.isClosingByBackButton = true;
            closePropertyTypeModal();
            window.isClosingByBackButton = false;
            return;
        }

        /* 4순위: 역주변 팝업이 열려있으면 닫기 */
        const stationModal = document.getElementById('stationModal');
        if (stationModal && stationModal.classList.contains('active')) {
            console.log('⬅️ 역주변 팝업 닫기');
            window.isClosingByBackButton = true;
            closeStationModal();
            window.isClosingByBackButton = false;
            return;
        }

        /* 5순위: 테마별 검색 팝업이 열려있으면 닫기 */
        const recommendModal = document.getElementById('recommendModal');
        if (recommendModal && recommendModal.classList.contains('active')) {
            console.log('⬅️ 테마별 검색 팝업 닫기');
            window.isClosingByBackButton = true;
            closeRecommendModal();
            window.isClosingByBackButton = false;
            return;
        }

        /* 테마 필터 적용 중이면 동/역 선택 유지
           (모달 닫기의 history.back으로 인한 popstate) */
        if (window.isApplyingThemeFilter) {
            console.log('🎯 테마 필터 적용 중 - 동/역 선택 유지');
            return;
        }

        /* ✅ 전체필터 내부 버튼(X/뒤로가기)으로 닫는 중이면 동 선택 유지
           closeFullFilterPage()가 history.back() 전에 .active를 제거하기 때문에
           popstate 시점에 2순위 조건이 false가 되어 7순위까지 내려오는 문제 방지 */
        if (window.isClosingByFullFilter) {
            console.log('🔙 전체필터 닫기로 인한 popstate - 동 선택 유지');
            window.isClosingByFullFilter = false;
            return;
        }

        /* ✅ 테마별 검색 모달 닫기로 인한 popstate - 동/역 선택 유지 */
        if (window.isClosingByRecommendModal) {
            console.log('🔙 테마별 검색 닫기로 인한 popstate - 동/역 선택 유지');
            window.isClosingByRecommendModal = false;
            return;
        }

        /* ✅ 매물종류 팝업 닫기로 인한 popstate - 동/역 선택 유지 */
        if (window.isClosingByPropertyTypeModal) {
            console.log('🔙 매물종류 팝업 닫기로 인한 popstate - 동/역 선택 유지');
            window.isClosingByPropertyTypeModal = false;
            return;
        }

        /* ✅ 역주변 팝업 닫기로 인한 popstate - 동/역 선택 유지 */
        if (window.isClosingByStationModal) {
            console.log('🔙 역주변 팝업 닫기로 인한 popstate - 동/역 선택 유지');
            window.isClosingByStationModal = false;
            return;
        }

        /* 7순위: 동 마커 선택 상태면 해제 (실제 뒤로가기 버튼 눌렀을 때만) */
        if (window.currentDongSearch) {
            console.log('⬅️ 동 선택 해제');
            if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.clusteringManager) {
                window.appManager.mapManager.clusteringManager.selectedDongName = null;
            }
            window.currentDongSearch = null;
            if (window.dongBoundaryManager) {
                window.dongBoundaryManager.clearBoundary();
            }
            const locationElement = document.getElementById('propertyLocation');
            if (locationElement) {
                locationElement.textContent = '';
                locationElement.style.display = 'none';
            }
            if (window.appManager && window.appManager.mapManager) {
                window.appManager.mapManager.updateStats();
                if (window.appManager.mapManager.clusteringManager) {
                    window.appManager.mapManager.clusteringManager.showClusteredMarkers();
                }
            }
            return;
        }

        /* 8순위: 역 필터 활성 상태면 해제 */
        if (window.stationManager && window.stationManager.isStationFilterActive) {
            console.log('⬅️ 역 필터 해제');
            window.stationManager.clearStationFilter();
            return;
        }

        /* 9순위: 관심목록 필터 활성 상태면 해제 */
        if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.isLikedFilterActive) {
            window.appManager.mapManager.restoreFromLikedFilter();
            return;
        }
    });
});

/* ── pageshow: bfcache 복원 시 하트 재초기화 ── */
window.addEventListener("pageshow", (event) => {
    initLikedHearts();
    /* bfcache에서 복원된 경우 (뒤로가기로 돌아온 경우)
       페이지가 캐시에서 복원되면 JS 상태가 그대로 유지되므로 재로드 불필요 */
    if (event.persisted) {
        console.log('📱 pageshow: bfcache 복원 — 상태 유지됨');
        /* bfcache에서는 JS 상태가 그대로 유지되므로 복원 불필요.
           목록 이동 전 저장해둔 sessionStorage 키만 정리. */
        sessionStorage.removeItem('returningFromList');
        sessionStorage.removeItem('selectedPropertyCategory');
        sessionStorage.removeItem('propertyTypeText');

        /* ✅ 목록 페이지에서 돌아올 때: 좌표 클러스터 선택 상태 해제
           bfcache 복원 시 selectedClusterIndex가 이전 클릭 값 그대로 유지되어
           마커가 선택된 상태(강조)로 보이는 문제를 방지 */
        if (window.appManager && window.appManager.mapManager &&
            window.appManager.mapManager.clusteringManager) {
            const cm = window.appManager.mapManager.clusteringManager;
            if (cm.selectedClusterIndex !== null) {
                console.log('📍 bfcache 복원 - 좌표 클러스터 선택 해제');
                cm.selectedClusterIndex = null;
                cm.showClusteredMarkers();
            }
        }
    }
});

/* ── visibilitychange: 탭 복귀 시 하트 재초기화 ── */
document.addEventListener("visibilitychange", () => {
    if (!document.hidden) initLikedHearts();
});
