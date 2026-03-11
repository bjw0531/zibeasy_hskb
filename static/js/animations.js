// /**
//  * 애니메이션 관리자
//  * 패널 슬라이딩 애니메이션 담당
//  */

// class AnimationManager {
//     constructor() {
//         this.animationDuration = 400;
//     }
    
//     /**
//      * 목록 패널 열기 (아래에서 위로)
//      */
//     slideUp(element) {
//         if (typeof element === 'string') {
//             element = document.querySelector(element);
//         }
//         if (!element) return;
        
//         element.classList.add('active');
        
//         return new Promise(resolve => {
//             setTimeout(resolve, this.animationDuration);
//         });
//     }
    
//     /**
//      * 목록 패널 닫기 (위에서 아래로)
//      */
//     slideDown(element) {
//         if (typeof element === 'string') {
//             element = document.querySelector(element);
//         }
//         if (!element) return;
        
//         element.classList.remove('active');
        
//         return new Promise(resolve => {
//             setTimeout(resolve, this.animationDuration);
//         });
//     }
    
//     /**
//      * 상세 패널 열기 (오른쪽에서 왼쪽으로)
//      */
//     slideInRight(element) {
//         if (typeof element === 'string') {
//             element = document.querySelector(element);
//         }
//         if (!element) return;
        
//         element.classList.add('active');
        
//         return new Promise(resolve => {
//             setTimeout(resolve, this.animationDuration);
//         });
//     }
    
//     /**
//      * 상세 패널 닫기 (왼쪽에서 오른쪽으로)
//      */
//     slideOutRight(element) {
//         if (typeof element === 'string') {
//             element = document.querySelector(element);
//         }
//         if (!element) return;
        
//         element.classList.remove('active');
        
//         return new Promise(resolve => {
//             setTimeout(resolve, this.animationDuration);
//         });
//     }
    
//     /**
//      * 페이드 인
//      */
//     fadeIn(element, duration = this.animationDuration) {
//         if (typeof element === 'string') {
//             element = document.querySelector(element);
//         }
//         if (!element) return;
        
//         element.style.opacity = '0';
//         element.style.display = 'block';
//         element.style.transition = `opacity ${duration}ms ease-in-out`;
        
//         requestAnimationFrame(() => {
//             element.style.opacity = '1';
//         });
        
//         return new Promise(resolve => {
//             setTimeout(() => {
//                 element.style.transition = '';
//                 resolve();
//             }, duration);
//         });
//     }
    
//     /**
//      * 페이드 아웃
//      */
//     fadeOut(element, duration = this.animationDuration) {
//         if (typeof element === 'string') {
//             element = document.querySelector(element);
//         }
//         if (!element) return;
        
//         element.style.transition = `opacity ${duration}ms ease-in-out`;
//         element.style.opacity = '0';
        
//         return new Promise(resolve => {
//             setTimeout(() => {
//                 element.style.display = 'none';
//                 element.style.transition = '';
//                 resolve();
//             }, duration);
//         });
//     }
    
//     /**
//      * 로딩 표시
//      */
//     showLoading(element) {
//         if (typeof element === 'string') {
//             element = document.querySelector(element);
//         }
//         if (!element) return;
        
//         element.innerHTML = '<div class="loading"></div>';
//         element.style.display = 'flex';
//         element.style.justifyContent = 'center';
//         element.style.alignItems = 'center';
//         element.style.padding = '40px';
//     }
    
//     /**
//      * 로딩 숨김
//      */
//     hideLoading(element) {
//         if (typeof element === 'string') {
//             element = document.querySelector(element);
//         }
//         if (!element) return;
        
//         element.innerHTML = '';
//         element.style.display = '';
//         element.style.justifyContent = '';
//         element.style.alignItems = '';
//         element.style.padding = '';
//     }
    
//     /**
//      * 애니메이션 즉시 중지
//      */
//     stop(element) {
//         if (typeof element === 'string') {
//             element = document.querySelector(element);
//         }
//         if (!element) return;
        
//         element.style.animation = '';
//         element.style.transition = '';
//     }
// }

// // 전역 인스턴스 생성
// window.animationManager = new AnimationManager();





