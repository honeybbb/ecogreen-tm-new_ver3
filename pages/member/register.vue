<script setup>
import {onMounted, ref, watch, computed} from 'vue';
import { useRouter } from 'nuxt/app';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";

const authStore = useAuthStore();
const router = useRouter();
const {
  bankOptions,
  siteOptions,
  typeOptions,
  positionOptions,
  disabledOptions,
  fetchBankOption,
  fetchSiteOptions,
  fetchTypeOptions,
  fetchPositionOptions,
  fetchDisabledOptions,
} = useApi();

// 현재 단계
const currentStep = ref(1);
const totalSteps = 4;

// 진행도
const progressPercentage = computed(() => {
  return (currentStep.value / totalSteps) * 100;
});

// 단계별 정보
const steps = [
  { number: 1, title: '기본 정보', icon: 'mdi-account' },
  { number: 2, title: '특이 사항', icon: 'mdi-alert-circle' },
  { number: 3, title: '근무 정보', icon: 'mdi-briefcase' },
  { number: 4, title: '급여 정보', icon: 'mdi-cash' }
];

// 1. 폼 데이터 모델
const employee = ref({
  type: '',
  name: '',
  id: '',
  password: '',
  phone: '',
  email: '',
  firstNumber:'',
  lastNumber:'',
  birthDate: '',
  address: '',
  site: '',
  position: '',
  joinDate: '',
  endDate: '',
  status: '재직',
  gender: '',
  disability: '',
  disability_date: '',
  disability_grade: '',
  defector: '',
  patriot: '',
  intern: '',
  beneficiary: '',
  foreigner: '',
  nationality: '',
  visa_code: '',
  visa_date: '',
  bankName: '국민',
  accountNumber: '',
  four_ins: 'Y',
  retire_pension: 'N',
  bigo: '',
  departureDate: '',
  departureReason: '',
});

const showModal = ref(false);
const items = ref([]);

const contractYear = computed(() => {
  if (employee.value.joinDate) {
    return String(employee.value.joinDate).slice(0, 4)
  }
  return String(new Date().getFullYear())
});

const wageInputs = ref({});
const contractBlob = ref(null);
const contractDataTemp = ref(null);
const isContractSaved = ref(false);

const todayDate = computed(() => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
});

// 3. 폼 제출 핸들러
const handleSubmit = async () => {
  if (!employee.value.site) {
    alert('현장을 선택해주세요.');
    return;
  }

  if (!confirm(`${employee.value.name} 직원을 등록하시겠습니까?`)) return;

  const payload = {
    ...employee.value,
    wageInputs: wageInputs.value
  };

  try {
    const res = await axios.post('/api/v1/member/register', payload);

    if (res.data.result) {
      alert(`${employee.value.name} 직원이 성공적으로 등록되었습니다.`);
      router.push('/member/list');
    } else {
      alert('등록 실패: ' + (res.data.message || '알 수 없는 오류'));
    }
  } catch (error) {
    console.error('API 호출 에러:', error);
    alert('서버 통신 중 오류가 발생했습니다.');
  }
};

const totalWage = computed(() => {
  let sum = 0;
  for (const key in wageInputs.value) {
    const val = parseInt(wageInputs.value[key]) || 0;
    sum += val;
  }
  return sum;
});

// 4. 취소 버튼 핸들러
const handleCancel = () => {
  if (confirm('작성 중인 내용이 사라집니다. 취소하시겠습니까?')) {
    router.push('/member/list');
  }
};

//지급항목
const getWageCode = async function () {
  const cIdx = authStore.user?.cIdx;
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    const rawData = res.data.data || [];
    items.value = rawData.filter(item => item.groupCd === '04001');
  } catch (err) {
    console.error("항목 로드 실패", err);
  }
}

