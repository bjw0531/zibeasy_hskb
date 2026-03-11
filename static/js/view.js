/* ─────────────────────────────────────────────────────────────
   view.js — 매물 상세 페이지 JavaScript
   Jinja2 변수는 view.html의 window.viewData 초기화 블록에서 주입됩니다.
   { lat, lng, videoId, code, dong, priceText, picname1, kakaoKey }
   ───────────────────────────────────────────────────────────── */

/* ── Lucide 아이콘 초기화 ── */
lucide.createIcons();

/* ── HTML 이스케이프 유틸 (XSS 방지) ── */
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/* ═══════════════════════════════════════════════════════════════
   툴팁 (매물 최종 확인일)
   ═══════════════════════════════════════════════════════════════ */
let tooltipAutoCloseTimer = null;

function toggleLastEditTooltip(event) {
    event.stopPropagation();
    const tooltip = document.getElementById('last-edit-tooltip');
    if (!tooltip) return;

    if (tooltipAutoCloseTimer) {
        clearTimeout(tooltipAutoCloseTimer);
        tooltipAutoCloseTimer = null;
    }

    if (tooltip.classList.contains('hidden')) {
        tooltip.classList.remove('hidden');
        /* 바깥 클릭 시 닫기 — 현재 이벤트 버블링 완료 후 등록 */
        setTimeout(() => document.addEventListener('click', closeLastEditTooltip), 10);
        /* 5초 후 자동 닫기 */
        tooltipAutoCloseTimer = setTimeout(closeLastEditTooltip, 5000);
    } else {
        tooltip.classList.add('hidden');
        document.removeEventListener('click', closeLastEditTooltip);
    }
}

function closeLastEditTooltip() {
    const tooltip = document.getElementById('last-edit-tooltip');
    if (tooltip) tooltip.classList.add('hidden');
    document.removeEventListener('click', closeLastEditTooltip);
    if (tooltipAutoCloseTimer) {
        clearTimeout(tooltipAutoCloseTimer);
        tooltipAutoCloseTimer = null;
    }
}

/* ═══════════════════════════════════════════════════════════════
   채팅 문의 모달
   ═══════════════════════════════════════════════════════════════ */
