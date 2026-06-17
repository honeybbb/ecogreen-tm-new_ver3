<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'nuxt/app';

const router = useRouter();

const {
  siteOptions,
  fetchSiteOptions
} = useApi();

// 1. 달력 상태 및 생성 로직
const currentDate = ref(new Date());

const currentYearMonth = computed(() => {
  const y = currentDate.value.getFullYear();
  const m = currentDate.value.getMonth() + 1;
  return `${y}년 ${m}월`;
});

const prevMonth = () => {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1);
};
const today = () => {
  currentDate.value = new Date();
};
const nextMonth = () => {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1);
};

// 2. 대청소 일정 임시 데이터 (현장 계약의 cleaningConfig 기반으로 생성된 일정)
const cleaningSchedules = ref([
  { idx: 1, sIdx: 101, siteName: "서초 그랑자이", itemCd: "04003001003", itemName: "주차장대청소", cleaningDt: "2026-06-16", status: "예정" },
  { idx: 2, sIdx: 101, siteName: "서초 그랑자이", itemCd: "04003001005", itemName: "렉산대청소", cleaningDt: "2026-06-18", status: "완료" },
  { idx: 3, sIdx: 102, siteName: "반포 래미안", itemCd: "04003001003", itemName: "주차장대청소", cleaningDt: "2026-06-25", status: "예정" },
  { idx: 4, sIdx: 103, siteName: "잠실 엘스", itemCd: "04003001003", itemName: "주차장대청소", cleaningDt: "2026-06-16", status: "진행중" },
  { idx: 5, sIdx: 104, siteName: "디에이치 아너힐즈", itemCd: "04003001007", itemName: "유리창대청소", cleaningDt: "2026-06-20", status: "예정" },
  { idx: 6, sIdx: 105, siteName: "도곡 렉슬", itemCd: "04003001003", itemName: "주차장대청소", cleaningDt: "2026-07-02", status: "예정" }
]);

const getSchedulesForDate = (dateStr) => {
  return cleaningSchedules.value.filter(s => s.cleaningDt === dateStr);
};

const getStatusColor = (status) => {
  if(status === '완료') return 'var(--success)';
  if(status === '진행중') return 'var(--warning)';
  return 'var(--primary)';
};

