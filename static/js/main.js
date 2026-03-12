/**
 * 메인 애플리케이션 관리자
 * 전체 애플리케이션의 초기화, 상태 관리, 모듈 간 통신을 담당
 어도비 color 조합
 -메인 컬러: #ff7675(255,118,117), 서브 컬러: 
 */



class AppManager {
    constructor() {
        this.mapManager = null;
        this.listManager = null;
        this.detailManager = null;
        this.historyManager = null;
        this.isInitialized = false;
        this.isSearchMode = false; // ✅ 검색 모드 플래그
        this.currentState = {
            view: 'map', // 'map', 'list', 'detail'
            selectedProperty: null,
            filters: {},
            searchQuery: ''
        };
        this.paginationState = {
            currentPage: 1,
            pageSize: 20,
            totalCount: 0,
            allProperties: [],
            isLoading: false,
            dongMode: false // ✅ 동 선택 모드 플래그
        };
        this.intersectionObserver = null; // ✅ 이 줄 추가
    }

    /**
     * 애플리케이션 초기화
     */
    async init() {
        try {
            console.log('🚀 AppManager 초기화 시작...');

            // ✅ [핵심] 지도 초기화 전에 역 상태 복원 플래그 먼저 설정
            this._checkStationRestoreFlag();

            // 히스토리 매니저 초기화
            this.historyManager = new HistoryManager(this);
            this.historyManager.init();

            // 지도 매니저 초기화
            this.mapManager = new MapManager(this);
            await this.mapManager.init();

            // 목록 매니저 초기화
            this.listManager = new ListManager(this);
            this.listManager.init();

            // 상세 매니저 초기화
            this.detailManager = new DetailManager(this);
            this.detailManager.init();



            // 초기 데이터 로드
            await this.loadInitialData();

            this.isInitialized = true;
            console.log('✅ AppManager 초기화 완료');

            // ✅ URL 파라미터로 디버그 모드 활성화 (?debug=1)
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('debug') === '1' && this.mapManager) {
                setTimeout(() => {
                    this.mapManager.showDebugButton();
                    console.log('🔍 디버그 모드 활성화 (URL 파라미터)');
                }, 1000);
            }

            // 로딩 인디케이터 즉시 숨김
            this.hideLoadingIndicator();

        } catch (error) {
            console.error('❌ AppManager 초기화 실패:', error);
            throw error;
        }
    }

    /**
     * ✅ 역/클러스터 상태 복원 플래그 체크 (지도 초기화 전에 호출)
     * 뒤로가기 시 역 선택 또는 클러스터 선택 상태가 있으면 플래그를 먼저 설정하여
     * 지도 loadPropertiesInBounds에서 수량 업데이트를 방지
     */
    _checkStationRestoreFlag() {
        // ✅ 역 상태 복원 플래그 체크
        const savedStationState = localStorage.getItem('stationFilterState');
        if (savedStationState) {
            try {
                const stationState = JSON.parse(savedStationState);
                const MAX_AGE = 5 * 60 * 1000; // 5분

                if (stationState.timestamp && Date.now() - stationState.timestamp > MAX_AGE) {
                    console.log('⏰ 역 선택 상태 만료 (5분 경과) - 삭제');
                    localStorage.removeItem('stationFilterState');
                } else {
                    // ✅ 즉시 복원 플래그 설정 (지도 loadPropertiesInBounds 차단용)
                    window.isRestoringStationFilter = true;
                    console.log('🚇 [AppManager] 역 상태 복원 플래그 설정:', stationState.selectedStation?.name);
                }
            } catch (e) {
                console.error('⚠️ 역 상태 파싱 실패:', e);
                localStorage.removeItem('stationFilterState');
            }
        }

        // ✅ 클러스터 상태 복원 플래그 체크
        const savedClusterState = sessionStorage.getItem('clusterState');
        if (savedClusterState) {
            try {
                const clusterState = JSON.parse(savedClusterState);
                const MAX_AGE = 5 * 60 * 1000; // 5분

                if (clusterState.timestamp && Date.now() - clusterState.timestamp > MAX_AGE) {
                    console.log('⏰ 클러스터 선택 상태 만료 (5분 경과) - 삭제');
                    sessionStorage.removeItem('clusterState');
                } else {
                    // ✅ 즉시 복원 플래그 설정 (지도 loadPropertiesInBounds 차단용)
                    window.isRestoringClusterFilter = true;
                    console.log('📍 [AppManager] 클러스터 상태 복원 플래그 설정:', clusterState.selectedClusterIndex);
                }
            } catch (e) {
                console.error('⚠️ 클러스터 상태 파싱 실패:', e);
                sessionStorage.removeItem('clusterState');
            }
        }
    }

    /**
     * 초기 데이터 로드 - ✅ 최적화: 지도에서 자동 로딩
     */
    async loadInitialData() {
        try {
            console.log('📊 초기 데이터 로드 시작...');

            // ✅ 지도에서 자동으로 로딩하므로 여기서는 아무것도 안함
            console.log('✅ 초기 데이터 로드 완료 (지도에서 처리)');

        } catch (error) {
            console.error('❌ 초기 데이터 로드 실패:', error);
            throw error;
        }
    }


    /**
     * 패널용 매물 목록 로드 - ✅ 페이지네이션 추가
     * @param {boolean} append - true면 기존 목록에 추가, false면 새로 로드
     * @param {Object} cluster - 클러스터 객체 (좌표 클러스터용)
     * @param {Array} dongProperties - 동 선택 시 전달되는 매물 배열
     */
    loadPropertiesInPanel(append = false, cluster = null, dongProperties = null) {
        console.log("LoadPropertiesInPanel");
        console.log('📋 패널용 매물 목록 로드 (페이지:', this.paginationState.currentPage, ')');

        const panelContent = document.getElementById('listContent');
        const panelCount = document.getElementById('propertyCount');

        if (!panelContent) {
            console.error('❌ listContent 요소를 찾을 수 없습니다.');
            return;
        }

        // ✅ 로딩 중이면 중복 호출 방지
        if (this.paginationState.isLoading) {
            console.log('⏳ 이미 로딩 중...');
            return;
        }

        // ✅ dongProperties가 전달된 경우 (동 선택)
        let allProperties = [];
        if (dongProperties && Array.isArray(dongProperties) && dongProperties.length > 0) {
            allProperties = dongProperties;
            console.log(`🏠 동 선택 모드: ${allProperties.length}개 매물 (페이지네이션 적용)`);
        }
        // ✅ MapManager에서 화면에 보이는 매물만 가져오기
        else if (this.mapManager && this.mapManager.map && this.mapManager.properties && this.mapManager.properties.length > 0) {

            // ✅ 관심목록 필터가 켜져있으면 영역 필터링 없이 전체 사용
            if (this.mapManager.isLikedFilterActive) {
                allProperties = this.mapManager.properties;
                console.log(`❤️ 관심목록 모드: 전체 ${allProperties.length}개 매물 표시`);
            } else {
                const bounds = this.mapManager.map.getBounds();
                const sw = bounds.getSW();
                const ne = bounds.getNE();

                // ✅ 상단/하단 UI에 가려지는 영역 제외 (updateStats와 동일 로직)
                const mapDiv = document.getElementById('map');
                const mapHeight = mapDiv ? mapDiv.offsetHeight : window.innerHeight;

                const topUIHeight = 60;    // 상단 검색창/필터 높이 (px)
                const bottomUIHeight = 60; // 하단 드래그 패널 높이 (px)

                const topRatio = topUIHeight / mapHeight;
                const bottomRatio = bottomUIHeight / mapHeight;

                const latRange = ne.lat() - sw.lat();
                const adjustedNeLat = ne.lat() - (latRange * topRatio);     // 상단 제외
                const adjustedSwLat = sw.lat() + (latRange * bottomRatio);  // 하단 제외

                console.log(this.mapManager.properties)
                allProperties = this.mapManager.properties.filter(property => {
                    const lat = parseFloat(property.lat);
                    const lng = parseFloat(property.lng);

                    // ✅ 조정된 위도 범위 사용 (상단/하단 UI 제외 영역)
                    return lat >= adjustedSwLat && lat <= adjustedNeLat &&
                        lng >= sw.lng() && lng <= ne.lng();
                });
                console.log(`📊 화면에 보이는 전체 매물: ${allProperties.length}개 (UI 영역 제외)`);
            }
        } else {
            console.log('⚠️ MapManager에 데이터가 아직 없습니다. 대기 중...');

            setTimeout(() => {
                if (this.mapManager && this.mapManager.properties && this.mapManager.properties.length > 0) {
                    if (!cluster)
                        this.loadPropertiesInPanel();
                    else
                        this.loadPropertiesInPanel(false, cluster);
                } else {
                    panelContent.innerHTML = `
                        <div class="property-list-loading">
                            <p>매물을 불러오는 중...</p>
                        </div>
                    `;
                }
            }, 500);
            return;
        }

        // ✅ 페이지네이션 상태 초기화 (append가 false면 처음부터)
        if (!append) {
            this.paginationState.currentPage = 1;
            // ✅ 동 선택 모드 설정
            this.paginationState.dongMode = (dongProperties && Array.isArray(dongProperties) && dongProperties.length > 0);

            let propertiesToSort;
            if (dongProperties && Array.isArray(dongProperties) && dongProperties.length > 0) {
                // ✅ 동 선택 시: dongProperties 사용
                propertiesToSort = dongProperties;
                console.log(`🏠 동 선택 페이지네이션 초기화: ${propertiesToSort.length}개`);
            } else if (cluster) {
                propertiesToSort = cluster.markers.map(marker => marker.propertyData);
            } else {
                propertiesToSort = allProperties;
            }

            // ✅ 지도 중심에서 가까운 순으로 정렬
            const mapCenter = this.mapManager.map.getCenter();
            const centerLat = mapCenter.lat();
            const centerLng = mapCenter.lng();

            // Haversine 공식을 사용한 거리 계산 함수
            const calculateDistance = (lat1, lng1, lat2, lng2) => {
                const R = 6371; // 지구 반경 (km)
                const dLat = (lat2 - lat1) * Math.PI / 180;
                const dLng = (lng2 - lng1) * Math.PI / 180;
                const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLng / 2) * Math.sin(dLng / 2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
                return R * c;
            };

            // 각 매물에 거리 계산 후 정렬
            propertiesToSort = propertiesToSort.map(property => {
                const lat = parseFloat(property.lat);
                const lng = parseFloat(property.lng);
                const distance = calculateDistance(centerLat, centerLng, lat, lng);
                return { ...property, _distance: distance };
            }).sort((a, b) => a._distance - b._distance);

            this.paginationState.allProperties = propertiesToSort;
            this.paginationState.totalCount = propertiesToSort.length;
            console.log(`📍 지도 중심 (${centerLat.toFixed(5)}, ${centerLng.toFixed(5)})에서 거리순 정렬 완료`);
        }

        // ✅ 현재 페이지의 매물만 가져오기
        const startIndex = (this.paginationState.currentPage - 1) * this.paginationState.pageSize;
        const endIndex = startIndex + this.paginationState.pageSize;
        const displayProperties = this.paginationState.allProperties.slice(startIndex, endIndex);

        if (displayProperties.length > 0) {
            this.paginationState.isLoading = true; // ✅ 로딩 시작

            const html = displayProperties.map(property => this.createPropertyCard(property)).join('');

            // ✅ append 모드면 기존 내용에 추가, 아니면 새로 작성
            if (append) {
                panelContent.insertAdjacentHTML('beforeend', html);
                console.log(`✅ 패널에 ${displayProperties.length}개 매물 추가 (총 ${startIndex + displayProperties.length}/${this.paginationState.totalCount})`);
            } else {
                panelContent.innerHTML = html;
                console.log(`✅ 패널에 ${displayProperties.length}개 매물 표시 (총 ${this.paginationState.totalCount}개 중)`);
                if (cluster) {
                    const countElement = document.getElementById('propertyCount');
                    countElement.textContent = this.paginationState.allProperties.length;
                }

            }

            this.attachPanelCardEvents();

            // ✅ Intersection Observer 설정 (18번째 카드 감지)
            this.setupInfiniteScroll(cluster);

            this.paginationState.isLoading = false; // ✅ 로딩 완료
        } else {
            if (!append) {
                panelContent.innerHTML = `
                    <div class="property-list-loading">
                        <p>현재 화면에 매물이 없습니다.</p>
                    </div>
                `;
            } else {
                console.log('✅ 더 이상 로드할 매물이 없습니다.');
            }
            this.paginationState.isLoading = false;
        }
    }

    /**
     * ✅ 무한 스크롤 설정 (18번째 카드 감지)
     * @param {Object} cluster - 클러스터 객체
     */
    setupInfiniteScroll(cluster = null) {
        const panelContent = document.getElementById('listContent');
        if (!panelContent) return;

        // ✅ 기존 Observer 정리
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }

        // ✅ 모든 카드 가져오기
        const cards = panelContent.querySelectorAll('.property-card');
        const totalCards = cards.length;

        // ✅ 18번째 카드가 있으면 Observer 설정
        if (totalCards >= 18) {
            const targetCard = cards[totalCards - 3]; // 끝에서 3번째 (18번째)

            this.intersectionObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        console.log('👀 18번째 매물 감지 - 다음 페이지 로딩');

                        // ✅ 다음 페이지 로드
                        const startIndex = (this.paginationState.currentPage - 1) * this.paginationState.pageSize;
                        const hasMore = startIndex + this.paginationState.pageSize < this.paginationState.totalCount;

                        if (hasMore && !this.paginationState.isLoading) {
                            this.paginationState.currentPage++;
                            // ✅ 동 선택 모드 처리 (allProperties에 이미 데이터 저장됨)
                            if (this.paginationState.dongMode) {
                                // 동 모드: allProperties 사용하여 append
                                this.loadPropertiesInPanel(true, null, this.paginationState.allProperties);
                            } else if (cluster) {
                                this.loadPropertiesInPanel(true, cluster);
                            } else {
                                this.loadPropertiesInPanel(true);
                            }
                        }
                    }
                });
            }, {
                root: panelContent,
                rootMargin: '0px',
                threshold: 0.1
            });

            this.intersectionObserver.observe(targetCard);
            console.log(`👁️ Intersection Observer 설정 완료 (타겟: ${totalCards - 3}번째 카드)`);
        }
    }

    /**
     * 매물 카드 생성 (계약완료 매물 처리 포함)
     */
    createPropertyCard(property) {
        const imageUrl = property.picname1 ? `/images/maemul/thumb/${property.picname1}` : '/static/images/no-image.png';
        const address = this.formatAddress(property);

        // ✅ 계약완료 여부 확인
        const isContractCompleted = property.contract === '계약완료';

        // ✅ 계약완료가 아닐 때만 가격/관리비/시간 표시
        const price = isContractCompleted ? '계약완료' : this.formatPrice(property);
        const publicMoney = isContractCompleted ? '' : this.formatPublicMoney(property.public_money);
        const timeAgo = isContractCompleted ? '' : this.formatTimeAgo(property.ldate);

        // 매물 종류와 층 정보 포맷팅
        const getCategoryName = (category) => {
            const categoryMap = {
                '90': '"원룸"',
                '91': '"투베이"',
                '92': '"무보증/단기"',
                '93': '"투룸"',
                '94': '"쓰리룸"'
            };
            return categoryMap[String(category)] || '';
        };

        const propertyType = property.category
            ? getCategoryName(property.category)
            : (property.build_use_type || '');

        // ✅ 계약완료면 층정보 숨김
        const floorInfo = isContractCompleted ? '' : (
            property.now_floor && property.total_floor
                ? `총 ${property.total_floor}층 중 ${property.now_floor}층`
                : property.now_floor
                    ? `${property.now_floor}층`
                    : ''
        );

        const propertyInfo = [];
        if (propertyType) propertyInfo.push(`<span style="font-size: 13px;">${propertyType}</span>`);
        if (floorInfo) propertyInfo.push(floorInfo);
        const infoText = propertyInfo.length > 0 ? ` ${propertyInfo.join(' ')}` : '';

        // ✅ 계약완료면 빨간색 볼드
        const priceStyle = isContractCompleted ? 'color: #e53935; font-weight: bold;' : '';

        // ✅ 확인필요면 빨간색 스타일
        const timeStyle = timeAgo === '확인필요'
            ? 'font-size: 12px; color: #e53935; font-weight: 500;'
            : 'font-size: 12px; color: rgb(100, 100, 100);';

        // ✅ 계약완료면 end.png 오버레이 표시
        const contractOverlay = isContractCompleted
            ? `<img src="/static/images/end.png" alt="계약완료" class="absolute inset-0 w-full h-full object-cover z-[6]">`
            : '';

        return `
            <div class="property-card" data-property-id="${property.idx}" onclick="navigateToDetail('${property.code}')">
                <div class="property-image">
                    <div class="absolute top-0 right-0 z-10 pr-1 pl-2 pb-2 pt-1" onclick="event.stopPropagation(); toggleLike('${property.code || property.idx}')">
                        <svg class="w-6 h-6 heart-unliked"
                            data-like-btn="${property.code || property.idx}"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 256 256"
                            stroke="white"
                            stroke-width="10"
                            fill="currentColor">
                            <path d="M223,57a58.07,58.07,0,0,0-81.92-.1L128,69.05 114.91,56.86A58,58,0,0,0,33,139l89.35,90.66a8,8,0,0,0,11.4,0L223,139a58,58,0,0,0,0-82Z"></path>
                        </svg>
                    </div>
                    ${imageUrl ?
                `<img src="${imageUrl}" alt="${property.title || '매물 이미지'}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'property-image-placeholder\\'>📷</div>'">` :
                `<div class="property-image-placeholder">📷</div>`
            }
                    ${contractOverlay}
                    ${!isContractCompleted && property.movie && property.movie.trim() !== ''
                ? `<div class="absolute bottom-[6%] left-[6%] z-[6] flex items-center justify-center" style="width: clamp(20px, 16%, 44px); height: clamp(20px, 16%, 44px);" title="영상 있음">
                        <img src="/static/images/movie_icon.png" alt="영상 있음" class="w-full h-full object-contain">
                    </div>`
                : ''}
                </div>
                <div class="property-card-info">
                    <div class="flex">
                        <div class="property-card-number" style="display: inline-block; padding: 2px 8px; border: 1px solid #ddd; border-radius: 6px; font-size: 11px; color: #666; background: #f9f9f9;">매물번호 ${property.code || property.idx}</div>
                    </div>
                    <div class="property-card-price" style="${priceStyle}">
                        <span class="price-main">${price}</span>
                        ${publicMoney ? `<span class="price-management">${publicMoney}</span>` : ''}
                    </div>
                    <div class="property-card-address" style="color: rgb(120, 120, 120);">${address}${infoText}</div>
                    <div class="property-card-title" style="color: rgb(50, 50, 50);">${(property.title || '상세 설명이 없습니다.').replace(/\[.*?\]/g, '').trim()}</div>
                    ${timeAgo ? `<div class="property-card-time text-xs font-normal" style="${timeStyle}">${timeAgo}</div>` : ''}
                </div>
            </div>
        `;
    }

    /**
     * 가격 포맷팅 - ✅ 통합 (중복 제거)
     */
    formatPrice(property) {
        const maemae = property.maemae_money || 0;
        const jeonse = property.jen_money || 0;
        const deposit = property.security_money || 0;
        const monthly = property.month_money || 0;

        if (maemae > 0) {
            return `매매 ${this.formatMoney(maemae)}만원`;
        } else if (jeonse > 0) {
            return `전세 ${this.formatMoney(jeonse)}만원`;
        } else if (deposit > 0 || monthly > 0) {
            const depositText = deposit > 0 ? this.formatMoney(deposit) : "";
            const monthlyText = monthly > 0 ? this.formatMoney(monthly) : "";
            return `월세 ${depositText}/${monthlyText}`.replace(/\/$/, '').trim();
        } else {
            return '';
        }
    }

    formatMoney(value) {
        return value;
    }


    /**
     * 관리비 포맷팅
     */
    formatPublicMoney(amount) {
        if (!amount || amount === 0) return '';

        const amountNum = parseFloat(amount);

        // 만원 단위로 변환 (10000으로 나누기)
        const manwon = Math.floor(amountNum / 10000);

        if (manwon > 0) {
            return `관리비 ${manwon}만원`;
        }

        return '';
    }

    /**
     * 주소 포맷팅 - ✅ 통합 (중복 제거)
     */
    formatAddress(property) {
        const parts = property.ri || property.dong;
        // const parts = [property.gu, property.dong, property.ri].filter(part => part && part.trim() !== '');
        return parts || '주소 정보 없음';
    }

    /**
     * 시간 포맷팅
     */
    formatTimeAgo(dateString) {
        if (!dateString) return '확인필요';

        try {
            // 한국 시간으로 자동 변환되는 걸 막고 UTC로 계산
            const date = new Date(dateString + "+09:00");
            const now = new Date();

            // UTC 기준 시간 차이 계산
            const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
            const diffDay = Math.floor(diffSec / 86400);

            if (diffSec < 60) return '방금 전';
            const diffMin = Math.floor(diffSec / 60);
            const diffHour = Math.floor(diffSec / 3600);
            const diffWeek = Math.floor(diffSec / 604800);

            if (diffMin < 60) return `${diffMin}분 전`;
            else if (diffHour < 24) return `${diffHour}시간 전`;
            else if (diffDay <= 15) return `${diffDay}일 전`;  // ✅ 15일까지 "X일 전"
            else if (diffDay < 30) return `${diffWeek}주 전`;  // ✅ 16~29일 "X주 전"
            // ✅ 30일 이상이면 "확인필요" 표시
            else return '확인필요';

        } catch (e) {
            return '확인필요';
        }
    }

    /**
     * 숫자 포맷팅
     */
    formatNumber(num) {
        if (!num || num === 0) return '0';
        return parseInt(num).toLocaleString();
    }

    /**
     * 패널 카드 이벤트 추가
     */
    attachPanelCardEvents() {
        const cards = document.querySelectorAll('#listContent .property-card');
        cards.forEach(card => {
            card.addEventListener('click', (e) => {
                const propertyId = card.dataset.propertyId;
                if (propertyId) {
                    console.log('🏠 패널에서 매물 선택:', propertyId);
                }
            });
        });
    }

    // ✅ 여기에 검색 결과 표시 메서드들 추가
    /**
     * 검색 결과 표시
     */
    showSearchResults(properties) {
        console.log('🔍 검색 결과 표시:', properties.length, '개');

        // 검색 결과를 패널에 표시
        this.renderSearchResults(properties);

        // 지도에 마커 표시
        if (window.appManager.mapManager) {
            window.appManager.mapManager.showSearchResults(properties);
        }
    }

    /**
     * 검색 결과 렌더링
     */
    renderSearchResults(properties) {
        const listContent = document.getElementById('listContent');
        if (!listContent) return;

        if (properties.length === 0) {
            listContent.innerHTML = '<div class="no-results">검색 결과가 없습니다.</div>';
            return;
        }

        // 검색 결과 카드 생성
        const cards = properties.map(property => this.createPropertyCard(property)).join('');
        listContent.innerHTML = cards;

        // 카드 클릭 이벤트 설정
        this.attachPanelCardEvents();
    }

    /**
     * HTML 이스케이프
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 숫자 포맷팅
     */
    formatNumber(num) {
        if (!num || num === 0) return '0';
        return parseInt(num).toLocaleString();
    }

    /**
     * 매물 목록 로드 - ✅ 제거: 지도에서 자동 로딩
     */
    async loadProperties(filters = {}) {
        // ✅ 이 함수는 더 이상 사용하지 않음
        // 지도의 loadPropertiesInBounds()가 대신 처리
        console.warn('⚠️ loadProperties()는 더 이상 사용하지 않습니다. 지도에서 자동 로딩합니다.');
    }

    /**
     * 직접 매물 로드 - ✅ 폴백 함수
     */
    async loadPropertiesDirectly() {
        try {
            console.log('📡 직접 매물 데이터 로드 중...');

            const response = await fetch('/api/properties');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            console.log('✅ 직접 매물 로드 완료:', data);

            if (data.success && data.data) {
                const properties = data.data;
                const panelContent = document.getElementById('listContent');
                const panelCount = document.getElementById('propertyCount');

                if (properties.length > 0) {
                    const displayProperties = properties.slice(0, 20);
                    const html = displayProperties.map(property => this.createPropertyCard(property)).join('');
                    panelContent.innerHTML = html;

                    if (panelCount) {
                        panelCount.textContent = properties.length;
                    }

                    this.attachPanelCardEvents();
                    console.log(`✅ 직접 로드로 ${displayProperties.length}개 매물 표시 완료`);
                } else {
                    panelContent.innerHTML = `
                        <div class="property-list-loading">
                            <p>매물이 없습니다.</p>
                        </div>
                    `;
                }
            }
        } catch (error) {
            console.error('❌ 직접 매물 로드 실패:', error);
            const panelContent = document.getElementById('listContent');
            if (panelContent) {
                panelContent.innerHTML = `
                    <div class="property-list-loading">
                        <p>매물을 불러올 수 없습니다.</p>
                    </div>
                `;
            }
        }
    }




    /**
     * 상세 패널 표시
     */
    showDetailPanel() {
        const detailPanel = document.querySelector('.detail-panel');
        if (detailPanel) {
            detailPanel.classList.add('active');
            this.currentState.view = 'detail';
            console.log('✅ 상세 패널 표시됨');
        }
    }

    /**
     * 상세 패널 숨기기
     */
    hideDetailPanel() {
        const detailPanel = document.querySelector('.detail-panel');
        if (detailPanel) {
            detailPanel.classList.remove('active');
            this.currentState.view = 'map';
            console.log('✅ 상세 패널 숨겨짐');
        }
    }

    /**
     * 뒤로가기
     */
    goBack() {
        this.historyManager.goBack();
    }

    /**
     * 로딩 인디케이터 표시
     */
    showLoadingIndicator() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'flex';
        }
    }

    /**
     * 로딩 인디케이터 숨기기
     */
    // main.js의 hideLoadingIndicator() 함수 수정
    hideLoadingIndicator() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'none';
            console.log('✅ 로딩 인디케이터 숨김 완료');
        } else {
            console.warn('⚠️ #loading 요소를 찾을 수 없습니다.');
        }
    }

    /**
     * 에러 메시지 표시
     */
    showError(message) {
        console.error('❌ 에러:', message);

        // 에러 토스트 표시
        const toast = document.createElement('div');
        toast.className = 'error-toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        // 3초 후 자동 제거
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 3000);
    }

    /**
     * 성공 메시지 표시
     */
    // showSuccess(message) {
    //     console.log('✅ 성공:', message);

    //     // 성공 토스트 표시
    //     const toast = document.createElement('div');
    //     toast.className = 'success-toast';
    //     toast.textContent = message;
    //     document.body.appendChild(toast);

    //     // 2초 후 자동 제거
    //     setTimeout(() => {
    //         if (toast.parentNode) {
    //             toast.parentNode.removeChild(toast);
    //         }
    //     }, 2000);
    // }
}

