<script setup>
/**
 * EstimateModal.vue — 퇴직금·연차 정산 요청서 모달
 *
 * [기능]
 * - 현장 + 구분 선택 시 산출내역서(contractList) 자동 로드
 * - 직책 드롭다운 선택 → 기본급 / 연차수당 / 퇴직적립금 자동 계산
 * - 연차수당 / 퇴직수당 표를 동적으로 추가/삭제
 * - 활성화된 표의 합계만 grandTotal 및 payload에 반영
 * - 엑셀 내보내기 지원
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
// [추가] 직원 검색 관련 상태 및 로직
// ─────────────────────────────────────────────────────────────
const allEmployees = ref([]);
const searchState = ref({ index: null, type: null }); // 현재 검색 중인 행 정보

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

const selectEmployee = (item, emp, type) => {
  item.empName  = emp.staff;
  item.position = emp.role || '';
  item.birthDt  = emp.birthDt || '';
  item.joinDate = emp.inDate || '';
  item.endDate  = emp.outDate || '재직중';

  searchState.value = { index: null, type: null };
  onPositionChange(item, type); // 직책에 따른 금액 자동 계산 실행
};

// ─────────────────────────────────────────────────────────────
// 계약 데이터 (산출내역서)
// ─────────────────────────────────────────────────────────────
const contractStaffList    = ref([]); // [{ code, name, count }]
const contractDirectLabor  = ref([]); // 직접노무비
const contractIndirectLabor = ref([]); // 간접노무비
const isLoadingContract    = ref(false);

const fetchContractData = async () => {
  const sIdx = formData.value.sIdx;
  const type = formData.value.type;

  contractStaffList.value    = [];
  contractDirectLabor.value  = [];
  contractIndirectLabor.value = [];

  if (!sIdx || !type) return;

  isLoadingContract.value = true;
  try {
    const res      = await axios.get(`/api/v1/site/data/${sIdx}`);
    const siteData = res.data.data?.[0];
    if (!siteData?.contractList) return;

    const parsed = typeof siteData.contractList === 'string'
        ? JSON.parse(siteData.contractList)
        : siteData.contractList;

    const target = parsed.find(c => c.type === type);
    if (!target) return;

    contractStaffList.value    = Array.isArray(target.staffList)              ? target.staffList              : [];
    contractDirectLabor.value  = Array.isArray(target.budget?.directLabor)    ? target.budget.directLabor    : [];
    contractIndirectLabor.value = Array.isArray(target.budget?.indirectLabor)  ? target.budget.indirectLabor  : [];
  } catch (e) {
    console.error('계약 데이터 로드 실패:', e);
  } finally {
    isLoadingContract.value = false;
  }
};

// 직책명 목록 (드롭다운용)
const staffNames = computed(() => contractStaffList.value.map(s => s.name));

// 직책명 → 기본급 / 연차수당 / 퇴직적립금 금액 반환
const getContractAmounts = (staffName) => {
  const staffObj = contractStaffList.value.find(s => s.name === staffName?.trim());
  if (!staffObj) return { basePay: 0, annualLeave: 0, severance: 0 };

  const code = staffObj.code;
  const all  = [...contractDirectLabor.value, ...contractIndirectLabor.value];

  const findVal = (...keys) => {
    for (const key of keys) {
      const item = all.find(d => d.label === key || String(d.label).includes(key));
      if (item?.values?.[code]) return Number(item.values[code]);
    }
    return 0;
  };

  return {
    basePay:     findVal('04001001', '기본급'),
    annualLeave: findVal('04003001', '연차'),
    severance:   findVal('04003003', '퇴직'),
  };
};

// ─────────────────────────────────────────────────────────────
// 행 템플릿
// ─────────────────────────────────────────────────────────────
const newItem = (type) => ({
  itemType:     type, // 'ANNUAL' | 'RETIRE'
  empName:      '',
  position:     '',
  birthDt:      '',
  joinDate:     '',
  endDate:      '',
  middleDt:     '',
  period:       '',
  basis:        '',
  amount:       0,
  note:         '',
  usageHistory: '',
});

// ─────────────────────────────────────────────────────────────
// 테이블 활성화 상태
// ─────────────────────────────────────────────────────────────
const hasAnnual = ref(false);
const hasRetire = ref(false);

// ─────────────────────────────────────────────────────────────
// 폼 데이터
// ─────────────────────────────────────────────────────────────
const formData = ref({
  sIdx:         '',
  siteName:     '',
  type:         '',
  target_month: '',
  docNo:        '',
  billingDt:    '',
  summary:      '연차 및 퇴직수당 정산요청의 건',
  bankInfo:     '301-051564-01-017(기업은행, 예금주: 에코그린티엠)',
  attachment:   '1. 전자 계산서',
  annualItems:  [newItem('ANNUAL')],
  retireItems:  [newItem('RETIRE')],
});

// ─────────────────────────────────────────────────────────────
// 폼 초기화
// ─────────────────────────────────────────────────────────────
const initForm = () => {
  if (props.initialData && Object.keys(props.initialData).length > 0) {
    const src = props.initialData;
    const bd  = src.billingData || {};

    let loadedAnnual = [];
    let loadedRetire = [];

    if (Array.isArray(src.payrollData)) {
      loadedAnnual = src.payrollData
          .filter(row => row.itemType === 'ANNUAL' || !row.itemType)
          .map(row => ({
            itemType:     'ANNUAL',
            empName:      row.empName      || '',
            position:     row.position     || '',
            birthDt:      row.birthDt      || '',
            joinDate:     row.joinDate     || '',
            endDate:      row.endDate      || '',
            middleDt:     row.middleDt     || '',
            period:       row.period       || '',
            basis:        row.basis        || '',
            amount:       row.amount       || 0,
            note:         row.note         || '',
            usageHistory: row.usageHistory || '',
          }));

      loadedRetire = src.payrollData
          .filter(row => row.itemType === 'RETIRE')
          .map(row => ({
            itemType:     'RETIRE',
            empName:      row.empName      || '',
            position:     row.position     || '',
            birthDt:      row.birthDt      || '',
            joinDate:     row.joinDate     || '',
            endDate:      row.endDate      || '',
            middleDt:     row.middleDt     || '',
            period:       row.period       || '',
            basis:        row.basis        || '',
            amount:       row.amount       || 0,
            note:         row.note         || '',
            usageHistory: row.usageHistory || '',
          }));
    }

    hasAnnual.value = loadedAnnual.length > 0;
    hasRetire.value = loadedRetire.length > 0;

    formData.value = {
      sIdx:         src.sIdx      || '',
      siteName:     src.siteName  || '',
      type:         src.type      || '',
      target_month: '',
      docNo:        src.docNo     || '',
      billingDt:    src.billingDt || '',
      summary:      bd.summary    || '연차 및 퇴직수당 정산요청의 건',
      bankInfo:     bd.bankInfo   || '301-051564-01-017(기업은행, 예금주: 에코그린티엠)',
      attachment:   bd.attachment || '1. 전자 계산서',
      annualItems:  loadedAnnual.length > 0 ? loadedAnnual : [newItem('ANNUAL')],
      retireItems:  loadedRetire.length > 0 ? loadedRetire : [newItem('RETIRE')],
    };

    // 수정 모드에서도 계약 데이터 로드
    if (src.sIdx && src.type) fetchContractData();

  } else {
    hasAnnual.value = false;
    hasRetire.value = false;
    formData.value = {
      sIdx: '', siteName: '', type: '', target_month: '', docNo: '', billingDt: '',
      summary:    '연차 및 퇴직수당 정산요청의 건',
      bankInfo:   '301-051564-01-017(기업은행, 예금주: 에코그린티엠)',
      attachment: '1. 전자 계산서',
      annualItems: [newItem('ANNUAL')],
      retireItems: [newItem('RETIRE')],
    };
  }
};
watch(() => props.initialData, initForm, { immediate: true });

// ─────────────────────────────────────────────────────────────
// 현장 / 구분 변경
// ─────────────────────────────────────────────────────────────
const handleSiteChange = () => {
  const site = siteOptions.value.find(s => s.idx === formData.value.sIdx);
  formData.value.siteName = site ? site.name : '';
  updateSummary();
  fetchContractData();
  fetchAllEmployees();
};

const handleTypeChange = () => {
  updateSummary();
  fetchContractData();
};

const updateSummary = () => {
  const typeNm = typeOptions.value.find(t => t.itemCd === formData.value.type)?.itemNm || formData.value.type;
  if (typeNm) formData.value.summary = `연차 및 퇴직수당 정산요청의 건(${typeNm})`;
};

// ─────────────────────────────────────────────────────────────
// 직책 변경 → 자동 계산
// ─────────────────────────────────────────────────────────────
const onPositionChange = (item, type) => {
  if (!item.position) return;
  const { basePay, annualLeave, severance } = getContractAmounts(item.position);

  if (type === 'ANNUAL') {
    item.amount = annualLeave;
    item.basis  = basePay > 0 ? `기본급 ${basePay.toLocaleString()}원 기준` : '';
  } else {
    item.amount = severance;
    item.basis  = basePay > 0 ? `기본급 ${basePay.toLocaleString()}원 기준` : '';
  }
};

// ─────────────────────────────────────────────────────────────
// 테이블 제어
// ─────────────────────────────────────────────────────────────
const toggleTable = (type, action) => {
  if (type === 'ANNUAL') {
    hasAnnual.value = action === 'add';
    if (action === 'remove') formData.value.annualItems = [newItem('ANNUAL')];
  } else {
    hasRetire.value = action === 'add';
    if (action === 'remove') formData.value.retireItems = [newItem('RETIRE')];
  }
};

// ─────────────────────────────────────────────────────────────
// 행 추가 / 삭제
// ─────────────────────────────────────────────────────────────
const addRow = (type) => {
  if (type === 'ANNUAL') formData.value.annualItems.push(newItem('ANNUAL'));
  else                   formData.value.retireItems.push(newItem('RETIRE'));
};

const removeRow = (type, index) => {
  if (type === 'ANNUAL') {
    if (formData.value.annualItems.length <= 1) {
      alert('최소 1명의 데이터가 필요합니다. 표 전체를 삭제하시려면 [표 삭제]를 이용해주세요.');
      return;
    }
    formData.value.annualItems.splice(index, 1);
  } else {
    if (formData.value.retireItems.length <= 1) {
      alert('최소 1명의 데이터가 필요합니다. 표 전체를 삭제하시려면 [표 삭제]를 이용해주세요.');
      return;
    }
    formData.value.retireItems.splice(index, 1);
  }
};

// ─────────────────────────────────────────────────────────────
// 합계
// ─────────────────────────────────────────────────────────────
const annualTotal = computed(() =>
    hasAnnual.value
        ? formData.value.annualItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)
        : 0
);
const retireTotal = computed(() =>
    hasRetire.value
        ? formData.value.retireItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)
        : 0
);
const grandTotal = computed(() => annualTotal.value + retireTotal.value);

// ─────────────────────────────────────────────────────────────
// 저장
// ─────────────────────────────────────────────────────────────
const isSaving = ref(false);

const handleSave = async () => {
  if (!formData.value.sIdx) { alert('현장을 선택해주세요.'); return; }
  if (!hasAnnual.value && !hasRetire.value) { alert('최소 1개 이상의 정산 내역 표를 추가해주세요.'); return; }

  const [year, month] = (formData.value.target_month || formData.value.billingDt || '0-0').split('-');

  isSaving.value = true;
  try {
    const activeAnnual   = hasAnnual.value ? formData.value.annualItems : [];
    const activeRetire   = hasRetire.value ? formData.value.retireItems : [];
    const combinedPayroll = [...activeAnnual, ...activeRetire];

    const payload = {
      idx:        props.settlementId || null,
      year:       parseInt(year)  || 0,
      month:      parseInt(month) || 0,
      docType:    'RETIRE_ANNUAL',
      type:       formData.value.type      || null,
      docNo:      formData.value.docNo     || null,
      billingDt:  formData.value.billingDt || null,
      subTotal:   grandTotal.value,
      vatAmount:  0,
      grandTotal: grandTotal.value,
      billingData: {
        summary:        formData.value.summary,
        bankInfo:       formData.value.bankInfo,
        attachment:     formData.value.attachment,
        totalAnnualAmt: annualTotal.value,
        totalRetireAmt: retireTotal.value,
        totalEmployees: combinedPayroll.length,
      },
      payrollData: combinedPayroll,
      cIdx: authStore.user?.cIdx || 0,
    };

    const res = await axios.post(`/api/v1/settle/site/data/${formData.value.sIdx}`, payload);
    if (res.data.result) {
      alert('저장되었습니다.');
      emit('save');
      closeModal();
    } else {
      alert(`저장 실패: ${res.data.msg}`);
    }
  } catch (e) {
    console.error('저장 오류:', e);
    alert('서버 통신 중 오류가 발생했습니다.');
  } finally {
    isSaving.value = false;
  }
};

// ─────────────────────────────────────────────────────────────
// 엑셀 내보내기
// ─────────────────────────────────────────────────────────────
const exportToExcel = () => {
  if (!hasAnnual.value && !hasRetire.value) {
    alert('출력할 정산 내역이 없습니다.');
    return;
  }

  const wb       = XLSX.utils.book_new();
  const siteName = formData.value.siteName  || '현장미지정';
  const dt       = formData.value.billingDt || '';
  const fileName = `연차퇴직정산_${siteName}_${dt}.xlsx`;

  const rows = [];
  rows.push(['청 구 공 문']);
  rows.push([]);
  rows.push(['수신',     formData.value.siteName  ? formData.value.siteName + ' 관리사무소' : '']);
  rows.push(['문서번호', formData.value.docNo     || '']);
  rows.push(['시행일자', formData.value.billingDt || '']);
  rows.push(['제목',     formData.value.summary   || '']);
  rows.push([]);
  rows.push(['1. 귀 소의 무궁한 발전을 기원합니다.']);
  rows.push(['2. 단지에 적립된 적립금 중 재직자의 미사용 연차수당 및 퇴직수당을 지급하고자 아래와 같이 요청하오니 검토하시여 결재를 부탁드립니다.']);
  rows.push([]);
  rows.push(['- 아 래 -']);
  rows.push([]);

  const header = ['구분','이름','직책','생년월일','입사일','퇴사일','중간정산일','정산기간','산출근거','금액(원)','비고'];

  if (hasAnnual.value) {
    rows.push(['[연차수당 정산 내역]']);
    rows.push(header);
    formData.value.annualItems.forEach((item, i) => {
      rows.push([i+1, item.empName||'', item.position||'', item.birthDt||'', item.joinDate||'', item.endDate||'', item.middleDt||'', item.period||'', item.basis||'', Number(item.amount)||0, item.note||'']);
    });
    rows.push(['','','','','','','','','연차수당 소계', annualTotal.value, '']);
    rows.push([]);
  }

  if (hasRetire.value) {
    rows.push(['[퇴직수당 정산 내역]']);
    rows.push(header);
    formData.value.retireItems.forEach((item, i) => {
      rows.push([i+1, item.empName||'', item.position||'', item.birthDt||'', item.joinDate||'', item.endDate||'', item.middleDt||'', item.period||'', item.basis||'', Number(item.amount)||0, item.note||'']);
    });
    rows.push(['','','','','','','','','퇴직수당 소계', retireTotal.value, '']);
    rows.push([]);
  }

  if (hasAnnual.value && hasRetire.value) {
    rows.push(['','','','','','','','','총 합계', grandTotal.value, '']);
    rows.push([]);
  }

  rows.push(['입금계좌', formData.value.bankInfo   || '']);
  rows.push(['첨부',     formData.value.attachment || '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    {wch:6},{wch:10},{wch:8},{wch:10},{wch:12},{wch:12},{wch:12},{wch:18},{wch:24},{wch:14},{wch:20},
  ];
  XLSX.utils.book_append_sheet(wb, ws, '연차퇴직정산');
  XLSX.writeFile(wb, fileName);
};

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────
const fc = (v) => Number(v || 0).toLocaleString();
const closeModal = () => emit('close');

onMounted(async () => {
  await Promise.all([fetchSiteOptions(), fetchTypeOptions()]);
  // 바깥 클릭 시 검색창 닫기
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.search-container')) {
      searchState.value = { index: null, type: null };
    }
  });
});
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @mousedown.self="closeModal">
    <div class="modal-container">

      <!-- ── 헤더 ── -->
      <div class="modal-header">
        <div class="header-title">
          <h2>{{ settlementId ? '연차·퇴직금 정산서 수정' : '새 연차·퇴직금 정산서 작성' }}</h2>
          <span class="badge">{{ formData.siteName || '현장 미지정' }}</span>
        </div>
        <div class="header-actions">
          <button class="btn-excel" @click="exportToExcel">
            <i class="mdi mdi-microsoft-excel"></i><span>엑셀 저장</span>
          </button>
          <button class="btn-save" @click="handleSave" :disabled="isSaving">
            <i class="mdi mdi-content-save"></i><span>{{ isSaving ? '저장 중...' : '저장하기' }}</span>
          </button>
          <button class="btn-close" @click="closeModal"><i class="mdi mdi-close"></i></button>
        </div>
      </div>

      <!-- ── 바디 ── -->
      <div class="modal-body">
        <div class="document-paper">

          <div class="doc-header text-center">
            <h1>청 구 공 문</h1>
          </div>

          <!-- 기본 정보 입력 -->
          <div class="form-grid">
            <div class="form-group">
              <label>현장 선택 <span class="text-red">*</span></label>
              <select v-model="formData.sIdx" @change="handleSiteChange" class="form-select">
                <option value="" disabled>현장을 선택해주세요</option>
                <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>구분 (직종)</label>
              <select v-model="formData.type" @change="handleTypeChange" class="form-select">
                <option value="" disabled>직종 선택</option>
                <option v-for="tp in typeOptions" :key="tp.itemCd" :value="tp.itemCd">{{ tp.itemNm }}</option>
              </select>
            </div>
            <div class="form-group">
              <label>문서번호</label>
              <input type="text" v-model="formData.docNo" class="form-input" placeholder="예: 에코그린 2026-02-39호" />
            </div>
            <div class="form-group">
              <label>시행일자</label>
              <input type="date" v-model="formData.billingDt" class="form-input" />
            </div>
          </div>

          <div class="doc-message">
            <p>1. 귀 소의 무궁한 발전을 기원합니다.</p>
            <p>2. 단지에 적립된 적립금 중 재직자의 미사용 연차수당 및 퇴직수당을 지급하고자 아래와 같이 요청하오니 검토하시여 결재를 부탁드립니다.</p>
            <p class="text-center mt-4 font-bold">- 아 래 -</p>
          </div>

          <!-- ── 산출내역서 기준 금액 미리보기 ── -->
          <div v-if="isLoadingContract" class="contract-loading">
            <i class="mdi mdi-loading mdi-spin"></i> 산출내역서 불러오는 중...
          </div>

          <!--div v-if="!isLoadingContract && contractStaffList.length > 0" class="contract-preview mt-4">
            <div class="preview-header">
              <i class="mdi mdi-file-table-outline"></i>
              <span>산출내역서 기준 금액 (직책 선택 시 자동 적용)</span>
            </div>
            <div class="table-scroll-wrapper">
              <table class="excel-table preview-table">
                <thead>
                <tr>
                  <th>직책</th>
                  <th>기본급 (월)</th>
                  <th class="text-blue">연차수당</th>
                  <th class="text-orange">퇴직적립금</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="staff in contractStaffList" :key="staff.code">
                  <td class="text-center font-bold">{{ staff.name }}</td>
                  <td class="text-right">{{ fc(getContractAmounts(staff.name).basePay) }} 원</td>
                  <td class="text-right text-blue font-bold">{{ fc(getContractAmounts(staff.name).annualLeave) }} 원</td>
                  <td class="text-right text-orange font-bold">{{ fc(getContractAmounts(staff.name).severance) }} 원</td>
                </tr>
                </tbody>
              </table>
            </div>
          </div-->

          <div v-if="!isLoadingContract && formData.sIdx && formData.type && contractStaffList.length === 0" class="no-contract-msg mt-4">
            <i class="mdi mdi-alert-circle-outline"></i>
            해당 현장/구분의 산출내역서가 없습니다. 금액을 직접 입력해주세요.
          </div>

          <!-- ── 표 추가 버튼 ── -->
          <div class="table-add-controls mt-5 text-center" v-if="!hasAnnual || !hasRetire">
            <button v-if="!hasAnnual" class="btn-outline-primary mr-2" @click="toggleTable('ANNUAL', 'add')">
              <i class="mdi mdi-plus"></i> 연차수당 표 추가
            </button>
            <button v-if="!hasRetire" class="btn-outline-warning" @click="toggleTable('RETIRE', 'add')">
              <i class="mdi mdi-plus"></i> 퇴직수당 표 추가
            </button>
          </div>

          <!-- ── 연차수당 표 ── -->
          <div v-if="hasAnnual" class="table-section mt-5">
            <div class="table-actions">
              <h4><i class="mdi mdi-calendar-check text-blue"></i> 연차수당 정산 내역</h4>
              <div class="action-group">
                <button class="btn-add-row" @click="addRow('ANNUAL')">
                  <i class="mdi mdi-plus-thick"></i> 직원 추가
                </button>
                <button class="btn-delete-table" @click="toggleTable('ANNUAL', 'remove')">
                  <i class="mdi mdi-close"></i> 표 삭제
                </button>
              </div>
            </div>

            <div class="table-scroll-wrapper">
              <table class="excel-table statement-table">
                <thead>
                <tr>
                  <th rowspan="2" style="width:20px;">구분</th>
                  <th colspan="8">내역</th>
                  <th rowspan="2" style="min-width:120px;">금액 (원)</th>
                  <th rowspan="2" style="min-width:140px;">비고</th>
                  <th rowspan="2" style="width:20px;"></th>
                </tr>
                <tr>
                  <th style="min-width:70px;">이름</th>
                  <th style="min-width:70px;">직책</th>
                  <th style="min-width:80px;">생년월일</th>
                  <th style="min-width:100px;">입사일</th>
                  <th style="min-width:100px;">퇴사일</th>
                  <th style="min-width:100px;">중간정산일</th>
                  <th style="min-width:130px;">정산기간</th>
                  <th style="min-width:180px;">산출근거</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(item, index) in formData.annualItems" :key="'annual-' + index">
                  <td class="text-center font-bold text-gray">{{ index + 1 }}</td>
                  <!--td><input type="text" v-model="item.empName" class="cell-input text-center" placeholder="이름" /></td-->
                  <!-- 이름 입력 TD 수정 -->
                  <td class="search-container">
                    <input
                        type="text"
                        v-model="item.empName"
                        @input="searchState = { index, type: 'ANNUAL' }"
                        @focus="searchState = { index, type: 'ANNUAL' }"
                        class="cell-input text-center"
                        placeholder="이름"
                    />
                    <!-- 드롭다운 리스트 -->
                    <div
                        v-if="
                          searchState.index === index &&
                          searchState.type === 'ANNUAL' &&
                          getFilteredEmployees(item.empName).length > 0"
                        class="search-dropdown"
                    >
                      <ul>
                        <li
                            v-for="emp in getFilteredEmployees(item.empName)"
                            :key="emp.idx"
                            @click="selectEmployee(item, emp, 'ANNUAL')"
                        >
                          <strong>{{ emp.staff }}</strong> | {{ emp.role }} ({{ emp.inDate }})
                        </li>
                      </ul>
                    </div>
                  </td>
                  <!-- 직책: 산출내역서가 있으면 드롭다운, 없으면 텍스트 입력 -->
                  <td>
                    <select
                        v-if="staffNames.length > 0"
                        v-model="item.position"
                        class="cell-input text-center"
                        @change="onPositionChange(item, 'ANNUAL')"
                    >
                      <option value="">직책 선택</option>
                      <option v-for="name in staffNames" :key="name" :value="name">{{ name }}</option>
                    </select>
                    <input v-else type="text" v-model="item.position" class="cell-input text-center" placeholder="직책" />
                  </td>
                  <td><input type="text" v-model="item.birthDt" class="cell-input text-center" placeholder="590216" /></td>
                  <td><input type="text" v-model="item.joinDate" class="cell-input text-center" /></td>
                  <td><input type="text" v-model="item.endDate" class="cell-input text-center" placeholder="재직중" /></td>
                  <td><input type="text" v-model="item.middleDt" class="cell-input text-center" placeholder="중간정산일" /></td>
                  <td><input type="text" v-model="item.period" class="cell-input text-center" placeholder="24.02.04~25.02.03" /></td>
                  <td><input type="text" v-model="item.basis" class="cell-input" placeholder="1,614,360/156*6*3개" /></td>
                  <td>
                    <input
                        type="text"
                        :value="fc(item.amount)"
                        @focus="$event.target.select()"
                        @input="item.amount = Number($event.target.value.replace(/,/g,'')) || 0"
                        class="cell-input text-right font-bold text-blue"
                    />
                  </td>
                  <td><input type="text" v-model="item.note" class="cell-input" placeholder="3년차 16개 중 14개" /></td>
                  <td class="text-center">
                    <button class="btn-delete-row" @click="removeRow('ANNUAL', index)">
                      <i class="mdi mdi-minus"></i>
                    </button>
                  </td>
                </tr>
                </tbody>
                <tfoot>
                <tr class="tfoot-total">
                  <td colspan="9" class="text-center">연차수당 소계</td>
                  <td class="text-right text-blue font-bold">{{ fc(annualTotal) }}</td>
                  <td colspan="2"></td>
                </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!-- ── 퇴직수당 표 ── -->
          <div v-if="hasRetire" class="table-section mt-5">
            <div class="table-actions">
              <h4><i class="mdi mdi-account-cash text-orange"></i> 퇴직수당 정산 내역</h4>
              <div class="action-group">
                <button class="btn-add-row btn-add-retire" @click="addRow('RETIRE')">
                  <i class="mdi mdi-plus-thick"></i> 직원 추가
                </button>
                <button class="btn-delete-table" @click="toggleTable('RETIRE', 'remove')">
                  <i class="mdi mdi-close"></i> 표 삭제
                </button>
              </div>
            </div>

            <div class="table-scroll-wrapper">
              <table class="excel-table statement-table">
                <thead>
                <tr>
                  <th rowspan="2" style="width:20px;">구분</th>
                  <th colspan="8">내역</th>
                  <th rowspan="2" style="min-width:120px;">금액 (원)</th>
                  <th rowspan="2" style="min-width:140px;">비고</th>
                  <th rowspan="2" style="width:20px;"></th>
                </tr>
                <tr>
                  <th style="min-width:70px;">이름</th>
                  <th style="min-width:70px;">직책</th>
                  <th style="min-width:80px;">생년월일</th>
                  <th style="min-width:100px;">입사일</th>
                  <th style="min-width:100px;">퇴사일</th>
                  <th style="min-width:100px;">중간정산일</th>
                  <th style="min-width:130px;">정산기간</th>
                  <th style="min-width:180px;">산출근거</th>
                </tr>
                </thead>
                <tbody>
                <tr v-for="(item, index) in formData.retireItems" :key="'retire-' + index">
                  <td class="text-center font-bold text-gray">{{ index + 1 }}</td>
                  <!--td><input type="text" v-model="item.empName" class="cell-input text-center" placeholder="이름" /></td-->
                  <td class="search-container">
                    <input
                        type="text"
                        v-model="item.empName"
                        @input="searchState = { index, type: 'RETIRE' }"
                        @focus="searchState = { index, type: 'RETIRE' }"
                        class="cell-input text-center"
                        placeholder="이름"
                    />
                    <!-- 드롭다운 리스트 -->
                    <div
                        v-if="
                        searchState.index === index &&
                        searchState.type === 'RETIRE' &&
                        getFilteredEmployees(item.empName).length > 0"
                        class="search-dropdown"
                    >
                      <ul>
                        <li
                            v-for="emp in getFilteredEmployees(item.empName)"
                            :key="emp.idx"
                            @click="selectEmployee(item, emp, 'RETIRE')"
                        >
                          <strong>{{ emp.staff }}</strong> | {{ emp.role }} ({{ emp.inDate }})
                        </li>
                      </ul>
                    </div>
                  </td>
                  <td>
                    <select
                        v-if="staffNames.length > 0"
                        v-model="item.position"
                        class="cell-input text-center"
                        @change="onPositionChange(item, 'RETIRE')"
                    >
                      <option value="">직책 선택</option>
                      <option v-for="name in staffNames" :key="name" :value="name">{{ name }}</option>
                    </select>
                    <input v-else type="text" v-model="item.position" class="cell-input text-center" placeholder="직책" />
                  </td>
                  <td><input type="text" v-model="item.birthDt" class="cell-input text-center" placeholder="590216" /></td>
                  <td><input type="text" v-model="item.joinDate" class="cell-input text-center" /></td>
                  <td><input type="text" v-model="item.endDate" class="cell-input text-center" placeholder="퇴사일" /></td>
                  <td><input type="text" v-model="item.middleDt" class="cell-input text-center" placeholder="중간정산일" /></td>
                  <td><input type="text" v-model="item.period" class="cell-input text-center" placeholder="근속기간" /></td>
                  <td><input type="text" v-model="item.basis" class="cell-input" placeholder="산출근거" /></td>
                  <td>
                    <input
                        type="text"
                        :value="fc(item.amount)"
                        @focus="$event.target.select()"
                        @input="item.amount = Number($event.target.value.replace(/,/g,'')) || 0"
                        class="cell-input text-right font-bold text-orange"
                    />
                  </td>
                  <td><input type="text" v-model="item.note" class="cell-input" placeholder="비고" /></td>
                  <td class="text-center">
                    <button class="btn-delete-row" @click="removeRow('RETIRE', index)">
                      <i class="mdi mdi-minus"></i>
                    </button>
                  </td>
                </tr>
                </tbody>
                <tfoot>
                <tr class="tfoot-total tfoot-retire">
                  <td colspan="9" class="text-center">퇴직수당 소계</td>
                  <td class="text-right font-bold text-orange">{{ fc(retireTotal) }}</td>
                  <td colspan="2"></td>
                </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <!-- ── 양쪽 표가 모두 있을 때 총합계 ── -->
          <div v-if="hasAnnual && hasRetire" class="grand-total-box mt-4">
            <span class="grand-total-label">총 청구 합계액 (연차 + 퇴직수당)</span>
            <span class="grand-total-value">{{ fc(grandTotal) }} 원</span>
          </div>

          <!-- ── 하단 정보 ── -->
          <div class="footer-info mt-5">
            <div class="info-row">
              <label>3. 입금계좌 :</label>
              <input type="text" v-model="formData.bankInfo" class="meta-input flex-1" />
            </div>
            <div class="info-row mt-2">
              <label>첨부 :</label>
              <input type="text" v-model="formData.attachment" class="meta-input flex-1" />
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── 오버레이/컨테이너 ── */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000; padding: 16px; box-sizing: border-box;
}
.modal-container {
  background: var(--bg-surface); width: 100%; max-width: 1200px; height: 90vh;
  border-radius: 16px; display: flex; flex-direction: column;
  box-shadow: 0 20px 40px rgba(0,0,0,0.15); overflow: hidden; border: 1px solid var(--border-color);
}

