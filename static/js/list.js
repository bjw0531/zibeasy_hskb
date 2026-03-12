/**
 * 매물 목록 관리자
 * 매물 목록 패널의 표시, 검색, 정렬, 선택 기능을 담당
 */

function buildMapSearchThumbMarkup(property) {
    if (window.propertyPreviewSlider && typeof window.propertyPreviewSlider.buildThumbMarkup === 'function') {
        return window.propertyPreviewSlider.buildThumbMarkup(property);
    }

    if (!property.picname1) {
        return `<div class="property-image-placeholder">📷</div>`;
    }

    return `<img src="/images/maemul/thumb/${property.picname1}" alt="${property.title || '매물 이미지'}" loading="lazy"
        onerror="this.parentElement.innerHTML='<div class=\\'property-image-placeholder\\'>📷</div>'">`;
}

class ListManager {
    constructor(appManager) {
        this.appManager = appManager;
        this.properties = [];
        this.filteredProperties = [];
        this.currentSort = 'default';
        this.currentSearch = '';
        this.isLoading = false;
    }

    /**
     * 목록 매니저 초기화
     */
    init() {
        console.log('📋 목록 매니저 초기화...');
        this.setupEventListeners();
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 검색 입력
        const searchInput = document.querySelector('.list-search');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearch(e.target.value);
            });
        }

        // 정렬 선택
        const sortSelect = document.querySelector('.list-sort');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.handleSort(e.target.value);
            });
        }

        // 목록 패널 닫기 버튼
        const closeBtn = document.querySelector('.list-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.appManager.hideListPanel();
            });
        }

        // 목록 패널 외부 클릭 (지도 클릭)
        document.addEventListener('click', (e) => {
            if (this.appManager.currentState.listVisible &&
                !e.target.closest('.list-panel') &&
                !e.target.closest('.list-toggle-btn')) {
                this.appManager.hideListPanel();
            }
        });

        // 스크롤바 표시 제어
        const content = document.querySelector('.list-content');
        if (content) {
            let scrollTimeout;
            content.addEventListener('scroll', () => {
                content.classList.add('scrolling');
                clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    content.classList.remove('scrolling');
                }, 200);
            });
        }
    }

    /**
     * 매물 데이터 로드
     */
    async loadProperties(filters = {}) {
        try {
            this.showLoading();

            // API 파라미터 구성
            const params = new URLSearchParams();
            if (filters.si) params.append('si', filters.si);
            if (filters.gu) params.append('gu', filters.gu);
            if (filters.dong) params.append('dong', filters.dong);

            // API 호출
            const response = await fetch('/api/properties?' + params.toString());

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success) {
                this.properties = data.data || [];
                this.filteredProperties = [...this.properties];
                this.renderProperties();
                this.updateCount();

                console.log(`✅ 목록 ${this.properties.length}개 로드 완료`);
            } else {
                throw new Error(data.error || '매물 데이터를 불러올 수 없습니다.');
            }

        } catch (error) {
            console.error('매물 로드 실패:', error);
            this.showError('매물 데이터를 불러오는 중 오류가 발생했습니다.');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * 매물 목록 렌더링
     */
    renderProperties() {
        const content = document.querySelector('.list-content');
        if (!content) return;

        if (this.filteredProperties.length === 0) {
            this.renderEmpty();
            return;
        }

        const html = this.filteredProperties.map(property =>
            this.createPropertyCard(property)
        ).join('');

        content.innerHTML = html;
    }

    /**
     * 매물 카드 생성
     */
    // createPropertyCard(property) {
    //     // 이미지 URL (picname1 사용)
    //     const imageUrl = property.picname1 ?
    //         `/images/maemul/big/${property.picname1}` :
    //         null;

    //     const price = this.formatPrice(property);
    //     const address = this.formatAddress(property);
    //     const details = this.formatDetails(property);

    //     return `
    //         <div class="property-card" data-property-id="${property.idx}" onclick="window.location.href='/view/${property.idx}'">
    //             <div class="property-image">
    //                 ${imageUrl ?
    //             `<img src="${imageUrl}" alt="${property.title || '매물 이미지'}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'property-image-placeholder\\'>📷</div>'">` :
    //             `<div class="property-image-placeholder">📷</div>`
    //         }
    //                 ${property.movie && property.movie.trim() !== '' ? '<div class="video-badge" title="영상 있음"><img src="/static/images/movie_icon.png" alt="영상 있음"></div>' : ''}
    //             </div>
    //             <div class="property-card-content">
    //                 <div class="property-card-title">
    //                     ${this.escapeHtml(property.title || '제목 없음')}
    //                 </div>
    //                 <div class="property-card-address">
    //                     📍 ${this.escapeHtml(address)}
    //                 </div>
    //                 <div class="property-card-details">
    //                     <div class="property-card-info">
    //                         ${details}
    //                     </div>
    //                     <div class="property-card-price">
    //                         ${price}
    //                     </div>
    //                 </div>
    //                 ${this.createPropertyTags(property)}
    //             </div>
    //         </div>
    //     `;
    // }

    /**
     * 매물 태그 생성
     */
    createPropertyTags(property) {
        const tags = [];

        // 매물 종류
        if (property.maemul) {
            tags.push(`<span class="property-tag">${property.maemul}</span>`);
        }

        // 거래 종류
        if (property.geo) {
            tags.push(`<span class="property-tag secondary">${property.geo}</span>`);
        }

        // 특별한 조건들 (good1~good15)
        for (let i = 1; i <= 15; i++) {
            const goodField = `good${i}`;
            if (property[goodField]) {
                tags.push(`<span class="property-tag warning">${property[goodField]}</span>`);
            }
        }

        return tags.length > 0 ?
            `<div class="property-tags">${tags.join('')}</div>` : '';
    }

    /**
     * 가격 포맷팅
     */
    formatPrice(property) {
        const prices = [];

        // 매매가
        if (property.maemae_money && property.maemae_money > 0) {
            prices.push(`<div class="price-item">매매 ${this.formatNumber(property.maemae_money)}만원</div>`);
        }

        // 월세
        if (property.month_money && property.month_money > 0) {
            const deposit = property.bo_money ? `${this.formatNumber(property.bo_money)}/` : '';
            prices.push(`<div class="price-item">월세 ${deposit}${this.formatNumber(property.month_money)}만원</div>`);
        }

        // 보증금만 있는 경우
        if (prices.length === 0 && property.bo_money && property.bo_money > 0) {
            prices.push(`<div class="price-item">보증금 ${this.formatNumber(property.bo_money)}만원</div>`);
        }

        // 가격 정보가 없는 경우
        if (prices.length === 0) {
            prices.push(`<div class="price-item">가격 문의</div>`);
        }

        return prices.join('');
    }

    /**
     * 주소 포맷팅
     */
    formatAddress(property) {
        const parts = [];

        // 시/도
        if (property.sido) parts.push(property.sido);

        // 시/군/구
        if (property.gugun) parts.push(property.gugun);

        // 읍/면/동
        if (property.dong) parts.push(property.dong);

        // 지번
        if (property.jibun) parts.push(property.jibun);

        return parts.length > 0 ? parts.join(' ') : '주소 정보 없음';
    }

    /**
     * 상세 정보 포맷팅
     */
    formatDetails(property) {
        const details = [];

        // 면적 (평수)
        if (property.m2) {
            const pyeong = (parseFloat(property.m2) / 3.3058).toFixed(1);
            details.push(`<span>📐 ${pyeong}평 (${property.m2}㎡)</span>`);
        }

        // 층수
        if (property.floor) {
            const floorText = property.maxfloor ?
                `${property.floor}/${property.maxfloor}층` :
                `${property.floor}층`;
            details.push(`<span>🏢 ${floorText}</span>`);
        }

        // 방향
        if (property.direction) {
            details.push(`<span>🧭 ${property.direction}</span>`);
        }

        // 방/욕실 수
        if (property.bed_room || property.bath_room) {
            const rooms = [];
            if (property.bed_room) rooms.push(`방 ${property.bed_room}`);
            if (property.bath_room) rooms.push(`욕실 ${property.bath_room}`);
            details.push(`<span>🚪 ${rooms.join(', ')}</span>`);
        }

        return details.join('');
    }

    /**
     * 숫자 포맷팅 (천 단위 콤마)
     */
    formatNumber(num) {
        if (!num || num === 0) return '0';
        return Number(num).toLocaleString();
    }

    /**
     * HTML 이스케이프 (XSS 방지)
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 매물 하이라이트
     */
    highlightProperty(propertyId) {
        // 모든 카드에서 active 클래스 제거
        const cards = document.querySelectorAll('.property-card');
        cards.forEach(card => {
            card.classList.remove('active');
        });

        // 선택된 카드에 active 클래스 추가
        const selectedCard = document.querySelector(`[data-property-id="${propertyId}"]`);
        if (selectedCard) {
            selectedCard.classList.add('active');

            // 선택된 카드로 스크롤
            selectedCard.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
        }
    }

    /**
     * 검색 처리
     */
    handleSearch(searchTerm) {
        this.currentSearch = searchTerm.toLowerCase().trim();
        this.applyFilters();
    }

    /**
     * 정렬 처리
     */
    handleSort(sortType) {
        this.currentSort = sortType;
        this.applyFilters();
    }

    /**
     * 필터 적용
     */
    applyFilters() {
        let filtered = [...this.properties];

        // 검색 필터
        if (this.currentSearch) {
            filtered = filtered.filter(property => {
                const searchableText = [
                    property.title,
                    property.sido,
                    property.gugun,
                    property.dong,
                    property.jibun,
                    property.maemul,
                    property.geo,
                    property.content
                ].filter(Boolean).join(' ').toLowerCase();

                return searchableText.includes(this.currentSearch);
            });
        }

        // 정렬
        filtered = this.sortProperties(filtered, this.currentSort);

        this.filteredProperties = filtered;
        this.renderProperties();
        this.updateCount();
    }

    /**
     * 매물 정렬
     */
    sortProperties(properties, sortType) {
        const sorted = [...properties];

        switch (sortType) {
            case 'price_asc':
                return sorted.sort((a, b) => {
                    const priceA = a.maemae_money || a.month_money || 0;
                    const priceB = b.maemae_money || b.month_money || 0;
                    return priceA - priceB;
                });

            case 'price_desc':
                return sorted.sort((a, b) => {
                    const priceA = a.maemae_money || a.month_money || 0;
                    const priceB = b.maemae_money || b.month_money || 0;
                    return priceB - priceA;
                });

            case 'area_asc':
                return sorted.sort((a, b) => {
                    const areaA = parseFloat(a.m2) || 0;
                    const areaB = parseFloat(b.m2) || 0;
                    return areaA - areaB;
                });

            case 'area_desc':
                return sorted.sort((a, b) => {
                    const areaA = parseFloat(a.m2) || 0;
                    const areaB = parseFloat(b.m2) || 0;
                    return areaB - areaA;
                });

            case 'date_desc':
                return sorted.sort((a, b) => {
                    const dateA = new Date(a.ldate || 0).getTime();
                    const dateB = new Date(b.ldate || 0).getTime();
                    return dateB - dateA;
                });

            case 'date_asc':
                return sorted.sort((a, b) => {
                    const dateA = new Date(a.ldate || 0).getTime();
                    const dateB = new Date(b.ldate || 0).getTime();
                    return dateA - dateB;
                });

            default:
                return sorted;
        }
    }

    /**
     * 카운트 업데이트
     */
    updateCount() {
        const countElement = document.querySelector('.list-count');
        if (countElement) {
            countElement.textContent = this.filteredProperties.length;

            // ✅ 패널 상태 업데이트
            updatePanelState(this.filteredProperties.length);

            // ✅ 0개일 때 토스트 표시
            if (this.filteredProperties.length === 0) {
                showNoPropertiesToast();
            }
        }
    }

    /**
     * 로딩 표시
     */
    showLoading() {
        this.isLoading = true;
        const content = document.querySelector('.list-content');
        if (content) {
            content.innerHTML = `
                <div class="list-loading">
                    <div class="loading-spinner"></div>
                    <p>매물을 불러오는 중...</p>
                </div>
            `;
        }
    }

    /**
     * 로딩 숨김
     */
    hideLoading() {
        this.isLoading = false;
    }

    /**
     * 빈 상태 렌더링
     */
    renderEmpty() {
        const content = document.querySelector('.list-content');
        if (content) {
            content.innerHTML = `
                <div class="list-empty">
                    <div class="list-empty-icon">🏠</div>
                    <div class="list-empty-title">매물이 없습니다</div>
                    <div class="list-empty-message">
                        검색 조건을 변경하거나<br>
                        다른 지역을 확인해보세요.
                    </div>
                </div>
            `;
        }
    }

    /**
     * 에러 표시
     */
    showError(message) {
        const content = document.querySelector('.list-content');
        if (content) {
            content.innerHTML = `
                <div class="list-error">
                    <div class="list-error-icon">⚠️</div>
                    <div class="list-error-message">${this.escapeHtml(message)}</div>
                    <button class="list-error-retry btn btn-primary" onclick="window.appManager.listManager.loadProperties(window.appManager.currentState.filters)">
                        다시 시도
                    </button>
                </div>
            `;
        }
    }

    /**
     * 메모리 정리
     */
    destroy() {
        console.log('🧹 목록 매니저 정리 중...');

        this.properties = [];
        this.filteredProperties = [];

        console.log('✅ 목록 매니저 정리 완료');
    }

    /**
     * 검색 결과 표시
     */
    showSearchResults(properties) {
        console.log('🔍 검색 결과 표시:', properties.length, '개');

        // ✅ 검색 모드 플래그 설정
        if (window.appManager) {
            window.appManager.isSearchMode = true;
        }

        // ✅ 매물 개수 업데이트
        const countElement = document.getElementById('propertyCount');
        if (countElement) {
            countElement.textContent = properties.length;
        }

        // 검색 결과를 패널에 표시
        this.renderSearchResults(properties);

        // 검색된 매물이 있으면 지도 이동
        if (properties.length > 0 && window.appManager && window.appManager.mapManager) {
            const property = properties[0];
            if (property.lat && property.lng) {
                const lat = parseFloat(property.lat);
                const lng = parseFloat(property.lng);
                window.appManager.mapManager.map.setCenter(new naver.maps.LatLng(lat, lng));
                window.appManager.mapManager.map.setZoom(15);
                console.log('🗺️ 검색 결과 위치로 지도 이동:', lat, lng);
            }
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

        // ✅ 검색용 카드 생성 (1개월 이상 된 매물은 "확인필요" 표시)
        if (window.appManager) {
            const cards = properties.map(property => this.createSearchPropertyCard(property)).join('');
            listContent.innerHTML = cards;

            // 카드 클릭 이벤트 설정
            window.appManager.attachPanelCardEvents();
        } else {
            listContent.innerHTML = '<div class="no-results">렌더링 오류가 발생했습니다.</div>';
        }
    }

    /**
     * ✅ 검색용 매물 카드 생성 (계약완료 매물 처리 포함)
     */
    createSearchPropertyCard(property) {
        const address = window.appManager.formatAddress(property);
        const thumbInner = buildMapSearchThumbMarkup(property);

        // ✅ 계약완료 여부 확인
        const isContractCompleted = property.contract === '계약완료';

        // ✅ 계약완료가 아닐 때만 가격/관리비 표시
        const price = isContractCompleted ? '계약완료' : window.appManager.formatPrice(property);
        const publicMoney = isContractCompleted ? '' : window.appManager.formatPublicMoney(property.public_money);

        // ✅ 1개월 이상이면 "확인필요", 계약완료면 시간 표시 안함
        const timeAgo = isContractCompleted ? '' : this.formatSearchTimeAgo(property.ldate);

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

        // ✅ 계약완료면 빨간색 볼드, 1개월 이상이면 빨간색 "확인필요" 표시
        const priceStyle = isContractCompleted
            ? 'color: #e53935; font-weight: bold;'
            : '';
        const timeStyle = timeAgo === '확인필요'
            ? 'font-size: 12px; color: #e53935; font-weight: 500; display: flex; justify-content: flex-end; width: 100%; text-align: right;'
            : 'font-size: 12px; color: rgb(100, 100, 100); display: flex; justify-content: flex-end; width: 100%; text-align: right;';

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
                    ${thumbInner}
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
     * ✅ 검색용 시간 포맷팅 (30일 이상이면 "확인필요" - Python과 일치)
     */
    formatSearchTimeAgo(dateString) {
        if (!dateString) return '확인필요';

        try {
            const date = new Date(dateString + "+09:00");
            const now = new Date();
            const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
            const diffDay = Math.floor(diffSec / 86400);

            // ✅ 30일 이상이면 "확인필요" (Python과 일치)
            if (diffDay >= 30) {
                return '확인필요';
            }

            // 30일 이내면 일반 시간 표시
            if (diffSec < 60) return '방금 전';
            const diffMin = Math.floor(diffSec / 60);
            const diffHour = Math.floor(diffSec / 3600);
            const diffWeek = Math.floor(diffSec / 604800);

            if (diffMin < 60) return `${diffMin}분 전`;
            else if (diffHour < 24) return `${diffHour}시간 전`;
            else if (diffDay <= 15) return `${diffDay}일 전`;  // ✅ 15일까지 "X일 전"
            else return `${diffWeek}주 전`;  // ✅ 16~29일 "X주 전"

        } catch (e) {
            return '확인필요';
        }
    }
}