/**
* 히스토리 관리자
* 브라우저 히스토리와 모바일 뒤로가기 버튼을 관리
*/
class HistoryManager {
    constructor(appManager) {
        this.appManager = appManager;
        this.history = [];
        this.currentIndex = -1;
    }

    /**
     * 히스토리 매니저 초기화
     */
    init() {
        console.log('📚 히스토리 매니저 초기화...');

        // 브라우저 뒤로가기 이벤트
        window.addEventListener('popstate', (event) => {
            this.handlePopState(event);
        });

        // 모바일 뒤로가기 버튼 이벤트
        document.addEventListener('backbutton', (event) => {
            event.preventDefault();
            this.goBack();
        });

        // 초기 상태 추가
        this.pushState('map', {});
    }

    /**
     * 히스토리 상태 추가
     */
    pushState(view, data) {
        const state = {
            view: view,
            data: data,
            timestamp: Date.now()
        };

        // 현재 인덱스 이후의 히스토리 제거
        this.history = this.history.slice(0, this.currentIndex + 1);

        // 새 상태 추가
        this.history.push(state);
        this.currentIndex = this.history.length - 1;

        // 브라우저 히스토리에 추가
        // const url = this.generateURL(view, data);
        // history.pushState(state, '', url);

        console.log('📚 히스토리 상태 추가:', state);
    }

