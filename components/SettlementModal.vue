<script setup>
import { ref, watch, onMounted } from 'vue';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";

const { siteOptions, typeOptions, fetchSiteOptions, fetchTypeOptions } = useApi();
const authStore = useAuthStore();
const props = defineProps({
  isOpen: Boolean,
  settlementId: Number, // null이면 신규 작성
  initialData: Object
});

const emit = defineEmits(['close', 'save']);

// 현재 활성화된 탭 ('statement': 공문, 'details': 세부내역서)
const activeTab = ref('statement');

// 폼 데이터 초기 뼈대
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
    // 🚨 혼합단지(과세/면세) 산출내역 객체 추가
    vatBreakdown: {
      under135: { area: '', unitPrice: '', supply: 0 },
      over135: { area: '', unitPrice: '', supply: 0, vat: 0 }
    }
  },
  payrollData: []
});

onMounted(() => {
  fetchSiteOptions();
  fetchTypeOptions();
});

// 현장 선택 시 사이트명 및 부가세(is_vat) 자동 세팅
const handleSiteChange = () => {
  const selectedSite = siteOptions.value.find(s => s.idx === formData.value.sIdx);
  if (selectedSite) {
    formData.value.siteName = selectedSite.name;
    formData.value.is_vat = selectedSite.is_vat || 'N';
  } else {
    formData.value.siteName = '';
    formData.value.is_vat = 'N';
  }
  calculateBillingTotal(); // 현장이 바뀌면 계산 방식이 달라지므로 갱신
};

// 데이터 초기화 (신규 작성 vs 수정)
const initForm = () => {
  if (props.initialData && Object.keys(props.initialData).length > 0) {
    // 깊은 복사로 원본 훼손 방지
    const data = JSON.parse(JSON.stringify(props.initialData));

    if (!data.payrollData) data.payrollData = [];
    if (!data.billingData) data.billingData = { items: [], bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)' };
    if (!data.billingData.items) data.billingData.items = [];

    // 🚨 이전 데이터에 vatBreakdown 구조가 없을 경우 방어코드
    if (!data.billingData.vatBreakdown) {
      data.billingData.vatBreakdown = {
        under135: { area: '', unitPrice: '', supply: 0 },
        over135: { area: '', unitPrice: '', supply: 0, vat: 0 }
      };
    }

    // DB 데이터 구조 호환성 보정 (해당없음 등 빈 값 처리)
    data.payrollData.forEach(row => {
      if (!row.deductions) row.deductions = {};
      row.deductions.nationalPension = row.deductions.nationalPension || 0;
      row.deductions.healthInsurance = row.deductions.healthInsurance || 0;
      row.deductions.longTermCare = row.deductions.longTermCare || 0;
      row.deductions.empInsurance = row.deductions.empInsurance || 0;
      row.deductions.totalDeduct = row.deductions.totalDeduct || 0;

      if (!row.reserves) row.reserves = {};
      row.reserves.annualLeave = row.reserves.annualLeave || 0;
      row.reserves.severance = row.reserves.severance || 0;
    });

    // 수정 모드일 때 is_vat 값 복원
    const selectedSite = siteOptions.value.find(s => s.idx === data.sIdx);
    data.is_vat = selectedSite ? selectedSite.is_vat : (data.vatAmount > 0 ? 'Y' : 'N');

    formData.value = data;

    if (data.defaultTab) {
      activeTab.value = data.defaultTab;
    }
  } else {
    // 신규 작성 폼
    formData.value = {
      sIdx: '', siteName: '', is_vat: 'N',
      type: '청소',
      target_month: '',
      docNo: '',
      billingDt: '',
      subTotal: 0,
      vatAmount: 0,
      grandTotal: 0,
      billingData: {
        summary: '', workerCount: 0,
        bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)',
        items: [{ period: '', category: '', detail: '', amount: 0, note: '' }],
        vatBreakdown: {
          under135: { area: '', unitPrice: '', supply: 0 },
          over135: { area: '', unitPrice: '', supply: 0, vat: 0 }
        }
      },
      payrollData: []
    };
  }
};

