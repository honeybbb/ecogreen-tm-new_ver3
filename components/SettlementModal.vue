<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";

const { siteOptions, typeOptions, fetchSiteOptions, fetchTypeOptions } = useApi();
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx || 1;

const props = defineProps({
  isOpen: Boolean,
  settlementId: Number, // null이면 신규 작성
  initialData: Object
});

const emit = defineEmits(['close', 'save']);

const activeTab = ref('statement');

const items = ref([]);

const payItems = computed(() => {
  if (!Array.isArray(items.value)) return [];
  return items.value.filter(item => item.groupCd === '04001');
});

// 4대보험 키워드만 필터링해서 4개 컬럼만 노출되도록 변경
const deductionItems = computed(() => {
  if (!Array.isArray(items.value)) return [];
  const targetKeywords = ['국민연금', '건강보험', '장기요양', '고용보험'];

  return items.value.filter(item =>
      item.groupCd === '04002' && targetKeywords.some(keyword => item.itemNm.includes(keyword))
  );
});

// ==========================================
// 드래그 앤 드롭 정렬
// ==========================================
const dragIndex = ref(null);

const onDragStart = (index) => {
  dragIndex.value = index;
};

const onDragOver = (e, index) => {
  e.preventDefault();
  if (dragIndex.value === null || dragIndex.value === index) return;

  // 배열에서 드래그한 행을 떼어서 목표 위치에 삽입
  const list = formData.value.payrollData;
  const dragged = list.splice(dragIndex.value, 1)[0];
  list.splice(index, 0, dragged);
  dragIndex.value = index; // 인덱스 갱신
};

const onDragEnd = () => {
  dragIndex.value = null;
};

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
    vatBreakdown: {
      under135: { area: '', unitPrice: '', supply: 0 },
      over135: { area: '', unitPrice: '', supply: 0, vat: 0 }
    }
  },
  payrollData: []
});

const getWageCode = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    items.value = res.data.data || [];
  } catch (err) {
    console.error("급여 항목 로드 실패", err);
  }
};

onMounted(() => {
  fetchSiteOptions();
  fetchTypeOptions();
  getWageCode();
});

const handleSiteChange = () => {
  const selectedSite = siteOptions.value.find(s => s.idx === formData.value.sIdx);
  if (selectedSite) {
    formData.value.siteName = selectedSite.name;
    formData.value.is_vat = selectedSite.is_vat || 'N';
  } else {
    formData.value.siteName = '';
    formData.value.is_vat = 'N';
  }
  calculateBillingTotal();
};

