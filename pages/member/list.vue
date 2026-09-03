<script setup>
import { ref, computed, onMounted, onActivated, watch, onBeforeUnmount } from 'vue';
import axios from 'axios';
import { useRouter, useRoute } from 'nuxt/app';
import Pagination from '@/components/common/Pagination.vue'
import SiteSelect from "~/components/SiteSelect.vue";
import DataTable from "~/components/common/DataTable.vue";
import { useCellMemo } from '@/composables/useCellMemo';
import ExcelDownloadModal from "@/components/Exceldownloadmodal.vue";
import CellMemoPanel from '@/components/CellMemoPanel.vue';
import FilterSearchGroup from '~/components/common/FilterSearchGroup.vue';

const router = useRouter();
const route = useRoute();
const { siteOptions, typeOptions, disabledOptions, fetchSiteOptions, fetchTypeOptions, fetchDisabledOptions } = useApi();

const searchTerm       = ref('');
const selectedSite     = ref('전체');
const selectedType     = ref('전체');
const selectedStatus   = ref('전체');
const selectedGender   = ref('전체');
const selectedPaymentDay = ref('전체');

const filterContractDate = ref(false);
const filterStartDate    = ref('');
const filterEndDate      = ref('');
const filterNoPension    = ref(false);
const filterNoEmployment = ref(false);
const filterDisability   = ref(false);
const filterForeigner    = ref(false);
const filterActive       = ref(false);

const sortKey   = ref('');
const sortOrder = ref('asc');

const members   = ref([]);
const memoColLabelMap = {
  id: '사번', siteName: '현장', name: '이름', position: '직책', contract: '근로계약 만료일',
  gender: '성별', birthDt: '나이', rrn: '주민번호', foreigner: '내/외국인', disability: '장애여부',
  inDate: '입사일', outDate: '퇴사일', outReason: '퇴직사유',
  four_ins: '4대보험', retire_pension: '퇴직연금',
  accountNumber: '계좌번호', phone: '연락처', status: '상태'
};

const memberColumns = [
  { key: 'id', label: '사번', visible: true, sortable: true, width: '4%', align: 'center' },
  { key: 'siteName', label: '현장', visible: true, sortable: true, width: '*' },
  { key: 'name', label: '이름', visible: true, sortable: true, width: '5%' },
  { key: 'position', label: '직책', visible: true, sortable: true, width: '4%' },
  { key: 'contract', label: '근로계약 만료일', visible: true, sortable: true, width: '6%' },
  { key: 'gender', label: '성별', visible: true, sortable: true, width: '3%', align: 'center' },
  { key: 'birthDt', label: '나이', visible: true, sortable: true, width: '4%', align: 'center' },
  { key: 'rrn', label: '주민번호', visible: true, sortable: false, width: '8%', align: 'center' },
  { key: 'foreigner', label: '내/외국인', visible: true, sortable: false, width: '5%', align: 'center' },
  { key: 'disability', label: '장애여부', visible: true, sortable: false, width: '5%', align: 'center' },
  { key: 'inDate', label: '입사일', visible: true, sortable: true, width: '6%', align: 'center' },
  { key: 'outDate', label: '퇴사일', visible: true, sortable: true, width: '6%', align: 'center' },
  { key: 'outReason', label: '퇴직사유', visible: true, sortable: false, width: '6%' },
  { key: 'four_ins', label: '4대보험', visible: true, sortable: false, width: '4%', align: 'center' },
  { key: 'retire_pension', label: '퇴직연금', visible: true, sortable: false, width: '4%', align: 'center' },
  { key: 'accountNumber', label: '계좌번호', visible: true, sortable: false, width: '10%' },
  { key: 'phone', label: '연락처', visible: true, sortable: false, width: '8%' },
  { key: 'status', label: '상태', visible: true, sortable: true, width: '5%', align: 'center' },
  { key: 'actions', label: '관리', visible: true, sortable: false, width: '5%', align: 'center' }
];

const {
  panel: memoPanel, getMemo, hasMemo, dotClass, label: memoLabel,
  openPanel: onCellContextMenu, closePanel: closeMemoPanel, save: addMemo, remove: removeMemo,
} = useCellMemo('member', memoColLabelMap);

