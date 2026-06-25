<script setup>
import { ref, watch, onMounted, computed, reactive, nextTick } from 'vue';
import axios from 'axios';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { useAuthStore } from '~/stores/auth.js';
import RichTextEditor from '@/components/RichTextEditor.vue';

const { siteOptions, typeOptions, fetchSiteOptions, fetchTypeOptions } = useApi();
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx || 1;

const props = defineProps({
  isOpen: Boolean,
  settlementId: Number,
  initialData: Object,
});

const emit = defineEmits(['close', 'save']);

// ──────────────────────────────────────────────
// 1. 기본 상태 및 표시 설정 (단일 뷰 통합)
// ──────────────────────────────────────────────
const activeTab = ref('statement'); // 'statement' | 'details'

const currentConfig = reactive({
  showGrossPay: true,
  activePayLabels: [],       //지급항목 배열
  activeDeductionLabels: [], //공제항목 배열
  activeDeductionCodes: [],
  summarySigns: {
    severance: -1,
    annualLeave: -1,
    estimatedIns: -1,
    actualIns: -1,
    insuranceDiff: -1
  }
});

const meltOptions = reactive({
  annualLeave: false,
  severance: false,
  workersDay: false,
});

const isInitializing = ref(false);
const dragIndex = ref(null);
const lastBigoAlertSIdx = ref(null);//비고alert

// ──────────────────────────────────────────────
// 2. 폼 데이터 상태
// ──────────────────────────────────────────────
const formData = ref({
  sIdx: '',
  siteName: '',
  is_vat: 'N',
  type: '',
  target_month: '',
  docNo: '',
  billingDt: '',
  subTotal: 0,
  vatAmount: 0,
  grandTotal: 0,
  billingData: {
    summary: '',
    workerCount: 0,
    bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)',
    items: [],
    customSummaryItems: [],
    vatBreakdown: {
      under135: { area: '', unitPrice: '', supply: 0 },
      over135: { area: '', unitPrice: '', supply: 0, vat: 0 }
    },
    insuranceDiff: 0,
    memo: ''
  },
  payrollData: [],
});

// ──────────────────────────────────────────────
// 커스텀 정산 항목 컨트롤 함수
// ──────────────────────────────────────────────
const addCustomSummaryItem = () => {
  if (!formData.value.billingData.customSummaryItems) {
    formData.value.billingData.customSummaryItems = [];
  }
  formData.value.billingData.customSummaryItems.push({
    label: '',
    amount: 0,
    sign: 1
  });
};

const removeCustomSummaryItem = (index) => {
  formData.value.billingData.customSummaryItems.splice(index, 1);
};

const toggleCustomSign = (index) => {
  const item = formData.value.billingData.customSummaryItems[index];
  item.sign = item.sign === 1 ? -1 : 1;
};

const filterKoreanOnly = (str) => {
  if (!str) return '';
  const hasKorean = /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(str);
  if (hasKorean) {
    return str.replace(/[^가-힣ㄱ-ㅎㅏ-ㅣ\s]/g, '');
  } else {
    return str;
  }
};

// ──────────────────────────────────────────────
// 3. 계약 데이터 및 적용 요율
// ──────────────────────────────────────────────
const items = ref([]); // 최하위 leaf 노드 저장용
const allWageCodes = ref([]); // DB에서 불러온 전체 코드 원본 저장용

const contractIndirectLabor = ref([]);
const contractIndirectLabels = ref([]);

const contractDirectLabor = ref([]);
const contractStaffList = ref([]);
const contractTotalCost = ref(0);

const insuranceRates = ref({
  nationalPension: 0,
  healthInsurance: 0,
  longTermCare: 0,
  employmentInsurance: 0,
  industrialAccident: 0
});

const fetchTaxRates = async () => {
  const targetDate = formData.value.target_month || formData.value.billingDt;
  const year = targetDate ? targetDate.substring(0, 4) : new Date().getFullYear();

  try {
    const res = await axios.get(`/api/v1/config/tax/rate/${year}`);
    let result = res.data.data[0];
    if (result) {
      insuranceRates.value.nationalPension = result.pension_rate;
      insuranceRates.value.healthInsurance = result.health_rate;
      insuranceRates.value.longTermCare = result.long_term_care_rate;
      insuranceRates.value.employmentInsurance = result.employment_rate;
      insuranceRates.value.industrialAccident = result.industrial_rate;
    }
  } catch (err) { console.error('적용요율 로드 실패:', err); }
};

const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    const all = (res.data.data || []).filter(c => c.itemCd.startsWith('04'));

    // 전체 코드를 보관해둡니다 (나중에 이름 찾기 폴백용)
    allWageCodes.value = all;

    // ── 1. itemCd → 노드 맵 ──────────────────────────
    const map = Object.fromEntries(all.map(c => [c.itemCd, c]));

    // ── 2. 부모 역할을 하는 코드 집합 ─────────────────
    const parentCds = new Set(all.map(c => c.groupCd));

    // ── 3. leaf 노드만 추출 (자식이 없는 최종 항목) ───
    const leaves = all.filter(c => !parentCds.has(c.itemCd));

    // ── 4. leaf의 04001/04002 직속 조상 탐색 ──────────
    const getTopAncestor = (itemCd) => {
      let cur = map[itemCd];
      while (cur) {
        const parent = map[cur.groupCd];
        // parent가 루트(04)이면 cur가 대분류
        if (!parent || parent.itemCd === parent.groupCd) return cur.itemCd;
        cur = parent;
      }
      return null;
    };

    // ── 5. groupNm 부여 ────────────────────────────────
    const GROUP_NM = {
      '04001': '지급항목',
      '04002': '공제항목',
      '04003': '정산항목',
    };

    items.value = leaves.map(leaf => ({
      ...leaf,
      tax_free: Number(leaf.tax_free) || 0,
      groupNm:  GROUP_NM[getTopAncestor(leaf.itemCd)] ?? '기타',
    }));

  } catch (e) {
    console.error('임금코드 로드 실패:', e);
    items.value = [];
  }
};

const fetchContractData = async () => {
  const sIdx = formData.value.sIdx;
  const type = formData.value.type;

  if (!sIdx || !type) {
    contractIndirectLabor.value = [];
    contractIndirectLabels.value = [];
    contractDirectLabor.value = [];
    contractStaffList.value = [];
    contractTotalCost.value = 0;
    return;
  }

  try {
    const res = await axios.get(`/api/v1/site/data/${sIdx}`);
    const siteData = res.data.data?.[0];

    if (!siteData) return;

    // ── 현장 특이사항(bigoList) 알림 ──────────────
    if (siteData.bigoList && sIdx !== lastBigoAlertSIdx.value) {
      try {
        const bigoArr = typeof siteData.bigoList === 'string'
            ? JSON.parse(siteData.bigoList)
            : siteData.bigoList;

        if (Array.isArray(bigoArr) && bigoArr.length > 0) {
          const msg = bigoArr
              .map(b => `[${(b.regDt || '').substring(0, 10)}] ${b.writer || ''}\n${b.bigo || ''}`)
              .join('\n\n');
          alert(`⚠ 특이사항\n\n${msg}`);
        }
      } catch (e) {
        console.error('bigoList 파싱 에러:', e);
      }
      lastBigoAlertSIdx.value = sIdx;
    }

    if ((!props.settlementId || !isInitializing.value) && siteData.viewConfig) {
      try {
        const parsedConfig = typeof siteData.viewConfig === 'string'
            ? JSON.parse(siteData.viewConfig)
            : siteData.viewConfig;

        currentConfig.showGrossPay    = parsedConfig.showGrossPay ?? true;
        currentConfig.showAnnualLeave = parsedConfig.showAnnualLeave ?? true;
        currentConfig.showSeverance   = parsedConfig.showSeverance ?? true;
        currentConfig.showWorkersDay  = parsedConfig.showWorkersDay ?? true;
        currentConfig.showSanjae      = parsedConfig.showSanjae ?? true;
      } catch (e) {
        console.error('현장 viewConfig 파싱 에러:', e);
      }
    }

    if (!siteData.contractList) return;

    const parsedContractList = typeof siteData.contractList === 'string'
        ? JSON.parse(siteData.contractList)
        : siteData.contractList;

    const targetContract = parsedContractList.find(c => c.type === type);

    if (targetContract) {
      const iLabor = (targetContract.budget && Array.isArray(targetContract.budget.indirectLabor)) ? targetContract.budget.indirectLabor : [];
      contractIndirectLabor.value = iLabor;
      contractIndirectLabels.value = iLabor.map(item => item.label);

      contractDirectLabor.value = (targetContract.budget && Array.isArray(targetContract.budget.directLabor)) ? targetContract.budget.directLabor : [];
      contractStaffList.value = Array.isArray(targetContract.staffList) ? targetContract.staffList : [];
      contractTotalCost.value = Number(targetContract.totalCost) || 0;

      if (targetContract.viewConfig) {
        try {
          const contractConfig = typeof targetContract.viewConfig === 'string'
              ? JSON.parse(targetContract.viewConfig)
              : targetContract.viewConfig;

          if (Array.isArray(contractConfig.activePayLabels)) {
            currentConfig.activePayLabels = contractConfig.activePayLabels;
          }
          if (Array.isArray(contractConfig.activeDeductionLabels)) {
            currentConfig.activeDeductionLabels = contractConfig.activeDeductionLabels;
            currentConfig.activeDeductionCodes = contractConfig.activeDeductionLabels;
          }
        } catch (e) {
          console.error('계약 viewConfig 파싱 에러:', e);
        }
      }

      if (!props.settlementId || !isInitializing.value) {
        let contractMeltOptions = { annualLeave: false, severance: false, workersDay: false };

        if (targetContract.meltOptions) {
          try {
            contractMeltOptions = typeof targetContract.meltOptions === 'string'
                ? JSON.parse(targetContract.meltOptions)
                : targetContract.meltOptions;
          } catch (e) {
            console.error('계약 meltOptions 파싱 에러:', e);
          }
        }

        Object.assign(meltOptions, {
          annualLeave: contractMeltOptions.annualLeave ?? false,
          severance: contractMeltOptions.severance ?? false,
          workersDay: contractMeltOptions.workersDay ?? false,
        });
      }
    }
  } catch (error) {
    console.error('계약 정보를 불러오는 중 오류 발생:', error);
  }
};

const deductionItems = computed(() => {
  if (!Array.isArray(items.value)) return [];
  let result = items.value.filter(item => item.groupNm === '공제항목' || item.groupCd === '04002');

  if (contractIndirectLabels.value.length > 0) {
    result = result.filter(item => contractIndirectLabels.value.some(label => item.itemCd === label || item.itemNm.includes(label)));
  } else {
    // const defaultKeywords = ['국민연금', '건강보험', '장기요양', '고용보험'];
    const defaultKeywords = ['건강보험', '장기요양', '국민연금', '고용보험'];
    result = result.filter(item => defaultKeywords.some(kw => item.itemNm.includes(kw)));
  }
  return [...new Map(result.map(item => [item.itemCd, item])).values()];
});