/* ── 헤더 ── */
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px; border-bottom: 1px solid var(--border-color);
  background: var(--bg-canvas); gap: 12px; flex-shrink: 0;
}
.header-title { display: flex; align-items: center; gap: 10px; }
.header-title h2 { margin: 0; font-size: 18px; font-weight: 700; color: var(--text-main); }
.badge { padding: 3px 10px; background: var(--primary-soft); color: var(--primary); border-radius: 6px; font-size: 12px; font-weight: 600; }
.header-actions { display: flex; gap: 10px; }

.btn-excel {
  background: rgba(5,150,105,.1); color: #059669; border: 1px solid rgba(5,150,105,.3);
  padding: 8px 14px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: .2s;
  display: flex; align-items: center; gap: 6px; font-size: 14px;
}
.btn-excel:hover { background: #059669; color: #fff; }
.btn-save {
  background: var(--primary); color: var(--text-inverse); border: none;
  padding: 8px 16px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s;
  display: flex; align-items: center; gap: 6px; font-size: 14px;
}
.btn-save:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
.btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
.btn-close {
  background: none; border: none; font-size: 22px; color: var(--text-muted);
  cursor: pointer; transition: 0.2s; padding: 4px; border-radius: 6px; display: flex; align-items: center;
}
.btn-close:hover { background: var(--bg-hover); color: var(--danger); }

/* ── 바디 ── */
.modal-body { flex: 1; overflow-y: auto; padding: 24px; background: var(--bg-canvas); }
.modal-body::-webkit-scrollbar { width: 8px; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

/* ── 공문 문서 ── */
.document-paper {
  max-width: 960px; margin: 0 auto; background: var(--bg-surface);
  padding: 40px; border-radius: 8px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);
}
.doc-header h1 {
  font-size: 26px; letter-spacing: 12px; margin-bottom: 30px;
  border-bottom: 2px solid var(--text-main); padding-bottom: 20px; color: var(--text-main);
}

/* ── 폼 그리드 ── */
.form-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
.form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-sub); margin-bottom: 6px; }
.form-input, .form-select {
  width: 100%; padding: 9px 12px; border: 1px solid var(--border-color); border-radius: 8px;
  font-size: 13px; color: var(--text-main); background: var(--bg-canvas);
  outline: none; transition: border-color 0.2s; box-sizing: border-box; font-family: inherit;
}
.form-input:focus, .form-select:focus {
  border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); background: var(--bg-surface);
}