const handleGlobalClick = () => {
  if (memoPanel.value.visible) closeMemoPanel();
};

const handleCellContextMenu = (event, item, colKey) => {
  if (colKey === 'actions') return;
  onCellContextMenu(event, item, colKey);
};

const isLoading = ref(false);
const error     = ref(null);
const showRRN      = ref(false);
const revealedRRNs = ref({});
const rrnLoading   = ref(false);
const showExcelModal = ref(false);

const currentPage     = ref(1);
const pageSize        = ref(50);
const pageSizeOptions = [50, 100, 200, 500];

const ageLimits = ref({ pension: 0, employment: 0 });

const paymentDayOptions = computed(() => {
  const days = new Set(
      members.value.map(m => m.payment_day).filter(d => d !== null && d !== undefined && String(d).trim() !== '')
  );
  return Array.from(days).sort((a, b) => {
    const numA = Number(a); const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
    return String(a).localeCompare(String(b), 'ko');
  });
});

const currentSiteContractCount = computed(() => {
  if (selectedSite.value === '전체' || !selectedSite.value) return null;
  const foundSite = siteOptions.value.find(s => String(s.idx) === String(selectedSite.value));
  if (!foundSite || !foundSite.contracts || foundSite.contracts.length === 0) return null;

  const formatList = foundSite.contracts
      .filter(c => c.staffCount > 0)
      .map(c => {
        const activeStaffCount = members.value.filter(
            m => String(m.sIdx) === String(selectedSite.value) && String(m.status) === '0' && m.type === c.typeNm
        ).length;
        const missingCount = c.staffCount - activeStaffCount;
        let missingText = '';
        if (missingCount > 0) missingText = `공백 ${missingCount}명`;
        else if (missingCount < 0) missingText = `초과 ${Math.abs(missingCount)}명`;
        else missingText = `충원완료`;
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
  const newValue = m[colName] === 'Y' ? 'N' : 'Y';
  const label = colName === 'inYn' ? '취득신고' : '상실신고';
  if (!await window.customConfirm(`${m.name} 직원의 4대보험 ${label} 여부를 변경하시겠습니까?`)) return;
  let payload = { colName: colName, status: newValue };
  try {
    const res = await axios.put(`/api/v1/member/status/four/ins/${m.idx}`, payload);
    if (res.data.result) m[colName] = newValue;
    else window.customAlert('상태 변경에 실패했습니다.','error');
  } catch (error) {
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
    if (!res.data.result) { window.customAlert('주민번호 조회 권한이 없습니다.','error'); return; }
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
    return clean.length === 13 ? `${clean.substring(0, 6)}-${clean.substring(6)}` : revealedRRNs.value[member.idx];
  }
  return member.rrn;
};

const toggleSort = (key) => {
  if (sortKey.value === key) sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  else { sortKey.value = key; sortOrder.value = 'asc'; }
  currentPage.value = 1;
};

const resetFilters = () => {
  searchTerm.value = ''; selectedSite.value = '전체'; selectedType.value = '전체';
  selectedStatus.value = '전체'; selectedGender.value = '전체'; selectedPaymentDay.value = '전체';
  filterContractDate.value = false; filterStartDate.value = ''; filterEndDate.value = '';
  filterNoPension.value = false; filterNoEmployment.value = false; filterDisability.value = false;
  filterForeigner.value = false; filterActive.value = false; currentPage.value = 1;
  sortKey.value = ''; sortOrder.value = 'asc'; pageSize.value = 50;
};

const syncFiltersFromURL = () => {
  const q = route.query;
  if (q.search)       searchTerm.value = q.search;
  if (q.site)         selectedSite.value = q.site;
  if (q.type)         selectedType.value = q.type;
  if (q.status)       selectedStatus.value = q.status;
  if (q.gender)       selectedGender.value = q.gender;
  if (q.paymentDay)   selectedPaymentDay.value = q.paymentDay;
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

watch(
    [searchTerm, selectedSite, selectedType, selectedStatus, selectedGender, selectedPaymentDay,
      filterContractDate, filterStartDate, filterEndDate, filterNoPension, filterNoEmployment,
      filterDisability, filterForeigner, currentPage, pageSize, sortKey, sortOrder],
    () => {
      const query = {};
      if (searchTerm.value)                query.search = searchTerm.value;
      if (selectedSite.value !== '전체')   query.site = selectedSite.value;
      if (selectedType.value !== '전체')   query.type = selectedType.value;
      if (selectedStatus.value !== '전체') query.status = selectedStatus.value;
      if (selectedGender.value !== '전체') query.gender = selectedGender.value;
      if (selectedPaymentDay.value !== '전체') query.paymentDay = selectedPaymentDay.value;
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

const filteredMembers = computed(() => {
  let result = members.value.filter(member => {
    const siteMatch   = selectedSite.value === '전체' || String(member.sIdx) === String(selectedSite.value);
    const searchMatch = member.name.toLowerCase().includes(searchTerm.value.toLowerCase());
    const typeMatch   = selectedType.value === '전체' || member.type === selectedType.value;
    const paymentDayMatch = selectedPaymentDay.value === '전체' || String(member.payment_day) === String(selectedPaymentDay.value);
    const dateMatch = (!filterEndDate.value || (member.inDate && member.inDate <= filterEndDate.value)) &&
        (!filterStartDate.value || !member.outDate || member.outDate >= filterStartDate.value);
    const pensionMatch    = !filterNoPension.value    || calculateAge(member.birthDt) >= ageLimits.value.pension;
    const employmentMatch = !filterNoEmployment.value || calculateAge(member.birthDt) >= ageLimits.value.employment;
    const disaMatch   = !filterDisability.value || member.disability === 'Y' || member.disability === true;
    const foreMatch   = !filterForeigner.value  || member.foreigner  === 'Y' || member.foreigner  === true;
    const activeMatch = selectedStatus.value === '전체' || member.status == selectedStatus.value;
    const genderMatch = selectedGender.value === '전체' || member.gender == selectedGender.value;
    const contractMatch = !filterContractDate.value || !member.contract || member.contract === '';
    currentPage.value = 1;
    return siteMatch && searchMatch && typeMatch && paymentDayMatch &&
        dateMatch && pensionMatch && employmentMatch &&
        disaMatch && foreMatch && activeMatch && genderMatch && contractMatch;
  });

  result.sort((a, b) => {
    if (sortKey.value) {
      const mod = sortOrder.value === 'asc' ? 1 : -1;
      const valA = a[sortKey.value] ?? ''; const valB = b[sortKey.value] ?? '';
      if (sortKey.value === 'birthDt') return valB.localeCompare(valA) * mod;
      if (typeof valA === 'string' && typeof valB === 'string') {
        const cmp = valA.localeCompare(valB, 'ko');
        if (cmp !== 0) return cmp * mod;
      } else {
        if (valA < valB) return -1 * mod;
        if (valA > valB) return 1 * mod;
      }
      return 0;
    }

    if (a.sIdx !== b.sIdx) return Number(b.sIdx) - Number(a.sIdx);

    const isRetireA = a.status == 1; const isRetireB = b.status == 1;
    if (isRetireA && !isRetireB) return 1;
    if (!isRetireA && isRetireB) return -1;

    if (isRetireA && isRetireB) {
      const dateA = a.outDate || ''; const dateB = b.outDate || '';
      if (dateA !== dateB) return dateB.localeCompare(dateA);
    }

    const cdA = String(a.itemCd || ''); const cdB = String(b.itemCd || '');
    if (cdA !== cdB) return cdA.localeCompare(cdB);

    return Number(a.idx) - Number(b.idx);
  });
  return result;
});

const statsInfo = computed(() => ({
  total:      filteredMembers.value.length,
  active:     filteredMembers.value.filter(m => m.status == 0).length,
  noPension:  filteredMembers.value.filter(m => calculateAge(m.birthDt) >= 60).length,
  noEmployment: filteredMembers.value.filter(m => calculateAge(m.birthDt) >= 65).length,
  disability: filteredMembers.value.filter(m => m.disability === 'Y' || m.disability === true).length,
  foreigner:  filteredMembers.value.filter(m => m.foreigner  === 'Y' || m.foreigner  === true).length,
}));

const pagedMembers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredMembers.value.slice(start, start + pageSize.value);
});

const handlePageChange = () => { document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
const onFilterChange = () => { currentPage.value = 1; };

const getDisabilityStyle = (grade) => {
  const opt = disabledOptions.value.find(o => o.itemNm == grade);
  return { backgroundColor: opt?.option || 'var(--bg-hover)', color: 'var(--bg-surface)', border: 'none' };
};

const getContractDaysLeft = (contractDate) => {
  if (!contractDate) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(contractDate); end.setHours(0, 0, 0, 0);
  return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
};

const goToRegister = () => { router.push({ path: '/member/register', query: route.query }); };
const goToDetail = (id) => window.open(router.resolve(`/member/${id}`).href, "_blank", "width=1200,height=800");
const goRemove = async (id) => {
  if (!await window.customConfirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
  try {
    await axios.put(`/api/v1/member/${id}`);
    window.alert('삭제되었습니다.');
    await fetchMembers();
  } catch (error) {
    window.customAlert('삭제에 실패했습니다.','error');
  }
}

const getTableRowClass = (member) => {
  return member.status == 1 ? 'is-resigned' : '';
};
const getTableCellClass = (item, colKey) => {
  let cls = '';
  if (colKey === 'contract' && getContractDaysLeft(item.contract) !== null && getContractDaysLeft(item.contract) < 60) {
    cls += 'contract-danger ';
  }
  if (colKey === 'inDate' && item.inYn == 'N') cls += 'contract-warning ';
  if (colKey === 'outDate' && item.outYn == 'N') cls += 'contract-warning ';
  if (dotClass(item, colKey)) cls += 'has-memo ';
  return cls;
};

onMounted(async () => {
  syncFiltersFromURL();
  await Promise.all([ fetchSiteOptions(), fetchTypeOptions(), fetchDisabledOptions(), fetchOverAgeOption() ]);
  await fetchMembers();
  window.addEventListener('click', handleGlobalClick);
});

onBeforeUnmount(() => { window.removeEventListener('click', handleGlobalClick); });
onActivated(async () => { await fetchMembers(); });
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
          <label class="filter-label">근무 현장</label>
          <SiteSelect v-model="selectedSite" :width="'100%'" />
        </div>
        <div class="filter-group">
          <label class="filter-label">급여일</label>
          <select v-model="selectedPaymentDay" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option v-for="day in paymentDayOptions" :key="day" :value="day">{{ day }}{{ isNaN(day) ? '' : '일' }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">구분</label>
          <select v-model="selectedType" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemNm">{{ opt.itemNm }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">재직 상태</label>
          <select v-model="selectedStatus" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option value="0">재직</option>
            <option value="1">퇴사</option>
            <option value="2">일용직</option>
            <option value="3">대근</option>
            <option value="4">휴직</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label">재직 기간 조회</label>
          <div class="date-range-inputs">
            <input type="date" v-model="filterStartDate" @change="onFilterChange" class="filter-select date-input" max="9999-12-31" />
            <span class="date-separator">~</span>
            <input type="date" v-model="filterEndDate" @change="onFilterChange" class="filter-select date-input" max="9999-12-31" />
          </div>
        </div>
        <div class="filter-group">
          <label class="filter-label">성별</label>
          <select v-model="selectedGender" @change="onFilterChange" class="filter-select" >
            <option value="전체">전체</option>
            <option value="M">남성</option>
            <option value="F">여성</option>
          </select>
        </div>
        <FilterSearchGroup
            v-model="searchTerm"
            placeholder="이름으로 검색..."
            @search="onFilterChange"
            @reset="resetFilters"
        />
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
            <i class="mdi mdi-account-alert"></i><span>근로계약 만료일 공백</span>
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
          <span v-if="currentSiteContractCount !== null" style="font-size: 14px; font-weight: 600; color: var(--text-sub);">
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

      <DataTable
          :items="pagedMembers"
          :columns="memberColumns"
          :sortKey="sortKey"
          :sortOrder="sortOrder"
          itemKey="idx"
          :rowClass="getTableRowClass"
          :cellClass="getTableCellClass"
          @update:sort="toggleSort"
          @cell-contextmenu="handleCellContextMenu"
      >
        <template #cell-id="{ item }">
          <span>{{ item.id }}</span>
        </template>

        <template #cell-siteName="{ item }">
          <div class="cell-ellipsis" :title="item.siteName">{{ item.siteName }}</div>
        </template>

        <template #cell-name="{ item }">
          <span class="member-name" @click="goToDetail(item.id)">{{ item.name }}</span>
        </template>

        <template #cell-position="{ item }">
          <span>{{ item.position }}</span>
        </template>

        <template #cell-contract="{ item }">
          <span v-if="item.contract" class="tooltip-container">
            {{ item.contract }}
            <span v-if="getContractDaysLeft(item.contract) !== null && getContractDaysLeft(item.contract) < 60" class="tooltip-text">
              {{ getContractDaysLeft(item.contract) < 0 ? `계약 만료 (${Math.abs(getContractDaysLeft(item.contract))}일 경과)` : `만료 ${getContractDaysLeft(item.contract)}일 전` }}
            </span>
          </span>
          <span v-else class="text-gray">-</span>
        </template>

        <template #cell-gender="{ item }">
          <span>{{ item.gender === 'M' ? '남' : '여' }}</span>
        </template>

        <template #cell-birthDt="{ item }">
          <span :class="{'age-warning': calculateAge(item.birthDt) >= ageLimits.employment}"
                :title="calculateAge(item.birthDt) >= ageLimits.employment ? '고용보험 가입 제외 대상 (만 65세 이상)' : ''">
            {{ calculateAge(item.birthDt) ? calculateAge(item.birthDt) + '세' : '-' }}
          </span>
        </template>

        <template #cell-rrn="{ item }">
          <span>{{ displayRRN(item) }}</span>
        </template>

        <template #cell-foreigner="{ item }">
          <span v-if="item.foreigner === 'Y' || item.foreigner === true" class="badge badge-foreigner tooltip-container">
            <i class="mdi mdi-earth"></i> 외국인
            <span v-if="getMonthsDiff(item.visa_date) <= 5" class="warning-dot"><i class="mdi mdi-alert"></i></span>
            <span class="tooltip-text">
              <strong>국적:</strong> {{ item.nationality || '-' }}<br>
              <strong>비자:</strong> {{ item.visa_code || '-' }}<br>
              <span :class="{ 'text-warning-red': getMonthsDiff(item.visa_date) <= 5 }">
                <strong>만료일:</strong> {{ item.visa_date || '-' }}<em v-if="getMonthsDiff(item.visa_date) <= 5"> (임박!)</em>
              </span>
            </span>
          </span>
          <span v-else class="text-gray">내국인</span>
        </template>

        <template #cell-disability="{ item }">
          <span v-if="item.disability === 'Y' || item.disability === true" class="badge tooltip-container" :style="getDisabilityStyle(item.disability_grade)">
            <i class="mdi mdi-wheelchair-accessibility"></i> 장애
            <span class="tooltip-text">
              <strong>등급:</strong> {{ item.disability_grade || '-' }}<br>
              <strong>판정일:</strong> {{ item.disability_date || '-' }}
            </span>
          </span>
          <span v-else class="text-gray">-</span>
        </template>

        <template #cell-inDate="{ item }">
          <div class="cursor-pointer" @click="updateFourInsStatus(item, 'inYn')">
            <template v-if="item.transferDate !== null">{{ item.transferDate }}<br></template>
            {{ formatDate(item.inDate) }}
          </div>
        </template>

        <template #cell-outDate="{ item }">
          <div class="cursor-pointer" @click="updateFourInsStatus(item, 'outYn')">
            {{ formatDate(item.outDate) }}
          </div>
        </template>

        <template #cell-outReason="{ item }">
          <span>{{ item.outReason }}</span>
        </template>

        <template #cell-four_ins="{ item }">
          <i v-if="item.four_ins === 'Y' || item.four_ins === true" class="mdi mdi-check-circle check-icon"></i>
          <i v-else class="mdi mdi-close-circle uncheck-icon"></i>
        </template>

        <template #cell-retire_pension="{ item }">
          <i v-if="item.retire_pension === 'Y' || item.retire_pension === true" class="mdi mdi-check-circle check-icon"></i>
          <i v-else class="mdi mdi-close-circle uncheck-icon"></i>
        </template>

        <template #cell-accountNumber="{ item }">
          <div v-if="item.accountNumber" class="account-info">
            <span class="bank-badge">{{ item.bank }}</span>
            <span class="account-number">{{ item.accountNumber }}</span>
          </div>
          <span v-else class="text-gray">-</span>
        </template>

        <template #cell-phone="{ item }">
          <span>{{ item.phone }}</span>
        </template>

        <template #cell-status="{ item }">
          <span :class="['status-badge', item.status == 0 ? 'status-active' : item.status == 1 ? 'status-inactive':'status-preparing']">
            <i :class="['mdi', item.status == 0 ? 'mdi-check-circle' : item.status == 1 ? 'mdi-close-circle' : item.status == 2 || item.status == 3 ? 'mdi-calendar-check' : 'mdi-swap-horizontal']"></i>
            {{ item.status == 0 ? '재직': item.status == 1 ? '퇴사' : item.status == 2 ? '일용직' : item.status == 3 ? '대근' : '휴직' }}
          </span>
        </template>

        <template #cell-actions="{ item }">
          <div style="display: flex; gap:4px; justify-content: center;">
            <button @click="goToDetail(item.id)" class="btn-detail"><i class="mdi mdi-eye"></i></button>
            <button @click="goRemove(item.id)" class="btn-remove-cost"><i class="mdi mdi-close"></i></button>
          </div>
        </template>

        <template #cell-append="{ item, colKey }">
          <span v-if="hasMemo(item, colKey)" class="memo-dot" :class="dotClass(item, colKey)"></span>
        </template>

        <template #empty>
          <div class="empty-state">
            <i class="mdi mdi-account-off-outline"></i>
            <p>검색된 직원이 없습니다</p>
            <span>다른 조건으로 검색해보세요</span>
          </div>
        </template>
      </DataTable>

      <CellMemoPanel
          v-bind="memoPanel"
          :title="memoLabel(memoPanel.colName)"
          :has-existing="hasMemo(memoPanel.row, memoPanel.colName)"
          :updated-at="hasMemo(memoPanel.row, memoPanel.colName) ? getMemo(memoPanel.row, memoPanel.colName).regDt : ''"
          @update:text="memoPanel.text = $event"
          @update:type="memoPanel.type = $event"
          @close="closeMemoPanel"
          @save="addMemo"
          @remove="removeMemo"
      />

      <Pagination v-model:currentPage="currentPage" v-model:pageSize="pageSize" :totalCount="filteredMembers.length" @change="handlePageChange" />

    </div>
  </div>

  <ExcelDownloadModal v-model="showExcelModal" :members="filteredMembers" />
</template>

<style scoped>
.page-size-select { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub); }
.filter-panel { background: var(--bg-surface); border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
.filter-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 10px; align-items: flex-end; margin-bottom: 20px; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 0; width: 100%; }
.filter-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-sub); }
.filter-select { width: 100%; padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); cursor: pointer; transition: all 0.2s; height: 42px; box-sizing: border-box; }
.filter-select:hover { border-color: var(--border-focus); }
.filter-select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.search-group { display: flex; gap: 8px; justify-content: flex-end; align-items: flex-end; }
.search-box { display: flex; align-items: center; gap: 10px; padding: 10px 16px; background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 8px; width: 100%; max-width: 340px; height: 42px; box-sizing: border-box; transition: all 0.2s; }
.search-box:focus-within { background: var(--bg-surface); border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.search-box i { font-size: 20px; color: var(--text-sub); }
.search-input { flex: 1; border: none; background: transparent; font-size: 13px; color: var(--text-main); outline: none; }
.search-input::placeholder { color: var(--text-sub); opacity: 0.7; }
.search-clear { background: none; border: none; color: var(--text-sub); cursor: pointer; padding: 4px; border-radius: 4px; transition: all 0.2s; display: flex; align-items: center; }
.search-clear:hover { background: var(--border-color); color: var(--text-main); }
.date-range-inputs { display: flex; align-items: center; gap: 8px; width: 100%; }
.date-input { flex: 1; min-width: 0; cursor: pointer; }
.date-separator { color: var(--text-sub); font-weight: bold; flex-shrink: 0; }
.member-name { font-weight: 600; color: var(--primary); cursor: pointer; }
.member-name:hover { text-decoration: underline; }
.age-warning { color: var(--danger) !important; font-weight: 600; }
.check-icon   { font-size: 18px; color: var(--success); }
.uncheck-icon { font-size: 18px; color: var(--text-muted); }
.warning-dot { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; background: var(--danger); color: var(--text-inverse); border-radius: 50%; margin-left: 4px; }
.warning-dot i { font-size: 9px; }
.text-warning-red { color: var(--danger) !important; font-weight: 600; }
.account-info { display: flex; align-items: center; gap: 8px; }
.bank-badge { padding: 2px 7px; background: var(--bg-canvas); border-radius: 4px; border: 1px solid var(--border-color); font-size: 11px; font-weight: 600; color: var(--text-sub); white-space: nowrap; }
.account-number { font-size: 12px; color: var(--text-main); }
.btn-rrn-toggle { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-sub); cursor: pointer; transition: .2s; }
.btn-rrn-toggle:hover { border-color: var(--warning); color: var(--warning); }
.btn-rrn-toggle.active { background: rgba(245,158,11,.1); border-color: var(--warning); color: #b45309; }
.btn-rrn-toggle:disabled { opacity: 0.6; cursor: not-allowed; }
.status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; }
.status-active   { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-inactive { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }
.status-preparing { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }
.loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 0; color: var(--text-sub); gap: 16px; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.error-state { display: flex; align-items: center; gap: 8px; padding: 20px; background: rgba(239, 68, 68, 0.1); color: var(--danger); border-radius: 12px; margin-bottom: 24px; font-weight: 600; }

.cell-ellipsis {
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

.btn-remove-cost { width: 28px; height: 28px; border-radius: 6px; background: var(--danger); border: none; color: var(--text-inverse); cursor: pointer; display: flex; align-items: center; justify-content: center; }

@media (max-width: 1200px) {
  .filter-row { grid-template-columns: repeat(3, 1fr); }
  .search-group { grid-column: span 3; justify-content: flex-start; }
  .search-box { max-width: 100%; }
}
@media (max-width: 768px) {
  .filter-row { grid-template-columns: 1fr; gap: 12px; }
  .search-group { grid-column: span 1; flex-direction: row; }
  .search-box { max-width: 100%; flex: 1; }
  .btn-search { flex-shrink: 0; }
  .filter-toggles-row { flex-direction: column; align-items: flex-start; gap: 10px; }
  .filter-toggles { flex-wrap: wrap; }
  .btn-rrn-toggle,.btn-excel { flex: 1; justify-content: center; }
}

:deep(.data-row.is-resigned) { background-color: rgba(239, 68, 68, 0.02) !important; }
:deep(.data-row.is-resigned td:first-child) { border-left: 4px solid var(--danger) !important; }
:deep(.data-row.is-resigned td) { color: var(--text-sub) !important; }

:deep(.contract-danger) { background-color: rgba(239, 68, 68, 0.12) !important; color: var(--danger) !important; font-weight: 600; }
:deep(.contract-warning) { background-color: yellow !important; color: var(--warning) !important; font-weight: 600; }

.tooltip-container { position: relative; display: inline-flex; align-items: center; cursor: help; }
.tooltip-text { visibility: hidden; width: max-content; background-color: rgba(15, 23, 42, 0.9); color: #fff; text-align: center; border-radius: 6px; padding: 6px 12px; position: absolute; z-index: 999; bottom: 125%; left: 50%; transform: translateX(-50%); opacity: 0; transition: opacity 0.2s, visibility 0.2s; font-size: 12px; font-weight: 500; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); pointer-events: none; }
.tooltip-text::after { content: ""; position: absolute; top: 100%; left: 50%; margin-left: -5px; border-width: 5px; border-style: solid; border-color: rgba(15, 23, 42, 0.9) transparent transparent transparent; }
.tooltip-container:hover .tooltip-text { visibility: visible; opacity: 1; }

.memo-dot { position: absolute; top: 4px; left: 4px; width: 8px; height: 8px; border-radius: 50%; z-index: 2; }
:deep(.has-memo) { background-color: rgba(250, 204, 21, 0.05); }
</style>