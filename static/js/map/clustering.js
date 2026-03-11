/**
 * 클러스터링 모듈
 * 줌 레벨별 클러스터링 방식:
 * - 줌 15 이상: 좌표 기반 클러스터링 (숫자만 표시)
 * - 줌 13~14: 동(dong) 기반 클러스터링 (지역명 + 개수 표시)
 * - 줌 11~12: 구(gu) 기반 클러스터링 (서북구, 동남구 등)
 * - 줌 8~10: 시/도 기반 클러스터링 (충남 등)
 */
class ClusteringManager {
    constructor(mapManager) {
        this.mapManager = mapManager;
        this.clusterDistance = 100;
        this.clusterMarkers = [];
        this.selectedDongNames = new Set(); // ✅ 다중 선택된 동 이름 Set (단일→다중 변경)
        this._dongClusterData = new Map();  // ✅ 선택된 동의 필터링된 클러스터 데이터 캐시
        this.selectedClusterIndex = null; // ✅ 선택된 좌표 클러스터 인덱스 추적

        // ✅ 목록→지도 뒤로가기 시 동 선택 상태 복원 (마커 렌더 전에 미리 설정)
        this._pendingDongRestore = null;
        const savedDongNames = sessionStorage.getItem('selectedDongNames');
        const savedDongSearch = sessionStorage.getItem('currentDongSearch');
        if (savedDongNames && savedDongSearch) {
            try {
                const names = JSON.parse(savedDongNames); // string[] 파싱
                this.selectedDongNames = new Set(names);
                this._pendingDongRestore = new Set(names);
                window.currentDongSearch = JSON.parse(savedDongSearch);
            } catch (e) {
                console.warn('동 선택 상태 복원 실패:', e);
            }
            sessionStorage.removeItem('selectedDongNames');
            sessionStorage.removeItem('currentDongSearch');
            console.log('📍 동 선택 상태 복원 준비:', savedDongNames);
        }
    }

    /**
     * ✅ 하위호환 getter — 첫 번째 선택된 동 이름 반환 (null = 없음)
     * 외부 코드가 selectedDongName을 읽을 때 기존 동작 유지
     */
    get selectedDongName() {
        return Array.from(this.selectedDongNames)[0] ?? null;
    }

    /**
     * ✅ 하위호환 setter — 단일 동 이름 설정 (null이면 전체 해제)
     * 외부 코드가 selectedDongName = '두정동' 또는 = null 로 설정할 때 기존 동작 유지
     */
    set selectedDongName(val) {
        if (val === null || val === undefined) {
            // null 할당 → 전체 해제
            this.selectedDongNames.clear();
            this._dongClusterData.clear();
        } else {
            // 단일 동 설정 → 기존 선택 초기화 후 새 동 추가 (하위호환: 단일 선택)
            this.selectedDongNames.clear();
            this._dongClusterData.clear();
            this.selectedDongNames.add(val);
        }
    }

    /**
     * 좌표 기반 클러스터 생성 (기존 방식)
     */
    createClusters(markers) {
        const clusters = [];
        const projection = this.mapManager.map.getProjection();

        markers.forEach(marker => {
            const position = marker.getPosition();
            const point = projection.fromCoordToOffset(position);
            const cluster = {
                center: position,
                markers: [marker],
                point: point
            };

            // 기존 클러스터와 거리 확인
            let addedToCluster = false;
            for (let i = 0; i < clusters.length; i++) {
                const existingCluster = clusters[i];
                const distance = Math.sqrt(
                    Math.pow(cluster.point.x - existingCluster.point.x, 2) +
                    Math.pow(cluster.point.y - existingCluster.point.y, 2)
                );

                if (distance < this.clusterDistance) {
                    existingCluster.markers.push(marker);
                    addedToCluster = true;
                    break;
                }
            }

            if (!addedToCluster) {
                clusters.push(cluster);
            }
        });

        // 클러스터 중심점 계산
        clusters.forEach(cluster => {
            if (cluster.markers.length > 1) {
                const latSum = cluster.markers.reduce((sum, m) => sum + m.getPosition().lat(), 0);
                const lngSum = cluster.markers.reduce((sum, m) => sum + m.getPosition().lng(), 0);
                cluster.center = new naver.maps.LatLng(
                    latSum / cluster.markers.length,
                    lngSum / cluster.markers.length
                );
            }
        });

        return clusters;
    }

    /**
     * 동(dong) 기반 클러스터 생성
     */
    createDongClusters(markers) {
        const dongMap = new Map();

        markers.forEach(marker => {
            const property = marker.propertyData;
            if (!property) return;

            // dong 또는 ri 사용 (ri가 있으면 ri 우선)
            const dongName = property.ri || property.dong || '기타';

            if (!dongMap.has(dongName)) {
                dongMap.set(dongName, {
                    name: dongName,
                    markers: [],
                    properties: []
                });
            }

            dongMap.get(dongName).markers.push(marker);
            dongMap.get(dongName).properties.push(property);
        });

        // 각 동의 중심점 계산 (동 경계 폴리곤의 중심점 사용)
        const clusters = [];
        dongMap.forEach((data, name) => {
            const count = data.markers.length;
            let centerLat, centerLng;

            // ✅ 동 경계 폴리곤의 중심점 사용 (우선)
            if (window.dongBoundaryManager) {
                const boundaryCenter = window.dongBoundaryManager.getBoundaryCenter(name);
                if (boundaryCenter) {
                    centerLat = boundaryCenter.lat;
                    centerLng = boundaryCenter.lng;
                }
            }

            // 경계 중심점을 찾지 못한 경우 매물 좌표 평균 사용 (fallback)
            if (!centerLat || !centerLng) {
                const latSum = data.markers.reduce((sum, m) => sum + m.getPosition().lat(), 0);
                const lngSum = data.markers.reduce((sum, m) => sum + m.getPosition().lng(), 0);
                centerLat = latSum / count;
                centerLng = lngSum / count;
            }

            // ✅ 특정 동 마커 고정 좌표 적용
            const fixedDongCoords = {
                '두정동': { lat: 36.833804, lng: 127.135675 },
                '성성동': { lat: 36.842645, lng: 127.128897 },
                '백석동': { lat: 36.829253, lng: 127.119569 },
                '다가동': { lat: 36.797269, lng: 127.139339 }
            };

            if (fixedDongCoords[name]) {
                centerLat = fixedDongCoords[name].lat;
                centerLng = fixedDongCoords[name].lng;
            } else if (name === '신부동') {
                centerLat -= 0.006; // 아래(남쪽)로 이동
            } else if (name === '성정동') {
                centerLat += 0.002; // 위(북쪽)로 살짝 이동
            }

            clusters.push({
                name: name,
                center: new naver.maps.LatLng(centerLat, centerLng),
                markers: data.markers,
                properties: data.properties,
                count: count
            });
        });

        return clusters;
    }

