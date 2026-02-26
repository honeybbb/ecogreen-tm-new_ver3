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

const filterOver65 = ref(false);    // 65세 이상
const filterDisability = ref(false); // 장애 여부
const filterForeigner = ref(false);  // 외국인 여부

// 2. 정렬 관련 상태
const sortKey = ref('id'); // 정렬 기준 컬럼
const sortOrder = ref('asc'); // 'asc' (오름차순), 'desc' (내림차순)

// 3. 직원 목록 데이터
const members = ref([]);
const isLoading = ref(false);
const error = ref(null);

const fetchDisabilityOptions = async (groupCd = '02002') => {
  try {
    const res = await axios.get(`/api/v1/code/${groupCd}`); // 장애 등급 그룹 코드
    disabilityOptions.value = res.data.data || [];
  } catch (e) {
    console.error("장애 코드 로드 실패:", e);
  }
};

const getDisabilityStyle = (grade) => {
  // DB에서 가져온 코드 목록 중 명칭이 일치하는 항목을 찾음
  const option = disabilityOptions.value.find(opt => opt.itemCd === grade);

  return {
    backgroundColor: option?.color || '#ede9fe', // 설정된 색상 혹은 기본 연보라
    color: option?.color ? '#ffffff' : '#5b21b6', // 색상이 설정되면 글자는 흰색으로
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

// 6. 필터링 + 정렬된 결과 계산 (핵심 로직)
const filteredMembers = computed(() => {
  // A. 먼저 검색어와 선택된 현장으로 필터링
  let result = members.value.filter(member => {
    const siteMatch = selectedSite.value === '전체' || member.sIdx === selectedSite.value;
    const searchMatch = member.name.toLowerCase().includes(searchTerm.value.toLowerCase());
    const typeMatch = selectedType.value === '전체' || member.type === selectedType.value;

    // 추가 토글 필터 1: 65세 이상
    let ageMatch = true;
    if (filterOver65.value) {
      ageMatch = calculateAge(member.birthDt) >= 65;
    }

    // 추가 토글 필터 2: 장애 여부 (Y 또는 true 체크)
    let disabilityMatch = true;
    if (filterDisability.value) {
      disabilityMatch = member.disability === 'Y' || member.disability === true;
    }

    // 추가 토글 필터 3: 외국인 여부 (Y 또는 true 체크)
    let foreignerMatch = true;
    if (filterForeigner.value) {
      foreignerMatch = member.foreigner === 'Y' || member.foreigner === true;
    }

    // 모든 조건이 만족되어야 함
    return siteMatch && searchMatch && typeMatch && ageMatch && disabilityMatch && foreignerMatch;
  });

  // B. 필터링된 결과에 대해 정렬 수행
  result.sort((a, b) => {
    let modifier = sortOrder.value === 'asc' ? 1 : -1;
    let valA = a[sortKey.value];
    let valB = b[sortKey.value];

    // 숫자형 데이터와 문자열 데이터 구분 처리
    if (typeof valA === 'string') {
      return valA.localeCompare(valB) * modifier;
    }

    if (valA < valB) return -1 * modifier;
    if (valA > valB) return 1 * modifier;
    return 0;
  });

  return result;
});

// 7. 이벤트 핸들러
const handleSearch = () => {
  fetchMembers();
};

const goToRegister = () => router.push('/member/register');
const goToDetail = (id) => router.push(`/member/${id}`);

onMounted(() => {
  fetchMembers();
  fetchSiteOptions();
  fetchTypeOptions();
  fetchDisabilityOptions();
});
</script>

<template>
  <div class="member-list-page">
    <div class="page-header">
      <h2 class="page-title">직원 명부 관리</h2>
    </div>

    <div class="search-panel">
      <div class="input-group">
        <label for="site-select" class="input-label">근무 현장 :</label>
        <select id="site-select" v-model="selectedSite" class="input-select">
          <option value="전체">전체</option>
          <option v-for="site in siteOptions" :key="site" :value="site.idx">{{ site.name }}</option>
        </select>
      </div>

      <div class="input-group">
        <label class="input-label">구분 :</label>
        <select v-model="selectedType" class="input-select">
          <option value="전체">전체</option>
          <option v-for="opt in typeOptions" :key="opt" :value="opt.itemNm">{{ opt.itemNm }}</option>
        </select>
      </div>

      <div class="input-group search-term-group">
        <input
            type="text"
            v-model="searchTerm"
            placeholder="이름으로 검색..."
            class="input-text"
            @keyup.enter="handleSearch"
        >
        <button @click="handleSearch" class="btn btn-primary">검색</button>
      </div>

      <div class="filter-toggles">
        <label class="toggle-item">
          <input type="checkbox" v-model="filterOver65">
          <span :class="{ 'text-red': filterOver65 }">65세↑</span>
        </label>

        <label class="toggle-item">
          <input type="checkbox" v-model="filterDisability">
          <span :class="{ 'text-purple': filterDisability }">장애</span>
        </label>

        <label class="toggle-item">
          <input type="checkbox" v-model="filterForeigner">
          <span :class="{ 'text-yellow': filterForeigner }">외국인</span>
        </label>
      </div>

      <div class="spacer"></div>
      <button @click="goToRegister" class="btn btn-success">직원 등록</button>
    </div>

    <div v-if="isLoading" class="status-msg">데이터를 불러오는 중...</div>
    <div v-if="error" class="status-msg error">{{ error }}</div>

    <div class="table-container" v-if="!isLoading">
      <table class="data-table">
        <thead>
        <tr>
          <th @click="toggleSort('id')" class="sortable">ID</th>
          <th @click="toggleSort('name')" class="sortable">이름</th>
          <th @click="toggleSort('siteName')" class="sortable">현장</th>
          <th @click="toggleSort('position')" class="sortable">직책</th>

          <th @click="toggleSort('gender')" class="sortable">성별</th>
          <th @click="toggleSort('age')" class="sortable">나이</th>
          <th @click="toggleSort('isForeigner')" class="sortable">내/외국인</th>
          <th @click="toggleSort('isDisabled')" class="sortable">장애여부</th>

          <th @click="toggleSort('joinDate')" class="sortable">입사일</th>
          <th @click="toggleSort('resignDate')" class="sortable">퇴사일</th>

          <th class="text-center">4대보험</th>
          <!--th class="text-center">국민연금</th-->
          <th class="text-center">퇴직연금</th>

          <th>계좌번호</th>

          <th @click="toggleSort('status')" class="sortable">상태</th>
          <th class="text-center">관리</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="member in filteredMembers" :key="member.id">
          <td>{{ member.id }}</td>
          <td class="fw-bold">{{ member.name }}</td>
          <td>{{ member.siteName }}</td>
          <td>{{ member.position }}</td>

          <td>{{ member.gender == 'M' ? '남':'여' || '-' }}</td>
          <td
              :class="{ 'text-danger': calculateAge(member.birthDt) >= 65 }"
              :title="calculateAge(member.birthDt) >= 65 ? '고용보험 가입 제외 대상 (만 65세 이상)' : ''">

            {{ calculateAge(member.birthDt) ? calculateAge(member.birthDt) + '세' : '-' }}

          </td>
          <td>
            <span
                v-if="member.foreigner === 'Y' || member.foreigner === true"
                class="badge badge-yellow tooltip-container"
            >
              외국인
              <span v-if="getMonthsDiff(member.visa_date) <= 5" class="warning-dot">!</span>

              <span class="tooltip-text">
                국적: {{ member.nationality || '-' }}<br>
                비자: {{ member.visa_code || '-' }} <br>
                <span :class="{ 'text-warning-red': getMonthsDiff(member.visa_date) <= 5 }">
                  만료일: {{ member.visa_date || '-' }}
                  <em v-if="getMonthsDiff(member.visa_date) <= 5"></em>
                </span>
              </span>
            </span>
            <span v-else class="text-gray">내국인</span>
          </td>

          <td>
            <span
                v-if="
                member.disability === 'Y' ||
                member.disability === true"
                class="badge badge-purple tooltip-container"
            >
              장애
              <span class="tooltip-text">
                등급: {{ member.disability_grade || '-' }}<br>
                판정일: {{ member.disability_date || '-' }}
              </span>
            </span>
            <span v-else class="text-gray">-</span>
          </td>

          <td>{{ formatDate(member.inDate) }}</td>
          <td>{{ formatDate(member.outDate) }}</td>

          <td class="text-center">
            <input
                type="checkbox"
                :checked="
                  member.four_ins === 'Y' ||
                  member.four_ins === true"
                disabled />
          </td>

          <!--td class="text-center">
            <input
                type="checkbox"
                :checked="
                  member.pension === 'Y' ||
                  member.pension === true"
                disabled />
          </td-->

          <td class="text-center">
            <input
                type="checkbox"
                :checked="
                  member.retire_pension === 'Y' ||
                  member.retire_pension === true"
                disabled />
          </td>

          <td>
            <div v-if="member.accountNo">
              <span class="bank-name">{{ member.bank }}</span>
              {{ member.accountNo }}
            </div>
            <div v-else>-</div>
          </td>

          <td>
              <span :class="['status-chip', { 'status-active': member.status === '재직', 'status-inactive': member.status === '퇴사' }]">
                {{ member.status }}
              </span>
          </td>

          <td class="text-center sticky-col bg-white">
            <button @click="goToDetail(member.id)" class="btn btn-sm btn-info">상세</button>
          </td>
        </tr>

        <tr v-if="filteredMembers.length === 0">
          <td colspan="15" class="text-center-none">검색된 직원이 없습니다.</td>
        </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
<style scoped>
/* 추가된 뱃지 스타일 */
.badge { padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; font-weight: bold; }
.badge-yellow { background-color: #fef3c7; color: #92400e; border: 1px solid #fcd34d; }
.badge-purple { background-color: #ede9fe; color: #5b21b6; border: 1px solid #ddd6fe; }
.bank-name { color: #6b7280; font-size: 0.8rem; margin-right: 4px; }

.warning-dot {
  display: inline-block;
  width: 14px;
  height: 14px;
  background-color: #ef4444;
  color: white;
  border-radius: 50%;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
  margin-left: 4px;
  font-weight: bold;
}

.text-warning-red {
  color: #ff4d4f;
  font-weight: bold;
}

.tooltip-text em {
  font-style: normal;
  font-size: 0.7rem;
  color: #ffa39e;
}
</style>
