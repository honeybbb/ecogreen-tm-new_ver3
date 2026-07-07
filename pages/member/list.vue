<script setup>
import { ref, computed, onMounted, onActivated, watch } from 'vue';
import axios from 'axios';
import { useRouter, useRoute } from 'nuxt/app';
import Pagination from '@/components/Pagination.vue'
import SiteSelect from "~/components/SiteSelect.vue";
import { useTableResize } from '@/composables/useTableResize';
const { startResize } = useTableResize();
// import ExcelDownloadModal from '@/components/ExcelDownloadModal.vue';

const router = useRouter();
const route = useRoute(); // ★ URL 쿼리를 읽기 위해 추가
const {
  siteOptions,
  typeOptions,
  disabledOptions,
  fetchSiteOptions,
  fetchTypeOptions,
  fetchDisabledOptions,
} = useApi();

// ── 상태 ──────────────────────────────────────────
const searchTerm       = ref('');
const selectedSite     = ref('전체');
const selectedType     = ref('전체');
const selectedStatus   = ref('전체');
const selectedGender   = ref('전체');
const selectedPaymentDay = ref('전체'); // ★ 급여일 필터 상태 추가

const filterContractDate = ref(false);
const filterStartDate    = ref('');
const filterEndDate      = ref('');
const filterNoPension    = ref(false);
const filterNoEmployment = ref(false);
const filterDisability   = ref(false);
const filterForeigner    = ref(false);
const filterActive       = ref(false); // 재직중 필터

const sortKey   = ref('id');
const sortOrder = ref('asc');

const members   = ref([]);
const adminMemoArray = ref([
  'cIdx','name','position','contract','gender',
  'foreigner','disability','inDate','outDate','outReason',
  'four_ins','retire_pension','accountNumber','phone'
]);
// ── 컬럼명 → 한글 라벨 매핑 ──────────────────────────
const memoColLabelMap = {
  cIdx: '계약번호', name: '이름', position: '직책', contract: '근로계약일',
  gender: '성별', foreigner: '내/외국인', disability: '장애여부',
  inDate: '입사일', outDate: '퇴사일', outReason: '퇴직사유',
  four_ins: '4대보험', retire_pension: '퇴직연금',
  accountNumber: '계좌번호', phone: '연락처'
};

// ── 메모 타입 옵션 (02004: 중요/일반) ────────────────
const memoTypeOptions = [
  { itemCd: '02004001', itemNm: '중요', color: 'var(--danger)' },
  { itemCd: '02004002', itemNm: '일반', color: 'var(--text-sub)' },
];
const getMemoTypeInfo = (type) => memoTypeOptions.find(o => o.itemCd === type) || memoTypeOptions[1];

// ── 셀 메모 상태 ──────────────────────────────────────
const contextMenu = ref({ visible: false, x: 0, y: 0, member: null, colName: null });
const memoPanel    = ref({ visible: false, x: 0, y: 0, member: null, colName: null, newText: '', newType: '02004002' });

const parseMemo = (member) => {
  if (!member.memo) return {};
  if (typeof member.memo === 'string') {
    try { return JSON.parse(member.memo); } catch { return {}; }
  }
  return member.memo;
};
const getMemoList = (member, colName) => parseMemo(member)[colName] || [];
const hasMemo = (member, colName) => getMemoList(member, colName).length > 0;
const memoCount = (member, colName) => getMemoList(member, colName).length;
// 셀 인디케이터 색상: 중요 메모가 하나라도 있으면 빨강, 없으면 회색
const memoIndicatorClass = (member, colName) => {
  const list = getMemoList(member, colName);
  if (!list.length) return '';
  return list.some(m => m.type === '02004001') ? 'memo-dot-important' : 'memo-dot-normal';
};

const onCellContextMenu = (e, member, colName) => {
  if (!adminMemoArray.value.includes(colName)) return;
  e.preventDefault();
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, member, colName };
  memoPanel.value.visible = false;
};
const closeContextMenu = () => { contextMenu.value.visible = false; };

const openMemoPanel = () => {
  const { x, y, member, colName } = contextMenu.value;
  memoPanel.value = {
    visible: true,
    x: Math.min(x, window.innerWidth - 300),
    y: Math.min(y, window.innerHeight - 260),
    member, colName,
    newText: '', newType: '02004002'
  };
  closeContextMenu();
};
const closeMemoPanel = () => { memoPanel.value.visible = false; };

const addMemo = async () => {
  const { member, colName, newText, newType } = memoPanel.value;
  const text = newText.trim();
  if (!text) return;
  try {
    const res = await axios.put(`/api/v1/member/memo/${member.idx}`, { colName, type: newType, text });
    if (res.data.result) {
      member.memo = res.data.data; // 화면 즉시 반영
      memoPanel.value.newText = '';
    }
  } catch (e) {
    console.error('메모 저장 실패:', e);
    window.customAlert('메모 저장에 실패했습니다.', 'error');
  }
};

const removeMemo = async (member, colName, memoId) => {
  if (!await window.customConfirm('이 메모를 삭제하시겠습니까?')) return;
  try {
    const res = await axios.delete(`/api/v1/member/memo/${member.idx}`, { data: { colName, memoId } });
    if (res.data.result) member.memo = res.data.data;
  } catch (e) {
    console.error('메모 삭제 실패:', e);
    window.customAlert('메모 삭제에 실패했습니다.', 'error');
  }
};

const handleGlobalClick = () => { if (contextMenu.value.visible) closeContextMenu(); };

const isLoading = ref(false);
const error     = ref(null);

const showRRN      = ref(false);
const revealedRRNs = ref({});
const rrnLoading   = ref(false);
const showExcelModal = ref(false);

// ── 페이지네이션 상태 ──────────────────────────────
const currentPage     = ref(1);
const pageSize        = ref(50); // 한 페이지당 행 수
const pageSizeOptions = [50, 100, 200, 500];

const ageLimits = ref({ pension: 0, employment: 0 });

