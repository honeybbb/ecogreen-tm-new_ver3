<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import { useAuthStore } from '@/stores/auth';
import axios from 'axios';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const {
  positionOptions,
  typeOptions,
  fetchPositionOptions,
  fetchTypeOptions
} = useApi();

// 금액 포맷터 (세자리 콤마)
const formatCurrency = (val) => Number(val || 0).toLocaleString();

const currentStep = ref(1);
const totalSteps = 4;

const progressPercentage = computed(() => (currentStep.value / totalSteps) * 100);

const steps = [
  { number: 1, title: '기본 정보',  icon: 'mdi-office-building-outline' },
  { number: 2, title: '계약 정보',  icon: 'mdi-file-document-outline' },
  { number: 3, title: '담당자 정보', icon: 'mdi-account-tie-outline' }
];

const site = ref({
  siteName: '',
  siteId: '',
  siteType: '',
  postalCode: '',
  addressMain: '',
  addressDetail: '',
  areaUnder: '',
  areaOver: '',
  areaGross: '',
  is_vat: false,
  building_su: '',
  unit_su: '',
  managerName: '',
  managerContact: '',
  director: '',
  directorContact: '',
  memo: '',
  status: '운영 중',
  payment_day: '',
  bigo: ''
});

const contractGroups = ref([]);
const selectedFile = ref(null);
const siteTypeOptions = ref(['아파트', '주상복합', '오피스텔', '상업 시설', '기타']);
const statusOptions  = ref(['운영 중', '계약 종료']);
const bigoHistory    = ref([]);
const detailInput    = ref(null);

// =============================================
// costBreakdown 기본값 생성
// =============================================
const makeValuesObj = (staffList, defaultVal = 0) => {
  const obj = {};
  staffList.forEach(s => { obj[s.code] = defaultVal; });
  return obj;
};

const createDefaultCostBreakdown = (staffList = []) => ({
  directLabor: [
    { label: '기본급',        values: makeValuesObj(staffList) },
    { label: '야간근로수당',   values: makeValuesObj(staffList) },
    { label: '직책수당',       values: makeValuesObj(staffList) },
    { label: '근로자의날 수당', values: makeValuesObj(staffList) },
    { label: '연차적립금',     values: makeValuesObj(staffList) },
    { label: '퇴직적립금',     values: makeValuesObj(staffList) },
  ],
  indirectLabor: [
    { label: '건강보험',     values: makeValuesObj(staffList) },
    { label: '장기요양보험', values: makeValuesObj(staffList) },
    { label: '국민연금',     values: makeValuesObj(staffList) },
    { label: '고용보험',     values: makeValuesObj(staffList) },
    { label: '산재보험',     values: makeValuesObj(staffList) },
  ],
  expenses: [
    { label: '피복비 및 장구비', values: makeValuesObj(staffList) },
    { label: '교육훈련비',       values: makeValuesObj(staffList) },
    { label: '소모품비',         values: makeValuesObj(staffList) },
    { label: '복리후생비',       values: makeValuesObj(staffList) },
  ],
  // ★ 요율 대신 직접 금액을 입력받기 위한 객체
  managementFee: makeValuesObj(staffList),
  profit: makeValuesObj(staffList),
  specialNote: '',
});

const syncCostBreakdownToStaff = (group) => {
  const sections = ['directLabor', 'indirectLabor', 'expenses'];
  const currentCodes = group.staffList.map(s => s.code);

  sections.forEach(section => {
    group.costBreakdown[section].forEach(item => {
      currentCodes.forEach(code => {
        if (!(code in item.values)) item.values[code] = 0;
      });
      Object.keys(item.values).forEach(code => {
        if (!currentCodes.includes(code)) delete item.values[code];
      });
    });
  });

  // ★ 일반관리비, 기업이윤 객체도 인원 변경 시 동기화
  const manualItems = ['managementFee', 'profit'];
  manualItems.forEach(key => {
    currentCodes.forEach(code => {
      if (!(code in group.costBreakdown[key])) group.costBreakdown[key][code] = 0;
    });
    Object.keys(group.costBreakdown[key]).forEach(code => {
      if (!currentCodes.includes(code)) delete group.costBreakdown[key][code];
    });
  });
};

// =============================================
// 계약 그룹 CRUD
// =============================================
const addContractGroup = (category) => {
  contractGroups.value.push({
    category: category.itemNm,
    type: category.itemCd,
    contractStart: '', contractEnd: '',
    totalCost: 0, workDays: '', workSchedule: '', breakTime: '',
    staffList: [],
    tempJobCode: '', tempCount: 1,
    costBreakdown: createDefaultCostBreakdown([]),
    showCostBreakdown: false,
  });
};

const removeContractGroup = (index) => {
  if (confirm('해당 계약 정보를 삭제하시겠습니까?')) {
    contractGroups.value.splice(index, 1);
  }
};

const addStaffToGroup = (groupIndex) => {
  const group = contractGroups.value[groupIndex];
  if (!group.tempJobCode) { alert('직책을 선택해주세요.'); return; }
  if (group.tempCount < 1) { alert('1명 이상 입력해주세요.'); return; }

  const jobInfo = positionOptions.value.find(p => p.itemCd === group.tempJobCode);
  const existing = group.staffList.find(s => s.code === jobInfo.itemCd);
  if (existing) {
    existing.count += Number(group.tempCount);
  } else {
    group.staffList.push({ code: jobInfo.itemCd, name: jobInfo.itemNm, count: Number(group.tempCount) });
  }

  syncCostBreakdownToStaff(group);
  group.tempJobCode = '';
  group.tempCount = 1;
};

const removeStaffFromGroup = (groupIndex, staffIndex) => {
  contractGroups.value[groupIndex].staffList.splice(staffIndex, 1);
  syncCostBreakdownToStaff(contractGroups.value[groupIndex]);
};

const getGroupStaffTotal = (group) => group.staffList.reduce((s, i) => s + i.count, 0);

const getContractDuration = (group) => {
  if (!group.contractStart || !group.contractEnd) return '';
  const diffDays = Math.ceil(Math.abs(new Date(group.contractEnd) - new Date(group.contractStart)) / 86400000);
  const months = Math.floor(diffDays / 30);
  const years  = Math.floor(months / 12);
  if (years > 0) {
    const rem = months % 12;
    return rem > 0 ? `${years}년 ${rem}개월` : `${years}년`;
  }
  return `${months}개월`;
};

// =============================================
// 산출내역서 계산 함수
// =============================================
// 1개 항목 행합계 = (단가 × 인원수)의 합
const getRowTotal = (item, staffList) =>
    (staffList ?? []).reduce((s, st) => s + (Number(item.values[st.code]) || 0) * (Number(st.count) || 0), 0);

// 특정 열(직책)의 단순 합계
const getColTotal = (items, code) =>
    items.reduce((s, item) => s + (Number(item.values[code]) || 0), 0);

// 소계 영역의 행합계
const getSubtotalRowTotal = (group, sectionFn) =>
    group.staffList.reduce((s, st) => s + sectionFn(group, st.code) * (Number(st.count) || 0), 0);

