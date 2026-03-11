/**
 * 동 경계 폴리곤 매니저
 * - GeoJSON 파일에서 동 경계 데이터를 로드
 * - 선택한 동의 경계를 지도에 빨간색 폴리곤으로 표시
 */

class DongBoundaryManager {
    constructor() {
        this.boundaryData = null;    // GeoJSON 데이터 저장
        this.currentPolygons = [];   // ✅ 다중 폴리곤 배열 (단일→다중 변경)
        this.isLoaded = false;
    }

    /**
     * GeoJSON 파일 로드 (페이지 로딩 시 호출)
     */
    async loadBoundaryData() {
        try {
            console.log('📍 동 경계 데이터 로딩 시작...');
            const response = await fetch('/static/map_data/cheonan_all_dongs.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.boundaryData = await response.json();
            this.isLoaded = true;
            console.log(`✅ 동 경계 데이터 로드 완료: ${this.boundaryData.features.length}개 지역`);
        } catch (error) {
            console.error('❌ 동 경계 데이터 로드 실패:', error);
        }
    }

    /**
     * 동 이름으로 경계 데이터 찾기
     * @param {string} dongName - 동 이름 (예: '두정동')
     * @returns {object|null} - GeoJSON Feature 또는 null
     */
    findBoundaryByName(dongName) {
        if (!this.isLoaded || !this.boundaryData) {
            console.warn('⚠️ 경계 데이터가 아직 로드되지 않았습니다.');
            return null;
        }

        // EMD_NM 필드에서 동 이름 매칭
        const feature = this.boundaryData.features.find(f => {
            return f.properties.EMD_NM === dongName;
        });

        if (!feature) {
            console.warn(`⚠️ '${dongName}' 경계 데이터를 찾을 수 없습니다.`);
        }

        return feature;
    }

    /**
     * 동 경계 폴리곤의 중심점 좌표 계산
     * @param {string} dongName - 동 이름 (예: '두정동')
     * @returns {object|null} - { lat, lng } 또는 null
     */
    getBoundaryCenter(dongName) {
        const feature = this.findBoundaryByName(dongName);
        if (!feature) {
            return null;
        }

        const coordinates = feature.geometry.coordinates;
        const geometryType = feature.geometry.type;

        let allCoords = [];

        if (geometryType === 'Polygon') {
            // 단일 폴리곤
            allCoords = coordinates[0];
        } else if (geometryType === 'MultiPolygon') {
            // 멀티폴리곤 (첫 번째 폴리곤 사용)
            allCoords = coordinates[0][0];
        }

        if (allCoords.length === 0) {
            return null;
        }

        // Bounding box 중심점 계산 (폴리곤의 최소/최대 좌표의 평균)
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;

        allCoords.forEach(coord => {
            const lng = coord[0];
            const lat = coord[1];
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        });

        const centerLat = (minLat + maxLat) / 2;
        const centerLng = (minLng + maxLng) / 2;

        console.log(`📍 ${dongName} 경계 중심점: (${centerLat.toFixed(6)}, ${centerLng.toFixed(6)})`);

        return { lat: centerLat, lng: centerLng };
    }

    /**
     * ✅ 단일 동 경계 폴리곤을 배열에 추가 (기존 폴리곤 유지)
     * showBoundaries()에서 내부적으로 사용
     * @param {string} dongName - 동 이름
     * @param {object} map - 네이버 맵 객체
     */
    _appendBoundary(dongName, map) {
        const feature = this.findBoundaryByName(dongName);
        if (!feature) return;

        // GeoJSON 좌표를 네이버 맵 좌표로 변환
        const coordinates = feature.geometry.coordinates;
        const geometryType = feature.geometry.type;
        let paths = [];

        if (geometryType === 'Polygon') {
            paths = coordinates[0].map(coord => new naver.maps.LatLng(coord[1], coord[0]));
        } else if (geometryType === 'MultiPolygon') {
            paths = coordinates[0][0].map(coord => new naver.maps.LatLng(coord[1], coord[0]));
        }

        // 폴리곤 생성 후 배열에 추가
        const polygon = new naver.maps.Polygon({
            map: map,
            paths: paths,
            strokeColor: '#FF6160',
            strokeWeight: 3,
            strokeOpacity: 0.8,
            fillColor: '#FF6160',
            fillOpacity: 0.15,
            zIndex: 50
        });
        this.currentPolygons.push(polygon);
        console.log(`✅ '${dongName}' 경계 추가 완료`);
    }

    /**
     * ✅ 단일 동 경계 표시 (하위 호환용 — 기존 호출 코드 유지)
     * 내부적으로 showBoundaries([dongName]) 와 동일
     * @param {string} dongName - 동 이름
     * @param {object} map - 네이버 맵 객체
     */
    showBoundary(dongName, map) {
        if (!map) { console.error('❌ 맵 객체가 없습니다.'); return; }
        this.showBoundaries([dongName], map);
    }

    /**
     * ✅ 다중 동 경계 폴리곤 동시 표시 (기존 폴리곤 모두 제거 후 재그리기)
     * @param {string[]} dongNames - 동 이름 배열
     * @param {object} map - 네이버 맵 객체
     */
    showBoundaries(dongNames, map) {
        if (!map) { console.error('❌ 맵 객체가 없습니다.'); return; }
        this.clearBoundary(); // 기존 폴리곤 전체 제거
        dongNames.forEach(name => this._appendBoundary(name, map));
    }

    /**
     * ✅ 현재 표시된 경계 폴리곤 전체 제거
     */
    clearBoundary() {
        if (this.currentPolygons.length > 0) {
            this.currentPolygons.forEach(p => p.setMap(null));
            this.currentPolygons = [];
            console.log('🗑️ 기존 경계 폴리곤 전체 제거');
        }
    }

    /**
     * ✅ 동 이름으로 바운딩 박스(최소 사각형) 계산
     * 드래그 2/3 화면 밖 체크 및 다중 동 중심 이동에 사용
     * @param {string} dongName - 동 이름
     * @returns {{minLat, maxLat, minLng, maxLng}|null}
     */
    getBoundingBox(dongName) {
        const feature = this.findBoundaryByName(dongName);
        if (!feature) return null;

        const coordinates = feature.geometry.coordinates;
        const geometryType = feature.geometry.type;
        let allCoords = [];

        if (geometryType === 'Polygon') {
            allCoords = coordinates[0];
        } else if (geometryType === 'MultiPolygon') {
            allCoords = coordinates[0][0];
        }

        if (allCoords.length === 0) return null;

        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;

        allCoords.forEach(coord => {
            const lng = coord[0], lat = coord[1];
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
        });

        return { minLat, maxLat, minLng, maxLng };
    }

    /**
     * ✅ 여러 동의 통합 바운딩 박스 계산 (합집합)
     * 다중 선택된 동 전체 영역을 하나의 사각형으로 묶어 반환
     * @param {string[]} dongNames - 동 이름 배열
     * @returns {{minLat, maxLat, minLng, maxLng}|null}
     */
    getCombinedBoundingBox(dongNames) {
        let minLat = Infinity, maxLat = -Infinity;
        let minLng = Infinity, maxLng = -Infinity;
        let found = false;

        dongNames.forEach(name => {
            const box = this.getBoundingBox(name);
            if (!box) return;
            found = true;
            if (box.minLat < minLat) minLat = box.minLat;
            if (box.maxLat > maxLat) maxLat = box.maxLat;
            if (box.minLng < minLng) minLng = box.minLng;
            if (box.maxLng > maxLng) maxLng = box.maxLng;
        });

        return found ? { minLat, maxLat, minLng, maxLng } : null;
    }

    /**
     * ✅ Ray casting 알고리즘으로 포인트가 폴리곤 내부에 있는지 확인
     * @param {number} lat - 확인할 위도
     * @param {number} lng - 확인할 경도
     * @param {number[][]} coordinates - [lng, lat] 형식의 좌표 배열 (GeoJSON)
     * @returns {boolean} - 내부이면 true
     */
    isPointInPolygon(lat, lng, coordinates) {
        let inside = false;
        const x = lng, y = lat;

        for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
            const xi = coordinates[i][0], yi = coordinates[i][1];
            const xj = coordinates[j][0], yj = coordinates[j][1];

            // 교차 여부 판별 (Ray casting)
            const intersect = ((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }

        return inside;
    }

    /**
     * ✅ 포인트가 현재 선택된 동들의 경계 중 하나 이상에 포함되는지 확인
     * 지도 클릭 시 동 경계 밖 클릭 여부 판별에 사용
     * @param {number} lat - 클릭된 위도
     * @param {number} lng - 클릭된 경도
     * @returns {boolean} - 선택된 동 경계 안이면 true, 밖이면 false
     */
    isPointInBoundaries(lat, lng) {
        if (!this.isLoaded || !this.boundaryData) return false;

        // 현재 선택된 동 이름 목록 가져오기
        const cm = window.appManager?.mapManager?.clusteringManager;
        if (!cm || !cm.selectedDongNames || cm.selectedDongNames.size === 0) return false;

        const dongNames = Array.from(cm.selectedDongNames);

        // 선택된 동 중 하나라도 포인트를 포함하면 true
        for (const dongName of dongNames) {
            const feature = this.findBoundaryByName(dongName);
            if (!feature) continue;

            const geometryType = feature.geometry.type;
            const coordinates = feature.geometry.coordinates;

            if (geometryType === 'Polygon') {
                // 단일 폴리곤: 외부 링만 확인
                if (this.isPointInPolygon(lat, lng, coordinates[0])) return true;
            } else if (geometryType === 'MultiPolygon') {
                // 멀티폴리곤: 모든 폴리곤 확인
                for (const polygon of coordinates) {
                    if (this.isPointInPolygon(lat, lng, polygon[0])) return true;
                }
            }
        }

        return false;
    }

    /**
     * ✅ 여러 동의 통합 바운딩 박스 중심점 계산
     * 2개 이상 동 선택 시 지도 중심 이동 목표점으로 사용
     * @param {string[]} dongNames - 동 이름 배열
     * @returns {{lat, lng}|null}
     */
    getCombinedCenter(dongNames) {
        const box = this.getCombinedBoundingBox(dongNames);
        if (!box) return null;
        return {
            lat: (box.minLat + box.maxLat) / 2,
            lng: (box.minLng + box.maxLng) / 2
        };
    }
}

// 전역 인스턴스 생성
window.dongBoundaryManager = new DongBoundaryManager();

// 페이지 로딩 시 데이터 미리 로드
document.addEventListener('DOMContentLoaded', () => {
    window.dongBoundaryManager.loadBoundaryData();
});
