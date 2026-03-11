/**
 * 이벤트 관리 모듈
 */
class EventManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.eventListeners = [];
        this.loadTimeout = null; // debouncing을 위한 타이머
        this._zoomTriggered = false; // ✅ zoom_changed가 발생했는지 플래그 (idle에서 처리)
    }

    /**
     * 지도 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 줌 변경 이벤트 (debounced)
        const zoomListener = naver.maps.Event.addListener(this.mapManager.map, 'zoom_changed', () => {
            // ✅ 역 필터 복원 중이면 무시
            if (window.isRestoringStationFilter) {
                console.log('📱 역 필터 복원 중 - 줌 이벤트 무시');
                return;
            }
            
            // ✅ 추가: 줌 변경 즉시 모든 마커 숨김
            if (this.mapManager.markerManager && this.mapManager.markerManager.markers) {
                this.mapManager.markerManager.markers.forEach(marker => {
                    if (marker && marker.setMap) {
                        marker.setMap(null);
                    }
                });
            }

            // ✅ 추가: 기존 클러스터 마커도 즉시 숨김
            if (this.mapManager.clusteringManager && this.mapManager.clusteringManager.clusterMarkers) {
                this.mapManager.clusteringManager.clusterMarkers.forEach(marker => {
                    if (marker && marker.setMap) {
                        marker.setMap(null);
                    }
                });
            }

            // ✅ 추가: 역 마커도 즉시 숨김 (동시 로딩을 위해)
            if (window.stationManager && window.stationManager.stationMarkers) {
                window.stationManager.stationMarkers.forEach(({ marker }) => {
                    if (marker && marker.setMap) {
                        marker.setMap(null);
                    }
                });
            }

            this.mapManager.currentZoom = this.mapManager.map.getZoom();
            const currentZoom = this.mapManager.currentZoom;

            // ✅ 역 필터 활성 상태일 때 줌 레벨 체크
            if (window.stationManager && window.stationManager.isStationFilterActive) {
                // ✅ 전체필터 적용 중이면 역 필터 유지
                if (window.isApplyingFullFilter) {
                    console.log('📝 전체필터 적용 중 - 줌 이벤트에서 역 필터 유지');
                    return;
                }
                const selectedZoom = window.stationManager.selectedZoomLevel;

                // ✅ 줌 축소 시 역 선택 해제
                // selectedZoom=15 기준: 14로 축소되면 즉시 해제
                if (selectedZoom && currentZoom < selectedZoom) {
                    console.log(`🚇 줌 축소 (${selectedZoom} → ${currentZoom}) - 역 필터 자동 해제`);
                    window.stationManager.clearStationFilter();
                    // 역 필터 해제 후 일반 로딩 진행
                } else if (selectedZoom && currentZoom >= selectedZoom + 2) {
                    // ✅ 2단계 이상 확대 시 역 선택 해제
                    console.log(`🚇 줌 2단계 이상 확대 (${selectedZoom} → ${currentZoom}) - 역 필터 자동 해제`);
                    window.stationManager.clearStationFilter();
                } else {
                    console.log('🚇 줌 변경 - 역 필터 유지');
                    window.stationManager.updateStationFilterOnZoom();
                    // ✅ idle 이벤트에서 드래그로 오인하지 않도록 플래그 설정
                    this._zoomTriggered = true;
                    return;
                }
            }

            // ✅ 지역 검색 상태 초기화 (매물종류 필터는 유지)
            this.clearLocationSearchState();

            // ✅ 동 선택 스마트 해제: 줌 13~14 범위 밖이면 해제, 범위 내면 유지
            this._checkDongZoomDeselect(this.mapManager.currentZoom);

            // ✅ 마지막 조회 위치 저장
            this.saveCurrentMapView();

            // ✅ 수정: 줌 애니메이션 중 getBounds()가 잘못된 값 반환하므로
            // 여기서 로드하지 않고 idle 이벤트에서 처리
            this._zoomTriggered = true;
        });

        this.eventListeners.push({ type: 'zoom_changed', listener: zoomListener });

        // ✅ 수정: dragend → idle 이벤트 (관성 애니메이션 완료 후 정확한 bounds 반환)
        // dragend는 손을 뗀 순간 발생하지만, 관성 애니메이션 중 getBounds()가 잘못된 값 반환
        const idleListener = naver.maps.Event.addListener(this.mapManager.map, 'idle', () => {
            // ✅ zoom_changed가 트리거한 idle이면 플래그만 리셋 (이미 줌 핸들러에서 상태 처리 완료)
            // 하지만 데이터 로드는 여기서 실행 (정확한 bounds를 얻기 위해)
            const isFromZoom = this._zoomTriggered;
            this._zoomTriggered = false;

            // ✅ 역 필터 복원 중이면 무시
            if (window.isRestoringStationFilter) {
                console.log('📱 역 필터 복원 중 - idle 이벤트 무시');
                return;
            }



            // ✅ 줌에서 온 idle이면 역/동 상태 처리 스킵 (zoom_changed에서 이미 처리)
            // 드래그에서 온 idle이면 역/동 상태 확인 필요
            if (!isFromZoom) {
                // ✅ 역 필터 활성 상태면 역이 화면에 보이는지 확인
                if (window.stationManager && window.stationManager.isStationFilterActive) {
                    // ✅ 전체필터 적용 중이면 역 필터 유지
                    if (window.isApplyingFullFilter) {
                        console.log('📝 전체필터 적용 중 - idle 이벤트에서 역 필터 유지');
                        return;
                    }
                    const isStationVisible = window.stationManager.isSelectedStationVisible();

                    if (isStationVisible) {
                        console.log('🚇 지도 이동 - 역이 화면에 보임, 필터 유지');
                        window.stationManager.updateStationFilterOnDrag();
                    } else {
                        console.log('🗺️ 지도 이동 - 역이 화면에서 사라짐, 필터 해제');
                        window.stationManager.clearStationFilter();
                    }
                    return;
                }

                // ✅ 지역 검색 상태 초기화 (매물종류 필터는 유지)
                this.clearLocationSearchState();

                // ✅ 동 선택 스마트 해제: 드래그 후 2/3 이상 화면 밖이면 해제
                this._checkDongDragDeselect();
            }

            // ✅ 마지막 조회 위치 저장
            this.saveCurrentMapView();
            // ✅ idle 시점에서 로드 — 애니메이션 완료 후 정확한 getBounds() 보장
            this.debouncedLoadProperties();
        });
        this.eventListeners.push({ type: 'idle', listener: idleListener });

        // 지도 클릭 이벤트
        // ✅ 수정: 역 선택은 지도 클릭으로 해제됨
        const clickListener = naver.maps.Event.addListener(this.mapManager.map, 'click', (e) => {
            this.mapManager.hidePropertyDetail();

            // ✅ 역 선택 상태면 해제
            if (window.stationManager && window.stationManager.isStationFilterActive) {
                // ✅ 전체필터 적용 중이면 역 필터 유지
                if (window.isApplyingFullFilter) {
                    console.log('📝 전체필터 적용 중 - 클릭 이벤트에서 역 필터 유지');
                    return;
                }
                console.log('🗺️ 지도 클릭 - 역 선택 해제');
                window.stationManager.clearStationFilter();

                // 현재 화면 영역의 매물 다시 로드 (레이블도 자동 업데이트됨)
                this.mapManager.loadPropertiesInBounds();
                return;
            }

            // ✅ 동 선택 상태일 때 경계 밖 클릭 시 동 선택 해제
            const cm = this.mapManager.clusteringManager;
            if (cm && cm.selectedDongNames && cm.selectedDongNames.size > 0) {
                const clickLat = e.coord.lat();
                const clickLng = e.coord.lng();

                // Ray casting으로 클릭 위치가 선택된 동 경계 안인지 확인
                if (window.dongBoundaryManager && !window.dongBoundaryManager.isPointInBoundaries(clickLat, clickLng)) {
                    console.log('🏠 동 경계 밖 클릭 - 동 선택 해제');
                    cm.clearSelectedDong();
                    if (this.mapManager.updateStats) this.mapManager.updateStats();
                } else {
                    console.log('🏠 동 경계 안 클릭 - 동 선택 유지');
                }
                return;
            }

            // ✅ 좌표 클러스터 선택 상태면 해제
            if (this.mapManager.clusteringManager && this.mapManager.clusteringManager.selectedClusterIndex !== null) {
                console.log('🗺️ 지도 클릭 - 좌표 클러스터 선택 해제');
                this.mapManager.clusteringManager.selectedClusterIndex = null;
                this.mapManager.clusteringManager.showClusteredMarkers();

                // ✅ 통합된 수량 계산 함수 호출 (레이블도 자동 업데이트됨)
                if (this.mapManager && this.mapManager.updateStats) {
                    this.mapManager.updateStats();
                }

                return;
            }

            // ✅ 검색 모드 해제 및 원상복귀
            if (window.appManager && window.appManager.isSearchMode) {
                console.log('🗺️ 지도 클릭 - 검색 모드 해제');
                window.appManager.isSearchMode = false;

                // 현재 화면 영역의 매물 개수로 복귀
                this.mapManager.loadPropertiesInBounds();
            }
        });
        this.eventListeners.push({ type: 'click', listener: clickListener });

        console.log('✅ 지도 이벤트 리스너 설정 완료');
    }

    /**
     * Debounced 매물 로딩 - ✅ 최적화: updateStats() 제거
     */
    debouncedLoadProperties() {
        // 이전 타이머 취소
        if (this.loadTimeout) {
            clearTimeout(this.loadTimeout);
        }

        // ✅ 수정: updateStats() 제거 - loadPropertiesInBounds()에서 처리
        this.loadTimeout = setTimeout(() => {
            this.mapManager.loadPropertiesInBounds();
            // this.mapManager.updateStats(); // ← 이 줄 제거
        }, 100);
    }


    /**
     * ✅ 지역 검색 상태 초기화 (매물종류 필터는 유지)
     */
    clearLocationSearchState() {
        // ✅ 지역 검색으로 인한 지도 이동 중에는 상태 유지
        if (window.isLocationSearchMapMove) {
            console.log('📍 지역 검색 지도 이동 중 - 상태 유지');
            return;
        }

        // ✅ 좌표 기반 클러스터 선택 상태 해제
        if (this.mapManager.clusteringManager && this.mapManager.clusteringManager.selectedClusterIndex !== null) {
            console.log('📍 좌표 클러스터 선택 해제 (지도 이동/확대)');
            this.mapManager.clusteringManager.selectedClusterIndex = null;

            // ✅ 통합된 수량 계산 함수 호출 (레이블도 자동 업데이트됨)
            if (this.mapManager && this.mapManager.updateStats) {
                this.mapManager.updateStats();
                console.log(`📊 화면 매물 수량으로 복구 (updateStats)`);
            }
        }

        // ✅ 기존 지역 검색 상태 초기화
        if (window.currentLocationSearch) {
            console.log('🗺️ 지역 검색 상태 초기화 (지도 이동/확대)');
            window.currentLocationSearch = null;
        }

        // ✅ 동 선택 해제는 _checkDongZoomDeselect() / _checkDongDragDeselect() 에서 스마트하게 처리
        // (줌 13~14 범위 체크 / 2/3 화면 밖 체크)
    }

    /**
     * ✅ 현재 지도 위치를 저장
     */
    saveCurrentMapView() {
        if (!this.mapManager.map || !this.mapManager.gpsManager) return;

        const center = this.mapManager.map.getCenter();
        const zoom = this.mapManager.map.getZoom();

        this.mapManager.gpsManager.saveMapViewToCache(center.lat(), center.lng(), zoom);
    }

    /**
     * ✅ 줌 변경 시 동 선택 스마트 해제
     * 줌 13~14 범위 내이면 유지, 범위 밖(12 이하 또는 15 이상)이면 해제
     * @param {number} currentZoom - 현재 줌 레벨
     */
    _checkDongZoomDeselect(currentZoom) {
        const cm = this.mapManager.clusteringManager;
        if (!cm || cm.selectedDongNames.size === 0) return;

        if (currentZoom < 13 || currentZoom > 14) {
            console.log(`🏠 줌 ${currentZoom}이 13~14 범위 밖 → 동 선택 해제`);
            cm.clearSelectedDong();
            if (this.mapManager.updateStats) this.mapManager.updateStats();
        } else {
            console.log(`🏠 줌 ${currentZoom}은 13~14 범위 내 → 동 선택 유지`);
        }
    }

    /**
     * ✅ 드래그 후 동 선택 스마트 해제
     * 선택된 동 전체 통합 영역의 2/3 이상이 화면 밖이면 해제, 아니면 유지
     */
    _checkDongDragDeselect() {
        const cm = this.mapManager.clusteringManager;
        if (!cm || cm.selectedDongNames.size === 0) return;
        if (!window.dongBoundaryManager) return;

        const names = Array.from(cm.selectedDongNames);

        /* ✅ 선택된 동 전체 통합 바운딩 박스 계산 */
        const dongBox = window.dongBoundaryManager.getCombinedBoundingBox(names);
        if (!dongBox) return;

        /* ✅ 현재 지도 뷰포트 bounds */
        const mapBounds = this.mapManager.map.getBounds();
        const sw = mapBounds.getSW();
        const ne = mapBounds.getNE();
        const vp = { minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() };

        /* ✅ 동 영역 면적 (경도차 × 위도차 근사값) */
        const dongArea = (dongBox.maxLat - dongBox.minLat) * (dongBox.maxLng - dongBox.minLng);
        if (dongArea <= 0) return;

        /* ✅ 뷰포트와 동 영역의 교차 영역 계산 */
        const interMinLat = Math.max(dongBox.minLat, vp.minLat);
        const interMaxLat = Math.min(dongBox.maxLat, vp.maxLat);
        const interMinLng = Math.max(dongBox.minLng, vp.minLng);
        const interMaxLng = Math.min(dongBox.maxLng, vp.maxLng);

        /* 교차 없음 → 완전히 화면 밖 */
        if (interMinLat >= interMaxLat || interMinLng >= interMaxLng) {
            console.log('🏠 동 선택 영역이 화면에서 완전히 벗어남 → 해제');
            cm.clearSelectedDong();
            if (this.mapManager.updateStats) this.mapManager.updateStats();
            return;
        }

        const interArea = (interMaxLat - interMinLat) * (interMaxLng - interMinLng);
        const visibleRatio = interArea / dongArea;

        /* ✅ 가시 영역이 전체의 1/3 미만 → 2/3 이상 화면 밖 → 해제 */
        if (visibleRatio < 1 / 3) {
            console.log(`🏠 동 선택 영역 ${(visibleRatio * 100).toFixed(0)}% 표시 (2/3 이상 화면 밖) → 해제`);
            cm.clearSelectedDong();
            if (this.mapManager.updateStats) this.mapManager.updateStats();
        } else {
            console.log(`🏠 동 선택 영역 ${(visibleRatio * 100).toFixed(0)}% 표시 중 → 유지`);
        }
    }

    /**
     * 이벤트 리스너들 정리
     */
    cleanup() {
        // 타이머 정리
        if (this.loadTimeout) {
            clearTimeout(this.loadTimeout);
            this.loadTimeout = null;
        }

        this.eventListeners.forEach(({ type, listener }) => {
            naver.maps.Event.removeListener(listener);
        });
        this.eventListeners = [];
        console.log('✅ 이벤트 리스너 정리 완료');
    }
}
