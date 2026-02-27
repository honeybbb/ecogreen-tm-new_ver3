<script setup>
import { ref, computed } from 'vue';
import axios from "axios";
import CalcSheetModal from '/components/calcSheetModal.vue';

// 1. 라우트 파라미터 가져오기 (Nuxt 3)
const route = useRoute();
const {
  directWages,
  fetchDirectWages,
} = useApi();
const sIdx = route.params.id;

// 2. 탭 상태 관리
const isEditMode = ref(false);
const activeTab = ref('details'); // 'details', 'staff', 'contracts'
const newBigoInput = ref('');
const isBudgetEditing = ref(false);
let originalEmployeeData = {}; // 취소 시 되돌릴 원본 데이터

// 3. 현장 상세 더미 데이터
const siteData = ref({
  id: sIdx,
  name: 'LH 위례 6단지',
  address: '경기도 성남시 수정구 위례광장로 20',
  manager: '김민지 (010-1234-5678)',
  contractStart: '2024-01-01',
  contractEnd: '2026-12-31',
  status: '정상 운영',
  totalStaffCount: 12,
  recentAttendanceIssues: 0,
  area: 45000, // 관리 면적 (m²)
  building_su: 15,     // 건물 수
  unit_su: 1250,  // 세대 수
  bigo: '청소 구역 101동 계단실 추가 요청 사항 있음', // 비고
  total_cost: 0,
});

const addBigo = async () => {
  if (!newBigoInput.value.trim()) {
    alert('내용을 입력해주세요.');
    return;
  }

  try {
    // 1. API 호출 (실제 백엔드 연동 시 주석 해제 및 경로 수정)
    const res = await axios.post('/api/v1/site/bigo/register', {
      sIdx: sIdx,
      bigo: newBigoInput.value,
      admin: 'admin'
    });

    // 2. 화면 즉시 갱신 (Optimistic Update)
    const newNote = {
      bigo: newBigoInput.value,
      regDt: new Date().toISOString() // 현재 시간 임시 표시
    };

    // 리스트가 없으면 초기화 후 추가
    if (!siteData.value.bigoList) {
      siteData.value.bigoList = [];
    }

    // 최신 글이 위로 오도록 unshift 사용 (혹은 아래로 가려면 push)
    siteData.value.bigoList.unshift(newNote);

    // 입력창 초기화
    newBigoInput.value = '';

    // alert('특이사항이 등록되었습니다.'); // 필요 시 사용

  } catch (error) {
    console.error('비고 등록 실패:', error);
    alert('등록 중 오류가 발생했습니다.');
  }
};

const toggleEditMode = (enable) => {
  isEditMode.value = enable;

  if (enable) {
    // 편집 모드 진입 시, 원본 데이터 백업
    originalEmployeeData = { ...siteData.value };
    //showStatusMessage("수정 모드가 활성화되었습니다. 필요한 정보를 변경하세요.", 'info');
  } else {
    // 취소 시, 원본 데이터로 되돌리기
    siteData.value = { ...originalEmployeeData };
    //showStatusMessage("수정이 취소되었습니다. 변경 사항이 반영되지 않았습니다.", 'error');
  }
};

const getSiteData = async () => {
  const sIdx = route.params.id;
  const res = await axios.get(`/api/v1/site/data/${sIdx}`)
  // console.log(res.data.data[0], 'siteData')
  let result = res.data.data[0];
  if(res.data.data.length > 0){
    siteData.value.id = result.idx;
    siteData.value.name = result.name;
    siteData.value.address = result.address;
    siteData.value.director = result.director+' ('+result.director_phone+')';
    siteData.value.area = result.area;
    siteData.value.building_su = result.building_su;
    siteData.value.unit_su = result.unit_su;
    siteData.value.contractStart = result.startDt.slice(0, 10);
    siteData.value.contractEnd = result.endDt.slice(0, 10);
    siteData.value.status = result.status == 'Y' ? '정상 운영' : '계약 종료';
    siteData.value.total_cost = result.total_cost;
    siteData.value.contractList = JSON.parse(result.contractList);
    console.log(result.contractList)
    /*

    try {
      budget.value = result.budget ?
          (typeof result.budget === 'string' ? JSON.parse(result.budget) : result.budget) : [];
    } catch (e) {
      budget.value = [];
    }

     */

    const rawBigoList = result.bigoList;
    try {
      // 데이터가 있고 문자열이라면 파싱, 아니면 빈 배열
      siteData.value.bigoList = rawBigoList ? JSON.parse(rawBigoList) : [];
    } catch (e) {
      siteData.value.bigoList = [];
    }
  }

}

