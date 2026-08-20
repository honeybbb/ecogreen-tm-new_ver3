<script setup>
import { ref, computed, onMounted, onActivated } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";
import Pagination from "~/components/Pagination.vue";
import * as XLSX from 'xlsx';
import { useTableResize } from "~/composables/useTableResize.js";

// 공통 모듈
import { useTableColumns } from "~/composables/useTableColumns";
import TableColumnSettingModal from "~/components/TableColumnSettingModal.vue";

const { startResize } = useTableResize();
const router = useRouter();

const {
  typeOptions,
  fetchTypeOptions,
} = useApi();

// 숫자 콤마 포맷용 헬퍼 함수
const formatCurrency = (val) => {
  if (!val || isNaN(val)) return '0';
  return Number(val).toLocaleString();
};

// =============================================
// ★ 1. 컬럼 기본값 세팅 (요청하신 4개 컬럼 추가)
// =============================================
const siteDefaultColumns = [
  { key: 'idx', label: 'ID', visible: true, sortable: true, width: '60px' },
  { key: 'name', label: '현장명', visible: true, sortable: true, width: '15%' },
  { key: 'address', label: '주소', visible: true, sortable: true, width: '25%' },
  { key: 'contract', label: '계약 기간', visible: true, sortable: true, width: '15%' },

  // 신규 추가된 컬럼들
  { key: 'total_cost', label: '월 용역비', visible: true, sortable: true, width: '10%' },
  { key: 'staffCount', label: '배정 인원', visible: true, sortable: true, width: '8%' },
  { key: 'unit_su', label: '세대 수', visible: false, sortable: true, width: '8%' },
  { key: 'building_su', label: '건물 수', visible: false, sortable: true, width: '8%' },

  { key: 'manager', label: '본사 담당자', visible: true, sortable: true, width: '10%' },
  { key: 'manager_phone', label: '본사 연락처', visible: false, sortable: false, width: '10%' },
  { key: 'director', label: '현장 담당자', visible: false, sortable: true, width: '10%' },
  { key: 'director_phone', label: '현장 연락처', visible: false, sortable: false, width: '10%' },
  { key: 'billingManager', label: '청구 담당자', visible: false, sortable: true, width: '10%' },
  { key: 'status', label: '상태', visible: true, sortable: true, width: '8%' }
];

const { columns, isSettingModalOpen, fetchColumns, saveColumns } = useTableColumns('site-list', siteDefaultColumns);

// 상태 및 검색 조건
const searchTerm = ref('');
const selectedPaymentDay = ref('전체');
const selectedStatus = ref('전체');
const selectedStype = ref('전체');
const selectedType = ref('전체');
const selectedVat = ref('전체');
const selectedManager = ref('전체');
const selectedBilling = ref('전체');
const statusOptions = ref(['전체', '운영 중', '준비 중', '계약 종료']);
const sTypeOptions = ref(['전체', '아파트', '주상복합', '오피스텔', '상업 시설', '기타']);
const vatOptions = ref([
  { label: '전체', value: '전체' },
  { label: '과세', value: 'Y' },
  { label: '면세', value: 'N' }
]);
const manager = ref([]);
const billingManager = ref([]);

// ★ 2. 합산 헬퍼 함수 추가
const getTotalCost = (site) => {
  if (!site.contracts || !Array.isArray(site.contracts)) return 0;
  return site.contracts.reduce((sum, c) => sum + (Number(c.total_cost) || 0), 0);
};

const getTotalStaff = (site) => {
  if (!site.contracts || !Array.isArray(site.contracts)) return 0;
  return site.contracts.reduce((sum, c) => sum + (Number(c.staffCount) || 0), 0);
};

