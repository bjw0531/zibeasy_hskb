/**
 * 매물 상세 관리자
 * 매물 상세 패널의 표시, 이미지 갤러리, 연락처 기능을 담당
 */

class DetailManager {
    constructor(appManager) {
        this.appManager = appManager;
        this.currentProperty = null;
        this.currentImageIndex = 0;
        this.images = [];
        this.isLoading = false;
        this.isVideoMode = false;
        this.retryCount = 0;
    }

    /**
     * 상세 매니저 초기화
     */
    init() {
        console.log('🏠 상세 매니저 초기화...');
        this.setupEventListeners();
    }

    /**
     * 이벤트 리스너 설정
     */
    setupEventListeners() {
        // 뒤로가기 버튼
        const backBtn = document.querySelector('.detail-back-btn');
        if (backBtn) {
            backBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('📚 상세 패널 뒤로가기 버튼 클릭');

                if (this.appManager && this.appManager.historyManager) {
                    this.appManager.historyManager.goBack();
                } else {
                    this.appManager.hideDetailPanel();
                }
            });
        }

        // 액션 버튼들
        const actionBtns = document.querySelectorAll('.detail-action-btn');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = e.target.dataset.action || e.target.closest('.detail-action-btn')?.dataset.action;
                if (action) {
                    this.handleAction(action);
                }
            });
        });

        // 갤러리 이벤트
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('detail-gallery-prev')) {
                this.previousImage();
            } else if (e.target.classList.contains('detail-gallery-next')) {
                this.nextImage();
            } else if (e.target.classList.contains('detail-gallery-indicator')) {
                const index = parseInt(e.target.dataset.index);
                this.goToImage(index);
            }
        });
    }

    /**
     * 매물 로드
     */
    async loadProperty(propertyId) {
        if (this.isLoading) {
            console.log('⏳ 이미 로딩 중입니다.');
            return;
        }

        this.isLoading = true;
        this.retryCount = 0;

        try {
            console.log(`🏠 매물 로드 시작: ${propertyId}`);

            // 로딩 상태 표시
            this.showLoading();

            // API 호출
            const response = await fetch(`/api/property/${propertyId}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const responseData = await response.json();
            console.log('✅ 매물 데이터 로드 완료:', responseData);

            // API 응답 구조 확인 및 데이터 추출
            if (!responseData.success) {
                throw new Error(responseData.error || '매물 데이터를 불러올 수 없습니다');
            }

            const property = responseData.data;
            if (!property) {
                throw new Error('매물 데이터가 없습니다');
            }

            // 매물 정보 설정
            this.currentProperty = property;
            this.currentImageIndex = 0;
            this.images = this.getPropertyImages(property);

            // 매물 정보 렌더링
            this.renderProperty();

            // 상세 패널 표시
            this.showDetailPanel();

        } catch (error) {
            console.error('❌ 매물 로드 실패:', error);
            this.showError(`매물 정보를 불러올 수 없습니다: ${error.message}`);
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * 매물 정보 렌더링
     */
    renderProperty() {
        console.log('🎨 매물 정보 렌더링 시작');

        if (!this.currentProperty) {
            console.error('❌ 렌더링할 매물 정보가 없습니다.');
            return;
        }

        const property = this.currentProperty;

        // 매물번호 업데이트
        this.updatePropertyCode(property.code);

        // 갤러리 렌더링
        this.renderGallery();

        // 요약 정보 렌더링
        this.renderSummary(property);

        // 가격 정보 렌더링
        this.renderPrice(property);

        // 상세 정보 렌더링
        this.renderDetails(property);

        // 연락처 렌더링
        this.renderContact(property);

        console.log('✅ 매물 정보 렌더링 완료');
    }

    /**
     * 매물번호 업데이트
     */
    updatePropertyCode(code) {
        const codeElements = document.querySelectorAll('.code-value');
        codeElements.forEach(element => {
            element.textContent = code || '-';
        });
    }

    /**
     * 매물 이미지 정보 가져오기
     */
    getPropertyImages(property) {
        const images = [];

        // picname1부터 picname10까지 확인
        for (let i = 1; i <= 10; i++) {
            const picname = property[`picname${i}`];
            if (picname && picname.trim()) {
                images.push({
                    url: `/images/maemul/big/${picname}`,
                    alt: `${property.title || '매물'} - 이미지 ${i}`
                });
            }
        }

        console.log(`📸 매물 이미지 ${images.length}개 발견:`, images);
        return images;
    }

    /**
     * 이전 이미지로 이동
     */
    previousImage() {
        if (this.images.length <= 1) return;

        this.currentImageIndex = (this.currentImageIndex - 1 + this.images.length) % this.images.length;
        this.updateSliderPosition();
        this.updateGalleryCounter();
    }

    /**
     * 다음 이미지로 이동
     */
    nextImage() {
        if (this.images.length <= 1) return;

        this.currentImageIndex = (this.currentImageIndex + 1) % this.images.length;
        this.updateSliderPosition();
        this.updateGalleryCounter();
    }

    /**
     * 특정 이미지로 이동
     */
    goToImage(index) {
        if (index < 0 || index >= this.images.length) return;

        this.currentImageIndex = index;
        this.updateSliderPosition();
        this.updateGalleryCounter();
    }

    /**
     * 슬라이더 위치 업데이트
     */
    updateSliderPosition() {
        const gallerySlider = document.querySelector('.detail-gallery-slider');
        if (!gallerySlider) return;

        const translateX = -this.currentImageIndex * 100;
        gallerySlider.style.transform = `translateX(${translateX}%)`;
        console.log(`🎯 슬라이더 위치 업데이트: ${translateX}%`);
    }

    /**
     * 갤러리 카운터 업데이트
     */
    updateGalleryCounter() {
        const counter = document.querySelector('.detail-gallery-counter');
        if (counter && this.images.length > 0) {
            counter.textContent = `${this.currentImageIndex + 1} / ${this.images.length}`;
        }
    }

    /**
     * 갤러리 렌더링
     */
    renderGallery() {
        console.log('🖼️ renderGallery 호출됨');

        const gallerySlider = document.querySelector('.detail-gallery-slider');
        const counter = document.querySelector('.detail-gallery-counter');
        const videoBtn = document.querySelector('.detail-gallery-video-btn');
        const imageBtn = document.querySelector('.detail-gallery-image-btn');

        if (!gallerySlider) {
            console.error('❌ .detail-gallery-slider 요소를 찾을 수 없습니다.');
            return;
        }

        if (this.images.length === 0) {
            // 이미지가 없는 경우
            gallerySlider.innerHTML = `
                <div class="detail-gallery-slide">
                    <div class="detail-gallery-placeholder">
                        <div class="placeholder-icon">📷</div>
                        <div class="placeholder-text">이미지가 없습니다</div>
                    </div>
                </div>
            `;

            // 모든 요소들 숨기기
            if (counter) counter.style.display = 'none';
            if (videoBtn) videoBtn.style.display = 'none';
            if (imageBtn) imageBtn.style.display = 'none';
            return;
        }

        // 모든 이미지를 슬라이드로 생성
        gallerySlider.innerHTML = '';
        this.images.forEach((image, index) => {
            const slide = document.createElement('div');
            slide.className = 'detail-gallery-slide';
            slide.dataset.index = index;

            const img = document.createElement('img');
            img.alt = image.alt;
            img.className = 'detail-gallery-image';
            img.src = image.url;

            img.onerror = function () {
                console.log('❌ 이미지 로드 실패:', this.src);
                this.style.display = 'none';
            };

            slide.appendChild(img);
            gallerySlider.appendChild(slide);
        });

        // 카운터 표시
        if (counter) {
            counter.style.display = 'block';
            counter.textContent = `${this.currentImageIndex + 1} / ${this.images.length}`;
        }

        // 유튜브 버튼 표시 (동영상이 있는 경우)
        const hasVideo = this.currentProperty && this.currentProperty.movie;
        if (videoBtn) {
            if (hasVideo && !this.isVideoMode) {
                videoBtn.style.display = 'flex';
            } else {
                videoBtn.style.display = 'none';
            }
        }

        // 이미지 버튼 표시 (동영상 모드일 때)
        if (imageBtn) {
            if (this.isVideoMode) {
                imageBtn.style.display = 'flex';
            } else {
                imageBtn.style.display = 'none';
            }
        }

        // 슬라이더 위치 업데이트
        this.updateSliderPosition();

        // 터치 이벤트 추가
        this.addTouchEvents();

        // 유튜브/이미지 버튼 이벤트 추가
        this.addButtonEvents();
    }

    /**
     * 터치 이벤트 추가
     */
    addTouchEvents() {
        const galleryContainer = document.querySelector('.detail-gallery-container');
        if (!galleryContainer) return;

        let isDragging = false;
        let startX = 0;
        let currentX = 0;
        let startTranslateX = 0;
        let currentTranslateX = 0;

        // 터치 이벤트
        galleryContainer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.images.length <= 1) return;

            isDragging = true;
            startX = e.touches[0].clientX;
            currentX = startX;

            const gallerySlider = document.querySelector('.detail-gallery-slider');
            if (gallerySlider) {
                const transform = gallerySlider.style.transform;
                const match = transform.match(/translateX\(([^)]+)%\)/);
                startTranslateX = match ? parseFloat(match[1]) : -this.currentImageIndex * 100;
            }
        });

        galleryContainer.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            e.preventDefault();

            currentX = e.touches[0].clientX;
            const deltaX = currentX - startX;
            const sensitivity = 0.8;

            currentTranslateX = startTranslateX + (deltaX * sensitivity);

            // 경계값 제한
            const maxTranslateX = 0;
            const minTranslateX = -(this.images.length - 1) * 100;

            if (currentTranslateX > maxTranslateX) {
                const overshoot = currentTranslateX - maxTranslateX;
                currentTranslateX = maxTranslateX + overshoot * 0.3;
            } else if (currentTranslateX < minTranslateX) {
                const overshoot = minTranslateX - currentTranslateX;
                currentTranslateX = minTranslateX - overshoot * 0.3;
            }

            const gallerySlider = document.querySelector('.detail-gallery-slider');
            if (gallerySlider) {
                gallerySlider.style.transform = `translateX(${currentTranslateX}%)`;
            }
        });

        galleryContainer.addEventListener('touchend', (e) => {
            if (!isDragging) return;
            e.preventDefault();
            isDragging = false;

            const deltaX = currentX - startX;
            const threshold = 50;

            if (Math.abs(deltaX) > threshold) {
                if (deltaX > 0) {
                    this.previousImage();
                } else {
                    this.nextImage();
                }
            } else {
                this.updateSliderPosition();
            }
        });
    }

    /**
     * 버튼 이벤트 추가
     */
    addButtonEvents() {
        // 유튜브 버튼
        const videoBtn = document.querySelector('.detail-gallery-video-btn');
        if (videoBtn) {
            videoBtn.addEventListener('click', () => {
                this.toggleVideoMode();
            });
        }

        // 이미지 버튼
        const imageBtn = document.querySelector('.detail-gallery-image-btn');
        if (imageBtn) {
            imageBtn.addEventListener('click', () => {
                this.toggleVideoMode();
            });
        }
    }

    /**
     * 동영상 모드 토글
     */
    toggleVideoMode() {
        this.isVideoMode = !this.isVideoMode;

        const videoBtn = document.querySelector('.detail-gallery-video-btn');
        const imageBtn = document.querySelector('.detail-gallery-image-btn');

        if (this.isVideoMode) {
            this.showVideo();
            if (videoBtn) videoBtn.style.display = 'none';
            if (imageBtn) imageBtn.style.display = 'flex';
        } else {
            this.showImages();
            if (videoBtn) videoBtn.style.display = 'flex';
            if (imageBtn) imageBtn.style.display = 'none';
        }
    }

    /**
     * 동영상 표시
     */
    showVideo() {
        const gallerySlider = document.querySelector('.detail-gallery-slider');
        if (!gallerySlider || !this.currentProperty || !this.currentProperty.movie) return;

        const videoUrl = this.currentProperty.movie;
        gallerySlider.innerHTML = `
            <div class="detail-gallery-slide">
                <div class="detail-gallery-video">
                    <iframe 
                        src="${videoUrl}" 
                        frameborder="0" 
                        allowfullscreen
                        style="width: 100%; height: 100%;">
                    </iframe>
                </div>
            </div>
        `;
    }

    /**
     * 이미지 표시
     */
    showImages() {
        this.renderGallery();
    }

    /**
     * 요약 정보 렌더링
     */
    renderSummary(property) {
        const summaryElement = document.querySelector('.detail-summary');
        if (!summaryElement) return;

        const registerTime = this.formatDateTime(property.ldate);
        const priceInfo = this.generatePriceInfo(property);

        summaryElement.innerHTML = `
            <div class="detail-summary-header">
                <div class="detail-property-code-tag">
                    <span class="code-label">매물번호</span>
                    <span class="code-value">${property.code || '-'}</span>
                </div>
                <div class="detail-register-time">${registerTime}</div>
            </div>
            
            <div class="detail-price-section">
                <div class="detail-main-price">${priceInfo.mainPrice}</div>
                <div class="detail-management-fee">${priceInfo.managementFee}</div>
            </div>
            
            <div class="detail-description">
                <h2 class="detail-property-title">${this.escapeHtml(property.title || '매물 정보')}</h2>
            </div>
        `;
    }

    /**
     * 가격 정보 렌더링
     */
    renderPrice(property) {
        const priceContainer = document.querySelector('.detail-price-container');
        if (!priceContainer) return;

        const priceInfo = this.generateDetailedPriceInfo(property);

        priceContainer.innerHTML = `
            <div class="detail-price-grid">
                ${priceInfo.map(item => `
                    <div class="price-item ${item.primary ? 'primary' : item.secondary ? 'secondary' : ''}">
                        <span class="price-label">${item.label}</span>
                        <span class="price-value">${item.value}</span>
                    </div>
                `).join('')}
            </div>
        `;

        // 하단 액션 바 가격 업데이트
        const actionPrice = document.querySelector('.detail-action-price');
        if (actionPrice) {
            actionPrice.textContent = priceInfo.find(item => item.primary)?.value || '가격 문의';
        }
    }

    /**
     * 상세 정보 렌더링
     */
    renderDetails(property) {
        const sectionsContainer = document.querySelector('.detail-sections');
        if (!sectionsContainer) return;

        const sections = this.generateDetailSections(property);

        sectionsContainer.innerHTML = sections.map(section => `
            <div class="detail-section">
                <div class="detail-section-title">${section.title}</div>
                <div class="detail-section-content">${section.content}</div>
            </div>
        `).join('');
    }

    /**
     * 연락처 렌더링
     */
    renderContact(property) {
        const contactElement = document.querySelector('.detail-contact');
        if (!contactElement) return;

        const contactInfo = this.generateContactInfo(property);

        contactElement.innerHTML = `
            <div class="detail-section">
            <div class="detail-section-title">📞 연락처</div>
            <div class="detail-contact-info">
                    <div class="contact-name">${this.escapeHtml(contactInfo.name)}</div>
                    <div class="contact-phone">${this.escapeHtml(contactInfo.phone)}</div>
            </div>
            <div class="detail-contact-buttons">
                    <button class="detail-contact-btn primary" onclick="window.location.href='tel:${contactInfo.phone}'">
                        <i class="fas fa-phone"></i> 전화하기
                </button>
                    <button class="detail-contact-btn secondary" onclick="window.location.href='sms:${contactInfo.phone}'">
                        <i class="fas fa-sms"></i> 문자하기
                </button>
                </div>
            </div>
        `;
    }

    /**
     * 가격 정보 생성 (요약용)
     */
    generatePriceInfo(property) {
        const maemaeMoney = property.maemae_money;
        const securityMoney = property.security_money;
        const monthMoney = property.month_money;
        const publicMoney = property.public_money;

        let mainPrice = '가격 문의';
        let managementFee = '';

        if (maemaeMoney && maemaeMoney > 0) {
            mainPrice = `매매 ${this.formatNumber(maemaeMoney)}만원`;
        } else if (securityMoney && securityMoney > 0) {
            const deposit = securityMoney > 0 ? `보증금 ${this.formatNumber(securityMoney)}만원 ` : '';
            const monthly = monthMoney > 0 ? `월세 ${this.formatNumber(monthMoney)}만원` : '';
            mainPrice = deposit + monthly;
        }

        if (publicMoney && publicMoney > 0) {
            managementFee = `관리비 ${this.formatNumber(publicMoney)}만원`;
        }

        return { mainPrice, managementFee };
    }

    /**
     * 상세 가격 정보 생성
     */
    generateDetailedPriceInfo(property) {
        const prices = [];

        // 매매가
        if (property.maemae_money && property.maemae_money > 0) {
            prices.push({
                label: '매매',
                value: `${this.formatNumber(property.maemae_money)}만원`,
                primary: true
            });
        }

        // 전세가
        if (property.jen_money && property.jen_money > 0) {
            prices.push({
                label: '전세',
                value: `${this.formatNumber(property.jen_money)}만원`,
                primary: true
            });
        }

        // 보증금/월세
        if (property.security_money && property.security_money > 0) {
            const deposit = this.formatNumber(property.security_money);
            const monthly = property.month_money && property.month_money > 0
                ? ` / ${this.formatNumber(property.month_money)}만원`
                : '';
            prices.push({
                label: '보증금/월세',
                value: `${deposit}만원${monthly}`,
                secondary: true
            });
        }

        // 관리비
        if (property.public_money && property.public_money > 0) {
            prices.push({
                label: '관리비',
                value: `${this.formatNumber(property.public_money)}만원`
            });
        }

        if (prices.length === 0) {
            prices.push({
                label: '가격',
                value: '가격 문의',
                primary: true
            });
        }

        return prices;
    }

    /**
     * 상세 섹션 생성
     */
    generateDetailSections(property) {
        const sections = [];

        // 기본 정보
        const basicInfo = this.generateBasicInfo(property);
        if (basicInfo.length > 0) {
            sections.push({
                title: '🏠 기본 정보',
                content: `
                    <div class="detail-info-grid">
                        ${basicInfo.map(item => `
                            <div class="detail-info-item">
                                <span class="detail-info-label">${item.label}</span>
                                <span class="detail-info-value">${this.escapeHtml(item.value)}</span>
                            </div>
                        `).join('')}
                    </div>
                `
            });
        }

        // 건물 정보
        const buildingInfo = this.generateBuildingInfo(property);
        if (buildingInfo.length > 0) {
            sections.push({
                title: '🏢 건물 정보',
                content: `
                    <div class="detail-info-grid">
                        ${buildingInfo.map(item => `
                            <div class="detail-info-item">
                                <span class="detail-info-label">${item.label}</span>
                                <span class="detail-info-value">${this.escapeHtml(item.value)}</span>
                            </div>
                        `).join('')}
                    </div>
                `
            });
        }

        // 상세 설명
        if (property.memo && property.memo.trim()) {
            sections.push({
                title: '📝 상세 설명',
                content: `<div class="detail-section-content">${this.nl2br(this.escapeHtml(property.memo))}</div>`
            });
        }

        return sections;
    }

    /**
     * 기본 정보 생성
     */
    generateBasicInfo(property) {
        const info = [];

        if (property.size) info.push({ label: '전용면적', value: `${property.size}㎡` });
        if (property.gudxo) info.push({ label: '방 수', value: `${property.gudxo}개` });
        if (property.gudxo1) info.push({ label: '거실 구조', value: property.gudxo1 });
        if (property.gudxo2) info.push({ label: '욕실 수', value: `${property.gudxo2}개` });
        if (property.aspect) info.push({ label: '방향', value: property.aspect });
        if (property.parking) info.push({ label: '주차', value: `${property.parking}대` });

        return info;
    }

    /**
     * 건물 정보 생성
     */
    generateBuildingInfo(property) {
        const info = [];

        if (property.build_use_type) info.push({ label: '건물 종류', value: property.build_use_type });
        if (property.build_year) info.push({ label: '준공년도', value: `${property.build_year}년` });
        if (property.total_floor) info.push({ label: '총 층수', value: `${property.total_floor}층` });
        if (property.now_floor) info.push({ label: '현재 층수', value: `${property.now_floor}층` });
        if (property.build_access_date) info.push({ label: '사용승인일', value: property.build_access_date });
        if (property.movein_day) info.push({ label: '입주가능일', value: property.movein_day });

        return info;
    }

    /**
     * 연락처 정보 생성
     */
    generateContactInfo(property) {
        const name = property.contact_name || property.name || '담당자';
        const phone = property.contact_phone || property.phone || '연락처 없음';

        return { name, phone };
    }

    /**
     * 액션 처리
     */
    handleAction(action) {
        console.log(`🔧 액션 처리: ${action}`);

        switch (action) {
            case 'share':
                this.shareProperty();
                break;
            case 'favorite':
                this.toggleFavorite();
                break;
            case 'chat':
                this.startChat();
                break;
            case 'kakao':
                this.startKakaoTalk();
                break;
            case 'call':
                this.makeCall();
                break;
            default:
                console.log(`알 수 없는 액션: ${action}`);
        }
    }

    /**
     * 공유하기
     */
    shareProperty() {
        if (!this.currentProperty) return;

        const url = window.location.href;
        const title = this.currentProperty.title || '매물 정보';

        if (navigator.share) {
            navigator.share({
                title: title,
                text: '이 매물을 확인해보세요!',
                url: url
            });
        } else {
            navigator.clipboard.writeText(url).then(() => {
                alert('링크가 클립보드에 복사되었습니다.');
            });
        }
    }

    /**
     * 찜하기 토글
     */
    toggleFavorite() {
        if (!this.currentProperty) return;

        const id = this.currentProperty.code || this.currentProperty.idx;
        console.log('찜하기 토글:', id);

        if (typeof toggleLike === 'function') {
            toggleLike(id);

            // 버튼 상태 업데이트 (필요 시)
            // 상세 패널의 하트 아이콘이 있다면 업데이트해야 함
        } else {
            console.error('toggleLike 함수를 찾을 수 없습니다.');
        }
    }

    /**
     * 채팅 시작
     */
    startChat() {
        if (!this.currentProperty) return;

        console.log('채팅 시작:', this.currentProperty.code);
        alert('채팅 기능은 준비 중입니다.');
    }

    /**
     * 카카오톡 시작
     */
    startKakaoTalk() {
        if (!this.currentProperty) return;

        console.log('카카오톡 시작:', this.currentProperty.code);
        alert('카카오톡 기능은 준비 중입니다.');
    }

    /**
     * 전화 걸기
     */
    makeCall() {
        if (!this.currentProperty) return;

        const phone = this.currentProperty.phone || this.currentProperty.contact_phone;
        if (phone) {
            window.location.href = `tel:${phone}`;
        } else {
            alert('연락처 정보가 없습니다.');
        }
    }

    /**
     * 상세 패널 표시
     */
    showDetailPanel() {
        const detailPanel = document.querySelector('.detail-panel');
        if (detailPanel) {
            detailPanel.classList.add('active');
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
            console.log('✅ 상세 패널 숨겨짐');
        }
    }

    /**
     * 로딩 상태 표시
     */
    showLoading() {
        const detailContent = document.querySelector('.detail-content');
        if (detailContent) {
            detailContent.innerHTML = `
                <div class="detail-loading">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">매물 정보를 불러오는 중...</div>
                </div>
            `;
        }
    }

    /**
     * 에러 상태 표시
     */
    showError(message) {
        const detailContent = document.querySelector('.detail-content');
        if (detailContent) {
            detailContent.innerHTML = `
                <div class="detail-error">
                    <div class="detail-error-icon">⚠️</div>
                    <div class="detail-error-message">${this.escapeHtml(message)}</div>
                    <button class="detail-error-retry btn btn-primary" onclick="window.appManager.detailManager.loadProperty(window.appManager.currentState.selectedProperty)">
                        다시 시도
                    </button>
                </div>
            `;
        }
    }

    /**
     * 날짜/시간 포맷팅
     */
    formatDateTime(dateString) {
        if (!dateString) return '-';

        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

            if (diffDays === 0) {
                return '오늘 등록';
            } else if (diffDays === 1) {
                return '어제 등록';
            } else if (diffDays < 7) {
                return `${diffDays}일 전 등록`;
            } else {
                return date.toLocaleDateString('ko-KR');
            }
        } catch (error) {
            return dateString;
        }
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
     * 줄바꿈을 <br>로 변환
     */
    nl2br(text) {
        if (!text) return '';
        return text.replace(/\n/g, '<br>');
    }

    /**
     * 숫자 포맷팅
     */
    formatNumber(num) {
        if (!num || num === 0) return '0';
        return parseInt(num).toLocaleString();
    }
}