// 급여일 옵션 동적 생성 (존재하는 급여일만 추출 후 정렬)
const paymentDayOptions = computed(() => {
  const days = new Set(
      members.value
          .map(m => m.payment_day)
          .filter(d => d !== null && d !== undefined && String(d).trim() !== '')
  );

  return Array.from(days).sort((a, b) => {
    const numA = Number(a);
    const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a).localeCompare(String(b), 'ko');
  });
});

// =============================================
// 선택된 현장의 계약 인원(staffCount) 계산
// =============================================
// =============================================
// [수정] 선택된 현장의 계약 인원 및 공백 인원 계산
// =============================================
const currentSiteContractCount = computed(() => {
  if (selectedSite.value === '전체' || !selectedSite.value) return null;

  const foundSite = siteOptions.value.find(s => String(s.idx) === String(selectedSite.value));
  if (!foundSite || !foundSite.contracts || foundSite.contracts.length === 0) return null;

  const formatList = foundSite.contracts
      .filter(c => c.staffCount > 0)
      .map(c => {
        // 1. 해당 현장(sIdx) + 해당 직종(typeNm) + 재직중(status == 0)인 실제 직원 수 구하기
        const activeStaffCount = members.value.filter(
            m => String(m.sIdx) === String(selectedSite.value)
                && String(m.status) === '0'
                && m.type === c.typeNm
        ).length;

        // 2. 공백 인원 = 계약 인원 - 재직 인원
        const missingCount = c.staffCount - activeStaffCount;

        // 3. 상태에 따른 텍스트 분기 처리
        let missingText = '';
        if (missingCount > 0) {
          missingText = `공백 ${missingCount}명`;
        } else if (missingCount < 0) {
          missingText = `초과 ${Math.abs(missingCount)}명`;
        } else {
          missingText = `충원완료`;
        }

        // 결과 예시: "경비 3명(공백 1명)"
        return `${c.typeNm} ${c.staffCount}명(${missingText})`;
      });

  return formatList.length > 0 ? formatList.join(', ') : null;
});

const fetchOverAgeOption = async () => {
  const groupCd = '02003';
  try {
    const res = await axios.get(`/api/v1/code/group/${groupCd}`);
    const codes = res.data.data || [];
    const pensionCode = codes.find(c => c.itemNm.includes('국민연금'));
    const employCode = codes.find(c => c.itemNm.includes('고용보험'));

    if (pensionCode && pensionCode.option) ageLimits.value.pension = Number(pensionCode.option);
    if (employCode && employCode.option) ageLimits.value.employment = Number(employCode.option);
  } catch (e) {
    console.error('연령 기준 코드를 불러오지 못해 기본값(60, 65)을 적용합니다.', e);
  }
};

const fetchMembers = async () => {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await axios.get(`/api/v1/member/list`);
    members.value = res.data.data || [];
  } catch (e) {
    console.error('직원 목록 로드 실패:', e);
    error.value = '직원 목록을 불러오는 중 오류가 발생했습니다.';
    members.value = [];
  } finally {
    isLoading.value = false;
  }
};

const updateFourInsStatus = async (m, colName) => {
  // colName은 'inYn' 또는 'outYn'이 들어옵니다.
  // 현재 값이 'Y'면 'N'으로, 'N'이면 'Y'로 변경할 값을 계산합니다.
  const newValue = m[colName] === 'Y' ? 'N' : 'Y';
  const label = colName === 'inYn' ? '취득신고' : '상실신고';

  if (!await window.customConfirm(`${m.name} 직원의 4대보험 ${label} 여부를 변경하시겠습니까?`)) return;

  let payload = {
    colName: colName,
    status: newValue
  };

  try {
    const res = await axios.put(`/api/v1/member/status/four/ins/${m.idx}`, payload);

    if (res.data.result) {
      // DB 업데이트가 성공하면 화면의 데이터도 즉시 변경해줍니다. (새로고침 불필요)
      m[colName] = newValue;
    } else {
      window.customAlert('상태 변경에 실패했습니다.','error')//alert('상태 변경에 실패했습니다.');
    }
  } catch (error) {
    console.error('API 에러:', error);
    window.customAlert('서버 통신 중 오류가 발생했습니다.','error');
  }
}

const toggleRRN = async () => {
  if (showRRN.value) {
    showRRN.value = false;
    revealedRRNs.value = {};
    return;
  }
  if (!await window.customConfirm('주민번호 전체를 표시합니다. 계속하시겠습니까?')) return;

  rrnLoading.value = true;
  try {
    const mIdxList = pagedMembers.value.map(m => m.idx);
    const res = await axios.post('/api/v1/member/rrn/batch', { mIdxList });

    if (!res.data.result) {
      window.customAlert('주민번호 조회 권한이 없습니다.','error');
      return;
    }
    revealedRRNs.value = res.data.data;
    showRRN.value = true;
  } catch (e) {
    window.customAlert('주민번호 조회 중 오류가 발생했습니다.','error');
  } finally {
    rrnLoading.value = false;
  }
};

watch(currentPage, () => {
  showRRN.value = false;
  revealedRRNs.value = {};
});

const displayRRN = (member) => {
  if (!member.rrn) return '-';
  if (showRRN.value && revealedRRNs.value[member.idx]) {
    const clean = revealedRRNs.value[member.idx].replace(/[^0-9]/g, '');
    return clean.length === 13
        ? `${clean.substring(0, 6)}-${clean.substring(6)}`
        : revealedRRNs.value[member.idx];
  }
  return member.rrn;
};

const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
  currentPage.value = 1;
};

const resetFilters = () => {
  searchTerm.value         = '';
  selectedSite.value       = '전체';
  selectedType.value       = '전체';
  selectedStatus.value     = '전체';
  selectedGender.value     = '전체';
  selectedPaymentDay.value = '전체'; // ★ 급여일 초기화 추가
  filterContractDate.value = false;
  filterStartDate.value    = '';
  filterEndDate.value      = '';
  filterNoPension.value    = false;
  filterNoEmployment.value = false;
  filterDisability.value   = false;
  filterForeigner.value    = false;
  filterActive.value       = false;
  currentPage.value        = 1;
  sortKey.value            = 'id';
  sortOrder.value          = 'asc';
  pageSize.value           = 50;
};

// ── ★ URL 동기화 로직 ──────────────────────────────────