// 엑셀 다운로드 (신규 항목 추가 반영)
const downloadExcel = () => {
  if (filteredSites.value.length === 0) {
    alert('다운로드할 데이터가 없습니다.');
    return;
  }

  const excelData = filteredSites.value.map(site => {
    let contractText = '-';
    if (site.contracts && Array.isArray(site.contracts)) {
      contractText = site.contracts
          .filter(c => c?.contract_period)
          .map(c => (c.typeNm ? `[${c.typeNm}] ` : '') + c.contract_period)
          .join(' / ');
    }
    return {
      'ID': site.idx,
      '현장명': site.name,
      '주소': site.address,
      '계약 기간': contractText,
      '월 용역비(원)': getTotalCost(site),
      '배정 인원(명)': getTotalStaff(site),
      '세대 수': site.unit_su || 0,
      '건물 수': site.building_su || 0,
      '본사 담당자': site.manager || '-',
      '본사 연락처': site.manager_phone || '-',
      '현장 담당자': site.director || '-',
      '현장 연락처': site.director_phone || '-',
      '청구 담당자': site.billingManager || '-',
      '상태': site.status
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "현장목록");

  const wscols = [
    { wch: 10 }, { wch: 25 }, { wch: 40 }, { wch: 35 },
    { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
    { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
    { wch: 15 }, { wch: 12 }
  ];
  worksheet['!cols'] = wscols;

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  XLSX.writeFile(workbook, `현장목록_${today}.xlsx`);
};

// 정렬 관련 상태
const sortKey = ref('idx');
const sortOrder = ref('desc'); // 초기정렬은 최신순(내림차순) 권장
const sites = ref([]);
const isLoading = ref(false);

const currentPage = ref(1);
const pageSize    = ref(50);
const pageSizeOptions = [50, 100, 200, 500];

const selectedSiteIds = ref([]);

const selectAll = computed({
  get: () => {
    if (pagedSiteList.value.length === 0) return false;
    return pagedSiteList.value.every(site => selectedSiteIds.value.includes(site.idx));
  },
  set: (val) => {
    if (val) {
      pagedSiteList.value.forEach(site => {
        if (!selectedSiteIds.value.includes(site.idx)) selectedSiteIds.value.push(site.idx);
      });
    } else {
      const currentIds = pagedSiteList.value.map(s => s.idx);
      selectedSiteIds.value = selectedSiteIds.value.filter(id => !currentIds.includes(id));
    }
  }
});

const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

const resetFilters = () => {
  searchTerm.value     = '';
  selectedStatus.value   = '전체';
  selectedStype.value   = '전체';
  selectedType.value   = '전체';
  selectedVat.value = '전체';
  currentPage.value = 1;
  sortKey.value            = 'idx';
  sortOrder.value          = 'desc';
  pageSize.value           = 50;
};

const getContractDates = (site) => {
  let minStart = Infinity;
  let maxEnd = -Infinity;

  if (!site.contracts || !Array.isArray(site.contracts) || site.contracts.length === 0) {
    return { minStart, maxEnd };
  }

  site.contracts.forEach(c => {
    let sDt = c.firstContractDt;
    let eDt = c.endDt;

    if ((!sDt || !eDt) && c.contract_period) {
      const parts = c.contract_period.split('~');
      if (parts.length >= 2) {
        sDt = parts[0].trim().replace(/\./g, '-');
        eDt = parts[1].trim().replace(/\./g, '-');
      }
    }

    if (sDt) {
      const sTime = new Date(sDt).getTime();
      if (!isNaN(sTime) && sTime < minStart) minStart = sTime;
    }
    if (eDt) {
      const eTime = new Date(eDt).getTime();
      if (!isNaN(eTime) && eTime > maxEnd) maxEnd = eTime;
    }
  });

  return { minStart, maxEnd };
};

// 필터링 및 정렬 로직 (신규 컬럼 대응 추가)
const filteredSites = computed(() => {
  let result = sites.value.filter(site => {
    const contracts = site.contracts || [];
    const paymentDayMatch = selectedPaymentDay.value === '전체' || site.payment_day == selectedPaymentDay.value;
    const statusMatch = selectedStatus.value === '전체' || site.status === selectedStatus.value;
    const typeMatch   = selectedStype.value === '전체' || site.sType === selectedStype.value || site.type === selectedStype.value;
    const vatMatch    = selectedVat.value === '전체' || site.is_vat === selectedVat.value;
    const managerMatch = selectedManager.value === '전체' || site.manager === selectedManager.value;
    const billingMatch = selectedBilling.value === '전체' || site.billingManager === selectedBilling.value;
    const searchMatch = site.name.toLowerCase().includes(searchTerm.value.toLowerCase());

    const contractTypeMatch = selectedType.value === '전체' ||
        contracts.some(contract => contract.type === selectedType.value);

    return paymentDayMatch && statusMatch && typeMatch && vatMatch && managerMatch && billingMatch && searchMatch && contractTypeMatch;
  });

  currentPage.value = 1;

  result.sort((a, b) => {
    let valA, valB;

    // ★ 3. 특수 필드 정렬 로직 (계약기간, 용역비, 인원)
    if (sortKey.value === 'contract') {
      const datesA = getContractDates(a);
      const datesB = getContractDates(b);
      return sortOrder.value === 'asc' ? datesA.minStart - datesB.minStart : datesB.maxEnd - datesA.maxEnd;
    }
    else if (sortKey.value === 'total_cost') {
      valA = getTotalCost(a);
      valB = getTotalCost(b);
    }
    else if (sortKey.value === 'staffCount') {
      valA = getTotalStaff(a);
      valB = getTotalStaff(b);
    }
    else {
      // 일반 필드 (idx, unit_su, building_su 등)
      valA = a[sortKey.value];
      valB = b[sortKey.value];
    }

    const modifier = sortOrder.value === 'asc' ? 1 : -1;

    if (valA == null && valB == null) return 0;
    if (valA == null) return 1;
    if (valB == null) return -1;
    if (typeof valA === 'string') return valA.localeCompare(valB) * modifier;
    if (valA < valB) return -1 * modifier;
    if (valA > valB) return 1 * modifier;
    return 0;
  });

  return result;
});

// 통계 정보
const statsInfo = computed(() => {
  const total = sites.value.length;
  const active = sites.value.filter(s => s.status === '운영 중').length;
  const preparing = sites.value.filter(s => s.status === '준비 중').length;
  const ended = sites.value.filter(s => s.status === '계약 종료').length;
  return { total, active, preparing, ended };
});

const pagedSiteList = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredSites.value.slice(start, start + pageSize.value);
});

const handlePageChange = () => { document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
const onFilterChange = () => { currentPage.value = 1; };

const getContractPeriods = (site) => {
  if (!site?.contracts || !Array.isArray(site.contracts) || site.contracts.length === 0) return '-';
  return site.contracts
      .filter(contract => contract?.contract_period)
      .map(contract => {
        const typeBadge = contract.type ? `<span class="contract-type-badge">[${contract.typeNm}]</span>` : '';
        return `${typeBadge} ${contract.contract_period}`;
      })
      .join('<br>');
}

// 담당자 일괄 변경 로직
const isManagerModalOpen = ref(false);
const selectedManagerType = ref('billingManager');
const newManagerName = ref('');
const managerTypeOptions = [
  { label: '본사 담당자', value: 'manager' },
  { label: '청구 담당자', value: 'billingManager' },
  { label: '급여 담당자', value: 'payrollManager' }
];

const openManagerModal = () => {
  if (selectedSiteIds.value.length === 0) { alert('담당자를 변경할 현장을 먼저 선택해주세요.'); return; }
  selectedManagerType.value = 'billingManager';
  newManagerName.value = '';
  isManagerModalOpen.value = true;
};
const closeManagerModal = () => { isManagerModalOpen.value = false; newManagerName.value = ''; };

const updateManager = async () => {
  if (!newManagerName.value.trim()) { alert('새로운 담당자 이름을 입력해주세요.'); return; }
  try {
    const payload = { siteIds: selectedSiteIds.value, targetField: selectedManagerType.value, managerName: newManagerName.value };
    await axios.put('/api/v1/site/manager/batch', payload);
    alert(`선택한 ${selectedSiteIds.value.length}개 현장의 담당자가 변경되었습니다.`);
    selectedSiteIds.value = [];
    closeManagerModal();
    await getSites();
  } catch (err) {
    alert('변경 중 오류가 발생했습니다.');
  }
};

const getSites = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get(`/api/v1/site/list`);
    sites.value = res.data.data || [];

    const allBillingManagers = sites.value.map(site => site.billingManager).filter(name => name && name.trim() !== '');
    billingManager.value = [...new Set(allBillingManagers)].map(name => ({ value: name }));

    const allManagers = sites.value.map(site => site.manager).filter(name => name && name.trim() !== '');
    manager.value = [...new Set(allManagers)].map(name => ({ value: name }));

  } catch (err) {
    console.error('현장 로드 실패:', err);
  } finally {
    isLoading.value = false;
  }
}

onActivated(async () => { await getSites(); });

const goToRegister = () => router.push('/site/register');
const goToDetail = (id) => router.push(`/site/${id}`);
const goRemove = async (id) => {
  if (!await window.customConfirm('현장을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
  try {
    await axios.delete(`/api/v1/site/${id}`);
    alert('삭제되었습니다.');
    await getSites();
  } catch {
    alert('삭제에 실패했습니다.');
  }
}

onMounted(async () => {
  await fetchColumns();
  await fetchTypeOptions();
})
</script>

<template>
  <div class="site-list-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-map-marker-multiple-outline"></i> 현장 관리
        </h1>
        <p class="page-subtitle">전체 현장 정보를 조회하고 관리합니다</p>
      </div>
      <div class="header-actions" style="display: flex; gap: 8px;">
        <!--button @click="downloadExcel" class="btn-excel">
          <i class="mdi mdi-file-excel-outline"></i><span>엑셀 다운로드</span>
        </button-->
        <button @click="isSettingModalOpen = true" class="btn-setting">
          <!--i class="mdi mdi-table-cog"></i--><span>보기 설정</span>
        </button>
        <button @click="openManagerModal" class="btn-update">
          <!--i class="mdi mdi-account-edit-outline"></i--><span>담당자 일괄 변경</span>
        </button>
        <button @click="goToRegister" class="btn-add">
          <i class="mdi mdi-plus"></i><span>현장 등록</span>
        </button>
      </div>

      <!-- 공통 컬럼 설정 모달 -->
      <TableColumnSettingModal
          v-model:isOpen="isSettingModalOpen"
          :currentColumns="columns"
          :defaultColumns="siteDefaultColumns"
          @save="saveColumns"
      />

      <!-- 담당자 일괄 변경 모달 -->
      <div v-if="isManagerModalOpen" class="modal-overlay" @mousedown.self="closeManagerModal">
        <div class="modal-container">
          <div class="modal-header">
            <h3>담당자 일괄 변경</h3>
            <button @click="closeManagerModal" class="btn-close"><i class="mdi mdi-close"></i></button>
          </div>
          <div class="modal-body">
            <p class="modal-desc">선택한 <strong>{{ selectedSiteIds.length }}개</strong> 현장의 담당자를 변경합니다.</p>
            <div class="form-group mt-3">
              <label>변경할 담당자 종류</label>
              <select v-model="selectedManagerType" class="form-select" style="width: 100%; padding: 10px 12px;">
                <option v-for="opt in managerTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="form-group mt-3">
              <label>새로운 담당자 이름</label>
              <input type="text" v-model="newManagerName" class="form-input" placeholder="담당자 이름 직접 입력" list="managers-list"/>
              <datalist id="managers-list"><option v-for="b in billingManager" :key="b.value" :value="b.value"></option></datalist>
            </div>
          </div>
          <div class="modal-footer" style="justify-content: flex-end; gap: 8px;">
            <button @click="closeManagerModal" class="btn-cancel">취소</button>
            <button @click="updateManager" class="btn-submit">변경 저장</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 통계 정보 -->
    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-office-building-outline"></i></div>
        <div class="stat-content"><span class="stat-label">전체 현장</span><span class="stat-value">{{ statsInfo.total }} <small>건</small></span></div>
      </div>
      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-check-circle-outline"></i></div>
        <div class="stat-content"><span class="stat-label">운영 중</span><span class="stat-value">{{ statsInfo.active }} <small>건</small></span></div>
      </div>
      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-clock-outline"></i></div>
        <div class="stat-content"><span class="stat-label">준비 중</span><span class="stat-value">{{ statsInfo.preparing }} <small>건</small></span></div>
      </div>
      <div class="stat-card" style="--card-color: var(--text-sub); --card-bg: var(--bg-hover);">
        <div class="stat-icon"><i class="mdi mdi-close-circle-outline"></i></div>
        <div class="stat-content"><span class="stat-label">계약 종료</span><span class="stat-value">{{ statsInfo.ended }} <small>건</small></span></div>
      </div>
    </div>

    <!-- 필터 영역 -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group"><label class="filter-label">상태</label><select v-model="selectedStatus" class="filter-select"><option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option></select></div>
        <div class="filter-group"><label class="filter-label">현장 형태</label><select v-model="selectedStype" class="filter-select"><option v-for="type in sTypeOptions" :key="type" :value="type">{{ type }}</option></select></div>
        <div class="filter-group"><label class="filter-label">과세 여부</label><select v-model="selectedVat" class="filter-select"><option v-for="vat in vatOptions" :key="vat.value" :value="vat.value">{{ vat.label }}</option></select></div>
        <div class="filter-group"><label class="filter-label">지급일</label><select v-model="selectedPaymentDay" class="filter-select" @change="onFilterChange"><option value="전체">전체</option><option v-for="day in 31" :key="day" :value="day">{{ day }}일</option></select></div>
        <div class="filter-group"><label class="filter-label">구분</label><select v-model="selectedType" class="filter-select" @change="onFilterChange"><option value="전체">전체</option><option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option></select></div>
        <div class="filter-group"><label class="filter-label">본사 담당</label><select v-model="selectedManager" class="filter-select"><option value="전체">전체</option><option v-for="b in manager" :key="b.value" :value="b.value">{{ b.value }}</option></select></div>
        <div class="filter-group"><label class="filter-label">청구 담당</label><select v-model="selectedBilling" class="filter-select"><option value="전체">전체</option><option v-for="b in billingManager" :key="b.value" :value="b.value">{{ b.value }}</option></select></div>

        <div class="search-group" style="flex: 1;">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i><input type="text" v-model="searchTerm" placeholder="현장명으로 검색..." class="search-input" />
            <button v-if="searchTerm" @click="searchTerm = ''; onFilterChange()" class="search-clear"><i class="mdi mdi-close"></i></button>
          </div>
          <button @click="resetFilters" class="btn-search" title="필터 초기화"><i class="mdi mdi-filter-off"></i><span>초기화</span></button>
        </div>
      </div>
    </div>

    <!-- 데이터 테이블 -->
    <div v-if="isLoading" class="loading-state"><div class="spinner"></div><p>데이터를 불러오는 중...</p></div>

    <div class="table-card" v-if="!isLoading">
      <div class="table-header">
        <div class="table-title"><i class="mdi mdi-table"></i><span>현장 목록 ({{ filteredSites.length }}개)</span></div>
        <div class="page-size-select"><label>페이지당</label><select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;"><option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option></select></div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <colgroup>
            <col width="40px">
            <template v-for="col in columns" :key="'cg-'+col.key">
              <col v-if="col.visible" :width="col.width">
            </template>
            <col width="80px">
          </colgroup>

          <thead>
          <tr>
            <th class="text-center"><input type="checkbox" v-model="selectAll" class="custom-checkbox" /></th>

            <template v-for="col in columns" :key="'th-'+col.key">
              <th
                  v-if="col.visible"
                  @click="col.sortable ? toggleSort(col.key) : null"
                  :class="['resizable', { 'sortable': col.sortable }]"
              >
                <div class="th-content">
                  <span>{{ col.label }}</span>
                  <i v-if="col.sortable && sortKey === col.key" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
                </div>
                <div class="resize-handle" @mousedown.stop="startResize"></div>
              </th>
            </template>

            <th class="text-center"><div class="th-content justify-center"><span>관리</span></div></th>
          </tr>
          </thead>

          <tbody>
          <tr v-for="site in pagedSiteList" :key="site.idx" class="data-row">
            <td class="text-center"><input type="checkbox" :value="site.idx" v-model="selectedSiteIds" class="custom-checkbox" /></td>

            <!-- ★ 4. 동적 컬럼 바디 매핑 (신규 항목 추가) -->
            <template v-for="col in columns" :key="'td-'+col.key">
              <td v-if="col.visible">

                <span v-if="col.key === 'idx'" class="site-id">{{ site.idx }}</span>

                <div v-else-if="col.key === 'name'" class="site-name-cell cursor-pointer" @click="goToDetail(site.idx)">
                  <span class="site-name">{{ site.name }}</span>
                </div>

                <div v-else-if="col.key === 'address'" class="address-cell">
                  <i class="mdi mdi-map-marker-outline address-icon"></i><span>{{ site.address }}</span>
                </div>

                <div v-else-if="col.key === 'contract'" class="contract-cell">
                  <i class="mdi mdi-calendar-range contract-icon"></i>
                  <span v-if="site?.contracts?.length" v-html="getContractPeriods(site)"></span>
                  <span v-else class="text-muted">-</span>
                </div>

                <!-- 신규 항목 4가지 렌더링 -->
                <span v-else-if="col.key === 'total_cost'" class="font-bold text-primary">{{ formatCurrency(getTotalCost(site)) }}원</span>

                <span v-else-if="col.key === 'staffCount'">{{ getTotalStaff(site) }}명</span>

                <span v-else-if="col.key === 'unit_su'">{{ site.unit_su ? formatCurrency(site.unit_su) + '세대' : '-' }}</span>

                <span v-else-if="col.key === 'building_su'">{{ site.building_su ? site.building_su + '개동' : '-' }}</span>

                <div v-else-if="col.key === 'manager'" class="manager-cell">
                  <i class="mdi mdi-account-tie-outline manager-icon"></i><span>{{ site.manager || '-' }}</span>
                </div>

                <span v-else-if="col.key === 'manager_phone'">{{ site.manager_phone || '-' }}</span>
                <span v-else-if="col.key === 'director'">{{ site.director || '-' }}</span>
                <span v-else-if="col.key === 'director_phone'">{{ site.director_phone || '-' }}</span>
                <span v-else-if="col.key === 'billingManager'">{{ site.billingManager || '-' }}</span>

                <span v-else-if="col.key === 'status'" :class="['status-badge', {'status-active': site.status === '운영 중', 'status-preparing': site.status === '준비 중', 'status-inactive': site.status === '계약 종료'}]">
                    <i :class="['mdi', site.status === '운영 중' ? 'mdi-check-circle-outline' : site.status === '준비 중' ? 'mdi-clock-outline' : 'mdi-close-circle-outline']"></i>{{ site.status }}
                  </span>

              </td>
            </template>

            <td class="text-center">
              <div style="display: flex; justify-content: center; gap:4px;">
                <button @click="goToDetail(site.idx)" class="btn-detail" title="상세보기">
                  <i class="mdi mdi-eye"></i><span>상세</span>
                </button>
                <button @click="goRemove(site.idx)" class="btn-remove-cost" title="삭제">
                  <i class="mdi mdi-close"></i>
                </button>
              </div>
            </td>
          </tr>

          <tr v-if="filteredSites.length === 0" class="empty-row">
            <td :colspan="columns.filter(c => c.visible).length + 2">
              <div class="empty-state">
                <i class="mdi mdi-office-building-outline"></i>
                <p>검색된 현장이 없습니다</p>
                <span>다른 조건으로 검색해보세요</span>
              </div>
            </td>
          </tr>
          </tbody>
        </table>
      </div>

      <Pagination v-model:currentPage="currentPage" v-model:pageSize="pageSize" :totalCount="filteredSites.length" @change="handlePageChange" />
    </div>
  </div>
</template>

<style scoped>
/* =========================================
   기본 스타일 유지
========================================= */
.filter-panel { background: var(--bg-surface); border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
.filter-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 10px; align-items: flex-end; margin-bottom: 20px; }
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 0; width: 100%; }
.filter-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-sub); }
.filter-label i { font-size: 16px; color: var(--primary); }
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

.loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); }
.spinner { width: 40px; height: 40px; border: 3px solid var(--bg-canvas); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.page-size-select { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub); }

.table-scroll-container { overflow-x: auto; overflow-y: visible; max-width: 100%; -webkit-overflow-scrolling: touch; }
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: var(--bg-hover); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

.th-content { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
.th-content.justify-center { justify-content: center; }
.th-content i { font-size: 14px; opacity: 0.8; color: var(--text-muted); }
.sortable:hover .th-content i { color: var(--primary); opacity: 1;}

.site-id { display: inline-flex; align-items: center; justify-content: center; min-width: 40px; padding: 4px 8px; background: var(--bg-hover); border-radius: 6px; font-weight: 600; color: var(--text-sub); font-size: 12px; }
.site-name-cell { display: flex; align-items: center; gap: 8px; }
.site-name { font-weight: 600; color: var(--text-main); }
.address-cell { display: flex; align-items: center; gap: 6px; color: var(--text-main); }
.address-icon { font-size: 16px; color: var(--text-muted); flex-shrink: 0; }
.contract-cell { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-main);}
.contract-icon { font-size: 16px; color: var(--text-muted); flex-shrink: 0; }
.manager-cell { display: flex; align-items: center; gap: 6px; color: var(--text-main); }
.manager-icon { font-size: 16px; color: var(--text-muted); flex-shrink: 0; }

