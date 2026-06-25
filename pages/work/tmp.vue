<script setup>
import { ref, computed, onMounted } from 'vue';
const {
  siteOptions,
  fetchSiteOptions
} = useApi();

// 1. 상태 및 검색 조건
const searchTerm = ref('');
const selectedSite = ref('전체');
// const siteOptions = ref(['전체', '청라제일풍경채', '경향렉스빌아파트', '아차산어울림', '북한산힐스테이트7차']);
const selectedYear = ref(new Date().getFullYear());

// 2. 모달 관련 상태
const isHistoryModalOpen = ref(false);
const selectedEmp = ref(null);

// 입력 폼 상태 (사용 vs 정산)
const actionType = ref('use'); // 'use': 연차 사용, 'settle': 연차 정산
const newRecordDate = ref('');
const useType = ref('full'); // full, half_am, half_pm
const settleDays = ref(1); // 정산할 연차 일수
const settleMemo = ref(''); // 정산 사유 메모

// 3. 임직원 연차 데이터
const empList = ref([
  //현장명(혹은 현장PK), 사번, 이름, 직책, 임금, 남은 연차, 연차사용 내역
  {
    sIdx: '140',
    siteName: '아차산어울림',
    empId: '669272',
    name: '김영자',
    role: '미화원',
    dailyWage: 85000,
    totalLeave: 15,
    history: [
      { id: 1, type: 'use', useType: 'half_am', date: '2024-11-27', deduction: 0.5, memo: '' },
      { id: 2, type: 'use', useType: 'full', date: '2025-02-15', deduction: 1, memo: '' },
      { id: 3, type: 'settle', date: '2025-04-01', deduction: 5, memo: '1분기 중간정산 요청' },
    ]
  },
  {
    sIdx: '141',
    siteName: '북한산힐스테이트7차',
    empId: '657958',
    name: '이명숙C',
    role: '미화원',
    dailyWage: 85000,
    totalLeave: 15,
    history: []
  }
]);

// 4. 데이터 가공 (사용, 정산, 잔여 분리)
const processedEmpList = computed(() => {
  return empList.value.map(emp => {
    const usedLeave = emp.history
        .filter(h => h.type === 'use')
        .reduce((sum, record) => sum + record.deduction, 0);

    const settledLeave = emp.history
        .filter(h => h.type === 'settle')
        .reduce((sum, record) => sum + record.deduction, 0);

    const remainingLeave = emp.totalLeave - usedLeave - settledLeave;
    const expectedAllowance = remainingLeave * emp.dailyWage;

    return { ...emp, usedLeave, settledLeave, remainingLeave, expectedAllowance };
  });
});

const filteredList = computed(() => {
  return processedEmpList.value.filter(emp => {
    const matchName = emp.name.toLowerCase().includes(searchTerm.value.toLowerCase());
    const matchSite = selectedSite.value === '전체' || emp.siteName === selectedSite.value;
    return matchName && matchSite;
  });
});

const formatCurrency = (value) => new Intl.NumberFormat('ko-KR').format(value) + '원';

// 5. 모달 핸들러
const openHistoryModal = (emp) => {
  selectedEmp.value = emp;
  actionType.value = 'use';
  newRecordDate.value = '';
  useType.value = 'full';
  settleDays.value = 1;
  settleMemo.value = '';
  isHistoryModalOpen.value = true;
};

const closeHistoryModal = () => {
  isHistoryModalOpen.value = false;
  selectedEmp.value = null;
};

// 6. 이력 추가
const addRecord = () => {
  if (!newRecordDate.value) {
    alert('날짜를 선택해주세요.');
    return;
  }

  let newRecord = {
    id: Date.now(),
    date: newRecordDate.value,
    type: actionType.value,
  };

  if (actionType.value === 'use') {
    newRecord.useType = useType.value;
    newRecord.deduction = useType.value === 'full' ? 1 : 0.5;
    newRecord.memo = '';
  } else {
    if (settleDays.value <= 0) {
      alert('정산 일수는 0보다 커야 합니다.');
      return;
    }
    newRecord.deduction = settleDays.value;
    newRecord.memo = settleMemo.value;
  }

  selectedEmp.value.history.push(newRecord);

  newRecordDate.value = '';
  settleMemo.value = '';
};

const removeRecord = (historyId) => {
  if(!confirm('해당 내역을 삭제하시겠습니까?')) return;
  selectedEmp.value.history = selectedEmp.value.history.filter(h => h.id !== historyId);
};

onMounted(async () => {
  await fetchSiteOptions()
})
</script>