.doc-message { line-height: 1.9; color: var(--text-main); font-size: 14px; }

/* ── 산출내역서 로딩/미리보기 ── */
.contract-loading {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px; background: var(--bg-canvas); border-radius: 8px;
  font-size: 13px; color: var(--text-sub); border: 1px dashed var(--border-color);
}
.contract-preview {
  background: var(--bg-canvas); border: 1px solid var(--border-focus);
  border-radius: 10px; overflow: hidden;
}
.preview-header {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; background: var(--primary-soft);
  font-size: 13px; font-weight: 700; color: var(--primary);
  border-bottom: 1px solid var(--border-color);
}
.preview-table { background: var(--bg-surface); }
.preview-table th { background: var(--bg-hover) !important; }
.preview-table td { padding: 7px 10px !important; }

.no-contract-msg {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px; background: rgba(245, 158, 11, 0.08);
  border: 1px dashed #f59e0b; border-radius: 8px;
  font-size: 13px; color: #b45309;
}

/* ── 표 추가 버튼 영역 ── */
.table-add-controls {
  padding: 20px; border: 2px dashed var(--border-color);
  border-radius: 8px; background: var(--bg-canvas);
}
.btn-outline-primary {
  border: 1px solid var(--primary); color: var(--primary); background: transparent;
  padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 14px;
}
.btn-outline-primary:hover { background: var(--primary-soft); }
.btn-outline-warning {
  border: 1px solid #f59e0b; color: #d97706; background: transparent;
  padding: 10px 20px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 14px;
}
.btn-outline-warning:hover { background: #fef3c7; }
.mr-2 { margin-right: 8px; }

/* ── 테이블 공통 ── */
.table-section { position: relative; }
.table-actions { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.table-actions h4 { margin: 0; font-size: 16px; color: var(--text-main); display: flex; align-items: center; gap: 6px; font-weight: 700; }
.action-group { display: flex; gap: 8px; }

.btn-add-row {
  display: inline-flex; align-items: center; gap: 5px; padding: 7px 14px;
  background: var(--success); color: var(--text-inverse); border: none; border-radius: 8px;
  font-weight: 600; cursor: pointer; font-size: 13px; transition: 0.2s;
}
.btn-add-row:hover { opacity: 0.85; transform: translateY(-1px); }
.btn-add-retire { background: #f59e0b !important; }

.btn-delete-table {
  display: inline-flex; align-items: center; gap: 5px; padding: 7px 14px;
  background: rgba(239,68,68,0.1); color: var(--danger); border: none; border-radius: 8px;
  font-weight: 600; cursor: pointer; font-size: 13px; transition: 0.2s;
}
.btn-delete-table:hover { background: var(--danger); color: var(--text-inverse); }

.table-scroll-wrapper { overflow-x: auto; border-radius: 6px; border: 1px solid var(--border-color); }
.excel-table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
.excel-table th, .excel-table td { border: 1px solid var(--border-color); padding: 6px; vertical-align: middle; }
.excel-table thead th {
  background: var(--bg-canvas); font-weight: 600; text-align: center;
  color: var(--text-main); padding: 6px; white-space: nowrap;
}
.tfoot-total td { background: var(--primary-soft); padding: 12px; font-size: 14px; font-weight: 600; }
.tfoot-retire td { background: #fef3c7 !important; }

.cell-input {
  width: 100%; border: 1px solid transparent; background: transparent; padding: 5px 6px;
  outline: none; transition: 0.15s; border-radius: 3px; box-sizing: border-box;
  font-size: 13px; color: var(--text-main); font-family: inherit;
}
.cell-input:hover, .cell-input:focus { border-color: var(--primary); background: var(--bg-surface); }
select.cell-input { cursor: pointer; }

.btn-delete-row {
  background: rgba(239,68,68,0.1); color: var(--danger); border: none;
  padding: 5px; border-radius: 4px; cursor: pointer; transition: 0.2s;
  display: inline-flex; align-items: center;
}
.btn-delete-row:hover { background: var(--danger); color: var(--text-inverse); }

/* ── 총합계 박스 ── */
.grand-total-box {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 24px; background: var(--primary-soft);
  border: 2px solid var(--primary); border-radius: 10px;
}
.grand-total-label { font-size: 15px; font-weight: 700; color: var(--primary); }
.grand-total-value { font-size: 22px; font-weight: 900; color: var(--primary); }

/* ── 하단 정보 ── */
.footer-info {
  background: var(--bg-canvas); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color);
}
.info-row { display: flex; align-items: center; font-size: 14px; font-weight: 600; color: var(--text-main); }
.info-row label { width: 100px; flex-shrink: 0; }
.meta-input {
  flex: 1; border: none; border-bottom: 1px solid transparent; padding: 4px 8px;
  font-size: 14px; outline: none; transition: 0.2s; color: var(--text-main);
  background: transparent; font-family: inherit;
}
.meta-input:hover, .meta-input:focus { border-bottom-color: var(--primary); background: var(--bg-canvas); }

/* ── 유틸 ── */
.text-center { text-align: center; }
.text-right  { text-align: right; }
.text-blue   { color: var(--primary); }
.text-orange { color: #d97706; }
.text-red    { color: var(--danger); }
.text-gray   { color: var(--text-sub); }
.font-bold   { font-weight: 700; }
.flex-1      { flex: 1; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 16px; }
.mt-5 { margin-top: 32px; }
input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; }

/* ── 검색 자동완성 전용 스타일 ── */
.search-container { position: relative; overflow: visible !important; }
.excel-table td.search-container { overflow: visible !important; }

.search-dropdown {
  position: absolute; top: 100%; left: 0; width: 220px;
  background: #fff; border: 1px solid var(--primary); border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 9999;
}
.search-dropdown ul { list-style: none; padding: 0; margin: 0; max-height: 200px; overflow-y: auto; }
.search-dropdown li {
  padding: 8px 12px; cursor: pointer; border-bottom: 1px solid #eee;
  font-size: 12px; text-align: left; color: #333;
}
.search-dropdown li:hover { background: var(--primary-soft); }
.search-dropdown li strong { color: var(--primary); }

/* ── 반응형 ── */
@media (max-width: 1024px) { .form-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) {
  .modal-overlay { padding: 0; align-items: flex-end; }
  .modal-container { height: 96vh; border-radius: 16px 16px 0 0; }
  .modal-body { padding: 12px; }
  .document-paper { padding: 20px; }
  .doc-header h1 { font-size: 20px; letter-spacing: 6px; }
  .form-grid { grid-template-columns: 1fr 1fr; }
  .grand-total-value { font-size: 18px; }
}
@media (max-width: 480px) {
  .form-grid { grid-template-columns: 1fr; }
  .grand-total-box { flex-direction: column; gap: 8px; text-align: center; }
}
</style>
