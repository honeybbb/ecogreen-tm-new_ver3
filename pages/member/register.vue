<script setup>
import { onMounted, onActivated, ref, watch, computed, onBeforeUnmount } from 'vue';
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

// =============================================
// [추가] 퀵 네비게이션(스크롤 이동) 로직
// =============================================
const activeSection = ref('sec-basic');
const navItems = [
  { id: 'sec-basic', title: '기본 정보', icon: 'mdi-account-details-outline' },
  { id: 'sec-special', title: '특이 사항', icon: 'mdi-alert-circle-outline' },
  { id: 'sec-work', title: '근무 정보', icon: 'mdi-briefcase-outline' },
  { id: 'sec-payroll', title: '급여 및 기타', icon: 'mdi-cash-multiple' },
];

const scrollToSection = (id) => {
  activeSection.value = id;
  const el = document.getElementById(id);
  const container = document.querySelector('.content-area');

  if (el && container) {
    const topPos = el.offsetTop - 24;
    container.scrollTo({ top: topPos, behavior: 'smooth' });
  }
};
// =============================================

// === 1. 초기 상태를 반환하는 함수 ===
const getInitialEmployee = () => ({
  member_type: 'SITE',
  type: '',
  name: '',
  billingName: '', //정산서용 이름
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
  payrollBigo: '',       // 급여 관련 특이사항
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
const periodsData = ref([]); // 입/퇴사일, 일용직,대근 근무시작/종료일, 휴직시작/종료일 등

// 기간 추가 함수
const addPeriod = () => {
  periodsData.value.push({ startDate: '', endDate: '', outReason: '' });
};

// 기간 삭제 함수
const removePeriod = (index) => {
  periodsData.value.splice(index, 1);
};

// 상태(status)가 변경될 때마다 처리
watch(() => employee.value.status, (newStatus) => {
  if (newStatus === '2' || newStatus === '3') {
    if(periodsData.value.length === 0) {
      addPeriod();
    }
  } else {
    periodsData.value = [];
  }
});

// 본사로 변경 시 현장 선택값 초기화
watch(() => employee.value.member_type, (newVal) => {
  if (newVal === 'HQ') {
    employee.value.site = '';
  }
});

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

const expandedNodeCd = ref(null);

const toggleNode = (itemCd) => {
  if (expandedNodeCd.value === itemCd) {
    expandedNodeCd.value = null;
  } else {
    expandedNodeCd.value = itemCd;
  }
};

const isPositionMenuOpen = ref(false);

const positionTree = computed(() => {
  if (!positionOptions.value || positionOptions.value.length === 0) return [];
  const validItems = positionOptions.value.filter(p => p.itemCd.length > 5);
  if (validItems.length === 0) return [];
  const minLength = Math.min(...validItems.map(p => p.itemCd.length));
  const parents = validItems.filter(p => p.itemCd.length === minLength);
  return parents.map(parent => {
    const children = validItems.filter(
        p => p.itemCd.startsWith(parent.itemCd) && p.itemCd.length > parent.itemCd.length
    );
    return { ...parent, children };
  });
});

const selectedPositionName = computed(() => {
  if (!employee.value.position) return '선택하세요';
  const found = positionOptions.value.find(p => p.itemCd === employee.value.position);
  return found ? found.itemNm : '선택됨';
});

const selectPosition = (pos) => {
  employee.value.position = pos.itemCd;
  isPositionMenuOpen.value = false;
};

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
  window.alert('근로계약서 내용이 임시 저장되었습니다.');
};

// 4. 폼 제출 핸들러
const handleSubmit = async () => {
  if (employee.value.member_type === 'SITE' && !employee.value.site) {
    window.customAlert('근무 현장을 선택해주세요.','error');
    scrollToSection('sec-work');
    return;
  }
  if (!employee.value.type) { window.customAlert('직원 구분을 선택해주세요.','error'); scrollToSection('sec-basic'); return; }
  if (!employee.value.name) { window.customAlert('이름을 입력해주세요.','error'); scrollToSection('sec-basic'); return; }

  if (employee.value.foreigner === 'Y' && (!employee.value.nationality || !employee.value.visa_code)) {
    window.customAlert('외국인인 경우 국적과 비자 코드를 입력해주세요.','error');
    scrollToSection('sec-special');
    return;
  }
  if (employee.value.disability === 'Y' && !employee.value.disability_grade) {
    window.customAlert('장애 여부가 "예"인 경우 장애 등급을 선택해주세요.','error');
    scrollToSection('sec-special');
    return;
  }

  if (!await window.customConfirm(`${employee.value.name} 직원을 등록하시겠습니까?`)) return;

  const payload = {
    ...employee.value,
    cIdx: cIdx,
    dayWorkTime: contractDataTemp.value?.dayWorkTime || 0,
    monthWorkTime: contractDataTemp.value?.monthWorkTime || 0,
    contractData: contractDataTemp.value,
    periodsData : periodsData.value,
  };

  try {
    const res = await axios.post('/api/v1/member/register', payload);

    if (res.data.result) {
      window.alert(`${employee.value.name} 직원이 성공적으로 등록되었습니다.`);
      resetForm();
      await router.push({
        path: '/member/list',
        query: route.query
      });
    } else {
      window.customAlert('등록 실패: ' + (res.data.message || '알 수 없는 오류'), 'error');
    }
  } catch (error) {
    console.error('API 호출 에러:', error);
    window.customAlert('서버 통신 중 오류가 발생했습니다.','error');
  }
};

const handleCancel = async () => {
  if (await window.customConfirm('작성 중인 내용이 사라집니다. 취소하시겠습니까?')) {
    resetForm();
    router.push({
      path: '/member/list',
      query: route.query
    });
  }
};

const getWageCode = async function () {
  const cIdx = authStore.user?.cIdx;
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    const rawData = res.data.data || [];
    const includeCodes = ['04001001', '04001002','04001003','04001004','04001005','04001006'];
    items.value = rawData.filter(item => includeCodes.includes(item.itemCd));
  } catch (err) {
    console.error("항목 로드 실패", err);
  }
}

