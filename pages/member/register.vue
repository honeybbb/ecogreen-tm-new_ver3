<script setup>
import {onMounted, ref, watch, computed} from 'vue';
import { useRouter } from 'nuxt/app';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";
import ContractModal from "~/components/contractModal.vue";
import auth from "~/middleware/auth.js";

const authStore = useAuthStore();
const router = useRouter();

const {
  companyData,
  bankOptions,
  siteOptions,
  typeOptions,
  positionOptions,
  disabledOptions,
  getCompanyData,
  fetchBankOption,
  fetchSiteOptions,
  fetchTypeOptions,
  fetchPositionOptions,
  fetchDisabledOptions,
} = useApi();

const cIdx = authStore.user?.cIdx;

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
  // { number: 4, title: '급여 정보', icon: 'mdi-cash' }
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
  //기타 특이사항 1, 2, 3 (이름과 여부)
  etc_name_1: '',
  etc_value_1: '',
  etc_name_2: '',
  etc_value_2: '',
  etc_name_3: '',
  etc_value_3: '',
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

const handleContractSave = (savedData) => {
  // 모달에서 넘어온 데이터 중 wageInputs를 부모의 wageInputs에 저장
  wageInputs.value = savedData.wageInputs;
  contractDataTemp.value = savedData;

  alert('근로계약서 내용이 임시 저장되었습니다.');
};