<template>
  <div class="leave-management-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calendar-clock-outline"></i>
          연차 및 정산 관리
        </h1>
        <p class="page-subtitle">연차 사용 이력을 구조화하고 적립금을 자동 계산합니다.</p>
      </div>
      <div class="header-actions">
        <button class="btn-excel">
          <i class="mdi mdi-file-excel-outline"></i> 엑셀 다운로드
        </button>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label">기준 연도</label>
          <select v-model="selectedYear" class="filter-select">
            <option :value="selectedYear - 1">{{ selectedYear - 1 }}년</option>
            <option :value="selectedYear">{{ selectedYear }}년</option>
            <option :value="selectedYear + 1">{{ selectedYear + 1 }}년</option>
          </select>
        </div>

        <div class="filter-group">
          <label class="filter-label">소속 현장명</label>
          <!--select v-model="selectedSite" class="filter-select">
            <option v-for="site in siteOptions" :key="site" :value="site">{{ site }}</option>
          </select-->
          <SiteSelect v-model="selectedSite" />
        </div>

        <div class="search-group">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input
                type="text"
                v-model="searchTerm"
                placeholder="이름 또는 사번 검색..."
                class="search-input"
            />
          </div>
        </div>
      </div>
    </div>

    <div class="table-card">
      <div class="table-header">
        <div class="table-title">
          <span>직원별 연차 현황 ({{ filteredList.length }}명)</span>
        </div>
      </div>
      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th>소속 현장명</th>
            <th class="text-center">이름</th>
            <th class="text-center">직책</th>
            <th class="text-center">총 연차</th>
            <th class="text-center">사용 연차</th>
            <th class="text-center">정산 연차</th>
            <th class="text-center">잔여 연차</th>
            <th class="text-right">예상 잔여 수당</th>
            <th class="text-center">이력 관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="emp in filteredList" :key="emp.empId">
            <td>{{ emp.siteName }}</td>
            <td class="text-center font-weight-bold">{{ emp.name }}</td>
            <td class="text-center">{{ emp.role }}</td>
            <td class="text-center">{{ emp.totalLeave }}</td>
            <td class="text-center text-primary">{{ emp.usedLeave }}</td>
            <td class="text-center text-warning">{{ emp.settledLeave }}</td>
            <td class="text-center font-weight-bold text-danger">{{ emp.remainingLeave }}</td>
            <td class="text-right font-weight-bold bg-highlight">
              {{ formatCurrency(emp.expectedAllowance) }}
            </td>
            <td class="text-center">
              <button @click="openHistoryModal(emp)" class="btn-detail">내역 관리</button>
            </td>
          </tr>
          <tr v-if="filteredList.length === 0">
            <td colspan="9" class="text-center empty-state">검색된 직원이 없습니다.</td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="isHistoryModalOpen" class="modal-overlay" @mousedown.self="closeHistoryModal">
      <div class="modal-container">
        <div class="modal-header">
          <h3>{{ selectedEmp.name }} 연차/정산 관리</h3>
          <button @click="closeHistoryModal" class="btn-close">&times;</button>
        </div>

        <div class="modal-body">
          <div class="summary-box">
            <div class="summary-item">
              <span class="label">총 발생</span><span class="value">{{ selectedEmp.totalLeave }}</span>
            </div>
            <div class="summary-item">
              <span class="label">사용(휴무)</span><span class="value text-primary">{{ selectedEmp.usedLeave }}</span>
            </div>
            <div class="summary-item">
              <span class="label">중간정산</span><span class="value text-warning">{{ selectedEmp.settledLeave }}</span>
            </div>
            <div class="summary-item">
              <span class="label">잔여</span><span class="value text-danger">{{ selectedEmp.remainingLeave }}</span>
            </div>
          </div>

          <div class="tab-container mt-4">
            <button :class="['tab-btn', { active: actionType === 'use' }]" @click="actionType = 'use'">휴가 사용 등록</button>
            <button :class="['tab-btn', { active: actionType === 'settle' }]" @click="actionType = 'settle'">연차 정산(수당)</button>
          </div>

          <div class="add-record-form mt-2">
            <div v-if="actionType === 'use'" class="form-row">
              <input type="date" v-model="newRecordDate" class="form-input flex-1" />
              <select v-model="useType" class="form-select w-auto">
                <option value="full">종일 (1일)</option>
                <option value="half_am">오전 반차 (0.5일)</option>
                <option value="half_pm">오후 반차 (0.5일)</option>
              </select>
              <button @click="addRecord" class="btn-submit">등록</button>
            </div>

            <div v-if="actionType === 'settle'" class="form-col">
              <div class="form-row">
                <input type="date" v-model="newRecordDate" class="form-input flex-1" />
                <div class="input-with-suffix w-auto">
                  <input type="number" v-model="settleDays" step="0.5" min="0.5" class="form-input num-input" />
                  <span class="suffix">일</span>
                </div>
                <button @click="addRecord" class="btn-submit">정산 처리</button>
              </div>
              <input type="text" v-model="settleMemo" placeholder="정산 사유 (예: 5월 급여 포함 정산)" class="form-input mt-2 w-full" />
            </div>
          </div>

          <div class="history-list-wrap mt-4">
            <h4 class="section-title">처리 이력</h4>
            <div class="history-list">
              <div v-if="selectedEmp.history.length === 0" class="empty-history">이력이 없습니다.</div>
              <div v-for="record in selectedEmp.history" :key="record.id" class="history-item">
                <div class="history-info">
                  <span v-if="record.type === 'settle'" class="badge badge-settle">정산</span>
                  <span v-else :class="['badge', record.useType.includes('half') ? 'badge-half' : 'badge-full']">
                    {{ record.useType === 'full' ? '연차' : '반차' }}
                  </span>
                  <span class="history-date">{{ record.date }}</span>
                  <span v-if="record.memo" class="history-memo">({{ record.memo }})</span>
                </div>
                <div class="history-action">
                  <strong :class="record.type === 'settle' ? 'text-warning' : 'text-primary'">
                    -{{ record.deduction }}일
                  </strong>
                  <button @click="removeRecord(record.id)" class="btn-icon-danger">&times;</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeHistoryModal" class="btn-cancel">닫기</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* =========================================
   테이블 영역
