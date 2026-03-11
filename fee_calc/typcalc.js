// 계산 과정 표시를 위한 포맷팅 함수 - 텍스트에 줄바꾸기 일관성 보장
function formatCalculationText(text) {
  // \n을 <br>로 바꾸지 않고 학그대로 유지
  return text.replace(/\n/g, '\n');
}// 타이핑 계산기 기능
function initTypingCalculator() {
  // 변수 선언
  let calculating = false;
  let calculationLines = [];
  let currentText = '';
  let currentLineIndex = 0;
  let currentCharIndex = 0;
  let showFinalResult = false;
  let timerRef = null;

  // 결과 테이블 값 - 기본값 설정
  let dealAmount = '-';
  let rate = '-';
  let fee = '-';
  let totalFee = '-';

  // formatCurrency 함수 정의
  function formatCurrency(value) {
    if (!value) return '0원';

    value = Math.floor(value);

    // 1~9,999원까지는 그대로 표시
    if (value < 10000) {
      return value.toLocaleString() + '원';
    }

    // 10,000 ~ 99,999,999까지는 만원 단위로 표시
    else if (value < 100000000) {
      var 만 = Math.floor(value / 10000);
      var 나머지 = value % 10000;

      if (나머지 > 0) {
        return 만.toLocaleString() + '만' + 나머지.toLocaleString() + '원';
      } else {
        return 만.toLocaleString() + '만원';
      }
    }

    // 100,000,000 ~ 999,999,999,999까지는 억원 단위로 표시
    else if (value < 1000000000000) {
      var 억 = Math.floor(value / 100000000);
      var 만단위 = Math.floor((value % 100000000) / 10000);
      var 나머지 = value % 10000;

      var result = 억.toLocaleString() + '억';

      if (만단위 > 0) {
        result += 만단위.toLocaleString() + '만';
      }

      if (나머지 > 0) {
        result += 나머지.toLocaleString();
      }

      return result + '원';
    }

    // 1,000,000,000,000 이상
    else {
      var 조 = Math.floor(value / 1000000000000);
      var 억단위 = Math.floor((value % 1000000000000) / 100000000);
      var 만단위 = Math.floor((value % 100000000) / 10000);
      var 나머지 = value % 10000;

      var result = 조.toLocaleString() + '조';

      if (억단위 > 0) {
        result += 억단위.toLocaleString() + '억';
      }

      if (만단위 > 0) {
        result += 만단위.toLocaleString() + '만';
      }

      if (나머지 > 0) {
        result += 나머지.toLocaleString();
      }

      return result + '원';
    }
  }

  // 계산 과정 버튼 및 컨테이너 생성
  const processButton = document.createElement('button');
  processButton.className = 'process-button';
  processButton.textContent = '계산 과정 보기';
  processButton.style.cssText = `
    width: 100%;
    padding: 10px;
    background-color: #6c757d;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    margin-top: 15px;
    margin-bottom: 10px;
    box-shadow: 0 2px 8px rgba(108, 117, 125, 0.2);
  `;
  processButton.style.display = 'none';

  // 계산 과정이 표시될 컨테이너
  const processContainer = document.createElement('div');
  processContainer.className = 'process-container';
  processContainer.style.cssText = `
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 15px rgba(0,0,0,0.08);
    width: 100%;
    margin-top: 15px;
    background: white;
    border: 1px solid #e0e0e0;
    display: none;
    max-width: 100%;
  `;

  const processTitle = document.createElement('div');
  processTitle.className = 'process-title';
  processTitle.textContent = '계산 과정';
  processTitle.style.cssText = `
    padding: 10px 15px;
    font-weight: 600;
    color: #333;
    border-bottom: 1px solid #eaeaea;
    background-color: #f8f9fa;
  `;

  const processContent = document.createElement('div');
  processContent.className = 'calculation-process';
  processContent.style.cssText = `
    padding: 5px;
    background-color: #f8f9fa;
  `;

  const calculationDisplay = document.createElement('div');
  calculationDisplay.className = 'calculation-display';
  calculationDisplay.style.cssText = `
    min-height: 200px;
    font-family: monospace;
    font-size: 15px;
    white-space: pre-wrap;
    padding: 8px;
    background-color: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    overflow-x: auto;
    word-break: break-word;
    scroll-padding-bottom: 100px;
  `;

  // 초기 메시지
  const initialMessage = document.createElement('div');
  initialMessage.textContent = "'계산 과정 보기' 버튼을 클릭하면 계산 과정이 표시됩니다.";
  initialMessage.style.cssText = `
    color: #666;
    font-style: italic;
  `;
  calculationDisplay.appendChild(initialMessage);

  // 최종 결과 메시지
  const finalResult = document.createElement('div');
  finalResult.style.cssText = `
    margin-top: 15px;
    padding: 10px;
    background-color: #e6f2ff;
    border-left: 4px solid #007bff;
    font-size: 14px;
    display: none;
  `;

  // 결과 표로 이동하는 버튼
  const resultNavigationButton = document.createElement('button');
  resultNavigationButton.className = 'result-navigate-button';
  resultNavigationButton.textContent = '중개보수 계산 결과 보기';
  resultNavigationButton.style.cssText = `
    display: block;
    margin: 15px auto 0 auto;
    padding: 8px 12px;
    background-color: #28a745;
    color: white;
    border: none;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    display: none;
    text-align: center;
    width: 80%;
    max-width: 300px;
  `;
  resultNavigationButton.addEventListener('click', function () {
    const resultSection = document.querySelector('.result-section');
    const calculateButton = document.querySelector('.calculate-button');
    if (resultSection) {
      // 더 위에 있는 계산하기 버튼이 보이도록 스크롤
      if (calculateButton) {
        calculateButton.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });

  // 현재 타이핑 중인 줄을 나타내는 요소
  const typingLine = document.createElement('div');
  typingLine.className = 'typing-line';
  typingLine.style.cssText = `
    margin-bottom: 4px;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
    letter-spacing: 0em;
    font-size: 15px;
    font-family: 'Noto Sans KR', 'Malgun Gothic', 'Segoe UI', sans-serif;
    color: #333;
    max-width: 100%;
    overflow-wrap: break-word;
  `;


  // 계산 단계 정의 (동적으로 업데이트됨)
  let calculationSteps = [];

  // DOM에 요소 추가
  processContent.appendChild(calculationDisplay);
  processContent.appendChild(finalResult);
  processContent.appendChild(resultNavigationButton);
  processContainer.appendChild(processTitle);
  processContainer.appendChild(processContent);

  // 거래 타입과 부동산 타입 저장 변수
  let currentTransactionType = '';
  let currentPropertyType = '';

  // 계산 시점의 부가세율 저장 (typeNextCharacter에서 월세 최종 결과 계산에 사용)
  let currentVatRate = 0.1;

  // 계산 시 사용된 값 저장 변수
  let calculatedValues = {
    deposit: '',
    monthly: '',
    dealAmount: '',
    rate: '',
    fee: '',
    totalFee: ''
  };

  // 계산하기 버튼 클릭 이벤트 후크
  function hookCalculateButton() {
    const calculateButton = document.querySelector('.calculate-button');
    const resultSection = document.querySelector('.result-section');

    if (calculateButton) {
      // onclick 대신 이벤트 리스너 사용
      calculateButton.addEventListener('click', function () {
        // 계산 과정 초기화
        resetProcessView();
        
        // 결과 섹션이 표시된 후에 계산 과정 버튼 표시
        setTimeout(() => {
          if (resultSection && resultSection.style.display !== 'none') {
            // 거래 유형 저장 - 탭에서 활성화된 항목 찾기
            const activeTab = document.querySelector('.tab.active');
            if (activeTab) {
              currentTransactionType = activeTab.dataset.type || '';
            }

            // 부동산 유형 저장 - 카드에서 활성화된 항목 찾기
            const activeCard = document.querySelector('.card.active');
            if (activeCard) {
              currentPropertyType = activeCard.dataset.property || '';
            }

            // 입력값 저장
            if (currentTransactionType === 'lease') {
              // 월세인 경우
              calculatedValues.deposit = document.getElementById('mainPrice').value || '0';
              calculatedValues.monthly = document.getElementById('monthlyPrice').value || '0';
            } else if (currentTransactionType === 'sale' && currentPropertyType === 'pre-sale') {
              // 매매-분양권인 경우
              calculatedValues.deposit = document.getElementById('presaleDeposit').value || '0';
              calculatedValues.premium = document.getElementById('premium').value || '0';
            } else {
              // 매매 또는 전세
              calculatedValues.deposit = document.getElementById('mainPrice').value || '0';
              calculatedValues.monthly = '0'; // 전세/매매는 월세 없음
            }

            // 계산 결과에서 값 추출
            const resultRows = document.querySelectorAll('.result-table tr');
            if (resultRows.length > 0) {
              resultRows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                  const label = cells[0].textContent.trim();
                  const value = cells[1].textContent.trim();

                  if (label === '거래금액') {
                    calculatedValues.dealAmount = value;
                  } else if (label.includes('상한요율')) {
                    calculatedValues.rate = value;
                  } else if (label === '중개보수') {
                    calculatedValues.fee = value;
                  } else if (label.includes('부가세') && label.includes('포함')) {
                    calculatedValues.totalFee = value;
                  }
                }
              });

              // 계산 단계 동적 업데이트
              updateCalculationSteps();
            }

            // 버튼을 서서히 표시
            processButton.style.opacity = '0';
            processButton.style.display = 'block';

            // 약간 지연 후 페이드인
            setTimeout(() => {
              processButton.style.opacity = '1';
            }, 100);
          }
        }, 500); // 결과가 표시될 시간을 주기 위해 지연
      });
    }

    // 다른 탭이나 카드 클릭 시 계산 과정 초기화
    const tabsAndCards = document.querySelectorAll('.tab, .card');
    tabsAndCards.forEach(element => {
      element.addEventListener('click', function () {
        resetProcessView();
      });
    });
  }

  // 계산 과정 초기화 함수
  function resetProcessView() {
    processButton.style.display = 'none';
    processContainer.style.display = 'none';
    processButton.textContent = '계산 과정 보기';
    processButton.disabled = false;
    calculating = false;
    calculationDisplay.innerHTML = '';
    const initialMsg = document.createElement('div');
    initialMsg.textContent = "'계산 과정 보기' 버튼을 클릭하면 계산 과정이 표시됩니다.";
    initialMsg.style.cssText = 'color: #666; font-style: italic;';
    calculationDisplay.appendChild(initialMsg);
    finalResult.style.display = 'none';
    resultNavigationButton.style.display = 'none';
  }

  // 계산 단계 업데이트
  function updateCalculationSteps() {
    // 사용자가 선택/입력한 부가세율 가져오기 (window.getSelectedVatRate가 없으면 기본 10%)
    const vatRate = (typeof window.getSelectedVatRate === 'function') ? window.getSelectedVatRate() : 0.1;
    currentVatRate = vatRate; // typeNextCharacter 월세 최종 결과 계산을 위해 저장
    // 부가세율을 퍼센트 표시 문자열로 변환 (예: 0.1 → "10", 0.04 → "4", 0.035 → "3.5")
    const vatRatePct = (vatRate * 100) % 1 === 0 ? String(Math.round(vatRate * 100)) : (vatRate * 100).toFixed(1);

    const deposit = calculatedValues.deposit;
    const monthly = calculatedValues.monthly || '0';

    // 매매, 전세의 경우 거래금액 설정
    const formattedDeposit = `${formatNumber(deposit)}만원`;
    let displayDealAmount = calculatedValues.dealAmount || '0원';

    // 원화 형식으로 값 변환
    const displayDepositValue = formatCurrency(parseInt(deposit) * 10000);
    const displayMonthlyValue = formatCurrency(parseInt(monthly) * 10000);
    const displayFeeValue = calculatedValues.fee || '0원';

    // 부가세 계산을 위한 중개보수 숫자 추출
    const feeText = calculatedValues.fee || '0원';

    // 숫자만 추출하기 전에 '만원', '억' 등의 단위 처리
    let feeNumericValue = 0;
    if (feeText.includes('만원')) {
      feeNumericValue = parseFloat(feeText.replace(/[^0-9.]/g, '')) * 10000;
    } else if (feeText.includes('억원')) {
      feeNumericValue = parseFloat(feeText.replace(/[^0-9.]/g, '')) * 100000000;
    } else {
      feeNumericValue = parseFloat(feeText.replace(/[^0-9.]/g, ''));
    }

    // 부가세 계산 — 사용자가 선택/입력한 부가세율 적용 (반올림하여 정수로)
    const vatAmountValue = Math.round(feeNumericValue * vatRate);
    const displayVatAmount = formatCurrency(vatAmountValue);

    const displayTotalFeeValue = calculatedValues.totalFee || '0원';
    const rate = calculatedValues.rate || '0%';
    const rateValue = parseFloat(rate.replace('%', '')) / 100; // '0.9%'에서 0.009로 변환

    // 거래 유형에 따른 계산 과정 정의
    if (currentTransactionType === 'lease') {
      // 월세인 경우
      // 보증금 + 월세*100 계산
      const calc = parseInt(deposit) + (parseInt(monthly) * 100);
      const multiplier = calc >= 5000 ? 100 : 70;

      // 월세 계산용 변수
      const depositVal = parseInt(deposit);
      const monthlyVal = parseInt(monthly);
      const calc100 = depositVal + (monthlyVal * 100);
      const calc70 = depositVal + (monthlyVal * 70);

      // 원화 형식으로 계산값 변환
      const displayCalc100 = formatCurrency(calc100 * 10000);
      const displayCalc70 = formatCurrency(calc70 * 10000);

      calculationSteps = [
        { text: "먼저 거래금액을 계산합니다...", isHeading: true, action: null },
        { text: `보증금+(월세×100)을 계산합니다.`, isHeading: false, action: null },
        { text: `${displayDepositValue}+(${displayMonthlyValue}×100)`, isHeading: false, action: null },
        { text: `=${displayDepositValue}+${formatCurrency(monthlyVal * 100 * 10000)}=${displayCalc100}`, isHeading: false, action: null },
        { text: `계산된 값이 ${calc100 >= 5000 ? '5,000만원 이상' : '5,000만원 미만'}이므로`, isHeading: false, action: null },
        calc100 >= 5000 
          ? { text: `${displayCalc100}이 거래금액이 됩니다.`, isHeading: false, action: null } 
          : { text: `보증금+(월세×70)으로 다시 계산합니다.`, isHeading: false, action: null },
        calc100 >= 5000 
          ? null 
          : { text: `${displayDepositValue}+(${displayMonthlyValue}×70)`, isHeading: false, action: null },
        calc100 >= 5000 
          ? null 
          : { text: `= ${displayDepositValue}+${formatCurrency(monthlyVal * 70 * 10000)}=${displayCalc70}`, isHeading: false, action: null },
        calc100 >= 5000 
          ? null 
          : { text: `계산된 값 ${displayCalc70}이 거래금액이 됩니다.`, isHeading: false, action: function () { } },
        { text: "", isHeading: false, action: null },
        { text: "다음으로 적용 요율을 확인합니다...", isHeading: true, action: null },
        { text: `거래금액이 ${calc100 >= 5000 ? displayCalc100 : displayCalc70}이므로\n적용 요율은 ${rate}입니다.`, isHeading: false, action: function () { } },
        { text: "", isHeading: false, action: null },
        { text: "중개보수를 계산합니다...", isHeading: true, action: null },
        { text: "중개보수=거래금액×요율", isHeading: false, action: null },
        { text: `=${calc100 >= 5000 ? displayCalc100 : displayCalc70}×${rate}`, isHeading: false, action: null },
        { text: `=${formatCurrency((calc100 >= 5000 ? calc100 : calc70) * 10000 * rateValue)}`, isHeading: false, action: function () { } },
        { text: "", isHeading: false, action: null },
        { text: "부가세를 계산합니다...", isHeading: true, action: null },
        { text: `부가세=중개보수×${vatRatePct}%`, isHeading: false, action: null },
        { text: `=${formatCurrency((calc100 >= 5000 ? calc100 : calc70) * 10000 * rateValue)}×${vatRatePct}%`, isHeading: false, action: null },
        { text: `=${formatCurrency((calc100 >= 5000 ? calc100 : calc70) * 10000 * rateValue * vatRate)}`, isHeading: false, action: null },
        { text: "", isHeading: false, action: null },
        { text: "최종 중개보수(부가세 포함)를 계산합니다...", isHeading: true, action: null },
        { text: "최종 중개보수=중개보수+부가세", isHeading: false, action: null },
        { text: `=${formatCurrency((calc100 >= 5000 ? calc100 : calc70) * 10000 * rateValue)}+${formatCurrency((calc100 >= 5000 ? calc100 : calc70) * 10000 * rateValue * vatRate)}`, isHeading: false, action: null },
        { text: `=${formatCurrency((calc100 >= 5000 ? calc100 : calc70) * 10000 * rateValue * (1 + vatRate))}`, isHeading: false, action: function () { showFinalResult = true; } }
      ];
    } else if (currentTransactionType === 'sale' && currentPropertyType === 'pre-sale') {
      // 매매 - 분양권
      const premium = calculatedValues.premium || '0';
      const displayPremiumValue = formatCurrency(parseInt(premium) * 10000);

      console.log(calculatedValues)

      calculationSteps = [
        { text: "먼저 거래금액을 계산합니다...", isHeading: true, action: null },
        { text: "거래금액=불입금액+프리미엄", isHeading: false, action: null },
        { text: `=${displayDepositValue}+${displayPremiumValue}`, isHeading: false, action: null },
        { text: `=${displayDealAmount}`, isHeading: false, action: function () { } },
        { text: "", isHeading: false, action: null },
        { text: "다음으로 적용 요율을 확인합니다...", isHeading: true, action: null },
        { text: `거래금액이 ${displayDealAmount}이므로 적용 요율은 ${rate}입니다.`, isHeading: false, action: function () { } },
        { text: "", isHeading: false, action: null },
        { text: "중개보수를 계산합니다...", isHeading: true, action: null },
        { text: "중개보수=거래금액×요율", isHeading: false, action: null },
        { text: `=${displayDealAmount}×${rate}`, isHeading: false, action: null },
        { text: `=${displayFeeValue}`, isHeading: false, action: function () { } },
        { text: "", isHeading: false, action: null },
        { text: "부가세를 계산합니다...", isHeading: true, action: null },
        { text: `부가세=중개보수×${vatRatePct}%`, isHeading: false, action: null },
        { text: `=${displayFeeValue}×${vatRatePct}%`, isHeading: false, action: null },
        { text: `=${displayVatAmount}`, isHeading: false, action: null },
        { text: "", isHeading: false, action: null },
        { text: "최종 중개보수(부가세 포함)를 계산합니다...", isHeading: true, action: null },
        { text: "최종 중개보수=중개보수+부가세", isHeading: false, action: null },
        { text: `=${displayFeeValue}+${displayVatAmount}`, isHeading: false, action: null },
        { text: `=${displayTotalFeeValue}`, isHeading: false, action: function () { showFinalResult = true; } }
      ];
    } else if (currentTransactionType === 'rent') {
      // 전세인 경우
      calculationSteps = [
        { text: "먼저 거래금액을 확인합니다...", isHeading: true, action: null },
        { text: `전세가=${displayDepositValue}`, isHeading: false, action: null },
        { text: `거래금액은 ${displayDepositValue}`, isHeading: false, action: function () { } },
        { text: "", isHeading: false, action: null },
        { text: "다음으로 적용 요율을 확인합니다...", isHeading: true, action: null },
        { text: `거래금액이 ${displayDepositValue}이므로 적용 요율은 ${rate}입니다.`, isHeading: false, action: function () { } },
        { text: "", isHeading: false, action: null },
        { text: "중개보수를 계산합니다...", isHeading: true, action: null },
        { text: "중개보수=거래금액×요율", isHeading: false, action: null },
        { text: `=${displayDepositValue}×${rate}`, isHeading: false, action: null },
        { text: `=${displayFeeValue}`, isHeading: false, action: function () { } },
        { text: "", isHeading: false, action: null },
        { text: "부가세를 계산합니다...", isHeading: true, action: null },
        { text: `부가세=중개보수×${vatRatePct}%`, isHeading: false, action: null },
        { text: `=${displayFeeValue}×${vatRatePct}%`, isHeading: false, action: null },
        { text: `=${displayVatAmount}`, isHeading: false, action: null },
        { text: "", isHeading: false, action: null },
        { text: "최종 중개보수(부가세 포함)를 계산합니다...", isHeading: true, action: null },
        { text: "최종 중개보수=중개보수+부가세", isHeading: false, action: null },
        { text: `=${displayFeeValue}+${displayVatAmount}`, isHeading: false, action: null },
        { text: `=${displayTotalFeeValue}`, isHeading: false, action: function () { showFinalResult = true; } }
      ];
    } else {
      // 매매인 경우
      calculationSteps = [
        { text: "먼저 거래금액을 확인합니다...", isHeading: true, action: null },
        { text: `매매가=${displayDepositValue}`, isHeading: false, action: null },
        { text: `거래금액은 ${displayDepositValue}`, isHeading: false, action: function () { } },

        { text: "", isHeading: false, action: null },
        { text: "다음으로 적용 요율을 확인합니다...", isHeading: true, action: null },
        { text: `거래금액이 ${displayDepositValue}이므로 적용 요율은 ${rate}입니다.`, isHeading: false, action: function () { } },
        { text: "", isHeading: false, action: null },
        { text: "중개보수를 계산합니다...", isHeading: true, action: null },
        { text: "중개보수=거래금액×요율", isHeading: false, action: null },
        { text: `=${displayDepositValue}×${rate}`, isHeading: false, action: null },
        { text: `=${displayFeeValue}`, isHeading: false, action: function () { } },
        { text: "", isHeading: false, action: null },
        { text: "부가세를 계산합니다...", isHeading: true, action: null },
        { text: `부가세=중개보수×${vatRatePct}%`, isHeading: false, action: null },
        { text: `=${displayFeeValue}×${vatRatePct}%`, isHeading: false, action: null },
        { text: `=${displayVatAmount}`, isHeading: false, action: null },
        { text: "", isHeading: false, action: null },
        { text: "최종 중개보수(부가세 포함)를 계산합니다...", isHeading: true, action: null },
        { text: "최종 중개보수=중개보수+부가세", isHeading: false, action: null },
        { text: `=${displayFeeValue}+${displayVatAmount}`, isHeading: false, action: null },
        { text: `=${displayTotalFeeValue}`, isHeading: false, action: function () { showFinalResult = true; } }
      ];
    }
  }

  // 숫자 포맷팅
  function formatNumber(num) {
    if (!num) return '0';
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // 계산 과정 버튼 클릭 이벤트
  processButton.addEventListener('click', function () {
    // 이미 계산 중이면 무시
    if (calculating) return;

    // 계산 과정 컨테이너 표시
    processContainer.style.display = 'block';
    this.textContent = '계산중...';
    this.disabled = true;

    // 스크롤 애니메이션을 먼저 하고 약간 지연 후 계산 시작
    processContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // 약간 지연후 계산 시작 (스크롤이 완료될 시간 여유)
    setTimeout(() => {
      startCalculation();
    }, 500);
  });

  // 계산 시작 함수
  function startCalculation() {
    // 상태 초기화
    calculating = true;
    calculationLines = [];
    currentText = '';
    currentLineIndex = 0;
    currentCharIndex = 0;
    showFinalResult = false;

    // 계산 과정 표시 영역 초기화
    calculationDisplay.innerHTML = '';
    finalResult.style.display = 'none';

    // 타이핑 라인 추가
    calculationDisplay.appendChild(typingLine);

    // 타이핑 효과 시작
    typeNextCharacter();
  }

  // 타이핑 효과 구현
  function typeNextCharacter() {
    // 모든 단계가 완료되면 최종 결과 표시
    if (currentLineIndex >= calculationSteps.length) {
      calculating = false;

      // 타이핑 라인 제거
      if (typingLine.parentNode === calculationDisplay) {
        calculationDisplay.removeChild(typingLine);
      }

      // 최종 결과 표시 - 항상 표시되도록 수정
      if (currentTransactionType === 'lease') {
        const depositVal = parseInt(calculatedValues.deposit);
        const monthlyVal = parseInt(calculatedValues.monthly);
        const calc100 = depositVal + (monthlyVal * 100);
        const calc70 = depositVal + (monthlyVal * 70);

        const rateValue = parseFloat(calculatedValues.rate.replace('%', '')) / 100;
        // currentVatRate: 계산 시점에 저장된 부가세율 사용 (1.1 하드코딩 제거)
        const finalFee = formatCurrency((calc100 >= 5000 ? calc100 : calc70) * 10000 * rateValue * (1 + currentVatRate));
        finalResult.innerHTML = `따라서,<br>최종 중개보수는 <strong>${finalFee}</strong>입니다.`;
      } else {
        finalResult.innerHTML = `따라서,<br>최종 중개보수는 <strong>${calculatedValues.totalFee}</strong>입니다.`;
      }
      finalResult.style.display = 'block';

      // 결과 보기 버튼 표시
      resultNavigationButton.style.display = 'block';

      // 버튼 상태 복원
      processButton.textContent = '계산 과정 다시 보기';
      processButton.disabled = false;

      // 최종 결과가 화면에 보이도록 스크롤 - 약간 지연
      setTimeout(() => {
        finalResult.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      return;
    }

    const currentStep = calculationSteps[currentLineIndex];

    if (currentStep === null) {

      // 다음 단계로
      currentLineIndex++;
      currentText = '';
      currentCharIndex = 0;

      // 다음 글자 타이핑
      setTimeout(typeNextCharacter, 1);
      return;
    }

    // 빈 줄이면 바로 다음 단계로
    if (currentStep.text === "") {
      // 완성된 빈 줄 추가
      const emptyLine = document.createElement('div');
      emptyLine.className = 'calculation-line';
      emptyLine.style.marginBottom = '1px';
      emptyLine.innerHTML = '&nbsp;';
      calculationDisplay.insertBefore(emptyLine, typingLine);

      // 다음 단계로
      currentLineIndex++;
      currentText = '';
      currentCharIndex = 0;

      // 다음 글자 타이핑
      setTimeout(typeNextCharacter, 300);
      return;
    }

    // 한 글자씩 추가
    if (currentCharIndex < currentStep.text.length) {
      // 다음 글자 추가
      currentText += currentStep.text[currentCharIndex];
      currentCharIndex++;

      // 타이핑 중인 텍스트 업데이트
      updateTypingLine();

      // 스크롤 조절 - 글자마다 매번 스크롤하지 않고 일정 간격으로 스크롤
      if (currentCharIndex % 5 === 0) { // 5글자마다 한 번씩 스크롤
        setTimeout(() => {
          typingLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 10);
      }

      // 다음 글자 타이핑 (타이핑 속도 조절)
      const typingSpeed = 10 + Math.floor(Math.random() * 20); // 10~30ms 사이 랜덤

      setTimeout(typeNextCharacter, typingSpeed);
    } else {
      // 한 줄 완성 - 현재 줄을 고정된 줄로 변환
      const completedLine = document.createElement('div');
      completedLine.className = 'calculation-line';
      completedLine.style.marginBottom = '4px';
      completedLine.style.whiteSpace = 'pre-wrap';
      completedLine.style.wordBreak = 'break-word';
      completedLine.style.lineHeight = '1.3';
      completedLine.style.letterSpacing = '-0.02em';
      completedLine.style.fontSize = '15px';
      completedLine.style.maxWidth = '100%';
      completedLine.style.overflowWrap = 'break-word';

      if (currentStep.isHeading) {
        completedLine.style.fontWeight = 'bold';
        completedLine.style.color = '#007bff';
      }

      // 줄바꾸기 일관성 보장
      completedLine.textContent = currentStep.text;
      calculationDisplay.insertBefore(completedLine, typingLine);
      typingLine.textContent = '';

      // 결과 업데이트 - action 함수 실행
      if (currentStep.action) {
        currentStep.action();
      }

      // 다음 줄로
      currentLineIndex++;
      currentText = '';
      currentCharIndex = 0;

      // 타이핑 라인 초기화
      updateTypingLine();

      // 스크롤 가능하게 줄 완성 후 스크롤
      setTimeout(() => {
        typingLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);

      // 다음 글자 타이핑 (줄 간격 타이밍 조절)
      const lineGapTime = 300 + Math.floor(Math.random() * 100); // 300-400ms 사이의 랜덤 간격
      setTimeout(typeNextCharacter, lineGapTime);
    }
  }

  // 타이핑 중인 줄 업데이트
  function updateTypingLine() {
    if(calculationSteps[currentLineIndex] == null){
      return;
    }

    const isHeading = currentLineIndex < calculationSteps.length && calculationSteps[currentLineIndex].isHeading;

    typingLine.style.fontWeight = isHeading ? 'bold' : 'normal';
    typingLine.style.color = isHeading ? '#007bff' : '';

    typingLine.innerHTML = currentText + '<span class="cursor"></span>';

    // 글자 수에 따라 스크롤 조절 (글자마다 스크롤하지 않고 일정 글자 수 단위로 스크롤)
    // 여기서는 스크롤 안함 - typeNextCharacter 함수에서 제어할 것
  }

  // 앱 초기화 및 필요한 요소를 DOM에 추가
  function init() {
    // 약간의 지연을 주어 DOM이 완전히 로드되고 계산 결과가 표시된 후에 실행
    setTimeout(() => {
      // 버튼을 결과 섹션 뒤에 추가
      const resultSection = document.querySelector('.result-section');
      const inputSection = document.querySelector('.input-section');

      if (resultSection && inputSection) {
        // 결과 섹션의 부모 요소에 계산 과정 버튼과 컨테이너 추가
        inputSection.appendChild(processButton);
        inputSection.appendChild(processContainer);

        // 스타일 태그 추가
        const style = document.createElement('style');
        style.textContent = `
        .cursor {
        display: inline-block;
        width: 2px; /* 더 얇게 */
        height: 1em; /* 현재 글자 높이에 자동 맞춤 */
        background-color: #007bff; /* 부드러운 파란색 계열 */
        margin-left: 2px;
        vertical-align: middle;
        animation: blink 1s step-end infinite;
        border-radius: 1px; /* 살짝 둥글게 */
      }

      @keyframes blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }

        
        .process-button:hover {
        background-color: #5a6268;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(108, 117, 125, 0.3);
        }
        
        .process-button:active {
        transform: translateY(0);
        box-shadow: 0 2px 4px rgba(108, 117, 125, 0.2);
        }
        
        .process-button:disabled {
        background-color: #6c757d;
        opacity: 0.7;
        cursor: not-allowed;
        }
        
        /* 결과 일관성 확보를 위한 추가 스타일 */
        .calculation-line {
        white-space: pre-wrap;
        word-break: keep-all;
        line-height: 1.5; /* 줄 간격 살짝 여유롭게 */
        letter-spacing: 0em; /* 글자 간격 기본 */
        font-size: 15px; /* 가독성 좋은 크기 */
        margin-bottom: 6px !important; /* 줄과 줄 사이 여백 약간 넓게 */
        font-family: 'Noto Sans KR', 'Malgun Gothic', 'Segoe UI', sans-serif; /* 한글 최적화 폰트 */
        color: #333; /* 너무 진하지도, 흐리지도 않게 */
      }

    /* 버튼 페이드인 효과 스타일 */
    .process-button {
      transition: opacity 0.5s ease !important;
    }
  `;
        document.head.appendChild(style);

        // 계산하기 버튼 이벤트 후크
        hookCalculateButton();

        console.log('타이핑 계산기 초기화 완료');
      } else {
        console.error('결과 섹션 또는 입력 섹션을 찾을 수 없습니다.');
      }
    }, 1000); // 초기화 지연 시간 증가
  }

  // 초기화 실행
  init();
}

// 페이지 로드 시 타이핑 계산기 초기화
document.addEventListener('DOMContentLoaded', function () {
  setTimeout(function () {
    initTypingCalculator();
  }, 1000); // 지연 시간 증가
});