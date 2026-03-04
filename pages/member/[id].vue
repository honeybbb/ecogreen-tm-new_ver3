<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import axios from 'axios';

const router = useRouter();
const route = useRoute();

const {
  siteOptions,
  positionOptions,
  typeOptions,
  disabledOptions,
  bankOptions,
  fetchSiteOptions,
  fetchPositionOptions,
  fetchTypeOptions,
  fetchBankOption,
  fetchDisabledOptions
} = useApi();

// 현재 탭
const activeTab = ref('info');

// 편집 모드
const isEditing = ref(false);

// 직원 정보
const employee = ref({
  id: '',
  name: '',
  type: '',
  site: '',
  siteName: '',
  positionCd: '',
  positionName: '',
  phone: '',
  email: '',
  birthDate: '',
  gender: '',
  address: '',
  inDate: '',
  outDate: '',
  outReason: '',
  status: '',
  disability: '',
  disability_grade: '',
  disability_date: '',
  foreigner: '',
  nationality: '',
  visa_code: '',
  visa_date: '',
  defector: '',
  patriot: '',
  intern: '',
  beneficiary: '',
  bank: '',
  accountNumber: '',
  four_ins: '',
  retire_pension: '',
  bigo: '',
  photo: null
});

// 근로계약서 모달 상태 추가
const isContractModalOpen = ref(false);

// 근무 이력
const workHistory = ref([
  { period: '2023.01 ~ 2024.12', site: 'LH 위례 6단지', position: '경비원', status: '재직' },
  { period: '2021.03 ~ 2022.12', site: '강서 대명 강동', position: '주임', status: '퇴사' }
]);

// 급여 이력
const salaryHistory = ref([
  { month: '2024.11', basic: 2100000, allowance: 300000, total: 2400000 },
  { month: '2024.10', basic: 2100000, allowance: 300000, total: 2400000 },
  { month: '2024.09', basic: 2100000, allowance: 300000, total: 2400000 }
]);

// 교육 이력
const educationHistory = ref([
  { date: '2024.10.15', title: '직장 내 괴롭힘 예방 교육', duration: '2시간', status: '수료' },
  { date: '2024.09.20', title: '산업안전보건교육', duration: '4시간', status: '수료' }
]);

// 탭 목록
const tabs = [
  { id: 'info', name: '기본정보', icon: 'mdi-account' },
  // { id: 'work', name: '근무이력', icon: 'mdi-briefcase' },
  { id: 'salary', name: '급여이력', icon: 'mdi-cash' },
  // { id: 'education', name: '교육이력', icon: 'mdi-school' }
];

// 나이 계산
const age = computed(() => {
  if (!employee.value.birthDt) return '-';
  const today = new Date();
  const birth = new Date(employee.value.birthDt);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
});

