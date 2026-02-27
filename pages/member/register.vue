<script setup>
import {onMounted, ref, watch} from 'vue';
import { useRouter } from 'nuxt/app';
import axios from 'axios';

const router = useRouter();
const {
  siteOptions,
  typeOptions,
  positionOptions,
  fetchSiteOptions,
  fetchTypeOptions,
  fetchPositionOptions
} = useApi();

// 1. 폼 데이터 모델
const employee = ref({
  type: '',
  name: '',
  id: '',
  password: '',
  phone: '',
  email: '',
  firstNumber:'',//주민번호앞자리
  lastNumber:'',//주민번호뒷자리
  birthDate: '',
  address: '',
  // 현장 및 직위 정보
  site: '',
  position: '',
  joinDate: '',
  endDate: '',
  status: '재직', // 기본값
  gender: '',//성별
  disability: '', //장애여부
  disability_date: '', //장애인등록일
  disability_grade: '', //장애등급
  defector: '',//새터민 여부
  patriot: '',//국가유공자 여부
  intern: '', //청년 인턴 여부
  beneficiary: '',  //기초수급자여부
  foreigner: '',  //외국인여부
  nationality: '',  //국적
  visa_code: '', //비자코드
  visa_date: '',  //비자만료일
  bankName: '국민',//은행
  accountNumber: '',
  four_ins: 'Y', // 4대보험 여부
  retire_pension: 'N', // 퇴직연금 여부
  bigo: '',
  departureDate: '',
  departureReason: '',
});

const showModal = ref(false); // 모달 상태 관리 변수
const items = ref([])
// 2. 드롭다운 옵션
const bankOptions = ref([]);
const contractYear = computed(() => {
  if (employee.value.joinDate) {
    return String(employee.value.joinDate).slice(0, 4)
  }
  return String(new Date().getFullYear())
});

const wageInputs = ref({}); // 급여 입력값 저장용
const contractBlob = ref(null); // 계약서 이미지 Blob
const contractDataTemp = ref(null); // 계약서 데이터 임시 저장용
const isContractSaved = ref(false); // 계약서 작성 완료 여부
const todayDate = computed(() => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
});

