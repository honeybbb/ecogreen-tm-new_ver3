<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import axios from 'axios';

const router = useRouter();
const route = useRoute();

const {
  positionOptions,
  typeOptions,
  fetchPositionOptions,
  fetchTypeOptions
} = useApi();

// 현재 탭
const activeTab = ref('info');

// 편집 모드
const isEditing = ref(false);

// 현장 정보
const site = ref({
  siteName: '', siteId: '', siteType: '', zipcode: '',
  addressMain: '', addressDetail: '', latitude: '', longitude: '',
  area: '', is_vat: false, building_su: '', unit_su: '',
  managerName: '', managerContact: '', director: '', directorContact: '',
  memo: '', status: '준비 중', payment_day: '', bigo: ''
});

// 계약 그룹
const contractGroups = ref([]);

// 비고 히스토리
const bigoHistory = ref([]);

// 옵션 데이터
const siteTypeOptions = ref(['아파트', '주상복합', '오피스텔', '상업 시설', '기타']);
const statusOptions = ref(['준비 중', '운영 중', '계약 종료']);

// 탭 목록
const tabs = [
  { id: 'info', name: '기본정보', icon: 'mdi-information-outline' },
  { id: 'contract', name: '계약정보', icon: 'mdi-file-document-outline' },
  { id: 'staff', name: '배치인원', icon: 'mdi-account-group-outline' },
  { id: 'memo', name: '특이사항', icon: 'mdi-note-text-outline' }
];

const isAssignModalOpen = ref(false);
const selectedGroupIdx = ref(null);
const availableStaffOptions = ref([]);
const newStaffAssignment = ref({
  mIdx: '', name: '', phone: '', joinDate: new Date().toISOString().substring(0, 10)
});

// 원본 데이터 (취소용)
let originalData = {};

// =============================================
// 산출내역서 기본값 생성 및 동기화 로직
// =============================================
const makeValuesObj = (staffList, defaultVal = 0) => {
  const obj = {};
  if (staffList) {
    staffList.forEach(s => { obj[s.code] = defaultVal; });
  }
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
  managementFeeRate: 2,
  profitRate: 2,
  specialNote: '',
});

const syncCostBreakdownToStaff = (group) => {
  if (!group.costBreakdown) {
    group.costBreakdown = createDefaultCostBreakdown(group.staffList);
    return;
  }
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
};

// =============================================
// 산출내역서 계산 함수
// =============================================
const getRowTotal = (item) => Object.values(item.values).reduce((s, v) => s + (Number(v) || 0), 0);
const getColTotal = (items, code) => items.reduce((s, item) => s + (Number(item.values[code]) || 0), 0);

const getDirectLaborColTotal   = (group, code) => getColTotal(group.costBreakdown.directLabor, code);
const getIndirectLaborColTotal = (group, code) => getColTotal(group.costBreakdown.indirectLabor, code);
const getExpensesColTotal      = (group, code) => getColTotal(group.costBreakdown.expenses, code);

const getLaborColTotal = (group, code) =>
    getDirectLaborColTotal(group, code) + getIndirectLaborColTotal(group, code) + getExpensesColTotal(group, code);

const getManagementFeeCol = (group, code) =>
    Math.floor(getLaborColTotal(group, code) * ((Number(group.costBreakdown.managementFeeRate) || 0) / 100));

const getProfitCol = (group, code) =>
    Math.floor(getLaborColTotal(group, code) * ((Number(group.costBreakdown.profitRate) || 0) / 100));

const getMonthlyTotalCol = (group, code) =>
    getLaborColTotal(group, code) + getManagementFeeCol(group, code) + getProfitCol(group, code);

const getMonthlyFeeByStaff = (group, staff) => getMonthlyTotalCol(group, staff.code) * staff.count;

const getTotalMonthlyFee = (group) =>
    group.staffList.reduce((s, staff) => s + getMonthlyFeeByStaff(group, staff), 0);

const getSectionGrandTotal = (group, section) =>
    group.costBreakdown[section].reduce((s, item) => s + getRowTotal(item), 0);

const getLaborGrandTotal = (group) =>
    getSectionGrandTotal(group, 'directLabor') + getSectionGrandTotal(group, 'indirectLabor') + getSectionGrandTotal(group, 'expenses');

const addItem = (group, section) => {
  group.costBreakdown[section].push({ label: '', values: makeValuesObj(group.staffList) });
};
const removeItem = (group, section, idx) => {
  group.costBreakdown[section].splice(idx, 1);
};
const formatNumber = (num) => Number(num || 0).toLocaleString('ko-KR');


// =============================================
// 기존 로직
// =============================================
const totalStaff = computed(() => {
  let total = 0;
  contractGroups.value.forEach(group => {
    if (group.staffList) {
      group.staffList.forEach(staff => { total += Number(staff.count) || 0; });
    }
  });
  return total;
});

const getContractDuration = (group) => {
  if (!group.contractStart || !group.contractEnd) return '';
  const start = new Date(group.contractStart);
  const end = new Date(group.contractEnd);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const months = Math.floor(diffDays / 30);
  const years = Math.floor(months / 12);
  if (years > 0) {
    const remainMonths = months % 12;
    return remainMonths > 0 ? `${years}년 ${remainMonths}개월` : `${years}년`;
  }
  return `${months}개월`;
};

const getGroupStaffTotal = (group) => {
  if (!group.staffList) return 0;
  return group.staffList.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
};

const openAssignModal = async (groupIdx) => {
  selectedGroupIdx.value = groupIdx;
  try {
    availableStaffOptions.value = [
      { idx: 101, name: '김철수', phone: '010-1111-2222' },
      { idx: 102, name: '이영희', phone: '010-2222-3333' },
      { idx: 103, name: '박민준', phone: '010-4444-5555' }
    ];
    isAssignModalOpen.value = true;
  } catch (error) { alert('직원 목록을 불러오는데 실패했습니다.'); }
};

const assignStaff = () => {
  if (!newStaffAssignment.value.mIdx) { alert('배정할 직원을 선택해주세요.'); return; }
  const group = contractGroups.value[selectedGroupIdx.value];
  const staffInfo = availableStaffOptions.value.find(s => s.idx === newStaffAssignment.value.mIdx);
  group.staffList.push({
    mIdx: staffInfo.idx, name: staffInfo.name, phone: staffInfo.phone,
    joinDate: newStaffAssignment.value.joinDate, count: 1
  });
  isAssignModalOpen.value = false;
  newStaffAssignment.value = { mIdx: '', name: '', phone: '', joinDate: new Date().toISOString().substring(0, 10) };
};

