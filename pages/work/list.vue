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
const isDailyModalOpen = ref(false);
const isModalOpen = ref(false);
const isExcelModalOpen = ref(false);

// 검색 및 입력 상태
const currentSiteId = ref('');
const staffSearchName = ref('');
const staffList = ref([]);
const form = ref({ workStartDt: '', mIdx: '', sIdx: '', workType: 'work', bigo: '' });
const selectedDay = ref(null);

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

const monthSummary = computed(() => {
  const work = schedules.value.filter(s => s.workType === 'work').length;
  const leave = schedules.value.filter(s => s.workType === 'leave' || s.workType === 'annual').length;
  const holiday = schedules.value.filter(s => s.workType === 'holiday').length;
  const absent = schedules.value.filter(s => s.workType === 'absent').length;
  return { work, leave, holiday, absent };
});

const calendarDays = computed(() => {
  const daysInMonth = new Date(selectedYear.value, selectedMonth.value + 1, 0).getDate();
  const firstDayOfWeek = new Date(selectedYear.value, selectedMonth.value, 1).getDay();
  const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
  const days = [];

  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push({ date: '', isEmpty: true });
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const dateStr = `${selectedYear.value}-${String(selectedMonth.value + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const dailySchedules = schedules.value.filter(s => s.date === dateStr);
    const dayOfWeek = new Date(selectedYear.value, selectedMonth.value, i).getDay();

    days.push({
      date: i,
      dayName: dayNames[dayOfWeek],
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      fullDate: dateStr,
      isEmpty: false,
      schedules: dailySchedules,
      summary: {
        work: dailySchedules.filter(s => s.workType === 'work').length,
        leave: dailySchedules.filter(s => s.workType === 'leave' || s.workType === 'annual').length,
        holiday: dailySchedules.filter(s => s.workType === 'holiday').length,
        absent: dailySchedules.filter(s => s.workType === 'absent').length
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

    if (workRes.data.data) {
      workRes.data.data.forEach(item => {
        const pureDate = item.workStartDt.split(' ')[0];
        const staff = staffList.value.find(s => s.idx === item.mIdx);
        combinedSchedules.push({
          mIdx: item.mIdx,
          date: pureDate,
          staffName: staff ? staff.name : `직원(${item.mIdx})`,
          workType: item.workType || 'work',
        });
      });
    }

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

    if (isDailyModalOpen.value && selectedDay.value) {
      const updatedDay = calendarDays.value.find(d => d.fullDate === selectedDay.value.fullDate);
      if (updatedDay) selectedDay.value = updatedDay;
    }
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

// === 5. 모달 및 수동 등록 핸들러 ===
const handleDayClick = (day) => {
  if (day.isEmpty || !currentSiteId.value) {
    if (!currentSiteId.value) alert('현장을 먼저 선택해주세요.');
    return;
  }
  selectedDay.value = day;
  isDailyModalOpen.value = true;
};

const openRegisterModal = () => {
  form.value = { workStartDt: selectedDay.value.fullDate, mIdx: '', sIdx: currentSiteId.value, workType: 'work', bigo: '' };
  staffSearchName.value = '';
  isDailyModalOpen.value = false;
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
    isDailyModalOpen.value = true;
  } catch (e) {
    alert('등록 중 오류가 발생했습니다.');
  }
};

const getWorkTypeName = (type) => {
  switch(type) {
    case 'work': return '출근';
    case 'holiday': return '특근';
    case 'leave':
    case 'annual': return '연차';
    case 'absent': return '결근';
    default: return '알수없음';
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
    const res = await axios.post('/api/v1/upload/work', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
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
    if (fileInput.value) fileInput.value.value = '';
  }
};

onMounted(() => {
  fetchSiteOptions();
});
</script>

<template>
  <div class="attendance-calendar-container">

    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-calendar-check-outline"></i> 직원 출근 관리</h1>
        <p class="page-subtitle">직원들의 출퇴근 및 휴무 현황을 관리합니다</p>
      </div>

      <div class="header-actions">
        <div class="nav-controls">
          <button @click="prevMonth" class="btn-nav"><i class="mdi mdi-chevron-left"></i></button>
          <span class="current-month-label">{{ monthTitle }}</span>
          <button @click="nextMonth" class="btn-nav"><i class="mdi mdi-chevron-right"></i></button>
          <button @click="goToday" class="btn-today">오늘</button>
        </div>
      </div>
    </div>

    <div class="filter-panel">
      <div class="filter-row">
        <div class="filter-group">
          <label class="filter-label"><i class="mdi mdi-office-building-outline"></i> 현장 선택</label>
          <select v-model="currentSiteId" class="filter-select">
            <option value="" disabled>관리할 현장을 선택하세요</option>
            <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">{{ site.name }}</option>
          </select>
        </div>

        <div class="search-group" style="justify-content: flex-end;">
          <button v-if="currentSiteId" @click="isExcelModalOpen = true" class="btn-excel">
            <i class="mdi mdi-file-excel-outline"></i> <span>엑셀 일괄 업로드</span>
          </button>
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" style="--card-color: #4f46e5; --card-bg: #eef2ff;">
        <div class="stat-icon"><i class="mdi mdi-account-check-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">이번 달 출근</span>
          <span class="stat-value">{{ monthSummary.work }} <small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #f59e0b; --card-bg: #fffbeb;">
        <div class="stat-icon"><i class="mdi mdi-star-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">이번 달 특근</span>
          <span class="stat-value">{{ monthSummary.holiday }} <small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #ef4444; --card-bg: #fef2f2;">
        <div class="stat-icon"><i class="mdi mdi-beach"></i></div>
        <div class="stat-content">
          <span class="stat-label">이번 달 휴무/연차</span>
          <span class="stat-value">{{ monthSummary.leave }} <small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: #64748b; --card-bg: #f1f5f9;">
        <div class="stat-icon"><i class="mdi mdi-account-remove-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">이번 달 결근</span>
          <span class="stat-value">{{ monthSummary.absent }} <small>건</small></span>
        </div>
      </div>
    </div>

    <div class="calendar-card">
      <div v-if="isLoading" class="loader-overlay">
        <div class="spinner"></div>
      </div>

      <div class="calendar-grid-header">
        <div class="day-name sun">일</div><div class="day-name">월</div><div class="day-name">화</div><div class="day-name">수</div><div class="day-name">목</div><div class="day-name">금</div><div class="day-name sat">토</div>
      </div>

      <div class="calendar-grid-body">
        <div
            v-for="(day, index) in calendarDays"
            :key="index"
            :class="['day-cell', { 'empty': day.isEmpty, 'today': day.fullDate === new Date().toISOString().split('T')[0] }]"
            @click="handleDayClick(day)"
        >
          <div v-if="!day.isEmpty" class="cell-content">

            <div class="day-header">
              <div class="date-group">
                <span class="date-num" :class="{ 'text-red': day.dayName === '일', 'text-blue': day.dayName === '토' }">{{ day.date }}</span>
                <span class="mobile-day-name" :class="{ 'text-red': day.dayName === '일', 'text-blue': day.dayName === '토' }">{{ day.dayName }}</span>
              </div>
              <i class="mdi mdi-arrow-top-right detail-icon" title="상세보기"></i>
            </div>

            <div class="summary-container custom-scrollbar">
              <template v-if="day.schedules.length > 0">
                <div v-if="day.summary.work > 0" class="summary-badge work">
                  출근 <strong>{{ day.summary.work }}</strong>
                </div>
                <div v-if="day.summary.holiday > 0" class="summary-badge holiday">
                  특근 <strong>{{ day.summary.holiday }}</strong>
                </div>
                <div v-if="day.summary.leave > 0" class="summary-badge leave">
                  연차 <strong>{{ day.summary.leave }}</strong>
                </div>
                <div v-if="day.summary.absent > 0" class="summary-badge absent">
                  결근 <strong>{{ day.summary.absent }}</strong>
                </div>
              </template>
              <div v-else class="empty-cell-hint">
                <i class="mdi mdi-plus"></i>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>

    <transition name="fade">
      <div v-if="isDailyModalOpen" class="modal-overlay" @click.self="isDailyModalOpen = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">
              <i class="mdi mdi-clipboard-text-outline text-blue"></i>
              {{ selectedDay?.fullDate }} 근무 현황
            </h3>
            <button class="modal-close" @click="isDailyModalOpen = false"><i class="mdi mdi-close"></i></button>
          </div>
          <div class="modal-body list-body">
            <div class="daily-action-bar">
              <p class="summary-text">총 <strong>{{ selectedDay?.schedules.length }}</strong>건의 기록</p>
              <button class="btn-submit small-btn" @click="openRegisterModal">
                <i class="mdi mdi-plus-circle-outline"></i> 근무 등록
              </button>
            </div>

            <div class="daily-list custom-scrollbar">
              <div v-if="selectedDay?.schedules.length === 0" class="empty-state">
                <i class="mdi mdi-inbox-outline"></i>
                <p>등록된 근무 내역이 없습니다.</p>
              </div>
              <div v-else class="daily-list-item" v-for="(sch, idx) in selectedDay.schedules" :key="idx">
                <div class="worker-info">
                  <div class="worker-avatar"><i class="mdi mdi-account"></i></div>
                  <span class="staff-name">{{ sch.staffName }}</span>
                </div>
                <span :class="['status-badge', sch.workType === 'annual' ? 'leave' : sch.workType]">
                  {{ getWorkTypeName(sch.workType) }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <transition name="fade">
      <div v-if="isModalOpen" class="modal-overlay" @click.self="isModalOpen = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">
              <i class="mdi mdi-calendar-plus"></i> 근태 수동 등록
            </h3>
            <button class="modal-close" @click="isModalOpen = false"><i class="mdi mdi-close"></i></button>
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
                  <div class="option-card work"><i class="mdi mdi-check-circle-outline"></i>출근</div>
                </label>
                <label class="type-option">
                  <input type="radio" v-model="form.workType" value="holiday">
                  <div class="option-card holiday"><i class="mdi mdi-star-circle-outline"></i>특근</div>
                </label>
                <label class="type-option">
                  <input type="radio" v-model="form.workType" value="leave">
                  <div class="option-card leave"><i class="mdi mdi-beach"></i>연차</div>
                </label>
                <label class="type-option">
                  <input type="radio" v-model="form.workType" value="absent">
                  <div class="option-card absent"><i class="mdi mdi-account-remove-outline"></i>결근</div>
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
    </transition>

    <transition name="fade">
      <div v-if="isExcelModalOpen" class="modal-overlay" @click.self="isExcelModalOpen = false">
        <div class="modal-card excel-modal">
          <div class="modal-header">
            <h3 class="modal-title">
              <i class="mdi mdi-file-excel-outline text-green"></i> 엑셀 일괄 업로드
            </h3>
            <button class="modal-close" @click="isExcelModalOpen = false"><i class="mdi mdi-close"></i></button>
          </div>
          <div class="modal-body">
            <div class="info-box warning">
              <i class="mdi mdi-alert-circle-outline"></i>
              <span>선택된 현장(<strong>{{ siteOptions.find(s => s.idx === currentSiteId)?.name }}</strong>)에 데이터가 일괄 등록됩니다. 양식에 맞춘 엑셀 파일만 업로드해주세요.</span>
            </div>

            <div class="file-upload-area" :class="{ 'has-file': excelFile }" @click="triggerFileInput">
              <input type="file" ref="fileInput" @change="handleFileChange" accept=".xlsx, .xls" class="hidden-input" />
              <div v-if="!excelFile" class="upload-placeholder">
                <i class="mdi mdi-cloud-upload-outline"></i>
                <p>클릭하여 엑셀 파일을 선택해주세요</p>
              </div>
              <div v-else class="upload-selected">
                <i class="mdi mdi-file-excel"></i>
                <p class="file-name">{{ excelFile.name }}</p>
                <span class="file-change-text">파일 변경하기</span>
              </div>
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
    </transition>

  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 전역 설정 === */
.attendance-calendar-container {
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #334155;
}

/* === 페이지 헤더 === */
.page-header {
  display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;
}
.header-left { flex: 1; }
.page-title {
  font-size: 24px; font-weight: 700; color: #1e293b; margin: 0 0 6px 0;
  display: flex; align-items: center; gap: 10px; letter-spacing: -0.5px;
}
.page-title i { font-size: 26px; color: #4f46e5; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 0; }

.header-actions { display: flex; gap: 12px; }

.nav-controls {
  display: flex; align-items: center; gap: 10px; background: white;
  padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}
.btn-nav {
  width: 32px; height: 32px; border-radius: 6px; border: none;
  background: #f8fafc; color: #475569; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: all 0.2s;
}
.btn-nav:hover { background: #e2e8f0; color: #1e293b; }
.current-month-label { font-size: 15px; font-weight: 700; color: #1e293b; min-width: 100px; text-align: center; }
.btn-today {
  padding: 6px 14px; background: #f8fafc; color: #475569;
  border: 1px solid #e2e8f0; border-radius: 6px; font-weight: 600; font-size: 13px;
  cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.btn-today:hover { background: #e2e8f0; color: #1e293b; }

/* === 필터 패널 === */
.filter-panel {
  background: white; border-radius: 12px; padding: 24px; margin-bottom: 24px;
  border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
}
.filter-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap;}
.filter-group { display: flex; flex-direction: column; gap: 8px; min-width: 200px; flex: 1; }
.filter-label { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #475569; }
.filter-label i { font-size: 16px; color: #4f46e5; }
.filter-select {
  padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #334155; background: white; cursor: pointer; transition: all 0.2s; width: 100%; height: 42px;
}
.filter-select:focus { outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }

.search-group { display: flex; align-items: flex-end; }
.btn-excel {
  background-color: #10b981; color: white; border: none; padding: 0 20px; height: 42px;
  border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; gap: 6px; transition: all 0.2s; white-space: nowrap; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.btn-excel:hover { background-color: #059669; transform: translateY(-1px); }
.btn-excel i { font-size: 16px; }

/* === 통계 카드 === */
.stats-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 20px; margin-bottom: 24px;
}
.stat-card {
  background: white; border-radius: 12px; padding: 24px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02); display: flex; align-items: center; gap: 16px;
  transition: transform 0.2s, box-shadow 0.2s; position: relative; overflow: hidden;
}
.stat-card::before { content: ''; position: absolute; top: 0; left: 0; width: 4px; height: 100%; background: var(--card-color); }
.stat-card:hover { transform: translateY(-2px); border-color: #cbd5e1; box-shadow: 0 4px 12px rgba(0,0,0,0.04); }

.stat-icon {
  width: 48px; height: 48px; border-radius: 12px; background-color: var(--card-bg);
  display: flex; align-items: center; justify-content: center; position: relative; flex-shrink: 0;
}
.stat-icon i { font-size: 24px; color: var(--card-color); }

.stat-content { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 12px; color: #64748b; font-weight: 500; }
.stat-value { font-size: 22px; font-weight: 700; color: #1e293b; letter-spacing: -0.5px;}
.stat-value small { font-size: 13px; color: #94a3b8; font-weight: 500; margin-left: 2px;}

/* === 캘린더 영역 === */
.calendar-card {
  background: white; border-radius: 12px; border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.02); position: relative; overflow: hidden; width: 100%;
}
.calendar-grid-header { display: grid; grid-template-columns: repeat(7, 1fr); width: 100%; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
.day-name { padding: 14px 0; text-align: center; font-size: 13px; font-weight: 600; color: #475569; }
.day-name.sun, .text-red { color: #ef4444 !important; }
.day-name.sat, .text-blue { color: #3b82f6 !important; }
.mobile-day-name { display: none; }

.calendar-grid-body {
  display: grid; grid-template-columns: repeat(7, 1fr); width: 100%;
  background: #e2e8f0; /* Grid line color */ gap: 1px;
}

.day-cell { background: #fff; height: 140px; cursor: pointer; transition: background 0.2s; position: relative; }
.day-cell:hover { background: #f8fafc; }
.day-cell.empty { background: #f8fafc; cursor: default; }
.day-cell.today { background: #f0fdf4; }

.cell-content { padding: 10px; height: 100%; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box;}
.day-header { display: flex; justify-content: space-between; align-items: flex-start; }
.date-group { display: flex; flex-direction: column; align-items: flex-start; }
.date-num { font-size: 14px; font-weight: 600; color: #334155; }
.today .date-num {
  background: #10b981; color: white !important; width: 24px; height: 24px;
  display: flex; align-items: center; justify-content: center; border-radius: 50%;
  margin-top: -3px; margin-left: -3px;
}

.detail-icon { color: #cbd5e1; font-size: 16px; opacity: 0; transition: all 0.2s; transform: translate(-2px, 2px); }
.day-cell:hover .detail-icon { opacity: 1; color: #4f46e5; transform: translate(0, 0); }

/* 요약 뱃지 (파스텔 플랫톤) */
.summary-container { flex: 1; display: flex; flex-direction: column; gap: 4px; margin-top: 8px; overflow-y: auto; padding-right: 2px; }
.summary-badge {
  padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500;
  display: flex; justify-content: space-between; align-items: center;
}
.summary-badge strong { font-size: 12px; font-weight: 700; }

.summary-badge.work { background-color: #eef2ff; color: #4f46e5; }
.summary-badge.holiday { background-color: #fffbeb; color: #d97706; }
.summary-badge.leave { background-color: #fef2f2; color: #dc2626; }
.summary-badge.absent { background-color: #f1f5f9; color: #475569; }

.empty-cell-hint {
  opacity: 0; height: 100%; display: flex; align-items: center; justify-content: center;
  font-size: 18px; color: #cbd5e1; transition: opacity 0.2s;
}
.day-cell:hover .empty-cell-hint { opacity: 1; color: #94a3b8; }

/* === 모달 팝업 === */
.modal-overlay {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px;
}
.modal-card {
  background: #fff; width: 100%; max-width: 450px; border-radius: 16px; border: 1px solid #e2e8f0;
  box-shadow: 0 10px 25px rgba(0,0,0,0.1); overflow: hidden; transform: translateY(0);
}
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(10px); }

.modal-header {
  padding: 20px 24px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;
  display: flex; justify-content: space-between; align-items: center;
}
.modal-title { font-size: 16px; font-weight: 700; margin: 0; color: #1e293b; display: flex; align-items: center; gap: 8px;}
.modal-title i { font-size: 20px; }
.modal-close { background: transparent; border: none; color: #94a3b8; cursor: pointer; font-size: 20px; transition: 0.2s; display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: 4px;}
.modal-close:hover { background: #e2e8f0; color: #1e293b; }

.modal-body { padding: 24px; display: flex; flex-direction: column; gap: 20px; }
.info-box { background: #f8fafc; padding: 14px 16px; border-radius: 8px; font-size: 13px; color: #475569; border: 1px solid #e2e8f0; }
.info-box.warning { background: #fffbeb; color: #d97706; border-color: #fde68a; display: flex; gap: 10px; align-items: flex-start; }
.info-box.warning i { font-size: 18px; color: #f59e0b; }

.form-group label { font-size: 13px; font-weight: 600; color: #475569; margin-bottom: 8px; display: block; }
.search-input-wrapper {
  display: flex; align-items: center; gap: 10px; border: 1px solid #e2e8f0;
  padding: 10px 14px; border-radius: 8px; transition: 0.2s; background: #fff;
}
.search-input-wrapper:focus-within { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); }
.search-input-wrapper i { color: #94a3b8; font-size: 18px; }
.search-input-wrapper input { border: none; outline: none; width: 100%; font-size: 13px; color: #1e293b; }

/* 라디오 카드형 선택기 */
.type-selector { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.type-option input { display: none; }
.option-card {
  padding: 12px 0; border: 1px solid #e2e8f0; border-radius: 8px; text-align: center;
  font-size: 12px; font-weight: 600; color: #64748b; cursor: pointer; transition: all 0.2s;
  display: flex; flex-direction: column; gap: 6px; background: white;
}
.option-card i { font-size: 20px; }
.option-card:hover { border-color: #cbd5e1; background: #f8fafc; color: #1e293b; }

/* 선택 상태 컬러링 (플랫) */
.type-option input:checked + .option-card.work { border-color: #4f46e5; color: #4f46e5; background: #eef2ff; }
.type-option input:checked + .option-card.holiday { border-color: #f59e0b; color: #d97706; background: #fffbeb; }
.type-option input:checked + .option-card.leave { border-color: #ef4444; color: #dc2626; background: #fef2f2; }
.type-option input:checked + .option-card.absent { border-color: #64748b; color: #475569; background: #f1f5f9; }

.modal-footer { padding: 16px 24px; border-top: 1px solid #e2e8f0; display: flex; gap: 10px; background: #f8fafc; }
.modal-footer button { flex: 1; padding: 12px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: 0.2s; display: flex; align-items: center; justify-content: center; gap: 6px;}
.btn-cancel { background: white; border: 1px solid #e2e8f0 !important; color: #475569; }
.btn-cancel:hover { background: #f1f5f9; color: #1e293b;}
.btn-submit { background-color: #4f46e5; color: white; box-shadow: 0 1px 2px rgba(0,0,0,0.05);}
.btn-submit:hover { background-color: #4338ca; transform: translateY(-1px);}
.btn-submit.green { background-color: #10b981; }
.btn-submit.green:hover { background-color: #059669; }
.btn-submit:disabled { opacity: 0.6; cursor: not-allowed; transform: none; box-shadow: none;}

/* 일일 리스트 팝업 (플랫 모던) */
.list-body { padding: 20px 24px; gap: 16px; }
.daily-action-bar { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; }
.summary-text { font-size: 13px; color: #64748b; margin: 0; }
.summary-text strong { color: #1e293b; font-size: 15px; }
.small-btn { padding: 8px 14px !important; font-size: 12px !important; border-radius: 6px !important; flex: none !important; }

.daily-list { max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 4px; }
.daily-list-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; background: white; border-radius: 8px; border: 1px solid #e2e8f0; transition: border-color 0.2s;
}
.daily-list-item:hover { border-color: #cbd5e1; }

.worker-info { display: flex; align-items: center; gap: 10px; }
.worker-avatar { width: 28px; height: 28px; background: #f1f5f9; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 14px; }
.staff-name { font-weight: 600; color: #334155; font-size: 13px; }

.status-badge { font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 4px; }
.status-badge.work { background-color: #eef2ff; color: #4f46e5; }
.status-badge.holiday { background-color: #fffbeb; color: #d97706; }
.status-badge.leave { background-color: #fef2f2; color: #dc2626; }
.status-badge.absent { background-color: #f1f5f9; color: #475569; }

/* 엑셀 파일 업로드 폼 (플랫 & 모던) */
.file-upload-area {
  border: 2px dashed #cbd5e1; border-radius: 10px; padding: 40px 20px; text-align: center;
  cursor: pointer; transition: all 0.2s; background: #f8fafc; display: flex; flex-direction: column; align-items: center; justify-content: center;
}
.file-upload-area:hover { border-color: #10b981; background: #f0fdf4; }
.file-upload-area.has-file { border-color: #10b981; border-style: solid; background: #ecfdf5;}
.hidden-input { display: none; }

.upload-placeholder i { font-size: 40px; color: #94a3b8; margin-bottom: 8px; transition: color 0.2s;}
.file-upload-area:hover .upload-placeholder i { color: #10b981; }
.upload-placeholder p { font-size: 13px; color: #475569; margin: 0; font-weight: 600; }

.upload-selected i { font-size: 28px; color: #10b981; margin-bottom: 8px; }
.upload-selected .file-name { color: #1e293b; font-weight: 700; font-size: 14px; margin: 0 0 4px 0;}
.upload-selected .file-change-text { font-size: 12px; color: #10b981; text-decoration: underline; }

.text-blue { color: #4f46e5; }
.text-green { color: #10b981; }

.loader-overlay { position: absolute; inset: 0; background: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center; z-index: 10; backdrop-filter: blur(2px); }
.spinner { width: 32px; height: 32px; border: 3px solid #f1f5f9; border-top: 3px solid #4f46e5; border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { 100% { transform: rotate(360deg); } }

.custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }

/* === 반응형 (모바일 캘린더 리스트 변환 포함) === */
@media screen and (max-width: 1024px) {
  .filter-row { flex-wrap: wrap; }
  .filter-group, .search-group { min-width: 200px;}
}

@media screen and (max-width: 768px) {
  .page-header { flex-direction: column; align-items: stretch; gap: 16px; }
  .header-actions { width: 100%; }
  .nav-controls { justify-content: space-between; width: 100%; }

  .filter-row { flex-direction: column; align-items: stretch; gap: 12px;}
  .filter-group, .search-group { width: 100%; min-width: 100%; }
  .filter-select { width: 100%; }
  .btn-excel { width: 100%; justify-content: center; }

  .stats-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }

  /* 모바일 달력을 세로 리스트형태로 변환 */
  .calendar-card { border-radius: 12px; border: 1px solid #e2e8f0; max-height: calc(100vh - 250px); overflow-y: auto; }
  .calendar-grid-header { display: none; }
  .calendar-grid-body { display: flex; flex-direction: column; gap: 0; background: transparent;}

  .day-cell { height: auto; min-height: 70px; border-bottom: 1px solid #e2e8f0; background: #fff; }
  .day-cell.empty { display: none; }
  .day-cell:last-child { border-bottom: none; }

  .cell-content { flex-direction: row; align-items: center; padding: 12px 16px; gap: 16px; overflow: visible; }
  .day-header { flex-direction: row; align-items: center; width: 60px; border-right: 1px solid #f1f5f9; padding-right: 12px; flex-shrink: 0; }
  .date-group { flex-direction: column; align-items: center; gap: 2px; width: 100%;}
  .date-num { font-size: 16px; }
  .mobile-day-name { display: block; font-size: 12px; color: #64748b; font-weight: 600; }
  .detail-icon { display: none; }

  .summary-container { flex-direction: row; flex-wrap: wrap; margin-top: 0; padding: 0; overflow: visible; align-items: center;}
  .summary-badge { padding: 4px 8px; font-size: 11px; }
  .empty-cell-hint { justify-content: flex-start; font-size: 13px; margin-left: 10px;}
}

@media screen and (max-width: 480px) {
  .stats-grid { grid-template-columns: 1fr; }
  .type-selector { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .option-card { padding: 10px 0; }
}
</style>
