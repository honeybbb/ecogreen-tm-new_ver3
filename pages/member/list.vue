<script setup>
import { ref, computed, onMounted, onActivated } from 'vue';
import axios from 'axios';
import { useRouter } from 'nuxt/app';
import Pagination from '@/components/Pagination.vue'
import SiteSelect from "~/components/SiteSelect.vue";
import { useTableResize } from '@/composables/useTableResize';
const { startResize } = useTableResize();

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
const selectedStatus   = ref('전체');

// 입사일 기간 필터 상태 추가
const filterStartDate = ref('');
const filterEndDate   = ref('');

const filterNoPension    = ref(false); // 만 60세 이상
const filterNoEmployment = ref(false); // 만 65세 이상
const filterDisability = ref(false);
const filterForeigner  = ref(false);
const filterActive = ref(false); //재직중

const sortKey   = ref('id');
const sortOrder = ref('asc');

const members   = ref([]);
const isLoading = ref(false);
const error     = ref(null);

const showRRN = ref(false);
const revealedRRNs = ref({});
const rrnLoading = ref(false);

// ── 페이지네이션 상태 ──────────────────────────────
const currentPage = ref(1);
const pageSize    = ref(50); // 한 페이지당 행 수
const pageSizeOptions = [50, 100, 200, 500];

const ageLimits = ref({ pension: 0, employment: 0 }); //4대보험 상한 연령 상태

const fetchOverAgeOption = async () => {
  const groupCd = '02003';

  try {
    const res = await axios.get(`/api/v1/code/group/${groupCd}`);
    const codes = res.data.data || [];

    // (항목명에 특정 단어가 포함된 것을 찾아 option 값을 매핑)
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

const toggleRRN = async () => {
  // 숨기기
  if (showRRN.value) {
    showRRN.value = false;
    revealedRRNs.value = {}; // 메모리에서도 제거
    return;
  }

  if (!confirm('주민번호 전체를 표시합니다. 계속하시겠습니까?')) return;

  rrnLoading.value = true;
  try {
    const mIdxList = pagedMembers.value.map(m => m.idx);
    const res = await axios.post('/api/v1/member/rrn/batch', { mIdxList });

    if (!res.data.result) {
      alert('주민번호 조회 권한이 없습니다.');
      return;
    }

    revealedRRNs.value = res.data.data; // { 101: '900101-1234567', ... }
    showRRN.value = true;
  } catch (e) {
    alert('주민번호 조회 중 오류가 발생했습니다.');
  } finally {
    rrnLoading.value = false;
  }
};

// 페이지 변경 시 토글 자동 해제 (다른 페이지 직원은 조회 안 된 상태라서)
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
  return member.rrn; // 마스킹값 (900101-1*****)
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
  selectedStatus.value   = '전체';
  filterStartDate.value  = '';
  filterEndDate.value    = '';
  filterNoPension.value    = false;
  filterNoEmployment.value = false;
  filterDisability.value = false;
  filterForeigner.value  = false;
  filterActive.value = false;
  currentPage.value = 1;
};

const filteredMembers = computed(() => {
  let result = members.value.filter(member => {
    const siteMatch  = selectedSite.value === '전체' || String(member.sIdx) === String(selectedSite.value);
    const searchMatch = member.name.toLowerCase().includes(searchTerm.value.toLowerCase());
    const typeMatch  = selectedType.value === '전체' || member.type === selectedType.value;
    const dateMatch =
        (!filterStartDate.value || member.inDate >= filterStartDate.value) &&
        (!filterEndDate.value   || member.inDate <= filterEndDate.value);

    const pensionMatch    = !filterNoPension.value    || calculateAge(member.birthDt) >= ageLimits.value.pension;
    const employmentMatch = !filterNoEmployment.value || calculateAge(member.birthDt) >= ageLimits.value.employment

    const disaMatch  = !filterDisability.value || member.disability === 'Y' || member.disability === true;
    const foreMatch  = !filterForeigner.value  || member.foreigner  === 'Y' || member.foreigner  === true;
    //const activeMatch = !filterActive.value || member.status == '재직';
    const activeMatch = selectedStatus.value === '전체' || member.status == selectedStatus.value;

    return siteMatch && searchMatch && typeMatch &&
        dateMatch && pensionMatch && employmentMatch &&
        disaMatch && foreMatch && activeMatch;
  });

  // 기본 정렬 (idx asc, sIdx desc)
  // 기본 정렬 (idx asc, sIdx desc) 부분을 이렇게 교체
  result.sort((a, b) => {
    // 1. 현장 내림차순
    if (a.sIdx !== b.sIdx) return Number(b.sIdx) - Number(a.sIdx);

    // 2. 직책 sort 오름차순 (null/undefined는 가장 뒤로)
    const sortA = a.sort != null ? Number(a.sort) : 999999;
    const sortB = b.sort != null ? Number(b.sort) : 999999;
    if (sortA !== sortB) return sortA - sortB;

    // 3. idx 오름차순
    return Number(a.idx) - Number(b.idx);
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
  noPension:    filteredMembers.value.filter(m => calculateAge(m.birthDt) >= 60).length,
  noEmployment: filteredMembers.value.filter(m => calculateAge(m.birthDt) >= 65).length,
  disability: filteredMembers.value.filter(m => m.disability === 'Y' || m.disability === true).length,
  foreigner:  filteredMembers.value.filter(m => m.foreigner  === 'Y' || m.foreigner  === true).length,
}));

// ── 페이지네이션 computed ──────────────────────────
const pagedMembers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredMembers.value.slice(start, start + pageSize.value);
});