    /**
     * 뒤로가기
     */
    goBack() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            const state = this.history[this.currentIndex];
            this.applyState(state);
            console.log('📚 뒤로가기:', state);
        } else {
            // 히스토리가 없으면 앱 종료
            console.log('📚 히스토리 없음 - 앱 종료');
            this.handleAppExit();
        }
    }

    /**
     * 앞으로가기
     */
    // goForward() {
    //     if (this.currentIndex < this.history.length - 1) {
    //         this.currentIndex++;
    //         const state = this.history[this.currentIndex];
    //         this.applyState(state);
    //         console.log('📚 앞으로가기:', state);
    //     }
    // }

    /**
     * 브라우저 뒤로가기 이벤트 처리
     */
    handlePopState(event) {
        if (event.state) {
            // 브라우저 히스토리에서 온 상태
            const state = event.state;
            const index = this.history.findIndex(h => h.timestamp === state.timestamp);

            if (index !== -1) {
                this.currentIndex = index;
                this.applyState(state);
                console.log('📚 브라우저 뒤로가기:', state);
            }
        } else {
            // ✅ event.state가 null인 경우는 초기 페이지 상태로 돌아간 것
            // 모달/패널 닫기 등 정상적인 동작이므로 앱 종료하지 않음
            console.log('📚 초기 상태로 복귀 (앱 종료 안 함)');
        }
    }

    /**
     * 상태 적용
     */
    applyState(state) {
        switch (state.view) {
            case 'map':
                this.appManager.hideListPanel();
                this.appManager.hideDetailPanel();
                break;
            case 'list':
                this.appManager.showListPanel();
                this.appManager.hideDetailPanel();
                break;
            case 'detail':
                this.appManager.hideListPanel();
                if (state.data.propertyId) {
                    this.appManager.selectProperty(state.data.propertyId);
                }
                break;
        }
    }

    /**
     * URL 생성
     */
    // generateURL(view, data) {
    //     const base = window.location.pathname;

    //     switch (view) {
    //         case 'list':
    //             return `${base}#list`;
    //         case 'detail':
    //             return `${base}#detail/${data.propertyId}`;
    //         default:
    //             return base;
    //     }
    // }

    /**
     * 앱 종료 처리
     */
    handleAppExit() {
        // 모바일 앱인 경우
        if (window.cordova || window.phonegap) {
            navigator.app.exitApp();
        } else {
            // 웹 브라우저인 경우
            window.close();
        }
    }
}