watch(() => props.initialData, () => {
  initForm();
}, { immediate: true });


// ==========================================
// [TAB 1] 청구 공문(표지) 행 추가/삭제/계산 로직
// ==========================================
const addBillingRow = () => {
  formData.value.billingData.items.push({
    period: '', category: '', detail: '', amount: 0, note: ''
  });
};

const removeBillingRow = (index) => {
  formData.value.billingData.items.splice(index, 1);
  calculateBillingTotal();
};

// 🚨 알려주신 엑셀 수식 100% 적용 로직
const calculateAreaSupply = () => {
  const underArea = Number(formData.value.billingData.vatBreakdown.under135.area) || 0;
  const overArea = Number(formData.value.billingData.vatBreakdown.over135.area) || 0;
  const totalArea = underArea + overArea;

  // 1. 기준이 되는 청구 내역의 합계 (이것이 135 분배 전의 기준 formData.grandTotal 역할을 함)
  const topTableSum = formData.value.billingData.items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  if (totalArea > 0 && topTableSum > 0) {
    // 2. 단가 = 청구 내역의 합계 / 총 관리면적
    const unitPrice = topTableSum / totalArea;

    // 화면 표기용 단가 (소수점 2자리까지만 노출)
    formData.value.billingData.vatBreakdown.under135.unitPrice = unitPrice.toFixed(2);
    formData.value.billingData.vatBreakdown.over135.unitPrice = unitPrice.toFixed(2);

    // 3. 135이하 공급가액 = ROUND(단가 * 135이하관리면적, -0.1) - 1
    // (JS에서는 Math.round 가 엑셀의 ROUND(..., 0) 과 동일하게 소수점 반올림 처리)
    const underSupply = Math.round(unitPrice * underArea) - 1;
    formData.value.billingData.vatBreakdown.under135.supply = underSupply;

    // 4. 135초과 공급가액 = 청구내역합계 - 135이하 공급가액
    const overSupply = topTableSum - underSupply;
    formData.value.billingData.vatBreakdown.over135.supply = overSupply;

    // 5. 135초과 세액 = ROUNDDOWN(135초과공급가액 * 10%, -0.1)
    // (JS에서는 Math.floor 가 엑셀의 ROUNDDOWN(..., 0) 과 동일하게 소수점 내림 처리)
    const overVat = Math.floor(overSupply * 0.1);
    formData.value.billingData.vatBreakdown.over135.vat = overVat;

    // 하단 총계 재업데이트
    formData.value.subTotal = underSupply + overSupply; // 이는 결국 topTableSum과 일치함
    formData.value.vatAmount = overVat;
    formData.value.grandTotal = formData.value.subTotal + formData.value.vatAmount;
  }
};

const calculateBillingTotal = () => {
  // 상단 청구 내역의 항목들을 모두 더해 '기준 합계' 도출
  const topTableSum = formData.value.billingData.items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  if (formData.value.is_vat === 'Y') {
    // 과세 사업장이면 확정된 총액을 바탕으로 단가 및 공급가액 자동 분배
    calculateAreaSupply();
  } else {
    // 면세 사업장일 경우
    formData.value.subTotal = topTableSum;
    formData.value.vatAmount = 0;
    formData.value.grandTotal = topTableSum;
  }
};

// 하단 표에서 부가세 등을 강제로 수동 수정했을 때의 예외 처리
const handleManualBreakdownUpdate = () => {
  const overVat = Number(formData.value.billingData.vatBreakdown.over135.vat) || 0;
  formData.value.vatAmount = overVat;
  formData.value.grandTotal = formData.value.subTotal + overVat;
};

