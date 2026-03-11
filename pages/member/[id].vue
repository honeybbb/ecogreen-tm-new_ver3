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
  { id: 'info', name: '기본정보', icon: 'mdi-account-outline' },
  // { id: 'work', name: '근무이력', icon: 'mdi-briefcase-outline' },
  { id: 'salary', name: '급여이력', icon: 'mdi-cash-multiple' },
  // { id: 'education', name: '교육이력', icon: 'mdi-school-outline' }
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
    await axios.put(`/api/v1/member/data/${memberId}`, payload);

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
    <div class="page-header">
      <div class="header-left">
        <button @click="goBack" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-account-details-outline"></i>
            직원 상세정보
          </h1>
          <p class="page-subtitle">직원의 상세 정보를 확인하고 관리합니다</p>
        </div>
      </div>
      <div class="header-actions">
        <template v-if="!isEditing">
          <button @click="toggleEdit" class="btn-edit">
            <i class="mdi mdi-pencil-outline"></i>
            <span>수정</span>
          </button>
          <button @click="deleteEmployee" class="btn-delete">
            <i class="mdi mdi-trash-can-outline"></i>
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

    <div class="profile-card">
      <div class="profile-banner"></div>
      <div class="profile-content">
        <div class="profile-photo-section">
          <div class="profile-photo">
            <img v-if="employee.photo" :src="employee.photo" alt="프로필 사진" />
            <i v-else class="mdi mdi-account"></i>
          </div>
          <button v-if="isEditing" class="btn-change-photo">
            <i class="mdi mdi-camera-outline"></i>
          </button>
        </div>

        <div class="profile-info">
          <div class="profile-main">
            <h2 class="profile-name">{{ employee.name }}</h2>
            <span :class="['status-badge', employee.status == 0 ? 'status-active' : 'status-inactive']">
              <i :class="['mdi', employee.status == '0' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline']"></i>
              {{ employee.status == 0 ? '재직' : '퇴사' }}
            </span>
          </div>

          <div class="profile-details">
            <div class="detail-item">
              <i class="mdi mdi-card-account-details-outline"></i>
              <span>{{ employee.id || '-' }}</span>
            </div>
            <div class="detail-item">
              <i class="mdi mdi-office-building-outline"></i>
              <span>{{ employee.siteName || '-' }}</span>
            </div>
            <div class="detail-item">
              <i class="mdi mdi-account-tie-outline"></i>
              <span>{{ employee.positionName || '-' }}</span>
            </div>
            <div class="detail-item">
              <i class="mdi mdi-calendar-blank-outline"></i>
              <span>재직기간: {{ workPeriod }}</span>
            </div>
          </div>
        </div>

        <div class="profile-stats">
          <div class="stat-item">
            <div class="stat-icon" style="--stat-color: #4f46e5; --stat-bg: #eef2ff;">
              <i class="mdi mdi-calendar-clock-outline"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">근속년수</span>
              <span class="stat-value">{{ workPeriod }}</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon" style="--stat-color: #10b981; --stat-bg: #ecfdf5;">
              <i class="mdi mdi-calendar-start-outline"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">입사일</span>
              <span class="stat-value">{{ employee.inDate || '-' }}</span>
            </div>
          </div>
          <div class="stat-item">
            <div class="stat-icon" style="--stat-color: #f59e0b; --stat-bg: #fffbeb;">
              <i class="mdi mdi-cake-variant-outline"></i>
            </div>
            <div class="stat-content">
              <span class="stat-label">나이</span>
              <span class="stat-value">{{ age }}세</span>
            </div>
          </div>
        </div>
      </div>
    </div>

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

    <div class="tab-content">
      <div v-show="activeTab === 'info'" class="tab-panel">
        <div class="info-sections">
          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-account-outline"></i>
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

          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-briefcase-outline"></i>
              <h3>근무정보</h3>
            </div>
            <div class="info-grid">
              <div class="info-item">
                <label>사번</label>
                <span class="info-value">{{ employee.id }}</span>
              </div>
              <div class="info-item">
                <label>구분</label>
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
            </div>
          </div>

          <div class="info-section">
            <div class="section-header">
              <i class="mdi mdi-alert-circle-outline"></i>
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
                  <i class="mdi mdi-medal-outline"></i>
                  유공자
                </span>
                <span v-else class="info-value text-gray">해당없음</span>
              </div>
              <div class="info-item">
                <label>기초수급자</label>
                <span v-if="employee.beneficiary === 'Y'" class="badge badge-green">
                  <i class="mdi mdi-hand-heart-outline"></i>
                  수급자
                </span>
                <span v-else class="info-value text-gray">해당없음</span>
              </div>
            </div>
          </div>

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
                  <i :class="['mdi', employee.four_ins === 'Y' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline']"></i>
                  {{ employee.four_ins === 'Y' ? '가입' : '미가입' }}
                </span>
              </div>
              <div class="info-item">
                <label>퇴직연금</label>
                <span :class="['badge', employee.retire_pension === 'Y' ? 'badge-green' : 'badge-gray']">
                  <i :class="['mdi', employee.retire_pension === 'Y' ? 'mdi-check-circle-outline' : 'mdi-close-circle-outline']"></i>
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
              <i class="mdi mdi-file-document-edit-outline"></i>
              <h3>근로 계약 관리</h3>
            </div>
            <div class="contract-box">
              <div class="contract-info-summary">
                <p>현재 등록된 근로계약서 정보를 확인하고 출력할 수 있습니다.</p>
                <button @click="isContractModalOpen = true" class="btn-contract-view">
                  <i class="mdi mdi-file-find-outline"></i>
                  근로계약서 상세보기
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

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
    </div>
  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 전역 공통 === */