// 전역 변수로 설정
window.AppManager = AppManager;
window.HistoryManager = HistoryManager;

// DOM 로드 완료 후 초기화
document.addEventListener('DOMContentLoaded', async function () {
    try {
        console.log('🎯 DOM 로드 완료 - AppManager 초기화 시작');

        // AppManager 인스턴스 생성
        window.appManager = new AppManager();

        // 앱 초기화
        await window.appManager.init();

        console.log('✅ AppManager 초기화 완료');

    } catch (error) {
        console.error('❌ AppManager 초기화 실패:', error);
    }
});

/**
 * 매물 없음 토스트 표시
 */
function showNoPropertiesToast() {
    // 기존 토스트 제거
    const existingToast = document.querySelector('.no-properties-toast');
    if (existingToast) {
        existingToast.remove();
    }

    // 새 토스트 생성
    const toast = document.createElement('div');
    toast.className = 'no-properties-toast';
    toast.textContent = '현재 위치에 조건에 맞는 매물이 없습니다.';

    // body에 추가
    document.body.appendChild(toast);

    // 1.5초 후 자동 제거
    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 1500);
}

/**
 * ✅ 추가: 패널 상태 업데이트 함수
 */
function navigateToDetail(propertyCode) {
    // ✅ 현재 드래그 패널 상태 저장
    const listPanel = document.getElementById('listPanel');
    const isPanelOpen = listPanel && listPanel.classList.contains('active');

    if (isPanelOpen) {
        sessionStorage.setItem('returnToPanelOpen', 'true');

        // ✅ 스크롤 위치 저장
        const listContent = document.getElementById('listContent');
        if (listContent) {
            sessionStorage.setItem('listScrollPosition', listContent.scrollTop);
        }

        // ✅ 현재 매물 목록 HTML 저장
        if (listContent && listContent.innerHTML) {
            sessionStorage.setItem('listContentHTML', listContent.innerHTML);
        }

        // ✅ 패널 헤더 정보 저장 (수량만 저장, 레이블은 상태에서 동적 생성)
        const propertyCount = document.getElementById('propertyCount');
        if (propertyCount) {
            sessionStorage.setItem('propertyCount', propertyCount.textContent);
        }

        // 현재 지도 위치와 줌 레벨 저장
        if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.map) {
            const map = window.appManager.mapManager.map;
            const center = map.getCenter();
            const zoom = map.getZoom();

            sessionStorage.setItem('mapState', JSON.stringify({
                lat: center.lat(),
                lng: center.lng(),
                zoom: zoom
            }));
        }

        // ✅ 필터 상태 저장
        if (window.fullFilterState) {
            sessionStorage.setItem('fullFilterState', JSON.stringify(window.fullFilterState));
        }
        if (window.appManager && window.appManager.mapManager) {
            if (window.appManager.mapManager.fullFilterParams) {
                sessionStorage.setItem('fullFilterParams', JSON.stringify(window.appManager.mapManager.fullFilterParams));
            }
            if (window.appManager.mapManager.currentCategory) {
                sessionStorage.setItem('currentCategory', JSON.stringify(window.appManager.mapManager.currentCategory));
            }
        }

        // ✅ 매물종류 필터 UI 상태 저장
        if (window.selectedPropertyCategory && window.selectedPropertyCategory.length > 0) {
            sessionStorage.setItem('selectedPropertyCategory', JSON.stringify(window.selectedPropertyCategory));
            const typeText = document.getElementById('propertyTypeText');
            if (typeText) {
                sessionStorage.setItem('propertyTypeText', typeText.textContent);
            }
        }

        // ✅ 동 선택 상태 저장
        if (window.currentDongSearch) {
            sessionStorage.setItem('currentDongSearch', JSON.stringify(window.currentDongSearch));
            // 선택된 동 이름도 저장
            if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.clusteringManager) {
                const selectedDongName = window.appManager.mapManager.clusteringManager.selectedDongName;
                if (selectedDongName) {
                    sessionStorage.setItem('selectedDongName', selectedDongName);
                }
            }
            console.log('📍 동 선택 상태 저장:', window.currentDongSearch.locationName);
        }

        // ✅ 역 선택 상태 저장 (표시된 수량도 함께 저장) - localStorage 사용 (네이버앱 호환)
        if (window.stationManager && window.stationManager.isStationFilterActive) {
            const propertyCountElement = document.getElementById('propertyCount');
            const stationState = {
                isActive: true,
                selectedStation: window.stationManager.selectedStation,
                selectedZoomLevel: window.stationManager.selectedZoomLevel,
                filteredProperties: window.stationManager.filteredProperties,
                displayedCount: propertyCountElement ? propertyCountElement.textContent : null,
                timestamp: Date.now()  // ✅ 저장 시간 기록 (오래된 데이터 정리용)
            };
            localStorage.setItem('stationFilterState', JSON.stringify(stationState));
            console.log('📍 역 선택 상태 저장 (localStorage):', window.stationManager.selectedStation?.name, '수량:', stationState.displayedCount);
        }

        // ✅ 클러스터(좌표 기준 마커) 선택 상태 저장
        if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.clusteringManager) {
            const clusteringManager = window.appManager.mapManager.clusteringManager;
            if (clusteringManager.selectedClusterIndex !== null) {
                const clusterState = {
                    selectedClusterIndex: clusteringManager.selectedClusterIndex,
                    timestamp: Date.now()
                };
                sessionStorage.setItem('clusterState', JSON.stringify(clusterState));
                console.log('📍 클러스터 선택 상태 저장:', clusterState.selectedClusterIndex);
            }
        }

        console.log('📍 패널 상태 저장 완료 (스크롤 위치, 목록, 헤더, 필터, 동/역/클러스터 선택)');
    }

    // 탭바 활성 탭 전달 (지도형에서 이동 → 지도 탭 활성화)
    sessionStorage.setItem('navFrom', 'map');
    // 슬라이딩 애니메이션 트리거 (view.html에서 우→좌 슬라이드 적용)
    sessionStorage.setItem('fromListPage', 'true');
    sessionStorage.setItem('navDirection', 'slide-right');

    // 페이지 전환
    requestAnimationFrame(() => {
        window.location.href = `/view/${propertyCode}`;
    });
}