const getBudgetData = async function () {
  const { site, type, position } = employee.value;
  if (!site || !type || !position) return;

  const contractPosCd = position.length > 8 ? position.substring(0, 8) : position;

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

    ['directLabor', 'indirectLabor'].forEach(groupKey => {
      (jsonData?.[groupKey] || []).forEach(item => {
        if (!item.label) return;
        const itemNm = wagesData.value.find(w => w.itemCd === item.label)?.itemNm ?? item.label;
        newItems.push({
          itemCd: item.label,
          itemNm,
          groupKey,
          groupCd: item.label.substring(0, 5),
        });

        if (item.values?.[contractPosCd] !== undefined) {
          newWageInputs[item.label] = Number(item.values[contractPosCd]) || 0;
        }
      });
    });

    items.value = newItems;
    wageInputs.value = newWageInputs;

    let selectedSchedule = null;
    if (staffDetail) {
      const targetStaff = staffDetail.find(s => s.code === contractPosCd);
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
        employee.value.gender = (genderCode % 2 !== 0) ? 'M' : 'F';
        if (['1', '2', '5', '6'].includes(genderCode)) yearPrefix = '19';
        else if (['3', '4', '7', '8'].includes(genderCode)) yearPrefix = '20';
        else yearPrefix = '19';
      } else {
        const currentYearShort = new Date().getFullYear() % 100;
        if (parseInt(yearPart) > currentYearShort) yearPrefix = '19';
        else yearPrefix = '20';
      }

      const fullDate = `${yearPrefix}${yearPart}-${monthPart}-${dayPart}`;
      if (isValidDate(fullDate)) employee.value.birthDate = fullDate;
    }
);

watch(
    () => [employee.value.site, employee.value.type, employee.value.position],
    ([newSite, newType, newPos]) => {
      if (newSite && newType && newPos) getBudgetData();
    }
);