watch(deductionItems, (newItems) => {
  if (newItems.length === 0) return;
  if (currentConfig.activeDeductionCodes.length === 0) {
    currentConfig.activeDeductionCodes = newItems.map(i => i.itemCd);
  }
}, { immediate: true });

const visibleDeductionItems = computed(() =>
    deductionItems.value.filter(item => currentConfig.activeDeductionCodes.includes(item.itemCd))
);

// ──────────────────────────────────────────────
// ★ 3-1. 동적 컬럼 매핑 로직 (에러 해결 핵심 구역)
// ──────────────────────────────────────────────
const dynamicColumns = computed(() => {
  const cols = [];
  const payLabels = currentConfig.activePayLabels || [];
  const dedLabels = currentConfig.activeDeductionLabels || currentConfig.activeDeductionCodes || [];

  // 코드(숫자)를 한글 이름으로 변환해주는 헬퍼 함수
  const getCodeName = (code) => {
    // 1. 가장 최우선: 과거 2계층 데이터 호환을 위한 하드코딩 매핑 (DB 이관 이슈 방어)
    const legacyMap = {
      '04001003': '연차적립금',
      '04001004': '퇴직적립금',
      '04002001008': '산재보험',
      '04001002007': '근로자의날수당'
    };
    if (legacyMap[code]) return legacyMap[code];

    // 2. Leaf 노드 (현재 3계층 하위 항목)에서 찾기
    const foundInLeaves = items.value.find(i => i.itemCd === code);
    if (foundInLeaves) return foundInLeaves.itemNm;

    // 3. 전체 항목 (2차 폴더 포함) 원본에서 찾기
    const foundInAll = allWageCodes.value.find(i => i.itemCd === code);
    if (foundInAll) return foundInAll.itemNm;

    // 그래도 없으면 어쩔 수 없이 코드 번호 그대로 반환
    return code;
  };

  // 1) 지급 항목 세팅
  payLabels.forEach(code => {
    cols.push({ type: 'pay', code: code, name: getCodeName(code) });
  });

  // 2) 급여 (지급총액)
  if (currentConfig.showGrossPay) {
    cols.push({ type: 'gross', code: 'grossPay', name: '급여' });
  }

  // 3) 공제 항목 세팅
  dedLabels.forEach(code => {
    const itemName = getCodeName(code);
    cols.push({
      type: 'deduct',
      code: code,
      name: itemName,
      isEmployment: itemName.includes('고용보험') // 고용보험은 칸 2개 차지
    });
  });

  return cols;
});

// ──────────────────────────────────────────────
// 4. 숫자 콤마 전용 입력 핸들러
// ──────────────────────────────────────────────
const handleCurrencyInput = async (e, obj, key, row, calcType) => {
  const input = e.target;
  const cursorPosition = input.selectionStart;
  const oldLength = input.value.length;

  let rawValue = input.value.replace(/,/g, '').replace(/[^0-9\.\-]/g, '');
  const numValue = rawValue === '' || rawValue === '-' ? 0 : Number(rawValue);

  obj[key] = numValue;

  if (calcType === 'salary') onSalaryInput(row);
  else if (calcType === 'row') calculateRow(row);
  else if (calcType === 'billing') calculateBillingTotal();
  else if (calcType === 'area') calculateAreaSupply();
  else if (calcType === 'manual') handleManualBreakdownUpdate();

  await nextTick();
  const newLength = input.value.length;
  const diff = newLength - oldLength;
  let newCursorPos = cursorPosition + diff;
  if (newCursorPos < 0) newCursorPos = 0;
  input.setSelectionRange(newCursorPos, newCursorPos);
};

// ──────────────────────────────────────────────
// 5. 급여 계산 핵심 로직
// ──────────────────────────────────────────────
const applyContractReserves = (row) => {
  const finalize = () => { calculateRow(row); };

  const findContractValue = (keyword, cd, staffCode) => {
    const allLabor = [
      ...contractDirectLabor.value,
      ...contractIndirectLabor.value
    ];

    const target = allLabor.find(d => {
      const label = String(d.label ?? '');
      return (
          label === cd ||
          label === keyword ||
          label.includes(keyword) ||
          label.includes(cd) ||
          cd.includes(label)
      );
    });

    if (!target?.values) return 0;

    if (staffCode != null && target.values[staffCode] != null) {
      return Number(target.values[staffCode]) || 0;
    }

    for (const staff of contractStaffList.value) {
      const val = Number(target.values[staff.code]);
      if (val > 0) return val;
    }

    const firstVal = Object.values(target.values)[0];
    return Number(firstVal) || 0;
  };

  let staffCode = null;
  if (row.position && contractStaffList.value.length) {
    const staffObj = contractStaffList.value.find(
        s => s.name.trim() === row.position.trim()
    );
    if (staffObj) staffCode = staffObj.code;
  }

  if (!staffCode && contractStaffList.value.length === 1) {
    staffCode = contractStaffList.value[0].code;
  }

  row.reserves.annualLeave = findContractValue('연차', '04003001', staffCode);
  row.reserves.severance   = findContractValue('퇴직', '04003003', staffCode);
  row.reserves.workersDay  = findContractValue('근로자', '04001002007', staffCode);

  const sanjaeAmt = findContractValue('산재', '04002001008', staffCode);
  row.reserves.sanjae  = sanjaeAmt;
  row.originalSanjae   = sanjaeAmt;

  finalize();
};

const calculateRow = (row) => {
  let totalDeduct = 0;
  visibleDeductionItems.value.forEach(item => {
    totalDeduct += Number(row.deductionItems?.[item.itemCd]) || 0;
  });
  row.totalDeduct = totalDeduct;
  row.netPay = (Number(row.grossPay) || 0) - totalDeduct;

  if (!row.isCustomEmp) {
    let totalGross = Number(row.grossPay) || 0;
    if (meltOptions.annualLeave) totalGross += Number(row.reserves?.annualLeave) || 0;
    if (meltOptions.severance)   totalGross += Number(row.reserves?.severance)   || 0;
    if (meltOptions.workersDay)   totalGross += Number(row.reserves?.workersDay)   || 0;

    row.reserves.empInsEmployer = totalGross > 0 ? Math.floor((totalGross * 0.0045) / 10) * 10 : 0;
  }
};

const recalculateInsurances = (row) => {
  let baseAmount = Number(row.grossPay) || 0;
  let calcBase = baseAmount;
  if (meltOptions.annualLeave) calcBase += Number(row.reserves.annualLeave) || 0;
  if (meltOptions.severance)   calcBase += Number(row.reserves.severance)   || 0;
  if (meltOptions.workersDay)  calcBase += Number(row.reserves.workersDay)  || 0;

  const rates = insuranceRates.value;

  deductionItems.value.forEach(item => {
    const code = item.itemCd;
    const name = item.itemNm;

    const originalAmt = Number(row.originalDeductions?.[code] ?? row.deductionItems?.[code] ?? 0);
    if (originalAmt === 0) {
      row.deductionItems[code] = 0;
      return;
    }

    let amt = 0;
    if (name.includes('국민연금')) {
      amt = Math.floor((calcBase * (rates.nationalPension / 100)) / 10) * 10;
    } else if (name.includes('장기요양')) {
      const health = Math.floor((calcBase * (rates.healthInsurance / 100)) / 10) * 10;
      amt = Math.floor((health * (rates.longTermCare / 100)) / 10) * 10;
    } else if (name.includes('건강보험')) {
      amt = Math.floor((calcBase * (rates.healthInsurance / 100)) / 10) * 10;
    } else if (name.includes('고용보험')) {
      amt = Math.floor((calcBase * (rates.employmentInsurance / 100)) / 10) * 10;
    } else {
      amt = originalAmt;
    }
    row.deductionItems[code] = amt;
  });

  if ((Number(row.originalSanjae) || 0) > 0) {
    row.reserves.sanjae = Math.floor((calcBase * (rates.industrialAccident / 100)) / 10) * 10;
  }
};

const getInsuranceTotal = (row) => {
  let total = 0;
  dynamicColumns.value.forEach(col => {
    if (col.type === 'deduct') {
      if (col.isEmployment) {
        total += (Number(row.deductionItems?.[col.code]) || 0) + (Number(row.reserves?.empInsEmployer) || 0);
      } else if (col.name.includes('산재')) {
        total += Number(row.reserves?.sanjae) || 0;
      } else {
        total += Number(row.deductionItems?.[col.code]) || 0;
      }
    }
  });
  return total;
};

const onSalaryInput = (row) => {
  if (meltOptions.annualLeave || meltOptions.severance || meltOptions.workersDay) recalculateInsurances(row);
  calculateRow(row);
};

watch(meltOptions, () => {
  if (isInitializing.value) return;
  formData.value.payrollData.forEach(row => {
    recalculateInsurances(row);
    calculateRow(row);
  });
}, { deep: true });

watch(() => currentConfig.activeDeductionCodes, () => { formData.value.payrollData.forEach(row => calculateRow(row)); }, { deep: true });

// ──────────────────────────────────────────────
// 6. 총계 & 부가세 계산
// ──────────────────────────────────────────────
const payrollTotals = computed(() => {
  const totals = {
    grossPay: 0,
    totalDeduct: 0,
    netPay: 0,
    empInsEmployer: 0,
    sanjae: 0,
    insuranceTotal: 0,
    annualLeave: 0,
    severance: 0,
    deductionItems: {}
  };

  formData.value.payrollData.forEach(row => {
    totals.grossPay       += Number(row.grossPay)    || 0;
    totals.totalDeduct    += Number(row.totalDeduct) || 0;
    totals.netPay         += Number(row.netPay)      || 0;
    totals.annualLeave    += Number(row.reserves?.annualLeave)    || 0;
    totals.severance      += Number(row.reserves?.severance)      || 0;

    let rowInsTotal = 0;

    dynamicColumns.value.forEach(col => {
      if (col.type === 'deduct') {
        if (col.isEmployment) {
          const empDeduct = Number(row.deductionItems?.[col.code]) || 0;
          const empReserve = Number(row.reserves?.empInsEmployer) || 0;
          if (!totals.deductionItems[col.code]) totals.deductionItems[col.code] = 0;
          totals.deductionItems[col.code] += empDeduct;
          totals.empInsEmployer += empReserve;
          rowInsTotal += (empDeduct + empReserve);
        } else if (col.name.includes('산재')) {
          const sanjaeAmt = Number(row.reserves?.sanjae) || 0;
          totals.sanjae += sanjaeAmt;
          rowInsTotal += sanjaeAmt;
        } else {
          const dAmount = Number(row.deductionItems?.[col.code]) || 0;
          if (!totals.deductionItems[col.code]) totals.deductionItems[col.code] = 0;
          totals.deductionItems[col.code] += dAmount;
          rowInsTotal += dAmount;
        }
      }
    });
    totals.insuranceTotal += rowInsTotal;
  });
  return totals;
});

