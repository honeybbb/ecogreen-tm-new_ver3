<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import SiteSelect from '~/components/SiteSelect.vue';
import MemberSelect from '~/components/MemberSelect.vue';

const { siteOptions, fetchSiteOptions, typeOptions, fetchTypeOptions } = useApi();

// ================================================================
// 상태
// ================================================================
const currentDate   = ref(new Date());
const schedules     = ref([]);
const isLoading     = ref(false);
const currentSiteId = ref('');
const staffList     = ref([]);

// 모달
const modal = ref({
  daily:    false,  // 날짜 클릭 → 일별 현황
  form:     false,  // 근태 등록/수정
  bulk:     false,  // 일괄 생성 확인
});

const selectedDay     = ref(null);
const selectedRecord  = ref(null); // 수정 대상 근태 레코드
const selectedType  = ref('');
const isBulkLoading   = ref(false);

// 폼
const form = ref({
  idx:         null,   // 수정 시 사용
  workStartDt: '',
  mIdx:        '',
  sIdx:        '',
  workType:    'work',
  bigo:        '',
});

// ================================================================
// 날짜 계산
// ================================================================
const selectedYear  = computed(() => currentDate.value.getFullYear());
const selectedMonth = computed(() => currentDate.value.getMonth());

const selectedYearMonth = computed(() =>
    `${selectedYear.value}-${String(selectedMonth.value + 1).padStart(2, '0')}`
);
const monthTitle = computed(() =>
    `${selectedYear.value}년 ${selectedMonth.value + 1}월`
);

const filteredSchedules = computed(() => {
  // 아무것도 선택하지 않았으면 전체 데이터를 보여줌
  if (!selectedType.value) return schedules.value;
  // 선택한 구분값과 일치하는 데이터만 필터링
  return schedules.value.filter(s => s.type === selectedType.value);
});

const monthSummary = computed(() => ({
  work:    filteredSchedules.value.filter(s => s.workType === 'work').length,
  holiday: filteredSchedules.value.filter(s => s.workType === 'holiday').length,
  leave:   filteredSchedules.value.filter(s => ['leave','annual','half'].includes(s.workType)).length,
  absent:  filteredSchedules.value.filter(s => s.workType === 'absent').length,
}));