    /**
     * 구(gu) 기반 클러스터 생성
     */
    createGuClusters(markers) {
        const guMap = new Map();

        markers.forEach(marker => {
            const property = marker.propertyData;
            if (!property) return;

            // gu 필드 사용
            const guName = property.gu || '기타';

            if (!guMap.has(guName)) {
                guMap.set(guName, {
                    name: guName,
                    markers: [],
                    properties: []
                });
            }

            guMap.get(guName).markers.push(marker);
            guMap.get(guName).properties.push(property);
        });

        // 각 구의 중심점 계산 (위아래 오프셋 적용)
        const clusters = [];
        guMap.forEach((data, name) => {
            const latSum = data.markers.reduce((sum, m) => sum + m.getPosition().lat(), 0);
            const lngSum = data.markers.reduce((sum, m) => sum + m.getPosition().lng(), 0);
            const count = data.markers.length;

            let centerLat = latSum / count;
            let centerLng = lngSum / count;

            // ✅ 서북구/동남구 위아래 오프셋 적용 (겹침 방지)
            const latOffset = 0.025; // 위도 오프셋 (약 2.5km)
            if (name.includes('서북구') || name === '서북구') {
                centerLat += latOffset * 0.3; // 서북구: 약간 위로 이동 (기존보다 아래로)
            } else if (name.includes('동남구') || name === '동남구') {
                centerLat -= latOffset; // 동남구: 아래로 이동
            }

            clusters.push({
                name: name,
                center: new naver.maps.LatLng(centerLat, centerLng),
                markers: data.markers,
                properties: data.properties,
                count: count
            });
        });

        return clusters;
    }


    /**
     * 시/도 기반 클러스터 생성
     */
    createSiClusters(markers) {
        const siMap = new Map();

        markers.forEach(marker => {
            const property = marker.propertyData;
            if (!property) return;

            // si 필드에서 축약형 추출 (충청남도 -> 충남, 충청북도 -> 충북 등)
            let siName = property.si || '기타';
            siName = this.getSiShortName(siName);

            if (!siMap.has(siName)) {
                siMap.set(siName, {
                    name: siName,
                    markers: [],
                    properties: []
                });
            }

            siMap.get(siName).markers.push(marker);
            siMap.get(siName).properties.push(property);
        });

        // 각 시/도의 중심점 계산
        const clusters = [];
        siMap.forEach((data, name) => {
            const latSum = data.markers.reduce((sum, m) => sum + m.getPosition().lat(), 0);
            const lngSum = data.markers.reduce((sum, m) => sum + m.getPosition().lng(), 0);
            const count = data.markers.length;

            clusters.push({
                name: name,
                center: new naver.maps.LatLng(latSum / count, lngSum / count),
                markers: data.markers,
                properties: data.properties,
                count: count
            });
        });

        return clusters;
    }

    /**
     * 시/도 이름 축약 (충청남도 -> 충남)
     */
    getSiShortName(siName) {
        const shortNames = {
            '충청남도': '충남',
            '충청북도': '충북',
            '경기도': '경기',
            '경상남도': '경남',
            '경상북도': '경북',
            '전라남도': '전남',
            '전라북도': '전북',
            '강원도': '강원',
            '제주도': '제주',
            '서울특별시': '서울',
            '부산광역시': '부산',
            '대구광역시': '대구',
            '인천광역시': '인천',
            '광주광역시': '광주',
            '대전광역시': '대전',
            '울산광역시': '울산',
            '세종특별자치시': '세종'
        };
        return shortNames[siName] || siName;
    }

    /**
     * 좌표 기반 클러스터 아이콘 생성 (숫자만)
     * @param {number} count - 매물 개수
     * @param {boolean} isSelected - 선택 상태 여부
     */
    createClusterIcon(count, isSelected = false) {
        // ✅ 매물 수량에 비례한 원 크기: 로그 스케일 (1개→32px, 200개→58px)
        // 로그를 쓰는 이유: 1→10 증가와 100→200 증가의 시각적 차이를 자연스럽게 표현
        const MIN_SIZE = 32, MAX_SIZE = 58;
        const logScale = Math.log(Math.max(count, 1) + 1) / Math.log(201); // count=200 기준 정규화
        const size     = Math.round(MIN_SIZE + (MAX_SIZE - MIN_SIZE) * logScale);

        // 폰트도 원 크기에 비례 (11px → 17px)
        const fontSize = Math.round(11 + 6 * logScale);

        // ✅ 색상 설정 (선택 시 반전)
        let bgColor, borderColor, textColor;
        if (isSelected) {
            // 선택됨: 흰색 배경 + 핑크 텍스트
            bgColor = 'rgba(255,255,255,0.95)';
            borderColor = 'rgb(255,118,117)';
            textColor = 'rgb(255,118,117)';
        } else {
            // 기본: 핑크 배경 + 흰색 텍스트
            bgColor = 'rgba(255,118,117,0.8)';
            borderColor = 'rgb(255,118,117)';
            textColor = 'white';
        }

        return `
            <div style="
                width: ${size}px;
                height: ${size}px;
                background: ${bgColor};
                border: 1px solid ${borderColor};
                border-radius: 50%;
                box-shadow: 0 2px 4px rgba(0,0,0,0.5);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                color: ${textColor};
                font-weight: bold;
                font-size: ${fontSize}px;
                transition: all 0.2s;
                position: relative;
                z-index: 100;
            " onmouseover="this.style.transform='scale(1.1)'" 
               onmouseout="this.style.transform='scale(1)'"
               ontouchstart="this.style.transform='scale(1.1)'"
               ontouchend="this.style.transform='scale(1)'">
                ${count}
            </div>
        `;
    }

