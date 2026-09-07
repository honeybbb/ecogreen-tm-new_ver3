/**
* 산출내역서(원가 산출) 공통 로직
*
* - 현장 등록(site/register), 현장 상세(site/[id]) 양쪽에서 동일하게 사용합니다.
* - Nuxt3 의 composables 디렉터리에 두면 자동 임포트되므로 import 없이 바로 호출 가능합니다.
*   (자동 임포트를 쓰지 않는 환경이면 `import { ... } from '~/composables/useCostBreakdown'`)
*
* 계산 함수는 모두 group 객체({ staffList, costBreakdown, manualMonthlyTotal })를 받습니다.
*/

const num = (v) => Number(v) || 0;

const safeParse = (raw, fallback) => {
try { return JSON.parse(raw); } catch { return fallback; }
};

/* =============================================
포맷 / 기본값 생성
============================================= */
export const makeValuesObj = (staffList = [], defaultVal = '') => {
const obj = {};
(staffList ?? []).forEach((s) => { obj[s.code] = defaultVal; });
return obj;
};

export const createDefaultCostBreakdown = (staffList = [], defaultVal = '') => ({
    dailyWorkHours: makeValuesObj(staffList, defaultVal),
    monthlyWorkHours: makeValuesObj(staffList, defaultVal),
    dailyHoursBigo:   '',
    monthlyHoursBigo: '',
    directLabor:   [],
    indirectLabor: [],
    expenses:      [],
    // ▼ 단일 객체 형태로 변경된 부분
    managementFee: { code: '04004001', label: '일반관리비', values: makeValuesObj(staffList, defaultVal) },
    profit:        { code: '04004002', label: '기업이윤', values: makeValuesObj(staffList, defaultVal) },
    contractTotalFee:  '',
    contractTotalBigo: '',
    specialNote: '',
});

/**
* DB에서 내려온 costBreakdown(구버전/필드 누락/문자열 JSON)을 안전한 형태로 보정합니다.
* getSiteData()에서 계약 목록을 조립할 때 사용하세요.
*/
export const normalizeCostBreakdown = (raw, staffList = [], defaultVal = '') => {
const base = createDefaultCostBreakdown(staffList, defaultVal);
if (!raw) return base;

const parsed = typeof raw === 'string' ? safeParse(raw, null) : raw;
if (!parsed || typeof parsed !== 'object') return base;

return {
...base,
...parsed,
directLabor:      Array.isArray(parsed.directLabor)   ? parsed.directLabor   : [],
indirectLabor:    Array.isArray(parsed.indirectLabor) ? parsed.indirectLabor : [],
expenses:         Array.isArray(parsed.expenses)      ? parsed.expenses      : [],
dailyWorkHours:   parsed.dailyWorkHours   || base.dailyWorkHours,
monthlyWorkHours: parsed.monthlyWorkHours || base.monthlyWorkHours,
managementFee:    parsed.managementFee    || base.managementFee,
profit:           parsed.profit           || base.profit,
contractTotalFee:  parsed.contractTotalFee  ?? '',
contractTotalBigo: parsed.contractTotalBigo ?? '',
specialNote:       parsed.specialNote       ?? '',
};
};

/**
* staffList(직책 목록) 변경에 맞춰 costBreakdown의 컬럼(직책 코드)을 동기화합니다.
* 컴포넌트 내부에서 staffList를 watch 하며 자동 호출하므로,
* 페이지에서 직책 추가/삭제 시 별도로 호출하지 않아도 됩니다.
*/
export const syncCostBreakdownToStaff = (group, defaultVal = '') => {
    if (!group) return;
    if (!group.costBreakdown) {
        group.costBreakdown = createDefaultCostBreakdown(group.staffList, defaultVal);
        return;
    }

    const cb = group.costBreakdown;
    const currentCodes = (group.staffList ?? []).map((s) => s.code);

    // 1. 배열 형태 동기화
    ['directLabor', 'indirectLabor', 'expenses'].forEach((section) => {
        if (!Array.isArray(cb[section])) cb[section] = [];
        cb[section].forEach((item) => {
            if (!item.values) item.values = {};
            currentCodes.forEach((code) => {
                if (!(code in item.values)) item.values[code] = defaultVal;
            });
            Object.keys(item.values).forEach((code) => {
                if (!currentCodes.includes(code)) delete item.values[code];
            });
        });
    });

    // 2. 단일 객체 형태 동기화 (managementFee, profit)
    ['managementFee', 'profit'].forEach(key => {
        // 객체가 아니면 새로 만들어줌
        if (!cb[key] || !cb[key].values) {
            cb[key] = {
                code: key === 'managementFee' ? '04004001' : '04004002',
                label: key === 'managementFee' ? '일반관리비' : '기업이윤',
                values: {}
            };
        }

        currentCodes.forEach(code => {
            if (!(code in cb[key].values)) cb[key].values[code] = defaultVal;
        });
        Object.keys(cb[key].values).forEach(code => {
            if (!currentCodes.includes(code)) delete cb[key].values[code];
        });
    });

    // 3. 플랫 형태 동기화 (근로시간)
    ['dailyWorkHours', 'monthlyWorkHours'].forEach((key) => {
        if (!cb[key]) cb[key] = {};
        currentCodes.forEach((code) => {
            if (!(code in cb[key])) cb[key][code] = defaultVal;
        });
        Object.keys(cb[key]).forEach((code) => {
            if (!currentCodes.includes(code)) delete cb[key][code];
        });
    });
};

