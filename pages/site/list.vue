<script setup>
import { ref, computed, onMounted, onActivated, onBeforeUnmount } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";
import Pagination from "~/components/common/Pagination.vue";
import * as XLSX from 'xlsx';
import DataTable from "~/components/common/DataTable.vue";
import TableColumnSettingModal from "~/components/TableColumnSettingModal.vue";
import { useTableColumns } from "~/composables/useTableColumns";
import { useCellMemo } from '@/composables/useCellMemo';
import CellMemoPanel from '@/components/CellMemoPanel.vue';
import FilterSearchGroup from '@/components/common/FilterSearchGroup.vue'

const router = useRouter();
const { typeOptions, fetchTypeOptions } = useApi();

const siteDefaultColumns = [
  { key: 'idx', label: 'ID', visible: true, sortable: true, width: '60px', align: 'center' },
  { key: 'name', label: '현장명', visible: true, sortable: true, width: '12%' },
  { key: 'address', label: '주소', visible: true, sortable: true, width: '20%' },
  { key: 'contract', label: '계약 기간', visible: true, sortable: true, width: '25%' },
  { key: 'total_cost', label: '월 용역비', visible: true, sortable: true, width: '10%' },
  { key: 'cleaningExpense', label: '대청소비', visible: true, sortable: true, width: '10%' },
  { key: 'cleaningSupplies', label: '청소용품비', visible: true, sortable: true, width: '10%' },
  { key: 'otherExpense', label: '기타제경비', visible: true, sortable: true, width: '10%' },
  { key: 'managementFee', label: '일반관리비', visible: true, sortable: true, width: '10%' },
  { key: 'profit', label: '기업이윤', visible: true, sortable: true, width: '10%' },
  { key: 'staffCount', label: '배정 인원', visible: true, sortable: true, width: '8%', align: 'center' },
  { key: 'unit_su', label: '세대 수', visible: false, sortable: true, width: '8%', align: 'center' },
  { key: 'building_su', label: '건물 수', visible: false, sortable: true, width: '8%', align: 'center' },
  { key: 'deep_clean_count', label: '대청소 횟수', visible: true, sortable: true, width: '8%', align: 'center' },
  // { key: 'renewal_status', label: '재계약 요청', visible: true, sortable: true, width: '10%', align: 'center' },
  { key: 'manager', label: '본사 담당자', visible: true, sortable: true, width: '10%' },
  { key: 'manager_phone', label: '본사 연락처', visible: false, sortable: false, width: '10%' },
  { key: 'director', label: '현장 소장', visible: false, sortable: true, width: '10%' },
  { key: 'director_phone', label: '현장 연락처', visible: false, sortable: false, width: '10%' },
  { key: 'billingManager', label: '청구 담당자', visible: false, sortable: true, width: '10%' },
  { key: 'status', label: '상태', visible: true, sortable: true, width: '8%', align: 'center' },
  { key: 'actions', label: '관리', visible: true, sortable: false, width: '120px', align: 'center' }
];

const { columns, isSettingModalOpen, fetchColumns, saveColumns } = useTableColumns('site-list', siteDefaultColumns);

const memoColLabelMap = {
  idx: 'ID', name: '현장명', address: '주소', contract: '계약 기간',
  total_cost: '월 용역비', cleaningExpense: '대청소비', cleaningSupplies: '청소용품비', otherExpense: '기타제경비',
  managementFee: '일반관리비', profit: '기업이윤', staffCount: '배정 인원',
  unit_su: '세대 수', building_su: '건물 수', deep_clean_count: '대청소 횟수',
  // renewal_status: '재계약 요청',
  manager: '본사 담당자', manager_phone: '본사 연락처',
  director: '현장 소장', director_phone: '현장 연락처', billingManager: '청구 담당자', status: '상태'
};

const {
  panel: memoPanel, getMemo, hasMemo, dotClass, label: memoLabel,
  openPanel: onCellContextMenu, closePanel: closeMemoPanel, save: addMemo, remove: removeMemo,
} = useCellMemo('site', memoColLabelMap);

const handleGlobalClick = () => { if (memoPanel.value.visible) closeMemoPanel(); };
const handleCellContextMenu = (event, item, colKey) => { if (colKey === 'actions') return; onCellContextMenu(event, item, colKey); };