// 3. 폼 제출 핸들러
const handleSubmit = async () => {
  if (!employee.value.site) {
    alert('현장을 선택해주세요.');
    return;
  }

  if (!contractDataTemp.value || !contractDataTemp.value.contractStartDt || !contractDataTemp.value.contractEndDt) {
    alert('근로계약서의 계약기간을 입력해주세요.\n근로계약서 작성 버튼을 클릭하여 계약 시작일과 종료일을 입력하세요.');
    return;
  }

  if (!confirm(`${employee.value.name} 직원을 등록하시겠습니까?`)) return;

  const payload = {
    ...employee.value,
    cIdx: cIdx,
    contractData: contractDataTemp.value,
    wageInputs: wageInputs.value
  };

  try {
    const res = await axios.post('/api/v1/member/register', payload);

    if (res.data.result) {
      alert(`${employee.value.name} 직원이 성공적으로 등록되었습니다.`);
      await router.push('/member/list');
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
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    const rawData = res.data.data || [];
    items.value = rawData.filter(item => item.groupCd === '04001');
  } catch (err) {
    console.error("항목 로드 실패", err);
  }
}

const getBudgetData = async function () {
  // 현장과 직위가 모두 선택되어 있어야만 데이터를 가져옵니다.
  if (!employee.value.site || !employee.value.position) return;

  let params = {
    sIdx: employee.value.site,
    type: employee.value.type
  }

  try {
    const res = await axios.get(`/api/v1/site/contract/budget`, {params});
    const budgetList = res.data.data;

    if (budgetList && budgetList.length > 0) {
      const targetPosition = employee.value.position;
      const jsonData = budgetList[0].jsonData;

      const newWageInputs = {};

      // 1. jsonData 내의 directLabor(직접노무비-지급항목) 배열을 순회합니다.
      if (jsonData && jsonData.directLabor) {
        jsonData.directLabor.forEach(item => {
          console.log(item, 'item', targetPosition)
          // item.code (예: "04001001") 와 해당 직책의 금액이 존재할 경우
          if (item.code && item.values && item.values[targetPosition] !== undefined) {
            newWageInputs[item.code] = item.values[targetPosition];
          }
        });
      }

      // 2. 부모 컴포넌트의 wageInputs 상태 업데이트
      wageInputs.value = newWageInputs;

      // 3. 모달(ContractModal)에 전달되는 employee 객체에 계약 데이터 세팅
      // 모달 내부의 watch가 이 값을 감지하여 자동으로 임금 입력칸에 뿌려줍니다.
      if (!employee.value.contract) {
        employee.value.contract = {};
      }
      employee.value.contract.contractData = newWageInputs;

      console.log('예산 데이터 적용 완료:', newWageInputs);
    }
  } catch (err) {
    console.error('예산 데이터 로드 실패:', err);
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

watch(() => employee.value.site, (newType) => {
  if (newType && employee.value.site) {
    getBudgetData();
  }
});

watch(() => employee.value.position, (newType) => {
  if (newType && employee.value.position) {
    getBudgetData();
  }
});

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
  getCompanyData(),
  fetchSiteOptions()
  fetchTypeOptions()
  fetchPositionOptions()
  fetchDisabledOptions()
  fetchBankOption()
  getWageCode();
});
</script>

<template>
  <div class="member-register-page">
    <div class="page-header">
      <div class="header-left">
        <button @click="handleCancel" class="btn-back" style="padding: 10px;">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-account-plus-outline"></i>
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

    <div class="steps-container">
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

    <form @submit.prevent="handleSubmit">
      <div class="form-container">

        <div v-show="currentStep === 1" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-account-outline"></i>
            <h2>기본 정보</h2>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-tag-outline"></i>
                구분
              </label>
              <select v-model="employee.type" required class="form-select">
                <option value="">선택하세요</option>
                <option v-for="type in typeOptions" :key="type.itemCd" :value="type.itemCd">
                  {{ type.itemNm }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account-outline"></i>
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

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-card-account-details-outline"></i>
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

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-lock-outline"></i>
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

            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-phone-outline"></i>
                연락처
              </label>
              <input
                  type="tel"
                  v-model="employee.phone"
                  class="form-input"
                  placeholder="010-0000-0000"
              />
            </div>

            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-email-outline"></i>
                이메일
              </label>
              <input
                  type="email"
                  v-model="employee.email"
                  class="form-input"
                  placeholder="example@email.com"
              />
            </div>

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

            <div class="form-group full-width">
              <label class="form-label required">
                <i class="mdi mdi-badge-account-horizontal-outline"></i>
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

            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-cake-variant-outline"></i>
                생년월일
              </label>
              <input
                  type="date"
                  v-model="employee.birthDate"
                  class="form-input"
              />
            </div>

            <div class="form-group full-width">
              <label class="form-label">
                <i class="mdi mdi-home-outline"></i>
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

        <div v-show="currentStep === 2" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-alert-circle-outline"></i>
            <h2>특이 사항</h2>
          </div>

          <div class="form-grid">
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

            <div v-if="employee.disability === 'Y'" class="form-group">
              <label class="form-label">
                <i class="mdi mdi-calendar-outline"></i>
                장애등록일
              </label>
              <input
                  type="date"
                  v-model="employee.disability_date"
                  class="form-input"
              />
            </div>

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

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account-group-outline"></i>
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

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-medal-outline"></i>
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

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-school-outline"></i>
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

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-hand-heart-outline"></i>
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

            <div v-if="employee.foreigner === 'Y'" class="form-group">
              <label class="form-label">
                <i class="mdi mdi-flag-outline"></i>
                국적
              </label>
              <input
                  type="text"
                  v-model="employee.nationality"
                  class="form-input"
                  placeholder="예: 베트남"
              />
            </div>

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

            <div v-if="employee.foreigner === 'Y'" class="form-group">
              <label class="form-label">
                <i class="mdi mdi-calendar-clock-outline"></i>
                비자만료일
              </label>
              <input
                  type="date"
                  v-model="employee.visa_date"
                  class="form-input"
              />
            </div>

            <div class="form-group full-width">
              <label class="form-label">
                <i class="mdi mdi-dots-horizontal-circle-outline"></i>
                기타 특이사항 (정부 정책 등 자유 입력)
              </label>

              <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 8px;">
                <input
                    type="text"
                    v-model="employee.etc_name_1"
                    class="form-input"
                    style="flex: 1;"
                    placeholder="항목명 입력 (예: 일자리안정자금 대상)"
                />
                <div class="radio-group" style="margin: 0; padding: 0; min-width: 140px;">
                  <label class="radio-label" style="padding: 6px 12px;">
                    <input type="radio" value="Y" v-model="employee.etc_value_1" />
                    <span class="radio-text">예</span>
                  </label>
                  <label class="radio-label" style="padding: 6px 12px;">
                    <input type="radio" value="N" v-model="employee.etc_value_1" />
                    <span class="radio-text">아니오</span>
                  </label>
                </div>
              </div>

              <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 8px;">
                <input
                    type="text"
                    v-model="employee.etc_name_2"
                    class="form-input"
                    style="flex: 1;"
                    placeholder="항목명 입력"
                />
                <div class="radio-group" style="margin: 0; padding: 0; min-width: 140px;">
                  <label class="radio-label" style="padding: 6px 12px;">
                    <input type="radio" value="Y" v-model="employee.etc_value_2" />
                    <span class="radio-text">예</span>
                  </label>
                  <label class="radio-label" style="padding: 6px 12px;">
                    <input type="radio" value="N" v-model="employee.etc_value_2" />
                    <span class="radio-text">아니오</span>
                  </label>
                </div>
              </div>

              <div style="display: flex; gap: 12px; align-items: center;">
                <input
                    type="text"
                    v-model="employee.etc_name_3"
                    class="form-input"
                    style="flex: 1;"
                    placeholder="항목명 입력"
                />
                <div class="radio-group" style="margin: 0; padding: 0; min-width: 140px;">
                  <label class="radio-label" style="padding: 6px 12px;">
                    <input type="radio" value="Y" v-model="employee.etc_value_3" />
                    <span class="radio-text">예</span>
                  </label>
                  <label class="radio-label" style="padding: 6px 12px;">
                    <input type="radio" value="N" v-model="employee.etc_value_3" />
                    <span class="radio-text">아니오</span>
                  </label>
                </div>
              </div>
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

        <div v-show="currentStep === 3" class="form-step">
          <div class="step-header">
            <i class="mdi mdi-briefcase-outline"></i>
            <h2>근무 정보</h2>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-office-building-outline"></i>
                근무 현장
              </label>
              <!--select v-model="employee.site" required class="form-select">
                <option value="">선택하세요</option>
                <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
                  {{ site.name }}
                </option>
              </select-->
              <SiteSelect v-model="employee.site" required :allow-empty="false" width="100%"/>
            </div>

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account-tie-outline"></i>
                직위
              </label>
              <select v-model="employee.position" required class="form-select">
                <option value="">선택하세요</option>
                <option v-for="pos in positionOptions" :key="pos.itemCd" :value="pos.itemCd">
                  {{ pos.itemNm }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-calendar-start-outline"></i>
                입사일
              </label>
              <input
                  type="date"
                  v-model="employee.joinDate"
                  required
                  class="form-input"
              />
            </div>

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account-check-outline"></i>
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
                <label class="radio-label">
                  <input type="radio" v-model="employee.status" value="2" />
                  <span class="radio-text">일용직</span>
                </label>
                <label class="radio-label">
                  <input type="radio" v-model="employee.status" value="3" />
                  <span class="radio-text">대근</span>
                </label>
              </div>
            </div>

            <div v-if="employee.status == 1" class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-calendar-end-outline"></i>
                퇴사일
              </label>
              <input
                  type="date"
                  v-model="employee.outDate"
                  required
                  class="form-input"
              />
            </div>
          </div>

          <div class="step-header">
            <i class="mdi mdi-briefcase-outline"></i>
            <h2>근로 계약서 관리</h2>
          </div>
          <div class="form-grid">
            <div class="form-group full-width">
              <button type="button" @click="showModal = true" class="btn-contract">
                <i class="mdi mdi-file-document-edit-outline"></i>
                근로계약서 작성
              </button>
            </div>
          </div>

          <div class="step-header">
            <i class="mdi mdi-cash-multiple"></i>
            <h2>급여 및 기타 정보</h2>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-bank-outline"></i>
                은행
              </label>
              <select v-model="employee.bankName" class="form-select">
                <option v-for="bank in bankOptions" :key="bank.itemNm" :value="bank.itemNm">
                  {{ bank.itemNm }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-credit-card-outline"></i>
                계좌번호
              </label>
              <input
                  type="text"
                  v-model="employee.accountNumber"
                  class="form-input"
                  placeholder="숫자만 입력"
              />
            </div>

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-shield-check-outline"></i>
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

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-piggy-bank-outline"></i>
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

            <div class="form-group full-width">
              <label class="form-label">
                <i class="mdi mdi-note-text-outline"></i>
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
            <button type="submit" class="btn-save">
              <i class="mdi mdi-check"></i>
              등록 완료
            </button>
          </div>

          <!--div class="form-actions">
            <button type="button" @click="prevStep" class="btn-prev">
              <i class="mdi mdi-arrow-left"></i>
              이전
            </button>
            <button type="button" @click="nextStep" class="btn-next">
              다음 단계
              <i class="mdi mdi-arrow-right"></i>
            </button>
          </div-->
        </div>
      </div>
    </form>

    <!--div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-container">
        <div class="modal-header">
          <h3 class="modal-title">
            <i class="mdi mdi-file-document-outline"></i>
            근로계약서
          </h3>
          <button @click="showModal = false" class="modal-close">
            <i class="mdi mdi-close"></i>
          </button>
        </div>

        <div class="modal-body">
          <div class="contract-document">
            <div class="contract-header">
              <h1 class="contract-title">근로계약서 {{ contractYear }}년</h1>
              <p class="contract-date">작성일: {{ todayDate }}</p>
            </div>

            <p class="contract-intro">
              ㈜에코그린티엠 대표이사 백송이(이하 "갑"이라 칭함)과 근로자
              <strong>{{ employee.name }}</strong>
              (이하 "을"이라 칭함)간에 취업규칙을 성실히 준수할 것을 서약하고
              다음과 같이 근로계약을 체결한다.
            </p>

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

            <div class="contract-section">
              <h4 class="section-title">제2조 (근무 장소 및 업무 내용)</h4>
              <div class="contract-content">
                <p style="display: flex;">
                  1. 근무 장소는
                  <strong>
                    {{ siteOptions.filter(s => s.idx == employee.site)[0].name }}
                  </strong>
                  <select v-model="employee.site" class="contract-select">
                    <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
                      {{ site.name }}
                    </option>
                  </select>
                </p>
                <p>2. 직무는
                  <input type="text" v-model="employee.position" class="contract-input" />
                  <strong>
                    {{positionOptions.filter(p => p.itemCd == employee.position)[0].itemNm}}
                  </strong>
                  업무 일체로 한다.
                </p>
              </div>
            </div>

            <div class="contract-section">
              <h4 class="section-title">제3조 (근로시간 및 휴게)</h4>
              <div class="contract-content">
                <p>1. 소정근로시간은 1일 8시간, 1주 40시간을 원칙으로 한다.</p>
                <p>2. 휴게시간은 1일 1시간으로 하되, 구체적인 시간은 현장 운영 사정에 따라 조정할 수 있다.</p>
              </div>
            </div>

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
                          class="wage-input text-right"
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

            <div class="contract-section">
              <h4 class="section-title">제5조 (휴일 및 휴가)</h4>
              <div class="contract-content">
                <p>1. 휴일은 주휴일 1일을 포함하여 근로기준법 및 회사 규정에 따른다.</p>
                <p>2. 연차유급휴가는 근로기준법 및 회사의 연차규정에 따라 부여한다.</p>
              </div>
            </div>

            <div class="contract-section">
              <h4 class="section-title">제6조 (기타)</h4>
              <div class="contract-content">
                <p>1. 본 계약서에 명시되지 아니한 사항은 근로기준법, 기타 관계 법령과 회사 취업규칙을 따른다.</p>
                <p>2. "갑"과 "을"은 상호 성실의 원칙에 따라 근로관계를 유지하며, 회사의 정당한 업무지시에 협조한다.</p>
              </div>
            </div>

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
          <button @click="showModal = false" class="btn-cancel">
            닫기
          </button>
          <button
              @click="[showModal = false, isContractSaved = true]"
              class="btn-save"
          >
            <i class="mdi mdi-content-save-outline"></i>
            임시 저장
          </button>
        </div>
      </div>
    </div--> <!--Modal-->

    <ContractModal
        :is-open="showModal"
        :employee-data="employee"
        :employee-type="employee.type"
        :site-options="siteOptions"
        :position-options="positionOptions"
        :wage-items="items"
        :is-editing="true"
        :company-data="companyData"
        @close="showModal = false"
        @save="handleContractSave"
    />
  </div>
</template>

<style scoped>
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

.btn-back { width: 42px; height: 42px; border-radius: 10px; background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; padding: 0; }
.btn-back:hover { background: var(--bg-hover); border-color: var(--border-focus); color: var(--text-main); }
.btn-back i { font-size: 20px; }
.btn-cancel { display: flex; align-items: center; gap: 6px; padding: 10px 18px; background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-sub); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-main); border-color: var(--border-focus); }

.btn-edit {
  display: flex; align-items: center; gap: 6px; padding: 10px 18px; height: 42px;
  background-color: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-main);
  font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  box-shadow: var(--shadow-sm); white-space: nowrap;
  box-sizing: border-box;
}
.btn-edit:hover {
  background-color: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
  transform: translateY(-1px);
}
.btn-edit i { font-size: 16px; }

/* =========================================
   진행 단계 (Steps)
========================================= */
.steps-container { background: var(--bg-surface); border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
.steps-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.step-item { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 8px; transition: all 0.2s; background: var(--bg-canvas); }
.step-item.active { background-color: var(--primary-soft); border: 1px solid var(--primary); }
.step-circle { width: 40px; height: 40px; border-radius: 50%; background: var(--text-muted); color: var(--text-inverse); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px; flex-shrink: 0; transition: all 0.2s; }
.step-item.active .step-circle { background-color: var(--primary); }
.step-item.completed .step-circle { background-color: var(--success); }
.step-circle i { font-size: 20px; }
.step-info { display: flex; flex-direction: column; gap: 2px; }
.step-number { font-size: 11px; color: var(--text-sub); font-weight: 600; letter-spacing: 0.5px; }
.step-title { font-size: 13px; color: var(--text-main); font-weight: 600; }
.step-item.active .step-number, .step-item.active .step-title { color: var(--primary); }

/* =========================================
   폼 컨테이너 및 그리드
========================================= */
.form-container { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); overflow: hidden; }
.form-step { padding: 32px; }
.step-header { display: flex; align-items: center; gap: 10px; padding-bottom: 16px; margin-bottom: 24px; border-bottom: 1px dashed var(--border-color); }
.step-header i { font-size: 24px; color: var(--primary); }
.step-header h2 { font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 24px; margin-bottom: 32px; }
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group.full-width { grid-column: 1 / -1; }
.form-label, .section-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-sub); }
.form-label i, .section-label i { font-size: 16px; color: var(--primary); }
.form-label.required::after { content: '*'; color: var(--danger); margin-left: 2px; }
.form-input, .form-select, .form-textarea { padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-main); transition: all 0.2s; background: var(--bg-surface); box-sizing: border-box; }
.form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.form-input::placeholder, .form-textarea::placeholder { color: var(--text-muted); }
.form-textarea { resize: vertical; min-height: 80px; }

