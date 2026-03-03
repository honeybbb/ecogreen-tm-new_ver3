<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useRouter } from 'nuxt/app';

const router = useRouter();
const {
  siteOptions,
  typeOptions,
  fetchSiteOptions,
  fetchTypeOptions
} = useApi();

// 1. 상태 및 검색 조건
const searchTerm = ref('');
const selectedSite = ref('전체');
const selectedType = ref('전체');
const disabilityOptions = ref([]);

const filterOver65 = ref(false);
const filterDisability = ref(false);
const filterForeigner = ref(false);

// 2. 정렬 관련 상태
const sortKey = ref('id');
const sortOrder = ref('asc');

// 3. 직원 목록 데이터
const members = ref([]);
const isLoading = ref(false);
const error = ref(null);

const fetchDisabilityOptions = async (groupCd = '02002') => {
  try {
    const res = await axios.get(`/api/v1/code/${groupCd}`);
    disabilityOptions.value = res.data.data || [];
  } catch (e) {
    console.error("장애 코드 로드 실패:", e);
  }
};

const getDisabilityStyle = (grade) => {
  const option = disabilityOptions.value.find(opt => opt.itemCd === grade);

  return {
    backgroundColor: option?.color || '#ede9fe',
    color: option?.color ? '#ffffff' : '#5b21b6',
    border: 'none'
  };
};

// 4. API 데이터 호출
const fetchMembers = async () => {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await axios.get('/api/v1/member/list');
    if (response.data.data.length > 0) {
      console.log(response.data.data);
      members.value = response.data.data;
    } else {
      members.value = [];
      console.error("API 응답 구조가 예상과 다릅니다.", response.data);
    }
  } catch (e) {
    console.error("직원 목록을 가져오는 데 실패했습니다:", e);
    error.value = '직원 목록을 불러오는 중 오류가 발생했습니다.';
    members.value = [];
  } finally {
    isLoading.value = false;
  }
};

// 5. 정렬 토글 핸들러
const toggleSort = (key) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

// 6. 필터링 + 정렬된 결과 계산
const filteredMembers = computed(() => {
  let result = members.value.filter(member => {
    const siteMatch = selectedSite.value === '전체' || member.sIdx === selectedSite.value;
    const searchMatch = member.name.toLowerCase().includes(searchTerm.value.toLowerCase());
    const typeMatch = selectedType.value === '전체' || member.type === selectedType.value;

    let ageMatch = true;
    if (filterOver65.value) {
      ageMatch = calculateAge(member.birthDt) >= 65;
    }

    let disabilityMatch = true;
    if (filterDisability.value) {
      disabilityMatch = member.disability === 'Y' || member.disability === true;
    }

    let foreignerMatch = true;
    if (filterForeigner.value) {
      foreignerMatch = member.foreigner === 'Y' || member.foreigner === true;
    }

    return siteMatch && searchMatch && typeMatch && ageMatch && disabilityMatch && foreignerMatch;
  });

  result.sort((a, b) => {
    if (a.idx !== b.idx) {
      return a.idx - b.idx;
    }
    if (a.sIdx !== b.sIdx) {
      return b.sIdx - a.sIdx;
    }
    return 0;
  });

  if (sortKey.value !== 'id') {
    result.sort((a, b) => {
      let modifier = sortOrder.value === 'asc' ? 1 : -1;
      let valA = a[sortKey.value];
      let valB = b[sortKey.value];

      if (typeof valA === 'string' && typeof valB === 'string') {
        return valA.localeCompare(valB) * modifier;
      }

      if (valA < valB) return -1 * modifier;
      if (valA > valB) return  1 * modifier;
      return 0;
    });
  }

  return result;
});

// 통계 정보
const statsInfo = computed(() => {
  const total = filteredMembers.value.length;
  const active = filteredMembers.value.filter(m => m.status === '재직').length;
  const over65 = filteredMembers.value.filter(m => calculateAge(m.birthDt) >= 65).length;
  const disability = filteredMembers.value.filter(m => m.disability === 'Y' || m.disability === true).length;
  const foreigner = filteredMembers.value.filter(m => m.foreigner === 'Y' || m.foreigner === true).length;

  return { total, active, over65, disability, foreigner };
});