const searchTerm = ref('');
const selectedPaymentDay = ref('전체');
const selectedStatus = ref('전체');
const selectedStype = ref('전체');
const selectedType = ref('전체');
const selectedVat = ref('전체');
const selectedManager = ref('전체');
const selectedBilling = ref('전체');
const statusOptions = ref(['전체', '운영 중', '계약 종료']);
const sTypeOptions = ref(['전체', '아파트', '주상복합', '오피스텔', '상업 시설', '기타']);
const vatOptions = ref([ { label: '전체', value: '전체' }, { label: '과세', value: 'Y' }, { label: '면세', value: 'N' } ]);
const manager = ref([]);
const billingManager = ref([]);

const getTotalCost = (site) => site.contracts?.reduce((sum, c) => sum + (Number(c.total_cost) || 0), 0) || 0;
const getCleaningExpense = (site) => site.contracts?.reduce((sum, c) => sum + (Number(c.cleaningExpense) || 0), 0) || 0;
const getCleaningSupplies = (site) => site.contracts?.reduce((sum, c) => sum + (Number(c.cleaningSupplies) || 0), 0) || 0;
const getOtherExpense = (site) => site.contracts?.reduce((sum, c) => sum + (Number(c.otherExpense) || 0), 0) || 0;
const getManagementFee = (site) => site.contracts?.reduce((sum, c) => sum + (Number(c.managementFee) || 0), 0) || 0;
const getProfit = (site) => site.contracts?.reduce((sum, c) => sum + (Number(c.profit) || 0), 0) || 0;
const getTotalStaff = (site) => site.contracts?.reduce((sum, c) => sum + (Number(c.staffCount) || 0), 0) || 0;
const getDeepCleanCount = (site) => site.contracts?.reduce((sum, c) => sum + (Number(c.cleaningCount) || 0), 0) || 0;

// ★ 신규 추가: 대청소 상세 내역(항목별 횟수) 추출 함수
const getDeepCleanDetails = (site) => {
  if (!site.contracts || !Array.isArray(site.contracts)) return [];
  const map = {};

  site.contracts.forEach(c => {
    let config = c.cleaningConfig;
    if (!config && c.jsonData) {
      try {
        const parsedData = typeof c.jsonData === 'string' ? JSON.parse(c.jsonData) : c.jsonData;
        config = parsedData.cleaningConfig;
      } catch(e) {}
    }

    if (config) {
      try {
        const parsed = typeof config === 'string' ? JSON.parse(config) : config;
        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            if (item.name && item.count) {
              map[item.name] = (map[item.name] || 0) + Number(item.count);
            }
          });
        }
      } catch(e) {}
    }
  });

  return Object.entries(map).map(([name, count]) => ({ name, count }));
};

const getRenewalBadgeClass = (status) => {
  if (status === '공문') return 'renewal-doc';
  if (status === '체킹') return 'renewal-check';
  if (status === '확정' || status === '만료' || status === '확정 또는 만료') return 'renewal-done';
  return 'status-inactive';
};

const downloadExcel = () => {
  if (filteredSites.value.length === 0) return alert('다운로드할 데이터가 없습니다.');
  const excelData = filteredSites.value.map(site => {
    let contractText = '-';
    if (site.contracts && Array.isArray(site.contracts)) {
      contractText = site.contracts.filter(c => c?.contract_period).map(c => (c.typeNm ? `[${c.typeNm}] ` : '') + c.contract_period).join(' / ');
    }
    return {
      'ID': site.idx, '현장명': site.name, '주소': site.address, '계약 기간': contractText,
      '월 용역비(원)': getTotalCost(site) || '-', '대청소비(원)': getCleaningExpense(site) || '-',
      '청소용품비(원)': getCleaningSupplies(site) || '-', '기타제경비(원)': getOtherExpense(site) || '-', '일반관리비(원)': getManagementFee(site) || '-',
      '기업이윤(원)': getProfit(site) || '-', '배정 인원(명)': getTotalStaff(site),
      '세대 수': site.unit_su || 0, '건물 수': site.building_su || 0, '대청소 횟수(회)': getDeepCleanCount(site) || '-',
      //'재계약 요청': site.renewal_status || '-',
      '본사 담당자': site.manager || '-', '본사 연락처': site.manager_phone || '-',
      '현장 소장': site.director || '-', '현장 연락처': site.director_phone || '-', '청구 담당자': site.billingManager || '-', '상태': site.status
    };
  });
  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "현장목록");
  worksheet['!cols'] = [ { wch: 10 }, { wch: 25 }, { wch: 40 }, { wch: 35 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 } ];
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  XLSX.writeFile(workbook, `현장목록_${today}.xlsx`);
};

