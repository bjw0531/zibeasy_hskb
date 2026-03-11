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
    const DEPOSIT_OPTIONS = ['100', '200', '300', '500', '700', '1000', '1500', '2000', '2500', '3000', '기타'];
    const MONTHLY_OPTIONS = ['20이하', '25이하', '30이하', '35이하', '40이하', '45이하', '50이하', '60이하', '70이하', '80이하', '90이하', '100이하'];
    const JEONSE_NOTICE = '죄송합니다. 전세 매물은 거래를 하지 않고 있습니다.';

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

    function createStepCard(title) {
        const card = document.createElement('div');
        card.className = 'fh-step-card';
        const heading = document.createElement('div');
        heading.className = 'fh-step-title';
        heading.textContent = title;
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

    function renderAreaStep() {
        const card = createStepCard('어느 지역을 원하세요? (필수) (중복선택 가능)');
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
        const card = createStepCard('어떤 집을 원하세요? (필수)');
        const field = document.createElement('div');
        field.className = 'fh-field';

        const select = createSelect(TYPE_OPTIONS, state.preferred_type, '선택해 주세요');
        select.setAttribute('data-autofocus', 'true');
        field.appendChild(select);
        card.appendChild(field);

        const actions = document.createElement('div');
        actions.className = 'fh-actions';
        const nextBtn = createNextButton();
        nextBtn.disabled = !state.preferred_type;

        select.addEventListener('change', () => {
            state.preferred_type = select.value;
            nextBtn.disabled = !state.preferred_type;
        });

        nextBtn.addEventListener('click', () => {
            if (!state.preferred_type) return;
            goNext();
        });

        actions.appendChild(nextBtn);
        card.appendChild(actions);
        return card;
    }

    function renderBudgetStep() {
        const card = createStepCard('어느 가격대로 원하세요? (필수)');

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

        let depositSelect = null;
        let monthlySelect = null;
        if (state.price_mode === '월세') {
            depositSelect = createSelect(DEPOSIT_OPTIONS, state.budget_deposit, '보증금 선택');
            monthlySelect = createSelect(MONTHLY_OPTIONS, state.budget_monthly, '월세 선택');
            field.appendChild(depositSelect);
            field.appendChild(monthlySelect);
        } else if (state.price_mode === '전세') {
            const info = document.createElement('div');
            info.className = 'fh-info';
            info.textContent = JEONSE_NOTICE;
            field.appendChild(info);
        }

        card.appendChild(field);

        const actions = document.createElement('div');
        actions.className = 'fh-actions';
        const nextBtn = createNextButton();

        function updateNextState() {
            if (state.price_mode === '월세') {
                nextBtn.disabled = !(state.budget_deposit && state.budget_monthly);
                return;
            }
            nextBtn.disabled = state.price_mode !== '전세';
        }

        if (depositSelect && monthlySelect) {
            depositSelect.setAttribute('data-autofocus', 'true');
            depositSelect.addEventListener('change', () => {
                state.budget_deposit = depositSelect.value;
                updateNextState();
            });
            monthlySelect.addEventListener('change', () => {
                state.budget_monthly = monthlySelect.value;
                updateNextState();
            });
        }

        updateNextState();
        nextBtn.addEventListener('click', () => {
            if (nextBtn.disabled) return;
            goNext();
        });
        actions.appendChild(nextBtn);
        card.appendChild(actions);
        return card;
    }

    function renderMoveInStep() {
        const card = createStepCard('언제 입주를 희망하세요? (필수)');
        const field = document.createElement('div');
        field.className = 'fh-field';

        const input = document.createElement('input');
        input.type = 'date';
        input.className = 'fh-input';
        input.value = state.move_in_date || '';
        input.setAttribute('data-autofocus', 'true');
        field.appendChild(input);
        card.appendChild(field);

        const actions = document.createElement('div');
        actions.className = 'fh-actions';
        const nextBtn = createNextButton();
        nextBtn.disabled = !state.move_in_date;

        input.addEventListener('change', () => {
            state.move_in_date = input.value;
            nextBtn.disabled = !state.move_in_date;
        });

        nextBtn.addEventListener('click', () => {
            if (!state.move_in_date) return;
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

        const actions = document.createElement('div');
        actions.className = 'fh-actions';

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
        const card = createStepCard('이름과 연락처를 알려주세요. (필수)');

        const grid = document.createElement('div');
        grid.className = 'fh-contact-grid';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.className = 'fh-input';
        nameInput.placeholder = '이름';
        nameInput.value = state.name || '';
        nameInput.autocomplete = 'name';
        nameInput.setAttribute('data-autofocus', 'true');

        const phoneInput = document.createElement('input');
        phoneInput.type = 'tel';
        phoneInput.className = 'fh-input';
        phoneInput.placeholder = '010-0000-0000';
        phoneInput.value = state.phone || '';
        phoneInput.autocomplete = 'tel';
        phoneInput.inputMode = 'tel';

        grid.appendChild(nameInput);
        grid.appendChild(phoneInput);
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
        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'fh-submit-btn';
        submitBtn.textContent = '집 구하기 신청하기';
        actions.appendChild(submitBtn);
        card.appendChild(actions);

        function updateSubmitState() {
            submitBtn.disabled = !(state.name && state.phone && state.privacy_agree);
        }

        nameInput.addEventListener('input', () => {
            state.name = nameInput.value.trim();
            updateSubmitState();
        });
        phoneInput.addEventListener('input', () => {
            state.phone = phoneInput.value.trim();
            updateSubmitState();
        });
        check.addEventListener('change', () => {
            state.privacy_agree = check.checked;
            updateSubmitState();
        });

        submitBtn.addEventListener('click', () => submitFindHome(submitBtn));

        state.name = nameInput.value.trim();
        state.phone = phoneInput.value.trim();
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