watch(
    () => [employee.value.firstNumber, employee.value.lastNumber],
    ([front, back]) => {
      if (!front || front.length !== 6) return;

      let yearPrefix = '';
      const yearPart = front.substring(0, 2);
      const monthPart = front.substring(2, 4);
      const dayPart = front.substring(4, 6);

      if (back && back.length >= 1) {
        const genderCode = back.substring(0, 1);

        if (['1', '2', '5', '6'].includes(genderCode)) {
          yearPrefix = '19';
        } else if (['3', '4', '7', '8'].includes(genderCode)) {
          yearPrefix = '20';
        } else {
          yearPrefix = '19';
        }
      } else {
        const currentYearShort = new Date().getFullYear() % 100;
        if (parseInt(yearPart) > currentYearShort) {
          yearPrefix = '19';
        } else {
          yearPrefix = '20';
        }
      }

      const fullDate = `${yearPrefix}${yearPart}-${monthPart}-${dayPart}`;

      if (isValidDate(fullDate)) {
        employee.value.birthDate = fullDate;
      }
    }
);

const isValidDate = (dateString) => {
  const regEx = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateString.match(regEx)) return false;
  const d = new Date(dateString);
  const dNum = d.getTime();
  if (!dNum && dNum !== 0) return false;
  return d.toISOString().slice(0, 10) === dateString;
};

const requiredFields = {
  1: ['type', 'name', 'id', 'password', 'gender', 'firstNumber', 'lastNumber'], // 기본 정보
  2: ['disability', 'defector', 'patriot', 'intern', 'beneficiary', 'foreigner'], // 특이 사항
  3: ['site', 'position', 'joinDate', 'status'], // 근무 정보
  4: [] // 마지막 단계는 handleSubmit에서 전체 검증
};

// 2. 유효성 검사 함수
const validateStep = (step) => {
  const fields = requiredFields[step];
  if (!fields) return true;

  for (const field of fields) {
    const value = employee.value[field];

    // 값이 비어있거나 (문자열인 경우) 공백만 있는 경우 체크
    if (value === null || value === undefined || value === '') {
      return false;
    }
  }

  // 특수 조건 검증 (예: 외국인 선택 시 국적/비자 필수)
  if (step === 2) {
    if (employee.value.foreigner === 'Y') {
      if (!employee.value.nationality || !employee.value.visa_code) return false;
    }
    if (employee.value.disability === 'Y') {
      if (!employee.value.disability_grade) return false;
    }
  }

  return true;
};