// 전역 함수로 등록
window.navigateToDetail = navigateToDetail;

/**
 * ✅ 전역 함수: 동 선택 해제
 * 동 선택 상태를 해제하고 화면에 보이는 지도 영역 기준 매물 수량을 표시합니다.
 * 다양한 상호작용(지도 클릭, 드래그, 줌, GPS, 검색, 관심목록 등)에서 호출됩니다.
 */
function clearDongSelectionGlobal() {
    // ✅ 동 검색 상태 초기화
    if (window.currentDongSearch) {
        console.log('🏠 동 선택 해제 (글로벌)');
        window.currentDongSearch = null;
    }

    // ✅ 동 경계 폴리곤 제거
    if (window.dongBoundaryManager) {
        window.dongBoundaryManager.clearBoundary();
    }

    // ✅ 동 마커 색상 반전 효과 해제 및 클러스터 마커 재생성
    if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.clusteringManager) {
        const clusteringManager = window.appManager.mapManager.clusteringManager;
        if (clusteringManager.selectedDongName) {
            clusteringManager.selectedDongName = null;
            clusteringManager.showClusteredMarkers();
        }
    }

    // ✅ 드래그 패널 레이블 업데이트
    if (typeof updatePanelLabel === 'function') {
        updatePanelLabel();
    }
}