// 4. 해당 현장 배정 직원 목록 더미 데이터
const assignedStaff = ref([
  { idx: 1, name: '김철수', role: '미화 반장', joinDate: '2024-01-01', status: '재직', phone: '010-1111-2222' },
  { idx: 2, name: '이영희', role: '미화원', joinDate: '2024-03-15', status: '재직', phone: '010-3333-4444' },
  { idx: 3, name: '박민준', role: '경비원', joinDate: '2023-11-01', status: '재직', phone: '010-5555-6666' },
  { idx: 4, name: '최지우', role: '미화원', joinDate: '2025-01-20', status: '휴직', phone: '010-7777-8888' },
]);

// 5. 현장 정보 수정 모달 상태
const isEditModalOpen = ref(false);
const editingSiteData = ref({});

const openEditModal = () => {
  editingSiteData.value = { ...siteData.value }; // 데이터 복사
  isEditModalOpen.value = true;
};

const saveSiteDetails = () => {
  // 실제 API 호출 로직은 여기에 들어갑니다.
  siteData.value = { ...editingSiteData.value };
  alert(`${siteData.value.name} 현장 정보가 성공적으로 수정되었습니다.`);
  isEditModalOpen.value = false;
};

const saveBudget = async () => {
  try {
    // 실제 운영 환경에서는 아래 API를 호출합니다.
    /*
    await axios.post(`/api/v1/site/budget/update`, {
      sIdx: sIdx,
      totalMonthly: budgetData.value.totalMonthly,
      items: budgetData.value.items
    });
    */
    console.log(JSON.stringify(budgetData.value.items));

    alert('산출내역서가 성공적으로 저장되었습니다.');
    isBudgetEditing.value = false;
  } catch (error) {
    console.error('저장 실패:', error);
    alert('저장 중 오류가 발생했습니다.');
  }
};

// 각 직원 컬럼별 합계 계산 (이미지의 '월간 1인당 용역비' 행에 해당)
const columnTotals = computed(() => {
  const securityContract = siteData.value.contractList?.find(c => c.type === '01001001');
  const staffCounts = securityContract ? securityContract.staffList.length : 0;

  // 초기 합계 배열 [0, 0, ...]
  const totals = Array(staffCounts).fill(0);

  budget.value.forEach(item => {
    item.amounts.forEach((amt, idx) => {
      totals[idx] += (Number(amt) || 0);
    });
  });
  return totals;
});

// 전체 월간 용역비 총계 (이미지의 '월간 용역비 총계' 행에 해당)
const grandTotal = computed(() => {
  const securityContract = siteData.value.contractList?.find(c => c.type === '01001001');
  if (!securityContract) return 0;

  // 각 컬럼의 합계(1인당 합계) * 해당 직종의 인원수(staff.count)
  return columnTotals.value.reduce((acc, curr, idx) => {
    const staffCount = securityContract.staffList[idx]?.count || 0;
    return acc + (curr * staffCount);
  }, 0);
});

// 6. 직원 관리 액션
const removeStaff = (staffName) => {
  if (confirm(`${siteData.value.name} 현장에서 ${staffName} 직원을 해제하시겠습니까? (다른 현장으로 이동 또는 퇴사 처리)`)) {
    assignedStaff.value = assignedStaff.value.filter(s => s.name !== staffName);
    siteData.value.totalStaffCount = assignedStaff.value.length;
    alert(`${staffName} 직원이 현장에서 해제되었습니다.`);
  }
};

const getStaffStatusClass = (status) => {
  return status === '재직' ? 'status-active' : 'status-inactive';
};