const getSiteData = async () => {
  const sIdx = route.params.id || route.query.idx;
  if (!sIdx) return;
  try {
    const res = await axios.get(`/api/v1/site/data/${sIdx}`);
    const result = res.data.data[0];
    if (result) {
      site.value.siteName = result.name;
      site.value.siteId = result.site_id;
      site.value.siteType = result.sType;
      site.value.status = result.status === 'Y' ? '운영 중' : '계약 종료';
      site.value.area = result.area;
      site.value.is_vat = result.is_vat === 'Y';
      site.value.addressMain = result.address;
      site.value.addressDetail = result.address_detail;
      site.value.building_su = result.building_su;
      site.value.unit_su = result.unit_su;
      site.value.managerName = result.manager;
      site.value.managerContact = result.phone;
      site.value.director = result.director;
      site.value.directorContact = result.director_phone;
      site.value.payment_day = result.payment_day;
      site.value.zipcode = result.zipcode || '';

      if (result.contractList) {
        const contracts = JSON.parse(result.contractList);
        contractGroups.value = contracts.map(item => ({
          category: item.category,
          type: item.type,
          contractStart: item.startDt,
          contractEnd: item.endDt,
          totalCost: item.totalCost || 0,
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
        } catch (e) { bigoHistory.value = []; }
      }

      originalData = JSON.parse(JSON.stringify({ site: site.value, contractGroups: contractGroups.value }));
    }
  } catch (error) {
    console.error('데이터 로드 실패:', error);
  }
};

const toggleEdit = () => {
  if (isEditing.value) {
    if (confirm('수정을 취소하시겠습니까?')) {
      site.value = JSON.parse(JSON.stringify(originalData.site));
      contractGroups.value = JSON.parse(JSON.stringify(originalData.contractGroups));
      isEditing.value = false;
    }
  } else {
    isEditing.value = true;
  }
};

const saveSite = async () => {
  if (!confirm('수정된 정보를 저장하시겠습니까?')) return;
  try {
    const contractsJson = JSON.stringify(contractGroups.value);
    const params = {
      cIdx: 1, sIdx: route.params.id || route.query.idx, sType: site.value.siteType,
      name: site.value.siteName, site_id: site.value.siteId, status: site.value.status,
      area: site.value.area, is_vat: site.value.is_vat ? 'Y' : 'N', building_su: site.value.building_su,
      unit_su: site.value.unit_su, address: site.value.addressMain, addressDetail: site.value.addressDetail,
      payment_day: site.value.payment_day, manager: site.value.managerName, phone: site.value.managerContact,
      director: site.value.director, directorContact: site.value.directorContact, bigo: site.value.bigo,
      contract_details: contractsJson
    };
    await axios.post('/api/v1/site/register', params);
    alert('저장되었습니다.');
    isEditing.value = false;
    originalData = JSON.parse(JSON.stringify({ site: site.value, contractGroups: contractGroups.value }));
  } catch (error) { alert('저장에 실패했습니다.'); }
};

const deleteSite = async () => {
  if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
  try {
    const sIdx = route.params.id || route.query.idx;
    await axios.delete(`/api/v1/site/${sIdx}`);
    alert('삭제되었습니다.');
    router.push('/site/list');
  } catch (error) { alert('삭제에 실패했습니다.'); }
};

const goBack = () => router.push('/site/list');

const addContractGroup = (category) => {
  contractGroups.value.push({
    category: category.itemNm, type: category.itemCd, contractStart: '', contractEnd: '',
    totalCost: 0, workDays: '', workSchedule: '', breakTime: '', staffList: [],
    tempJobCode: '', tempCount: 1,
    costBreakdown: createDefaultCostBreakdown([]), showCostBreakdown: false
  });
};

const removeContractGroup = (index) => {
  if (confirm('해당 계약 정보를 삭제하시겠습니까?')) contractGroups.value.splice(index, 1);
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
  group.tempJobCode = ''; group.tempCount = 1;
};

const removeStaffFromGroup = (groupIndex, staffIndex) => {
  contractGroups.value[groupIndex].staffList.splice(staffIndex, 1);
  syncCostBreakdownToStaff(contractGroups.value[groupIndex]);
};

const detailInput = ref(null);
const loadDaumPostcodeScript = () => new Promise((resolve) => {
  if (window.kakao && window.kakao.Postcode) { resolve(window.kakao.Postcode); return; }
  const script = document.createElement('script');
  script.src = '//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
  script.onload = () => resolve(window.kakao.Postcode);
  document.head.appendChild(script);
});

const searchAddress = async () => {
  await loadDaumPostcodeScript();
  new window.kakao.Postcode({
    oncomplete: (data) => {
      let addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
      if (data.userSelectedType === 'R') {
        let extraAddr = '';
        if (data.bname !== '' && /[동|로|가]$/g.test(data.bname)) extraAddr += data.bname;
        if (data.buildingName !== '' && data.apartment === 'Y') extraAddr += (extraAddr !== '' ? ', ' + data.buildingName : data.buildingName);
        if (extraAddr !== '') addr += ' (' + extraAddr + ')';
      }
      site.value.zipcode = data.zonecode; site.value.addressMain = addr; site.value.addressDetail = '';
      if (detailInput.value) detailInput.value.focus();
    }
  }).open();
};

onMounted(() => { fetchPositionOptions(); fetchTypeOptions(); getSiteData(); });
</script>

<template>
  <div class="site-detail-page">
    <div class="page-header">
      <div class="header-left">
        <button @click="goBack" class="btn-back" style="padding: 10px;">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-office-building-outline"></i> 현장 상세정보
          </h1>
          <p class="page-subtitle">현장의 상세 정보를 확인하고 관리합니다</p>
        </div>
      </div>
      <div class="header-actions">
        <template v-if="!isEditing">
          <button @click="toggleEdit" class="btn-edit">
            <i class="mdi mdi-pencil-outline"></i><span>수정</span>
          </button>
          <button @click="deleteSite" class="btn-delete">
            <i class="mdi mdi-trash-can-outline"></i><span>삭제</span>
          </button>
        </template>
        <template v-else>
          <button @click="toggleEdit" class="btn-cancel">
            <i class="mdi mdi-close"></i><span>취소</span>
          </button>
          <button @click="saveSite" class="btn-save">
            <i class="mdi mdi-check"></i><span>저장</span>
          </button>
        </template>
      </div>
    </div>

    <div class="profile-card">
      <div class="profile-banner"></div>
      <div class="profile-content">
        <div class="profile-icon-section">
          <div class="profile-icon"><i class="mdi mdi-domain"></i></div>
        </div>
        <div class="profile-info">
          <div class="profile-main">
            <h2 class="profile-name">{{ site.siteName || '현장명 없음' }}</h2>
            <span :class="['status-badge', site.status === '운영 중' ? 'status-active' : site.status === '준비 중' ? 'status-pending' : 'status-inactive']">
              <i :class="['mdi', site.status === '운영 중' ? 'mdi-check-circle-outline' : site.status === '준비 중' ? 'mdi-clock-outline' : 'mdi-close-circle-outline']"></i>
              {{ site.status }}
            </span>
          </div>
          <div class="profile-details">
            <div class="detail-item"><i class="mdi mdi-barcode"></i><span>{{ site.siteId || '코드 없음' }}</span></div>
            <div class="detail-item"><i class="mdi mdi-tag-outline"></i><span>{{ site.siteType || '-' }}</span></div>
            <div class="detail-item"><i class="mdi mdi-map-marker-outline"></i><span>{{ site.addressMain || '-' }}</span></div>
          </div>
        </div>
        <div class="profile-stats">
          <div class="stat-item">
            <div class="stat-icon stat-blue"><i class="mdi mdi-ruler-square"></i></div>
            <div class="stat-content">
              <span class="stat-label">관리면적</span><span class="stat-value">{{ site.area || '0' }}㎡</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon stat-green"><i class="mdi mdi-office-building-outline"></i></div>
            <div class="stat-content">
              <span class="stat-label">건물/세대</span><span class="stat-value">{{ site.building_su || '0' }}/{{ site.unit_su || '0' }}</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon stat-orange"><i class="mdi mdi-account-group-outline"></i></div>
            <div class="stat-content">
              <span class="stat-label">총 인원</span><span class="stat-value">{{ totalStaff }}명</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="integrated-tabs">
      <button v-for="tab in tabs" :key="tab.id" :class="['tab-button', { active: activeTab === tab.id }]" @click="activeTab = tab.id">
        <i :class="['mdi', tab.icon]"></i><span>{{ tab.name }}</span>
      </button>
    </div>

    <div class="integrated-content">

      <div v-show="activeTab === 'info'" class="tab-panel">
        <div class="info-sections">
          <div class="info-section">
            <div class="section-header"><i class="mdi mdi-domain"></i><h3>현장 정보</h3></div>
            <div class="info-grid">
              <div class="info-item"><label>현장명</label>
                <input v-if="isEditing" type="text" v-model="site.siteName" class="info-input" />
                <span v-else class="info-value">{{ site.siteName }}</span>
              </div>
              <div class="info-item"><label>현장 코드</label>
                <input v-if="isEditing" type="text" v-model="site.siteId" class="info-input" />
                <span v-else class="info-value">{{ site.siteId || '-' }}</span>
              </div>
              <div class="info-item"><label>현장 형태</label>
                <select v-if="isEditing" v-model="site.siteType" class="info-select">
                  <option v-for="type in siteTypeOptions" :key="type" :value="type">{{ type }}</option>
                </select>
                <span v-else class="info-value">{{ site.siteType }}</span>
              </div>
              <div class="info-item"><label>현장 상태</label>
                <select v-if="isEditing" v-model="site.status" class="info-select">
                  <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
                </select>
                <span v-else :class="['info-value', site.status === '운영 중' ? 'text-green' : site.status === '준비 중' ? 'text-orange' : 'text-gray']">{{ site.status }}</span>
              </div>
              <div class="info-item"><label>관리면적</label>
                <div v-if="isEditing" class="area-input">
                  <input type="text" v-model="site.area" class="info-input" />
                  <label class="checkbox-inline-small"><input type="checkbox" v-model="site.is_vat" /><span>135㎡ 초과</span></label>
                </div>
                <span v-else class="info-value">{{ site.area }}㎡ <span v-if="site.is_vat" class="badge badge-red">VAT 과세</span></span>
              </div>
              <div class="info-item"><label>건물 수</label>
                <input v-if="isEditing" type="number" v-model="site.building_su" class="info-input" />
                <span v-else class="info-value">{{ site.building_su }}동</span>
              </div>
              <div class="info-item"><label>세대 수</label>
                <input v-if="isEditing" type="number" v-model="site.unit_su" class="info-input" />
                <span v-else class="info-value">{{ site.unit_su }}세대</span>
              </div>
              <div class="info-item"><label>급여지급일</label>
                <select v-if="isEditing" v-model="site.payment_day" class="info-select">
                  <option v-for="day in 31" :key="day" :value="day">{{ day }}일</option>
                </select>
                <span v-else class="info-value">매월 {{ site.payment_day }}일</span>
              </div>
            </div>
          </div>
          <div class="info-section">
            <div class="section-header"><i class="mdi mdi-map-marker-outline"></i><h3>주소 정보</h3></div>
            <div class="info-grid">
              <div class="info-item full-width"><label>우편번호</label>
                <div v-if="isEditing" class="address-search-group">
                  <input type="text" v-model="site.zipcode" class="info-input postal-input" readonly />
                  <button type="button" @click="searchAddress" class="btn-search-small"><i class="mdi mdi-magnify"></i> 주소 검색</button>
                </div>
                <span v-else class="info-value">{{ site.zipcode || '-' }}</span>
              </div>
              <div class="info-item full-width"><label>현장 주소</label>
                <input v-if="isEditing" type="text" v-model="site.addressMain" class="info-input" readonly />
                <span v-else class="info-value">{{ site.addressMain }}</span>
              </div>
            </div>
          </div>
          <div class="info-section">
            <div class="section-header"><i class="mdi mdi-account-tie-outline"></i><h3>담당자 정보</h3></div>
            <div class="info-grid">
              <div class="info-item"><label>본사 담당자</label>
                <input v-if="isEditing" type="text" v-model="site.managerName" class="info-input" />
                <span v-else class="info-value">{{ site.managerName || '-' }}</span>
              </div>
              <div class="info-item"><label>본사 담당자 연락처</label>
                <input v-if="isEditing" type="tel" v-model="site.managerContact" class="info-input" />
                <span v-else class="info-value">{{ site.managerContact || '-' }}</span>
              </div>
              <div class="info-item"><label>관리 소장</label>
                <input v-if="isEditing" type="text" v-model="site.director" class="info-input" />
                <span v-else class="info-value">{{ site.director }}</span>
              </div>
              <div class="info-item"><label>관리 소장 연락처</label>
                <input v-if="isEditing" type="tel" v-model="site.directorContact" class="info-input" />
                <span v-else class="info-value">{{ site.directorContact }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'contract'" class="tab-panel">
        <div v-if="isEditing" class="contract-actions-top">
          <button v-for="cat in typeOptions" :key="cat.itemCd" type="button" @click="addContractGroup(cat)" class="btn-add-contract-small">
            <i class="mdi mdi-plus"></i>{{ cat.itemNm }} 추가
          </button>
        </div>

        <div v-if="contractGroups.length === 0" class="empty-state">
          <i class="mdi mdi-file-document-outline"></i><p>등록된 계약이 없습니다</p>
        </div>

        <div class="contract-list">
          <div v-for="(group, idx) in contractGroups" :key="idx" class="contract-card-detail">

            <div class="contract-card-header">
              <div class="contract-title-row">
                <span :class="['contract-badge', `badge-${group.category}`]">
                  <i class="mdi mdi-briefcase-outline"></i>{{ group.category }}
                </span>
                <span v-if="getContractDuration(group)" class="contract-duration">
                  <i class="mdi mdi-calendar-range"></i>{{ getContractDuration(group) }}
                </span>
              </div>
              <button v-if="isEditing" type="button" @click="removeContractGroup(idx)" class="btn-remove-small">
                <i class="mdi mdi-trash-can-outline"></i>
              </button>
            </div>

            <div class="contract-card-body">
              <div class="contract-info-grid">
                <div class="contract-info-item"><label>계약 시작일</label>
                  <input v-if="isEditing" type="date" v-model="group.contractStart" class="info-input" />
                  <span v-else class="info-value">{{ group.contractStart }}</span>
                </div>
                <div class="contract-info-item"><label>계약 종료일</label>
                  <input v-if="isEditing" type="date" v-model="group.contractEnd" class="info-input" />
                  <span v-else class="info-value">{{ group.contractEnd }}</span>
                </div>
                <div class="contract-info-item full-width"><label>근무 시간 및 형태</label>
                  <textarea v-if="isEditing" v-model="group.workSchedule" class="info-textarea" rows="2"></textarea>
                  <span v-else class="info-value">{{ group.workSchedule }}</span>
                </div>
                <div class="contract-info-item full-width"><label>휴게 시간</label>
                  <input v-if="isEditing" type="text" v-model="group.breakTime" class="info-input" />
                  <span v-else class="info-value">{{ group.breakTime || '-' }}</span>
                </div>
              </div>

              <div class="cost-breakdown-wrapper">
                <button type="button" class="btn-toggle-cost" @click="group.showCostBreakdown = !group.showCostBreakdown">
                  <i :class="group.showCostBreakdown ? 'mdi mdi-chevron-up' : 'mdi mdi-chevron-down'"></i>
                  <span>{{ group.showCostBreakdown ? '산출내역서 접기' : '산출내역서 펼치기' }}</span>
                  <span v-if="getTotalMonthlyFee(group) > 0" class="cost-preview-badge">
                    월 {{ formatNumber(getTotalMonthlyFee(group)) }}원
                  </span>
                </button>

                <div v-show="group.showCostBreakdown" class="cost-breakdown-section">
                  <div v-if="group.staffList && group.staffList.length === 0" class="cost-no-staff">
                    <i class="mdi mdi-account-plus-outline"></i>
                    <p>배치인원 탭에서 직책을 추가하면<br>직책별 산출내역을 입력/조회할 수 있습니다.</p>
                  </div>
                  <template v-else>
                    <div class="cost-scroll-area">

                      <div class="cost-section-title">
                        <span class="cost-block-label label-direct">A</span>직접노무비 <em>(지급내역)</em>
                        <button v-if="isEditing" type="button" @click="addItem(group, 'directLabor')" class="btn-add-cost-item">
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
                          <th class="col-rowtotal">행 합계</th>
                          <th v-if="isEditing" class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, iIdx) in group.costBreakdown.directLabor" :key="'dl-'+iIdx">
                          <td>
                            <input v-if="isEditing" v-model="item.label" class="tbl-label-input" placeholder="항목명" />
                            <span v-else class="tbl-text-span">{{ item.label }}</span>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input v-if="isEditing" v-model.number="item.values[staff.code]" type="number" class="tbl-value-input" placeholder="0" min="0" />
                            <span v-else class="tbl-value-span">{{ formatNumber(item.values[staff.code]) }}</span>
                          </td>
                          <td class="col-rowtotal"><span class="row-total-val">{{ formatNumber(getRowTotal(item)) }}</span></td>
                          <td v-if="isEditing" class="col-action">
                            <button type="button" @click="removeItem(group, 'directLabor', iIdx)" class="btn-remove-cost"><i class="mdi mdi-close"></i></button>
                          </td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (A)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">{{ formatNumber(getDirectLaborColTotal(group, staff.code)) }}</td>
                          <td>{{ formatNumber(getSectionGrandTotal(group, 'directLabor')) }}</td>
                          <td v-if="isEditing"></td>
                        </tr>
                        </tfoot>
                      </table>

                      <div class="cost-section-title">
                        <span class="cost-block-label label-indirect">B</span>간접노무비 <em>(공제내역)</em>
                        <button v-if="isEditing" type="button" @click="addItem(group, 'indirectLabor')" class="btn-add-cost-item">
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
                          <th class="col-rowtotal">행 합계</th>
                          <th v-if="isEditing" class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, iIdx) in group.costBreakdown.indirectLabor" :key="'il-'+iIdx">
                          <td>
                            <input v-if="isEditing" v-model="item.label" class="tbl-label-input" placeholder="항목명" />
                            <span v-else class="tbl-text-span">{{ item.label }}</span>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input v-if="isEditing" v-model.number="item.values[staff.code]" type="number" class="tbl-value-input" placeholder="0" min="0" />
                            <span v-else class="tbl-value-span">{{ formatNumber(item.values[staff.code]) }}</span>
                          </td>
                          <td class="col-rowtotal"><span class="row-total-val">{{ formatNumber(getRowTotal(item)) }}</span></td>
                          <td v-if="isEditing" class="col-action">
                            <button type="button" @click="removeItem(group, 'indirectLabor', iIdx)" class="btn-remove-cost"><i class="mdi mdi-close"></i></button>
                          </td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (B)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">{{ formatNumber(getIndirectLaborColTotal(group, staff.code)) }}</td>
                          <td>{{ formatNumber(getSectionGrandTotal(group, 'indirectLabor')) }}</td>
                          <td v-if="isEditing"></td>
                        </tr>
                        </tfoot>
                      </table>

                      <div class="cost-section-title">
                        <span class="cost-block-label label-expense">C</span>제경비
                        <button v-if="isEditing" type="button" @click="addItem(group, 'expenses')" class="btn-add-cost-item">
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
                          <th class="col-rowtotal">행 합계</th>
                          <th v-if="isEditing" class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr v-for="(item, eIdx) in group.costBreakdown.expenses" :key="'exp-'+eIdx">
                          <td>
                            <input v-if="isEditing" v-model="item.label" class="tbl-label-input" placeholder="항목명" />
                            <span v-else class="tbl-text-span">{{ item.label }}</span>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                            <input v-if="isEditing" v-model.number="item.values[staff.code]" type="number" class="tbl-value-input" placeholder="0" min="0" />
                            <span v-else class="tbl-value-span">{{ formatNumber(item.values[staff.code]) }}</span>
                          </td>
                          <td class="col-rowtotal"><span class="row-total-val">{{ formatNumber(getRowTotal(item)) }}</span></td>
                          <td v-if="isEditing" class="col-action">
                            <button type="button" @click="removeItem(group, 'expenses', eIdx)" class="btn-remove-cost"><i class="mdi mdi-close"></i></button>
                          </td>
                        </tr>
                        </tbody>
                        <tfoot>
                        <tr class="tfoot-subtotal">
                          <td>소계 (C)</td>
                          <td v-for="staff in group.staffList" :key="staff.code">{{ formatNumber(getExpensesColTotal(group, staff.code)) }}</td>
                          <td>{{ formatNumber(getSectionGrandTotal(group, 'expenses')) }}</td>
                          <td v-if="isEditing"></td>
                        </tr>
                        </tfoot>
                      </table>

                      <div class="cost-section-title">
                        <span class="cost-block-label label-total">합계</span>노무비 합계 및 용역비 산출
                      </div>
                      <table class="cost-table summary-table">
                        <thead>
                        <tr>
                          <th class="col-label">항목</th>
                          <th v-for="staff in group.staffList" :key="staff.code" class="col-staff">
                            <span class="staff-th-name">{{ staff.name }}</span>
                            <span class="staff-th-count">({{ staff.count }}명)</span>
                          </th>
                          <th class="col-rowtotal">전체 합계</th>
                          <th v-if="isEditing" class="col-action"></th>
                        </tr>
                        </thead>
                        <tbody>
                        <tr class="summary-row row-d">
                          <td><span class="summary-label"><span class="cost-block-label label-total">D</span>노무비 합계 (A+B+C)</span></td>
                          <td v-for="staff in group.staffList" :key="staff.code"><span class="summary-val">{{ formatNumber(getLaborColTotal(group, staff.code)) }}</span></td>
                          <td><span class="summary-val bold">{{ formatNumber(getLaborGrandTotal(group)) }}</span></td>
                          <td v-if="isEditing"></td>
                        </tr>
                        <tr class="summary-row row-e">
                          <td>
                            <div class="summary-label-rate">
                              <span class="summary-label"><span class="cost-block-label label-mgmt">E</span>일반관리비</span>
                              <div class="rate-inline">
                                <span>D ×</span>
                                <input v-if="isEditing" v-model.number="group.costBreakdown.managementFeeRate" type="number" class="rate-input-sm" min="0" max="100" step="0.1" />
                                <span v-else class="rate-text">{{ group.costBreakdown.managementFeeRate }}</span>
                                <span>%</span>
                              </div>
                            </div>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code"><span class="summary-val">{{ formatNumber(getManagementFeeCol(group, staff.code)) }}</span></td>
                          <td><span class="summary-val">{{ formatNumber(group.staffList.reduce((s,st) => s + getManagementFeeCol(group, st.code), 0)) }}</span></td>
                          <td v-if="isEditing"></td>
                        </tr>
                        <tr class="summary-row row-f">
                          <td>
                            <div class="summary-label-rate">
                              <span class="summary-label"><span class="cost-block-label label-profit">F</span>기업이윤</span>
                              <div class="rate-inline">
                                <span>D ×</span>
                                <input v-if="isEditing" v-model.number="group.costBreakdown.profitRate" type="number" class="rate-input-sm" min="0" max="100" step="0.1" />
                                <span v-else class="rate-text">{{ group.costBreakdown.profitRate }}</span>
                                <span>%</span>
                              </div>
                            </div>
                          </td>
                          <td v-for="staff in group.staffList" :key="staff.code"><span class="summary-val">{{ formatNumber(getProfitCol(group, staff.code)) }}</span></td>
                          <td><span class="summary-val">{{ formatNumber(group.staffList.reduce((s,st) => s + getProfitCol(group, st.code), 0)) }}</span></td>
                          <td v-if="isEditing"></td>
                        </tr>
                        <tr class="summary-row row-monthly">
                          <td><span class="summary-label"><span class="cost-block-label label-monthly">월</span>1인당 월 용역비 (D+E+F)</span></td>
                          <td v-for="staff in group.staffList" :key="staff.code"><span class="summary-val highlight">{{ formatNumber(getMonthlyTotalCol(group, staff.code)) }}</span></td>
                          <td></td>
                          <td v-if="isEditing"></td>
                        </tr>
                        <tr class="summary-row row-total-fee">
                          <td><span class="summary-label"><span class="cost-block-label label-total-fee">합</span>총 월 용역비 (인원 × 단가)</span></td>
                          <td v-for="staff in group.staffList" :key="staff.code">
                              <span class="summary-val highlight bold">{{ formatNumber(getMonthlyFeeByStaff(group, staff)) }}
                                <em class="count-note">{{ staff.count }}명 × {{ formatNumber(getMonthlyTotalCol(group, staff.code)) }}</em>
                              </span>
                          </td>
                          <td><span class="summary-val grand-total">{{ formatNumber(getTotalMonthlyFee(group)) }}</span></td>
                          <td v-if="isEditing"></td>
                        </tr>
                        </tbody>
                      </table>
                    </div>

                    <div class="cost-special-note">
                      <label class="form-label">
                        <i class="mdi mdi-text-box-edit-outline"></i>특이사항
                      </label>
                      <textarea v-if="isEditing" v-model="group.costBreakdown.specialNote" class="form-textarea" rows="3" placeholder="예: 최저임금 기준 등 산출 조건"></textarea>
                      <div v-else class="info-value">{{ group.costBreakdown.specialNote || '등록된 특이사항 없음' }}</div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'staff'" class="tab-panel">
        <div class="staff-overview">
          <div class="overview-card">
            <i class="mdi mdi-account-group-outline"></i>
            <div class="overview-content"><span class="overview-label">총 배치인원</span><span class="overview-value">{{ totalStaff }}명</span></div>
          </div>
          <div class="overview-card">
            <i class="mdi mdi-file-document-outline"></i>
            <div class="overview-content"><span class="overview-label">계약 수</span><span class="overview-value">{{ contractGroups.length }}건</span></div>
          </div>
        </div>

        <div v-if="contractGroups.length === 0" class="empty-state">
          <i class="mdi mdi-account-off-outline"></i><p>배치된 인원이 없습니다</p>
        </div>

        <div class="staff-by-contract">
          <div v-for="(group, idx) in contractGroups" :key="idx" class="staff-contract-section">
            <div class="staff-section-header">
              <span :class="['contract-badge', `badge-${group.category}`]"><i class="mdi mdi-briefcase-outline"></i>{{ group.category }}</span>
              <span class="staff-count-badge">{{ getGroupStaffTotal(group) }}명</span>
            </div>

            <div v-if="isEditing" class="staff-add-section">
              <select v-model="group.tempJobCode" class="info-select staff-position-select">
                <option value="">직책 선택</option>
                <option v-for="opt in positionOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>
              </select>
              <input type="number" v-model="group.tempCount" min="1" class="info-input staff-count-input" placeholder="인원" />
              <button type="button" @click="addStaffToGroup(idx)" class="btn-add-staff-small"><i class="mdi mdi-plus"></i>추가</button>
            </div>

            <div v-if="group.staffList && group.staffList.length > 0" class="staff-members-grid">
              <div v-for="(staff, sIdx) in group.staffList" :key="sIdx" class="staff-member-card">
                <div class="staff-member-info">
                  <i class="mdi mdi-account-outline"></i>
                  <div class="staff-member-details">
                    <span class="staff-position">{{ staff.name }}</span>
                    <span class="staff-count">{{ staff.count }}명</span>
                  </div>
                </div>
                <button v-if="isEditing" type="button" @click="removeStaffFromGroup(idx, sIdx)" class="btn-remove-staff-small"><i class="mdi mdi-close"></i></button>
              </div>
            </div>
            <div v-else class="empty-staff"><i class="mdi mdi-account-off-outline"></i><span>배치된 인원 없음</span></div>
          </div>
        </div>
      </div>

      <div v-show="activeTab === 'memo'" class="tab-panel">
        <div v-if="bigoHistory.length > 0" class="memo-timeline">
          <div v-for="(item, idx) in bigoHistory" :key="idx" class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <i class="mdi mdi-calendar-outline"></i><span class="timeline-date">{{ item.regDt ? item.regDt.substring(0, 10) : '-' }}</span>
              </div>
              <p class="timeline-text">{{ item.bigo }}</p>
            </div>
          </div>
        </div>
        <div v-else class="empty-state"><i class="mdi mdi-note-text-outline"></i><p>등록된 특이사항이 없습니다</p></div>

        <div v-if="isEditing" class="memo-add-section">
          <label class="section-label"><i class="mdi mdi-pencil-outline"></i>새로운 메모 추가</label>
          <textarea v-model="site.bigo" class="info-textarea" rows="4" placeholder="특이사항을 입력하세요 (저장 시 히스토리에 추가됩니다)"></textarea>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* =========================================
   기존 스타일 유지 영역
========================================= */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.header-left { display: flex; align-items: flex-start; gap: 16px; }
.btn-cancel, .btn-edit, .btn-delete, .btn-save { display: flex; align-items: center; gap: 6px; padding: 10px 18px; height: 42px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: var(--shadow-sm); white-space: nowrap; box-sizing: border-box; }
.btn-cancel { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); }
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-main); border-color: var(--border-focus); }
.btn-edit { background-color: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-main); }
.btn-edit:hover { background-color: var(--primary-soft); border-color: var(--primary); color: var(--primary); transform: translateY(-1px); }
.btn-delete { background-color: var(--bg-surface); border: 1px solid var(--danger); color: var(--danger); }
.btn-delete:hover { background-color: var(--danger); color: var(--text-inverse); transform: translateY(-1px); }
.btn-save { background-color: var(--success); border: none; color: var(--text-inverse); }
.btn-save:hover { background-color: var(--success-hover); transform: translateY(-1px); }

