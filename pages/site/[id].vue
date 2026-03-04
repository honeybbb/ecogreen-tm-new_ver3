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
  siteName: '',
  siteId: '',
  siteType: '',
  zipcode: '',
  addressMain: '',
  addressDetail: '',
  latitude: '',
  longitude: '',
  area: '',
  is_vat: false,
  building_su: '',
  unit_su: '',
  managerName: '',
  managerContact: '',
  director: '',
  directorContact: '',
  memo: '',
  status: '준비 중',
  payment_day: '',
  bigo: ''
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
  { id: 'info', name: '기본정보', icon: 'mdi-information' },
  { id: 'contract', name: '계약정보', icon: 'mdi-file-document' },
  { id: 'staff', name: '배치인원', icon: 'mdi-account-group' },
  { id: 'memo', name: '특이사항', icon: 'mdi-note-text' }
];

const isAssignModalOpen = ref(false);
const selectedGroupIdx = ref(null);
const availableStaffOptions = ref([]); // 배정 가능한 직원 목록 (API 연동용)
const newStaffAssignment = ref({
  mIdx: '',
  name: '',
  phone: '',
  joinDate: new Date().toISOString().substring(0, 10)
});

// 원본 데이터 (취소용)
let originalData = {};

// 총 인원 계산
const totalStaff = computed(() => {
  let total = 0;
  contractGroups.value.forEach(group => {
    if (group.staffList) {
      group.staffList.forEach(staff => {
        total += Number(staff.count) || 0;
      });
    }
  });
  return total;
});

// 계약 기간 계산
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

// 그룹별 인원 합계
const getGroupStaffTotal = (group) => {
  if (!group.staffList) return 0;
  return group.staffList.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
};

//직원 배정 모달 열기
const openAssignModal = async (groupIdx) => {
  selectedGroupIdx.value = groupIdx;

  try {
    // 실제 API 호출 시: const res = await axios.get(`/api/v1/member/available-staff`);
    // availableStaffOptions.value = res.data.data;

    // 테스트용 더미 데이터
    availableStaffOptions.value = [
      { idx: 101, name: '김철수', phone: '010-1111-2222' },
      { idx: 102, name: '이영희', phone: '010-2222-3333' },
      { idx: 103, name: '박민준', phone: '010-4444-5555' }
    ];
    isAssignModalOpen.value = true;
  } catch (error) {
    alert('직원 목록을 불러오는데 실패했습니다.');
  }
};

//실제 직원 배정 처리
const assignStaff = () => {
  if (!newStaffAssignment.value.mIdx) {
    alert('배정할 직원을 선택해주세요.');
    return;
  }

  const group = contractGroups.value[selectedGroupIdx.value];
  const staffInfo = availableStaffOptions.value.find(s => s.idx === newStaffAssignment.value.mIdx);

  // staffList에 객체 형태로 추가
  group.staffList.push({
    mIdx: staffInfo.idx,
    name: staffInfo.name,
    phone: staffInfo.phone,
    joinDate: newStaffAssignment.value.joinDate,
    count: 1 // 개별 배정이므로 기본 1명
  });

  isAssignModalOpen.value = false;
  // 초기화
  newStaffAssignment.value = { mIdx: '', name: '', phone: '', joinDate: new Date().toISOString().substring(0, 10) };
};

// 데이터 로드
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

      // 계약 정보
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
          tempCount: 1
        }));
      }

      // 비고 히스토리
      if (result.bigoList) {
        try {
          bigoHistory.value = JSON.parse(result.bigoList);
          bigoHistory.value.sort((a, b) => new Date(b.regDt) - new Date(a.regDt));
        } catch (e) {
          bigoHistory.value = [];
        }
      }

      // 원본 데이터 백업
      originalData = JSON.parse(JSON.stringify({ site: site.value, contractGroups: contractGroups.value }));
    }
  } catch (error) {
    console.error('데이터 로드 실패:', error);
    alert('현장 정보를 불러오는데 실패했습니다.');
  }
};

// 편집 모드 토글
const toggleEdit = () => {
  if (isEditing.value) {
    // 취소
    if (confirm('수정을 취소하시겠습니까?')) {
      site.value = JSON.parse(JSON.stringify(originalData.site));
      contractGroups.value = JSON.parse(JSON.stringify(originalData.contractGroups));
      isEditing.value = false;
    }
  } else {
    isEditing.value = true;
  }
};

