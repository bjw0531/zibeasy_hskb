/**
 * GPS 관련 기능 모듈
 */
class GPSManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.GPS_CACHE_KEY = 'lastGpsLocation';
        this.MAP_VIEW_CACHE_KEY = 'lastMapViewLocation'; // ✅ 마지막 조회 위치 저장 키
        this.GPS_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24시간
        this.MAP_VIEW_CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // ✅ 30일
        this.isRequesting = false; // ✅ 요청 중복 방지
    }

    /**
     * GPS 정보를 캐시에 저장
     */
    saveLocationToCache(lat, lng) {
        const locationData = {
            latitude: lat,
            longitude: lng,
            timestamp: new Date().getTime()
        };
        localStorage.setItem(this.GPS_CACHE_KEY, JSON.stringify(locationData));
        console.log('✅ GPS 위치 캐시 저장:', lat, lng);
    }

    /**
     * 캐시에서 GPS 정보 불러오기
     */
    getLocationFromCache() {
        try {
            const cached = localStorage.getItem(this.GPS_CACHE_KEY);
            if (cached) {
                const locationData = JSON.parse(cached);
                const now = new Date().getTime();

                if (now - locationData.timestamp < this.GPS_CACHE_DURATION) {
                    return {
                        latitude: locationData.latitude,
                        longitude: locationData.longitude
                    };
                }
            }
        } catch (error) {
            console.error('GPS 캐시 읽기 오류:', error);
        }
        return null;
    }

    /**
     * ✅ 마지막 조회 위치를 캐시에 저장
     */
    saveMapViewToCache(lat, lng, zoom) {
        const viewData = {
            latitude: lat,
            longitude: lng,
            zoom: zoom || 15,
            timestamp: new Date().getTime()
        };
        localStorage.setItem(this.MAP_VIEW_CACHE_KEY, JSON.stringify(viewData));
        console.log('✅ 마지막 조회 위치 저장:', lat, lng, 'zoom:', zoom);
    }

    /**
     * ✅ 캐시에서 마지막 조회 위치 불러오기
     */
    getMapViewFromCache() {
        try {
            const cached = localStorage.getItem(this.MAP_VIEW_CACHE_KEY);
            if (cached) {
                const viewData = JSON.parse(cached);
                const now = new Date().getTime();

                if (now - viewData.timestamp < this.MAP_VIEW_CACHE_DURATION) {
                    return {
                        latitude: viewData.latitude,
                        longitude: viewData.longitude,
                        zoom: viewData.zoom || 15
                    };
                }
            }
        } catch (error) {
            console.error('마지막 조회 위치 읽기 오류:', error);
        }
        return null;
    }

    /**
     * 저정밀 위치 미리 가져오기 (지도 초기화 시)
     */
    prefetchLowAccuracyLocation() {
        if (this.getLocationFromCache()) {
            return;
        }
        if (!navigator.geolocation) {
            return;
        }

        console.log('저정밀 위치 미리 가져오기 시작...');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                this.saveLocationToCache(lat, lng);
                console.log('✅ 저정밀 위치 캐싱 완료:', lat, lng);
            },
            (error) => {
                console.log('저정밀 위치 캐싱 실패:', error);
            },
            {
                enableHighAccuracy: false,
                timeout: 2500,
                maximumAge: 0
            }
        );
    }

    /**
     * 백그라운드에서 고정밀 위치 업데이트
     */
    refreshHighAccuracyInBackground() {
        if (!navigator.geolocation) return;

        console.log('백그라운드 고정밀 위치 업데이트 시작...');

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                this.saveLocationToCache(lat, lng);
                console.log('✅ 고정밀 위치 캐싱 완료:', lat, lng);
            },
            (error) => {
                console.log('고정밀 위치 캐싱 실패:', error);
            },
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 0
            }
        );
    }

    /**
     * GPS 성공 처리
     */
    handleGpsSuccess(lat, lng) {
        console.log('✅ GPS 위치 획득:', lat, lng);

        // 마커 표시 (안전한 방식)
        if (this.mapManager.markerManager && this.mapManager.markerManager.showCurrentLocationMarker) {
            this.mapManager.markerManager.showCurrentLocationMarker(lat, lng);
        } else {
            console.warn('markerManager가 없습니다. 기본 마커 표시');
        }

        // 지도 중심 이동 + 줌 레벨 설정
        const pos = new naver.maps.LatLng(lat, lng);
        this.mapManager.map.setCenter(pos);
        this.mapManager.map.setZoom(16);  // ✅ 줌 레벨 16으로 설정

        // ✅ 캐시 초기화 (새 위치이므로)
        this.mapManager.propertyCache.clear();

        // ✅ 매물 로딩 (지연 시간 추가로 지도 이동 완료 후 로딩)
        setTimeout(() => {
            console.log('📍 GPS 위치로 이동 후 매물 로딩 시작');
            this.mapManager.loadPropertiesInBounds();
        }, 300);

        // 캐시 저장
        this.saveLocationToCache(lat, lng);
    }

    /**
     * 현재 위치로 이동 (GPS 버튼 클릭 시)
     * ✅ iOS 개선: 항상 실제 GPS 요청 + enableHighAccuracy:true + timeout:10s + 폴백
     */
    getCurrentLocation() {
        // ✅ 중복 요청 방지
        if (this.isRequesting) {
            console.log('GPS 요청이 이미 진행 중입니다.');
            return;
        }

        const gpsButton = document.querySelector('.gps-floating-btn');
        if (gpsButton) {
            gpsButton.classList.add('loading');
            gpsButton.disabled = true;
        }

        if (!navigator.geolocation) {
            alert('이 브라우저는 GPS를 지원하지 않습니다.');
            if (gpsButton) {
                gpsButton.classList.remove('loading');
                gpsButton.disabled = false;
            }
            return;
        }

        this.isRequesting = true;
        console.log('📍 GPS 위치 요청 시작...');

        // ✅ 동 선택 해제 (GPS 위치 이동 시)
        if (typeof clearDongSelectionGlobal === 'function') {
            clearDongSelectionGlobal();
        }

        // ✅ 버튼 상태 초기화 헬퍼
        const resetButton = () => {
            if (gpsButton) {
                gpsButton.classList.remove('loading');
                gpsButton.disabled = false;
            }
            this.isRequesting = false;
        };

        // ✅ iOS에서는 항상 실제 GPS 요청 (캐시 사용 안 함)
        // 이유: 캐시된 위치가 실제 내 위치와 다를 수 있고,
        //       iPhone에서는 GPS 허용 후 실제 위치로 이동해야 의미 있음
        const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

        // ✅ Android 등 비iOS는 캐시 먼저 확인 (빠른 응답)
        if (!isIOS) {
            const cached = this.getLocationFromCache();
            if (cached) {
                console.log('✅ 캐시된 위치 사용:', cached);
                this.handleGpsSuccess(cached.latitude, cached.longitude);
                resetButton();
                this.refineLocationInBackground();
                return;
            }
        }

        // ✅ GPS 성공 처리 공통 함수
        const onSuccess = (position) => {
            console.log('✅ GPS 위치 획득 성공');
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            this.handleGpsSuccess(lat, lng);
            resetButton();
            // ✅ 백그라운드에서 더 정확한 위치로 보정 (iOS만)
            if (isIOS) {
                this.refineLocationInBackground();
            }
        };

        // ✅ GPS 오류 메시지 생성
        const getErrorMessage = (error) => {
            const isIOSDevice = isIOS;
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    return isIOSDevice
                        ? '위치 권한이 거부되었습니다.\n설정 > 개인 정보 보호 > 위치 서비스에서 허용해주세요.'
                        : '위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.';
                case error.POSITION_UNAVAILABLE:
                    return '위치 정보를 사용할 수 없습니다. GPS가 켜져 있는지 확인해주세요.';
                case error.TIMEOUT:
                    return '위치 요청 시간이 초과되었습니다. 다시 시도해주세요.';
                default:
                    return `위치 오류: ${error.message}`;
            }
        };

        // ✅ 1차 시도: enableHighAccuracy:true (정확한 GPS)
        // iOS에서 정밀 위치를 허용한 경우 정확한 위치 획득 가능
        navigator.geolocation.getCurrentPosition(
            onSuccess,
            (error) => {
                console.error('❌ GPS 1차 시도 실패:', error.code, error.message);

                // ✅ 타임아웃이면 저정밀도로 폴백 재시도 (빠르게 응답)
                if (error.code === error.TIMEOUT) {
                    console.log('⚠️ GPS 타임아웃 → 저정밀도로 재시도...');
                    navigator.geolocation.getCurrentPosition(
                        onSuccess,
                        (fallbackError) => {
                            console.error('❌ GPS 폴백도 실패:', fallbackError.code);
                            alert(getErrorMessage(fallbackError));
                            resetButton();
                        },
                        {
                            enableHighAccuracy: false, // 저정밀도 (빠름)
                            timeout: 10000,            // 10초
                            maximumAge: 30000          // 30초 이내 캐시 허용
                        }
                    );
                    return; // 폴백 요청 중이므로 아래 코드 실행 안 함
                }

                // ✅ 타임아웃 외 오류 (권한 거부, 위치 불가 등)
                alert(getErrorMessage(error));
                resetButton();
            },
            {
                enableHighAccuracy: true, // ✅ 정확한 GPS (iOS 정밀 위치 허용 시 효과적)
                timeout: 10000,           // ✅ 10초 (기존 5초 → iPhone GPS 획득 시간 여유)
                maximumAge: 0             // 항상 새로운 위치 요청
            }
        );
    }

    /**
     * 백그라운드에서 정확한 위치로 업데이트
     */
    refineLocationInBackground() {
        if (!navigator.geolocation) return;

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                // 지도 중심 업데이트
                const pos = new naver.maps.LatLng(lat, lng);
                this.mapManager.map.setCenter(pos);

                // 매물 로딩
                this.mapManager.loadPropertiesInBounds();

                this.saveLocationToCache(lat, lng);
                console.log('✅ 정확한 위치로 업데이트 완료');
            },
            (error) => {
                console.log('정확한 위치 업데이트 실패:', error);
            },
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 0
            }
        );
    }

}

// 전역 함수로 노출 (GPS 버튼 클릭용)
window.getCurrentLocation = function () {
    if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.gpsManager) {
        window.appManager.mapManager.gpsManager.getCurrentLocation();
    } else {
        console.error('GPS Manager가 초기화되지 않았습니다.');
        alert('GPS 기능을 사용할 수 없습니다. 페이지를 새로고침해주세요.');
    }
};

// ✅ 피드백/제보 모달 열기
window.openFeedbackModal = function () {
    console.log('📬 피드백/제보 버튼 클릭');

    // TODO: 추후 피드백 폼 모달로 교체 가능
    const message = `📬 피드백/제보하기

오류나 제안사항이 있으시면 아래 방법으로 연락해주세요:

📧 이메일: 관리자 이메일
📱 카카오톡: 관리자 카카오톡

소중한 의견 감사합니다! 🙏`;

    alert(message);
};
