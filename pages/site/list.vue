<script setup>
import {ref, computed, onMounted, onActivated} from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";
import Pagination from "~/components/Pagination.vue";
import {useTableResize} from "~/composables/useTableResize.js";
const { startResize } = useTableResize();
const router = useRouter();

// 1. 상태 및 검색 조건
const searchTerm = ref('');
const selectedStatus = ref('전체');
const selectedType = ref('전체');
const selectedVat = ref('전체');
const selectedBilling = ref('전체');
const statusOptions = ref(['전체', '운영 중', '준비 중', '계약 종료']);
const typeOptions = ref(['전체', '아파트', '주상복합', '오피스텔', '상업 시설', '기타']);
const vatOptions = ref([
  { label: '전체', value: '전체' },
  { label: '과세', value: 'Y' },
  { label: '면세', value: 'N' }
]);
const billingManager = ref([]);

// 2. 정렬 관련 상태
const sortKey = ref('idx');
const sortOrder = ref('asc');

// 3. 현장 목록 데이터
const sites = ref([]);

const isLoading = ref(false);
const error = ref(null);
// ── 페이지네이션 상태 ──────────────────────────────
const currentPage = ref(1);
const pageSize    = ref(50); // 한 페이지당 행 수
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

// 4. 정렬 토글
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

//필터 초기화
const resetFilters = () => {
  searchTerm.value     = '';
  selectedStatus.value   = '전체';
  selectedType.value   = '전체';
  selectedVat.value = '전체';
  currentPage.value = 1;
};