.member-detail-page {
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* === 페이지 헤더 === */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.btn-back {
  width: 42px; height: 42px;
  border-radius: 10px;
  background: white; border: 1px solid #e2e8f0; color: #475569;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}

.btn-back:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }
.btn-back i { font-size: 20px; }

.page-title {
  font-size: 24px; font-weight: 700; color: #1e293b;
  margin: 0 0 6px 0; display: flex; align-items: center; gap: 10px;
  letter-spacing: -0.5px;
}

.page-title i { font-size: 26px; color: #4f46e5; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 0; }

.header-actions { display: flex; gap: 10px; }

/* 공통 버튼 디자인 (그라디언트 제거) */
.btn-edit, .btn-delete, .btn-cancel, .btn-save {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px;
  border: none; border-radius: 8px; font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; white-space: nowrap;
}

.btn-edit { background: white; border: 1px solid #e2e8f0; color: #475569; }
.btn-edit:hover { background: #f8fafc; border-color: #cbd5e1; color: #1e293b; }

.btn-delete { background: white; border: 1px solid #fee2e2; color: #dc2626; }
.btn-delete:hover { background: #fef2f2; border-color: #fecaca; }

.btn-cancel { background: white; border: 1px solid #e2e8f0; color: #475569; }
.btn-cancel:hover { background: #f8fafc; color: #1e293b; }

.btn-save { background-color: #10b981; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.btn-save:hover { background-color: #059669; transform: translateY(-1px); }

.btn-edit i, .btn-delete i, .btn-cancel i, .btn-save i { font-size: 16px; }

/* === 프로필 카드 === */
.profile-card {
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); overflow: hidden; margin-bottom: 24px;
}

.profile-banner {
  height: 100px;
  background-color: #6d28d9; /* 솔리드 퍼플 */
}

.profile-content {
  padding: 0 24px 24px; display: flex; gap: 24px; align-items: flex-start;
}

.profile-photo-section {
  position: relative; margin-top: -40px;
}

.profile-photo {
  width: 100px; height: 100px; border-radius: 16px;
  background: white; border: 4px solid white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}

.profile-photo img { width: 100%; height: 100%; object-fit: cover; }
.profile-photo i { font-size: 50px; color: #cbd5e1; }

.btn-change-photo {
  position: absolute; bottom: -4px; right: -4px; width: 34px; height: 34px;
  border-radius: 50%; background: #4f46e5; border: 3px solid white; color: white;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.2s;
}
.btn-change-photo:hover { background: #4338ca; transform: scale(1.05); }
.btn-change-photo i { font-size: 16px; }

.profile-info { flex: 1; padding-top: 12px; }

.profile-main {
  display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
}

.profile-name { font-size: 24px; font-weight: 700; color: #1e293b; margin: 0; }

.status-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
  border-radius: 6px; font-size: 12px; font-weight: 600;
}
.status-badge i { font-size: 14px; }
.status-active { background: #d1fae5; color: #065f46; }
.status-inactive { background: #fee2e2; color: #991b1b; }

.profile-details {
  display: flex; flex-wrap: wrap; gap: 16px;
}

.detail-item {
  display: flex; align-items: center; gap: 6px; color: #475569; font-size: 13px; font-weight: 500;
}
.detail-item i { font-size: 16px; color: #94a3b8; }

.profile-stats {
  display: flex; gap: 20px; padding-top: 12px;
}

.stat-item { display: flex; gap: 10px; align-items: center; }

.stat-icon {
  width: 44px; height: 44px; border-radius: 10px;
  background-color: var(--stat-bg, #f1f5f9);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.stat-icon i { font-size: 20px; color: var(--stat-color); }

.stat-content { display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 12px; color: #64748b; font-weight: 500; }
.stat-value { font-size: 14px; font-weight: 700; color: #1e293b; }

/* === 탭 === */
.tabs-container {
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); margin-bottom: 24px; overflow: hidden;
}

.tabs-nav { display: flex; border-bottom: 1px solid #f1f5f9; }

.tab-button {
  flex: 1; padding: 14px 20px; background: transparent; border: none;
  color: #64748b; font-size: 13px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: all 0.2s; position: relative; outline: none;
}
.tab-button i { font-size: 16px; }
.tab-button:hover { background: #f8fafc; color: #334155; }
.tab-button.active { color: #4f46e5; background: white; }
.tab-button.active::after {
  content: ''; position: absolute; bottom: -1px; left: 0; right: 0;
  height: 2px; background-color: #4f46e5;
}

/* === 탭 컨텐츠 === */
.tab-content {
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02); padding: 24px;
}
.tab-panel { animation: fadeIn 0.3s; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

/* === 정보 섹션 === */
.info-sections { display: grid; gap: 20px; }
.info-section {
  border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: white;
}

.section-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 20px;
  padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;
}
.section-header i { font-size: 20px; color: #4f46e5; }
.section-header h3 { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0; }

.info-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 20px;
}
.info-item { display: flex; flex-direction: column; gap: 6px; }
.info-item.full-width { grid-column: 1 / -1; }

.info-item label { font-size: 12px; font-weight: 600; color: #64748b; }
.info-value { font-size: 14px; color: #1e293b; padding: 8px 0; font-weight: 500; }

.info-input, .info-select, .info-textarea {
  padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #334155; background: white; transition: all 0.2s;
}
.info-input:focus, .info-select:focus, .info-textarea:focus {
  outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1);
}
.info-textarea { resize: vertical; font-family: inherit; }

/* 라디오 버튼 스타일 */
.radio-group-inline { display: flex; gap: 12px; padding: 4px 0; }

.radio-label-status {
  display: flex; align-items: center; gap: 6px; padding: 6px 12px;
  border-radius: 6px; border: 1px solid #e2e8f0; cursor: pointer;
  font-size: 13px; font-weight: 500; transition: all 0.2s; color: #475569;
}

.radio-label-status input { display: none; }

.active-label:has(input:checked) { background: #d1fae5; border-color: #10b981; color: #065f46; }
.inactive-label:has(input:checked) { background: #fee2e2; border-color: #ef4444; color: #991b1b; }

/* 퇴사 강조 스타일 */
.text-red { color: #dc2626 !important; font-weight: 600; }
.border-red { border-color: #fecaca !important; }
.border-red:focus { border-color: #dc2626 !important; box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1) !important; }

/* 인라인 일반 라디오 */
.radio-label-inline {
  display: flex; align-items: center; gap: 6px; cursor: pointer; font-size: 13px; color: #475569;
}
.radio-label-inline input {
  appearance: none; -webkit-appearance: none;
  width: 16px; height: 16px; border: 2px solid #cbd5e1; border-radius: 50%;
  margin: 0; cursor: pointer; position: relative; transition: all 0.2s;
}
.radio-label-inline input:checked { border-color: #4f46e5; }
.radio-label-inline input:checked::after {
  content: ''; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: 8px; height: 8px; background-color: #4f46e5; border-radius: 50%;
}

/* 배지 */
.badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px;
  border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap;
}
.badge i { font-size: 13px; }

.badge-green { background: #d1fae5; color: #065f46; }
.badge-purple { background: #f3e8ff; color: #7e22ce; }
.badge-orange { background: #ffedd5; color: #c2410c; }
.badge-blue { background: #e0f2fe; color: #0369a1; }
.badge-gray { background: #f1f5f9; color: #475569; }

.text-gray { color: #94a3b8; }

/* === 이력 리스트 === */
.history-list { display: flex; flex-direction: column; gap: 12px; }

.history-item {
  display: flex; gap: 14px; padding: 16px;
  background: white; border: 1px solid #f1f5f9; border-radius: 10px; transition: all 0.2s;
}
.history-item:hover { background: #f8fafc; border-color: #e2e8f0; }

.history-icon {
  width: 44px; height: 44px; border-radius: 10px;
  background-color: #eef2ff; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.history-icon i { font-size: 20px; color: #4f46e5; }

.history-content { flex: 1; }
.history-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.history-header h4 { font-size: 15px; font-weight: 700; color: #1e293b; margin: 0; }

.history-status {
  font-size: 11px; font-weight: 600; color: #475569; padding: 3px 8px;
  background: #f1f5f9; border-radius: 4px;
}
.history-status.status-active { background: #d1fae5; color: #065f46; }

.history-details { display: flex; gap: 16px; color: #64748b; font-size: 12px; }
.history-period, .history-position { display: flex; align-items: center; gap: 4px; }

/* === 이력 테이블 (그라디언트 제거) === */
.table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch;}
.history-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 500px; }
.history-table thead { background-color: #6d28d9; }
.history-table th { padding: 12px 16px; text-align: left; color: white; font-size: 12px; font-weight: 600; white-space: nowrap; }
.history-table td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; color: #334155; }
.history-table tbody tr:hover { background-color: #f8fafc; }
.history-table td.total { font-weight: 700; color: #4f46e5; }

/* === 근로계약 버튼 === */
.contract-box { padding: 20px; background: #f8fafc; border-radius: 10px; text-align: center; border: 1px solid #e2e8f0; }
.contract-info-summary p { font-size: 13px; color: #64748b; margin-bottom: 14px; }
.btn-contract-view {
  display: inline-flex; align-items: center; gap: 6px; padding: 10px 20px;
  background: white; color: #1e293b; border: 1px solid #cbd5e1; border-radius: 8px;
  font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.02);
}
.btn-contract-view:hover { background: #f1f5f9; border-color: #94a3b8; }
.btn-contract-view i { font-size: 18px; color: #4f46e5; }

/* === 반응형 (Responsive) === */
@media (max-width: 1024px) {
  .profile-content { flex-direction: column; gap: 20px; }
  .profile-photo-section { margin-top: -50px; }
  .profile-stats { flex-direction: column; width: 100%; gap: 12px; padding-top: 0; }
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 16px; align-items: flex-start; }
  .header-actions { width: 100%; flex-direction: row; flex-wrap: wrap; }
  .btn-edit, .btn-delete, .btn-cancel, .btn-save { flex: 1; justify-content: center; }

  .tabs-nav { flex-wrap: wrap; }
  .tab-button { flex: 1 1 50%; border-bottom: 1px solid #f1f5f9; }
  .tab-button.active::after { bottom: 0; }

  .info-grid { grid-template-columns: 1fr; }
  .profile-details { flex-direction: column; gap: 10px; }
  .tab-content { padding: 16px; }
  .info-section { padding: 16px; }
}
</style>