// 1. 컴포넌트 마운트 시 URL Query -> State 반영
const syncFiltersFromURL = () => {
  const q = route.query;
  if (q.search)       searchTerm.value = q.search;
  if (q.site)         selectedSite.value = q.site;
  if (q.type)         selectedType.value = q.type;
  if (q.status)       selectedStatus.value = q.status;
  if (q.gender)       selectedGender.value = q.gender;
  if (q.paymentDay)   selectedPaymentDay.value = q.paymentDay; // ★ 급여일 URL 동기화 추가
  if (q.contract)     filterContractDate.value = q.contract === 'true';
  if (q.startDate)    filterStartDate.value = q.startDate;
  if (q.endDate)      filterEndDate.value = q.endDate;
  if (q.noPension)    filterNoPension.value = q.noPension === 'true';
  if (q.noEmployment) filterNoEmployment.value = q.noEmployment === 'true';
  if (q.disability)   filterDisability.value = q.disability === 'true';
  if (q.foreigner)    filterForeigner.value = q.foreigner === 'true';
  if (q.page)         currentPage.value = Number(q.page) || 1;
  if (q.size)         pageSize.value = Number(q.size) || 50;
  if (q.sort)         sortKey.value = q.sort;
  if (q.order)        sortOrder.value = q.order;
};

// 2. State 변경 시 State -> URL Query 반영 (watch 활용)
watch(
    [
      searchTerm, selectedSite, selectedType, selectedStatus, selectedGender, selectedPaymentDay, // ★ 추가
      filterContractDate, filterStartDate, filterEndDate, filterNoPension, filterNoEmployment,
      filterDisability, filterForeigner, currentPage, pageSize, sortKey, sortOrder
    ],
    () => {
      const query = {};
      if (searchTerm.value)                query.search = searchTerm.value;
      if (selectedSite.value !== '전체')   query.site = selectedSite.value;
      if (selectedType.value !== '전체')   query.type = selectedType.value;
      if (selectedStatus.value !== '전체') query.status = selectedStatus.value;
      if (selectedGender.value !== '전체') query.gender = selectedGender.value;
      if (selectedPaymentDay.value !== '전체') query.paymentDay = selectedPaymentDay.value; // ★ 추가
      if (filterContractDate.value)        query.contract = 'true';
      if (filterStartDate.value)           query.startDate = filterStartDate.value;
      if (filterEndDate.value)             query.endDate = filterEndDate.value;
      if (filterNoPension.value)           query.noPension = 'true';
      if (filterNoEmployment.value)        query.noEmployment = 'true';
      if (filterDisability.value)          query.disability = 'true';
      if (filterForeigner.value)           query.foreigner = 'true';
      if (currentPage.value !== 1)         query.page = currentPage.value;
      if (pageSize.value !== 50)           query.size = pageSize.value;
      if (sortKey.value !== 'id')          query.sort = sortKey.value;
      if (sortOrder.value !== 'asc')       query.order = sortOrder.value;

      router.replace({ query });
    },
    { deep: true }
);
// ───────────────────────────────────────────────────

const filteredMembers = computed(() => {
  let result = members.value.filter(member => {
    const siteMatch   = selectedSite.value === '전체' || String(member.sIdx) === String(selectedSite.value);
    const searchMatch = member.name.toLowerCase().includes(searchTerm.value.toLowerCase());
    const typeMatch   = selectedType.value === '전체' || member.type === selectedType.value;
    // 급여일 필터 매칭 추가
    const paymentDayMatch = selectedPaymentDay.value === '전체' || String(member.payment_day) === String(selectedPaymentDay.value);

    const dateMatch =
        // 1. 검색 종료일(filterEndDate)이 있다면: 입사일(inDate)이 검색 종료일 이전이거나 같아야 함
        (!filterEndDate.value || (member.inDate && member.inDate <= filterEndDate.value)) &&
        // 2. 검색 시작일(filterStartDate)이 있다면: 퇴사일(outDate)이 없거나(재직중), 퇴사일이 검색 시작일 이후이거나 같아야 함
        (!filterStartDate.value || !member.outDate || member.outDate >= filterStartDate.value);

    const pensionMatch    = !filterNoPension.value    || calculateAge(member.birthDt) >= ageLimits.value.pension;
    const employmentMatch = !filterNoEmployment.value || calculateAge(member.birthDt) >= ageLimits.value.employment

    const disaMatch   = !filterDisability.value || member.disability === 'Y' || member.disability === true;
    const foreMatch   = !filterForeigner.value  || member.foreigner  === 'Y' || member.foreigner  === true;
    const activeMatch = selectedStatus.value === '전체' || member.status == selectedStatus.value;
    const genderMatch = selectedGender.value === '전체' || member.gender == selectedGender.value;

    const contractMatch = !filterContractDate.value || !member.contract || member.contract === '';

    currentPage.value = 1; //첫 페이지로

    return siteMatch && searchMatch && typeMatch && paymentDayMatch && // ★ paymentDayMatch 추가
        dateMatch && pensionMatch && employmentMatch &&
        disaMatch && foreMatch && activeMatch && genderMatch && contractMatch;
  });

  result.sort((a, b) => {
    if (a.sIdx !== b.sIdx) return Number(b.sIdx) - Number(a.sIdx);
    const sortA = a.sort != null ? Number(a.sort) : 999999;
    const sortB = b.sort != null ? Number(b.sort) : 999999;
    if (sortA !== sortB) return sortA - sortB;
    return Number(a.idx) - Number(b.idx);
  });

  if (sortKey.value !== 'id') {
    result.sort((a, b) => {
      const mod = sortOrder.value === 'asc' ? 1 : -1;
      const valA = a[sortKey.value];
      const valB = b[sortKey.value];
      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB, 'ko') * mod;
      }
      if (valA < valB) return -1 * mod;
      if (valA > valB) return  1 * mod;
      return 0;
    });
  }

  return result;
});