// 5. 필터링 및 정렬된 현장 목록
const filteredSites = computed(() => {
  let result = sites.value.filter(site => {
    const statusMatch = selectedStatus.value === '전체' || site.status === selectedStatus.value;
    const typeMatch   = selectedType.value === '전체' || site.sType === selectedType.value || site.type === selectedType.value;
    const vatMatch    = selectedVat.value === '전체' || site.is_vat === selectedVat.value;
    const billingMatch = selectedBilling.value === '전체' || site.billingManager === selectedBilling.value;
    const searchMatch = site.name.toLowerCase().includes(searchTerm.value.toLowerCase());
    return statusMatch && typeMatch && vatMatch && billingMatch && searchMatch;
  });

  result.sort((a, b) => {
    const modifier = sortOrder.value === 'asc' ? 1 : -1;
    const valA = a[sortKey.value];
    const valB = b[sortKey.value];

    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * modifier;
    }

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

const handlePageChange = () => {
  document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// 필터 변경 시 첫 페이지로
const onFilterChange = () => { currentPage.value = 1; };

const getContractPeriods = (site) => {
  // contracts가 없거나 배열이 아니면
  if (!site?.contracts || !Array.isArray(site.contracts) || site.contracts.length === 0) {
    return '-';
  }

  return site.contracts
      .filter(contract => contract?.contract_period) // 기간이 있는 데이터만 필터링
      .map(contract => {
        // type 값이 있으면 CSS 클래스가 적용된 태그로 감싸서 추가
        const typeBadge = contract.type ? `<span class="contract-type-badge">[${contract.typeNm}]</span>` : '';
        return `${typeBadge} ${contract.contract_period}`;
      })
      .join('<br>');
}

// 6. 이벤트 핸들러
const handleSearch = () => {
  console.log('현장 검색 시작:', searchTerm.value, selectedStatus.value);
};

// ★ 담당자 일괄 변경 모달 관련 로직
const isManagerModalOpen = ref(false);
const selectedManagerType = ref('billingManager'); // 기본값: 청구담당자
const newManagerName = ref('');

// 담당자 종류 옵션
const managerTypeOptions = [
  { label: '본사 담당자', value: 'manager' },
  { label: '청구 담당자', value: 'billingManager' },
  { label: '급여 담당자', value: 'payrollManager' }
];

const openManagerModal = () => {
  if (selectedSiteIds.value.length === 0) {
    alert('담당자를 변경할 현장을 먼저 선택해주세요.');
    return;
  }
  selectedManagerType.value = 'billingManager'; // 모달 열 때 기본값 세팅
  newManagerName.value = '';
  isManagerModalOpen.value = true;
};

const closeManagerModal = () => {
  isManagerModalOpen.value = false;
  newManagerName.value = '';
};

const updateManager = async () => {
  if (!newManagerName.value.trim()) {
    alert('새로운 담당자 이름을 입력해주세요.');
    return;
  }

  try {
    const payload = {
      siteIds: selectedSiteIds.value,
      targetField: selectedManagerType.value, // 어떤 담당자를 바꿀 것인지
      managerName: newManagerName.value       // 새로운 담당자 이름
    };

    await axios.put('/api/v1/site/manager/batch', payload);

    alert(`선택한 ${selectedSiteIds.value.length}개 현장의 담당자가 변경되었습니다.`);
    selectedSiteIds.value = []; // 체크박스 선택 초기화
    closeManagerModal();
    await getSites(); // 테이블 데이터 재로드
  } catch (err) {
    console.error('담당자 일괄 변경 실패:', err);
    alert('변경 중 오류가 발생했습니다.');
  }
};

const getSites = async () => {
  isLoading.value = true;
  try {
    const res = await axios.get(`/api/v1/site/list`); // await으로 데이터 대기
    sites.value = res.data.data || [];

    // 1. 모든 현장의 billingManager 값만 추출 (값이 비어있는 것은 제외)
    const allBillingManagers = sites.value
        .map(site => site.billingManager)
        .filter(name => name && name.trim() !== '');

    // 2. Set을 이용해 중복을 제거한 후 다시 배열로 변환
    const uniqueManagers = [...new Set(allBillingManagers)];

    // 3. Select(또는 커스텀 드롭다운)에서 쓰기 좋게 객체 형태로 변환하여 저장
    billingManager.value = uniqueManagers.map(name => ({ value: name }));

  } catch (err) {
    console.error('현장 로드 실패:', err);
  } finally {
    isLoading.value = false;
  }
}

onActivated(async () => {
  await getSites();
});

const goToRegister = () => router.push('/site/register');
const goToDetail = (id) => router.push(`/site/${id}`);
const goRemove = async (id) => {
  if (!confirm('현장을 정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;
  try {
    await axios.delete(`/api/v1/site/${id}`);
    alert('삭제되었습니다.');
    await getSites();
  } catch {
    alert('삭제에 실패했습니다.');
  }
}
</script>

<template>
  <div class="site-list-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-map-marker-multiple-outline"></i>
          현장 관리
        </h1>
        <p class="page-subtitle">전체 현장 정보를 조회하고 관리합니다</p>
      </div>
      <div class="header-actions" style="display: flex; gap: 8px;">
        <button @click="openManagerModal" class="btn-update">
          <i class="mdi mdi-account-edit-outline"></i>
          <span>담당자 일괄 변경</span>
        </button>
        <button @click="goToRegister" class="btn-add">
          <i class="mdi mdi-plus"></i>
          <span>현장 등록</span>
        </button>
      </div>

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
                <option v-for="opt in managerTypeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </div>

            <div class="form-group mt-3">
              <label>새로운 담당자 이름</label>
              <input
                  type="text"
                  v-model="newManagerName"
                  class="form-input"
                  placeholder="담당자 이름 직접 입력"
                  list="managers-list"
              />
              <datalist id="managers-list">
                <option v-for="b in billingManager" :key="b.value" :value="b.value"></option>
              </datalist>
            </div>
          </div>
          <div class="modal-footer">
            <button @click="closeManagerModal" class="btn-cancel">취소</button>
            <button @click="updateManager" class="btn-submit">변경 저장</button>
          </div>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon">
          <i class="mdi mdi-office-building-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">전체 현장</span>
          <span class="stat-value">{{ statsInfo.total }} <small>건</small></span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: var(--success); --card-bg: rgba(16, 185, 129, 0.1);">
        <div class="stat-icon">
          <i class="mdi mdi-check-circle-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">운영 중</span>
          <span class="stat-value">{{ statsInfo.active }} <small>건</small></span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon">
          <i class="mdi mdi-clock-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">준비 중</span>
          <span class="stat-value">{{ statsInfo.preparing }} <small>건</small></span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: var(--text-sub); --card-bg: var(--bg-hover);">
        <div class="stat-icon">
          <i class="mdi mdi-close-circle-outline"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">계약 종료</span>
          <span class="stat-value">{{ statsInfo.ended }} <small>건</small></span>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-filter-variant"></i> 상태
          </label>
          <select v-model="selectedStatus" class="filter-select">
            <option v-for="status in statusOptions" :key="status" :value="status">
              {{ status }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-office-building-cog-outline"></i> 현장 형태
          </label>
          <select v-model="selectedType" class="filter-select">
            <option v-for="type in typeOptions" :key="type" :value="type">
              {{ type }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-cash-register"></i> 과세 여부
          </label>
          <select v-model="selectedVat" class="filter-select">
            <option v-for="vat in vatOptions" :key="vat.value" :value="vat.value">
              {{ vat.label }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-account-cash-outline"></i> 청구 담당
          </label>
          <select v-model="selectedBilling" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="b in billingManager" :key="b.value" :value="b.value">
              {{ b.value }}
            </option>
          </select>
        </div>

        <div class="search-group" style="flex: 1;">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="searchTerm"
                placeholder="현장명으로 검색..."
                class="search-input"
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
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>데이터를 불러오는 중...</p>
    </div>

    <div class="table-card" v-if="!isLoading">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-table"></i>
          <span>현장 목록 ({{ filteredSites.length }}개)</span>
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
            <col width="5%">
            <col width="10%">
            <col width="*%">
            <col width="15%">
            <col width="4%">
            <col width="10%">
            <col width="4%">
            <col width="10%">
            <col width="4%">
            <col width="5%">
            <col width="5%">
          </colgroup>
          <thead>
          <tr>
            <th class="text-center" style="width: 40px;">
              <input type="checkbox" v-model="selectAll" class="custom-checkbox" />
            </th>
            <th @click="toggleSort('idx')" class="sortable resizable" style="width: 80px;">
              <div class="th-content">
                <span>ID</span>
                <i v-if="sortKey === 'idx'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('name')" class="sortable resizable">
              <div class="th-content">
                <span>현장명</span>
                <i v-if="sortKey === 'name'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('address')" class="sortable resizable">
              <div class="th-content">
                <span>주소</span>
                <i v-if="sortKey === 'address'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('contract')" class="sortable resizable" style="width: 220px;">
              <div class="th-content">
                <span>계약 기간</span>
                <i v-if="sortKey === 'contract'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('manager')" class="sortable resizable" style="width: 120px;">
              <div class="th-content">
                <span>본사 담당자</span>
                <i v-if="sortKey === 'manager'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="resizable">
              <div class="th-content"><span>본사 연락처</span></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('director')" class="sortable resizable" style="width: 120px;">
              <div class="th-content">
                <span>현장 담당자</span>
                <i v-if="sortKey === 'director'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="resizable">
              <div class="th-content"><span>현장 연락처</span></div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('billingManager')" class="sortable resizable" style="width: 120px;">
              <div class="th-content">
                <span>청구 담당자</span>
                <i v-if="sortKey === 'billingManager'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th @click="toggleSort('status')" class="sortable resizable" style="width: 120px;">
              <div class="th-content">
                <span>상태</span>
                <i v-if="sortKey === 'status'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
              <div class="resize-handle" @mousedown.stop="startResize"></div>
            </th>
            <th class="text-center">
              <div class="th-content justify-center">
                <span>관리</span>
              </div>
            </th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="site in pagedSiteList" :key="site.idx" class="data-row">
            <td class="text-center">
              <input type="checkbox" :value="site.idx" v-model="selectedSiteIds" class="custom-checkbox" />
            </td>
            <td>
              <span class="site-id">{{ site.idx }}</span>
            </td>
            <td>
              <div class="site-name-cell cursor-pointer" @click="goToDetail(site.idx)">
                <span class="site-name">{{ site.name }}</span>
              </div>
            </td>
            <td>
              <div class="address-cell">
                <i class="mdi mdi-map-marker-outline address-icon"></i>
                <span>{{ site.address }}</span>
              </div>
            </td>
            <td>
              <div class="contract-cell">
                <i class="mdi mdi-calendar-range contract-icon"></i>
                <span
                    v-if="site?.contracts?.length"
                    v-html="getContractPeriods(site)">
                </span>
                <span v-else class="text-muted">-</span>
              </div>
            </td>
            <td>
              <div class="manager-cell">
                <i class="mdi mdi-account-tie-outline manager-icon"></i>
                <span>{{ site.manager }}</span>
              </div>
            </td>
            <td><span>{{site.manager_phone}}</span></td>
            <td>
              <span>{{site.director}}</span>
            </td>
            <td><span>{{site.director_phone}}</span></td>
            <td><span>{{site.billingManager}}</span></td>
            <td>
                <span :class="[
                  'status-badge',
                  {
                    'status-active': site.status === '운영 중',
                    'status-preparing': site.status === '준비 중',
                    'status-inactive': site.status === '계약 종료'
                  }
                ]">
                  <i :class="[
                    'mdi',
                    site.status === '운영 중' ? 'mdi-check-circle-outline' :
                    site.status === '준비 중' ? 'mdi-clock-outline' :
                    'mdi-close-circle-outline'
                  ]"></i>
                  {{ site.status }}
                </span>
            </td>
            <td class="text-center">
              <div style="display: flex; gap:4px;">
                <button @click="goToDetail(site.idx)" class="btn-detail">
                  <i class="mdi mdi-eye"></i>
                  <span>상세</span>
                </button>
                <button @click="goRemove(site.idx)" class="btn-remove-cost">
                  <i class="mdi mdi-close"></i>
                </button>
              </div>
            </td>
          </tr>

          <tr v-if="filteredSites.length === 0" class="empty-row">
            <td colspan="12">
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

      <Pagination
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalCount="filteredSites.length"
          @change="handlePageChange"
      />
    </div>
  </div>
</template>

<style scoped>
/* =========================================
   페이지 고유 스타일 (공통 CSS 예외)
========================================= */

/* 결과 정보 배지 */
.result-info { padding-top: 16px; border-top: 1px solid var(--border-color); }
.info-badge {
  display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px;
  background: var(--primary-soft); color: var(--primary); border-radius: 6px; font-size: 12px; font-weight: 500;
}
.info-badge i { font-size: 15px; }

/* === 로딩 상태 === */
.loading-state {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 60px 20px; background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color);
}
.spinner {
  width: 40px; height: 40px; border: 3px solid var(--bg-canvas);
  border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.loading-state p { margin-top: 16px; font-size: 14px; color: var(--text-sub); }

/* === 테이블 컨트롤 영역 === */
.page-size-select {
  display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-sub);
}

/* === 테이블 레이아웃 보완 === */
.table-scroll-container {
  overflow-x: auto; overflow-y: visible; max-width: 100%;
  -webkit-overflow-scrolling: touch;
}
.table-scroll-container::-webkit-scrollbar { height: 8px; }
.table-scroll-container::-webkit-scrollbar-track { background: var(--bg-hover); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }

.th-content { display: flex; align-items: center; gap: 6px; justify-content: space-between; }
.th-content.justify-center { justify-content: center; }
.th-content i { font-size: 14px; opacity: 0.8; color: var(--text-muted); }
.sortable:hover .th-content i { color: var(--primary); opacity: 1;}

/* === 데이터 셀 스타일 === */
.site-id {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 40px; padding: 4px 8px; background: var(--bg-hover);
  border-radius: 6px; font-weight: 600; color: var(--text-sub); font-size: 12px;
}

.site-name-cell { display: flex; align-items: center; gap: 8px; }
.site-icon { font-size: 18px; color: var(--primary); }
.site-name { font-weight: 600; color: var(--text-main); }

.address-cell { display: flex; align-items: center; gap: 6px; color: var(--text-main); }
.address-icon { font-size: 16px; color: var(--text-muted); flex-shrink: 0; }

.contract-cell { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-main);}
.contract-icon { font-size: 16px; color: var(--text-muted); flex-shrink: 0; }

.manager-cell { display: flex; align-items: center; gap: 6px; color: var(--text-main); }
.manager-icon { font-size: 16px; color: var(--text-muted); flex-shrink: 0; }

/* === 상태 배지 === */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.status-badge i { font-size: 13px; }
.status-active { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-preparing { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }
.status-inactive { background-color: var(--bg-hover); color: var(--text-sub); }

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

/* === 반응형 === */
@media (max-width: 1024px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 16px;}
  .filter-row { flex-wrap: wrap; }
  .search-group { width: 100%; flex: 1 1 100%; }
}

@media (max-width: 768px) {
  .stats-grid { grid-template-columns: 1fr; gap: 12px;}
  .filter-row { flex-direction: column; align-items: stretch; gap: 12px;}
  .filter-group, .search-group { width: 100%; min-width: 100%; }

  /* 모바일 검색 영역 나란히 */
  .search-group { flex-direction: row; }
  .search-box { flex: 1; min-width: 0; }
  .btn-search { flex-shrink: 0; }
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

/* =========================================
   추가된 체크박스 및 모달 디자인
========================================= */

/* 일괄 변경 버튼 */
.btn-update {
  display: flex; align-items: center; gap: 6px; padding: 8px 14px;
  background: var(--bg-surface); color: var(--primary); border: 1px solid var(--primary);
  border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s;
}
.btn-update:hover { background: var(--primary-soft); }

/* 커스텀 체크박스 */
.custom-checkbox {
  width: 16px; height: 16px; cursor: pointer;
  accent-color: var(--primary);
}

/* 모달 관련 스타일 */
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.modal-container {
  background: var(--bg-surface); width: 400px; max-width: 90%;
  border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
  overflow: hidden; display: flex; flex-direction: column;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid var(--border-color);
}
.modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-main); }
.btn-close { background: none; border: none; font-size: 20px; color: var(--text-muted); cursor: pointer; }
.modal-body { padding: 20px; }
.modal-desc { font-size: 14px; color: var(--text-sub); margin-bottom: 16px; }

.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group label { font-size: 13px; font-weight: 600; color: var(--text-main); }

/* Input, Select 공통 */
.form-input, .form-select {
  padding: 10px 12px; border: 1px solid var(--border-color); border-radius: 6px;
  font-size: 14px; outline: none; background: var(--bg-canvas); color: var(--text-main);
}
.form-input:focus, .form-select:focus {
  border-color: var(--primary); box-shadow: 0 0 0 2px var(--primary-soft);
}

.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 16px 20px; border-top: 1px solid var(--border-color); background: var(--bg-hover);
}
.btn-cancel {
  padding: 8px 16px; background: white; border: 1px solid var(--border-color);
  border-radius: 6px; color: var(--text-sub); font-weight: 600; cursor: pointer;
}
.btn-submit {
  padding: 8px 16px; background: var(--primary); border: none;
  border-radius: 6px; color: white; font-weight: 600; cursor: pointer;
}
.btn-submit:hover { background: var(--primary-hover); }
.mt-3 { margin-top: 12px; }
</style>