// ==========================================
// [TAB 2] 급여 세부 내역서 행 추가/삭제/계산 로직
// ==========================================
const loadPayrollData = async () => {
  if (!formData.value.sIdx) {
    alert('현장을 먼저 선택해주세요.');
    return;
  }
  if (formData.value.payrollData.length > 0) {
    if (!confirm('기존에 입력된 데이터가 모두 초기화됩니다. 정말 불러오시겠습니까?')) return;
  }

  try {
    // API 연동 전 테스트용 Mock 데이터
    const fetchedData = [
      {
        empName: '김철수', position: '반장', grossPay: 2364380,
        deductions: { nationalPension: 106390, healthInsurance: 83810, longTermCare: 10850, empInsurance: 31910 },
        reserves: { annualLeave: 97170, severance: 231100 }
      },
      {
        empName: '이영희', position: '대원', grossPay: 2115600,
        deductions: { nationalPension: 0, healthInsurance: 75000, longTermCare: 9710, empInsurance: 28560 },
        reserves: { annualLeave: 90300, severance: 188000 }
      }
    ];

    formData.value.payrollData = fetchedData.map(row => {
      const totalDeduct =
          (Number(row.deductions.nationalPension) || 0) + (Number(row.deductions.healthInsurance) || 0) +
          (Number(row.deductions.longTermCare) || 0) + (Number(row.deductions.empInsurance) || 0);

      return {
        empName: row.empName, position: row.position, grossPay: row.grossPay,
        deductions: {
          nationalPension: row.deductions.nationalPension || 0,
          healthInsurance: row.deductions.healthInsurance || 0,
          longTermCare: row.deductions.longTermCare || 0,
          empInsurance: row.deductions.empInsurance || 0,
          totalDeduct: totalDeduct
        },
        reserves: {
          annualLeave: row.reserves.annualLeave || 0,
          severance: row.reserves.severance || 0
        },
        netPay: (Number(row.grossPay) || 0) - totalDeduct
      };
    });
    alert('직원 급여 데이터를 성공적으로 불러왔습니다.');
  } catch (error) {
    alert('데이터를 불러오는 중 오류가 발생했습니다.');
  }
};

const addPayrollRow = () => {
  formData.value.payrollData.push({
    empName: '', position: '', grossPay: 0,
    deductions: { nationalPension: 0, healthInsurance: 0, longTermCare: 0, empInsurance: 0, totalDeduct: 0 },
    reserves: { annualLeave: 0, severance: 0 },
    netPay: 0
  });
};

const removePayrollRow = (index) => {
  if(confirm('이 직원의 데이터를 삭제하시겠습니까?')) formData.value.payrollData.splice(index, 1);
};

const calculateRow = (row) => {
  row.deductions.totalDeduct =
      (Number(row.deductions.nationalPension) || 0) + (Number(row.deductions.healthInsurance) || 0) +
      (Number(row.deductions.longTermCare) || 0) + (Number(row.deductions.empInsurance) || 0);

  row.netPay = (Number(row.grossPay) || 0) - row.deductions.totalDeduct;
};

const payrollTotals = computed(() => {
  return formData.value.payrollData.reduce((totals, row) => {
    totals.grossPay += Number(row.grossPay) || 0;
    totals.nationalPension += Number(row.deductions.nationalPension) || 0;
    totals.healthInsurance += Number(row.deductions.healthInsurance) || 0;
    totals.longTermCare += Number(row.deductions.longTermCare) || 0;
    totals.empInsurance += Number(row.deductions.empInsurance) || 0;
    totals.totalDeduct += Number(row.deductions.totalDeduct) || 0;
    totals.netPay += Number(row.netPay) || 0;
    totals.annualLeave += Number(row.reserves.annualLeave) || 0;
    totals.severance += Number(row.reserves.severance) || 0;
    return totals;
  }, {
    grossPay: 0, nationalPension: 0, healthInsurance: 0, longTermCare: 0,
    empInsurance: 0, totalDeduct: 0, netPay: 0, annualLeave: 0, severance: 0
  });
});