const statsInfo = computed(() => ({
  total:      filteredMembers.value.length,
  active:     filteredMembers.value.filter(m => m.status === '재직').length,
  noPension:    filteredMembers.value.filter(m => calculateAge(m.birthDt) >= 60).length,
  noEmployment: filteredMembers.value.filter(m => calculateAge(m.birthDt) >= 65).length,
  disability: filteredMembers.value.filter(m => m.disability === 'Y' || m.disability === true).length,
  foreigner:  filteredMembers.value.filter(m => m.foreigner  === 'Y' || m.foreigner  === true).length,
}));

const pagedMembers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredMembers.value.slice(start, start + pageSize.value);
});

const handlePageChange = () => {
  document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const onFilterChange = () => { currentPage.value = 1; };

const getDisabilityStyle = (grade) => {
  const opt = disabledOptions.value.find(o => o.itemNm == grade);
  return {
    backgroundColor: opt?.option || 'var(--bg-hover)',
    color: 'var(--bg-surface)',
    border: 'none',
  };
};

const getContractDaysLeft = (contractDate) => {
  if (!contractDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(contractDate);
  end.setHours(0, 0, 0, 0);
  return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
};

const goToRegister = () => {
  // 현재 페이지의 모든 쿼리(?site=...&search=...)를 들고 이동합니다.
  router.push({
    path: '/member/register',
    query: route.query
  });
};
// const goToDetail   = (id) => router.push(`/member/${id}`);
const goToDetail = (id) => window.open(router.resolve(`/member/${id}`).href, "_blank", "width=1200,height=800");
const goRemove = async (id) => {
  if (!await window.customConfirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

  try {
    await axios.delete(`/api/v1/member/${id}`);
    window.alert('삭제되었습니다.')//alert('삭제되었습니다.');
    await fetchMembers()
  } catch (error) {
    console.error('삭제 실패:', error);
    window.customAlert('삭제에 실패했습니다.','error');
  }
}

onMounted(async () => {
  // API 호출보다 URL 동기화를 먼저 수행
  syncFiltersFromURL();

  await Promise.all([
    fetchSiteOptions(),
    fetchTypeOptions(),
    fetchDisabledOptions(),
    fetchOverAgeOption()
  ]);
  // URL 필터가 반영된 상태로 리스트 로드
  await fetchMembers();
  window.addEventListener('click', handleGlobalClick);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', handleGlobalClick);
});

onActivated(async () => {
  await fetchMembers();
});
</script>

<template>
  <div class="member-list-page">

    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-account-multiple"></i>
          직원 명부 관리
        </h1>
        <p class="page-subtitle">전체 직원 정보를 조회하고 관리합니다</p>
      </div>
      <div class="header-actions">
        <button @click="showExcelModal = true" class="btn-excel">
          <i class="mdi mdi-microsoft-excel"></i>
          <span>엑셀 다운로드</span>
        </button>

        <button @click="toggleRRN" :class="['btn-rrn-toggle', { active: showRRN }]" :disabled="rrnLoading">
          <i class="mdi" :class="rrnLoading ? 'mdi-loading mdi-spin' : showRRN ? 'mdi-eye-off' : 'mdi-eye'"></i>
          <span>{{ showRRN ? '주민번호 숨기기' : '주민번호 보기' }}</span>
        </button>

        <button @click="goToRegister" class="btn-add">
          <i class="mdi mdi-account-plus"></i>
          <span>직원 등록</span>
        </button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-account-group"></i></div>
        <div class="stat-content">
          <span class="stat-label">전체 직원</span>
          <span class="stat-value">{{ statsInfo.total }} <small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-account-check"></i></div>
        <div class="stat-content">
          <span class="stat-label">재직 중</span>
          <span class="stat-value">{{ statsInfo.active }} <small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #f97316; --card-bg: rgba(249, 115, 22, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-shield-remove-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">국민연금 제외</span>
          <span class="stat-value">{{ statsInfo.noPension }} <small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--danger); --card-bg: rgba(239, 68, 68, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-account-off-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">고용보험 제외</span>
          <span class="stat-value">{{ statsInfo.noEmployment }} <small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #8b5cf6; --card-bg: rgba(139, 92, 246, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-wheelchair-accessibility"></i></div>
        <div class="stat-content">
          <span class="stat-label">장애인</span>
          <span class="stat-value">{{ statsInfo.disability }} <small>명</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-earth"></i></div>
        <div class="stat-content">
          <span class="stat-label">외국인</span>
          <span class="stat-value">{{ statsInfo.foreigner }} <small>명</small></span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><!--i class="mdi mdi-office-building"></i--> 근무 현장</label>
          <SiteSelect v-model="selectedSite" :width="'100%'" />
        </div>

        <div class="filter-group">
          <label class="filter-label"><!--i class="mdi mdi-calendar-clock"></i--> 급여일</label>
          <select v-model="selectedPaymentDay" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option v-for="day in paymentDayOptions" :key="day" :value="day">
              {{ day }}{{ isNaN(day) ? '' : '일' }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label"><!--i class="mdi mdi-account-box"></i--> 구분</label>
          <select v-model="selectedType" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemNm">{{ opt.itemNm }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label"><!--i class="mdi mdi-account-check"></i--> 재직 상태</label>
          <select v-model="selectedStatus" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option value="0">재직</option>
            <option value="1">퇴사</option>
            <option value="2">일용직</option>
            <option value="3">대근</option>
          </select>
        </div>
        <div class="filter-group">
          <!--label class="filter-label"><i class="mdi mdi-calendar-range"></i> 입사 기간</label-->
          <label class="filter-label"><!--i class="mdi mdi-calendar-range"></i--> 재직 기간 조회</label>
          <div class="date-range-inputs">
            <input type="date" v-model="filterStartDate" @change="onFilterChange" class="filter-select date-input" max="9999-12-31" />
            <span class="date-separator">~</span>
            <input type="date" v-model="filterEndDate" @change="onFilterChange" class="filter-select date-input" max="9999-12-31" />
          </div>
        </div>
        <div class="filter-group">
          <label class="filter-label"><!--i class="mdi mdi-gender-male-female"></i--> 성별</label>
          <select v-model="selectedGender" @change="onFilterChange" class="filter-select" >
            <option value="전체">전체</option>
            <option value="M">남성</option>
            <option value="F">여성</option>
          </select>
        </div>
        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="searchTerm"
                placeholder="이름으로 검색..."
                class="search-input"
                @input="onFilterChange"
                @keyup.enter="onFilterChange"
            />
            <button v-if="searchTerm" @click="searchTerm = ''; onFilterChange()" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
          <button @click="resetFilters" class="btn-search" title="필터 초기화">
            <i class="mdi mdi-filter-off"></i>
            <span>초기화</span>
          </button>
        </div>
      </div>

      <div class="filter-toggles-row">
        <span class="toggles-label"><i class="mdi mdi-filter-variant"></i> 빠른 필터:</span>
        <div class="filter-toggles">
          <label class="toggle-chip" :class="{ active: filterNoPension }">
            <input type="checkbox" v-model="filterNoPension" @change="onFilterChange">
            <i class="mdi mdi-shield-remove-outline"></i><span>국민연금 제외 ({{ageLimits.pension}}세↑)</span>
          </label>
          <label class="toggle-chip" :class="{ active: filterNoEmployment }">
            <input type="checkbox" v-model="filterNoEmployment" @change="onFilterChange">
            <i class="mdi mdi-account-off-outline"></i><span>고용보험 제외 ({{ageLimits.employment}}세↑)</span>
          </label>
          <label class="toggle-chip" :class="{ active: filterDisability }">
            <input type="checkbox" v-model="filterDisability" @change="onFilterChange">
            <i class="mdi mdi-wheelchair-accessibility"></i><span>장애인</span>
          </label>
          <label class="toggle-chip" :class="{ active: filterForeigner }">
            <input type="checkbox" v-model="filterForeigner" @change="onFilterChange">
            <i class="mdi mdi-earth"></i><span>외국인</span>
          </label>
          <label class="toggle-chip" :class="{ active: filterContractDate }">
            <input type="checkbox" v-model="filterContractDate" @change="onFilterChange">
            <i class="mdi mdi-account-alert"></i><span>근로계약일 공백</span>
          </label>
        </div>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>데이터를 불러오는 중...</p>
    </div>

    <div v-if="error && !isLoading" class="error-state">
      <i class="mdi mdi-alert-circle"></i>
      <p>{{ error }}</p>
    </div>

    <div class="table-card" v-if="!isLoading">
      <div class="table-header" style="justify-content: space-between; display: flex;">
        <div class="table-title">
          <span>직원 목록 ({{ filteredMembers.length }}명)</span>

          <span
              v-if="currentSiteContractCount !== null"
              style="font-size: 14px; font-weight: 600; color: var(--text-sub);"
          >
            (계약인원 : {{ currentSiteContractCount }})
          </span>
        </div>
        <div class="page-size-select">
          <label>페이지당</label>
          <select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;">
            <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option>
          </select>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <colgroup>
            <col width="3%">
            <col width="*">
            <col width="4%">
            <col width="4%">
            <col width="6%">
            <col width="3%">
            <col width="3%">
            <col width="8%">
            <col width="4%">
            <col width="3%">
            <col width="8%">
            <col width="8%">
            <col width="5%">
            <col width="2%">
            <col width="2%">
            <col width="10%">
            <col width="10%">
            <col width="5%">
            <col width="8%">
          </colgroup>
          <thead>
          <tr>
            <th @click="toggleSort('id')" class="sortable resizable">
              <div class="th-content">ID <i v-if="sortKey==='id'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('siteName')" class="sortable resizable col-site">
              <div class="th-content">현장 <i v-if="sortKey==='siteName'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('name')" class="sortable resizable">
              <div class="th-content">이름 <i v-if="sortKey==='name'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('position')" class="sortable resizable">
              <div class="th-content">직책 <i v-if="sortKey==='position'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="sortable resizable">
              <div class="th-content">근로계약일 <i v-if="sortKey==='contract'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('gender')" class="sortable resizable">
              <div class="th-content">성별 <i v-if="sortKey==='gender'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('birthDt')" class="sortable resizable">
              <div class="th-content">나이 <i v-if="sortKey==='birthDt'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="resizable">
              <div class="th-content">주민번호</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="resizable">
              <div class="th-content">내/외국인</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="resizable">
              <div class="th-content">장애여부</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('inDate')" class="sortable resizable">
              <div class="th-content">입사일 <i v-if="sortKey==='inDate'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('outDate')" class="sortable resizable">
              <div class="th-content">퇴사일 <i v-if="sortKey==='outDate'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="resizable">
              <div class="th-content">퇴직사유</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="text-center resizable">
              <div class="th-content">4대보험</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="text-center resizable">
              <div class="th-content">퇴직연금</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="resizable">
              <div class="th-content">계좌번호</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="resizable">
              <div class="th-content">연락처</div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('status')" class="sortable resizable">
              <div class="th-content">상태 <i v-if="sortKey==='status'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="text-center">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="member in pagedMembers" :key="member.idx" :class="['data-row', { 'is-resigned': member.status == 1 }]">
            <td>{{ member.id }}</td>
            <td class="cell-ellipsis" :title="member.siteName">{{ member.siteName }}</td>
            <td class="member-name" @click="goToDetail(member.id)">{{ member.name }}</td>
            <!--td class="member-name"
                :class="[memoIndicatorClass(member, 'name') ? 'has-memo' : '']"
                @click="goToDetail(member.id)"
                @contextmenu="onCellContextMenu($event, member, 'name')">
              {{ member.name }}
              <span v-if="hasMemo(member, 'name')"
                    class="memo-dot" :class="memoIndicatorClass(member, 'name')"
                    :title="`메모 ${memoCount(member, 'name')}건`"></span>
            </td-->
            <td>{{ member.position }}</td>

            <td :class="{ 'contract-danger': getContractDaysLeft(member.contract) !== null && getContractDaysLeft(member.contract) < 60 }">
              <span v-if="member.contract" class="tooltip-container">
                {{ member.contract }}
                <span
                    v-if="
                      getContractDaysLeft(member.contract) !== null
                      && getContractDaysLeft(member.contract) < 60"
                    class="tooltip-text"
                >
                  {{ getContractDaysLeft(member.contract) < 0
                    ? `계약 만료 (${Math.abs(getContractDaysLeft(member.contract))}일 경과)`
                    : `만료 ${getContractDaysLeft(member.contract)}일 전` }}
                </span>
              </span>
              <span v-else class="text-gray">-</span>
            </td>
            <td>{{ member.gender === 'M' ? '남' : '여' }}</td>
            <td
                :class="{ 'age-warning': calculateAge(member.birthDt) >= ageLimits.employment }"
                :title="calculateAge(member.birthDt) >= ageLimits.employment ? '고용보험 가입 제외 대상 (만 65세 이상)' : ''">
              {{ calculateAge(member.birthDt) ? calculateAge(member.birthDt) + '세' : '-' }}
            </td>
            <td>{{ displayRRN(member) }}</td>
            <td>
                <span v-if="member.foreigner === 'Y' || member.foreigner === true"
                      class="badge badge-foreigner tooltip-container">
                  <i class="mdi mdi-earth"></i> 외국인
                  <span v-if="getMonthsDiff(member.visa_date) <= 5" class="warning-dot">
                    <i class="mdi mdi-alert"></i>
                  </span>
                  <span class="tooltip-text">
                    <strong>국적:</strong> {{ member.nationality || '-' }}<br>
                    <strong>비자:</strong> {{ member.visa_code || '-' }}<br>
                    <span :class="{ 'text-warning-red': getMonthsDiff(member.visa_date) <= 5 }">
                      <strong>만료일:</strong> {{ member.visa_date || '-' }}
                      <em v-if="getMonthsDiff(member.visa_date) <= 5"> (임박!)</em>
                    </span>
                  </span>
                </span>
              <span v-else class="text-gray">내국인</span>
            </td>
            <td>
                <span v-if="member.disability === 'Y' || member.disability === true"
                      class="badge tooltip-container"
                      :style="getDisabilityStyle(member.disability_grade)">
                  <i class="mdi mdi-wheelchair-accessibility"></i> 장애
                  <span class="tooltip-text">
                    <strong>등급:</strong> {{ member.disability_grade || '-' }}<br>
                    <strong>판정일:</strong> {{ member.disability_date || '-' }}
                  </span>
                </span>
              <span v-else class="text-gray">-</span>
            </td>
            <td
                class="cursor-pointer"
                :class="member.inYn == 'N' ? 'contract-warning':''"
                @click="updateFourInsStatus(member, 'inYn')"
            >
              <template v-if="member.transferDate !== member.inDate">
                {{ member.transferDate }}<br>
              </template>
              {{ formatDate(member.inDate) }}
            </td>
            <td class="cursor-pointer"
                :class="member.outYn == 'N' ? 'contract-warning': ''" @click="updateFourInsStatus(member, 'outYn')">
              {{ formatDate(member.outDate) }}
            </td>
            <td>{{member.outReason}}</td>
            <td class="text-center">
              <i v-if="member.four_ins === 'Y' || member.four_ins === true" class="mdi mdi-check-circle check-icon"></i>
              <i v-else class="mdi mdi-close-circle uncheck-icon"></i>
            </td>
            <td class="text-center">
              <i v-if="member.retire_pension === 'Y' || member.retire_pension === true" class="mdi mdi-check-circle check-icon"></i>
              <i v-else class="mdi mdi-close-circle uncheck-icon"></i>
            </td>
            <td>
              <div v-if="member.accountNumber" class="account-info">
                <span class="bank-badge">{{ member.bank }}</span>
                <span class="account-number">{{ member.accountNumber }}</span>
              </div>
              <span v-else class="text-gray">-</span>
            </td>
            <td>{{member.phone}}</td>
            <!--td :class="[memoIndicatorClass(member, 'phone') ? 'has-memo' : '']"
                @contextmenu="onCellContextMenu($event, member, 'phone')">
              {{member.phone}}
              <span v-if="hasMemo(member, 'phone')"
                    class="memo-dot" :class="memoIndicatorClass(member, 'phone')"
                    :title="`메모 ${memoCount(member, 'phone')}건`"></span>
            </td-->
            <td>
                <span :class="['status-badge',
                  member.status == 0 ? 'status-active' :
                  member.status == 1 ? 'status-inactive':'status-preparing']">
                  <i :class="[
                      'mdi',
                      member.status == 0 ? 'mdi-check-circle' :
                      member.status == 1 ? 'mdi-close-circle' :
                      member.status == 2 ? 'mdi-calendar-check' : 'mdi-swap-horizontal'
                  ]"></i>
                  {{ member.status == 0 ? '재직': member.status == 1 ? '퇴사' : member.status == 2 ? '일용직': '대근' }}
                </span>
            </td>
            <td class="text-center">
              <div style="display: flex;gap:4px;">
                <button @click="goToDetail(member.id)" class="btn-detail">
                  <i class="mdi mdi-eye"></i><span>상세</span>
                </button>
                <button @click="goRemove(member.id)" class="btn-remove-cost">
                  <i class="mdi mdi-close"></i>
                </button>
              </div>
            </td>
          </tr>

          <tr v-if="filteredMembers.length === 0" class="empty-row">
            <td colspan="15">
              <div class="empty-state">
                <i class="mdi mdi-account-off-outline"></i>
                <p>검색된 직원이 없습니다</p>
                <span>다른 조건으로 검색해보세요</span>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <div v-if="contextMenu.visible" class="cell-context-menu"
           :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }" @click.stop>
        <div class="context-menu-title">{{ memoColLabelMap[contextMenu.colName] }}</div>
        <button @click="openMemoPanel">
          <i class="mdi mdi-note-plus-outline"></i>
          메모 {{ hasMemo(contextMenu.member, contextMenu.colName) ? `보기/추가 (${memoCount(contextMenu.member, contextMenu.colName)})` : '추가' }}
        </button>
      </div>

      <!-- 메모 리스트 + 입력 패널 -->
      <div v-if="memoPanel.visible" class="memo-panel"
           :style="{ top: memoPanel.y + 'px', left: memoPanel.x + 'px' }" @click.stop>
        <div class="memo-panel-header">
          <span>{{ memoColLabelMap[memoPanel.colName] }} 메모</span>
          <i class="mdi mdi-close" @click="closeMemoPanel"></i>
        </div>

        <div class="memo-list" v-if="getMemoList(memoPanel.member, memoPanel.colName).length">
          <div v-for="m in getMemoList(memoPanel.member, memoPanel.colName)" :key="m.id" class="memo-item">
            <span class="memo-type-badge" :style="{ color: getMemoTypeInfo(m.type).color, borderColor: getMemoTypeInfo(m.type).color }">
              {{ getMemoTypeInfo(m.type).itemNm }}
            </span>
            <div class="memo-item-body">
              <p>{{ m.text }}</p>
              <span class="memo-date">{{ m.date }}</span>
            </div>
            <i class="mdi mdi-close memo-item-remove" @click="removeMemo(memoPanel.member, memoPanel.colName, m.id)"></i>
          </div>
        </div>
        <div v-else class="memo-empty">등록된 메모가 없습니다</div>

        <div class="memo-add-row">
          <div class="memo-type-select">
            <label v-for="opt in memoTypeOptions" :key="opt.itemCd"
                   class="memo-type-radio" :class="{ active: memoPanel.newType === opt.itemCd }"
                   :style="memoPanel.newType === opt.itemCd ? { borderColor: opt.color, color: opt.color } : {}">
              <input type="radio" :value="opt.itemCd" v-model="memoPanel.newType" style="display:none;">
              {{ opt.itemNm }}
            </label>
          </div>
          <textarea
              v-model="memoPanel.newText"
              rows="2"
              placeholder="메모 입력 후 추가"
              @keydown.enter.exact.prevent="addMemo"
          ></textarea>
          <button class="btn-memo-add" @click="addMemo"><i class="mdi mdi-plus"></i> 추가</button>
        </div>
      </div>

      <Pagination
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalCount="filteredMembers.length"
          @change="handlePageChange"
      />

    </div>
  </div>

  <ExcelDownloadModal
      v-model="showExcelModal"
      :members="filteredMembers"
  />
</template>

<style scoped>
/* =========================================
   기본 공통 및 헤더
========================================= */
.page-size-select {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-sub);
}

