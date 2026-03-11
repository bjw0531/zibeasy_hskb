/**
 * 매물종류 필터링 관리
 */

// ✅ 모달 열기 전 상태 백업 (닫기 시 복원용)
window.backupPropertyCategory = [];

/* ── 전역 선택 카테고리 초기화 ──
   목록 페이지 → 지도 뒤로가기 시:
     1) sessionStorage에서 카테고리를 즉시 복원
     2) MapManager.prototype.init을 일시 패치해
        첫 번째 loadPropertiesInBounds() 전에 currentCategory를 주입
   bfcache로 복원된 경우는 JS 상태가 그대로 유지되므로 이 블록이 실행되지 않음 */
window.selectedPropertyCategory = (function restoreCategoryOrInit() {
    /* returningFromList 플래그 확인 */
    if (!sessionStorage.getItem('returningFromList')) return [];

    const savedCategory         = sessionStorage.getItem('selectedPropertyCategory');
    const savedText             = sessionStorage.getItem('propertyTypeText');
    const savedFullFilterState  = sessionStorage.getItem('fullFilterState');
    const savedFullFilterParams = sessionStorage.getItem('fullFilterParams');
    const savedThemeFilter      = sessionStorage.getItem('currentThemeFilter'); // ✅ 테마 필터 추가

    /* sessionStorage 즉시 정리 (이중 실행 방지) */
    sessionStorage.removeItem('returningFromList');
    sessionStorage.removeItem('selectedPropertyCategory');
    sessionStorage.removeItem('propertyTypeText');
    sessionStorage.removeItem('fullFilterState');
    sessionStorage.removeItem('fullFilterParams');
    sessionStorage.removeItem('currentThemeFilter'); // ✅ 테마 필터 정리 추가

    /* 카테고리 파싱 */
    let categories = [];
    if (savedCategory) {
        try {
            const parsed = JSON.parse(savedCategory);
            if (Array.isArray(parsed) && parsed.length > 0) categories = parsed;
        } catch(e) {}
    }

    /* 전체 필터 파싱 */
    let fullFilterStateObj  = null;
    let fullFilterParamsObj = null;
    if (savedFullFilterState)  { try { fullFilterStateObj  = JSON.parse(savedFullFilterState);  } catch(e) {} }
    if (savedFullFilterParams) { try { fullFilterParamsObj = JSON.parse(savedFullFilterParams); } catch(e) {} }

    /* ✅ 테마 필터 파싱 */
    let themeFilterObj = null;
    if (savedThemeFilter) { try { themeFilterObj = JSON.parse(savedThemeFilter); } catch(e) {} }

    /* 복원할 항목이 없으면 종료 */
    if (categories.length === 0 && !fullFilterParamsObj && !fullFilterStateObj && !themeFilterObj) return [];

    /* 상단 버튼 텍스트 복원 */
    if (savedText && categories.length > 0) {
        const typeText = document.getElementById('propertyTypeText');
        if (typeText) typeText.textContent = savedText;
    }

    /* 매물종류 모달 버튼 선택 상태 복원 */
    if (categories.length > 0) {
        document.querySelectorAll('.property-type-option').forEach(btn => {
            btn.classList.remove('selected');
        });
        categories.forEach(cat => {
            const btn = document.querySelector(`.property-type-option[data-category="${cat}"]`);
            if (btn) btn.classList.add('selected');
        });
    }

    /* MapManager.prototype.init 일시 패치:
       카테고리·전체필터·테마필터 동시 주입.
       full-filter.js 가 이 IIFE 이후에 실행되어 window.fullFilterState를 기본값으로
       덮어쓰므로, 모든 스크립트 로드 후인 MapManager.init 시점에 fullFilterState를 복원. */
    if (typeof MapManager !== 'undefined') {
        const _orig = MapManager.prototype.init;
        MapManager.prototype.init = async function() {
            /* 카테고리 주입 */
            if (categories.length > 0) {
                this.currentCategory = [...categories];
            }
            /* 전체 필터 파라미터 주입 */
            if (fullFilterParamsObj) {
                this.fullFilterParams = { ...fullFilterParamsObj };
            }
            /* ✅ 테마 필터 파라미터 주입 (API 요청 시 사용) */
            if (themeFilterObj) {
                if (themeFilterObj.columns && themeFilterObj.columns.length > 0) {
                    this.themeFilterParams = { thema: themeFilterObj.columns.join(',') };
                } else if (themeFilterObj.column) {
                    this.themeFilterParams = { thema: themeFilterObj.column };
                }
            }
            /* window.fullFilterState 복원 (full-filter.js 기본값 초기화 이후이므로 안전) */
            if (fullFilterStateObj && window.fullFilterState) {
                Object.assign(window.fullFilterState, fullFilterStateObj);
            }
            MapManager.prototype.init = _orig; /* 패치 즉시 복구 */
            const result = await _orig.call(this);
            /* 전체 필터 아이콘 배지 업데이트 (필터 활성 시 filterIconBtn에 active 클래스) */
            if (typeof updateFilterIconState === 'function') {
                updateFilterIconState();
            }
            /* ✅ 테마 필터 상태·UI 복원 (window.currentThemeFilter + 버튼 활성화) */
            if (themeFilterObj) {
                window.currentThemeFilter = themeFilterObj;
                const recommendBtn  = document.getElementById('recommendFilterBtn');
                const recommendText = document.getElementById('recommendFilterText');
                if (recommendBtn)  recommendBtn.classList.add('active');
                if (recommendText && themeFilterObj.label) recommendText.textContent = themeFilterObj.label;
                if (typeof updatePanelLabel === 'function') updatePanelLabel();
                console.log('🔄 테마 필터 복원 (목록 페이지 복귀):', themeFilterObj.label);
            }
            return result;
        };
    }

    if (categories.length > 0)  console.log('🔄 매물종류 필터 복원 (목록 페이지 복귀):', categories);
    if (fullFilterParamsObj)     console.log('🔄 전체 필터 복원 (목록 페이지 복귀):', fullFilterParamsObj);
    if (themeFilterObj)          console.log('🔄 테마 필터 복원 예약 (목록 페이지 복귀):', themeFilterObj.label);
    return categories;
})();

