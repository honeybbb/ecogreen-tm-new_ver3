<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'nuxt/app';
import axios from "axios";

// API Composable 사용 (현장 목록 등)
const { siteOptions, fetchSiteOptions } = useApi();

// === 1. 상태 관리 ===
const currentDate = ref(new Date());
const schedules = ref([]);       // 달력에 표시할 최종 데이터
const isModalOpen = ref(false);      // 수동 등록 모달
const isExcelModalOpen = ref(false); // 엑셀 업로드 모달

// 현장 및 직원 검색 상태
const currentSiteId = ref('');
const staffSearchName = ref('');
const staffList = ref([]);

// 엑셀 업로드 관련 상태
const excelFile = ref(null);
const uploadLoading = ref(false);

// === 2. 캘린더/날짜 계산 ===
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
  const holiday = schedules.value.filter(s => s.workType === 'holiday').length; // 특근 추가
  return { work, leave, holiday };
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
    const dailySchedules = schedules.value.filter(s => s.date === dateStr);

    days.push({
      date: i,
      fullDate: dateStr,
      isEmpty: false,
      schedules: dailySchedules,
      summary: {
        work: dailySchedules.filter(s => s.workType === 'work').length,
        leave: dailySchedules.filter(s => s.workType === 'leave').length,
        holiday: dailySchedules.filter(s => s.workType === 'holiday').length // 특근 요약 추가
      }
    });
  }
  return days;
});

// === 3. 데이터 로칭 및 API 통신 ===

const isAssignedStaff = async () => {
  if (!currentSiteId.value) return;
  const res = await axios.get(`/api/v1/member/staffing/${currentSiteId.value}`);
  staffList.value = res.data.data;
};

const fetchSchedules = async () => {
  if (!currentSiteId.value) return;

  try {
    const [workRes, leaveRes] = await Promise.all([
      axios.get(`/api/v1/work/list?month=${selectedYearMonth.value}&sIdx=${currentSiteId.value}`),
      axios.get(`/api/v1/work/off?month=${selectedYearMonth.value}&sIdx=${currentSiteId.value}`)
    ]);

    let combinedSchedules = [];

    // 1. 출근 및 특근 데이터 처리
    if (workRes.data.data) {
      workRes.data.data.forEach(item => {
        const pureDate = item.workStartDt.split(' ')[0];
        const staff = staffList.value.find(s => s.idx === item.mIdx);
        combinedSchedules.push({
          mIdx: item.mIdx,
          date: pureDate,
          staffName: staff ? staff.name : `직원(${item.mIdx})`,
          workType: item.workType || 'work', // DB의 workType(work/holiday) 반영
        });
      });
    }

    // 2. 연차 데이터 처리
    if (leaveRes.data.data) {
      leaveRes.data.data.forEach(item => {
        const staff = staffList.value.find(s => s.idx === item.mIdx);
        let curr = new Date(item.startDt);
        const end = new Date(item.endDt);

        while (curr <= end) {
          const dateStr = curr.toISOString().split('T')[0];
          combinedSchedules.push({
            date: dateStr,
            staffName: staff ? staff.name : `직원(${item.mIdx})`,
            workType: 'leave',
          });
          curr.setDate(curr.getDate() + 1);
        }
      });
    }
    schedules.value = combinedSchedules;
  } catch (e) {
    console.error("데이터 로딩 실패", e);
  }
};

// === 4. 엑셀 업로드 로직 ===
const handleFileChange = (e) => { excelFile.value = e.target.files[0]; };
const downloadTemplate = () => { window.location.href = '/api/v1/download/attendance_template.xlsx'; };

const uploadExcel = async () => {
  if (!excelFile.value) return alert('파일을 선택해주세요.');
  uploadLoading.value = true;
  const formData = new FormData();
  formData.append('file', excelFile.value);
  formData.append('sIdx', currentSiteId.value);

  try {
    const res = await axios.post('/api/v1/work/upload-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    if (res.data.result) {
      alert('엑셀 업로드가 완료되었습니다.');
      isExcelModalOpen.value = false;
      fetchSchedules();
    }
  } catch (e) {
    alert('업로드 중 오류가 발생했습니다.');
  } finally {
    uploadLoading.value = false;
    excelFile.value = null;
  }
};

