<script setup>
import { onMounted, onActivated, ref, watch, computed } from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";
import ContractModal from "~/components/contractModal.vue";
import auth from "~/middleware/auth.js";

const authStore = useAuthStore();
const router = useRouter();
const route = useRoute();

const {
  companyData,
  bankOptions,
  siteOptions,
  typeOptions,
  positionOptions,
  disabledOptions,
  wagesData,
  getCompanyData,
  fetchBankOption,
  fetchSiteOptions,
  fetchTypeOptions,
  fetchPositionOptions,
  fetchDisabledOptions,
  fetchWageCode
} = useApi();

const cIdx = authStore.user?.cIdx;

// === 1. 초기 상태를 반환하는 함수 ===
const getInitialEmployee = () => ({
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
  status: '0', // 0: 재직
  outDate: '',
  transferDate: '', //고용승계일
  gender: '',
  disability: 'N',
  disability_date: '',
  disability_grade: '',
  defector: 'N',
  patriot: 'N',
  //기타 특이사항 1, 2, 3 (이름과 여부)
  etc_name_1: '',
  etc_value_1: '',
  etc_name_2: '',
  etc_value_2: '',
  etc_name_3: '',
  etc_value_3: '',
  intern: 'N',
  beneficiary: 'N',
  foreigner: 'N',
  nationality: '',
  visa_code: '',
  visa_date: '',
  bankName: '국민',
  accountNm: '', //예금주
  accountNumber: '',
  four_ins: 'Y',
  retire_pension: 'N',
  bigo: '',
  departureDate: '',
  departureReason: '',
});

// === 2. 폼 데이터 모델 ===
const employee = ref(getInitialEmployee());

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

// === 3. 폼 전체를 초기화하는 함수 ===
const resetForm = () => {
  employee.value = getInitialEmployee();
  wageInputs.value = {};
  contractDataTemp.value = null;
  isContractSaved.value = false;
};

const handleContractSave = (savedData) => {
  wageInputs.value = savedData.wageInputs;
  contractDataTemp.value = savedData;
  alert('근로계약서 내용이 임시 저장되었습니다.');
};

// 4. 폼 제출 핸들러 (한 번에 검증)
const handleSubmit = async () => {
  if (!employee.value.site) {
    alert('현장을 선택해주세요.');
    return;
  }

  // 특수 조건 검증
  if (employee.value.foreigner === 'Y' && (!employee.value.nationality || !employee.value.visa_code)) {
    alert('외국인인 경우 국적과 비자 코드를 입력해주세요.');
    return;
  }
  if (employee.value.disability === 'Y' && !employee.value.disability_grade) {
    alert('장애 여부가 "예"인 경우 장애 등급을 선택해주세요.');
    return;
  }

  /* 20260421 백승훈 이사님과 통화 후 필수값 삭제
  if (!contractDataTemp.value || !contractDataTemp.value.contractStartDt || !contractDataTemp.value.contractEndDt) {
    alert('근로계약서의 계약기간을 입력해주세요.\n근로계약서 작성 버튼을 클릭하여 계약 시작일과 종료일을 입력하세요.');
    return;
  }

   */

  if (!confirm(`${employee.value.name} 직원을 등록하시겠습니까?`)) return;

  const payload = {
    ...employee.value,
    cIdx: cIdx,
    dayWorkTime: contractDataTemp.value?.dayWorkTime || 0,
    monthWorkTime: contractDataTemp.value?.monthWorkTime || 0,
    contractData: contractDataTemp.value,
    // wageInputs: wageInputs.value,
  };

  try {
    const res = await axios.post('/api/v1/member/register', payload);

    if (res.data.result) {
      alert(`${employee.value.name} 직원이 성공적으로 등록되었습니다.`);
      resetForm();
      await router.push({
        path: '/member/list',
        query: route.query
      });
    } else {
      alert('등록 실패: ' + (res.data.message || '알 수 없는 오류'));
    }
  } catch (error) {
    console.error('API 호출 에러:', error);
    alert('서버 통신 중 오류가 발생했습니다.');
  }
};

// 5. 취소 버튼 핸들러
const handleCancel = () => {
  if (confirm('작성 중인 내용이 사라집니다. 취소하시겠습니까?')) {
    resetForm();
    router.push({
      path: '/member/list',
      query: route.query
    });
  }
};

// 지급항목
const getWageCode = async function () {
  const cIdx = authStore.user?.cIdx;
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    const rawData = res.data.data || [];
    const includeCodes = ['04001001', '04001002','04001003','04001004','04001005','04001006']; // 표시할 코드만 명시
    items.value = rawData.filter(item => includeCodes.includes(item.itemCd));
  } catch (err) {
    console.error("항목 로드 실패", err);
  }
}