/**
 * 매물종류 모달 열기 - ✅ 드래그 패널 닫기 후 팝업 표시
 */
function openPropertyTypeModal() {
    console.log('📋 매물종류 모달 열기');

    // ✅ 관심목록 상태 복구 (12번 줄 다음에 추가)
    if (window.appManager && window.appManager.mapManager) {
        window.appManager.mapManager.restoreFromLikedFilter();
    }

    // ✅ 현재 선택 상태 백업 (닫기 시 복원용)
    window.backupPropertyCategory = [...window.selectedPropertyCategory];

    // ✅ 팝업 내 버튼 UI를 현재 selectedPropertyCategory와 동기화
    document.querySelectorAll('.property-type-option').forEach(btn => {
        btn.classList.remove('selected');
    });
    if (window.selectedPropertyCategory.length === 0) {
        const allButton = document.querySelector('.property-type-option[data-category=""]');
        if (allButton) {
            allButton.classList.add('selected');
        }
    } else {
        window.selectedPropertyCategory.forEach(cat => {
            const btn = document.querySelector(`.property-type-option[data-category="${cat}"]`);
            if (btn) {
                btn.classList.add('selected');
            }
        });
    }

    const modal = document.getElementById('propertyTypeModal');
    const selector = document.getElementById('propertyTypeSelector');

    // ✅ 히스토리에 상태 추가 (뒤로가기 지원)
    history.pushState({ modal: 'propertyType' }, '', '');
    window.propertyTypeModalHistoryPushed = true;  // ✅ 히스토리 푸시 여부 추적

    // ✅ 바로 팝업 표시 (setTimeout 제거!)
    console.log('✅ 팝업 표시');
    if (modal && selector) {
        modal.classList.add('active');
        selector.classList.add('active');
    }
}

/**
 * 매물종류 모달 닫기 - ✅ 적용하지 않고 닫으면 이전 상태로 복원
 */
