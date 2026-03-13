/* ── Step Form: 집 내놓기 ── */
(function () {
    'use strict';

    const DEPOSIT_OPTIONS = Array.from({ length: 30 }, (_, i) => String((i + 1) * 100));
    const MONTHLY_OPTIONS = [
        ...Array.from({ length: 21 }, (_, i) => String(20 + i)),
        ...Array.from({ length: 8 }, (_, i) => String(45 + i * 5)),
        ...Array.from({ length: 4 }, (_, i) => String(90 + i * 10))
    ];
    const MAINTENANCE_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i));
    const NAME_REGEX = /^[A-Za-z가-힣\s]+$/;
    const JEONSE_NOTICE = '죄송합니다. 전세는 거래를 하지 않고 있습니다.';

    const STEPS = [
        { id: 'address', label: '내놓으실 집 주소는요?', type: 'text', field: 'property_address', placeholder: '예: 두정동 0000번지', requiredMessage: '매물 주소를 입력해 주세요.' },
        { id: 'building', label: '건물이름과 호실은요?', type: 'dual', fields: [
            { label: '건물명', placeholder: '예: OO빌라', field: 'building_name' },
            { label: '호실', placeholder: '예: 301호', field: 'room_number' }
        ]},
        { id: 'prop_type', label: '내놓으실 집은 어떤건가요?', type: 'choice', field: 'property_type',
            choices: ['원룸', '투베이', '투룸', '쓰리룸', '오피스텔', '상가', '기타'] },
        { id: 'tx_type', label: '거래 유형을 선택해 주세요.', type: 'choice', field: 'transaction_type',
            choices: ['월세', '전세', '매매'] },
        { id: 'price', label: '', type: 'dynamic_price' },
        { id: 'maint', label: '고정 관리비는 얼마인가요?', type: 'text', field: 'maintenance_fee', placeholder: '예: 10만원', requiredMessage: '고정 관리비를 입력해 주세요.' },
        { id: 'move_date', label: '입주가 가능한 날짜는 언제부터인가요?', type: 'date', field: 'move_in_date' },
        { id: 'details', label: '추가로 전달하실 내용이 있으신가요?', type: 'textarea', field: 'details', placeholder: '특이사항, 옵션 등', optional: true },
        { id: 'contact', label: '이름과 연락처를 알려주세요.', type: 'contact' },
        { id: 'confirm', label: '', type: 'confirm' }
    ];

    let currentStep = 0;
    const answers = {
        property_address: '',
        building_name: '',
        room_number: '',
        property_type: '',
        transaction_type: '',
        deposit: '',
        monthly_rent: '',
        jeonse_price: '',
        sale_price: '',
        maintenance_fee: '',
        move_in_date: '',
        details: '',
        name: '',
        phone: '',
        privacy_agree: false
    };

    const csrfToken = document.getElementById('sfCsrfToken')?.value || '';
    const stepsContainer = document.getElementById('sfSteps');
    const progressSegments = document.getElementById('sfProgressSegments');
    const privacyModal = document.getElementById('privacyModal');

    if (!stepsContainer) return;

    function ensureProgressSegments() {
        if (!progressSegments || progressSegments.children.length > 0) return;
        const total = STEPS.length - 1;
        for (let i = 0; i < total; i++) {
            const seg = document.createElement('span');
            seg.className = 'sf-progress-segment';
            progressSegments.appendChild(seg);
        }
    }

    function updateProgress() {
        const total = STEPS.length - 1;
        const completed = Math.min(currentStep, total);
        if (!progressSegments) return;
        Array.from(progressSegments.children).forEach((item, index) => {
            item.classList.toggle('filled', index < completed);
            item.classList.toggle('current', index === completed && completed < total);
        });
    }

    function goPrev() {
        if (currentStep <= 0) return;
        currentStep -= 1;
        render();
        requestAnimationFrame(() => {
            const active = stepsContainer.querySelector('.sf-active, .sf-confirm');
            if (active) active.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }

    function advance() {
        currentStep += 1;
        render();
        requestAnimationFrame(() => {
            const active = stepsContainer.querySelector('.sf-active, .sf-confirm');
            if (active) active.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }

    function formatPhoneNumber(raw) {
        const digits = String(raw || '').replace(/\D/g, '').slice(0, 11);
        if (digits.length <= 3) return digits;
        if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
        return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    }

    function formatBudgetValue(value) {
        if (value === '' || value == null) return '';
        return `${value}만원`;
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

    function isValidName(name) {
        const trimmed = String(name || '').trim();
        return !!trimmed && NAME_REGEX.test(trimmed);
    }

    function isSingleKoreanCharacterName(name) {
        return /^[가-힣]$/.test(String(name || '').trim());
    }

    function hasInvalidPhonePrefix(phone) {
        const digits = String(phone || '').replace(/\D/g, '');
        if (digits.length >= 1 && digits.charAt(0) !== '0') return true;
        if (digits.length >= 2 && digits.charAt(1) !== '1') return true;
        if (digits.length >= 3 && digits.charAt(2) !== '0') return true;
        return false;
    }

    function validateRequired(value, message) {
        if (String(value || '').trim()) return { valid: true, message: '' };
        return { valid: false, message: message };
    }

    function validatePhoneValue(phone) {
        const trimmed = String(phone || '').trim();
        if (!trimmed) {
            return { valid: false, message: '연락처를 입력해 주세요.' };
        }
        if (hasInvalidPhonePrefix(trimmed)) {
            return { valid: false, message: '정확한 연락처를 입력해 주세요.' };
        }
        if (!/^\d{3}-\d{4}-\d{4}$/.test(trimmed)) {
            return { valid: false, message: '연락처를 010-0000-0000 형식으로 입력해 주세요.' };
        }
        return { valid: true, message: '' };
    }

    function validateContactName(value) {
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
    }

    function validateMoveInDate(value) {
        const trimmed = String(value || '').trim();
        if (!trimmed) {
            return { valid: false, message: '입주가 가능한 날짜를 선택해 주세요.' };
        }
        if (isBeforeToday(trimmed)) {
            return { valid: false, message: '당일 이전 날짜를 선택 할 수 없습니다.' };
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

    function openPrivacyModal() {
        if (!privacyModal) return;
        privacyModal.classList.add('active');
        privacyModal.setAttribute('aria-hidden', 'false');
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

    function setRangeProgress(input) {
        const min = Number(input.min || 0);
        const max = Number(input.max || 0);
        const value = Number(input.value || 0);
        const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;
        input.style.setProperty('--range-progress', `${percent}%`);
    }

    function restartAnimation(element, className) {
        if (!element) return;
        element.classList.remove(className);
        void element.offsetWidth;
        element.classList.add(className);
    }

    function createRangeMeta(minLabel, maxLabel) {
        const meta = document.createElement('div');
        meta.className = 'sf-range-meta';
        const left = document.createElement('span');
        left.textContent = minLabel;
        const right = document.createElement('span');
        right.textContent = maxLabel;
        meta.appendChild(left);
        meta.appendChild(right);
        return meta;
    }

    function createNextBtn(label) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sf-next-btn';
        btn.textContent = label || '다음';
        return btn;
    }

    function createPrevBtn() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sf-prev-btn';
        btn.textContent = '이전';
        btn.addEventListener('click', goPrev);
        return btn;
    }

    function createExitBtn() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'fh-exit-btn';
        btn.textContent = '나가기';
        btn.addEventListener('click', () => {
            window.history.back();
        });
        return btn;
    }

    function createActions(...buttons) {
        const actions = document.createElement('div');
        actions.className = 'sf-actions';
        if (currentStep > 0) actions.appendChild(createPrevBtn());
        buttons.forEach((button) => actions.appendChild(button));
        return actions;
    }

    function syncTransactionType(value) {
        answers.transaction_type = value;
        if (value === '월세') {
            answers.jeonse_price = '';
            answers.sale_price = '';
        } else if (value === '전세') {
            answers.deposit = '';
            answers.monthly_rent = '';
            answers.sale_price = '';
        } else if (value === '매매') {
            answers.deposit = '';
            answers.monthly_rent = '';
            answers.jeonse_price = '';
        }
    }

    function getPriceLabel() {
        if (answers.transaction_type === '월세') return '보증금 / 월세';
        if (answers.transaction_type === '전세') return '전세가';
        return '매매가';
    }

    function getPriceSummary() {
        if (answers.transaction_type === '월세') {
            return `${formatBudgetValue(answers.deposit) || '-'} / ${formatBudgetValue(answers.monthly_rent) || '-'}`;
        }
        if (answers.transaction_type === '전세') {
            return answers.jeonse_price || JEONSE_NOTICE;
        }
        return answers.sale_price || '-';
    }

    function render() {
        stepsContainer.innerHTML = '';
        ensureProgressSegments();
        updateProgress();

        const step = STEPS[currentStep];
        if (!step) return;

        if (step.type === 'confirm') {
            stepsContainer.appendChild(createConfirmCard());
        } else {
            stepsContainer.appendChild(createActiveCard(step));
        }
    }

    function createActiveCard(step) {
        const card = document.createElement('div');
        card.className = 'sf-active';

        let label = step.label;
        if (step.type === 'dynamic_price') {
            label = '어떤 가격으로 내놓으세요?';
        }

        const labelEl = document.createElement('div');
        labelEl.className = 'sf-active-label';
        const requiredText = step.optional ? '(선택)' : '(필수)';
        const asteriskHtml = step.optional ? '' : '<span style="color: #ef4444;">*</span> ';
        labelEl.innerHTML = `${asteriskHtml}${label} ${requiredText}`;
        card.appendChild(labelEl);

        switch (step.type) {
            case 'text':
                card.appendChild(buildTextInput(step));
                break;
            case 'dual':
                card.appendChild(buildDualInput(step));
                break;
            case 'choice':
                card.appendChild(buildChoices(step));
                break;
            case 'dynamic_price':
                card.appendChild(buildPriceInput());
                break;
            case 'date':
                card.appendChild(buildDateInput(step));
                break;
            case 'textarea':
                card.appendChild(buildTextareaInput(step));
                break;
            case 'contact':
                card.appendChild(buildContactStep());
                break;
        }

        requestAnimationFrame(() => {
            const focusTarget = card.querySelector('[data-autofocus], input, textarea, button, select');
            if (focusTarget && typeof focusTarget.focus === 'function') {
                focusTarget.focus();
            }
        });

        return card;
    }

    function buildTextInput(step) {
        const wrap = document.createElement('div');
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = step.placeholder || '';
        input.autocomplete = 'off';
        input.value = answers[step.field] || '';

        const fieldState = attachInputState(input, {
            group: wrap,
            validate(value) {
                return validateRequired(value, step.requiredMessage || '입력값을 확인해 주세요.');
            }
        });

        const nextBtn = createNextBtn();
        nextBtn.disabled = !fieldState.refresh('init');

        input.addEventListener('input', () => {
            nextBtn.disabled = !fieldState.refresh('input');
        });
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (!fieldState.validate('submit')) return;
            answers[step.field] = input.value.trim();
            advance();
        });
        nextBtn.addEventListener('click', () => {
            if (!fieldState.validate('submit')) return;
            answers[step.field] = input.value.trim();
            advance();
        });

        wrap.appendChild(input);
        wrap.appendChild(createActions(nextBtn));
        return wrap;
    }

    function buildDualInput(step) {
        const wrap = document.createElement('div');
        const grid = document.createElement('div');
        grid.className = 'sf-dual';

        const inputs = step.fields.map((field, index) => {
            const col = document.createElement('div');
            const label = document.createElement('div');
            label.className = 'sf-dual-label';
            label.textContent = field.label;

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = field.placeholder;
            input.autocomplete = 'off';
            input.value = answers[field.field] || '';

            col.appendChild(label);
            col.appendChild(input);
            grid.appendChild(col);
            return input;
        });

        const fieldStates = inputs.map((input, index) => attachInputState(input, {
            group: input.parentElement,
            validate(value) {
                return validateRequired(value, `${step.fields[index].label}을 입력해 주세요.`);
            }
        }));

        const nextBtn = createNextBtn();
        function sync(reason) {
            nextBtn.disabled = fieldStates.some((stateCtrl) => !stateCtrl.refresh(reason || 'input'));
        }
        sync('init');

        inputs.forEach((input, index) => {
            input.addEventListener('input', () => sync('input'));
            input.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                if (index === 0) {
                    inputs[1].focus();
                    return;
                }
                if (fieldStates.some((stateCtrl) => !stateCtrl.validate('submit'))) return;
                step.fields.forEach((field, fieldIndex) => {
                    answers[field.field] = inputs[fieldIndex].value.trim();
                });
                advance();
            });
        });

        nextBtn.addEventListener('click', () => {
            if (fieldStates.some((stateCtrl) => !stateCtrl.validate('submit'))) return;
            step.fields.forEach((field, index) => {
                answers[field.field] = inputs[index].value.trim();
            });
            advance();
        });

        wrap.appendChild(grid);
        wrap.appendChild(createActions(nextBtn));
        return wrap;
    }

    function buildChoices(step) {
        const container = document.createElement('div');
        const wrap = document.createElement('div');
        wrap.className = 'sf-choices';
        const nextBtn = createNextBtn();
        nextBtn.disabled = !answers[step.field];

        step.choices.forEach((choice) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'sf-choice-btn';
            button.textContent = choice;
            if (answers[step.field] === choice) button.classList.add('is-selected');
            button.addEventListener('click', () => {
                if (step.field === 'transaction_type') {
                    syncTransactionType(choice);
                } else {
                    answers[step.field] = choice;
                }
                wrap.querySelectorAll('.sf-choice-btn').forEach((item) => {
                    item.classList.toggle('is-selected', item === button);
                });
                nextBtn.disabled = false;
            });
            wrap.appendChild(button);
        });

        nextBtn.addEventListener('click', () => {
            if (!answers[step.field]) return;
            advance();
        });

        container.appendChild(wrap);
        container.appendChild(createActions(nextBtn));
        return container;
    }

    function buildMonthlyRangeField(label, options, answerKey, minLabel, maxLabel, autofocus) {
        if (!answers[answerKey]) {
            answers[answerKey] = options[0];
        }

        const wrap = document.createElement('div');
        wrap.className = 'sf-range-wrap';

        const head = document.createElement('div');
        head.className = 'sf-range-head';

        const title = document.createElement('span');
        title.className = 'sf-range-label';
        title.textContent = label;

        const value = document.createElement('span');
        value.className = 'sf-range-value';
        value.textContent = formatBudgetValue(answers[answerKey]);

        head.appendChild(title);
        head.appendChild(value);

        const range = document.createElement('input');
        range.type = 'range';
        range.className = 'sf-range';
        range.min = '0';
        range.max = String(options.length - 1);
        range.step = '1';
        range.value = String(Math.max(0, options.indexOf(answers[answerKey])));
        if (autofocus) {
            range.setAttribute('data-autofocus', 'true');
        }
        range.addEventListener('input', () => {
            const index = Number(range.value);
            answers[answerKey] = options[index] || options[0];
            value.textContent = formatBudgetValue(answers[answerKey]);
            setRangeProgress(range);
            restartAnimation(value, 'is-pulsing');
            restartAnimation(range, 'is-bumping');
        });
        setRangeProgress(range);

        wrap.appendChild(head);
        wrap.appendChild(range);
        wrap.appendChild(createRangeMeta(minLabel, maxLabel));
        return wrap;
    }

    function buildPriceInput() {
        const wrap = document.createElement('div');
        const tx = answers.transaction_type;

        if (tx === '전세') {
            const info = document.createElement('div');
            info.className = 'fh-info';
            info.textContent = JEONSE_NOTICE;
            wrap.appendChild(info);
            wrap.appendChild(createActions(createExitBtn()));
            return wrap;
        }

        if (tx === '월세') {
            wrap.appendChild(buildMonthlyRangeField('보증금', DEPOSIT_OPTIONS, 'deposit', '100만원', '3000만원+', true));
            wrap.appendChild(buildMonthlyRangeField('월세', MONTHLY_OPTIONS, 'monthly_rent', '20만원', '120만원', false));

            const nextBtn = createNextBtn();
            nextBtn.addEventListener('click', () => {
                advance();
            });
            wrap.appendChild(createActions(nextBtn));
            return wrap;
        }

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '예: 1억 5천';
        input.autocomplete = 'off';
        input.value = answers.sale_price || '';

        const fieldState = attachInputState(input, {
            group: wrap,
            validate(value) {
                return validateRequired(value, '매매가를 입력해 주세요.');
            }
        });

        const nextBtn = createNextBtn();
        nextBtn.disabled = !fieldState.refresh('init');
        input.addEventListener('input', () => {
            nextBtn.disabled = !fieldState.refresh('input');
        });
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (!fieldState.validate('submit')) return;
            answers.sale_price = input.value.trim();
            advance();
        });
        nextBtn.addEventListener('click', () => {
            if (!fieldState.validate('submit')) return;
            answers.sale_price = input.value.trim();
            advance();
        });

        wrap.appendChild(input);
        wrap.appendChild(createActions(nextBtn));
        return wrap;
    }


    function buildDateInput(step) {
        const wrap = document.createElement('div');
        wrap.classList.add('rq-date-field');

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'flatpickr-input rq-date-input';
        input.placeholder = '날짜를 선택해 주세요';
        input.readOnly = true;
        input.setAttribute('inputmode', 'none');
        input.setAttribute('aria-label', step.label);
        input.value = answers[step.field] || '';

        const fieldState = attachInputState(input, {
            group: wrap,
            validate(value) {
                return validateMoveInDate(value);
            },
            useTypingState: false,
            shouldShowError(context) {
                return context.reason === 'change' && !!String(context.value || '').trim() && isBeforeToday(context.value);
            }
        });

        const nextBtn = createNextBtn();
        nextBtn.disabled = !fieldState.refresh('init');

        requestAnimationFrame(() => {
            initDatePicker(input, (dateStr) => {
                answers[step.field] = dateStr;
                nextBtn.disabled = !fieldState.refresh('change');
            });
        });

        nextBtn.addEventListener('click', () => {
            if (!fieldState.validate('submit')) return;
            answers[step.field] = input.value;
            advance();
        });

        wrap.appendChild(input);
        wrap.appendChild(createActions(nextBtn));
        return wrap;
    }

    function buildTextareaInput(step) {
        const wrap = document.createElement('div');
        const textarea = document.createElement('textarea');
        textarea.placeholder = step.placeholder || '';
        textarea.value = answers[step.field] || '';

        const fieldState = attachInputState(textarea, {
            group: wrap,
            required: false
        });
        fieldState.refresh('init');

        const nextBtn = createNextBtn();
        const skipBtn = document.createElement('button');
        skipBtn.type = 'button';
        skipBtn.className = 'sf-skip-btn';
        skipBtn.textContent = '건너뛰기';

        textarea.addEventListener('input', () => {
            fieldState.refresh('input');
        });
        textarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                answers[step.field] = textarea.value.trim();
                advance();
            }
        });

        skipBtn.addEventListener('click', () => {
            answers[step.field] = '';
            advance();
        });
        nextBtn.addEventListener('click', () => {
            answers[step.field] = textarea.value.trim();
            advance();
        });

        wrap.appendChild(textarea);
        wrap.appendChild(createActions(skipBtn, nextBtn));
        return wrap;
    }

    function buildContactStep() {
        const wrap = document.createElement('div');

        const grid = document.createElement('div');
        grid.className = 'fh-contact-grid';

        const nameField = document.createElement('div');
        nameField.className = 'fh-contact-field';
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'fh-input';
        nameInput.placeholder = '이름';
        nameInput.autocomplete = 'name';
        nameInput.value = answers.name || '';
        nameInput.setAttribute('data-autofocus', 'true');
        const nameError = document.createElement('div');
        nameError.className = 'fh-error';
        nameField.appendChild(nameInput);
        nameField.appendChild(nameError);

        const phoneField = document.createElement('div');
        phoneField.className = 'fh-contact-field';
        const phoneInput = document.createElement('input');
        phoneInput.type = 'tel';
        phoneInput.className = 'fh-input';
        phoneInput.placeholder = '010-0000-0000';
        phoneInput.autocomplete = 'tel';
        phoneInput.inputMode = 'tel';
        phoneInput.maxLength = 13;
        phoneInput.value = formatPhoneNumber(answers.phone || '');
        const phoneError = document.createElement('div');
        phoneError.className = 'fh-error';
        phoneField.appendChild(phoneInput);
        phoneField.appendChild(phoneError);

        grid.appendChild(nameField);
        grid.appendChild(phoneField);
        wrap.appendChild(grid);

        const privacyBox = document.createElement('div');
        privacyBox.className = 'fh-privacy';

        const label = document.createElement('label');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.checked = !!answers.privacy_agree;
        const text = document.createElement('span');
        text.textContent = '개인정보 활용 동의 (필수)';
        label.appendChild(check);
        label.appendChild(text);
        privacyBox.appendChild(label);

        const privacyLink = document.createElement('button');
        privacyLink.type = 'button';
        privacyLink.className = 'fh-privacy-link';
        privacyLink.textContent = '개인정보 활용 동의 내용 보기';
        privacyLink.addEventListener('click', openPrivacyModal);
        privacyBox.appendChild(privacyLink);
        wrap.appendChild(privacyBox);

        const nameState = attachInputState(nameInput, {
            group: nameField,
            errorEl: nameError,
            validate(value) {
                return validateContactName(value);
            },
            showErrorOnInput: true
        });

        const phoneState = attachInputState(phoneInput, {
            group: phoneField,
            errorEl: phoneError,
            validate(value) {
                return validatePhoneValue(value);
            },
            shouldShowError(context) {
                return context.reason === 'input' && hasInvalidPhonePrefix(context.value);
            }
        });

        function updateNextState() {
            const nameValid = validateContactName(answers.name).valid;
            const phoneValid = validatePhoneValue(answers.phone).valid;
            nextBtn.disabled = !(nameValid && phoneValid && answers.privacy_agree);
        }

        const nextBtn = createNextBtn('입력 내용 확인');

        nameInput.addEventListener('input', () => {
            answers.name = nameInput.value.trim();
            nameState.refresh('input');
            updateNextState();
        });
        phoneInput.addEventListener('keydown', (event) => {
            if (event.key.length === 1 && !/\d/.test(event.key)) {
                event.preventDefault();
            }
        });
        phoneInput.addEventListener('input', () => {
            const formatted = formatPhoneNumber(phoneInput.value || '');
            phoneInput.value = formatted;
            answers.phone = formatted;
            phoneState.refresh('input');
            updateNextState();
        });
        check.addEventListener('change', () => {
            answers.privacy_agree = check.checked;
            updateNextState();
        });

        nextBtn.addEventListener('click', () => {
            const nameValid = nameState.validate('submit');
            const phoneValid = phoneState.validate('submit');
            updateNextState();
            if (!nameValid || !phoneValid || !answers.privacy_agree) return;
            advance();
        });

        answers.name = nameInput.value.trim();
        answers.phone = formatPhoneNumber(phoneInput.value || '');
        phoneInput.value = answers.phone;
        nameState.refresh('init');
        phoneState.refresh('init');
        updateNextState();

        wrap.appendChild(createActions(nextBtn));
        return wrap;
    }

    function createConfirmCard() {
        const card = document.createElement('div');
        card.className = 'sf-confirm';

        const title = document.createElement('div');
        title.className = 'sf-confirm-title';
        title.textContent = '입력 내용을 확인해 주세요';
        card.appendChild(title);

        const rows = [
            ['매물 주소', answers.property_address],
            ['건물명/호실', `${answers.building_name || '-'} ${answers.room_number || '-'}`],
            ['매물 유형', answers.property_type],
            ['거래 유형', answers.transaction_type],
            [getPriceLabel(), getPriceSummary()],
            ['고정 관리비', formatBudgetValue(answers.maintenance_fee) || '-'],
            ['입주 가능일', answers.move_in_date || '-'],
            ['이름', answers.name || '-'],
            ['연락처', answers.phone || '-']
        ];

        if (answers.details) {
            rows.push(['추가 내용', answers.details]);
        }

        rows.forEach(([labelText, valueText]) => {
            const row = document.createElement('div');
            row.className = 'sf-confirm-row';

            const label = document.createElement('span');
            label.className = 'sf-confirm-label';
            label.textContent = labelText;

            const value = document.createElement('span');
            value.className = 'sf-confirm-value';
            value.textContent = valueText || '-';

            row.appendChild(label);
            row.appendChild(value);
            card.appendChild(row);
        });

        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'sf-submit-btn';
        submitBtn.id = 'sfSubmitBtn';
        submitBtn.textContent = '집 내놓기 신청하기';
        submitBtn.addEventListener('click', handleSubmit);

        card.appendChild(createActions(submitBtn));
        return card;
    }

    async function handleSubmit() {
        const submitBtn = document.getElementById('sfSubmitBtn');
        if (!submitBtn) return;

        submitBtn.disabled = true;
        submitBtn.textContent = '접수 중...';

        const payload = {
            request_type: 'lease_out',
            csrf_token: csrfToken,
            ...answers,
            privacy_agree: 'Y'
        };

        try {
            const res = await fetch('/request/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.message || '요청 처리에 실패했습니다.');
            }

            stepsContainer.innerHTML = `
                <div class="sf-done-screen">
                    <div class="sf-done-check">
                        <svg viewBox="0 0 24 24"><polyline points="6 12 10 16 18 8"></polyline></svg>
                    </div>
                    <div class="sf-done-title">신청이 완료되었습니다!</div>
                    <div class="sf-done-desc">접수 내용을 확인 후<br>빠른 시일 내에 연락드리겠습니다.</div>
                </div>
            `;
        } catch (err) {
            alert(err.message || '요청 중 오류가 발생했습니다.');
            submitBtn.disabled = false;
            submitBtn.textContent = '집 내놓기 신청하기';
        }
    }

    render();
})();