// 저장
const saveSite = async () => {
  if (!confirm('수정된 정보를 저장하시겠습니까?')) return;

  try {
    const contractsJson = JSON.stringify(contractGroups.value);

    const params = {
      cIdx: 1,
      sIdx: route.params.id || route.query.idx,
      sType: site.value.siteType,
      name: site.value.siteName,
      site_id: site.value.siteId,
      status: site.value.status,
      area: site.value.area,
      is_vat: site.value.is_vat ? 'Y' : 'N',
      building_su: site.value.building_su,
      unit_su: site.value.unit_su,
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

    await axios.post('/api/v1/site/register', params);
    alert('저장되었습니다.');
    isEditing.value = false;
    originalData = JSON.parse(JSON.stringify({ site: site.value, contractGroups: contractGroups.value }));
  } catch (error) {
    console.error('저장 실패:', error);
    alert('저장에 실패했습니다.');
  }
};

// 삭제
const deleteSite = async () => {
  if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

  try {
    const sIdx = route.params.id || route.query.idx;
    await axios.delete(`/api/v1/site/${sIdx}`);
    alert('삭제되었습니다.');
    router.push('/site');
  } catch (error) {
    console.error('삭제 실패:', error);
    alert('삭제에 실패했습니다.');
  }
};

// 목록으로
const goBack = () => {
  router.push('/site');
};

// 계약 그룹 추가
const addContractGroup = (category) => {
  contractGroups.value.push({
    category: category.itemNm,
    type: category.itemCd,
    contractStart: '',
    contractEnd: '',
    totalCost: 0,
    workDays: '',
    workSchedule: '',
    breakTime: '',
    staffList: [],
    tempJobCode: '',
    tempCount: 1
  });
};

// 계약 그룹 삭제
const removeContractGroup = (index) => {
  if (confirm('해당 계약 정보를 삭제하시겠습니까?')) {
    contractGroups.value.splice(index, 1);
  }
};

// 인원 추가
const addStaffToGroup = (groupIndex) => {
  const group = contractGroups.value[groupIndex];

  if (!group.tempJobCode) {
    alert('직책을 선택해주세요.');
    return;
  }
  if (group.tempCount < 1) {
    alert('1명 이상 입력해주세요.');
    return;
  }

  const jobInfo = positionOptions.value.find(p => p.itemCd === group.tempJobCode);

  group.staffList.push({
    code: jobInfo.itemCd,
    name: jobInfo.itemNm,
    count: Number(group.tempCount)
  });

  group.tempJobCode = '';
  group.tempCount = 1;
};

// 인원 삭제
const removeStaffFromGroup = (groupIndex, staffIndex) => {
  contractGroups.value[groupIndex].staffList.splice(staffIndex, 1);
};

// 주소 검색
const detailInput = ref(null);

const loadDaumPostcodeScript = () => {
  return new Promise((resolve) => {
    if (window.kakao && window.kakao.Postcode) {
      resolve(window.kakao.Postcode);
      return;
    }
    const script = document.createElement('script');
    script.src = '//t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
    script.onload = () => resolve(window.kakao.Postcode);
    document.head.appendChild(script);
  });
};

const searchAddress = async () => {
  await loadDaumPostcodeScript();
  new window.kakao.Postcode({
    oncomplete: (data) => {
      let addr = data.userSelectedType === 'R' ? data.roadAddress : data.jibunAddress;
      if (data.userSelectedType === 'R') {
        let extraAddr = '';
        if (data.bname !== '' && /[동|로|가]$/g.test(data.bname)) extraAddr += data.bname;
        if (data.buildingName !== '' && data.apartment === 'Y') {
          extraAddr += (extraAddr !== '' ? ', ' + data.buildingName : data.buildingName);
        }
        if (extraAddr !== '') addr += ' (' + extraAddr + ')';
      }
      site.value.zipcode = data.zonecode;
      site.value.addressMain = addr;
      site.value.addressDetail = '';
      if (detailInput.value) detailInput.value.focus();
    }
  }).open();
};

onMounted(() => {
  fetchPositionOptions();
  fetchTypeOptions();
  getSiteData();
});
</script>

<template>
  <div class="site-detail-page">
    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <button @click="goBack" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-office-building"></i>
            현장 상세정보
          </h1>
          <p class="page-subtitle">현장의 상세 정보를 확인하고 관리합니다</p>
        </div>
      </div>
      <div class="header-actions">
        <template v-if="!isEditing">
          <button @click="toggleEdit" class="btn-edit">
            <i class="mdi mdi-pencil"></i>
            <span>수정</span>
          </button>
          <button @click="deleteSite" class="btn-delete">
            <i class="mdi mdi-delete"></i>
            <span>삭제</span>
          </button>
        </template>
        <template v-else>
          <button @click="toggleEdit" class="btn-cancel">
            <i class="mdi mdi-close"></i>
            <span>취소</span>
          </button>
          <button @click="saveSite" class="btn-save">
            <i class="mdi mdi-check"></i>
            <span>저장</span>
          </button>
        </template>
      </div>
    </div>

    <!-- 프로필 카드 -->
    <div class="profile-card">
      <div class="profile-banner"></div>
      <div class="profile-content">
        <div class="profile-icon-section">
          <div class="profile-icon">
            <i class="mdi mdi-office-building"></i>
          </div>
        </div>

        <div class="profile-info">
          <div class="profile-main">
            <h2 class="profile-name">{{ site.siteName || '현장명 없음' }}</h2>
            <span :class="['status-badge',
              site.status === '운영 중' ? 'status-active' :
              site.status === '준비 중' ? 'status-pending' :
              'status-inactive']">
              <i :class="['mdi',
                site.status === '운영 중' ? 'mdi-check-circle' :
                site.status === '준비 중' ? 'mdi-clock' :
                'mdi-close-circle']"></i>
              {{ site.status }}
            </span>
          </div>

          <div class="profile-details">
            <div class="detail-item">
              <i class="mdi mdi-barcode"></i>
              <span>{{ site.siteId || '코드 없음' }}</span>
            </div>
            <div class="detail-item">
              <i class="mdi mdi-tag"></i>
              <span>{{ site.siteType || '-' }}</span>
            </div>
            <div class="detail-item">
              <i class="mdi mdi-map-marker"></i>
              <span>{{ site.addressMain || '-' }}</span>
            </div>
          </div>
        </div>

        <div class="profile-stats">
          <div class="stat-item">
            <div class="stat-icon" style="--stat-color: #667eea;">
              <i class="mdi mdi-ruler-square"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">관리면적</span>
              <span class="stat-value">{{ site.area || '0' }}㎡</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon" style="--stat-color: #10b981;">
              <i class="mdi mdi-office-building-outline"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">건물/세대</span>
              <span class="stat-value">{{ site.building_su || '0' }}/{{ site.unit_su || '0' }}</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon" style="--stat-color: #f59e0b;">
              <i class="mdi mdi-account-group"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">총 인원</span>
              <span class="stat-value">{{ totalStaff }}명</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 탭 네비게이션 -->
    <div class="tabs-container">
      <div class="tabs-nav">
        <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="['tab-button', { active: activeTab === tab.id }]"
            @click="activeTab = tab.id"
        >
          <i :class="['mdi', tab.icon]"></i>
          <span>{{ tab.name }}</span>
        </button>
      </div>
    </div>

    <!-- 탭 컨텐츠 -->
    <div class="tab-content">
      <!-- 기본정보 탭 -->
      <div v-show="activeTab === 'info'" class="tab-panel">
        <div class="info-sections">
          <!-- 현장 정보 -->
          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-office-building"></i>
              <h3>현장 정보</h3>
            </div>
            <div class="info-grid">
              <div class="info-item">
                <label>현장명</label>
                <input
                    v-if="isEditing"
                    type="text"
                    v-model="site.siteName"
                    class="info-input"
                />
                <span v-else class="info-value">{{ site.siteName }}</span>
              </div>
              <div class="info-item">
                <label>현장 코드</label>
                <input
                    v-if="isEditing"
                    type="text"
                    v-model="site.siteId"
                    class="info-input"
                />
                <span v-else class="info-value">{{ site.siteId || '-' }}</span>
              </div>
              <div class="info-item">
                <label>현장 형태</label>
                <select
                    v-if="isEditing"
                    v-model="site.siteType"
                    class="info-select"
                >
                  <option v-for="type in siteTypeOptions" :key="type" :value="type">
                    {{ type }}
                  </option>
                </select>
                <span v-else class="info-value">{{ site.siteType }}</span>
              </div>
              <div class="info-item">
                <label>현장 상태</label>
                <select
                    v-if="isEditing"
                    v-model="site.status"
                    class="info-select"
                >
                  <option v-for="status in statusOptions" :key="status" :value="status">
                    {{ status }}
                  </option>
                </select>
                <span v-else :class="['info-value',
                  site.status === '운영 중' ? 'text-green' :
                  site.status === '준비 중' ? 'text-orange' :
                  'text-gray']">
                  {{ site.status }}
                </span>
              </div>
              <div class="info-item">
                <label>관리면적</label>
                <div v-if="isEditing" class="area-input">
                  <input
                      type="text"
                      v-model="site.area"
                      class="info-input"
                  />
                  <label class="checkbox-inline-small">
                    <input type="checkbox" v-model="site.is_vat" />
                    <span>135㎡ 초과</span>
                  </label>
                </div>
                <span v-else class="info-value">
                  {{ site.area }}㎡
                  <span v-if="site.is_vat" class="badge badge-red">VAT 과세</span>
                </span>
              </div>
              <div class="info-item">
                <label>건물 수</label>
                <input
                    v-if="isEditing"
                    type="number"
                    v-model="site.building_su"
                    class="info-input"
                />
                <span v-else class="info-value">{{ site.building_su }}동</span>
              </div>
              <div class="info-item">
                <label>세대 수</label>
                <input
                    v-if="isEditing"
                    type="number"
                    v-model="site.unit_su"
                    class="info-input"
                />
                <span v-else class="info-value">{{ site.unit_su }}세대</span>
              </div>
              <div class="info-item">
                <label>급여지급일</label>
                <select
                    v-if="isEditing"
                    v-model="site.payment_day"
                    class="info-select"
                >
                  <option v-for="day in 31" :key="day" :value="day">{{ day }}일</option>
                </select>
                <span v-else class="info-value">매월 {{ site.payment_day }}일</span>
              </div>
            </div>
          </div>

          <!-- 주소 정보 -->
          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-map-marker"></i>
              <h3>주소 정보</h3>
            </div>
            <div class="info-grid">
              <div class="info-item full-width">
                <label>우편번호</label>
                <div v-if="isEditing" class="address-search-group">
                  <input
                      type="text"
                      v-model="site.zipcode"
                      class="info-input postal-input"
                      readonly
                  />
                  <button type="button" @click="searchAddress" class="btn-search-small">
                    <i class="mdi mdi-magnify"></i>
                    주소 검색
                  </button>
                </div>
                <span v-else class="info-value">{{ site.zipcode || '-' }}</span>
              </div>
              <div class="info-item full-width">
                <label>현장 주소</label>
                <input
                    v-if="isEditing"
                    type="text"
                    v-model="site.addressMain"
                    class="info-input"
                    readonly
                />
                <span v-else class="info-value">{{ site.addressMain }}</span>
              </div>
              <!--div class="info-item full-width">
                <label>상세 주소</label>
                <input
                    v-if="isEditing"
                    type="text"
                    v-model="site.addressDetail"
                    class="info-input"
                    ref="detailInput"
                />
                <span v-else class="info-value">{{ site.addressDetail || '-' }}</span>
              </div-->
            </div>
          </div>

          <!-- 담당자 정보 -->
          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-account-tie"></i>
              <h3>담당자 정보</h3>
            </div>
            <div class="info-grid">
              <div class="info-item">
                <label>본사 담당자</label>
                <input
                    v-if="isEditing"
                    type="text"
                    v-model="site.managerName"
                    class="info-input"
                />
                <span v-else class="info-value">{{ site.managerName || '-' }}</span>
              </div>
              <div class="info-item">
                <label>본사 담당자 연락처</label>
                <input
                    v-if="isEditing"
                    type="tel"
                    v-model="site.managerContact"
                    class="info-input"
                />
                <span v-else class="info-value">{{ site.managerContact || '-' }}</span>
              </div>
              <div class="info-item">
                <label>관리 소장</label>
                <input
                    v-if="isEditing"
                    type="text"
                    v-model="site.director"
                    class="info-input"
                />
                <span v-else class="info-value">{{ site.director }}</span>
              </div>
              <div class="info-item">
                <label>관리 소장 연락처</label>
                <input
                    v-if="isEditing"
                    type="tel"
                    v-model="site.directorContact"
                    class="info-input"
                />
                <span v-else class="info-value">{{ site.directorContact }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 계약정보 탭 -->
      <div v-show="activeTab === 'contract'" class="tab-panel">
        <div v-if="isEditing" class="contract-actions-top">
          <button
              v-for="cat in typeOptions"
              :key="cat.itemCd"
              type="button"
              @click="addContractGroup(cat)"
              class="btn-add-contract-small"
          >
            <i class="mdi mdi-plus"></i>
            {{ cat.itemNm }} 추가
          </button>
        </div>

        <div v-if="contractGroups.length === 0" class="empty-state">
          <i class="mdi mdi-file-document-outline"></i>
          <p>등록된 계약이 없습니다</p>
        </div>

        <div class="contract-list">
          <div v-for="(group, idx) in contractGroups" :key="idx" class="contract-card-detail">
            <div class="contract-card-header">
              <div class="contract-title-row">
                <span :class="['contract-badge', `badge-${group.category}`]">
                  <i class="mdi mdi-briefcase"></i>
                  {{ group.category }}
                </span>
                <span v-if="getContractDuration(group)" class="contract-duration">
                  <i class="mdi mdi-calendar-range"></i>
                  {{ getContractDuration(group) }}
                </span>
              </div>
              <button
                  v-if="isEditing"
                  type="button"
                  @click="removeContractGroup(idx)"
                  class="btn-remove-small"
              >
                <i class="mdi mdi-delete"></i>
              </button>
            </div>

            <div class="contract-card-body">
              <div class="contract-info-grid">
                <div class="contract-info-item">
                  <label>계약 시작일</label>
                  <input
                      v-if="isEditing"
                      type="date"
                      v-model="group.contractStart"
                      class="info-input"
                  />
                  <span v-else class="info-value">{{ group.contractStart }}</span>
                </div>
                <div class="contract-info-item">
                  <label>계약 종료일</label>
                  <input
                      v-if="isEditing"
                      type="date"
                      v-model="group.contractEnd"
                      class="info-input"
                  />
                  <span v-else class="info-value">{{ group.contractEnd }}</span>
                </div>
                <div class="contract-info-item">
                  <label>근무 일수</label>
                  <input
                      v-if="isEditing"
                      type="number"
                      v-model="group.workDays"
                      class="info-input"
                  />
                  <span v-else class="info-value">{{ group.workDays }}일</span>
                </div>
                <div class="contract-info-item full-width">
                  <label>근무 시간 및 형태</label>
                  <textarea
                      v-if="isEditing"
                      v-model="group.workSchedule"
                      class="info-textarea"
                      rows="2"
                  ></textarea>
                  <span v-else class="info-value">{{ group.workSchedule }}</span>
                </div>
                <div class="contract-info-item full-width">
                  <label>휴게 시간</label>
                  <input
                      v-if="isEditing"
                      type="text"
                      v-model="group.breakTime"
                      class="info-input"
                  />
                  <span v-else class="info-value">{{ group.breakTime || '-' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 배치인원 탭 -->
      <div v-show="activeTab === 'staff'" class="tab-panel">
        <div class="staff-overview">
          <div class="overview-card">
            <i class="mdi mdi-account-group"></i>
            <div class="overview-content">
              <span class="overview-label">총 배치인원</span>
              <span class="overview-value">{{ totalStaff }}명</span>
            </div>
          </div>
          <div class="overview-card">
            <i class="mdi mdi-file-document"></i>
            <div class="overview-content">
              <span class="overview-label">계약 수</span>
              <span class="overview-value">{{ contractGroups.length }}건</span>
            </div>
          </div>
        </div>

        <div v-if="contractGroups.length === 0" class="empty-state">
          <i class="mdi mdi-account-off-outline"></i>
          <p>배치된 인원이 없습니다</p>
        </div>

        <div class="staff-by-contract">
          <div v-for="(group, idx) in contractGroups" :key="idx" class="staff-contract-section">
            <div class="staff-section-header">
              <span :class="['contract-badge', `badge-${group.category}`]">
                <i class="mdi mdi-briefcase"></i>
                {{ group.category }}
              </span>
              <span class="staff-count-badge">{{ getGroupStaffTotal(group) }}명</span>
            </div>

            <div v-if="isEditing" class="staff-add-section">
              <select v-model="group.tempJobCode" class="info-select staff-position-select">
                <option value="">직책 선택</option>
                <option v-for="opt in positionOptions" :key="opt.itemCd" :value="opt.itemCd">
                  {{ opt.itemNm }}
                </option>
              </select>
              <input
                  type="number"
                  v-model="group.tempCount"
                  min="1"
                  class="info-input staff-count-input"
                  placeholder="인원"
              />
              <button type="button" @click="addStaffToGroup(idx)" class="btn-add-staff-small">
                <i class="mdi mdi-plus"></i>
                추가
              </button>
            </div>

            <div v-if="group.staffList && group.staffList.length > 0" class="staff-members-grid">
              <div v-for="(staff, sIdx) in group.staffList" :key="sIdx" class="staff-member-card">
                <div class="staff-member-info">
                  <i class="mdi mdi-account"></i>
                  <div class="staff-member-details">
                    <span class="staff-position">{{ staff.name }}</span>
                    <span class="staff-count">{{ staff.count }}명</span>
                  </div>
                </div>
                <button
                    v-if="isEditing"
                    type="button"
                    @click="removeStaffFromGroup(idx, sIdx)"
                    class="btn-remove-staff-small"
                >
                  <i class="mdi mdi-close"></i>
                </button>
              </div>
            </div>

            <div v-else class="empty-staff">
              <i class="mdi mdi-account-off"></i>
              <span>배치된 인원 없음</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 특이사항 탭 -->
      <div v-show="activeTab === 'memo'" class="tab-panel">
        <div v-if="bigoHistory.length > 0" class="memo-timeline">
          <div v-for="(item, idx) in bigoHistory" :key="idx" class="timeline-item">
            <div class="timeline-marker"></div>
            <div class="timeline-content">
              <div class="timeline-header">
                <i class="mdi mdi-calendar"></i>
                <span class="timeline-date">{{ item.regDt ? item.regDt.substring(0, 10) : '-' }}</span>
              </div>
              <p class="timeline-text">{{ item.bigo }}</p>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          <i class="mdi mdi-note-text-outline"></i>
          <p>등록된 특이사항이 없습니다</p>
        </div>

        <div v-if="isEditing" class="memo-add-section">
          <label class="section-label">
            <i class="mdi mdi-pencil"></i>
            새로운 메모 추가
          </label>
          <textarea
              v-model="site.bigo"
              class="info-textarea"
              rows="4"
              placeholder="특이사항을 입력하세요 (저장 시 히스토리에 추가됩니다)"
          ></textarea>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.header-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.btn-back {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-back:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-back i {
  font-size: 24px;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title i {
  font-size: 32px;
  color: #667eea;
}

.page-subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-edit,
.btn-delete,
.btn-cancel,
.btn-save {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-edit {
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.btn-edit:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-delete {
  background: white;
  border: 1px solid #fee2e2;
  color: #dc2626;
}

.btn-delete:hover {
  background: #fef2f2;
  border-color: #fecaca;
}

.btn-cancel {
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.btn-cancel:hover {
  background: #f8fafc;
}

.btn-save {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
}

.btn-save:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(16, 185, 129, 0.4);
}

.btn-edit i,
.btn-delete i,
.btn-cancel i,
.btn-save i {
  font-size: 18px;
}

/* === 프로필 카드 === */
.profile-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  margin-bottom: 28px;
}

.profile-banner {
  height: 120px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.profile-content {
  padding: 0 32px 32px;
  display: flex;
  gap: 32px;
  align-items: flex-start;
}

.profile-icon-section {
  position: relative;
  margin-top: -60px;
}

.profile-icon {
  width: 120px;
  height: 120px;
  border-radius: 20px;
  background: white;
  border: 4px solid white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.profile-icon i {
  font-size: 64px;
  color: white;
}

.profile-info {
  flex: 1;
  padding-top: 8px;
}

.profile-main {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.profile-name {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: white;
}

.status-badge i {
  font-size: 16px;
}

.status-active {
  background: #10b981;
}

.status-pending {
  background: #f59e0b;
}

.status-inactive {
  background: #64748b;
}

.profile-details {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #64748b;
  font-size: 14px;
}

.detail-item i {
  font-size: 18px;
  color: #94a3b8;
}

.profile-stats {
  display: flex;
  gap: 24px;
  padding-top: 8px;
}

.stat-item {
  display: flex;
  gap: 12px;
  align-items: center;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--stat-color);
  opacity: 0.1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.stat-icon i {
  font-size: 24px;
  color: var(--stat-color);
  position: absolute;
}

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 500;
}

.stat-value {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
}

/* === 탭 === */
.tabs-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  margin-bottom: 28px;
  overflow: hidden;
}

.tabs-nav {
  display: flex;
  border-bottom: 2px solid #f1f5f9;
}

.tab-button {
  flex: 1;
  padding: 16px 24px;
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
  position: relative;
}

.tab-button i {
  font-size: 18px;
}

.tab-button:hover {
  background: #f8fafc;
  color: #334155;
}

.tab-button.active {
  color: #667eea;
}

.tab-button.active::after {
  content: '';
  position: absolute;
  bottom: -2px;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* === 탭 컨텐츠 === */
.tab-content {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  padding: 32px;
}

.tab-panel {
  animation: fadeIn 0.3s;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* === 정보 섹션 === */
.info-sections {
  display: grid;
  gap: 24px;
}

.info-section {
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  padding: 24px;
  background: #fafbfc;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #f1f5f9;
}

.section-header i {
  font-size: 24px;
  color: #667eea;
}

.section-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.info-grid,
.contract-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.info-item,
.contract-info-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-item.full-width,
.contract-info-item.full-width {
  grid-column: 1 / -1;
}

.info-item label,
.contract-info-item label,
.section-label {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.section-label {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.section-label i {
  font-size: 16px;
  color: #667eea;
}

.info-value {
  font-size: 15px;
  color: #1e293b;
  padding: 10px 0;
}

.text-green { color: #10b981; font-weight: 600; }
.text-orange { color: #f59e0b; font-weight: 600; }
.text-gray { color: #64748b; }

.info-input,
.info-select,
.info-textarea {
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  color: #334155;
  background: white;
  transition: all 0.2s;
}

.info-input:focus,
.info-select:focus,
.info-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.info-textarea {
  resize: vertical;
  font-family: inherit;
}

.area-input {
  display: flex;
  gap: 12px;
  align-items: center;
}

.area-input .info-input {
  flex: 1;
}

.checkbox-inline-small {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #ef4444;
  font-weight: 600;
  white-space: nowrap;
}

.checkbox-inline-small input {
  width: 16px;
  height: 16px;
}

.address-search-group {
  display: flex;
  gap: 12px;
}

.postal-input {
  width: 140px;
}

.btn-search-small {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.btn-search-small i {
  font-size: 16px;
}

/* 배지 */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  margin-left: 8px;
}

.badge-red {
  background: #fee2e2;
  color: #991b1b;
}

/* === 계약 탭 === */
.contract-actions-top {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.btn-add-contract-small {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: white;
  border: 2px dashed #cbd5e1;
  border-radius: 8px;
  color: #667eea;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-add-contract-small:hover {
  background: #f8fafc;
  border-color: #667eea;
}

.btn-add-contract-small i {
  font-size: 16px;
}

.contract-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.contract-card-detail {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
  background: white;
}

.contract-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}

.contract-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.contract-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: white;
}

.contract-badge i {
  font-size: 16px;
}

.badge-경비 { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
.badge-미화 { background: linear-gradient(135deg, #ec4899 0%, #db2777 100%); }
.badge-시설 { background: linear-gradient(135deg, #10b981 0%, #059669 100%); }

.contract-duration {
  font-size: 13px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 4px;
}

.contract-duration i {
  font-size: 16px;
}

.btn-remove-small {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: #fef2f2;
  border: none;
  color: #dc2626;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-remove-small:hover {
  background: #fee2e2;
}

.btn-remove-small i {
  font-size: 16px;
}

.contract-card-body {
  padding: 20px;
}

/* === 배치인원 탭 === */
.staff-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.overview-card {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 20px;
  background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.overview-card i {
  font-size: 40px;
  color: #667eea;
}

.overview-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.overview-label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.overview-value {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
}

.staff-by-contract {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.staff-contract-section {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 20px;
  background: #fafbfc;
}

.staff-section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 2px solid #e2e8f0;
}

.staff-count-badge {
  padding: 6px 12px;
  background: #eff6ff;
  color: #1e40af;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 700;
}

.staff-add-section {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
}

.staff-position-select {
  flex: 1;
}

.staff-count-input {
  width: 100px;
}

.btn-add-staff-small {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.btn-add-staff-small i {
  font-size: 16px;
}

.staff-members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}

.staff-member-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.staff-member-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.staff-member-info i {
  font-size: 24px;
  color: #667eea;
}

.staff-member-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.staff-position {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.staff-count {
  font-size: 12px;
  color: #64748b;
}

.btn-remove-staff-small {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #fef2f2;
  border: none;
  color: #dc2626;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-remove-staff-small:hover {
  background: #fee2e2;
}

.btn-remove-staff-small i {
  font-size: 16px;
}

.empty-staff {
  text-align: center;
  padding: 40px 20px;
  color: #94a3b8;
  font-size: 14px;
}

.empty-staff i {
  font-size: 48px;
  display: block;
  margin-bottom: 12px;
  opacity: 0.3;
}

/* === 특이사항 탭 === */
.memo-timeline {
  display: flex;
  flex-direction: column;
  gap: 24px;
  position: relative;
  padding-left: 32px;
  margin-bottom: 24px;
}

.memo-timeline::before {
  content: '';
  position: absolute;
  left: 8px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: #e2e8f0;
}

.timeline-item {
  position: relative;
}

.timeline-marker {
  position: absolute;
  left: -28px;
  top: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #667eea;
  border: 3px solid white;
  box-shadow: 0 0 0 2px #e2e8f0;
}

.timeline-content {
  background: #fafbfc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 16px;
}

.timeline-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
}

.timeline-header i {
  font-size: 16px;
}

.timeline-date {
  color: #94a3b8;
}

.timeline-text {
  font-size: 14px;
  color: #334155;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
}

.memo-add-section {
  padding: 20px;
  background: #f8fafc;
  border-radius: 10px;
  border: 2px dashed #cbd5e1;
}

/* === 빈 상태 === */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #94a3b8;
}

.empty-state i {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-state p {
  font-size: 16px;
  font-weight: 600;
  color: #64748b;
  margin: 0;
}

/* === 반응형 === */
@media (max-width: 1024px) {
  .profile-content {
    flex-direction: column;
  }

  .profile-stats {
    flex-direction: column;
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: 16px;
  }

  .header-actions {
    width: 100%;
    flex-direction: column;
  }

  .btn-edit,
  .btn-delete,
  .btn-cancel,
  .btn-save {
    width: 100%;
    justify-content: center;
  }

  .tabs-nav {
    flex-direction: column;
  }

  .tab-button.active::after {
    left: 0;
    right: auto;
    top: 0;
    bottom: 0;
    width: 2px;
    height: 100%;
  }

  .info-grid,
  .contract-info-grid {
    grid-template-columns: 1fr;
  }

  .profile-stats {
    width: 100%;
  }

  .address-search-group {
    flex-direction: column;
  }

  .postal-input {
    width: 100%;
  }

  .btn-search-small {
    width: 100%;
    justify-content: center;
  }

  .staff-add-section {
    flex-direction: column;
  }

  .staff-position-select,
  .staff-count-input {
    width: 100%;
  }

  .staff-members-grid {
    grid-template-columns: 1fr;
  }
}
</style>
