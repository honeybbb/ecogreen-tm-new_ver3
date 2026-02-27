<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from "axios";
const { siteOptions, fetchSiteOptions } = useApi();

// 1. 상태 관리
const currentDate = ref(new Date());
const schedules = ref([]);     // 달력에 표시할 최종 데이터
const isModalOpen = ref(false);

// 현장 관리 상태
const currentSiteId = ref('');
const staffSearchName = ref('');

// 🆕 API 데이터의 mIdx와 매칭되는 실제 직원 목록
const staffList = ref([
  { id: 20, name: '김철수' },
  { id: 23, name: '이영희' },
  { id: 26, name: '박민준' },
  { id: 0,  name: '미지정' }
]);

// 2. 캘린더 날짜 계산
const selectedYear = computed(() => currentDate.value.getFullYear());
const selectedMonth = computed(() => currentDate.value.getMonth());

// API 호출용 YYYY-MM
const selectedYearMonth = computed(() => {
  return `${selectedYear.value}-${String(selectedMonth.value + 1).padStart(2, '0')}`;
});

const monthTitle = computed(() => `${selectedYear.value}년 ${selectedMonth.value + 1}월`);

// 상단 요약 합계 (이번 달 전체)
const monthSummary = computed(() => {
  const work = schedules.value.filter(s => s.workType === 'work').length;
  const leave = schedules.value.filter(s => s.workType === 'leave').length;
  return { work, leave };
});