function closePropertyTypeModal(event) {
    // event가 있고, 모달 배경을 클릭한 경우만 닫기
    if (event && event.target.classList.contains('property-type-modal-content')) {
        return;
    }

    // ✅ 뒤로가기로 닫힌 게 아니면 히스토리 뒤로가기
    if (!window.isClosingByBackButton && window.propertyTypeModalHistoryPushed) {
        window.propertyTypeModalHistoryPushed = false;
        /* ✅ 모달 닫기로 인한 popstate에서 동/역 선택 해제 방지 */
        window.isClosingByPropertyTypeModal = true;
        history.back();
    }

    console.log('❌ 매물종류 모달 닫기 (적용 없이)');

    // ✅ 백업된 상태로 복원 (적용하지 않고 닫을 때)
    window.selectedPropertyCategory = [...window.backupPropertyCategory];

    // ✅ UI 버튼 상태도 복원
    document.querySelectorAll('.property-type-option').forEach(btn => {
        btn.classList.remove('selected');
    });

    if (window.selectedPropertyCategory.length === 0) {
        // 전체 선택 상태
        const allButton = document.querySelector('.property-type-option[data-category=""]');
        if (allButton) {
            allButton.classList.add('selected');
        }
    } else {
        // 개별 카테고리 선택 상태
        window.selectedPropertyCategory.forEach(cat => {
            const btn = document.querySelector(`.property-type-option[data-category="${cat}"]`);
            if (btn) {
                btn.classList.add('selected');
            }
        });
    }

    console.log('🔄 선택 상태 복원:', window.selectedPropertyCategory);

    const modal = document.getElementById('propertyTypeModal');
    const selector = document.getElementById('propertyTypeSelector');

    if (modal) {
        modal.classList.remove('active');
        if (selector) {
            selector.classList.remove('active');
        }
        document.body.style.overflow = ''; // 스크롤 복원
    }

}

/**
 * 매물종류 선택 (중복 선택 가능) - ✅ 선택만 하고 필터 적용은 적용하기 버튼에서
 */
function selectPropertyType(event, category, name) {
    event.stopPropagation(); // 이벤트 버블링 방지

    console.log(`🏷️ 매물종류 선택: ${name} (${category || '전체'})`);

    // "전체" 선택 시 다른 모든 선택 해제
    if (category === '') {
        window.selectedPropertyCategory = [];
        document.querySelectorAll('.property-type-option').forEach(btn => {
            btn.classList.remove('selected');
        });
        event.currentTarget.classList.add('selected');
    } else {
        // 중복 선택 토글
        const isSelected = event.currentTarget.classList.contains('selected');

        if (isSelected) {
            // 이미 선택된 경우 제거
            event.currentTarget.classList.remove('selected');
            window.selectedPropertyCategory = window.selectedPropertyCategory.filter(cat => cat !== category);
        } else {
            // 선택 안 된 경우 추가
            event.currentTarget.classList.add('selected');
            window.selectedPropertyCategory.push(category);
        }

        // "전체" 버튼에서 selected 제거
        const allButton = document.querySelector('.property-type-option[data-category=""]');
        if (allButton) {
            allButton.classList.remove('selected');
        }
    }

    // ✅ 필터 적용은 하지 않음 (적용하기 버튼에서 처리)
    // applyPropertyTypeFilter(window.selectedPropertyCategory); // 삭제됨
}

/**
 * ✅ 적용하기 버튼 클릭 - 필터 적용 후 모달 닫기 (애니메이션 포함)
 */
function applyAndClosePropertyTypeModal() {
    console.log('✅ 매물종류 필터 적용하기');

    const applyBtn = document.querySelector('.property-type-apply-btn');
    const modalContent = document.querySelector('.property-type-modal-content');
    const modal = document.getElementById('propertyTypeModal');
    const selector = document.getElementById('propertyTypeSelector');

    // ✅ 1단계: 버튼 배경색 채움 애니메이션
    if (applyBtn) {
        applyBtn.classList.add('applying');
    }

    // ✅ 상단 버튼 텍스트 업데이트
    const typeText = document.getElementById('propertyTypeText');
    if (typeText) {
        const allButton = document.querySelector('.property-type-option[data-category=""]');
        const isAllSelected = allButton && allButton.classList.contains('selected');

        if (isAllSelected) {
            typeText.textContent = '전체';
        } else if (window.selectedPropertyCategory.length === 0) {
            typeText.textContent = '매물종류';
        } else if (window.selectedPropertyCategory.length === 1) {
            const selectedBtn = document.querySelector(`.property-type-option[data-category="${window.selectedPropertyCategory[0]}"]`);
            let displayText = selectedBtn ? selectedBtn.querySelector('.option-text').textContent : '매물종류';

            if (displayText === '무보증/단기') {
                displayText = '무보증';
            }

            typeText.textContent = displayText;
        } else {
            typeText.textContent = `${window.selectedPropertyCategory.length}개 선택`;
        }
    }

    // ✅ 필터 적용
    applyPropertyTypeFilter(window.selectedPropertyCategory);

    // ✅ 2단계: 0.1초 후 모달 닫힘 애니메이션 시작
    setTimeout(() => {
        if (modalContent) {
            modalContent.classList.add('closing');
        }

        // ✅ 3단계: 모달 닫힘 애니메이션 완료 후 실제로 닫기
        setTimeout(() => {
            if (modal) {
                modal.classList.remove('active');
            }
            if (selector) {
                selector.classList.remove('active');
            }
            // 애니메이션 클래스 제거 (다음에 다시 사용하기 위해)
            if (applyBtn) {
                applyBtn.classList.remove('applying');
            }
            if (modalContent) {
                modalContent.classList.remove('closing');
            }
            document.body.style.overflow = '';

        }, 200); // 모달 닫힘 애니메이션 시간
    }, 100); // 버튼 배경색 채움 시간
}

