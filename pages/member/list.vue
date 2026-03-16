<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useRouter } from 'nuxt/app';

const router = useRouter();
const {
  siteOptions,
  typeOptions,
  disabledOptions,
  fetchSiteOptions,
  fetchTypeOptions,
  fetchDisabledOptions,
} = useApi();

// ── 상태 ──────────────────────────────────────────
const searchTerm     = ref('');
const selectedSite   = ref('전체');
const selectedType   = ref('전체');

const filterOver65     = ref(false);
const filterDisability = ref(false);
const filterForeigner  = ref(false);

const sortKey   = ref('id');
const sortOrder = ref('asc');

const members   = ref([]);
const isLoading = ref(false);
const error     = ref(null);

// ── 페이지네이션 상태 ──────────────────────────────
const currentPage = ref(1);
const pageSize    = ref(50); // 한 페이지당 행 수
const pageSizeOptions = [50, 100, 200, 500];

const fetchMembers = async () => {
  isLoading.value = true;
  error.value = null;
  try {
    const res = await axios.get('/api/v1/member/list');
    members.value = res.data.data || [];
  } catch (e) {
    console.error('직원 목록 로드 실패:', e);
    error.value = '직원 목록을 불러오는 중 오류가 발생했습니다.';
    members.value = [];
  } finally {
    isLoading.value = false;
  }
};

// ── 정렬 ──────────────────────────────────────────
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
  currentPage.value = 1;
};

// ── 필터 초기화 ────────────────────────────────────
const resetFilters = () => {
  searchTerm.value     = '';
  selectedSite.value   = '전체';
  selectedType.value   = '전체';
  filterOver65.value     = false;
  filterDisability.value = false;
  filterForeigner.value  = false;
  currentPage.value = 1;
};

const filteredMembers = computed(() => {
  let result = members.value.filter(member => {
    const siteMatch  = selectedSite.value === '전체' || String(member.sIdx) === String(selectedSite.value);
    const searchMatch = member.name.toLowerCase().includes(searchTerm.value.toLowerCase());
    const typeMatch  = selectedType.value === '전체' || member.type === selectedType.value;
    const ageMatch   = !filterOver65.value     || calculateAge(member.birthDt) >= 65;
    const disaMatch  = !filterDisability.value || member.disability === 'Y' || member.disability === true;
    const foreMatch  = !filterForeigner.value  || member.foreigner  === 'Y' || member.foreigner  === true;
    return siteMatch && searchMatch && typeMatch && ageMatch && disaMatch && foreMatch;
  });

  // 기본 정렬 (idx asc, sIdx desc)
  result.sort((a, b) => {
    if (a.idx !== b.idx) return a.idx - b.idx;
    return b.sIdx - a.sIdx;
  });

  // 사용자 정렬
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

// ── 통계 ──────────────────────────────────────────
const statsInfo = computed(() => ({
  total:      filteredMembers.value.length,
  active:     filteredMembers.value.filter(m => m.status === '재직').length,
  over65:     filteredMembers.value.filter(m => calculateAge(m.birthDt) >= 65).length,
  disability: filteredMembers.value.filter(m => m.disability === 'Y' || m.disability === true).length,
  foreigner:  filteredMembers.value.filter(m => m.foreigner  === 'Y' || m.foreigner  === true).length,
}));

// ── 페이지네이션 computed ──────────────────────────
const totalPages = computed(() => Math.ceil(filteredMembers.value.length / pageSize.value));

const pagedMembers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredMembers.value.slice(start, start + pageSize.value);
});

// 페이지 번호 배열 (최대 5개 버튼)
const pageNumbers = computed(() => {
  const total = totalPages.value;
  const cur   = currentPage.value;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = [];
  const delta = 2;
  const left  = Math.max(2, cur - delta);
  const right = Math.min(total - 1, cur + delta);

  pages.push(1);
  if (left > 2)      pages.push('...');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('...');
  pages.push(total);
  return pages;
});