const getBudgetData = async function () {
  const { site, type, position } = employee.value;
  if (!site || !type || !position) return;

  try {
    const res = await axios.get(`/api/v1/site/contract/budget`, { params: { sIdx: site, type: type } });
    const budgetData = res.data.data[0];
    if (!budgetData) return;

    const jsonData = typeof budgetData.jsonData === 'string'
        ? JSON.parse(budgetData.jsonData)
        : budgetData.jsonData;

    const staffDetail = typeof budgetData.staffDetail === 'string'
        ? JSON.parse(budgetData.staffDetail)
        : budgetData.staffDetail;

    const newWageInputs = {};
    const newItems = [];

    // directLabor만 지급항목(임금)으로, indirectLabor는 공제항목으로 구분
    ['directLabor', 'indirectLabor'].forEach(groupKey => {
      (jsonData?.[groupKey] || []).forEach(item => {
        if (!item.label) return;

        // wagesData에서 이름 찾기, 없으면 label 그대로
        const itemNm = wagesData.value.find(w => w.itemCd === item.label)?.itemNm ?? item.label;

        newItems.push({
          itemCd: item.label,
          itemNm,
          groupKey, // 'directLabor' | 'indirectLabor'
          groupCd: item.label.substring(0, 5),
        });

        if (item.values?.[position] !== undefined) {
          newWageInputs[item.label] = Number(item.values[position]) || 0;
        }
      });
    });

    items.value = newItems;
    wageInputs.value = newWageInputs;

    let selectedSchedule = null;
    if (staffDetail) {
      const targetStaff = staffDetail.find(s => s.code === position);
      if (targetStaff) selectedSchedule = targetStaff.schedule;
    }

    contractDataTemp.value = {
      ...contractDataTemp.value,
      wageInputs: newWageInputs,
      workSchedule: selectedSchedule,
    };

  } catch (err) {
    console.error('데이터 로드 실패:', err);
  }
};

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
        // 홀수면 M(남성), 짝수면 F(여성)
        employee.value.gender = (genderCode % 2 !== 0) ? 'M' : 'F';

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