/* =============================================
계산 (열 합계 / 행 합계 / 총계)
============================================= */

// 열 합계: 특정 직책 코드의 섹션 내 모든 항목 합
export const getColTotal = (items, code) =>
(items ?? []).reduce((s, item) => s + num(item?.values?.[code]), 0);

// 행 합계: 항목 한 줄의 (단가 × 인원) 합
export const getRowTotal = (item, staffList) =>
(staffList ?? []).reduce((s, st) => s + num(item?.values?.[st.code]) * num(st.count), 0);

export const getDirectLaborColTotal   = (g, code) => getColTotal(g?.costBreakdown?.directLabor, code);
export const getIndirectLaborColTotal = (g, code) => getColTotal(g?.costBreakdown?.indirectLabor, code);
export const getExpensesColTotal      = (g, code) => getColTotal(g?.costBreakdown?.expenses, code);

// D. 노무비 합계 (A+B+C)
export const getLaborColTotal = (g, code) =>
getDirectLaborColTotal(g, code) + getIndirectLaborColTotal(g, code) + getExpensesColTotal(g, code);

// E. 일반관리비 / F. 기업이윤 — 요율 계산이 아니라 직접 입력값을 사용
export const getManagementFeeCol = (g, code) => {
    // 기존: return Number(g.costBreakdown.managementFee?.[code]) || 0;
    return Number(g.costBreakdown.managementFee?.values?.[code]) || 0;
};

export const getProfitCol = (g, code) => {
    // 기존: return Number(g.costBreakdown.profit?.[code]) || 0;
    return Number(g.costBreakdown.profit?.values?.[code]) || 0;
};

// 1인당 월 용역비 (D+E+F)
export const getMonthlyTotalCol = (g, code) =>
getLaborColTotal(g, code) + getManagementFeeCol(g, code) + getProfitCol(g, code);

// 소계 행의 행합계 (전 직책 × 인원 합산)
export const getSubtotalRowTotal = (g, sectionFn) =>
(g?.staffList ?? []).reduce((s, st) => s + sectionFn(g, st.code) * num(st.count), 0);

export const getMonthlyFeeByStaff = (g, staff) => getMonthlyTotalCol(g, staff.code) * num(staff.count);

// 월간 용역비 총계 (자동 계산)
export const getTotalMonthlyFee = (g) => getSubtotalRowTotal(g, getMonthlyTotalCol);

// 섹션별 총계
export const getLaborGrandTotal         = (g) => getSubtotalRowTotal(g, getLaborColTotal);
export const getManagementFeeGrandTotal = (g) => getSubtotalRowTotal(g, getManagementFeeCol);
export const getProfitGrandTotal        = (g) => getSubtotalRowTotal(g, getProfitCol);

/**
* 화면/저장에 쓸 월간 용역비.
* 사용자가 직접 입력한 manualMonthlyTotal이 있으면 그 값을, 없으면 자동 계산값을 반환합니다.
*/
export const getDisplayMonthlyTotal = (g) => {
const manual = g?.manualMonthlyTotal;
if (manual !== undefined && manual !== null && manual !== '') return num(manual);
return getTotalMonthlyFee(g);
};

export const getGroupStaffTotal = (g) =>
(g?.staffList ?? []).reduce((s, i) => s + num(i.count), 0);

/* =============================================
항목 추가 / 삭제
============================================= */

export const addCostItem = (g, section, defaultVal = '') => {
if (!g.costBreakdown) g.costBreakdown = createDefaultCostBreakdown(g.staffList, defaultVal);
if (!Array.isArray(g.costBreakdown[section])) g.costBreakdown[section] = [];
g.costBreakdown[section].push({
code: '',
label: '',
values: makeValuesObj(g.staffList, defaultVal),
bigo: '',
});
};

export const removeCostItem = (g, section, idx) => {
g.costBreakdown?.[section]?.splice(idx, 1);
};

/* =============================================
금액 입력 핸들러 (콤마 포맷 + 커서 위치 보정)
============================================= */