const contractAnnualLeaveTotal = computed(() => {
  let target = contractDirectLabor.value.find(d => String(d.label).includes('연차'));
  if (!target && contractIndirectLabor.value) {
    target = contractIndirectLabor.value.find(d => String(d.label).includes('연차'));
  }
  if (!target || !target.values) return 0;

  let total = 0;
  contractStaffList.value.forEach(staff => {
    total += (Number(target.values[staff.code]) || 0) * (Number(staff.count) || 1);
  });
  return total;
});

const contractSeveranceTotal = computed(() => {
  let target = contractDirectLabor.value.find(d => String(d.label).includes('퇴직'));
  if (!target && contractIndirectLabor.value) {
    target = contractIndirectLabor.value.find(d => String(d.label).includes('퇴직'));
  }
  if (!target || !target.values) return 0;

  let total = 0;
  contractStaffList.value.forEach(staff => {
    total += (Number(target.values[staff.code]) || 0) * (Number(staff.count) || 1);
  });
  return total;
});

const estimatedInsuranceTotal = computed(() => {
  let total = 0;
  contractIndirectLabor.value.forEach(item => {
    const isVisible = dynamicColumns.value.some(col =>
        col.type === 'deduct' && (col.code === item.label || col.name === item.label || item.label.includes(col.name))
    );

    if (isVisible && item.values) {
      Object.entries(item.values).forEach(([staffCode, val]) => {
        const staffObj = contractStaffList.value.find(s => s.code === staffCode);
        const headcount = staffObj && staffObj.count ? Number(staffObj.count) : 1;
        total += (Number(val) || 0) * headcount;
      });
    }
  });
  return total;
});

const actualInsuranceTotal = computed(() => {
  let total = 0;
  dynamicColumns.value.forEach(col => {
    if (col.type === 'deduct') {
      if (['국민', '건강', '장기', '고용'].some(kw => col.name.includes(kw))) {
        total += Number(payrollTotals.value.deductionItems[col.code]) || 0;
        if (col.isEmployment) {
          total += Number(payrollTotals.value.empInsEmployer) || 0;
        }
      } else if (col.name.includes('산재')) {
        total += Number(payrollTotals.value.sanjae) || 0;
      }
    }
  });
  return total;
});

watch([estimatedInsuranceTotal, actualInsuranceTotal], ([est, act]) => {
  formData.value.billingData.insuranceDiff = est - act;
}, { immediate: true });

const toggleSummarySign = (key) => {
  if (currentConfig.summarySigns[key] !== undefined) {
    currentConfig.summarySigns[key] *= -1;
  }
};

const totalSummary = computed(() => {
  const monthlyFee  = contractTotalCost.value || 0;
  const severance   = contractSeveranceTotal.value || 0;
  const annualLeave = contractAnnualLeaveTotal.value || 0;
  const estIns      = estimatedInsuranceTotal.value || 0;
  const actIns      = actualInsuranceTotal.value || 0;
  const insDiff     = Number(formData.value.billingData.insuranceDiff) || 0;
  const signs       = currentConfig.summarySigns;

  let customTotal = 0;
  const customItems = (formData.value.billingData.customSummaryItems || []).map((item, idx) => {
    const val = Number(item.amount) || 0;
    const itemSign = item.sign || 1;
    customTotal += (val * itemSign);
    return {
      isCustom: true,
      index: idx,
      key: 'custom_' + idx,
      label: item.label,
      value: val,
      sign: itemSign,
      toggleable: true,
      hiddenInBilling: false
    };
  });

  let grandTotal = monthlyFee
      + (severance * signs.severance)
      + (annualLeave * signs.annualLeave)
      + (insDiff * signs.insuranceDiff)
      + customTotal;

  grandTotal = Math.floor(grandTotal / 10) * 10;

  return [
    { key: 'monthlyFee', label: '월간용역비', value: monthlyFee, sign: 1, toggleable: false, hiddenInBilling: false },
    { key: 'severance', label: '퇴직적립금', value: severance, sign: signs.severance, toggleable: true, hiddenInBilling: false },
    { key: 'annualLeave', label: '연차적립금', value: annualLeave, sign: signs.annualLeave, toggleable: true, hiddenInBilling: false },
    { key: 'estimatedIns', label: '4대보험료 (견적서)', value: estIns, sign: 1, toggleable: false, hiddenInBilling: true },
    { key: 'actualIns', label: '4대보험료 (실비정산)', value: actIns, sign: 1, toggleable: false, hiddenInBilling: true },
    { key: 'insuranceDiff', label: '4대보험차액', value: insDiff, sign: signs.insuranceDiff, toggleable: true, hiddenInBilling: false },
    ...customItems,
    { key: 'grandTotal', label: '당월 청구금액 \n(원 단위 절사)', value: grandTotal, sign: 1, toggleable: false, hiddenInBilling: true }
  ];
});

const syncBillingItems = () => {
  let periodStr = '';
  let monthNum = '';
  const targetDateStr = formData.value.target_month || formData.value.billingDt;

  if (targetDateStr) {
    const parts = targetDateStr.split('-');
    if (parts.length >= 2) {
      const yyyy = parseInt(parts[0], 10);
      const mm = parseInt(parts[1], 10);
      const yearStr = String(yyyy).slice(2);
      const monthStr = String(mm).padStart(2, '0');
      monthNum = String(mm);
      const lastDay = new Date(yyyy, mm, 0).getDate();
      periodStr = `${yearStr}.${monthStr}.01~${monthStr}.${lastDay}`;
    }
  }

  let categoryStr = '';
  if (formData.value.type && typeOptions.value) {
    const matched = typeOptions.value.find(t => t.itemCd === formData.value.type);
    if (matched) categoryStr = matched.itemNm;
  }

  let newItems = [];
  let currentItems = [...formData.value.billingData.items];

  if (currentItems.length === 1 && !currentItems[0].detail && currentItems[0].amount === 0) {
    currentItems = [];
  }

  totalSummary.value.forEach(summaryObj => {
    if (summaryObj.hiddenInBilling) return;

    const signedAmount = summaryObj.value * summaryObj.sign;
    if (summaryObj.key !== 'monthlyFee' && signedAmount === 0) return;

    let existIdx = -1;
    if (summaryObj.key === 'monthlyFee') existIdx = currentItems.findIndex(i => i._syncKey === 'monthlyFee' || i.detail.includes('용역비') || i.detail.includes('도급비'));
    else if (summaryObj.key === 'severance') existIdx = currentItems.findIndex(i => i._syncKey === 'severance' || i.detail.includes('퇴직'));
    else if (summaryObj.key === 'annualLeave') existIdx = currentItems.findIndex(i => i._syncKey === 'annualLeave' || i.detail.includes('연차'));
    else if (summaryObj.key === 'insuranceDiff') existIdx = currentItems.findIndex(i => i._syncKey === 'insuranceDiff' || (i.detail.includes('보험') && i.detail.includes('차액')));
    else if (summaryObj.isCustom) existIdx = currentItems.findIndex(i => i._syncKey === summaryObj.key);

    const defaultDetail = summaryObj.key === 'monthlyFee' ? `${monthNum ? monthNum + '월 ' : ''}${categoryStr}용역비` : (summaryObj.label || '추가 항목');

    if (existIdx > -1) {
      let existing = currentItems.splice(existIdx, 1)[0];
      existing.period = periodStr || existing.period;
      existing.category = categoryStr || existing.category;
      existing.amount = signedAmount;
      if (summaryObj.isCustom) existing.detail = summaryObj.label;
      existing._syncKey = summaryObj.key;
      newItems.push(existing);
    } else {
      newItems.push({
        _syncKey: summaryObj.key,
        period: periodStr,
        category: categoryStr,
        detail: defaultDetail,
        amount: signedAmount,
        note: ''
      });
    }
  });

  newItems = newItems.concat(currentItems);
  formData.value.billingData.items = newItems;
  calculateBillingTotal();
};

watch([
  totalSummary,
  () => formData.value.type,
  () => formData.value.billingDt,
  () => formData.value.target_month
], () => {
  if (isInitializing.value) return;
  if (formData.value.sIdx) {
    syncBillingItems();
  }
}, { deep: true });

const getDynamicTotal = (col) => {
  if (col.type === 'gross') return payrollTotals.value.grossPay;

  let sum = 0;
  formData.value.payrollData.forEach(row => {
    if (col.name.includes('연차')) sum += Number(row.reserves?.annualLeave) || 0;
    else if (col.name.includes('퇴직')) sum += Number(row.reserves?.severance) || 0;
    else if (col.name.includes('근로자의날')) sum += Number(row.reserves?.workersDay) || 0;
    else if (col.name.includes('산재')) sum += Number(row.reserves?.sanjae) || 0;
    else if (col.type === 'pay') sum += Number(row.payments?.[col.code]) || 0;
    else if (col.type === 'deduct') sum += Number(row.deductionItems?.[col.code]) || 0;
  });
  return sum;
};

const colspanForSummary = computed(() => {
  let cols = 6;
  dynamicColumns.value.forEach(col => {
    cols += 1;
    if (col.isEmployment) cols += 1;
  });
  return cols - 2;
});

const calculateAreaSupply = () => {
  const vb = formData.value.billingData.vatBreakdown;
  const totalArea = (Number(vb.under135.area) || 0) + (Number(vb.over135.area) || 0);
  let topSum = formData.value.billingData.items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  topSum = Math.floor(topSum / 10) * 10;

  if (totalArea > 0 && topSum > 0) {
    const unitPrice = topSum / totalArea;
    vb.under135.unitPrice = unitPrice.toFixed(2);
    vb.over135.unitPrice  = unitPrice.toFixed(2);
    const underSupply = Math.round(unitPrice * (Number(vb.under135.area)||0)) - 1;
    vb.under135.supply = underSupply;
    const overSupply = topSum - underSupply;
    vb.over135.supply = overSupply;
    vb.over135.vat = Math.floor(overSupply * 0.1);
    formData.value.subTotal = underSupply + overSupply;
    formData.value.vatAmount = vb.over135.vat;
    formData.value.grandTotal = formData.value.subTotal + vb.over135.vat;
  }
};

const calculateBillingTotal = () => {
  let topSum = formData.value.billingData.items.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  topSum = Math.floor(topSum / 10) * 10;
  if (formData.value.is_vat === 'Y') calculateAreaSupply();
  else {
    formData.value.subTotal = topSum;
    formData.value.vatAmount = 0;
    formData.value.grandTotal = topSum;
  }
};

const handleManualBreakdownUpdate = () => {
  const overVat = Number(formData.value.billingData.vatBreakdown.over135.vat) || 0;
  formData.value.vatAmount = overVat;
  formData.value.grandTotal = formData.value.subTotal + overVat;
};