const initForm = () => {
  if (props.initialData && Object.keys(props.initialData).length > 0) {
    const data = JSON.parse(JSON.stringify(props.initialData));

    if (!data.payrollData) data.payrollData = [];
    if (!data.billingData) data.billingData = { items: [], bankInfo: '기업은행 301-051564-01-017 (예금주: 에코그린티엠)' };
    if (!data.billingData.items) data.billingData.items = [];

    if (!data.billingData.vatBreakdown) {
      data.billingData.vatBreakdown = {
        under135: { area: '', unitPrice: '', supply: 0 },
        over135: { area: '', unitPrice: '', supply: 0, vat: 0 }
      };
    }

    data.payrollData.forEach(row => {
      if (!row.deductionItems) row.deductionItems = {};
      row.totalDeduct = row.totalDeduct || 0;
      if (!row.reserves) row.reserves = {};
      row.reserves.annualLeave = row.reserves.annualLeave || 0;
      row.reserves.severance = row.reserves.severance || 0;
    });

    const selectedSite = siteOptions.value.find(s => s.idx === data.sIdx);
    data.is_vat = selectedSite ? selectedSite.is_vat : (data.vatAmount > 0 ? 'Y' : 'N');

    formData.value = data;

    if (data.defaultTab) {
      activeTab.value = data.defaultTab;
    }
  } else {
    formData.value = {
      sIdx: '', siteName: '', is_vat: 'N', type: '청소',
      target_month: '', docNo: '', billingDt: '',
      subTotal: 0, vatAmount: 0, grandTotal: 0,
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
// [TAB 1] 청구 공문 처리 로직
// ==========================================
const addBillingRow = () => {
  formData.value.billingData.items.push({ period: '', category: '', detail: '', amount: 0, note: '' });
};

const removeBillingRow = (index) => {
  formData.value.billingData.items.splice(index, 1);
  calculateBillingTotal();
};

const calculateAreaSupply = () => {
  const underArea = Number(formData.value.billingData.vatBreakdown.under135.area) || 0;
  const overArea = Number(formData.value.billingData.vatBreakdown.over135.area) || 0;
  const totalArea = underArea + overArea;
  const topTableSum = formData.value.billingData.items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

  if (totalArea > 0 && topTableSum > 0) {
    const unitPrice = topTableSum / totalArea;
    formData.value.billingData.vatBreakdown.under135.unitPrice = unitPrice.toFixed(2);
    formData.value.billingData.vatBreakdown.over135.unitPrice = unitPrice.toFixed(2);

    const underSupply = Math.round(unitPrice * underArea) - 1;
    formData.value.billingData.vatBreakdown.under135.supply = underSupply;

    const overSupply = topTableSum - underSupply;
    formData.value.billingData.vatBreakdown.over135.supply = overSupply;

    const overVat = Math.floor(overSupply * 0.1);
    formData.value.billingData.vatBreakdown.over135.vat = overVat;

    formData.value.subTotal = underSupply + overSupply;
    formData.value.vatAmount = overVat;
    formData.value.grandTotal = formData.value.subTotal + formData.value.vatAmount;
  }
};

const calculateBillingTotal = () => {
  const topTableSum = formData.value.billingData.items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  if (formData.value.is_vat === 'Y') calculateAreaSupply();
  else {
    formData.value.subTotal = topTableSum;
    formData.value.vatAmount = 0;
    formData.value.grandTotal = topTableSum;
  }
};

const handleManualBreakdownUpdate = () => {
  const overVat = Number(formData.value.billingData.vatBreakdown.over135.vat) || 0;
  formData.value.vatAmount = overVat;
  formData.value.grandTotal = formData.value.subTotal + overVat;
};

// ==========================================
// [TAB 2] 급여 세부 내역서 처리 로직
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
    const [year, month] = (formData.value.target_month || formData.value.billingDt).split('-');

    // API 호출
    const res = await axios.get(`/api/v1/member/payroll/month`, { params: { year, month } });

    // 선택된 현장(sIdx)과 구분(type)이 일치하는 직원만 필터링
    let result = res.data.data.filter(item => item.type == formData.value.type && item.sIdx == formData.value.sIdx);

    // JSON 데이터 안전 파싱 함수 (null이나 문자열 에러 방지)
    const safeParse = (val) => {
      if (!val) return {};
      if (typeof val === 'string') {
        try { return JSON.parse(val); } catch(e) { return {}; }
      }
      return val;
    };

    // 필터링된 DB 데이터를 프론트엔드 테이블 폼에 맞게 매핑
    formData.value.payrollData = result.map(item => {
      const parsedDeductions = safeParse(item.deductionItems);
      const parsedPayItems = safeParse(item.payItems);

      // 화면에 노출되는 4대보험 항목들만 공제계에 합산
      let totalDeduct = 0;
      deductionItems.value.forEach(dItem => {
        totalDeduct += (Number(parsedDeductions[dItem.itemCd]) || 0);
      });

      return {
        idx: item.idx, // 나중에 개별 저장 시 필요할 수 있으므로 직원 idx 보존
        empName: item.staff, // DB의 staff -> empName
        position: item.role || '', // DB의 role -> position (null이면 빈칸)
        grossPay: Number(item.grossPay) || 0,
        payItems: parsedPayItems, // 급여 자동계산을 위해 payItems도 세팅
        deductionItems: parsedDeductions,
        totalDeduct: totalDeduct,
        reserves: {
          annualLeave: 0, // 현재 DB 스키마에 없으므로 0 세팅
          severance: 0    // 현재 DB 스키마에 없으므로 0 세팅
        },
        netPay: (Number(item.grossPay) || 0) - totalDeduct
      };
    });

    if (formData.value.payrollData.length === 0) {
      alert('조건에 맞는 직원 데이터가 없습니다.');
    } else {
      alert('직원 급여 데이터를 성공적으로 불러왔습니다.');
    }

  } catch (error) {
    console.error('데이터 로드 에러:', error);
    alert('데이터를 불러오는 중 오류가 발생했습니다.');
  }
};

const addPayrollRow = () => {
  formData.value.payrollData.push({
    empName: '', position: '', grossPay: 0,
    deductionItems: {},
    totalDeduct: 0,
    reserves: { annualLeave: 0, severance: 0 },
    netPay: 0
  });
};

const removePayrollRow = (index) => {
  if(confirm('이 직원의 데이터를 삭제하시겠습니까?')) formData.value.payrollData.splice(index, 1);
};

// ★ [수정됨] 엑셀 셀 값을 변경할 때 화면에 노출된 항목들만 재계산
const calculateRow = (row) => {
  let totalDeduct = 0;
  deductionItems.value.forEach(item => {
    totalDeduct += (Number(row.deductionItems[item.itemCd]) || 0);
  });

  row.totalDeduct = totalDeduct;
  row.netPay = (Number(row.grossPay) || 0) - totalDeduct;
};

// 💡 하단 푸터 (총계) 동적 계산 로직
const payrollTotals = computed(() => {
  const totals = {
    grossPay: 0,
    totalDeduct: 0,
    netPay: 0,
    annualLeave: 0,
    severance: 0,
    deductionItems: {}
  };

  formData.value.payrollData.forEach(row => {
    totals.grossPay += Number(row.grossPay) || 0;
    totals.totalDeduct += Number(row.totalDeduct) || 0;
    totals.netPay += Number(row.netPay) || 0;
    totals.annualLeave += Number(row.reserves?.annualLeave) || 0;
    totals.severance += Number(row.reserves?.severance) || 0;

    if (deductionItems.value) {
      deductionItems.value.forEach(item => {
        const code = item.itemCd;
        if (!totals.deductionItems[code]) totals.deductionItems[code] = 0;
        if (row.deductionItems && row.deductionItems[code]) {
          totals.deductionItems[code] += Number(row.deductionItems[code]);
        }
      });
    }
  });

  return totals;
});

// ==========================================
// API 저장 로직
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
      // closeModal();
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
          <button class="btn-save" @click="handleSave"><i class="mdi mdi-content-save"></i> <span class="btn-text">저장하기</span></button>
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
            <div class="doc-header text-center">
              <h1>청 구 공 문</h1>
            </div>

            <div class="form-grid">
              <div class="form-group">
                <label>현장 선택 <span class="text-red">*</span></label>
                <select v-model="formData.sIdx" @change="handleSiteChange" class="form-select">
                  <option value="" disabled>현장을 선택해주세요</option>
                  <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
                </select>
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
                <i class="mdi mdi-format-list-checks"></i>
                청구 내역
                <span v-if="formData.is_vat === 'N'" class="vat-badge vat-free">(면세 사업장)</span>
                <span v-else class="vat-badge vat-taxed">(과세 사업장)</span>
              </h4>
              <button class="btn-add-row" @click="addBillingRow">
                <i class="mdi mdi-plus-thick"></i> <span class="btn-text">항목 추가</span>
              </button>
            </div>

            <div class="table-scroll-wrapper">
              <table class="excel-table statement-table">
                <thead>
                <tr>
                  <th style="min-width:120px;">산정기간</th>
                  <th style="min-width:80px;">구분</th>
                  <th style="min-width:160px;">내역</th>
                  <th style="min-width:110px;">산출금액</th>
                  <th style="min-width:100px;">비고</th>
                  <th style="width:40px;"></th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(item, index) in formData.billingData.items" :key="'bill-'+index">
                  <td><input type="text" v-model="item.period" class="cell-input text-center" placeholder="26.01.01~01.31" /></td>
                  <td><input type="text" v-model="item.category" class="cell-input text-center" placeholder="미화, 경비" /></td>
                  <td><input type="text" v-model="item.detail" class="cell-input" placeholder="1월 미화용역비" /></td>
                  <td><input type="number" v-model="item.amount" @input="calculateBillingTotal" class="cell-input text-right font-bold text-blue" /></td>
                  <td><input type="text" v-model="item.note" class="cell-input" placeholder="비고 입력" /></td>
                  <td class="text-center">
                    <button class="btn-delete-row" @click="removeBillingRow(index)"><i class="mdi mdi-minus"></i></button>
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
            </div>

            <div v-if="formData.is_vat === 'Y'" class="vat-breakdown-wrapper mt-5">
              <h4><i class="mdi mdi-domain"></i> 과세/면세 관리면적별 산출내역
                <span class="text-gray-400" style="font-size: 12px; font-weight: normal;">(이 표의 합계가 총 청구액이 됩니다)</span>
              </h4>
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
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.under135.area" @input="calculateAreaSupply" class="cell-input text-right" placeholder="면적입력" /></td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.under135.unitPrice" @input="calculateAreaSupply" class="cell-input text-right" placeholder="단가입력" /></td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.under135.supply" @input="calculateBillingTotal" class="cell-input text-right font-bold text-blue" /></td>
                    <td class="text-right bg-gray-50 text-gray-400">0</td>
                    <td class="text-right font-bold text-blue bg-blue-light">{{ formatCurrency(formData.billingData.vatBreakdown.under135.supply) }}</td>
                  </tr>
                  <tr>
                    <td class="text-center font-bold bg-gray-50">135㎡ 초과 (과세)</td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.area" @input="calculateAreaSupply" class="cell-input text-right" placeholder="면적입력" /></td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.unitPrice" @input="calculateAreaSupply" class="cell-input text-right" placeholder="단가입력" /></td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.supply" @input="handleManualBreakdownUpdate" class="cell-input text-right font-bold text-blue" /></td>
                    <td><input type="number" v-model="formData.billingData.vatBreakdown.over135.vat" @input="handleManualBreakdownUpdate" class="cell-input text-right font-bold text-red" /></td>
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
            <div class="action-btns">
              <button class="btn-load-data" @click="loadPayrollData">
                <i class="mdi mdi-download-box-outline"></i> <span class="btn-text">데이터 불러오기</span>
              </button>
              <button class="btn-add-row" @click="addPayrollRow">
                <i class="mdi mdi-plus-thick"></i> <span class="btn-text">직원 추가</span>
              </button>
            </div>
          </div>

          <div class="excel-table-wrapper">
            <table class="excel-table">
              <thead>
              <tr>
                <th rowspan="2" style="min-width:50px;">NO</th>
                <th rowspan="2" style="min-width:70px;">이름</th>
                <th rowspan="2" style="min-width:70px;">직책</th>
                <th rowspan="2" class="bg-blue-light" style="min-width:100px;">지급총액</th>
                <th :colspan="deductionItems.length || 1" class="bg-red-light">공제항목 (근로자 부담금)</th>
                <th rowspan="2" class="bg-red-light" style="min-width:80px;">공제계</th>
                <th rowspan="2" class="bg-green-light" style="min-width:100px;">차인지급액</th>
                <th colspan="2" class="bg-yellow-light">단지 적립금</th>
                <th rowspan="2" style="min-width:50px;">관리</th>
              </tr>
              <tr>
                <th v-for="item in deductionItems" :key="item.itemCd" class="bg-red-light" style="min-width:90px;">{{ item.itemNm }}</th>
                <th class="bg-yellow-light" style="min-width:80px;">연차적립</th>
                <th class="bg-yellow-light" style="min-width:80px;">퇴직적립</th>
              </tr>
              </thead>
              <tbody>
              <tr
                  v-for="(row, index) in formData.payrollData"
                  :key="'pay-'+index"
                  draggable="true"
                  @dragstart="onDragStart(index)"
                  @dragover="onDragOver($event, index)"
                  @dragend="onDragEnd"
                  :class="{ 'dragging': dragIndex === index }"
              >
                <td class="text-center drag-handle">
                  <i class="mdi mdi-drag-vertical drag-icon"></i>
                  <span>{{ index + 1 }}</span>
                </td>
                <td><input type="text" v-model="row.empName" class="cell-input text-center" placeholder="이름"/></td>
                <td><input type="text" v-model="row.position" class="cell-input text-center" placeholder="직책"/></td>
                <td><input type="number" v-model="row.grossPay" @input="calculateRow(row)" class="cell-input text-right font-bold text-blue"/></td>
                <td v-for="item in deductionItems" :key="item.itemCd">
                  <input type="number" v-model="row.deductionItems[item.itemCd]" @input="calculateRow(row)" class="cell-input text-right"/>
                </td>
                <td class="text-right font-bold bg-gray-50">{{ formatCurrency(row.totalDeduct) }}</td>
                <td class="text-right font-bold text-green bg-green-50">{{ formatCurrency(row.netPay) }}</td>
                <td><input type="number" v-model="row.reserves.annualLeave" class="cell-input text-right"/></td>
                <td><input type="number" v-model="row.reserves.severance" class="cell-input text-right"/></td>
                <td class="text-center">
                  <button class="btn-delete-row" @click="removePayrollRow(index)">
                    <i class="mdi mdi-trash-can-outline"></i>
                  </button>
                </td>
              </tr>
              <tr v-if="formData.payrollData.length === 0">
                <td :colspan="10 + (deductionItems.length || 0)" class="empty-row">
                  등록된 직원 데이터가 없습니다. '데이터 불러오기' 또는 '직원 추가'를 눌러주세요.
                </td>
              </tr>
              </tbody>
              <tfoot v-if="formData.payrollData.length > 0">
              <tr class="bg-gray-50 font-bold" style="font-size: 14px;">
                <td colspan="3" class="text-center">총 계</td>
                <td class="text-right text-blue bg-blue-light">{{ formatCurrency(payrollTotals.grossPay) }}</td>
                <td class="text-right" v-for="item in deductionItems" :key="'foot-'+item.itemCd">
                  {{ formatCurrency(payrollTotals.deductionItems[item.itemCd]) }}
                </td>
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
/* =============================================
   기본 레이아웃 및 모달 (테마 연동)
============================================= */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000; padding: 16px; box-sizing: border-box;
}

