/**
 * 역 관리 모듈 - 역 마커, 반경 원, 매물 필터링
 */
class StationManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.stationMarkers = [];
        this.radiusCircle = null;
        this.selectedStation = null;
        this.isStationFilterActive = false;
        this.selectedZoomLevel = null; // ✅ 역 선택 시 줌 레벨 저장 (축소 시 해제용)
        this.originalProperties = []; // 필터 전 원본 매물 저장

        // 천안 지역 주요 역 데이터 (정확한 좌표)
        this.stations = [
            { id: 'dujeong', name: '두정역', lat: 36.833950, lng: 127.149200 },
            { id: 'cheonan', name: '천안역', lat: 36.809692, lng: 127.146224 },
            { id: 'bongmyeong', name: '봉명역', lat: 36.801410, lng: 127.136079 },
            { id: 'ssangyong', name: '쌍용역', lat: 36.793721, lng: 127.121369 }
        ];

        this.RADIUS_METERS = 800; // 반경 800m
    }

    /**
     * 역 마커 초기화 (지도 위에 역 아이콘 표시)
     */
    initStationMarkers() {
        if (!this.mapManager.map) {
            console.warn('지도가 초기화되지 않았습니다.');
            return;
        }

        // 기존 마커 제거
        this.clearStationMarkers();

        // 각 역에 마커 생성
        this.stations.forEach(station => {
            const marker = new naver.maps.Marker({
                position: new naver.maps.LatLng(station.lat, station.lng),
                map: this.mapManager.map,
                icon: {
                    content: this.createStationIcon(station.name),
                    anchor: new naver.maps.Point(28, 13)
                },
                title: station.name,
                zIndex: 150
            });

            // 마커 클릭 이벤트
            naver.maps.Event.addListener(marker, 'click', () => {
                this.selectStation(station);
            });

            this.stationMarkers.push({ marker, station });
        });

        // ✅ 줌 레벨에 따른 역 마커 표시/숨김 이벤트 추가
        naver.maps.Event.addListener(this.mapManager.map, 'zoom_changed', () => {
            this.updateStationMarkersVisibility();
        });

        // 초기 표시 상태 설정
        this.updateStationMarkersVisibility();

        console.log(`✅ ${this.stations.length}개 역 마커 생성 완료`);
    }

    /**
     * ✅ 줌 레벨에 따른 역 마커 표시/숨김
     */
    updateStationMarkersVisibility() {
        const currentZoom = this.mapManager.map.getZoom();
        const shouldShow = currentZoom >= 13 && currentZoom <= 17;

        this.stationMarkers.forEach(({ marker }) => {
            if (shouldShow) {
                marker.setMap(this.mapManager.map);
            } else {
                marker.setMap(null);
            }
        });

        if (!shouldShow) {
            console.log(`🚇 줌 레벨 ${currentZoom} - 역 마커 숨김`);
        }
    }

    /**
     * 역 마커 아이콘 생성 (동별 마커 스타일과 유사, 한 단계 작은 사이즈)
     * @param {string} stationName - 역 이름
     * @param {boolean} isSelected - 선택 상태 여부
     */
    createStationIcon(stationName, isSelected = false) {
        const badgeHeight = 26;  // ✅ 동별 마커(32)보다 작게
        const iconSize = 14;     // ✅ 아이콘 사이즈도 축소

        // ✅ 색상 설정 (선택 시 반전)
        let iconBgColor, nameBgColor, nameTextColor;

        if (isSelected) {
            // 선택됨: 색상 반전 (흰색 아이콘 배경 + 파란색 배경)
            iconBgColor = 'rgb(255, 255, 255)';
            nameBgColor = '#3D9EDB';
            nameTextColor = 'rgb(255, 255, 255)';
        } else {
            // 기본: 파란색 아이콘 배경 + 흰색 배경
            iconBgColor = '#3D9EDB';
            nameBgColor = 'rgb(255, 255, 255)';
            nameTextColor = 'rgb(50, 50, 50)';
        }

        return `
            <div style="
                display: inline-flex;
                flex-direction: row;
                align-items: center;
                height: ${badgeHeight}px;
                background: ${nameBgColor};
                border-radius: ${badgeHeight / 2}px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.5);
                cursor: pointer;
                padding-left: 0;
                padding-right: 8px;
                position: relative;
                z-index: 150;
            ">
                <span style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: ${badgeHeight}px;
                    height: ${badgeHeight}px;
                    background: ${iconBgColor};
                    border-radius: ${badgeHeight / 2}px;
                    margin-right: 5px;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.15);
                ">
                    <img src="/static/images/station_icon.png" 
                         style="width: ${iconSize}px; height: ${iconSize}px; object-fit: contain;${isSelected ? ' filter: invert(0.5) sepia(1) saturate(5) hue-rotate(180deg);' : ''}" 
                         alt="역" />
                </span>
                <span style="
                    color: ${nameTextColor};
                    font-size: 12px;
                    font-weight: 500;
                    white-space: nowrap;
                ">${stationName}</span>
            </div>
        `;
    }

    /**
     * 역 마커 모두 제거
     */
    clearStationMarkers() {
        this.stationMarkers.forEach(({ marker }) => {
            marker.setMap(null);
        });
        this.stationMarkers = [];
    }

    /**
     * 역 선택
     */
    selectStation(station) {
        console.log(`🚇 역 선택: ${station.name}`);



        // 이미 같은 역이 선택되어 있으면 해제
        if (this.selectedStation && this.selectedStation.id === station.id) {
            this.clearStationFilter();
            return;
        }

        // ✅ 이전 선택된 역 마커 아이콘 복원
        if (this.selectedStation) {
            this.updateStationMarkerIcon(this.selectedStation.id, false);
        }

        // ✅ 동 선택 상태 해제 (역 선택 시 동 선택 해제)
        this.clearDongSelection();

        // ✅ 좌표 클러스터 선택 상태 해제 (역 선택 시)
        if (this.mapManager.clusteringManager && this.mapManager.clusteringManager.selectedClusterIndex !== null) {
            console.log('📍 역 선택으로 인해 좌표 클러스터 선택 해제');
            this.mapManager.clusteringManager.selectedClusterIndex = null;
        }

        this.selectedStation = station;
        this.isStationFilterActive = true;

        // ✅ 역 필터 활성 시 크로스헤어 숨김 (역이 거리 기준점이 되므로)
        const crosshair = document.getElementById('mapCrosshair');
        if (crosshair) crosshair.classList.add('crosshair-hidden');

        // ✅ 히스토리에 역 선택 상태 추가 (뒤로가기 시 해제용)
        history.pushState({ stationSelected: true, stationId: station.id }, '', '');
        console.log('📌 히스토리에 역 선택 상태 추가');

        // ✅ 현재 선택된 역 마커 아이콘 색상 반전
        this.updateStationMarkerIcon(station.id, true);

        // 1. 반경 원 표시
        this.showRadiusCircle(station);

        // 2. 선택된 역으로 지도 이동
        // ✅ OS별 설정에서 값 가져오기
        const topHeight = window.browserConfig.getTopUIHeight();
        const bottomHeight = window.browserConfig.getBottomUIHeight();
        const extraOffset = window.browserConfig.getCenterOffsetY();

        // ✅ 실제 지도 div의 bottom 오프셋 측정 (탭바+버튼 높이만큼 지도가 위로 밀림)
        const mapEl = document.getElementById('map');
        const mapBottom = mapEl ? (parseFloat(getComputedStyle(mapEl).bottom) || 0) : 0;
        const mapHeight = window.innerHeight - mapBottom;

        // 가시 영역의 중앙 계산
        const visibleCenterFromTop = topHeight + (mapHeight - topHeight - Math.max(0, bottomHeight)) / 2;
        const mapCenterFromTop = mapHeight / 2;
        const pixelOffset = (mapCenterFromTop - visibleCenterFromTop) + extraOffset;
        
        // ✅ 줌 레벨을 setZoom() 전에 저장 (zoom_changed 핸들러에서 참조하므로)
        this.selectedZoomLevel = 15;

        // 먼저 줌 레벨 설정
        this.mapManager.map.setZoom(15);
        
        // 픽셀 오프셋을 위도 오프셋으로 변환
        const projection = this.mapManager.map.getProjection();
        const stationPoint = projection.fromCoordToOffset(new naver.maps.LatLng(station.lat, station.lng));
        const offsetPoint = new naver.maps.Point(stationPoint.x, stationPoint.y - pixelOffset);
        const adjustedCenter = projection.fromOffsetToCoord(offsetPoint);
        
        this.mapManager.map.setCenter(adjustedCenter);
        console.log(`📍 역 중심 이동: 오프셋=${pixelOffset}px (${window.browserConfig.platform})`);

        // 3. 반경 내 매물 필터링
        this.filterPropertiesByRadius(station);

        // 4. UI 업데이트
        this.updateStationButtonUI(station);
    }

    /**
     * ✅ 역 마커 아이콘 업데이트 (색상 반전 효과)
     * @param {string} stationId - 역 ID
     * @param {boolean} isSelected - 선택 상태
     */
    updateStationMarkerIcon(stationId, isSelected) {
        const stationData = this.stationMarkers.find(s => s.station.id === stationId);
        if (stationData) {
            stationData.marker.setIcon({
                content: this.createStationIcon(stationData.station.name, isSelected),
                anchor: new naver.maps.Point(28, 13)
            });
            // 선택된 마커는 위에 표시
            stationData.marker.setZIndex(isSelected ? 200 : 150);
        }
    }

    /**
     * 반경 원 표시
     */
    showRadiusCircle(station) {
        // 기존 원 제거
        this.hideRadiusCircle();

        // 새 원 생성
        this.radiusCircle = new naver.maps.Circle({
            map: this.mapManager.map,
            center: new naver.maps.LatLng(station.lat, station.lng),
            radius: this.RADIUS_METERS,
            fillColor: '#FF7075',
            fillOpacity: 0.12,
            strokeColor: '#FF7075',
            strokeOpacity: 0.5,
            strokeWeight: 2,
            zIndex: 50
        });

        console.log(`🔴 ${station.name} 반경 ${this.RADIUS_METERS}m 원 표시`);
    }

    /**
     * 반경 원 숨기기
     */
    hideRadiusCircle() {
        if (this.radiusCircle) {
            this.radiusCircle.setMap(null);
            this.radiusCircle = null;
        }
    }

    /**
     * ✅ 선택된 역이 현재 화면에 보이는지 확인
     */
    isSelectedStationVisible() {
        if (!this.selectedStation || !this.mapManager.map) {
            return false;
        }

        const bounds = this.mapManager.map.getBounds();
        const stationLatLng = new naver.maps.LatLng(this.selectedStation.lat, this.selectedStation.lng);

        return bounds.hasLatLng(stationLatLng);
    }

    /**
     * ✅ 줌 변경 시 역 필터 업데이트 (역 필터 유지)
     */
    updateStationFilterOnZoom() {
        if (!this.isStationFilterActive || !this.selectedStation) {
            return;
        }

        // 화면에 보이는 역 반경 내 매물만 필터링
        this.filterPropertiesInViewport();
    }

    /**
     * ✅ 드래그 시 역 필터 업데이트 (역이 화면에 보이면 유지)
     */
    updateStationFilterOnDrag() {
        if (!this.isStationFilterActive || !this.selectedStation) {
            return;
        }

        // 화면에 보이는 역 반경 내 매물만 필터링
        this.filterPropertiesInViewport();
    }

    /**
     * ✅ 화면에 보이는 영역과 역 반경 내 매물 교집합 필터링
     */
    async filterPropertiesInViewport() {
        if (!this.selectedStation || !this.filteredProperties) {
            return;
        }

        const station = this.selectedStation;
        const bounds = this.mapManager.map.getBounds();

        // 역 반경 내 매물 중 현재 화면에 보이는 것만 필터링
        let viewportProperties = this.filteredProperties.filter(property => {
            const lat = parseFloat(property.lat);
            const lng = parseFloat(property.lng);
            const propertyLatLng = new naver.maps.LatLng(lat, lng);
            return bounds.hasLatLng(propertyLatLng);
        });

        // ✅ 현재 선택된 매물종류 필터가 있으면 추가 필터링
        const currentCategory = window.appManager?.mapManager?.currentCategory;
        if (currentCategory && Array.isArray(currentCategory) && currentCategory.length > 0) {
            viewportProperties = viewportProperties.filter(property => {
                return currentCategory.includes(property.category);
            });
        }

        console.log(`🚇 ${station.name} 반경 매물 중 화면 내: ${viewportProperties.length}개`);

        // ✅ viewportFilteredProperties 업데이트 (목록 페이지 이동 시 패널 수량과 일치시킴)
        this.viewportFilteredProperties = viewportProperties;

        // 마커 다시 그리기
        this.mapManager.properties = viewportProperties;
        if (this.mapManager.markerManager) {
            this.mapManager.markerManager.createMarkers(viewportProperties);
            if (this.mapManager.clusteringManager) {
                this.mapManager.clusteringManager.showClusteredMarkers();
            }
        }

        // 수량 업데이트 (역명 포함)
        this.updatePropertyCount(viewportProperties.length, station.name);
    }

    /**
     * 두 좌표 간 거리 계산 (미터)
     */
    getDistanceFromLatLng(lat1, lng1, lat2, lng2) {
        const R = 6371000; // 지구 반경 (미터)
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * 반경 내 매물 필터링 - ✅ 전체 필터도 함께 적용
     */
    async filterPropertiesByRadius(station) {
        // 원본 매물 백업
        if (!this.isStationFilterActive || this.originalProperties.length === 0) {
            this.originalProperties = [...this.mapManager.properties];
        }

        // ✅ 현재 적용된 전체 필터 파라미터 가져오기
        const fullFilterParams = this.mapManager.fullFilterParams || {};

        // ✅ 현재 적용된 테마 필터 파라미터 가져오기
        const themeFilterParams = this.mapManager.themeFilterParams || {};

        // API URL 생성 (전체 필터 + 테마 필터 적용)
        let apiUrl = '/api/properties';
        const queryParams = new URLSearchParams();

        // 전체 필터 파라미터 추가
        Object.entries(fullFilterParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                queryParams.append(key, value);
            }
        });

        // ✅ 테마 필터 파라미터 추가
        Object.entries(themeFilterParams).forEach(([key, value]) => {
            if (value !== undefined && value !== null && value !== '') {
                queryParams.append(key, value);
            }
        });

        const queryString = queryParams.toString();
        if (queryString) {
            apiUrl += '?' + queryString;
        }

        // API로 필터링된 매물 가져와서 반경 내 필터링
        try {
            console.log(`🚇 역 반경 매물 조회 (필터 적용): ${apiUrl}`);
            const response = await fetch(apiUrl);
            const data = await response.json();

            if (!data.success || !data.data) {
                console.error('매물 조회 실패');
                return;
            }

            // 반경 내 매물 필터링
            let nearbyProperties = data.data.filter(property => {
                const distance = this.getDistanceFromLatLng(
                    station.lat, station.lng,
                    parseFloat(property.lat), parseFloat(property.lng)
                );
                return distance <= this.RADIUS_METERS;
            });

            console.log(`✅ ${station.name} 반경 ${this.RADIUS_METERS}m 내 매물: ${nearbyProperties.length}개`);

            // ✅ 필터링된 매물 저장 (원본 - 매물종류 필터 적용 전)
            this.filteredProperties = nearbyProperties;

            // ✅ 현재 선택된 매물종류 필터가 있으면 추가 필터링
            const currentCategory = window.appManager?.mapManager?.currentCategory;
            if (currentCategory && Array.isArray(currentCategory) && currentCategory.length > 0) {
                nearbyProperties = nearbyProperties.filter(property => {
                    return currentCategory.includes(String(property.category));
                });
                console.log(`✅ 매물종류 필터 적용 후: ${nearbyProperties.length}개 (${currentCategory.join(', ')})`);
            }

            // ✅ 화면에 보이는 매물만 필터링하여 수량 계산
            const bounds = this.mapManager.map.getBounds();
            const viewportProperties = nearbyProperties.filter(property => {
                const lat = parseFloat(property.lat);
                const lng = parseFloat(property.lng);
                const propertyLatLng = new naver.maps.LatLng(lat, lng);
                return bounds.hasLatLng(propertyLatLng);
            });

            console.log(`🚇 ${station.name} 반경 내 화면 영역 매물: ${viewportProperties.length}개 (전체 반경: ${nearbyProperties.length}개)`);

            /* ✅ 역 필터 적용 시점의 viewport 매물 목록 보존
               mapManager.properties는 이후 지도 idle 이벤트로 재갱신될 수 있으므로
               목록 페이지 이동 시 이 시점의 codes를 사용해야 패널 카운트와 일치함 */
            this.viewportFilteredProperties = viewportProperties;

            // 지도 매물 업데이트 (화면에 보이는 매물만)
            this.mapManager.properties = viewportProperties;

            // 마커 다시 그리기
            if (this.mapManager.markerManager) {
                this.mapManager.markerManager.createMarkers(viewportProperties);
                if (this.mapManager.clusteringManager) {
                    this.mapManager.clusteringManager.showClusteredMarkers();
                }
            }

            // ✅ 화면에 보이는 매물 수량만 업데이트 (역명 포함)
            this.updatePropertyCount(viewportProperties.length, station.name);

        } catch (error) {
            console.error('역 주변 매물 필터링 오류:', error);
        }
    }

    /**
     * ✅ 매물 수량 업데이트 (역명 포함)
     */
    updatePropertyCount(count, stationName = null) {
        const countElement = document.getElementById('propertyCount');

        if (countElement) {
            countElement.textContent = count;
        }

        // ✅ 드래그 패널 레이블 업데이트 (우선순위에 따라 표시)
        if (typeof updatePanelLabel === 'function') {
            updatePanelLabel();
        }
    }

    /**
     * ✅ 지역명으로 매물 수량 표시 (동 클러스터용)
     */
    static updatePropertyCountWithLocation(count, locationName = null) {
        const countElement = document.getElementById('propertyCount');

        if (countElement) {
            countElement.textContent = count;
        }

        // ✅ 드래그 패널 레이블 업데이트 (우선순위에 따라 표시)
        if (typeof updatePanelLabel === 'function') {
            updatePanelLabel();
        }
    }

    /**
     * ✅ 드래그 패널 열 때 매물 목록 표시 (패널 헤더 클릭 시 호출)
     */
    showStationPropertyList() {
        if (!this.isStationFilterActive || !this.selectedStation) {
            return false; // 역 필터 비활성상태면 기본 동작
        }

        const station = this.selectedStation;

        // ✅ 수정: mapManager.properties를 사용 (모든 필터가 이미 적용된 상태)
        // filteredProperties 대신 mapManager.properties를 사용하여 헤더 수량과 일치시킴
        let properties = [...(this.mapManager.properties || [])];
        console.log(`🚇 ${station.name} 패널 목록: ${properties.length}개 (mapManager.properties 사용)`);

        // 매물 카드 생성
        const listContent = document.getElementById('listContent');
        if (listContent && window.appManager && window.appManager.createPropertyCard) {
            // ✅ 역 좌표에서 가까운 순으로 정렬
            const stationLat = station.lat;
            const stationLng = station.lng;

            // Haversine 공식을 사용한 거리 계산
            const calculateDistance = (lat1, lng1, lat2, lng2) => {
                const R = 6371;
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLng = (lng2 - lng1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLng / 2) * Math.sin(dLng / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            };

            // 거리순 정렬
            properties = properties.map(property => {
                const lat = parseFloat(property.lat);
                const lng = parseFloat(property.lng);
                return { ...property, _distance: calculateDistance(stationLat, stationLng, lat, lng) };
            }).sort((a, b) => a._distance - b._distance);

            console.log(`📍 ${station.name}에서 거리순 정렬 완료`);

            // ✅ 매물 카드를 20개씩 페이지네이션으로 로드 (다른 곳과 동일한 방식)
            window.appManager.loadPropertiesInPanel(false, null, properties);

            // ✅ 상단에 역 정보 배너 삽입
            const stationBanner = `
                <div class="station-filter-banner">
                    <span class="station-icon" style="display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: #3D9EDB; border-radius: 50%;">
                        <img src="/static/images/station_icon.png" alt="역" style="width: 14px; height: 14px; object-fit: contain;">
                    </span>
                    <span class="station-name">${station.name} 주변</span>
                    <span class="station-radius">(반경 800m, 도보 15분)</span>
                    <button class="station-clear-btn" onclick="window.stationManager.clearStationFilter()">✕</button>
                </div>
            `;
            listContent.insertAdjacentHTML('afterbegin', stationBanner);

            // 하트 상태 초기화
            if (typeof initLikedHearts === 'function') {
                initLikedHearts();
            }
        }

        return true; // 역 필터 활성상태에서 목록 표시됨
    }

    /**
     * 드래그 패널 업데이트 (기존 호환용)
     */
    updatePropertyPanel(properties, station) {
        this.updatePropertyCount(properties.length);
        // 패널 자동 열기 제거됨
    }

    /**
     * ✅ 전체필터를 매물 배열에 클라이언트 사이드로 적용
     */
    applyFullFilterToProperties(properties) {
        const state = window.fullFilterState;
        if (!state) return properties;

        return properties.filter(property => {
            // 층수 필터
            if (state.floor && !state.floor.includes('all')) {
                const totalFloor = parseInt(property.total_floor) || 0;
                const nowFloor = parseInt(property.now_floor) || 0;
                const floorStr = String(property.now_floor || '').toLowerCase();

                let floorMatch = false;
                for (const floorType of state.floor) {
                    if (floorType === 'top' && nowFloor === totalFloor && totalFloor > 0) {
                        floorMatch = true;
                    } else if (floorType === 'ground' && (nowFloor === 1 || floorStr.includes('1층'))) {
                        floorMatch = true;
                    } else if (floorType === 'semi' && (floorStr.includes('반지') || floorStr.includes('반지하'))) {
                        floorMatch = true;
                    } else if (floorType === 'middle' && nowFloor > 1 && nowFloor < totalFloor) {
                        floorMatch = true;
                    }
                }
                if (!floorMatch) return false;
            }

            // 건물년차 필터
            if (state.buildingAge && !state.buildingAge.includes('all')) {
                const buildYear = parseInt(property.build_year) || 0;
                const currentYear = new Date().getFullYear();
                const age = currentYear - buildYear;

                let ageMatch = false;
                for (const ageType of state.buildingAge) {
                    if (ageType === 'new' && age <= 5) ageMatch = true;
                    else if (ageType === '10years' && age <= 10) ageMatch = true;
                    else if (ageType === '15years' && age <= 15) ageMatch = true;
                    else if (ageType === '20years' && age <= 20) ageMatch = true;
                    else if (ageType === 'old' && age > 20) ageMatch = true;
                }
                if (!ageMatch) return false;
            }

            // 면적 필터
            if (state.areaMin !== undefined && state.areaMax !== undefined) {
                const AREA_VALUES = [0, 16.5, 23.1, 29.7, 36.3, 49.5, 66, 99, 9999];
                const areaMinSqm = AREA_VALUES[state.areaMin] || 0;
                const areaMaxSqm = AREA_VALUES[state.areaMax] || 9999;
                const propertySqm = parseFloat(property.size) || 0;

                if (propertySqm < areaMinSqm || propertySqm > areaMaxSqm) {
                    return false;
                }
            }

            return true;
        });
    }

    /**
     * 역 필터 해제
     */
    clearStationFilter() {
        console.log('🚇 역 필터 해제');

        // ✅ 선택된 역 마커 아이콘 복원
        if (this.selectedStation) {
            this.updateStationMarkerIcon(this.selectedStation.id, false);
        }

        this.isStationFilterActive = false;
        this.selectedStation = null;
        this.selectedZoomLevel = null; // ✅ 저장된 줌 레벨도 초기화
        this.filteredProperties = []; // ✅ 필터링된 매물도 초기화

        // ✅ 역 필터 해제 시 크로스헤어 다시 표시 (단, 사용자가 직접 숨긴 경우 제외)
        const crosshair = document.getElementById('mapCrosshair');
        if (crosshair && !crosshair.classList.contains('crosshair-user-hidden')) {
            crosshair.classList.remove('crosshair-hidden');
        }

        // 반경 원 숨기기
        this.hideRadiusCircle();

        // 원본 매물 복구
        if (this.originalProperties.length > 0) {
            this.mapManager.properties = [...this.originalProperties];
            this.originalProperties = [];
        }

        // 마커 다시 그리기
        if (this.mapManager.markerManager) {
            this.mapManager.markerManager.createMarkers(this.mapManager.properties);
            if (this.mapManager.clusteringManager) {
                this.mapManager.clusteringManager.showClusteredMarkers();
            }
        }

        // 현재 영역 매물 다시 로드
        this.mapManager.loadPropertiesInBounds();

        // UI 업데이트 - ✅ 지역명도 초기화
        this.updateStationButtonUI(null);
        this.updatePropertyCount(0, null); // 지역명 초기화


    }

    /**
     * ✅ 역 상태 복원 (뒤로가기 시 호출)
     */
    restoreStationState() {
        const savedStationState = localStorage.getItem('stationFilterState');
        if (!savedStationState) {
            window.isRestoringStationFilter = false;
            return;
        }

        try {
            const stationState = JSON.parse(savedStationState);
            const MAX_AGE = 5 * 60 * 1000; // 5분

            if (stationState.timestamp && Date.now() - stationState.timestamp > MAX_AGE) {
                console.log('⏰ 역 선택 상태 만료 (5분 경과) - 삭제');
                localStorage.removeItem('stationFilterState');
                window.isRestoringStationFilter = false;
                return;
            }

            console.log('🚇 역 상태 복원 시작:', stationState.selectedStation?.name);

            // 역 필터 상태 복원
            this.isStationFilterActive = stationState.isActive;
            // ✅ 역 상태 복원 시에도 크로스헤어 숨김 처리
            if (stationState.isActive) {
                const crosshair = document.getElementById('mapCrosshair');
                if (crosshair) crosshair.classList.add('crosshair-hidden');
            }
            this.selectedStation = stationState.selectedStation;
            this.selectedZoomLevel = stationState.selectedZoomLevel;
            this.filteredProperties = stationState.filteredProperties;
            /* ✅ viewportFilteredProperties 복원: 뒤로가기 후 재진입 시 동일한 codes 사용 */
            this.viewportFilteredProperties = stationState.viewportFilteredProperties || stationState.filteredProperties;

            // UI 복원 (약간의 딜레이 후)
            setTimeout(() => {
                if (this.selectedStation) {
                    const station = this.selectedStation;

                    // 역 마커 하이라이트
                    if (this.updateStationMarkerIcon) {
                        this.updateStationMarkerIcon(station.id, true);
                    }

                    // 역 반경 원 표시
                    if (this.showRadiusCircle) {
                        this.showRadiusCircle(station);
                    }

                    // ✅ 상단 역주변 버튼 UI 업데이트
                    this.updateStationButtonUI(station);

                    // ✅ 화면에 보이는 매물만 필터링하여 표시
                    this.filterPropertiesInViewport();

                    console.log('✅ 역 상태 복원 완료:', station.name);
                }

                // 복원 플래그 해제
                window.isRestoringStationFilter = false;
            }, 300);

            // localStorage 정리
            localStorage.removeItem('stationFilterState');

        } catch (e) {
            console.error('⚠️ 역 상태 복원 실패:', e);
            localStorage.removeItem('stationFilterState');
            window.isRestoringStationFilter = false;
        }
    }

    /**
     * 역 선택 버튼 UI 업데이트
     */
    updateStationButtonUI(station) {
        const stationBtn = document.getElementById('stationFilterBtn');
        const stationText = document.getElementById('stationFilterText');

        if (stationBtn && stationText) {
            if (station) {
                stationBtn.classList.add('active');
                stationText.textContent = station.name;
            } else {
                stationBtn.classList.remove('active');
                stationText.textContent = '역 주변';
            }
        }
    }

    /**
     * 역 선택 모달 열기
     */
    openStationModal() {
        const modal = document.getElementById('stationModal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    /**
     * 역 선택 모달 닫기
     */
    closeStationModal() {
        const modal = document.getElementById('stationModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * 모달에서 역 선택
     */
    selectStationFromModal(stationId) {
        const station = this.stations.find(s => s.id === stationId);
        if (station) {
            this.closeStationModal();
            this.selectStation(station);
        }
    }

    /**
     * ✅ 동 선택 상태 해제 (역 선택 시 호출)
     */
    clearDongSelection() {
        // 동 검색 상태 초기화
        if (window.currentDongSearch) {
            window.currentDongSearch = null;
        }

        // 동 경계 폴리곤 제거
        if (window.dongBoundaryManager) {
            window.dongBoundaryManager.clearBoundary();
        }

        // 동 마커 색상 반전 효과 해제
        if (this.mapManager.clusteringManager && this.mapManager.clusteringManager.selectedDongName) {
            this.mapManager.clusteringManager.selectedDongName = null;
            // ✅ 마커 재생성 (매물 수량 정상 표시를 위해)
            this.mapManager.clusteringManager.showClusteredMarkers();
        }

        // ✅ 드래그 패널 레이블 업데이트
        if (typeof updatePanelLabel === 'function') {
            updatePanelLabel();
        }

        console.log('🏠 동 선택 해제됨');
    }
}

// 전역 변수로 노출
window.stationManager = null;

// 초기화 함수
window.initStationManager = function () {
    if (window.appManager && window.appManager.mapManager) {
        window.stationManager = new StationManager(window.appManager.mapManager);
        window.stationManager.initStationMarkers();
        console.log('✅ StationManager 초기화 완료');

        // ✅ 역 상태 복원 (뒤로가기 시)
        window.stationManager.restoreStationState();
    } else {
        console.warn('MapManager가 없어서 StationManager 초기화 대기');
        setTimeout(window.initStationManager, 500);
    }
};
