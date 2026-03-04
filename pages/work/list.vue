<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from "axios";

// API Composable (현장 목록 등)
const { siteOptions, fetchSiteOptions } = useApi();

// === 1. 상태 관리 ===
const currentDate = ref(new Date());
const schedules = ref([]);
const isLoading = ref(false);

// 모달 상태
const isModalOpen = ref(false);
const isExcelModalOpen = ref(false);

// 검색 및 입력 상태
const currentSiteId = ref('');
const staffSearchName = ref('');
const staffList = ref([]);
const form = ref({ workStartDt: '', mIdx: '', sIdx: '', workType: 'work', bigo: '' });

// 엑셀 업로드 상태
const excelFile = ref(null);
const fileInput = ref(null);
const uploadLoading = ref(false);

// === 2. 캘린더/날짜 계산 ===
const selectedYear = computed(() => currentDate.value.getFullYear());
const selectedMonth = computed(() => currentDate.value.getMonth());

const selectedYearMonth = computed(() => {
  return `${selectedYear.value}-${String(selectedMonth.value + 1).padStart(2, '0')}`;
});
const monthTitle = computed(() => `${selectedYear.value}년 ${selectedMonth.value + 1}월`);

// 상단 통계 요약 (UI 매핑: annual -> leave)
const monthSummary = computed(() => {
  const work = schedules.value.filter(s => s.workType === 'work').length;
  const leave = schedules.value.filter(s => s.workType === 'leave' || s.workType === 'annual').length;
  const holiday = schedules.value.filter(s => s.workType === 'holiday').length;
  return { work, leave, holiday };
});

const calendarDays = computed(() => {
  const daysInMonth = new Date(selectedYear.value, selectedMonth.value + 1, 0).getDate();
  const firstDayOfWeek = new Date(selectedYear.value, selectedMonth.value, 1).getDay();
  const days = [];

  // 빈 날짜 (이전 달)
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push({ date: '', isEmpty: true });
  }

  // 실제 날짜
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
        leave: dailySchedules.filter(s => s.workType === 'leave' || s.workType === 'annual').length,
        holiday: dailySchedules.filter(s => s.workType === 'holiday').length
      }
    });
  }
  return days;
});

// === 3. 데이터 로딩 ===
const isAssignedStaff = async () => {
  if (!currentSiteId.value) return;
  try {
    const res = await axios.get(`/api/v1/member/staffing/${currentSiteId.value}`);
    staffList.value = res.data.data || [];
  } catch (e) {
    console.error('직원 목록 로드 실패', e);
  }
};

const fetchSchedules = async () => {
  if (!currentSiteId.value) return;
  isLoading.value = true;
  try {
    const [workRes, leaveRes] = await Promise.all([
      axios.get(`/api/v1/work/list?month=${selectedYearMonth.value}&sIdx=${currentSiteId.value}`),
      axios.get(`/api/v1/work/off?month=${selectedYearMonth.value}&sIdx=${currentSiteId.value}`)
    ]);

    let combinedSchedules = [];

    // 출근/특근 데이터
    if (workRes.data.data) {
      workRes.data.data.forEach(item => {
        const pureDate = item.workStartDt.split(' ')[0];
        const staff = staffList.value.find(s => s.idx === item.mIdx);
        combinedSchedules.push({
          mIdx: item.mIdx,
          date: pureDate,
          staffName: staff ? staff.name : `직원(${item.mIdx})`,
          workType: item.workType || 'work', // work, holiday
        });
      });
    }

    // 연차 데이터 (기간을 풀어서 매핑)
    if (leaveRes.data.data) {
      leaveRes.data.data.forEach(item => {
        const staff = staffList.value.find(s => s.idx === item.mIdx);
        let curr = new Date(item.startDt);
        const end = new Date(item.endDt);
        while (curr <= end) {
          combinedSchedules.push({
            date: curr.toISOString().split('T')[0],
            staffName: staff ? staff.name : `직원(${item.mIdx})`,
            workType: 'leave'
          });
          curr.setDate(curr.getDate() + 1);
        }
      });
    }
    schedules.value = combinedSchedules;
  } catch (e) {
    console.error('스케줄 로드 실패', e);
  } finally {
    isLoading.value = false;
  }
};