// 전역 함수로 등록
window.clearDongSelectionGlobal = clearDongSelectionGlobal;

/**
 * ✅ 드래그 패널 상단 레이블 업데이트
 * 우선순위: 1.지역 > 2.매물종류 > 3.테마 > 4.전체
 *
 * 조합 규칙:
 *  - 1순위만  → 지역명만 표시
 *  - 2순위만  → 매물종류만 표시
 *  - 3순위만  → 테마명만 표시
 *  - 1+2      → "지역명 매물종류" 표시
 *  - 1+3      → 지역명만 표시 (3순위 무시)
 *  - 2+3      → 매물종류만 표시 (3순위 무시)
 *  - 1+2+3    → "지역명 매물종류" 표시 (3순위 무시)
 *  - 없음     → "전체" 표시
 */
function updatePanelLabel() {
    const labelElement = document.getElementById('propertyLabel');
    if (!labelElement) return;

    // ✅ 1순위: 지역 텍스트 추출 (동, 역, 지역 검색 등)
    const isDongSelected = window.currentDongSearch && window.currentDongSearch.locationName;
    const isStationSelected = window.stationManager && window.stationManager.isStationFilterActive && window.stationManager.selectedStation;
    const isLocationSearch = window.currentLocationSearch && window.currentLocationSearch.locationName;
    const isDongClusterSelected = window.appManager &&
        window.appManager.mapManager &&
        window.appManager.mapManager.clusteringManager &&
        window.appManager.mapManager.clusteringManager.selectedDongName;

    let locationText = '';
    let isMultiDong = false; // ✅ 동 2개 이상 선택 여부
    if (isDongSelected) {
        const dongNames = window.currentDongSearch.locationNames;
        if (dongNames && dongNames.length >= 2) {
            // ✅ 2개 이상 동 선택 시 "N개 지역" 형식
            locationText = `${dongNames.length}개 지역`;
            isMultiDong = true;
        } else {
            locationText = window.currentDongSearch.locationName;
        }
    } else if (isStationSelected) {
        locationText = window.stationManager.selectedStation.name;
    } else if (isLocationSearch) {
        locationText = window.currentLocationSearch.locationName;
    } else if (isDongClusterSelected) {
        locationText = window.appManager.mapManager.clusteringManager.selectedDongName;
    }

    // ✅ 2순위: 매물종류 텍스트 추출
    let propertyTypeText = '';
    if (window.selectedPropertyCategory && window.selectedPropertyCategory.length > 0) {
        const categories = window.selectedPropertyCategory;
        if (categories.length === 1) {
            propertyTypeText = getPropertyTypeDisplayName(categories[0]);
        } else {
            // 첫 번째 선택된 것 + "외"
            propertyTypeText = getPropertyTypeDisplayName(categories[0]) + ' 외';
        }
    }

    // ✅ 3순위: 테마 텍스트 추출 (currentThemeFilter, currentRecommendFilter)
    let themeText = '';
    if (window.currentThemeFilter) {
        if (window.currentThemeFilter.label) {
            themeText = window.currentThemeFilter.label;
        } else if (typeof window.currentThemeFilter === 'string') {
            themeText = getThemeDisplayName(window.currentThemeFilter);
        } else if (window.currentThemeFilter.column) {
            themeText = getThemeDisplayName(window.currentThemeFilter.column);
        }
    } else if (window.currentRecommendFilter) {
        if (window.currentRecommendFilter.label) {
            themeText = window.currentRecommendFilter.label;
        } else {
            themeText = getThemeDisplayName(window.currentRecommendFilter);
        }
    }

    // ✅ 조합 규칙 적용
    // 동 2개 이상 + 매물종류 있음  → "N개 지역 투룸" or "N개 지역 투룸 외"
    // 동 2개 이상 + 매물종류 없음  → "N개 지역 전체"
    // 동 1개 + 매물종류 있음       → "두정동 투룸" or "두정동 투룸 외"
    // 동 1개 + 매물종류 없음       → "두정동"
    // 지역 없이 매물종류만          → 매물종류만 표시, 테마 무시
    // 지역/매물종류 없이 테마만      → 테마 표시
    // 아무것도 없으면               → '전체'
    let labelText = '';
    if (locationText) {
        if (isMultiDong && !propertyTypeText) {
            // ✅ 다중 동 선택 + 매물종류 미선택 → "N개 지역 전체"
            labelText = locationText + ' 전체';
        } else {
            labelText = locationText;
            if (propertyTypeText) {
                labelText += ' ' + propertyTypeText;
            }
        }
    } else if (propertyTypeText) {
        labelText = propertyTypeText;
    } else if (themeText) {
        labelText = themeText;
    } else {
        labelText = '전체';
    }

    // 레이블 표시
    if (labelText) {
        labelElement.textContent = labelText + ' ';
        labelElement.style.display = 'inline';
    } else {
        labelElement.textContent = '';
        labelElement.style.display = 'none';
    }

    console.log('📌 패널 레이블 업데이트:', labelText);
}