const sortKey = ref('idx');
const sortOrder = ref('desc');
const sites = ref([]);
const isLoading = ref(false);

const currentPage = ref(1);
const pageSize    = ref(50);
const pageSizeOptions = [50, 100, 200, 500];
const selectedSiteIds = ref([]);

const toggleSort = (key) => {
  if (sortKey.value === key) sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  else { sortKey.value = key; sortOrder.value = 'asc'; }
  currentPage.value = 1;
};

const resetFilters = () => {
  searchTerm.value = ''; selectedStatus.value = '전체'; selectedStype.value = '전체'; selectedType.value = '전체';
  selectedVat.value = '전체'; currentPage.value = 1; sortKey.value = 'idx'; sortOrder.value = 'desc'; pageSize.value = 50;
};

const getContractDates = (site) => {
  let minStart = Infinity, maxEnd = -Infinity;
  if (!site.contracts || !Array.isArray(site.contracts) || site.contracts.length === 0) return { minStart, maxEnd };
  site.contracts.forEach(c => {
    let sDt = c.firstContractDt; let eDt = c.endDt;
    if ((!sDt || !eDt) && c.contract_period) {
      const parts = c.contract_period.split('~');
      if (parts.length >= 2) { sDt = parts[0].trim().replace(/\./g, '-'); eDt = parts[1].trim().replace(/\./g, '-'); }
    }
    if (sDt) { const sTime = new Date(sDt).getTime(); if (!isNaN(sTime) && sTime < minStart) minStart = sTime; }
    if (eDt) { const eTime = new Date(eDt).getTime(); if (!isNaN(eTime) && eTime > maxEnd) maxEnd = eTime; }
  });
  return { minStart, maxEnd };
};

const isContractExpiring = (site) => {
  const dates = getContractDates(site);
  if (dates.maxEnd === -Infinity) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(dates.maxEnd); end.setHours(0, 0, 0, 0);
  const sixMonthsLater = new Date(today); sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
  return site.status === '운영 중' && end <= sixMonthsLater;
};

const getContractDaysLeft = (site) => {
  const dates = getContractDates(site);
  if (dates.maxEnd === -Infinity) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = new Date(dates.maxEnd); end.setHours(0, 0, 0, 0);
  return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
};

const getContractPeriodsText = (site) => {
  if (!site?.contracts || !Array.isArray(site.contracts) || site.contracts.length === 0) return '-';
  return site.contracts.filter(c => c?.contract_period).map(c => (c.typeNm ? `[${c.typeNm}] ` : '') + c.contract_period).join(', ');
};