    /**
     * 지역 기반 클러스터 아이콘 생성 (원형 숫자 배지 + 지역명)
     * @param {string} name - 지역명
     * @param {number} count - 매물 개수
     * @param {string} type - 'dong', 'gu', 'si' 중 하나
     * @param {boolean} isSelected - 선택 상태 여부
     */
    createRegionClusterIcon(name, count, type = 'dong', isSelected = false) {
        // ✅ 색상 설정 (선택 시 반전)
        let countBgColor, countTextColor, nameBgColor, nameTextColor;

        if (isSelected) {
            // 선택됨: 색상 반전 (흰색 배지 + 코랄 배경)
            countBgColor = 'rgb(255, 255, 255)';
            countTextColor = 'rgba(255, 118, 117, 1)';
            nameBgColor = 'rgba(255, 118, 117, 0.9)';
            nameTextColor = 'rgb(255, 255, 255)';
        } else {
            // 기본: 코랄 배지 + 흰색 배경
            countBgColor = 'rgba(255, 118, 117, 0.9)';
            countTextColor = 'rgb(255, 255, 255)';
            nameBgColor = 'rgb(255, 255, 255)';
            nameTextColor = 'rgb(50, 50, 50)';
        }

        // 기본 크기 설정 (동 기준 - 구와 동일한 크기)
        let badgeHeight = 32;
        let fontSize = 14;
        let countFontSize = 14;

        // 타입에 따른 크기 조정
        if (type === 'gu') {
            badgeHeight = 32;
            fontSize = 14;
            countFontSize = 14;
        } else if (type === 'si') {
            badgeHeight = 36;
            fontSize = 15;
            countFontSize = 15;
        }

        // 숫자 자릿수에 따른 배지 너비 계산 (1자리: 원형, 2자리+: 타원형)
        const countStr = String(count);
        const digitCount = countStr.length;
        let badgeWidth;
        if (digitCount === 1) {
            badgeWidth = badgeHeight; // 원형
        } else {
            badgeWidth = badgeHeight + (digitCount - 1) * 8; // 타원형
        }

        return `
            <div style="
                display: inline-flex;
                flex-direction: row;
                align-items: center;
                height: ${badgeHeight}px;
                background: ${nameBgColor};
                border-radius: ${badgeHeight / 2}px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.5);
                cursor: pointer;
                padding-left: 0;
                padding-right: 10px;
                position: relative;
                z-index: 100;
            ">
                <span style="
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-width: ${badgeWidth}px;
                    height: ${badgeHeight}px;
                    background: ${countBgColor};
                    color: ${countTextColor};
                    font-size: ${countFontSize}px;
                    font-weight: bold;
                    border-radius: ${badgeHeight / 2}px;
                    margin-right: 6px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
                ">${count}</span>
                <span style="
                    color: ${nameTextColor};
                    font-size: ${fontSize}px;
                    font-weight: 500;
                    white-space: nowrap;
                ">${name}</span>
            </div>
        `;
    }

    /**
     * 줌 레벨에 따른 마커 표시 (항상 클러스터링 사용)
     */
    updateMarkersByZoom() {
        const currentZoom = this.mapManager.map.getZoom();
        console.log(`🔍 현재 줌 레벨: ${currentZoom} - 항상 클러스터링 사용`);

        // 모든 줌 레벨에서 클러스터 마커 표시
        this.showClusteredMarkers();
    }

    /**
     * 클러스터 마커들 표시 (줌 레벨에 따라 방식 전환)
     */
    showClusteredMarkers() {
        const currentZoom = this.mapManager.map.getZoom();

        // 기존 클러스터 마커들 제거
        this.hideClusterMarkers();

        // 먼저 모든 개별 마커 숨김
        if (this.mapManager.markerManager && this.mapManager.markerManager.markers) {
            this.mapManager.markerManager.markers.forEach(marker => {
                if (marker && marker.setMap) {
                    marker.setMap(null);
                    marker.setVisible(false);
                }
            });
        }

        // 줌 레벨에 따라 클러스터링 방식 결정
        if (currentZoom <= 10) {
            // 줌 8~10: 시/도 기반 클러스터링 (충남)
            console.log('🌏 시/도 기반 클러스터링 (줌 8~10)');
            this.showRegionClusteredMarkers('si');
        } else if (currentZoom <= 12) {
            // 줌 11~12: 구 기반 클러스터링 (서북구, 동남구)
            console.log('🏙️ 구 기반 클러스터링 (줌 11~12)');
            this.showRegionClusteredMarkers('gu');
        } else if (currentZoom <= 14) {
            // 줌 13~14: 동 기반 클러스터링 (두정동, 성정동 등)
            console.log('🏘️ 동 기반 클러스터링 (줌 13~14)');
            this.showRegionClusteredMarkers('dong');
        } else {
            // 줌 15 이상: 좌표 기반 클러스터링
            console.log('🔗 좌표 기반 클러스터링 (줌 15+)');
            this.showCoordinateClusteredMarkers();
        }
    }