/* 주민번호 그룹 */
.ssn-group { display: flex; align-items: center; gap: 10px; }
.ssn-input { flex: 1; text-align: center; letter-spacing: 2px; }
.ssn-separator { font-size: 18px; font-weight: 700; color: var(--text-muted); }

/* 라디오 그룹 */
.radio-group { display: flex; gap: 12px; padding: 4px 0; }
.radio-label {
  flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;
  padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border-color);
  transition: all 0.2s; background: var(--bg-canvas); font-size: 13px; color: var(--text-sub);
}
.radio-label:hover { border-color: var(--border-focus); color: var(--text-main); }

.radio-label input[type="radio"] { display: none; }
.radio-label:has(input:checked) {
  border-color: var(--primary); background-color: var(--primary-soft);
  color: var(--primary); font-weight: 600;
}

/* 근로계약서 버튼 */
.btn-contract {
  width: 100%; padding: 14px; background-color: var(--header-bg);
  border: none; border-radius: 8px; color: var(--text-inverse);
  font-size: 14px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: all 0.2s; box-shadow: var(--shadow-sm);
}
.btn-contract:hover { background-color: var(--bg-hover); color: var(--text-main); border: 1px solid var(--border-focus); }
.btn-contract i { font-size: 18px; }

/* 폼 액션 버튼 */
.form-actions {
  display: flex; justify-content: flex-end; gap: 10px;
  padding-top: 24px; border-top: 1px solid var(--border-color);
}
.btn-prev, .btn-next {
  display: flex; align-items: center; gap: 6px; padding: 10px 20px;
  border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s;
}
.btn-prev { background: var(--bg-surface); border: 1px solid var(--border-color); color: var(--text-sub); }
.btn-prev:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-next { background-color: var(--primary); color: var(--text-inverse); box-shadow: var(--shadow-sm); }
.btn-next:hover { background-color: var(--primary-hover); transform: translateY(-1px); }