const getContractPeriodsHTML = (site) => {
  if (!site?.contracts || !Array.isArray(site.contracts) || site.contracts.length === 0) return '-';
  return site.contracts.filter(c => c?.contract_period).map(c => {
    // 뱃지를 strong 태그로 바꿔서 한 줄로 예쁘게 나오도록 수정
    const typeBadge = c.type ? `<strong class="text-primary">[${c.typeNm}]</strong>` : '';
    return `${typeBadge} ${c.contract_period}`;
  }).join(', '); // <br> 대신 쉼표로 연결
};

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
    const contractTypeMatch = selectedType.value === '전체' || contracts.some(c => c.type === selectedType.value);
    return paymentDayMatch && statusMatch && typeMatch && vatMatch && managerMatch && billingMatch && searchMatch && contractTypeMatch;
  });
  currentPage.value = 1;
  result.sort((a, b) => {
    let valA, valB;
    if (sortKey.value === 'contract') {
      const datesA = getContractDates(a); const datesB = getContractDates(b);
      return sortOrder.value === 'asc' ? datesA.minStart - datesB.minStart : datesB.maxEnd - datesA.maxEnd;
    }
    else if (sortKey.value === 'total_cost') { valA = getTotalCost(a); valB = getTotalCost(b); }
    else if (sortKey.value === 'cleaningExpense') { valA = getCleaningExpense(a); valB = getCleaningExpense(b); }
    else if (sortKey.value === 'cleaningSupplies') { valA = getCleaningSupplies(a); valB = getCleaningSupplies(b); }
    else if (sortKey.value === 'otherExpense') { valA = getOtherExpense(a); valB = getOtherExpense(b); }
    else if (sortKey.value === 'managementFee') { valA = getManagementFee(a); valB = getManagementFee(b); }
    else if (sortKey.value === 'profit') { valA = getProfit(a); valB = getProfit(b); }
    else if (sortKey.value === 'staffCount') { valA = getTotalStaff(a); valB = getTotalStaff(b); }
    else if (sortKey.value === 'deep_clean_count') { valA = getDeepCleanCount(a); valB = getDeepCleanCount(b); }
    else { valA = a[sortKey.value]; valB = b[sortKey.value]; }
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

const isManagerModalOpen = ref(false);
const selectedManagerType = ref('billingManager');
const newManagerName = ref('');
const managerTypeOptions = [ { label: '본사 담당자', value: 'manager' }, { label: '청구 담당자', value: 'billingManager' }, { label: '급여 담당자', value: 'payrollManager' } ];
const openManagerModal = () => {
  if (selectedSiteIds.value.length === 0) { alert('담당자를 변경할 현장을 먼저 선택해주세요.'); return; }
  selectedManagerType.value = 'billingManager'; newManagerName.value = ''; isManagerModalOpen.value = true;
};
const closeManagerModal = () => { isManagerModalOpen.value = false; newManagerName.value = ''; };

const updateManager = async () => {
  if (!newManagerName.value.trim()) { alert('새로운 담당자 이름을 입력해주세요.'); return; }
  try {
    const payload = { siteIds: selectedSiteIds.value, targetField: selectedManagerType.value, managerName: newManagerName.value };
    await axios.put('/api/v1/site/manager/batch', payload);
    alert(`선택한 ${selectedSiteIds.value.length}개 현장의 담당자가 변경되었습니다.`);
    selectedSiteIds.value = []; closeManagerModal(); await getSites();
  } catch (err) { alert('변경 중 오류가 발생했습니다.'); }
};

const getSites = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get(`/api/v2/site/list`);
    sites.value = res.data.data || [];
    const allBillingManagers = sites.value.map(site => site.billingManager).filter(name => name && name.trim() !== '');
    billingManager.value = [...new Set(allBillingManagers)].map(name => ({ value: name }));
    const allManagers = sites.value.map(site => site.manager).filter(name => name && name.trim() !== '');
    manager.value = [...new Set(allManagers)].map(name => ({ value: name }));
  } catch (err) { console.error('현장 로드 실패:', err); } finally { isLoading.value = false; }
}