    /**
     * 좌표 기반 클러스터 마커 표시 (기존 방식)
     */
    showCoordinateClusteredMarkers() {
        const currentZoom = this.mapManager.map.getZoom();
        const clusters = this.createClusters(this.mapManager.markerManager.markers);

        console.log(`📍 줌 레벨: ${currentZoom}, 좌표 클러스터: ${clusters.length}개`);

        clusters.forEach((cluster, index) => {
            // ✅ 선택 상태 확인
            const isSelected = (this.selectedClusterIndex === index);

            const clusterMarker = new naver.maps.Marker({
                position: cluster.center,
                map: this.mapManager.map,
                icon: {
                    content: this.createClusterIcon(cluster.markers.length, isSelected),
                    anchor: new naver.maps.Point(22, 22)
                },
                title: `${cluster.markers.length}개 매물`,
                zIndex: isSelected ? 200 : 100 // 선택된 마커는 위에 표시
            });

            // 클러스터 클릭 이벤트
            naver.maps.Event.addListener(clusterMarker, 'click', () => {
                // ✅ 같은 클러스터 클릭 시 해제만 하고 종료
                if (this.selectedClusterIndex === index) {
                    console.log('📍 같은 클러스터 다시 클릭 - 선택 해제');
                    this.selectedClusterIndex = null;

                    // 마커 색상 복구
                    this.showClusteredMarkers();

                    // 드래그패널 상단 전체 매물 수량으로 복구 (레이블도 자동 업데이트됨)
                    if (this.mapManager && this.mapManager.updateStats) {
                        this.mapManager.updateStats();
                    }
                    return;
                }

                // ✅ 새 클러스터 선택
                this.selectedClusterIndex = index;

                // ✅ 마커 색상 업데이트를 위해 재렌더링
                this.showClusteredMarkers();

                // ✅ 지도를 클러스터 중심으로 먼저 이동
                this.mapManager.map.setCenter(cluster.center);

                // ✅ 클러스터 매물 codes 수집 (URL 길이 한계로 sessionStorage 경유)
                const codes = cluster.markers
                    .map(function(m) { return m.propertyData && m.propertyData.code; })
                    .filter(Boolean);

                // ✅ 카테고리·역·테마 필터 등 전체 상태 저장 (뒤로가기 시 복원용)
                //    list-page-btn.js의 saveMapStateBeforeListPage()가 모든 필터 상태를 한 번에 저장
                if (window.saveMapStateBeforeListPage) {
                    window.saveMapStateBeforeListPage();
                }

                // ✅ 지도 위치는 클러스터 중심점으로 덮어쓰기 (setCenter 이후 복원 위치 고정)
                const clusterLat = cluster.center.lat();
                const clusterLng = cluster.center.lng();
                const clusterZoom = this.mapManager.map.getZoom();
                localStorage.setItem('lastMapViewLocation', JSON.stringify({
                    latitude: clusterLat,
                    longitude: clusterLng,
                    zoom: clusterZoom,
                    timestamp: Date.now()
                }));
                localStorage.setItem('mapStateBeforeListPage', JSON.stringify({
                    lat: clusterLat,
                    lng: clusterLng,
                    zoom: clusterZoom,
                    timestamp: Date.now()
                }));

                // ✅ codes를 sessionStorage에 저장
                if (codes.length > 0) {
                    sessionStorage.setItem('clusterFilterCodes', codes.join(','));
                }

                // ✅ 목록 페이지로 이동 (슬라이드 업 애니메이션)
                sessionStorage.setItem('navDirection', 'slide-up');
                const coordParams = new URLSearchParams();
                coordParams.set('from_cluster', '1');
                coordParams.set('total_count', String(codes.length));
                coordParams.set('show_sort_tabs', '0');

                /* ✅ label 계산
                   우선순위: 역 > 매물종류 > 테마
                   - 역 선택 중: "두정역" 또는 "두정역 원룸 외"
                   - 역 없음 + 매물종류: "원룸" 또는 "원룸 외" (테마 무시)
                   - 역 없음 + 매물종류 없음 + 테마: "실시간 추천"
                   - 전부 없음: label 파라미터 미설정 → "00개 매물"만 표시 */
                const isStationActive = window.stationManager &&
                    window.stationManager.isStationFilterActive &&
                    window.stationManager.selectedStation;

                /* 매물종류 텍스트 */
                let coordTypeText = '';
                if (window.selectedPropertyCategory && window.selectedPropertyCategory.length > 0) {
                    const cats = window.selectedPropertyCategory;
                    const getTypeName = window.getPropertyTypeDisplayName;
                    if (getTypeName) {
                        coordTypeText = cats.length === 1
                            ? getTypeName(cats[0])
                            : getTypeName(cats[0]) + ' 외';
                    }
                }

                /* 테마 텍스트 (매물종류 없을 때만 사용) */
                let coordThemeText = '';
                if (!coordTypeText) {
                    const getThemeName = window.getThemeDisplayName;
                    if (window.currentThemeFilter) {
                        if (window.currentThemeFilter.label) {
                            coordThemeText = window.currentThemeFilter.label;
                        } else if (window.currentThemeFilter.column && getThemeName) {
                            coordThemeText = getThemeName(window.currentThemeFilter.column);
                        } else if (typeof window.currentThemeFilter === 'string' && getThemeName) {
                            coordThemeText = getThemeName(window.currentThemeFilter);
                        }
                    } else if (window.currentRecommendFilter) {
                        if (window.currentRecommendFilter.label) {
                            coordThemeText = window.currentRecommendFilter.label;
                        } else if (getThemeName) {
                            coordThemeText = getThemeName(window.currentRecommendFilter);
                        }
                    }
                }

                /* 최종 레이블 조합 */
                let coordLabelText = '';
                if (isStationActive) {
                    /* 역 선택 중: 역명 + 매물종류 (테마 무시) */
                    coordLabelText = window.stationManager.selectedStation.name;
                    if (coordTypeText) coordLabelText += ' ' + coordTypeText;
                } else if (coordTypeText) {
                    coordLabelText = coordTypeText;
                } else if (coordThemeText) {
                    coordLabelText = coordThemeText;
                }

                if (coordLabelText) {
                    coordParams.set('label', coordLabelText);
                }

                window.location.href = '/map-list?' + coordParams.toString();
            });

            this.clusterMarkers.push(clusterMarker);
        });

        console.log(`✅ 총 ${this.clusterMarkers.length}개 좌표 클러스터 마커 표시 완료`);
    }