.modal-container {
  background: var(--bg-surface); width: 100%; max-width: 1400px; height: 90vh;
  border-radius: 16px; display: flex; flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); overflow: hidden; border: 1px solid var(--border-color);
}

/* =============================================
   모달 헤더
============================================= */
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px; border-bottom: 1px solid var(--border-color); background: var(--bg-canvas); gap: 12px; flex-wrap: wrap;
}
.header-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; min-width: 0; }
.header-title h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-main); white-space: nowrap; }

.badge {
  padding: 3px 8px; background: var(--primary-soft); color: var(--primary);
  border-radius: 6px; font-size: 12px; font-weight: 600; white-space: nowrap;
}

.header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

.btn-save {
  background: var(--primary); color: var(--text-inverse); border: none;
  padding: 8px 14px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: 0.2s;
  display: flex; align-items: center; gap: 6px; font-size: 14px; white-space: nowrap;
}
.btn-save:hover { background: var(--primary-hover); transform: translateY(-1px); }

.btn-close {
  background: none; border: none; font-size: 22px; color: var(--text-muted);
  cursor: pointer; transition: 0.2s; padding: 4px; line-height: 1; border-radius: 6px;
}
.btn-close:hover { background: var(--bg-hover); color: var(--danger); }

/* =============================================
   탭
============================================= */
.modal-tabs {
  display: flex; padding: 0 16px; border-bottom: 1px solid var(--border-color); background: var(--bg-surface); flex-shrink: 0;
}
.tab-btn {
  padding: 14px 18px; background: none; border: none; border-bottom: 3px solid transparent;
  font-size: 14px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: 0.2s;
  display: flex; align-items: center; gap: 6px; margin-bottom: -1px; white-space: nowrap;
}
.tab-btn:hover { color: var(--text-main); }
.tab-btn.active { color: var(--primary); border-bottom-color: var(--primary); }