.profile-card { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); overflow: hidden; margin-bottom: 24px; display: flex; flex-direction: column; }
.profile-banner { height: 100px; background-color: var(--primary); }
.profile-content { padding: 0 32px 24px; display: flex; gap: 24px; align-items: flex-start; }
.profile-icon-section { position: relative; margin-top: -40px; }
.profile-icon { width: 100px; height: 100px; border-radius: 16px; background-color: var(--primary-soft); border: 4px solid var(--bg-surface); box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08); display: flex; align-items: center; justify-content: center; }
.profile-icon i { font-size: 50px; color: var(--primary); }
.profile-info { flex: 1; padding-top: 12px; }
.profile-main { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.profile-name { font-size: 24px; font-weight: 700; color: var(--text-main); margin: 0; }
.status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-inverse); }
.status-active { background-color: var(--success); }
.status-pending { background-color: var(--warning); }
.status-inactive { background-color: var(--text-sub); }
.profile-details { display: flex; flex-wrap: wrap; gap: 16px; }
.detail-item { display: flex; align-items: center; gap: 6px; color: var(--text-sub); font-size: 13px; font-weight: 500; }
.profile-stats { display: flex; gap: 20px; padding-top: 12px; }
.stat-item { display: flex; gap: 10px; align-items: center; }
.stat-icon { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.stat-blue { background-color: var(--primary-soft); color: var(--primary); }
.stat-green { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.stat-orange { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }
.stat-content { display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 12px; color: var(--text-sub); font-weight: 500; }
.stat-value { font-size: 14px; font-weight: 700; color: var(--text-main); }

.integrated-tabs { display: flex; padding: 0 32px; border-bottom: 1px solid var(--border-color); background-color: var(--bg-canvas); }
.tab-button { padding: 16px 24px; background: transparent; border: none; color: var(--text-sub); font-size: 14px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: all 0.2s; position: relative; margin-bottom: -1px; }
.tab-button.active { color: var(--primary); background: var(--bg-surface); border: 1px solid var(--border-color); border-bottom-color: var(--bg-surface); border-radius: 8px 8px 0 0;}
.integrated-content { padding: 32px; background-color: var(--bg-surface); }
.tab-panel { animation: fadeIn 0.3s; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

.info-sections { display: flex; flex-direction: column; gap: 32px; }
.info-section { padding: 0; border: none; background: transparent; }
.info-section:not(:last-child) { padding-bottom: 32px; border-bottom: 1px dashed var(--border-color); }
.section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
.section-header h3 { font-size: 16px; font-weight: 700; color: var(--text-main); margin: 0; }
.info-grid, .contract-info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px; }
.info-item, .contract-info-item { display: flex; flex-direction: column; gap: 6px; }
.info-item.full-width, .contract-info-item.full-width { grid-column: 1 / -1; }
.info-item label, .contract-info-item label, .section-label { font-size: 12px; font-weight: 600; color: var(--text-sub); }
.info-value { font-size: 14px; color: var(--text-main); padding: 8px 0; font-weight: 500; }
.info-input, .info-select, .info-textarea { padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); transition: all 0.2s; box-sizing: border-box; }
.info-input:focus, .info-select:focus, .info-textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.area-input { display: flex; gap: 12px; align-items: center; }
.checkbox-inline-small { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--danger); font-weight: 600; cursor: pointer; }