function openChatModal() {
    const modal = document.getElementById('chatModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
}

function closeChatModal() {
    const modal = document.getElementById('chatModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = '';
}

function overlayClick(e) {
    if (e.target.id === 'chatModal') closeChatModal();
}

/* ═══════════════════════════════════════════════════════════════
   YouTube 영상 플레이어
   ═══════════════════════════════════════════════════════════════ */
let ytPlayer      = null;
let ytToggle      = false;
let ytInitialized = false;
let isPlayerReady = false;

function toggleVideo() {
    const ytVideo  = document.getElementById('yt-video');
    const videoBtn = document.getElementById('video-btn');
    if (!ytVideo) return;

    if (ytToggle) {
        /* 영상 끄기 */
        ytVideo.classList.add('hidden');
        if (ytPlayer && typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo();
        /* 버튼 내용은 신뢰된 정적 HTML — 사용자 입력 아님 */
        videoBtn.innerHTML =
            '<div class="w-5 h-5 flex items-center shrink-0">' +
                '<img class="w-full" src="/static/images/movie_icon.png" alt="영상 있음">' +
            '</div>영상 보기';
        ytToggle = false;
    } else {
        /* 영상 켜기 (최초 1회만 플레이어 초기화) */
        ytVideo.classList.remove('hidden');
        if (!ytInitialized) { initYoutubePlayer(); ytInitialized = true; }
        videoBtn.innerHTML =
            '<div class="w-5 h-5 flex items-center">' +
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"' +
                '     stroke="currentColor" stroke-width="2" class="w-full h-full">' +
                    '<path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16"/>' +
                    '<path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"/>' +
                    '<circle cx="13" cy="7" r="1" fill="currentColor"/>' +
                    '<rect x="8" y="2" width="14" height="14" rx="2"/>' +
                '</svg>' +
            '</div>사진 보기';
        ytToggle = true;
    }
}

function initYoutubePlayer() {
    const { videoId } = window.viewData;
    if (!videoId) return;
    /* YT IFrame API 로드 완료 대기 */
    if (!window.YT || !window.YT.Player) { setTimeout(initYoutubePlayer, 100); return; }
    ytPlayer = new YT.Player('video-player-root', {
        height: '100%', width: '100%', videoId,
        playerVars: { autoplay: 0, controls: 1, enablejsapi: 1, rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
            onReady:       ()      => { isPlayerReady = true; },
            onStateChange: event => {
                if (event.data === YT.PlayerState.PLAYING)
                    document.getElementById('yt-poster')?.classList.add('hidden');
            }
        }
    });
}

function startRealVideo() {
    if (ytPlayer) {
        ytPlayer.playVideo();
        document.getElementById('yt-poster')?.classList.add('hidden');
    }
}

/* ═══════════════════════════════════════════════════════════════
   카카오 지도 공통 유틸
   ═══════════════════════════════════════════════════════════════ */

/* 매물 위치 마커 아이콘 HTML (신뢰된 정적 문자열) */
function createClusterIcon() {
    return '<div class="rounded-full flex items-center justify-center text-white z-[99]"' +
               ' style="width:55px;height:55px;background:rgba(255,100,105,0.3);">' +
               '<div class="rounded-full flex items-center justify-center text-white z-[100]"' +
                    ' style="width:45px;height:45px;background:rgba(255,100,105,0.85);font-size:12px;">' +
                   '<span class="leading-tight text-[11px] font-normal whitespace-nowrap' +
                               ' absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">' +
                       '매물<br>위치' +
                   '</span>' +
               '</div>' +
           '</div>';
}

/* ═══════════════════════════════════════════════════════════════
   카카오 지도 상세 모달 (POI 주변 시설 포함)
   ═══════════════════════════════════════════════════════════════ */
let modalMap          = null;
let modalMarkerOverlay = null;
const poiMarkers       = {};           /* 카테고리별 {overlay, infoOverlay}[] */
const activeCategories = new Set();
let openInfoWindow    = null;          /* 현재 열린 InfoWindow (전역) */
let radiusCircle      = null;          /* 500m 반경 원 */

const POI_ICONS = {
    bus:         { emoji: '🚌', color: '#3B82F6', name: '버스정류장' },
    convenience: { emoji: '🏪', color: '#10B981', name: '편의점'    },
    laundry:     { emoji: '👔', color: '#8B5CF6', name: '세탁소'    },
    bank:        { emoji: '🏦', color: '#F59E0B', name: '은행'      },
    mart:        { emoji: '🛒', color: '#EF4444', name: '마트'      },
    cafe:        { emoji: '☕', color: '#6B7280', name: '카페'      },
    gym:         { emoji: '🏋️', color: '#F97316', name: '헬스장'   }
};

/* ── 줌 한계 토스트 ── */
function createZoomToast(message) {
    document.getElementById('zoom-limit-toast')?.remove();
    const toast = document.createElement('div');
    toast.id = 'zoom-limit-toast';
    toast.style.cssText =
        'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);' +
        'background:rgba(0,0,0,0.75);color:white;padding:10px 16px;' +
        'border-radius:20px;font-size:13px;z-index:9999;white-space:nowrap;';
    /* textContent 사용: XSS 안전 */
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.parentNode && toast.remove(), 2000);
}
function showZoomLimitToast()    { createZoomToast('지도가 더 이상 확대되지 않습니다.'); }
function showZoomOutLimitToast() { createZoomToast('지도가 더 이상 축소되지 않습니다.'); }

/* ── 커스텀 줌 버튼 ── */
function modalZoomIn() {
    if (!modalMap) return;
    const cur = modalMap.getLevel();
    cur <= 4 ? showZoomLimitToast() : modalMap.setLevel(cur - 1);
}
function modalZoomOut() {
    if (!modalMap) return;
    const cur = modalMap.getLevel();
    cur >= 5 ? showZoomOutLimitToast() : modalMap.setLevel(cur + 1);
}

/* ── 지도 모달 열기 ── */
function openMapDetailModal() {
    const modal = document.getElementById('map-detail-modal');
    if (!modal) return;
    if (typeof kakao === 'undefined' || !kakao.maps) {
        alert('카카오 지도를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
        return;
    }
    modal.classList.remove('hidden');
    requestAnimationFrame(() => modal.classList.add('modal-visible'));
    document.body.classList.add('overflow-hidden');
    document.querySelector('.bottom-nav')?.style.setProperty('display', 'none');
    document.querySelector('.detail-contact-bar')?.style.setProperty('display', 'none');
    history.pushState({ mapModal: true }, '', window.location.href);

    const { lat, lng } = window.viewData;
    if (!modalMap) {
        kakao.maps.load(() => {
            if (modalMap) return;
            const el = document.getElementById('modal-map');
            if (!el) return;
            modalMap = new kakao.maps.Map(el, {
                center: new kakao.maps.LatLng(lat, lng),
                level: 4, minLevel: 4, maxLevel: 5,
                scrollwheel: true, disableDoubleClick: true, disableDoubleClickZoom: true
            });
            kakao.maps.event.addListener(modalMap, 'click', () => {
                openInfoWindow?.setMap(null);
                openInfoWindow = null;
            });
            const markerEl = document.createElement('div');
            markerEl.innerHTML = createClusterIcon();
            modalMarkerOverlay = new kakao.maps.CustomOverlay({
                position: new kakao.maps.LatLng(lat, lng),
                content: markerEl, map: modalMap, xAnchor: 0.5, yAnchor: 0.5
            });
        });
    } else {
        modalMap.relayout();
        modalMap.setCenter(new kakao.maps.LatLng(lat, lng));
    }
}

/* ── POI 아이콘 HTML (신뢰된 정적 템플릿) ── */
function createPOIIcon(category) {
    const cfg = POI_ICONS[category] || { emoji: '📍', color: '#666' };
    return '<div style="display:flex;flex-direction:column;align-items:center;">' +
               '<div style="background:' + cfg.color + ';width:32px;height:32px;border-radius:50%;' +
                           'display:flex;align-items:center;justify-content:center;font-size:16px;' +
                           'box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;">' +
                   cfg.emoji +
               '</div>' +
               '<div style="width:0;height:0;border-left:5px solid transparent;' +
                           'border-right:5px solid transparent;' +
                           'border-top:6px solid ' + cfg.color + ';margin-top:-1px;"></div>' +
           '</div>';
}

/* ── POI 카테고리 토글 ── */
async function togglePOICategory(category) {
    const btn = document.querySelector('.poi-btn[data-category="' + category + '"]');
    if (activeCategories.has(category)) {
        activeCategories.delete(category);
        btn.classList.remove('bg-blue-500', 'text-white', 'border-blue-500');
        btn.classList.add('bg-white', 'text-gray-600', 'border-gray-300');
        poiMarkers[category]?.forEach(({ overlay, infoOverlay }) => {
            overlay?.setMap(null); infoOverlay?.setMap(null);
        });
        delete poiMarkers[category];
        if (activeCategories.size === 0 && radiusCircle) {
            radiusCircle.setMap(null); radiusCircle = null;
        }
    } else {
        activeCategories.add(category);
        btn.classList.remove('bg-white', 'text-gray-600', 'border-gray-300');
        btn.classList.add('bg-blue-500', 'text-white', 'border-blue-500');

        const { emoji, name } = POI_ICONS[category];
        const originalHTML    = btn.innerHTML;
        btn.textContent = emoji + ' 로딩중...';
        btn.disabled    = true;

        /* 지도 위 로딩 오버레이 (신뢰된 정적 구조) */
        const loadingEl = document.createElement('div');
        loadingEl.id = 'poi-loading-overlay';
        loadingEl.style.cssText =
            'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);' +
            'background:rgba(0,0,0,0.7);color:white;padding:16px 24px;' +
            'border-radius:10px;font-size:14px;font-weight:500;' +
            'z-index:1000;display:flex;align-items:center;gap:10px;';
        const spinner = document.createElement('span');
        spinner.style.cssText = 'animation:spin 1s linear infinite;display:inline-block;';
        spinner.textContent = '🔄';
        const label = document.createElement('span');
        label.textContent = name + ' 정보를 가져오는 중...';
        loadingEl.appendChild(spinner);
        loadingEl.appendChild(label);
        document.getElementById('modal-map').appendChild(loadingEl);

        await loadPOIMarkers(category);

        btn.innerHTML = originalHTML;
        btn.disabled  = false;
        loadingEl.parentNode && loadingEl.remove();

        const { lat, lng } = window.viewData;
        if (!radiusCircle && modalMap) {
            radiusCircle = new kakao.maps.Circle({
                center: new kakao.maps.LatLng(lat, lng), radius: 500,
                strokeWeight: 2, strokeColor: '#FF6B6B', strokeOpacity: 0.6, strokeStyle: 'solid',
                fillColor: '#FF6B6B', fillOpacity: 0.1
            });
            radiusCircle.setMap(modalMap);
        }
    }
}

/* ── POI 마커 로드 ── */
async function loadPOIMarkers(category) {
    const { lat, lng } = window.viewData;
    try {
        const res  = await fetch('/api/nearby-places?lat=' + lat + '&lng=' + lng + '&category=' + encodeURIComponent(category) + '&radius=500');
        const data = await res.json();
        if (!data.success) { createZoomToast(POI_ICONS[category].name + ' 검색에 실패했습니다.'); return; }
        if (data.places.length === 0) { createZoomToast('주변 500m 내에 ' + POI_ICONS[category].name + '이(가) 없습니다.'); return; }

        poiMarkers[category] = [];
        data.places.forEach(place => {
            /* 마커 오버레이 */
            const markerEl = document.createElement('div');
            markerEl.innerHTML    = createPOIIcon(category);
            markerEl.style.cursor = 'pointer';
            const customOverlay   = new kakao.maps.CustomOverlay({
                position: new kakao.maps.LatLng(place.lat, place.lng),
                content: markerEl, map: modalMap, yAnchor: 1
            });

            /* 정보창 (textContent로 XSS 방지) */
            const infoEl = document.createElement('div');
            infoEl.style.cssText =
                'padding:10px;font-size:12px;max-width:250px;background:white;' +
                'border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.3);';
            const titleEl = document.createElement('strong');
            titleEl.textContent = place.title;   /* XSS 안전: textContent */
            infoEl.appendChild(titleEl);

            const infoOverlay = new kakao.maps.CustomOverlay({
                position: new kakao.maps.LatLng(place.lat, place.lng),
                content: infoEl, yAnchor: 1.5, zIndex: 10
            });

            /* 마커 클릭: 정보창 토글 (버스는 경유 노선 추가 조회) */
            markerEl.onclick = async () => {
                if (openInfoWindow === infoOverlay) {
                    infoOverlay.setMap(null); openInfoWindow = null;
                } else {
                    openInfoWindow?.setMap(null);
                    if (category === 'bus' && place.nodeid) {
                        /* 로딩 중 메시지 (DOM 직접 생성) */
                        infoEl.textContent = '';
                        const t = document.createElement('strong'); t.textContent = place.title; infoEl.appendChild(t);
                        const p = document.createElement('p');
                        p.style.cssText = 'margin:4px 0 0;color:#999;font-size:11px;';
                        p.textContent = '노선 정보 로딩중...';
                        infoEl.appendChild(p);
                        infoOverlay.setMap(modalMap); openInfoWindow = infoOverlay;
                        try {
                            const routeRes  = await fetch('/api/bus-routes?nodeid=' + encodeURIComponent(place.nodeid) + '&citycode=' + encodeURIComponent(place.citycode || '34010'));
                            const routeData = await routeRes.json();
                            infoEl.textContent = '';
                            const header = document.createElement('strong');
                            header.textContent = '🚌 ' + place.title;
                            infoEl.appendChild(header);
                            if (routeData.success && routeData.routes.length > 0) {
                                const labelEl = document.createElement('p');
                                labelEl.style.cssText = 'margin:6px 0 0;color:#666;font-size:10px;';
                                labelEl.textContent = '경유 버스 노선';
                                const routeEl = document.createElement('p');
                                routeEl.style.cssText = 'margin:2px 0 0;color:#3B82F6;font-size:12px;font-weight:500;line-height:1.4;';
                                /* routeData.routes 는 서버 응답 — textContent로 처리 */
                                routeEl.textContent = routeData.routes.map(r => r.routeno).join(', ');
                                infoEl.appendChild(labelEl);
                                infoEl.appendChild(routeEl);
                            } else {
                                const none = document.createElement('p');
                                none.style.cssText = 'margin:4px 0 0;color:#999;font-size:11px;';
                                none.textContent = '노선 정보 없음';
                                infoEl.appendChild(none);
                            }
                        } catch {
                            infoEl.textContent = '';
                            const t2 = document.createElement('strong'); t2.textContent = place.title; infoEl.appendChild(t2);
                            const err = document.createElement('p');
                            err.style.cssText = 'margin:4px 0 0;color:#999;font-size:11px;';
                            err.textContent = '노선 조회 실패';
                            infoEl.appendChild(err);
                        }
                    } else {
                        infoOverlay.setMap(modalMap); openInfoWindow = infoOverlay;
                    }
                }
            };

            poiMarkers[category].push({ overlay: customOverlay, infoOverlay });
        });

        createZoomToast(POI_ICONS[category].name + ' ' + data.places.length + '개를 찾았습니다.');
    } catch {
        createZoomToast('시설 검색 중 오류가 발생했습니다.');
    }
}

/* ── POI 마커 전체 초기화 ── */
function clearAllPOIMarkers() {
    Object.values(poiMarkers).forEach(markers =>
        markers.forEach(({ overlay, infoOverlay }) => {
            overlay?.setMap(null); infoOverlay?.setMap(null);
        })
    );
    Object.keys(poiMarkers).forEach(k => delete poiMarkers[k]);
    activeCategories.clear();
    if (radiusCircle) { radiusCircle.setMap(null); radiusCircle = null; }
    document.querySelectorAll('.poi-btn').forEach(btn => {
        btn.classList.remove('bg-blue-500', 'text-white', 'border-blue-500');
        btn.classList.add('bg-white', 'text-gray-600', 'border-gray-300');
    });
}

/* ── 지도 모달 닫기 ── */
function closeMapDetailModal(fromPopstate = false) {
    clearAllPOIMarkers();
    const modal = document.getElementById('map-detail-modal');
    modal.classList.remove('modal-visible');
    setTimeout(() => modal.classList.add('hidden'), 250);
    document.body.classList.remove('overflow-hidden');
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        bottomNav.style.display = '';
        if (typeof __viewNavHref === 'string' && __viewNavHref) {
            bottomNav.querySelector('.bottom-nav__item.active')?.classList.remove('active');
            bottomNav.querySelector('.bottom-nav__item[href="' + __viewNavHref + '"]')?.classList.add('active');
        }
    }
    const contactBar = document.querySelector('.detail-contact-bar');
    if (contactBar) contactBar.style.display = '';
    if (!fromPopstate && history.state?.mapModal) history.back();
}

/* 뒤로가기 시 지도 모달 닫기 */
window.addEventListener('popstate', () => {
    const modal = document.getElementById('map-detail-modal');
    if (modal && !modal.classList.contains('hidden')) closeMapDetailModal(true);
});

/* ═══════════════════════════════════════════════════════════════
   공유 모달
   ═══════════════════════════════════════════════════════════════ */
const shareInfo = {
    title: '이 매물 공유!',
    get text() {
        const { code, dong, priceText } = window.viewData;
        return '[천안하우스] 매물번호 : ' + code + ', ' + dong + ' ' + priceText;
    },
    url: window.location.href
};

function openShareModal() {
    const modal = document.getElementById('shareModal');
    modal.classList.remove('hidden'); modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
}
function closeShareModal() {
    const modal = document.getElementById('shareModal');
    modal.classList.add('hidden'); modal.classList.remove('flex');
    document.body.style.overflow = '';
}
function shareOverlayClick(e) {
    if (e.target.id === 'shareModal') closeShareModal();
}

function loadKakaoSDKAndShare() {
    const { kakaoKey, dong, priceText, picname1 } = window.viewData;
    try {
        if (!Kakao.isInitialized()) Kakao.init(kakaoKey);
        Kakao.Share.sendDefault({
            objectType: 'feed',
            content: {
                title:       '[천안하우스] ' + dong + ' ' + priceText,
                description: document.querySelector('meta[name="description"]')?.content || '',
                imageUrl:    'https://house.zibeasy.com/images/maemul/big/' + picname1,
                link: { mobileWebUrl: shareInfo.url, webUrl: shareInfo.url }
            },
            buttons: [{ title: '매물 보기', link: { mobileWebUrl: shareInfo.url, webUrl: shareInfo.url } }]
        });
    } catch { fallbackKakaoShare(); }
}

async function shareToKakao() {
    closeShareModal();
    if (typeof Kakao !== 'undefined') { loadKakaoSDKAndShare(); return; }
    const script   = document.createElement('script');
    script.src     = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js';
    script.onload  = loadKakaoSDKAndShare;
    script.onerror = fallbackKakaoShare;
    document.head.appendChild(script);
}

async function fallbackKakaoShare() {
    const text = shareInfo.text + '\n' + shareInfo.url;
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
            document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        }
        if (confirm('링크가 복사되었습니다!\n\n카카오톡을 열어서 붙여넣기 하시겠습니까?'))
            window.location.href = 'kakaotalk://launch';
    } catch { alert('링크 복사에 실패했습니다.\n직접 복사해 주세요: ' + shareInfo.url); }
}