// 3. 폼 제출 핸들러
const handleSubmit = async () => {
  // 유효성 검사 예시 (필요시 추가)
  if (!employee.value.site) {
    alert('현장을 선택해주세요.');
    return;
  }

  if (!confirm(`${employee.value.name} 직원을 등록하시겠습니까? (계약 및 배치 포함)`)) return;

  // 보낼 데이터 구성
  // employee 객체에 wageInputs(급여정보)를 추가해서 보냅니다.
  const payload = {
    ...employee.value,       // 기존 입력 폼 데이터 전개
    wageInputs: wageInputs.value // 계약서 모달에서 입력한 급여 데이터 객체
  };

  try {
    // 새로 만든 API 엔드포인트로 전송
    // (라우터 주소는 backend route 설정에 따라 맞춰주세요. 예: /api/v1/member/register-full)
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
/*
const handleSubmit = async () => {
  // 실제 API 호출 로직은 여기에 구현됩니다.
  console.log('직원 등록 데이터:', employee.value);
  const payload = employee.value;
  await axios.post('/api/v1/member/register', payload)
  // 성공 메시지 출력 후 목록 페이지로 리다이렉트 (예시)
  alert(`${employee.value.name} 직원이 성공적으로 등록되었습니다.`);
  router.push('/member/list');
};

 */
/*
const handleSubmit = async () => {
  if (!isContractSaved.value) {
    alert('근로계약서를 먼저 작성(저장)해주세요.');
    return;
  }

  if (!confirm(`${employee.value.name} 직원을 등록하시겠습니까?`)) return;

  try {
    const formData = new FormData();

    // 1) 직원 정보 (JSON 문자열로 변환하여 전송)
    formData.append('memberData', JSON.stringify(employee.value));

    // 2) 계약서 데이터 (JSON 문자열로 변환하여 전송)
    // 모달에서 저장해둔 wageInputs와 날짜 등을 합칩니다.
    const contractMeta = {
      sIdx: employee.value.site,
      type: employee.value.type,
      startDt: employee.value.joinDate,
      endDt: employee.value.endDate,
      bigo: employee.value.bigo,
      jsonData: wageInputs.value // 급여 항목 데이터
    };
    formData.append('contractData', JSON.stringify(contractMeta));

    // 3) 계약서 이미지 파일
    if (contractBlob.value) {
      // 파일명: 이름_생년월일_contract.png
      const fileName = `${employee.value.name}_${employee.value.birthDate}_contract.png`;
      formData.append('file', contractBlob.value, fileName);
    }

    // API 호출 (Multipart/form-data)
    const res = await axios.post('/api/v1/member/register', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    if (res.data.result) {
      alert('성공적으로 등록되었습니다.');
      router.push('/member/list');
    } else {
      alert('등록 실패: ' + (res.data.msg || '알 수 없는 오류'));
    }

  } catch (error) {
    console.error('등록 에러:', error);
    alert('서버 통신 중 오류가 발생했습니다.');
  }
};

 */

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
  const cIdx = 1;
  try {
    const res = await axios.get(`/api/v1/config/code/${cIdx}`);
    // 받아온 데이터가 있으면 필터링, 없으면 빈 배열
    const rawData = res.data.data || [];

    // groupCd가 '04001'인 것만 필터링하여 저장
    items.value = rawData.filter(item => item.groupCd === '04001');
  } catch (err) {
    console.error("항목 로드 실패", err);
  }
}

watch(
    // 1. 감시 대상: 앞자리와 뒷자리 모두 감시
    () => [employee.value.firstNumber, employee.value.lastNumber],
    ([front, back]) => {
      // 2. 앞자리가 6자리가 아니면 중단 (아직 입력 중)
      if (!front || front.length !== 6) return;

      // 3. 년, 월, 일 추출
      let yearPrefix = ''; // 19 또는 20
      const yearPart = front.substring(0, 2);
      const monthPart = front.substring(2, 4);
      const dayPart = front.substring(4, 6);

      // 4. 연도 구분 로직 (뒷자리 첫 글자가 있는 경우 정확도 UP)
      if (back && back.length >= 1) {
        const genderCode = back.substring(0, 1);

        // 1, 2, 5, 6 -> 1900년대 / 3, 4, 7, 8 -> 2000년대
        if (['1', '2', '5', '6'].includes(genderCode)) {
          yearPrefix = '19';
        } else if (['3', '4', '7', '8'].includes(genderCode)) {
          yearPrefix = '20';
        } else {
          // 9, 0 등은 1800년대이나 일반적으로 1900년대로 처리하거나 예외처리
          yearPrefix = '19';
        }
      } else {
        // 5. 뒷자리를 아직 안 썼을 때 (앞자리만으로 추측)
        // 예: 30보다 크면 1900년대, 작으면 2000년대로 가정 (상황에 맞춰 조정 가능)
        // 지금은 일단 2026년 기준, 26보다 크면 1900년대로, 작으면 2000년대로 임시 계산
        // (정확한 입력을 위해 뒷자리 입력 시 덮어씌워집니다)
        const currentYearShort = new Date().getFullYear() % 100; // 26
        if (parseInt(yearPart) > currentYearShort) {
          yearPrefix = '19';
        } else {
          yearPrefix = '20';
        }
      }

      // 6. 날짜 형식 조합 (YYYY-MM-DD)
      const fullDate = `${yearPrefix}${yearPart}-${monthPart}-${dayPart}`;

      // 7. 유효한 날짜인지 체크 후 값 할당
      // (월이 13월이거나 일이 32일인 경우 등 방지)
      if (isValidDate(fullDate)) {
        employee.value.birthDate = fullDate;
      }
    }
);

// 날짜 유효성 검사 헬퍼 함수
const isValidDate = (dateString) => {
  const regEx = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateString.match(regEx)) return false; // 형식 확인
  const d = new Date(dateString);
  const dNum = d.getTime();
  if (!dNum && dNum !== 0) return false; // NaN 확인
  return d.toISOString().slice(0, 10) === dateString;
};