/* === 필터 패널 (Grid 레이아웃 적용) === */
.filter-panel {
  background: var(--bg-surface);
  border-radius: 12px;
  padding: 24px;
  margin-bottom: 24px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
}

/* 핵심 수정: 4칸(1fr) 2줄로 강제 분할 */
.filter-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px 10px; /* 위아래 간격 20px, 좌우 간격 16px */
  align-items: flex-end;
  margin-bottom: 20px;
}

.filter-group {
  display: flex; flex-direction: column; gap: 8px;
  min-width: 0; /* 그리드 안에서 영역 밖으로 삐져나가는 것 방지 */
  width: 100%;
}

.filter-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; font-weight: 600; color: var(--text-sub);
}
.filter-label i { font-size: 16px; color: var(--primary); }

.filter-select {
  width: 100%; /* 셀렉트 박스 꽉 채우기 */
  padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px;
  font-size: 13px; color: var(--text-main); background: var(--bg-surface); cursor: pointer;
  transition: all 0.2s; height: 42px; box-sizing: border-box;
}

.filter-select:hover { border-color: var(--border-focus); }
.filter-select:focus {
  outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft);
}

/* 검색 그룹 - 남은 2칸을 넓게 차지하며 오른쪽 정렬 */
.search-group {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  align-items: flex-end;
}