/**
 * 매물종류 필터 적용 (배열 지원)
 */
async function applyPropertyTypeFilter(categories) {
    const categoryArray = Array.isArray(categories) ? categories : (categories ? [categories] : []);
    console.log(`🔍 매물 필터링 적용: ${categoryArray.length > 0 ? categoryArray.join(', ') : '전체'}`);



    // MapManager가 있으면 필터링 적용
    if (window.appManager && window.appManager.mapManager) {
        // 선택된 카테고리 배열 저장
        window.appManager.mapManager.currentCategory = categoryArray.length > 0 ? categoryArray : null;

        // ✅ 역 필터가 활성화된 경우: 역 반경 내 매물에서 필터링
        if (window.stationManager && window.stationManager.isStationFilterActive && window.stationManager.filteredProperties) {
            console.log('🚇 역 필터 활성 상태 - 역 반경 내 매물에서 매물종류 필터링');

            // 반경 내 전체 매물 (카테고리 필터 전)
            let filteredByType = window.stationManager.filteredProperties;

            // 카테고리 필터 적용
            if (categoryArray.length > 0) {
                filteredByType = filteredByType.filter(property => {
                    return categoryArray.includes(String(property.category));
                });
            }

            console.log(`✅ 역 반경 내 ${categoryArray.length > 0 ? categoryArray.join('+') : '전체'} 매물: ${filteredByType.length}개`);

            // ✅ 화면에 보이는 매물만 필터링 (역 선택 초기 표시 기준과 동일하게 viewport 기반)
            const bounds = window.appManager.mapManager.map.getBounds();
            const viewportFiltered = filteredByType.filter(property => {
                const lat = parseFloat(property.lat);
                const lng = parseFloat(property.lng);
                const propertyLatLng = new naver.maps.LatLng(lat, lng);
                return bounds.hasLatLng(propertyLatLng);
            });

            console.log(`🚇 화면 영역 내 매물: ${viewportFiltered.length}개 (전체 반경: ${filteredByType.length}개)`);

            // ✅ viewportFilteredProperties 업데이트 (목록 페이지 이동 시 사용)
            window.stationManager.viewportFilteredProperties = viewportFiltered;

            // 마커 다시 그리기 (viewport 기반)
            window.appManager.mapManager.properties = viewportFiltered;
            if (window.appManager.mapManager.markerManager) {
                window.appManager.mapManager.markerManager.createMarkers(viewportFiltered);
                if (window.appManager.mapManager.clusteringManager) {
                    window.appManager.mapManager.clusteringManager.showClusteredMarkers();
                }
            }

            // ✅ 수량 업데이트 (viewport 기반 카운트 사용 - 초기 역 선택 시와 동일 기준)
            window.stationManager.updatePropertyCount(viewportFiltered.length, window.stationManager.selectedStation.name);

            // ✅ 드래그 패널 레이블 업데이트
            if (typeof updatePanelLabel === 'function') {
                updatePanelLabel();
            }

            return;
        }

        // ✅ 동 선택 상태가 있는 경우: 해당 동 매물에서 필터링
        if (window.currentDongSearch && window.currentDongSearch.properties) {
            console.log('🏠 동 선택 활성 상태 - 해당 동 매물에서 매물종류 필터링');

            let filteredByType = window.currentDongSearch.properties;

            // 카테고리 필터 적용
            if (categoryArray.length > 0) {
                filteredByType = filteredByType.filter(property => {
                    return categoryArray.includes(String(property.category));
                });
            }

            console.log(`✅ ${window.currentDongSearch.locationName} 내 ${categoryArray.length > 0 ? categoryArray.join('+') : '전체'} 매물: ${filteredByType.length}개`);

            // 매물 개수 업데이트
            const countElement = document.getElementById('propertyCount');
            if (countElement) countElement.textContent = filteredByType.length;

            // ✅ 드래그 패널 레이블 업데이트
            if (typeof updatePanelLabel === 'function') {
                updatePanelLabel();
            }

            // 패널 매물 목록 업데이트
            const listContent = document.getElementById('listContent');
            if (listContent && window.appManager && window.appManager.createPropertyCard) {
                if (filteredByType.length > 0) {
                    const cards = filteredByType.map(p => window.appManager.createPropertyCard(p)).join('');
                    listContent.innerHTML = cards;
                    if (typeof initLikedHearts === 'function') {
                        initLikedHearts();
                    }
                } else {
                    listContent.innerHTML = `
                        <div class="list-empty">
                            <div class="list-empty-icon">🏠</div>
                            <div class="list-empty-title">${window.currentDongSearch.locationName}에 해당 매물이 없습니다</div>
                        </div>
                    `;
                }
            }

            // ✅ 동 마커 수량 업데이트 (클러스터링 마커 재렌더링)
            if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.clusteringManager) {
                // 필터링된 매물 수량으로 동 마커 업데이트
                window.currentDongSearch.filteredCount = filteredByType.length;
                window.appManager.mapManager.clusteringManager.showClusteredMarkers();
            }

            return;
        }

        // ✅ 지역 검색 상태가 있는 경우: 해당 지역 매물에서 필터링
        if (window.currentLocationSearch && window.currentLocationSearch.allProperties) {
            console.log('📍 지역 검색 활성 상태 - 지역 내 매물에서 매물종류 필터링');

            let filteredByType = window.currentLocationSearch.allProperties;

            // 카테고리 필터 적용
            if (categoryArray.length > 0) {
                filteredByType = filteredByType.filter(property => {
                    return categoryArray.includes(String(property.category));
                });
            }

            console.log(`✅ 지역 내 ${categoryArray.length > 0 ? categoryArray.join('+') : '전체'} 매물: ${filteredByType.length}개`);

            // 매물 개수 업데이트
            const countElement = document.getElementById('propertyCount');
            if (countElement) countElement.textContent = filteredByType.length;

            // ✅ 드래그 패널 레이블 업데이트
            if (typeof updatePanelLabel === 'function') {
                updatePanelLabel();
            }

            // 마커 다시 그리기
            window.appManager.mapManager.properties = filteredByType;
            if (window.appManager.mapManager.markerManager) {
                window.appManager.mapManager.markerManager.createMarkers(filteredByType);
                if (window.appManager.mapManager.clusteringManager) {
                    window.appManager.mapManager.clusteringManager.showClusteredMarkers();
                }
            }

            return;
        }

        // ✅ 캐시 초기화 (새로운 필터 적용을 위해)
        if (window.appManager.mapManager.propertyCache) {
            window.appManager.mapManager.propertyCache.clear();
            console.log('🗑️ 매물 캐시 초기화');
        }

        // ✅ 지도 매물 다시 로드 (await 추가 - 헤더 수량 업데이트를 위해)
        await window.appManager.mapManager.loadPropertiesInBounds();

        console.log('✅ 매물 필터링 완료');

        // ✅ 드래그 패널 레이블 업데이트
        if (typeof updatePanelLabel === 'function') {
            updatePanelLabel();
        }
    } else {
        console.error('❌ AppManager 또는 MapManager를 찾을 수 없습니다.');
    }
}