// 7. 탭 목록
const tabs = ref([
  { key: 'details', name: '기본 정보 및 현황' },
  { key: 'staff', name: '배정 직원 관리' },
  { key: 'contracts', name: '계약 및 특이사항' },
  { key: 'budget', name: '산출내역서' },
]);

const isAssignModalOpen = ref(false);
const newStaffAssignment = ref({
  mIdx: '',
  name: '',
  role: '',
  joinDate: new Date().toISOString().substring(0, 10), // 오늘 날짜 기본값
  phone: '',
});
const availableStaffOptions = ref([
  '미배정 직원 A',
  '미배정 직원 B',
  '미배정 직원 C'
]); // 배정 가능한 직원 목록 (실제로는 API에서 가져옴)

const budget = ref([]);
const budgetData = ref({
  // totalMonthly: 14278680, // 월간 용역비 총계
  totalMonthly: 0, // 월간 용역비 총계
  items: [
    /*
    // 1. 직접노무비
    { category: '직접노무비', itemNm: '기본급', itemCd: '04001001',amount: 2432740, formula: '월근로시간 × 2026년 최저임금 적용' },
    { category: '직접노무비', itemNm: '야간근로수당', itemCd: '04001003', amount: 313940, formula: '((①+③)/월근로시간)×월야간근무시간×50%' },
    { category: '직접노무비', itemNm: '근로자의날 수당', itemCd: '', amount: 6670, formula: '((①+③)/월근로시간)×일근로시간/12' },
    { category: '직접노무비', itemNm: '연차적립금', itemCd: '', amount: 99980, formula: '((①+③)/월근로시간)×일근로시간×15일/12' },
    { category: '직접노무비', itemNm: '퇴직적립금', itemCd: '', amount: 237780, formula: '(①+②+③+④+⑤)/12' },

    // 2. 간접노무비
    { category: '간접노무비', itemNm: '건강보험', itemCd: '04002001', amount: 102570, formula: '(①+②+③+④+⑤)×3.595% 적용' },
    { category: '간접노무비', itemNm: '장기요양보험', itemCd: '04002002', amount: 13280, formula: '건강보험료×12.95%' },
    { category: '간접노무비', itemNm: '국민연금', itemCd: '04002003', amount: 128390, formula: '(①+②+③+④+⑤)×4.5%' },
    { category: '간접노무비', itemNm: '고용보험', itemCd: '04002004', amount: 38510, formula: '(①+②+③+④+⑤)×1.35% 적용' },
    { category: '간접노무비', itemNm: '산재보험', amount: 28530, formula: '(①+②+③+④+⑤)×1.%업체요율(%)' },

    // 3. 제경비
    { category: '제경비', itemNm: '피복비 및 장구비', amount: 10000, formula: '1인당 월 10,000원 이상/월' },
    { category: '제경비', itemNm: '교육훈련비', amount: 5000, formula: '1인당 월 5,000원 이상/월' },
    { category: '제경비', itemNm: '소모품비', amount: 5000, formula: '1인당 월 5,000원 이상/월' },
    { category: '제경비', itemNm: '복리후생비', amount: 10000, formula: '1인당 월 10,000원 이상/월' },

    // 4. 기타
    { category: '일반관리비', itemNm: '일반관리비', amount: 68640, formula: '(합계D) × 2% 이상' },
    { category: '기업이윤', itemNm: '기업이윤', amount: 68640, formula: '(합계D) × 2% 이상' }

     */
  ]
});
// 1. 산출내역서 목록 데이터
const budgetList = ref([
  { idx: 1, year: 2026, type: '01001001', title: '2026년 경비용역비 산출내역서', regDt: '2025-12-01', totalAmount: 14278680 },
  { idx: 2, year: 2026, type: '01001002', title: '2026년 미화용역비 산출내역서', regDt: '2025-12-05', totalAmount: 8500000 },
]);

// 2. 상세 보기/수정 모달 상태
const isBudgetDetailModalOpen = ref(false);
const selectedBudget = ref(null); // 현재 선택된 상세 데이터