/* =========================================
   근로계약서 모달 (공통 테마 연동)
========================================= */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 20px;
}

.modal-container {
  background: var(--bg-surface); border-radius: 16px; width: 100%; max-width: 900px;
  max-height: 90vh; display: flex; flex-direction: column;
  box-shadow: var(--shadow-md); border: 1px solid var(--border-color); overflow: hidden;
}

.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 20px 24px; border-bottom: 1px solid var(--border-color); background: var(--bg-canvas);
}
.modal-title { font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 8px; }
.modal-title i { font-size: 22px; color: var(--primary); }

.modal-close {
  width: 36px; height: 36px; border-radius: 8px; background: transparent; border: none;
  color: var(--text-muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.modal-close:hover { background: var(--bg-hover); color: var(--text-main); }

.modal-body { flex: 1; overflow-y: auto; padding: 24px; background: var(--bg-canvas); }
.modal-body::-webkit-scrollbar { width: 8px; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

.modal-footer {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 16px 24px; border-top: 1px solid var(--border-color); background: var(--bg-surface);
}

/* 근로계약서 문서 디자인 */
.contract-document {
  background: var(--bg-surface); padding: 40px; border-radius: 8px;
  box-shadow: var(--shadow-sm); font-size: 13px; line-height: 1.8; color: var(--text-main);
  border: 1px solid var(--border-color);
}

.contract-header { text-align: center; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid var(--primary); }
.contract-title { font-size: 24px; font-weight: 700; color: var(--text-main); margin: 0 0 8px 0; letter-spacing: 4px; }
.contract-date { font-size: 12px; color: var(--text-sub); margin: 0; }

.contract-intro { margin-bottom: 24px; padding: 16px; background: var(--bg-canvas); border-left: 4px solid var(--primary); border-radius: 6px; }
.contract-section { margin-bottom: 24px; padding: 16px; background: var(--bg-canvas); border-radius: 8px;}
.section-title { font-size: 14px; font-weight: 700; color: var(--text-main); margin: 0 0 12px 0; padding-bottom: 6px; border-bottom: 1px solid var(--border-color); }
.section-title::before { content: '▣'; color: var(--primary); margin-right: 6px; }

.contract-content p { margin: 6px 0; }
.date-group { display: flex; align-items: center; gap: 8px; margin: 8px 0; flex-wrap: wrap; }
.contract-input, .contract-select {
  padding: 4px 8px; border: 1px solid var(--border-color); border-radius: 4px;
  font-size: 13px; color: var(--text-main); background: var(--bg-surface); transition: border-color 0.2s;
}
.contract-input:focus, .contract-select:focus { outline: none; border-color: var(--primary); }

/* 임금 테이블 */
.wage-table-wrapper { overflow-x: auto; margin: 16px 0; border: 1px solid var(--border-color); border-radius: 8px; }
.wage-table { width: 100%; border-collapse: collapse; font-size: 12px; background: var(--bg-surface);}
.wage-table th, .wage-table td { padding: 10px; border: 1px solid var(--border-color); text-align: center; vertical-align: middle; }
.wage-table thead { background-color: var(--primary); color: var(--text-inverse); }
.wage-table th { font-weight: 600; white-space: nowrap; }

.wage-input {
  width: 90px; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px;
  text-align: right; font-size: 12px; background: var(--bg-surface); color: var(--text-main);
}
.wage-input:focus { outline: none; border-color: var(--primary); }
.total-cell { font-weight: 700; color: var(--primary); font-size: 13px; background: var(--primary-soft); }

/* 서명란 */
.signature-section { margin-top: 40px; padding-top: 24px; border-top: 3px double var(--border-focus); }
.signature-intro { text-align: center; margin-bottom: 20px; }
.signature-date { text-align: center; margin-bottom: 30px; font-size: 15px; font-weight: 700;}

.signature-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
.party { padding: 20px; background: var(--bg-canvas); border-radius: 8px; border: 2px solid var(--border-color); }
.party-title { font-size: 14px; font-weight: 700; color: var(--text-main); margin: 0 0 10px 0; padding-bottom: 8px; border-bottom: 1px solid var(--border-color); }
.party p { margin: 6px 0; font-size: 12px; color: var(--text-sub); }

/* 반응형 */
@media (max-width: 1024px) { .steps-list { grid-template-columns: repeat(2, 1fr); } }

@media (max-width: 768px) {
  .steps-list { grid-template-columns: 1fr; gap: 8px; }
  .form-step { padding: 16px; }
  .form-grid { grid-template-columns: 1fr; }
  .ssn-group { flex-direction: row;display: grid; }
  .signature-parties { grid-template-columns: 1fr; gap: 20px;}
  .contract-document { padding: 20px; }
  .btn-prev, .btn-next, .btn-submit { width: 100%; justify-content: center; }
}
</style>