    /**
     * 지역 기반 클러스터 마커 표시 (동/구/시 공통)
     * @param {string} type - 'dong', 'gu', 'si' 중 하나
     */
    showRegionClusteredMarkers(type) {
        const currentZoom = this.mapManager.map.getZoom();
        let clusters;

        // 타입에 따른 클러스터 생성
        switch (type) {
            case 'si':
                clusters = this.createSiClusters(this.mapManager.markerManager.markers);
                break;
            case 'gu':
                clusters = this.createGuClusters(this.mapManager.markerManager.markers);
                break;
            case 'dong':
            default:
                clusters = this.createDongClusters(this.mapManager.markerManager.markers);
                break;
        }

        console.log(`📍 줌 레벨: ${currentZoom}, ${type} 클러스터: ${clusters.length}개`);

        clusters.forEach(cluster => {
            // ✅ 선택 상태 확인 (Set.has()로 다중 선택 지원)
            const isSelected = (type === 'dong' && this.selectedDongNames.has(cluster.name));

            // ✅ 매물 종류 필터와 전체필터, 테마필터를 모두 적용하여 수량 계산
            let displayCount = cluster.count;
            let filteredProperties = cluster.properties || [];
            const currentCategory = window.appManager?.mapManager?.currentCategory;
            const fullFilterParams = window.appManager?.mapManager?.fullFilterParams;
            const themeFilterParams = window.appManager?.mapManager?.themeFilterParams;

            // 카테고리 필터 적용
            if (currentCategory && Array.isArray(currentCategory) && currentCategory.length > 0 && cluster.properties) {
                filteredProperties = filteredProperties.filter(property => {
                    return currentCategory.includes(String(property.category));
                });
            }

            // ✅ 전체필터 적용 (선택된 동이든 아니든 모두 적용)
            if (fullFilterParams && Object.keys(fullFilterParams).length > 0) {
                filteredProperties = this.applyFullFilterToClusterProperties(filteredProperties, fullFilterParams);
            }

            // ✅ 테마필터는 API에서 이미 적용되어 있으므로 클라이언트에서 다시 적용하지 않음
            // (cluster.properties는 이미 테마 필터가 적용된 API 응답에서 생성됨)

            displayCount = filteredProperties.length;

            // ✅ 선택된 동이면 캐시 데이터 업데이트 (필터 변경 시 최신 필터링 결과 반영)
            if (isSelected) {
                this._dongClusterData.set(cluster.name, {
                    name: cluster.name,
                    properties: filteredProperties,
                    count: displayCount
                });
            }

            const clusterMarker = new naver.maps.Marker({
                position: cluster.center,
                map: this.mapManager.map,
                icon: {
                    content: this.createRegionClusterIcon(cluster.name, displayCount, type, isSelected),
                    anchor: new naver.maps.Point(35, 25)
                },
                title: `${cluster.name} ${displayCount}개 매물`,
                zIndex: isSelected ? 200 : 100 // 선택된 마커는 위에 표시
            });

            // 클러스터 클릭 이벤트
            naver.maps.Event.addListener(clusterMarker, 'click', () => {
                // ✅ 동 클러스터인 경우 현재 줌 레벨 유지 + 중앙 배치 + 경계 표시
                if (type === 'dong') {
                    // ✅ 이미 선택된 동을 다시 클릭하면 토글 해제 (다중 선택 지원)
                    if (this.selectedDongNames.has(cluster.name)) {
                        console.log(`🏠 ${cluster.name} 선택 해제 (토글)`);
                        this.selectedDongNames.delete(cluster.name);
                        this._dongClusterData.delete(cluster.name);

                        if (this.selectedDongNames.size === 0) {
                            // ✅ 모든 동 선택 해제 → 전체 초기화
                            window.currentDongSearch = null;
                            window.currentLocationSearch = null;
                            if (window.dongBoundaryManager) {
                                window.dongBoundaryManager.clearBoundary();
                            }
                            this.showClusteredMarkers();
                            if (this.mapManager && this.mapManager.updateStats) {
                                this.mapManager.updateStats();
                                console.log(`📊 전체 화면 매물 수량으로 복구 (updateStats)`);
                            }
                            const labelElement = document.getElementById('propertyLabel');
                            if (labelElement) {
                                labelElement.textContent = '전체 ';
                                labelElement.style.display = 'inline';
                                console.log('📌 패널 레이블 강제 업데이트: 전체');
                            }
                        } else {
                            // ✅ 아직 선택된 동이 남아 있으면 합산 상태 업데이트
                            this._updateMultiDongState();
                        }
                        return;
                    }

                    // ✅ 지도 이동 플래그 설정 (상태 초기화 방지)
                    window.isLocationSearchMapMove = true;



                    // ✅ 동 중심 이동: 1개 선택 → 해당 동 경계 중심, 2개 이상 → 합산 영역 중심
                    let mapCenter = cluster.center;
                    if (window.dongBoundaryManager) {
                        // ✅ 클릭 시점에 기존 선택된 동(들) + 현재 클릭한 동 합산하여 중심 계산
                        // (cluster.name은 아직 Set에 추가되기 전이므로 명시적으로 포함)
                        const allNamesForCenter = [...Array.from(this.selectedDongNames), cluster.name];
                        if (allNamesForCenter.length > 1) {
                            // ✅ 2개 이상: 합산 바운딩 박스 중심점 사용
                            const combinedCenter = window.dongBoundaryManager.getCombinedCenter(allNamesForCenter);
                            if (combinedCenter) {
                                mapCenter = new naver.maps.LatLng(combinedCenter.lat, combinedCenter.lng);
                                console.log(`📍 다중 동 합산 중심으로 이동: [${allNamesForCenter.join(', ')}]`);
                            }
                        } else {
                            // ✅ 1개: 해당 동 경계 중심점 (기존 방식 유지)
                            const boundaryCenter = window.dongBoundaryManager.getBoundaryCenter(cluster.name);
                            if (boundaryCenter) {
                                mapCenter = new naver.maps.LatLng(boundaryCenter.lat, boundaryCenter.lng);
                            }
                        }
                    }

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

                    // 픽셀 오프셋을 위도 오프셋으로 변환
                    const projection = this.mapManager.map.getProjection();
                    const centerPoint = projection.fromCoordToOffset(mapCenter);
                    const offsetPoint = new naver.maps.Point(centerPoint.x, centerPoint.y - pixelOffset);
                    const adjustedCenter = projection.fromOffsetToCoord(offsetPoint);

                    this.mapManager.map.setCenter(adjustedCenter);
                    console.log(`📍 동 중심 이동: ${cluster.name}, 오프셋=${pixelOffset}px (${window.browserConfig.platform})`);

                    // ✅ 카테고리 필터, 전체필터, 테마필터 적용하여 필터링된 매물 계산
                    let filteredDongProperties = cluster.properties || [];
                    const currentCategory = window.appManager?.mapManager?.currentCategory;
                    const fullFilterParams = window.appManager?.mapManager?.fullFilterParams;
                    const themeFilterParams = window.appManager?.mapManager?.themeFilterParams;

                    // 카테고리 필터 적용
                    if (currentCategory && Array.isArray(currentCategory) && currentCategory.length > 0) {
                        filteredDongProperties = filteredDongProperties.filter(property => {
                            return currentCategory.includes(String(property.category));
                        });
                        console.log(`📊 ${cluster.name} 카테고리 필터 적용: ${cluster.properties?.length || 0} → ${filteredDongProperties.length}개`);
                    }

                    // 전체필터 적용
                    if (fullFilterParams && Object.keys(fullFilterParams).length > 0) {
                        filteredDongProperties = this.applyFullFilterToClusterProperties(filteredDongProperties, fullFilterParams);
                        console.log(`📊 ${cluster.name} 전체필터 적용 후: ${filteredDongProperties.length}개`);
                    }

                    // ✅ 테마필터는 API에서 이미 적용됨 (cluster.properties는 필터된 데이터)

                    const filteredCount = filteredDongProperties.length;

                    // ✅ 클러스터 데이터 캐시에 저장 (다중 선택 상태 관리용)
                    this._dongClusterData.set(cluster.name, {
                        name: cluster.name,
                        properties: filteredDongProperties,
                        count: filteredCount
                    });

                    // ✅ Set에 추가 (이미 있어도 중복 무시)
                    this.selectedDongNames.add(cluster.name);

                    // ✅ 다중 선택 상태 전체 업데이트 (경계선, 레이블, currentDongSearch 갱신 + 마커 재렌더링)
                    this._updateMultiDongState();

                    // ✅ 헤더 깜박임 효과
                    const headerTop = document.querySelector('.list-header-top');
                    if (headerTop) {
                        headerTop.classList.remove('ripple');
                        // reflow 강제 트리거
                        void headerTop.offsetWidth;
                        headerTop.classList.add('ripple');
                        // 애니메이션 종료 후 클래스 제거
                        setTimeout(() => {
                            headerTop.classList.remove('ripple');
                        }, 600);
                    }

                    // ✅ 해당 동 매물 카드를 패널에 로드 (페이지네이션 적용)
                    if (window.appManager && window.appManager.loadPropertiesInPanel) {

                        // ✅ 필터링된 매물 사용 (위에서 계산된 filteredDongProperties)
                        let dongProperties = filteredDongProperties;
                        console.log(`📊 ${cluster.name} 초기 필터링 후: ${dongProperties.length}개`);

                        // ✅ loadPropertiesInPanel을 사용하여 페이지네이션 적용
                        const loadWithPagination = (properties) => {
                            if (properties.length > 0) {
                                // ✅ loadPropertiesInPanel에 dongProperties 전달
                                window.appManager.loadPropertiesInPanel(false, null, properties);
                                console.log(`✅ ${cluster.name} 매물 로드 (페이지네이션 적용): ${properties.length}개`);
                            } else {
                                const listContent = document.getElementById('listContent');
                                if (listContent) {
                                    listContent.innerHTML = `
                                        <div class="list-empty">
                                            <div class="list-empty-icon">🏠</div>
                                            <div class="list-empty-title">${cluster.name}에 매물이 없습니다</div>
                                        </div>
                                    `;
                                }
                            }
                        };

                        // ✅ Light Mode 체크: title이나 picname1이 없으면 상세 데이터 로드 필요
                        const firstProp = dongProperties[0];
                        if (firstProp && (!firstProp.title || !firstProp.picname1)) {
                            console.log(`⚡ Light Mode 데이터 감지 - ${cluster.name} 상세 정보 로드 요청`);
                            this.mapManager.loadDongProperties(cluster.name).then(fullProperties => {
                                console.log(`📡 API 응답: ${fullProperties?.length || 0}개`);

                                // API에서 필터링된 결과가 이미 반환됨
                                let filteredFullProperties = fullProperties || [];

                                // 클라이언트에서 한번 더 카테고리 필터
                                if (currentCategory && Array.isArray(currentCategory) && currentCategory.length > 0 && filteredFullProperties.length > 0) {
                                    const beforeFilter = filteredFullProperties.length;
                                    filteredFullProperties = filteredFullProperties.filter(p =>
                                        currentCategory.includes(String(p.category))
                                    );
                                    console.log(`📊 카테고리 필터: ${beforeFilter} → ${filteredFullProperties.length}개`);
                                }

                                if (fullFilterParams && Object.keys(fullFilterParams).length > 0 && filteredFullProperties.length > 0) {
                                    const beforeFilter = filteredFullProperties.length;
                                    filteredFullProperties = this.applyFullFilterToClusterProperties(filteredFullProperties, fullFilterParams);
                                    console.log(`📊 전체필터: ${beforeFilter} → ${filteredFullProperties.length}개`);
                                }

                                // ✅ 페이지네이션 적용하여 로드
                                if (filteredFullProperties.length > 0) {
                                    // ✅ Light Mode 상세 데이터 로드 완료 → 캐시 업데이트 후 합산 재계산
                                    this._dongClusterData.set(cluster.name, {
                                        name: cluster.name,
                                        properties: filteredFullProperties,
                                        count: filteredFullProperties.length
                                    });
                                    this._buildMultiDongState(); // 합산 상태 재업데이트 (마커 재렌더링 없이)
                                    loadWithPagination(filteredFullProperties);
                                } else if (dongProperties.length > 0) {
                                    console.log(`⚠️ API 0개, fallback 사용: ${dongProperties.length}개`);
                                    loadWithPagination(dongProperties);
                                } else {
                                    loadWithPagination([]);
                                }
                            });
                        } else {
                            // 이미 Full Data가 있으면 바로 페이지네이션 로드
                            console.log(`✅ Full Data 직접 로드 (페이지네이션): ${dongProperties.length}개`);
                            loadWithPagination(dongProperties);
                        }
                    }

                    // ✅ 히스토리에 동 선택 상태 추가 (뒤로가기 시 해제용)
                    // 마커 색상 반전·경계선·레이블은 위의 _updateMultiDongState()에서 처리
                    history.pushState({ dongSelected: true, dongName: cluster.name }, '', '');
                    console.log('📌 히스토리에 동 선택 상태 추가');

                    // 지도 이동 완료 후 플래그 해제
                    setTimeout(() => {
                        window.isLocationSearchMapMove = false;
                    }, 500);

                    console.log(`✅ ${cluster.name} ${filteredCount}개 매물 (필터 적용, 패널 열지 않음)`);
                } else {
                    // ✅ 시/구 클러스터 클릭 → 매물 목록 페이지로 이동 (패널 대신 전용 목록 페이지)
                    let filteredGuSiProperties = cluster.properties || [];
                    const guSiCategory = window.appManager?.mapManager?.currentCategory;
                    const guSiFullFilter = window.appManager?.mapManager?.fullFilterParams;

                    /* 카테고리 필터 적용 */
                    if (guSiCategory && Array.isArray(guSiCategory) && guSiCategory.length > 0) {
                        filteredGuSiProperties = filteredGuSiProperties.filter(p =>
                            guSiCategory.includes(String(p.category))
                        );
                    }
                    /* 전체필터 적용 */
                    if (guSiFullFilter && Object.keys(guSiFullFilter).length > 0) {
                        filteredGuSiProperties = this.applyFullFilterToClusterProperties(filteredGuSiProperties, guSiFullFilter);
                    }
                    /* 테마필터는 API에서 이미 적용됨 */

                    const guSiFilteredCount = filteredGuSiProperties.length;

                    /* 매물 코드 목록 추출 */
                    const codes = filteredGuSiProperties
                        .map(p => p.code)
                        .filter(Boolean);

                    console.log(`📋 ${cluster.name} 목록 페이지 이동: ${guSiFilteredCount}개 매물`);

                    /* 지도 상태 저장 (뒤로가기 시 복원용) */
                    if (typeof window.saveMapStateBeforeListPage === 'function') {
                        window.saveMapStateBeforeListPage();
                    }

                    /* ✅ codes를 sessionStorage에 저장 (URL 길이 한계 회피)
                       URL에 직접 포함하면 4094바이트를 초과할 수 있으므로
                       sessionStorage를 통해 전달하고 목록 페이지에서 읽음 */
                    if (codes.length > 0) {
                        sessionStorage.setItem('clusterFilterCodes', codes.join(','));
                    }

                    /* 슬라이드 방향 설정 (아래→위) */
                    sessionStorage.setItem('navDirection', 'slide-up');

                    /* 목록 페이지로 이동 (codes는 sessionStorage 경유) */
                    const params = new URLSearchParams();
                    params.set('from_cluster', '1');   /* sessionStorage에서 codes 읽도록 신호 */
                    params.set('show_sort_tabs', '0');

                    /* ✅ label: 지역명 + 매물종류 조합
                       매물종류 선택 시 → "충남 원룸" / "서북구 원룸 외"
                       미선택 시 → "충남" / "서북구" (기존 동일) */
                    let guSiLabelText = cluster.name;
                    if (window.selectedPropertyCategory && window.selectedPropertyCategory.length > 0) {
                        const cats = window.selectedPropertyCategory;
                        const getTypeName = window.getPropertyTypeDisplayName;
                        if (getTypeName) {
                            if (cats.length === 1) {
                                guSiLabelText += ' ' + getTypeName(cats[0]);
                            } else {
                                guSiLabelText += ' ' + getTypeName(cats[0]) + ' 외';
                            }
                        }
                    }
                    params.set('label', guSiLabelText);
                    params.set('total_count', String(guSiFilteredCount));

                    window.location.href = '/map-list?' + params.toString();
                }
            });

            this.clusterMarkers.push(clusterMarker);
        });

        // ✅ 선택된 동 중 클러스터가 없는 동은 매물 0개로 캐시 업데이트
        // (전체필터/테마필터 적용으로 해당 동의 매물이 모두 제거된 경우 _dongClusterData가 갱신되지 않아 이전 값이 남는 버그 수정)
        if (type === 'dong' && this.selectedDongNames.size > 0) {
            const clusteredDongNames = new Set(clusters.map(c => c.name));
            this.selectedDongNames.forEach(name => {
                if (!clusteredDongNames.has(name)) {
                    // 해당 동의 클러스터가 없음 → 필터 조건에 맞는 매물 없음
                    this._dongClusterData.set(name, { name, properties: [], count: 0 });
                    console.log(`📊 ${name}: 필터 적용 후 매물 없음 → 캐시 0개로 업데이트`);
                }
            });
        }

        // ✅ 동 다중 선택 상태에서 필터 변경 시 합산 상태 재계산 (마커 재렌더링 없이)
        if (type === 'dong' && this.selectedDongNames.size > 0) {
            this._buildMultiDongState();
        }

        // ✅ 동 선택 복원: 마커 렌더 후 경계선 + 패널 수량 업데이트
        if (this._pendingDongRestore && this._pendingDongRestore.size > 0 && type === 'dong') {
            const pendingNames = this._pendingDongRestore;
            this._pendingDongRestore = null; // 한 번만 실행
            // dongBoundaryManager 초기화 대기 후 다중 경계선 표시
            setTimeout(() => {
                if (window.dongBoundaryManager) {
                    window.dongBoundaryManager.showBoundaries(Array.from(pendingNames), this.mapManager.map);
                }
                // 패널 레이블/수량 업데이트 (currentDongSearch 기반)
                if (this.mapManager && this.mapManager.updateStats) {
                    this.mapManager.updateStats();
                }
                console.log(`✅ 동 선택 복원 완료: ${Array.from(pendingNames).join(', ')}`);
            }, 300);
        }

        console.log(`✅ 총 ${this.clusterMarkers.length}개 ${type} 클러스터 마커 표시 완료`);
    }