.search-box {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px; background: var(--bg-canvas);
  border: 1px solid var(--border-color); border-radius: 8px;
  width: 100%; max-width: 340px; /* 검색창이 너무 비대해지는 것 제한 */
  height: 42px; box-sizing: border-box; transition: all 0.2s;
}

.search-box:focus-within {
  background: var(--bg-surface); border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft);
}
.search-box i { font-size: 20px; color: var(--text-sub); }

.search-input {
  flex: 1; border: none; background: transparent; font-size: 13px; color: var(--text-main); outline: none;
}
.search-input::placeholder { color: var(--text-sub); opacity: 0.7; }
.search-clear {
  background: none; border: none; color: var(--text-sub); cursor: pointer;
  padding: 4px; border-radius: 4px; transition: all 0.2s; display: flex; align-items: center;
}
.search-clear:hover { background: var(--border-color); color: var(--text-main); }


/* 입사 기간 (Date) 인풋 최적화 */
.date-range-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
.date-input {
  flex: 1; /* 날짜 인풋이 부모 너비에 맞춰 유동적으로 꽉 참 */
  min-width: 0;
  cursor: pointer;
}
.date-separator {
  color: var(--text-sub);
  font-weight: bold;
  flex-shrink: 0;
}


/* =========================================
   테이블 및 상태 아이콘
========================================= */
.table-scroll-container {
  overflow-x: auto;
  overflow-y: visible;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: var(--bg-hover); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: var(--text-sub); }

