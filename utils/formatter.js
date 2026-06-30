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

export const formatCurrency = (amount) => {
    if (amount === null || amount === undefined || amount == '') return '0';
    // 금액은 정수로 처리합니다.
    const numberAmount = typeof amount === 'string' ? parseInt(amount.replace(/,/g, ''), 10) : amount;
    return new Intl.NumberFormat('ko-KR').format(numberAmount);
};

export const formatDecimal = (amount) => {
    if (amount === null || amount === undefined || amount === '') return '0';

    // 1. parseInt 대신 parseFloat 사용 (소수점 보존)
    const numberAmount = typeof amount === 'string' ? parseFloat(amount.replace(/,/g, '')) : Number(amount);

    if (isNaN(numberAmount)) return '0';

    // 2. maximumFractionDigits 옵션을 주어 넉넉하게 소수점 자리를 허용 (예: 10자리)
    return new Intl.NumberFormat('ko-KR', {
        maximumFractionDigits: 10
    }).format(numberAmount);
};

export const getStatusClass = (status) => {
    switch (Number(status)) {
        case 0: return 'status-pending';
        case 1: return 'status-approved';
        case 2: return 'status-rejected';
        default: return '';
    }
};