const goToPage = (page) => {
  if (typeof page === 'number' && page >= 1 && page <= totalPages.value) {
    currentPage.value = page;
    // 테이블 상단으로 스크롤
    document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
};

// 필터 변경 시 첫 페이지로
const onFilterChange = () => { currentPage.value = 1; };

// ── 유틸 ──────────────────────────────────────────
const getDisabilityStyle = (grade) => {
  const opt = disabledOptions.value.find(o => o.itemNm == grade);
  return {
    // backgroundColor: opt?.option ? `var(--primary-soft)` : 'var(--bg-hover)',
    // color: opt?.option ? `var(--primary)` : 'var(--text-sub)',
    backgroundColor: opt?.option || 'var(--bg-hover)',
    color: 'var(--bg-surface)',
    border: 'none',
  };
};

const goToRegister = () => router.push('/member/register');
const goToDetail   = (id) => router.push(`/member/${id}`);

onMounted(async () => {
  await Promise.all([fetchSiteOptions(), fetchTypeOptions(), fetchDisabledOptions()]);
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
      <div class="stat-card" style="--card-color: var(--danger); --card-bg: rgba(239, 68, 68, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-account-clock"></i></div>
        <div class="stat-content">
          <span class="stat-label">65세 이상</span>
          <span class="stat-value">{{ statsInfo.over65 }} <small>명</small></span>
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
          <label class="filter-label"><i class="mdi mdi-office-building"></i> 근무 현장</label>
          <select v-model="selectedSite" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-account-box"></i> 구분</label>
          <select v-model="selectedType" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemNm">{{ opt.itemNm }}</option>
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
          <label class="toggle-chip" :class="{ active: filterOver65 }">
            <input type="checkbox" v-model="filterOver65" @change="onFilterChange">
            <i class="mdi mdi-account-clock"></i><span>65세 이상</span>
          </label>
          <label class="toggle-chip" :class="{ active: filterDisability }">
            <input type="checkbox" v-model="filterDisability" @change="onFilterChange">
            <i class="mdi mdi-wheelchair-accessibility"></i><span>장애인</span>
          </label>
          <label class="toggle-chip" :class="{ active: filterForeigner }">
            <input type="checkbox" v-model="filterForeigner" @change="onFilterChange">
            <i class="mdi mdi-earth"></i><span>외국인</span>
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
          <i class="mdi mdi-table"></i>
          <span>직원 목록 ({{ filteredMembers.length }}명)</span>
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
          <thead>
          <tr>
            <th @click="toggleSort('id')" class="sortable">
              <div class="th-content">ID <i v-if="sortKey==='id'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th @click="toggleSort('name')" class="sortable">
              <div class="th-content">이름 <i v-if="sortKey==='name'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th @click="toggleSort('siteName')" class="sortable">
              <div class="th-content">현장 <i v-if="sortKey==='siteName'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th @click="toggleSort('position')" class="sortable">
              <div class="th-content">직책 <i v-if="sortKey==='position'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th @click="toggleSort('gender')" class="sortable">
              <div class="th-content">성별 <i v-if="sortKey==='gender'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th @click="toggleSort('birthDt')" class="sortable">
              <div class="th-content">나이 <i v-if="sortKey==='birthDt'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th>내/외국인</th>
            <th>장애여부</th>
            <th @click="toggleSort('inDate')" class="sortable">
              <div class="th-content">입사일 <i v-if="sortKey==='inDate'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th @click="toggleSort('outDate')" class="sortable">
              <div class="th-content">퇴사일 <i v-if="sortKey==='outDate'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th class="text-center">4대보험</th>
            <th class="text-center">퇴직연금</th>
            <th>계좌번호</th>
            <th @click="toggleSort('status')" class="sortable">
              <div class="th-content">상태 <i v-if="sortKey==='status'" :class="['mdi', sortOrder==='asc'?'mdi-arrow-up':'mdi-arrow-down']"></i></div>
            </th>
            <th class="text-center">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="member in pagedMembers" :key="member.idx" class="data-row">
            <td>{{ member.id }}</td>
            <td class="member-name" @click="goToDetail(member.id)">{{ member.name }}</td>
            <td>{{ member.siteName }}</td>
            <td>{{ member.position }}</td>
            <td>{{ member.gender === 'M' ? '남' : '여' }}</td>
            <td
                :class="{ 'age-warning': calculateAge(member.birthDt) >= 65 }"
                :title="calculateAge(member.birthDt) >= 65 ? '고용보험 가입 제외 대상 (만 65세 이상)' : ''">
              {{ calculateAge(member.birthDt) ? calculateAge(member.birthDt) + '세' : '-' }}
            </td>
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
            <td>{{ formatDate(member.inDate) }}</td>
            <td>{{ formatDate(member.outDate) }}</td>
            <td class="text-center">
              <i v-if="member.four_ins === 'Y' || member.four_ins === true" class="mdi mdi-check-circle check-icon"></i>
              <i v-else class="mdi mdi-close-circle uncheck-icon"></i>
            </td>
            <td class="text-center">
              <i v-if="member.retire_pension === 'Y' || member.retire_pension === true" class="mdi mdi-check-circle check-icon"></i>
              <i v-else class="mdi mdi-close-circle uncheck-icon"></i>
            </td>
            <td>
              <div v-if="member.accountNo" class="account-info">
                <span class="bank-badge">{{ member.bank }}</span>
                <span class="account-number">{{ member.accountNo }}</span>
              </div>
              <span v-else class="text-gray">-</span>
            </td>
            <td>
                <span :class="['status-badge', member.status === '재직' ? 'status-active' : 'status-inactive']">
                  <i :class="['mdi', member.status === '재직' ? 'mdi-check-circle' : 'mdi-close-circle']"></i>
                  {{ member.status }}
                </span>
            </td>
            <td class="text-center">
              <button @click="goToDetail(member.id)" class="btn-detail">
                <i class="mdi mdi-eye"></i><span>상세</span>
              </button>
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

      <div class="pagination-bar" v-if="totalPages > 1">
        <span class="pagination-info">
          {{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, filteredMembers.length) }} / 총 {{ filteredMembers.length }}명
        </span>

        <div class="pagination-controls">
          <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(1)" title="처음">
            <i class="mdi mdi-chevron-double-left"></i>
          </button>
          <button class="page-btn" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)" title="이전">
            <i class="mdi mdi-chevron-left"></i>
          </button>

          <template v-for="p in pageNumbers" :key="p">
            <span v-if="p === '...'" class="page-ellipsis">…</span>
            <button
                v-else
                class="page-btn"
                :class="{ active: p === currentPage }"
                @click="goToPage(p)"
            >{{ p }}</button>
          </template>

          <button class="page-btn" :disabled="currentPage === totalPages" @click="goToPage(currentPage + 1)" title="다음">
            <i class="mdi mdi-chevron-right"></i>
          </button>
          <button class="page-btn" :disabled="currentPage === totalPages" @click="goToPage(totalPages)" title="마지막">
            <i class="mdi mdi-chevron-double-right"></i>
          </button>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* 페이지 및 테이블 부가 설정 (공통 CSS 이외의 것들만 유지) */
.page-size-select {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-sub);
}

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