const applyFormatted = (el, numValue, selectionStart, oldLength) => {
const formatted = formatCurrency(numValue);
el.value = formatted;
const nextPos = Math.max(0, selectionStart + (formatted.length - oldLength));
if (typeof el.setSelectionRange === 'function') {
el.setSelectionRange(nextPos, nextPos);
}
};

const readNumeric = (el) => {
const raw = el.value.replace(/[^\d]/g, '');
return raw === '' ? '' : Number(raw);
};

// 항목 행(직책별 금액) 입력
export const onInputCost = (item, code, event) => {
const el = event.target;
const selectionStart = el.selectionStart ?? el.value.length;
const oldLength = el.value.length;

const numValue = readNumeric(el);
if (!item.values) item.values = {};
item.values[code] = numValue;

applyFormatted(el, numValue, selectionStart, oldLength);
};

// 일반관리비/기업이윤처럼 단일 객체[code] 입력
export const onInputSingleCost = (obj, code, event) => {
const el = event.target;
const selectionStart = el.selectionStart ?? el.value.length;
const oldLength = el.value.length;

const numValue = readNumeric(el);
obj[code] = numValue;

applyFormatted(el, numValue, selectionStart, oldLength);
};

// 단일 필드(계약기간 총액 등) 입력
export const onInputSingleRaw = (obj, key, event) => {
const el = event.target;
const selectionStart = el.selectionStart ?? el.value.length;
const oldLength = el.value.length;

const numValue = readNumeric(el);
obj[key] = numValue;

applyFormatted(el, numValue, selectionStart, oldLength);
};

// 월간 용역비 총계 직접 입력 (비우면 자동 계산으로 복귀)
export const onInputMonthlyTotal = (group, event) => {
const el = event.target;
const selectionStart = el.selectionStart ?? el.value.length;
const oldLength = el.value.length;

const numValue = readNumeric(el);
group.manualMonthlyTotal = numValue;

const display = numValue === '' ? getTotalMonthlyFee(group) : numValue;
applyFormatted(el, display, selectionStart, oldLength);
};

/* =============================================
엑셀식 방향키 셀 이동 (상하좌우)
============================================= */

export const handleTableKeydown = (e) => {
const isUp    = e.key === 'ArrowUp';
const isDown  = e.key === 'ArrowDown';
const isLeft  = e.key === 'ArrowLeft';
const isRight = e.key === 'ArrowRight';
if (!isUp && !isDown && !isLeft && !isRight) return;

const currentInput = e.target;
if (currentInput.tagName !== 'INPUT') return;

// 좌우키는 텍스트 편집(커서 이동)을 우선 보장
if (typeof currentInput.selectionStart === 'number') {
if (isLeft && currentInput.selectionStart > 0) return;
if (isRight && currentInput.selectionEnd < currentInput.value.length) return;
}

const currentTd = currentInput.closest('td');
const currentTr = currentInput.closest('tr');
if (!currentTd || !currentTr) return;

e.preventDefault();

const focusIn = (td) => {
const target = td?.querySelector('input:not([disabled])');
if (!target) return false;
target.focus();
target.select?.();
return true;
};

if (isUp || isDown) {
const cellIndex = Array.from(currentTr.children).indexOf(currentTd);
let targetTr = isUp ? currentTr.previousElementSibling : currentTr.nextElementSibling;
while (targetTr) {
if (focusIn(targetTr.children[cellIndex])) return;
targetTr = isUp ? targetTr.previousElementSibling : targetTr.nextElementSibling;
}
return;
}

let targetTd = isLeft ? currentTd.previousElementSibling : currentTd.nextElementSibling;
while (targetTd) {
if (focusIn(targetTd)) return;
targetTd = isLeft ? targetTd.previousElementSibling : targetTd.nextElementSibling;
}
};

/* =============================================
한 번에 꺼내 쓰기용
============================================= */

export const useCostBreakdown = () => ({
makeValuesObj,
createDefaultCostBreakdown,
normalizeCostBreakdown,
syncCostBreakdownToStaff,
getColTotal,
getRowTotal,
getDirectLaborColTotal,
getIndirectLaborColTotal,
getExpensesColTotal,
getLaborColTotal,
getManagementFeeCol,
getProfitCol,
getMonthlyTotalCol,
getSubtotalRowTotal,
getMonthlyFeeByStaff,
getTotalMonthlyFee,
getLaborGrandTotal,
getManagementFeeGrandTotal,
getProfitGrandTotal,
getDisplayMonthlyTotal,
getGroupStaffTotal,
addCostItem,
removeCostItem,
onInputCost,
onInputSingleCost,
onInputSingleRaw,
onInputMonthlyTotal,
handleTableKeydown,
});