    /**
     * 클러스터 마커들 숨기기
     */
    hideClusterMarkers() {
        this.clusterMarkers.forEach(marker => {
            marker.setMap(null);
        });
        this.clusterMarkers = [];
    }

    /**
     * ✅ 동 선택 (색상 반전 효과 적용)
     * @param {string} dongName - 선택할 동 이름 (null이면 해제)
     */
    selectDong(dongName) {
        // ✅ 다중 선택 토글 (Set.add/delete)
        if (this.selectedDongNames.has(dongName)) {
            this.selectedDongNames.delete(dongName);
            this._dongClusterData.delete(dongName);
        } else {
            this.selectedDongNames.add(dongName);
        }

        console.log(`🏠 선택된 동: ${Array.from(this.selectedDongNames).join(', ') || '(없음)'}`);

        // 마커 색상 업데이트를 위해 클러스터 마커 재생성
        this.showClusteredMarkers();

        // 지도 이동 완료 후 플래그 해제
        setTimeout(() => {
            window.isLocationSearchMapMove = false;
        }, 500);
    }

    /**
     * ✅ 선택된 동 전체 해제 (드래그·줌 변경 시 호출)
     */
    clearSelectedDong() {
        // ✅ 다중 선택 전체 초기화
        this.selectedDongNames.clear();
        this._dongClusterData.clear();
        window.currentDongSearch = null;
        if (window.dongBoundaryManager) {
            window.dongBoundaryManager.clearBoundary();
        }
        this.showClusteredMarkers();
    }