// 7. 이벤트 핸들러
const handleSearch = () => {
  fetchMembers();
};

const goToRegister = () => router.push('/member/register');
const goToDetail = (id) => router.push(`/member/${id}`);

const refreshData = () => {
  fetchMembers();
};

onMounted(() => {
  fetchMembers();
  fetchSiteOptions();
  fetchTypeOptions();
  fetchDisabilityOptions();
});
</script>

<template>
  <div class="member-list-page">
    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-account-multiple"></i>
          직원 명부 관리
        </h1>
        <p class="page-subtitle">전체 직원 정보를 조회하고 관리합니다</p>
      </div>
      <div class="header-actions">
        <button @click="refreshData" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
        <button @click="goToRegister" class="btn-add">
          <i class="mdi mdi-account-plus"></i>
          <span>직원 등록</span>
        </button>
      </div>
    </div>

    <!-- 통계 카드 -->
    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #667eea;">
        <div class="stat-icon">
          <i class="mdi mdi-account-group"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">전체 직원</span>
          <span class="stat-value">{{ statsInfo.total }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #10b981;">
        <div class="stat-icon">
          <i class="mdi mdi-account-check"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">재직 중</span>
          <span class="stat-value">{{ statsInfo.active }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #ef4444;">
        <div class="stat-icon">
          <i class="mdi mdi-account-clock"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">65세 이상</span>
          <span class="stat-value">{{ statsInfo.over65 }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #8b5cf6;">
        <div class="stat-icon">
          <i class="mdi mdi-wheelchair-accessibility"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">장애인</span>
          <span class="stat-value">{{ statsInfo.disability }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #f59e0b;">
        <div class="stat-icon">
          <i class="mdi mdi-earth"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">외국인</span>
          <span class="stat-value">{{ statsInfo.foreigner }}</span>
        </div>
      </div>
    </div>

    <!-- 검색 및 필터 패널 -->
    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-office-building"></i>
            근무 현장
          </label>
          <select v-model="selectedSite" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
              {{ site.name }}
            </option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">
            <i class="mdi mdi-account-box"></i>
            구분
          </label>
          <select v-model="selectedType" class="filter-select">
            <option value="전체">전체</option>
            <option v-for="opt in typeOptions" :key="opt.itemNm" :value="opt.itemNm">
              {{ opt.itemNm }}
            </option>
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
                @keyup.enter="handleSearch"
            />
            <button v-if="searchTerm" @click="searchTerm = ''" class="search-clear">
              <i class="mdi mdi-close"></i>
            </button>
          </div>
          <button @click="handleSearch" class="btn-search">
            <i class="mdi mdi-magnify"></i>
            <span>검색</span>
          </button>
        </div>
      </div>

      <!-- 필터 토글 -->
      <div class="filter-toggles-row">
        <span class="toggles-label">
          <i class="mdi mdi-filter-variant"></i>
          빠른 필터:
        </span>
        <div class="filter-toggles">
          <label class="toggle-chip" :class="{ active: filterOver65 }">
            <input type="checkbox" v-model="filterOver65">
            <i class="mdi mdi-account-clock"></i>
            <span>65세 이상</span>
          </label>

          <label class="toggle-chip" :class="{ active: filterDisability }">
            <input type="checkbox" v-model="filterDisability">
            <i class="mdi mdi-wheelchair-accessibility"></i>
            <span>장애인</span>
          </label>

          <label class="toggle-chip" :class="{ active: filterForeigner }">
            <input type="checkbox" v-model="filterForeigner">
            <i class="mdi mdi-earth"></i>
            <span>외국인</span>
          </label>
        </div>
      </div>
    </div>

    <!-- 로딩 및 에러 -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>데이터를 불러오는 중...</p>
    </div>

    <div v-if="error" class="error-state">
      <i class="mdi mdi-alert-circle"></i>
      <p>{{ error }}</p>
    </div>

    <!-- 테이블 -->
    <div class="table-card" v-if="!isLoading">
      <div class="table-header">
        <div class="table-title">
          <i class="mdi mdi-table"></i>
          <span>직원 목록 ({{ filteredMembers.length }}명)</span>
        </div>
      </div>

      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th @click="toggleSort('id')" class="sortable">
              <div class="th-content">
                <span>ID</span>
                <i v-if="sortKey === 'id'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('name')" class="sortable">
              <div class="th-content">
                <span>이름</span>
                <i v-if="sortKey === 'name'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('siteName')" class="sortable">
              <div class="th-content">
                <span>현장</span>
                <i v-if="sortKey === 'siteName'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('position')" class="sortable">
              <div class="th-content">
                <span>직책</span>
                <i v-if="sortKey === 'position'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('gender')" class="sortable">
              <div class="th-content">
                <span>성별</span>
                <i v-if="sortKey === 'gender'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('age')" class="sortable">
              <div class="th-content">
                <span>나이</span>
                <i v-if="sortKey === 'age'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('isForeigner')" class="sortable">
              <div class="th-content">
                <span>내/외국인</span>
                <i v-if="sortKey === 'isForeigner'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('isDisabled')" class="sortable">
              <div class="th-content">
                <span>장애여부</span>
                <i v-if="sortKey === 'isDisabled'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('joinDate')" class="sortable">
              <div class="th-content">
                <span>입사일</span>
                <i v-if="sortKey === 'joinDate'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th @click="toggleSort('resignDate')" class="sortable">
              <div class="th-content">
                <span>퇴사일</span>
                <i v-if="sortKey === 'resignDate'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="text-center">
              <div class="th-content">
                <span>4대보험</span>
              </div>
            </th>
            <th class="text-center">
              <div class="th-content">
                <span>퇴직연금</span>
              </div>
            </th>
            <th>
              <div class="th-content">
                <span>계좌번호</span>
              </div>
            </th>
            <th @click="toggleSort('status')" class="sortable">
              <div class="th-content">
                <span>상태</span>
                <i v-if="sortKey === 'status'" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
              </div>
            </th>
            <th class="text-center sticky-col">
              <div class="th-content">
                <span>관리</span>
              </div>
            </th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="member in filteredMembers" :key="member.id" class="data-row">
            <td>{{ member.id }}</td>
            <td class="member-name">{{ member.name }}</td>
            <td>{{ member.siteName }}</td>
            <td>{{ member.position }}</td>
            <td>{{ member.gender == 'M' ? '남':'여' || '-' }}</td>
            <td
                :class="{ 'age-warning': calculateAge(member.birthDt) >= 65 }"
                :title="calculateAge(member.birthDt) >= 65 ? '고용보험 가입 제외 대상 (만 65세 이상)' : ''"
            >
              {{ calculateAge(member.birthDt) ? calculateAge(member.birthDt) + '세' : '-' }}
            </td>
            <td>
                <span
                    v-if="member.foreigner === 'Y' || member.foreigner === true"
                    class="badge badge-foreigner tooltip-container"
                >
                  <i class="mdi mdi-earth"></i>
                  외국인
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
                <span
                    v-if="member.disability === 'Y' || member.disability === true"
                    class="badge badge-disability tooltip-container"
                    :style="{
                    'background-color': member.disability_grade ? member.badgeColor : '',
                    'color': '#fff'
                  }"
                >
                  <i class="mdi mdi-wheelchair-accessibility"></i>
                  장애
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
              <div class="checkbox-wrapper">
                <input
                    type="checkbox"
                    :checked="member.four_ins === 'Y' || member.four_ins === true"
                    disabled
                />
                <i v-if="member.four_ins === 'Y' || member.four_ins === true" class="mdi mdi-check-circle check-icon"></i>
                <i v-else class="mdi mdi-close-circle uncheck-icon"></i>
              </div>
            </td>
            <td class="text-center">
              <div class="checkbox-wrapper">
                <input
                    type="checkbox"
                    :checked="member.retire_pension === 'Y' || member.retire_pension === true"
                    disabled
                />
                <i v-if="member.retire_pension === 'Y' || member.retire_pension === true" class="mdi mdi-check-circle check-icon"></i>
                <i v-else class="mdi mdi-close-circle uncheck-icon"></i>
              </div>
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
            <td class="text-center sticky-col">
              <button @click="goToDetail(member.id)" class="btn-detail">
                <i class="mdi mdi-eye"></i>
                <span>상세</span>
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
    </div>
  </div>
</template>

<style scoped>
/* Material Design Icons */
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 기본 레이아웃 === */
.member-list-page {
  padding: 0;
}

/* === 페이지 헤더 === */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}

.header-left {
  flex: 1;
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

.btn-refresh,
.btn-add {
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

.btn-refresh {
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.btn-refresh:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-add {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-add:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.btn-refresh i,
.btn-add i {
  font-size: 18px;
}

/* === 통계 카드 === */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  margin-bottom: 28px;
}

.stat-card {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 16px;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--card-color);
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: var(--card-color);
  opacity: 0.1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.stat-icon i {
  font-size: 24px;
  color: var(--card-color);
  position: absolute;
}

.stat-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-label {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}

.stat-value {
  font-size: 24px;
  font-weight: 700;
  color: var(--card-color);
}

/* === 필터 패널 === */
.filter-panel {
  background: white;
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.filter-row {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 20px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 180px;
}

.filter-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
}

.filter-label i {
  font-size: 16px;
  color: #667eea;
}

.filter-select {
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  color: #334155;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.filter-select:hover {
  border-color: #cbd5e1;
}

.filter-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* 검색 그룹 */
.search-group {
  display: flex;
  gap: 8px;
  flex: 1;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  flex: 1;
  transition: all 0.2s;
}

.search-box:focus-within {
  background: white;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.search-box i {
  font-size: 20px;
  color: #94a3b8;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #334155;
  outline: none;
}

.search-input::placeholder {
  color: #94a3b8;
}

.search-clear {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.search-clear:hover {
  background: #e2e8f0;
  color: #64748b;
}

.btn-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 8px;
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
  white-space: nowrap;
}

.btn-search:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-search i {
  font-size: 18px;
}

/* 필터 토글 */
.filter-toggles-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid #f1f5f9;
}

.toggles-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.toggles-label i {
  font-size: 16px;
}

.filter-toggles {
  display: flex;
  gap: 12px;
}

.toggle-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 13px;
  font-weight: 500;
  color: #64748b;
}

.toggle-chip input[type="checkbox"] {
  display: none;
}

.toggle-chip i {
  font-size: 16px;
}

.toggle-chip:hover {
  background: #f1f5f9;
}

.toggle-chip.active {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-color: #667eea;
  color: white;
}

/* === 로딩 & 에러 상태 === */
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid #f1f5f9;
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-state p,
.error-state p {
  margin-top: 16px;
  font-size: 14px;
  color: #64748b;
}

.error-state i {
  font-size: 48px;
  color: #ef4444;
}

/* === 테이블 카드 === */
.table-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  max-width: 100%;
}

.table-header {
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.table-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.table-title i {
  font-size: 20px;
  color: #667eea;
}

.table-scroll-container {
  overflow-x: auto;
  overflow-y: visible;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}

.table-scroll-container::-webkit-scrollbar {
  height: 8px;
}

.table-scroll-container::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

.table-scroll-container::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.table-scroll-container::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

/* === 데이터 테이블 === */
.data-table {
  width: 100%;
  min-width: 1400px;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table thead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  position: sticky;
  top: 0;
  z-index: 10;
}

.data-table th {
  padding: 14px 16px;
  text-align: left;
  font-size: 12px;
  font-weight: 600;
  color: white;
  white-space: nowrap;
}

.data-table th.sortable {
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.data-table th.sortable:hover {
  background: rgba(255, 255, 255, 0.1);
}

.th-content {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
}

.th-content i {
  font-size: 14px;
  opacity: 0.8;
}

.data-table td {
  padding: 14px 16px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
  vertical-align: middle;
}

.data-row {
  transition: background 0.2s;
}

.data-row:hover {
  background: #f8fafc;
}

.text-center {
  text-align: center !important;
}

/* 멤버 이름 */
.member-name {
  font-weight: 600;
  color: #1e293b;
}

/* 나이 경고 */
.age-warning {
  color: #ef4444 !important;
  font-weight: 600;
}

/* 배지 */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  position: relative;
  word-break: keep-all;
}

.badge i {
  font-size: 13px;
}

.badge-foreigner {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
}

.badge-disability {
  background: #ede9fe;
  color: #5b21b6;
  border: 1px solid #ddd6fe;
}

/* 툴팁 */
.tooltip-container {
  position: relative;
  cursor: help;
}

.tooltip-text {
  visibility: hidden;
  position: absolute;
  bottom: 125%;
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  color: white;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.6;
  white-space: nowrap;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.tooltip-text::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: #1e293b;
}

.tooltip-container:hover .tooltip-text {
  visibility: visible;
}

.warning-dot {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  background: #ef4444;
  color: white;
  border-radius: 50%;
  margin-left: 4px;
}

.warning-dot i {
  font-size: 10px;
}

.text-warning-red {
  color: #ff4d4f !important;
  font-weight: 600;
}

/* 체크박스 래퍼 */
.checkbox-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.checkbox-wrapper input[type="checkbox"] {
  opacity: 0;
  position: absolute;
}

.check-icon {
  font-size: 20px;
  color: #10b981;
}

.uncheck-icon {
  font-size: 20px;
  color: #e5e7eb;
}

/* 계좌 정보 */
.account-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bank-badge {
  word-break: keep-all;
  padding: 4px 8px;
  background: #f1f5f9;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
}

.account-number {
  font-family: 'Courier New', monospace;
  font-size: 12px;
  color: #334155;
}

/* 상태 배지 */
.status-badge {
  word-break: keep-all;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
}

.status-badge i {
  font-size: 13px;
}

.status-active {
  background: #d1fae5;
  color: #065f46;
}

.status-inactive {
  background: #fee2e2;
  color: #991b1b;
}

/* Sticky 컬럼 */
.sticky-col {
  position: sticky;
  right: 0;
  box-shadow: -4px 0 8px rgba(0, 0, 0, 0.08);
  z-index: 5;
}

.data-table thead .sticky-col {
  z-index: 15;
}

.data-row:hover .sticky-col {
  background: #f8fafc !important;
}

/* 상세 버튼 */
.btn-detail {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: #667eea;
  border: none;
  border-radius: 6px;
  color: white;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-detail:hover {
  background: #5568d3;
  transform: translateY(-1px);
}

.btn-detail i {
  font-size: 14px;
}

/* 텍스트 유틸리티 */
.text-gray {
  color: #94a3b8;
}

/* 빈 상태 */
.empty-row {
  background: #fafafa;
}

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
  margin: 0 0 8px 0;
}

.empty-state span {
  font-size: 13px;
}

/* === 반응형 === */
@media (max-width: 1400px) {
  .stats-grid {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
}

@media (max-width: 1024px) {
  .filter-row {
    flex-wrap: wrap;
  }

  .search-group {
    width: 100%;
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

  .btn-refresh,
  .btn-add {
    width: 100%;
    justify-content: center;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .filter-row {
    flex-direction: column;
  }

  .filter-group,
  .search-group {
    width: 100%;
  }

  .filter-toggles-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .filter-toggles {
    flex-wrap: wrap;
  }
}
</style>