// ──────────────────────────────────────────────
// 7. 폼 세팅 및 이벤트 핸들러
// ──────────────────────────────────────────────
const initForm = () => {
  if (props.initialData && Object.keys(props.initialData).length > 0) {
    isInitializing.value = true;

    const data = JSON.parse(JSON.stringify(props.initialData));
    if (!data.payrollData) data.payrollData = [];
    if (!data.billingData) data.billingData = { items: [], bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)', insuranceDiff: 0, customSummaryItems: [], memo: '' };
    if (!data.billingData.items) data.billingData.items = [];
    if (!data.billingData.customSummaryItems) data.billingData.customSummaryItems = [];
    if (!data.billingData.memo) data.billingData.memo = '';
    if (!data.billingData.vatBreakdown) data.billingData.vatBreakdown = { under135: { area: '', unitPrice: '', supply: 0 }, over135: { area: '', unitPrice: '', supply: 0, vat: 0 } };
    data.billingData.insuranceDiff = data.billingData.insuranceDiff || 0;

    data.payrollData.forEach(row => {
      row.empName = filterKoreanOnly(row.empName);
      if (!row.deductionItems) row.deductionItems = {};
      row.totalDeduct = row.totalDeduct || 0;
      if (!row.reserves) row.reserves = { annualLeave: 0, severance: 0, empInsEmployer: 0, sanjae: 0 };
      row.reserves.annualLeave = row.reserves.annualLeave || 0;
      row.reserves.severance = row.reserves.severance || 0;
      row.reserves.empInsEmployer = row.reserves.empInsEmployer || 0;
      row.reserves.sanjae = row.reserves.sanjae || 0;

      if (!row.originalDeductions || Object.keys(row.originalDeductions).length === 0) {
        row.originalDeductions = JSON.parse(JSON.stringify(row.deductionItems));
      }
      if (row.originalSanjae === undefined) {
        row.originalSanjae = row.reserves.sanjae;
      }
    });

    const selectedSite = siteOptions.value.find(s => s.idx === data.sIdx);
    data.is_vat = selectedSite ? selectedSite.is_vat : (data.vatAmount > 0 ? 'Y' : 'N');

    if (data.viewConfig) {
      const savedConfig = data.viewConfig.site || data.viewConfig;
      Object.assign(currentConfig, savedConfig);
      if (savedConfig.meltOptions) {
        Object.assign(meltOptions, savedConfig.meltOptions);
      }

      if (currentConfig.showSanjae === undefined) currentConfig.showSanjae = true;
      if (!currentConfig.summarySigns) {
        currentConfig.summarySigns = { severance: -1, annualLeave: -1, estimatedIns: -1, actualIns: -1, insuranceDiff: -1 };
      }
    } else {
      currentConfig.summarySigns = { severance: -1, annualLeave: -1, estimatedIns: -1, actualIns: -1, insuranceDiff: -1 };
      meltOptions.annualLeave = false;
      meltOptions.severance = false;
      meltOptions.workersDay = false;
    }

    delete data.viewConfig;

    if (data.defaultTab) activeTab.value = data.defaultTab;
    formData.value = data;
    formData.value.payrollData.forEach(row => {
      calculateRow(row);
    });

    if (formData.value.sIdx && formData.value.type) fetchContractData();

    nextTick(() => {
      isInitializing.value = false;
    });

  } else {
    formData.value = {
      sIdx: '',
      siteName: '',
      is_vat: 'N',
      type: '',
      target_month: '',
      docNo: '',
      billingDt: '',
      subTotal: 0,
      vatAmount: 0,
      grandTotal: 0,
      billingData: {
        summary: '',
        workerCount: 0,
        bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)',
        items: [{ period: '', category: '', detail: '', amount: 0, note: '' }],
        customSummaryItems: [],
        memo: '',
        vatBreakdown: {
          under135: { area: '', unitPrice: '', supply: 0 },
          over135: { area: '', unitPrice: '', supply: 0, vat: 0 }
        },
        insuranceDiff: 0
      },
      payrollData: []
    };
    currentConfig.summarySigns = {
      severance: -1,
      annualLeave: -1,
      estimatedIns: -1,
      actualIns: -1,
      insuranceDiff: -1
    };
    meltOptions.annualLeave = false;
    meltOptions.severance = false;
    meltOptions.workersDay = false;
  }
};

watch(() => props.initialData, initForm, { immediate: true });

const resetAll = () => {
  if (!confirm('청구 공문과 급여 내역 전체를 초기화하시겠습니까?\n현장/구분/날짜 선택값은 유지됩니다.')) return;

  isInitializing.value = true;

  const { sIdx, type, target_month, billingDt } = formData.value;

  formData.value = {
    sIdx,
    siteName: '',
    is_vat: 'N',
    type, target_month, billingDt,
    docNo: '',
    subTotal: 0, vatAmount: 0, grandTotal: 0,
    billingData: {
      summary: '',
      workerCount: 0,
      bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)',
      items: [{ period: '', category: '', detail: '', amount: 0, note: '' }],
      customSummaryItems: [],
      memo: '',
      vatBreakdown: {
        under135: { area: '', unitPrice: '', supply: 0 },
        over135:  { area: '', unitPrice: '', supply: 0, vat: 0 }
      },
      insuranceDiff: 0
    },
    payrollData: [],
  };

  meltOptions.annualLeave = false;
  meltOptions.severance   = false;
  meltOptions.workersDay   = false;
  currentConfig.showGrossPay    = true;
  currentConfig.showAnnualLeave = true;
  currentConfig.showSeverance   = true;
  currentConfig.showWorkersDay  = true;
  currentConfig.showSanjae      = true;
  currentConfig.summarySigns    = { severance: -1, annualLeave: -1, estimatedIns: -1, actualIns: -1, insuranceDiff: -1 };
  if (deductionItems.value.length > 0) {
    currentConfig.activeDeductionCodes = deductionItems.value.map(i => i.itemCd);
  }

  updateDocNo();
  if (sIdx) {
    handleSiteChange();
  }

  setTimeout(() => {
    isInitializing.value = false;
  }, 100);
};

const loadPayrollData = async () => {
  if (!formData.value.sIdx) { alert('현장을 먼저 선택해주세요.'); return; }
  if (
      formData.value.payrollData.length > 0
      && !confirm('기존에 입력된 데이터가 모두 초기화됩니다. 정말 불러오시겠습니까?')) return;

  try {
    const targetDate = formData.value.target_month || formData.value.billingDt || '';
    const [year, month] = targetDate.split('-');

    await fetchTaxRates();
    await fetchContractData();
    await nextTick();

    const validItemCds = [
      ...contractDirectLabor.value.map(d => String(d.code)),
      ...contractIndirectLabor.value.map(i => String(i.code))
    ];

    const res = await axios.get('/api/v1/member/payroll', { params: { year, month } });
    const rawData = res.data?.data || [];

    const periodStart = new Date(Number(year), Number(month) - 1, 1);
    const periodEnd   = new Date(Number(year), Number(month), 0);

    const result = rawData.filter(item => {
      if (item.type != formData.value.type) return false;
      if (item.sIdx != formData.value.sIdx) return false;
      const inDate  = item.inDate  ? new Date(item.inDate)  : null;
      const outDate = item.outDate ? new Date(item.outDate) : null;
      if (inDate  && inDate  > periodEnd)   return false;
      if (outDate && outDate < periodStart) return false;
      return true;
    });

    const safeParse = (val) => {
      if (!val) return {};
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return {}; }
    };

    const reserveCodes = ['04003001', '04003003', '04001002007', '04002001008'];

    formData.value.payrollData = result.map(item => {
      const parsedPayItems   = safeParse(item.payItems);
      const parsedDeductions = safeParse(item.deductionItems);

      const filteredPayItems = {};
      let recalculatedGrossPay = 0;

      Object.entries(parsedPayItems).forEach(([cd, amt]) => {
        if (reserveCodes.includes(cd)) return;
        if (validItemCds.includes(cd)) {
          console.log(cd)
          filteredPayItems[cd] = Number(amt) || 0;
          recalculatedGrossPay += Number(amt) || 0;
        }
      });

      const rowObj = {
        idx: item.idx,
        empName: filterKoreanOnly(item.staff),
        position: item.role || '',
        personalNo: item.birthDt,
        inDate: item.inDate,
        outDate: item.outDate ?? '',
        grossPay: recalculatedGrossPay,
        payItems: filteredPayItems,
        deductionItems: parsedDeductions,
        originalDeductions: JSON.parse(JSON.stringify(parsedDeductions)),
        originalSanjae: 0,
        totalDeduct: 0,
        reserves: { annualLeave: 0, severance: 0, empInsEmployer: 0, sanjae: 0 },
        netPay: 0,
      };

      applyContractReserves(rowObj);
      recalculateInsurances(rowObj);
      calculateRow(rowObj);

      return rowObj;
    });

    if (formData.value.payrollData.length === 0) alert('조건에 맞는 직원 데이터가 없습니다.');
    else alert('직원 급여 데이터를 성공적으로 불러왔습니다.');

  } catch (error) {
    console.error('데이터 로드 에러:', error);
    alert('데이터를 불러오는 중 오류가 발생했습니다.');
  }
};

const updateDocNo = () => {
  if (isInitializing.value) return;

  const targetDate = formData.value.target_month || formData.value.billingDt;
  if (targetDate) {
    const [year, month] = targetDate.split('-');

    if (formData.value.sIdx) {
      formData.value.docNo = `에코그린 ${year}-${month.padStart(2, '0')}-${formData.value.sIdx}호`;
    }

    if (formData.value.type) {
      const typeName = typeOptions.value.find(t => t.itemCd === formData.value.type)?.itemNm || '';
      formData.value.billingData.summary = `${year}년 ${parseInt(month)}월 ${typeName}용역비 청구의 건`;
    }
  }
};
watch(() => formData.value.sIdx, updateDocNo);
watch(() => formData.value.target_month, updateDocNo);
watch(() => formData.value.billingDt, updateDocNo);
watch(() => formData.value.type, (newType) => {
  if (newType && formData.value.sIdx) {
    fetchContractData().then(() => {
      if (formData.value.payrollData.length > 0) {
        nextTick(() => {
          formData.value.payrollData.forEach(row => {
            applyContractReserves(row);
            recalculateInsurances(row);
          });
        });
      }
    });
  }
});

