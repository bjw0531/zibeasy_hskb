/**
 * 브라우저/앱별 UI 설정 관리
 *
 * 설정값 가이드:
 * - topUIHeight:   숫자 낮추면 → 지도 상단 패딩 감소 (검색바 높이 기준)
 * - bottomUIHeight: 숫자 낮추면 → 마커 클릭 시 중심 이동 오프셋 감소
 * - centerOffsetY:  숫자 낮추면 → 마커가 화면 위쪽으로 올라감
 *
 * ✅ 네이버 로고 위치: map.css에서 CSS로 자동 처리 (환경별 수동 조정 불필요)
 * ✅ PC 데스크탑: 'auto' → searchBar/listPageBtn 실측값으로 동적 계산
 * ✅ 모바일: 앱/브라우저별 고정값
 */
class BrowserConfig {
    constructor() {
        this.browserType = this.detectBrowser();
        this.config = this.getConfig();
        console.log('🌐 브라우저 설정:', this.getDebugInfo());
    }

    /**
     * 브라우저/앱 감지
     */
    detectBrowser() {
        const ua = navigator.userAgent || '';
        const isIOS = /iPhone|iPad|iPod/.test(ua);
        const isAndroid = /Android/.test(ua);
        const isMobile = isIOS || isAndroid;
        
        // ✅ PC 데스크탑
        if (!isMobile) {
            return 'desktop';
        }
        
        // ✅ 카카오톡 인앱 브라우저
        if (ua.includes('KAKAOTALK')) {
            return isIOS ? 'ios_kakao' : 'android_kakao';
        }
        
        // ✅ 네이버 앱 (NAVER( 문자열 포함)
        if (ua.includes('NAVER(')) {
            return isIOS ? 'ios_naver' : 'android_naver';
        }
        
        // ✅ 삼성 인터넷 (안드로이드 전용) - 웹뷰보다 먼저!
        if (ua.includes('SamsungBrowser')) {
            return 'android_samsung';
        }
        
        // ✅ 웨일 브라우저 - 웹뷰보다 먼저!
        if (ua.includes('Whale')) {
            return isIOS ? 'ios_whale' : 'android_whale';
        }
        
        // ✅ 웹뷰 앱 (천안하우스 등) - 삼성/웨일 이후!
        if (ua.includes('; wv)') || ua.includes(';wv)')) {
            return isIOS ? 'ios_webview' : 'android_webview';
        }
        
        // ✅ 크롬 브라우저
        if (ua.includes('Chrome') || ua.includes('CriOS')) {
            return isIOS ? 'ios_chrome' : 'android_chrome';
        }
        
        // ✅ iOS 앱 (Standalone/Fullscreen 모드 - 주소창 없음)
        if (isIOS) {
            const isStandalone = window.navigator.standalone === true;
            const isFullscreen = window.matchMedia('(display-mode: standalone)').matches ||
                                 window.matchMedia('(display-mode: fullscreen)').matches;
            
            // 화면 높이 비율로 확인 (전체 화면 앱은 비율이 더 높음)
            const heightRatio = window.innerHeight / screen.height;
            const isFullscreenByRatio = heightRatio > 0.9; // 90% 이상이면 전체 화면 앱
            
            // 주소창이 없는 앱 모드 = 웹뷰 앱
            if (isStandalone || isFullscreen || isFullscreenByRatio) {
                return 'ios_webview';
            }
            
            // 그 외 = Safari (주소창 + 하단 툴바가 있어서 비율 낮음)
            return 'ios_safari';
        }
        
        // ✅ 기본값: 안드로이드 크롬
        return 'android_chrome';
    }