// 3. 상세 보기 함수
const openBudgetDetail = (item) => {
  console.log(item, 'item')
  // 실제로는 여기서 API 호출: axios.get(`/api/v1/site/budget/${item.idx}`)
  selectedBudget.value = { ...item }; // 임시로 데이터 복사
  isBudgetDetailModalOpen.value = true;
};

// 4. 새 내역서 작성
const createNewBudget = (type) => {
  selectedBudget.value = {
    year: new Date().getFullYear(),
    type: type, // '경비', '미화' 등 전달받은 타입 세팅
    title: `${new Date().getFullYear()}년 ${type}용역비 산출내역서`,
    items: []
  };
  isBudgetDetailModalOpen.value = true;
};

const addBudgetItem = () => {
  const securityContract = siteData.value.contractList.find(c => c.type === '01001001');
  const staffCounts = securityContract ? securityContract.staffList.length : 0;

  budget.value.push({
    category: '직접노무비',
    code: '',
    name: '',
    itemCd: '',
    itemNm: '',
    amounts: Array(staffCounts).fill(0),
    formula: ''
  });
};

// 순서 변경 함수
const moveItem = (index, direction) => {
  const targetList = budget.value; // 현재 편집 중인 리스트
  const newIndex = index + direction;

  // 범위를 벗어나면 실행 안 함
  if (newIndex < 0 || newIndex >= targetList.length) return;

  // 원소 위치 교환 (Swap)
  const temp = targetList[index];
  targetList[index] = targetList[newIndex];
  targetList[newIndex] = temp;
};

const removeBudgetItem = (index) => {
  if (confirm('해당 항목을 삭제하시겠습니까?')) {
    budget.value.splice(index, 1);
  }
};

const onItemChange = (idx, selectedCd) => {
  const selectedItem = directWages.value.find(opt => opt.itemCd === selectedCd);
  if (selectedItem) {
    budget.value[idx].name = selectedItem.itemNm;
    budget.value[idx].itemCd = selectedItem.itemCd;
    budget.value[idx].code = selectedItem.itemCd;
  }
};

// 💡 새로운 함수 추가: 직원 배정 처리
const openAssignModal = () => {
  // 폼 초기화
  newStaffAssignment.value = {
    mIdx: '',
    name: '',
    role: '',
    joinDate: new Date().toISOString().substring(0, 10),
    phone: '',
  };
  isAssignModalOpen.value = true;
};

const assignStaff = () => {
  console.log(newStaffAssignment.value)

  const newStaff = {
    mIdx: newStaffAssignment.value.idx,
    name: newStaffAssignment.value.name,
    role: newStaffAssignment.value.role,
    joinDate: newStaffAssignment.value.joinDate,
    phone: newStaffAssignment.value.phone,
    status: '재직'
  };

  // 유효성 검사
  if (!newStaff.name) {
    alert('직원은 필수로 선택해야 합니다.');
    return;
  }

  // 목록에 추가
  assignedStaff.value.push(newStaff);
  siteData.value.totalStaffCount = assignedStaff.value.length; // 직원 수 업데이트

  alert(`${newStaff.name} 직원이 ${siteData.value.name} 현장에 배정되었습니다.`);

  // 모달 닫기
  isAssignModalOpen.value = false;
};

const isAssignedStaff = async () => {
  const sIdx = route.params.id;
  const res = await axios.get(`/api/v1/member/staffing/${sIdx}`)
  // console.log(res.data.data)
  availableStaffOptions.value = res.data.data
}

const getAssignedStaff = async () => {
  const sIdx = route.params.id;
  const res = await axios.get(`/api/v1/site/headcount/${sIdx}`)
  // console.log(res.data.data, 'head')
  assignedStaff.value = res.data.data
}

const onBudgetSaved = async (payload) => {
  // await axios.post('/api/v1/site/budget/save', { sIdx, ...payload });
  console.log(payload, '산출내역서 저장');
  isBudgetDetailModalOpen.value = false;
};

onMounted(() => {
  // 컴포넌트가 로드되면 초기 목록을 가져옵니다.
  getSiteData();
  getAssignedStaff();
  isAssignedStaff();
  // fetchDirectWages();
});
</script>