const getBanks = async function () {
  const groupCd = '02001'
  axios.get(`/api/v1/code/${groupCd}`).then(res => {
    console.log(res.data.data, 'getBanks');
    bankOptions.value = res.data.data
  })
}

onMounted(() => {
  fetchSiteOptions()
  fetchTypeOptions()
  fetchPositionOptions()
  getWageCode();
  getBanks();
});
</script>

<template>
  <div class="member-register-page">
    <div class="page-header">
      <h2 class="page-title">직원 등록</h2>
    </div>

    <form @submit.prevent="handleSubmit" class="register-form">

      <section class="form-section">
        <h3 class="section-title">기본 정보</h3>
        <div class="form-grid">
          <div class="input-field required">
            <label for="name">구분</label>
            <select id="site" v-model="employee.type" required class="input-select">
              <option value="" disabled>직원 구분을 선택하세요</option>
              <option v-for="type in typeOptions" :key="type" :value="type.itemCd">{{ type.itemNm }}</option>
            </select>
          </div>

          <div class="input-field required">
            <label for="name">이름</label>
            <input id="name" type="text" v-model="employee.name" required class="input-text" />
          </div>

          <div class="input-field required">
            <label for="id">사번</label>
            <input id="id" type="text" v-model="employee.id" required class="input-text" />
          </div>

          <div class="input-field required">
            <label for="password">비밀번호</label>
            <input id="password" type="password" v-model="employee.password" required class="input-text" />
          </div>

          <div class="input-field">
            <label for="phone">연락처</label>
            <input id="phone" type="tel" v-model="employee.phone" class="input-text" placeholder="예: 010-1234-5678" />
          </div>

          <div class="input-field required">
            <label for="gender">성별</label>
            <div class="radio-group">
              <label>
                <input type="radio" value="M" v-model="employee.gender" />
                남
              </label>
              <label>
                <input type="radio" value="F" v-model="employee.gender" />
                여
              </label>
            </div>
          </div>

          <div class="input-field">
            <label for="email">이메일</label>
            <input id="email" type="email" v-model="employee.email" class="input-text" />
          </div>

          <div class="input-field required">
            <label for="rrn-front">주민번호</label>
            <div class="d-flex align-items-center"> <input
                id="rrn-front"
                type="text"
                v-model="employee.firstNumber"
                class="input-text"
                style="width: 105px"
                maxlength="6"
            />
              <span class="mx-1">-</span>
              <input
                  id="rrn-back"
                  type="password"
                  v-model="employee.lastNumber"
                  class="input-text"
                  style="width: 105px"
                  maxlength="7"
                  autocomplete="off"
              />
            </div>
          </div>

          <div class="input-field">
            <label for="birthDate">생년월일</label>
            <input id="birthDate" type="date" v-model="employee.birthDate" class="input-text" />
          </div>
        </div>

        <div class="input-field full-width">
          <label for="address">주소</label>
          <input id="address" type="text" v-model="employee.address" class="input-text" />
        </div>
      </section>

      <section class="form-section">
        <h3 class="section-title">특이 사항</h3>
        <div class="form-grid">
          <!-- 장애 여부 -->
          <div class="input-field required">
            <label>장애여부</label>
            <div class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.disability" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.disability" />
                X
              </label>
            </div>
          </div>

          <!-- 장애등록일 / 등급 (O일 때만 표시) -->
          <div v-if="employee.disability === 'Y'">
            <!-- 장애등록일 -->
            <div class="input-field">
              <label>장애등록일</label>
              <input
                  class="input-text"
                  type="date"
                  v-model="employee.disability_date"
              />
            </div>
          </div>

          <!-- 장애등급 -->
          <div v-if="employee.disability === 'Y'">
            <div class="input-field">
              <label>장애등급</label>
              <input
                  class="input-text"
                  type="text"
                  v-model="employee.disability_grade"
                  placeholder="예: 1급 / 경증 / 중증"
              />
            </div>
          </div>

          <!-- 새터민 여부 -->
          <div class="input-field required">
            <label>새터민 여부</label>
            <div class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.defector" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.defector" />
                X
              </label>
            </div>
          </div>

          <!-- 국가유공자 여부 -->
          <div class="input-field required">
            <label>국가유공자 여부</label>
            <div class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.patriot" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.patriot" />
                X
              </label>
            </div>
          </div>

          <!-- 청년인턴 여부 -->
          <div class="input-field required">
            <label>청년인턴 여부</label>
            <div class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.intern" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.intern" />
                X
              </label>
            </div>
          </div>

          <!-- 기초수급자 여부 -->
          <div class="input-field required">
            <label>기초수급자 여부</label>
            <div class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.beneficiary" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.beneficiary" />
                X
              </label>
            </div>
          </div>

          <!-- 외국인 여부 -->
          <div class="input-field required">
            <label>외국인 여부</label>
            <div class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.foreigner" />
                O
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.foreigner" />
                X
              </label>
            </div>
          </div>

          <!-- 국적 / 코드 / 비자만료일 체크 (O일 때만 표시) -->
          <div v-if="employee.foreigner === 'Y'">
            <!-- 국적 -->
            <div class="input-field">
              <label>국적</label>
              <input
                  class="input-text"
                  type="text"
                  v-model="employee.nationality"
                  placeholder="예: 베트남, 중국"
              />
            </div>
          </div>

          <div v-if="employee.foreigner === 'Y'">
            <!-- 코드 -->
            <div class="input-field">
              <label>비자 코드</label>
              <input
                  class="input-text"
                  type="text"
                  v-model="employee.visa_code"
                  placeholder="예: KR, CN"
              />
            </div>
          </div>

          <!-- 비자만료일 -->
          <div v-if="employee.foreigner === 'Y'">
            <div class="input-field">
              <label>비자만료일</label>
              <input
                  class="input-text"
                  type="date"
                  v-model="employee.visa_date"
              />
            </div>
          </div>
        </div>
      </section>

      <!-- 근로계약서 섹션 -->
      <section class="form-section flex justify-end">
        <button type="button" @click="showModal = true" class="btn btn-info">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 inline-block" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 4a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" />
          </svg>
          근로계약서 보기
        </button>
      </section>

      <section class="form-section">
        <h3 class="section-title">현장 및 직무 정보</h3>
        <div class="form-grid">

          <div class="input-field required">
            <label for="site">근무 현장</label>
            <select id="site" v-model="employee.site" required class="input-select">
              <option value="" disabled>현장을 선택하세요</option>
              <option v-for="site in siteOptions" :key="site" :value="site.idx">{{ site.name }}</option>
            </select>
          </div>

          <div class="input-field required">
            <label for="position">직위</label>
            <select id="position" v-model="employee.position" required class="input-select">
              <option value="" disabled>직위를 선택하세요</option>
              <option v-for="pos in positionOptions" :key="pos" :value="pos.itemCd">{{ pos.itemNm }}</option>
            </select>
          </div>

          <div class="input-field required">
            <label for="joinDate">입사일</label>
            <input id="joinDate" type="date" v-model="employee.joinDate" required class="input-text" />
          </div>

          <div class="input-field">
            <label>재직 상태</label>
            <div class="radio-group">
              <label><input type="radio" v-model="employee.status" value="0" checked> 재직</label>
              <label><input type="radio" v-model="employee.status" value="1"> 퇴사</label>
            </div>
          </div>

          <div v-if="employee.status == 1">
            <div class="input-field required">
              <label for="joinDate">퇴사일</label>
              <input id="joinDate" type="date" v-model="employee.outDate" required class="input-text" />
            </div>
          </div>
        </div>
      </section>

      <!-- 3. 금융 및 기타 정보 섹션 -->
      <section class="form-section">
        <h3 class="section-title">금융 및 기타 정보</h3>
        <div class="form-grid">

          <!-- 은행 (수정 가능) -->
          <div class="input-field">
            <label for="bankName">은행</label>
            <!--input id="bankName" type="text" v-model="employee.bankName" class="input-text" /-->
            <select v-model="employee.bankName" class="input-select" style="min-width: 150px;">
              <!--option v-for="site in ['LH 위례 6단지', '강서 대명 강동']" :key="site" :value="site">{{ site }}</option-->
              <option v-for="bank in bankOptions" :key="bank" :value="bank.itemNm">{{ bank.itemNm }}</option>
            </select>
          </div>

          <!-- 계좌번호 (수정 가능) -->
          <div class="input-field">
            <label for="accountNumber">계좌번호</label>
            <input id="accountNumber" type="text" v-model="employee.accountNumber" class="input-text" placeholder="숫자만 입력" />
          </div>

          <div class="input-field required">
            <label>4대보험 가입여부</label>
            <div class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.four_ins" />
                가입
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.four_ins" />
                미가입
              </label>
            </div>
          </div>

          <div class="input-field required">
            <label>퇴직연금 가입여부</label>
            <div class="radio-group">
              <label>
                <input type="radio" value="Y" v-model="employee.retire_pension" />
                가입
              </label>
              <label>
                <input type="radio" value="N" v-model="employee.retire_pension" />
                미가입
              </label>
            </div>
          </div>

          <!-- 비고 (수정 가능) -->
          <div class="input-field full-width">
            <label for="bigo">비고</label>
            <textarea id="bigo" v-model="employee.bigo" class="input-text h-20"></textarea>
          </div>
        </div>
      </section>

      <div class="button-group">
        <button type="button" @click="handleCancel" class="btn btn-secondary">취소</button>
        <button type="submit" class="btn btn-primary">직원 등록</button>
      </div>
    </form>

    <!-- 근로계약서 모달 (인라인 구현) -->
    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal-content">

        <div class="modal-header">
          <h3 class="modal-title">근로계약서</h3>
          <button @click="showModal = false" class="close-btn">&times;</button>
        </div>

        <div class="modal-body custom-scrollbar">

          <div class="contract-document contract-page">
            <!-- 상단 로고 + 제목 -->
            <div class="contract-header">
              <div class="contract-logo">
                <!-- 회사 로고 자리 (이미지 경로 맞게 수정) -->
                <!--img src="/eco-img.png" alt="에코그린TM 로고" /-->
              </div>
              <div class="contract-title-wrap">
                <h1 class="contract-title">근 로 계 약 서 {{ contractYear }}년</h1>
              </div>
            </div>

            <!-- 작성일 -->
            <p class="text-right text-sm mb-4">작성일: {{ todayDate }}</p>

            <!-- 제1조 계약기간 -->
            <p class="contract-paragraph">
              ㈜에코그린티엠 대표이사 백송이(이하 “갑”이라 칭함)과 근로자
              <span class="underline-field">{{ employee.name }}</span>
              (이하 “을”이라 칭함)간에 취업규칙을 성실히 준수할 것을 서약하고
              다음과 같이 근로계약을 체결한다.
            </p>

            <h4 class="section-sub-title">제 1조 (근로계약 기간)</h4>
            <p class="contract-paragraph">
              1. 근로계약 기간은
              <input type="date" v-model="employee.joinDate"> 까지로 한다.
              부터
              <input type="date" v-model="employee.endDate"> 까지로 한다.
            </p>
            <p class="contract-paragraph">
              2. “을”의 계속 근무 의사가 있고 “갑”의 계약 갱신 필요성 및 사업장 운영 상황에 따라
              상호 협의 후 계약을 갱신할 수 있다.
            </p>

            <!-- 제2조 근무 장소 및 업무 내용 -->
            <h4 class="section-sub-title">제 2조 (근무 장소 및 업무 내용)</h4>
            <p class="contract-paragraph">
              1. 근무 장소는
              <!--input type="text" v-model="employee.site">으로 한다.-->
              <select v-model="employee.site" style="min-width: 150px;">
                <option v-for="site in siteOptions" :key="site" :value="site.idx">{{ site.name }}</option>
              </select><br>
              2. 직무는
              <input type="text" v-model="employee.position"> 업무 일체로 한다.
            </p>

            <!-- 제3조 소정근로시간 -->
            <h4 class="section-sub-title">제 3조 (근로시간 및 휴게)</h4>
            <p class="contract-paragraph">
              1. 소정근로시간은 1일 8시간, 1주 40시간을 원칙으로 한다.<br>
              2. 휴게시간은 1일 1시간으로 하되, 구체적인 시간은 현장 운영 사정에 따라 조정할 수 있다.
            </p>

            <!-- 제4조 임금 (표 형식) -->
            <h4 class="section-sub-title">제 4조 (임금)</h4>

            <div class="table-responsive custom-scrollbar">
              <table class="wage-table">
                <thead>
                <tr>
                  <th v-for="wage in items" :key="wage.itemCd">{{wage.itemNm}}</th>
                  <th>계</th>
                </tr>
                </thead>
                <tbody>
                <!--tr>
                  <td v-for="wage in items" :key="wage.itemCd">￦ <input type="text" class="wage-input"> </td>
                  <td>￦ <input type="text" class="wage-input"></td>
                </tr-->
                <tr>
                  <td v-for="wage in items" :key="wage.itemCd">
                    ￦ <input type="text" class="wage-input" v-model="wageInputs[wage.itemCd]">
                  </td>
                  <td>￦ {{ totalWage.toLocaleString() }}</td>
                </tr>
                </tbody>
              </table>
            </div>
            <p class="contract-paragraph">
              1. 위 임금은 매월 말일에 마감하여 익월 ○일에 지급한다.<br>
              2. 임금의 구성 및 지급일, 지급방법 등 기타 사항은 회사의 취업규칙 및 임금규정에 따른다.
            </p>

            <!-- 제5조 휴일/휴가 -->
            <h4 class="section-sub-title">제 5조 (휴일 및 휴가)</h4>
            <p class="contract-paragraph">
              1. 휴일은 주휴일 1일을 포함하여 근로기준법 및 회사 규정에 따른다.<br>
              2. 연차유급휴가는 근로기준법 및 회사의 연차규정에 따라 부여한다.
            </p>

            <!-- 제6조 기타 조항 (간략 버전) -->
            <h4 class="section-sub-title">제 6조 (기타)</h4>
            <p class="contract-paragraph">
              1. 본 계약서에 명시되지 아니한 사항은 근로기준법, 기타 관계 법령과 회사 취업규칙을 따른다.<br>
              2. “갑”과 “을”은 상호 성실의 원칙에 따라 근로관계를 유지하며, 회사의 정당한 업무지시에 협조한다.
            </p>

            <!-- 서명란 -->
            <p class="mt-8 text-center leading-relaxed">
              위 근로계약 내용을 상호 확인하였으며, 이를 증명하기 위하여 본 계약서를 2부 작성하여
              갑과 을이 각각 1부씩 보관한다.
            </p>

            <div class="signature-box">
              <p>
                <strong>{{ contractYear }} 년&nbsp;&nbsp;{{ todayDate.slice(5,7) }} 월&nbsp;&nbsp;{{ todayDate.slice(8,10) }} 일</strong>
              </p>

              <div class="signature-row">
                <div>
                  <p><strong>“갑”</strong> ㈜에코그린티엠</p>
                  <p>주소: (회사 주소 기재)</p>
                  <p>대표이사: 백송이 (인)</p>
                </div>
                <div>
                  <p><strong>“을”</strong> 근로자</p>
                  <p>성명: {{ employee.name }} (인)</p>
                  <p>주소: {{ employee.address || '________________' }}</p>
                  <p>연락처: {{ employee.phone || '________________' }}</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        <div class="modal-footer">
          <button
              type="button"
              class="btn btn-primary btn-sm"
              @click="[showModal = false, isContractSaved = true]"
          >
            저장
          </button>
          <button @click="showModal = false" class="btn btn-secondary">닫기</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* === 폼 섹션 스타일 === */