async function copyShareLink() {
    const text = shareInfo.text + '\n' + shareInfo.url;
    const done = () => { showCopyToast(); closeShareModal(); };
    try {
        if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); done(); return; }
    } catch {}
    try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
        document.body.appendChild(ta); ta.focus(); ta.select();
        document.execCommand('copy') ? done() : alert('링크 복사에 실패했습니다. 직접 복사해 주세요:\n' + shareInfo.url);
        document.body.removeChild(ta);
    } catch { alert('링크 복사에 실패했습니다. 직접 복사해 주세요:\n' + shareInfo.url); }
}

function showCopyToast() {
    const toast = document.getElementById('copyToast');
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 2000);
}

function shareViaSMS() {
    window.location.href = 'sms:?body=' + encodeURIComponent(shareInfo.text + '\n' + shareInfo.url);
    closeShareModal();
}

/* ═══════════════════════════════════════════════════════════════
   DOM 로드 후 초기화
   ═══════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {

    /* ── 지도 위 터치 오버레이 (탭=클릭 전달, 드래그=스크롤) ── */
    const overlay = document.getElementById('map-touch-overlay');
    if (overlay) {
        let tx, ty, tt;
        overlay.addEventListener('touchstart', e => {
            tx = e.touches[0].clientX; ty = e.touches[0].clientY; tt = Date.now();
        }, { passive: true });
        overlay.addEventListener('touchend', e => {
            const dx = Math.abs(e.changedTouches[0].clientX - tx);
            const dy = Math.abs(e.changedTouches[0].clientY - ty);
            if (Date.now() - tt < 200 && dx < 10 && dy < 10) {
                overlay.style.pointerEvents = 'none';
                document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY)?.click();
                setTimeout(() => { overlay.style.pointerEvents = 'auto'; }, 100);
            }
        }, { passive: true });
        overlay.addEventListener('click', e => {
            overlay.style.pointerEvents = 'none';
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (el && el !== overlay) el.click();
            setTimeout(() => { overlay.style.pointerEvents = 'auto'; }, 100);
        });
    }

    /* ── 관리비 상세 모달 ── */
    const publicMoneyBtn   = document.getElementById('public-money-btn');
    const publicMoneyModal = document.getElementById('public-money-modal');
    const closeModalBtn    = document.getElementById('close-modal');
    publicMoneyBtn?.addEventListener('click', () => {
        publicMoneyModal.classList.remove('hidden'); publicMoneyModal.classList.add('flex');
        document.body.classList.add('overflow-hidden');
    });
    closeModalBtn?.addEventListener('click', () => {
        publicMoneyModal.classList.add('hidden'); publicMoneyModal.classList.remove('flex');
        document.body.classList.remove('overflow-hidden');
    });
    publicMoneyModal?.addEventListener('click', e => {
        if (e.target === publicMoneyModal) {
            publicMoneyModal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        }
    });

    /* ── 면적 단위 변환 (m² ↔ 평) ── */
    const areaBtn     = document.getElementById('area-convert-btn');
    const areaDisplay = document.getElementById('area-display');
    if (areaBtn && areaDisplay) {
        const areaText = areaBtn.querySelector('span');
        let isConverted = false;
        areaBtn.addEventListener('click', () => {
            const val = parseFloat(areaDisplay.textContent.replace(/[^\d.]/g, ''));
            if (!isConverted) {
                areaDisplay.textContent = (val / 3.3058).toFixed(2) + '평';
                areaText.textContent    = 'm²';
            } else {
                areaDisplay.textContent = (val * 3.3058).toFixed(0) + 'm²';
                areaText.textContent    = '평';
            }
            isConverted = !isConverted;
        });
    }

    /* ── 카카오 소형 지도 초기화 ── */
    const { lat, lng } = window.viewData;
    const mapEl = document.getElementById('map');
    if (mapEl && !isNaN(lat) && !isNaN(lng)) {
        if (typeof kakao === 'undefined' || !kakao.maps) {
            const errEl = document.createElement('div');
            errEl.style.cssText = 'padding:18px;color:#6b7280;font-size:13px;';
            errEl.textContent = '지도를 불러오지 못했습니다.';
            mapEl.appendChild(errEl);
        } else {
            kakao.maps.load(() => {
                const map = new kakao.maps.Map(mapEl, {
                    center: new kakao.maps.LatLng(lat, lng),
                    level: 4, draggable: false, scrollwheel: false,
                    disableDoubleClick: true, disableDoubleClickZoom: true
                });
                const markerEl = document.createElement('div');
                markerEl.innerHTML    = createClusterIcon();
                markerEl.style.cursor = 'pointer';
                markerEl.onclick      = openMapDetailModal;
                new kakao.maps.CustomOverlay({
                    position: new kakao.maps.LatLng(lat, lng),
                    content: markerEl, map, xAnchor: 0.5, yAnchor: 0.5
                });
                let resizeTimer = null;
                window.addEventListener('resize', () => {
                    clearTimeout(resizeTimer);
                    resizeTimer = setTimeout(() => {
                        map.relayout();
                        map.setCenter(new kakao.maps.LatLng(lat, lng));
                    }, 150);
                });
            });
        }
    }

    /* ── 옵션 더보기 / 접기 ── */
    const wrapper   = document.getElementById('optionWrapper');
    const toggleBtn = document.getElementById('toggleBtn');
    const fadeCover = document.getElementById('fadeCover');
    if (wrapper && toggleBtn && fadeCover) {
        let isOpen = false;
        toggleBtn.addEventListener('click', () => {
            isOpen = !isOpen;
            wrapper.style.maxHeight = isOpen ? '9999px' : '';
            fadeCover.style.display = isOpen ? 'none' : 'block';
            toggleBtn.textContent   = isOpen ? '접기 ▴' : '더보기 ▾';
        });
    }

    /* ── 최근 본 매물 DB 기록 (로그인 사용자만) ── */
    (function recordRecentViewed() {
        const code = window.viewData.code;
        if (!code) return;
        /* 비로그인이면 기록 생략 */
        if (typeof window.isLoggedIn !== 'undefined' && !window.isLoggedIn) return;
        fetch('/api/user/recent/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ code: String(code) })
        }).catch(function() { /* 실패 무시 */ });
    })();
});