/* =============================================
   모달 바디
============================================= */
.modal-body {
  flex: 1; overflow-y: auto; padding: 20px; background: var(--bg-canvas); -webkit-overflow-scrolling: touch;
}
.modal-body::-webkit-scrollbar { width: 8px; }
.modal-body::-webkit-scrollbar-track { background: var(--bg-canvas); }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

/* =============================================
   공문(표지) 문서
============================================= */
.document-paper {
  max-width: 860px; margin: 0 auto; background: var(--bg-surface);
  padding: 32px 28px; border-radius: 8px; box-shadow: var(--shadow-sm); border: 1px solid var(--border-color);
}
.doc-header h1 {
  font-size: 26px; letter-spacing: 8px; margin-bottom: 32px;
  border-bottom: 2px solid var(--text-main); padding-bottom: 18px; color: var(--text-main);
}

.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-sub); margin-bottom: 6px; }
.form-input, .form-select {
  width: 100%; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 14px; color: var(--text-main); background: var(--bg-canvas); box-sizing: border-box; outline: none; transition: border-color 0.2s;
}
.form-input:focus, .form-select:focus { border-color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary-soft); background: var(--bg-surface);}
.bg-gray { background-color: var(--bg-hover) !important; color: var(--text-muted); cursor: not-allowed; border-color: transparent;}