.register-form {
  background-color: #ffffff;
  padding: 30px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.form-section {
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 20px;
  margin-bottom: 30px;
}
.section-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: #1f2937;
  border-bottom: 1px solid #f3f4f6;
  padding-bottom: 10px;
  margin-bottom: 15px;
}

/* === 그리드 및 입력 필드 === */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
}
.input-field {
  display: flex;
  flex-direction: column;
}
.input-field label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #4b5563;
  margin-bottom: 5px;
}
.input-field.required label:after {
  content: '*';
  color: #ef4444; /* Tailwind Red 500 */
  margin-left: 4px;
}
.input-text, .input-select {
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 0.9rem;
  transition: border-color 0.2s;
  background-color: #ffffff;
}
.input-text:focus, .input-select:focus {
  border-color: #3b82f6;
  outline: none;
}
.full-width {
  grid-column: 1 / -1; /* 그리드 전체 너비를 차지하도록 설정 */
}

/* === 버튼 그룹 === */
.button-group {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 30px;
  padding-top: 20px;
  border-top: 1px solid #e5e7eb;
}

/* 버튼 스타일 재활용 (list.vue에서 정의된 스타일) */
.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 600;
  transition: background-color 0.2s;
}
.btn-primary {
  background-color: #3b82f6;
  color: white;
}
.btn-primary:hover {
  background-color: #2563eb;
}
.btn-secondary {
  background-color: #f3f4f6;
  color: #4b5563;
  border: 1px solid #d1d5db;
}
.btn-secondary:hover {
  background-color: #e5e7eb;
}