.status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.status-active { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-preparing { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }
.status-inactive { background-color: var(--bg-hover); color: var(--text-sub); }

.resizable { position: relative; overflow: hidden; }
.resize-handle { position: absolute; top: 0; right: 0; width: 2px; height: 100%; cursor: col-resize; z-index: 1; user-select: none; }
.resize-handle:hover, .is-resizing .resize-handle { background: var(--primary); opacity: 0.5; }

.btn-remove-cost { width: 28px; height: 28px; border-radius: 6px; background: var(--danger); border: none; color: var(--text-inverse); cursor: pointer; display: flex; align-items: center; justify-content: center; }
/*
.btn-detail { width: 28px; height: 28px; border-radius: 6px; background: var(--bg-hover); border: 1px solid var(--border-color); color: var(--text-sub); cursor: pointer; display: flex; align-items: center; justify-content: center; }
 */

/* 모달 & 버튼 스타일 */
.btn-update, .btn-setting { display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--bg-surface); border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; }
.btn-update { color: var(--primary); border: 1px solid var(--primary); }
.btn-update:hover { background: var(--primary-soft); }
.btn-setting { color: var(--text-main); border: 1px solid var(--border-color); }
.btn-setting:hover { background: var(--bg-hover); border-color: var(--border-focus); }

.custom-checkbox { width: 16px; height: 16px; cursor: pointer; accent-color: var(--primary); }

.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.modal-container { background: var(--bg-surface); width: 400px; max-width: 90%; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden; display: flex; flex-direction: column; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid var(--border-color); }
.modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-main); }
.btn-close { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; }
.modal-body { padding: 20px; }
.modal-desc { font-size: 13px; color: var(--text-sub); margin-bottom: 16px; line-height:1.4;}
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group label { font-size: 13px; font-weight: 600; color: var(--text-main); }
.form-input, .form-select { padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 14px; outline: none; background: var(--bg-canvas); color: var(--text-main); }
.form-input:focus, .form-select:focus { border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft); }

@media (max-width: 1024px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 16px;}
  .filter-row { flex-wrap: wrap; }
  .search-group { width: 100%; flex: 1 1 100%; }
}
@media (max-width: 768px) {
  .stats-grid { grid-template-columns: 1fr; gap: 12px;}
  .filter-row { flex-direction: column; align-items: stretch; gap: 12px;}
  .search-group { grid-column: span 1; flex-direction: row; }
  .search-box { flex: 1; min-width: 0; }
  .btn-search { flex-shrink: 0; }
}
</style>