// 재직 기간 계산
const workPeriod = computed(() => {
  if (!employee.value.inDate) return '-';
  const start = new Date(employee.value.inDate);
  const end = employee.value.outDate ? new Date(employee.value.outDate) : new Date();

  const months = (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
  const years = Math.floor(months / 12);
  const remainMonths = months % 12;

  if (years > 0) {
    return remainMonths > 0 ? `${years}년 ${remainMonths}개월` : `${years}년`;
  }
  return `${months}개월`;
});

// 데이터 로드
const loadEmployeeData = async () => {
  try {
    const memberId = route.params.id;
    const response = await axios.get(`/api/v1/member/data/${memberId}`);
    //employee.value = response.data.data[0];
    console.log(response.data.data[0])
    const rawData = response.data.data[0];
    employee.value = {
      ...rawData,
      // JSON 파싱이 필요한 필드들
      siteName: rawData.sites ? JSON.parse(rawData.sites)[0]?.name : '',
      contract: rawData.contract ? JSON.parse(rawData.contract)[0] : { contractData: {} }
    };
  } catch (error) {
    console.error('직원 정보 로드 실패:', error);
    alert('직원 정보를 불러오는데 실패했습니다.');
  }
};

// 급여 합계 계산 (계약서용)
const wageTotal = computed(() => {
  const data = employee.value.contract?.contractData;
  if (!data) return 0;
  return Object.values(data).reduce((acc, cur) => acc + (Number(cur) || 0), 0);
});

// 편집 모드 토글
const toggleEdit = () => {
  isEditing.value = !isEditing.value;
};

// 저장
const saveEmployee = async () => {
  if (employee.value.status == '1' && !employee.value.outDate) {
    alert('퇴사 처리를 위해 퇴사일을 입력해주세요.');
    return;
  }

  if (!confirm('수정된 정보를 저장하시겠습니까?')) return;

  try {
    const memberId = route.params.id;
    const payload = {
      ...employee.value,
      outDate: employee.value.outDate,
      outReason: employee.value.outReason
    };
    await axios.put(`/api/v1/member/${memberId}`, payload);

    alert('저장되었습니다.');
    isEditing.value = false;
    await loadEmployeeData(); // 최신 데이터 다시 로드
  } catch (error) {
    console.error('저장 실패:', error);
    alert('저장에 실패했습니다.');
  }
};

// 취소
const cancelEdit = () => {
  if (confirm('수정을 취소하시겠습니까?')) {
    isEditing.value = false;
    loadEmployeeData();
  }
};

// 삭제
const deleteEmployee = async () => {
  if (!confirm('정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) return;

  try {
    const memberId = route.params.id;
    await axios.delete(`/api/v1/member/${memberId}`);
    alert('삭제되었습니다.');
    router.push('/member/list');
  } catch (error) {
    console.error('삭제 실패:', error);
    alert('삭제에 실패했습니다.');
  }
};

// 목록으로
const goBack = () => {
  router.push('/member/list');
};

onMounted(() => {
  loadEmployeeData();
  fetchSiteOptions();
  fetchPositionOptions();
  fetchTypeOptions();
  fetchBankOption();
  fetchDisabledOptions();
});
</script>

<template>
  <div class="member-detail-page">
    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <button @click="goBack" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-account-details"></i>
            직원 상세정보
          </h1>
          <p class="page-subtitle">직원의 상세 정보를 확인하고 관리합니다</p>
        </div>
      </div>
      <div class="header-actions">
        <template v-if="!isEditing">
          <button @click="toggleEdit" class="btn-edit">
            <i class="mdi mdi-pencil"></i>
            <span>수정</span>
          </button>
          <button @click="deleteEmployee" class="btn-delete">
            <i class="mdi mdi-delete"></i>
            <span>삭제</span>
          </button>
        </template>
        <template v-else>
          <button @click="cancelEdit" class="btn-cancel">
            <i class="mdi mdi-close"></i>
            <span>취소</span>
          </button>
          <button @click="saveEmployee" class="btn-save">
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
        <div class="profile-photo-section">
          <div class="profile-photo">
            <img v-if="employee.photo" :src="employee.photo" alt="프로필 사진" />
            <i v-else class="mdi mdi-account"></i>
          </div>
          <button v-if="isEditing" class="btn-change-photo">
            <i class="mdi mdi-camera"></i>
          </button>
        </div>

        <div class="profile-info">
          <div class="profile-main">
            <h2 class="profile-name">{{ employee.name }}</h2>
            <span :class="['status-badge', employee.status == 0 ? 'status-active' : 'status-inactive']">
              <i :class="['mdi', employee.status == '0' ? 'mdi-check-circle' : 'mdi-close-circle']"></i>
              {{ employee.status == 0 ? '재직' : '퇴사' }}
            </span>
          </div>

          <div class="profile-details">
            <div class="detail-item">
              <i class="mdi mdi-card-account-details"></i>
              <span>{{ employee.id || '-' }}</span>
            </div>
            <div class="detail-item">
              <i class="mdi mdi-office-building"></i>
              <span>{{ employee.siteName || '-' }}</span>
            </div>
            <div class="detail-item">
              <i class="mdi mdi-account-tie"></i>
              <span>{{ employee.positionName || '-' }}</span>
            </div>
            <div class="detail-item">
              <i class="mdi mdi-calendar"></i>
              <span>재직기간: {{ workPeriod }}</span>
            </div>
          </div>
        </div>

        <div class="profile-stats">
          <div class="stat-item">
            <div class="stat-icon" style="--stat-color: #667eea;">
              <i class="mdi mdi-calendar-clock"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">근속년수</span>
              <span class="stat-value">{{ workPeriod }}</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon" style="--stat-color: #10b981;">
              <i class="mdi mdi-calendar-start"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">입사일</span>
              <span class="stat-value">{{ employee.inDate || '-' }}</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon" style="--stat-color: #f59e0b;">
              <i class="mdi mdi-cake-variant"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">나이</span>
              <span class="stat-value">{{ age }}세</span>
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
          <!-- 개인정보 -->
          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-account"></i>
              <h3>개인정보</h3>
            </div>
            <div class="info-grid">
              <div class="info-item">
                <label>이름</label>
                <input
                    v-if="isEditing"
                    type="text"
                    v-model="employee.name"
                    class="info-input"
                />
                <span v-else class="info-value">{{ employee.name }}</span>
              </div>
              <div class="info-item">
                <label>성별</label>
                <div v-if="isEditing" class="radio-group-inline">
                  <label class="radio-label-inline">
                    <input type="radio" v-model="employee.gender" value="M" />
                    <span>남성</span>
                  </label>
                  <label class="radio-label-inline">
                    <input type="radio" v-model="employee.gender" value="F" />
                    <span>여성</span>
                  </label>
                </div>
                <span v-else class="info-value">{{ employee.gender === 'M' ? '남성' : '여성' }}</span>
              </div>
              <div class="info-item">
                <label>생년월일</label>
                <input
                    v-if="isEditing"
                    type="date"
                    v-model="employee.birthDt"
                    class="info-input"
                />
                <span v-else class="info-value">{{ employee.birthDt || '-' }}</span>
              </div>
              <div class="info-item">
                <label>나이</label>
                <span class="info-value">{{ age }}세</span>
              </div>
              <div class="info-item full-width">
                <label>연락처</label>
                <input
                    v-if="isEditing"
                    type="tel"
                    v-model="employee.phone"
                    class="info-input"
                />
                <span v-else class="info-value">{{ employee.phone || '-' }}</span>
              </div>
              <div class="info-item full-width">
                <label>이메일</label>
                <input
                    v-if="isEditing"
                    type="email"
                    v-model="employee.email"
                    class="info-input"
                />
                <span v-else class="info-value">{{ employee.email || '-' }}</span>
              </div>
              <div class="info-item full-width">
                <label>주소</label>
                <input
                    v-if="isEditing"
                    type="text"
                    v-model="employee.address"
                    class="info-input"
                />
                <span v-else class="info-value">{{ employee.address || '-' }}</span>
              </div>
            </div>
          </div>

          <!-- 근무정보 -->
          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-briefcase"></i>
              <h3>근무정보</h3>
            </div>
            <div class="info-grid">
              <div class="info-item">
                <label>사번</label>
                <span class="info-value">{{ employee.id }}</span>
              </div>
              <div class="info-item">
                <label>구분</label>
                <!--select
                    v-if="isEditing"
                    v-model="employee.type"
                    class="info-select"
                >
                  <option v-for="type in typeOptions" :key="type.itemCd" :value="type.itemCd">
                    {{ employee.type }}
                  </option>
                </select-->
                <span class="info-value">{{ employee.type || '-' }}</span>
              </div>
              <div class="info-item">
                <label>근무 현장</label>
                <select
                    v-if="isEditing"
                    v-model="employee.sIdx"
                    class="info-select"
                >
                  <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
                    {{ site.name }}
                  </option>
                </select>
                <span v-else class="info-value">{{ employee.siteName }}</span>
              </div>
              <div class="info-item">
                <label>직위</label>
                <select
                    v-if="isEditing"
                    v-model="employee.positionCd"
                    class="info-select"
                >
                  <option v-for="pos in positionOptions" :key="pos.itemCd" :value="pos.itemCd">
                    {{ pos.itemNm }}
                  </option>
                </select>
                <span v-else class="info-value">{{ employee.positionName }}</span>
              </div>
              <div class="info-item">
                <label>재직 상태</label>
                <div v-if="isEditing" class="radio-group-inline">
                  <label class="radio-label-status active-label">
                    <input type="radio" v-model="employee.status" value="0" />
                    <span>재직</span>
                  </label>
                  <label class="radio-label-status inactive-label">
                    <input type="radio" v-model="employee.status" value="1" />
                    <span>퇴사</span>
                  </label>
                </div>
                <span v-else :class="['status-badge', employee.status == 0 ? 'status-active' : 'status-inactive']">
                  {{ employee.status == 0 ? '재직 중' : '퇴사' }}
                </span>
              </div>
              <div class="info-item">
                <label>입사일</label>
                <input
                    v-if="isEditing"
                    type="date"
                    v-model="employee.inDate"
                    class="info-input"
                />
                <span v-else class="info-value">{{ employee.inDate }}</span>
              </div>
              <template v-if="employee.status == 1">
                <div class="info-item">
                  <label class="text-red">퇴사일</label>
                  <input v-if="isEditing" type="date" v-model="employee.outDate" class="info-input border-red" />
                  <span v-else class="info-value text-red">{{ employee.outDate || '미입력' }}</span>
                </div>
                <div class="info-item full-width">
                  <label class="text-red">퇴사 사유</label>
                  <input v-if="isEditing" type="text" v-model="employee.outReason" class="info-input border-red" placeholder="퇴사 사유를 입력하세요" />
                  <span v-else class="info-value text-red">{{ employee.outReason || '미입력' }}</span>
                </div>
              </template>
              <!--div class="info-item">
                <label>재직기간</label>
                <span class="info-value">{{ workPeriod }}</span>
              </div-->
            </div>
          </div>

          <!-- 특이사항 -->
          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-alert-circle"></i>
              <h3>특이사항</h3>
            </div>
            <div class="info-grid">
              <div class="info-item">
                <label>장애여부</label>
                <select
                    v-if="isEditing"
                    v-model="employee.disability_grade"
                    class="info-select"
                >
                  <option v-for="di in disabledOptions" :key="di.itemCd" :value="di.itemCd">
                    {{ di.itemNm }}
                  </option>
                </select>
                <span v-if="employee.disability === 'Y'" class="badge badge-purple">
                  <i class="mdi mdi-wheelchair-accessibility"></i>
                  {{ employee.disability_grade || '장애' }}
                </span>
                <span v-else class="info-value text-gray">해당없음</span>
              </div>
              <div class="info-item">
                <label>외국인여부</label>
                <span v-if="employee.foreigner === 'Y'" class="badge badge-orange">
                  <i class="mdi mdi-earth"></i>
                  {{ employee.nationality || '외국인' }}
                </span>
                <span v-else class="info-value text-gray">해당없음</span>
              </div>
              <div class="info-item">
                <label>국가유공자</label>
                <span v-if="employee.patriot === 'Y'" class="badge badge-blue">
                  <i class="mdi mdi-medal"></i>
                  유공자
                </span>
                <span v-else class="info-value text-gray">해당없음</span>
              </div>
              <div class="info-item">
                <label>기초수급자</label>
                <span v-if="employee.beneficiary === 'Y'" class="badge badge-green">
                  <i class="mdi mdi-hand-heart"></i>
                  수급자
                </span>
                <span v-else class="info-value text-gray">해당없음</span>
              </div>
            </div>
          </div>

          <!-- 급여정보 -->
          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-cash"></i>
              <h3>급여정보</h3>
            </div>
            <div class="info-grid">
              <div class="info-item">
                <label>은행</label>
                <select
                    v-if="isEditing"
                    v-model="employee.bank"
                    class="info-select"
                >
                  <option v-for="bank in bankOptions" :key="bank.itemNm" :value="bank.itemNm">
                    {{ bank.itemNm }}
                  </option>
                </select>
                <span v-else class="info-value">{{ employee.bank || '-' }}</span>
              </div>
              <div class="info-item">
                <label>계좌번호</label>
                <input
                    v-if="isEditing"
                    type="text"
                    v-model="employee.accountNumber"
                    class="info-input"
                />
                <span v-else class="info-value">{{ employee.accountNumber || '-' }}</span>
              </div>
              <div class="info-item">
                <label>4대보험</label>
                <span :class="['badge', employee.four_ins === 'Y' ? 'badge-green' : 'badge-gray']">
                  <i :class="['mdi', employee.four_ins === 'Y' ? 'mdi-check-circle' : 'mdi-close-circle']"></i>
                  {{ employee.four_ins === 'Y' ? '가입' : '미가입' }}
                </span>
              </div>
              <div class="info-item">
                <label>퇴직연금</label>
                <span :class="['badge', employee.retire_pension === 'Y' ? 'badge-green' : 'badge-gray']">
                  <i :class="['mdi', employee.retire_pension === 'Y' ? 'mdi-check-circle' : 'mdi-close-circle']"></i>
                  {{ employee.retire_pension === 'Y' ? '가입' : '미가입' }}
                </span>
              </div>
              <div class="info-item full-width">
                <label>비고</label>
                <textarea
                    v-if="isEditing"
                    v-model="employee.bigo"
                    class="info-textarea"
                    rows="3"
                ></textarea>
                <span v-else class="info-value">{{ employee.bigo || '-' }}</span>
              </div>
            </div>
          </div>

          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-file-document-edit"></i>
              <h3>근로 계약 관리</h3>
            </div>
            <div class="contract-box">
              <div class="contract-info-summary">
                <p>현재 등록된 근로계약서 정보를 확인하고 출력할 수 있습니다.</p>
                <button @click="isContractModalOpen = true" class="btn-contract-view">
                  <i class="mdi mdi-file-find"></i>
                  근로계약서 상세보기
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 근무이력 탭 -->
      <!--div v-show="activeTab === 'work'" class="tab-panel">
        <div class="history-list">
          <div v-for="(item, index) in workHistory" :key="index" class="history-item">
            <div class="history-icon">
              <i class="mdi mdi-briefcase"></i>
            </div>
            <div class="history-content">
              <div class="history-header">
                <h4>{{ item.site }}</h4>
                <span :class="['history-status', item.status === '재직' ? 'status-active' : '']">
                  {{ item.status }}
                </span>
              </div>
              <div class="history-details">
                <span class="history-period">
                  <i class="mdi mdi-calendar"></i>
                  {{ item.period }}
                </span>
                <span class="history-position">
                  <i class="mdi mdi-account-tie"></i>
                  {{ item.positionName }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div-->

      <!-- 급여이력 탭 -->
      <div v-show="activeTab === 'salary'" class="tab-panel">
        <div class="table-wrapper">
          <table class="history-table">
            <thead>
            <tr>
              <th>지급월</th>
              <th>기본급</th>
              <th>수당</th>
              <th>지급총액</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(item, index) in salaryHistory" :key="index">
              <td>{{ item.month }}</td>
              <td>{{ item.basic.toLocaleString() }}원</td>
              <td>{{ item.allowance.toLocaleString() }}원</td>
              <td class="total">{{ item.total.toLocaleString() }}원</td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 교육이력 탭 -->
      <!--div v-show="activeTab === 'education'" class="tab-panel">
        <div class="history-list">
          <div v-for="(item, index) in educationHistory" :key="index" class="history-item">
            <div class="history-icon">
              <i class="mdi mdi-school"></i>
            </div>
            <div class="history-content">
              <div class="history-header">
                <h4>{{ item.title }}</h4>
                <span class="badge badge-green">{{ item.status }}</span>
              </div>
              <div class="history-details">
                <span class="history-period">
                  <i class="mdi mdi-calendar"></i>
                  {{ item.date }}
                </span>
                <span class="history-position">
                  <i class="mdi mdi-clock-outline"></i>
                  {{ item.duration }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div-->
    </div>
  </div>
</template>

<style scoped>
/* === 페이지 헤더 === */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}

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

.profile-photo-section {
  position: relative;
  margin-top: -60px;
}

.profile-photo {
  width: 120px;
  height: 120px;
  border-radius: 20px;
  background: white;
  border: 4px solid white;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.profile-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.profile-photo i {
  font-size: 64px;
  color: #cbd5e1;
}

.btn-change-photo {
  position: absolute;
  bottom: -8px;
  right: -8px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: #667eea;
  border: 3px solid white;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transition: all 0.2s;
}

.btn-change-photo:hover {
  background: #5568d3;
  transform: scale(1.1);
}

.btn-change-photo i {
  font-size: 20px;
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
}

.status-badge i {
  font-size: 16px;
}

.status-active {
  background: #d1fae5;
  color: #065f46;
}

.status-inactive {
  background: #fee2e2;
  color: #991b1b;
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

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-item label {
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
}

.info-value {
  font-size: 15px;
  color: #1e293b;
  padding: 10px 0;
}

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

.radio-group-inline {
  display: flex;
  gap: 12px;
  padding: 5px 0;
}

.radio-label-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
}

.active-label:has(input:checked) {
  background: #d1fae5;
  border-color: #10b981;
  color: #065f46;
}

.inactive-label:has(input:checked) {
  background: #fee2e2;
  border-color: #ef4444;
  color: #991b1b;
}

/* 퇴사 강조 스타일 */
.text-red {
  color: #dc2626 !important;
  font-weight: 600;
}

.border-red {
  border-color: #fecaca !important;
}

.border-red:focus {
  border-color: #dc2626 !important;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1) !important;
}

.radio-label-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.radio-label-inline input {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

/* 배지 */
.badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.badge i {
  font-size: 14px;
}

.badge-green {
  background: #d1fae5;
  color: #065f46;
}

.badge-purple {
  background: #ede9fe;
  color: #5b21b6;
}

.badge-orange {
  background: #fed7aa;
  color: #92400e;
}

.badge-blue {
  background: #dbeafe;
  color: #1e40af;
}

.badge-gray {
  background: #f1f5f9;
  color: #64748b;
}

.text-gray {
  color: #94a3b8;
}

/* === 이력 리스트 === */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.history-item {
  display: flex;
  gap: 16px;
  padding: 20px;
  background: #fafbfc;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
  transition: all 0.2s;
}

.history-item:hover {
  background: #f8fafc;
  border-color: #e2e8f0;
}

.history-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.history-icon i {
  font-size: 24px;
  color: white;
}

.history-content {
  flex: 1;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.history-header h4 {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

.history-status {
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  padding: 4px 10px;
  background: #f1f5f9;
  border-radius: 4px;
}

.history-status.status-active {
  background: #d1fae5;
  color: #065f46;
}

.history-details {
  display: flex;
  gap: 20px;
  color: #64748b;
  font-size: 13px;
}

.history-period,
.history-position {
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-period i,
.history-position i {
  font-size: 16px;
}

/* === 이력 테이블 === */
.table-wrapper {
  overflow-x: auto;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.history-table thead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.history-table th {
  padding: 14px 20px;
  text-align: left;
  color: white;
  font-size: 13px;
  font-weight: 600;
}

.history-table td {
  padding: 14px 20px;
  border-bottom: 1px solid #f1f5f9;
  color: #334155;
}

.history-table tbody tr:hover {
  background: #f8fafc;
}

.history-table td.total {
  font-weight: 700;
  color: #667eea;
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

  .info-grid {
    grid-template-columns: 1fr;
  }

  .profile-stats {
    width: 100%;
  }
}

/* 특이사항 구분선 */
.full-width.opacity-10 {
  grid-column: 1 / -1;
  border: 0;
  border-top: 1px solid #e2e8f0;
  margin: 10px 0;
}

/* 근로계약 버튼 스타일 */
.contract-box {
  padding: 20px;
  background: #f1f5f9;
  border-radius: 12px;
  text-align: center;
}

.contract-info-summary p {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 16px;
}

.btn-contract-view {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  background: #1e293b;
  color: white;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-contract-view:hover {
  background: #334155;
  transform: translateY(-2px);
}
</style>