/* === 모달 스타일 (추가/수정된 부분) === */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 700px;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
}
.modal-header {
  padding: 15px 20px;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
}
.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #9ca3af;
  padding: 0;
  line-height: 1;
}
.modal-body {
  padding: 20px;
  overflow-y: auto;
  flex-grow: 1;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #d1d5db;
  border-radius: 4px;
}
.modal-footer {
  padding: 15px 20px;
  border-top: 1px solid #e5e7eb;
  text-align: right;
}

/* 근로계약서 내용 스타일 */
.contract-document {
  padding: 10px;
  line-height: 1.6;
  color: #374151;
}
.info-box {
  border: 1px solid #d1d5db;
  border-radius: 6px;
  padding: 15px;
  margin-bottom: 20px;
  background-color: #f9fafb;
}
.info-box p {
  margin-top: 10px;
  font-size: 0.95rem;
}
.detail-list {
  list-style: none;
  padding-left: 10px;
  margin-top: 5px;
  font-size: 0.9rem;
  color: #4b5563;
}
.detail-list li {
  margin-bottom: 4px;
}
.section-sub-title {
  font-size: 1.05rem;
  font-weight: 600;
  color: #1f2937;
  margin-top: 20px;
  border-bottom: 1px dashed #e5e7eb;
  padding-bottom: 5px;
}