const handleSiteChange = () => {
  const selectedSite = siteOptions.value.find(s => s.idx === formData.value.sIdx);
  if (selectedSite) {
    formData.value.siteName = selectedSite.name;
    formData.value.is_vat   = selectedSite.is_vat || 'N';
    const vb = formData.value.billingData.vatBreakdown;
    const dbAreaUnder = Number(selectedSite.areaUnder || selectedSite.area_under) || 0;
    const dbAreaOver  = Number(selectedSite.areaOver || selectedSite.area_over) || 0;
    const dbAreaTotal = Number(selectedSite.areaUnder) + Number(selectedSite.areaOver) || 0;

    if (formData.value.is_vat === 'Y') {
      if (dbAreaUnder > 0 || dbAreaOver > 0) { vb.under135.area = dbAreaUnder; vb.over135.area = dbAreaOver; }
      else { vb.under135.area = 0; vb.over135.area = dbAreaTotal; }
    } else { vb.under135.area = dbAreaUnder > 0 ? dbAreaUnder : dbAreaTotal; vb.over135.area = 0; }
    calculateAreaSupply();
  } else { formData.value.siteName = ''; formData.value.is_vat = 'N'; }
  calculateBillingTotal();
  fetchContractData();
};

const addBillingRow = () => formData.value.billingData.items.push({ period: '', category: '', detail: '', amount: 0, note: '' });
const removeBillingRow = (i) => { formData.value.billingData.items.splice(i, 1); calculateBillingTotal(); };
const addPayrollRow = () => formData.value.payrollData.push({ empName: '', position: '', personalNo: '', inDate: '', outDate: '', grossPay: 0, deductionItems: {}, originalDeductions: {}, originalSanjae: 0, totalDeduct: 0, reserves: { annualLeave: 0, severance: 0, empInsEmployer: 0, sanjae: 0 }, netPay: 0 });
const removePayrollRow = (i) => { if (confirm('삭제하시겠습니까?')) formData.value.payrollData.splice(i, 1); };

const onDragStart = (index) => { dragIndex.value = index; };
const onDragEnd   = ()        => { dragIndex.value = null; };
const onDragOver  = (e, index) => {
  e.preventDefault();
  if (dragIndex.value === null || dragIndex.value === index) return;
  const list = formData.value.payrollData;
  const dragged = list.splice(dragIndex.value, 1)[0];
  list.splice(index, 0, dragged);
  dragIndex.value = index;
};

// ──────────────────────────────────────────────
// 8. 엑셀 저장 및 데이터 저장
// ──────────────────────────────────────────────
const exportToExcel = async () => {
  try {
    const response = await fetch('/정산기본양식.xlsx');
    const arrayBuffer = await response.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);

    const sheet = workbook.getWorksheet(1);

    sheet.pageSetup = {
      paperSize: 9,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    };

    sheet.rowBreaks = [{ id: 44, min: 0, max: 16383, man: true }];

    const targetDateStr = formData.value.target_month || formData.value.billingDt;
    let periodStr = '';
    let yearStrFull = new Date().getFullYear().toString();
    let monthNum = new Date().getMonth() + 1;

    if (targetDateStr) {
      const parts = targetDateStr.split('-');
      if (parts.length >= 2) {
        const yyyy = parseInt(parts[0], 10);
        const mm = parseInt(parts[1], 10);
        yearStrFull = String(yyyy);
        monthNum = mm;

        const yearStr = String(yyyy).slice(2);
        const monthStr = String(mm).padStart(2, '0');
        const lastDay = new Date(yyyy, mm, 0).getDate();
        periodStr = `${yearStr}.${monthStr}.01~${monthStr}.${lastDay}`;
      }
    }

    let categoryName = '용역';
    if (typeOptions && typeOptions.value) {
      const matched = typeOptions.value.find(t => t.itemCd === formData.value.type);
      if (matched) categoryName = matched.itemNm;
    }

    sheet.getCell('A5').value = ` 문서번호 : ${formData.value.docNo || ''}`;
    sheet.getCell('A6').value = ` 시행일자 : ${formData.value.billingDt || ''}`;
    sheet.getCell('A7').value = ` 수    신 : ${formData.value.siteName || ''} 관리사무소`;
    sheet.getCell('A8').value = ` 제    목 : ${formData.value.billingData.summary || ''}`;
    sheet.getCell('A8').alignment = { wrapText: true, vertical: 'middle' };

    const billingItems = formData.value.billingData.items || [];
    const fixedRows = [16, 17, 18, 19, 20];

    fixedRows.forEach((rowNum, idx) => {
      if (rowNum <= 19 && periodStr) {
        sheet.getCell(`B${rowNum}`).value = periodStr;
      }
      if (billingItems[idx] !== undefined) {
        sheet.getCell(`J${rowNum}`).value  = Number(billingItems[idx].amount) || 0;
        sheet.getCell(`J${rowNum}`).numFmt = '#,##0';
      }
    });

    sheet.getCell('B27').value = `2) 입금계좌 : ${formData.value.billingData.bankInfo || ''}`;

    const payrollData = formData.value.payrollData || [];

    sheet.getCell('A47').value = `■ ${yearStrFull}년 ${monthNum}월 ${categoryName} 정산내역서`;

    const workerCount = payrollData.length;
    sheet.getCell('N49').value = `${formData.value.siteName || '현장 미지정'} - ${workerCount}명`;

    sheet.getColumn(8).hidden  = !currentConfig.showAnnualLeave;
    sheet.getColumn(9).hidden  = !currentConfig.showSeverance;
    sheet.getColumn(10).hidden  = !currentConfig.showWorkersDay;
    const activeCodes = currentConfig.activeDeductionCodes;
    sheet.getColumn(11).hidden = !activeCodes.includes('04002003');
    sheet.getColumn(12).hidden = !activeCodes.includes('04002001');
    sheet.getColumn(13).hidden = !activeCodes.includes('04002002');
    sheet.getColumn(14).hidden = !activeCodes.includes('04002004');
    sheet.getColumn(15).hidden = !activeCodes.includes('04002004');
    sheet.getColumn(16).hidden = !currentConfig.showSanjae;

    const maxRows = 10;

    for (let idx = 0; idx < maxRows; idx++) {
      const rowNum = 51 + idx;
      const data   = payrollData[idx];

      if (!data) continue;

      const row = sheet.getRow(rowNum);
      row.getCell(2).value  = idx + 1;
      row.getCell(3).value  = data.empName    || '';
      row.getCell(4).value  = data.position   || '';
      row.getCell(5).value  = data.personalNo || '';
      row.getCell(6).value  = data.inDate     || '';
      row.getCell(7).value  = data.outDate    || '';
      row.getCell(8).value  = Number(data.reserves?.annualLeave)        || 0;
      row.getCell(9).value  = Number(data.reserves?.severance)          || 0;
      row.getCell(9).value  = Number(data.reserves?.workersDay)          || 0;
      row.getCell(10).value = Number(data.deductionItems?.['04002003']) || 0;
      row.getCell(11).value = Number(data.deductionItems?.['04002001']) || 0;
      row.getCell(12).value = Number(data.deductionItems?.['04002002']) || 0;
      row.getCell(13).value = Number(data.deductionItems?.['04002004']) || 0;
      row.getCell(14).value = Number(data.reserves?.empInsEmployer)     || 0;
      row.getCell(15).value = Number(data.reserves?.sanjae)             || 0;
      row.getCell(16).value = Number(getInsuranceTotal(data))            || 0;
      for (let c = 8; c <= 16; c++) row.getCell(c).numFmt = '#,##0';
    }

    const summaryRowMap = {
      'monthlyFee':   62,
      'annualLeave':  63,
      'severance':    64,
      'estimatedIns': 65,
      'actualIns':    66,
      'insuranceDiff':67,
      'grandTotal':   69,
    };

    totalSummary.value.forEach((summary) => {
      const rowNum = summaryRowMap[summary.key];
      if (!rowNum) return;
      const signedValue = summary.sign < 0 ? -Math.abs(summary.value) : Math.abs(summary.value);
      sheet.getCell(`O${rowNum}`).value  = Number(signedValue) || 0;
      sheet.getCell(`O${rowNum}`).numFmt = '#,##0';
    });

    const customTotal = (formData.value.billingData.customSummaryItems || [])
        .reduce((sum, item) => sum + (Number(item.amount) || 0) * (item.sign || 1), 0);
    if (customTotal !== 0) {
      sheet.getCell('O68').value  = customTotal;
      sheet.getCell('O68').numFmt = '#,##0';
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `정산서_${formData.value.siteName || '현장'}_${formData.value.target_month || ''}.xlsx`;
    saveAs(new Blob([buffer]), fileName);

  } catch (error) {
    console.error('엑셀 저장 중 오류 발생:', error);
    alert('엑셀 파일을 생성하는 중 오류가 발생했습니다.');
  }
};

const handleSave = async () => {
  try {
    const sIdx = formData.value.sIdx;
    if (!sIdx) { alert('현장을 선택해주세요.'); return; }
    const [year, month] = (formData.value.target_month || formData.value.billingDt).split('-');
    if(!year || !month) { alert('날짜를 선택해주세요.'); return; }

    const payload = {
      idx:         props.settlementId,
      year:        parseInt(year)  || 0,
      month:       parseInt(month) || 0,
      type:        formData.value.type,
      docNo:       formData.value.docNo,
      billingDt:   formData.value.billingDt,
      subTotal:    formData.value.subTotal,
      vatAmount:   formData.value.vatAmount,
      grandTotal:  formData.value.grandTotal,
      billingData: formData.value.billingData,
      payrollData: formData.value.payrollData,
      viewConfig:  JSON.parse(JSON.stringify({
        ...currentConfig,
        meltOptions: meltOptions
      })),
      cIdx:        authStore.user?.cIdx || 0,
    };

    const response = await axios.post(`/api/v1/settle/site/data/${sIdx}`, payload);
    if (response.data.result) { alert('성공적으로 저장되었습니다.'); emit('save'); }
    else { alert(`저장 실패: ${response.data.msg}`); }
  } catch (error) { console.error('정산서 저장 중 오류 발생:', error); alert('서버 통신 중 오류가 발생했습니다.'); }
};

const closeModal = () => emit('close');