const getDirectLaborColTotal   = (group, code) => getColTotal(group.costBreakdown.directLabor, code);
const getIndirectLaborColTotal = (group, code) => getColTotal(group.costBreakdown.indirectLabor, code);
const getExpensesColTotal      = (group, code) => getColTotal(group.costBreakdown.expenses, code);

// D: 노무비 합계 (직책별)
const getLaborColTotal = (group, code) =>
    getDirectLaborColTotal(group, code) + getIndirectLaborColTotal(group, code) + getExpensesColTotal(group, code);

// D: 노무비 전체 행합계
const getLaborGrandTotal = (group) =>
    group.staffList.reduce((s, st) => s + getLaborColTotal(group, st.code) * st.count, 0);

// E: 일반관리비 (직접 입력값 반환)
const getManagementFeeCol = (group, code) => Number(group.costBreakdown.managementFee[code]) || 0;

// E: 일반관리비 전체 행합계
const getManagementFeeGrandTotal = (group) =>
    group.staffList.reduce((s, st) => s + getManagementFeeCol(group, st.code) * st.count, 0);

// F: 기업이윤 (직접 입력값 반환)
const getProfitCol = (group, code) => Number(group.costBreakdown.profit[code]) || 0;

// F: 기업이윤 전체 행합계
const getProfitGrandTotal = (group) =>
    group.staffList.reduce((s, st) => s + getProfitCol(group, st.code) * st.count, 0);

// 1인당 월 용역비 (D+E+F)
const getMonthlyTotalCol = (group, code) =>
    getLaborColTotal(group, code) + getManagementFeeCol(group, code) + getProfitCol(group, code);

// 전체 월간 용역비 (총합계)
const getTotalMonthlyFee = (group) =>
    group.staffList.reduce((s, st) => s + getMonthlyTotalCol(group, st.code) * st.count, 0);


const addItem = (group, section) => {
  group.costBreakdown[section].push({ label: '', values: makeValuesObj(group.staffList) });
};
const removeItem = (group, section, idx) => {
  group.costBreakdown[section].splice(idx, 1);
};

// =============================================
// 폼 및 API 처리 로직
// =============================================
const handleFileChange = (event) => {
  const file = event.target.files[0];
  if (file) {
    if (file.type !== 'application/pdf') {
      alert('PDF 파일만 업로드 가능합니다.');
      event.target.value = '';
      selectedFile.value = null;
      return;
    }
    selectedFile.value = file;
  } else {
    selectedFile.value = null;
  }
};

const totalArea = computed(() => {
  const under = Number(site.value.areaUnder) || 0;
  const over = Number(site.value.areaOver) || 0;
  return Math.round((under + over) * 100) / 100;
});

const isVatSite = computed(() => Number(site.value.areaOver) > 0);