// === 4. 네비게이션 핸들러 ===
const prevMonth = () => { currentDate.value = new Date(selectedYear.value, selectedMonth.value - 1, 1); };
const nextMonth = () => { currentDate.value = new Date(selectedYear.value, selectedMonth.value + 1, 1); };
const goToday = () => { currentDate.value = new Date(); };

watch([currentDate, currentSiteId], () => {
  if (currentSiteId.value) {
    isAssignedStaff().then(() => fetchSchedules());
  }
});

// === 5. 수동 등록 핸들러 ===
const openModal = (day) => {
  if (day.isEmpty || !currentSiteId.value) {
    if (!currentSiteId.value) alert('현장을 먼저 선택해주세요.');
    return;
  }
  form.value = { workStartDt: day.fullDate, mIdx: '', sIdx: currentSiteId.value, workType: 'work', bigo: '' };
  staffSearchName.value = '';
  isModalOpen.value = true;
};

const saveSchedule = async () => {
  const selectedStaff = staffList.value.find(s => s.name === staffSearchName.value);
  if (!selectedStaff) return alert('정확한 직원 이름을 선택해주세요.');

  try {
    form.value.mIdx = selectedStaff.idx;
    await axios.post(`/api/v1/work/start`, form.value);
    await fetchSchedules();
    isModalOpen.value = false;
  } catch (e) {
    alert('등록 중 오류가 발생했습니다.');
  }
};

// === 6. 엑셀 업로드 핸들러 ===
const triggerFileInput = () => { fileInput.value.click(); };

const handleFileChange = (e) => {
  const file = e.target.files[0];
  if (file) excelFile.value = file;
};

