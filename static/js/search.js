/**
 * 검색 기능 관리
 */
class SearchManager {
    constructor() {
        this.searchInput = null;
        this.searchResults = null;
        this.recentSearches = [];
        this.init();
    }

    init() {
        this.searchInput = document.getElementById('searchPageInput');
        this.searchResults = document.getElementById('searchResults');
        this.clearBtn = document.getElementById('searchClearBtn'); // ✅ 추가

        if (this.searchInput) {
            // 입력 이벤트
            this.searchInput.addEventListener('input', (e) => {
                this.handleSearchInput(e.target.value);
                this.toggleClearButton(e.target.value); // ✅ 추가
            });

            // 엔터키 이벤트
            this.searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch(e.target.value);
                }
            });
        }

        this.loadRecentSearches();
        this.showRecentSearches();
    }

    /**
     * ✅ 추가: X 버튼 표시/숨김 토글
     */
    toggleClearButton(value) {
        if (this.clearBtn) {
            this.clearBtn.style.display = value.length > 0 ? 'flex' : 'none';
        }
    }

    /**
     * ✅ 추가: 검색창 초기화
     */
    resetSearchInput() {
        if (this.searchInput) {
            this.searchInput.value = '';
            this.showRecentSearches();
        }
        this.toggleClearButton(''); // ✅ X 버튼 숨기기
    }

    /**
     * ✅ 역 데이터 (정적)
     */
    getStations() {
        return [
            { id: 'dujeong', name: '두정역', lat: 36.834037, lng: 127.152885 },
            { id: 'cheonan', name: '천안역', lat: 36.809692, lng: 127.146224 },
            { id: 'bongmyeong', name: '봉명역', lat: 36.801410, lng: 127.136079 },
            { id: 'ssangyong', name: '쌍용역', lat: 36.793721, lng: 127.121369 }
        ];
    }

    /**
     * 검색 입력 처리 (실시간 검색) - ✅ 지역/역 검색 지원
     */
    handleSearchInput(query) {
        if (query.length < 2) {
            this.showRecentSearches();
            return;
        }

        // 숫자면 매물번호 검색
        if (/^\d+$/.test(query)) {
            this.showPropertyNumberSuggestion(query);
            return;
        }

        // 문자면 지역/역 검색
        this.searchLocationAndStation(query);
    }

    /**
     * ✅ 매물번호 검색 제안
     */
    showPropertyNumberSuggestion(query) {
        if (this.searchResults) {
            this.searchResults.innerHTML = `
                <div class="search-suggestions">
                    <div class="search-suggestion-item" onclick="window.searchManager.performSearch('${query}')">
                        <span class="suggestion-icon">🏠</span>
                        <div class="suggestion-text">
                            <span class="suggestion-main">매물번호 ${query}</span>
                            <span class="suggestion-sub">엔터를 눌러 검색</span>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    /**
     * ✅ 지역/역 검색 (API + 정적 데이터)
     */
    async searchLocationAndStation(query) {
        // 역 검색 (정적 데이터)
        const stations = this.getStations();
        const matchedStations = stations.filter(s =>
            s.name.includes(query) || s.name.replace('역', '').includes(query)
        );

        // 지역 검색 (API)
        let matchedLocations = [];
        try {
            const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            matchedLocations = data.locations || [];
        } catch (e) {
            console.error('지역 검색 오류:', e);
        }

        // 결과 표시
        this.showLocationStationResults(query, matchedLocations, matchedStations);
    }

    /**
     * ✅ 지역/역 검색 결과 표시
     */
    showLocationStationResults(query, locations, stations) {
        if (!this.searchResults) return;

        let html = '<div class="search-suggestions">';

        // 결과가 없으면 안내 메시지
        if (locations.length === 0 && stations.length === 0) {
            html += `
                <div class="search-no-results-msg">
                    <p>"${query}"에 해당하는 지역 또는 역을 찾을 수 없습니다.</p>
                </div>
            `;
        } else {
            // 지역 결과 (우선 표시)
            locations.forEach(loc => {
                html += `
                    <div class="search-suggestion-item" onclick="window.searchManager.selectLocation('${loc.dong}', '${loc.ri || ''}', '${loc.full_address}')">
                        <span class="suggestion-icon">📍</span>
                        <div class="suggestion-text">
                            <span class="suggestion-main">${loc.name}</span>
                            <span class="suggestion-sub">${loc.full_address} (${loc.property_count}개 매물)</span>
                        </div>
                    </div>
                `;
            });

            // 역 결과
            stations.forEach(station => {
                html += `
                    <div class="search-suggestion-item" onclick="window.searchManager.selectStation('${station.id}')">
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
        }

        html += '</div>';
        this.searchResults.innerHTML = html;
    }

    /**
     * ✅ 지역 선택 시 매물 표시
     */
    async selectLocation(dong, ri, fullAddress) {
        console.log('📍 지역 선택:', dong, ri);

        // ✅ 매물종류 필터 초기화 제거 - 기존 필터 유지
        // this.resetPropertyTypeFilter(); // 삭제됨

        // 검색 페이지 닫기
        this.closeSearchPage();

        // 검색어 저장
        this.saveRecentSearch(ri || dong);

        // API로 해당 지역 매물 조회
        try {
            const response = await fetch(`/api/properties?dong=${encodeURIComponent(dong)}`);
            const data = await response.json();

            if (data.success && data.data && data.data.length > 0) {
                let properties = data.data;
                const locationName = ri || dong;

                // ✅ 지역 검색 상태 저장 (원본 매물 목록 포함)
                window.currentLocationSearch = {
                    dong: dong,
                    ri: ri,
                    locationName: locationName,
                    allProperties: properties // 전체 매물 (필터 적용 전)
                };

                // ✅ 현재 선택된 매물종류 필터 적용
                if (window.selectedPropertyCategory && window.selectedPropertyCategory.length > 0) {
                    const filteredProperties = properties.filter(property => {
                        return window.selectedPropertyCategory.includes(String(property.category));
                    });
                    console.log(`🔍 매물종류 필터 적용: ${properties.length}개 → ${filteredProperties.length}개`);
                    properties = filteredProperties;
                }

                // 매물 리스트 표시
                this.showLocationResults(properties, locationName);
            } else {
                // ✅ 검색 결과 없음 시에도 상태 저장
                window.currentLocationSearch = {
                    dong: dong,
                    ri: ri,
                    locationName: ri || dong,
                    allProperties: []
                };
                this.showNoResultsInPanel(ri || dong);
            }
        } catch (e) {
            console.error('지역 매물 조회 오류:', e);
        }
    }

    /**
     * ✅ 역 선택 시 매물 표시
     */
    selectStation(stationId) {
        console.log('🚇 역 선택:', stationId);

        // ✅ 매물종류 필터 초기화 제거 - 기존 필터 유지
        // this.resetPropertyTypeFilter(); // 삭제됨

        // ✅ 지역 검색 상태 초기화 (역 검색은 지역 검색과 별개)
        window.currentLocationSearch = null;

        // 검색 페이지 닫기
        this.closeSearchPage();

        // StationManager를 통해 역 선택 처리
        if (window.stationManager) {
            const station = window.stationManager.stations.find(s => s.id === stationId);
            if (station) {
                this.saveRecentSearch(station.name);
                window.stationManager.selectStation(station);
                // ✅ 패널 자동 열기 제거 - 반경과 매물 수량만 표시
            }
        }
    }

    /**
     * ✅ 매물종류 필터 초기화
     */
    resetPropertyTypeFilter() {
        console.log('🔄 매물종류 필터 초기화');

        // 전역 선택 카테고리 초기화
        window.selectedPropertyCategory = [];

        // MapManager 카테고리 초기화
        if (window.appManager && window.appManager.mapManager) {
            window.appManager.mapManager.currentCategory = null;
        }

        // UI 초기화 - 모든 버튼 선택 해제
        document.querySelectorAll('.property-type-option').forEach(btn => {
            btn.classList.remove('selected');
        });

        // "전체" 버튼 선택
        const allButton = document.querySelector('.property-type-option[data-category=""]');
        if (allButton) {
            allButton.classList.add('selected');
        }

        // 상단 버튼 텍스트 업데이트
        const typeText = document.getElementById('propertyTypeText');
        if (typeText) {
            typeText.textContent = '전체';
        }
    }

    /**
     * ✅ 지역 검색 결과를 패널에 표시
     */
    showLocationResults(properties, locationName) {
        if (window.appManager) {
            // ✅ 검색 상태 저장 (지도 이동/줌 전까지 헤더 유지용)
            window.currentDongSearch = {
                locationName: locationName,
                count: properties.length,
                properties: properties
            };

            // 매물 개수 업데이트
            const countElement = document.getElementById('propertyCount');
            if (countElement) countElement.textContent = properties.length;

            // ✅ 드래그 패널 레이블 업데이트
            if (typeof updatePanelLabel === 'function') {
                updatePanelLabel();
            }

            // ✅ 헤더 깜박임 효과
            const headerTop = document.querySelector('.list-header-top');
            if (headerTop) {
                headerTop.classList.remove('ripple');
                void headerTop.offsetWidth; // reflow 강제 트리거
                headerTop.classList.add('ripple');
                setTimeout(() => {
                    headerTop.classList.remove('ripple');
                }, 600);
            }

            // ✅ 매물 카드를 20개씩 페이지네이션으로 로드 (다른 곳과 동일한 방식)
            window.appManager.loadPropertiesInPanel(false, null, properties);

            // 하트 상태 초기화
            if (typeof initLikedHearts === 'function') {
                initLikedHearts();
            }

            // ✅ 마커는 업데이트하지 않음 - 전체 동 마커 유지
            // (해당 동만 표시하지 않고 전체 마커 그대로 유지)

            // ✅ 지도 이동 (동 경계 폴리곤의 중심점으로)
            if (properties.length > 0 && window.appManager.mapManager) {
                // ✅ 동 경계 폴리곤의 중심점 좌표 계산 (마커 평균 대신 경계 중심 사용)
                let centerLat, centerLng;

                if (window.dongBoundaryManager) {
                    const boundaryCenter = window.dongBoundaryManager.getBoundaryCenter(locationName);
                    if (boundaryCenter) {
                        centerLat = boundaryCenter.lat;
                        centerLng = boundaryCenter.lng;
                    }
                }

                // 경계 중심점을 찾지 못한 경우 매물 좌표 평균 사용 (fallback)
                if (!centerLat || !centerLng) {
                    const latSum = properties.reduce((sum, p) => sum + parseFloat(p.lat || 0), 0);
                    const lngSum = properties.reduce((sum, p) => sum + parseFloat(p.lng || 0), 0);
                    centerLat = latSum / properties.length;
                    centerLng = lngSum / properties.length;
                }

                // ✅ 지역 검색으로 인한 지도 이동임을 표시
                window.isLocationSearchMapMove = true;

                // ✅ 동 마커 색상 반전 효과를 위해 먼저 설정
                if (window.appManager.mapManager.clusteringManager) {
                    window.appManager.mapManager.clusteringManager.selectedDongName = locationName;
                }

                // ✅ 동별 클러스터 마커가 보이는 줌 레벨 13으로 이동
                window.appManager.mapManager.map.setZoom(13);
                window.appManager.mapManager.map.setCenter(
                    new naver.maps.LatLng(centerLat, centerLng)
                );

                // ✅ 동 경계 폴리곤 표시
                if (window.dongBoundaryManager) {
                    window.dongBoundaryManager.showBoundary(locationName, window.appManager.mapManager.map);
                }

                // ✅ 즉시 마커 반전 효과 적용 (현재 매물로 먼저 렌더링)
                if (window.appManager.mapManager.clusteringManager) {
                    window.appManager.mapManager.clusteringManager.showClusteredMarkers();
                }

                // ✅ 비동기로 전체 매물 로드 및 최종 마커 갱신
                const propertyCount = properties.length;
                const locationNameCopy = locationName;

                (async () => {
                    // ✅ 새 영역의 매물 로드 (주변 동 포함)
                    if (window.appManager.mapManager) {
                        await window.appManager.mapManager.loadPropertiesInBounds();
                    }

                    // ✅ 전체 매물 로드 후 클러스터 마커 다시 갱신
                    if (window.appManager.mapManager.clusteringManager) {
                        window.appManager.mapManager.clusteringManager.selectedDongName = locationNameCopy;
                        window.appManager.mapManager.clusteringManager.showClusteredMarkers();
                    }

                    // ✅ 동 경계 폴리곤 다시 표시 (마커 갱신 후)
                    if (window.dongBoundaryManager) {
                        window.dongBoundaryManager.showBoundary(locationNameCopy, window.appManager.mapManager.map);
                    }

                    // 매물 수량 다시 설정
                    const countElement = document.getElementById('propertyCount');
                    if (countElement) countElement.textContent = propertyCount;

                    // ✅ 드래그 패널 레이블 업데이트
                    if (typeof updatePanelLabel === 'function') {
                        updatePanelLabel();
                    }

                    window.isLocationSearchMapMove = false;
                    console.log(`✅ ${locationNameCopy} ${propertyCount}개 매물 - 전체 로드 완료`);
                })();
            }

            // ✅ 패널 열지 않음 - 헤더만 업데이트된 상태로 유지
            console.log(`✅ ${locationName} ${properties.length}개 매물 검색 완료 (패널 열지 않음)`);
        }
    } /**
     * 검색 실행 - ✅ 지역 우선 검색 (지역 > 역)
     */
    async performSearch(query) {
        if (!query.trim()) return;

        console.log('🔍 검색 실행:', query);

        // ✅ 모바일 키보드 먼저 내리기
        if (this.searchInput) {
            this.searchInput.blur();
        }

        // ✅ 숫자면 매물번호 검색
        if (/^\d+$/.test(query)) {
            try {
                const results = await this.searchProperties(query);
                this.closeSearchPage();

                if (results.length > 0) {
                    this.saveRecentSearch(query);
                    /* 매물번호는 고유값이므로 첫 번째 결과의 상세 페이지로 직접 이동 */
                    /* ✅ 슬라이드 애니메이션 플래그 설정 (오른쪽에서 왼쪽으로 슬라이드 인) */
                    sessionStorage.setItem('fromListPage', 'true');
                    sessionStorage.setItem('navDirection', 'slide-right');
                    window.location.href = `/view/${results[0].code}`;
                } else {
                    this.showNoResultsInPanel(query);
                }
            } catch (error) {
                console.error('검색 오류:', error);
                this.showSearchError();
            }
            return;
        }

        // ✅ 문자면 지역/역 검색 (지역 우선)
        try {
            // 1. 먼저 지역 검색 시도 (API)
            const response = await fetch(`/api/search/suggest?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            console.log('📍 지역 검색 결과:', data.locations);

            // 2. 역 이름 일치 확인
            const stations = this.getStations();
            const exactStation = stations.find(s => s.name === query || s.name === query + '역');
            const matchedStation = stations.find(s =>
                s.name.includes(query) || s.name.replace('역', '').includes(query)
            );
            console.log('🚇 역 검색 결과:', exactStation || matchedStation);

            // 3. 지역이 있으면 지역 우선 (역과 동시에 있어도 지역 우선)
            if (data.locations && data.locations.length > 0) {
                const loc = data.locations[0];
                console.log('✅ 지역 선택 (우선):', loc.dong);
                this.selectLocation(loc.dong, loc.ri, loc.full_address);
                return;
            }

            // 4. 지역이 없으면 역 검색 (정확 일치 → 부분 일치)
            if (exactStation) {
                console.log('✅ 역 선택 (정확 일치):', exactStation.name);
                this.selectStation(exactStation.id);
                return;
            }

            if (matchedStation) {
                console.log('✅ 역 선택 (부분 일치):', matchedStation.name);
                this.selectStation(matchedStation.id);
                return;
            }

            // 5. 결과 없음
            console.log('❌ 검색 결과 없음');
            this.closeSearchPage();
            this.showNoResultsInPanel(query);

        } catch (error) {
            console.error('검색 오류:', error);
            this.showSearchError();
        }
    }

    /**
     * 매물 검색 API 호출
     */
    async searchProperties(query) {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error('검색 API 오류');
        }
        return await response.json();
    }

    /**
     * 검색 결과를 드래그 패널에 표시
     */
    showSearchResults(properties) {
        if (window.appManager) {
            // ✅ 먼저 검색 결과를 표시 (개수 업데이트 포함)
            if (window.appManager.listManager) {
                window.appManager.listManager.showSearchResults(properties);
            }
            console.log('✅ 검색 결과 표시 완료');
        }
    }

    /**
     * 검색 페이지 닫기
     */
    closeSearchPage() {
        const searchPage = document.getElementById('searchPage');
        if (searchPage) {
            searchPage.classList.remove('active');
        }
    }

    /**
     * 최근 검색어 표시
     */
    showRecentSearches() {
        if (this.searchResults && this.recentSearches.length > 0) {
            const recentHtml = this.recentSearches.map(search =>
                `<div class="search-recent-item" onclick="window.searchManager.performSearch('${search}')">
                    ${search}
                </div>`
            ).join('');

            this.searchResults.innerHTML = `
                <div class="search-recent-section">
                    <h4>최근 검색</h4>
                    ${recentHtml}
                </div>
            `;
        } else if (this.searchResults) {
            this.searchResults.innerHTML = `
                <div class="search-no-recent">
                    <p>최근 검색어가 없습니다.</p>
                </div>
            `;
        }
    }

    /**
     * ✅ 검색 결과 없음 - 드래그 패널에 표시
     */
    showNoResultsInPanel(query) {
        if (window.appManager) {
            // ✅ 검색 모드 플래그 설정
            window.appManager.isSearchMode = true;

            // 매물 개수를 0으로 설정
            const countElement = document.getElementById('propertyCount');
            if (countElement) {
                countElement.textContent = '0';
            }

            // 패널에 메시지 표시
            const listContent = document.getElementById('listContent');
            if (listContent) {
                listContent.innerHTML = `
                    <div class="search-no-results" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; color: #666;">
                        <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                        <p style="font-size: 16px; font-weight: 500; margin-bottom: 8px;">해당되는 매물이 없습니다</p>
                        <p style="font-size: 14px; color: #999;">매물번호 "${query}"를 다시 확인해 주세요</p>
                    </div>
                `;
            }

            console.log('✅ 검색 결과 없음 표시 완료');
        }
    }

    /**
     * 검색 결과 없음 표시 (검색 페이지용 - 기존 유지)
     */
    showNoResults(query) {
        if (this.searchResults) {
            this.searchResults.innerHTML = `
                <div class="search-no-results">
                    <p>"${query}"에 대한 검색 결과가 없습니다.</p>
                </div>
            `;
        }
    }

    /**
     * 검색 오류 표시
     */
    showSearchError() {
        if (this.searchResults) {
            this.searchResults.innerHTML = `
                <div class="search-error">
                    <p>검색 중 오류가 발생했습니다.</p>
                </div>
            `;
        }
    }

    /**
     * 최근 검색어 저장
     */
    saveRecentSearch(query) {
        // 중복 제거
        this.recentSearches = this.recentSearches.filter(item => item !== query);
        this.recentSearches.unshift(query);

        // 최대 10개까지만 저장
        this.recentSearches = this.recentSearches.slice(0, 10);

        // 로컬 스토리지에 저장
        localStorage.setItem('recentSearches', JSON.stringify(this.recentSearches));
    }

    /**
     * 최근 검색어 로드
     */
    loadRecentSearches() {
        const saved = localStorage.getItem('recentSearches');
        if (saved) {
            this.recentSearches = JSON.parse(saved);
        }
    }
}

// 전역 검색 매니저 인스턴스
let searchManager = null;

// DOM 로드 후 초기화
document.addEventListener('DOMContentLoaded', () => {
    searchManager = new SearchManager();
    window.searchManager = searchManager; // 전역 접근을 위해
});

// ✅ 검색 페이지가 열릴 때마다 초기화
document.addEventListener('DOMContentLoaded', () => {
    const searchPage = document.getElementById('searchPage');
    if (searchPage) {
        // 검색 페이지가 열릴 때마다 초기화
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.classList.contains('active')) {
                        // 검색 페이지가 열렸을 때 초기화
                        if (window.searchManager) {
                            window.searchManager.resetSearchInput();
                        }

                        // ✅ 동 선택 해제 (검색 페이지 열릴 때)
                        if (typeof clearDongSelectionGlobal === 'function') {
                            clearDongSelectionGlobal();
                        }

                        // ✅ iOS 키보드 스크롤 문제 해결 - 스크롤 위치 초기화
                        searchPage.scrollTop = 0;
                        window.scrollTo(0, 0);

                        // ✅ 약간의 딜레이 후 입력창 포커스 (iOS에서 키보드로 인한 스크롤 방지)
                        setTimeout(() => {
                            const searchInput = document.getElementById('searchPageInput');
                            if (searchInput) {
                                searchInput.focus();
                                // 포커스 후 다시 스크롤 위치 고정
                                searchPage.scrollTop = 0;
                            }
                        }, 100);
                    }
                }
            });
        });

        observer.observe(searchPage, { attributes: true });
    }
});

// ✅ 전역 검색어 지우기 함수 (X 버튼 클릭 시 호출)
function clearSearchInput() {
    if (window.searchManager) {
        window.searchManager.resetSearchInput();
        // 검색창에 포커스 유지
        const searchInput = document.getElementById('searchPageInput');
        if (searchInput) {
            searchInput.focus();
        }
    }
}