onMounted(async () => {
  await Promise.all([
    fetchSiteOptions(),
    fetchTypeOptions()
  ]);
  await getWageCode();
  await fetchTaxRates();
});
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @mousedown.self="closeModal">
    <div class="modal-container">

      <div class="modal-header">
        <div class="header-title">
          <h2>{{ settlementId ? '정산 내역 수정' : '새 정산서 작성' }}</h2>
          <span class="badge">{{ formData.siteName || '현장 미지정' }} ({{ formData.target_month || '연월 미지정' }})</span>
        </div>
        <div class="header-actions">
          <button class="btn-refresh" @click="resetAll">
            <i class="mdi mdi-refresh"></i>
            <span class="btn-text">초기화</span>
          </button>
          <button class="btn-excel" @click="exportToExcel"><i class="mdi mdi-microsoft-excel"></i><span class="btn-text">엑셀 저장</span></button>
          <button class="btn-save" @click="handleSave"><i class="mdi mdi-content-save"></i><span class="btn-text">저장하기</span></button>
          <button class="btn-close" @click="closeModal"><i class="mdi mdi-close"></i></button>
        </div>
      </div>

      <div class="modal-tabs">
        <button :class="['tab-btn', { active: activeTab === 'statement' }]" @click="activeTab = 'statement'">
          <i class="mdi mdi-file-document-outline"></i> <span class="tab-text">청구 공문 (표지)</span>
        </button>
        <button :class="['tab-btn', { active: activeTab === 'details' }]" @click="activeTab = 'details'">
          <i class="mdi mdi-table-account"></i> <span class="tab-text">급여 세부 내역서</span>
        </button>
      </div>

      <div class="modal-body">

        <div v-show="activeTab === 'statement'" class="tab-content">
          <div class="document-paper">
            <div class="doc-header text-center"><h1>청 구 공 문</h1></div>

            <div class="form-grid">
              <div class="form-group">
                <label>현장 선택 <span class="text-red">*</span></label>
                <!--select v-model="formData.sIdx" @change="handleSiteChange" class="form-select">
                  <option value="" disabled>현장을 선택해주세요</option>
                  <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
                </select-->
                <SiteSelect v-model="formData.sIdx" @change="handleSiteChange" :width="'100%'"></SiteSelect>
              </div>
              <div class="form-group">
                <label>구분 선택 <span class="text-red">*</span></label>
                <select v-model="formData.type" class="form-select">
                  <option value="" disabled>구분을 선택해주세요</option>
                  <option v-for="tp in typeOptions" :key="tp.itemCd" :value="tp.itemCd">{{ tp.itemNm }}</option>
                </select>
              </div>
              <div class="form-group">
                <label>수신</label>
                <input type="text" :value="formData.siteName ? formData.siteName + ' 관리사무소' : ''" readonly class="bg-gray form-input" placeholder="현장을 선택하면 자동 입력됩니다" />
              </div>
              <div class="form-group">
                <label>문서번호</label>
                <input type="text" v-model="formData.docNo" class="form-input" placeholder="예: 에코그린 2026-01-09호" />
              </div>
              <div class="form-group">
                <label>시행일자</label>
                <input type="date" v-model="formData.billingDt" class="form-input" />
              </div>
              <div class="form-group">
                <label>제목</label>
                <input type="text" v-model="formData.billingData.summary" placeholder="예: 2026년 1월 미화용역비 청구의 건" class="form-input" />
              </div>
            </div>

            <div class="doc-message">
              <p>1. 귀 소의 무궁한 발전을 기원합니다.</p>
              <p>2. 당월 용역비를 아래와 같이 청구하오니 검토하시여 결재를 부탁드립니다.</p>
              <p class="text-center mt-4">- 아 래 -</p>
            </div>

            <div class="table-actions mt-4">
              <h4>
                <i class="mdi mdi-format-list-checks"></i> 청구 내역
                <span v-if="formData.is_vat === 'N'" class="vat-badge vat-free">(면세 사업장)</span>
                <span v-else class="vat-badge vat-taxed">(과세 사업장)</span>
              </h4>
              <button class="btn-add-row" @click="addBillingRow"><i class="mdi mdi-plus-thick"></i><span class="btn-text">항목 추가</span></button>
            </div>

            <div class="table-scroll-wrapper">
              <table class="excel-table statement-table">
                <thead>
                <tr>
                  <th style="width:100px;">산정기간</th> <th style="width:70px;">구분</th> <th>내역</th> <th style="width:90px;">산출금액</th> <th style="width:90px;">비고</th> <th style="width:34px;"></th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(item, index) in formData.billingData.items" :key="'bill-'+index">
                  <td><input type="text" v-model="item.period"   class="cell-input text-center" placeholder="26.01.01~01.31" /></td>
                  <td><input type="text" v-model="item.category" class="cell-input text-center" placeholder="미화, 경비" /></td>
                  <td><input type="text" v-model="item.detail"   class="cell-input" placeholder="1월 미화용역비" /></td>
                  <td>
                    <input type="text"
                           :value="formatCurrency(item.amount)"
                           @focus="$event.target.select()"
                           @input="handleCurrencyInput($event, item, 'amount', null, 'billing')"
                           class="cell-input text-right font-bold text-blue" />
                  </td>
                  <td><input type="text" v-model="item.note"     class="cell-input" placeholder="비고 입력" /></td>
                  <td class="text-center"><button class="btn-delete-row" @click="removeBillingRow(index)"><i class="mdi mdi-minus"></i></button></td>
                </tr>
                </tbody>
                <tfoot>
                <tr class="bg-blue-light font-bold" style="font-size:15px;">
                  <td colspan="3" class="text-center">합계</td>
                  <td class="text-right text-blue">
                    <input type="text" class="cell-input font-bold text-right text-blue" :value="formatCurrency(formData.subTotal)" />
                  </td>
                  <td colspan="2">
                    <input type="text" class="cell-input" value="원 단위 절사" />
                  </td>
                </tr>
                </tfoot>
              </table>
            </div>

            <div v-if="formData.is_vat === 'Y'" class="vat-breakdown-wrapper mt-5">
              <h4><i class="mdi mdi-domain"></i> 과세/면세 관리면적별 산출내역</h4>
              <div class="table-scroll-wrapper">
                <table class="excel-table statement-table mt-2">
                  <thead>
                  <tr>
                    <th style="min-width:110px;">구분</th>
                    <th style="min-width:100px;">관리면적(㎡)</th>
                    <th style="min-width:90px;">단가(원)</th>
                    <th style="min-width:110px;">공급가액(원)</th>
                    <th style="min-width:100px;">부가세(원)</th>
                    <th style="min-width:110px;">합계금액(원)</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr>
                    <td class="text-center font-bold bg-gray-50">135㎡ 이하 (면세)</td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.under135.area)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.under135, 'area', null, 'area')" class="cell-input text-right" /></td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.under135.unitPrice)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.under135, 'unitPrice', null, 'area')" class="cell-input text-right" /></td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.under135.supply)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.under135, 'supply', null, 'billing')" class="cell-input text-right font-bold text-blue" /></td>
                    <td class="text-right bg-gray-50 text-gray-400">0</td>
                    <td class="text-right font-bold text-blue bg-blue-light">{{ formatCurrency(formData.billingData.vatBreakdown.under135.supply) }}</td>
                  </tr>
                  <tr>
                    <td class="text-center font-bold bg-gray-50">135㎡ 초과 (과세)</td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.over135.area)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'area', null, 'area')" class="cell-input text-right" /></td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.over135.unitPrice)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'unitPrice', null, 'area')" class="cell-input text-right" /></td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.over135.supply)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'supply', null, 'manual')" class="cell-input text-right font-bold text-blue" /></td>
                    <td><input type="text" :value="formatCurrency(formData.billingData.vatBreakdown.over135.vat)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.vatBreakdown.over135, 'vat', null, 'manual')" class="cell-input text-right font-bold text-red" /></td>
                    <td class="text-right font-bold text-blue bg-blue-light">{{ formatCurrency(Number(formData.billingData.vatBreakdown.over135.supply) + Number(formData.billingData.vatBreakdown.over135.vat)) }}</td>
                  </tr>
                  </tbody>
                  <tfoot>
                  <tr class="bg-gray-50 font-bold" style="font-size:14px;">
                    <td class="text-center">총 계</td>
                    <td class="text-right">
                      {{
                        formatCurrency(
                            Number(formData.billingData.vatBreakdown.under135.area) +
                            Number(formData.billingData.vatBreakdown.over135.area)
                        )
                      }}</td>
                    <td class="text-center">-</td>
                    <td class="text-right text-blue">{{ formatCurrency(formData.subTotal) }}</td>
                    <td class="text-right text-red">{{ formatCurrency(formData.vatAmount) }}</td>
                    <td class="text-right text-blue bg-blue-light">{{ formatCurrency(formData.grandTotal) }}</td>
                  </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div class="bank-info mt-5">
              <label>3. 입금계좌 : </label>
              <input type="text" v-model="formData.billingData.bankInfo" class="bank-input" />
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'details'" class="tab-content">
          <div class="table-actions">
            <h4><i class="mdi mdi-table-account"></i> 직원별 정산 내역</h4>

            <div class="action-btns" style="align-items: center;">
              <div class="melt-toggles-group">
                <span class="melt-title"><i class="mdi mdi-calculator-variant"></i> 공제 계산 시 포함:</span>
                <label class="melt-toggle">
                  <span class="melt-label">연차수당</span>
                  <div class="switch">
                    <input type="checkbox" v-model="meltOptions.annualLeave">
                    <span class="slider round"></span>
                  </div>
                </label>
                <label class="melt-toggle">
                  <span class="melt-label">퇴직충당금</span>
                  <div class="switch">
                    <input type="checkbox" v-model="meltOptions.severance">
                    <span class="slider round"></span>
                  </div>
                </label>
                <label class="melt-toggle">
                  <span class="melt-label">근로자의날 수당</span>
                  <div class="switch">
                    <input type="checkbox" v-model="meltOptions.workersDay">
                    <span class="slider round"></span>
                  </div>
                </label>
              </div>

              <button class="btn-load-data" @click="loadPayrollData">
                <i class="mdi mdi-download-box-outline"></i>
                <span class="btn-text">데이터 불러오기</span>
              </button>
              <button class="btn-add-row" @click="addPayrollRow"><i class="mdi mdi-plus-thick"></i> <span class="btn-text">직원 추가</span></button>
            </div>
          </div>

          <div class="excel-table-wrapper">
            <table class="excel-table">
              <thead>
              <tr>
                <th rowspan="2" style="width:40px; min-width:40px;">NO</th>
                <th rowspan="2" style="width:70px; min-width:70px;">이름</th>
                <th rowspan="2" style="width:70px; min-width:70px;">직책</th>
                <th rowspan="2" style="width:80px; min-width:80px;">생년월일</th>
                <th rowspan="2" style="width:80px; min-width:80px;">입사일</th>
                <th rowspan="2" style="width:80px; min-width:80px;">퇴사일</th>

                <template v-for="col in dynamicColumns" :key="'th1-'+col.code">
                  <th v-if="col.isEmployment" colspan="2" class="bg-red-light" style="min-width:200px;">
                    고용보험({{ insuranceRates.employmentInsurance }}%)
                  </th>
                  <th v-else rowspan="2" :class="col.type === 'pay' ? 'bg-yellow-light' : (col.type === 'gross' ? 'bg-blue-light' : 'bg-red-light')" style="min-width:100px;">
                    {{ col.name }}
                  </th>
                </template>

                <th rowspan="2" class="bg-red-light" style="min-width:120px;">총계</th>
                <th rowspan="2" style="width:20px;min-width:20px;">관리</th>
              </tr>

              <tr>
                <template v-for="col in dynamicColumns" :key="'th2-'+col.code">
                  <template v-if="col.isEmployment">
                    <th class="bg-red-light" style="min-width:100px; font-size:11px;">실업급여<br>{{ insuranceRates.employmentInsurance }}%</th>
                    <th class="bg-red-light" style="min-width:100px; font-size:11px;">고용안정 등<br>0.45%</th>
                  </template>
                </template>
              </tr>
              </thead>

              <tbody>
              <tr
                  v-for="(row, index) in formData.payrollData" :key="'pay-'+index"
                  draggable="true" @dragstart="onDragStart(index)" @dragover="onDragOver($event, index)" @dragend="onDragEnd"
                  :class="{ dragging: dragIndex === index }"
              >
                <td class="text-center drag-handle"><i class="mdi mdi-drag-vertical drag-icon"></i> <span>{{ index + 1 }}</span></td>
                <td><input type="text" v-model="row.empName"    class="cell-input text-center" /></td>
                <td><input type="text" v-model="row.position" @input="applyContractReserves(row)" class="cell-input text-center" /></td>
                <td><input type="text" v-model="row.personalNo" class="cell-input text-center" /></td>
                <td><input type="text" v-model="row.inDate"     class="cell-input text-center" /></td>
                <td><input type="text" v-model="row.outDate"    class="cell-input text-center" /></td>

                <template v-for="col in dynamicColumns" :key="'td-'+col.code">
                  <td v-if="col.type === 'pay'">
                    <input v-if="col.name.includes('연차')" type="text" :value="formatCurrency(row.reserves.annualLeave)" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.reserves, 'annualLeave', row, 'salary')" class="cell-input text-right" />
                    <input v-else-if="col.name.includes('퇴직')" type="text" :value="formatCurrency(row.reserves.severance)" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.reserves, 'severance', row, 'salary')" class="cell-input text-right" />
                    <input v-else-if="col.name.includes('근로자의날')" type="text" :value="formatCurrency(row.reserves.workersDay)" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.reserves, 'workersDay', row, 'salary')" class="cell-input text-right" />
                    <input v-else type="text" :value="formatCurrency(row.payments?.[col.code])" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.payments, col.code, row, 'salary')" class="cell-input text-right" />
                  </td>

                  <td v-else-if="col.type === 'gross'">
                    <input type="text" :value="formatCurrency(row.grossPay)" @focus="$event.target.select()" @input="handleCurrencyInput($event, row, 'grossPay', row, 'salary')" class="cell-input text-right font-bold text-blue" />
                  </td>

                  <template v-else-if="col.type === 'deduct'">
                    <template v-if="col.isEmployment">
                      <td><input type="text" :value="formatCurrency(row.deductionItems[col.code])" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.deductionItems, col.code, row, 'row')" class="cell-input text-right" /></td>
                      <td><input type="text" :value="formatCurrency(row.reserves.empInsEmployer)" @focus="$event.target.select()" @input="row.isCustomEmp = true; handleCurrencyInput($event, row.reserves, 'empInsEmployer', row, 'row')" class="cell-input text-right" /></td>
                    </template>
                    <td v-else-if="col.name.includes('산재')">
                      <input type="text" :value="formatCurrency(row.reserves.sanjae)" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.reserves, 'sanjae', row, 'row')" class="cell-input text-right" />
                    </td>
                    <td v-else>
                      <input type="text" :value="formatCurrency(row.deductionItems[col.code])" @focus="$event.target.select()" @input="handleCurrencyInput($event, row.deductionItems, col.code, row, 'row')" class="cell-input text-right" />
                    </td>
                  </template>
                </template>

                <td class="text-right font-bold bg-gray-50">{{ formatCurrency(getInsuranceTotal(row)) }}</td>
                <td class="text-center"><button class="btn-delete-row" @click="removePayrollRow(index)"><i class="mdi mdi-trash-can-outline"></i></button></td>
              </tr>

              <tr v-if="formData.payrollData.length === 0">
                <td :colspan="7 + dynamicColumns.length" class="empty-row">등록된 데이터가 없습니다.</td>
              </tr>
              </tbody>

              <tfoot v-if="formData.payrollData.length > 0">
              <tr class="bg-gray-50 font-bold" style="font-size:14px;">
                <td colspan="6" class="text-center">총 계</td>

                <template v-for="col in dynamicColumns" :key="'foot-'+col.code">
                  <template v-if="col.isEmployment">
                    <td class="text-right">{{ formatCurrency(getDynamicTotal(col)) }}</td>
                    <td class="text-right">{{ formatCurrency(payrollTotals.empInsEmployer) }}</td>
                  </template>
                  <td v-else :class="['text-right', col.type === 'pay' ? 'bg-yellow-light text-yellow-700' : (col.type === 'gross' ? 'bg-blue-light text-blue' : '')]" style="color: inherit;">
                    {{ formatCurrency(getDynamicTotal(col)) }}
                  </td>
                </template>

                <td class="text-right text-red bg-red-light">{{ formatCurrency(payrollTotals.insuranceTotal) }}</td>
                <td></td>
              </tr>
              </tfoot>
            </table>
          </div> <div v-if="formData.payrollData.length > 0" class="bottom-flex-layout">
          <div class="memo-area">
            <div class="memo-wrapper">
              <div class="memo-header">
                <i class="mdi mdi-note-edit-outline"></i>
                <span>정산 특이사항 및 메모</span>
              </div>
              <RichTextEditor v-model="formData.billingData.memo" />
            </div>
          </div>

          <div class="summary-area">
            <table class="excel-table" style="background: var(--bg-surface)">
              <tbody>
              <template v-for="(summary, sIdx) in totalSummary" :key="'summary-'+summary.key">
                <tr v-if="summary.key === 'grandTotal'">
                  <td colspan="2" class="text-right" style="border: none; background: transparent; padding: 6px 0;">
                    <button @click="addCustomSummaryItem" class="btn-add-row" style="font-size: 12px; padding: 4px 10px; display: inline-flex; float: right;">
                      <i class="mdi mdi-plus-thick"></i> 정산 항목 추가
                    </button>
                  </td>
                </tr>

                <tr>
                  <td class="text-center bg-gray-50 font-bold"
                      :class="{'summary-label-cell': summary.toggleable && !summary.isCustom}"
                      @click="summary.toggleable && !summary.isCustom && toggleSummarySign(summary.key)"
                      style="font-size: 13px;white-space: pre-line;"
                      :title="summary.toggleable && !summary.isCustom ? '클릭하여 양수/음수 전환' : ''">
                    <div style="display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: 100%;">
                      <template v-if="summary.isCustom">
                        <button @click.stop="toggleCustomSign(summary.index)" class="sign-badge" :class="summary.sign < 0 ? 'bg-red-badge' : 'bg-blue-badge'" style="border: none; cursor: pointer; flex-shrink: 0;">
                          {{ summary.sign < 0 ? '-' : '+' }}
                        </button>
                        <input type="text" v-model="formData.billingData.customSummaryItems[summary.index].label" placeholder="항목명 입력" class="cell-input text-center font-bold" style="width: 100%; padding: 6px; box-sizing: border-box;" />
                      </template>
                      <template v-else>
                            <span v-if="summary.toggleable" class="sign-badge" :class="summary.sign < 0 ? 'bg-red-badge' : 'bg-blue-badge'">
                              {{ summary.sign < 0 ? '-' : '+' }}
                            </span>
                        {{ summary.label }}
                      </template>
                    </div>
                  </td>

                  <td class="text-right font-bold" :class="summary.key === 'grandTotal' ? 'text-blue bg-blue-light' : 'bg-white'" style="padding: 0; border: 1px solid var(--border-color); position: relative;">
                    <button v-if="summary.isCustom" @click="removeCustomSummaryItem(summary.index)" class="btn-delete-row" style="position: absolute; left: -26px; top: 50%; transform: translateY(-50%); z-index: 10;">
                      <i class="mdi mdi-minus"></i>
                    </button>

                    <template v-if="summary.key === 'insuranceDiff'">
                      <div style="display: flex; align-items: center; padding-left: 8px;">
                        <span :class="summary.sign < 0 ? 'text-red' : 'text-blue'">{{ summary.sign < 0 ? '-' : '+' }}</span>
                        <input type="text" :value="formatCurrency(formData.billingData.insuranceDiff)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData, 'insuranceDiff', null, 'none')" class="cell-input text-right font-bold" :class="summary.sign < 0 ? 'text-red' : 'text-blue'" style="width: 100%; height: 100%; padding: 6px; box-sizing: border-box; border-radius: 0;" />
                      </div>
                    </template>
                    <template v-else-if="summary.isCustom">
                      <div style="display: flex; align-items: center; padding-left: 8px;">
                        <span :class="summary.sign < 0 ? 'text-red' : 'text-blue'">{{ summary.sign < 0 ? '-' : '+' }}</span>
                        <input type="text" :value="formatCurrency(formData.billingData.customSummaryItems[summary.index].amount)" @focus="$event.target.select()" @input="handleCurrencyInput($event, formData.billingData.customSummaryItems[summary.index], 'amount', null, 'none')" class="cell-input text-right font-bold" :class="summary.sign < 0 ? 'text-red' : 'text-blue'" style="width: 100%; height: 100%; padding: 6px; box-sizing: border-box; border-radius: 0;" />
                      </div>
                    </template>
                    <template v-else>
                      <div style="padding: 6px;" :class="summary.sign < 0 ? 'text-red' : (summary.toggleable ? 'text-blue' : '')">
                        <span v-if="summary.value !== 0">{{ summary.sign < 0 ? '- ' : (summary.toggleable ? '+ ' : '') }}</span>{{ formatCurrency(summary.value) }}
                      </div>
                    </template>
                  </td>
                </tr>
              </template>
              </tbody>
            </table>
          </div>
        </div>

        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px; box-sizing: border-box; }
