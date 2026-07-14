// utils/formatter.js

/**
 * 날짜 문자열을 YYYY-MM-DD 형식으로 변환
 */
export const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    // ISO 형식(2023-10-01T...)이나 일반 문자열 처리
    return dateStr.substring(0, 10);
};

/**
 * 생년월일 기준 만 나이 계산
 */
export const calculateAge = (birthDateStr) => {
    if (!birthDateStr) return '';

    const today = new Date();
    const birthDate = new Date(birthDateStr);

    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }

    return age;
};

/**
 * 대상 날짜가 오늘로부터 몇 개월 남았는지 계산
 */
export const getMonthsDiff = (dateStr) => {
    if (!dateStr) return null;

    const targetDate = new Date(dateStr);
    const today = new Date();

    // 연도와 월 차이 계산
    const diff = (targetDate.getFullYear() - today.getFullYear()) * 12 + (targetDate.getMonth() - today.getMonth());

    return diff;
};

/*
export const formatCurrency = (amount) => {
    if (amount === null || amount === undefined || amount == '') return '0';
    // 금액은 정수로 처리합니다.
    const numberAmount = typeof amount === 'string' ? parseInt(amount.replace(/,/g, ''), 10) : amount;
    return new Intl.NumberFormat('ko-KR').format(numberAmount);
};

 */
export const formatCurrency = (val) => {
    // 1. 값이 없거나 빈 문자열일 경우 '0'을 반환 (기존 동작 복구)
    if (val === null || val === undefined || val === '') return '0';

    // 2. 사용자가 입력 중인 마이너스 기호 상태 보존
    if (val === '-') return '-';
    if (val === '-0') return '-0';

    // 3. 콤마가 포함된 문자열이 들어와도 안전하게 처리 (음수 기호는 유지됨)
    const rawVal = typeof val === 'string' ? val.replace(/,/g, '') : val;
    const num = Number(rawVal);

    // 4. 숫자로 변환할 수 없는 값이라면 원본 반환 방어 코드
    if (isNaN(num)) return val;

    // 5. 음수(-) 기호와 천 단위 콤마(,) 완벽 보존
    return num.toLocaleString('ko-KR');
};

export const formatDecimal = (amount) => {
    if (amount === null || amount === undefined || amount === '') return '0';

    // 1. 입력값을 확실하게 문자열로 만들고 기존 콤마 제거
    const strAmount = String(amount).replace(/,/g, '');

    // 2. 숫자가 아닌 값이 들어오면 0 반환 ('-' 만 입력 중인 상태는 허용)
    if (isNaN(strAmount) && strAmount !== '-') return '0';

    // 3. 소수점(.)을 기준으로 정수부와 소수부 분리
    const parts = strAmount.split('.');

    // 4. 정수부에만 콤마 적용
    let integerPart = parts[0];
    if (integerPart !== '' && integerPart !== '-') {
        integerPart = new Intl.NumberFormat('ko-KR').format(Number(integerPart));
    }

    // 5. 입력값에 소수점이 있었다면, 분리해둔 소수부를 그대로 다시 이어 붙임
    return parts.length > 1 ? `${integerPart}.${parts[1]}` : integerPart;
};

export const getStatusClass = (status) => {
    switch (Number(status)) {
        case 0: return 'status-pending';
        case 1: return 'status-approved';
        case 2: return 'status-rejected';
        default: return '';
    }
};