.th-content { display: flex; align-items: center; gap: 4px; }

.member-name {
  font-weight: 600;
  color: var(--primary);
  cursor: pointer;
}
.member-name:hover { text-decoration: underline; }

.age-warning { color: var(--danger) !important; font-weight: 600; }

.check-icon   { font-size: 18px; color: var(--success); }
.uncheck-icon { font-size: 18px; color: var(--text-muted); }

.warning-dot {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; background: var(--danger);
  color: var(--text-inverse); border-radius: 50%; margin-left: 4px;
}
.warning-dot i { font-size: 9px; }
.text-warning-red { color: var(--danger) !important; font-weight: 600; }

.account-info { display: flex; align-items: center; gap: 8px; }
.bank-badge {
  padding: 2px 7px; background: var(--bg-canvas); border-radius: 4px; border: 1px solid var(--border-color);
  font-size: 11px; font-weight: 600; color: var(--text-sub); white-space: nowrap;
}
.account-number { font-size: 12px; color: var(--text-main); }

.btn-rrn-toggle {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 600;
  border: 1px solid var(--border-color); background: var(--bg-surface);
  color: var(--text-sub); cursor: pointer; transition: .2s;
}
.btn-rrn-toggle:hover { border-color: var(--warning); color: var(--warning); }
.btn-rrn-toggle.active { background: rgba(245,158,11,.1); border-color: var(--warning); color: #b45309; }
.btn-rrn-toggle:disabled { opacity: 0.6; cursor: not-allowed; }

.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
}
.status-active   { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-inactive { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }
.status-preparing { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }

.loading-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 0; color: var(--text-sub); gap: 16px;
}
.spinner {
  width: 32px; height: 32px; border: 3px solid var(--border-color);
  border-top-color: var(--primary); border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

.error-state {
  display: flex; align-items: center; gap: 8px; padding: 20px;
  background: rgba(239, 68, 68, 0.1); color: var(--danger); border-radius: 12px;
  margin-bottom: 24px; font-weight: 600;
}

.resizable {
  position: relative;
  overflow: hidden;
}
.resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 2px;
  height: 100%;
  cursor: col-resize;
  z-index: 1;
  user-select: none;
}
.resize-handle:hover,
.is-resizing .resize-handle {
  background: var(--primary);
  opacity: 0.5;
}