/* 계약 탭 관련 */
.contract-actions-top { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
.btn-add-contract-small { display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--bg-surface); border: 1px dashed var(--text-muted); border-radius: 6px; color: var(--text-sub); font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.contract-list { display: flex; flex-direction: column; gap: 20px; }
.contract-card-detail, .staff-contract-section { background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
.contract-card-header, .staff-section-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; background: var(--bg-hover); border-bottom: 1px solid var(--border-color); }
.contract-title-row { display: flex; align-items: center; gap: 12px; }
.contract-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; color: var(--text-inverse); }
.badge-경비 { background-color: #3b82f6; } .badge-미화 { background-color: #ec4899; } .badge-시설 { background-color: var(--success); }
.contract-duration { font-size: 12px; color: var(--text-sub); display: flex; align-items: center; gap: 4px; font-weight: 500;}
.btn-remove-small { width: 28px; height: 28px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.contract-card-body { padding: 20px; }

/* 인원 탭 관련 */
.staff-overview { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
.overview-card { display: flex; gap: 16px; align-items: center; padding: 20px; background-color: var(--bg-canvas); border-radius: 12px; border: 1px solid var(--border-color); }
.overview-card i { font-size: 32px; color: var(--primary); }
.overview-content { display: flex; flex-direction: column; gap: 2px; }
.overview-label { font-size: 12px; color: var(--text-sub); font-weight: 500; }
.overview-value { font-size: 20px; font-weight: 700; color: var(--text-main); }
.staff-by-contract { display: flex; flex-direction: column; gap: 20px; }
.staff-count-badge { padding: 4px 10px; background-color: var(--bg-surface); color: var(--text-sub); border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid var(--border-color); }
.staff-add-section { display: flex; gap: 10px; margin-bottom: 16px; align-items: center; padding: 0 20px; margin-top: 16px;}
.staff-position-select { flex: 1; } .staff-count-input { width: 80px; }
.btn-add-staff-small { display: flex; align-items: center; gap: 4px; padding: 10px 14px; background-color: var(--success); border: none; border-radius: 8px; color: var(--text-inverse); font-size: 12px; font-weight: 600; cursor: pointer; }
.staff-members-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; padding: 20px; }
.staff-member-card { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; }
.staff-member-info { display: flex; align-items: center; gap: 10px; flex: 1; }
.staff-member-info i { font-size: 20px; color: var(--primary); }
.staff-member-details { display: flex; flex-direction: column; gap: 2px; }
.staff-position { font-size: 13px; font-weight: 600; color: var(--text-main); }
.staff-count { font-size: 11px; color: var(--text-sub); }
.btn-remove-staff-small { width: 24px; height: 24px; border-radius: 6px; background: rgba(239, 68, 68, 0.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; }

/* 공통 */
.empty-state, .empty-staff { text-align: center; padding: 50px 20px; color: var(--text-muted); }
.empty-state i { font-size: 48px; margin-bottom: 12px; opacity: 0.5; }
.empty-state p { font-size: 15px; font-weight: 600; color: var(--text-sub); margin: 0; }
.empty-staff i { font-size: 32px; display: block; margin-bottom: 8px; opacity: 0.5; }

/* =========================================
   추가된 산출내역서 전용 스타일
========================================= */
.cost-breakdown-wrapper { margin-top: 24px; }
.btn-toggle-cost { display: flex; align-items: center; gap: 8px; width: 100%; padding: 12px 18px; background: var(--bg-surface); border: 1px dashed var(--border-focus); border-radius: 10px; font-size: 13px; font-weight: 600; color: var(--text-main); cursor: pointer; transition: all 0.2s; text-align: left; }
.btn-toggle-cost:hover { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); border-style: solid; }
.btn-toggle-cost span:nth-child(2) { flex: 1; }
.cost-preview-badge { padding: 3px 10px; background: var(--primary); color: var(--text-inverse); border-radius: 20px; font-size: 12px; font-weight: 700; }

.cost-breakdown-section { margin-top: 12px; border: 1px solid var(--border-focus); border-radius: 10px; overflow: hidden; background: var(--bg-surface); }
.cost-no-staff { padding: 40px 20px; text-align: center; color: var(--text-sub); }
.cost-no-staff i { font-size: 40px; margin-bottom: 12px; opacity: 0.5; display: block; }
.cost-no-staff p { font-size: 13px; line-height: 1.7; margin: 0; }

.cost-section-title { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: var(--bg-hover); border-top: 1px solid var(--border-color); font-size: 13px; font-weight: 700; color: var(--text-main); }
.cost-section-title:first-child { border-top: none; }
.cost-section-title em { font-style: normal; font-weight: 400; font-size: 12px; color: var(--text-sub); margin-left: 2px; }

.btn-add-cost-item { display: flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 11px; font-weight: 600; background: var(--bg-surface); border: 1px dashed var(--primary); border-radius: 6px; color: var(--primary); cursor: pointer; margin-left: auto; }
.btn-add-cost-item:hover { background: var(--primary-soft); }

.cost-block-label { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 22px; padding: 0 5px; border-radius: 5px; font-size: 11px; font-weight: 800; color: var(--text-inverse); flex-shrink: 0; }
.label-direct    { background-color: #3b82f6; }
.label-indirect  { background-color: #8b5cf6; }
.label-expense   { background-color: #f59e0b; }
.label-total     { background-color: #10b981; }
.label-mgmt      { background-color: #6b7280; }
.label-profit    { background-color: #ec4899; }
.label-monthly   { background-color: #0ea5e9; }
.label-total-fee { background-color: #f97316; }

.cost-scroll-area { overflow-x: auto; }
.cost-table { width: 100%; border-collapse: collapse; font-size: 12px; color: var(--text-main); }
.cost-table thead tr { background: var(--bg-canvas); }
.cost-table th, .cost-table td { padding: 8px 10px; border: 1px solid var(--border-color); vertical-align: middle; }
.cost-table th { font-size: 11px; font-weight: 700; color: var(--text-sub); text-align: center; white-space: nowrap; }

.col-label    { min-width: 140px; width: 160px; }
.col-staff    { min-width: 130px; text-align: center; }
.col-rowtotal { min-width: 100px; text-align: right; font-weight: 600; background: rgba(99,102,241,0.04); }
.col-action   { width: 36px; text-align: center; }

.staff-th-name  { display: block; font-size: 12px; font-weight: 700; color: var(--text-main); }
.staff-th-count { display: block; font-size: 11px; color: var(--text-sub); font-weight: 400; }

.tbl-label-input, .tbl-value-input { width: 100%; padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 5px; font-size: 12px; color: var(--text-main); background: var(--bg-surface); box-sizing: border-box; }
.tbl-value-input { text-align: right; }
.tbl-label-input:focus, .tbl-value-input:focus { outline: none; border-color: var(--primary); }

.tbl-text-span { display: block; padding: 5px; font-weight: 500; }
.tbl-value-span { display: block; padding: 5px; text-align: right; color: var(--text-sub); }
.row-total-val { font-weight: 600; font-size: 12px; color: var(--text-main); }

.btn-remove-cost { width: 24px; height: 24px; border-radius: 4px; background: rgba(239,68,68,0.1); border: none; color: var(--danger); cursor: pointer; display: flex; align-items: center; justify-content: center; }

.tfoot-subtotal td { background: var(--bg-canvas); font-size: 12px; font-weight: 700; color: var(--text-main); text-align: right; border-top: 2px solid var(--border-focus); }
.tfoot-subtotal td:first-child { text-align: left; }

.summary-table tbody tr td { background: var(--bg-surface); }
.summary-row td { padding: 10px; }
.summary-label { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 12px; white-space: nowrap; }
.summary-label-rate { display: flex; flex-direction: column; gap: 5px; }
.rate-inline { display: flex; align-items: center; gap: 4px; margin-left: 28px; font-size: 11px; color: var(--text-sub); }
.rate-input-sm { width: 52px; padding: 3px 6px; text-align: center; border: 1px solid var(--primary); border-radius: 4px; font-size: 12px; font-weight: 700; color: var(--primary); background: var(--primary-soft); }
.rate-text { font-weight: 700; color: var(--text-main); }

.summary-val { display: block; text-align: right; font-size: 12px; font-weight: 600; color: var(--text-main); white-space: nowrap; }
.summary-val.bold { font-weight: 800; font-size: 13px; }
.summary-val.highlight { color: var(--primary); font-weight: 700; }
.summary-val.grand-total { font-size: 15px; font-weight: 800; color: var(--primary); }
.count-note { display: block; font-size: 10px; font-style: normal; color: var(--text-sub); font-weight: 400; text-align: right; margin-top: 3px; }

.row-d td        { background: rgba(16,185,129,0.04) !important; }
.row-e td        { background: rgba(107,114,128,0.04) !important; }
.row-f td        { background: rgba(236,72,153,0.04) !important; }
.row-monthly td  { background: rgba(14,165,233,0.06) !important; }
.row-total-fee td{ background: var(--primary-soft) !important; }

.cost-special-note { padding: 16px 20px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--border-color); }

@media (max-width: 1024px) {
  .profile-content { flex-direction: column; gap: 24px; }
  .profile-icon-section { margin-top: -50px; }
  .profile-stats { flex-direction: column; width: 100%; gap: 16px; padding-top: 0; }
  .integrated-content { padding: 24px; }
}
@media (max-width: 768px) {
  .integrated-tabs { padding: 0 16px; overflow-x: auto; }
  .tab-button { padding: 12px 16px; white-space: nowrap; }
  .info-grid, .contract-info-grid { grid-template-columns: 1fr; }
  .info-section { padding: 16px; }
  .profile-details { flex-direction: column; gap: 10px; }
  .address-search-group { flex-direction: column; }
  .postal-input { width: 100%; }
  .btn-search-small { width: 100%; justify-content: center; }
  .staff-add-section { flex-direction: column; align-items: stretch; }
  .staff-count-input { width: 100%; }
  .btn-add-staff-small { justify-content: center; }
  .staff-members-grid { grid-template-columns: 1fr; }
}
</style>