.doc-message { margin: 20px 0; line-height: 1.8; color: var(--text-main); font-size: 14px; }

.vat-badge { font-size: 12px; margin-left: 6px; font-weight: normal; }
.vat-free { color: var(--danger); }
.vat-taxed { color: var(--primary); }

/* =============================================
   테이블 공통
============================================= */
.table-actions {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 10px;
}
.table-actions h4 { margin: 0; font-size: 15px; color: var(--text-main); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.table-actions h4 i { color: var(--primary); font-size: 18px;}

.action-btns { display: flex; gap: 8px; flex-wrap: wrap; }

.btn-add-row {
  display: flex; align-items: center; gap: 4px; padding: 6px 12px;
  background: var(--success); color: var(--text-inverse); border: none; border-radius: 6px;
  font-weight: 600; cursor: pointer; font-size: 13px; white-space: nowrap; transition: 0.2s;
}
.btn-add-row:hover { background: var(--success-hover); transform: translateY(-1px);}

.btn-load-data {
  display: flex; align-items: center; gap: 4px; padding: 6px 12px;
  background: var(--bg-surface); color: var(--primary); border: 1px solid var(--primary);
  border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; transition: all 0.2s; white-space: nowrap;
}
.btn-load-data:hover { background: var(--primary-soft); transform: translateY(-1px);}

.table-scroll-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; border-radius: 4px; }
.excel-table-wrapper {
  background: var(--bg-surface); border-radius: 8px; border: 1px solid var(--border-color);
  overflow-x: auto; box-shadow: var(--shadow-sm); -webkit-overflow-scrolling: touch;
}