const submitExcelUpload = async () => {
  if (!excelFile.value) return alert('엑셀 파일을 선택해주세요.');

  uploadLoading.value = true;
  const formData = new FormData();
  formData.append('sIdx', currentSiteId.value);
  formData.append('file', excelFile.value);

  try {
    const res = await axios.post('/api/v1/upload/work', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    if (res.data.result) {
      alert(res.data.message || '엑셀 업로드가 완료되었습니다.');
      isExcelModalOpen.value = false;
      excelFile.value = null;
      await fetchSchedules();
    } else {
      alert(res.data.message || '업로드에 실패했습니다.');
    }
  } catch (error) {
    console.error('엑셀 업로드 에러:', error);
    alert(error.response?.data?.message || '업로드 처리 중 서버 에러가 발생했습니다.');
  } finally {
    uploadLoading.value = false;
    if (fileInput.value) fileInput.value.value = ''; // input 초기화
  }
};

onMounted(() => {
  fetchSiteOptions();
});
</script>

<template>
  <div class="attendance-calendar-container">

    <header class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-calendar-check"></i> 출근 현황 관리</h1>
        <div class="site-selector-wrapper">
          <i class="mdi mdi-office-building-marker"></i>
          <select v-model="currentSiteId" class="site-select">
            <option value="" disabled>관리할 현장을 선택하세요</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select>
        </div>
      </div>

      <div class="header-right">
        <button v-if="currentSiteId" @click="isExcelModalOpen = true" class="btn-excel">
          <i class="mdi mdi-file-excel"></i> 엑셀 일괄 업로드
        </button>
        <div class="nav-controls">
          <button @click="prevMonth" class="btn-nav"><i class="mdi mdi-chevron-left"></i></button>
          <span class="current-month-label">{{ monthTitle }}</span>
          <button @click="nextMonth" class="btn-nav"><i class="mdi mdi-chevron-right"></i></button>
          <button @click="goToday" class="btn-today">오늘</button>
        </div>
      </div>
    </header>

    <div class="stats-summary">
      <div class="stat-card work">
        <div class="stat-icon"><i class="mdi mdi-account-check-outline"></i></div>
        <div class="stat-info">
          <span class="label">이번 달 출근</span>
          <span class="value">{{ monthSummary.work }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card holiday">
        <div class="stat-icon"><i class="mdi mdi-star-circle-outline"></i></div>
        <div class="stat-info">
          <span class="label">이번 달 특근</span>
          <span class="value">{{ monthSummary.holiday }}<small>건</small></span>
        </div>
      </div>
      <div class="stat-card leave">
        <div class="stat-icon"><i class="mdi mdi-account-off-outline"></i></div>
        <div class="stat-info">
          <span class="label">이번 달 휴무/연차</span>
          <span class="value">{{ monthSummary.leave }}<small>건</small></span>
        </div>
      </div>
    </div>

    <div class="calendar-card">
      <div v-if="isLoading" class="loader-overlay">
        <div class="spinner"></div>
      </div>

      <div class="calendar-grid-header">
        <div class="day-name sun">일</div>
        <div class="day-name">월</div>
        <div class="day-name">화</div>
        <div class="day-name">수</div>
        <div class="day-name">목</div>
        <div class="day-name">금</div>
        <div class="day-name sat">토</div>
      </div>

      <div class="calendar-grid-body">
        <div
            v-for="(day, index) in calendarDays"
            :key="index"
            :class="['day-cell', { 'empty': day.isEmpty, 'today': day.fullDate === new Date().toISOString().split('T')[0] }]"
            @click="openModal(day)"
        >
          <div v-if="!day.isEmpty" class="cell-content">
            <div class="day-header">
              <span class="date-num">{{ day.date }}</span>
              <div class="mini-stats">
                <span v-if="day.summary.work" class="dot work"></span>
                <span v-if="day.summary.holiday" class="dot holiday"></span>
                <span v-if="day.summary.leave" class="dot leave"></span>
              </div>
            </div>

            <div class="schedule-container custom-scrollbar">
              <div v-for="(sch, sIdx) in day.schedules" :key="sIdx" :class="['sch-item', sch.workType === 'annual' ? 'leave' : sch.workType]">
                <span class="sch-name">{{ sch.staffName }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="isModalOpen" class="modal-overlay" @click.self="isModalOpen = false">
      <div class="modal-card">
        <div class="modal-header">
          <h3>📅 근태 수동 등록</h3>
          <i class="mdi mdi-close close-icon" @click="isModalOpen = false"></i>
        </div>
        <div class="modal-body">
          <div class="info-box">
            <span><strong>선택 날짜 :</strong> {{ form.workStartDt }}</span>
          </div>

          <div class="form-group">
            <label>직원 검색</label>
            <div class="search-input-wrapper">
              <i class="mdi mdi-magnify"></i>
              <input list="staff-opts" v-model="staffSearchName" placeholder="직원 이름 입력">
              <datalist id="staff-opts">
                <option v-for="staff in staffList" :key="staff.idx" :value="staff.name" />
              </datalist>
            </div>
          </div>

          <div class="form-group">
            <label>근태 유형</label>
            <div class="type-selector">
              <label class="type-option">
                <input type="radio" v-model="form.workType" value="work">
                <div class="option-card"><i class="mdi mdi-check-circle"></i>출근</div>
              </label>
              <label class="type-option">
                <input type="radio" v-model="form.workType" value="holiday">
                <div class="option-card holiday"><i class="mdi mdi-star"></i>특근</div>
              </label>
              <label class="type-option">
                <input type="radio" v-model="form.workType" value="leave">
                <div class="option-card leave"><i class="mdi mdi-account-off"></i>연차</div>
              </label>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="isModalOpen = false">취소</button>
          <button class="btn-submit" @click="saveSchedule">등록하기</button>
        </div>
      </div>
    </div>

    <div v-if="isExcelModalOpen" class="modal-overlay" @click.self="isExcelModalOpen = false">
      <div class="modal-card excel-modal">
        <div class="modal-header">
          <h3><i class="mdi mdi-file-excel text-green"></i> 엑셀 일괄 업로드</h3>
          <i class="mdi mdi-close close-icon" @click="isExcelModalOpen = false"></i>
        </div>
        <div class="modal-body">
          <div class="info-box warning">
            <i class="mdi mdi-alert-circle"></i>
            <span>선택된 현장(<strong>{{ siteOptions.find(s => s.idx === currentSiteId)?.name }}</strong>)에 데이터가 일괄 등록됩니다. 양식에 맞춘 엑셀 파일만 업로드해주세요.</span>
          </div>

          <div class="file-upload-area" @click="triggerFileInput">
            <input type="file" ref="fileInput" @change="handleFileChange" accept=".xlsx, .xls" class="hidden-input" />
            <i class="mdi mdi-cloud-upload-outline upload-icon"></i>
            <p v-if="!excelFile">클릭하여 엑셀 파일을 선택해주세요</p>
            <p v-else class="file-name"><i class="mdi mdi-file-check"></i> {{ excelFile.name }}</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="isExcelModalOpen = false" :disabled="uploadLoading">취소</button>
          <button class="btn-submit green" @click="submitExcelUpload" :disabled="uploadLoading || !excelFile">
            <i v-if="uploadLoading" class="mdi mdi-loading mdi-spin"></i>
            <span v-else>업로드 실행</span>
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* =========================================
   최신 ERP 스타일 UI / UX
========================================= */
.attendance-calendar-container { padding: 24px; background: #f4f7fa; min-height: 100vh; font-family: 'Pretendard', sans-serif; }

/* 1. 헤더 */
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.header-left { display: flex; align-items: center; gap: 24px; }
.page-title { font-size: 24px; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 10px; margin: 0; }
.page-title i { color: #3b82f6; }

.site-selector-wrapper { display: flex; align-items: center; gap: 10px; background: #fff; padding: 10px 16px; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
.site-selector-wrapper i { color: #64748b; font-size: 20px; }
.site-select { border: none; font-size: 15px; font-weight: 700; color: #334155; outline: none; background: transparent; cursor: pointer; }

.header-right { display: flex; align-items: center; gap: 16px; }
.btn-excel { background: #10b981; color: white; border: none; padding: 10px 18px; border-radius: 10px; font-size: 14px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 8px; transition: 0.2s; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2); }
.btn-excel:hover { transform: translateY(-2px); background: #059669; }

.nav-controls { display: flex; align-items: center; gap: 12px; background: #fff; padding: 6px 12px; border-radius: 12px; border: 1px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02); }
.btn-nav { width: 32px; height: 32px; border-radius: 8px; border: none; background: #f1f5f9; color: #475569; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; }
.btn-nav:hover { background: #e2e8f0; }
.current-month-label { font-size: 16px; font-weight: 800; color: #1e293b; min-width: 100px; text-align: center; }
.btn-today { padding: 6px 14px; background: #f1f5f9; color: #475569; border: none; border-radius: 8px; font-weight: 700; cursor: pointer; transition: 0.2s; }
.btn-today:hover { background: #e2e8f0; }

/* 2. 대시보드 통계 */
.stats-summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 24px; }
.stat-card { background: #fff; border-radius: 16px; padding: 20px; display: flex; align-items: center; gap: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); border-left: 5px solid; }
.stat-card.work { border-color: #3b82f6; }
.stat-card.holiday { border-color: #f59e0b; }
.stat-card.leave { border-color: #ef4444; }

.stat-icon { width: 50px; height: 50px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 26px; }
.work .stat-icon { background: #eff6ff; color: #3b82f6; }
.holiday .stat-icon { background: #fffbeb; color: #f59e0b; }
.leave .stat-icon { background: #fef2f2; color: #ef4444; }

.stat-info { display: flex; flex-direction: column; }
.stat-info .label { font-size: 13px; font-weight: 600; color: #64748b; }
.stat-info .value { font-size: 24px; font-weight: 800; color: #1e293b; }
.stat-info small { font-size: 14px; color: #94a3b8; margin-left: 4px; }

/* 3. 캘린더 그리드 */
.calendar-card { background: #fff; border-radius: 16px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); overflow: hidden; position: relative; border: 1px solid #e2e8f0; }
.calendar-grid-header { display: grid; grid-template-columns: repeat(7, 1fr); background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
.day-name { padding: 14px 0; text-align: center; font-size: 13px; font-weight: 700; color: #475569; }
.day-name.sun { color: #ef4444; }
.day-name.sat { color: #3b82f6; }

.calendar-grid-body { display: grid; grid-template-columns: repeat(7, 1fr); background: #e2e8f0; gap: 1px; border-top: 1px solid #e2e8f0; }
.day-cell { background: #fff; min-height: 130px; cursor: pointer; transition: 0.2s; }
.day-cell:hover { background: #f8fafc; }
.day-cell.empty { background: #f8fafc; cursor: default; }
.day-cell.today { background: #f0fdf4; }

.cell-content { padding: 10px; height: 100%; display: flex; flex-direction: column; gap: 8px; }
.day-header { display: flex; justify-content: space-between; align-items: center; }
.date-num { font-size: 15px; font-weight: 700; color: #334155; }
.today .date-num { background: #10b981; color: white; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; border-radius: 50%; }

.mini-stats { display: flex; gap: 4px; }
.dot { width: 6px; height: 6px; border-radius: 50%; }
.dot.work { background: #3b82f6; }
.dot.holiday { background: #f59e0b; }
.dot.leave { background: #ef4444; }

.schedule-container { max-height: 80px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; padding-right: 2px; }
.sch-item { font-size: 11px; font-weight: 600; padding: 4px 6px; border-radius: 4px; color: #1e293b; border-left: 3px solid transparent; background: #f1f5f9; }
.sch-item.work { border-color: #3b82f6; }
.sch-item.holiday { border-color: #f59e0b; background: #fffbeb; }
.sch-item.leave { border-color: #ef4444; background: #fef2f2; color: #991b1b; text-decoration: line-through; }

/* 4. 모달 디자인 공통 */
.modal-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; }
.modal-card { background: #fff; width: 420px; border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; }
.modal-header { padding: 20px 24px; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center; }
.modal-header h3 { font-size: 18px; font-weight: 800; margin: 0; color: #1e293b; }
.close-icon { font-size: 24px; color: #94a3b8; cursor: pointer; transition: 0.2s; }
.close-icon:hover { color: #ef4444; transform: rotate(90deg); }

.modal-body { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
.info-box { background: #f8fafc; padding: 12px 16px; border-radius: 10px; font-size: 14px; color: #475569; }
.info-box.warning { background: #fffbeb; color: #b45309; display: flex; gap: 10px; align-items: flex-start; }
.info-box.warning i { font-size: 20px; color: #f59e0b; }

.form-group label { font-size: 13px; font-weight: 700; color: #475569; margin-bottom: 8px; display: block; }
.search-input-wrapper { display: flex; align-items: center; gap: 10px; border: 1px solid #cbd5e1; padding: 12px 16px; border-radius: 10px; transition: 0.2s; }
.search-input-wrapper:focus-within { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
.search-input-wrapper input { border: none; outline: none; width: 100%; font-size: 14px; color: #1e293b; }

.type-selector { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.type-option input { display: none; }
.option-card { padding: 12px 0; border: 2px solid #e2e8f0; border-radius: 10px; text-align: center; font-size: 13px; font-weight: 700; color: #64748b; cursor: pointer; transition: 0.2s; display: flex; flex-direction: column; gap: 6px; }
.option-card i { font-size: 20px; }
.type-option input:checked + .option-card { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }
.type-option input:checked + .option-card.holiday { border-color: #f59e0b; color: #f59e0b; background: #fffbeb; }
.type-option input:checked + .option-card.leave { border-color: #ef4444; color: #ef4444; background: #fef2f2; }

/* 5. 엑셀 전용 디자인 */
.file-upload-area { border: 2px dashed #cbd5e1; border-radius: 12px; padding: 40px 20px; text-align: center; cursor: pointer; transition: 0.2s; background: #f8fafc; }
.file-upload-area:hover { border-color: #10b981; background: #f0fdf4; }
.hidden-input { display: none; }
.upload-icon { font-size: 48px; color: #94a3b8; margin-bottom: 10px; display: block; }
.file-upload-area:hover .upload-icon { color: #10b981; }
.file-upload-area p { font-size: 14px; color: #64748b; margin: 0; font-weight: 600; }
.file-name { color: #10b981 !important; font-weight: 800 !important; }
.text-green { color: #10b981; }

/* 푸터 및 공통 버튼 */
.modal-footer { padding: 20px 24px; border-top: 1px solid #f1f5f9; display: flex; gap: 12px; background: #f8fafc; }
.modal-footer button { flex: 1; padding: 12px; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; border: none; transition: 0.2s; }
.btn-cancel { background: #fff; border: 1px solid #cbd5e1 !important; color: #64748b; }
.btn-cancel:hover { background: #f1f5f9; }
.btn-submit { background: #3b82f6; color: white; }
.btn-submit:hover { background: #2563eb; }
.btn-submit.green { background: #10b981; }
.btn-submit.green:hover { background: #059669; }
.btn-submit:disabled { opacity: 0.7; cursor: not-allowed; }

/* 로더/스크롤바 유틸 */
.loader-overlay { position: absolute; inset: 0; background: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center; z-index: 10; backdrop-filter: blur(2px); }
.spinner { width: 40px; height: 40px; border: 4px solid #f1f5f9; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { 100% { transform: rotate(360deg); } }
.custom-scrollbar::-webkit-scrollbar { width: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
</style>