const calendarDays = computed(() => {
  const daysInMonth   = new Date(selectedYear.value, selectedMonth.value + 1, 0).getDate();
  const firstDayOfWeek = new Date(selectedYear.value, selectedMonth.value, 1).getDay();
  const dayNames      = ['일','월','화','수','목','금','토'];
  const days          = [];

  // 앞 빈칸
  for (let i = 0; i < firstDayOfWeek; i++) {
    days.push({ isEmpty: true });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const fullDate = `${selectedYear.value}-${String(selectedMonth.value + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dow      = new Date(selectedYear.value, selectedMonth.value, d).getDay();

    // ★ 3. 일별 스케줄 필터링 교체 (schedules.value -> filteredSchedules.value)
    const daily    = filteredSchedules.value.filter(s => s.date === fullDate);

    days.push({
      date:      d,
      fullDate,
      dayName:   dayNames[dow],
      isWeekend: dow === 0 || dow === 6,
      isEmpty:   false,
      schedules: daily, // 달력 칸 안에 필터링된 데이터만 들어감
      summary: {
        work:    daily.filter(s => s.workType === 'work').length,
        holiday: daily.filter(s => s.workType === 'holiday').length,
        leave:   daily.filter(s => ['leave','annual'].includes(s.workType)).length,
        half:    daily.filter(s => s.workType === 'half').length,
        absent:  daily.filter(s => s.workType === 'absent').length,
      },
    });
  }
  return days;
});

const currentSiteName = computed(() =>
    siteOptions.value.find(s => s.idx === currentSiteId.value)?.name || ''
);

const TODAY = new Date().toISOString().split('T')[0];

// ================================================================
// 데이터 로딩
// ================================================================
const loadStaffList = async () => {
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
      axios.get(`/api/v1/work/off?month=${selectedYearMonth.value}&sIdx=${currentSiteId.value}`),
    ]);

    const combined = [];

    workRes.data.data?.forEach(item => {
      const staff = staffList.value.find(s => s.idx === item.mIdx);
      // console.log(item, 'dd')
      combined.push({
        idx:       item.idx,
        mIdx:      item.mIdx,
        type:      item.type || staff?.itemCd || staff?.type,
        date:      item.workStartDt.split(' ')[0],
        staffName: staff?.name || `직원(${item.mIdx})`,
        workType:  item.workType || 'work',
        bigo:      item.bigo || '',
      });
    });

    leaveRes.data.data?.forEach(item => {
      const staff = staffList.value.find(s => s.idx === item.mIdx);
      let curr = new Date(item.startDt);
      const end = new Date(item.endDt);
      while (curr <= end) {
        combined.push({
          idx:       item.idx, // 추후 삭제/수정 대비
          mIdx:      item.mIdx,
          // ★ 휴무 데이터에도 직원의 type을 넣어줍니다 (중요!)
          type:      staff?.itemCd || staff?.type,
          date:      curr.toISOString().split('T')[0],
          staffName: staff?.name || `직원(${item.mIdx})`,
          workType:  'leave',
        });
        curr.setDate(curr.getDate() + 1);
      }
    });

    schedules.value = combined;

    // 일별 모달 열려있으면 데이터 갱신
    if (modal.value.daily && selectedDay.value) {
      const updated = calendarDays.value.find(d => d.fullDate === selectedDay.value.fullDate);
      if (updated) selectedDay.value = updated;
    }
  } catch (e) {
    console.error('스케줄 로드 실패', e);
  } finally {
    isLoading.value = false;
  }
};

// ================================================================
// 네비게이션
// ================================================================
const prevMonth = () => { currentDate.value = new Date(selectedYear.value, selectedMonth.value - 1, 1); };
const nextMonth = () => { currentDate.value = new Date(selectedYear.value, selectedMonth.value + 1, 1); };
const goToday   = () => { currentDate.value = new Date(); };

watch([currentDate, currentSiteId], () => {
  if (currentSiteId.value) loadStaffList().then(fetchSchedules);
});

// ================================================================
// 달력 클릭 → 일별 현황 모달
// ================================================================
const handleDayClick = (day) => {
  if (day.isEmpty) return;
  if (!currentSiteId.value) return alert('현장을 먼저 선택해주세요.');
  selectedDay.value = day;
  modal.value.daily = true;
};

// ================================================================
// 근태 등록/수정 모달
// ================================================================

// 신규 등록 (일별 모달에서 "수동 등록" 버튼)
const openCreateModal = () => {
  form.value = {
    idx:         null,
    workStartDt: selectedDay.value.fullDate,
    mIdx:        '',
    sIdx:        currentSiteId.value,
    workType:    'work',
    bigo:        '',
  };
  modal.value.daily = false;
  modal.value.form  = true;
};

// 수정 (일별 현황에서 항목 클릭)
const openEditModal = (record) => {
  form.value = {
    idx:         record.idx,
    workStartDt: record.date,
    mIdx:        record.mIdx,
    sIdx:        currentSiteId.value,
    workType:    record.workType,
    bigo:        record.bigo || '',
  };
  selectedRecord.value = record;
  modal.value.daily = false;
  modal.value.form  = true;
};

// 저장 (등록 or 수정)
const saveSchedule = async () => {
  if (!form.value.mIdx) return alert('직원을 선택해주세요.');
  try {
    await axios.post('/api/v1/work/upsert', { ...form.value });
    modal.value.form = false;
    await fetchSchedules();
  } catch (e) {
    alert('저장 중 오류가 발생했습니다.');
  }
};

// ================================================================
// 근태 삭제
// ================================================================
const deleteRecord = async (record) => {
  if (!record.idx) return alert('삭제할 수 없는 항목입니다.');
  if (!confirm(`${record.staffName}의 ${record.date} 근태를 삭제하시겠습니까?`)) return;
  try {
    await axios.delete(`/api/v1/work/${record.idx}`);
    await fetchSchedules();
  } catch (e) {
    alert('삭제 중 오류가 발생했습니다.');
  }
};

// ================================================================
// 일괄 생성
// ================================================================
const openBulkModal = () => {
  if (!currentSiteId.value) return alert('현장을 먼저 선택해주세요.');
  modal.value.bulk = true;
};

const executeBulkGenerate = async () => {
  isBulkLoading.value = true;
  modal.value.bulk    = false;
  try {
    const res = await axios.post('/api/v1/work/bulk', {
      sIdx:  currentSiteId.value,
      month: selectedYearMonth.value,
    });
    if (res.data.result) {
      alert(`${monthTitle.value} 일괄 근태 생성 완료\n등록: ${res.data.success}건 / 삭제: ${res.data.deleted}건`);
      await fetchSchedules();
    } else {
      alert(res.data.message || '생성 실패');
    }
  } catch (e) {
    alert(e.response?.data?.message || '서버 오류가 발생했습니다.');
  } finally {
    isBulkLoading.value = false;
  }
};

// ================================================================
// 유틸
// ================================================================
const WORK_TYPE_LABELS = {
  work:    '출근',
  holiday: '특근',
  leave:   '휴무',
  annual:  '연차',
  half:    '반차',
  absent:  '결근',
};
const getWorkTypeName = (type) => WORK_TYPE_LABELS[type] || '알수없음';

const getStatusClass = (type) => type === 'annual' ? 'leave' : type;

onMounted(() => {
  fetchSiteOptions()
  fetchTypeOptions()
})
</script>

<template>
  <div class="attendance-calendar-container">

    <!-- ── 헤더 ── -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-calendar-check-outline"></i> 직원 출근 관리
        </h1>
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

    <!-- ── 필터 ── -->
    <div class="filter-panel">
      <div class="filter-row">
        <SiteSelect :allow-empty="false" v-model="currentSiteId" />
        <select v-model="selectedType" required class="filter-select">
          <option value="">선택하세요</option>
          <option v-for="type in typeOptions" :key="type.itemCd" :value="type.itemCd">
            {{ type.itemNm }}
          </option>
        </select>
        <button v-if="currentSiteId" @click="openBulkModal" class="btn-bulk" :disabled="isBulkLoading">
          <i class="mdi" :class="isBulkLoading ? 'mdi-loading mdi-spin' : 'mdi-calendar-multiselect'"></i>
          <span>{{ monthTitle }} 일괄 생성</span>
        </button>
      </div>
    </div>

    <!-- ── 통계 ── -->
    <div class="stats-grid">
      <div class="stat-card" style="--card-color: var(--primary); --card-bg: var(--primary-soft);">
        <div class="stat-icon"><i class="mdi mdi-account-check-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">이번 달 출근</span>
          <span class="stat-value">{{ monthSummary.work }} <small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--warning); --card-bg: rgba(245, 158, 11, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-star-circle-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">이번 달 특근</span>
          <span class="stat-value">{{ monthSummary.holiday }} <small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--danger); --card-bg: rgba(239, 68, 68, 0.1);">
        <div class="stat-icon"><i class="mdi mdi-beach"></i></div>
        <div class="stat-content">
          <span class="stat-label">이번 달 휴무/연차/반차</span>
          <span class="stat-value">{{ monthSummary.leave }} <small>건</small></span>
        </div>
      </div>
      <div class="stat-card" style="--card-color: var(--text-sub); --card-bg: var(--bg-hover);">
        <div class="stat-icon"><i class="mdi mdi-account-remove-outline"></i></div>
        <div class="stat-content">
          <span class="stat-label">이번 달 결근</span>
          <span class="stat-value">{{ monthSummary.absent }} <small>건</small></span>
        </div>
      </div>
    </div>

    <!-- ── 캘린더 ── -->
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
            v-for="(day, i) in calendarDays" :key="i"
            :class="['day-cell', { empty: day.isEmpty, today: day.fullDate === TODAY }]"
            @click="handleDayClick(day)"
        >
          <div v-if="!day.isEmpty" class="cell-content">
            <div class="day-header">
              <div class="date-group">
                <span class="date-num" :class="{ 'text-red': day.dayName==='일', 'text-blue': day.dayName==='토' }">
                  {{ day.date }}
                </span>
                <span class="mobile-day-name" :class="{ 'text-red': day.dayName==='일', 'text-blue': day.dayName==='토' }">
                  {{ day.dayName }}
                </span>
              </div>
              <i class="mdi mdi-arrow-top-right detail-icon"></i>
            </div>
            <div class="summary-container custom-scrollbar">
              <template v-if="day.schedules.length > 0">
                <div v-if="day.summary.work    > 0" class="summary-badge work">출근 <strong>{{ day.summary.work }}</strong></div>
                <div v-if="day.summary.holiday > 0" class="summary-badge holiday">특근 <strong>{{ day.summary.holiday }}</strong></div>
                <div v-if="day.summary.leave   > 0" class="summary-badge leave">연차 <strong>{{ day.summary.leave }}</strong></div>
                <div v-if="day.summary.half    > 0" class="summary-badge half">반차 <strong>{{ day.summary.half }}</strong></div>
                <div v-if="day.summary.absent  > 0" class="summary-badge absent">결근 <strong>{{ day.summary.absent }}</strong></div>
              </template>
              <div v-else class="empty-cell-hint"><i class="mdi mdi-plus"></i></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ================================================================ -->
    <!-- 모달: 일별 현황                                                    -->
    <!-- ================================================================ -->
    <transition name="fade">
      <div v-if="modal.daily" class="modal-overlay" @click.self="modal.daily = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">
              <i class="mdi mdi-clipboard-text-outline text-blue"></i>
              {{ selectedDay?.fullDate }} 근무 현황
            </h3>
            <button class="modal-close" @click="modal.daily = false"><i class="mdi mdi-close"></i></button>
          </div>

          <div class="modal-body list-body">
            <div class="daily-action-bar">
              <p class="summary-text">총 <strong>{{ selectedDay?.schedules.length }}</strong>건</p>
              <button class="btn-submit small-btn" @click="openCreateModal">
                <i class="mdi mdi-plus-circle-outline"></i> 수동 등록
              </button>
            </div>

            <div class="daily-list custom-scrollbar">
              <div v-if="selectedDay?.schedules.length === 0" class="empty-state">
                <i class="mdi mdi-inbox-outline"></i>
                <p>등록된 근무 내역이 없습니다.</p>
              </div>

              <div
                  v-else
                  v-for="(sch, i) in selectedDay.schedules" :key="i"
                  class="daily-list-item"
              >
                <div class="worker-info">
                  <div class="worker-avatar"><i class="mdi mdi-account"></i></div>
                  <span class="staff-name">{{ sch.staffName }}</span>
                </div>

                <div class="record-actions">
                  <span :class="['status-badge', getStatusClass(sch.workType)]">
                    {{ getWorkTypeName(sch.workType) }}
                  </span>
                  <!-- 수정 버튼 -->
                  <button class="btn-icon edit" @click="openEditModal(sch)" title="수정">
                    <i class="mdi mdi-pencil-outline"></i>
                  </button>
                  <!-- 삭제 버튼 -->
                  <button class="btn-icon delete" @click="deleteRecord(sch)" title="삭제">
                    <i class="mdi mdi-trash-can-outline"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </transition>

    <!-- ================================================================ -->
    <!-- 모달: 근태 등록/수정                                               -->
    <!-- ================================================================ -->
    <transition name="fade">
      <div v-if="modal.form" class="modal-overlay" @click.self="modal.form = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">
              <i class="mdi mdi-calendar-plus"></i>
              {{ form.idx ? '근태 수정' : '근태 수동 등록' }}
            </h3>
            <button class="modal-close" @click="modal.form = false"><i class="mdi mdi-close"></i></button>
          </div>

          <div class="modal-body">
            <div class="info-box">
              <strong>날짜 :</strong> {{ form.workStartDt }}
            </div>

            <!-- 신규 등록일 때만 직원 선택 -->
            <div v-if="!form.idx" class="form-group">
              <label>직원 선택</label>
              <MemberSelect v-model="form.mIdx" :options="staffList" />
            </div>
            <!-- 수정일 때는 직원 이름 표시 -->
            <div v-else class="info-box">
              <strong>직원 :</strong> {{ selectedRecord?.staffName }}
            </div>

            <div class="form-group">
              <label>근태 유형</label>
              <div class="type-selector">
                <label v-for="type in ['work','holiday','annual','half','absent']" :key="type" class="type-option">
                  <input type="radio" v-model="form.workType" :value="type">
                  <div :class="['option-card', type]">
                    <i :class="['mdi', {
                      'mdi-check-circle-outline':  type === 'work',
                      'mdi-star-circle-outline':   type === 'holiday',
                      'mdi-beach':                 type === 'annual',
                      'mdi-clock-outline':         type === 'half',
                      'mdi-account-remove-outline':type === 'absent',
                    }]"></i>
                    {{ getWorkTypeName(type) }}
                  </div>
                </label>
              </div>
            </div>

            <div class="form-group">
              <label>비고</label>
              <input v-model="form.bigo" class="input-text" placeholder="비고 입력 (선택)">
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" @click="modal.form = false">취소</button>
            <button class="btn-submit" @click="saveSchedule">
              {{ form.idx ? '수정하기' : '등록하기' }}
            </button>
          </div>
        </div>
      </div>
    </transition>

    <!-- ================================================================ -->
    <!-- 모달: 일괄 생성 확인                                               -->
    <!-- ================================================================ -->
    <transition name="fade">
      <div v-if="modal.bulk" class="modal-overlay" @click.self="modal.bulk = false">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title">
              <i class="mdi mdi-calendar-multiselect text-blue"></i> 월 일괄 근태 생성
            </h3>
            <button class="modal-close" @click="modal.bulk = false"><i class="mdi mdi-close"></i></button>
          </div>
          <div class="modal-body">
            <div class="info-box warning">
              <i class="mdi mdi-alert-circle-outline"></i>
              <span>
                <strong>{{ currentSiteName }}</strong>의
                <strong>{{ monthTitle }}</strong> 근태 기록을 전부 삭제하고
                계약 스케줄 기준으로 재등록합니다.
              </span>
            </div>
            <div class="info-box">
              <i class="mdi mdi-information-outline" style="margin-right:6px;"></i>
              퇴사자는 퇴사일까지만 등록됩니다. 연차·결근 등 예외사항은 등록 후 개별 수정해주세요.
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="modal.bulk = false">취소</button>
            <button class="btn-submit" @click="executeBulkGenerate">실행</button>
          </div>
        </div>
      </div>
    </transition>

  </div>
</template>

<style scoped>
.filter-row { margin-bottom: 0 }

/* ── 네비게이션 ── */
.nav-controls { display: flex; align-items: center; gap: 10px; background: var(--bg-surface); padding: 6px 12px; border-radius: 8px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); }
.btn-nav { width: 32px; height: 32px; border-radius: 6px; border: none; background: var(--bg-canvas); color: var(--text-sub); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
.btn-nav:hover { background: var(--bg-hover); color: var(--text-main); }
.current-month-label { font-size: 15px; font-weight: 700; color: var(--text-main); min-width: 100px; text-align: center; }
.btn-today { padding: 6px 14px; background: var(--bg-canvas); color: var(--text-sub); border: 1px solid var(--border-color); border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; }
.btn-today:hover { background: var(--bg-hover); color: var(--text-main); }

/* ── 일괄 생성 버튼 ── */
.btn-bulk { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; border-radius: 8px; font-size: 13px; font-weight: 700; cursor: pointer; border: none; background: var(--primary); color: #fff; box-shadow: var(--shadow-sm); transition: all 0.2s; margin-left: auto; }
.btn-bulk:hover:not(:disabled) { filter: brightness(0.9); transform: translateY(-1px); }
.btn-bulk:disabled { opacity: 0.6; cursor: not-allowed; }

/* ── 캘린더 ── */
.calendar-card { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); position: relative; overflow: hidden; }
.calendar-grid-header { display: grid; grid-template-columns: repeat(7, 1fr); background: var(--bg-canvas); border-bottom: 1px solid var(--border-color); }
.day-name { padding: 14px 0; text-align: center; font-size: 13px; font-weight: 600; color: var(--text-sub); }
.day-name.sun { color: var(--danger); }
.day-name.sat { color: var(--primary); }
.text-red  { color: var(--danger)  !important; }
.text-blue { color: var(--primary) !important; }
.mobile-day-name { display: none; }

.calendar-grid-body { display: grid; grid-template-columns: repeat(7, 1fr); background: var(--border-color); gap: 1px; }
.day-cell { background: var(--bg-surface); height: 140px; cursor: pointer; transition: background 0.2s; }
.day-cell:hover { background: var(--bg-hover); }
.day-cell.empty { background: var(--bg-canvas); cursor: default; }

.cell-content { padding: 10px; height: 100%; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; }
.day-header { display: flex; justify-content: space-between; align-items: flex-start; }
.date-group { display: flex; flex-direction: column; }
.date-num { font-size: 14px; font-weight: 600; color: var(--text-main); }
.today .date-num { background: var(--success); color: #fff !important; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; border-radius: 50%; margin: -3px 0 0 -3px; }
.detail-icon { color: var(--text-muted); font-size: 16px; opacity: 0; transition: all 0.2s; }
.day-cell:hover .detail-icon { opacity: 1; color: var(--primary); }

.summary-container { flex: 1; display: flex; flex-direction: column; gap: 4px; margin-top: 8px; overflow-y: auto; padding-right: 2px; }
.summary-badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; display: flex; justify-content: space-between; }
.summary-badge.work    { background: var(--primary-soft); color: var(--primary); }
.summary-badge.holiday { background: #e0f2f1; color: #00796b; }
.summary-badge.leave   { background: #fff9c4; color: #f57f17; }
.summary-badge.half    { background: #fff9c4; color: #f57f17; }
.summary-badge.absent  { background: #ffebee; color: #d32f2f; }
.empty-cell-hint { opacity: 0; flex: 1; display: flex; align-items: center; justify-content: center; font-size: 18px; color: var(--text-muted); transition: opacity 0.2s; }
.day-cell:hover .empty-cell-hint { opacity: 1; }

/* ── 모달 공통 ── */
.modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.6); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; }
.modal-card { background: var(--bg-surface); width: 100%; max-width: 450px; border-radius: 16px; border: 1px solid var(--border-color); box-shadow: var(--shadow-md); overflow: hidden; }
.modal-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 24px; border-bottom: 1px solid var(--border-color); }
.modal-title { font-size: 15px; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px; margin: 0; }
.modal-close { background: transparent; border: none; color: var(--text-muted); cursor: pointer; font-size: 20px; display: flex; align-items: center; padding: 4px; border-radius: 4px; transition: 0.2s; }
.modal-close:hover { background: var(--bg-hover); color: var(--text-main); }
.modal-body { padding: 24px; display: flex; flex-direction: column; gap: 16px; }
.modal-footer { padding: 16px 24px; border-top: 1px solid var(--border-color); display: flex; gap: 10px; }
.modal-footer button { flex: 1; padding: 12px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: none; transition: 0.2s; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; transform: translateY(10px); }

/* ── 정보 박스 ── */
.info-box { background: var(--bg-canvas); padding: 12px 16px; border-radius: 8px; font-size: 13px; color: var(--text-sub); border: 1px solid var(--border-color); }
.info-box.warning { background: rgba(245,158,11,0.1); color: var(--warning); border-color: var(--warning); display: flex; gap: 10px; align-items: flex-start; }

/* ── 일별 현황 리스트 ── */
.list-body { gap: 12px; }
.daily-action-bar { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid var(--border-color); }
.summary-text { font-size: 13px; color: var(--text-sub); margin: 0; }
.summary-text strong { color: var(--text-main); font-size: 15px; }
.small-btn { padding: 8px 14px !important; font-size: 12px !important; border-radius: 6px !important; flex: none !important; }

.daily-list { max-height: 300px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
.daily-list-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; background: var(--bg-surface); border-radius: 8px; border: 1px solid var(--border-color); transition: border-color 0.2s; }
.daily-list-item:hover { border-color: var(--border-focus); }
.worker-info { display: flex; align-items: center; gap: 10px; }
.worker-avatar { width: 28px; height: 28px; background: var(--bg-canvas); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--text-sub); font-size: 14px; }
.staff-name { font-weight: 600; color: var(--text-main); font-size: 13px; }

.record-actions { display: flex; align-items: center; gap: 6px; }
.status-badge { font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 4px; }
.status-badge.work    { background: var(--primary-soft); color: var(--primary); }
.status-badge.holiday { background: #e0f2f1; color: #00796b; }
.status-badge.leave   { background: #fff9c4; color: #f57f17; }
.status-badge.half    { background: #fff9c4; color: #f57f17; }
.status-badge.absent  { background: #ffebee; color: #d32f2f; }

/* 수정/삭제 아이콘 버튼 */
.btn-icon { width: 28px; height: 28px; border: none; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: all 0.2s; background: transparent; }
.btn-icon.edit   { color: var(--text-sub); }
.btn-icon.edit:hover   { background: var(--primary-soft); color: var(--primary); }
.btn-icon.delete { color: var(--text-sub); }
.btn-icon.delete:hover { background: #ffebee; color: #d32f2f; }

/* ── 폼 요소 ── */
.form-group label { font-size: 13px; font-weight: 600; color: var(--text-sub); margin-bottom: 8px; display: block; }
.input-text { width: 100%; padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); box-sizing: border-box; outline: none; transition: 0.2s; }
.input-text:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }

.type-selector { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
.type-option input { display: none; }
.option-card { padding: 10px 0; border: 1px solid var(--border-color); border-radius: 8px; text-align: center; font-size: 11px; font-weight: 600; color: var(--text-sub); cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; gap: 4px; background: var(--bg-surface); }
.option-card i { font-size: 18px; }
.type-option input:checked + .option-card.work    { border-color: var(--primary); color: var(--primary); background: var(--primary-soft); }
.type-option input:checked + .option-card.holiday { border-color: #00796b; color: #00796b; background: #e0f2f1; }
.type-option input:checked + .option-card.annual  { border-color: #f57f17; color: #f57f17; background: #fff9c4; }
.type-option input:checked + .option-card.half    { border-color: #f57f17; color: #f57f17; background: #fff9c4; }
.type-option input:checked + .option-card.absent  { border-color: #d32f2f; color: #d32f2f; background: #ffebee; }

.btn-cancel { background: var(--bg-canvas); color: var(--text-sub); border: 1px solid var(--border-color) !important; }
.btn-cancel:hover { background: var(--bg-hover); }
.btn-submit { background: var(--primary); color: #fff; }
.btn-submit:hover { filter: brightness(0.9); }

/* ── 로더 ── */
.loader-overlay { position: absolute; inset: 0; background: var(--bg-surface); opacity: 0.8; display: flex; align-items: center; justify-content: center; z-index: 10; }
.spinner { width: 32px; height: 32px; border: 3px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 24px; color: var(--text-muted); font-size: 13px; }
.empty-state i { font-size: 32px; }

.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 4px; }

/* ── 반응형 ── */
@media (max-width: 1024px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 16px; }
  .filter-row { flex-direction: column; }
  .btn-bulk { width: 100%; justify-content: center; }
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
  .calendar-grid-header { display: none; }
  .calendar-grid-body { display: flex; flex-direction: column; gap: 0; background: transparent; }
  .day-cell { height: auto; min-height: 70px; border-bottom: 1px solid var(--border-color); }
  .day-cell.empty { display: none; }
  .cell-content { flex-direction: row; align-items: center; padding: 12px 16px; gap: 16px; overflow: visible; }
  .day-header { width: 60px; flex-direction: column; align-items: center; border-right: 1px solid var(--border-color); padding-right: 12px; flex-shrink: 0; }
  .mobile-day-name { display: block; font-size: 12px; color: var(--text-sub); font-weight: 600; }
  .summary-container { flex-direction: row; flex-wrap: wrap; margin-top: 0; overflow: visible; }
  .type-selector { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 480px) {
  .stats-grid { grid-template-columns: 1fr 1fr; }
}
</style>