// 3. 달력 셀 계산 (6주 그리드)
const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();

  const firstDay = new Date(year, month, 1).getDay(); // 0(일) ~ 6(토)
  const lastDate = new Date(year, month + 1, 0).getDate();
  const prevLastDate = new Date(year, month, 0).getDate();

  const days = [];

  // 이전 달
  for (let i = firstDay - 1; i >= 0; i--) {
    const dd = prevLastDate - i;
    const mm = month === 0 ? 12 : month;
    const yy = month === 0 ? year - 1 : year;
    days.push({
      date: dd,
      isCurrentMonth: false,
      dateStr: `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    });
  }

  // 이번 달
  for (let i = 1; i <= lastDate; i++) {
    days.push({
      date: i,
      isCurrentMonth: true,
      isToday: new Date().toDateString() === new Date(year, month, i).toDateString(),
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
    });
  }

  // 다음 달 (남은 빈칸 채우기, 총 42칸 6주)
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const mm = month === 11 ? 1 : month + 2;
    const yy = month === 11 ? year + 1 : year;
    days.push({
      date: i,
      isCurrentMonth: false,
      dateStr: `${yy}-${String(mm).padStart(2, '0')}-${String(i).padStart(2, '0')}`
    });
  }

  return days;
});

const openDetail = (schedule) => {
  isEditMode.value = true;
  editingIdx.value = schedule.idx;
  addForm.value = {
    sIdx: schedule.sIdx,
    itemCd: schedule.itemCd,
    cleaningDt: schedule.cleaningDt,
    status: schedule.status
  };
  showAddModal.value = true;
};

// 4. 현장 계약의 대청소 설정 (cleaningConfig) API 데이터를 활용한 computed 처리
const siteContracts = computed(() => {
  if (!siteOptions.value) return [];

  const result = [];
  siteOptions.value.forEach(site => {
    const configs = [];
    if (site.contracts && Array.isArray(site.contracts)) {
      site.contracts.forEach(contract => {
        let cleaningData = contract.cleaningConfig;
        if (typeof cleaningData === 'string' && cleaningData.trim()) {
          try {
            cleaningData = JSON.parse(cleaningData);
          } catch (e) {
            cleaningData = [];
          }
        }
        if (cleaningData && Array.isArray(cleaningData)) {
          configs.push(...cleaningData);
        }
      });
    }

    if (configs.length > 0) {
      const mergedConfigs = [];
      configs.forEach(conf => {
        const existing = mergedConfigs.find(m => m.code === conf.code);
        if (existing) {
          existing.count += Number(conf.count);
        } else {
          mergedConfigs.push({ code: conf.code, name: conf.name, count: Number(conf.count) });
        }
      });

      result.push({
        sIdx: site.idx || site.sIdx, // 사이트 고유번호
        siteName: site.name,
        cleaningConfig: mergedConfigs
      });
    }
  });
  return result;
});

// 진행된 일정 횟수 계산 및 잔여 항목 추출
const cleaningStatusBySite = computed(() => {
  return siteContracts.value.map(site => {
    // 해당 현장의 일정들 가져오기
    const siteSchedules = cleaningSchedules.value.filter(s => s.sIdx === site.sIdx);

    const tasks = site.cleaningConfig.map(config => {
      // 해당 항목 진행 횟수 (등록된 일정 수)
      const scheduledCount = siteSchedules.filter(s => s.itemCd === config.code).length;
      return {
        code: config.code,
        name: config.name,
        total: config.count,
        used: scheduledCount,
        remain: config.count - scheduledCount
      };
    });

    return {
      sIdx: site.sIdx,
      siteName: site.siteName,
      tasks: tasks
    };
  });
});

onMounted(() => {
  fetchSiteOptions();
});

// 모달 및 폼 상태
const showAddModal = ref(false);
const isEditMode = ref(false);
const editingIdx = ref(null);

const addForm = ref({
  sIdx: '',
  itemCd: '',
  cleaningDt: '',
  status: '예정'
});

const availableTasks = computed(() => {
  if (!addForm.value.sIdx) return [];
  const site = siteContracts.value.find(s => s.sIdx === addForm.value.sIdx);
  return site ? site.cleaningConfig : [];
});

const onSiteChange = () => {
  addForm.value.itemCd = ''; // 현장이 바뀌면 항목도 초기화
};

const openAddModal = () => {
  isEditMode.value = false;
  editingIdx.value = null;
  addForm.value = {
    sIdx: '',
    itemCd: '',
    cleaningDt: '',
    status: '예정'
  };
  showAddModal.value = true;
};

const closeAddModal = () => {
  showAddModal.value = false;
};

const saveAddModal = () => {
  if (!addForm.value.sIdx || !addForm.value.itemCd || !addForm.value.cleaningDt) {
    alert("모든 필드를 입력해주세요.");
    return;
  }

  const site = siteContracts.value.find(s => s.sIdx === addForm.value.sIdx);
  const task = site.cleaningConfig.find(t => t.code === addForm.value.itemCd);

  if (isEditMode.value) {
    const idx = cleaningSchedules.value.findIndex(s => s.idx === editingIdx.value);
    if (idx !== -1) {
      cleaningSchedules.value[idx] = {
        ...cleaningSchedules.value[idx],
        sIdx: site.sIdx,
        siteName: site.siteName,
        itemCd: task.code,
        itemName: task.name,
        cleaningDt: addForm.value.cleaningDt,
        status: addForm.value.status
      };
    }
  } else {
    cleaningSchedules.value.push({
      idx: Date.now(), // 임시 ID
      sIdx: site.sIdx,
      siteName: site.siteName,
      itemCd: task.code,
      itemName: task.name,
      cleaningDt: addForm.value.cleaningDt,
      status: addForm.value.status
    });
  }

  closeAddModal();
};

const deleteSchedule = () => {
  if (confirm("일정을 삭제하시겠습니까?")) {
    cleaningSchedules.value = cleaningSchedules.value.filter(s => s.idx !== editingIdx.value);
    closeAddModal();
  }
};

</script>

<template>
  <div class="site-cleaning-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-broom"></i>
          대청소 관리
        </h1>
        <p class="page-subtitle">현장별 대청소 과업 일정을 확인하고 관리합니다.</p>
      </div>
      <div class="header-actions" style="display: flex; gap: 8px;">
        <button class="btn-add" @click="openAddModal">
          <i class="mdi mdi-calendar-plus"></i>
          <span>일정 등록</span>
        </button>
      </div>
    </div>

    <div class="content-body" style="display: grid; grid-template-columns: 3fr 1fr; gap: 20px;">
      <div class="calendar-card">
        <div class="calendar-header">
          <button @click="prevMonth" class="btn-nav"><i class="mdi mdi-chevron-left"></i></button>
          <button @click="today" class="btn-today">이번달</button>
          <h2 class="calendar-title">{{ currentYearMonth }}</h2>
          <button @click="nextMonth" class="btn-nav"><i class="mdi mdi-chevron-right"></i></button>
        </div>

        <div class="calendar-grid">
          <div class="calendar-weekdays">
            <div class="weekday text-danger">일</div>
            <div class="weekday">월</div>
            <div class="weekday">화</div>
            <div class="weekday">수</div>
            <div class="weekday">목</div>
            <div class="weekday">금</div>
            <div class="weekday text-primary">토</div>
          </div>

          <div class="calendar-body">
            <div
                v-for="(day, index) in calendarDays"
                :key="index"
                :class="['calendar-cell', { 'not-current': !day.isCurrentMonth, 'is-today': day.isToday }]"
            >
              <div class="cell-date">{{ day.date }}</div>
              <div class="cell-schedules">
                <div
                    v-for="schedule in getSchedulesForDate(day.dateStr)"
                    :key="schedule.idx"
                    class="schedule-item"
                    @click="openDetail(schedule)"
                    :style="{'--status-col': getStatusColor(schedule.status)}"
                >
                  <div class="schedule-status" :style="{ backgroundColor: getStatusColor(schedule.status) }">{{ schedule.status }}</div>
                  <div class="schedule-text">
                    <strong>{{ schedule.siteName }}</strong>
                    <span>{{ schedule.itemName }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 현장별 대청소 잔여 횟수 카드 -->
      <div class="status-card">
        <div class="status-header">
          <i class="mdi mdi-clipboard-text-outline"></i>
          <h3>현장별 과업 잔여 현황</h3>
        </div>
        <div class="status-list">
          <div class="status-item" v-for="site in cleaningStatusBySite" :key="site.sIdx">
            <h4>{{ site.siteName }}</h4>
            <div class="task-info" v-for="task in site.tasks" :key="task.code">
              <div class="task-name">• {{ task.name }}</div>
              <div class="task-counts">
                <span class="count-total">총 {{ task.total }}회</span>
                <span class="count-used">진행 {{ task.used }}회</span>
                <span class="count-remain">잔여 {{ task.remain }}회</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 대청소 일정 등록 모달 -->
    <div v-if="showAddModal" class="modal-overlay" @click="closeAddModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>{{ isEditMode ? '대청소 일정 수정' : '대청소 일정 등록' }}</h2>
          <button class="btn-close" @click="closeAddModal"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>현장 선택</label>
            <select v-model="addForm.sIdx" class="form-control" @change="onSiteChange">
              <option value="" disabled>현장을 선택하세요</option>
              <option v-for="site in siteContracts" :key="site.sIdx" :value="site.sIdx">
                {{ site.siteName }}
              </option>
            </select>
          </div>

          <div class="form-group" v-if="availableTasks.length > 0">
            <label>청소 항목</label>
            <select v-model="addForm.itemCd" class="form-control">
              <option value="" disabled>항목을 선택하세요</option>
              <option v-for="task in availableTasks" :key="task.code" :value="task.code">
                {{ task.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label>청소 일자</label>
            <input type="date" v-model="addForm.cleaningDt" class="form-control" />
          </div>

          <div class="form-group">
            <label>상태</label>
            <select v-model="addForm.status" class="form-control">
              <option value="예정">예정</option>
              <option value="진행중">진행중</option>
              <option value="완료">완료</option>
            </select>
          </div>
        </div>
        <div class="modal-footer">
          <button v-if="isEditMode" class="btn-danger" @click="deleteSchedule" style="margin-right: auto;">삭제</button>
          <button class="btn-cancel" @click="closeAddModal">취소</button>
          <button class="btn-save" @click="saveAddModal">저장</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.site-cleaning-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 모달 스타일 */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.modal-content {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
}
.modal-header {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.modal-header h2 {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
}
.btn-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--text-sub, #4b5563);
}
.modal-body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main, #111827);
}
.form-control {
  padding: 10px 12px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 14px;
}
.form-control:focus {
  outline: none;
  border-color: var(--primary, #4f46e5);
  box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1);
}
.modal-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color, #e5e7eb);
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.btn-cancel {
  padding: 8px 16px;
  background: var(--bg-hover, #f3f4f6);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
.btn-save {
  padding: 8px 16px;
  background: var(--primary, #4f46e5);
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
.btn-save:hover {
  background: var(--primary-hover, #4338ca);
}

.btn-danger {
  padding: 8px 16px;
  background: var(--danger, #ef4444);
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-danger:hover {
  background: #dc2626;
}

.btn-add {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background-color: var(--primary, #4f46e5);
  color: white;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}
.btn-add:hover {
  background-color: var(--primary-hover, #4338ca);
}
.calendar-card {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1));
}

.status-card {
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1));
  display: flex;
  flex-direction: column;
}

.status-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.status-header i {
  font-size: 20px;
  color: var(--primary, #4f46e5);
}

.status-header h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main, #111827);
  margin: 0;
}

.status-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  max-height: 700px;
}

.status-item {
  background: var(--bg-canvas, #f9fafb);
  border-radius: 8px;
  padding: 16px;
  border: 1px solid var(--border-color, #e5e7eb);
}

.status-item h4 {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main, #111827);
  margin: 0 0 12px 0;
}

.task-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px dashed var(--border-color, #e5e7eb);
}

.task-info:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.task-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-sub, #4b5563);
}

.task-counts {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  font-weight: 500;
}

.count-total {
  color: #64748b;
}

.count-used {
  color: var(--primary, #4f46e5);
}

.count-remain {
  color: var(--danger, #ef4444);
  font-weight: 700;
}


.calendar-header {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-bottom: 24px;
}

.calendar-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main, #111827);
  min-width: 120px;
  text-align: center;
  margin: 0;
}

.btn-nav {
  background: var(--bg-hover, #f3f4f6);
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-sub, #4b5563);
  font-size: 20px;
  transition: all 0.2s;
}

.btn-nav:hover {
  background: var(--primary-soft, #e0e7ff);
  color: var(--primary, #4f46e5);
}

.btn-today {
  padding: 6px 12px;
  background: var(--bg-canvas, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-sub, #4b5563);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-today:hover {
  background: var(--bg-hover, #f3f4f6);
}

.calendar-grid {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  overflow: hidden;
}

.calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  background: var(--bg-canvas, #f9fafb);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.weekday {
  padding: 12px 0;
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-sub, #4b5563);
}

.text-danger {
  color: var(--danger, #ef4444);
}

.text-primary {
  color: var(--primary, #4f46e5);
}

.calendar-body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: minmax(100px, auto);
}

.calendar-cell {
  border-right: 1px solid var(--border-color, #e5e7eb);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: background 0.2s;
  min-height: 120px;
}

.calendar-cell:nth-child(7n) {
  border-right: none;
}
.calendar-body .calendar-cell:nth-last-child(-n+7) {
  border-bottom: none;
}

.calendar-cell:hover {
  background: var(--bg-canvas, #f9fafb);
}

.not-current {
  background: var(--bg-canvas, #f9fafb);
  opacity: 0.6;
}

.is-today .cell-date {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  background: var(--primary, #4f46e5);
  color: #fff;
  border-radius: 50%;
  font-weight: 700;
}

.cell-date {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-main, #111827);
  align-self: flex-end;
}

.cell-schedules {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.schedule-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px;
  background: var(--bg-surface, #ffffff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.schedule-item:hover {
  border-color: var(--status-col);
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  transform: translateY(-1px);
}

.schedule-status {
  font-size: 10px;
  font-weight: 700;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  margin-top: 1px;
  flex-shrink: 0;
}

.schedule-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
}

.schedule-text strong {
  color: var(--text-main, #111827);
  font-weight: 600;
}

.schedule-text span {
  color: var(--text-sub, #4b5563);
}

@media (max-width: 1024px) {
  .content-body {
    grid-template-columns: 1fr !important;
  }
}

@media (max-width: 768px) {
  .calendar-cell {
    min-height: 80px;
  }
  .schedule-text span {
    display: none; /* 모바일에서는 항목 이름 숨기기 (현장명만 보이게) */
  }
  .schedule-text {
    font-size: 10px;
  }
}
</style>