// ==========================================
// 저장 및 닫기 API 통신
// ==========================================
const closeModal = () => emit('close');

const handleSave = async () => {
  try {
    const sIdx = formData.value.sIdx;
    if (!sIdx) { alert('현장을 선택해주세요.'); return; }
    const [year, month] = (formData.value.target_month || formData.value.billingDt).split('-');

    const payload = {
      idx: props.settlementId,
      year: parseInt(year) || 0,
      month: parseInt(month) || 0,
      type: formData.value.type,
      docNo: formData.value.docNo,
      billingDt: formData.value.billingDt,
      subTotal: formData.value.subTotal,
      vatAmount: formData.value.vatAmount,
      grandTotal: formData.value.grandTotal,
      billingData: formData.value.billingData,
      payrollData: formData.value.payrollData,
      cIdx: authStore.user?.cIdx || 0
    };

    const response = await axios.post(`/api/v1/settle/site/data/${sIdx}`, payload);

    if (response.data.result) {
      alert('성공적으로 저장되었습니다.');
      emit('save');
      closeModal();
    } else {
      alert(`저장 실패: ${response.data.msg}`);
    }
  } catch (error) {
    console.error('정산서 저장 중 오류 발생:', error);
    alert('서버 통신 중 오류가 발생했습니다.');
  }
};

