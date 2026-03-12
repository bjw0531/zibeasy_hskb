/**
 * 지도 관리자 (메인)
 */
class MapManager {
    constructor(appManager) {
        this.appManager = appManager;
        this.map = null;
        this.properties = [];
        this.isInitialized = false;
        this.currentZoom = 15;
        this.isLoading = false; // 로딩 상태 관리
        this.propertyCache = new Map(); // 매물 캐시
        this.lastBounds = null; // 마지막 로딩된 영역
        this.debugMarker = null; // ✅ 디버그용 단일 마커

        // ✅ 관심목록 필터 관련 속성 추가
        this.originalProperties = []; // 필터링 전 원본 매물 목록 저장용
        this.isLikedFilterActive = false; // 관심목록 필터 상태
        this.savedCategoryBeforeLiked = null; // ✅ 관심목록 열기 전 카테고리 필터 백업

        // 천안시 중심 좌표 (기본값)
        this.defaultCenter = { lat: 36.833717, lng: 127.138147 };

        // 모듈 초기화 (안전한 방식)
        this.gpsManager = new GPSManager(this);

        if (typeof MarkerManager !== 'undefined') {
            this.markerManager = new MarkerManager(this);
        } else {
            console.warn('MarkerManager 클래스가 없습니다.');
        }

        if (typeof ClusteringManager !== 'undefined') {
            this.clusteringManager = new ClusteringManager(this);
        } else {
            console.warn('ClusteringManager 클래스가 없습니다.');
        }

        if (typeof EventManager !== 'undefined') {
            this.eventManager = new EventManager(this);
        } else {
            console.warn('EventManager 클래스가 없습니다.');
        }
    }

    /**
     * 지도 초기화
     */
    async init() {
        try {
            console.log('🗺️ 지도 매니저 초기화...');

            // 네이버 지도 API 로드 확인
            if (typeof naver === 'undefined' || !naver.maps) {
                throw new Error('네이버 지도 API가 로드되지 않았습니다.');
            }

            // 캐시가 없으면 저정밀 위치 미리 가져오기
            this.gpsManager.prefetchLowAccuracyLocation();

            // 지도 생성
            await this.createMap();

            // 이벤트 리스너 설정
            if (this.eventManager && this.eventManager.setupEventListeners) {
                this.eventManager.setupEventListeners();
            } else {
                console.warn('EventManager가 없어서 이벤트 설정을 건너뜁니다.');
            }

            // 백그라운드에서 고정밀 위치 업데이트
            this.gpsManager.refreshHighAccuracyInBackground();

            this.isInitialized = true;
            console.log('✅ 지도 초기화 완료');

            // ✅ 초기 매물 로딩 (500ms → 200ms로 단축)
            setTimeout(() => {
                this.loadPropertiesInBounds();
            }, 0);

            // ✅ 추가: 초기 패널 업데이트 (1초 후)
            // setTimeout(() => {
            //     if (this.appManager && this.appManager.loadPropertiesInPanel) {
            //         this.appManager.loadPropertiesInPanel();
            //     }
            // }, 1000);

        } catch (error) {
            console.error('지도 초기화 실패:', error);
            throw error;
        }
    }