// 단계 이동
const nextStep = () => {
  if (validateStep(currentStep.value)) {
    if (currentStep.value < totalSteps) {
      currentStep.value++;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } else {
    // 사용자에게 알림 (에러 메시지나 토스트 UI를 쓰시면 더 좋습니다)
    alert('현재 단계의 필수 항목을 모두 입력해주세요.');
  }
};

const prevStep = () => {
  if (currentStep.value > 1) {
    currentStep.value--;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

onMounted(() => {
  fetchSiteOptions()
  fetchTypeOptions()
  fetchPositionOptions()
  fetchDisabledOptions()
  fetchBankOption();
  getWageCode();
});
</script>

<template>
  <div class="member-register-page">
    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <button @click="handleCancel" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-account-plus"></i>
            직원 등록
          </h1>
          <p class="page-subtitle">새로운 직원 정보를 등록합니다</p>
        </div>
      </div>
      <div class="header-actions">
        <button @click="handleCancel" class="btn-cancel">
          <i class="mdi mdi-close"></i>
          <span>취소</span>
        </button>
      </div>
    </div>

    <!-- 진행 단계 -->
    <div class="steps-container">
      <div class="steps-progress">
        <div class="progress-bar">
          <div class="progress-fill" :style="{ width: progressPercentage + '%' }"></div>
        </div>
      </div>

      <div class="steps-list">
        <div
            v-for="step in steps"
            :key="step.number"
            :class="['step-item', {
            active: currentStep === step.number,
            completed: currentStep > step.number
          }]"
        >
          <div class="step-circle">
            <i v-if="currentStep > step.number" class="mdi mdi-check"></i>
            <i v-else-if="currentStep === step.number" :class="['mdi', step.icon]"></i>
            <span v-else>{{ step.number }}</span>
          </div>
          <div class="step-info">
            <span class="step-number">STEP {{ step.number }}</span>
            <span class="step-title">{{ step.title }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 폼 컨테이너 -->
    <form @submit.prevent="handleSubmit">
      <div class="form-container">
        <!-- Step 1: 기본 정보 -->
        <div v-show="currentStep === 1" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-account"></i>
            <h2>기본 정보</h2>
          </div>

          <div class="form-grid">
            <!-- 구분 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-tag"></i>
                구분
              </label>
              <select v-model="employee.type" required class="form-select">
                <option value="">선택하세요</option>
                <option v-for="type in typeOptions" :key="type.itemCd" :value="type.itemCd">
                  {{ type.itemNm }}
                </option>
              </select>
            </div>

            <!-- 이름 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account"></i>
                이름
              </label>
              <input
                  type="text"
                  v-model="employee.name"
                  required
                  class="form-input"
                  placeholder="홍길동"
              />
            </div>

            <!-- 사번 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-card-account-details"></i>
                사번
              </label>
              <input
                  type="text"
                  v-model="employee.id"
                  required
                  class="form-input"
                  placeholder="EMP001"
              />
            </div>

            <!-- 비밀번호 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-lock"></i>
                비밀번호
              </label>
              <input
                  type="password"
                  v-model="employee.password"
                  required
                  class="form-input"
                  placeholder="••••••••"
              />
            </div>

            <!-- 연락처 -->
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-phone"></i>
                연락처
              </label>
              <input
                  type="tel"
                  v-model="employee.phone"
                  class="form-input"
                  placeholder="010-0000-0000"
              />
            </div>

            <!-- 이메일 -->
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-email"></i>
                이메일
              </label>
              <input
                  type="email"
                  v-model="employee.email"
                  class="form-input"
                  placeholder="example@email.com"
              />
            </div>

            <!-- 성별 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-human-male-female"></i>
                성별
              </label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="M" v-model="employee.gender" />
                  <span class="radio-text">남성</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="F" v-model="employee.gender" />
                  <span class="radio-text">여성</span>
                </label>
              </div>
            </div>

            <!-- 주민번호 -->
            <div class="form-group full-width">
              <label class="form-label required">
                <i class="mdi mdi-card-account-details-outline"></i>
                주민번호
              </label>
              <div class="ssn-group">
                <input
                    type="text"
                    v-model="employee.firstNumber"
                    class="form-input ssn-input"
                    maxlength="6"
                    placeholder="000000"
                />
                <span class="ssn-separator">-</span>
                <input
                    type="password"
                    v-model="employee.lastNumber"
                    class="form-input ssn-input"
                    maxlength="7"
                    placeholder="0000000"
                    autocomplete="off"
                />
              </div>
            </div>

            <!-- 생년월일 -->
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-cake-variant"></i>
                생년월일
              </label>
              <input
                  type="date"
                  v-model="employee.birthDate"
                  class="form-input"
              />
            </div>

            <!-- 주소 -->
            <div class="form-group full-width">
              <label class="form-label">
                <i class="mdi mdi-home"></i>
                주소
              </label>
              <input
                  type="text"
                  v-model="employee.address"
                  class="form-input"
                  placeholder="서울시 강남구..."
              />
            </div>
          </div>

          <div class="form-actions">
            <button type="button" @click="nextStep" class="btn-next">
              다음 단계
              <i class="mdi mdi-arrow-right"></i>
            </button>
          </div>
        </div>

        <!-- Step 2: 특이 사항 -->
        <div v-show="currentStep === 2" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-alert-circle"></i>
            <h2>특이 사항</h2>
          </div>

          <div class="form-grid">
            <!-- 장애 여부 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-wheelchair-accessibility"></i>
                장애 여부
              </label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="Y" v-model="employee.disability" />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.disability" />
                  <span class="radio-text">아니오</span>
                </label>
              </div>
            </div>

            <!-- 장애등록일 -->
            <div v-if="employee.disability === 'Y'" class="form-group">
              <label class="form-label">
                <i class="mdi mdi-calendar"></i>
                장애등록일
              </label>
              <input
                  type="date"
                  v-model="employee.disability_date"
                  class="form-input"
              />
            </div>

            <!-- 장애등급 -->
            <div v-if="employee.disability === 'Y'" class="form-group">
              <label class="form-label">
                <i class="mdi mdi-format-list-numbered"></i>
                장애등급
              </label>
              <select v-model="employee.disability_grade" class="form-select">
                <option value="">선택하세요</option>
                <option v-for="item in disabledOptions" :key="item.itemCd" :value="item.itemCd">
                  {{ item.itemNm }}
                </option>
              </select>
            </div>

            <!-- 새터민 여부 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account-group"></i>
                새터민 여부
              </label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="Y" v-model="employee.defector" />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.defector" />
                  <span class="radio-text">아니오</span>
                </label>
              </div>
            </div>

            <!-- 국가유공자 여부 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-medal"></i>
                국가유공자 여부
              </label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="Y" v-model="employee.patriot" />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.patriot" />
                  <span class="radio-text">아니오</span>
                </label>
              </div>
            </div>

            <!-- 청년인턴 여부 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-school"></i>
                청년인턴 여부
              </label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="Y" v-model="employee.intern" />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.intern" />
                  <span class="radio-text">아니오</span>
                </label>
              </div>
            </div>

            <!-- 기초수급자 여부 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-hand-heart"></i>
                기초수급자 여부
              </label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="Y" v-model="employee.beneficiary" />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.beneficiary" />
                  <span class="radio-text">아니오</span>
                </label>
              </div>
            </div>

            <!-- 외국인 여부 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-earth"></i>
                외국인 여부
              </label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="Y" v-model="employee.foreigner" />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.foreigner" />
                  <span class="radio-text">아니오</span>
                </label>
              </div>
            </div>

            <!-- 국적 -->
            <div v-if="employee.foreigner === 'Y'" class="form-group">
              <label class="form-label">
                <i class="mdi mdi-flag"></i>
                국적
              </label>
              <input
                  type="text"
                  v-model="employee.nationality"
                  class="form-input"
                  placeholder="예: 베트남"
              />
            </div>

            <!-- 비자 코드 -->
            <div v-if="employee.foreigner === 'Y'" class="form-group">
              <label class="form-label">
                <i class="mdi mdi-passport"></i>
                비자 코드
              </label>
              <input
                  type="text"
                  v-model="employee.visa_code"
                  class="form-input"
                  placeholder="예: E-9"
              />
            </div>

            <!-- 비자만료일 -->
            <div v-if="employee.foreigner === 'Y'" class="form-group">
              <label class="form-label">
                <i class="mdi mdi-calendar-clock"></i>
                비자만료일
              </label>
              <input
                  type="date"
                  v-model="employee.visa_date"
                  class="form-input"
              />
            </div>
          </div>

          <div class="form-actions">
            <button type="button" @click="prevStep" class="btn-prev">
              <i class="mdi mdi-arrow-left"></i>
              이전
            </button>
            <button type="button" @click="nextStep" class="btn-next">
              다음 단계
              <i class="mdi mdi-arrow-right"></i>
            </button>
          </div>
        </div>

        <!-- Step 3: 근무 정보 -->
        <div v-show="currentStep === 3" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-briefcase"></i>
            <h2>근무 정보</h2>
          </div>

          <div class="form-grid">
            <!-- 근무 현장 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-office-building"></i>
                근무 현장
              </label>
              <select v-model="employee.site" required class="form-select">
                <option value="">선택하세요</option>
                <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
                  {{ site.name }}
                </option>
              </select>
            </div>

            <!-- 직위 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account-tie"></i>
                직위
              </label>
              <select v-model="employee.position" required class="form-select">
                <option value="">선택하세요</option>
                <option v-for="pos in positionOptions" :key="pos.itemCd" :value="pos.itemCd">
                  {{ pos.itemNm }}
                </option>
              </select>
            </div>

            <!-- 입사일 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-calendar-start"></i>
                입사일
              </label>
              <input
                  type="date"
                  v-model="employee.joinDate"
                  required
                  class="form-input"
              />
            </div>

            <!-- 재직 상태 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account-check"></i>
                재직 상태
              </label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" v-model="employee.status" value="0" />
                  <span class="radio-text">재직</span>
                </label>
                <label class="radio-label">
                  <input type="radio" v-model="employee.status" value="1" />
                  <span class="radio-text">퇴사</span>
                </label>
              </div>
            </div>

            <!-- 퇴사일 -->
            <div v-if="employee.status == 1" class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-calendar-end"></i>
                퇴사일
              </label>
              <input
                  type="date"
                  v-model="employee.outDate"
                  required
                  class="form-input"
              />
            </div>

            <!-- 근로계약서 보기 버튼 -->
            <div class="form-group full-width">
              <button type="button" @click="showModal = true" class="btn-contract">
                <i class="mdi mdi-file-document"></i>
                근로계약서 작성
              </button>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" @click="prevStep" class="btn-prev">
              <i class="mdi mdi-arrow-left"></i>
              이전
            </button>
            <button type="button" @click="nextStep" class="btn-next">
              다음 단계
              <i class="mdi mdi-arrow-right"></i>
            </button>
          </div>
        </div>

        <!-- Step 4: 급여 정보 -->
        <div v-show="currentStep === 4" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-cash"></i>
            <h2>급여 및 기타 정보</h2>
          </div>

          <div class="form-grid">
            <!-- 은행 -->
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-bank"></i>
                은행
              </label>
              <select v-model="employee.bankName" class="form-select">
                <option v-for="bank in bankOptions" :key="bank.itemNm" :value="bank.itemNm">
                  {{ bank.itemNm }}
                </option>
              </select>
            </div>

            <!-- 계좌번호 -->
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-credit-card"></i>
                계좌번호
              </label>
              <input
                  type="text"
                  v-model="employee.accountNumber"
                  class="form-input"
                  placeholder="숫자만 입력"
              />
            </div>

            <!-- 4대보험 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-shield-check"></i>
                4대보험 가입
              </label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="Y" v-model="employee.four_ins" />
                  <span class="radio-text">가입</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.four_ins" />
                  <span class="radio-text">미가입</span>
                </label>
              </div>
            </div>

            <!-- 퇴직연금 -->
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-piggy-bank"></i>
                퇴직연금 가입
              </label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="Y" v-model="employee.retire_pension" />
                  <span class="radio-text">가입</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.retire_pension" />
                  <span class="radio-text">미가입</span>
                </label>
              </div>
            </div>

            <!-- 비고 -->
            <div class="form-group full-width">
              <label class="form-label">
                <i class="mdi mdi-note-text"></i>
                비고
              </label>
              <textarea
                  v-model="employee.bigo"
                  class="form-textarea"
                  rows="4"
                  placeholder="추가 사항을 입력하세요"
              ></textarea>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" @click="prevStep" class="btn-prev">
              <i class="mdi mdi-arrow-left"></i>
              이전
            </button>
            <button type="submit" class="btn-submit">
              <i class="mdi mdi-check"></i>
              등록 완료
            </button>
          </div>
        </div>
      </div>
    </form>

    <!-- 근로계약서 모달 -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-container">
        <div class="modal-header">
          <h3 class="modal-title">
            <i class="mdi mdi-file-document"></i>
            근로계약서
          </h3>
          <button @click="showModal = false" class="modal-close">
            <i class="mdi mdi-close"></i>
          </button>
        </div>

        <div class="modal-body">
          <div class="contract-document">
            <!-- 제목 -->
            <div class="contract-header">
              <h1 class="contract-title">근로계약서 {{ contractYear }}년</h1>
              <p class="contract-date">작성일: {{ todayDate }}</p>
            </div>

            <!-- 서문 -->
            <p class="contract-intro">
              ㈜에코그린티엠 대표이사 백송이(이하 "갑"이라 칭함)과 근로자
              <strong>{{ employee.name }}</strong>
              (이하 "을"이라 칭함)간에 취업규칙을 성실히 준수할 것을 서약하고
              다음과 같이 근로계약을 체결한다.
            </p>

            <!-- 제1조 -->
            <div class="contract-section">
              <h4 class="section-title">제1조 (근로계약 기간)</h4>
              <div class="contract-content">
                <p>1. 근로계약 기간은</p>
                <div class="date-group">
                  <input type="date" v-model="employee.joinDate" class="contract-input">
                  <span>부터</span>
                  <input type="date" v-model="employee.endDate" class="contract-input">
                  <span>까지로 한다.</span>
                </div>
                <p>2. "을"의 계속 근무 의사가 있고 "갑"의 계약 갱신 필요성 및 사업장 운영 상황에 따라 상호 협의 후 계약을 갱신할 수 있다.</p>
              </div>
            </div>

            <!-- 제2조 -->
            <div class="contract-section">
              <h4 class="section-title">제2조 (근무 장소 및 업무 내용)</h4>
              <div class="contract-content">
                <p>1. 근무 장소는
                  <select v-model="employee.site" class="contract-select">
                    <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
                      {{ site.name }}
                    </option>
                  </select>
                </p>
                <p>2. 직무는
                  <input type="text" v-model="employee.position" class="contract-input" /> 업무 일체로 한다.
                </p>
              </div>
            </div>

            <!-- 제3조 -->
            <div class="contract-section">
              <h4 class="section-title">제3조 (근로시간 및 휴게)</h4>
              <div class="contract-content">
                <p>1. 소정근로시간은 1일 8시간, 1주 40시간을 원칙으로 한다.</p>
                <p>2. 휴게시간은 1일 1시간으로 하되, 구체적인 시간은 현장 운영 사정에 따라 조정할 수 있다.</p>
              </div>
            </div>

            <!-- 제4조 임금 -->
            <div class="contract-section">
              <h4 class="section-title">제4조 (임금)</h4>
              <div class="wage-table-wrapper">
                <table class="wage-table">
                  <thead>
                  <tr>
                    <th v-for="wage in items" :key="wage.itemCd">{{ wage.itemNm }}</th>
                    <th>합계</th>
                  </tr>
                  </thead>
                  <tbody>
                  <tr>
                    <td v-for="wage in items" :key="wage.itemCd">
                      <input
                          type="text"
                          class="wage-input"
                          v-model="wageInputs[wage.itemCd]"
                          placeholder="0"
                      />
                    </td>
                    <td class="total-cell">{{ totalWage.toLocaleString() }}원</td>
                  </tr>
                  </tbody>
                </table>
              </div>
              <div class="contract-content">
                <p>1. 위 임금은 매월 말일에 마감하여 익월 ○일에 지급한다.</p>
                <p>2. 임금의 구성 및 지급일, 지급방법 등 기타 사항은 회사의 취업규칙 및 임금규정에 따른다.</p>
              </div>
            </div>

            <!-- 제5조 -->
            <div class="contract-section">
              <h4 class="section-title">제5조 (휴일 및 휴가)</h4>
              <div class="contract-content">
                <p>1. 휴일은 주휴일 1일을 포함하여 근로기준법 및 회사 규정에 따른다.</p>
                <p>2. 연차유급휴가는 근로기준법 및 회사의 연차규정에 따라 부여한다.</p>
              </div>
            </div>

            <!-- 제6조 -->
            <div class="contract-section">
              <h4 class="section-title">제6조 (기타)</h4>
              <div class="contract-content">
                <p>1. 본 계약서에 명시되지 아니한 사항은 근로기준법, 기타 관계 법령과 회사 취업규칙을 따른다.</p>
                <p>2. "갑"과 "을"은 상호 성실의 원칙에 따라 근로관계를 유지하며, 회사의 정당한 업무지시에 협조한다.</p>
              </div>
            </div>

            <!-- 서명란 -->
            <div class="signature-section">
              <p class="signature-intro">
                위 근로계약 내용을 상호 확인하였으며, 이를 증명하기 위하여
                본 계약서를 2부 작성하여 갑과 을이 각각 1부씩 보관한다.
              </p>

              <p class="signature-date">
                <strong>{{ contractYear }}년 {{ todayDate.slice(5,7) }}월 {{ todayDate.slice(8,10) }}일</strong>
              </p>

              <div class="signature-parties">
                <div class="party">
                  <p class="party-title">"갑" ㈜에코그린티엠</p>
                  <p>주소: (회사 주소)</p>
                  <p>대표이사: 백송이 (인)</p>
                </div>
                <div class="party">
                  <p class="party-title">"을" 근로자</p>
                  <p>성명: {{ employee.name }} (인)</p>
                  <p>주소: {{ employee.address || '________________' }}</p>
                  <p>연락처: {{ employee.phone || '________________' }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showModal = false" class="btn-modal-cancel">
            닫기
          </button>
          <button
              @click="[showModal = false, isContractSaved = true]"
              class="btn-modal-save"
          >
            <i class="mdi mdi-content-save"></i>
            저장
          </button>
        </div>
      </div>
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

.btn-cancel {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  color: #64748b;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-cancel:hover {
  background: #fef2f2;
  border-color: #fecaca;
  color: #dc2626;
}

.btn-cancel i {
  font-size: 18px;
}

/* === 진행 단계 === */
.steps-container {
  background: white;
  border-radius: 16px;
  padding: 28px;
  margin-bottom: 28px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.steps-progress {
  margin-bottom: 24px;
}

.progress-bar {
  height: 8px;
  background: #f1f5f9;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s ease;
}

.steps-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.step-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 10px;
  transition: all 0.2s;
}

.step-item.active {
  background: #eff6ff;
}

.step-circle {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #f1f5f9;
  color: #94a3b8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 18px;
  flex-shrink: 0;
  transition: all 0.3s;
}

.step-item.active .step-circle {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.step-item.completed .step-circle {
  background: #10b981;
  color: white;
}

.step-circle i {
  font-size: 24px;
}

.step-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.step-number {
  font-size: 11px;
  color: #94a3b8;
  font-weight: 600;
}

.step-title {
  font-size: 14px;
  color: #1e293b;
  font-weight: 600;
}

.step-item.active .step-number,
.step-item.active .step-title {
  color: #667eea;
}

/* === 폼 컨테이너 === */
.form-container {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
}

.form-step {
  padding: 32px;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-bottom: 20px;
  margin-bottom: 28px;
  border-bottom: 2px solid #f1f5f9;
}

.step-header i {
  font-size: 32px;
  color: #667eea;
}

.step-header h2 {
  font-size: 24px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
}

/* === 폼 그리드 === */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 24px;
  margin-bottom: 32px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group.full-width {
  grid-column: 1 / -1;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #475569;
}

.form-label i {
  font-size: 16px;
  color: #667eea;
}

.form-label.required::after {
  content: '*';
  color: #ef4444;
  margin-left: 4px;
}

.form-input,
.form-select,
.form-textarea {
  padding: 12px 16px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  color: #334155;
  transition: all 0.2s;
  background: white;
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-input::placeholder {
  color: #94a3b8;
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
}

/* 주민번호 입력 */
.ssn-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ssn-input {
  flex: 1;
  text-align: center;
}

.ssn-separator {
  font-size: 24px;
  font-weight: 700;
  color: #cbd5e1;
}

/* 라디오 그룹 */
.radio-group {
  display: flex;
  gap: 16px;
  padding: 8px 0;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 8px 16px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  transition: all 0.2s;
  background: white;
}

.radio-label:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.radio-label input[type="radio"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.radio-label input[type="radio"]:checked + .radio-text {
  color: #667eea;
  font-weight: 600;
}

.radio-text {
  font-size: 14px;
  color: #64748b;
}

/* 근로계약서 버튼 */
.btn-contract {
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 10px;
  color: white;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: all 0.3s;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-contract:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.btn-contract i {
  font-size: 20px;
}

/* === 폼 액션 버튼 === */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 24px;
  border-top: 1px solid #f1f5f9;
}

.btn-prev,
.btn-next,
.btn-submit {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-prev {
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.btn-prev:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-next,
.btn-submit {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-next:hover,
.btn-submit:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.btn-prev i,
.btn-next i,
.btn-submit i {
  font-size: 18px;
}

/* === 모달 === */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-container {
  background: white;
  border-radius: 16px;
  width: 100%;
  max-width: 900px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px 28px;
  border-bottom: 1px solid #f1f5f9;
}

.modal-title {
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-title i {
  font-size: 24px;
  color: #667eea;
}

.modal-close {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #f8fafc;
  border: none;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.modal-close:hover {
  background: #e2e8f0;
  color: #334155;
}

.modal-close i {
  font-size: 24px;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px;
}

.modal-body::-webkit-scrollbar {
  width: 8px;
}

.modal-body::-webkit-scrollbar-track {
  background: #f1f5f9;
  border-radius: 4px;
}

.modal-body::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 28px;
  border-top: 1px solid #f1f5f9;
}

.btn-modal-cancel,
.btn-modal-save {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 6px;
}

.btn-modal-cancel {
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.btn-modal-cancel:hover {
  background: #f8fafc;
}

.btn-modal-save {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
}

.btn-modal-save:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
}

/* === 근로계약서 스타일 === */
.contract-document {
  background: white;
  padding: 40px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.8;
  color: #334155;
}

.contract-header {
  text-align: center;
  margin-bottom: 32px;
}

.contract-title {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 12px 0;
  letter-spacing: 4px;
}

.contract-date {
  font-size: 13px;
  color: #64748b;
  margin: 0;
}

.contract-intro {
  margin-bottom: 32px;
  line-height: 2;
  text-align: justify;
}

.contract-section {
  margin-bottom: 28px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid #f1f5f9;
}

.contract-content p {
  margin: 8px 0;
}

.date-group {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 12px 0;
  flex-wrap: wrap;
}

.contract-input,
.contract-select {
  padding: 6px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
}

.contract-input:focus,
.contract-select:focus {
  outline: none;
  border-color: #667eea;
}

/* 임금 테이블 */
.wage-table-wrapper {
  overflow-x: auto;
  margin: 16px 0;
}

.wage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.wage-table th,
.wage-table td {
  padding: 12px;
  border: 1px solid #e2e8f0;
  text-align: center;
}

.wage-table thead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.wage-input {
  width: 100px;
  padding: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  text-align: right;
}

.total-cell {
  font-weight: 700;
  color: #667eea;
  font-size: 14px;
}

/* 서명란 */
.signature-section {
  margin-top: 48px;
  padding-top: 32px;
  border-top: 2px dashed #cbd5e1;
}

.signature-intro {
  text-align: center;
  margin-bottom: 24px;
  line-height: 2;
}

.signature-date {
  text-align: center;
  margin-bottom: 32px;
  font-size: 16px;
}

.signature-parties {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  margin-top: 32px;
}

.party {
  padding: 20px;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.party-title {
  font-size: 16px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 12px 0;
}

.party p {
  margin: 6px 0;
  font-size: 13px;
  color: #64748b;
}

/* === 반응형 === */
@media (max-width: 1024px) {
  .steps-list {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: 16px;
  }

  .header-actions {
    width: 100%;
  }

  .btn-cancel {
    width: 100%;
    justify-content: center;
  }

  .steps-list {
    grid-template-columns: 1fr;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .signature-parties {
    grid-template-columns: 1fr;
  }

  .ssn-group {
    flex-direction: column;
    align-items: stretch;
  }

  .ssn-input {
    text-align: left;
  }
}
</style>