/**
 * ✅ 테마 값을 한글 표시명으로 변환
 */
function getThemeDisplayName(themeValue) {
    const themeNames = {
        'good6': '실시간 추천',
        'thema1': '신축 고급형',
        'thema2': '보증금 100가능',
        'thema4': '아치형 투베이',
        'thema5': '독특한 스타일',
        'thema8': '큰 원룸',
        'thema9': '알뜰형 원룸',
        'thema10': '알뜰형 투베이/투룸',
        'thema11': '분리형 원룸',
        'thema12': '분리형 투베이',
        'thema13': '거실있는 투룸'
    };
    return themeNames[themeValue] || themeValue;
}

/**
 * ✅ 매물 종류 값을 한글 표시명으로 변환
 * 카테고리 값: 90=원룸, 91=투베이, 93=투룸, 94=쓰리룸, 92=무보증
 */
function getPropertyTypeDisplayName(category) {
    const typeNames = {
        '90': '원룸',
        '91': '투베이',
        '93': '투룸',
        '94': '쓰리룸',
        '92': '무보증'
    };
    return typeNames[category] || category;
}

// 전역 함수로 등록
window.updatePanelLabel = updatePanelLabel;
window.getThemeDisplayName = getThemeDisplayName;
window.getPropertyTypeDisplayName = getPropertyTypeDisplayName;
