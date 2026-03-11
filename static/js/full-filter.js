/**
 * 전체 필터 페이지 JavaScript
 * - 듀얼 레인지 슬라이더
 * - 필터 버튼 토글
 * - 필터 적용/초기화
 */

// ============ 슬라이더 값 정의 ============

// 보증금 슬라이더 값 (21단계: 0~20)
const DEPOSIT_VALUES = [
    0, 50, 100, 200, 300, 500, 1000, 1500, 2000, 3000,
    4000, 5000, 6000, 7000, 8000, 9000, 10000, 12000, 15000, 20000, 30000
];

// 월세 슬라이더 값 (21단계: 0~20)
const MONTHLY_VALUES = [
    0, 10, 20, 25, 30, 35, 40, 45, 50, 55,
    60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 150
];

// 면적 슬라이더 값 (9단계: 0~8) - 평 기준, ㎡는 계산
const AREA_VALUES = [
    { pyeong: 0, sqm: 0 },
    { pyeong: 10, sqm: 33 },
    { pyeong: 15, sqm: 50 },
    { pyeong: 20, sqm: 66 },
    { pyeong: 25, sqm: 83 },
    { pyeong: 30, sqm: 99 },
    { pyeong: 40, sqm: 132 },
    { pyeong: 50, sqm: 165 },
    { pyeong: 60, sqm: 198 }
];

// 현재 면적 단위 (sqm 또는 pyeong)
let currentAreaUnit = 'pyeong';

// 전체 필터 상태 저장
window.fullFilterState = {
    // 거래유형 (모두 선택 = 초기값)
    tradeType: ['monthly', 'jeonse', 'short_term'],
    // 보증금 (인덱스, 0=최소, 20=최대)
    depositMin: 0,
    depositMax: 20,
    // 월세 (인덱스)
    monthlyMin: 0,
    monthlyMax: 20,
    includeManagement: false,
    // 구조 (모두 선택 = 초기값)
    kitchen: ['separate', 'open'],
    balcony: ['separate', 'extended'],
    // 매물형태 (미선택 = 초기값)
    roomType: [],
    // 면적 (인덱스)
    areaMin: 0,
    areaMax: 8,
    // 층수 (전체 = 초기값)
    floor: ['all'],
    // 건물년차 (전체 = 초기값)
    buildingAge: ['all'],
    // 기타사항 (미선택 = 초기값)
    options: [],
    // 매물 상태 (기본: 계약가능 매물)
    propertyStatus: ['available'],
    // 매물 범위 (기본: 최신 확인 매물)
    listingScope: ['recent']
};

// ============ 페이지 열기/닫기 ============

/**
 * 전체 필터 페이지 열기
 */
function openFullFilterPage() {
    console.log('📋 전체 필터 페이지 열기');

    // 관심목록 상태 복구
    if (window.appManager && window.appManager.mapManager) {
        window.appManager.mapManager.restoreFromLikedFilter();
    }

    const filterPage = document.getElementById('fullFilterPage');

    // ✅ 히스토리에 상태 추가 (뒤로가기 지원)
    history.pushState({ page: 'fullFilter' }, '', '');
    window.fullFilterHistoryPushed = true;  // ✅ 히스토리 푸시 여부 추적

    // 필터 페이지 표시
    if (filterPage) {
        filterPage.classList.add('active');
        document.body.style.overflow = 'hidden';

        // ✅ 스크롤 위치 맨 위로 초기화
        filterPage.scrollTop = 0;
        const filterContent = filterPage.querySelector('.full-filter-content');
        if (filterContent) {
            filterContent.scrollTop = 0;
        }
    }

    // ✅ UI를 현재 상태에 맞게 동기화
    syncFilterUIWithState();
}

/**
 * ✅ 필터 UI를 현재 상태(fullFilterState)에 맞게 동기화
 */