    /**
     * 앱별 설정값 (🔧 숫자를 직접 수정하세요)
     */
    getConfig() {
        const configs = {
            // ═══════════════════════════════════════════
            // PC 데스크탑 (동적 계산 - 'auto' 사용) ok
            // ═══════════════════════════════════════════
            desktop: {
                name: 'PC Desktop',
                topUIHeight: 'auto',      // ✅ 동적 계산
                bottomUIHeight: 'auto',   // ✅ 동적 계산
                centerOffsetY: 60,        // 낮추면 → 마커 위로
                // 🔧 동적 계산 결과에 추가할 오프셋 (직접 조정하세요)
                topAdjust: 10,             // 양수 → 지도 아래로 축소 / 음수 → 지도 위로 확장
                bottomAdjust: -50           // 양수 → 지도 위로 축소 / 음수 → 지도 아래로 확장
            },

            // ═══════════════════════════════════════════
            // 안드로이드
            // ═══════════════════════════════════════════
            
            // 안드로이드 - 네이버앱 ok
            android_naver: {
                name: 'Android Naver',
                topUIHeight: 55,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 5,        // 낮추면 → 지도 아래로 확장
                centerOffsetY: 60         // 낮추면 → 마커 위로
            },

            // 안드로이드 - 웹뷰앱 (천안하우스) ok
            android_webview: {
                name: 'Android WebView (천안하우스)',
                topUIHeight: 55,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 5,        // 낮추면 → 지도 아래로 확장
                centerOffsetY: 60         // 낮추면 → 마커 위로
            },

            // 안드로이드 - 삼성인터넷 ok
            android_samsung: {
                name: 'Android Samsung',
                topUIHeight: 60,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 60,       // 낮추면 → 지도 아래로 확장
                centerOffsetY: 10         // 낮추면 → 마커 위로
            },

            // 안드로이드 - 크롬 ok
            android_chrome: {
                name: 'Android Chrome',
                topUIHeight: 60,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 40,       // 낮추면 → 지도 아래로 확장
                centerOffsetY: 35         // 낮추면 → 마커 위로
            },

            // 안드로이드 - 웨일 ok
            android_whale: {
                name: 'Android Whale',
                topUIHeight: 60,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 65,       // 낮추면 → 지도 아래로 확장
                centerOffsetY: 20         // 낮추면 → 마커 위로
            },

            // 안드로이드 - 카카오톡 ok
            android_kakao: {
                name: 'Android KakaoTalk',
                topUIHeight: 60,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 5,        // 낮추면 → 지도 아래로 확장
                centerOffsetY: 60         // 낮추면 → 마커 위로
            },

            // ═══════════════════════════════════════════
            // iOS (아이폰)
            // ═══════════════════════════════════════════

            // iOS - 네이버앱 ok
            ios_naver: {
                name: 'iOS Naver',
                topUIHeight: 55,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 'auto',   // ✅ listPageBtn.offsetHeight 자동 측정 (safe area 포함)
                bottomAdjust: 5,          // 마커 중심 오프셋 보정용
                centerOffsetY: 55         // 낮추면 → 마커 위로
            },

            // iOS - 웹뷰앱 (천안하우스)
            ios_webview: {
                name: 'iOS WebView (천안하우스)',
                topUIHeight: 60,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 'auto',   // ✅ listPageBtn.offsetHeight 자동 측정 (safe area 포함)
                bottomAdjust: 5,
                centerOffsetY: 20         // 낮추면 → 마커 위로
            },

            // iOS - 사파리 ok
            ios_safari: {
                name: 'iOS Safari',
                topUIHeight: 60,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 'auto',   // ✅ listPageBtn.offsetHeight 자동 측정 (safe area 포함)
                bottomAdjust: 5,
                centerOffsetY: 20         // 낮추면 → 마커 위로
            },

            // iOS - 크롬 ok
            ios_chrome: {
                name: 'iOS Chrome',
                topUIHeight: 55,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 'auto',   // ✅ listPageBtn.offsetHeight 자동 측정 (safe area 포함)
                bottomAdjust: 5,
                centerOffsetY: 50         // 낮추면 → 마커 위로
            },

            // iOS - 웨일 ok
            ios_whale: {
                name: 'iOS Whale',
                topUIHeight: 55,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 'auto',   // ✅ listPageBtn.offsetHeight 자동 측정 (safe area 포함)
                bottomAdjust: 5,
                centerOffsetY: 50         // 낮추면 → 마커 위로
            },

            // iOS - 카카오톡
            ios_kakao: {
                name: 'iOS KakaoTalk',
                topUIHeight: 55,          // 낮추면 → 지도 위로 확장
                bottomUIHeight: 'auto',   // ✅ listPageBtn.offsetHeight 자동 측정 (safe area 포함)
                bottomAdjust: 5,
                centerOffsetY: 55         // 낮추면 → 마커 위로
            }
        };

        return configs[this.browserType] || configs['android_chrome'];
    }