// 현장 변경 시
watch(
    () => [employee.value.site, employee.value.type, employee.value.position],
    ([newSite, newType, newPos]) => {
      // 세 가지 필수 정보가 모두 있을 때만 API 호출
      if (newSite && newType && newPos) {
        getBudgetData();
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

onMounted(() => {
  resetForm();
  getCompanyData();
  fetchSiteOptions();
  fetchTypeOptions();
  fetchPositionOptions();
  fetchDisabledOptions();
  fetchBankOption();
  fetchWageCode();
});

onActivated(() => {
  resetForm();
});
</script>

<template>
  <div class="member-register-page">
    <div class="page-header">
      <div class="header-left">
        <button type="button" @click="handleCancel" class="btn-back" style="padding: 10px;">
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
        <button type="button" @click="handleCancel" class="btn-cancel">
          <i class="mdi mdi-close"></i>
          <span>취소</span>
        </button>
      </div>
    </div>

    <form @submit.prevent="handleSubmit">
      <div class="form-container">

        <div class="form-section">
          <div class="section-main-header">
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
              <label class="form-label required">
                <i class="mdi mdi-badge-account-horizontal-outline"></i>
                주민번호
              </label>
              <div class="ssn-group">
                <input
                    type="text"
                    v-model="employee.firstNumber"
                    required
                    class="form-input ssn-input"
                    maxlength="6"
                    placeholder="000000"
                />
                <span class="ssn-separator">-</span>
                <input
                    type="text"
                    v-model="employee.lastNumber"
                    required
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
                  max="9999-12-31"
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
              <label class="form-label required">
                <i class="mdi mdi-human-male-female"></i>
                성별
              </label>
              <div class="radio-group">
                <label class="radio-label">
                  <input type="radio" value="M" v-model="employee.gender" required />
                  <span class="radio-text">남성</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="F" v-model="employee.gender" required />
                  <span class="radio-text">여성</span>
                </label>
              </div>
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
        </div>

        <hr class="section-divider" />

        <div class="form-section">
          <div class="section-main-header">
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
                  <input type="radio" value="Y" v-model="employee.disability" required />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.disability" required />
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
                  max="9999-12-31"
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
                  <input type="radio" value="Y" v-model="employee.defector" required />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.defector" required />
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
                  <input type="radio" value="Y" v-model="employee.patriot" required />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.patriot" required />
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
                  <input type="radio" value="Y" v-model="employee.intern" required />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.intern" required />
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
                  <input type="radio" value="Y" v-model="employee.beneficiary" required />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.beneficiary" required />
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
                  <input type="radio" value="Y" v-model="employee.foreigner" required />
                  <span class="radio-text">예</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.foreigner" required />
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
                  max="9999-12-31"
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
        </div>

        <hr class="section-divider" />

        <div class="form-section">
          <div class="section-main-header">
            <i class="mdi mdi-briefcase-outline"></i>
            <h2>근무 정보</h2>
          </div>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-office-building-outline"></i>
                근무 현장
              </label>
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
              <label class="form-label">
                <i class="mdi mdi-calendar-start-outline"></i>
                입사일
              </label>
              <input
                  type="date"
                  v-model="employee.joinDate"
                  class="form-input"
                  max="9999-12-31"
              />
            </div>

            <div class="form-group">
              <label class="form-label required">
                <i class="mdi mdi-account-check-outline"></i>
                재직 상태
              </label>
              <div class="radio-group" style="word-break:keep-all;">
                <label class="radio-label">
                  <input type="radio" v-model="employee.status" value="0" required />
                  <span class="radio-text">재직</span>
                </label>
                <label class="radio-label">
                  <input type="radio" v-model="employee.status" value="1" required />
                  <span class="radio-text">퇴사</span>
                </label>
                <label class="radio-label">
                  <input type="radio" v-model="employee.status" value="2" required />
                  <span class="radio-text">일용직</span>
                </label>
                <label class="radio-label">
                  <input type="radio" v-model="employee.status" value="3" required />
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
                  max="9999-12-31"
              />
            </div>

            <div v-if="employee.status == 1" class="form-group">
              <label class="form-label required">퇴사 사유</label>
              <input type="text" v-model="employee.outReason" class="form-input" placeholder="퇴사 사유를 입력하세요" />

            </div>

            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-calendar-start-outline"></i>
                고용승계일
              </label>
              <input
                  type="date"
                  v-model="employee.transferDate"
                  class="form-input"
                  max="9999-12-31"
              />
            </div>
          </div>

          <div class="section-main-header">
            <i class="mdi mdi-file-document-outline"></i>
            <h2>근로 계약서 관리</h2>
          </div>
          <div class="form-grid mb-4">
            <div class="form-group full-width">
              <button type="button" @click="showModal = true" class="btn-contract">
                <i class="mdi mdi-file-document-edit-outline"></i>
                근로계약서 작성 (필수)
              </button>
            </div>
          </div>

          <div class="section-main-header">
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
              <label class="form-label">
                <i class="mdi mdi-account-cash"></i>
                예금주
              </label>
              <input
                  type="text"
                  v-model="employee.accountNm"
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
                  <input type="radio" value="Y" v-model="employee.four_ins" required />
                  <span class="radio-text">가입</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.four_ins" required />
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
                  <input type="radio" value="Y" v-model="employee.retire_pension" required />
                  <span class="radio-text">가입</span>
                </label>
                <label class="radio-label">
                  <input type="radio" value="N" v-model="employee.retire_pension" required />
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
            <button type="submit" class="btn-save">
              <i class="mdi mdi-check"></i>
              등록 완료
            </button>
          </div>
        </div>

      </div>
    </form>

    <ContractModal
        :is-open="showModal"
        :employee-data="{
          ...employee,
          wageInputs: wageInputs,
          workSchedule: contractDataTemp?.workSchedule
        }"
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

/* =========================================
   폼 컨테이너 및 섹션
========================================= */
.form-container {
  background: var(--bg-surface);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.form-section {
  padding: 32px;
}
.section-divider {
  border: 0;
  height: 1px;
  background: var(--border-color);
  margin: 0;
}

.mb-4 { margin-bottom: 32px; }

/*
.step-header { display: flex; align-items: center; gap: 10px; padding-bottom: 16px; margin-bottom: 24px; border-bottom: 1px dashed var(--border-color); }
.step-header i { font-size: 24px; color: var(--primary); }
.step-header h2 { font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0; }
 */
.section-main-header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid var(--border-color); }
.section-main-header i { font-size: 24px; color: var(--primary); }
.section-main-header h2 { font-size: 18px; font-weight: 700; color: var(--text-main); margin: 0; }

.form-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
  margin-bottom: 32px;
  max-width: 520px;
}
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group.full-width { grid-column: 1 / -1; }
.form-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--text-sub); }
.form-label i { font-size: 16px; color: var(--primary); }
.form-label.required::after { content: '*'; color: var(--danger); margin-left: 2px; }

.form-input, .form-select, .form-textarea { padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-main); transition: all 0.2s; background: var(--bg-surface); box-sizing: border-box; }
.form-input:focus, .form-select:focus, .form-textarea:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.form-input::placeholder, .form-textarea::placeholder { color: var(--text-muted); }
.form-textarea { resize: vertical; min-height: 80px; }

/* 주민번호 그룹 */
.ssn-group {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%; /* 부모 너비를 넘지 않도록 꽉 채움 */
}
.ssn-input {
  flex: 1;
  text-align: center;
  letter-spacing: 2px;
  min-width: 0; /* 🌟 핵심: input의 기본 너비 제한을 풀어주어 영역에 맞게 줄어들 수 있도록 함 */
}
.ssn-separator {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-muted);
}

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

/* 폼 액션 버튼 (제출) */
.form-actions {
  display: flex; justify-content: flex-end; gap: 10px;
  padding-top: 24px; border-top: 1px solid var(--border-color);
}
.btn-save {
  display: flex; align-items: center; gap: 6px; padding: 12px 24px;
  border: none; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s;
  background-color: var(--primary); color: var(--text-inverse); box-shadow: var(--shadow-sm);
}
.btn-save:hover { background-color: var(--primary-hover); transform: translateY(-1px); }

/* 반응형 */
@media (max-width: 768px) {
  .form-section { padding: 16px; }
  .form-grid { grid-template-columns: 1fr; }
  .ssn-group { flex-direction: row; display: grid; }
  .btn-save { width: 100%; justify-content: center; }
}
</style>