/* ── 관심 하트 초기화 ── */
window.addEventListener('pageshow',           () => initLikedHearts());
document.addEventListener('visibilitychange', () => { if (!document.hidden) initLikedHearts(); });

/* ═══════════════════════════════════════════════════════════════
   탭바 active 탭 동적 교체
   ═══════════════════════════════════════════════════════════════ */
var __viewNavHref = null;
(function syncTabNav() {
    const navFrom    = sessionStorage.getItem('navFrom');
    const hrefMap    = { map: '/map', list: '/list' };
    const targetHref = hrefMap[navFrom];
    if (!targetHref) return;
    __viewNavHref = targetHref;
    document.querySelector('.bottom-nav__item.active')?.classList.remove('active');
    document.querySelector('.bottom-nav__item[href="' + targetHref + '"]')?.classList.add('active');
})();

/* ═══════════════════════════════════════════════════════════════
   슬라이드 전환 애니메이션 (View Transitions API 폴백)
   ═══════════════════════════════════════════════════════════════ */
(function initSlideTransition() {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    const hasVT      = 'onpagereveal' in window;
    const slideEl    = document.getElementById('view-slide-wrapper');
    const contactBar = document.querySelector('.detail-contact-bar');

    sessionStorage.removeItem('fromListPage');

    if (hasVT) {
        if (!history.state?.viewPage) history.pushState({ viewPage: true }, '');
        window.addEventListener('popstate', () => {
            if (history.state?.viewPage) return;
            if (document.getElementById('map-detail-modal')?.style.display === 'flex') return;
            sessionStorage.setItem('navDirection', 'slide-left');
            history.back();
        });
    } else {
        document.documentElement.classList.remove('view-offscreen-init');
        slideEl?.classList.add('view-slide-in');
        contactBar?.classList.add('view-slide-in');

        document.querySelectorAll('[data-detail-close="1"]').forEach(btn => {
            btn.removeAttribute('onclick');
            btn.addEventListener('click', e => {
                e.preventDefault();
                if (!slideEl) { history.back(); return; }
                slideEl.classList.remove('view-slide-in'); slideEl.classList.add('view-slide-out');
                contactBar?.classList.remove('view-slide-in'); contactBar?.classList.add('view-slide-out');
                slideEl.addEventListener('animationend', () => history.back(), { once: true });
            });
        });

        history.pushState({ viewPage: true }, '');
        window.addEventListener('popstate', () => {
            if (history.state?.viewPage) return;
            if (document.getElementById('map-detail-modal')?.style.display === 'flex') return;
            if (slideEl && !slideEl.classList.contains('view-slide-out')) {
                slideEl.classList.remove('view-slide-in'); slideEl.classList.add('view-slide-out');
                slideEl.addEventListener('animationend', () => history.back(), { once: true });
            } else { history.back(); }
        });
    }
})();