<template>
  <div class="site-detail-page">
    <div class="page-header">
      <h2 class="page-title">
        <span class="site-id">ID: {{ sIdx }}</span> {{ siteData.name }} 상세 관리
      </h2>
      <div class="button-group-header">
        <button v-if="!isEditMode" @click="toggleEditMode(true)" class="btn btn-primary">
          정보 수정
        </button>
        <button v-if="isEditMode" @click="saveSiteDetails" class="btn btn-success">
          저장
        </button>
        <button v-if="isEditMode" @click="toggleEditMode(false)" class="btn btn-secondary">
          취소
        </button>
      </div>
    </div>

    <div class="tab-nav">
      <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['tab-button', { 'active': activeTab === tab.key }]"
          @click="activeTab = tab.key"
      >
        {{ tab.name }}
      </button>
    </div>

    <div class="tab-content">

      <div v-if="activeTab === 'details'" class="section-card">
        <h3 class="section-title">주요 현황 요약</h3>
        <div class="summary-grid">
          <div class="summary-item">
            <span class="label">현장 주소</span>
            <span class="value">{{ siteData.address }}</span>
          </div>
          <div class="summary-item">
            <span class="label">현장 관리자</span>
            <span class="value">{{ siteData.director }}</span>
          </div>
          <div class="summary-item">
            <span class="label">기본 단가</span>
            <span class="value">{{ siteData.total_cost }} 원</span>
          </div>

          <div class="summary-item">
            <span class="label">계약 기간</span>
            <span class="value">{{ siteData.contractStart }} ~ {{ siteData.contractEnd }}</span>
          </div>

          <div class="summary-item">
            <span class="label">관리 면적</span>
            <span class="value">{{ siteData.area.toLocaleString() }} m²</span>
          </div>

          <div class="summary-item">
            <span class="label">건물 수</span>
            <span class="value">{{ siteData.building_su }} 동</span>
          </div>

          <div class="summary-item">
            <span class="label">세대 수</span>
            <span class="value">{{ siteData.unit_su.toLocaleString() }} 세대</span>
          </div>

          <div class="summary-item status-box">
            <span class="label">총 배정 직원 수</span>
            <span class="value count-active">{{ assignedStaff.length }} 명</span>
          </div>
          <div class="summary-item status-box">
            <span class="label">최근 근태 이슈 (7일)</span>
            <span :class="['value', siteData.recentAttendanceIssues > 0 ? 'count-issue' : 'count-normal']">
                {{ siteData.recentAttendanceIssues }} 건
            </span>
          </div>
          <div class="summary-item">
            <span class="label">운영 상태</span>
            <span class="value status-chip status-active">{{ siteData.status }}</span>
          </div>
        </div>

        <div class="notes-section section-card">
          <h3 class="section-title small-title">비고 / 특이사항</h3>

          <div class="quick-add-wrapper">
            <input
                type="text"
                v-model="newBigoInput"
                @keyup.enter="addBigo"
                class="input-text quick-input"
                placeholder="새로운 특이사항을 입력 후 엔터 또는 등록 버튼 클릭"
            />
            <button @click="addBigo" class="btn btn-sm btn-register">등록</button>
          </div>

          <ul v-if="siteData.bigoList && siteData.bigoList.length > 0">
            <li v-for="(item, index) in siteData.bigoList" :key="index">
              <span class="note-text">
                {{ item.bigo }}
              </span>
              <div class="spacer"></div>

              <div class="spacer"></div>

              <span class="note-date">
                <span class="note-writer">
                  ({{ item.admin || '관리자' }})
                </span>

                {{ item.regDt ? item.regDt.substring(0,10) : '' }}
              </span>
            </li>
          </ul>

          <p v-else class="empty-note">
            등록된 특이사항이 없습니다.
          </p>
        </div>
      </div>

      <div v-if="activeTab === 'staff'" class="section-card">
        <div class="staff-header">
          <h3 class="section-title">현장 배정 직원 목록 ({{ assignedStaff.length }} 명)</h3>
          <button class="btn btn-add-staff" @click="openAssignModal">직원 배정하기</button>
        </div>

        <div class="table-container">
          <table class="data-table">
            <thead>
            <tr>
              <th style="width: 50px;">No.</th>
              <th style="width: 120px;">직원명</th>
              <th>직무/역할</th>
              <th>입사일 (본사)</th>
              <th>연락처</th>
              <th style="width: 80px;">상태</th>
              <th style="width: 100px;">관리</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="(staff, index) in assignedStaff" :key="staff.idx">
              <td>{{ index + 1 }}</td>
              <td class="staff-name-cell">{{ staff.name }}</td>
              <td>{{ staff.role }}</td>
              <td>{{ staff.joinDate }}</td>
              <td>{{ staff.phone }}</td>
              <td>
                            <span :class="['staff-status-chip', getStaffStatusClass(staff.status)]">
                                {{ staff.status }}
                            </span>
              </td>
              <td>
                <button @click="removeStaff(staff.name)" class="btn btn-sm btn-remove">해제</button>
              </td>
            </tr>
            <tr v-if="assignedStaff.length === 0">
              <td colspan="7" class="text-center-none">현장에 배정된 직원이 없습니다.</td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!--div v-if="activeTab === 'contracts'" class="section-card">
        <h3 class="section-title">계약 조건 및 특이사항</h3>
        <p class="notes-area">
          여기에 계약서 사본, 월별 청구 금액, 계약 갱신일, 현장에서 발생한 중요한 특이사항 (예: 장비 교체 필요, 민원 발생 이력) 등을 관리할 수 있는 영역이 들어갑니다.
          <br><br>
          **[특이사항 예시]**
          - 2025년 11월: 미화 장비 중 청소기가 노후화되어 교체가 필요함. (담당자: 이현장)
          - 주차장 구역 경비 인력 1명 추가 배정 요청 검토 중.
        </p>
        <button class="btn btn-secondary">계약서 파일 관리</button>
      </div-->
      <div v-if="activeTab === 'contracts'" class="section-card">
        <h3 class="section-title">계약 조건 및 상세 정보</h3>

        <div v-if="siteData.contractList && siteData.contractList.length > 0" class="contract-list">
          <div v-for="(contract, idx) in siteData.contractList" :key="idx" class="contract-card-view">
            <div class="card-header-view">
              <div class="contract-title">
                <span :class="['badge', contract.category]">{{ contract.category }}</span>
                <span class="period">
                  {{ contract.startDt ? contract.startDt.substring(0, 10) : '' }} ~
                  {{ contract.endDt ? contract.endDt.substring(0, 10) : '' }}
                </span>
              </div>
            </div>

            <div class="card-body-view">
              <div class="info-row">
                <span class="info-label">근무 일수</span>
                <span class="info-value">{{ contract.workDays }}일 / 월</span>
              </div>
              <div class="info-row">
                <span class="info-label">휴게 시간</span>
                <span class="info-value">{{ contract.breakTime || '-' }}</span>
              </div>
              <div class="info-row full">
                <span class="info-label">근무 형태</span>
                <span class="info-value">{{ contract.workSchedule }}</span>
              </div>

              <div class="staff-composition">
                <span class="sub-label">인원 구성:</span>
                <div class="tags">
                  <span v-for="(staff, sIdx) in contract.staffList" :key="sIdx" class="staff-tag-view">
                    {{ staff.name }} <strong>{{ staff.count }}명</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="empty-state">
          <p>등록된 계약 상세 정보가 없습니다.</p>
          <button @click="$router.push(`/site/register?idx=${sIdx}`)" class="btn btn-sm btn-edit">
            계약 정보 등록하러 가기
          </button>
        </div>

        <div class="file-upload-section mt-4">
          <h4 class="sub-section-title">계약서 및 관련 문서</h4>
          <div class="file-box">
            <p class="file-desc">계약서 스캔본이나 관련 문서를 업로드하여 관리하세요.</p>
            <input type="file" class="file-input">
          </div>
        </div>
      </div>

      <div v-if="activeTab === 'budget'" class="section-card">
        <div class="staff-header">
          <h3 class="section-title">연도별 산출내역서 관리</h3>
          <button @click="createNewBudget" class="btn btn-add-staff">+ 새 내역서 작성</button>
        </div>
        <div class="table-container mt-4">
          <table class="data-table">
            <thead>
            <tr>
              <th style="width: 80px;">연도</th>
              <th>내역서 명칭</th>
              <th class="text-right">월 용역비 합계</th>
              <th style="width: 120px;">등록일</th>
              <th style="width: 100px;">상세보기</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="item in budgetList" :key="item.idx">
              <td class="text-center">{{ item.year }}</td>
              <td class="font-bold">{{ item.title }}</td>
              <td class="text-right">{{ item.totalAmount.toLocaleString() }} 원</td>
              <td class="text-center">{{ item.regDt }}</td>
              <td class="text-center">
                <button @click="openBudgetDetail(item)" class="btn btn-sm btn-edit">상세/수정</button>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>

    </div>

    <div v-if="isEditModalOpen" class="modal-overlay">
      <div class="modal-content">
        <h3>{{ editingSiteData.name }} 정보 수정</h3>

        <div class="input-group-vertical">
          <label>관리 면적 (m²)</label>
          <input type="number" v-model.number="editingSiteData.area" class="input-text">
        </div>

        <div class="input-group-vertical">
          <label>건물 수 (동)</label>
          <input type="number" v-model.number="editingSiteData.building_su" class="input-text">
        </div>

        <div class="input-group-vertical">
          <label>세대 수</label>
          <input type="number" v-model.number="editingSiteData.unit_su" class="input-text">
        </div>

        <div class="input-group-vertical">
          <label>비고</label>
          <ul>
            <li v-for="item in JSON.parse(siteData.value.bigo)">
              {{item.bigo}}
            </li>
          </ul>
          <textarea v-model="editingSiteData.bigo" rows="3" class="input-text" placeholder="현장 관련 특이사항을 입력하세요."></textarea>
        </div>

        <div class="modal-actions">
          <button @click="isEditModalOpen = false" class="btn btn-cancel">취소</button>
          <button @click="saveSiteDetails" class="btn btn-save">저장</button>
        </div>
      </div>
    </div>

    <div v-if="isAssignModalOpen" class="modal-overlay">
      <div class="modal-content">
        <h3>현장 직원 배정</h3>
        <p class="modal-info">현장: {{ siteData.name }}</p>

        <form @submit.prevent="assignStaff">
          <div class="input-group-vertical">
            <label for="staff-name-select">직원 선택 *</label>
            <select id="staff-name-select" v-model="newStaffAssignment" class="input-text">
              <option value="" disabled>-- 배정할 직원 선택 --</option>
              <option v-for="staff in availableStaffOptions" :key="staff.idx" :value="staff">
                {{ staff.name }}
              </option>
            </select>
          </div>

          <!--div class="input-group-vertical">
            <label for="staff-role">직무/역할 *</label>
            <input type="text" id="staff-role" v-model="newStaffAssignment.role" class="input-text" placeholder="예: 미화 반장, 경비원">
          </div-->

          <div class="input-group-vertical">
            <label for="staff-join-date">현장 배정일</label>
            <input type="date" id="staff-join-date" v-model="newStaffAssignment.joinDate" class="input-text">
          </div>

          <!--div class="input-group-vertical">
            <label for="staff-phone">연락처</label>
            <input type="text" id="staff-phone" v-model="newStaffAssignment.phone" class="input-text" placeholder="010-XXXX-XXXX">
          </div-->

          <div class="modal-actions">
            <button @click="isAssignModalOpen = false" class="btn btn-cancel" type="button">취소</button>
            <button type="submit" class="btn btn-save">직원 배정</button>
          </div>
        </form>
      </div>
    </div>

    <!--div v-if="isBudgetDetailModalOpen" class="modal-overlay">
      <div class="modal-content large-content">
        <div class="staff-header">
          <h3 class="modal-header">{{ selectedBudget.year }}년 경비용역비 산출내역서</h3>
          <div class="header-actions">
            <button v-if="isBudgetEditing" @click="addBudgetItem" class="btn btn-add-staff mr-2">+ 항목 추가</button>
            <button v-if="!isBudgetEditing" @click="isBudgetEditing = true" class="btn btn-edit">📝 내역 수정</button>
            <button v-if="!isBudgetEditing" @click="isBudgetDetailModalOpen = false" class="btn">닫기</button>
            <template v-else>
              <button @click="saveBudget" class="btn btn-save">💾 저장하기</button>
              <button @click="isBudgetEditing = false" class="btn btn-cancel">취소</button>
            </template>
          </div>
        </div>
        <div class="modal-body">
          <div class="table-container mt-4">
            <table class="data-table budget-table">
              <thead>
              <tr>
                <th style="width: 60px;">순서</th>
                <th style="width: 120px;">구분</th>
                <th style="width: 180px;">항목</th>
                <template v-for="contract in selectedBudget">
                  <th v-for="(staff, sIdx) in contract.staffList" :key="sIdx">
                    {{ staff.name }} ({{ staff.count }}명)
                  </th>
                </template>
                <th>산출내역 (산출근거)</th>
                <th v-if="isBudgetEditing" style="width: 50px;">관리</th>
              </tr>
              </thead>

              <tbody>
              <tr v-for="(item, idx) in budget" :key="idx">
                <td class="text-center">
                  <div class="order-buttons">
                    <button @click="moveItem(idx, -1)" :disabled="idx === 0" class="btn-order">▲</button>
                    <button @click="moveItem(idx, 1)" :disabled="idx === budget.length - 1" class="btn-order">▼</button>
                  </div>
                </td>
                <td class="category-cell">{{ item.category }}</td>
                <td class="item-name">

                  <div v-if="isBudgetEditing" class="edit-select-wrapper">

                    <select v-model="item.itemCd" @change="onItemChange(idx, item.itemCd)" class="input-select budget-edit-select">

                      <option value="" disabled>항목 선택</option>

                      <option v-for="opt in directWages" :key="opt.itemCd" :value="opt.itemCd">{{ opt.itemNm }}</option>

                    </select>

                  </div>

                  <span v-else>{{ item.name }}</span>

                </td>
                <template v-for="contract in siteData.contractList">
                  <td v-if="contract.type === '01001001'" v-for="(staff, sIdx) in contract.staffList" class="text-right">
                    <input v-if="isBudgetEditing" type="number" v-model.number="item.amounts[sIdx]" class="input-text text-right mini">
                    <span v-else>{{ item.amounts[sIdx]?.toLocaleString() }}</span>
                  </td>
                </template>
                <td>
                  <input v-if="isBudgetEditing" type="text" v-model="item.formula" class="input-text w-full">
                  <span v-else>{{ item.formula }}</span>
                </td>
                <td v-if="isBudgetEditing" class="text-center">
                  <button @click="removeBudgetItem(idx)" class="btn-text-red">×</button>
                </td>
              </tr>
              </tbody>

              <tfoot class="budget-summary-footer">
              <tr class="summary-row total-per-person">
                <td colspan="3" class="text-center highlight-label">월간 1인당 용역비 (A~F)</td>
                <template v-for="(total, tIdx) in columnTotals" :key="tIdx">
                  <td class="text-right highlight-value">{{ total.toLocaleString() }}</td>
                </template>
                <td class="formula-desc">각 항목별 합계</td>
                <td v-if="isBudgetEditing"></td>
              </tr>

              <tr class="summary-row grand-total-row">
                <td colspan="3" class="text-center grand-label">월간 용역비 총계</td>
                <td :colspan="columnTotals.length" class="text-center grand-value">
                  {{ grandTotal.toLocaleString() }} 원
                </td>
                <td class="formula-desc">1인당 용역비 × 각 인원수 합산</td>
                <td v-if="isBudgetEditing"></td>
              </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div-->
  </div>

  <CalcSheetModal
      :is-open="isBudgetDetailModalOpen"
      :selected-budget="selectedBudget"
      :contract-list="siteData.contractList"
      @close="isBudgetDetailModalOpen = false"
      @save="onBudgetSaved"
  />
</template>
<style scoped src="/assets/css/site.css"></style>