const formatCurrency = (val) => Number(val || 0).toLocaleString();
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
          <button class="btn-save" @click="handleSave"><i class="mdi mdi-content-save"></i> 저장하기</button>
          <button class="btn-close" @click="closeModal"><i class="mdi mdi-close"></i></button>
        </div>
      </div>

      <div class="modal-tabs">
        <button :class="['tab-btn', { active: activeTab === 'statement' }]" @click="activeTab = 'statement'">
          <i class="mdi mdi-file-document-outline"></i> 청구 공문 (표지)
        </button>
        <button :class="['tab-btn', { active: activeTab === 'details' }]" @click="activeTab = 'details'">
          <i class="mdi mdi-table-account"></i> 급여 세부 내역서
        </button>
      </div>

      <div class="modal-body">

        <div v-show="activeTab === 'statement'" class="tab-content">
          <div class="document-paper">
            <div class="doc-header text-center">
              <h1>청 구 공 문</h1>
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label>현장 선택 <span style="color: #ef4444;">*</span></label>
                <select v-model="formData.sIdx" @change="handleSiteChange" class="form-select">
                  <option value="" disabled>현장을 선택해주세요</option>
                  <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
                    {{ site.name }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>구분 선택 <span style="color: #ef4444;">*</span></label>
                <select v-model="formData.type" class="form-select">
                  <option value="" disabled>구분을 선택해주세요</option>
                  <option v-for="tp in typeOptions" :key="tp.itemCd" :value="tp.itemCd">
                    {{ tp.itemNm }}
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label>수신</label>
                <input type="text" :value="formData.siteName ? formData.siteName + ' 관리사무소' : ''" readonly class="bg-gray" placeholder="현장을 선택하면 자동 입력됩니다" />
              </div>
              <div class="form-group">
                <label>문서번호</label>
                <input type="text" v-model="formData.docNo" placeholder="예: 에코그린 2026-01-09호" />
              </div>
              <div class="form-group">
                <label>시행일자</label>
                <input type="date" v-model="formData.billingDt" />
              </div>
              <div class="form-group">
                <label>제목</label>
                <input type="text" v-model="formData.billingData.summary" placeholder="예: 2026년 1월 미화용역비 청구의 건" />
              </div>
            </div>

            <div class="doc-message">
              <p>1. 귀 소의 무궁한 발전을 기원합니다.</p>
              <p>2. 당월 용역비를 아래와 같이 청구하오니 검토하시여 결재를 부탁드립니다.</p>
              <p class="text-center" style="margin-top: 15px;">- 아 래 -</p>
            </div>

            <div class="table-actions" style="margin-top: 20px;">
              <h4><i class="mdi mdi-format-list-checks"></i>
                청구 내역
                <span v-if="formData.is_vat === 'N'" style="color: #ef4444; font-size: 13px; margin-left: 6px; font-weight: normal;">(면세 사업장)</span>
                <span v-else style="color: #3b82f6; font-size: 13px; margin-left: 6px; font-weight: normal;">(과세 사업장)</span>
              </h4>
              <button class="btn-add-row" @click="addBillingRow">
                <i class="mdi mdi-plus-thick"></i> 항목 추가
              </button>
            </div>

            <table class="excel-table statement-table">
              <thead>
              <tr>
                <th style="width: 20%;">산정기간</th>
                <th style="width: 15%;">구분</th>
                <th style="width: 30%;">내역</th>
                <th style="width: 15%;">산출금액</th>
                <th style="width: 15%;">비고</th>
                <th style="width: 5%;"></th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="(item, index) in formData.billingData.items" :key="'bill-'+index">
                <td><input type="text" v-model="item.period" class="cell-input text-center" placeholder="예: 26.01.01~01.31" /></td>
                <td><input type="text" v-model="item.category" class="cell-input text-center" placeholder="예: 미화, 경비" /></td>
                <td><input type="text" v-model="item.detail" class="cell-input" placeholder="예: 1월 미화용역비" /></td>
                <td>
                  <input type="number" v-model="item.amount" @input="calculateBillingTotal" class="cell-input text-right font-bold text-blue" />
                </td>
                <td><input type="text" v-model="item.note" class="cell-input" placeholder="비고 입력" /></td>
                <td class="text-center">
                  <button class="btn-delete-row" @click="removeBillingRow(index)" title="삭제"><i class="mdi mdi-minus"></i></button>
                </td>
              </tr>
              </tbody>
              <tfoot>
              <tr class="bg-blue-light font-bold" style="font-size: 15px;">
                <td colspan="3" class="text-center">합계</td>
                <td class="text-right text-blue">{{ formatCurrency(formData.subTotal) }}</td>
                <td colspan="2"></td>
              </tr>
              </tfoot>
            </table>

            <div v-if="formData.is_vat === 'Y'" class="vat-breakdown-wrapper mt-5">
              <h4><i class="mdi mdi-domain"></i> 과세/면세 관리면적별 산출내역 <span class="text-gray-400" style="font-size: 12px; font-weight: normal;">(이 표의 합계가 총 청구액이 됩니다)</span></h4>
              <table class="excel-table statement-table mt-2">
                <thead>
                <tr>
                  <th style="width: 20%;">구분</th>
                  <th style="width: 15%;">관리면적(㎡)</th>
                  <th style="width: 15%;">단가(원)</th>
                  <th style="width: 18%;">공급가액(원)</th>
                  <th style="width: 15%;">부가세(원)</th>
                  <th style="width: 17%;">합계금액(원)</th>
                </tr>
                </thead>
                <tbody>
                <tr>
                  <td class="text-center font-bold bg-gray-50">135㎡ 이하 (면세)</td>
                  <td><input type="number" v-model="formData.billingData.vatBreakdown.under135.area" @input="calculateAreaSupply('under135')" class="cell-input text-right" placeholder="면적입력" /></td>
                  <td><input type="number" v-model="formData.billingData.vatBreakdown.under135.unitPrice" @input="calculateAreaSupply('under135')" class="cell-input text-right" placeholder="단가입력" /></td>
                  <td><input type="number" v-model="formData.billingData.vatBreakdown.under135.supply" @input="calculateBillingTotal" class="cell-input text-right font-bold text-blue" /></td>
                  <td class="text-right bg-gray-50 text-gray-400">0</td>
                  <td class="text-right font-bold text-blue bg-blue-light">{{ formatCurrency(formData.billingData.vatBreakdown.under135.supply) }}</td>
                </tr>
                <tr>
                  <td class="text-center font-bold bg-gray-50">135㎡ 초과 (과세)</td>
                  <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.area" @input="calculateAreaSupply('over135')" class="cell-input text-right" placeholder="면적입력" /></td>
                  <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.unitPrice" @input="calculateAreaSupply('over135')" class="cell-input text-right" placeholder="단가입력" /></td>
                  <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.supply" @input="calculateVatBreakdown" class="cell-input text-right font-bold text-blue" /></td>
                  <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.vat" @input="calculateBillingTotal" class="cell-input text-right font-bold text-red" /></td>
                  <td class="text-right font-bold text-blue bg-blue-light">{{ formatCurrency(Number(formData.billingData.vatBreakdown.over135.supply) + Number(formData.billingData.vatBreakdown.over135.vat)) }}</td>
                </tr>
                </tbody>
                <tfoot>
                <tr class="bg-gray-50 font-bold" style="font-size: 14px;">
                  <td class="text-center">총 계</td>
                  <td class="text-right">{{ formatCurrency(Number(formData.billingData.vatBreakdown.under135.area) + Number(formData.billingData.vatBreakdown.over135.area)) }}</td>
                  <td class="text-center">-</td>
                  <td class="text-right text-blue">{{ formatCurrency(formData.subTotal) }}</td>
                  <td class="text-right text-red">{{ formatCurrency(formData.vatAmount) }}</td>
                  <td class="text-right text-blue bg-blue-light">{{ formatCurrency(formData.grandTotal) }}</td>
                </tr>
                </tfoot>
              </table>
            </div>

            <div class="bank-info mt-5">
              <label>3. 입금계좌 : </label>
              <input type="text" v-model="formData.billingData.bankInfo" class="bank-input" />
            </div>

          </div>
        </div>

        <div v-show="activeTab === 'details'" class="tab-content">
          <div class="table-actions">
            <h4><i class="mdi mdi-table-account"></i> 직원별 급여/공제 정산 내역</h4>
            <div style="display: flex; gap: 8px;">
              <button class="btn-load-data" @click="loadPayrollData">
                <i class="mdi mdi-download-box-outline"></i> 데이터 불러오기
              </button>
              <button class="btn-add-row" @click="addPayrollRow">
                <i class="mdi mdi-plus-thick"></i> 직원 추가
              </button>
            </div>
          </div>

          <div class="excel-table-wrapper">
            <table class="excel-table">
              <thead>
              <tr>
                <th rowspan="2" style="width: 50px;">NO</th>
                <th rowspan="2" style="width: 80px;">이름</th>
                <th rowspan="2" style="width: 80px;">직책</th>
                <th rowspan="2" class="bg-blue-light">지급총액</th>
                <th colspan="4" class="bg-red-light">4대보험 공제 (근로자 부담금)</th>
                <th rowspan="2" class="bg-red-light">공제계</th>
                <th rowspan="2" class="bg-green-light">차인지급액</th>
                <th colspan="2" class="bg-yellow-light">단지 적립금</th>
                <th rowspan="2" style="width: 60px;">관리</th>
              </tr>
              <tr>
                <th class="bg-red-light">국민연금</th>
                <th class="bg-red-light">건강보험</th>
                <th class="bg-red-light">장기요양</th>
                <th class="bg-red-light">고용보험</th>
                <th class="bg-yellow-light">연차적립</th>
                <th class="bg-yellow-light">퇴직적립</th>
              </tr>
              </thead>
              <tbody>
              <tr v-for="(row, index) in formData.payrollData" :key="'pay-'+index">
                <td class="text-center">{{ index + 1 }}</td>
                <td><input type="text" v-model="row.empName" class="cell-input text-center" placeholder="이름"/></td>
                <td><input type="text" v-model="row.position" class="cell-input text-center" placeholder="직책"/></td>

                <td><input type="number" v-model="row.grossPay" @input="calculateRow(row)" class="cell-input text-right font-bold text-blue"/></td>

                <td><input type="number" v-model="row.deductions.nationalPension" @input="calculateRow(row)" class="cell-input text-right"/></td>
                <td><input type="number" v-model="row.deductions.healthInsurance" @input="calculateRow(row)" class="cell-input text-right"/></td>
                <td><input type="number" v-model="row.deductions.longTermCare" @input="calculateRow(row)" class="cell-input text-right"/></td>
                <td><input type="number" v-model="row.deductions.empInsurance" @input="calculateRow(row)" class="cell-input text-right"/></td>

                <td class="text-right font-bold bg-gray-50">{{ formatCurrency(row.deductions.totalDeduct) }}</td>
                <td class="text-right font-bold text-green bg-green-50">{{ formatCurrency(row.netPay) }}</td>

                <td><input type="number" v-model="row.reserves.annualLeave" class="cell-input text-right"/></td>
                <td><input type="number" v-model="row.reserves.severance" class="cell-input text-right"/></td>

                <td class="text-center">
                  <button class="btn-delete-row" @click="removePayrollRow(index)" title="삭제">
                    <i class="mdi mdi-trash-can-outline"></i>
                  </button>
                </td>
              </tr>
              <tr v-if="formData.payrollData.length === 0">
                <td colspan="13" class="text-center py-8 text-gray-500">등록된 직원 데이터가 없습니다. 우측 상단의 '직원 추가'를 눌러주세요.</td>
              </tr>
              </tbody>
              <tfoot v-if="formData.payrollData.length > 0">
              <tr class="bg-gray-50 font-bold" style="font-size: 14px;">
                <td colspan="3" class="text-center">총 계</td>

                <td class="text-right text-blue bg-blue-light">{{ formatCurrency(payrollTotals.grossPay) }}</td>

                <td class="text-right">{{ formatCurrency(payrollTotals.nationalPension) }}</td>
                <td class="text-right">{{ formatCurrency(payrollTotals.healthInsurance) }}</td>
                <td class="text-right">{{ formatCurrency(payrollTotals.longTermCare) }}</td>
                <td class="text-right">{{ formatCurrency(payrollTotals.empInsurance) }}</td>

                <td class="text-right text-red bg-red-light">{{ formatCurrency(payrollTotals.totalDeduct) }}</td>

                <td class="text-right text-green bg-green-light" style="font-size: 15px;">{{ formatCurrency(payrollTotals.netPay) }}</td>

                <td class="text-right bg-yellow-light" style="color: #a16207;">{{ formatCurrency(payrollTotals.annualLeave) }}</td>
                <td class="text-right bg-yellow-light" style="color: #a16207;">{{ formatCurrency(payrollTotals.severance) }}</td>

                <td></td>
              </tr>
              </tfoot>
            </table>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
/* === 기존 모달 및 레이아웃 스타일 유지 === */
.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal-container { background: #ffffff; width: 95%; max-width: 1400px; height: 90vh; border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); overflow: hidden; }

/* 모달 헤더 */
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
.header-title { display: flex; align-items: center; gap: 12px; }
.header-title h2 { margin: 0; font-size: 20px; font-weight: 700; color: #1e293b; }
.badge { padding: 4px 10px; background: #e0e7ff; color: #4338ca; border-radius: 6px; font-size: 13px; font-weight: 600; }
.header-actions { display: flex; align-items: center; gap: 16px; }

.btn-load-data { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: #f8fafc; color: #3b82f6; border: 1px solid #3b82f6; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; transition: all 0.2s; }
.btn-load-data:hover { background: #eff6ff; box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1); }
.btn-save { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px; }
.btn-save:hover { background: #2563eb; }
.btn-close { background: none; border: none; font-size: 24px; color: #64748b; cursor: pointer; transition: 0.2s; }
.btn-close:hover { color: #ef4444; }

/* 탭 메뉴 */
.modal-tabs { display: flex; padding: 0 24px; border-bottom: 1px solid #e2e8f0; background: #ffffff; }
.tab-btn { padding: 16px 24px; background: none; border: none; border-bottom: 3px solid transparent; font-size: 15px; font-weight: 600; color: #64748b; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 8px; margin-bottom: -1px; }
.tab-btn:hover { color: #3b82f6; }
.tab-btn.active { color: #3b82f6; border-bottom-color: #3b82f6; }
.modal-body { flex: 1; overflow-y: auto; padding: 24px; background: #f1f5f9; }

/* 공문(표지) 폼 디자인 */
.document-paper { max-width: 900px; margin: 0 auto; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #cbd5e1; }
.doc-header h1 { font-size: 32px; letter-spacing: 10px; margin-bottom: 40px; border-bottom: 2px solid #1e293b; padding-bottom: 20px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 6px; }
.form-group input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; box-sizing: border-box; outline: none; transition: border-color 0.2s;}
.form-group input:focus { border-color: #667eea; box-shadow: inset 0 0 0 1px #667eea; }
.bg-gray { background-color: #f1f5f9; }
.form-select { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; box-sizing: border-box; background-color: white; outline: none; transition: 0.2s;}
.form-select:focus { border-color: #667eea; box-shadow: inset 0 0 0 1px #667eea; }
.full-width { grid-column: span 2; }
.doc-message { margin: 20px 0; line-height: 1.8; color: #334155; font-size: 15px; }

/* 테이블 공통 */
.table-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.table-actions h4 { margin: 0; font-size: 16px; color: #1e293b; display: flex; align-items: center; gap: 6px; }
.btn-add-row { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; }
.btn-add-row:hover { background: #059669; }

.excel-table-wrapper { background: white; border-radius: 8px; border: 1px solid #cbd5e1; overflow-x: auto; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.excel-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.excel-table th, .excel-table td { border: 1px solid #e2e8f0; padding: 6px; vertical-align: middle; }
.excel-table thead th { background: #f8fafc; font-weight: 600; text-align: center; color: #1e293b; padding: 10px 8px; }

/* 표지(statement) 테이블 전용 */
.statement-table th { background: #1e293b; color: white; border-color: #334155; }
.statement-table tfoot td { padding: 10px; }

/* 계좌 정보 */
.bank-info { display: flex; align-items: center; gap: 10px; background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; }
.bank-info label { font-weight: 600; color: #1e293b; }
.bank-input { flex: 1; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; font-weight: bold; color: #0f172a; outline: none;}

/* 테이블 헤더 색상 (내역서) */
.bg-blue-light { background-color: #e0f2fe !important; color: #0369a1 !important; }
.bg-red-light { background-color: #fee2e2 !important; color: #b91c1c !important; }
.bg-green-light { background-color: #dcfce7 !important; color: #15803d !important; }
.bg-yellow-light { background-color: #fef9c3 !important; color: #a16207 !important; }
.bg-gray-50 { background-color: #f8fafc; }
.bg-green-50 { background-color: #f0fdf4; }

/* 셀 내부 Input */
.cell-input { width: 100%; border: 1px solid transparent; background: transparent; padding: 4px; font-family: inherit; outline: none; transition: 0.2s; border-radius: 4px; box-sizing: border-box;}
.cell-input:focus, .cell-input:hover { border-color: #667eea; background: white; box-shadow: inset 0 0 0 1px #667eea; }

/* 유틸 */
.text-center { text-align: center; }
.text-right { text-align: right; }
.font-bold { font-weight: 700; }
.text-blue { color: #2563eb; }
.text-red { color: #ef4444; }
.text-green { color: #16a34a; }
.text-gray-400 { color: #94a3b8; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.mt-5 { margin-top: 30px; }

/* 삭제 버튼 */
.btn-delete-row { background: #fee2e2; color: #ef4444; border: none; padding: 4px; border-radius: 4px; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; justify-content: center;}
.btn-delete-row:hover { background: #ef4444; color: white; }

/* input number 화살표 숨기기 */
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
</style>