.excel-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.excel-table th, .excel-table td { border: 1px solid var(--border-color); padding: 6px; vertical-align: middle; }
.excel-table thead th { background: var(--bg-hover); font-weight: 600; text-align: center; color: var(--text-main); padding: 10px 8px; white-space: nowrap; }
.statement-table tfoot td { padding: 10px; }

/* =============================================
   계좌 정보
============================================= */
.bank-info {
  display: flex; align-items: center; gap: 10px; background: var(--bg-canvas);
  padding: 14px; border-radius: 8px; border: 1px solid var(--border-color); flex-wrap: wrap;
}
.bank-info label { font-weight: 600; color: var(--text-main); white-space: nowrap; }
.bank-input {
  flex: 1; min-width: 200px; padding: 8px 12px; border: 1px solid var(--border-focus); border-radius: 6px;
  font-size: 14px; font-weight: bold; color: var(--text-main); background: var(--bg-surface); outline: none; transition: 0.2s;
}
.bank-input:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }

/* =============================================
   헤더 및 셀 배경 색상 (테마 변수 매핑)
============================================= */
.bg-blue-light { background-color: rgba(59, 130, 246, 0.1) !important; color: #2563eb !important; }
.bg-red-light { background-color: rgba(239, 68, 68, 0.1) !important; color: #dc2626 !important; }
.bg-green-light { background-color: rgba(16, 185, 129, 0.1) !important; color: #059669 !important; }
.bg-yellow-light { background-color: rgba(245, 158, 11, 0.1) !important; color: #b45309 !important; }
.bg-gray-50 { background-color: var(--bg-canvas); }
.bg-green-50 { background-color: rgba(16, 185, 129, 0.05); }

/* =============================================
   셀 인풋
============================================= */
.cell-input {
  width: 100%; border: 1px solid transparent; background: transparent; padding: 4px;
  outline: none; transition: 0.2s; border-radius: 4px; box-sizing: border-box; font-size: 13px; color: var(--text-main);
}
.cell-input:focus, .cell-input:hover { border-color: var(--primary); background: var(--bg-surface); }

/* =============================================
   드래그
============================================= */
.drag-handle { cursor: grab; user-select: none; }
.drag-icon { color: var(--text-muted); font-size: 16px; vertical-align: middle; margin-right: 2px; }
.dragging { opacity: 0.4; background: var(--primary-soft) !important; }

/* =============================================
   기타 유틸
============================================= */
.empty-row { text-align: center; padding: 32px 16px; color: var(--text-muted); font-size: 13px; }
.btn-delete-row {
  background: rgba(239, 68, 68, 0.1); color: var(--danger); border: none;
  padding: 4px; border-radius: 4px; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; justify-content: center;
}
.btn-delete-row:hover { background: var(--danger); color: var(--text-inverse); }

.text-center { text-align: center; }
.text-right { text-align: right; }
.font-bold { font-weight: 700; }
.text-blue { color: #2563eb; }
.text-red { color: var(--danger); }
.text-green { color: var(--success); }
.text-gray-400 { color: var(--text-muted); }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.mt-5 { margin-top: 30px; }

input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }

/* =============================================
   반응형
============================================= */
@media (max-width: 1024px) {
  .modal-overlay { padding: 10px; }
  .modal-container { height: 95vh; }
  .document-paper { padding: 24px 20px; }
}

@media (max-width: 768px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal-container { height: 96vh; border-radius: 16px 16px 0 0; max-width: 100%; }
  .modal-header { padding: 12px 16px; }
  .header-title h2 { font-size: 15px; }
  .badge { display: none; }
  .modal-tabs { padding: 0 8px; }
  .tab-btn { padding: 12px 12px; font-size: 13px; }
  .tab-text { display: none; }
  .modal-body { padding: 12px; }
  .document-paper { padding: 16px 14px; }
  .doc-header h1 { font-size: 18px; letter-spacing: 4px; margin-bottom: 20px; }
  .form-grid { grid-template-columns: 1fr; gap: 12px; }
  .btn-text { display: none; }
  .action-btns { gap: 6px; }
  .btn-add-row, .btn-load-data { padding: 7px 10px; }
  .excel-table { font-size: 12px; }
  .excel-table thead th { padding: 8px 6px; font-size: 11px; }
  .excel-table td { padding: 4px; }
  .cell-input { font-size: 12px; padding: 3px; }
}

@media (max-width: 480px) {
  .header-title h2 { font-size: 14px; }
  .modal-body { padding: 8px; }
  .document-paper { padding: 12px 10px; }
  .doc-header h1 { font-size: 16px; letter-spacing: 3px; }
  .tab-btn { padding: 10px 10px; }
}
</style>