// 페이지 이동 시 처리할 로직 (스크롤 상단 이동 등)
const handlePageChange = () => {
  document.querySelector('.table-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  await Promise.all([
    fetchSiteOptions(),
    fetchTypeOptions(),
    fetchDisabledOptions(),
    fetchOverAgeOption()
  ]);
});

// 페이지가 활성화될 때마다 실행
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
          <label class="filter-label"><i class="mdi mdi-office-building"></i> 근무 현장</label>
          <!--select v-model="selectedSite" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select-->
          <SiteSelect v-model="selectedSite" />
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-account-box"></i> 구분</label>
          <select v-model="selectedType" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemCd" :value="opt.itemNm">{{ opt.itemNm }}</option>
          </select>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-account-check"></i> 재직 상태</label>
          <select v-model="selectedStatus" class="filter-select" @change="onFilterChange">
            <option value="전체">전체</option>
            <option value="0">재직</option>
            <option value="1">퇴사</option>
            <option value="2">일용직</option>
            <option value="3">대근</option>
            </select>
        </div>
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-calendar-range"></i> 입사 기간</label>
          <div class="date-range-inputs">
            <input type="date" v-model="filterStartDate" @change="onFilterChange" class="filter-select date-input" />
            <span class="date-separator">~</span>
            <input type="date" v-model="filterEndDate" @change="onFilterChange" class="filter-select date-input" />
          </div>
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
          <!--label class="toggle-chip" :class="{ active: filterActive }">
            <input type="checkbox" v-model="filterActive" @change="onFilterChange">
            <i class="mdi mdi-account-check"></i><span>재직중</span>
          </label-->
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
          <!--i class="mdi mdi-table"></i-->
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
          <colgroup>
            <col width="3%">
            <col width="*%">
            <col width="2%">
            <col width="2%">
            <col width="5%">
            <col width="3%">
            <col width="2%">
            <col width="3%">
            <col width="5%">
            <col width="10%">
            <col width="10%">
            <col width="5%">
            <col width="5%">
            <col width="10%">
            <col width="10%">
            <col width="5%">
            <col width="5%">
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
            <th class="resizable">
              <div class="th-content">근로계약일</div>
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
          <tr v-for="member in pagedMembers" :key="member.idx" class="data-row">
            <td>{{ member.id }}</td>
            <td class="cell-ellipsis" :title="member.siteName">{{ member.siteName }}</td>
            <td class="member-name" @click="goToDetail(member.id)">{{ member.name }}</td>
            <td>{{ member.position }}</td>
            <td>{{member.contract}}</td>
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
            <td>{{ formatDate(member.inDate) }}</td>
            <td>{{ formatDate(member.outDate) }}</td>
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

      <Pagination
          v-model:currentPage="currentPage"
          v-model:pageSize="pageSize"
          :totalCount="filteredMembers.length"
          @change="handlePageChange"
      />

    </div>
  </div>
</template>

<style scoped>
/* 페이지 부가 설정 */
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

.btn-rrn-toggle {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 600;
  border: 1px solid var(--border-color); background: var(--bg-surface);
  color: var(--text-sub); cursor: pointer; transition: .2s;
}
.btn-rrn-toggle:hover { border-color: var(--warning); color: var(--warning); }
.btn-rrn-toggle.active { background: rgba(245,158,11,.1); border-color: var(--warning); color: #b45309; }
.btn-rrn-toggle:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── 상태 배지 ── */
.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
}
.status-active   { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-inactive { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }
.status-preparing { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }

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

.date-range-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}
.date-input {
  width: 130px; /* 날짜 입력창 크기에 맞게 조절 */
  cursor: pointer;
}
.date-separator {
  color: var(--text-sub);
  font-weight: bold;
}

/* ── 컬럼 리사이즈 ── */
.resizable {
  position: relative;
  overflow: hidden; /* 셀 내용이 핸들을 밀지 않도록 */
}

.resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 6px;
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

/* ── 현장 컬럼 기본 너비 및 말줄임표 ── */
.col-site {
  min-width: 80px;
  max-width: 160px;
  width: 120px;
}

/* td 말줄임표 (현장 등 긴 텍스트 컬럼에 적용) */
.cell-ellipsis {
  max-width: 0;          /* table-layout: fixed 와 함께 동작 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