========================================= */
.table-card {
  background: #ffffff;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}
.table-header {
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  background: #ffffff;
}
.table-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}
.table-scroll-container {
  overflow-x: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}
.data-table th, .data-table td {
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: middle;
}
.data-table th {
  background-color: #f8fafc;
  font-weight: 600;
  color: #475569;
  white-space: nowrap;
}
.data-table tbody tr:hover {
  background-color: #f1f5f9;
}
.empty-state {
  padding: 40px;
  color: #94a3b8;
}

/* =========================================
   버튼 및 폼 요소
========================================= */
button {
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
}
.btn-outline {
  padding: 8px 16px;
  border: 1px solid #cbd5e1;
  background: white;
  border-radius: 6px;
  color: #475569;
  font-weight: 600;
}
.btn-outline:hover { background: #f8fafc; }

.btn-detail {
  padding: 6px 12px;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  color: #3b82f6;
  font-size: 13px;
  font-weight: 600;
}
.btn-detail:hover { background: #eff6ff; border-color: #bfdbfe; }

.btn-submit {
  padding: 8px 16px;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  white-space: nowrap;
}
.btn-submit:hover { background: #2563eb; }

.btn-cancel {
  padding: 8px 16px;
  background: white;
  color: #475569;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-weight: 600;
}
.btn-cancel:hover { background: #f1f5f9; }

.btn-icon-danger {
  background: none;
  border: none;
  color: #ef4444;
  font-size: 18px;
  padding: 4px 8px;
  border-radius: 4px;
  line-height: 1;
}
.btn-icon-danger:hover { background: #fee2e2; }

.form-input, .form-select {
  padding: 8px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 14px;
  outline: none;
  color: #334155;
  background: white;
}
.form-input:focus, .form-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}
.input-with-suffix {
  display: flex;
  align-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: white;
  padding-right: 12px;
}
.input-with-suffix:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}
.num-input {
  border: none;
  box-shadow: none !important;
  text-align: right;
  width: 70px;
  padding-right: 4px;
}
.suffix { font-size: 14px; color: #64748b; }

.form-row { display: flex; gap: 8px; align-items: center; }
.form-col { display: flex; flex-direction: column; }

/* =========================================
   모달 (Modal) 디자인
========================================= */
.modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  backdrop-filter: blur(2px);
}
.modal-container {
  background: #ffffff;
  width: 550px;
  max-width: 90vw;
  border-radius: 12px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}
.modal-header h3 { margin: 0; font-size: 18px; color: #0f172a; }
.btn-close {
  background: none; border: none; font-size: 24px;
  color: #94a3b8; line-height: 1; padding: 0;
}
.btn-close:hover { color: #0f172a; }

.modal-body { padding: 20px; }
.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  justify-content: flex-end;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}

/* 모달 내부 UI */
.summary-box {
  display: flex;
  justify-content: space-around;
  background: #f1f5f9;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.summary-item {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
}
.summary-item .label { font-size: 13px; color: #64748b; }
.summary-item .value { font-size: 18px; font-weight: 700; color: #0f172a; }

.tab-container {
  display: flex;
  gap: 16px;
  border-bottom: 2px solid #e2e8f0;
}
.tab-btn {
  background: none; border: none;
  padding: 10px 4px; font-size: 15px; font-weight: 600;
  color: #64748b; border-bottom: 2px solid transparent; margin-bottom: -2px;
}
.tab-btn:hover { color: #334155; }
.tab-btn.active { color: #3b82f6; border-bottom-color: #3b82f6; }

.section-title {
  font-size: 15px; font-weight: 600; color: #0f172a;
  margin: 0 0 12px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;
}

.history-list-wrap { max-height: 250px; overflow-y: auto; padding-right: 4px; }
.history-list { display: flex; flex-direction: column; gap: 8px; }
.history-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px; background: white; border: 1px solid #e2e8f0; border-radius: 6px;
}
.history-info { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.history-date { font-weight: 500; color: #334155; }
.history-memo { color: #94a3b8; font-size: 13px; }
.history-action { display: flex; align-items: center; gap: 12px; }

.badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 600; }
.badge-full { background: #e0e7ff; color: #4338ca; }
.badge-half { background: #f3f4f6; color: #475569; }
.badge-settle { background: #fef3c7; color: #d97706; }

.empty-history { text-align: center; padding: 24px; color: #94a3b8; background: #f8fafc; border-radius: 6px; font-size: 14px; }
</style>