function syncFilterUIWithState() {
    const state = window.fullFilterState;

    // 거래유형 버튼 동기화
    document.querySelectorAll('[data-filter="trade_type"]').forEach(btn => {
        const value = btn.dataset.value;
        if (state.tradeType.includes(value)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // 보증금 슬라이더 동기화
    const depositMin = document.getElementById('depositMin');
    const depositMax = document.getElementById('depositMax');
    if (depositMin) depositMin.value = state.depositMin;
    if (depositMax) depositMax.value = state.depositMax;
    updateDepositSlider();

    // 월세 슬라이더 동기화
    const monthlyMin = document.getElementById('monthlyMin');
    const monthlyMax = document.getElementById('monthlyMax');
    const includeManagement = document.getElementById('includeManagement');
    if (monthlyMin) monthlyMin.value = state.monthlyMin;
    if (monthlyMax) monthlyMax.value = state.monthlyMax;
    if (includeManagement) includeManagement.checked = state.includeManagement;
    updateMonthlySlider();

    // 구조-주방 버튼 동기화
    document.querySelectorAll('[data-filter="kitchen"]').forEach(btn => {
        const value = btn.dataset.value;
        if (state.kitchen.includes(value)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // 구조-베란다 버튼 동기화
    document.querySelectorAll('[data-filter="balcony"]').forEach(btn => {
        const value = btn.dataset.value;
        if (state.balcony.includes(value)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // 매물형태 버튼 동기화
    document.querySelectorAll('[data-filter="room_type"]').forEach(btn => {
        const value = btn.dataset.value;
        if (state.roomType.includes(value)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // 면적 슬라이더 동기화
    const areaMin = document.getElementById('areaMin');
    const areaMax = document.getElementById('areaMax');
    if (areaMin) areaMin.value = state.areaMin;
    if (areaMax) areaMax.value = state.areaMax;
    updateAreaSlider();

    // 층수 버튼 동기화
    document.querySelectorAll('[data-filter="floor"]').forEach(btn => {
        const value = btn.dataset.value;
        if (state.floor.includes(value)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // 건물년차 버튼 동기화
    document.querySelectorAll('[data-filter="building_age"]').forEach(btn => {
        const value = btn.dataset.value;
        if (state.buildingAge.includes(value)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // 기타사항 버튼 동기화
    document.querySelectorAll('[data-filter="options"]').forEach(btn => {
        const value = btn.dataset.value;
        if (state.options.includes(value)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // 매물 상태 버튼 동기화
    document.querySelectorAll('[data-filter="property_status"]').forEach(btn => {
        const value = btn.dataset.value;
        if (state.propertyStatus.includes(value)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // 매물 범위 버튼 동기화
    document.querySelectorAll('[data-filter="listing_scope"]').forEach(btn => {
        const value = btn.dataset.value;
        if (state.listingScope.includes(value)) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    console.log('✅ 필터 UI 동기화 완료');
}

/**
 * 전체 필터 페이지 닫기
 */
function closeFullFilterPage() {
    // ✅ 뒤로가기로 닫힌 게 아니면 히스토리 뒤로가기
    if (!window.isClosingByBackButton && window.fullFilterHistoryPushed) {
        window.fullFilterHistoryPushed = false;
        window.isClosingByFullFilter = true; // ✅ 전체필터에서 닫는 중임을 표시
        history.back();
    }

    console.log('❌ 전체 필터 페이지 닫기');
    const filterPage = document.getElementById('fullFilterPage');

    if (filterPage) {
        filterPage.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ============ 슬라이더 업데이트 함수 ============

/**
 * 보증금 슬라이더 업데이트
 */
function updateDepositSlider() {
    const minSlider = document.getElementById('depositMin');
    const maxSlider = document.getElementById('depositMax');
    const range = document.getElementById('depositRange');
    const display = document.getElementById('depositValueDisplay');

    if (!minSlider || !maxSlider) return;

    let minVal = parseInt(minSlider.value);
    let maxVal = parseInt(maxSlider.value);

    // 최소값이 최대값을 넘지 않도록
    if (minVal > maxVal) {
        minSlider.value = maxVal;
        minVal = maxVal;
    }

    // 상태 저장
    window.fullFilterState.depositMin = minVal;
    window.fullFilterState.depositMax = maxVal;

    // 범위 바 위치 계산
    const minPercent = (minVal / 20) * 100;
    const maxPercent = (maxVal / 20) * 100;
    range.style.left = minPercent + '%';
    range.style.width = (maxPercent - minPercent) + '%';

    // 값 표시 업데이트
    if (minVal === 0 && maxVal === 20) {
        display.textContent = '전체';
    } else {
        const minText = formatDepositValue(DEPOSIT_VALUES[minVal]);
        const maxText = formatDepositValue(DEPOSIT_VALUES[maxVal]);
        display.textContent = `${minText} ~ ${maxText}`;
    }

    // 필터 아이콘 상태 업데이트
    updateFilterIconState();
}

/**
 * 월세 슬라이더 업데이트
 */
function updateMonthlySlider() {
    const minSlider = document.getElementById('monthlyMin');
    const maxSlider = document.getElementById('monthlyMax');
    const range = document.getElementById('monthlyRange');
    const display = document.getElementById('monthlyValueDisplay');
    const includeManagement = document.getElementById('includeManagement');

    if (!minSlider || !maxSlider) return;

    let minVal = parseInt(minSlider.value);
    let maxVal = parseInt(maxSlider.value);

    // 최소값이 최대값을 넘지 않도록
    if (minVal > maxVal) {
        minSlider.value = maxVal;
        minVal = maxVal;
    }

    // 상태 저장
    window.fullFilterState.monthlyMin = minVal;
    window.fullFilterState.monthlyMax = maxVal;
    window.fullFilterState.includeManagement = includeManagement ? includeManagement.checked : false;

    // 범위 바 위치 계산
    const minPercent = (minVal / 20) * 100;
    const maxPercent = (maxVal / 20) * 100;
    range.style.left = minPercent + '%';
    range.style.width = (maxPercent - minPercent) + '%';

    // 값 표시 업데이트
    if (minVal === 0 && maxVal === 20) {
        display.textContent = '전체';
    } else {
        const minText = formatMonthlyValue(MONTHLY_VALUES[minVal]);
        const maxText = formatMonthlyValue(MONTHLY_VALUES[maxVal]);
        const suffix = (includeManagement && includeManagement.checked) ? '(관리비포함)' : '';
        display.textContent = `${minText} ~ ${maxText}${suffix}`;
    }

    // 필터 아이콘 상태 업데이트
    updateFilterIconState();
}

/**
 * 면적 슬라이더 업데이트
 */
function updateAreaSlider() {
    const minSlider = document.getElementById('areaMin');
    const maxSlider = document.getElementById('areaMax');
    const range = document.getElementById('areaRange');
    const display = document.getElementById('areaValueDisplay');
    const centerLabel = document.getElementById('areaCenterLabel');

    if (!minSlider || !maxSlider) return;

    let minVal = parseInt(minSlider.value);
    let maxVal = parseInt(maxSlider.value);

    // 최소값이 최대값을 넘지 않도록
    if (minVal > maxVal) {
        minSlider.value = maxVal;
        minVal = maxVal;
    }

    // 상태 저장
    window.fullFilterState.areaMin = minVal;
    window.fullFilterState.areaMax = maxVal;

    // 범위 바 위치 계산
    const minPercent = (minVal / 8) * 100;
    const maxPercent = (maxVal / 8) * 100;
    range.style.left = minPercent + '%';
    range.style.width = (maxPercent - minPercent) + '%';

    // 값 표시 업데이트
    if (minVal === 0 && maxVal === 8) {
        display.textContent = '전체';
    } else {
        const minText = formatAreaValue(AREA_VALUES[minVal]);
        const maxText = formatAreaValue(AREA_VALUES[maxVal]);
        display.textContent = `${minText} ~ ${maxText}`;
    }

    // 중앙 라벨 업데이트 (선택된 단위만 표시)
    if (centerLabel) {
        const centerVal = AREA_VALUES[4]; // 25평(83㎡)
        if (currentAreaUnit === 'pyeong') {
            centerLabel.textContent = `${centerVal.pyeong}평`;
        } else {
            centerLabel.textContent = `${centerVal.sqm}㎡`;
        }
    }

    // 필터 아이콘 상태 업데이트
    updateFilterIconState();
}

// ============ 값 포맷팅 함수 ============

/**
 * 보증금 값 포맷팅 (만원 단위)
 */
function formatDepositValue(value) {
    if (value === 0) return '0원';
    if (value >= 10000) {
        const eok = Math.floor(value / 10000);
        const man = value % 10000;
        if (man === 0) {
            return `${eok}억원`;
        }
        return `${eok}억${man}만원`;
    }
    return `${value}만원`;
}

/**
 * 월세 값 포맷팅 (만원 단위)
 */
function formatMonthlyValue(value) {
    if (value === 0) return '0원';
    return `${value}만원`;
}

/**
 * 면적 값 포맷팅 (선택된 단위만 표시)
 */
function formatAreaValue(areaObj) {
    if (currentAreaUnit === 'pyeong') {
        return `${areaObj.pyeong}평`;
    } else {
        return `${areaObj.sqm}㎡`;
    }
}

// ============ 면적 단위 전환 ============

/**
 * 면적 단위 전환 (평 <-> ㎡)
 */
function toggleAreaUnit(unit) {
    currentAreaUnit = unit;

    // 버튼 상태 업데이트
    document.querySelectorAll('.unit-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.unit === unit) {
            btn.classList.add('active');
        }
    });

    // 슬라이더 표시 업데이트
    updateAreaSlider();
}

// ============ 필터 버튼 토글 ============

/**
 * 일반 필터 버튼 토글 (중복 선택 가능)
 */
function toggleFilterBtn(btn) {
    const filter = btn.dataset.filter;
    const value = btn.dataset.value;

    // ✅ 거래유형: 마지막 1개는 선택 해제 방지
    if (filter === 'trade_type') {
        const selectedCount = window.fullFilterState.tradeType.length;
        const isCurrentlySelected = btn.classList.contains('selected');

        // 1개만 남았고, 그 버튼을 해제하려는 경우 → 무시
        if (selectedCount === 1 && isCurrentlySelected) {
            return;
        }
    }

    // ✅ 주방: 마지막 1개는 선택 해제 방지
    if (filter === 'kitchen') {
        const selectedCount = window.fullFilterState.kitchen.length;
        const isCurrentlySelected = btn.classList.contains('selected');

        if (selectedCount === 1 && isCurrentlySelected) {
            return;
        }
    }

    // ✅ 베란다: 마지막 1개는 선택 해제 방지
    if (filter === 'balcony') {
        const selectedCount = window.fullFilterState.balcony.length;
        const isCurrentlySelected = btn.classList.contains('selected');

        if (selectedCount === 1 && isCurrentlySelected) {
            return;
        }
    }

    btn.classList.toggle('selected');

    // 상태 업데이트
    const stateKey = getStateKey(filter);
    if (stateKey) {
        const state = window.fullFilterState[stateKey];
        const isSelected = btn.classList.contains('selected');

        if (isSelected) {
            if (!state.includes(value)) {
                state.push(value);
            }
        } else {
            const index = state.indexOf(value);
            if (index > -1) {
                state.splice(index, 1);
            }
        }
    }

    // 필터 아이콘 상태 업데이트
    updateFilterIconState();
}

/**
 * 층수 필터 버튼 토글 (전체와 개별 선택 처리)
 */
function toggleFloorBtn(btn) {
    const value = btn.dataset.value;

    if (value === 'all') {
        // 전체 선택 시: 다른 모든 버튼 해제
        document.querySelectorAll('[data-filter="floor"]').forEach(b => {
            b.classList.remove('selected');
        });
        btn.classList.add('selected');
        window.fullFilterState.floor = ['all'];
    } else {
        // 개별 선택 시: 전체 버튼 해제
        const allBtn = document.querySelector('[data-filter="floor"][data-value="all"]');
        if (allBtn) allBtn.classList.remove('selected');

        btn.classList.toggle('selected');

        // 상태 업데이트
        const state = window.fullFilterState.floor;
        const allIndex = state.indexOf('all');
        if (allIndex > -1) state.splice(allIndex, 1);

        const isSelected = btn.classList.contains('selected');
        if (isSelected) {
            if (!state.includes(value)) state.push(value);
        } else {
            const index = state.indexOf(value);
            if (index > -1) state.splice(index, 1);
        }

        // 아무것도 선택 안 되면 전체 선택
        if (state.length === 0) {
            if (allBtn) allBtn.classList.add('selected');
            state.push('all');
        }
    }

    // 필터 아이콘 상태 업데이트
    updateFilterIconState();
}

/**
 * 건물년차 필터 버튼 토글 (라디오 버튼 방식 - 1개만 선택 가능)
 */
function toggleBuildingAgeBtn(btn) {
    const value = btn.dataset.value;

    // ✅ 이미 선택된 버튼이면 무시 (항상 1개는 선택되어야 함)
    if (btn.classList.contains('selected')) {
        return;
    }

    // ✅ 모든 버튼 해제 후 클릭한 버튼만 선택
    document.querySelectorAll('[data-filter="building_age"]').forEach(b => {
        b.classList.remove('selected');
    });
    btn.classList.add('selected');

    // 상태 업데이트 (1개만 저장)
    window.fullFilterState.buildingAge = [value];

    // 필터 아이콘 상태 업데이트
    updateFilterIconState();
}

/**
 * 단일 선택 필터 버튼 토글 (항상 1개 선택)
 */
function toggleSingleSelectBtn(btn) {
    const filter = btn.dataset.filter;
    const value = btn.dataset.value;
    if (!filter || !value) return;
    if (btn.classList.contains('selected')) return;

    document.querySelectorAll(`[data-filter="${filter}"]`).forEach(b => {
        b.classList.remove('selected');
    });
    btn.classList.add('selected');

    const stateKey = getStateKey(filter);
    if (stateKey) {
        window.fullFilterState[stateKey] = [value];
    }

    updateFilterIconState();
}

/**
 * 필터 이름을 상태 키로 변환
 */
function getStateKey(filter) {
    const keyMap = {
        'trade_type': 'tradeType',
        'kitchen': 'kitchen',
        'balcony': 'balcony',
        'room_type': 'roomType',
        'floor': 'floor',
        'building_age': 'buildingAge',
        'options': 'options',
        'property_status': 'propertyStatus',
        'listing_scope': 'listingScope'
    };
    return keyMap[filter] || null;
}

// ============ 필터 아이콘 상태 업데이트 ============

/**
 * 필터가 변경되었는지 확인하고 아이콘 상태 업데이트
 */
function updateFilterIconState() {
    const filterIconBtn = document.getElementById('filterIconBtn');
    if (!filterIconBtn) return;

    const isFilterActive = checkIfFilterActive();

    if (isFilterActive) {
        filterIconBtn.classList.add('active');
    } else {
        filterIconBtn.classList.remove('active');
    }
}

/**
 * 필터가 기본값에서 변경되었는지 확인
 */
function checkIfFilterActive() {
    const state = window.fullFilterState;

    // 거래유형: 3개 모두 선택이 기본값
    if (state.tradeType.length !== 3) return true;

    // 보증금: 0~20이 기본값
    if (state.depositMin !== 0 || state.depositMax !== 20) return true;

    // 월세: 0~20이 기본값
    if (state.monthlyMin !== 0 || state.monthlyMax !== 20) return true;

    // 관리비 포함: false가 기본값
    if (state.includeManagement) return true;

    // 구조-주방: 2개 모두 선택이 기본값
    if (state.kitchen.length !== 2) return true;

    // 구조-베란다: 2개 모두 선택이 기본값
    if (state.balcony.length !== 2) return true;

    // 매물형태: 미선택이 기본값
    if (state.roomType.length > 0) return true;

    // 면적: 0~8이 기본값
    if (state.areaMin !== 0 || state.areaMax !== 8) return true;

    // 층수: all이 기본값
    if (state.floor.length !== 1 || state.floor[0] !== 'all') return true;

    // 건물년차: all이 기본값
    if (state.buildingAge.length !== 1 || state.buildingAge[0] !== 'all') return true;

    // 기타사항: 미선택이 기본값
    if (state.options.length > 0) return true;

    // 매물 상태: 계약가능 매물이 기본값
    if (state.propertyStatus.length !== 1 || state.propertyStatus[0] !== 'available') return true;

    // 매물 범위: 최신 확인 매물이 기본값
    if (state.listingScope.length !== 1 || state.listingScope[0] !== 'recent') return true;

    return false;
}

// ============ 초기화 기능 ============

/**
 * 초기화 확인 팝업 표시
 */
function showResetConfirm() {
    const modal = document.getElementById('resetConfirmModal');
    if (modal) {
        modal.classList.add('active');
    }
}

/**
 * 초기화 확인 팝업 닫기
 */
function closeResetConfirm(event) {
    if (event && event.target !== event.currentTarget) return;
    const modal = document.getElementById('resetConfirmModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * 필터 초기화 실행
 */
function resetAllFiltersConfirmed() {
    console.log('🔄 전체 필터 초기화');

    // 상태 초기화
    window.fullFilterState = {
        tradeType: ['monthly', 'jeonse', 'short_term'],
        depositMin: 0,
        depositMax: 20,
        monthlyMin: 0,
        monthlyMax: 20,
        includeManagement: false,
        kitchen: ['separate', 'open'],
        balcony: ['separate', 'extended'],
        roomType: [],
        areaMin: 0,
        areaMax: 8,
        floor: ['all'],
        buildingAge: ['all'],
        options: [],
        propertyStatus: ['available'],
        listingScope: ['recent']
    };

    // UI 초기화 - 거래유형
    document.querySelectorAll('[data-filter="trade_type"]').forEach(btn => {
        btn.classList.add('selected');
    });

    // UI 초기화 - 보증금 슬라이더
    document.getElementById('depositMin').value = 0;
    document.getElementById('depositMax').value = 20;
    updateDepositSlider();

    // UI 초기화 - 월세 슬라이더
    document.getElementById('monthlyMin').value = 0;
    document.getElementById('monthlyMax').value = 20;
    document.getElementById('includeManagement').checked = false;
    updateMonthlySlider();

    // UI 초기화 - 구조
    document.querySelectorAll('[data-filter="kitchen"]').forEach(btn => {
        btn.classList.add('selected');
    });
    document.querySelectorAll('[data-filter="balcony"]').forEach(btn => {
        btn.classList.add('selected');
    });

    // UI 초기화 - 매물형태
    document.querySelectorAll('[data-filter="room_type"]').forEach(btn => {
        btn.classList.remove('selected');
    });

    // UI 초기화 - 면적 슬라이더
    document.getElementById('areaMin').value = 0;
    document.getElementById('areaMax').value = 8;
    updateAreaSlider();

    // UI 초기화 - 층수
    document.querySelectorAll('[data-filter="floor"]').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector('[data-filter="floor"][data-value="all"]').classList.add('selected');

    // UI 초기화 - 건물년차
    document.querySelectorAll('[data-filter="building_age"]').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector('[data-filter="building_age"][data-value="all"]').classList.add('selected');

    // UI 초기화 - 기타사항
    document.querySelectorAll('[data-filter="options"]').forEach(btn => {
        btn.classList.remove('selected');
    });

    // UI 초기화 - 매물 상태
    document.querySelectorAll('[data-filter="property_status"]').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector('[data-filter="property_status"][data-value="available"]').classList.add('selected');

    // UI 초기화 - 매물 범위
    document.querySelectorAll('[data-filter="listing_scope"]').forEach(btn => {
        btn.classList.remove('selected');
    });
    document.querySelector('[data-filter="listing_scope"][data-value="recent"]').classList.add('selected');

    // 확인 팝업 닫기 (테마별 검색은 별도 관리 - 전체필터 초기화와 무관)
    closeResetConfirm();

    // 필터 아이콘 상태 업데이트
    updateFilterIconState();

    console.log('✅ 전체 필터 초기화 완료');
}

// ============ 필터 적용 ============

/**
 * 필터 적용하기
 */
async function applyFullFilter() {
    console.log('✅ 전체 필터 적용');
    console.log('필터 상태:', window.fullFilterState);

    // ✅ 전체필터 적용 중 플래그 설정 (동/역 선택 해제 방지)
    window.isApplyingFullFilter = true;

    try {
        // 필터 파라미터 생성
        const filterParams = buildFilterParams();
        console.log('필터 파라미터:', filterParams);

        // ✅ 좌표 클러스터 선택 해제
        if (window.appManager && window.appManager.mapManager && window.appManager.mapManager.clusteringManager) {
            if (window.appManager.mapManager.clusteringManager.selectedClusterIndex !== null) {
                window.appManager.mapManager.clusteringManager.selectedClusterIndex = null;
                console.log('📍 전체필터 적용 - 좌표 클러스터 선택 해제');
            }
            // ✅ 드래그 패널 레이블 업데이트
            if (typeof updatePanelLabel === 'function') {
                updatePanelLabel();
            }
        }




        // 매물 다시 로드
        if (window.appManager && window.appManager.mapManager) {
            // 전체 필터 파라미터 저장
            window.appManager.mapManager.fullFilterParams = filterParams;

            // 캐시 초기화
            if (window.appManager.mapManager.propertyCache) {
                window.appManager.mapManager.propertyCache.clear();
            }

            // ✅ 역 필터가 활성화된 경우: 역 반경 내 매물에서 전체필터 적용
            if (window.stationManager && window.stationManager.isStationFilterActive && window.stationManager.selectedStation) {
                console.log('🚇 역 필터 활성 상태 - 역 반경 내 매물에서 전체필터 적용');
                await window.stationManager.filterPropertiesByRadius(window.stationManager.selectedStation);
            } else {
                // 매물 로드
                await window.appManager.mapManager.loadPropertiesInBounds();
            }

            // ✅ 동 선택 상태일 때 선택된 동의 필터링된 수량 업데이트
            if (window.currentDongSearch && window.appManager.mapManager.clusteringManager) {
                const dongName = window.currentDongSearch.locationName;
                const clusteringManager = window.appManager.mapManager.clusteringManager;

                // 현재 마커에서 해당 동의 매물 추출
                const markers = window.appManager.mapManager.markerManager?.markers || [];
                const dongProperties = markers
                    .filter(m => {
                        const prop = m.propertyData;
                        return prop && (prop.ri === dongName || prop.dong === dongName);
                    })
                    .map(m => m.propertyData);

                // 카테고리 필터 적용
                let filteredDongProperties = dongProperties;
                const currentCategory = window.appManager.mapManager.currentCategory;
                if (currentCategory && Array.isArray(currentCategory) && currentCategory.length > 0) {
                    filteredDongProperties = filteredDongProperties.filter(prop =>
                        currentCategory.includes(String(prop.category))
                    );
                }

                // 전체필터 적용
                if (filterParams && Object.keys(filterParams).length > 0 && clusteringManager.applyFullFilterToClusterProperties) {
                    filteredDongProperties = clusteringManager.applyFullFilterToClusterProperties(filteredDongProperties, filterParams);
                }

                // window.currentDongSearch 업데이트
                window.currentDongSearch.filteredCount = filteredDongProperties.length;
                window.currentDongSearch.properties = filteredDongProperties;
                window.currentDongSearch.count = filteredDongProperties.length;

                console.log(`📊 동 선택 상태 - ${dongName} 전체필터 적용: ${dongProperties.length} → ${filteredDongProperties.length}개`);

                // ✅ 드래그패널 헤더 업데이트
                if (typeof StationManager !== 'undefined' && StationManager.updatePropertyCountWithLocation) {
                    StationManager.updatePropertyCountWithLocation(filteredDongProperties.length, dongName);
                }

                // ✅ 패널 내 매물 카드 업데이트
                const listContent = document.getElementById('listContent');
                if (listContent && window.appManager.createPropertyCard) {
                    if (filteredDongProperties.length > 0) {
                        const cards = filteredDongProperties.map(p => window.appManager.createPropertyCard(p)).join('');
                        listContent.innerHTML = cards;

                        // 하트 상태 초기화
                        if (typeof initLikedHearts === 'function') {
                            initLikedHearts();
                        }
                    } else {
                        listContent.innerHTML = `
                            <div class="list-empty">
                                <div class="list-empty-icon">🏠</div>
                                <div class="list-empty-title">${dongName}에 조건에 맞는 매물이 없습니다</div>
                            </div>
                        `;
                    }
                }

                // ✅ 마커 재렌더링 (선택된 동의 수량 업데이트)
                clusteringManager.showClusteredMarkers();
            }

            console.log('✅ 전체 필터 적용 완료');

            // ✅ 동/역 선택 시 매물 없음 체크 후 필요 시 선택 해제 및 팝업
            if (typeof window.checkNoPropertiesAndDeselect === 'function') {
                window.checkNoPropertiesAndDeselect();
            }
        }

        // 필터 아이콘 상태 업데이트
        updateFilterIconState();

        // ✅ 페이지 닫기 (맨 마지막에 실행하여 popstate 이벤트가 isApplyingFullFilter=true 상태에서 처리되도록)
        closeFullFilterPage();

    } catch (error) {
        console.error('❌ 전체 필터 적용 중 에러:', error);
        console.error('에러 스택:', error.stack);
        
        // 에러 발생 시에도 필터 페이지 닫기 시도
        try {
            closeFullFilterPage();
        } catch (e) {
            console.error('❌ 필터 페이지 닫기 실패:', e);
        }
    } finally {
        // ✅ 전체필터 적용 완료 - 플래그 해제 (popstate 이벤트 처리 후 해제되도록 지연)
        setTimeout(() => {
            window.isApplyingFullFilter = false;
            console.log('🔓 isApplyingFullFilter 플래그 해제');
        }, 100);
    }
}

/**
 * 필터 파라미터 생성
 */
function buildFilterParams() {
    const state = window.fullFilterState;
    const params = {};

    // 거래유형
    if (state.tradeType.length < 3) {
        params.trade_type = state.tradeType.join(',');
    }

    // 보증금 (실제 값으로 변환)
    if (state.depositMin > 0 || state.depositMax < 20) {
        params.deposit_min = DEPOSIT_VALUES[state.depositMin];
        params.deposit_max = DEPOSIT_VALUES[state.depositMax];
    }

    // 월세 (실제 값으로 변환)
    if (state.monthlyMin > 0 || state.monthlyMax < 20) {
        params.monthly_min = MONTHLY_VALUES[state.monthlyMin];
        params.monthly_max = MONTHLY_VALUES[state.monthlyMax];
    }

    // 관리비 포함
    if (state.includeManagement) {
        params.include_management = true;
    }

    // 구조-주방
    if (state.kitchen.length < 2) {
        params.kitchen = state.kitchen.join(',');
    }

    // 구조-베란다
    if (state.balcony.length < 2) {
        params.balcony = state.balcony.join(',');
    }

    // 매물형태
    if (state.roomType.length > 0) {
        params.room_type = state.roomType.join(',');
    }

    // 면적 (㎡ 값으로 변환)
    if (state.areaMin > 0 || state.areaMax < 8) {
        params.area_min = AREA_VALUES[state.areaMin].sqm;
        params.area_max = AREA_VALUES[state.areaMax].sqm;
    }

    // 층수
    if (!state.floor.includes('all')) {
        params.floor = state.floor.join(',');
    }

    // 건물년차
    if (!state.buildingAge.includes('all')) {
        params.building_age = state.buildingAge.join(',');
    }

    // 기타사항
    if (state.options.length > 0) {
        params.options = state.options.join(',');
    }

    // 매물 상태
    if (state.propertyStatus.length === 1 && state.propertyStatus[0] !== 'available') {
        params.property_status = state.propertyStatus[0];
    }

    // 매물 범위
    if (state.listingScope.length === 1 && state.listingScope[0] !== 'recent') {
        params.listing_scope = state.listingScope[0];
    }

    // 테마별


    return params;
}

// ============ ESC 키로 페이지 닫기 ============

document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        const filterPage = document.getElementById('fullFilterPage');
        const resetModal = document.getElementById('resetConfirmModal');

        // 초기화 확인 팝업이 열려있으면 먼저 닫기
        if (resetModal && resetModal.classList.contains('active')) {
            closeResetConfirm();
            return;
        }

        // 필터 페이지가 열려있으면 닫기
        if (filterPage && filterPage.classList.contains('active')) {
            closeFullFilterPage();
        }
    }
});

// ============ 전역 함수 등록 ============

window.openFullFilterPage = openFullFilterPage;
window.closeFullFilterPage = closeFullFilterPage;
window.updateDepositSlider = updateDepositSlider;
window.updateMonthlySlider = updateMonthlySlider;
window.updateAreaSlider = updateAreaSlider;
window.toggleAreaUnit = toggleAreaUnit;
window.toggleFilterBtn = toggleFilterBtn;
window.toggleFloorBtn = toggleFloorBtn;
window.toggleBuildingAgeBtn = toggleBuildingAgeBtn;
window.showResetConfirm = showResetConfirm;
window.closeResetConfirm = closeResetConfirm;
window.resetAllFiltersConfirmed = resetAllFiltersConfirmed;
window.applyFullFilter = applyFullFilter;
window.checkIfFilterActive = checkIfFilterActive;
window.syncFilterUIWithState = syncFilterUIWithState;  // ✅ 추가

console.log('✅ 전체 필터 JavaScript 로드됨');