    /**
     * ✅ 다중 동 선택 상태 계산 — 마커 재렌더링 없이 상태만 갱신
     * (경계선, currentDongSearch, 패널 레이블 업데이트)
     * showRegionClusteredMarkers 내부에서도 호출되므로 showClusteredMarkers 호출 금지
     */
    _buildMultiDongState() {
        const names = Array.from(this.selectedDongNames);
        if (names.length === 0) return;

        // ✅ 선택된 모든 동의 매물 합산
        const allProperties = [];
        names.forEach(name => {
            const data = this._dongClusterData.get(name);
            if (data && data.properties) {
                allProperties.push(...data.properties);
            }
        });

        // ✅ currentDongSearch 갱신 (locationName 하위호환 + locationNames 다중 배열)
        window.currentDongSearch = {
            locationName: names[0],      // 하위호환용 첫 번째 동 이름
            locationNames: names,         // ✅ 다중 동 전체 배열
            count: allProperties.length,
            filteredCount: allProperties.length,
            properties: allProperties
        };

        // ✅ 선택된 모든 동의 경계선 표시
        if (window.dongBoundaryManager) {
            window.dongBoundaryManager.showBoundaries(names, this.mapManager.map);
        }

        // ✅ 패널 레이블 업데이트 ("두정동" 또는 "두정동 외 1개")
        const labelText = names.length > 1
            ? `${names[0]} 외 ${names.length - 1}개`
            : names[0];
        if (typeof StationManager !== 'undefined' && StationManager.updatePropertyCountWithLocation) {
            StationManager.updatePropertyCountWithLocation(allProperties.length, labelText);
        }

        console.log(`✅ 다중 동 상태 계산: [${names.join(', ')}] ${allProperties.length}개 매물`);
    }

    /**
     * ✅ 다중 동 선택 상태 전체 업데이트 (상태 갱신 + 마커 재렌더링)
     * 클릭 핸들러·해제 토글에서 호출
     * → showClusteredMarkers() 내부에서 _buildMultiDongState()가 자동 호출됨
     */
    _updateMultiDongState() {
        // 마커 재렌더링 트리거 → showRegionClusteredMarkers 끝에서 _buildMultiDongState 자동 호출
        this.showClusteredMarkers();
    }

    /**
     * ✅ 필터링된 클러스터의 매물을 패널에 표시
     * @param {Object} cluster - 필터링된 클러스터 객체
     */
    loadPropertiesInPanelFromCluster(cluster) {
        const listContent = document.getElementById('listContent');
        if (!listContent || !window.appManager) return;

        const properties = cluster.properties || [];

        if (properties.length > 0) {
            // 거리순 정렬
            const mapCenter = this.mapManager.map.getCenter();
            const centerLat = mapCenter.lat();
            const centerLng = mapCenter.lng();

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

            const sortedProperties = properties.map(p => {
                const lat = parseFloat(p.lat);
                const lng = parseFloat(p.lng);
                return { ...p, _distance: calculateDistance(centerLat, centerLng, lat, lng) };
            }).sort((a, b) => a._distance - b._distance);

            const cards = sortedProperties.map(p => window.appManager.createPropertyCard(p)).join('');
            listContent.innerHTML = cards;

            // 헤더 수량 업데이트
            const countElement = document.getElementById('propertyCount');
            if (countElement) {
                countElement.textContent = sortedProperties.length;
            }

            // 하트 상태 초기화
            if (typeof initLikedHearts === 'function') {
                initLikedHearts();
            }

            console.log(`✅ 구/시 클러스터 패널 표시: ${sortedProperties.length}개 매물`);
        } else {
            listContent.innerHTML = `
                <div class="list-empty">
                    <div class="list-empty-icon">🏠</div>
                    <div class="list-empty-title">${cluster.name}에 조건에 맞는 매물이 없습니다</div>
                </div>
            `;
        }
    }

