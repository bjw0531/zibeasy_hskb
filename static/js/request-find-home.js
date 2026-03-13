/* Step form: 집 구하기 */
(function () {
    'use strict';

    const root = document.getElementById('findHomeSteps');
    const progressSegments = document.getElementById('fhProgressSegments');
    const panel = document.getElementById('panel-find_home');
    const csrfToken = document.getElementById('findHomeCsrfToken')?.value || '';
    const privacyModal = document.getElementById('privacyModal');

    if (!root || !progressSegments) return;

    const AREA_OPTIONS = [
        '두정동', '성정동', '백석동', '부대동', '성성동', '차암동', '신부동', '봉명동',
        '쌍용동', '다가동', '불당동', '청수동', '청당동', '삼룡동', '구성동', '신방동', '기타지역'
    ];
    const TYPE_OPTIONS = ['원룸', '투베이', '투룸', '쓰리룸', '기타'];
    const DEPOSIT_OPTIONS = [
        ...Array.from({ length: 30 }, (_, i) => String((i + 1) * 100)),
        '기타'
    ];
    const MONTHLY_OPTIONS = [
        ...Array.from({ length: 21 }, (_, i) => String(20 + i)), /* 20~40 (1만원 단위) */
        ...Array.from({ length: 8 }, (_, i) => String(45 + i * 5)), /* 45~80 (5만원 단위) */
        ...Array.from({ length: 4 }, (_, i) => String(90 + i * 10)) /* 90~120 (10만원 단위) */
    ];
    const JEONSE_NOTICE = '죄송합니다. 전세 매물은 거래를 하지 않고 있습니다.';
    const NAME_REGEX = /^[A-Za-z가-힣\s]+$/;

    const TOTAL_STEPS = 6;
    let currentStep = 0;
    const state = {
        preferred_area: [],
        preferred_type: '',
        price_mode: '',
        budget_deposit: '',
        budget_monthly: '',
        budget_jeonse: '',
        move_in_date: '',
        details: '',
        name: '',
        phone: '',
        privacy_agree: false
    };

    function isPanelVisible() {
        return !!panel && panel.classList.contains('active');
    }

    function openPrivacyModal() {
        if (!privacyModal) return;
        privacyModal.classList.add('active');
        privacyModal.setAttribute('aria-hidden', 'false');
    }

    function initProgress() {
        if (progressSegments.children.length > 0) return;
        for (let i = 0; i < TOTAL_STEPS; i++) {
            const seg = document.createElement('span');
            seg.className = 'fh-progress-segment';
            progressSegments.appendChild(seg);
        }
    }

    function updateProgress() {
        const completed = Math.min(currentStep, TOTAL_STEPS);
        const items = progressSegments.children;
        for (let i = 0; i < items.length; i++) {
            items[i].classList.toggle('filled', i < completed);
            items[i].classList.toggle('current', i === completed && completed < TOTAL_STEPS);
        }
    }

    function focusCurrentField() {
        if (!isPanelVisible()) return;
        const auto = root.querySelector('[data-autofocus]');
        if (!auto) return;
        requestAnimationFrame(() => {
            auto.focus({ preventScroll: true });
            if (auto.matches('input[type="text"], input[type="tel"], textarea')) {
                const len = auto.value.length;
                if (typeof auto.setSelectionRange === 'function') {
                    auto.setSelectionRange(len, len);
                }
            }
            auto.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }

    function createStepCard(titleHtml) {
        const card = document.createElement('div');
        card.className = 'fh-step-card';
        const heading = document.createElement('div');
        heading.className = 'fh-step-title';
        heading.innerHTML = titleHtml;
        card.appendChild(heading);
        return card;
    }

    function createNextButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fh-next-btn';
        btn.textContent = '다음';
        return btn;
    }

    function createPrevButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fh-prev-btn';
        btn.textContent = '이전';
        btn.addEventListener('click', goPrev);
        return btn;
    }

    function createExitButton() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fh-exit-btn';
        btn.textContent = '나가기';
        btn.addEventListener('click', () => {
            window.history.back();
        });
        return btn;
    }

    function createSelect(options, selectedValue, placeholder) {
        const select = document.createElement('select');
        select.className = 'fh-select';

        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = placeholder || '선택해 주세요';
        select.appendChild(empty);

        options.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            select.appendChild(option);
        });
        select.value = selectedValue || '';
        return select;
    }

    function goNext() {
        if (currentStep >= TOTAL_STEPS - 1) return;
        currentStep += 1;
        render();
    }

    function goPrev() {
        if (currentStep <= 0) return;
        currentStep -= 1;
        render();
    }

    function formatPhoneNumber(raw) {
        const digits = String(raw || '').replace(/\D/g, '').slice(0, 11);
        if (digits.length <= 3) return digits;
        if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }

    function isValidName(name) {
        const trimmed = (name || '').trim();
        return !!trimmed && NAME_REGEX.test(trimmed);
    }

    function isSingleKoreanCharacterName(name) {
        const trimmed = String(name || '').trim();
        return /^[가-힣]$/.test(trimmed);
    }

    function validateRequired(value, message) {
        if (String(value || '').trim()) {
            return { valid: true, message: '' };
        }
        return { valid: false, message: message };
    }

    function validatePhoneValue(phone) {
        const trimmed = String(phone || '').trim();
        if (!trimmed) {
            return { valid: false, message: '연락처를 입력해 주세요.' };
        }
        if (!/^\d{3}-\d{4}-\d{4}$/.test(trimmed)) {
            return { valid: false, message: '연락처를 010-0000-0000 형식으로 입력해 주세요.' };
        }
        return { valid: true, message: '' };
    }

    function hasInvalidPhonePrefix(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (digits.length >= 1 && digits.charAt(0) !== '0') return true;
        if (digits.length >= 2 && digits.charAt(1) !== '1') return true;
        if (digits.length >= 3 && digits.charAt(2) !== '0') return true;
        return false;
    }

    function parseDateValue(value) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
        if (!match) return null;
        return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }

    function isBeforeToday(value) {
        const selected = parseDateValue(value);
        if (!selected) return false;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        selected.setHours(0, 0, 0, 0);
        return selected < today;
    }

    function validateMoveInDate(value) {
        const trimmed = String(value || '').trim();
        if (!trimmed) {
            return { valid: false, message: '입주 희망일을 선택해 주세요.' };
        }
        if (isBeforeToday(trimmed)) {
            return { valid: false, message: '당일 이전 날짜는 선택할 수 없습니다.' };
        }
        return { valid: true, message: '' };
    }

    function attachInputState(input, options) {
        if (!window.RequestInputState || typeof window.RequestInputState.attach !== 'function') {
            return {
                refresh() { return true; },
                validate() { return true; }
            };
        }
        return window.RequestInputState.attach(input, options);
    }

    function formatBudgetValue(value) {
        if (!value || value === '기타') return value || '';
        return `${value}만원`;
    }

    function setRangeProgress(input) {
        const min = Number(input.min || 0);
        const max = Number(input.max || 0);
        const value = Number(input.value || 0);
        const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
        input.style.setProperty('--range-progress', `${percent}%`);
    }

    function createRangeMeta(minLabel, maxLabel) {
        const meta = document.createElement('div');
        meta.className = 'fh-range-meta';

        const left = document.createElement('span');
        left.textContent = minLabel;
        const right = document.createElement('span');
        right.textContent = maxLabel;

        meta.appendChild(left);
        meta.appendChild(right);
        return meta;
    }

    function restartAnimation(element, className) {
        if (!element) return;
        element.classList.remove(className);
        void element.offsetWidth;
        element.classList.add(className);
    }

    function initDatePicker(input, onChange) {
        if (!input || typeof window.initHouseDatePicker !== 'function') return;
        input.type = 'text';
        input.readOnly = true;
        window.initHouseDatePicker(input, {
            defaultDate: input.value || null,
            onChange(selectedDates, dateStr) {
                input.value = dateStr;
                if (typeof onChange === 'function') onChange(dateStr);
            }
        });
    }

    function renderAreaStep() {
        const card = createStepCard('<span class="text-red-500">*</span> 어느 지역을 원하세요? (필수) <span class="text-sm font-normal">(중복선택 가능)</span>');
        const field = document.createElement('div');
        field.className = 'fh-field';

        const selector = document.createElement('details');
        selector.className = 'fh-multi-select';

        const summary = document.createElement('summary');
        summary.setAttribute('data-autofocus', 'true');
        selector.appendChild(summary);

        const optionsWrap = document.createElement('div');
        optionsWrap.className = 'fh-multi-options';
        selector.appendChild(optionsWrap);

        const selectedSet = new Set(state.preferred_area);
        function refreshSummary() {
            summary.textContent = state.preferred_area.length > 0
                ? state.preferred_area.join(', ')
                : '지역을 선택해 주세요';
        }

        const nextBtn = createNextButton();
        nextBtn.disabled = state.preferred_area.length === 0;
        nextBtn.addEventListener('click', () => {
            if (state.preferred_area.length === 0) return;
            goNext();
        });

        AREA_OPTIONS.forEach((area) => {
            const label = document.createElement('label');
            label.className = 'fh-multi-option';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = selectedSet.has(area);
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) selectedSet.add(area);
                else selectedSet.delete(area);
                state.preferred_area = AREA_OPTIONS.filter((item) => selectedSet.has(item));
                refreshSummary();
                nextBtn.disabled = state.preferred_area.length === 0;
            });

            const text = document.createElement('span');
            text.textContent = area;
            label.appendChild(checkbox);
            label.appendChild(text);
            optionsWrap.appendChild(label);
        });

        refreshSummary();
        field.appendChild(selector);
        card.appendChild(field);

        const actions = document.createElement('div');
        actions.className = 'fh-actions';
        actions.appendChild(nextBtn);
        card.appendChild(actions);
        return card;
    }

    function renderTypeStep() {
        const card = createStepCard('<span class="text-red-500">*</span> 어떤 집을 원하세요? (필수)');
        const field = document.createElement('div');
        field.className = 'fh-field';

        const select = createSelect(TYPE_OPTIONS, state.preferred_type, '선택해 주세요');
        select.setAttribute('data-autofocus', 'true');
        field.appendChild(select);
        card.appendChild(field);

        const selectState = attachInputState(select, {
            group: field,
            validate(value) {
                return validateRequired(value, '원하시는 집 유형을 선택해 주세요.');
            },
            useTypingState: false
        });

        const actions = document.createElement('div');
        actions.className = 'fh-actions';
        actions.appendChild(createPrevButton());
        const nextBtn = createNextButton();
        nextBtn.disabled = !selectState.refresh('init');

        select.addEventListener('change', () => {
            state.preferred_type = select.value;
            nextBtn.disabled = !selectState.refresh('change');
        });

        nextBtn.addEventListener('click', () => {
            if (!selectState.validate('submit')) return;
            goNext();
        });

        actions.appendChild(nextBtn);
        card.appendChild(actions);
        return card;
    }

    function renderBudgetStep() {
        const card = createStepCard('<span class="text-red-500">*</span> 어느 가격대로 원하세요? (필수)');

        const field = document.createElement('div');
        field.className = 'fh-field';

        const modeGroup = document.createElement('div');
        modeGroup.className = 'fh-radio-group';

        ['월세', '전세'].forEach((mode, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'fh-radio-pill';
            if (state.price_mode === mode) btn.classList.add('active');
            if (!state.price_mode && idx === 0) btn.setAttribute('data-autofocus', 'true');
            btn.textContent = mode;
            btn.addEventListener('click', () => {
                state.price_mode = mode;
                if (mode === '월세') {
                    if (!state.budget_deposit) state.budget_deposit = DEPOSIT_OPTIONS[0];
                    if (!state.budget_monthly) state.budget_monthly = MONTHLY_OPTIONS[0];
                    state.budget_jeonse = '';
                } else {
                    state.budget_deposit = '';
                    state.budget_monthly = '';
                    state.budget_jeonse = JEONSE_NOTICE;
                }
                render();
            });
            modeGroup.appendChild(btn);
        });
        field.appendChild(modeGroup);

        if (state.price_mode === '월세') {
            if (!state.budget_deposit) state.budget_deposit = DEPOSIT_OPTIONS[0];
            if (!state.budget_monthly) state.budget_monthly = MONTHLY_OPTIONS[0];

            const depositWrap = document.createElement('div');
            depositWrap.className = 'fh-range-wrap';
            const depositHead = document.createElement('div');
            depositHead.className = 'fh-range-head';
            const depositLabel = document.createElement('span');
            depositLabel.className = 'fh-range-label';
            depositLabel.textContent = '보증금';
            const depositValue = document.createElement('span');
            depositValue.className = 'fh-range-value';
            depositValue.textContent = formatBudgetValue(state.budget_deposit);
            depositHead.appendChild(depositLabel);
            depositHead.appendChild(depositValue);
            const depositRange = document.createElement('input');
            depositRange.type = 'range';
            depositRange.className = 'fh-range';
            depositRange.min = '0';
            depositRange.max = String(DEPOSIT_OPTIONS.length - 1);
            depositRange.step = '1';
            depositRange.value = String(Math.max(0, DEPOSIT_OPTIONS.indexOf(state.budget_deposit)));
            depositRange.setAttribute('data-autofocus', 'true');
            depositRange.addEventListener('input', () => {
                const idx = Number(depositRange.value);
                state.budget_deposit = DEPOSIT_OPTIONS[idx] || DEPOSIT_OPTIONS[0];
                depositValue.textContent = formatBudgetValue(state.budget_deposit);
                setRangeProgress(depositRange);
                restartAnimation(depositValue, 'is-pulsing');
                restartAnimation(depositRange, 'is-bumping');
            });
            setRangeProgress(depositRange);
            depositWrap.appendChild(depositHead);
            depositWrap.appendChild(depositRange);
            depositWrap.appendChild(createRangeMeta('100만원', '3000만원+'));

            const monthlyWrap = document.createElement('div');
            monthlyWrap.className = 'fh-range-wrap';
            const monthlyHead = document.createElement('div');
            monthlyHead.className = 'fh-range-head';
            const monthlyLabel = document.createElement('span');
            monthlyLabel.className = 'fh-range-label';
            monthlyLabel.textContent = '월세';
            const monthlyValue = document.createElement('span');
            monthlyValue.className = 'fh-range-value';
            monthlyValue.textContent = formatBudgetValue(state.budget_monthly);
            monthlyHead.appendChild(monthlyLabel);
            monthlyHead.appendChild(monthlyValue);
            const monthlyRange = document.createElement('input');
            monthlyRange.type = 'range';
            monthlyRange.className = 'fh-range';
            monthlyRange.min = '0';
            monthlyRange.max = String(MONTHLY_OPTIONS.length - 1);
            monthlyRange.step = '1';
            monthlyRange.value = String(Math.max(0, MONTHLY_OPTIONS.indexOf(state.budget_monthly)));
            monthlyRange.addEventListener('input', () => {
                const idx = Number(monthlyRange.value);
                state.budget_monthly = MONTHLY_OPTIONS[idx] || MONTHLY_OPTIONS[0];
                monthlyValue.textContent = formatBudgetValue(state.budget_monthly);
                setRangeProgress(monthlyRange);
                restartAnimation(monthlyValue, 'is-pulsing');
                restartAnimation(monthlyRange, 'is-bumping');
            });
            setRangeProgress(monthlyRange);
            monthlyWrap.appendChild(monthlyHead);
            monthlyWrap.appendChild(monthlyRange);
            monthlyWrap.appendChild(createRangeMeta('20만원', '120만원'));

            field.appendChild(depositWrap);
            field.appendChild(monthlyWrap);
        } else if (state.price_mode === '전세') {
            const info = document.createElement('div');
            info.className = 'fh-info';
            info.textContent = JEONSE_NOTICE;
            field.appendChild(info);
        }

        card.appendChild(field);

        const actions = document.createElement('div');
        actions.className = 'fh-actions';
        actions.appendChild(createPrevButton());
        if (state.price_mode === '전세') {
            actions.appendChild(createExitButton());
        } else {
            const nextBtn = createNextButton();
            nextBtn.disabled = state.price_mode !== '월세' || !(state.budget_deposit && state.budget_monthly);
            nextBtn.addEventListener('click', () => {
                if (nextBtn.disabled) return;
                goNext();
            });
            actions.appendChild(nextBtn);
        }
        card.appendChild(actions);
        return card;
    }

    function renderMoveInStep() {
        const card = createStepCard('<span class="text-red-500">*</span> 언제 입주를 희망하세요? (필수)');
        const field = document.createElement('div');
        field.className = 'fh-field rq-date-field';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'fh-input flatpickr-input rq-date-input';
        input.placeholder = '날짜를 선택해 주세요';
        input.value = state.move_in_date || '';
        input.readOnly = true;
        input.setAttribute('inputmode', 'none');
        input.setAttribute('aria-label', '입주 희망일');
        input.setAttribute('data-autofocus', 'true');
        field.appendChild(input);
        card.appendChild(field);

        const moveInState = attachInputState(input, {
            group: field,
            validate(value) {
                return validateMoveInDate(value);
            },
            useTypingState: false,
            shouldShowError(context) {
                return context.reason === 'change' && !!String(context.value || '').trim() && isBeforeToday(context.value);
            }
        });

        const actions = document.createElement('div');
        actions.className = 'fh-actions';
        actions.appendChild(createPrevButton());
        const nextBtn = createNextButton();
        nextBtn.disabled = !moveInState.refresh('init');

        requestAnimationFrame(() => {
            initDatePicker(input, (dateStr) => {
                state.move_in_date = dateStr;
                nextBtn.disabled = !moveInState.refresh('change');
            });
        });

        nextBtn.addEventListener('click', () => {
            if (!moveInState.validate('submit')) return;
            goNext();
        });

        actions.appendChild(nextBtn);
        card.appendChild(actions);
        return card;
    }

    function renderDetailsStep() {
        const card = createStepCard('추가로 원하시는 조건이 있으신가요? (선택)');
        const field = document.createElement('div');
        field.className = 'fh-field';

        const textarea = document.createElement('textarea');
        textarea.className = 'fh-textarea';
        textarea.placeholder = '추가 조건을 입력해 주세요.';
        textarea.value = state.details || '';
        textarea.setAttribute('data-autofocus', 'true');
        field.appendChild(textarea);
        card.appendChild(field);

        const detailsState = attachInputState(textarea, {
            group: field,
            required: false
        });
        detailsState.refresh('init');
        textarea.addEventListener('input', () => {
            detailsState.refresh('input');
        });

        const actions = document.createElement('div');
        actions.className = 'fh-actions';
        actions.appendChild(createPrevButton());

        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'fh-skip-btn';
        skipBtn.textContent = '건너뛰기';
        skipBtn.addEventListener('click', () => {
            state.details = '';
            goNext();
        });

        const nextBtn = createNextButton();
        nextBtn.addEventListener('click', () => {
            state.details = textarea.value.trim();
            goNext();
        });

        actions.appendChild(skipBtn);
        actions.appendChild(nextBtn);
        card.appendChild(actions);
        return card;
    }

    function renderContactStep() {
        const card = createStepCard('<span class="text-red-500">*</span> 이름과 연락처를 알려주세요. (필수)');

        const grid = document.createElement('div');
        grid.className = 'fh-contact-grid';

        const nameField = document.createElement('div');
        nameField.className = 'fh-contact-field';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'fh-input';
        nameInput.placeholder = '이름';
        nameInput.value = state.name || '';
        nameInput.autocomplete = 'name';
        nameInput.setAttribute('data-autofocus', 'true');
        const nameError = document.createElement('div');
        nameError.className = 'fh-error';

        const phoneField = document.createElement('div');
        phoneField.className = 'fh-contact-field';
        const phoneInput = document.createElement('input');
        phoneInput.type = 'tel';
        phoneInput.className = 'fh-input';
        phoneInput.placeholder = '010-0000-0000';
        phoneInput.value = formatPhoneNumber(state.phone || '');
        phoneInput.autocomplete = 'tel';
        phoneInput.inputMode = 'tel';
        phoneInput.maxLength = 13;
        const phoneError = document.createElement('div');
        phoneError.className = 'fh-error';

        nameField.appendChild(nameInput);
        nameField.appendChild(nameError);
        phoneField.appendChild(phoneInput);
        phoneField.appendChild(phoneError);
        grid.appendChild(nameField);
        grid.appendChild(phoneField);
        card.appendChild(grid);

        const privacyBox = document.createElement('div');
        privacyBox.className = 'fh-privacy';
        const label = document.createElement('label');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = !!state.privacy_agree;
        const txt = document.createElement('span');
        txt.textContent = '개인정보 활용 동의 (필수)';
        label.appendChild(check);
        label.appendChild(txt);
        privacyBox.appendChild(label);

        const privacyLink = document.createElement('button');
        privacyLink.type = 'button';
        privacyLink.className = 'fh-privacy-link';
        privacyLink.textContent = '개인정보 활용 동의 내용 보기';
        privacyLink.addEventListener('click', openPrivacyModal);
        privacyBox.appendChild(privacyLink);
        card.appendChild(privacyBox);

        const actions = document.createElement('div');
        actions.className = 'fh-actions';
        actions.appendChild(createPrevButton());
        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'fh-submit-btn';
        submitBtn.textContent = '집 구하기 신청하기';
        actions.appendChild(submitBtn);
        card.appendChild(actions);

        const nameState = attachInputState(nameInput, {
            group: nameField,
            errorEl: nameError,
            validate(value) {
                const trimmed = String(value || '').trim();
                if (!trimmed) {
                    return { valid: false, message: '이름을 입력해 주세요.' };
                }
                if (isSingleKoreanCharacterName(trimmed)) {
                    return { valid: false, message: '이름을 정확히 입력해 주세요.' };
                }
                if (!isValidName(trimmed)) {
                    return { valid: false, message: '이름은 한글과 영문만 입력해 주세요.' };
                }
                return { valid: true, message: '' };
            },
            showErrorOnInput: true
        });

        const phoneState = attachInputState(phoneInput, {
            group: phoneField,
            errorEl: phoneError,
            validate(value) {
                if (hasInvalidPhonePrefix(value)) {
                    return { valid: false, message: '정확한 연락처를 입력해 주세요.' };
                }
                return validatePhoneValue(value);
            },
            shouldShowError(context) {
                return context.reason === 'input' && hasInvalidPhonePrefix(context.value);
            }
        });

        function updateSubmitState() {
            submitBtn.disabled = !(
                isValidName(state.name) &&
                validatePhoneValue(state.phone).valid &&
                state.privacy_agree
            );
        }

        nameInput.addEventListener('input', () => {
            state.name = nameInput.value.trim();
            nameState.refresh('input');
            updateSubmitState();
        });
        phoneInput.addEventListener('keydown', (e) => {
            if (e.key.length === 1 && !/\d/.test(e.key)) {
                e.preventDefault();
            }
        });
        phoneInput.addEventListener('input', () => {
            const formatted = formatPhoneNumber(phoneInput.value || '');
            phoneInput.value = formatted;
            state.phone = formatted;
            phoneState.refresh('input');
            updateSubmitState();
        });
        check.addEventListener('change', () => {
            state.privacy_agree = check.checked;
            updateSubmitState();
        });

        submitBtn.addEventListener('click', () => {
            const isNameValid = nameState.validate('submit');
            const isPhoneValid = phoneState.validate('submit');
            updateSubmitState();
            if (!isNameValid || !isPhoneValid || !state.privacy_agree) return;
            submitFindHome(submitBtn);
        });

        state.name = nameInput.value.trim();
        state.phone = formatPhoneNumber(phoneInput.value || '');
        phoneInput.value = state.phone;
        nameState.refresh('init');
        phoneState.refresh('init');
        updateSubmitState();
        return card;
    }

    async function submitFindHome(button) {
        if (button.disabled) return;

        button.disabled = true;
        button.textContent = '접수 중...';

        const payload = {
            request_type: 'find_home',
            csrf_token: csrfToken,
            privacy_agree: 'Y',
            name: state.name,
            phone: state.phone,
            email: '',
            preferred_area: state.preferred_area.join(', '),
            preferred_type: state.preferred_type,
            budget_deposit: state.price_mode === '월세' ? state.budget_deposit : '',
            budget_monthly: state.price_mode === '월세' ? state.budget_monthly : '',
            budget_jeonse: state.price_mode === '전세' ? JEONSE_NOTICE : '',
            budget_sale: '',
            move_in_date: state.move_in_date,
            details: state.details
        };

        try {
            const response = await fetch('/request/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (!response.ok || !data.success) {
                throw new Error(data.message || '요청 처리에 실패했습니다.');
            }
            currentStep = TOTAL_STEPS;
            updateProgress();
            root.innerHTML = `
                <div class="fh-done-screen">
                    <div class="fh-done-check">
                        <svg viewBox="0 0 24 24"><polyline points="6 12 10 16 18 8"></polyline></svg>
                    </div>
                    <div class="fh-done-title">신청이 완료되었습니다!</div>
                    <div class="fh-done-desc">조건에 맞는 매물을 확인해<br>빠르게 연락드리겠습니다.</div>
                </div>
            `;
        } catch (err) {
            alert(err.message || '요청 중 오류가 발생했습니다.');
            button.disabled = false;
            button.textContent = '집 구하기 신청하기';
        }
    }

    function render() {
        initProgress();
        updateProgress();
        root.innerHTML = '';

        let card = null;
        if (currentStep === 0) card = renderAreaStep();
        else if (currentStep === 1) card = renderTypeStep();
        else if (currentStep === 2) card = renderBudgetStep();
        else if (currentStep === 3) card = renderMoveInStep();
        else if (currentStep === 4) card = renderDetailsStep();
        else card = renderContactStep();

        root.appendChild(card);
        focusCurrentField();
    }

    const findHomeTab = document.querySelector('.tab-btn[data-tab="find_home"]');
    if (findHomeTab) {
        findHomeTab.addEventListener('click', () => {
            setTimeout(focusCurrentField, 60);
        });
    }

    render();
})();
