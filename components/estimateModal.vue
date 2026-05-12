<script setup>
/**
 * EstimateModal.vue — 퇴직금·연차 정산 요청서 모달
 * [최종 통합본] 원본 코드/디자인 100% 보존 + 날짜 형식(yy.mm.dd) + 산출근거 포맷 수정
 */
import { ref, computed, watch, onMounted } from 'vue';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useAuthStore } from '~/stores/auth.js';

const { siteOptions, typeOptions, fetchSiteOptions, fetchTypeOptions } = useApi();
const authStore = useAuthStore();

const props = defineProps({
  isOpen:       Boolean,
  settlementId: Number,
  initialData:  Object,
});
const emit = defineEmits(['close', 'save']);

// ─────────────────────────────────────────────────────────────
// [추가] 날짜 및 텍스트 포맷 유틸리티 (이미지 스타일 준수)
// ─────────────────────────────────────────────────────────────
const toYYMMDD = (dateStr) => {
  if (!dateStr || dateStr === '재직중') return dateStr;
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}.${mm}.${dd}`;
};

// ─────────────────────────────────────────────────────────────
// 직원 검색 및 계산 로직
// ─────────────────────────────────────────────────────────────
const allEmployees = ref([]);
const searchState = ref({ index: null, type: null });

const fetchAllEmployees = async () => {
  if (!formData.value.sIdx) return;
  try {
    const res = await axios.get('/api/v1/member/payroll', { params: { sIdx: formData.value.sIdx } });
    allEmployees.value = res.data.data || [];
  } catch (e) { console.error('직원 목록 로드 실패', e); }
};

const getFilteredEmployees = (query) => {
  if (!query) return [];
  return allEmployees.value.filter(emp => emp.staff.includes(query)).slice(0, 10);
};

// 근속 및 기간 상세 계산 (정산기간 yy.mm.dd 포맷용)
const calculateTenureInfo = (start, end) => {
  if (!start || !end || end === '재직중') return null;
  const sDate = new Date(start);
  const eDate = new Date(end);
  if (isNaN(sDate) || isNaN(eDate)) return null;

  const diffTime = eDate - sDate + (1000 * 60 * 60 * 24);
  const totalDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  if (totalDays < 0) return null;

  const years = Math.floor(totalDays / 365);
  const months = Math.floor((totalDays % 365) / 30.41);
  const days = Math.floor((totalDays % 365) % 30.41) + 1; // 종료일 포함

  let text = '';
  if (years > 0) text += `${years * 12 + months}개월 `;
  else if (months > 0) text += `${months}개월 `;
  if (days > 0) text += `${days}일`;

  return { totalDays, text: text.trim() || '0일', start: toYYMMDD(start), end: toYYMMDD(end) };
};

// 퇴직금 산출 실행 (LEGAL: 법정산식, CONTRACT: 이미지의 적립금형)
const onRetireCalc = (item) => {
  if (!item.joinDate || !item.endDate || !item.position) return;
  const tenure = calculateTenureInfo(item.joinDate, item.endDate);
  if (!tenure) return;

  const { basePay, severance } = getContractAmounts(item.position);
  item.period = `${tenure.start}~${tenure.end}`; // 이미지 스타일: yy.mm.dd~yy.mm.dd

  if (item.calcMode === 'LEGAL') {
    const rawAmount = basePay * (tenure.totalDays / 365);
    item.amount = Math.floor(rawAmount / 10) * 10;
    item.basis = `${fc(basePay)}/365*${tenure.totalDays}일`;
  } else {
    const rawAmount = severance * (tenure.totalDays / 30.41);
    item.amount = Math.floor(rawAmount / 10) * 10;
    item.basis = `(${fc(severance)}*${tenure.text})`; // 이미지 스타일: (단가*개월 일)
  }
};

const selectEmployee = (item, emp, type) => {
  item.empName  = emp.staff;
  item.position = emp.role || '';
  item.birthDt  = emp.birthDt || '';
  item.joinDate = emp.inDate || '';
  item.endDate  = emp.outDate || '';
  searchState.value = { index: null, type: null };
  if (type === 'RETIRE') onRetireCalc(item);
  else onPositionChange(item, type);
};

// ─────────────────────────────────────────────────────────────
// 계약 데이터 (산출내역서) - [원본 유지]
// ─────────────────────────────────────────────────────────────
const contractStaffList    = ref([]);
const contractDirectLabor  = ref([]);
const contractIndirectLabor = ref([]);
const isLoadingContract    = ref(false);

const fetchContractData = async () => {
  const sIdx = formData.value.sIdx;
  const type = formData.value.type;
  contractStaffList.value = []; contractDirectLabor.value = []; contractIndirectLabor.value = [];
  if (!sIdx || !type) return;
  isLoadingContract.value = true;
  try {
    const res = await axios.get(`/api/v1/site/data/${sIdx}`);
    const siteData = res.data.data?.[0];
    if (!siteData?.contractList) return;
    const parsed = typeof siteData.contractList === 'string' ? JSON.parse(siteData.contractList) : siteData.contractList;
    const target = parsed.find(c => c.type === type);
    if (target) {
      contractStaffList.value = Array.isArray(target.staffList) ? target.staffList : [];
      contractDirectLabor.value = Array.isArray(target.budget?.directLabor) ? target.budget.directLabor : [];
      contractIndirectLabor.value = Array.isArray(target.budget?.indirectLabor) ? target.budget.indirectLabor : [];
    }
  } catch (e) { console.error(e); } finally { isLoadingContract.value = false; }
};

const staffNames = computed(() => contractStaffList.value.map(s => s.name));

const getContractAmounts = (staffName) => {
  const staffObj = contractStaffList.value.find(s => s.name === staffName?.trim());
  if (!staffObj) return { basePay: 0, annualLeave: 0, severance: 0 };
  const code = staffObj.code;
  const all = [...contractDirectLabor.value, ...contractIndirectLabor.value];
  const findVal = (key) => {
    const item = all.find(d => d.label === key || String(d.label).includes(key));
    return item?.values?.[code] ? Number(item.values[code]) : 0;
  };
  return { basePay: findVal('04001001'), annualLeave: findVal('04003001'), severance: findVal('04003003') };
};

// ─────────────────────────────────────────────────────────────
// 행 템플릿 및 초기화 - [원본 유지]
// ─────────────────────────────────────────────────────────────
const newItem = (type) => ({
  itemType: type, empName: '', position: '', birthDt: '', joinDate: '', endDate: '', period: '', basis: '', amount: 0, note: '',
  calcMode: type === 'RETIRE' ? 'LEGAL' : 'NORMAL'
});

const hasAnnual = ref(false);
const hasRetire = ref(false);

const formData = ref({
  sIdx: '', siteName: '', type: '', target_month: '', docNo: '', billingDt: '',
  summary: '연차 및 퇴직수당 정산요청의 건', bankInfo: '301-051564-01-017(기업은행, 예금주: 에코그린티엠)', attachment: '1. 전자 계산서',
  annualItems: [newItem('ANNUAL')], retireItems: [newItem('RETIRE')],
});

const initForm = () => {
  if (props.initialData && Object.keys(props.initialData).length > 0) {
    const src = props.initialData;
    const bd  = src.billingData || {};
    let loadedAnnual = [], loadedRetire = [];
    if (Array.isArray(src.payrollData)) {
      loadedAnnual = src.payrollData.filter(row => row.itemType === 'ANNUAL' || !row.itemType).map(row => ({ ...newItem('ANNUAL'), ...row }));
      loadedRetire = src.payrollData.filter(row => row.itemType === 'RETIRE').map(row => ({ ...newItem('RETIRE'), ...row }));
    }
    hasAnnual.value = loadedAnnual.length > 0;
    hasRetire.value = loadedRetire.length > 0;
    formData.value = {
      sIdx: src.sIdx || '', siteName: src.siteName || '', type: src.type || '', target_month: '', docNo: src.docNo || '', billingDt: src.billingDt || '',
      summary: bd.summary || '연차 및 퇴직수당 정산요청의 건', bankInfo: bd.bankInfo || '301-051564-01-017(기업은행, 예금주: 에코그린티엠)', attachment: bd.attachment || '1. 전자 계산서',
      annualItems: loadedAnnual.length > 0 ? loadedAnnual : [newItem('ANNUAL')], retireItems: loadedRetire.length > 0 ? loadedRetire : [newItem('RETIRE')],
    };
    if (src.sIdx) { fetchContractData(); fetchAllEmployees(); }
  }
};
watch(() => props.initialData, initForm, { immediate: true });

const handleSiteChange = () => {
  const site = siteOptions.value.find(s => s.idx === formData.value.sIdx);
  formData.value.siteName = site ? site.name : '';
  updateSummary(); fetchContractData(); fetchAllEmployees();
};

const handleTypeChange = () => { updateSummary(); fetchContractData(); };

const updateSummary = () => {
  const typeNm = typeOptions.value.find(t => t.itemCd === formData.value.type)?.itemNm || formData.value.type;
  if (typeNm) formData.value.summary = `연차 및 퇴직수당 정산요청의 건(${typeNm})`;
};

// 연차 정산 기간 (입사일 ~ 청구일) 및 산출근거 로직
const onPositionChange = (item, type) => {
  if (!item.position) return;
  if (type === 'RETIRE') { onRetireCalc(item); }
  else {
    const { basePay, annualLeave } = getContractAmounts(item.position);
    item.amount = annualLeave;
    // 이미지 스타일: 금액/209*8*15개
    item.basis  = basePay > 0 ? `${fc(basePay)}/209*8*15개` : '';
    // 기간 설정: 입사일 ~ 청구일자(billingDt)
    if (item.joinDate && formData.value.billingDt) {
      item.period = `${toYYMMDD(item.joinDate)}~${toYYMMDD(formData.value.billingDt)}`;
    }
  }
};

const toggleTable = (type, action) => {
  if (type === 'ANNUAL') { hasAnnual.value = action === 'add'; if (action === 'remove') formData.value.annualItems = [newItem('ANNUAL')]; }
  else { hasRetire.value = action === 'add'; if (action === 'remove') formData.value.retireItems = [newItem('RETIRE')]; }
};

const addRow = (type) => { if (type === 'ANNUAL') formData.value.annualItems.push(newItem('ANNUAL')); else formData.value.retireItems.push(newItem('RETIRE')); };
const removeRow = (type, index) => {
  const target = type === 'ANNUAL' ? formData.value.annualItems : formData.value.retireItems;
  if (target.length <= 1) { alert('최소 1명의 데이터가 필요합니다.'); return; }
  target.splice(index, 1);
};

const annualTotal = computed(() => hasAnnual.value ? formData.value.annualItems.reduce((s, i) => s + (Number(i.amount) || 0), 0) : 0);
const retireTotal = computed(() => hasRetire.value ? formData.value.retireItems.reduce((s, i) => s + (Number(i.amount) || 0), 0) : 0);
const grandTotal = computed(() => annualTotal.value + retireTotal.value);

const isSaving = ref(false);
const handleSave = async () => {
  if (!formData.value.sIdx) { alert('현장을 선택해주세요.'); return; }
  isSaving.value = true;
  try {
    const combinedPayroll = [...(hasAnnual.value ? formData.value.annualItems : []), ...(hasRetire.value ? formData.value.retireItems : [])];
    const payload = { ...formData.value, docType: 'RETIRE_ANNUAL', subTotal: grandTotal.value, grandTotal: grandTotal.value, payrollData: combinedPayroll, cIdx: authStore.user?.cIdx || 0 };
    const res = await axios.post(`/api/v1/settle/site/data/${formData.value.sIdx}`, payload);
    if (res.data.result) { alert('저장되었습니다.'); emit('save'); closeModal(); }
  } catch (e) { console.error(e); alert('서버 통신 오류'); } finally { isSaving.value = false; }
};

// 엑셀 내보내기 [원본 로직 유지]
const exportToExcel = () => {
  if (!hasAnnual.value && !hasRetire.value) { alert('출력할 정산 내역이 없습니다.'); return; }
  const wb = XLSX.utils.book_new();
  const siteName = formData.value.siteName || '현장미지정';
  const fileName = `연차퇴직정산_${siteName}_${formData.value.billingDt}.xlsx`;
  const rows = [['청 구 공 문'], [], ['수신', formData.value.siteName + ' 관리사무소'], ['문서번호', formData.value.docNo], ['시행일자', formData.value.billingDt], ['제목', formData.value.summary], [], ['1. 귀 소의 무궁한 발전을 기원합니다.'], ['2. 당월 퇴사자 발생으로 연차수당과 퇴직금을 아래와 같이 정산 요청하오니 검토 후 처리하여 주시기 바랍니다.'], [], ['- 아래 -'], []];
  const header = ['구분','이름','직책','생년월일','입사일','퇴사일','중간정산일','정산기간','산출근거','금액(원)','비고'];
  if (hasAnnual.value) { rows.push(['[연차수당 정산 내역]'], header); formData.value.annualItems.forEach((item, i) => rows.push([i+1, item.empName, item.position, item.birthDt, item.joinDate, item.endDate, item.middleDt, item.period, item.basis, item.amount, item.note])); rows.push(['','','','','','','','','소계', annualTotal.value]); rows.push([]); }
  if (hasRetire.value) { rows.push(['[퇴직수당 정산 내역]'], header); formData.value.retireItems.forEach((item, i) => rows.push([i+1, item.empName, item.position, item.birthDt, item.joinDate, item.endDate, item.middleDt, item.period, item.basis, item.amount, item.note])); rows.push(['','','','','','','','','소계', retireTotal.value]); rows.push([]); }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, '연차퇴직정산');
  XLSX.writeFile(wb, fileName);
};

const fc = (v) => Number(v || 0).toLocaleString();
const closeModal = () => emit('close');

onMounted(async () => {
  await Promise.all([fetchSiteOptions(), fetchTypeOptions()]);
  window.addEventListener('click', (e) => { if (!e.target.closest('.search-container')) { searchState.value = { index: null, type: null }; } });
});
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @mousedown.self="closeModal">
    <div class="modal-container">
      <div class="modal-header">
        <div class="header-title">
          <h2>{{ settlementId ? '연차·퇴직금 정산서 수정' : '새 연차·퇴직금 정산서 작성' }}</h2>
          <span class="badge">{{ formData.siteName || '현장 미지정' }}</span>
        </div>
        <div class="header-actions">
          <button class="btn-excel" @click="exportToExcel"><i class="mdi mdi-microsoft-excel"></i><span>엑셀 저장</span></button>
          <button class="btn-save" @click="handleSave" :disabled="isSaving"><i class="mdi mdi-content-save"></i><span>{{ isSaving ? '저장 중...' : '저장하기' }}</span></button>
          <button class="btn-close" @click="closeModal"><i class="mdi mdi-close"></i></button>
        </div>
      </div>

      <div class="modal-body">
        <div class="document-paper">
          <div class="doc-header text-center"><h1>청 구 공 문</h1></div>

          <div class="form-grid">
            <div class="form-group"><label>현장 선택 <span class="text-red">*</span></label>
              <select v-model="formData.sIdx" @change="handleSiteChange" class="form-select">
                <option value="" disabled>현장을 선택해주세요</option>
                <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
              </select>
            </div>
            <div class="form-group"><label>구분 (직종)</label>
              <select v-model="formData.type" @change="handleTypeChange" class="form-select">
                <option value="" disabled>직종 선택</option>
                <option v-for="tp in typeOptions" :key="tp.itemCd" :value="tp.itemCd">{{ tp.itemNm }}</option>
              </select>
            </div>
            <div class="form-group"><label>문서번호</label><input type="text" v-model="formData.docNo" class="form-input" placeholder="예: 에코그린 2026-02-39호" /></div>
            <div class="form-group"><label>시행일자</label><input type="date" v-model="formData.billingDt" class="form-input" /></div>
          </div>

          <div class="doc-message">
            <p>1. 귀 소의 무궁한 발전을 기원합니다.</p>
            <p>2. 당월 퇴사자 발생으로 연차수당과 퇴직금을 아래와 같이 정산 요청하오니 검토 후 처리하여 주시기 바랍니다.</p>
            <p class="text-center mt-4 font-bold">- 아 래 -</p>
          </div>

          <div v-if="isLoadingContract" class="contract-loading"><i class="mdi mdi-loading mdi-spin"></i> 산출내역서 로딩 중...</div>

          <div class="table-add-controls mt-5 text-center" v-if="!hasAnnual || !hasRetire">
            <button v-if="!hasAnnual" class="btn-outline-primary" style="margin-right: 6px;" @click="toggleTable('ANNUAL', 'add')"><i class="mdi mdi-plus"></i> 연차수당 표 추가</button>
            <button v-if="!hasRetire" class="btn-outline-warning" @click="toggleTable('RETIRE', 'add')"><i class="mdi mdi-plus"></i> 퇴직수당 표 추가</button>
          </div>

          <div v-if="hasAnnual" class="table-section mt-5">
            <div class="table-actions">
              <h4><i class="mdi mdi-calendar-check text-blue"></i> 연차수당 정산 내역</h4>
              <div class="action-group"><button class="btn-add-row" @click="addRow('ANNUAL')"><i class="mdi mdi-plus-thick"></i> 직원 추가</button><button class="btn-delete-table" @click="toggleTable('ANNUAL', 'remove')"><i class="mdi mdi-close"></i> 표 삭제</button></div>
            </div>
            <div class="table-scroll-wrapper">
              <table class="excel-table statement-table">
                <thead>
                <tr><th rowspan="2" style="width:20px;">NO</th><th colspan="8">내역</th><th rowspan="2" style="min-width:120px;">금액 (원)</th><th rowspan="2" style="min-width:140px;">비고</th><th rowspan="2" style="width:20px;"></th></tr>
                <tr><th style="min-width:70px;">이름</th><th style="min-width:70px;">직책</th><th style="min-width:80px;">생년월일</th><th style="min-width:100px;">입사일</th><th style="min-width:100px;">퇴사일</th><th style="min-width:100px;">중간정산일</th><th style="min-width:130px;">정산기간</th><th style="min-width:180px;">산출근거</th></tr>
                </thead>
                <tbody>
                <tr v-for="(item, index) in formData.annualItems" :key="'annual-' + index">
                  <td class="text-center font-bold text-gray">{{ index + 1 }}</td>
                  <td class="search-container">
                    <input type="text" v-model="item.empName" @input="searchState={index, type:'ANNUAL'}" @focus="searchState={index, type:'ANNUAL'}" class="cell-input text-center" placeholder="이름" />
                    <div v-if="searchState.index === index && searchState.type === 'ANNUAL' && getFilteredEmployees(item.empName).length > 0" class="search-dropdown">
                      <ul><li v-for="emp in getFilteredEmployees(item.empName)" :key="emp.idx" @click="selectEmployee(item, emp, 'ANNUAL')"><strong>{{ emp.staff }}</strong> | {{ emp.role }} ({{ emp.inDate }})</li></ul>
                    </div>
                  </td>
                  <td>
                    <select v-if="staffNames.length > 0" v-model="item.position" class="cell-input text-center" @change="onPositionChange(item, 'ANNUAL')"><option value="">선택</option><option v-for="name in staffNames" :key="name" :value="name">{{ name }}</option></select>
                    <input v-else type="text" v-model="item.position" class="cell-input text-center" />
                  </td>
                  <td><input type="text" v-model="item.birthDt" class="cell-input text-center" /></td>
                  <td><input type="date" v-model="item.joinDate" @change="onPositionChange(item, 'ANNUAL')" class="cell-input text-center" /></td>
                  <td><input type="text" v-model="item.endDate" class="cell-input text-center" /></td>
                  <td><input type="text" v-model="item.middleDt" class="cell-input text-center" /></td>
                  <td><input type="text" v-model="item.period" class="cell-input text-center" /></td>
                  <td><input type="text" v-model="item.basis" class="cell-input" /></td>
                  <td><input type="text" :value="fc(item.amount)" @input="item.amount = Number($event.target.value.replace(/,/g,'')) || 0" class="cell-input text-right font-bold text-blue" /></td>
                  <td><input type="text" v-model="item.note" class="cell-input" /></td>
                  <td class="text-center"><button class="btn-delete-row" @click="removeRow('ANNUAL', index)"><i class="mdi mdi-minus"></i></button></td>
                </tr>
                </tbody>
                <tfoot><tr class="tfoot-total"><td colspan="9" class="text-center">연차수당 소계</td><td class="text-right text-blue font-bold">{{ fc(annualTotal) }}</td><td colspan="2"></td></tr></tfoot>
              </table>
            </div>
          </div>

          <div v-if="hasRetire" class="table-section mt-5">
            <div class="table-actions">
              <h4><i class="mdi mdi-account-cash text-orange"></i> 퇴직수당 정산 내역</h4>
              <div class="action-group"><button class="btn-add-row btn-add-retire" @click="addRow('RETIRE')"><i class="mdi mdi-plus-thick"></i> 직원 추가</button><button class="btn-delete-table" @click="toggleTable('RETIRE', 'remove')"><i class="mdi mdi-close"></i> 표 삭제</button></div>
            </div>
            <div class="table-scroll-wrapper">
              <table class="excel-table statement-table">
                <thead>
                <tr>
                  <th rowspan="2" style="width:20px;">NO</th>
                  <th rowspan="2" style="width:90px;">방식</th>
                  <th colspan="7">내역</th>
                  <th rowspan="2" style="min-width:120px;">금액 (원)</th>
                  <th rowspan="2" style="min-width:140px;">비고</th>
                  <th rowspan="2" style="width:20px;"></th>
                </tr>
                <tr><th style="min-width:70px;">이름</th><th style="min-width:70px;">직책</th><th style="min-width:80px;">생년월일</th><th style="min-width:100px;">입사일</th><th style="min-width:100px;">퇴사일</th><th style="min-width:110px;">정산기간</th><th style="min-width:180px;">산출근거</th></tr>
                </thead>
                <tbody>
                <tr v-for="(item, index) in formData.retireItems" :key="'retire-' + index">
                  <td class="text-center font-bold text-gray">{{ index + 1 }}</td>
                  <td>
                    <select v-model="item.calcMode" @change="onRetireCalc(item)" class="cell-input font-bold" style="color: var(--primary);">
                      <option value="LEGAL">법정산식</option>
                      <option value="CONTRACT">적립금형</option>
                    </select>
                  </td>
                  <td class="search-container">
                    <input type="text" v-model="item.empName" @input="searchState={index, type:'RETIRE'}" @focus="searchState={index, type:'RETIRE'}" class="cell-input text-center" placeholder="이름" />
                    <div v-if="searchState.index === index && searchState.type === 'RETIRE' && getFilteredEmployees(item.empName).length > 0" class="search-dropdown">
                      <ul><li v-for="emp in getFilteredEmployees(item.empName)" :key="emp.idx" @click="selectEmployee(item, emp, 'RETIRE')"><strong>{{ emp.staff }}</strong> | {{ emp.role }} ({{ emp.inDate }})</li></ul>
                    </div>
                  </td>
                  <td>
                    <select v-if="staffNames.length > 0" v-model="item.position" class="cell-input text-center" @change="onPositionChange(item, 'RETIRE')"><option value="">선택</option><option v-for="name in staffNames" :key="name" :value="name">{{ name }}</option></select>
                    <input v-else type="text" v-model="item.position" class="cell-input text-center" />
                  </td>
                  <td><input type="text" v-model="item.birthDt" class="cell-input text-center" /></td>
                  <td><input type="date" v-model="item.joinDate" @change="onRetireCalc(item)" class="cell-input text-center" /></td>
                  <td><input type="date" v-model="item.endDate" @change="onRetireCalc(item)" class="cell-input text-center" /></td>
                  <td><input type="text" v-model="item.period" class="cell-input text-center" readonly /></td>
                  <td><input type="text" v-model="item.basis" class="cell-input" /></td>
                  <td><input type="text" :value="fc(item.amount)" @input="item.amount = Number($event.target.value.replace(/,/g,'')) || 0" class="cell-input text-right font-bold text-orange" /></td>
                  <td><input type="text" v-model="item.note" class="cell-input" /></td>
                  <td class="text-center"><button class="btn-delete-row" @click="removeRow('RETIRE', index)"><i class="mdi mdi-minus"></i></button></td>
                </tr>
                </tbody>
                <tfoot>
                <tr class="tfoot-total tfoot-retire">
                  <td colspan="10" class="text-center">퇴직수당 소계</td>
                  <td class="text-right font-bold text-orange">{{ fc(retireTotal) }}</td>
                  <td></td>
                </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <div v-if="hasAnnual && hasRetire" class="grand-total-box mt-4"><span class="grand-total-label">총 청구 합계액 (연차 + 퇴직수당)</span><span class="grand-total-value">{{ fc(grandTotal) }} 원</span></div>
          <div class="footer-info mt-5">
            <div class="info-row"><label>3. 입금계좌 :</label><input type="text" v-model="formData.bankInfo" class="meta-input flex-1" /></div>
            <div class="info-row mt-2"><label>첨부 :</label><input type="text" v-model="formData.attachment" class="meta-input flex-1" /></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── [완벽 복구] 사용자님의 원본 CSS 스타일 100% 유지 ── */
.modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 16px; box-sizing: border-box; }
.modal-container { background: var(--bg-surface); width: 100%; max-width: 1250px; height: 90vh; border-radius: 16px; display: flex; flex-direction: column; box-shadow: 0 20px 40px rgba(0,0,0,0.15); overflow: hidden; border: 1px solid var(--border-color); }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; border-bottom: 1px solid var(--border-color); background: var(--bg-canvas); gap: 12px; flex-shrink: 0; }
.header-title { display: flex; align-items: center; gap: 10px; }
.header-title h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-main); }
.badge { padding: 3px 10px; background: var(--primary-soft); color: var(--primary); border-radius: 6px; font-size: 12px; font-weight: 600; }
.header-actions { display: flex; gap: 10px; }
.btn-excel { background: rgba(5,150,105,.1); color: #059669; border: 1px solid rgba(5,150,105,.3); padding: 8px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: .2s; display: flex; align-items: center; gap: 6px; font-size: 14px; }
.btn-excel:hover { background: #059669; color: #fff; }
.btn-save { background: var(--primary); color: var(--text-inverse); border: none; padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 6px; font-size: 14px; }
.btn-save:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-close { background: none; border: none; font-size: 22px; color: var(--text-muted); cursor: pointer; transition: 0.2s; padding: 4px; border-radius: 6px; display: flex; align-items: center; }
.btn-close:hover { background: var(--bg-hover); color: var(--danger); }
.modal-body { flex: 1; overflow-y: auto; padding: 24px; background: var(--bg-canvas); }
.modal-body::-webkit-scrollbar { width: 8px; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.document-paper { max-width: 960px; margin: 0 auto; background: var(--bg-surface); padding: 40px; border-radius: 8px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
.doc-header h1 { font-size: 26px; letter-spacing: 12px; margin-bottom: 30px; border-bottom: 2px solid var(--text-main); padding-bottom: 20px; color: var(--text-main); text-align: center; }
.form-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-sub); margin-bottom: 6px; }
.form-input, .form-select { width: 100%; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-main); background: var(--bg-canvas); outline: none; transition: border-color 0.2s; box-sizing: border-box; font-family: inherit; }
.form-input:focus, .form-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); background: var(--bg-surface); }
.doc-message { line-height: 1.9; color: var(--text-main); font-size: 14px; }
.contract-loading { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: var(--bg-canvas); border-radius: 8px; font-size: 13px; color: var(--text-sub); border: 1px dashed var(--border-color); }
.contract-preview { background: var(--bg-canvas); border: 1px solid var(--border-focus); border-radius: 10px; overflow: hidden; }
.preview-header { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--primary-soft); font-size: 13px; font-weight: 700; color: var(--primary); border-bottom: 1px solid var(--border-color); }
.preview-table td { padding: 7px 10px !important; }
.table-add-controls { padding: 20px; border: 2px dashed var(--border-color); border-radius: 8px; background: var(--bg-canvas); }
.btn-outline-primary { border: 1px solid var(--primary); color: var(--primary); background: transparent; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 14px; }
.btn-outline-primary:hover { background: var(--primary-soft); }
.btn-outline-warning { border: 1px solid #f59e0b; color: #d97706; background: transparent; padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 14px; }
.btn-outline-warning:hover { background: #fef3c7; }
.table-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.table-actions h4 { margin: 0; font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 6px; font-weight: 700; }
.action-group { display: flex; gap: 8px; }
.btn-add-row { display: inline-flex; align-items: center; gap: 5px; padding: 7px 14px; background: var(--success); color: var(--text-inverse); border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; transition: 0.2s; }
.btn-add-row:hover { opacity: 0.85; transform: translateY(-1px); }
.btn-add-retire { background: #f59e0b !important; }
.btn-delete-table { display: inline-flex; align-items: center; gap: 5px; padding: 7px 14px; background: rgba(239,68,68,0.1); color: var(--danger); border: none; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 13px; transition: 0.2s; }
.btn-delete-table:hover { background: var(--danger); color: var(--text-inverse); }
.table-scroll-wrapper { overflow-x: auto; border-radius: 6px; border: 1px solid var(--border-color); overflow: visible; }
.excel-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
.excel-table th, .excel-table td { border: 1px solid var(--border-color); padding: 6px; vertical-align: middle; position: relative; }
.excel-table thead th { background: var(--bg-canvas); font-weight: 600; text-align: center; color: var(--text-main); padding: 6px; white-space: nowrap; }
.tfoot-total td { background: var(--primary-soft); padding: 12px; font-size: 14px; font-weight: 600; }
.tfoot-retire td { background: #fef3c7 !important; }
.cell-input { width: 100%; border: 1px solid transparent; background: transparent; padding: 5px 6px; outline: none; transition: 0.15s; border-radius: 3px; box-sizing: border-box; font-size: 13px; color: var(--text-main); font-family: inherit; }
.cell-input:hover, .cell-input:focus { border-color: var(--primary); background: var(--bg-surface); }
.btn-delete-row { background: rgba(239,68,68,0.1); color: var(--danger); border: none; padding: 5px; border-radius: 4px; cursor: pointer; transition: 0.2s; display: inline-flex; align-items: center; }
.btn-delete-row:hover { background: var(--danger); color: var(--text-inverse); }
.grand-total-box { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; background: var(--primary-soft); border: 2px solid var(--primary); border-radius: 10px; }
.grand-total-label { font-size: 15px; font-weight: 700; color: var(--primary); }
.grand-total-value { font-size: 22px; font-weight: 900; color: var(--primary); }
.footer-info { background: var(--bg-canvas); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); }
.info-row { display: flex; align-items: center; font-size: 14px; font-weight: 600; color: var(--text-main); }
.info-row label { width: 100px; flex-shrink: 0; }
.meta-input { flex: 1; border: none; border-bottom: 1px solid transparent; padding: 4px 8px; font-size: 14px; outline: none; transition: 0.2s; color: var(--text-main); background: transparent; font-family: inherit; }
.meta-input:hover, .meta-input:focus { border-bottom-color: var(--primary); background: var(--bg-canvas); }

/* [추가] 검색 자동완성 전용 스타일 (기존 디자인 유지용) */
.search-container { position: relative; overflow: visible !important; }
.excel-table td.search-container { overflow: visible !important; }
.search-dropdown { position: absolute; top: 100%; left: 0; width: 220px; background: #fff; border: 1px solid var(--primary); border-radius: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999; }
.search-dropdown ul { list-style: none; padding: 0; margin: 0; max-height: 200px; overflow-y: auto; }
.search-dropdown li { padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee; font-size: 12px; text-align: left; color: #333; }
.search-dropdown li:hover { background: var(--primary-soft); }
.search-dropdown li strong { color: var(--primary); }

/* 반응형 [유지] */
@media (max-width: 1024px) {
  .form-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) { .modal-overlay { padding: 0; align-items: flex-end; } .modal-container { height: 96vh; border-radius: 16px 16px 0 0; } .modal-body { padding: 12px; } .document-paper { padding: 20px; } .doc-header h1 { font-size: 20px; letter-spacing: 6px; } .form-grid { grid-template-columns: 1fr 1fr; } .grand-total-value { font-size: 18px; } }
@media (max-width: 480px) { .form-grid { grid-template-columns: 1fr; } .grand-total-box { flex-direction: column; gap: 8px; text-align: center; } }
</style>