    /**
     * ✅ 클러스터 매물에 전체필터 적용
     * @param {Array} properties - 필터링할 매물 목록
     * @param {Object} filterParams - 전체필터 파라미터
     * @returns {Array} 필터링된 매물 목록
     */
    applyFullFilterToClusterProperties(properties, filterParams) {
        if (!properties || properties.length === 0 || !filterParams) {
            return properties;
        }

        return properties.filter(property => {
            const listingScope = filterParams.listing_scope || 'recent';
            const propertyStatus = filterParams.property_status || 'available';
            const propertyState = property.state || '';
            const propertyContract = property.contract || '';

            if (propertyState !== '등록') return false;

            if (listingScope !== 'all_registered') {
                const ldateRaw = property.ldate;
                const ldate = ldateRaw ? new Date(String(ldateRaw).replace(' ', 'T')) : null;
                const threshold = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
                if (!(ldate instanceof Date) || Number.isNaN(ldate.getTime()) || ldate < threshold) {
                    return false;
                }

                if (propertyStatus !== 'all_status') {
                    if (!(propertyContract === '' || propertyContract === '계약가능')) {
                        return false;
                    }
                }
            }

            // 거래 유형 필터
            if (filterParams.transaction_type) {
                const type = filterParams.transaction_type;
                if (type === '매매' && !(property.maemae_money > 0)) return false;
                if (type === '전세' && !(property.jen_money > 0)) return false;
                if (type === '월세' && !(property.month_money > 0)) return false;
            }

            // 보증금 필터
            if (filterParams.deposit_min !== undefined && filterParams.deposit_min > 0) {
                const deposit = property.security_money || property.jen_money || 0;
                if (deposit < filterParams.deposit_min) return false;
            }
            if (filterParams.deposit_max !== undefined && filterParams.deposit_max > 0) {
                const deposit = property.security_money || property.jen_money || 0;
                if (deposit > filterParams.deposit_max) return false;
            }

            // 월세 필터
            if (filterParams.monthly_min !== undefined && filterParams.monthly_min > 0) {
                if ((property.month_money || 0) < filterParams.monthly_min) return false;
            }
            if (filterParams.monthly_max !== undefined && filterParams.monthly_max > 0) {
                if ((property.month_money || 0) > filterParams.monthly_max) return false;
            }

            // 관리비 필터
            if (filterParams.management_max !== undefined && filterParams.management_max > 0) {
                const publicMoney = property.public_money ? property.public_money / 10000 : 0;
                if (publicMoney > filterParams.management_max) return false;
            }

            // 층 필터
            if (filterParams.floor_type) {
                const nowFloor = parseInt(property.now_floor) || 0;
                const totalFloor = parseInt(property.total_floor) || 1;
                const floorType = filterParams.floor_type;

                if (floorType === '1층' && nowFloor !== 1) return false;
                if (floorType === '2층이상' && nowFloor < 2) return false;
                if (floorType === '최상층' && nowFloor !== totalFloor) return false;
                if (floorType === '반지하/옥탑' && nowFloor > 0 && nowFloor < totalFloor) return false;
            }

            // 주차 필터
            if (filterParams.parking === true || filterParams.parking === 'true') {
                const parking = property.parking || '';
                if (!parking || parking === '불가' || parking === '0' || parking === '') return false;
            }

            // 엘리베이터 필터
            if (filterParams.elevator === true || filterParams.elevator === 'true') {
                // etc1이 엘리베이터 필드
                if (!property.etc1 || property.etc1 === '0' || property.etc1 === 0) return false;
            }

            // ✅ 기타사항(options) 필터
            if (filterParams.options) {
                const options = filterParams.options.split(',');

                // 테라스 필터: title에 "테라스" 포함 여부 확인
                if (options.includes('terrace')) {
                    const title = property.title || '';
                    if (!title.includes('테라스')) return false;
                }

                // 남향 필터
                if (options.includes('south')) {
                    const aspect = property.aspect || '';
                    if (!aspect.includes('남향')) return false;
                }

                // 엘리베이터 필터 (options에서도 처리)
                if (options.includes('elevator')) {
                    if (!property.etc1 || property.etc1 === '0' || property.etc1 === 0) return false;
                }

                // 주차차단기 필터
                if (options.includes('parking_gate')) {
                    if (!property.etc4 || property.etc4 === '0' || property.etc4 === 0) return false;
                }

                // 드럼세탁기 필터
                if (options.includes('drum_washer')) {
                    if (!property.electron4 || property.electron4 === '0' || property.electron4 === 0) return false;
                }

                // 일반세탁기 필터
                if (options.includes('normal_washer')) {
                    if (!property.electron5 || property.electron5 === '0' || property.electron5 === 0) return false;
                }

                // 도어락 필터
                if (options.includes('door_lock')) {
                    if (!property.security5 || property.security5 === '0' || property.security5 === 0) return false;
                }

                // 인터넷 포함 필터
                if (options.includes('internet_included')) {
                    const publicMoney1 = property.public_money1 || '';
                    if (!publicMoney1.includes('인터넷')) return false;
                }

                // 인터넷 별도 필터
                if (options.includes('internet_separate')) {
                    const publicMoney1 = property.public_money1 || '';
                    if (publicMoney1.includes('인터넷')) return false;
                }
            }

            return true;
        });
    }

    /**
     * ✅ 클러스터 매물에 테마필터 적용
     * @param {Array} properties - 필터링할 매물 목록
     * @param {Object} themeParams - 테마필터 파라미터 (예: {thema: 'thema1,thema2', thema_categories: '...'})
     * @returns {Array} 필터링된 매물 목록
     */
    applyThemeFilterToClusterProperties(properties, themeParams) {
        if (!properties || properties.length === 0 || !themeParams) {
            return properties;
        }

        // ✅ themeParams.thema에서 컬럼명 추출 (쉼표로 구분된 문자열)
        let themeColumns = [];

        if (themeParams.thema) {
            // "thema1" 또는 "thema1,thema2,good6" 형태
            themeColumns = themeParams.thema.split(',').map(s => s.trim()).filter(s => s);
        }

        // 기존 방식도 지원 (직접 thema1, good6 등이 키로 들어온 경우)
        Object.keys(themeParams).forEach(key => {
            if (key.match(/^(thema\d+|good\d+)$/)) {
                if (!themeColumns.includes(key)) {
                    themeColumns.push(key);
                }
            }
        });

        if (themeColumns.length === 0) {
            console.log('🎨 테마 필터 컬럼 없음 - 필터링 건너뜀');
            return properties;
        }

        console.log(`🎨 테마 필터 적용: ${themeColumns.join(', ')} (${properties.length}개 중)`);

        const filtered = properties.filter(property => {
            // 모든 테마 조건을 만족해야 함 (AND 조건)
            return themeColumns.every(column => {
                const value = property[column];
                // 해당 컬럼이 1이거나 'Y' 또는 truthy이면 통과
                return value === 1 || value === '1' || value === 'Y' || value === 'y' || value === true;
            });
        });

        console.log(`🎨 테마 필터 적용 결과: ${filtered.length}개`);
        return filtered;
    }
}