    /**
     * 지도 생성
     */
    async createMap() {
        const container = document.getElementById('map');
        if (!container) {
            throw new Error('지도 컨테이너를 찾을 수 없습니다.');
        }

        // ✅ 우선순위: 1. 마지막 조회 위치 > 2. GPS 캐시 > 3. 기본 위치
        const savedMapView = this.gpsManager.getMapViewFromCache();
        const cachedLocation = this.gpsManager.getLocationFromCache();

        let center;
        let initialZoom = this.currentZoom;

        if (savedMapView) {
            // ✅ 마지막으로 조회한 위치가 있으면 우선 사용
            center = new naver.maps.LatLng(savedMapView.latitude, savedMapView.longitude);
            initialZoom = savedMapView.zoom;
            console.log('📍 마지막 조회 위치로 시작:', savedMapView.latitude, savedMapView.longitude, 'zoom:', initialZoom);
        } else if (cachedLocation) {
            // GPS 캐시가 있으면 사용
            center = new naver.maps.LatLng(cachedLocation.latitude, cachedLocation.longitude);
            console.log('📍 GPS 캐시 위치로 시작:', cachedLocation.latitude, cachedLocation.longitude);
        } else {
            // 기본 위치 사용
            center = new naver.maps.LatLng(this.defaultCenter.lat, this.defaultCenter.lng);
            console.log('📍 기본 위치로 시작');
        }

        this.map = new naver.maps.Map('map', {
            center: center,
            zoom: initialZoom,
            minZoom: 9,  // ✅ 최소 줌 레벨 (더 이상 축소 안 됨)
            maxZoom: 17,  // ✅ 최대 줌 레벨 (더 이상 확대 안 됨)
            mapTypeControl: false,
            zoomControl: false,
            logoControl: true,
            logoControlOptions: {
                position: naver.maps.Position.BOTTOM_LEFT
            },
            // ✅ 스냅 줌 적용 - 정수 단위로만 줌 변경
            disableDoubleClickZoom: false,
            disableTwoFingerTapZoom: false,
            pinchZoom: true
        });

        // ✅ 스냅 줌 로직
        naver.maps.Event.addListener(this.map, 'zoom_changed', () => {
            const currentZoom = this.map.getZoom();
            const roundedZoom = Math.round(currentZoom);

            // 소수점 줌이면 정수로 보정
            if (currentZoom !== roundedZoom) {
                // 줌 변경 중 무한 루프 방지
                if (!this._isSnapZooming) {
                    this._isSnapZooming = true;
                    this.map.setZoom(roundedZoom, true); // true = 애니메이션 없이
                    setTimeout(() => {
                        this._isSnapZooming = false;
                    }, 100);
                }
            }
        });

        // ✅ 최대/최소 줌에서 추가 확대/축소 시도 감지 (휠 이벤트)
        const mapContainer = document.getElementById('map');
        if (mapContainer) {
            mapContainer.addEventListener('wheel', (e) => {
                const currentZoom = this.map.getZoom();
                // deltaY < 0: 확대 시도, deltaY > 0: 축소 시도
                if (e.deltaY < 0 && currentZoom >= 17) {
                    this.showMaxZoomToast('확대');
                } else if (e.deltaY > 0 && currentZoom <= 9) {
                    this.showMaxZoomToast('축소');
                }
            }, { passive: true });

            // ✅ 핀치 줌 시도 감지 (터치 이벤트)
            let lastTouchDistance = 0;
            mapContainer.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
                }
            }, { passive: true });

            mapContainer.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2) {
                    const dx = e.touches[0].clientX - e.touches[1].clientX;
                    const dy = e.touches[0].clientY - e.touches[1].clientY;
                    const currentDistance = Math.sqrt(dx * dx + dy * dy);
                    const currentZoom = this.map.getZoom();

                    // 핀치 인(확대 시도): 거리 증가
                    if (currentDistance > lastTouchDistance + 10 && currentZoom >= 17) {
                        this.showMaxZoomToast('확대');
                    }
                    // 핀치 아웃(축소 시도): 거리 감소
                    else if (currentDistance < lastTouchDistance - 10 && currentZoom <= 9) {
                        this.showMaxZoomToast('축소');
                    }
                    lastTouchDistance = currentDistance;
                }
            }, { passive: true });

            // ✅ 더블 클릭/더블 탭 확대 시도 감지
            mapContainer.addEventListener('dblclick', () => {
                const currentZoom = this.map.getZoom();
                if (currentZoom >= 17) {
                    this.showMaxZoomToast('확대');
                }
            });
        }

        // ✅ currentZoom 동기화
        this.currentZoom = initialZoom;

        // ✅ 지도 상단 패딩 적용 (검색바 높이)
        this.updateMapPadding();
    }

    /**
     * ✅ 지도 패딩 업데이트 (OS별 설정 사용)
     */
    updateMapPadding() {
        if (!this.map) return;

        // ✅ OS별 설정에서 값 가져오기
        const topHeight = window.browserConfig.getTopUIHeight();
        const bottomHeight = window.browserConfig.getBottomUIHeight();

        // ✅ 측정된 값 저장 (다른 곳에서 사용)
        this.measuredTopHeight = topHeight;
        this.measuredBottomHeight = bottomHeight;

        // ✅ 하단 내비게이션 바 높이 측정 (safe-area 포함)
        // — getCenter() 기준점이 크로스헤어 위치와 일치하도록 하단 패딩 반영
        const bottomNavEl = document.querySelector('.bottom-nav');
        const bottomNavHeight = (bottomNavEl && bottomNavEl.offsetHeight > 0)
            ? bottomNavEl.offsetHeight : 52;

        // ✅ padding 옵션 시도 (지원되면 적용)
        try {
            this.map.setOptions({
                padding: {
                    top: topHeight,
                    right: 0,
                    bottom: bottomNavHeight,  // 하단 탭바 높이 반영 → getCenter() 기준점 보정
                    left: 0
                }
            });
        } catch (e) {
            // padding 옵션이 지원되지 않으면 무시
        }

        console.log(`📐 지도 패딩: 상단=${topHeight}px, 하단=${bottomNavHeight}px (${window.browserConfig.platform})`);

        return { topHeight, bottomHeight };
    }

    /**
     * ✅ 최대/최소 줌 도달 시 토스트 메시지 표시
     * @param {string} type - '확대' 또는 '축소'
     */
    showMaxZoomToast(type = '확대') {
        // 중복 토스트 방지 (2초 내 재표시 금지)
        if (this._lastMaxZoomToast && Date.now() - this._lastMaxZoomToast < 2000) {
            return;
        }
        this._lastMaxZoomToast = Date.now();

        // 기존 토스트 제거
        const existingToast = document.querySelector('.max-zoom-toast');
        if (existingToast) {
            existingToast.remove();
        }

        // 새 토스트 생성 (no-properties-toast와 동일한 스타일)
        const toast = document.createElement('div');
        toast.className = 'no-properties-toast max-zoom-toast';
        toast.textContent = `지도가 더 이상 ${type}되지 않습니다.`;

        document.body.appendChild(toast);

        // 1.5초 후 자동 제거
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 1500);
    }

    /**
     * 매물 데이터 로드 - ✅ 패널 업데이트 추가
     */
    async loadProperties(filters = {}) {
        try {
            console.log('📡 매물 데이터 로드 중...', filters);

            // 로딩 상태 표시
            this.showLoadingIndicator();

            const response = await fetch('/api/properties?' + new URLSearchParams(filters));
            const data = await response.json();

            if (data.success) {
                this.properties = data.data;

                // ✅ 추가: 카테고리 필터링 (프론트엔드) - 배열 지원
                if (this.currentCategory && (Array.isArray(this.currentCategory) ? this.currentCategory.length > 0 : this.currentCategory)) {
                    const categories = Array.isArray(this.currentCategory) ? this.currentCategory : [this.currentCategory];
                    console.log(`🔍 카테고리로 필터링: ${categories.join(', ')}`);
                    const beforeCount = this.properties.length;

                    this.properties = this.properties.filter(property => {
                        // 배열에 포함된 category인지 확인 (양쪽 모두 문자열로 변환해서 비교)
                        const propCategory = String(property.category || '');

                        // categories 배열의 각 요소를 문자열로 변환해서 비교
                        return categories.some(cat => String(cat) === propCategory);
                    });

                    console.log(`✅ 필터링: ${beforeCount}개 → ${this.properties.length}개`);
                }

                if (this.markerManager && this.markerManager.createMarkers) {
                    this.markerManager.createMarkers(this.properties);

                    // ✅ 수정: 마커 생성 후 즉시 클러스터링 적용
                    if (this.clusteringManager && this.clusteringManager.showClusteredMarkers) {
                        this.clusteringManager.showClusteredMarkers();
                    }

                    // ✅ 추가: 역 마커도 다시 표시
                    if (window.stationManager) {
                        window.stationManager.updateStationMarkersVisibility();
                    }
                } else {
                    console.warn('markerManager가 없어서 마커 생성을 건너뜁니다.');
                }

                console.log(`✅ ${this.properties.length}개 매물 로드 완료`);
            } else {
                console.error('매물 로드 실패:', data.error);
            }
        } catch (error) {
            console.error('매물 로드 오류:', error);
        } finally {
            // 로딩 상태 숨김
            this.hideLoadingIndicator();
        }
    }

    /**
     * 특정 동의 전체 매물 데이터 로드 (Full Mode)
     * - 클러스터 클릭 시 상세 정보를 보여주기 위함
     */
    async loadDongProperties(dongName) {
        try {
            console.log(`📡 ${dongName} 상세 매물 데이터 로드 중...`);
            this.showLoadingIndicator();

            const params = new URLSearchParams({
                dong: dongName,
                mode: 'full', // 상세 정보 요청
                limit: 5000   // 전체 매물 수용
            });

            // 카테고리 필터가 있으면 적용
            if (this.currentCategory && (Array.isArray(this.currentCategory) ? this.currentCategory.length > 0 : this.currentCategory)) {
                const category = Array.isArray(this.currentCategory)
                    ? this.currentCategory.join(',')
                    : this.currentCategory;
                params.append('category', category);
            }

            // ✅ 전체 필터 파라미터 적용
            if (this.fullFilterParams && Object.keys(this.fullFilterParams).length > 0) {
                Object.entries(this.fullFilterParams).forEach(([key, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        params.append(key, value);
                    }
                });
                console.log(`📊 전체 필터 적용:`, this.fullFilterParams);
            }

            // ✅ 테마 필터 파라미터 적용
            console.log(`🔍 themeFilterParams 상태:`, this.themeFilterParams); // 디버그
            
            // themeFilterParams 또는 window.currentThemeFilter에서 테마 정보 가져오기
            let themeParams = this.themeFilterParams;
            if ((!themeParams || Object.keys(themeParams).length === 0) && window.currentThemeFilter) {
                // fallback: window.currentThemeFilter에서 가져오기
                if (window.currentThemeFilter.column) {
                    themeParams = { thema: window.currentThemeFilter.column };
                } else if (window.currentThemeFilter.columns) {
                    themeParams = { thema: window.currentThemeFilter.columns.join(',') };
                }
                console.log(`🔄 window.currentThemeFilter에서 테마 복원:`, themeParams);
            }
            
            if (themeParams && Object.keys(themeParams).length > 0) {
                Object.entries(themeParams).forEach(([key, value]) => {
                    if (value !== undefined && value !== null && value !== '') {
                        params.append(key, value);
                    }
                });
                console.log(`🎨 테마 필터 적용:`, themeParams);
            }

            const response = await fetch('/api/properties?' + params);
            const data = await response.json();

            if (data.success) {
                console.log(`✅ ${dongName} 상세 데이터 ${data.data.length}개 로드 완료`);
                return data.data;
            } else {
                console.error('동 데이터 로드 실패:', data.error);
                return [];
            }
        } catch (error) {
            console.error('동 데이터 로드 오류:', error);
            return [];
        } finally {
            this.hideLoadingIndicator();
        }
    }


    /**
     * 로딩 인디케이터 표시
     */
    showLoadingIndicator() {
        const loadingElement = document.getElementById('mapLoadingIndicator');
        if (loadingElement) {
            loadingElement.style.display = 'block';
        }
    }

    /**
     * 로딩 인디케이터 숨김
     */
    hideLoadingIndicator() {
        const loadingElement = document.getElementById('mapLoadingIndicator');
        if (loadingElement) {
            loadingElement.style.display = 'none';
        }

        // ✅ 추가: 메인 로딩 인디케이터도 숨김
        const mainLoading = document.getElementById('loading');
        if (mainLoading) {
            mainLoading.style.display = 'none';
        }
    }

    /**
     * 화면 영역 기반 매물 로딩 (Buffer Zone 포함)
     */
    async loadPropertiesInBounds() {
        try {
            if (!this.map || this.isLoading) {
                return;
            }

            // ✅ 역 필터 복원 중이면 로딩 건너뜀
            if (window.isRestoringStationFilter) {
                console.log('📱 역 필터 복원 중 - 지도 영역 로딩 건너뜀');
                return;
            }

            // ✅ 클러스터 선택 상태 복원 중이면 로딩 건너뜀
            if (window.isRestoringClusterFilter) {
                console.log('📍 클러스터 복원 중 - 지도 영역 로딩 건너뜀');
                return;
            }

            // ✅ 관심목록 필터가 켜져있으면 지도 이동에 따른 로딩 중단
            if (this.isLikedFilterActive) {
                console.log('❤️ 관심목록 필터 활성 상태 - 지도 영역 로딩 건너뜀');
                return;
            }

            // ✅ 역 필터가 활성화되어 있으면 지도 영역 로딩 건너뜀 (역 반경 내 매물만 유지)
            if (window.stationManager && window.stationManager.isStationFilterActive) {
                console.log('🚇 역 필터 활성 상태 - 지도 영역 로딩 건너뜀 (역 반경 유지)');
                // 대신 역 반경 내 매물로 클러스터만 업데이트
                if (this.clusteringManager && this.clusteringManager.showClusteredMarkers) {
                    this.clusteringManager.showClusteredMarkers();
                }
                this.updateStats();
                return;
            }

            this.showLoadingIndicator();

            const bounds = this.map.getBounds();
            const sw = bounds.getSW();
            const ne = bounds.getNE();

            // Buffer Zone 추가 (줌 레벨에 따라 조절)
            const zoom = this.map.getZoom();
            let bufferFactor = 0.1; // ✅ 기본 10% (5% → 10%)

            if (zoom >= 15) {
                bufferFactor = 0.08; // ✅ 고줌: 8% (3% → 8%)
            } else if (zoom >= 12) {
                bufferFactor = 0.1;  // ✅ 중줌: 10% (5% → 10%)
            } else {
                bufferFactor = 0.15; // ✅ 저줌: 15% (8% → 15%)
            }

            const latDiff = (ne.lat() - sw.lat()) * bufferFactor;
            const lngDiff = (ne.lng() - sw.lng()) * bufferFactor;

            const expandedBounds = {
                sw_lat: sw.lat() - latDiff,
                sw_lng: sw.lng() - lngDiff,
                ne_lat: ne.lat() + latDiff,
                ne_lng: ne.lng() + lngDiff
            };

            // ✅ 추가: 카테고리 필터 적용
            if (this.currentCategory && (Array.isArray(this.currentCategory) ? this.currentCategory.length > 0 : this.currentCategory)) {
                // 배열인 경우 콤마로 구분된 문자열로 변환
                expandedBounds.category = Array.isArray(this.currentCategory)
                    ? this.currentCategory.join(',')
                    : this.currentCategory;
            }

            // ✅ 전체 필터 파라미터 적용
            if (this.fullFilterParams && Object.keys(this.fullFilterParams).length > 0) {
                Object.assign(expandedBounds, this.fullFilterParams);
                console.log('🔍 전체 필터 적용:', this.fullFilterParams);
            }

            // ✅ 테마 필터 파라미터 적용 (실시간 추천 등)
            if (this.themeFilterParams && Object.keys(this.themeFilterParams).length > 0) {
                Object.assign(expandedBounds, this.themeFilterParams);
                console.log('🎯 테마 필터 적용:', this.themeFilterParams);
            }

            // ✅ 임시 비활성화: Light Mode는 패널 목록 표시에 문제가 있어 항상 Full Mode 사용
            // TODO: 패널 열기 전에 Full 데이터 로드 로직 추가 후 다시 활성화
            // if (zoom < 15) {
            //     expandedBounds.mode = 'light';
            //     console.log('🚀 Light Mode 요청 (줌 < 15)');
            // } else {
            //     expandedBounds.mode = 'full';
            // }
            expandedBounds.mode = 'full';
            expandedBounds.limit = 5000; // 전체 매물 수용

            // 캐시 확인
            const cacheKey = this.getBoundsKey(expandedBounds);
            if (this.propertyCache.has(cacheKey)) {
                console.log('📦 캐시된 매물 사용:', cacheKey);
                const cachedProperties = this.propertyCache.get(cacheKey);
                this.properties = cachedProperties;

                // ✅ 수정: 클러스터링 먼저 적용 후 마커 표시
                if (this.clusteringManager && this.clusteringManager.showClusteredMarkers) {
                    this.clusteringManager.showClusteredMarkers();
                } else {
                    this.updateMarkerDisplay();
                }

                // ✅ 추가: 역 마커도 다시 표시
                if (window.stationManager) {
                    window.stationManager.updateStationMarkersVisibility();
                }

                this.updateStats();
                this.hideLoadingIndicator();  // ✅ 추가!
                return;
            }

            this.isLoading = true;
            console.log(`🗺️ 화면 영역 기반 매물 로딩 (줌:${zoom}, Buffer:${(bufferFactor * 100).toFixed(1)}%):`, expandedBounds);

            await this.loadProperties(expandedBounds);

            // 캐시 저장
            this.propertyCache.set(cacheKey, this.properties);
            this.lastBounds = expandedBounds;

            // 캐시 크기 제한 (최대 10개 영역)
            if (this.propertyCache.size > 10) {
                const firstKey = this.propertyCache.keys().next().value;
                this.propertyCache.delete(firstKey);
            }

            // ✅ 추가: 매물 로딩 완료 후 updateStats() 호출
            this.updateStats();

        } catch (error) {
            console.error('화면 영역 매물 로딩 오류:', error);
        } finally {
            this.hideLoadingIndicator();  // ✅ 추가!
            this.isLoading = false;
        }
    }

    /**
     * 영역 키 생성 (캐시용)
     */
    getBoundsKey(bounds) {
        // ✅ toFixed(4) → toFixed(3)으로 변경 (더 넓은 범위 캐싱)
        let key = `${bounds.sw_lat.toFixed(3)},${bounds.sw_lng.toFixed(3)},${bounds.ne_lat.toFixed(3)},${bounds.ne_lng.toFixed(3)}`;

        // ✅ 카테고리 필터 포함
        if (bounds.category) {
            key += `_cat:${bounds.category}`;
        }

        // ✅ 전체 필터 파라미터 포함
        if (this.fullFilterParams && Object.keys(this.fullFilterParams).length > 0) {
            key += `_filter:${JSON.stringify(this.fullFilterParams)}`;
        }

        return key;
    }

    /**
     * 마커 표시 업데이트
     */
    updateMarkerDisplay() {
        if (this.markerManager && this.markerManager.updateMarkerDisplay) {
            this.markerManager.updateMarkerDisplay();
        } else {
            console.warn('markerManager가 없어서 마커 표시 업데이트를 건너뜁니다.');
        }
    }

    /**
     * 사용자 위치로 이동
     */
    moveToUserLocation(lat, lng) {
        if (this.markerManager && this.markerManager.moveToUserLocation) {
            this.markerManager.moveToUserLocation(lat, lng);
        } else {
            console.warn('markerManager.moveToUserLocation이 없습니다. 기본 이동만 수행');
            // 기본 지도 중심 이동
            const pos = new naver.maps.LatLng(lat, lng);
            this.map.setCenter(pos);
        }
    }

    /**
     * 매물 상세 정보 표시
     */
    showPropertyDetail(property) {
        // 매물 상세 정보 표시 로직
        console.log('매물 상세:', property);
    }

    /**
     * 매물 상세 정보 숨기기
     */
    hidePropertyDetail() {
        // 매물 상세 정보 숨기기 로직
    }

    /**
     * 통계 정보 업데이트 - ✅ 실제 보이는 영역만 기준으로 계산
     */
    updateStats() {
        if (!this.map) {
            return;
        }

        // ✅ 지역 검색 중이면 수량 업데이트 건너뛰기 (깜박임 방지)
        if (window.isLocationSearchMapMove) {
            console.log('🔍 지역 검색 중 - 수량 업데이트 건너뜀');
            return;
        }

        // ✅ 역 필터 활성 상태면 수량 업데이트 건너뛰기 (뒤로가기 시 수량 변경 방지)
        if (window.stationManager && window.stationManager.isStationFilterActive) {
            console.log('🚇 역 필터 활성 상태 - 수량 업데이트 건너뜀');
            return;
        }

        // ✅ 클러스터 선택 상태면 수량 업데이트 건너뛰기 (뒤로가기 시 수량 변경 방지)
        if (this.clusteringManager && this.clusteringManager.selectedClusterIndex !== null) {
            console.log('📍 클러스터 선택 상태 - 수량 업데이트 건너뜀');
            return;
        }

        // ✅ 현재 동 검색 상태가 있으면 그 수량 유지
        if (window.currentDongSearch && window.currentDongSearch.locationName) {
            // ✅ 테마/전체 필터 활성시 동별 필터링된 수량으로 업데이트
            if ((this.themeFilterParams || this.fullFilterParams) && this.properties) {
                const locationNames = window.currentDongSearch.locationNames || [window.currentDongSearch.locationName];

                if (locationNames.length > 1) {
                    // ✅ 복수 동 선택: _buildMultiDongState()에서 이미 합산 수량이 설정됨 → 덮어쓰지 않음
                    console.log(`🏠 복수 동 검색 + 필터 적용: [${locationNames.join(', ')}] 합산 수량 유지`);
                } else {
                    // ✅ 단일 동 선택: 해당 동의 매물만 필터링해 수량 업데이트
                    const dongName = locationNames[0];
                    const filteredCount = this.properties.filter(p => p.dong === dongName || p.ri === dongName).length;
                    const countElement = document.getElementById('propertyCount');
                    if (countElement) countElement.textContent = filteredCount;
                    window.currentDongSearch.count = filteredCount;
                    console.log(`🏠 동 검색 + 필터 적용: ${dongName} ${filteredCount}개`);
                }
            }
            if (typeof updatePanelLabel === 'function') updatePanelLabel();
            return;
        }

        // 현재 지도 화면 전체 영역
        const bounds = this.map.getBounds();
        const sw = bounds.getSW();
        const ne = bounds.getNE();

        // ✅ 중앙 설정에서 UI 높이 가져오기
        const topUIHeight = window.browserConfig.getTopUIHeight();
        const bottomUIHeight = window.browserConfig.getBottomUIHeight();

        const mapDiv = document.getElementById('map');
        const mapHeight = mapDiv ? mapDiv.offsetHeight : window.innerHeight;

        // 전체 높이 대비 가려지는 비율 계산
        const topRatio = topUIHeight / mapHeight;
        const bottomRatio = bottomUIHeight / mapHeight;

        // 위도 범위 (남북으로 좁히기)
        const latRange = ne.lat() - sw.lat();
        const adjustedNeLat = ne.lat() - (latRange * topRatio);     // 상단 제외
        const adjustedSwLat = sw.lat() + (latRange * bottomRatio);  // 하단 제외

        // ✅ 실제 보이는 영역 내 매물만 계산
        const visibleProperties = this.properties.filter(property => {
            const lat = parseFloat(property.lat);
            const lng = parseFloat(property.lng);

            return lat >= adjustedSwLat && lat <= adjustedNeLat &&
                lng >= sw.lng() && lng <= ne.lng();
        });

        const visibleCount = visibleProperties.length;
        const countElement = document.getElementById('propertyCount');

        if (countElement) {
            countElement.textContent = visibleCount;

            // ✅ 0개일 때 토스트 표시
            if (visibleCount === 0) {
                showNoPropertiesToast();
            }
        }

        // ✅ 드래그 패널 레이블 업데이트 (우선순위에 따라 표시)
        if (typeof updatePanelLabel === 'function') {
            updatePanelLabel();
        }

        // ✅ 로그를 덜 자주 출력 (5초마다)
        if (!this.lastStatsLog || Date.now() - this.lastStatsLog > 5000) {
            console.log(`📊 화면 내 매물: ${visibleCount}개 / 전체: ${this.properties.length}개`);
            this.lastStatsLog = Date.now();
        }
    }

    /**
     * ✅ 디버그: 화면에 보이는 지도 영역 시각화 (빨간색 테두리)
     * 콘솔에서 window.appManager.mapManager.showBoundsDebug() 호출
     */
    showBoundsDebug() {
        if (!this.map) return;

        // 기존 디버그 오버레이 제거
        if (this.debugRectangle) {
            this.debugRectangle.setMap(null);
        }
        if (this.debugInfoDiv) {
            this.debugInfoDiv.remove();
        }

        // 현재 지도 화면 전체 영역
        const bounds = this.map.getBounds();
        const sw = bounds.getSW();
        const ne = bounds.getNE();

        // ✅ 중앙 설정에서 UI 높이 가져오기
        const topUIHeight = window.browserConfig.getTopUIHeight();
        const bottomUIHeight = window.browserConfig.getBottomUIHeight();
        const browserName = window.browserConfig.config.name;

        const mapDiv = document.getElementById('map');
        const mapHeight = mapDiv ? mapDiv.offsetHeight : window.innerHeight;

        // 전체 높이 대비 가려지는 비율 계산
        const topRatio = topUIHeight / mapHeight;
        const bottomRatio = bottomUIHeight / mapHeight;

        // 위도 범위 조정
        const latRange = ne.lat() - sw.lat();
        const adjustedNeLat = ne.lat() - (latRange * topRatio);
        const adjustedSwLat = sw.lat() + (latRange * bottomRatio);

        // 빨간색 사각형으로 실제 영역 표시
        this.debugRectangle = new naver.maps.Rectangle({
            map: this.map,
            bounds: new naver.maps.LatLngBounds(
                new naver.maps.LatLng(adjustedSwLat, sw.lng()),
                new naver.maps.LatLng(adjustedNeLat, ne.lng())
            ),
            strokeColor: '#FF0000',
            strokeWeight: 3,
            strokeOpacity: 0.8,
            fillColor: '#FF0000',
            fillOpacity: 0.1,
            zIndex: 1000
        });

        // 정보 표시용 DIV
        this.debugInfoDiv = document.createElement('div');
        this.debugInfoDiv.id = 'boundsDebugInfo';
        this.debugInfoDiv.style.cssText = `
            position: fixed;
            top: 120px;
            left: 10px;
            right: 10px;
            background: rgba(0,0,0,0.85);
            color: #00FF00;
            padding: 15px;
            font-family: monospace;
            font-size: 12px;
            z-index: 10000;
            border-radius: 8px;
            line-height: 1.6;
        `;

        // ✅ User Agent 문자열 표시 (길이 제한)
        const uaShort = userAgent.length > 100 ? userAgent.substring(0, 100) + '...' : userAgent;

        this.debugInfoDiv.innerHTML = `
            <div style="font-size:14px;font-weight:bold;margin-bottom:10px;color:#FF6B6B;">🔍 지도 영역 디버그</div>
            <div>📱 브라우저: <b style="color:#FFD700">${browserName}</b></div>
            <div style="font-size:10px;color:#AAA;word-break:break-all;margin:5px 0;padding:5px;background:#222;border-radius:4px;">UA: ${uaShort}</div>
            <div>📐 mapHeight: ${mapHeight}px</div>
            <div>⬆️ topUIHeight: ${topUIHeight}px (${(topRatio * 100).toFixed(1)}%)</div>
            <div>⬇️ bottomUIHeight: ${bottomUIHeight}px (${(bottomRatio * 100).toFixed(1)}%)</div>
            <hr style="border-color:#444;margin:10px 0">
            <div>🌍 원본 위도: ${sw.lat().toFixed(6)} ~ ${ne.lat().toFixed(6)}</div>
            <div>🎯 조정 위도: ${adjustedSwLat.toFixed(6)} ~ ${adjustedNeLat.toFixed(6)}</div>
            <div>📏 latRange: ${latRange.toFixed(6)}</div>
            <hr style="border-color:#444;margin:10px 0">
            <div>🖥️ innerHeight: ${window.innerHeight}px</div>
            <div>📺 visualViewport: ${window.visualViewport ? window.visualViewport.height + 'px' : 'N/A'}</div>
            <div style="margin-top:10px;color:#888;font-size:11px;">10초 후 자동 닫힘 또는 hideBoundsDebug() 호출</div>
        `;

        document.body.appendChild(this.debugInfoDiv);

        console.log('🔍 디버그 오버레이 표시됨 - 브라우저:', browserName);
        console.log('  - topUIHeight:', topUIHeight, 'bottomUIHeight:', bottomUIHeight);

        // 10초 후 자동 제거 (UA 확인 시간 확보)
        setTimeout(() => {
            this.hideBoundsDebug();
        }, 10000);

        return {
            browserName,
            topUIHeight,
            bottomUIHeight,
            mapHeight,
            adjustedSwLat,
            adjustedNeLat
        };
    }

    /**
     * ✅ 디버그 오버레이 숨기기
     */
    hideBoundsDebug() {
        if (this.debugRectangle) {
            this.debugRectangle.setMap(null);
            this.debugRectangle = null;
        }
        if (this.debugInfoDiv) {
            this.debugInfoDiv.remove();
            this.debugInfoDiv = null;
        }
        console.log('🔍 디버그 오버레이 제거됨');
    }

    /**
     * ✅ 디버그: 위경도에 단일 마커 표시 (기존 디버그 마커는 교체)
     * 콘솔에서 window.appManager.mapManager.showDebugMarker(36.83, 127.13) 호출
     */
    showDebugMarker(lat, lng, moveCenter = true) {
        if (!this.map) {
            console.error('❌ 지도 객체가 없습니다.');
            return null;
        }

        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
            console.error('❌ 유효하지 않은 좌표입니다. 예) showDebugMarker(36.8337, 127.1381)');
            return null;
        }
        if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
            console.error('❌ 좌표 범위를 벗어났습니다. lat(-90~90), lng(-180~180)');
            return null;
        }

        // 기존 디버그 마커 제거 후 단일 마커로 유지
        this.clearDebugMarker();

        const position = new naver.maps.LatLng(latNum, lngNum);
        this.debugMarker = new naver.maps.Marker({
            position: position,
            map: this.map,
            title: `디버그 마커 (${latNum.toFixed(6)}, ${lngNum.toFixed(6)})`,
            zIndex: 2000,
            icon: {
                content: `
                    <div style="
                        width:14px;height:14px;border-radius:50%;
                        background:#ff3b30;border:2px solid #fff;
                        box-shadow:0 0 0 3px rgba(255,59,48,0.25),0 2px 8px rgba(0,0,0,0.35);
                    "></div>
                `,
                anchor: new naver.maps.Point(7, 7)
            }
        });

        if (moveCenter) {
            this.map.setCenter(position);
        }

        console.log(`📍 디버그 마커 생성: lat=${latNum.toFixed(6)}, lng=${lngNum.toFixed(6)}`);
        return this.debugMarker;
    }

    /**
     * ✅ 디버그 단일 마커 제거
     */
    clearDebugMarker() {
        if (this.debugMarker) {
            this.debugMarker.setMap(null);
            this.debugMarker = null;
            console.log('🗑️ 디버그 마커 제거');
        }
    }

    /**
     * ✅ 모바일용 디버그 버튼 표시 (화면 우측 상단에 플로팅 버튼)
     */
    showDebugButton() {
        // 기존 버튼 제거
        if (this.debugButton) {
            this.debugButton.remove();
        }

        this.debugButton = document.createElement('div');
        this.debugButton.id = 'debugBoundsBtn';
        this.debugButton.style.cssText = `
            position: fixed;
            top: 130px;
            right: 10px;
            width: 50px;
            height: 50px;
            background: rgba(255, 0, 0, 0.8);
            color: white;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
            z-index: 9999;
            box-shadow: 0 2px 10px rgba(0,0,0,0.3);
            cursor: pointer;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
        `;
        this.debugButton.innerHTML = '🔍';
        this.debugButton.title = '영역 디버그';

        // 클릭 이벤트
        this.debugButton.addEventListener('click', () => {
            if (this.debugRectangle) {
                this.hideBoundsDebug();
            } else {
                this.showBoundsDebug();
            }
        });

        document.body.appendChild(this.debugButton);
        console.log('🔍 디버그 버튼 표시됨 - 탭하면 영역 표시/숨김');
    }

    /**
     * ✅ 모바일용 디버그 버튼 숨기기
     */
    hideDebugButton() {
        if (this.debugButton) {
            this.debugButton.remove();
            this.debugButton = null;
        }
        this.hideBoundsDebug();
        console.log('🔍 디버그 버튼 숨김');
    }

    /**
     * 특정 위치로 이동
     */
    moveToLocation(lat, lng, zoom = 14) {
        const location = new naver.maps.LatLng(lat, lng);
        this.map.setCenter(location);
        this.map.setZoom(zoom);
    }

    /**
     * ✅ 관심목록 필터 토글
     */
    toggleLikedFilter() {
        this.isLikedFilterActive = !this.isLikedFilterActive;

        if (this.isLikedFilterActive) {
            this.applyLikedFilter();
        } else {
            this.resetLikedFilter();
        }
    }

    /**
     * ✅ 관심목록 필터 적용 - 전체 DB에서 조회
     */
    async applyLikedFilter() {


        // ✅ 역 필터 해제 (관심목록 필터 활성화 시)
        if (window.stationManager && window.stationManager.isStationFilterActive) {
            // 역 마커 아이콘 복원
            if (window.stationManager.selectedStation) {
                window.stationManager.updateStationMarkerIcon(window.stationManager.selectedStation.id, false);
            }
            window.stationManager.isStationFilterActive = false;
            window.stationManager.selectedStation = null;
            window.stationManager.selectedZoomLevel = null;
            window.stationManager.hideRadiusCircle();
            // 상단 필터 버튼 UI 초기화
            window.stationManager.updateStationButtonUI(null);
            console.log('🚇 관심목록 필터로 인해 역 필터 해제');
        }

        // ✅ 동 선택 해제 (관심목록 필터 활성화 시)
        if (typeof clearDongSelectionGlobal === 'function') {
            clearDongSelectionGlobal();
        }

        // ✅ 좌표 클러스터 선택 해제 (관심목록 필터 활성화 시)
        if (this.clusteringManager && this.clusteringManager.selectedClusterIndex !== null) {
            console.log('📍 관심목록 필터로 인해 좌표 클러스터 선택 해제');
            this.clusteringManager.selectedClusterIndex = null;
            this.clusteringManager.showClusteredMarkers();
        }

        // ✅ 전체 필터 초기화 (관심목록 필터 활성화 시)
        if (window.fullFilterState) {
            window.fullFilterState = {
                tradeType: ['monthly', 'jeonse', 'short_term'],
                depositMin: 0,
                depositMax: 20,
                monthlyMin: 0,
                monthlyMax: 20,
                includeManagement: false,
                kitchen: ['separate', 'open'],
                balcony: ['separate', 'extended'],
                roomType: [],
                areaMin: 0,
                areaMax: 8,
                floor: ['all'],
                buildingAge: ['all'],
                options: [],
                propertyStatus: ['available'],
                listingScope: ['recent']
            };
            // 필터 아이콘 상태 업데이트
            const filterIconBtn = document.getElementById('filterIconBtn');
            if (filterIconBtn) {
                filterIconBtn.classList.remove('active');
            }
            console.log('🔍 관심목록 필터로 인해 전체 필터 초기화됨');
        }
        this.fullFilterParams = null;

        // ✅ 테마 필터 초기화 (관심목록 필터 활성화 시)
        if (window.currentThemeFilter) {
            window.currentThemeFilter = null;
            this.themeFilterParams = null;
            // 테마 버튼 UI 초기화
            const recommendBtn = document.getElementById('recommendFilterBtn');
            const recommendText = document.getElementById('recommendFilterText');
            if (recommendBtn) {
                recommendBtn.classList.remove('active');
            }
            if (recommendText) {
                recommendText.textContent = '테마별 검색';
            }
            console.log('🎯 관심목록 필터로 인해 테마 필터 초기화됨');
        }

        // ✅ 카테고리 필터 백업 후 초기화 (관심목록 닫을 때 복원용)
        this.savedCategoryBeforeLiked = this.currentCategory;
        this.savedSelectedCategoryBeforeLiked = window.selectedPropertyCategory ? [...window.selectedPropertyCategory] : [];
        console.log('💾 카테고리 필터 백업:', this.savedCategoryBeforeLiked, this.savedSelectedCategoryBeforeLiked);

        this.currentCategory = null;
        if (this.propertyCache) {
            this.propertyCache.clear();
        }

        // 1. 현재 상태 백업
        if (this.originalProperties.length === 0 || this.properties.length > this.originalProperties.length) {
            this.originalProperties = [...this.properties];
        }

        // 2. 찜한 목록 가져오기 (liked.js의 함수)
        if (typeof getLikedList === 'undefined') {
            console.error('getLikedList 함수를 찾을 수 없습니다. liked.js가 로드되었는지 확인하세요.');
            this.isLikedFilterActive = false; // ✅ 상태 직접 변경
            return;
        }

        const likedList = getLikedList();

        if (likedList.length === 0) {
            alert('찜한 매물이 없습니다.');
            this.isLikedFilterActive = false; // ✅ toggleLikedFilter() 대신 직접 상태 변경
            return;
        }

        // 3. ✅ API 호출하여 찜한 매물 가져오기 (전체 DB에서)
        try {
            console.log('📡 찜한 매물 조회 중...', likedList);

            const response = await fetch('/api/properties?codes=' + likedList.join(','));
            const data = await response.json();

            if (!data.success || !data.data || data.data.length === 0) {
                alert(`찜한 매물 정보를 서버에서 찾을 수 없습니다.\n(저장된 ID 개수: ${likedList.length}개)`);
                this.isLikedFilterActive = false; // ✅ toggleLikedFilter() 대신 직접 상태 변경
                return;
            }

            const filteredProperties = data.data;
            console.log(`✅ 찜한 매물 ${filteredProperties.length}개 로드 완료`);

            // ✅ 3.5. this.properties 업데이트 및 지도 마커 갱신
            this.properties = filteredProperties;

            if (this.markerManager) {
                this.markerManager.createMarkers(this.properties);
                if (this.clusteringManager) {
                    this.clusteringManager.showClusteredMarkers();
                }
            }

            // 4. ✅ 드래그 패널에 표시
            if (this.appManager && this.appManager.createPropertyCard) {
                // ✅ 상단 매물 수량 업데이트
                const countElement = document.getElementById('propertyCount');
                if (countElement) {
                    countElement.textContent = filteredProperties.length;
                }

                // ✅ main.js의 createPropertyCard를 사용하여 HTML 생성
                const listContent = document.getElementById('listContent');
                if (listContent) {
                    const cards = filteredProperties.map(property =>
                        this.appManager.createPropertyCard(property)
                    ).join('');
                    listContent.innerHTML = cards;

                    // ✅ 하트 상태 초기화 (liked.js의 함수)
                    if (typeof initLikedHearts === 'function') {
                        initLikedHearts();
                    }
                }

                // ✅ 페이지네이션 상태 업데이트 (무한 스크롤 등을 위해)
                if (this.appManager.paginationState) {
                    this.appManager.paginationState.allProperties = filteredProperties;
                    this.appManager.paginationState.totalCount = filteredProperties.length;
                    this.appManager.paginationState.currentPage = 1;
                }

                // ✅ 헤더에 "관심목록 00개 매물 보기" 표시
                if (typeof StationManager !== 'undefined' && StationManager.updatePropertyCountWithLocation) {
                    StationManager.updatePropertyCountWithLocation(filteredProperties.length, '관심목록');
                }


            } else {
                console.error('appManager 또는 createPropertyCard를 찾을 수 없습니다.');
                this.isLikedFilterActive = false; // ✅ 오류 시 상태 복구
            }

        } catch (error) {
            console.error('찜한 매물 조회 실패:', error);
            alert('찜한 매물을 불러오는 중 오류가 발생했습니다.');
            this.isLikedFilterActive = false; // ✅ toggleLikedFilter() 대신 직접 상태 변경
        }
    }

    /**
     * ✅ 관심목록 필터 해제
     */
    resetLikedFilter() {
        // ✅ 1. 카테고리 필터 복원 (패널 닫기 전에 먼저 복원!)
        const hadCategoryFilter = this.savedCategoryBeforeLiked !== null ||
                                   (this.savedSelectedCategoryBeforeLiked && this.savedSelectedCategoryBeforeLiked.length > 0);

        if (hadCategoryFilter) {
            console.log('🔄 카테고리 필터 복원:', this.savedCategoryBeforeLiked, this.savedSelectedCategoryBeforeLiked);
            this.currentCategory = this.savedCategoryBeforeLiked;
            window.selectedPropertyCategory = this.savedSelectedCategoryBeforeLiked || [];

            // 캐시 초기화 (새로운 필터로 로드하기 위해)
            if (this.propertyCache) {
                this.propertyCache.clear();
            }
        }

        // 카테고리 필터 백업 초기화
        this.savedCategoryBeforeLiked = null;
        this.savedSelectedCategoryBeforeLiked = [];

        // ✅ 드래그 패널 레이블 업데이트
        if (typeof updatePanelLabel === 'function') {
            updatePanelLabel();
        }



        // ✅ 카테고리 필터가 있었으면 closePanel에서 loadPropertiesInBounds를 호출하므로 여기서 끝
        if (hadCategoryFilter) {
            return;
        }

        // 3. 원본 목록 복구 (카테고리 필터가 없었던 경우)
        if (this.originalProperties.length > 0) {
            this.properties = [...this.originalProperties];
        } else {
            // 원본이 없으면 현재 영역 다시 로드
            this.loadPropertiesInBounds();
            return;
        }

        // 4. 지도 마커 다시 그리기
        if (this.markerManager) {
            this.markerManager.createMarkers(this.properties);
            if (this.clusteringManager) {
                this.clusteringManager.showClusteredMarkers();
            }
        }

        // 5. 통계 업데이트
        this.updateStats();
    }

    /**
     * ✅ 관심목록 상태 복구 (외부에서 호출 가능)
     */
    restoreFromLikedFilter() {
        if (this.isLikedFilterActive) {
            this.isLikedFilterActive = false;
            this.resetLikedFilter();
        }
    }

    /**
     * 지도 매니저 정리
     */
    destroy() {
        if (this.eventManager && this.eventManager.cleanup) {
            this.eventManager.cleanup();
        }
        if (this.markerManager && this.markerManager.clearMarkers) {
            this.markerManager.clearMarkers();
        }
        this.isInitialized = false;
        console.log('✅ 지도 매니저 정리 완료');
    }
}