const handleSubmit = async () => {
  if (!site.value.siteName) { alert('현장명을 입력해주세요.'); currentStep.value = 1; return; }
  if (!site.value.siteType) { alert('현장 형태를 선택해주세요.'); currentStep.value = 1; return; }
  if (!site.value.postalCode) { alert('주소를 입력해주세요.'); currentStep.value = 1; return; }
  if (!site.value.building_su) { alert('건물 수를 입력해주세요.'); currentStep.value = 1; return; }
  if (!site.value.unit_su) { alert('세대 수를 입력해주세요.'); currentStep.value = 1; return; }
  if (!site.value.payment_day) { alert('급여지급일을 선택해주세요.'); currentStep.value = 1; return; }
  if (!site.value.director) { alert('관리 소장 이름을 입력해주세요.'); currentStep.value = 3; return; }
  if (!site.value.directorContact) { alert('관리 소장 연락처를 입력해주세요.'); currentStep.value = 3; return; }


  try {
    const contractsJson = JSON.stringify(contractGroups.value);
    const params = {
      cIdx: authStore.user?.cIdx,
      sIdx: route.query.idx || '',
      sType: site.value.siteType,
      name: site.value.siteName,
      site_id: site.value.siteId,
      status: site.value.status,
      area: site.value.areaGross,
      areaOver: site.value.areaOver,
      areaUnder: site.value.areaUnder,
      is_vat: site.value.is_vat ? 'Y' : 'N',
      building_su: site.value.building_su,
      unit_su: site.value.unit_su,
      postalCode: site.value.postalCode,
      address: site.value.addressMain,
      addressDetail: site.value.addressDetail,
      payment_day: site.value.payment_day,
      manager: site.value.managerName,
      phone: site.value.managerContact,
      director: site.value.director,
      directorContact: site.value.directorContact,
      bigo: site.value.bigo,
      contract_details: contractsJson
    };

    const res = await axios.post(`/api/v1/site/register`, params);
    const savedSIdx = res.data.data || route.query.idx;
    if (!savedSIdx) throw new Error('sIdx를 찾을 수 없습니다.');

    if (selectedFile.value) {
      const formData = new FormData();
      formData.append('file', selectedFile.value);
      await axios.post(`/api/v1/upload/file/${savedSIdx}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
    }

    alert(`${site.value.siteName} 현장 및 계약 정보가 등록되었습니다.`);
    router.push('/site/list');
  } catch (err) {
    console.error('등록 에러:', err);
    alert('저장 중 오류가 발생했습니다.');
  }
};

const getSiteData = async () => {
  const sIdx = route.query.idx;
  if (!sIdx) return;
  axios.get(`/api/v1/site/data/${sIdx}`).then(res => {
    const result = res.data.data[0];
    if (!result) return;
    site.value.siteName       = result.name;
    site.value.siteId         = result.site_id;
    site.value.siteType       = result.sType;
    site.value.status         = result.status === 'Y' ? '운영 중' : '계약 종료';
    site.value.areaGross      = result.area;
    site.value.areaOver       = result.areaOver;
    site.value.areaUnder      = result.areaUnder;
    site.value.is_vat         = result.is_vat;
    site.value.addressMain    = result.address;
    site.value.addressDetail  = result.address_detail;
    site.value.building_su    = result.building_su;
    site.value.unit_su        = result.unit_su;
    site.value.managerName    = result.manager;
    site.value.managerContact = result.phone;
    site.value.director       = result.director;
    site.value.directorContact= result.director_phone;
    site.value.payment_day    = result.payment_day;

    if(result.contractList){
      const contract = JSON.parse(result.contractList);
      contractGroups.value = contract.map(item => ({
        category: item.category,
        type: item.type,
        contractStart: item.startDt,
        contractEnd: item.endDt,
        totalCost: 0,
        workDays: item.workDays,
        workSchedule: item.workSchedule,
        breakTime: item.breaktime,
        staffList: item.staffList || [],
        tempJobCode: '',
        tempCount: 1,
        costBreakdown: item.costBreakdown || createDefaultCostBreakdown(item.staffList || []),
        showCostBreakdown: false,
      }));
    }

    if (result.bigoList) {
      try {
        bigoHistory.value = JSON.parse(result.bigoList);
        bigoHistory.value.sort((a, b) => new Date(b.regDt) - new Date(a.regDt));
      } catch { bigoHistory.value = []; }
    }
    site.value.bigo = '';
  });
};

const loadDaumPostcodeScript = () => new Promise((resolve) => {
  if (window.kakao && window.kakao.Postcode) { resolve(); return; }
  const script = document.createElement('script');
  script.src = '//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  script.onload = resolve;
  document.head.appendChild(script);
});

const searchAddress = async () => {
  await loadDaumPostcodeScript();
  new window.kakao.Postcode({
    oncomplete: (data) => {
      let addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
      if (data.userSelectedType === 'R') {
        let extra = '';
        if (data.bname && /[동|로|가]$/.test(data.bname)) extra += data.bname;
        if (data.buildingName && data.apartment === 'Y') extra += (extra ? ', ' : '') + data.buildingName;
        if (extra) addr += ` (${extra})`;
      }
      site.value.postalCode    = data.zonecode;
      site.value.addressMain   = addr;
      site.value.addressDetail = '';
      if (detailInput.value) detailInput.value.focus();
    }
  }).open();
};

const handleCancel = () => {
  if (confirm('작성 중인 내용이 사라집니다. 취소하시겠습니까?')) router.push('/site/list');
};
const nextStep = () => {
  if (currentStep.value < totalSteps) {
    currentStep.value++;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};
const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

onMounted(() => {
  fetchPositionOptions();
  fetchTypeOptions();
  getSiteData();
});
</script>

<template>
  <div class="site-register-page">

    <div class="page-header">
      <div class="header-left">
        <button @click="handleCancel" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title"><i class="mdi mdi-office-building-plus-outline"></i> 현장 등록</h1>
          <p class="page-subtitle">새로운 현장 정보를 등록합니다</p>
        </div>
      </div>
      <button @click="handleCancel" class="btn-cancel">
        <i class="mdi mdi-close"></i><span>취소</span>
      </button>
    </div>

    <div class="steps-container">
      <div class="steps-list">
        <div v-for="step in steps" :key="step.number"
             :class="['step-item', { active: currentStep === step.number, completed: currentStep > step.number }]">
          <div class="step-circle">
            <i v-if="currentStep > step.number" class="mdi mdi-check"></i>
            <i v-else-if="currentStep === step.number" :class="['mdi', step.icon]"></i>
            <span v-else>{{ step.number }}</span>
          </div>
          <div class="step-info">
            <span class="step-number">STEP {{ step.number }}</span>
            <span class="step-title">{{ step.title }}</span>
          </div>
        </div>
      </div>
    </div>

    <form @submit.prevent="handleSubmit">
      <div class="form-container">

        <div v-if="currentStep === 1" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-office-building-outline"></i>
            <h2>현장 기본 정보</h2>
          </div>
          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label required"><i class="mdi mdi-office-building-marker-outline"></i>현장명</label>
              <input type="text" v-model="site.siteName" required class="form-input" placeholder="예: LH 위례 6단지" />
            </div>
            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-barcode"></i>현장 코드</label>
              <input type="text" v-model="site.siteId" class="form-input" placeholder="선택사항" />
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-tag-outline"></i>현장 형태</label>
              <select v-model="site.siteType" required class="form-select">
                <option value="">선택하세요</option>
                <option v-for="t in siteTypeOptions" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-flag-outline"></i>현장 상태</label>
              <div class="radio-group">
                <label v-for="s in statusOptions" :key="s" class="radio-label">
                  <input type="radio" v-model="site.status" :value="s" /><span>{{ s }}</span>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-domain"></i>연면적 (건축물 총면적)</label>
              <div style="position: relative;">
                <input type="number" v-model="site.areaGross" class="form-input text-right" placeholder="0" min="0" step="0.01" style="padding-right: 32px;" />
                <span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-muted);">㎡</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-ruler-square"></i>135㎡ 이하 (면세 면적)</label>
              <div style="position: relative;">
                <input type="number" v-model="site.areaUnder" class="form-input text-right" placeholder="0" min="0" step="0.01" style="padding-right: 32px;" />
                <span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-muted);">㎡</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-ruler-square"></i>135㎡ 초과 (과세 면적)</label>
              <div style="position: relative;">
                <input type="number" v-model="site.areaOver" class="form-input text-right" placeholder="0" min="0" step="0.01" style="padding-right: 32px;" />
                <span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; color: var(--text-muted);">㎡</span>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-calculator"></i>총 관리면적 (자동계산)</label>
              <div style="position: relative;">
                <input type="text" :value="totalArea" class="form-input text-right font-bold" readonly style="padding-right: 32px; background: var(--bg-hover); color: var(--primary); border-color: var(--primary);" />
                <span style="position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 13px; font-weight: bold; color: var(--primary);">㎡</span>
              </div>
              <p style="margin: 6px 0 0; font-size: 11px; color: var(--text-muted); line-height: 1.4;">
                * 135㎡ 초과 면적 입력 시 <strong :style="{ color: isVatSite ? 'var(--primary)' : 'inherit' }">과세 사업장({{ isVatSite ? 'Y' : 'N' }})</strong>으로 자동 설정.
              </p>
            </div>

            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-domain"></i>건물 수</label>
              <input type="number" v-model="site.building_su" required class="form-input text-right" placeholder="0" />
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-home-group"></i>세대 수</label>
              <input type="number" v-model="site.unit_su" required class="form-input text-right" placeholder="0" />
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-calendar-clock-outline"></i>급여지급일</label>
              <select v-model="site.payment_day" required class="form-select">
                <option value="">선택</option>
                <option v-for="d in 31" :key="d" :value="d">{{ d }}일</option>
              </select>
            </div>
          </div>

          <div class="step-header">
            <i class="mdi mdi-map-marker-outline"></i><h2>주소 정보</h2>
          </div>
          <div class="form-grid">
            <div class="form-group full-width">
              <label class="form-label required"><i class="mdi mdi-map-marker-radius-outline"></i>주소</label>
              <div class="address-search-group">
                <input type="text" v-model="site.postalCode" placeholder="우편번호" required class="form-input postal-input" readonly />
                <button type="button" @click="searchAddress" class="btn-search-address">
                  <i class="mdi mdi-magnify"></i>주소 검색
                </button>
              </div>
            </div>
            <div class="form-group full-width">
              <input type="text" v-model="site.addressMain" placeholder="기본 주소" required class="form-input" readonly />
            </div>
          </div>

          <div class="form-actions">
            <button type="button" @click="nextStep" class="btn-next">다음 단계<i class="mdi mdi-arrow-right"></i></button>
          </div>
        </div>

        <div v-if="currentStep === 2" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-file-document-outline"></i><h2>계약 및 인원 정보</h2>
          </div>

          <div class="file-upload-section">
            <label class="section-label"><i class="mdi mdi-file-pdf-box"></i>계약서 원본 파일 업로드 (PDF)</label>
            <div class="file-upload-box" :class="{ 'has-file': selectedFile }">
              <input type="file" id="contract-file" accept=".pdf" @change="handleFileChange" class="hidden-file-input" />
              <label for="contract-file" class="file-upload-label">
                <div v-if="!selectedFile" class="upload-placeholder">
                  <i class="mdi mdi-cloud-upload-outline"></i>
                  <p>클릭하여 PDF 파일을 선택해주세요</p>
                  <span>(또는 파일을 여기로 드래그 앤 드롭 하세요)</span>
                </div>
                <div v-else class="upload-selected">
                  <div class="selected-file-info">
                    <i class="mdi mdi-file-pdf-box"></i>
                    <span class="file-name">{{ selectedFile.name }}</span>
                  </div>
                  <span class="file-change-text">파일 변경하기</span>
                </div>
              </label>
            </div>
            <p v-if="selectedFile" class="file-success-msg">
              <i class="mdi mdi-check-circle"></i> 최종 등록 완료 시 파일이 안전하게 업로드됩니다.
            </p>
          </div>

          <div class="contract-header">
            <p class="contract-description">현장의 계약 정보를 추가합니다. 경비, 미화 등 구분별로 계약을 등록할 수 있습니다.</p>
            <div class="contract-actions">
              <button v-for="cat in typeOptions" :key="cat.itemCd" type="button"
                      @click="addContractGroup(cat)" class="btn-add-contract">
                <i class="mdi mdi-plus"></i>{{ cat.itemNm }} 추가
              </button>
            </div>
          </div>

          <div v-if="contractGroups.length === 0" class="empty-contracts">
            <i class="mdi mdi-file-document-multiple-outline"></i>
            <p>등록된 계약이 없습니다</p>
            <span>상단 버튼을 눌러 계약 정보를 추가해주세요</span>
          </div>

          <div v-for="(group, idx) in contractGroups" :key="idx" class="contract-card">
            <div class="contract-card-header">
              <div class="contract-title">
                <span :class="['contract-badge', `badge-${group.category}`]">
                  <i class="mdi mdi-briefcase-outline"></i>{{ group.category }}
                </span>
                <span v-if="getContractDuration(group)" class="contract-duration">
                  <i class="mdi mdi-calendar-range"></i>{{ getContractDuration(group) }}
                </span>
              </div>
              <button type="button" @click="removeContractGroup(idx)" class="btn-remove-contract">
                <i class="mdi mdi-trash-can-outline"></i>
              </button>
            </div>

            <div class="contract-card-body">
              <div class="form-grid">
                <div class="form-group">
                  <label class="form-label required"><i class="mdi mdi-calendar-start-outline"></i>계약 시작일</label>
                  <input type="date" v-model="group.contractStart" required class="form-input" />
                </div>
                <div class="form-group">
                  <label class="form-label required"><i class="mdi mdi-calendar-end-outline"></i>계약 종료일</label>
                  <input type="date" v-model="group.contractEnd" required class="form-input" />
                </div>
                <div class="form-group full-width">
                  <label class="form-label required"><i class="mdi mdi-clock-outline"></i>근무 시간 및 형태</label>
                  <textarea v-model="group.workSchedule" rows="2" class="form-textarea"
                            placeholder="예: 격일제 교대 근무 (09:00 ~ 익일 09:00)"></textarea>
                </div>
                <div class="form-group full-width">
                  <label class="form-label"><i class="mdi mdi-coffee-outline"></i>휴게 시간</label>
                  <input type="text" v-model="group.breakTime" class="form-input"
                         placeholder="예: 주간 2시간, 야간 4시간" />
                </div>
              </div>

              <div class="staff-section">
                <label class="section-label"><i class="mdi mdi-account-group-outline"></i>인원 구성</label>
                <div class="staff-input-group">
                  <select v-model="group.tempJobCode" class="form-select staff-position">
                    <option value="">직책 선택</option>
                    <option v-for="opt in positionOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
                  </select>
                  <input type="number" v-model="group.tempCount" min="1"
                         class="form-input staff-count text-right" placeholder="인원" />
                  <button type="button" @click="addStaffToGroup(idx)" class="btn-add-staff">
                    <i class="mdi mdi-plus"></i>추가
                  </button>
                </div>
                <div v-if="group.staffList && group.staffList.length > 0" class="staff-list">
                  <div v-for="(staff, sIdx) in group.staffList" :key="sIdx" class="staff-item">
                    <div class="staff-info">
                      <i class="mdi mdi-account-outline"></i>
                      <span class="staff-position-name">{{ staff.name }}</span>
                      <span class="staff-count-badge">{{ staff.count }}명</span>
                    </div>
                    <button type="button" @click="removeStaffFromGroup(idx, sIdx)" class="btn-remove-staff">
                      <i class="mdi mdi-close"></i>
                    </button>
                  </div>
                  <div class="staff-total">
                    <i class="mdi mdi-sigma"></i>
                    <span>합계: <strong>{{ getGroupStaffTotal(group) }}명</strong></span>
                  </div>
                </div>
              </div>

              <div class="cost-breakdown-wrapper">
                <button type="button" class="btn-toggle-cost"
                        @click="group.showCostBreakdown = !group.showCostBreakdown">
                  <i :class="group.showCostBreakdown ? 'mdi mdi-chevron-up' : 'mdi mdi-chevron-down'"></i>
                  <span>{{ group.showCostBreakdown ? '산출내역서 접기' : '산출내역서 펼치기' }}</span>
                  <span v-if="getTotalMonthlyFee(group) > 0" class="cost-preview-badge">
                    월 {{ formatCurrency(getTotalMonthlyFee(group)) }}원
                  </span>
                </button>

                <div v-show="group.showCostBreakdown" class="cost-breakdown-section">

                  <div v-if="group.staffList.length === 0" class="cost-no-staff">
                    <i class="mdi mdi-account-plus-outline"></i>
                    <p>먼저 인원 구성에서 직책을 추가하면<br>직책별 산출내역을 입력할 수 있습니다.</p>
                  </div>

                  <template v-else>
                    <div class="cost-scroll-area">

                      <div class="cost-section-title">
                        <span class="cost-block-label label-direct">A</span>
                        직접노무비 <em>(지급내역)</em>
                        <button type="button" @click="addItem(group, 'directLabor')" class="btn-add-cost-item">
                          <i class="mdi mdi-plus"></i>항목 추가
                        </button>
                      </div>
                      <table class="cost-table">
                        <thead>
                        <tr>
                          <th class="col-label">항목</th>
                          <th v-for="staff in group.staffList" :key="staff.code" class="col-staff">
                            <span class="staff-th-name">{{ staff.name }}</span>
                            <span class="staff-th-count">({{ staff.count }}명)</span>
                          </th>
                          <th class="col-rowtotal-head">행합계</th>
                          <th class="col-rowtotal">산출내역</th>
                          <th class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, iIdx) in group.costBreakdown.directLabor" :key="'dl-'+iIdx">
                          <td>
                            <CodeSelect
                                v-model="item.code"
                                @update:label="(val) => item.label = val"
                                :allow-empty="false"
                            />
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input
                                v-model.number="item.values[staff.code]"
                                type="number"
                                class="tbl-value-input"
                                placeholder="0"
                                min="0"
                            />
                          </td>
                          <td class="col-rowtotal-cell">
                            {{ formatCurrency(getRowTotal(item, group.staffList)) }}
                          </td>
                          <td><input type="text" class="tbl-value-input" v-model="item.bigo"></td>
                          <td class="col-action">
                            <button type="button" @click="removeItem(group, 'directLabor', iIdx)" class="btn-remove-cost">
                              <i class="mdi mdi-close"></i>
                            </button>
                          </td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (A)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            {{ formatCurrency(getDirectLaborColTotal(group, staff.code)) }}
                          </td>
                          <td class="col-rowtotal-cell subtotal-rowtotal">
                            {{ formatCurrency(getSubtotalRowTotal(group, getDirectLaborColTotal)) }}
                          </td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>
                        </tfoot>
                      </table>

                      <div class="cost-section-title">
                        <span class="cost-block-label label-indirect">B</span>
                        간접노무비 <em>(공제내역)</em>
                        <button type="button" @click="addItem(group, 'indirectLabor')" class="btn-add-cost-item">
                          <i class="mdi mdi-plus"></i>항목 추가
                        </button>
                      </div>
                      <table class="cost-table">
                        <thead>
                        <tr>
                          <th class="col-label">항목</th>
                          <th v-for="staff in group.staffList" :key="staff.code" class="col-staff">
                            <span class="staff-th-name">{{ staff.name }}</span>
                            <span class="staff-th-count">({{ staff.count }}명)</span>
                          </th>
                          <th class="col-rowtotal-head">행합계</th>
                          <th class="col-rowtotal">산출내역</th>
                          <th class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, iIdx) in group.costBreakdown.indirectLabor" :key="'il-'+iIdx">
                          <td>
                            <CodeSelect v-model="item.label" :allow-empty="false" />
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input v-model.number="item.values[staff.code]"
                                   type="number" class="tbl-value-input" placeholder="0" min="0" />
                          </td>
                          <td class="col-rowtotal-cell">
                            {{ formatCurrency(getRowTotal(item, group.staffList)) }}
                          </td>
                          <td class="">
                            <input type="text" class="tbl-value-input" v-model="item.bigo">
                          </td>
                          <td class="col-action">
                            <button type="button" @click="removeItem(group, 'indirectLabor', iIdx)" class="btn-remove-cost">
                              <i class="mdi mdi-close"></i>
                            </button>
                          </td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (B)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            {{ formatCurrency(getIndirectLaborColTotal(group, staff.code)) }}
                          </td>
                          <td class="col-rowtotal-cell subtotal-rowtotal">
                            {{ formatCurrency(getSubtotalRowTotal(group, getIndirectLaborColTotal)) }}
                          </td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>
                        </tfoot>
                      </table>

                      <div class="cost-section-title">
                        <span class="cost-block-label label-expense">C</span>
                        제경비
                        <button type="button" @click="addItem(group, 'expenses')" class="btn-add-cost-item">
                          <i class="mdi mdi-plus"></i>항목 추가
                        </button>
                      </div>
                      <table class="cost-table">
                        <thead>
                        <tr>
                          <th class="col-label">항목</th>
                          <th v-for="staff in group.staffList" :key="staff.code" class="col-staff">
                            <span class="staff-th-name">{{ staff.name }}</span>
                            <span class="staff-th-count">({{ staff.count }}명)</span>
                          </th>
                          <th class="col-rowtotal-head">행합계</th>
                          <th class="col-rowtotal">산출내역</th>
                          <th class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, eIdx) in group.costBreakdown.expenses" :key="'exp-'+eIdx">
                          <td>
                            <CodeSelect v-model="item.label" :allow-empty="false" />
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input v-model.number="item.values[staff.code]" type="number" class="tbl-value-input" placeholder="0" min="0" />
                          </td>
                          <td class="col-rowtotal-cell">
                            {{ formatCurrency(getRowTotal(item, group.staffList)) }}
                          </td>
                          <td class="">
                            <input type="text" class="tbl-value-input" v-model="item.bigo">
                          </td>
                          <td class="col-action">
                            <button type="button" @click="removeItem(group, 'expenses', eIdx)" class="btn-remove-cost">
                              <i class="mdi mdi-close"></i>
                            </button>
                          </td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (C)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            {{ formatCurrency(getExpensesColTotal(group, staff.code)) }}
                          </td>
                          <td class="col-rowtotal-cell subtotal-rowtotal">
                            {{ formatCurrency(getSubtotalRowTotal(group, getExpensesColTotal)) }}
                          </td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>
                        </tfoot>
                      </table>

                      <div class="cost-section-title">
                        <span class="cost-block-label label-total">합계</span>
                        노무비 합계 및 용역비 산출
                      </div>
                      <table class="cost-table summary-table">
                        <thead>
                        <tr>
                          <th class="col-label">항목</th>
                          <th v-for="staff in group.staffList" :key="staff.code" class="col-staff">
                            <span class="staff-th-name">{{ staff.name }}</span>
                            <span class="staff-th-count">({{ staff.count }}명)</span>
                          </th>
                          <th class="col-rowtotal-head">행합계</th>
                          <th class="col-rowtotal">산출 내역</th>
                          <th class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr class="summary-row row-d">
                          <td>
                              <span class="summary-label">
                                <span class="cost-block-label label-total">D</span>
                                노무비 합계 (A+B+C)
                              </span>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <span class="summary-val">{{ formatCurrency(getLaborColTotal(group, staff.code)) }}</span>
                          </td>
                          <td class="col-rowtotal-cell">
                            <span class="summary-val bold">{{ formatCurrency(getLaborGrandTotal(group)) }}</span>
                          </td>
                          <td>
                            <input type="text" class="tbl-value-input">
                          </td>
                          <td></td>
                        </tr>

                        <tr class="summary-row row-e">
                          <td>
                            <div class="summary-label-rate">
                                <span class="summary-label">
                                  <span class="cost-block-label label-mgmt">E</span>일반관리비
                                </span>
                            </div>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input
                                v-model.number="group.costBreakdown.managementFee[staff.code]"
                                type="number"
                                class="tbl-value-input"
                                placeholder="0"
                                min="0"
                            />
                          </td>
                          <td class="col-rowtotal-cell">
                            <span class="summary-val">{{ formatCurrency(getManagementFeeGrandTotal(group)) }}</span>
                          </td>
                          <td>
                            <input type="text" class="tbl-value-input">
                          </td>
                          <td></td>
                        </tr>

                        <tr class="summary-row row-f">
                          <td>
                            <div class="summary-label-rate">
                                <span class="summary-label">
                                  <span class="cost-block-label label-profit">F</span>기업이윤
                                </span>
                            </div>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input
                                v-model.number="group.costBreakdown.profit[staff.code]"
                                type="number"
                                class="tbl-value-input"
                                placeholder="0"
                                min="0"
                            />
                          </td>
                          <td class="col-rowtotal-cell">
                            <span class="summary-val">{{ formatCurrency(getProfitGrandTotal(group)) }}</span>
                          </td>
                          <td>
                            <input type="text" class="tbl-value-input">
                          </td>
                          <td></td>
                        </tr>

                        <tr class="summary-row row-monthly">
                          <td>
                              <span class="summary-label">
                                <span class="cost-block-label label-monthly">월</span>
                                1인당 월 용역비 (D+E+F)
                              </span>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                              <span class="summary-val highlight">
                                {{ formatCurrency(getMonthlyTotalCol(group, staff.code)) }}
                              </span>
                          </td>
                          <td class="col-rowtotal-cell">-</td>
                          <td><input type="text" class="tbl-value-input"></td>
                          <td></td>
                        </tr>

                        <tr class="summary-row row-total-fee">
                          <td>
                              <span class="summary-label">
                                <span class="cost-block-label label-total-fee">합</span>
                                월간 용역비 총계
                              </span>
                          </td>
                          <td :colspan="group.staffList.length">
                            <span class="summary-val grand-total">
                              {{ formatCurrency(getTotalMonthlyFee(group)) }}
                            </span>
                          </td>
                          <td class="col-rowtotal-cell">
                          </td>
                          <td>
                            <input type="text" class="tbl-value-input">
                          </td>
                          <td></td>
                        </tr>

                        <tr>
                          <td>
                              <span class="summary-label">
                                <span class="cost-block-label label-total-fee">합</span>
                                입찰 금액 <br>(계약기간 총 용역비)
                              </span>
                          </td>
                          <td :colspan="group.staffList.length + 1">
                            <input type="text" class="tbl-value-input">
                          </td>
                          <td>
                            <input type="text" class="tbl-value-input">
                          </td>
                          <td></td>
                        </tr>
                        </tbody>
                      </table>

                    </div>
                    <div class="cost-special-note">
                      <label class="form-label">
                        <i class="mdi mdi-text-box-edit-outline"></i>특이사항
                      </label>
                      <textarea v-model="group.costBreakdown.specialNote" class="form-textarea" rows="3"
                                placeholder="예: 최저임금 기준 적용, 5대보험 인원전원 가입 조건으로 산출 등"></textarea>
                    </div>

                  </template>
                </div>
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button type="button" @click="prevStep" class="btn-prev"><i class="mdi mdi-arrow-left"></i>이전</button>
            <button type="button" @click="nextStep" class="btn-next">다음 단계<i class="mdi mdi-arrow-right"></i></button>
          </div>
        </div>

        <div v-if="currentStep === 3" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-account-tie-outline"></i><h2>담당자 및 기타 정보</h2>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-account-outline"></i>본사 담당자 이름</label>
              <input type="text" v-model="site.managerName" class="form-input" placeholder="홍길동" />
            </div>
            <div class="form-group">
              <label class="form-label"><i class="mdi mdi-phone-outline"></i>본사 담당자 연락처</label>
              <input type="tel" v-model="site.managerContact" class="form-input" placeholder="010-0000-0000" />
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-account-hard-hat-outline"></i>관리 소장 이름</label>
              <input type="text" v-model="site.director" required class="form-input" placeholder="김관리" />
            </div>
            <div class="form-group">
              <label class="form-label required"><i class="mdi mdi-phone-outline"></i>관리 소장 연락처</label>
              <input type="tel" v-model="site.directorContact" required class="form-input" placeholder="010-0000-0000" />
            </div>
            <div class="form-group full-width">
              <label class="section-label"><i class="mdi mdi-note-text-outline"></i>특이사항 및 메모</label>
              <div v-if="bigoHistory.length > 0" class="memo-history">
                <div class="history-header"><i class="mdi mdi-history"></i><span>히스토리 ({{ bigoHistory.length }}건)</span></div>
                <div class="history-list">
                  <div v-for="(item, i) in bigoHistory" :key="i" class="history-item">
                    <span class="history-date">{{ item.regDt ? item.regDt.substring(0,10) : '-' }}</span>
                    <p class="history-content">{{ item.bigo }}</p>
                  </div>
                </div>
              </div>
              <textarea v-model="site.bigo" class="form-textarea" rows="4" placeholder="추가할 특이사항을 입력하세요"></textarea>
            </div>
          </div>
          <div class="form-actions">
            <button type="button" @click="prevStep" class="btn-prev"><i class="mdi mdi-arrow-left"></i>이전</button>
            <button type="submit" class="btn-submit"><i class="mdi mdi-check"></i>등록 완료</button>
          </div>
        </div>

      </div>
    </form>
  </div>
</template>

<style scoped>
/* =========================================
   기본 레이아웃
========================================= */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.header-left { display: flex; align-items: flex-start; gap: 16px; }
.page-title { font-size: 22px; font-weight: 700; color: var(--text-main); margin: 0 0 4px 0; display: flex; align-items: center; gap: 8px; }
.page-subtitle { font-size: 13px; color: var(--text-sub); margin: 0; }

.btn-back { width: 42px; height: 42px; border-radius: 10px; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; padding: 0; }
.btn-back:hover { background: var(--bg-hover); border-color: var(--border-focus); color: var(--text-main); }
.btn-back i { font-size: 20px; }
.btn-cancel { display: flex; align-items: center; gap: 6px; padding: 10px 18px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-sub); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-main); border-color: var(--border-focus); }

/* 스텝 */
.steps-container { background: var(--bg-surface); border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
.steps-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.step-item { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 8px; transition: all 0.2s; background: var(--bg-canvas); }
.step-item.active { background-color: var(--primary-soft); border: 1px solid var(--primary); }
.step-circle { width: 40px; height: 40px; border-radius: 50%; background: var(--text-muted); color: var(--text-inverse); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; flex-shrink: 0; transition: all 0.2s; }
.step-item.active .step-circle { background-color: var(--primary); }
.step-item.completed .step-circle { background-color: var(--success); }
.step-circle i { font-size: 20px; }
.step-info { display: flex; flex-direction: column; gap: 2px; }
.step-number { font-size: 11px; color: var(--text-sub); font-weight: 600; letter-spacing: 0.5px; }
.step-title { font-size: 13px; color: var(--text-main); font-weight: 600; }
.step-item.active .step-number, .step-item.active .step-title { color: var(--primary); }

/* 폼 공통 */
.form-container { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); overflow: hidden; }
.form-step { padding: 32px; }
.step-header { display: flex; align-items: center; gap: 10px; padding-bottom: 16px; margin-bottom: 24px; border-bottom: 1px dashed var(--border-color); }
.step-header i { font-size: 24px; color: var(--primary); }
.step-header h2 { font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 32px; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group.full-width { grid-column: 1 / -1; }
.form-label, .section-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-sub); }
.form-label i, .section-label i { font-size: 16px; color: var(--primary); }
.form-label.required::after { content: '*'; color: var(--danger); margin-left: 2px; }
.form-input, .form-select, .form-textarea { padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-main); transition: all 0.2s; background: var(--bg-surface); box-sizing: border-box; }
.form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.form-input::placeholder, .form-textarea::placeholder { color: var(--text-muted); }
.form-textarea { resize: vertical; min-height: 80px; }

.radio-group { display: flex; gap: 12px; flex-wrap: wrap; padding: 4px 0; }
.radio-label { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer; padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border-color); transition: all 0.2s; background: var(--bg-canvas); font-size: 13px; color: var(--text-sub); }
.radio-label:hover { border-color: var(--border-focus); color: var(--text-main); }
.radio-label input[type="radio"] { display: none; }
.radio-label:has(input:checked) { border-color: var(--primary); background-color: var(--primary-soft); color: var(--primary); font-weight: 600; }

.area-wrapper { display: flex; gap: 12px; align-items: center; }
.area-wrapper .form-input { flex: 1; }
.checkbox-inline { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--danger); font-weight: 600; white-space: nowrap; cursor: pointer; }
.checkbox-inline input[type="checkbox"] { width: 16px; height: 16px; cursor: pointer; accent-color: var(--danger); }

.address-search-group { display: flex; gap: 10px; }
.postal-input { width: 140px; background-color: var(--bg-canvas); }
.btn-search-address { display: flex; align-items: center; gap: 6px; padding: 10px 16px; background-color: var(--primary); border: none; border-radius: 8px; color: var(--text-inverse); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: all 0.2s; }
.btn-search-address:hover { background-color: var(--primary-hover); transform: translateY(-1px); }

/* 파일 업로드 */
.file-upload-section { margin-bottom: 32px; }
.hidden-file-input { display: none; }
.file-upload-box { border: 2px dashed var(--border-focus); border-radius: 12px; background-color: var(--bg-canvas); transition: all 0.2s ease; overflow: hidden; }
.file-upload-box:hover { border-color: var(--primary); background-color: var(--primary-soft); }
.file-upload-box.has-file { border-style: solid; border-color: var(--success); background-color: rgba(16,185,129,0.05); }
.file-upload-label { display: block; width: 100%; padding: 40px 20px; cursor: pointer; text-align: center; }
.upload-placeholder { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.upload-placeholder i { font-size: 44px; color: var(--text-muted); margin-bottom: 4px; transition: color 0.2s; }
.file-upload-box:hover .upload-placeholder i { color: var(--primary); }
.upload-placeholder p { margin: 0; font-size: 15px; font-weight: 600; color: var(--text-main); }
.upload-placeholder span { font-size: 13px; color: var(--text-sub); }
.upload-selected { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.selected-file-info { display: inline-flex; align-items: center; gap: 10px; background: var(--bg-surface); padding: 12px 20px; border-radius: 8px; box-shadow: var(--shadow-sm); border: 1px solid var(--success); }
.selected-file-info i { font-size: 24px; color: var(--danger); }
.file-name { font-size: 14px; font-weight: 600; color: var(--text-main); }
.file-change-text { font-size: 13px; color: var(--success); font-weight: 600; text-decoration: underline; }
.file-success-msg { margin: 12px 0 0 0; font-size: 13px; color: var(--success); font-weight: 600; display: flex; align-items: center; gap: 6px; }

/* 계약 */
.contract-header { margin-bottom: 20px; }
.contract-description { font-size: 13px; color: var(--text-sub); margin: 0 0 16px 0; }
.contract-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.btn-add-contract { display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--bg-surface); border: 1px dashed var(--border-focus); border-radius: 6px; color: var(--text-sub); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-add-contract:hover { background: var(--bg-hover); border-color: var(--primary); color: var(--primary); }
.empty-contracts { text-align: center; padding: 50px 20px; background: var(--bg-canvas); border-radius: 10px; border: 1px dashed var(--border-color); color: var(--text-sub); margin-bottom: 20px; }
.empty-contracts i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; color: var(--text-muted); }
.empty-contracts p { font-size: 15px; font-weight: 600; color: var(--text-main); margin: 0 0 6px 0; }

.contract-card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
.contract-card-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; background: var(--bg-canvas); border-bottom: 1px solid var(--border-color); }
.contract-title { display: flex; align-items: center; gap: 12px; }
.contract-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-inverse); }
.badge-경비 { background-color: #3b82f6; }
.badge-미화 { background-color: #ec4899; }
.badge-시설 { background-color: #10b981; }
.contract-duration { font-size: 12px; color: var(--text-sub); display: flex; align-items: center; gap: 4px; font-weight: 500; }
.btn-remove-contract { width: 28px; height: 28px; border-radius: 6px; background: rgba(239,68,68,0.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
.btn-remove-contract:hover { background: rgba(239,68,68,0.2); }
.contract-card-body { padding: 24px; }

/* 인원 */
.staff-section { margin-top: 24px; padding: 20px; background: var(--bg-canvas); border-radius: 10px; border: 1px dashed var(--border-color); }
.staff-input-group { display: flex; gap: 10px; margin: 16px 0; align-items: center; }
.staff-position { flex: 1; }
.staff-count { width: 90px; }
.btn-add-staff { display: flex; align-items: center; gap: 6px; padding: 10px 16px; background-color: var(--success); border: none; border-radius: 8px; color: var(--text-inverse); font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: 0.2s; }
.btn-add-staff:hover { background-color: var(--success-hover); }
.staff-list { display: flex; flex-direction: column; gap: 8px; }
.staff-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; }
.staff-info { display: flex; align-items: center; gap: 10px; flex: 1; }
.staff-info i { font-size: 18px; color: var(--primary); }
.staff-position-name { font-size: 13px; color: var(--text-main); font-weight: 500; }
.staff-count-badge { padding: 3px 8px; background-color: var(--primary-soft); color: var(--primary); border-radius: 6px; font-size: 12px; font-weight: 600; }
.btn-remove-staff { width: 24px; height: 24px; border-radius: 6px; background: rgba(239,68,68,0.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
.btn-remove-staff:hover { background: rgba(239,68,68,0.2); }
.staff-total { margin-top: 12px; padding: 10px 14px; background-color: var(--primary-soft); border-radius: 8px; display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--primary); font-weight: 600; }

/* =========================================
   산출내역서 토글
========================================= */
.cost-breakdown-wrapper { margin-top: 24px; }
.btn-toggle-cost { display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px 18px; background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 10px; font-size: 13px; font-weight: 600; color: var(--text-main); cursor: pointer; transition: all 0.2s; text-align: left; }
.btn-toggle-cost:hover { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.btn-toggle-cost i { font-size: 18px; }
.btn-toggle-cost span:nth-child(2) { flex: 1; }
.cost-preview-badge { padding: 3px 10px; background: var(--primary); color: var(--text-inverse); border-radius: 20px; font-size: 12px; font-weight: 700; }

/* =========================================
   산출내역서 본체
========================================= */
.cost-breakdown-section { margin-top: 8px; border: 1px solid var(--border-focus); border-radius: 10px; overflow: hidden; }

.cost-no-staff { padding: 40px 20px; text-align: center; color: var(--text-sub); }
.cost-no-staff i { font-size: 40px; margin-bottom: 12px; opacity: 0.5; display: block; }
.cost-no-staff p { font-size: 13px; line-height: 1.7; margin: 0; }

/* 섹션 타이틀 */
.cost-section-title { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bg-canvas); border-top: 1px solid var(--border-color); font-size: 13px; font-weight: 700; color: var(--text-main); }
.cost-section-title:first-child { border-top: none; }
.cost-section-title em { font-style: normal; font-weight: 400; font-size: 12px; color: var(--text-sub); margin-left: 2px; }

/* 항목 추가 버튼 */
.btn-add-cost-item { display: flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 11px; font-weight: 600; background: var(--bg-surface); border: 1px dashed var(--primary); border-radius: 6px; color: var(--primary); cursor: pointer; transition: 0.2s; margin-left: auto; white-space: nowrap; }
.btn-add-cost-item:hover { background: var(--primary-soft); }
.btn-add-cost-item i { font-size: 14px; }

/* 라벨 뱃지 */
.cost-block-label { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 5px; font-size: 11px; font-weight: 800; color: var(--text-inverse); flex-shrink: 0; }
.label-direct    { background-color: #3b82f6; }
.label-indirect  { background-color: #8b5cf6; }
.label-expense   { background-color: #f59e0b; }
.label-total     { background-color: #10b981; }
.label-mgmt      { background-color: #6b7280; }
.label-profit    { background-color: #ec4899; }
.label-monthly   { background-color: #0ea5e9; }
.label-total-fee { background-color: #f97316; }

/* 가로 스크롤 */
.cost-scroll-area { overflow-x: auto; }

/* ── 공통 테이블 ── */
.cost-table { width: 100%; border-collapse: collapse; font-size: 12px; color: var(--text-main); table-layout: fixed;}
.cost-table thead tr { background: var(--bg-canvas); }
.cost-table th, .cost-table td { padding: 8px 10px; border: 1px solid var(--border-color); vertical-align: middle; }
.cost-table th { font-size: 11px; font-weight: 700; color: var(--text-sub); text-align: center; white-space: nowrap; }
.cost-table tbody tr:hover { background: var(--bg-hover); }

.col-label    { min-width: 140px; width: 160px; }
.col-staff    { min-width: 130px; text-align: center; }
.col-rowtotal-head { min-width: 120px; text-align: right; }
.col-rowtotal { min-width: 120px; text-align: right; font-weight: 600; background: rgba(99,102,241,0.04); }
.col-action   { width: 36px; text-align: center; }
.col-rowtotal-cell { text-align: right; font-weight: bold; background: rgba(99,102,241,0.04); }

.staff-th-name  { display: block; font-size: 12px; font-weight: 700; color: var(--text-main); }
.staff-th-count { display: block; font-size: 11px; color: var(--text-sub); font-weight: 400; }

.tbl-label-input { width: 100%; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 5px; font-size: 12px; color: var(--text-main); background: var(--bg-surface); box-sizing: border-box; }
.tbl-label-input:focus { outline: none; border-color: var(--primary); }
.tbl-value-input { width: 100%; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 5px; font-size: 12px; color: var(--text-main); background: var(--bg-surface); text-align: right; box-sizing: border-box; }
.tbl-value-input:focus { outline: none; border-color: var(--primary); }
.row-total-val { font-weight: 600; font-size: 12px; color: var(--text-main); }

.btn-remove-cost { width: 24px; height: 24px; border-radius: 4px; background: rgba(239,68,68,0.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
.btn-remove-cost:hover { background: rgba(239,68,68,0.25); }
.btn-remove-cost i { font-size: 13px; }

/* tfoot 소계 */
.tfoot-subtotal td { background: var(--bg-canvas); font-size: 12px; font-weight: 700; color: var(--text-main); text-align: right; border-top: 2px solid var(--border-focus); }
.tfoot-subtotal td:first-child { text-align: left; }

/* 합계 테이블 */
.summary-table tbody tr td { background: var(--bg-surface); }
.summary-row td { padding: 10px; }

.summary-label { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; white-space: nowrap; }
.summary-label-rate { display: flex; flex-direction: column; gap: 5px; }

.summary-val { display: block; text-align: right; font-size: 12px; font-weight: 600; color: var(--text-main); white-space: nowrap; }
.summary-val.bold { font-weight: 800; font-size: 13px; }
.summary-val.highlight { color: var(--primary); font-weight: 700; }
.summary-val.grand-total { font-size: 15px; font-weight: 800; color: var(--primary); text-align: right; }

.row-d td        { background: rgba(16,185,129,0.04) !important; }
.row-e td        { background: rgba(107,114,128,0.04) !important; }
.row-f td        { background: rgba(236,72,153,0.04) !important; }
.row-monthly td  { background: rgba(14,165,233,0.06) !important; }
.row-total-fee td{ background: var(--primary-soft) !important; }

/* 특이사항 */
.cost-special-note { padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border-color); }

/* 비고 히스토리 */
.memo-history { margin-bottom: 12px; background: var(--bg-canvas); border-radius: 8px; border: 1px solid var(--border-color); padding: 16px; }
.history-header { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-main); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px dashed var(--border-focus); }
.history-list { display: flex; flex-direction: column; gap: 12px; max-height: 150px; overflow-y: auto; }
.history-item { display: flex; flex-direction: column; gap: 4px; }
.history-date { font-size: 11px; color: var(--text-sub); }
.history-content { font-size: 13px; color: var(--text-main); margin: 0; line-height: 1.5; background: var(--bg-surface); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); }

/* 폼 액션 */
.form-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 24px; border-top: 1px solid var(--border-color); }
.btn-prev, .btn-next, .btn-submit { display: flex; align-items: center; gap: 6px; padding: 10px 20px; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-prev { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); }
.btn-prev:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-next { background-color: var(--primary); color: var(--text-inverse); box-shadow: var(--shadow-sm); }
.btn-next:hover { background-color: var(--primary-hover); transform: translateY(-1px); }
.btn-submit { background-color: var(--success); color: var(--text-inverse); box-shadow: var(--shadow-sm); }
.btn-submit:hover { background-color: var(--success-hover); transform: translateY(-1px); }

/* =========================================
   반응형
========================================= */
@media (max-width: 1024px) { .steps-list { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 768px) {
  .steps-list { grid-template-columns: 1fr; gap: 8px; }
  .form-step { padding: 16px; }
  .form-grid { grid-template-columns: 1fr; }
  .address-search-group { flex-direction: column; }
  .postal-input { width: 100%; }
  .btn-search-address { width: 100%; justify-content: center; }
  .contract-actions { flex-direction: column; }
  .btn-add-contract { width: 100%; justify-content: center; }
  .form-actions { flex-direction: column; }
  .btn-prev, .btn-next, .btn-submit { width: 100%; justify-content: center; }
}
</style>