/* ── 테이블 내 텍스트/아이콘 색상 ── */
.member-name {
  font-weight: 600;
  color: var(--primary);
  cursor: pointer;
}
.member-name:hover { text-decoration: underline; }

.age-warning { color: var(--danger) !important; font-weight: 600; }

.check-icon   { font-size: 18px; color: var(--success); }
.uncheck-icon { font-size: 18px; color: var(--text-muted); }

/* ── 배지 ── */
.badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 8px; border-radius: 6px;
  font-size: 11px; font-weight: 600; white-space: nowrap;
}
.badge i { font-size: 13px; }
.badge-foreigner { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); } /* 외국인: Warning 계열 */

/* ── 툴팁 ── */
.tooltip-container { position: relative; cursor: help; }
.tooltip-text {
  visibility: hidden; opacity: 0;
  position: absolute; bottom: 130%; left: 50%; transform: translateX(-50%);
  background: var(--header-bg); color: var(--text-inverse);
  padding: 8px 12px; border-radius: 6px;
  font-size: 11px; line-height: 1.6; white-space: nowrap;
  z-index: 100; box-shadow: var(--shadow-md);
  transition: opacity 0.15s;
  pointer-events: none;
}
.tooltip-text::after {
  content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
  border: 5px solid transparent; border-top-color: var(--header-bg);
}
.tooltip-container:hover .tooltip-text { visibility: visible; opacity: 1; }

.warning-dot {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; background: var(--danger);
  color: var(--text-inverse); border-radius: 50%; margin-left: 4px;
}
.warning-dot i { font-size: 9px; }
.text-warning-red { color: var(--danger) !important; font-weight: 600; }

/* ── 계좌 ── */
.account-info { display: flex; align-items: center; gap: 8px; }
.bank-badge {
  padding: 2px 7px; background: var(--bg-canvas); border-radius: 4px; border: 1px solid var(--border-color);
  font-size: 11px; font-weight: 600; color: var(--text-sub); white-space: nowrap;
}
.account-number { font-size: 12px; color: var(--text-main); }

/* ── 상태 배지 ── */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
}
.status-active   { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-inactive { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }

/* ── 페이지네이션 ── */
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-hover);
  flex-wrap: wrap;
  gap: 12px;
}

.pagination-info {
  font-size: 13px;
  color: var(--text-sub);
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.page-btn {
  min-width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-color); border-radius: 7px;
  background: var(--bg-surface); color: var(--text-sub);
  font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.15s;
  padding: 0 6px;
}
.page-btn:hover:not(:disabled) {
  background: var(--primary-soft); border-color: var(--primary); color: var(--primary);
}
.page-btn.active {
  background: var(--primary); border-color: var(--primary);
  color: var(--text-inverse); font-weight: 700;
}
.page-btn:disabled {
  opacity: 0.35; cursor: not-allowed;
}
.page-btn i { font-size: 16px; }

.page-ellipsis {
  min-width: 30px; text-align: center;
  font-size: 14px; color: var(--text-muted); letter-spacing: 1px;
}

/* 상태 표시 컴포넌트들 */
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

/* ── 반응형 ── */
@media (max-width: 600px) {
  .pagination-bar { justify-content: center; }
  .pagination-info { width: 100%; text-align: center; }
}
</style>