.modal-container { background: var(--bg-surface); width: 100%; max-width: 1400px; height: 90vh; border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0,0,0,.1); overflow: hidden; border: 1px solid var(--border-color); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border-color); background: var(--bg-canvas); gap: 12px; flex-wrap: wrap; }
.header-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.header-title h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-main); white-space: nowrap; }
.badge { padding: 3px 8px; background: var(--primary-soft); color: var(--primary); border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.btn-excel { background: rgba(5, 150, 105, .1); color: var(--success); border: 1px solid rgba(5, 150, 105, .3); padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: .2s; display: flex; align-items: center; gap: 6px; font-size: 14px; white-space: nowrap; }
.btn-excel:hover { background: var(--success); color: #fff; }
.btn-save { background: var(--primary); color: var(--text-inverse); border: none; padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: .2s; display: flex; align-items: center; gap: 6px; font-size: 14px; white-space: nowrap; }
.btn-save:hover { background: var(--primary-hover); transform: translateY(-1px); }
.btn-close { background: none; border: none; font-size: 22px; color: var(--text-muted); cursor: pointer; transition: .2s; padding: 4px; line-height: 1; border-radius: 6px; }
.btn-close:hover { background: var(--bg-hover); color: var(--danger); }
.modal-tabs { display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-surface); flex-shrink: 0; }
.tab-btn { padding: 14px 18px; background: none; border: none; border-bottom: 3px solid transparent; font-size: 14px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: .2s; display: flex; align-items: center; gap: 6px; margin-bottom: -1px; white-space: nowrap; }
.tab-btn:hover  { color: var(--text-main); }
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }
.modal-body { flex: 1; overflow-y: auto; padding: 20px; background: var(--bg-canvas); -webkit-overflow-scrolling: touch; }
.modal-body::-webkit-scrollbar { width: 8px; }
.modal-body::-webkit-scrollbar-track { background: var(--bg-canvas); }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.document-paper { max-width: 860px; margin: 0 auto; background: var(--bg-surface); padding: 32px 28px; border-radius: 8px; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color); }
.doc-header h1 { font-size: 26px; letter-spacing: 8px; margin-bottom: 32px; border-bottom: 2px solid var(--text-main); padding-bottom: 18px; color: var(--text-main); }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-sub); margin-bottom: 6px; }
.form-input, .form-select { width: 100%; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 14px; color: var(--text-main); background: var(--bg-canvas); box-sizing: border-box; outline: none; transition: border-color .2s; }
.form-input:focus, .form-select:focus { border-color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary-soft); background: var(--bg-surface); }
.bg-gray { background-color: var(--bg-hover) !important; color: var(--text-muted); cursor: not-allowed; border-color: transparent; }
.doc-message { margin: 20px 0; line-height: 1.8; color: var(--text-main); font-size: 14px; }
.vat-badge { font-size: 12px; margin-left: 6px; font-weight: normal; }
.vat-free  { color: var(--danger); }
.vat-taxed { color: var(--primary); }
.deduction-toggles { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; padding: 12px 16px; background: var(--bg-surface); border-radius: 8px; border: 1px dashed var(--border-focus); flex-wrap: wrap; }
.toggle-label { font-size: 13px; font-weight: 600; color: var(--primary); display: flex; align-items: center; gap: 4px; }
.toggle-checkbox { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; color: var(--text-main); font-weight: 500; }
.toggle-checkbox input[type="checkbox"] { accent-color: var(--primary); width: 16px; height: 16px; cursor: pointer; }
.table-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
.table-actions h4 { margin: 0; font-size: 15px; color: var(--text-main); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.table-actions h4 i { color: var(--primary); font-size: 18px; }
.action-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.btn-add-row { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: var(--success); color: var(--text-inverse); border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; white-space: nowrap; transition: .2s; }
.btn-add-row:hover { background: var(--success-hover); transform: translateY(-1px); }
.btn-load-data { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: var(--bg-surface); color: var(--primary); border: 1px solid var(--primary); border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; transition: all .2s; white-space: nowrap; }
.btn-load-data:hover { background: var(--primary-soft); transform: translateY(-1px); }
.table-scroll-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 4px; }
.excel-table-wrapper {
  background: var(--bg-surface);
  border-radius: 8px;
  border: 1px solid var(--border-color);
  overflow-x: auto;
  box-shadow: var(--shadow-sm);
  -webkit-overflow-scrolling: touch;
}