.signature-box {
  border: 2px dashed #9ca3af;
  padding: 20px;
  margin-top: 30px;
  text-align: right;
  font-size: 0.9rem;
}
.signature-box p {
  margin-top: 10px;
}

.contract-page {
  border: 1px solid #d1d5db;
  padding: 20px 24px;
  background-color: #ffffff;
  font-size: 0.9rem;
}

/* 상단 헤더(로고 + 제목) */
.contract-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.contract-logo img {
  height: 40px;
}
.contract-title-wrap {
  flex: 1;
  text-align: center;
}
.contract-title {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: 0.3rem;
}

/* 단락 공통 */
.contract-paragraph {
  margin-top: 8px;
  margin-bottom: 4px;
  line-height: 1.6;
}

/* 밑줄 들어가는 인풋 느낌 */
.underline-field {
  display: inline-block;
  min-width: 80px;
  border-bottom: 1px solid #9ca3af;
  padding: 0 4px;
}

/* 임금표 */
.table-responsive {
  width: 100%;
  overflow-x: auto; /* 가로 내용이 넘치면 스크롤 생성 */
  margin-bottom: 10px;
  border: 1px solid #e5e7eb; /* 선택사항: 스크롤 영역 테두리 */
}
.wage-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 8px;
  margin-bottom: 8px;
  font-size: 0.85rem;
}
.wage-table th,
.wage-table td {
  border: 1px solid #d1d5db;
  padding: 6px 8px;
  text-align: center;
  white-space: nowrap;
}
.wage-table thead {
  background-color: #f3f4f6;
}
.wage-input{
  width: 80px;
}

/* 서명 박스 */
.signature-row {
  display: flex;
  justify-content: space-between;
  gap: 40px;
  margin-top: 12px;
}
.signature-row p {
  margin: 2px 0;
}
</style>
