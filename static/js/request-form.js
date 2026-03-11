/* ── Step Form: 집 내놓기 (순차 입력) ──
   한 번에 하나의 입력만 표시하고
   10칸 진행 막대로 현재 단계를 안내한다. */

(function () {
    'use strict';

    /* ── 질문 단계 정의 ── */
    const STEPS = [
        { id: 'name',      label: '이름',        type: 'text',    placeholder: '이름 입력',                           field: 'name' },
        { id: 'phone',     label: '연락처',      type: 'text',    placeholder: '010-0000-0000',                       field: 'phone' },
        { id: 'address',   label: '매물 주소',   type: 'text',    placeholder: '예: 천안시 서북구 두정동 000번지',    field: 'property_address' },
        { id: 'building',  label: '건물명/호실', type: 'dual',    fields: [
            { label: '건물명', placeholder: '예: OO빌라', field: 'building_name' },
            { label: '호실',   placeholder: '예: 301호',  field: 'room_number'   }
        ]},
        { id: 'prop_type', label: '매물 유형',   type: 'choice',  field: 'property_type',
            choices: ['원룸', '투베이', '투룸', '쓰리룸', '오피스텔', '상가', '기타'] },
        { id: 'tx_type',   label: '거래 유형',   type: 'choice',  field: 'transaction_type',
            choices: ['월세', '전세', '매매'] },
        /* 동적 가격 — 거래유형에 따라 변경 */
        { id: 'price',     label: '',            type: 'dynamic_price' },
        { id: 'maint',     label: '고정 관리비', type: 'text',    placeholder: '예: 5만원',      field: 'maintenance_fee' },
        { id: 'move_date', label: '입주 가능일', type: 'date',    field: 'move_in_date' },
        { id: 'details',   label: '추가 내용',   type: 'textarea', placeholder: '특이사항, 옵션 등', field: 'details', optional: true },
        { id: 'confirm',   label: '',            type: 'confirm' }
    ];

    /* ── 상태 ── */
    let currentStep = 0;
    const answers = {};
    const csrfToken = document.getElementById('sfCsrfToken')?.value || '';

    /* ── DOM 참조 ── */
    const stepsContainer = document.getElementById('sfSteps');
    const progressSegments = document.getElementById('sfProgressSegments');
    const privacyModal   = document.getElementById('privacyModal');

    if (!stepsContainer) return;

    /* ── 유틸 ── */

    /* 진행률 칸 생성 */
    function ensureProgressSegments() {
        if (!progressSegments || progressSegments.children.length > 0) return;
        const total = STEPS.length - 1; /* confirm 제외 */
        for (let i = 0; i < total; i++) {
            const seg = document.createElement('span');
            seg.className = 'sf-progress-segment';
            progressSegments.appendChild(seg);
        }
    }

    /* 진행률 업데이트 */
    function updateProgress() {
        const total = STEPS.length - 1; /* confirm 제외 */
        const completed = Math.min(currentStep, total);
        if (!progressSegments) return;
        const items = progressSegments.children;
        for (let i = 0; i < items.length; i++) {
            items[i].classList.toggle('filled', i < completed);
            items[i].classList.toggle('current', i === completed && completed < total);
        }
    }

    /* 동적 가격 단계의 라벨 결정 */
    function getPriceLabel() {
        const tx = answers.transaction_type;
        if (tx === '월세') return '보증금/월세';
        if (tx === '전세') return '전세가';
        return '매매가';
    }

    /* 동적 가격 단계의 요약값 */
    function getPriceSummary() {
        const tx = answers.transaction_type;
        if (tx === '월세') return `${answers.deposit || '-'} / ${answers.monthly_rent || '-'}`;
        if (tx === '전세') return answers.jeonse_price || '-';
        return answers.sale_price || '-';
    }

    /* ── 전체 렌더링 ── */
    function render() {
        stepsContainer.innerHTML = '';
        ensureProgressSegments();
        updateProgress();

        /* 현재 활성 단계만 표시 */
        if (currentStep < STEPS.length) {
            const step = STEPS[currentStep];
            if (step.type === 'confirm') {
                stepsContainer.appendChild(createConfirmCard());
            } else {
                stepsContainer.appendChild(createActiveCard(currentStep));
            }
        }
    }

    /* ── 현재 활성 입력 카드 ── */
    function createActiveCard(idx) {
        const step = STEPS[idx];
        const card = document.createElement('div');
        card.className = 'sf-active';

        /* 동적 가격 라벨 결정 */
        let label = step.label;
        if (step.type === 'dynamic_price') {
            const tx = answers.transaction_type;
            if (tx === '월세') label = '보증금 / 월세';
            else if (tx === '전세') label = '전세가';
            else label = '매매가';
        }

        /* 라벨 */
        const labelEl = document.createElement('div');
        labelEl.className = 'sf-active-label';
        labelEl.textContent = `${label} (${step.optional ? '선택' : '필수'})`;
        card.appendChild(labelEl);

        /* 입력 UI 타입별 렌더링 */
        switch (step.type) {
            case 'text':
                card.appendChild(buildTextInput(step));
                break;
            case 'date':
                card.appendChild(buildDateInput(step));
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
            case 'textarea':
                card.appendChild(buildTextareaInput(step));
                break;
        }

        /* 자동 포커스 (렌더 후) */
        requestAnimationFrame(() => {
            const firstInput = card.querySelector('input, textarea');
            if (firstInput) firstInput.focus();
        });

        return card;
    }

    /* ── 텍스트 입력 빌더 ── */
    function buildTextInput(step) {
        const wrap = document.createElement('div');
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = step.placeholder || '';
        inp.autocomplete = 'off';
        if (step.field === 'name') inp.autocomplete = 'name';
        if (step.field === 'phone') {
            inp.inputMode = 'tel';
            inp.autocomplete = 'tel';
        }
        if (step.field === 'maintenance_fee') inp.inputMode = 'numeric';
        if (answers[step.field]) inp.value = answers[step.field];

        const btn = createNextBtn();
        btn.disabled = !inp.value.trim();
        inp.addEventListener('input', () => { btn.disabled = !inp.value.trim(); });
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && inp.value.trim()) {
                e.preventDefault();
                answers[step.field] = inp.value.trim();
                advance();
            }
        });
        btn.addEventListener('click', () => {
            if (!inp.value.trim()) return;
            answers[step.field] = inp.value.trim();
            advance();
        });

        wrap.appendChild(inp);
        wrap.appendChild(btn);
        return wrap;
    }

    /* ── 날짜 입력 빌더 ── */
    function buildDateInput(step) {
        const wrap = document.createElement('div');
        const inp = document.createElement('input');
        inp.type = 'date';
        if (answers[step.field]) inp.value = answers[step.field];

        const btn = createNextBtn();
        btn.disabled = !inp.value;
        inp.addEventListener('change', () => { btn.disabled = !inp.value; });
        btn.addEventListener('click', () => {
            if (!inp.value) return;
            answers[step.field] = inp.value;
            advance();
        });

        wrap.appendChild(inp);
        wrap.appendChild(btn);
        return wrap;
    }

    /* ── 2열 입력 빌더 (건물명/호실) ── */
    function buildDualInput(step) {
        const wrap = document.createElement('div');

        const grid = document.createElement('div');
        grid.className = 'sf-dual';

        const inputs = step.fields.map((f, i) => {
            const col = document.createElement('div');
            const lbl = document.createElement('div');
            lbl.className = 'sf-dual-label';
            lbl.textContent = f.label;
            const inp = document.createElement('input');
            inp.type = 'text';
            inp.placeholder = f.placeholder;
            inp.autocomplete = 'off';
            inp.id = 'sfDual' + i;
            if (answers[f.field]) inp.value = answers[f.field];
            col.appendChild(lbl);
            col.appendChild(inp);
            grid.appendChild(col);
            return inp;
        });

        const btn = createNextBtn();
        function check() { btn.disabled = inputs.some(inp => !inp.value.trim()); }
        check();
        inputs.forEach(inp => inp.addEventListener('input', check));

        /* Enter로 다음 필드 이동 또는 전송 */
        inputs[0].addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); inputs[1].focus(); }
        });
        inputs[1].addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && inputs.every(inp => inp.value.trim())) {
                e.preventDefault();
                step.fields.forEach((f, i) => { answers[f.field] = inputs[i].value.trim(); });
                advance();
            }
        });
        btn.addEventListener('click', () => {
            if (inputs.some(inp => !inp.value.trim())) return;
            step.fields.forEach((f, i) => { answers[f.field] = inputs[i].value.trim(); });
            advance();
        });

        wrap.appendChild(grid);
        wrap.appendChild(btn);
        return wrap;
    }

    /* ── 선택지 버튼 빌더 ── */
    function buildChoices(step) {
        const wrap = document.createElement('div');
        wrap.className = 'sf-choices';
        step.choices.forEach(c => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'sf-choice-btn';
            btn.textContent = c;
            btn.addEventListener('click', () => {
                answers[step.field] = c;
                advance();
            });
            wrap.appendChild(btn);
        });
        return wrap;
    }

    /* ── 동적 가격 입력 빌더 ── */
    function buildPriceInput() {
        const tx = answers.transaction_type;
        const wrap = document.createElement('div');

        if (tx === '월세') {
            /* 보증금 + 월세 2열 입력 */
            const grid = document.createElement('div');
            grid.className = 'sf-dual';

            const fields = [
                { label: '보증금', placeholder: '예: 500만원', key: 'deposit' },
                { label: '월세',   placeholder: '예: 45만원',  key: 'monthly_rent' }
            ];

            const inputs = fields.map((f, i) => {
                const col = document.createElement('div');
                const lbl = document.createElement('div');
                lbl.className = 'sf-dual-label';
                lbl.textContent = f.label;
                const inp = document.createElement('input');
                inp.type = 'text';
                inp.placeholder = f.placeholder;
                inp.autocomplete = 'off';
                inp.id = 'sfPrice' + i;
                if (answers[f.key]) inp.value = answers[f.key];
                col.appendChild(lbl);
                col.appendChild(inp);
                grid.appendChild(col);
                return inp;
            });

            const btn = createNextBtn();
            function check() { btn.disabled = inputs.some(inp => !inp.value.trim()); }
            check();
            inputs.forEach(inp => inp.addEventListener('input', check));
            inputs[0].addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); inputs[1].focus(); }
            });
            inputs[1].addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && inputs.every(inp => inp.value.trim())) {
                    e.preventDefault();
                    answers.deposit = inputs[0].value.trim();
                    answers.monthly_rent = inputs[1].value.trim();
                    advance();
                }
            });
            btn.addEventListener('click', () => {
                if (inputs.some(inp => !inp.value.trim())) return;
                answers.deposit = inputs[0].value.trim();
                answers.monthly_rent = inputs[1].value.trim();
                advance();
            });

            wrap.appendChild(grid);
            wrap.appendChild(btn);
        } else {
            /* 전세 or 매매 — 단일 입력 */
            const key = tx === '전세' ? 'jeonse_price' : 'sale_price';
            const ph  = tx === '전세' ? '예: 1억 2천' : '예: 1억 5천';

            const inp = document.createElement('input');
            inp.type = 'text';
            inp.placeholder = ph;
            inp.autocomplete = 'off';
            if (answers[key]) inp.value = answers[key];

            const btn = createNextBtn();
            btn.disabled = !inp.value.trim();
            inp.addEventListener('input', () => { btn.disabled = !inp.value.trim(); });
            inp.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && inp.value.trim()) {
                    e.preventDefault();
                    answers[key] = inp.value.trim();
                    advance();
                }
            });
            btn.addEventListener('click', () => {
                if (!inp.value.trim()) return;
                answers[key] = inp.value.trim();
                advance();
            });

            wrap.appendChild(inp);
            wrap.appendChild(btn);
        }

        return wrap;
    }

    /* ── textarea 입력 빌더 (건너뛰기 포함) ── */
    function buildTextareaInput(step) {
        const wrap = document.createElement('div');
        const ta = document.createElement('textarea');
        ta.placeholder = step.placeholder || '';
        if (answers[step.field]) ta.value = answers[step.field];

        const btn = createNextBtn();
        btn.disabled = false; /* 선택 항목이므로 항상 활성 */

        btn.addEventListener('click', () => {
            answers[step.field] = ta.value.trim();
            advance();
        });
        ta.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                answers[step.field] = ta.value.trim();
                advance();
            }
        });

        /* 건너뛰기 버튼 */
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'sf-skip-btn';
        skip.textContent = '건너뛰기';
        skip.addEventListener('click', () => {
            answers[step.field] = '';
            advance();
        });

        wrap.appendChild(ta);
        wrap.appendChild(btn);
        wrap.appendChild(skip);
        return wrap;
    }

    /* ── "다음" 버튼 생성 ── */
    function createNextBtn() {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sf-next-btn';
        btn.textContent = '다음';
        return btn;
    }

    /* ── 확인 카드 ── */
    function createConfirmCard() {
        const card = document.createElement('div');
        card.className = 'sf-confirm';

        const title = document.createElement('div');
        title.className = 'sf-confirm-title';
        title.textContent = '입력 내용을 확인해 주세요';
        card.appendChild(title);

        /* 요약 행 */
        const txType = answers.transaction_type;
        const rows = [
            ['이름',        answers.name],
            ['연락처',      answers.phone],
            ['매물 주소',   answers.property_address],
            ['건물명/호실', `${answers.building_name || '-'} ${answers.room_number || '-'}`],
            ['매물 유형',   answers.property_type],
            ['거래 유형',   txType],
            [getPriceLabel(), getPriceSummary()],
            ['고정 관리비', answers.maintenance_fee],
            ['입주 가능일', answers.move_in_date],
        ];
        if (answers.details) rows.push(['추가 내용', answers.details]);

        rows.forEach(([l, v]) => {
            const row = document.createElement('div');
            row.className = 'sf-confirm-row';

            const labelEl = document.createElement('span');
            labelEl.className = 'sf-confirm-label';
            labelEl.textContent = l;

            const valueEl = document.createElement('span');
            valueEl.className = 'sf-confirm-value';
            valueEl.textContent = v || '-';

            row.appendChild(labelEl);
            row.appendChild(valueEl);
            card.appendChild(row);
        });

        /* 개인정보 동의 */
        const agree = document.createElement('div');
        agree.className = 'sf-agree';

        const agreeHint = document.createElement('div');
        agreeHint.className = 'sf-agree-hint';
        agreeHint.textContent = '입력하신 개인정보는 접수 내용 확인 및 연락 목적으로만 사용됩니다.';

        const agreeLabel = document.createElement('label');
        const agreeCheck = document.createElement('input');
        agreeCheck.type = 'checkbox';
        agreeCheck.id = 'sfAgreeCheck';

        const agreeText = document.createElement('span');
        agreeText.textContent = '개인정보 활용에 동의합니다. (필수)';

        agreeLabel.appendChild(agreeCheck);
        agreeLabel.appendChild(agreeText);

        const agreeLinkWrap = document.createElement('div');
        agreeLinkWrap.className = 'sf-agree-link-wrap';
        const openPrivacyBtn = document.createElement('button');
        openPrivacyBtn.type = 'button';
        openPrivacyBtn.className = 'sf-agree-link';
        openPrivacyBtn.id = 'sfOpenPrivacy';
        openPrivacyBtn.textContent = '개인정보 활용 동의 내용 보기';
        agreeLinkWrap.appendChild(openPrivacyBtn);

        agree.appendChild(agreeHint);
        agree.appendChild(agreeLabel);
        agree.appendChild(agreeLinkWrap);
        card.appendChild(agree);

        /* 제출 버튼 */
        const submitBtn = document.createElement('button');
        submitBtn.type = 'button';
        submitBtn.className = 'sf-submit-btn';
        submitBtn.id = 'sfSubmitBtn';
        submitBtn.textContent = '집 내놓기 신청하기';
        submitBtn.disabled = true;
        card.appendChild(submitBtn);

        /* 이벤트 바인딩 (렌더 후) */
        requestAnimationFrame(() => {
            const agreeCheck = document.getElementById('sfAgreeCheck');
            const openPriv   = document.getElementById('sfOpenPrivacy');
            const btn        = document.getElementById('sfSubmitBtn');

            if (agreeCheck && btn) {
                agreeCheck.addEventListener('change', () => { btn.disabled = !agreeCheck.checked; });
            }
            if (openPriv && privacyModal) {
                openPriv.addEventListener('click', () => {
                    privacyModal.classList.add('active');
                    privacyModal.setAttribute('aria-hidden', 'false');
                });
            }
            if (btn) btn.addEventListener('click', handleSubmit);
        });

        return card;
    }

    /* ── 다음 단계로 이동 ── */
    function advance() {
        currentStep++;
        render();
        /* 현재 활성 카드로 스크롤 */
        requestAnimationFrame(() => {
            const active = stepsContainer.querySelector('.sf-active, .sf-confirm');
            if (active) active.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }

    /* ── 폼 제출 ── */
    async function handleSubmit() {
        const submitBtn = document.getElementById('sfSubmitBtn');
        if (!submitBtn) return;

        submitBtn.disabled = true;
        submitBtn.textContent = '접수 중...';

        const payload = {
            request_type: 'lease_out',
            csrf_token: csrfToken,
            privacy_agree: 'Y',
            ...answers
        };

        try {
            const res = await fetch('/request/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || '요청 처리에 실패했습니다.');

            /* 완료 화면 */
            stepsContainer.innerHTML = `
                <div class="sf-done-screen">
                    <div class="sf-done-check">
                        <svg viewBox="0 0 24 24"><polyline points="6 12 10 16 18 8"></polyline></svg>
                    </div>
                    <div class="sf-done-title">신청이 완료되었습니다!</div>
                    <div class="sf-done-desc">접수 내용을 확인 후<br>빠른 시일 내에 연락드리겠습니다.</div>
                </div>`;
        } catch (err) {
            alert(err.message || '요청 중 오류가 발생했습니다.');
            submitBtn.disabled = false;
            submitBtn.textContent = '집 내놓기 신청하기';
        }
    }

    /* ── 시작 ── */
    render();

})();