/* =========================================
   테이블 CSS
========================================= */
.excel-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
  table-layout: fixed;
}
.excel-table th, .excel-table td {
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
  padding: 6px;
  vertical-align: middle;
  background-clip: padding-box;
}

.excel-table tr td:first-child,
.excel-table tr th:first-child {
  border-left: 1px solid var(--border-color);
}

.excel-table thead th {
  background: var(--bg-hover);
  font-weight: 600;
  text-align: center;
  color: var(--text-main);
  padding: 6px;
  white-space: nowrap;
  line-height: 1.3;
  position: sticky;
  top: 0;
  z-index: 10;
  border-top: 1px solid var(--border-color);
}

.statement-table tfoot td { padding: 10px; }
.bank-info { display: flex; align-items: center; gap: 10px; background: var(--bg-canvas); padding: 14px; border-radius: 8px; border: 1px solid var(--border-color); flex-wrap: wrap; }
.bank-info label { font-weight: 600; color: var(--text-main); white-space: nowrap; }
.bank-input { flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid var(--border-focus); border-radius: 6px; font-size: 14px; font-weight: bold; color: var(--text-main); background: var(--bg-surface); outline: none; transition: .2s; }
.bank-input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }
.bg-blue-light   { background-color: rgba(59, 130, 246, .1)  !important; color: #2563eb !important; }
.bg-red-light    { background-color: rgba(239, 68, 68, .1)   !important; color: #dc2626 !important; }
.bg-yellow-light { background-color: rgba(245, 158, 11, .1)  !important; color: #b45309 !important; }
.bg-gray-50      { background-color: var(--bg-canvas); }
.cell-input { width: 100%; border: 1px solid transparent; background: transparent; padding: 4px; outline: none; transition: .2s; border-radius: 4px; box-sizing: border-box; font-size: 13px; color: var(--text-main); }
.cell-input:focus, .cell-input:hover { border-color: var(--primary); background: var(--bg-surface); }
.drag-handle { cursor: grab; user-select: none; }
.drag-icon   { color: var(--text-muted); font-size: 16px; vertical-align: middle; margin-right: 2px; }
.dragging    { opacity: .4; background: var(--primary-soft) !important; }
.empty-row { text-align: center; padding: 32px 16px; color: var(--text-muted); font-size: 13px; }
.btn-delete-row { background: rgba(239, 68, 68, .1); color: var(--danger); border: none; padding: 4px; border-radius: 4px; cursor: pointer; transition: .2s; display: inline-flex; align-items: center; justify-content: center; }
.btn-delete-row:hover { background: var(--danger); color: var(--text-inverse); }
.text-gray-400{ color: var(--text-muted); }
.text-red { color: #dc2626; }
.text-blue { color: #2563eb; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.mt-5 { margin-top: 30px; }
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
@media (max-width: 1024px) { .modal-overlay { padding: 10px; } .modal-container { height: 95vh; } .document-paper { padding: 24px 20px; } }

/* 모바일 뷰 */
@media (max-width: 768px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal-container { height: 96vh; border-radius: 16px 16px 0 0; max-width: 100%; }
  .modal-header { padding: 12px 16px; }
  .header-title h2 { font-size: 15px; }
  .badge { display: none; }
  .modal-tabs { padding: 0 8px; }
  .tab-btn { padding: 12px 12px; font-size: 13px; }
  .tab-text { display: none; }
  .switcher-label { display: none; }
  .modal-body { padding: 12px; }
  .document-paper { padding: 16px 14px; }
  .doc-header h1 { font-size: 18px; letter-spacing: 4px; margin-bottom: 20px; }
  .form-grid { grid-template-columns: 1fr; gap: 12px; }
  .btn-text { display: none; }
  .action-btns { gap: 6px; }
  .btn-add-row, .btn-load-data { padding: 7px 10px; }
  .excel-table { font-size: 12px; }
  .excel-table thead th { padding: 6px; font-size: 11px; }
  .excel-table td { padding: 6px; }
  .cell-input { font-size: 12px; padding: 3px; }
  .deduction-toggles { gap: 8px; padding: 10px; }
}
@media (max-width: 480px) { .header-title h2 { font-size: 14px; } .modal-body { padding: 8px; } .document-paper { padding: 12px 10px; } .doc-header h1 { font-size: 16px; letter-spacing: 3px; } .tab-btn { padding: 10px 10px; } }

.melt-toggles-group {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(239, 68, 68, 0.05);
  border: 1px dashed rgba(239, 68, 68, 0.4);
  padding: 6px 14px;
  border-radius: 8px;
  margin-right: 10px;
}
.melt-title {
  font-size: 12px;
  font-weight: 700;
  color: #b91c1c;
  margin-right: 4px;
}
.melt-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.melt-label {
  font-size: 12px;
  font-weight: 600;
  color: #dc2626;
}
.switch { position: relative; display: inline-block; width: 32px; height: 18px; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .3s; }
.slider:before { position: absolute; content: ""; height: 12px; width: 12px; left: 3px; bottom: 3px; background-color: white; transition: .3s; }
.slider.round { border-radius: 20px; }
.slider.round:before { border-radius: 50%; }
input:checked + .slider { background-color: #dc2626; }
input:checked + .slider:before { transform: translateX(14px); }

/* ★ 요약 하단 토글 관련 디자인 */
.summary-label-cell { cursor: pointer; transition: background-color 0.2s; user-select: none; }
.summary-label-cell:hover { background-color: #e2e8f0; }
.sign-badge { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 4px; font-size: 12px; font-weight: 900; color: white; }
.bg-red-badge { background-color: #ef4444; }
.bg-blue-badge { background-color: #3b82f6; }

/* =========================================
   ★ 메모 영역 (특이사항) 전용 스타일 ★
========================================= */
.memo-container-cell {
  background: var(--bg-surface);
  padding: 16px 20px;
  vertical-align: top;
  border-bottom: none !important;
  border-left: none !important;
}

.memo-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 150px;
  gap: 10px;
  background: var(--bg-canvas);
  border: 1px solid var(--border-focus);
  border-radius: 10px;
  padding: 14px 16px;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.02);
  transition: border-color 0.2s;
}

.memo-wrapper:focus-within {
  border-color: var(--primary);
  background: var(--bg-surface);
  box-shadow: inset 0 2px 4px rgba(37, 99, 235, 0.05), 0 0 0 3px var(--primary-soft);
}

.memo-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.memo-header i {
  color: var(--primary);
  font-size: 18px;
  background: var(--primary-soft);
  padding: 4px;
  border-radius: 6px;
}

.memo-textarea {
  flex: 1;
  width: 100%;
  min-height: 120px;
  resize: none;
  border: none;
  background: transparent;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-main);
  outline: none;
}

.memo-textarea::placeholder {
  color: var(--text-muted);
  font-style: italic;
}

/* --- 메모 영역 반응형 (모바일) --- */
@media (max-width: 768px) {
  .memo-container-cell {
    padding: 12px;
  }
  .memo-wrapper {
    min-height: 160px;
    min-width: 300px; /* 모바일에서 너무 찌그러지지 않게 최소 가로폭 유지 */
  }
  .memo-textarea {
    font-size: 12px;
  }
}

/* =========================================
   하단 메모/요약 2단 분리 레이아웃 (추가된 부분)
========================================= */
.bottom-flex-layout {
  display: flex;
  gap: 16px;
  margin-top: 16px;
  align-items: stretch; /* 좌우 높이를 동일하게 맞춤 */
}

/* 좌측 메모 영역: 남은 공간 꽉 채우기 */
.memo-area {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 우측 요약표 영역: 가로 사이즈 고정 */
.summary-area {
  flex: 0 0 380px;
}

@media (max-width: 768px) {
  .bottom-flex-layout {
    flex-direction: column;
  }
  .summary-area {
    flex: auto;
    width: 100%;
  }
}
</style>
