/**
 * 마커 관리 모듈
 */
class MarkerManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.markers = [];
        this.currentLocationMarker = null;
    }
    
    /**
     * 매물 마커들 생성
     */
    createMarkers(properties) {
        // 기존 마커들 제거
        this.clearMarkers();
        
        console.log(`📍 ${properties.length}개 매물 마커 생성 중...`);
        
        properties.forEach(property => {
            if (property.lat && property.lng) {
                const marker = this.createMarker(property);
                if (marker) {
                    this.markers.push(marker);
                }
            }
        });
        
        console.log(`✅ ${this.markers.length}개 마커 생성 완료`);
        
        // ✅ 수정: 초기 마커 표시 제거 - loadProperties()에서 클러스터링 적용
        // this.mapManager.updateMarkerDisplay();
    }
    
    /**
     * 개별 마커 생성 (클러스터링 전용 - 아이콘 없음)
     */
    createMarker(property) {
        try {
            const position = new naver.maps.LatLng(
                parseFloat(property.lat),
                parseFloat(property.lng)
            );
            
            const marker = new naver.maps.Marker({
                position: position,
                map: null,  // 클러스터링이 관리
                title: property.title || '매물',
                zIndex: 10,
                visible: false  // 기본적으로 숨김
            });
            
            // 마커에 property 데이터 저장
            marker.propertyData = property;
            
            return marker;
        } catch (error) {
            console.error('마커 생성 실패:', property, error);
            return null;
        }
    }
    
    /**
     * 현재 위치 마커 표시
     */
    showCurrentLocationMarker(lat, lng) {
        // 기존 현재 위치 마커 제거
        if (this.currentLocationMarker) {
            this.currentLocationMarker.setMap(null);
        }
        
        const position = new naver.maps.LatLng(lat, lng);
        
        // 정교한 커스텀 마커 (GPS 위치 표시용)
        this.currentLocationMarker = new naver.maps.Marker({
            position: position,
            map: this.mapManager.map,
            icon: {
                content: [
                    '<div style="width: 32px; height: 32px; position: relative;">',
                        '<div style="position: absolute; top: 0; left: 0; width: 32px; height: 32px; background: rgba(59,130,246,0.08); border-radius: 50%;"></div>',
                        '<div style="position: absolute; top: 4px; left: 4px; width: 24px; height: 24px; background: rgba(59,130,246,0.1); border-radius: 50%;"></div>',
                        '<div style="position: absolute; top: 8px; left: 8px; width: 16px; height: 16px; background: white; border: 2px solid #3B82F6; border-radius: 50%;"></div>',
                        '<div style="position: absolute; top: 12px; left: 12px; width: 8px; height: 8px; background: #3B82F6; border-radius: 50%;"></div>',
                    '</div>'
                ].join(''),
                anchor: new naver.maps.Point(16, 16)
            },
            title: '현재 위치',
            zIndex: 1000  // 가장 위에 표시
        });
    }
    
    /**
     * 사용자 위치로 지도 이동 및 마커 표시
     */
    moveToUserLocation(lat, lng) {
        const position = new naver.maps.LatLng(lat, lng);
        this.mapManager.map.setCenter(position);
        this.mapManager.map.setZoom(16);
        
        // 현재 위치 마커 표시
        this.showCurrentLocationMarker(lat, lng);
    }
    
    /**
     * 마커들 제거
     */
    clearMarkers() {
        this.markers.forEach(marker => {
            marker.setMap(null);
        });
        this.markers = [];
        
        // ✅ 현재 위치 마커는 제거하지 않음 (보존)
        // if (this.currentLocationMarker) {
        //     this.currentLocationMarker.setMap(null);
        //     this.currentLocationMarker = null;
        // }
    }
    
    /**
     * 마커 표시 업데이트 (항상 클러스터링 사용)
     */
    updateMarkerDisplay() {
        // 모든 줌 레벨에서 클러스터링 사용
        this.mapManager.clusteringManager.showClusteredMarkers();
    }
}