// === 5. 이벤트 핸들러 ===
const prevMonth = () => { currentDate.value = new Date(selectedYear.value, selectedMonth.value - 1, 1); };
const nextMonth = () => { currentDate.value = new Date(selectedYear.value, selectedMonth.value + 1, 1); };
const goToday = () => { currentDate.value = new Date(); };

watch([currentDate, currentSiteId], () => {
  if (currentSiteId.value) {
    isAssignedStaff().then(() => fetchSchedules());
  }
});

const form = ref({ workStartDt: '', mIdx: '', sIdx: '', workType: 'work', bigo: '' });

const openModal = (day) => {
  if (day.isEmpty || !currentSiteId.value) return;
  form.value = { workStartDt: day.fullDate, mIdx: '', sIdx: currentSiteId.value, workType: 'work', bigo: '' };
  staffSearchName.value = '';
  isModalOpen.value = true;
};

const onStaffInput = () => {
  const selectedStaff = staffList.value.find(s => s.name === staffSearchName.value);
  if (selectedStaff) form.value.mIdx = selectedStaff.idx;
};

const saveSchedule = async () => {
  if (!form.value.mIdx) return alert('직원을 선택해주세요.');
  await axios.post(`/api/v1/work/start`, form.value);
  fetchSchedules();
  isModalOpen.value = false;
};

const getScheduleClass = (type) => {
  switch(type) {
    case 'work': return 'sch-work';
    case 'leave': return 'sch-leave';
    case 'holiday': return 'sch-holiday';
    default: return 'sch-etc';
  }
};

onMounted(() => { fetchSiteOptions(); });
</script>