.col-site {
  min-width: 80px;
  max-width: 160px;
  width: 120px;
}
.cell-ellipsis {
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.btn-remove-cost {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--danger);
  border: none; color: var(--text-inverse);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.contract-warning {
  background-color: rgba(245, 158, 11, 0.12) !important;
  color: #b45309;
  font-weight: 600;
}

.contract-danger {
  background-color: rgba(239, 68, 68, 0.12);
  color: var(--danger);
  font-weight: 600;
}

/* =========================================
   반응형 (Media Queries)
========================================= */
@media (max-width: 1200px) {
  /* 화면이 살짝 작아지면 3칸 배치로 변경 */
  .filter-row { grid-template-columns: repeat(3, 1fr); }
  .search-group { grid-column: span 3; justify-content: flex-start; }
  .search-box { max-width: 100%; }
}

@media (max-width: 768px) {
  /* 태블릿/모바일에서는 모두 1줄로 세로 배치 */
  .filter-row { grid-template-columns: 1fr; gap: 12px; }
  .search-group { grid-column: span 1; flex-direction: row; }
  .search-box { max-width: 100%; flex: 1; }
  .btn-search { flex-shrink: 0; }

  .filter-toggles-row { flex-direction: column; align-items: flex-start; gap: 10px; }
  .filter-toggles { flex-wrap: wrap; }
  .btn-rrn-toggle,.btn-excel {
    flex: 1;
    justify-content: center;
  }
}

/* 퇴사자 행 아주 연한 붉은 배경 */
.data-table tbody tr.is-resigned {
  background-color: rgba(239, 68, 68, 0.02);
}

/* 첫 번째 셀(ID) 좌측에 붉은색 포인트 바 생성 */
.data-table tbody tr.is-resigned td:first-child {
  border-left: 4px solid var(--danger, #ef4444);
}

/* 퇴사자 텍스트 살짝 흐리게 */
.data-table tbody tr.is-resigned td {
  color: var(--text-sub);
}
/* 메모 인디케이터 */
.has-memo { position: relative; }
.memo-dot {
  position: absolute; top: 2px; right: 2px;
  width: 0; height: 0; border-style: solid; border-width: 0 7px 7px 0;
  cursor: help;
}
.memo-dot-important { border-color: transparent var(--danger, #ef4444) transparent transparent; }
.memo-dot-normal    { border-color: transparent var(--text-sub, #94a3b8) transparent transparent; }

/* 컨텍스트 메뉴 */
.cell-context-menu {
  position: fixed; z-index: 1000;
  background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px;
  box-shadow: var(--shadow-md); min-width: 170px; padding: 6px;
}
.context-menu-title {
  padding: 6px 10px 4px; font-size: 11px; color: var(--text-sub); font-weight: 600;
  border-bottom: 1px solid var(--border-color); margin-bottom: 4px;
}
.cell-context-menu button {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 10px;
  background: none; border: none; border-radius: 6px; font-size: 13px; color: var(--text-main);
  cursor: pointer; text-align: left;
}
.cell-context-menu button:hover { background: var(--bg-hover); }

/* 메모 패널 */
.memo-panel {
  position: fixed; z-index: 1001; width: 280px;
  background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 10px;
  box-shadow: var(--shadow-md); padding: 12px;
}
.memo-panel-header {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; font-weight: 700; color: var(--text-main); margin-bottom: 8px;
}
.memo-panel-header i { cursor: pointer; color: var(--text-sub); }

.memo-list { max-height: 160px; overflow-y: auto; margin-bottom: 10px; display: flex; flex-direction: column; gap: 6px; }
.memo-item { display: flex; align-items: flex-start; gap: 6px; padding: 6px; background: var(--bg-canvas); border-radius: 6px; }
.memo-type-badge {
  flex-shrink: 0; font-size: 10px; font-weight: 700; padding: 2px 6px;
  border: 1px solid; border-radius: 4px; white-space: nowrap;
}
.memo-item-body { flex: 1; min-width: 0; }
.memo-item-body p { margin: 0; font-size: 12px; color: var(--text-main); word-break: break-word; }
.memo-date { font-size: 10px; color: var(--text-sub); }
.memo-item-remove { font-size: 14px; color: var(--text-sub); cursor: pointer; flex-shrink: 0; }
.memo-item-remove:hover { color: var(--danger); }
.memo-empty { font-size: 12px; color: var(--text-sub); text-align: center; padding: 12px 0; }

.memo-add-row { border-top: 1px solid var(--border-color); padding-top: 8px; }
.memo-type-select { display: flex; gap: 6px; margin-bottom: 6px; }
.memo-type-radio {
  font-size: 11px; font-weight: 600; padding: 3px 10px; border: 1px solid var(--border-color);
  border-radius: 12px; cursor: pointer; color: var(--text-sub);
}
.memo-add-row textarea {
  width: 100%; box-sizing: border-box; resize: vertical;
  border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px;
  font-size: 12px; outline: none; margin-bottom: 6px;
}
.memo-add-row textarea:focus { border-color: var(--primary); }
.btn-memo-add {
  width: 100%; padding: 6px; border-radius: 6px; border: none;
  background: var(--primary); color: var(--text-inverse); font-size: 12px; font-weight: 600; cursor: pointer;
}
</style>