const goToRegister = () => router.push('/site/register');
const goToDetail = (id) => router.push(`/site/${id}`);
const goRemove = async (id) => {
  if (!await window.customConfirm('현장을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
  try { await axios.delete(`/api/v1/site/${id}`); alert('삭제되었습니다.'); await getSites(); } catch { alert('삭제에 실패했습니다.'); }
}

const getTableRowClass = (site) => {
  //return isContractExpiring(site) ? 'is-expiring' : '';
};

const getContractUrgency = (site) => {
  if (site.status !== '운영 중') return '';
  const daysLeft = getContractDaysLeft(site);
  if (daysLeft === null) return '';
  if (daysLeft <= 30) return 'contract-danger';
  if (daysLeft <= 180) return 'contract-warning';
  return '';
};

const getTableCellClass = (item, colKey) => {
  let cls = '';
  if (colKey === 'contract') cls += getContractUrgency(item) + ' ';
  if (dotClass(item, colKey)) cls += 'has-memo ';
  return cls;
};

onMounted(async () => {
  window.addEventListener('click', handleGlobalClick);
  await fetchColumns();
  if (columns.value && columns.value.length > 0) {
    const existingKeys = columns.value.map(c => c.key);
    const missingColumns = siteDefaultColumns.filter(c => !existingKeys.includes(c.key));
    if (missingColumns.length > 0) {
      missingColumns.forEach(missingCol => {
        const originalIndex = siteDefaultColumns.findIndex(c => c.key === missingCol.key);
        columns.value.splice(originalIndex, 0, missingCol);
      });
      if (typeof saveColumns === 'function') saveColumns(columns.value);
    }
  }
  await fetchTypeOptions();
})

onBeforeUnmount(() => {
  window.removeEventListener('click', handleGlobalClick);
});

onActivated(async () => { await getSites(); });
</script>

<template>
  <div class="site-list-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-map-marker-multiple-outline"></i> 현장 관리</h1>
        <p class="page-subtitle">전체 현장 정보를 조회하고 관리합니다</p>
      </div>
      <div class="header-actions" style="display: flex; gap: 8px;">
        <button @click="isSettingModalOpen = true" class="btn-setting"><span>보기 설정</span></button>
        <button @click="openManagerModal" class="btn-update"><span>담당자 일괄 변경</span></button>
        <button @click="goToRegister" class="btn-add"><i class="mdi mdi-plus"></i><span>현장 등록</span></button>
      </div>

      <TableColumnSettingModal v-model:isOpen="isSettingModalOpen" :currentColumns="columns" :defaultColumns="siteDefaultColumns" @save="saveColumns" />

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

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-office-building-outline"></i></div>
        <div class="stat-content"><span class="stat-label">전체 현장</span><span class="stat-value">{{ statsInfo.total }} <small>건</small></span></div>
      </div>
      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-check-circle-outline"></i></div>
        <div class="stat-content"><span class="stat-label">운영 중</span><span class="stat-value">{{ statsInfo.active }} <small>건</small></span></div>
      </div>
      <!--div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-clock-outline"></i></div>
        <div class="stat-content"><span class="stat-label">준비 중</span><span class="stat-value">{{ statsInfo.preparing }} <small>건</small></span></div>
      </div-->
      <div class="stat-card" style="--card-color: var(--text-sub); --card-bg: var(--bg-hover);">
        <div class="stat-icon"><i class="mdi mdi-close-circle-outline"></i></div>
        <div class="stat-content"><span class="stat-label">계약 종료</span><span class="stat-value">{{ statsInfo.ended }} <small>건</small></span></div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group"><label class="filter-label">상태</label><select v-model="selectedStatus" class="filter-select"><option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option></select></div>
        <div class="filter-group"><label class="filter-label">현장 형태</label><select v-model="selectedStype" class="filter-select"><option v-for="type in sTypeOptions" :key="type" :value="type">{{ type }}</option></select></div>
        <div class="filter-group"><label class="filter-label">과세 여부</label><select v-model="selectedVat" class="filter-select"><option v-for="vat in vatOptions" :key="vat.value" :value="vat.value">{{ vat.label }}</option></select></div>
        <div class="filter-group"><label class="filter-label">지급일</label><select v-model="selectedPaymentDay" class="filter-select" @change="onFilterChange"><option value="전체">전체</option><option v-for="day in 31" :key="day" :value="day">{{ day }}일</option></select></div>
        <div class="filter-group"><label class="filter-label">구분</label><select v-model="selectedType" class="filter-select" @change="onFilterChange"><option value="전체">전체</option><option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option></select></div>
        <div class="filter-group"><label class="filter-label">본사 담당</label><select v-model="selectedManager" class="filter-select"><option value="전체">전체</option><option v-for="b in manager" :key="b.value" :value="b.value">{{ b.value }}</option></select></div>
        <div class="filter-group"><label class="filter-label">청구 담당</label><select v-model="selectedBilling" class="filter-select"><option value="전체">전체</option><option v-for="b in billingManager" :key="b.value" :value="b.value">{{ b.value }}</option></select></div>
        <FilterSearchGroup
            v-model="searchTerm"
            placeholder="현장명으로 검색..."
            @search="onFilterChange"
            @reset="resetFilters"
        />
      </div>
    </div>

    <div v-if="isLoading" class="loading-state"><div class="spinner"></div><p>데이터를 불러오는 중...</p></div>

    <div class="table-card" v-if="!isLoading">
      <div class="table-header">
        <div class="table-title"><i class="mdi mdi-table"></i><span>현장 목록 ({{ filteredSites.length }}개)</span></div>
        <div class="page-size-select"><label>페이지당</label><select v-model="pageSize" @change="currentPage = 1" class="filter-select" style="height:32px; padding:4px 10px; font-size:12px; min-width:60px;"><option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개</option></select></div>
      </div>

      <DataTable
          :items="pagedSiteList"
          :columns="columns"
          :sortKey="sortKey"
          :sortOrder="sortOrder"
          selectable
          v-model:selectedIds="selectedSiteIds"
          itemKey="idx"
          :cellClass="getTableCellClass"
          :rowClass="getTableRowClass"
          @update:sort="toggleSort"
          @cell-contextmenu="handleCellContextMenu"
      >
        <template #cell-idx="{ item }">
          <span class="site-id cell-ellipsis" :title="item.idx">{{ item.idx }}</span>
        </template>

        <template #cell-name="{ item }">
          <div class="flex-ellipsis-container cursor-pointer" @click="goToDetail(item.idx)" :title="item.name">
            <span class="flex-ellipsis-text site-name">{{ item.name }}</span>
          </div>
        </template>

        <template #cell-address="{ item }">
          <div class="flex-ellipsis-container" :title="item.address">
            <i class="mdi mdi-map-marker-outline flex-shrink-0 text-muted"></i>
            <span class="flex-ellipsis-text">{{ item.address }}</span>
          </div>
        </template>

        <template #cell-contract="{ item }">
          <div class="tooltip-container" style="display: flex; align-items: center; gap: 6px; width: 100%; min-width: 0;">
            <!--i class="mdi mdi-calendar-range flex-shrink-0" :class="{ 'text-danger': isContractExpiring(item) }"></i-->

            <!-- 여러 줄을 감싸는 영역 (flex: 1과 min-width: 0 이 말줄임표를 가능하게 함) -->
            <div v-if="item?.contracts?.length" style="flex: 1; min-width: 0; line-height: 1.4;">

              <!-- 경비, 미화 등 각각의 계약을 독립된 div(새 줄)로 렌더링하고, 각각에 말줄임표(cell-ellipsis) 적용 -->
              <div v-for="(c, i) in item.contracts.filter(x => x.contract_period)" :key="i" class="cell-ellipsis">
                <span v-if="c.typeNm" class="text-primary">[{{ c.typeNm }}]</span>
                {{ c.contract_period }}
              </div>

            </div>
            <span v-else class="text-muted flex-ellipsis-text">-</span>

            <!-- 툴팁 영역 -->
            <span v-if="isContractExpiring(item) && getContractDaysLeft(item) !== null" class="tooltip-text">
              {{ getContractDaysLeft(item) < 0 ? `계약 만료 (${Math.abs(getContractDaysLeft(item))}일 경과)` : `만료 ${getContractDaysLeft(item)}일 전` }}
            </span>
          </div>
        </template>

        <template #cell-total_cost="{ item }">
          <span class="font-bold num-cell cell-ellipsis" :title="getTotalCost(item) > 0 ? formatCurrency(getTotalCost(item)) + '원' : '-'">
            {{ getTotalCost(item) > 0 ? formatCurrency(getTotalCost(item)) + '원' : '-' }}
          </span>
        </template>

        <template #cell-cleaningExpense="{ item }">
          <span class="text-primary num-cell cell-ellipsis" :title="getCleaningExpense(item) > 0 ? formatCurrency(getCleaningExpense(item)) + '원' : '-'">
            {{ getCleaningExpense(item) > 0 ? formatCurrency(getCleaningExpense(item)) + '원' : '-' }}
          </span>
        </template>

        <template #cell-cleaningSupplies="{ item }">
          <span class="text-primary num-cell cell-ellipsis" :title="getCleaningSupplies(item) > 0 ? formatCurrency(getCleaningSupplies(item)) + '원' : '-'">
            {{ getCleaningSupplies(item) > 0 ? formatCurrency(getCleaningSupplies(item)) + '원' : '-' }}
          </span>
        </template>

        <template #cell-otherExpense="{ item }">
          <span class="text-primary num-cell cell-ellipsis" :title="getOtherExpense(item) > 0 ? formatCurrency(getOtherExpense(item)) + '원' : '-'">
            {{ getOtherExpense(item) > 0 ? formatCurrency(getOtherExpense(item)) + '원' : '-' }}
          </span>
        </template>

        <template #cell-managementFee="{ item }">
          <span class="text-primary num-cell cell-ellipsis" :title="getManagementFee(item) > 0 ? formatCurrency(getManagementFee(item)) + '원' : '-'">
            {{ getManagementFee(item) > 0 ? formatCurrency(getManagementFee(item)) + '원' : '-' }}
          </span>
        </template>

        <template #cell-profit="{ item }">
          <span class="text-primary num-cell cell-ellipsis" :title="getProfit(item) > 0 ? formatCurrency(getProfit(item)) + '원' : '-'">
            {{ getProfit(item) > 0 ? formatCurrency(getProfit(item)) + '원' : '-' }}
          </span>
        </template>

        <template #cell-staffCount="{ item }">
          <span class="cell-ellipsis" :title="getTotalStaff(item) + '명'">{{ getTotalStaff(item) }}명</span>
        </template>

        <template #cell-unit_su="{ item }">
          <span class="cell-ellipsis" :title="item.unit_su ? formatCurrency(item.unit_su) + '세대' : '-'">
            {{ item.unit_su ? formatCurrency(item.unit_su) + '세대' : '-' }}
          </span>
        </template>

        <template #cell-building_su="{ item }">
          <span class="cell-ellipsis" :title="item.building_su ? item.building_su + '개동' : '-'">
            {{ item.building_su ? item.building_su + '개동' : '-' }}
          </span>
        </template>

        <!-- ★ 대청소 횟수 툴팁 적용 부분 -->
        <template #cell-deep_clean_count="{ item }">
          <div v-if="getDeepCleanCount(item) > 0" class="tooltip-container flex-ellipsis-container">
            <span class="font-bold flex-ellipsis-text text-primary">{{ getDeepCleanCount(item) }}회</span>
            <div class="tooltip-text" style="text-align: left; min-width: 120px;">
              <div style="font-weight: bold; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.2); padding-bottom: 4px;">대청소 상세</div>
              <div v-for="detail in getDeepCleanDetails(item)" :key="detail.name" style="display: flex; justify-content: space-between; gap: 10px;">
                <span>{{ detail.name }}</span>
                <span>{{ detail.count }}회</span>
              </div>
            </div>
          </div>
          <span v-else class="text-muted cell-ellipsis">-</span>
        </template>

        <!--template #cell-renewal_status="{ item }">
          <div class="cell-ellipsis" :title="item.renewal_status">
            <span v-if="item.renewal_status" :class="['renewal-badge', getRenewalBadgeClass(item.renewal_status)]">{{ item.renewal_status }}</span>
            <span v-else class="text-muted">-</span>
          </div>
        </template-->

        <template #cell-manager="{ item }">
          <div class="flex-ellipsis-container" :title="item.manager || '-'">
            <i class="mdi mdi-account-tie-outline flex-shrink-0 text-muted"></i>
            <span class="flex-ellipsis-text">{{ item.manager || '-' }}</span>
          </div>
        </template>

        <template #cell-manager_phone="{ item }">
          <span class="cell-ellipsis" :title="item.manager_phone || '-'">{{ item.manager_phone || '-' }}</span>
        </template>

        <template #cell-director="{ item }">
          <span class="cell-ellipsis" :title="item.director || '-'">{{ item.director || '-' }}</span>
        </template>

        <template #cell-director_phone="{ item }">
          <span class="cell-ellipsis" :title="item.director_phone || '-'">{{ item.director_phone || '-' }}</span>
        </template>

        <template #cell-billingManager="{ item }">
          <span class="cell-ellipsis" :title="item.billingManager || '-'">{{ item.billingManager || '-' }}</span>
        </template>

        <template #cell-status="{ item }">
          <div class="cell-ellipsis" :title="item.status">
            <span :class="['status-badge', {'status-active': item.status === '운영 중', 'status-preparing': item.status === '준비 중', 'status-inactive': item.status === '계약 종료'}]">
              <i :class="['mdi', item.status === '운영 중' ? 'mdi-check-circle-outline' : item.status === '준비 중' ? 'mdi-clock-outline' : 'mdi-close-circle-outline']"></i>{{ item.status }}
            </span>
          </div>
        </template>

        <template #cell-actions="{ item }">
          <div style="display: flex; justify-content: center; gap:4px; min-width: 64px;">
            <button @click="goToDetail(item.idx || item.id)" class="btn-detail" title="상세보기"><i class="mdi mdi-eye"></i></button>
            <button @click="goRemove(item.idx || item.id)" class="btn-remove-cost" title="삭제"><i class="mdi mdi-close"></i></button>
          </div>
        </template>

        <template #cell-append="{ item, colKey }">
          <span v-if="hasMemo(item, colKey)" class="memo-dot" :class="dotClass(item, colKey)"></span>
        </template>

        <template #empty>
          <div class="empty-state">
            <i class="mdi mdi-office-building-outline"></i>
            <p>검색된 현장이 없습니다</p>
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

      <Pagination v-model:currentPage="currentPage" v-model:pageSize="pageSize" :totalCount="filteredSites.length" @change="handlePageChange" />
    </div>
  </div>
</template>

<style scoped>
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

.site-id { display: inline-flex; align-items: center; justify-content: center; min-width: 40px; padding: 4px 8px; background: var(--bg-hover); border-radius: 6px; font-weight: 600; color: var(--text-sub); font-size: 12px; }
.site-name { font-weight: 600; color: var(--text-main); }

.status-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.status-active { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-preparing { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }
.status-inactive { background-color: var(--bg-hover); color: var(--text-sub); }

.renewal-badge { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.renewal-doc { background-color: rgba(59, 130, 246, 0.1); color: #3b82f6; }
.renewal-check { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }
.renewal-done { background-color: var(--bg-hover); color: var(--text-sub); }

.btn-remove-cost { width: 28px; height: 28px; border-radius: 6px; background: var(--danger); border: none; color: var(--text-inverse); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.btn-update, .btn-setting { display: flex; align-items: center; gap: 6px; padding: 8px 14px; background: var(--bg-surface); border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; }
.btn-update { color: var(--primary); border: 1px solid var(--primary); }
.btn-update:hover { background: var(--primary-soft); }
.btn-setting { color: var(--text-main); border: 1px solid var(--border-color); }
.btn-setting:hover { background: var(--bg-hover); border-color: var(--border-focus); }

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

:deep(.data-row.is-expiring) {
  background-color: rgba(239, 68, 68, 0.02) !important;
}
:deep(.data-row.is-expiring td:first-child) {
  border-left: 4px solid var(--danger) !important;
}

:deep(.contract-danger) {
  background-color: rgba(239, 68, 68, 0.06) !important;
  /*border-left: 3px solid var(--danger) !important;*/
  color: var(--danger) !important;
  font-weight: 600;
}
:deep(.contract-warning) {
  background-color: rgba(245, 158, 11, 0.06) !important;
  /*border-left: 3px solid var(--warning) !important;*/
  color: #b45309 !important;
  font-weight: 500;
}

/* 툴팁 */
.tooltip-container { position: relative; display: inline-flex; align-items: center; cursor: help; }
.tooltip-text {
  visibility: hidden; width: max-content; background-color: rgba(15, 23, 42, 0.9); color: #fff;
  text-align: center; border-radius: 6px; padding: 6px 12px; position: absolute; z-index: 999;
  bottom: 125%; left: 50%; transform: translateX(-50%); opacity: 0; transition: opacity 0.2s, visibility 0.2s;
  font-size: 12px; font-weight: 500; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); pointer-events: none;
}
.tooltip-text::after {
  content: ""; position: absolute; top: 100%; left: 50%; margin-left: -5px;
  border-width: 5px; border-style: solid; border-color: rgba(15, 23, 42, 0.9) transparent transparent transparent;
}
.tooltip-container:hover .tooltip-text { visibility: visible; opacity: 1; }

.memo-dot { position: absolute; top: 4px; left: 4px; width: 8px; height: 8px; border-radius: 50%; z-index: 2; }
:deep(.has-memo) { background-color: rgba(250, 204, 21, 0.05); }

/* 범용 유틸리티 */
.cell-ellipsis {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: inherit;
}
.flex-ellipsis-container {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
.flex-ellipsis-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: inherit;
}
.flex-shrink-0 {
  flex-shrink: 0;
}
</style>