const calendarDays = computed(() => {
  const daysInMonth = new Date(selectedYear.value, selectedMonth.value + 1, 0).getDate();
  const firstDayOfWeek = new Date(selectedYear.value, selectedMonth.value, 1).getDay();
  const days = [];

  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push({ date: '', isEmpty: true });
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${selectedYear.value}-${String(selectedMonth.value + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const dailySchedules = schedules.value.filter(s => s.workStartDt === dateStr);

    days.push({
      date: i,
      fullDate: dateStr,
      isEmpty: false,
      schedules: dailySchedules,
      // 날짜별 요약 (출근 인원수 등)
      summary: {
        work: dailySchedules.filter(s => s.workType === 'work').length,
        leave: dailySchedules.filter(s => s.workType === 'leave').length
      }
    });
  }
  return days;
});

const fetchSchedules = async () => {
  if (!currentSiteId.value) return;
  let workSchedules = [];

  try {
    await axios.get(`/api/v1/work/list?month=${selectedYearMonth.value}&sIdx=${currentSiteId.value}`)
        .then(res => {
          const result = res.data.data;
          result.forEach((item) => {
            const pureDate = item.workStartDt.split(' ')[0];
            const staff = staffList.value.find(s => s.idx === item.mIdx); // staffList의 키값 확인 (id 또는 idx)

            workSchedules.push({
              // id: `work-${item.idx}`,
              mIdx: staff.idx,
              workStartDt: pureDate,
              staffName: staff ? staff.name : `직원(${item.idx})`,
              workType: item.workType,
              bigo: ''
            });
          })
        })

    schedules.value = workSchedules;
  } catch (e) {
    console.error("데이터 로딩 실패", e);
  }
}

// 3. 데이터 조회 함수
const fetchSchedules1 = async () => {
  if (!currentSiteId.value) return;

  try {
    const [workRes, leaveRes] = await Promise.all([
      axios.get(`/api/v1/work/list?month=${selectedYearMonth.value}&sIdx=${currentSiteId.value}`),
      axios.get(`/api/v1/work/off?month=${selectedYearMonth.value}&sIdx=${currentSiteId.value}`)
    ]);

    let combinedSchedules = [];

    // 1. 출근 데이터 가공 (기존과 동일)
    if (workRes.data.result && workRes.data.data) {
      workRes.data.data.forEach(item => {
        const pureDate = item.workStartDt.split(' ')[0];
        const staff = staffList.value.find(s => s.idx === item.mIdx); // staffList의 키값 확인 (id 또는 idx)

        combinedSchedules.push({
          id: `work-${item.idx}`,
          mIdx: staff.mIdx,
          date: pureDate,
          staffName: staff ? staff.name : `직원(${item.mIdx})`,
          workType: 'work',
          memo: ''
        });
      });
    }

    // 2. 연차 데이터 가공 (기간제 로직 추가)
    if (leaveRes.data.result && leaveRes.data.data) {
      leaveRes.data.data.forEach(item => {
        const staff = staffList.value.find(s => s.idx === item.mIdx);

        // 시작일과 종료일을 Date 객체로 변환
        let current = new Date(item.startDt);
        const end = new Date(item.endDt);

        // 시작일부터 종료일까지 하루씩 더하며 배열에 추가
        while (current <= end) {
          const dateString = current.toISOString().split('T')[0];

          combinedSchedules.push({
            id: `leave-${item.idx}-${dateString}`, // 날짜별로 유니크한 ID 생성
            date: dateString,
            staffName: staff ? staff.name : `직원(${item.mIdx})`,
            workYype: 'leave',
            memo: item.reason,
            status: item.status // 승인 상태값도 저장 가능
          });

          // 날짜를 하루 더함
          current.setDate(current.getDate() + 1);
        }
      });
    }

    schedules.value = combinedSchedules;

  } catch (e) {
    console.error("데이터 로딩 실패", e);
  }
};

// 4. 이벤트 핸들러
const prevMonth = () => {
  currentDate.value = new Date(selectedYear.value, selectedMonth.value - 1, 1);
};
const nextMonth = () => {
  currentDate.value = new Date(selectedYear.value, selectedMonth.value + 1, 1);
};
const goToday = () => {
  currentDate.value = new Date();
};

// 날짜나 현장이 바뀌면 자동으로 데이터 재호출
watch([currentDate, currentSiteId], (newVal) => {
  if (newVal) {
    isAssignedStaff();
    fetchSchedules();
  }
});

// 5. 모달 관련
const form = ref({
  workStartDt: '',
  mIdx: '',
  sIdx: currentSiteId.value,
  workType: 'work',
  bigo: ''
});

const openModal = (day) => {
  if (day.isEmpty) return;
  if (!currentSiteId.value) {
    alert('상단에서 현장을 먼저 선택해주세요.');
    return;
  }
  form.value = {
    workStartDt: day.fullDate,
    mIdx: '',
    sIdx: currentSiteId.value,
    workType: 'work',
    bigo: ''
  };
  staffSearchName.value = ''; // 이름 입력창 초기화
  form.value.mIdx = '';       // ID 초기화
  isModalOpen.value = true;
};

const onStaffInput = () => {
  const selectedStaff = staffList.value.find(s => s.name === staffSearchName.value);
  if (selectedStaff) {
    form.value.mIdx = selectedStaff.idx;
  } else {
    form.value.mIdx = ''; // 매칭되는 이름이 없으면 비움
  }
};

const saveSchedule = async () => {
  if (!form.value.mIdx) {
    alert('직원을 선택해주세요.');
    return;
  }

  axios.post(`/api/v1/work/start`, form.value)
      .then(response => {
        // console.log(response.data.data, 'form.value', form.value)
      })
  isModalOpen.value = false;
};

const isAssignedStaff = async () => {
  const sIdx = currentSiteId.value;
  const res = await axios.get(`/api/v1/member/staffing/${sIdx}`)
  // console.log(res.data.data)
  staffList.value = res.data.data
}

const getScheduleClass = (type) => {
  switch (type) {
    case 'work': return 'sch-work';
    case 'leave': return 'sch-leave';
    case 'half': return 'sch-half';
    default: return 'sch-etc';
  }
};

onMounted(() => {
  fetchSiteOptions();
  // isAssignedStaff();
  // fetchSchedules();
});
</script>

<template>
  <div class="calendar-page">

    <div class="page-header">
      <div class="header-left">
        <h2 class="title">현장별 출근 현황</h2>
        <select v-model="currentSiteId" class="site-select">
          <option value="" disabled>현장 선택</option>
          <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
            {{ site.name }}
          </option>
        </select>
      </div>

      <div class="controls">
        <button @click="prevMonth" class="btn-nav">◀</button>
        <span class="current-month">{{ monthTitle }}</span>
        <button @click="nextMonth" class="btn-nav">▶</button>
        <button @click="goToday" class="btn-today">오늘</button>
      </div>
    </div>

    <div class="summary-info">
      <div class="summary-item">이번 달 출근: <strong>{{ monthSummary.work }}</strong>건</div>
      <div class="summary-item">이번 달 휴무: <strong>{{ monthSummary.leave }}</strong>건</div>
      <div class="legend">
        <div class="legend-item"><span class="dot work"></span> 출근</div>
        <div class="legend-item"><span class="dot leave"></span> 연차</div>
        <div class="legend-item"><span class="dot holiday"></span> 특근</div>
      </div>
    </div>

    <div class="calendar-grid">
      <div class="day-name sun">일</div>
      <div class="day-name">월</div>
      <div class="day-name">화</div>
      <div class="day-name">수</div>
      <div class="day-name">목</div>
      <div class="day-name">금</div>
      <div class="day-name sat">토</div>

      <div
          v-for="(day, index) in calendarDays"
          :key="index"
          :class="['day-cell', { 'empty': day.isEmpty }]"
          @click="openModal(day)"
      >
        <div v-if="!day.isEmpty">
          <div class="day-header">
            <span class="date-num">{{ day.date }}</span>
            <span v-if="day.summary.work > 0" class="mini-badge work">{{ day.summary.work }}</span>
            <span v-if="day.summary.leave > 0" class="mini-badge leave">{{ day.summary.leave }}</span>
          </div>

          <div class="schedule-list">
            <div
                v-for="sch in day.schedules"
                :key="sch.mIdx"
                :class="['schedule-item', getScheduleClass(sch.workType)]"
            >
              <span class="sch-name">{{ sch.staffName }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isModalOpen" class="modal-overlay" @click.self="isModalOpen = false">
      <div class="modal-content">
        <h3>📝 근무 등록</h3>
        <p class="modal-info">
          현장: <strong>{{ siteOptions.find(s => s.idx === currentSiteId)?.name }}</strong><br>
          일자: {{ form.date }}
        </p>

        <!--div class="input-group">
          <label>직원 선택</label>
          <select class="input-select" v-model="form.mIdx">
            <option value="" disabled>직원을 선택하세요</option>
            <option v-for="staff in staffList" :key="staff.idx" :value="staff.idx">
              {{ staff.name }}
            </option>
          </select>
        </div-->
        <div class="input-group">
          <label>직원 선택 (이름 검색)</label>
          <input
              list="staff-options"
              class="input-select"
              v-model="staffSearchName"
              placeholder="이름을 입력하거나 선택하세요"
              @input="onStaffInput"
          >
          <datalist id="staff-options">
            <option v-for="staff in staffList" :key="staff.idx" :value="staff.name">
              {{ staff.name }}
            </option>
          </datalist>
        </div>

        <div class="input-group">
          <label>근무 형태</label>
          <div class="radio-group">
            <label><input type="radio" v-model="form.workType" value="work"> 출근</label>
            <label><input type="radio" v-model="form.workType" value="leave"> 연차</label>
            <label><input type="radio" v-model="form.workType" value="holiday"> 특근</label>
          </div>
        </div>

        <div class="modal-actions">
          <button @click="isModalOpen = false" class="btn-cancel">취소</button>
          <button @click="saveSchedule" class="btn-save">등록</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 기존 스타일 유지하면서 최소한의 레이아웃 보강 */
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.header-left { display: flex; align-items: center; gap: 20px; }
.title { font-size: 1.5rem; font-weight: 700; color: #1f2937; margin: 0; }
.site-select { padding: 8px 12px; font-size: 1rem; border: 2px solid #3b82f6; border-radius: 6px; background-color: white; font-weight: 600; cursor: pointer; min-width: 200px; }

/* 요약 정보 영역 */
.summary-info { display: flex; align-items: center; gap: 20px; margin-bottom: 15px; padding: 10px; background: #f8fafc; border-radius: 8px; }
.summary-item { font-size: 0.9rem; color: #475569; }
.summary-item strong { color: #1e293b; font-size: 1.1rem; }
.legend { display: flex; gap: 15px; margin-left: auto; font-size: 0.85rem; }
.legend-item { display: flex; align-items: center; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; }
.dot.work { background: #10b981; }
.dot.leave { background: #ef4444; }
.dot.holiday { background: #1d4ed8; }

/* 캘린더 그리드 */
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); border-top: 1px solid #e5e7eb; border-left: 1px solid #e5e7eb; background: white; border-radius: 8px; overflow: hidden; }
.day-name { text-align: center; padding: 12px; font-weight: 600; border-bottom: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; background: #f3f4f6; color: #374151; }
.sun { color: #ef4444; } .sat { color: #3b82f6; }
.day-cell { min-height: 120px; border-bottom: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; padding: 6px; cursor: pointer; position: relative; }
.day-cell:hover:not(.empty) { background-color: #f0f9ff; }
.day-cell.empty { background-color: #fafafa; }

/* 날짜 헤더 및 집계 배지 */
.day-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
.date-num { font-weight: 600; font-size: 0.9rem; color: #374151; }
.mini-badge { font-size: 0.65rem; padding: 1px 5px; border-radius: 10px; color: white; font-weight: bold; }
.mini-badge.work { background: #10b981; }
.mini-badge.leave { background: #ef4444; }

/* 리스트 아이템 */
.schedule-list { display: flex; flex-direction: column; gap: 4px; }
.schedule-item { padding: 3px 6px; border-radius: 4px; font-size: 0.75rem; color: white; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
.sch-work { background-color: #10b981; }
.sch-leave { background-color: #ef4444; }

/* 모달 및 공통 버튼 */
.controls { display: flex; align-items: center; gap: 8px; }
.current-month { font-size: 1.2rem; font-weight: 700; min-width: 110px; text-align: center; }
.btn-nav, .btn-today { padding: 6px 12px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; }
/* --- 모달(다이얼로그) 스타일 개선 --- */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4); /* 조금 더 투명하게 */
  backdrop-filter: blur(2px);    /* 배경 살짝 흐리게 처리 */
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal-content {
  background: #ffffff;
  padding: 30px;
  border-radius: 16px; /* 더 부드러운 곡선 */
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  border: 1px solid #f3f4f6;
}

.modal-content h3 {
  margin-top: 0;
  margin-bottom: 20px;
  font-size: 1.25rem;
  font-weight: 800;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 8px;
}

.modal-info {
  margin-bottom: 24px;
  padding: 14px;
  background: #f9fafb;
  border-radius: 10px;
  font-size: 0.875rem;
  line-height: 1.6;
  color: #4b5563;
  border: 1px solid #f3f4f6;
}

.modal-info strong {
  color: #2563eb; /* 현장명 포인트 컬러 */
}

.input-group {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
}

.input-group label {
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 8px;
  color: #374151;
}

/* 셀렉트 박스 스타일 정밀화 */
.input-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.95rem;
  color: #1f2937;
  background-color: #fff;
  transition: all 0.2s;
  outline: none;
}

.input-select:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* 라디오 그룹 커스텀 스타일 */
.radio-group {
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.radio-group label {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background: #fff;
}

.radio-group input[type="radio"] {
  margin-right: 8px;
  accent-color: #3b82f6; /* 라디오 버튼 색상 변경 */
}

/* 체크된 라디오 버튼의 부모 라벨 강조 (선택사항) */
.radio-group label:has(input:checked) {
  border-color: #3b82f6;
  background-color: #eff6ff;
  color: #2563eb;
}

.modal-actions {
  margin-top: 32px;
  display: flex;
  gap: 12px;
}

.modal-actions button {
  flex: 1; /* 버튼 너비 균등하게 */
  padding: 12px;
  font-size: 0.95rem;
  font-weight: 600;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-cancel {
  background-color: #f3f4f6;
  color: #4b5563;
}

.btn-cancel:hover {
  background-color: #e5e7eb;
}

.btn-save {
  background-color: #2563eb;
  color: #ffffff;
}

.btn-save:hover {
  background-color: #1d4ed8;
  transform: translateY(-1px); /* 살짝 떠오르는 효과 */
}

.btn-save:active {
  transform: translateY(0);
}
</style>