    // ═══════════════════════════════════════════
    // Getter 함수들 (동적 계산 지원)
    // ═══════════════════════════════════════════
    
    /**
     * 실제 UI 요소 높이를 동적으로 측정
     */
    _measureUI() {
        const searchBar = document.getElementById('searchBar');
        const listPanel = document.getElementById('listPanel');
        const listPageBtn = document.getElementById('listPageBtn');
        
        const topHeight = searchBar ? searchBar.offsetHeight : 80;
        let bottomHeight = 70;
        
        // ✅ listPageBtn이 있으면 그 높이를 사용 (PC/모바일 공통 하단 버튼)
        if (listPageBtn && listPageBtn.offsetHeight > 0) {
            bottomHeight = listPageBtn.offsetHeight;
        } else if (listPanel) {
            const panelRect = listPanel.getBoundingClientRect();
            const visibleHeight = Math.max(0, window.innerHeight - panelRect.top);
            // ✅ 패널이 화면 50% 이상 차지하면 비정상 → 기본값 사용
            bottomHeight = visibleHeight > window.innerHeight * 0.5 ? 70 : visibleHeight;
        }
        
        return { topHeight, bottomHeight };
    }
    
    /**
     * ✅ iOS safe area(홈 인디케이터) 크기를 동적으로 측정
     * env(safe-area-inset-bottom)을 CSS에서 읽어 JS 숫자로 반환
     */
    _getSafeAreaBottom() {
        try {
            const probe = document.createElement('div');
            probe.style.cssText = 'position:fixed;height:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;';
            document.body.appendChild(probe);
            const value = probe.offsetHeight || 0; // paddingBottom이 offsetHeight에 반영됨
            probe.remove();
            return value;
        } catch (e) {
            return 0;
        }
    }

    getTopUIHeight() {
        if (this.config.topUIHeight === 'auto') {
            const { topHeight } = this._measureUI();
            const adjust = this.config.topAdjust || 0;
            return topHeight + adjust;
        }
        return this.config.topUIHeight;
    }

    getBottomUIHeight() {
        if (this.config.bottomUIHeight === 'auto') {
            const { bottomHeight } = this._measureUI();
            const adjust = this.config.bottomAdjust || 0;

            // ✅ iOS fallback: listPageBtn.offsetHeight가 측정 안 됐을 때 대비
            // CSS 로딩 타이밍 이슈로 초기엔 offsetHeight=0 → 기본값 70 반환 가능
            // 70 이하면 실측 실패로 보고 safe area + 고정 버튼 높이(60)로 보완
            if (this.browserType.startsWith('ios_') && bottomHeight <= 70) {
                const safeArea = this._getSafeAreaBottom();
                const fallback = 60 + safeArea + adjust;
                console.log(`⚠️ iOS bottomUIHeight fallback: 60 + safeArea(${safeArea}) + adjust(${adjust}) = ${fallback}px`);
                return fallback;
            }

            return bottomHeight + adjust;
        }
        // ✅ iOS 고정값 모드: safe area(홈 인디케이터 높이)를 더해서 패딩 계산
        if (this.browserType.startsWith('ios_')) {
            const safeArea = this._getSafeAreaBottom();
            return this.config.bottomUIHeight + safeArea;
        }
        return this.config.bottomUIHeight;
    }

    getCenterOffsetY() {
        return this.config.centerOffsetY;
    }

    get platform() {
        return this.browserType;
    }

    getDebugInfo() {
        const measured = this._measureUI();
        return {
            browser: this.browserType,
            name: this.config.name,
            topUIHeight: this.config.topUIHeight === 'auto' ? `auto (${measured.topHeight})` : this.config.topUIHeight,
            bottomUIHeight: this.config.bottomUIHeight === 'auto' ? `auto (${measured.bottomHeight})` : this.config.bottomUIHeight,
            centerOffsetY: this.config.centerOffsetY
        };
    }
}

// ✅ 전역 인스턴스 생성
window.browserConfig = new BrowserConfig();