// ✅ 디버그용 전역 함수 (콘솔에서 호출 가능)
window.showBoundsDebug = function() {
    if (window.appManager && window.appManager.mapManager) {
        return window.appManager.mapManager.showBoundsDebug();
    }
    console.error('MapManager가 초기화되지 않았습니다.');
};

window.hideBoundsDebug = function() {
    if (window.appManager && window.appManager.mapManager) {
        window.appManager.mapManager.hideBoundsDebug();
    }
};

// ✅ 모바일용 디버그 버튼 (화면에 빨간 돋보기 버튼 표시)
window.showDebugButton = function() {
    if (window.appManager && window.appManager.mapManager) {
        window.appManager.mapManager.showDebugButton();
    }
};

window.hideDebugButton = function() {
    if (window.appManager && window.appManager.mapManager) {
        window.appManager.mapManager.hideDebugButton();
    }
};

// ✅ 위경도 디버그 마커 전역 함수 (콘솔에서 호출 가능)
window.showDebugMarker = function(lat, lng, moveCenter = true) {
    if (window.appManager && window.appManager.mapManager) {
        return window.appManager.mapManager.showDebugMarker(lat, lng, moveCenter);
    }
    console.error('MapManager가 초기화되지 않았습니다.');
    return null;
};

window.clearDebugMarker = function() {
    if (window.appManager && window.appManager.mapManager) {
        window.appManager.mapManager.clearDebugMarker();
    }
};

// main.js에 이미 window.getCurrentLocation이 있음