/**
 * ESC 키로 모달 닫기
 */
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('propertyTypeModal');
        if (modal && modal.classList.contains('active')) {
            closePropertyTypeModal();
        }
    }
});

/**
 * ✅ 매물종류 필터 전역 객체 (resetToDefault 등 메서드 제공)
 */
window.propertyTypeFilter = {
    /**
     * 전체 선택으로 초기화
     */
    resetToDefault: function () {
        console.log('🔄 매물종류 필터 초기화');

        // 선택 배열 초기화
        window.selectedPropertyCategory = [];

        // 모든 옵션 버튼 selected 해제
        document.querySelectorAll('.property-type-option').forEach(btn => {
            btn.classList.remove('selected');
        });

        // "전체" 버튼 selected 추가
        const allButton = document.querySelector('.property-type-option[data-category=""]');
        if (allButton) {
            allButton.classList.add('selected');
        }

        // 상단 버튼 텍스트 업데이트
        const typeText = document.getElementById('propertyTypeText');
        if (typeText) {
            typeText.textContent = '매물종류';
        }

        // MapManager 카테고리 초기화
        if (window.appManager && window.appManager.mapManager) {
            window.appManager.mapManager.currentCategory = null;
        }

        console.log('✅ 매물종류 필터 초기화 완료');
    }
};