watch(
    () => employee.value.name,
    (newName, oldName) => {
      if (!employee.value.billingName || employee.value.billingName === oldName) {
        employee.value.billingName = newName;
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

const getPositionCode = async () => {
  const cIdx = authStore.user?.cIdx;
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    positionOptions.value = res.data.data.filter(c => c.itemCd.startsWith('01002')) || [];
  } catch (err) {
    console.error('항목 로드 실패', err);
  }
};

let scrollHandler = null;

onMounted(() => {
  resetForm();
  getCompanyData();
  fetchSiteOptions();
  fetchTypeOptions();
  fetchDisabledOptions();
  fetchBankOption();
  fetchWageCode();
  getPositionCode();

  // 스크롤 위치 감지
  const container = document.querySelector('.content-area');
  if (container) {
    scrollHandler = () => {
      const sections = navItems.map(item => document.getElementById(item.id));
      let current = 'sec-basic';
      sections.forEach(section => {
        if (section && container.scrollTop >= (section.offsetTop - 150)) {
          current = section.getAttribute('id');
        }
      });
      activeSection.value = current;
    };
    container.addEventListener('scroll', scrollHandler);
  }
});

onBeforeUnmount(() => {
  const container = document.querySelector('.content-area');
  if (container && scrollHandler) {
    container.removeEventListener('scroll', scrollHandler);
  }
});

onActivated(() => {
  resetForm();
});
</script>

<template>
  <div class="member-register-page">

    <!-- 상단 고정(Sticky) 헤더 -->
    <div class="page-header sticky-header">
      <div class="header-left">
        <button type="button" @click="handleCancel" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title"><i class="mdi mdi-account-plus-outline text-primary"></i> 직원 등록</h1>
          <p class="page-subtitle">새로운 직원 정보를 카테고리별로 입력합니다.</p>
        </div>
      </div>
      <div class="header-right">
        <button type="button" @click="handleCancel" class="btn-cancel">취소</button>
        <button type="button" @click="handleSubmit" class="btn-submit">
          <i class="mdi mdi-check"></i> 등록 완료
        </button>
      </div>
    </div>

    <!-- 메인 레이아웃 -->
    <div class="register-layout">

      <!-- 좌측 퀵 네비게이션 -->
      <aside class="quick-nav-sidebar">
        <div class="nav-wrapper">
          <h3 class="nav-title">입력 항목</h3>
          <ul class="nav-list">
            <li v-for="nav in navItems" :key="nav.id"
                :class="['nav-item', { active: activeSection === nav.id }]"
                @click="scrollToSection(nav.id)">
              <i :class="['mdi', nav.icon]"></i>
              <span>{{ nav.title }}</span>
            </li>
          </ul>
        </div>
      </aside>

      <!-- 우측 메인 폼 영역 (스크롤) -->
      <main class="content-area">
        <form @submit.prevent="handleSubmit" id="registerForm">

          <!-- 카드 1: 기본 정보 -->
          <section id="sec-basic" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-account-outline text-primary"></i>
              <h2>기본 정보</h2>
            </div>
            <div class="card-body">
              <div class="form-grid">

                <div class="form-group full-width">
                  <label class="form-label required">소속 구분</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="SITE" v-model="employee.member_type" required />
                      <span>현장 소속</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="HQ" v-model="employee.member_type" required />
                      <span>본사 소속</span>
                    </label>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label required">구분</label>
                  <select v-model="employee.type" required class="form-select">
                    <option value="">선택하세요</option>
                    <option v-for="type in typeOptions" :key="type.itemCd" :value="type.itemCd">
                      {{ type.itemNm }}
                    </option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label required">이름</label>
                  <input type="text" v-model="employee.name" required class="form-input" placeholder="홍길동" />
                </div>

                <div class="form-group">
                  <label class="form-label">정산서용 이름</label>
                  <input type="text" v-model="employee.billingName" class="form-input" placeholder="정산서 표시용" />
                </div>

                <div class="form-group">
                  <label class="form-label required">사번</label>
                  <input type="text" v-model="employee.id" required class="form-input" placeholder="EMP001" />
                </div>

                <div class="form-group">
                  <label class="form-label required">비밀번호</label>
                  <input type="password" v-model="employee.password" required class="form-input" placeholder="••••••••" />
                </div>

                <div class="form-group full-width">
                  <label class="form-label required">주민등록번호</label>
                  <div class="ssn-group">
                    <input type="text" v-model="employee.firstNumber" required class="form-input ssn-input" maxlength="6" placeholder="000000" />
                    <span class="ssn-separator">-</span>
                    <input type="password" v-model="employee.lastNumber" required class="form-input ssn-input" maxlength="7" placeholder="0000000" autocomplete="off" />
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">생년월일</label>
                  <input type="date" v-model="employee.birthDate" class="form-input" max="9999-12-31" />
                </div>

                <div class="form-group">
                  <label class="form-label required">성별</label>
                  <div class="radio-group">
                    <label class="radio-label">
                      <input type="radio" value="M" v-model="employee.gender" required /><span>남성</span>
                    </label>
                    <label class="radio-label">
                      <input type="radio" value="F" v-model="employee.gender" required /><span>여성</span>
                    </label>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label">연락처</label>
                  <input type="tel" v-model="employee.phone" class="form-input" placeholder="010-0000-0000" />
                </div>

                <div class="form-group">
                  <label class="form-label">이메일</label>
                  <input type="email" v-model="employee.email" class="form-input" placeholder="example@email.com" />
                </div>

                <div class="form-group full-width">
                  <label class="form-label">주소</label>
                  <input type="text" v-model="employee.address" class="form-input" placeholder="전체 주소 입력" />
                </div>

              </div>
            </div>
          </section>

          <!-- 카드 2: 특이 사항 -->
          <section id="sec-special" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-alert-circle-outline text-primary"></i>
              <h2>특이 사항</h2>
            </div>
            <div class="card-body">
              <div class="form-grid">

                <div class="form-group">
                  <label class="form-label required">장애 여부</label>
                  <div class="radio-group">
                    <label class="radio-label"><input type="radio" value="Y" v-model="employee.disability" required /><span>예</span></label>
                    <label class="radio-label"><input type="radio" value="N" v-model="employee.disability" required /><span>아니오</span></label>
                  </div>
                </div>
                <div v-if="employee.disability === 'Y'" class="form-group">
                  <label class="form-label required">장애등급</label>
                  <select v-model="employee.disability_grade" class="form-select">
                    <option value="">선택하세요</option>
                    <option v-for="item in disabledOptions" :key="item.itemCd" :value="item.itemCd">{{ item.itemNm }}</option>
                  </select>
                </div>
                <div v-if="employee.disability === 'Y'" class="form-group">
                  <label class="form-label">장애등록일</label>
                  <input type="date" v-model="employee.disability_date" class="form-input" max="9999-12-31" />
                </div>

                <div class="form-group">
                  <label class="form-label required">새터민 여부</label>
                  <div class="radio-group">
                    <label class="radio-label"><input type="radio" value="Y" v-model="employee.defector" required /><span>예</span></label>
                    <label class="radio-label"><input type="radio" value="N" v-model="employee.defector" required /><span>아니오</span></label>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label required">국가유공자 여부</label>
                  <div class="radio-group">
                    <label class="radio-label"><input type="radio" value="Y" v-model="employee.patriot" required /><span>예</span></label>
                    <label class="radio-label"><input type="radio" value="N" v-model="employee.patriot" required /><span>아니오</span></label>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label required">청년인턴 여부</label>
                  <div class="radio-group">
                    <label class="radio-label"><input type="radio" value="Y" v-model="employee.intern" required /><span>예</span></label>
                    <label class="radio-label"><input type="radio" value="N" v-model="employee.intern" required /><span>아니오</span></label>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label required">기초수급자 여부</label>
                  <div class="radio-group">
                    <label class="radio-label"><input type="radio" value="Y" v-model="employee.beneficiary" required /><span>예</span></label>
                    <label class="radio-label"><input type="radio" value="N" v-model="employee.beneficiary" required /><span>아니오</span></label>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label required">외국인 여부</label>
                  <div class="radio-group">
                    <label class="radio-label"><input type="radio" value="Y" v-model="employee.foreigner" required /><span>예</span></label>
                    <label class="radio-label"><input type="radio" value="N" v-model="employee.foreigner" required /><span>아니오</span></label>
                  </div>
                </div>

                <template v-if="employee.foreigner === 'Y'">
                  <div class="form-group"><label class="form-label required">국적</label><input type="text" v-model="employee.nationality" class="form-input" placeholder="예: 베트남" /></div>
                  <div class="form-group"><label class="form-label required">비자 코드</label><input type="text" v-model="employee.visa_code" class="form-input" placeholder="예: E-9" /></div>
                  <div class="form-group"><label class="form-label">비자만료일</label><input type="date" v-model="employee.visa_date" class="form-input" max="9999-12-31" /></div>
                </template>

                <div class="form-group full-width" style="margin-top:12px;">
                  <label class="form-label">기타 특이사항 커스텀 (정부 정책 등 자유 입력)</label>
                  <div class="custom-etc-row">
                    <input type="text" v-model="employee.etc_name_1" class="form-input" placeholder="항목명 1 (예: 일자리안정자금)" />
                    <div class="radio-group etc-radio">
                      <label class="radio-label"><input type="radio" value="Y" v-model="employee.etc_value_1" /><span>예</span></label>
                      <label class="radio-label"><input type="radio" value="N" v-model="employee.etc_value_1" /><span>아니오</span></label>
                    </div>
                  </div>
                  <div class="custom-etc-row mt-2">
                    <input type="text" v-model="employee.etc_name_2" class="form-input" placeholder="항목명 2" />
                    <div class="radio-group etc-radio">
                      <label class="radio-label"><input type="radio" value="Y" v-model="employee.etc_value_2" /><span>예</span></label>
                      <label class="radio-label"><input type="radio" value="N" v-model="employee.etc_value_2" /><span>아니오</span></label>
                    </div>
                  </div>
                  <div class="custom-etc-row mt-2">
                    <input type="text" v-model="employee.etc_name_3" class="form-input" placeholder="항목명 3" />
                    <div class="radio-group etc-radio">
                      <label class="radio-label"><input type="radio" value="Y" v-model="employee.etc_value_3" /><span>예</span></label>
                      <label class="radio-label"><input type="radio" value="N" v-model="employee.etc_value_3" /><span>아니오</span></label>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </section>

          <!-- 카드 3: 근무 정보 -->
          <section id="sec-work" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-briefcase-outline text-primary"></i>
              <h2>근무 정보</h2>
            </div>
            <div class="card-body">
              <div class="form-grid">

                <div class="form-group">
                  <label class="form-label" :class="{ required: employee.member_type === 'SITE' }">근무 현장</label>
                  <!-- 현장 소속일 때만 콤보박스 표시 -->
                  <SiteSelect
                      v-if="employee.member_type === 'SITE'"
                      v-model="employee.site"
                      required
                      :allow-empty="false"
                      width="100%"
                  />
                  <!-- 본사 소속일 때는 읽기 전용 텍스트창 표시 -->
                  <input
                      v-else
                      type="text"
                      class="form-input bg-readonly"
                      value="본사"
                      disabled
                  />
                </div>

                <div class="form-group position-dropdown-container">
                  <label class="form-label required">직위</label>
                  <div class="custom-select-btn" @click="isPositionMenuOpen = !isPositionMenuOpen">
                    <span>{{ selectedPositionName }}</span>
                    <i class="mdi mdi-chevron-down"></i>
                  </div>
                  <div v-if="isPositionMenuOpen" class="dropdown-overlay" @click="isPositionMenuOpen = false"></div>
                  <ul v-if="isPositionMenuOpen" class="custom-dropdown-menu">
                    <li v-for="node in positionTree" :key="node.itemCd" class="menu-item">
                      <div class="menu-label">
                        <span class="menu-text" @click.stop="selectPosition(node)">{{ node.itemNm }}</span>
                        <div v-if="node.children.length > 0" class="toggle-icon-wrap" @click.stop="toggleNode(node.itemCd)">
                          <i class="mdi" :class="expandedNodeCd === node.itemCd ? 'mdi-chevron-down' : 'mdi-chevron-right'"></i>
                        </div>
                      </div>
                      <ul v-show="expandedNodeCd === node.itemCd" class="custom-submenu">
                        <li v-for="child in node.children" :key="child.itemCd" class="submenu-item" @click.stop="selectPosition(child)">
                          {{ child.itemNm }}
                        </li>
                      </ul>
                    </li>
                  </ul>
                </div>

                <div class="form-group">
                  <label class="form-label">입사일</label>
                  <input type="date" v-model="employee.joinDate" class="form-input" max="9999-12-31" />
                </div>

                <div class="form-group">
                  <label class="form-label">고용승계일</label>
                  <input type="date" v-model="employee.transferDate" class="form-input" max="9999-12-31" />
                </div>

                <div class="form-group full-width">
                  <label class="form-label required">재직 상태</label>
                  <div class="radio-group">
                    <label class="radio-label"><input type="radio" v-model="employee.status" value="0" required /><span>재직</span></label>
                    <label class="radio-label"><input type="radio" v-model="employee.status" value="1" required /><span>퇴사</span></label>
                    <label class="radio-label"><input type="radio" v-model="employee.status" value="2" required /><span>일용직</span></label>
                    <label class="radio-label"><input type="radio" v-model="employee.status" value="3" required /><span>대근</span></label>
                    <label class="radio-label"><input type="radio" v-model="employee.status" value="4" required /><span>휴직</span></label>
                  </div>
                </div>

                <!-- 상태별 조건부 입력폼 -->
                <template v-if="employee.status == 1">
                  <div class="form-group"><label class="form-label required">퇴사일</label><input type="date" v-model="employee.outDate" required class="form-input" max="9999-12-31" /></div>
                  <div class="form-group"><label class="form-label required">퇴사 사유</label><input type="text" v-model="employee.outReason" class="form-input" placeholder="사유 입력" /></div>
                </template>

                <template v-if="employee.status == 2 || employee.status == 3">
                  <div class="form-group full-width bg-light-section">
                    <div class="flex-between align-center mb-3">
                      <label class="form-label required mb-0">근무 기간 설정</label>
                      <button type="button" @click="addPeriod" class="btn-mini"><i class="mdi mdi-plus"></i> 기간 추가</button>
                    </div>
                    <div v-for="(period, index) in periodsData" :key="index" class="period-row">
                      <input type="date" v-model="period.startDate" class="form-input" required />
                      <span class="separator">~</span>
                      <input type="date" v-model="period.endDate" class="form-input" required />
                      <input type="text" v-model="period.outReason" class="form-input" placeholder="비고 (선택)" style="flex: 1;" />
                      <button type="button" @click="removePeriod(index)" v-if="periodsData.length > 1" class="btn-remove-icon"><i class="mdi mdi-close"></i></button>
                    </div>
                  </div>
                </template>

                <template v-if="employee.status == 4">
                  <div class="form-group"><label class="form-label required">휴직 시작일</label><input type="date" v-model="employee.joinDate" required class="form-input" max="9999-12-31" /></div>
                  <div class="form-group"><label class="form-label required">휴직 종료일</label><input type="date" v-model="employee.outDate" required class="form-input" max="9999-12-31" /></div>
                  <div class="form-group full-width"><label class="form-label required">휴직 사유</label><input type="text" v-model="employee.outReason" class="form-input" placeholder="사유 입력" /></div>
                </template>

              </div>

              <!-- 근로계약서 작성 영역 -->
              <div class="contract-write-section mt-4">
                <button type="button" @click="showModal = true" class="btn-contract">
                  <i class="mdi mdi-file-document-edit-outline"></i>
                  <span>근로계약서 작성하기 (전자서명 전송용)</span>
                </button>
                <p class="helper-text-sm text-center mt-2">* 계약서를 미리 작성해두면 입사 시 바로 서명 요청을 보낼 수 있습니다.</p>
              </div>

            </div>
          </section>

          <!-- 카드 4: 급여 및 기타 -->
          <section id="sec-payroll" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-cash-multiple text-primary"></i>
              <h2>급여 및 기타 정보</h2>
            </div>
            <div class="card-body">
              <div class="form-grid">

                <div class="form-group">
                  <label class="form-label">은행</label>
                  <select v-model="employee.bankName" class="form-select">
                    <option v-for="bank in bankOptions" :key="bank.itemNm" :value="bank.itemNm">{{ bank.itemNm }}</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label">계좌번호</label>
                  <input type="text" v-model="employee.accountNumber" class="form-input" placeholder="숫자만 입력" />
                </div>
                <div class="form-group">
                  <label class="form-label">예금주</label>
                  <input type="text" v-model="employee.accountNm" class="form-input" placeholder="예금주 성명" />
                </div>

                <div class="form-group">
                  <label class="form-label required">4대보험 가입</label>
                  <div class="radio-group">
                    <label class="radio-label"><input type="radio" value="Y" v-model="employee.four_ins" required /><span>가입</span></label>
                    <label class="radio-label"><input type="radio" value="N" v-model="employee.four_ins" required /><span>미가입</span></label>
                  </div>
                </div>

                <div class="form-group">
                  <label class="form-label required">퇴직연금 가입</label>
                  <div class="radio-group">
                    <label class="radio-label"><input type="radio" value="Y" v-model="employee.retire_pension" required /><span>가입</span></label>
                    <label class="radio-label"><input type="radio" value="N" v-model="employee.retire_pension" required /><span>미가입</span></label>
                  </div>
                </div>

                <!-- 메모 영역 (기존의 Stacked Panel 스타일 호환) -->
                <div class="form-group full-width mt-2">
                  <div class="memo-stacked-panel">
                    <div class="memo-section">
                      <div class="memo-section-header">
                        <div class="header-title-group">
                          <div class="section-icon-box bg-primary-soft">
                            <i class="mdi mdi-account-details-outline text-primary"></i>
                          </div>
                          <div class="section-title-texts">
                            <h3>직원 기본 특이사항</h3>
                            <p>직원 관리, 업무 및 산재 관련 이슈 메모</p>
                          </div>
                        </div>
                      </div>
                      <div class="clean-editor-card primary-focus">
                        <textarea v-model="employee.bigo" class="clean-textarea" rows="2" placeholder="내용을 입력하세요"></textarea>
                      </div>
                    </div>

                    <div class="mt-4"></div>

                    <div class="memo-section">
                      <div class="memo-section-header">
                        <div class="header-title-group">
                          <div class="section-icon-box bg-warning-soft">
                            <i class="mdi mdi-calculator-variant-outline text-warning"></i>
                          </div>
                          <div class="section-title-texts">
                            <h3>급여 관련 특이사항</h3>
                            <p>수당 지급, 공제 예외 등 급여 처리 관련 메모</p>
                          </div>
                        </div>
                      </div>
                      <div class="clean-editor-card warning-focus">
                        <textarea v-model="employee.payrollBigo" class="clean-textarea" rows="2" placeholder="내용을 입력하세요"></textarea>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </section>

          <div style="height: 100px;"></div>
        </form>
      </main>

    </div>

    <!-- 근로계약서 모달 (기존 컴포넌트 유지) -->
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

<style>
/* Vue/Nuxt 고질적인 Sticky 방해 요소 강제 해제 */
body, #__nuxt, #__layout, .v-application { overflow: visible !important; }
</style>

<style scoped>
/* =========================================
   공통 CSS 변수 & 레이아웃 (현장등록과 동일)
========================================= */
:root {
  --primary: #3b82f6; --primary-hover: #2563eb; --primary-soft: #eff6ff;
  --success: #10b981; --danger: #ef4444; --warning: #f59e0b;
  --text-main: #1e293b; --text-sub: #475569; --text-muted: #94a3b8;
  --border-color: #e2e8f0; --border-focus: #cbd5e1;
  --bg-canvas: #f1f5f9; --bg-surface: #ffffff; --bg-hover: #f8fafc;
}

.member-register-page {
  background-color: var(--bg-canvas, #f1f5f9);
  margin: -24px;
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sticky-header {
  flex-shrink: 0; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(8px);
  padding: 16px 32px; border-bottom: 1px solid var(--border-color, #e2e8f0);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); display: flex; justify-content: space-between;
  align-items: center; z-index: 50; margin: 0;
}
.header-left { display: flex; align-items: center; gap: 16px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.page-title { font-size: 20px; font-weight: 800; color: var(--text-main, #1e293b); margin: 0; display:flex; align-items:center; gap:8px; }
.page-subtitle { font-size: 13px; color: var(--text-sub, #475569); margin: 4px 0 0 0; }

.btn-back { width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); background: #fff; cursor: pointer; transition: 0.2s; display:flex; align-items:center; justify-content:center; }
.btn-back:hover { background: var(--bg-hover, #f8fafc); }
.btn-back i { font-size: 20px; color: var(--text-sub); }

.btn-cancel { padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); background: #fff; font-weight: 600; cursor: pointer; color: var(--text-sub); transition: 0.2s; }
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-submit { padding: 10px 20px; border-radius: 8px; border: none; background: var(--primary, #3b82f6); color: #fff; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2); transition: 0.2s; display:flex; align-items:center; gap:6px; }
.btn-submit:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(59, 130, 246, 0.3); }

/* 퀵 네비게이션 & 메인 레이아웃 */
.register-layout { display: flex; flex: 1; max-width: 1400px; width: 100%; margin: 0 auto; padding-top: 24px; overflow: hidden; }

.quick-nav-sidebar { width: 220px; flex-shrink: 0; height: 100%; overflow-y: auto; padding: 0 16px; }
.nav-title { font-size: 12px; font-weight: 800; color: var(--text-muted, #94a3b8); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-left: 12px; }
.nav-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--text-sub, #475569); cursor: pointer; transition: all 0.2s; background: transparent; }
.nav-item i { font-size: 18px; opacity: 0.6; }
.nav-item:hover { background: rgba(0,0,0,0.04); color: var(--text-main, #1e293b); }
.nav-item.active { background: #fff; color: var(--primary, #3b82f6); box-shadow: 0 2px 8px rgba(0,0,0,0.05); font-weight: 700; }
.nav-item.active i { opacity: 1; }

.content-area { flex: 1; height: 100%; overflow-y: auto; position: relative; padding: 0 24px 80px 24px; scroll-behavior: smooth;}

/* =========================================
   카드 UI 공통
========================================= */
/* 1. category-card에서 overflow: hidden 속성을 제거(또는 visible로 변경)합니다. */
.category-card {
  background: #ffffff;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  overflow: visible; /* hidden에서 visible로 변경 */
  margin-bottom: 24px;
}

/* 2. overflow: hidden을 뺐을 때 상단 배경색이 모서리 둥글기를 덮어버리지 않도록 header에 반경을 추가합니다. */
.card-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  background: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
  border-top-left-radius: 12px; /* 추가 */
  border-top-right-radius: 12px; /* 추가 */
}
.card-header i { font-size: 24px; }
.card-header h2 { font-size: 18px; font-weight: 800; color: var(--text-main, #1e293b); margin: 0; }
.card-body { padding: 24px; }

/* =========================================
   공통 폼 요소
========================================= */
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 20px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.full-width { grid-column: 1 / -1; }
.form-label { font-size: 13px; font-weight: 700; color: var(--text-sub, #475569); }
.form-label.required::after { content: '*'; color: var(--danger, #ef4444); margin-left: 4px; }
.form-input, .form-select, .form-textarea { padding: 10px 12px; border: 1px solid var(--border-focus, #cbd5e1); border-radius: 6px; font-size: 13px; background: #fff; width: 100%; box-sizing: border-box; transition: 0.2s; color: var(--text-main); }
.form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); outline: none; }
.bg-readonly { background-color: var(--bg-hover); color: var(--text-sub); }

.radio-group { display: flex; gap: 8px; }
.radio-label { flex: 1; text-align: center; padding: 8px; border: 1px solid var(--border-focus, #cbd5e1); border-radius: 6px; cursor: pointer; font-size: 13px; background: #fff; transition: 0.2s; color: var(--text-sub);}
.radio-label input { display: none; }
.radio-label:has(input:checked) { border-color: var(--primary, #3b82f6); background: var(--primary-soft, #eff6ff); color: var(--primary, #3b82f6); font-weight: 700; }

.ssn-group { display: flex; align-items: center; gap: 10px; width: 100%; }
.ssn-input { flex: 1; text-align: center; letter-spacing: 2px; min-width: 0; }
.ssn-separator { font-size: 18px; font-weight: 700; color: var(--text-muted); }

/* 기간/기타 특이사항 (배열 추가) */
.custom-etc-row { display: flex; gap: 12px; align-items: center; }
.etc-radio { min-width: 140px; margin: 0; }
.bg-light-section { background: var(--bg-hover); padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); }
.flex-between { display: flex; justify-content: space-between; }
.align-center { align-items: center; }
.mb-0 { margin-bottom: 0; }
.mb-3 { margin-bottom: 12px; }
.mt-2 { margin-top: 8px; }
.mt-4 { margin-top: 24px; }
.period-row { display: flex; gap: 10px; margin-bottom: 10px; align-items: center; }
.separator { color: var(--text-sub); font-weight: bold; }
.btn-mini { padding: 4px 10px; background: #fff; border: 1px dashed var(--text-sub); border-radius: 4px; font-size: 12px; cursor: pointer; transition: 0.2s; display: flex; align-items: center; gap: 4px; }
.btn-mini:hover { border-color: var(--primary); color: var(--primary); }
.btn-remove-icon { background: none; border: none; color: var(--danger); font-size: 18px; cursor: pointer; padding: 4px; }

/* 근로계약서 버튼 */
.contract-write-section { background: var(--bg-canvas); padding: 20px; border-radius: 8px; border: 1px dashed var(--border-focus); }
.btn-contract { width: 100%; padding: 14px; background-color: #1e293b; border: none; border-radius: 8px; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: 0.2s; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.btn-contract:hover { background-color: #0f172a; transform: translateY(-1px); }
.btn-contract i { font-size: 18px; }
.helper-text-sm { font-size: 12px; color: var(--text-sub); }
.text-center { text-align: center; }

/* 특이사항 메모 UI (Stacked Panel 호환) */
.memo-stacked-panel { width: 100%; }
.memo-section { display: flex; flex-direction: column; gap: 16px; }
.memo-section-header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 8px; }
.header-title-group { display: flex; align-items: center; gap: 12px; }
.section-icon-box { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.section-icon-box i { font-size: 22px; }
.bg-primary-soft { background: var(--primary-soft); }
.bg-warning-soft { background: rgba(245, 158, 11, 0.1); }
.text-primary { color: var(--primary); }
.text-warning { color: var(--warning); }
.section-title-texts h3 { font-size: 15px; font-weight: 800; color: var(--text-main); margin: 0 0 2px 0; }
.section-title-texts p { font-size: 12px; color: var(--text-sub); margin: 0; }
.clean-editor-card { background: #fff; border: 1px solid var(--border-focus); border-radius: 8px; overflow: hidden; transition: 0.2s; }
.clean-editor-card:focus-within.primary-focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.clean-editor-card:focus-within.warning-focus { border-color: var(--warning); box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15); }
.clean-textarea { width: 100%; padding: 14px; border: none; font-size: 13px; color: var(--text-main); resize: vertical; outline: none; }

/* 커스텀 트리 메뉴 (직위) */
.position-dropdown-container { position: relative; }
.dropdown-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 99; cursor: default; }
.custom-select-btn { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border: 1px solid var(--border-focus); border-radius: 6px; background: #fff; font-size: 13px; color: var(--text-main); cursor: pointer; transition: 0.2s; height: 41px; box-sizing: border-box; }
.custom-select-btn:hover { border-color: var(--primary); }
.position-dropdown-container:focus-within .custom-select-btn { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.custom-dropdown-menu { position: absolute; top: calc(100% + 4px); left: 0; width: 100%; background: #fff; border: 1px solid var(--border-focus); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 6px 0; margin: 0; list-style: none; z-index: 100; max-height: 250px; overflow-y: auto; }
.menu-label { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; font-size: 13px; color: var(--text-main); cursor: pointer; transition: 0.15s; }
.menu-label:hover { background: var(--bg-hover); color: var(--primary); font-weight: 700; }
.menu-text { flex: 1; }
.toggle-icon-wrap { padding: 4px 8px; margin-right: -8px; cursor: pointer; border-radius: 4px; }
.toggle-icon-wrap:hover { background: var(--border-color); }
.custom-submenu { width: 100%; background: var(--bg-canvas); padding: 4px 0; margin: 0; list-style: none; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); }
.submenu-item { padding: 8px 16px 8px 36px; font-size: 12px; color: var(--text-sub); cursor: pointer; transition: 0.15s; }
.submenu-item:hover { background: var(--primary-soft); color: var(--primary); font-weight: 700; }

/* 모바일 반응형 */
@media (max-width: 1024px) {
  .register-layout { flex-direction: column; }
  .quick-nav-sidebar { width: 100%; padding-top: 10px; }
  .nav-list { flex-direction: row; overflow-x: auto; padding-bottom: 12px; }
  .nav-item { white-space: nowrap; border: 1px solid var(--border-color); background: #fff; }
}
@media (max-width: 768px) {
  .sticky-header { margin: -16px -16px 16px -16px; padding: 12px 16px; }
  .page-title { font-size: 18px; }
  .page-subtitle { display: none; }
  .ssn-group { flex-direction: row; display: grid; }
}
</style>