<template>
  <div class="calendar-page">
    <div class="page-header">
      <div class="header-left">
        <h2 class="title">현장별 출근 현황</h2>
        <select v-model="currentSiteId" class="site-select">
          <option value="" disabled>현장 선택</option>
          <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
        </select>
      </div>

      <div class="header-right">
        <button v-if="currentSiteId" @click="isExcelModalOpen = true" class="btn-excel">
          <i class="mdi mdi-file-excel"></i> 엑셀 일괄 업로드
        </button>
        <div class="controls">
          <button @click="prevMonth" class="btn-nav">◀</button>
          <span class="current-month">{{ monthTitle }}</span>
          <button @click="nextMonth" class="btn-nav">▶</button>
          <button @click="goToday" class="btn-today">오늘</button>
        </div>
      </div>
    </div>

    <div class="summary-info">
      <div class="summary-item">이번 달 출근: <strong>{{ monthSummary.work }}</strong>건</div>
      <div class="summary-item">이번 달 휴무: <strong>{{ monthSummary.leave }}</strong>건</div>
      <div class="summary-item">이번 달 특근: <strong>{{ monthSummary.holiday }}</strong>건</div>
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

      <div v-for="(day, index) in calendarDays" :key="index" :class="['day-cell', { 'empty': day.isEmpty }]" @click="openModal(day)">
        <div v-if="!day.isEmpty">
          <div class="day-header">
            <span class="date-num">{{ day.date }}</span>
            <div class="badge-group">
              <span v-if="day.summary.work > 0" class="mini-badge work">{{ day.summary.work }}</span>
              <span v-if="day.summary.leave > 0" class="mini-badge leave">{{ day.summary.leave }}</span>
              <span v-if="day.summary.holiday > 0" class="mini-badge holiday">{{ day.summary.holiday }}</span>
            </div>
          </div>
          <div class="schedule-list">
            <div v-for="(sch, sIdx) in day.schedules" :key="sIdx" :class="['schedule-item', getScheduleClass(sch.workType)]">
              {{ sch.staffName }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isModalOpen" class="modal-overlay" @click.self="isModalOpen = false">
      <div class="modal-content">
        <h3>📝 근무 등록</h3>
        <p class="modal-info">현장: <strong>{{ siteOptions.find(s => s.idx === currentSiteId)?.name }}</strong><br>일자: {{ form.workStartDt }}</p>
        <div class="input-group">
          <label>직원 이름 검색</label>
          <input list="staff-opts" class="input-select" v-model="staffSearchName" @input="onStaffInput" placeholder="이름을 입력하세요">
          <datalist id="staff-opts">
            <option v-for="staff in staffList" :key="staff.idx" :value="staff.name" />
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

    <div v-if="isExcelModalOpen" class="modal-overlay" @click.self="isExcelModalOpen = false">
      <div class="modal-content excel-modal">
        <h3>📊 엑셀 일괄 등록</h3>
        <div class="modal-info">양식을 다운로드하여 작성 후 업로드해주세요.</div>
        <button @click="downloadTemplate" class="btn-download">📥 양식 다운로드 (.xlsx)</button>
        <div class="input-group mt-4">
          <label>파일 선택</label>
          <input type="file" @change="handleFileChange" accept=".xlsx, .xls" class="file-input">
        </div>
        <div class="modal-actions">
          <button @click="isExcelModalOpen = false" class="btn-cancel">닫기</button>
          <button @click="uploadExcel" class="btn-save" :disabled="uploadLoading">{{ uploadLoading ? '처리중...' : '업로드 시작' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
.header-left { display: flex; align-items: center; gap: 15px; }
.header-right { display: flex; align-items: center; gap: 20px; }
.title { font-size: 1.4rem; font-weight: 700; margin: 0; }
.site-select { padding: 8px; border-radius: 6px; border: 1px solid #3b82f6; font-weight: 600; }

.btn-excel { background-color: #16a34a; color: white; border: none; padding: 10px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; }
.btn-nav, .btn-today { padding: 6px 12px; border: 1px solid #d1d5db; background: white; border-radius: 4px; cursor: pointer; }
.btn-today { color: #3b82f6; border-color: #3b82f6; margin-left: 5px; }
.current-month { font-size: 1.2rem; font-weight: 700; min-width: 120px; text-align: center; }

.summary-info { display: flex; gap: 20px; margin-bottom: 15px; font-size: 0.9rem; align-items: center; }
.legend { margin-left: auto; display: flex; gap: 15px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; }
.dot.work { background: #10b981; }
.dot.leave { background: #ef4444; }
.dot.holiday { background: #1d4ed8; }

.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); background: white; border-top: 1px solid #e5e7eb; border-left: 1px solid #e5e7eb; border-radius: 8px; }
.day-name { padding: 12px; text-align: center; font-weight: 600; background: #f9fafb; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; }
.sun { color: #ef4444; } .sat { color: #3b82f6; }
.day-cell { min-height: 110px; padding: 8px; border-right: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb; cursor: pointer; }
.day-cell.empty { background: #fcfcfc; cursor: default; }

.day-header { display: flex; justify-content: space-between; align-items: flex-start; }
.badge-group { display: flex; gap: 2px; }
.mini-badge { font-size: 0.65rem; color: white; padding: 1px 4px; border-radius: 4px; font-weight: bold; }
.mini-badge.work { background: #10b981; }
.mini-badge.leave { background: #ef4444; }
.mini-badge.holiday { background: #1d4ed8; }

.schedule-item { padding: 2px 6px; border-radius: 4px; font-size: 0.75rem; margin-top: 2px; color: white; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sch-work { background: #10b981; }
.sch-leave { background: #ef4444; }
.sch-holiday { background: #1d4ed8; }

/* 모달 */
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 2000; }
.modal-content { background: white; padding: 25px; border-radius: 12px; width: 400px; }
.input-select, .file-input { width: 100%; padding: 10px; border: 1px solid #d1d5db; border-radius: 6px; margin-top: 5px; }
.radio-group { display: flex; gap: 15px; margin-top: 10px; }
.modal-actions { display: flex; gap: 10px; margin-top: 20px; }
.modal-actions button { flex: 1; padding: 12px; border-radius: 6px; cursor: pointer; border: none; font-weight: 600; }
.btn-cancel { background: #e5e7eb; }
.btn-save { background: #2563eb; color: white; }
.btn-download { width: 100%; padding: 12px; border: 1px dashed #3b82f6; background: #eff6ff; color: #1d4ed8; font-weight: 600; border-radius: 6px; cursor: pointer; }
.mt-4 { margin-top: 16px; }
</style>
