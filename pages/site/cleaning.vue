<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';

const { siteOptions, fetchSiteOptions } = useApi();

/* =========================================================================
 * 상수
 * ========================================================================= */
const DAY_MS = 86400000;
const WARN_AFTER_MONTHS = 4; // 요구사항 7: 구간 시작 후 4개월 경과하면 경고

const STATUS_LABEL = { 0: '예정', 1: '확정', 2: '진행중', 3: '완료', 4: '취소' };
const DOC_STATUS_LABEL = { 0: '미발송', 1: '발송', 2: '일부확인', 3: '확인완료' };
const RECEIPT_TYPE_LABEL = { SITE: '단지', MANAGER: '담당자' };

// 투입 장비 — 여러 개 선택 가능. 항목을 늘리려면 여기에만 추가하면 된다.
const EQUIPMENT_OPTIONS = ['고압세척기', '사다리차'];

const fmtDate = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addMonths = (d, m) => {
  const n = new Date(d);
  n.setMonth(n.getMonth() + m);
  return n;
};
const todayStr = () => fmtDate(new Date());
const nowStamp = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

/* =========================================================================
 * 0. 탭
 * ========================================================================= */
const activeTab = ref('calendar'); // calendar | status | workload | assign | documents

const tabDescriptions = {
  calendar: '날짜를 클릭해 일정을 등록하세요. 공문 확인이 끝나지 않은 일정은 점선으로 표시됩니다.',
  status: '현장별로 계약 주기 안에서 몇 회를 실시했는지, 남은 횟수와 소요일을 확인하세요.',
  workload: '현장별 월 소요일 합계와, 계약 소요일 대비 실제 등록/완료 소요일을 비교해서 보여줍니다.',
  assign: '카드의 "인원 편집"은 일정 전체 날짜에 한 번에 배정합니다. 날짜별로 다르게 넣으려면 카드를 열어 일차별 표에서 편집하세요.',
  documents: '발송할 공문을 확인하고, 단지·담당자 두 곳의 수신확인 상태를 관리하세요.'
};

/* =========================================================================
 * 1. 달력
 * ========================================================================= */
const currentDate = ref(new Date());

const currentYearMonth = computed(
    () => `${currentDate.value.getFullYear()}년 ${currentDate.value.getMonth() + 1}월`
);

const prevMonth = () => {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 1, 1);
};
const today = () => { currentDate.value = new Date(); };
const nextMonth = () => {
  currentDate.value = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() + 1, 1);
};

const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const days = [];

  // 요일/공휴일 플래그를 붙여서 반환 (달력 셀에 시각 표시용)
  const withDayFlags = (dateStr, extra) => {
    const { isSat, isSun, isHoliday, holidayName } = getDayFlags(dateStr);
    return { dateStr, isSaturday: isSat, isSunday: isSun, isHoliday, holidayName, ...extra };
  };

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(withDayFlags(fmtDate(d), { date: d.getDate(), isCurrentMonth: false }));
  }
  for (let i = 1; i <= lastDate; i++) {
    const d = new Date(year, month, i);
    days.push(withDayFlags(fmtDate(d), {
      date: i,
      isCurrentMonth: true,
      isToday: fmtDate(d) === todayStr()
    }));
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push(withDayFlags(fmtDate(d), { date: i, isCurrentMonth: false }));
  }
  return days;
});

// 화면에 보이는 6주 범위 (레인 계산을 이 범위로 한정해 빈 스페이서 폭증을 막음)
const visibleRange = computed(() => ({
  from: calendarDays.value[0]?.dateStr ?? todayStr(),
  to: calendarDays.value[41]?.dateStr ?? todayStr()
}));

/* =========================================================================
 * 2. 마스터 데이터 (작업자 / 관리자)
 *    - 이전에는 '팀' 단위(팀장/팀원 편성)로 일정을 배정했지만,
 *      같은 팀이어도 날마다 투입 인원 수가 달라질 수 있어 이제는
 *      개인 작업자(cleaningStaff)를 일정에 직접 여러 명 배정하는 방식으로 바꾼다.
 * ========================================================================= */
const cleaningStaff = ref([]);
const managers = ref([]);

const getStaffName = (staffIdx) => cleaningStaff.value.find((s) => s.idx === staffIdx)?.name || '-';
const getStaffNames = (staffIds) =>
    (staffIds || []).map(getStaffName).filter((name) => name !== '-').join(', ');
const getManagerName = (mnIdx) => managers.value.find((m) => m.idx === mnIdx)?.name || '-';

// 일정 전체 합집합만 보면 날마다 인원 수가 다른 게 안 보이므로,
// "1일차 2명 · 2일차 1명"처럼 날짜별 인원수를 한 줄로 요약해서 보여주기 위한 헬퍼.
const getDailyStaffSummary = (schedule) => {
  const days = (schedule.dailyTasks || []).filter((d) => !d.excluded);
  if (!days.length) return '';
  return days.map((d) => `${d.dayIndex}일차 ${(d.staffIds || []).length}명`).join(' · ');
};
// 날마다 인원 수가 실제로 다른 경우에만 별도 요약을 보여주기 위한 판정
const hasVaryingDailyStaff = (schedule) => {
  const counts = (schedule.dailyTasks || []).filter((d) => !d.excluded).map((d) => (d.staffIds || []).length);
  return new Set(counts).size > 1;
};

// 팀장 관련 헬퍼 — 팀장은 "그날 배정된 인원 중" 한 명으로 날짜마다 다를 수 있다.
// 모든 날짜의 팀장이 같은 사람이면 그 이름을, 날짜마다 다르면 안내 문구를, 아예 없으면 빈 문자열을 반환.
const getScheduleLeaderName = (schedule) => {
  const days = (schedule.dailyTasks || []).filter((d) => !d.excluded && d.leaderId);
  if (!days.length) return '';
  const ids = new Set(days.map((d) => d.leaderId));
  return ids.size === 1 ? getStaffName([...ids][0]) : '일차별로 다름';
};
// 이 사람이 "어느 날짜에라도" 팀장으로 지정돼 있는지 — 목록/카드에서 왕관 표시용
const isScheduleLeaderAnyDay = (schedule, staffIdx) =>
    (schedule.dailyTasks || []).some((d) => !d.excluded && d.leaderId === staffIdx);

const fetchCleaningStaff = async () => {
  try {
    const { data } = await axios.get('/api/v1/member/cleaning');
    cleaningStaff.value = data.data || [];
  } catch (e) {
    console.error('청소 인력 로드 실패:', e);
    cleaningStaff.value = [];
  }
};

// 관리자 목록: API 우선, 실패 시 최소 동작을 위한 폴백
const fetchManagers = async () => {
  try {
    const { data } = await axios.get('/api/v1/member/manager');
    const list = data.data || [];
    if (list.length) {
      managers.value = list.map((m) => ({ idx: m.idx, name: m.name }));
      return;
    }
    throw new Error('empty');
  } catch (e) {
    console.warn('관리자 목록 API 미연동 — 폴백 사용');
    managers.value = [
      { idx: 28, name: '강태웅' }, { idx: 29, name: '박승문' }, { idx: 30, name: '유재준' },
      { idx: 31, name: '조용우' }, { idx: 32, name: '허주범' }, { idx: 33, name: '황재춘' }
    ];
  }
};

/* =========================================================================
 * 2-1. 공휴일 (요구사항: 토/일/공휴일 포함 여부 체크박스)
 *      API 우선, 실패 시 폴백 목록 사용 (폴백은 정확하지 않을 수 있음)
 * ========================================================================= */
const holidays = ref([]);              // 공휴일 캐시: [{ date: 'YYYY-MM-DD', name: '신정' }, ...]
const loadedHolidayYears = ref(new Set()); // 이미 요청한 연도 (중복/실패 스팸 방지)

// 백엔드 /api/v1/common/holiday?year=YYYY 는 공공데이터포털
// "한국천문연구원_특일 정보(getRestDeInfo)" 를 프록시하며,
// { result: true, data: [{ date: "2026-01-01", name: "신정" }, ...] } 형태로 응답한다고 가정한다.
// (구버전 백엔드가 문자열 배열만 줄 수도 있어 방어적으로 처리)
// 해당 API는 월 단위 조회만 지원하므로, 연도 단위 취합/캐싱은 백엔드에서 처리한다.
const ensureHolidaysLoaded = async (year) => {
  if (!year || loadedHolidayYears.value.has(year)) return;
  loadedHolidayYears.value.add(year); // 실패해도 같은 연도로 재요청이 반복되지 않도록 먼저 마킹

  try {
    const { data } = await axios.get('/api/v1/common/holiday', { params: { year } });
    const list = (data.data || []).map((h) =>
        typeof h === 'string'
            ? { date: h.slice(0, 10), name: '' }
            : { date: String(h.date).slice(0, 10), name: h.name || '' }
    );
    const merged = new Map(holidays.value.map((h) => [h.date, h]));
    list.forEach((h) => merged.set(h.date, h));
    holidays.value = Array.from(merged.values());
  } catch (e) {
    console.warn(`${year}년 공휴일 API 호출 실패 — 해당 연도는 공휴일이 반영되지 않습니다.`, e);
  }
};

// 달력에 표시되는 연도가 바뀔 때마다 그 해의 공휴일을 자동 로드
watch(currentDate, (d) => ensureHolidaysLoaded(d.getFullYear()), { immediate: true });

// 날짜 하나의 토/일/공휴일 여부 (+ 공휴일이면 이름도 함께 반환)
const getDayFlags = (dateStr) => {
  const day = new Date(dateStr).getDay();
  const holiday = holidays.value.find((h) => h.date === dateStr);
  return {
    isSat: day === 6,
    isSun: day === 0,
    isHoliday: !!holiday,
    holidayName: holiday?.name || ''
  };
};

// 폼(form)의 포함 여부 체크박스를 기준으로 해당 날짜가 제외 대상인지 판정
const isDayExcluded = (dateStr, form) => {
  const { isSat, isSun, isHoliday } = getDayFlags(dateStr);
  if (isSat && !form.includeSat) return true;
  if (isSun && !form.includeSun) return true;
  if (isHoliday && !form.includeHoliday) return true;
  return false;
};

const dayTypeLabel = (dateStr) => {
  const { isSat, isSun, isHoliday } = getDayFlags(dateStr);
  if (isHoliday) return '공휴일';
  if (isSun) return '일요일';
  if (isSat) return '토요일';
  return '';
};

/* =========================================================================
 * 3. 일정 데이터
 * ========================================================================= */
const cleaningSchedules = ref([]);

const normalizeSchedule = (s) => {
  const startDt = s.startDt ? String(s.startDt).slice(0, 10) : '';
  const endDt = s.endDt ? String(s.endDt).slice(0, 10) : startDt;
  const durationDays =
      Number(s.durationDays) ||
      (startDt && endDt ? Math.floor((new Date(endDt) - new Date(startDt)) / DAY_MS) + 1 : 1);

  // 여러 작업자를 배정할 수 있어 DB에는 "3,7,12"처럼 콤마로 저장하고, 화면에서는 배열로 다룬다.
  const rawStaffIds = s.staffIds
      ? String(s.staffIds).split(',').map((v) => Number(v.trim())).filter((n) => !Number.isNaN(n))
      : [];

  let dailyTasksRaw = [];
  if (s.dailyTasksJson) {
    try {
      dailyTasksRaw = typeof s.dailyTasksJson === 'string' ? JSON.parse(s.dailyTasksJson) : s.dailyTasksJson;
    } catch { dailyTasksRaw = []; }
  }
  if (!Array.isArray(dailyTasksRaw)) dailyTasksRaw = [];

  // 요구사항: "2일 일정인데 1일차엔 김AA, 2일차엔 빠짐" 처럼 날짜별로 투입 인원이 달라질 수 있어
  // 일차별 작업내용(dailyTasks)에 그날의 staffIds를 함께 저장한다.
  // 옛 데이터(일차별 staffIds가 없는 경우)는 일정 전체 staffIds를 그대로 물려받게 폴백 처리.
  // leaderId: 그날 배정된 인원 중 "팀장"으로 지정된 사람 (없으면 null)
  const dailyTasks = dailyTasksRaw.map((d) => {
    const staffIds = Array.isArray(d.staffIds) ? d.staffIds : [...rawStaffIds];
    let leaderId = d.leaderId ?? null;
    if (leaderId && !staffIds.includes(leaderId)) leaderId = null; // 그날 배정 안 된 사람이 팀장일 수는 없음
    return { ...d, staffIds, leaderId };
  });

  // 일정 전체 staffIds는 "일차별로 한 번이라도 투입된 사람 전원" (합집합)으로 계산한다.
  // 달력/필터/공문/충돌검사처럼 "이 일정에 누가 관여했는지" 개괄적으로 봐야 하는 곳에서 사용.
  const unionStaffIds = dailyTasks.length
      ? Array.from(new Set(dailyTasks.filter((d) => !d.excluded).flatMap((d) => d.staffIds || [])))
      : rawStaffIds;

  return {
    ...s,
    // 같은 A팀이어도 날마다 투입 인원 수가 다를 수 있어, 팀 단위가 아니라 일정마다(그리고 날짜마다) 개인을 배정한다.
    staffIds: unionStaffIds,
    mnIdx: s.mnIdx ?? null,
    status: Number(s.status ?? 0),
    startDt,
    endDt,
    startTm: s.startTm || '',
    endTm: s.endTm || '',
    durationDays,
    // 여러 장비를 선택할 수 있어 DB에는 "고압세척기,사다리차"처럼 콤마로 저장하고, 화면에서는 배열로 다룬다
    equipment: s.equipment ? String(s.equipment).split(',').map((v) => v.trim()).filter(Boolean) : [],
    memo: s.memo || '',
    address: s.address || '',
    siteName: s.siteName || '',
    itemName: s.itemName || '',
    docRequired: s.docRequired === 'Y' || s.docRequired === true,
    docStatus: Number(s.docStatus ?? 0),
    docLeadDays: Number(s.docLeadDays ?? 7),
    includeSat: s.includeSat === 'N' || s.includeSat === false ? false : true,
    includeSun: s.includeSun === 'N' || s.includeSun === false ? false : true,
    includeHoliday: s.includeHoliday === 'N' || s.includeHoliday === false ? false : true,
    dailyTasks
  };
};

const fetchSchedules = async () => {
  try {
    const { data } = await axios.get('/api/v1/site/cleaning/schedule');
    cleaningSchedules.value = (data.data || []).map(normalizeSchedule);
  } catch (e) {
    console.error('일정 로드 실패:', e);
  }
};

/* =========================================================================
 * 4. 현장 계약 설정 (cleaningConfig)
 *    계약 탭에서 durationDays / isService / cyclePerYear / cycleMonths /
 *    docRequired 를 입력받는다. 없으면 안전한 기본값으로 폴백.
 * ========================================================================= */
const siteContracts = computed(() => {
  if (!siteOptions.value) return [];

  const result = [];
  siteOptions.value.forEach((site) => {
    const configs = [];

    (site.contracts || []).forEach((contract) => {
      let raw = contract.cleaningConfig;
      if (typeof raw === 'string' && raw.trim()) {
        try { raw = JSON.parse(raw); } catch { raw = []; }
      }
      if (!Array.isArray(raw)) return;

      raw.forEach((c) => {
        configs.push({
          code: c.code,
          name: c.name,
          count: Number(c.count) || 1,
          durationDays: Number(c.durationDays) || 1,
          isService: c.isService === true || c.isService === 1 || c.isService === 'Y',
          cycleMonths: Number(c.cycleMonths) || 12,
          cycleStartDt: (c.cycleStartDt || contract.startDt || contract.contractStart || '')?.slice(0, 10) || null,
          docRequired: c.docRequired === true || c.docRequired === 'Y',
          docLeadDays: Number(c.docLeadDays) || 7
        });
      });
    });

    if (!configs.length) return;

    const merged = [];
    configs.forEach((conf) => {
      const found = merged.find((m) => m.code === conf.code);
      if (found) {
        found.count += conf.count;
        found.docRequired = found.docRequired || conf.docRequired;
      } else {
        merged.push({ ...conf });
      }
    });

    result.push({
      sIdx: site.idx ?? site.sIdx,
      siteName: site.name,
      address: site.address || '',
      cleaningConfig: merged
    });
  });
  return result;
});

const findConfig = (sIdx, itemCd) => {
  const site = siteContracts.value.find((s) => s.sIdx === sIdx);
  return site?.cleaningConfig.find((c) => c.code === itemCd) || null;
};

/* =========================================================================
 * 5. 계약 주기 & 실시/미실시 판정 (요구사항 2, 7)
 *    - 달력연도가 아니라 "계약 실시일 ~ +cycleMonths" 를 기준으로 판정
 *    - 주기를 count 등분해 구간별로 실시 여부를 본다 (연 2회 → 상/하반기)
 *    - 구간 시작 후 4개월이 지났는데 미실시면 경고
 * ========================================================================= */
const getCycleRange = (cycleStartDt, cycleMonths) => {
  if (!cycleStartDt) return null;

  const origin = new Date(cycleStartDt);
  const now = new Date();

  // 계약 시작이 과거라면 현재 진행 중인 주기까지 굴린다
  let start = new Date(origin);
  let end = addMonths(start, cycleMonths);
  let guard = 0;
  while (end <= now && guard++ < 100) {
    start = new Date(end);
    end = addMonths(start, cycleMonths);
  }
  const endInclusive = new Date(end.getTime() - DAY_MS);

  return {
    start: fmtDate(start),
    end: fmtDate(endInclusive),
    label: cycleMonths % 12 === 0 ? `${cycleMonths / 12}년 주기` : `${cycleMonths}개월 주기`,
    isFuture: start > now
  };
};

const segmentLabel = (i, count) => {
  if (count === 1) return '주기';
  if (count === 2) return ['상반기', '하반기'][i];
  return `${i + 1}차`;
};

const buildCycleSegments = (range, count) => {
  if (!range || count < 1) return [];
  const start = new Date(range.start).getTime();
  const total = new Date(range.end).getTime() + DAY_MS - start;
  const segs = [];

  for (let i = 0; i < count; i++) {
    const sMs = start + (total * i) / count;
    const eMs = start + (total * (i + 1)) / count - DAY_MS;
    const sDate = new Date(sMs);
    segs.push({
      label: segmentLabel(i, count),
      start: fmtDate(sDate),
      end: fmtDate(new Date(eMs)),
      warnFrom: fmtDate(addMonths(sDate, WARN_AFTER_MONTHS))
    });
  }
  return segs;
};

/* =========================================================================
 * 6. 현장별 실시현황 (요구사항 1, 2, 7)
 * ========================================================================= */
const cleaningStatusBySite = computed(() => {
  const today = todayStr();

  return siteContracts.value.map((site) => {
    const siteSchedules = cleaningSchedules.value.filter((s) => s.sIdx === site.sIdx);

    const tasks = site.cleaningConfig.map((config) => {
      const cycleRange = getCycleRange(config.cycleStartDt, config.cycleMonths);

      // 주기 범위 안의 일정만 집계 (요구사항 2). 취소된 일정은 실제로 진행되지 않으므로 제외.
      const inCycle = siteSchedules.filter((s) => {
        if (s.itemCd !== config.code) return false;
        if (Number(s.status) === 4) return false;
        if (!cycleRange) return true;
        return s.startDt >= cycleRange.start && s.startDt <= cycleRange.end;
      });

      const planned = inCycle;                              // 등록된 일정 (계획)
      const done = inCycle.filter((s) => s.status === 3);    // 실제 실시 완료

      const segments = buildCycleSegments(cycleRange, config.count).map((seg) => {
        const segDone = done.some((s) => s.startDt >= seg.start && s.startDt <= seg.end);
        const segPlanned = planned.some((s) => s.startDt >= seg.start && s.startDt <= seg.end);
        return {
          ...seg,
          done: segDone,
          planned: segPlanned,
          warning: !segDone && today >= seg.warnFrom
        };
      });

      const warnings = segments.filter((s) => s.warning).map((s) => s.label);

      return {
        code: config.code,
        name: config.name,
        isService: config.isService,
        docRequired: config.docRequired,

        // 요구사항 1: 횟수 + 회당 소요일 + 누적 소요일
        total: config.count,
        plannedCount: planned.length,
        doneCount: done.length,
        remain: Math.max(0, config.count - planned.length),
        durationDays: config.durationDays,
        totalDurationDays: config.durationDays * config.count,
        plannedDurationDays: planned.reduce((a, s) => a + (s.durationDays || 0), 0),
        doneDurationDays: done.reduce((a, s) => a + (s.durationDays || 0), 0),

        // 요구사항 2, 7
        cycleRange,
        segments,
        warnings,
        warning: warnings.length > 0,
        warningPeriod: warnings.join(', ')
      };
    });

    return {
      sIdx: site.sIdx,
      siteName: site.siteName,
      tasks,
      isAllCompleted: tasks.length > 0 && tasks.every((t) => t.doneCount >= t.total),
      remainCount: tasks.filter((t) => t.remain > 0).length,
      warningCount: tasks.filter((t) => t.warning).length,
      // 요구사항 8: 현장 단위 소요일 합계
      siteTotalDays: tasks.reduce((a, t) => a + t.totalDurationDays, 0),
      sitePlannedDays: tasks.reduce((a, t) => a + t.plannedDurationDays, 0)
    };
  });
});

const statusSearch = ref('');
const statusOnlyRemaining = ref(false);
const statusOnlyWarning = ref(false);
const expandedSiteIdx = ref(new Set());

const filteredStatusSites = computed(() => {
  const kw = statusSearch.value.trim().toLowerCase();
  return cleaningStatusBySite.value
      .filter((site) => {
        if (!kw) return true;
        if (site.siteName.toLowerCase().includes(kw)) return true;
        return site.tasks.some((t) => t.name.toLowerCase().includes(kw));
      })
      .filter((site) => !statusOnlyRemaining.value || site.remainCount > 0)
      .filter((site) => !statusOnlyWarning.value || site.warningCount > 0)
      .sort((a, b) => b.warningCount - a.warningCount);
});

const toggleSiteExpand = (sIdx) => {
  const next = new Set(expandedSiteIdx.value);
  next.has(sIdx) ? next.delete(sIdx) : next.add(sIdx);
  expandedSiteIdx.value = next;
};
const isSiteExpanded = (sIdx) => expandedSiteIdx.value.has(sIdx);
const expandAllSites = () => {
  expandedSiteIdx.value = new Set(filteredStatusSites.value.map((s) => s.sIdx));
};
const collapseAllSites = () => { expandedSiteIdx.value = new Set(); };

// 미실시 경고 총계 (헤더 배지)
const totalWarningCount = computed(
    () => cleaningStatusBySite.value.reduce((a, s) => a + s.warningCount, 0)
);

/* =========================================================================
 * 7. 캘린더 필터 & 레인 배치 (요구사항 3, 4, 6)
 * ========================================================================= */
const filterMode = ref('all');       // all | staff | manager
const filterStaffIdx = ref('');
const filterManagerIdx = ref('');
const docFilter = ref('all');        // all | confirmed | pending

const isDocPending = (s) => s.docRequired && s.docStatus < 3;

const calendarFilteredSchedules = computed(() =>
    cleaningSchedules.value
        .filter((s) => {
          if (filterMode.value === 'staff' && filterStaffIdx.value !== '' && !(s.staffIds || []).includes(filterStaffIdx.value)) return false;
          if (filterMode.value === 'manager' && filterManagerIdx.value !== '' && s.mnIdx !== filterManagerIdx.value) return false;
          // 요구사항 6: 3자 확인 완료분만 보기 / 대기분만 보기
          if (docFilter.value === 'confirmed' && isDocPending(s)) return false;
          if (docFilter.value === 'pending' && !isDocPending(s)) return false;
          return true;
        })
        .sort((a, b) => a.startDt.localeCompare(b.startDt) || a.idx - b.idx)
);

// 보이는 6주에 겹치는 일정만 레인 배치
const visibleSchedules = computed(() => {
  const { from, to } = visibleRange.value;
  return calendarFilteredSchedules.value.filter((s) => s.endDt >= from && s.startDt <= to);
});

const scheduleLaneMap = computed(() => {
  const laneEnd = [];
  const map = {};
  visibleSchedules.value.forEach((s) => {
    let lane = laneEnd.findIndex((end) => end < s.startDt);
    if (lane === -1) lane = laneEnd.length;
    laneEnd[lane] = s.endDt;
    map[s.idx] = lane;
  });
  return map;
});

const maxLaneCount = computed(() => {
  const lanes = Object.values(scheduleLaneMap.value);
  return lanes.length ? Math.max(...lanes) + 1 : 0;
});

const schedulesByDate = computed(() => {
  const byDate = {};
  const lanes = maxLaneCount.value;

  calendarDays.value.forEach((day) => { byDate[day.dateStr] = new Array(lanes).fill(null); });

  visibleSchedules.value.forEach((s) => {
    const lane = scheduleLaneMap.value[s.idx] ?? 0;
    calendarDays.value.forEach((day) => {
      if (day.dateStr < s.startDt || day.dateStr > s.endDt) return;
      const dayIndex = Math.floor((new Date(day.dateStr) - new Date(s.startDt)) / DAY_MS) + 1;
      // 요구사항: 달력/툴팁도 일정 전체 합집합이 아니라 "그 날짜에" 실제로 투입되는 인원만 정확히 보여준다.
      const dayTask = (s.dailyTasks || []).find((d) => d.date === day.dateStr);
      byDate[day.dateStr][lane] = {
        ...s,
        dayIndex,
        isStartDay: dayIndex === 1,
        isEndDay: day.dateStr === s.endDt,
        // 이 일정의 토/일/공휴일 포함여부 체크박스 기준으로 그 날이 제외 대상인지 (요구사항: 달력에서도 비워 보이게)
        isExcludedDay: isDayExcluded(day.dateStr, s),
        dayStaffIds: dayTask ? (dayTask.staffIds || []) : s.staffIds,
        dayLeaderId: dayTask ? (dayTask.leaderId || null) : null
      };
    });
  });
  return byDate;
});

const getSchedulesForDate = (dateStr) => schedulesByDate.value[dateStr] || [];
const cellHasSchedules = (dateStr) => getSchedulesForDate(dateStr).some(Boolean);

const getStatusColor = (status) => {
  if (Number(status) === 4) return '#9ca3af'; // 취소
  if (Number(status) === 3) return 'var(--success, #22c55e)';
  if (Number(status) === 2) return 'var(--warning, #f59e0b)';
  if (Number(status) === 1) return '#0ea5e9';
  return 'var(--primary, #4f46e5)';
};
const statusLabel = (status) => STATUS_LABEL[Number(status)] ?? '-';

/* =========================================================================
 * 8. 작업자 배정 (요구사항 개편)
 *    - 예전엔 일정 하나를 팀 하나에 통째로 배정했지만, 같은 팀이어도
 *      날마다 투입 인원 수가 다를 수 있어 이제는 일정마다 개인 작업자를
 *      여러 명 체크해서 넣는 방식으로 바꾼다. (칸반 드래그앤드롭 대신
 *      일정 카드에서 바로 체크박스로 인원을 편집하는 리스트형 UI)
 * ========================================================================= */
const assignSearch = ref('');
const assignOnlyUnassigned = ref(false);
const editingStaffFor = ref(null); // 현재 인원 편집 패널이 열려있는 일정 idx

// 일자별 실제 투입 인원 인덱스: date -> Map(staffIdx -> [{scheduleIdx, siteName, itemName}])
// 일정 전체가 아니라 "그 날짜에" 누가 이미 다른 일정에 들어가 있는지 정확히 보기 위함.
const staffDateIndex = computed(() => {
  const idx = new Map();
  cleaningSchedules.value.forEach((s) => {
    if (Number(s.status) === 4) return; // 취소된 일정은 실제로 진행되지 않으므로 제외
    (s.dailyTasks || []).forEach((d) => {
      if (d.excluded) return; // 토/일/공휴일 등 제외일은 겹침 대상 아님
      (d.staffIds || []).forEach((staffIdx) => {
        if (!idx.has(d.date)) idx.set(d.date, new Map());
        const byStaff = idx.get(d.date);
        if (!byStaff.has(staffIdx)) byStaff.set(staffIdx, []);
        byStaff.get(staffIdx).push({ scheduleIdx: s.idx, siteName: s.siteName, itemName: s.itemName });
      });
    });
  });
  return idx;
});

// 특정 작업자가 주어진 날짜들 중 이미 다른 일정(=excludeIdx 제외)에 배정된 날짜가 있는지.
// 반환: [{ date, entries: [{scheduleIdx, siteName, itemName}] }, ...]
const getDayConflicts = (staffIdx, dates, excludeIdx = null) => {
  const result = [];
  (dates || []).forEach((date) => {
    const byStaff = staffDateIndex.value.get(date);
    if (!byStaff) return;
    const entries = (byStaff.get(staffIdx) || []).filter((e) => excludeIdx === null || e.scheduleIdx !== excludeIdx);
    if (entries.length) result.push({ date, entries });
  });
  return result;
};

const formatDayConflictList = (dayConflicts) =>
    dayConflicts
        .map(({ date, entries }) => `- ${date}: ${entries.map((e) => `${e.siteName}·${e.itemName}`).join(', ')}`)
        .join('\n');

const scheduleListForAssign = computed(() =>
    cleaningSchedules.value
        .filter((s) => Number(s.status) !== 4)
        .filter((s) => !assignOnlyUnassigned.value || !(s.staffIds && s.staffIds.length))
        .filter((s) => {
          const kw = assignSearch.value.trim().toLowerCase();
          if (!kw) return true;
          return (s.siteName || '').toLowerCase().includes(kw) || (s.itemName || '').toLowerCase().includes(kw);
        })
        .sort((a, b) => a.startDt.localeCompare(b.startDt))
);

const unassignedCount = computed(() =>
    cleaningSchedules.value.filter((s) => Number(s.status) !== 4 && !(s.staffIds && s.staffIds.length)).length
);

const toggleStaffEditor = (idx) => {
  editingStaffFor.value = editingStaffFor.value === idx ? null : idx;
};
const isStaffAssigned = (schedule, staffIdx) => (schedule.staffIds || []).includes(staffIdx);

// 인원 배정 탭의 "인원 편집" 체크박스는 일정에 걸린 모든 (제외일이 아닌) 날짜에 한번에 넣거나 뺀다.
// 특정 날짜만 빼고 싶다("2일차엔 빠짐")면 카드를 열어 상세 모달의 일차별 표에서 편집한다.
// 체크 즉시 저장하고, 실패하면 이전 구성으로 롤백.
const toggleScheduleStaff = async (schedule, staffIdx) => {
  const prevDailyTasks = JSON.parse(JSON.stringify(schedule.dailyTasks || []));
  const prevStaffIds = [...(schedule.staffIds || [])];
  const prevStatus = schedule.status;

  const workDates = prevDailyTasks.filter((d) => !d.excluded).map((d) => d.date);
  const isAdding = !prevStaffIds.includes(staffIdx);

  if (isAdding) {
    const dayConflicts = getDayConflicts(staffIdx, workDates, schedule.idx);
    if (dayConflicts.length > 0) {
      const msg = `${getStaffName(staffIdx)}님은 아래 날짜에 이미 다른 일정에 배정되어 있어 중복으로 배정할 수 없습니다.\n\n${formatDayConflictList(dayConflicts)}`;
      window.customAlert?.(msg, 'error') ?? alert(msg);
      return; // 배정하지 않고 종료
    }
  }

  const nextDailyTasks = prevDailyTasks.map((d) => {
    if (d.excluded) return d;
    const ids = d.staffIds || [];
    const has = ids.includes(staffIdx);
    const nextIds = isAdding ? (has ? ids : [...ids, staffIdx]) : ids.filter((id) => id !== staffIdx);
    // 체크 해제된 사람이 그날의 팀장이었다면 팀장도 함께 해제
    const nextLeaderId = !isAdding && d.leaderId === staffIdx ? null : d.leaderId ?? null;
    return { ...d, staffIds: nextIds, leaderId: nextLeaderId };
  });
  const nextStaffIds = Array.from(
      new Set(nextDailyTasks.filter((d) => !d.excluded).flatMap((d) => d.staffIds || []))
  );

  schedule.dailyTasks = nextDailyTasks;
  schedule.staffIds = nextStaffIds;
  if (nextStaffIds.length > 0 && schedule.status === 0) schedule.status = 1; // 인원 배정 → 확정

  try {
    const { data } = await axios.put(`/api/v1/site/cleaning/schedule/${schedule.idx}`, {
      itemCd: schedule.itemCd,
      startDt: schedule.startDt,
      endDt: schedule.endDt,
      startTm: schedule.startTm,
      endTm: schedule.endTm,
      durationDays: schedule.durationDays,
      mnIdx: schedule.mnIdx,
      memo: schedule.memo,
      staffIds: nextStaffIds.length ? nextStaffIds.join(',') : null,
      status: schedule.status,
      // DB 컬럼은 enum('Y','N') 이라 boolean을 그대로 보내면 저장이 실패할 수 있어 문자열로 변환
      includeSat: schedule.includeSat ? 'Y' : 'N',
      includeSun: schedule.includeSun ? 'Y' : 'N',
      includeHoliday: schedule.includeHoliday ? 'Y' : 'N',
      dailyTasksJson: JSON.stringify(nextDailyTasks)
    });

    if (!data.result) throw new Error(data.data?.error || data.message || '인원 배정 실패');
  } catch (error) {
    console.error('인원 배정 실패:', error);
    schedule.dailyTasks = prevDailyTasks;
    schedule.staffIds = prevStaffIds;
    schedule.status = prevStatus;
    window.customAlert?.('인원 배정에 실패했습니다. 이전 상태로 되돌렸습니다.', 'error');
  }
};

// 인원 배정 탭에서 "전체 날짜 일괄"로 팀장을 지정/해제한다.
// 그 사람이 배정되지 않은 날짜(제외일 포함)는 건드리지 않는다.
const setScheduleLeader = async (schedule, staffIdx) => {
  if (!(schedule.staffIds || []).includes(staffIdx)) return; // 배정된 사람만 팀장으로 지정 가능

  const prevDailyTasks = JSON.parse(JSON.stringify(schedule.dailyTasks || []));
  const makeLeader = !isScheduleLeaderAnyDay(schedule, staffIdx); // 토글: 이미 팀장이면 해제, 아니면 지정

  const nextDailyTasks = prevDailyTasks.map((d) => {
    if (d.excluded) return d;
    if (!(d.staffIds || []).includes(staffIdx)) return d; // 그날 배정 안 된 사람은 건드리지 않음
    return { ...d, leaderId: makeLeader ? staffIdx : null };
  });

  schedule.dailyTasks = nextDailyTasks;

  try {
    const { data } = await axios.put(`/api/v1/site/cleaning/schedule/${schedule.idx}`, {
      itemCd: schedule.itemCd,
      startDt: schedule.startDt,
      endDt: schedule.endDt,
      startTm: schedule.startTm,
      endTm: schedule.endTm,
      durationDays: schedule.durationDays,
      mnIdx: schedule.mnIdx,
      memo: schedule.memo,
      staffIds: (schedule.staffIds || []).length ? schedule.staffIds.join(',') : null,
      status: schedule.status,
      includeSat: schedule.includeSat ? 'Y' : 'N',
      includeSun: schedule.includeSun ? 'Y' : 'N',
      includeHoliday: schedule.includeHoliday ? 'Y' : 'N',
      dailyTasksJson: JSON.stringify(nextDailyTasks)
    });

    if (!data.result) throw new Error(data.data?.error || data.message || '팀장 지정 실패');
  } catch (error) {
    console.error('팀장 지정 실패:', error);
    schedule.dailyTasks = prevDailyTasks;
    window.customAlert?.('팀장 지정에 실패했습니다. 이전 상태로 되돌렸습니다.', 'error');
  }
};

/* =========================================================================
 * 9. 소요일 합산 (요구사항 8)
 *    - 현장별 월 소요일 합계 (누가 갔는지가 아니라, 어느 현장에 소요일이
 *      얼마나 쌓였는지가 인원 추가 편성 판단에 더 직접적인 지표이므로
 *      작업자 기준이 아니라 현장 기준으로 집계한다)
 *    - 계약 소요일과 실제(등록) 소요일은 별도 섹션 없이 "N일 / N일" 로
 *      한 표 안에서 바로 비교되게 한다 (관리자가 한눈에 보기 쉽게)
 * ========================================================================= */
const siteWorkload = computed(() => {
  const months = [];
  const base = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 2, 1);
  for (let i = 0; i < 6; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const sumFor = (predicate, ym) =>
      cleaningSchedules.value
          .filter((s) => s.startDt.startsWith(ym) && Number(s.status) !== 4 && predicate(s))
          .reduce((a, s) => a + (s.durationDays || 0), 0);

  // 계약 소요일 / 실제(등록) 소요일 — 계약 주기 기준으로 정확히 집계된 값을 그대로 가져다 쓴다
  const contractMap = new Map(
      cleaningStatusBySite.value.map((site) => [site.sIdx, {
        contractDays: site.siteTotalDays,
        actualDays: site.sitePlannedDays
      }])
  );

  const rows = siteContracts.value.map((site) => {
    const cells = months.map((ym) => sumFor((s) => s.sIdx === site.sIdx, ym));
    const cmp = contractMap.get(site.sIdx) || { contractDays: 0, actualDays: 0 };
    return {
      key: `site-${site.sIdx}`,
      sIdx: site.sIdx,
      siteName: site.siteName,
      cells,
      rowTotal: cells.reduce((a, b) => a + b, 0),
      contractDays: cmp.contractDays,
      actualDays: cmp.actualDays,
      isOverContract: cmp.actualDays > cmp.contractDays
    };
  });

  const totalCells = months.map((ym) => sumFor(() => true, ym));

  return {
    months,
    rows,
    total: {
      key: 'total',
      siteName: '전체 합계',
      cells: totalCells,
      rowTotal: totalCells.reduce((a, b) => a + b, 0),
      contractDays: contractTotalDays.value,
      actualDays: plannedTotalDays.value,
      isOverContract: plannedTotalDays.value > contractTotalDays.value
    }
  };
});

// 계약 기준 총 소요일 (전 단지) — 추가 인원 편성 판단용
const contractTotalDays = computed(() =>
    cleaningStatusBySite.value.reduce((a, s) => a + s.siteTotalDays, 0)
);
const plannedTotalDays = computed(() =>
    cleaningStatusBySite.value.reduce((a, s) => a + s.sitePlannedDays, 0)
);

/* =========================================================================
 * 10. 일정 등록 / 수정 모달 (요구사항 10)
 * ========================================================================= */
const showAddModal = ref(false);
const isEditMode = ref(false);
const editingIdx = ref(null);

const blankForm = () => ({
  sIdx: '',
  itemCd: '',
  startDt: '',
  endDt: '',
  startTm: '',
  endTm: '',
  status: 0,
  mnIdx: '',
  equipment: [], // 여러 개 선택 가능 (체크박스)
  memo: '',
  docRequired: false,
  docLeadDays: 7,
  // 토/일/공휴일 포함 여부 (기본값: 포함) — 체크 해제 시 일정/소요일에서 자동 제외
  includeSat: true,
  includeSun: true,
  includeHoliday: true,
  // 일차별 작업내용 + 그날의 투입 인원 (JSON으로 저장). 인원의 유일한 정본은 여기다.
  dailyTasks: []
});

const addForm = ref(blankForm());

const availableTasks = computed(() => {
  if (!addForm.value.sIdx) return [];
  return siteContracts.value.find((s) => s.sIdx === addForm.value.sIdx)?.cleaningConfig || [];
});

const selectedSite = computed(() =>
    siteContracts.value.find((s) => s.sIdx === addForm.value.sIdx) || null
);

// 시작일~종료일 사이의 모든 달력일(캘린더 기준) 배열
const formCalendarDates = computed(() => {
  const { startDt, endDt } = addForm.value;
  if (!startDt || !endDt || endDt < startDt) return [];
  const dates = [];
  const cur = new Date(startDt);
  const end = new Date(endDt);
  let guard = 0;
  while (cur <= end && guard++ < 3660) {
    dates.push(fmtDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
});

// 전체 달력일 수 (기존 요구사항과의 호환을 위해 유지)
const formDuration = computed(() => formCalendarDates.value.length);

// 실제 소요일 = 토/일/공휴일 체크를 해제한 날은 제외한 일수 (요구사항: 자동 제외)
const formWorkingDays = computed(() =>
    formCalendarDates.value.filter((d) => !isDayExcluded(d, addForm.value)).length
);

const formDocDueDate = computed(() => {
  if (!addForm.value.startDt || !addForm.value.docRequired) return null;
  const d = new Date(addForm.value.startDt);
  d.setDate(d.getDate() - (Number(addForm.value.docLeadDays) || 0));
  return fmtDate(d);
});

// 지금 선택 중인 작업자들 중, 그 사람이 실제로 투입되는 "그 날짜"에 다른 일정과 겹치는 경우만 표시.
// (예: 2일 일정 중 1일차만 겹쳐도 정확히 1일차만 집어서 알려준다)
const formStaffConflicts = computed(() => {
  const rows = [];
  (addForm.value.dailyTasks || []).forEach((day) => {
    if (day.excluded) return;
    (day.staffIds || []).forEach((staffIdx) => {
      const conflicts = getDayConflicts(staffIdx, [day.date], isEditMode.value ? editingIdx.value : null);
      if (conflicts.length) rows.push({ date: day.date, staffIdx, conflicts: conflicts[0].entries });
    });
  });
  return rows;
});

const onSiteChange = () => {
  addForm.value.itemCd = '';
  addForm.value.docRequired = false;
};

// 시작일 + 필요한 "실제 작업일수" 를 만족하는 종료일을 계산 (토/일/공휴일 제외분 자동으로 뒤로 밀림)
const calcEndDtForWorkDays = (startDt, workDays, form) => {
  if (!startDt || workDays <= 0) return startDt;
  let count = 0;
  const cur = new Date(startDt);
  let last = new Date(startDt);
  for (let i = 0; i < 3660; i++) {
    const ds = fmtDate(cur);
    if (!isDayExcluded(ds, form)) {
      count++;
      last = new Date(cur);
      if (count >= workDays) break;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return fmtDate(last);
};

// 일차별 작업내용 테이블 재계산 — 날짜가 같으면 기존에 입력한 내용/인원/팀장 배정은 보존.
// 새로 생기는 날짜는 "바로 전날"의 인원·팀장 구성을 그대로 이어받는다 (첫 날은 빈 채로 시작해서 직접 고른다).
// 이렇게 하면 "기본값 체크 → 적용 버튼"같은 별도 단계 없이, 표에서 바로 체크/해제만 하면 끝난다.
const rebuildDailyTasks = () => {
  const existing = new Map((addForm.value.dailyTasks || []).map((r) => [r.date, r]));
  let dayNo = 0;
  let lastStaffIds = [];
  let lastLeaderId = null;
  addForm.value.dailyTasks = formCalendarDates.value.map((date) => {
    const excluded = isDayExcluded(date, addForm.value);
    if (!excluded) dayNo++;
    const prev = existing.get(date);
    const staffIds = prev?.staffIds ? [...prev.staffIds] : [...lastStaffIds];
    let leaderId = prev ? (prev.leaderId ?? null) : lastLeaderId;
    if (leaderId && !staffIds.includes(leaderId)) leaderId = null; // 팀장이 그날 배정에서 빠지면 무효화
    if (!excluded) { lastStaffIds = staffIds; lastLeaderId = leaderId; } // 다음 날짜가 이어받을 기준
    return {
      date,
      dayIndex: excluded ? null : dayNo,
      excluded,
      dayType: dayTypeLabel(date),
      content: prev?.content || '',
      staffIds,
      leaderId
    };
  });
};

// 특정 날짜의 인원 배정을 토글 — "2일차엔 김AA가 빠진다" 같은 예외를 여기서 처리한다.
const toggleDayStaff = (date, staffIdx) => {
  const day = (addForm.value.dailyTasks || []).find((d) => d.date === date);
  if (!day) return;
  const ids = day.staffIds || [];
  const has = ids.includes(staffIdx);
  if (has) {
    day.staffIds = ids.filter((id) => id !== staffIdx);
    if (day.leaderId === staffIdx) day.leaderId = null; // 체크 해제된 사람이 팀장이었다면 함께 해제
  } else {
    day.staffIds = [...ids, staffIdx];
    if (!day.leaderId) day.leaderId = staffIdx; // 그날 처음 체크되는 사람을 기본 팀장으로 (아래에서 바꿀 수 있음)
  }
};
const isDayStaffAssigned = (date, staffIdx) => {
  const day = (addForm.value.dailyTasks || []).find((d) => d.date === date);
  return !!day && (day.staffIds || []).includes(staffIdx);
};

// 특정 날짜의 팀장을 지정/해제 (배정된 인원 중에서만 가능). 같은 사람을 다시 누르면 팀장 해제.
const setDayLeader = (date, staffIdx) => {
  const day = (addForm.value.dailyTasks || []).find((d) => d.date === date);
  if (!day || !(day.staffIds || []).includes(staffIdx)) return;
  day.leaderId = day.leaderId === staffIdx ? null : staffIdx;
};
const isDayLeader = (date, staffIdx) => {
  const day = (addForm.value.dailyTasks || []).find((d) => d.date === date);
  return !!day && day.leaderId === staffIdx;
};

// 항목을 고르면 계약 설정에서 소요일·공문 여부를 상속 (요구사항 1, 5)
watch(() => addForm.value.itemCd, (code) => {
  if (!code || isEditMode.value) return;
  const task = availableTasks.value.find((t) => t.code === code);
  if (!task) return;

  addForm.value.docRequired = task.docRequired;
  addForm.value.docLeadDays = task.docLeadDays;

  if (addForm.value.startDt && task.durationDays > 0) {
    addForm.value.endDt = calcEndDtForWorkDays(addForm.value.startDt, task.durationDays, addForm.value);
  }
});

// 일정 등록 모달의 시작일/종료일이 캘린더에 보이는 달과 다른 연도일 수도 있으므로 함께 로드
watch(
    () => [addForm.value.startDt, addForm.value.endDt],
    ([s, e]) => {
      if (s) ensureHolidaysLoaded(new Date(s).getFullYear());
      if (e) ensureHolidaysLoaded(new Date(e).getFullYear());
    }
);

// 시작일/종료일/토·일·공휴일 포함 여부가 바뀌면 일차별 표를 다시 만든다
watch(
    () => [
      addForm.value.startDt,
      addForm.value.endDt,
      addForm.value.includeSat,
      addForm.value.includeSun,
      addForm.value.includeHoliday
    ],
    () => { rebuildDailyTasks(); }
);

// (예전엔 "기본 투입 인원" 체크박스와 그걸 일차별 표에 반영하는 별도 단계가 있었는데,
//  타이밍 버그의 근원이라 완전히 없앴다. 이제 일차별 표에서 직접 체크/해제하는 게 전부다.)

/* =========================================================================
 * 10-1. 청소 완료 사진 (요구사항: 완료 처리 전에 사진을 반드시 확인)
 *    - 사진은 현장/앱 등 다른 경로로 이미 업로드되어 있다고 가정하고,
 *      여기서는 조회만 한다. 사진이 0장이면 "완료" 상태로 저장할 수 없다.
 * ========================================================================= */
const schedulePhotos = ref([]);
const photosLoading = ref(false);

const fetchSchedulePhotos = async (scheduleIdx) => {
  if (!scheduleIdx) { schedulePhotos.value = []; return; }
  photosLoading.value = true;
  try {
    // 실제 엔드포인트 경로는 백엔드에 맞게 조정하세요.
    const { data } = await axios.get(`/api/v1/site/cleaning/schedule/${scheduleIdx}/photo`);
    schedulePhotos.value = data.data || [];
  } catch (e) {
    console.warn('청소 완료 사진 로드 실패:', e);
    schedulePhotos.value = [];
  } finally {
    photosLoading.value = false;
  }
};

const openAddModal = (dateStr = '') => {
  isEditMode.value = false;
  editingIdx.value = null;
  addForm.value = { ...blankForm(), startDt: dateStr, endDt: dateStr };
  rebuildDailyTasks();
  schedulePhotos.value = []; // 신규 일정은 아직 사진이 있을 수 없음
  showAddModal.value = true;
};

const openDetail = (schedule) => {
  isEditMode.value = true;
  editingIdx.value = schedule.idx;
  addForm.value = {
    sIdx: schedule.sIdx,
    itemCd: schedule.itemCd,
    startDt: schedule.startDt,
    endDt: schedule.endDt,
    startTm: schedule.startTm || '',
    endTm: schedule.endTm || '',
    status: Number(schedule.status),
    mnIdx: schedule.mnIdx ?? '',
    equipment: Array.isArray(schedule.equipment) ? [...schedule.equipment] : [],
    memo: schedule.memo,
    docRequired: schedule.docRequired,
    docLeadDays: schedule.docLeadDays,
    includeSat: schedule.includeSat,
    includeSun: schedule.includeSun,
    includeHoliday: schedule.includeHoliday,
    dailyTasks: Array.isArray(schedule.dailyTasks) ? JSON.parse(JSON.stringify(schedule.dailyTasks)) : []
  };
  rebuildDailyTasks();
  fetchSchedulePhotos(schedule.idx);
  showAddModal.value = true;
};

const closeAddModal = () => { showAddModal.value = false; };

const saveAddModal = async () => {
  console.log('[saveAddModal] 저장 시작', { isEditMode: isEditMode.value, editingIdx: editingIdx.value });

  const f = addForm.value;
  if (!f.sIdx || !f.itemCd || !f.startDt || !f.endDt) {
    console.warn('[saveAddModal] 막힘: 필수값 누락', { sIdx: f.sIdx, itemCd: f.itemCd, startDt: f.startDt, endDt: f.endDt });
    window.customAlert?.('현장, 청소 항목, 시작일, 종료일은 필수입니다.', 'error');
    alert('현장, 청소 항목, 시작일, 종료일은 필수입니다.');
    return;
  }
  if (f.endDt < f.startDt) {
    console.warn('[saveAddModal] 막힘: 종료일 < 시작일');
    window.customAlert?.('종료일은 시작일보다 앞설 수 없습니다.', 'error');
    alert('종료일은 시작일보다 앞설 수 없습니다.');
    return;
  }
  if (f.startTm && f.endTm && f.startDt === f.endDt && f.endTm <= f.startTm) {
    console.warn('[saveAddModal] 막힘: 종료시간 <= 시작시간');
    window.customAlert?.('종료 시간은 시작 시간보다 늦어야 합니다.', 'error');
    alert('종료 시간은 시작 시간보다 늦어야 합니다.');
    return;
  }

  const site = selectedSite.value;
  const task = findConfig(f.sIdx, f.itemCd);
  if (!site || !task) {
    console.warn('[saveAddModal] 막힘: 현장/계약 항목을 못 찾음', { sIdx: f.sIdx, itemCd: f.itemCd, site, task });
    window.customAlert?.('현장 계약 정보를 찾을 수 없습니다.', 'error');
    alert('현장 계약 정보를 찾을 수 없습니다.');
    return;
  }

  console.log('[saveAddModal] 일차별 인원 현황(dailyTasks):', JSON.parse(JSON.stringify(f.dailyTasks)));
  console.log('[saveAddModal] 겹침 검사 결과(formStaffConflicts):', formStaffConflicts.value);

  // 같은 날짜에 이미 다른 일정에 배정된 작업자가 있으면 저장을 막고 알려준다
  if (formStaffConflicts.value.length > 0) {
    console.warn('[saveAddModal] 막힘: 인원 겹침', formStaffConflicts.value);
    const detail = formStaffConflicts.value
        .map(({ date, staffIdx, conflicts }) =>
            `- ${date} ${getStaffName(staffIdx)}: ${conflicts.map((e) => `${e.siteName}·${e.itemName}`).join(', ')}`)
        .join('\n');
    const msg = `같은 날짜에 이미 다른 일정에 배정된 작업자가 있어 저장할 수 없습니다.\n\n${detail}\n\n일차별 표에서 인원을 조정한 뒤 다시 저장해주세요.`;
    window.customAlert?.(msg, 'error');
    alert(msg);
    return;
  }

  // 요구사항: "완료" 처리 전에 청소 완료 사진을 반드시 확인해야 한다 — 사진이 없으면 완료로 저장 불가
  if (Number(f.status) === 3 && schedulePhotos.value.length === 0) {
    console.warn('[saveAddModal] 막힘: 완료 사진 없음');
    const msg = '청소 완료 사진이 없어 "완료" 상태로 저장할 수 없습니다.\n현장에서 사진이 업로드된 뒤 다시 시도해주세요.';
    window.customAlert?.(msg, 'error');
    alert(msg);
    return;
  }

  // 일정 전체 staffIds는 "일차별로 한 번이라도 투입된 사람 전원" (합집합)으로 계산해서 저장한다.
  // 실제 날짜별 배정 내역은 dailyTasksJson 안에 그대로 담긴다.
  const unionStaffIds = Array.from(
      new Set((f.dailyTasks || []).filter((d) => !d.excluded).flatMap((d) => d.staffIds || []))
  );
  console.log('[saveAddModal] 합집합 staffIds:', unionStaffIds);

  const payload = {
    cIdx: useAuthStore().user?.cIdx,
    sIdx: site.sIdx,
    siteName: site.siteName,
    itemCd: task.code,
    itemName: task.name,
    startDt: f.startDt,
    endDt: f.endDt,
    startTm: f.startTm || null,
    endTm: f.endTm || null,
    // 요구사항: 토/일/공휴일 미포함 시 소요일에서 자동 제외
    durationDays: formWorkingDays.value,
    status: Number(f.status),
    // 여러 작업자 배정 가능 — DB에는 "3,7,12"처럼 콤마 구분 문자열로 저장 (일차별 상세는 dailyTasksJson에)
    staffIds: unionStaffIds.length ? unionStaffIds.join(',') : null,
    mnIdx: f.mnIdx === '' ? null : f.mnIdx,
    // 여러 장비 선택 가능 — DB에는 "고압세척기,사다리차"처럼 콤마 구분 문자열로 저장
    equipment: (f.equipment && f.equipment.length) ? f.equipment.join(',') : null,
    memo: f.memo || null,
    docRequired: f.docRequired ? 'Y' : 'N',
    docLeadDays: Number(f.docLeadDays) || 7,
    includeSat: f.includeSat ? 'Y' : 'N',
    includeSun: f.includeSun ? 'Y' : 'N',
    includeHoliday: f.includeHoliday ? 'Y' : 'N',
    // 요구사항: 일차별 작업내용(+ 그날의 투입 인원)은 JSON으로 저장
    dailyTasksJson: JSON.stringify(f.dailyTasks || [])
  };

  console.log('[saveAddModal] 서버로 보낼 payload:', payload);

  try {
    const url = `/api/v1/site/cleaning/schedule${isEditMode.value ? `/${editingIdx.value}` : ''}`;
    const method = isEditMode.value ? 'put' : 'post';
    console.log('[saveAddModal] 요청 전송:', method.toUpperCase(), url);
    const { data } = await axios[method](url, payload);
    console.log('[saveAddModal] 서버 응답:', data);
    if (!data.result) throw new Error(data.data?.error || data.message || '알 수 없는 오류');

    console.log('[saveAddModal] 저장 성공, 목록 다시 불러오는 중...');
    await fetchSchedules();
    closeAddModal();
  } catch (error) {
    console.error('[saveAddModal] 저장 실패:', error);
    console.error('[saveAddModal] 서버 응답 상세:', error.response?.data);
    window.customAlert?.('일정 저장에 실패했습니다.', 'error');
    alert('일정 저장에 실패했습니다: ' + (error.response?.data?.data?.error || error.message || '알 수 없는 오류'));
  }
};

const deleteSchedule = async () => {
  if (!(await (window.customConfirm?.('일정을 삭제하시겠습니까?') ?? Promise.resolve(confirm('일정을 삭제하시겠습니까?'))))) return;
  try {
    await axios.delete(`/api/v1/site/cleaning/schedule/${editingIdx.value}`);
    await fetchSchedules();
    closeAddModal();
  } catch (error) {
    console.error('일정 삭제 실패:', error);
    window.customAlert?.('일정 삭제에 실패했습니다.', 'error');
  }
};

/* =========================================================================
 * 11. 공문 발송 / 수신확인 (요구사항 5, 6)
 * ========================================================================= */
const documents = ref([]);

const fetchDocuments = async () => {
  try {
    const { data } = await axios.get('/api/v1/site/cleaning/doc');
    documents.value = (data.data || []).map((d) => ({
      ...d,
      snapshot: typeof d.snapshotJson === 'string' ? JSON.parse(d.snapshotJson || '{}') : (d.snapshotJson || {}),
      receipts: d.receipts || []
    }));
  } catch (e) {
    console.warn('공문 목록 API 미연동');
    documents.value = [];
  }
};

// 발송 대기: 공문 대상인데 아직 미발송이고, 발송 예정일이 지난 건
const pendingDocSchedules = computed(() => {
  const today = todayStr();
  return cleaningSchedules.value
      .filter((s) => s.docRequired && s.docStatus === 0 && Number(s.status) !== 4)
      .map((s) => {
        const d = new Date(s.startDt);
        d.setDate(d.getDate() - (s.docLeadDays || 7));
        return { ...s, sendDueDt: fmtDate(d) };
      })
      .filter((s) => s.sendDueDt <= today)
      .sort((a, b) => a.startDt.localeCompare(b.startDt));
});

// 발송했지만 확인이 안 끝난 건
const awaitingConfirmDocs = computed(() =>
    documents.value.filter((d) => (d.receipts || []).some((r) => r.confirmedYn !== 'Y' && r.confirmedYn !== true))
);

// 요구사항 10: 공문에 실릴 내용 스냅샷
const buildSnapshot = (schedule) => {
  const site = siteContracts.value.find((s) => s.sIdx === schedule.sIdx);
  return {
    siteName: schedule.siteName || site?.siteName || '',
    address: schedule.address || site?.address || '',
    itemName: schedule.itemName,
    startDt: schedule.startDt,
    endDt: schedule.endDt,
    startTm: schedule.startTm,
    endTm: schedule.endTm,
    durationDays: schedule.durationDays,
    staffNames: getStaffNames(schedule.staffIds),
    managerName: getManagerName(schedule.mnIdx),
    equipment: Array.isArray(schedule.equipment) ? schedule.equipment.join(', ') : (schedule.equipment || ''),
    memo: schedule.memo
  };
};

const buildReceipts = (schedule) => [
  { targetType: 'SITE', targetIdx: schedule.sIdx, targetName: schedule.siteName },
  { targetType: 'MANAGER', targetIdx: schedule.mnIdx, targetName: getManagerName(schedule.mnIdx) }
];

const issuingIdx = ref(null);

const issueDocument = async (schedule) => {
  if (!(schedule.staffIds && schedule.staffIds.length) || !schedule.mnIdx) {
    window.customAlert?.('작업자와 담당 관리자를 먼저 배정해야 공문을 발송할 수 있습니다.', 'error');
    return;
  }
  issuingIdx.value = schedule.idx;

  try {
    const { data } = await axios.post('/api/v1/site/cleaning/doc', {
      scheduleIdx: schedule.idx,
      docType: 'NOTICE',
      title: `${schedule.siteName} ${schedule.itemName} 작업 안내`,
      snapshotJson: JSON.stringify(buildSnapshot(schedule)),
      receipts: buildReceipts(schedule)
    });
    if (!data.result) throw new Error(data.message);

    await Promise.all([fetchDocuments(), fetchSchedules()]);
  } catch (error) {
    console.error('공문 발송 실패:', error);
    window.customAlert?.('공문 발송에 실패했습니다.', 'error');
  } finally {
    issuingIdx.value = null;
  }
};

const isConfirmed = (r) => r.confirmedYn === 'Y' || r.confirmedYn === true;

// 담당자가 유선으로 확인받은 경우를 기록 (요구사항 6이 실무를 막지 않게)
const confirmReceipt = async (doc, receipt) => {
  if (isConfirmed(receipt)) return;

  const memo = await (window.customPrompt?.('수신확인 방법을 남겨주세요. (예: 9/8 14시 김소장 유선 확인)', '')
      ?? Promise.resolve(prompt('수신확인 방법을 남겨주세요.')));
  if (memo === null) return;

  try {
    const { data } = await axios.put(`/api/v1/site/cleaning/doc/receipt/${receipt.idx}`, {
      confirmedYn: 'Y',
      proxyYn: 'Y',
      proxyMemo: memo || '관리자 대행 확인'
    });
    if (!data.result) throw new Error(data.message);

    await Promise.all([fetchDocuments(), fetchSchedules()]);
  } catch (error) {
    console.error('수신확인 처리 실패:', error);
    window.customAlert?.('수신확인 처리에 실패했습니다.', 'error');
  }
};

const docProgress = (doc) => {
  const rs = doc.receipts || [];
  return `${rs.filter(isConfirmed).length}/${rs.length}`;
};

/* =========================================================================
 * 12. 완료 점검표 (요구사항 9)
 *     여러 날 작업은 일자별로 서명을 받는다.
 * ========================================================================= */
const checklists = ref([]);
const showChecklistModal = ref(false);
const checklistForm = ref({
  scheduleIdx: null, workDt: '', signerName: '', rating: 5, issues: '', nextDayMemo: ''
});

const fetchChecklists = async () => {
  try {
    const { data } = await axios.get('/api/v1/site/cleaning/checklist');
    checklists.value = data.data || [];
  } catch (e) {
    console.warn('점검표 API 미연동');
    checklists.value = [];
  }
};

// 진행중/완료 일정의 작업일을 모두 펼쳐서 점검 대상 목록을 만든다
const checklistTargets = computed(() => {
  const rows = [];
  cleaningSchedules.value
      .filter((s) => s.status >= 2 && Number(s.status) !== 4)
      .forEach((s) => {
        for (let i = 0; i < (s.durationDays || 1); i++) {
          const d = new Date(s.startDt);
          d.setDate(d.getDate() + i);
          const workDt = fmtDate(d);
          if (workDt > todayStr()) continue;
          const found = checklists.value.find(
              (c) => c.scheduleIdx === s.idx && String(c.workDt).slice(0, 10) === workDt
          );
          rows.push({ schedule: s, workDt, checklist: found || null });
        }
      });
  return rows.sort((a, b) => b.workDt.localeCompare(a.workDt));
});

const checklistPendingCount = computed(() => checklistTargets.value.filter((r) => !r.checklist).length);

const openChecklistModal = (row) => {
  checklistForm.value = {
    scheduleIdx: row.schedule.idx,
    workDt: row.workDt,
    signerName: '',
    rating: 5,
    issues: '',
    nextDayMemo: ''
  };
  showChecklistModal.value = true;
};

const saveChecklist = async () => {
  if (!checklistForm.value.signerName.trim()) {
    window.customAlert?.('소장 또는 책임자 성명을 입력해주세요.', 'error');
    return;
  }
  try {
    const { data } = await axios.post('/api/v1/site/cleaning/checklist', checklistForm.value);
    if (!data.result) throw new Error(data.message);
    await fetchChecklists();
    showChecklistModal.value = false;
  } catch (error) {
    console.error('점검표 저장 실패:', error);
    window.customAlert?.('점검표 저장에 실패했습니다.', 'error');
  }
};

/* =========================================================================
 * 13. 초기 로드
 * ========================================================================= */
onMounted(async () => {
  // 공휴일은 watch(currentDate, ..., { immediate: true }) 에서 현재 연도 기준으로 자동 로드된다.
  await Promise.all([fetchSiteOptions(), fetchCleaningStaff(), fetchManagers()]);
  await Promise.all([fetchSchedules(), fetchDocuments(), fetchChecklists()]);
});
</script>

<template>
  <div class="site-cleaning-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-broom"></i> 대청소 관리</h1>
        <p class="page-subtitle">현장별 대청소 과업 일정과 공문 발송 상태를 관리합니다.</p>
      </div>
      <div class="header-actions">
        <button class="btn-add" @click="openAddModal()">
          <i class="mdi mdi-calendar-plus"></i><span>일정 등록</span>
        </button>
      </div>
    </div>

    <!-- 탭 -->
    <div class="tab-nav">
      <button :class="['tab-item', { active: activeTab === 'calendar' }]" @click="activeTab = 'calendar'">
        <i class="mdi mdi-calendar-month"></i> 일정 캘린더
      </button>
      <!--button :class="['tab-item', { active: activeTab === 'status' }]" @click="activeTab = 'status'">
        <i class="mdi mdi-clipboard-text-outline"></i> 현장별 실시현황
        <span v-if="totalWarningCount > 0" class="tab-badge">{{ totalWarningCount }}</span>
      </button-->
      <button :class="['tab-item', { active: activeTab === 'workload' }]" @click="activeTab = 'workload'">
        <i class="mdi mdi-account-group-outline"></i> 소요일 합산
      </button>
      <button :class="['tab-item', { active: activeTab === 'assign' }]" @click="activeTab = 'assign'">
        <i class="mdi mdi-account-switch"></i> 인원 배정
        <span v-if="unassignedCount > 0" class="tab-badge">{{ unassignedCount }}</span>
      </button>
      <!--button :class="['tab-item', { active: activeTab === 'documents' }]" @click="activeTab = 'documents'">
        <i class="mdi mdi-file-document-outline"></i> 공문·점검표
        <span v-if="pendingDocSchedules.length + checklistPendingCount > 0" class="tab-badge">
          {{ pendingDocSchedules.length + checklistPendingCount }}
        </span>
      </button-->
    </div>
    <p class="tab-desc"><i class="mdi mdi-arrow-right-thin"></i> {{ tabDescriptions[activeTab] }}</p>

    <!-- ============ 탭1: 캘린더 ============ -->
    <div v-if="activeTab === 'calendar'" class="content-body">
      <div class="calendar-card">
        <div class="filter-bar">
          <select v-model="filterMode" class="form-control filter-select">
            <option value="all">전체 보기</option>
            <option value="staff">작업자별</option>
            <option value="manager">담당자별</option>
          </select>
          <select v-if="filterMode === 'staff'" v-model="filterStaffIdx" class="form-control filter-select">
            <option value="">작업자 선택</option>
            <option v-for="s in cleaningStaff" :key="s.idx" :value="s.idx">{{ s.name }}</option>
          </select>
          <select v-if="filterMode === 'manager'" v-model="filterManagerIdx" class="form-control filter-select">
            <option value="">담당자 선택</option>
            <option v-for="m in managers" :key="m.idx" :value="m.idx">{{ m.name }}</option>
          </select>

          <div class="filter-spacer"></div>

          <!--select v-model="docFilter" class="form-control filter-select" title="공문 수신확인 상태">
            <option value="all">공문 상태 전체</option>
            <option value="confirmed">확인 완료분만</option>
            <option value="pending">확인 대기분만</option>
          </select-->
        </div>

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
                :class="['calendar-cell', { 'not-current': !day.isCurrentMonth, 'is-today': day.isToday, 'is-holiday-cell': day.isHoliday }]"
                @click="openAddModal(day.dateStr)"
            >
              <div class="cell-date-row">
                <div
                    class="cell-date"
                    :class="{ 'text-danger': day.isHoliday || day.isSunday, 'text-primary': !day.isHoliday && day.isSaturday }"
                >
                  {{ day.date }}
                </div>
                <div v-if="day.isHoliday && day.holidayName" class="cell-holiday-name" :title="day.holidayName">
                  {{ day.holidayName }}
                </div>
              </div>
              <div class="cell-schedules">
                <template v-for="(schedule, lane) in getSchedulesForDate(day.dateStr)" :key="lane">
                  <div
                      v-if="schedule"
                      :class="['schedule-bar', {
                        'is-pending': isDocPending(schedule) && !schedule.isExcludedDay,
                        'is-start': schedule.isStartDay,
                        'is-end': schedule.isEndDay,
                        'is-middle': !schedule.isStartDay && !schedule.isEndDay,
                        'is-excluded-day': schedule.isExcludedDay,
                        'is-cancelled': Number(schedule.status) === 4
                      }]"
                      :style="schedule.isExcludedDay ? {} : { backgroundColor: getStatusColor(schedule.status) }"
                      :title="`${schedule.siteName} · ${schedule.itemName}\n${schedule.dayIndex}일차 인원(${(schedule.dayStaffIds || []).length}명): ${getStaffNames(schedule.dayStaffIds) || '인원 미배정'}${schedule.dayLeaderId ? ' · 팀장 ' + getStaffName(schedule.dayLeaderId) : ''} / ${getManagerName(schedule.mnIdx)}\n${schedule.startDt} ~ ${schedule.endDt} (${schedule.durationDays}일)${schedule.isExcludedDay ? ' · 휴무(제외일)' : ''}`"
                      @click.stop="openDetail(schedule)"
                  >
                    <div class="bar-content" :style="{ opacity: schedule.isStartDay ? 1 : 0 }">
                      <span class="bar-title">{{ schedule.siteName }} · {{ schedule.itemName }}</span>
                      <span v-if="schedule.docRequired" class="bar-badge" :class="{ 'doc-ok': schedule.docStatus === 3 }">
                        {{ schedule.docStatus === 3 ? '공문✓' : '공문' }}
                      </span>
                    </div>
                  </div>
                  <div v-else class="schedule-bar-empty"></div>
                </template>
                <div v-if="day.isCurrentMonth && !cellHasSchedules(day.dateStr)" class="cell-add-hint">
                  <i class="mdi mdi-plus"></i> 일정 추가
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="calendar-legend">
          <span class="legend-item"><i class="legend-dot" style="background: var(--primary, #4f46e5);"></i> 예정</span>
          <span class="legend-item"><i class="legend-dot" style="background: #0ea5e9;"></i> 확정</span>
          <span class="legend-item"><i class="legend-dot" style="background: var(--warning, #f59e0b);"></i> 진행중</span>
          <span class="legend-item"><i class="legend-dot" style="background: var(--success, #22c55e);"></i> 완료</span>
          <span class="legend-item"><i class="legend-dot" style="background: #9ca3af;"></i> 취소</span>
          <span class="legend-item"><i class="legend-dot legend-dot-excluded"></i> 토/일/공휴일 제외일</span>
          <!--span class="legend-item"><i class="legend-dot legend-dot-pending"></i> 공문 수신확인 대기</span-->
        </div>
      </div>

      <!-- 사이드: 잔여 현황 요약 -->
      <div class="status-card">
        <div class="status-header side-header">
          <div class="side-header-top">
            <div class="side-header-title">
              <i class="mdi mdi-clipboard-text-outline"></i>
              <h3>과업 잔여 현황</h3>
            </div>
            <span class="site-count-badge">{{ filteredStatusSites.length }}개</span>
          </div>
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input v-model="statusSearch" type="text" class="search-input" placeholder="현장명 또는 항목명" />
          </div>
          <div class="side-header-row">
            <label class="form-check-inline">
              <input v-model="statusOnlyWarning" type="checkbox" /> 경고만
            </label>
            <div class="btn-mini-group">
              <button class="btn-mini" @click="collapseAllSites">접기</button>
              <button class="btn-mini" @click="expandAllSites">펼치기</button>
            </div>
          </div>
        </div>

        <div class="status-list">
          <div v-if="filteredStatusSites.length === 0" class="empty-state">표시할 현장이 없습니다.</div>

          <div
              v-for="site in filteredStatusSites"
              :key="site.sIdx"
              :class="['status-item', { 'status-completed': site.isAllCompleted }]"
          >
            <div class="status-item-header" @click="toggleSiteExpand(site.sIdx)">
              <h4>{{ site.siteName }}</h4>
              <div class="status-summary">
                <span v-if="site.remainCount > 0" class="summary-chip summary-remain">잔여 {{ site.remainCount }}</span>
                <span v-else class="summary-chip summary-done">완료</span>
                <span v-if="site.warningCount > 0" class="summary-chip summary-warning">
                  <i class="mdi mdi-alert-circle"></i> {{ site.warningCount }}
                </span>
                <i :class="['mdi', isSiteExpanded(site.sIdx) ? 'mdi-chevron-up' : 'mdi-chevron-down', 'expand-icon']"></i>
              </div>
            </div>

            <div v-show="isSiteExpanded(site.sIdx)" class="status-item-body">
              <div
                  v-for="task in site.tasks"
                  :key="task.code"
                  :class="['task-info', { 'task-completed': task.doneCount >= task.total }]"
              >
                <div class="task-name">
                  {{ task.name }}
                  <span v-if="task.isService" class="badge-service">서비스</span>
                  <span v-if="task.docRequired" class="badge-doc">공문</span>
                  <span v-if="task.doneCount >= task.total" class="badge-done">실시완료</span>
                  <span v-else-if="task.warning" class="badge-notdone-warning">
                    <i class="mdi mdi-alert-circle"></i> {{ task.warningPeriod }} 미실시
                  </span>
                  <span v-else class="badge-notdone">진행 전</span>
                </div>
                <div class="task-counts">
                  <span class="count-total">총 {{ task.total }}회</span>
                  <span class="count-used">완료 {{ task.doneCount }}회</span>
                  <span v-if="task.remain > 0" class="count-remain">미등록 {{ task.remain }}회</span>
                </div>
                <div class="task-counts sub">
                  <span class="count-total">회당 {{ task.durationDays }}일</span>
                  <span class="count-used">소요일 {{ task.doneDurationDays }}/{{ task.totalDurationDays }}일</span>
                </div>
                <div v-if="task.cycleRange" class="cycle-badge">
                  {{ task.cycleRange.start }} ~ {{ task.cycleRange.end }} · {{ task.cycleRange.label }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 탭2: 현장별 실시현황 ============ -->
    <div v-if="activeTab === 'status'" class="status-card status-card-full">
      <div class="status-header status-header-with-controls">
        <div class="side-header-title">
          <i class="mdi mdi-clipboard-text-outline"></i>
          <h3>현장별 대청소 실시현황</h3>
          <span class="site-count-badge">{{ filteredStatusSites.length }}개 현장</span>
        </div>
        <div class="status-controls">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input v-model="statusSearch" type="text" class="search-input" placeholder="현장명 또는 항목명 검색" />
          </div>
          <label class="form-check-inline"><input v-model="statusOnlyRemaining" type="checkbox" /> 미등록만</label>
          <label class="form-check-inline"><input v-model="statusOnlyWarning" type="checkbox" /> 경고만</label>
          <button class="btn-mini" @click="collapseAllSites">전체 접기</button>
          <button class="btn-mini" @click="expandAllSites">전체 펼치기</button>
        </div>
      </div>

      <div v-if="filteredStatusSites.length === 0" class="empty-state">검색 결과가 없습니다.</div>

      <div class="status-masonry">
        <div
            v-for="site in filteredStatusSites"
            :key="site.sIdx"
            :class="['status-item', { 'status-completed': site.isAllCompleted }]"
        >
          <div class="status-item-header" @click="toggleSiteExpand(site.sIdx)">
            <h4>{{ site.siteName }}</h4>
            <div class="status-summary">
              <span class="summary-chip">계약 {{ site.siteTotalDays }}일</span>
              <span v-if="site.remainCount > 0" class="summary-chip summary-remain">잔여 {{ site.remainCount }}</span>
              <span v-else class="summary-chip summary-done">전체완료</span>
              <span v-if="site.warningCount > 0" class="summary-chip summary-warning">
                <i class="mdi mdi-alert-circle"></i> {{ site.warningCount }}
              </span>
              <i :class="['mdi', isSiteExpanded(site.sIdx) ? 'mdi-chevron-up' : 'mdi-chevron-down', 'expand-icon']"></i>
            </div>
          </div>

          <div v-show="isSiteExpanded(site.sIdx)" class="status-item-body">
            <div
                v-for="task in site.tasks"
                :key="task.code"
                :class="['task-info', { 'task-completed': task.doneCount >= task.total }]"
            >
              <div class="task-name">
                {{ task.name }}
                <span v-if="task.isService" class="badge-service">서비스</span>
                <span v-if="task.docRequired" class="badge-doc">공문</span>
                <span v-if="task.doneCount >= task.total" class="badge-done">실시완료</span>
                <span v-else-if="task.warning" class="badge-notdone-warning">
                  <i class="mdi mdi-alert-circle"></i> {{ task.warningPeriod }} 미실시
                </span>
                <span v-else class="badge-notdone">진행 전</span>
              </div>

              <div class="task-counts">
                <span class="count-total">총 {{ task.total }}회</span>
                <span class="count-used">완료 {{ task.doneCount }}회</span>
                <span class="count-total">등록 {{ task.plannedCount }}회</span>
                <span v-if="task.remain > 0" class="count-remain">미등록 {{ task.remain }}회</span>
              </div>

              <div class="task-counts sub">
                <span class="count-total">회당 소요일 {{ task.durationDays }}일</span>
                <span class="count-used">누적 {{ task.doneDurationDays }}/{{ task.totalDurationDays }}일</span>
              </div>

              <div v-if="task.cycleRange" class="cycle-badge">
                계약주기 {{ task.cycleRange.start }} ~ {{ task.cycleRange.end }} ({{ task.cycleRange.label }})
              </div>

              <!-- 요구사항 7: 구간별 실시 여부 -->
              <div v-if="task.segments.length > 1" class="segment-row">
                <span
                    v-for="seg in task.segments"
                    :key="seg.label"
                    :class="['segment-chip', seg.done ? 'seg-done' : seg.warning ? 'seg-warn' : seg.planned ? 'seg-planned' : 'seg-idle']"
                    :title="`${seg.start} ~ ${seg.end} / 경고 시작 ${seg.warnFrom}`"
                >
                  {{ seg.label }}
                  <template v-if="seg.done">완료</template>
                  <template v-else-if="seg.planned">예정</template>
                  <template v-else>미실시</template>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 탭3: 소요일 합산 ============ -->
    <div v-if="activeTab === 'workload'" class="status-card status-card-full">
      <div class="status-header">
        <i class="mdi mdi-account-group-outline"></i>
        <h3>현장별 월 소요일 합계</h3>
      </div>

      <div class="workload-summary">
        <div class="ws-card">
          <span class="ws-label">계약 기준 총 소요일</span>
          <span class="ws-value">{{ contractTotalDays }}일</span>
        </div>
        <div class="ws-card">
          <span class="ws-label">일정 등록된 소요일</span>
          <span class="ws-value">{{ plannedTotalDays }}일</span>
        </div>
        <div class="ws-card">
          <span class="ws-label">등록 작업 인력</span>
          <span class="ws-value">{{ cleaningStaff.length }}명</span>
        </div>
        <div class="ws-card" :class="{ 'ws-alert': unassignedCount > 0 }">
          <span class="ws-label">미배정 일정</span>
          <span class="ws-value">{{ unassignedCount }}건</span>
        </div>
      </div>

      <div class="table-scroll">
        <table class="workload-table">
          <thead>
          <tr>
            <th class="th-team">현장</th>
            <th v-for="ym in siteWorkload.months" :key="ym">{{ ym }}</th>
            <th class="th-total">누적</th>
            <th class="th-compare">계약 / 실제</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="row in siteWorkload.rows" :key="row.key">
            <td class="team-name-cell">{{ row.siteName }}</td>
            <td v-for="(cell, i) in row.cells" :key="i" :class="{ 'cell-overload': cell >= 15, 'cell-zero': cell === 0 }">
              {{ cell }}일
            </td>
            <td class="cell-rowtotal">{{ row.rowTotal }}일</td>
            <td class="cell-compare" :class="{ 'is-over': row.isOverContract }">
              {{ row.contractDays }}일 / {{ row.actualDays }}일
            </td>
          </tr>
          </tbody>
          <tfoot>
          <tr class="row-total">
            <td class="team-name-cell">{{ siteWorkload.total.siteName }}</td>
            <td v-for="(cell, i) in siteWorkload.total.cells" :key="i">{{ cell }}일</td>
            <td class="cell-rowtotal">{{ siteWorkload.total.rowTotal }}일</td>
            <td class="cell-compare" :class="{ 'is-over': siteWorkload.total.isOverContract }">
              {{ siteWorkload.total.contractDays }}일 / {{ siteWorkload.total.actualDays }}일
            </td>
          </tr>
          </tfoot>
        </table>
      </div>

      <p class="table-hint">
        월 15일 이상 소요일이 잡힌 현장은 붉게 표시됩니다. "계약 / 실제"는 계약상 소요일 대비 실제 등록된 소요일이며,
        실제가 계약을 넘으면 붉게 표시됩니다. 미배정 일정이 쌓여 있으면 인원 추가 편성을 검토하세요.
      </p>
    </div>

    <!-- ============ 탭4: 인원 배정 ============ -->
    <div v-if="activeTab === 'assign'" class="assign-wrapper">
      <div class="kanban-intro">
        <i class="mdi mdi-information-outline"></i>
        여기서 체크하면 일정에 걸린 모든 날짜에 한 번에 배정되고, 처음 배정되는 순간 상태가 '확정'으로 바뀝니다.
        "2일차엔 빠짐"처럼 날짜별로 다르게 넣으려면 카드를 눌러 상세 모달의 일차별 표에서 편집하세요.
      </div>

      <div class="assign-toolbar">
        <div class="search-box">
          <i class="mdi mdi-magnify"></i>
          <input v-model="assignSearch" type="text" class="search-input" placeholder="현장명 또는 항목명 검색" />
        </div>
        <label class="form-check-inline"><input v-model="assignOnlyUnassigned" type="checkbox" /> 미배정만 보기</label>
        <span class="site-count-badge">전체 {{ scheduleListForAssign.length }}건 · 미배정 {{ unassignedCount }}건</span>
      </div>

      <div class="assign-list">
        <div v-if="scheduleListForAssign.length === 0" class="empty-state">표시할 일정이 없습니다.</div>

        <div
            v-for="task in scheduleListForAssign"
            :key="task.idx"
            :class="['assign-card', { 'is-unassigned': !(task.staffIds && task.staffIds.length) }]"
        >
          <div class="assign-card-main" @click="openDetail(task)">
            <div class="task-card-header">
              <span class="task-site">{{ task.siteName }}</span>
              <span class="task-date">
                {{ task.startDt === task.endDt ? task.startDt : `${task.startDt} ~ ${task.endDt}` }}
              </span>
            </div>
            <div class="task-card-body">
              <p><strong>{{ task.itemName }}</strong> <span class="dur-chip">{{ task.durationDays }}일</span></p>
              <p v-if="task.startTm || task.endTm" class="task-time">
                <i class="mdi mdi-clock-outline"></i> {{ task.startTm || '-' }} ~ {{ task.endTm || '-' }}
              </p>
              <p v-if="task.address" class="task-address"><i class="mdi mdi-map-marker-outline"></i> {{ task.address }}</p>
              <p v-if="task.equipment && task.equipment.length" class="task-equip"><i class="mdi mdi-wrench-outline"></i> {{ task.equipment.join(', ') }}</p>
              <p v-if="task.memo" class="task-note"><i class="mdi mdi-alert-circle-outline"></i> {{ task.memo }}</p>
              <div class="task-tags">
                <span
                    class="status-badge"
                    :class="{ 'is-done': task.status === 3, 'is-progress': task.status === 2, 'is-fixed': task.status === 1, 'is-cancelled': task.status === 4 }"
                >
                  {{ statusLabel(task.status) }}
                </span>
                <span v-if="task.docRequired" class="status-badge" :class="task.docStatus === 3 ? 'is-done' : 'is-warn'">
                  공문 {{ DOC_STATUS_LABEL[task.docStatus] }}
                </span>
              </div>
            </div>
          </div>

          <div class="assign-card-staff">
            <div class="assigned-staff-chips">
              <span
                  v-for="sIdx in task.staffIds"
                  :key="sIdx"
                  class="member-chip"
                  :class="{ 'is-leader': isScheduleLeaderAnyDay(task, sIdx) }"
              >
                <i v-if="isScheduleLeaderAnyDay(task, sIdx)" class="mdi mdi-crown"></i> {{ getStaffName(sIdx) }}
              </span>
              <span v-if="!(task.staffIds && task.staffIds.length)" class="empty-members">인원 미배정</span>
            </div>
            <div v-if="getScheduleLeaderName(task)" class="leader-summary">
              <i class="mdi mdi-crown"></i> 팀장: {{ getScheduleLeaderName(task) }}
            </div>
            <div v-if="hasVaryingDailyStaff(task)" class="daily-staff-summary">
              <i class="mdi mdi-calendar-multiselect-outline"></i> {{ getDailyStaffSummary(task) }}
            </div>
            <button class="btn-icon-small" @click.stop="toggleStaffEditor(task.idx)">
              <i class="mdi mdi-account-multiple-plus-outline"></i>
              {{ editingStaffFor === task.idx ? '닫기' : '인원 편집(전체 날짜 일괄)' }}
            </button>

            <div v-if="editingStaffFor === task.idx" class="staff-editor-popover" @click.stop>
              <div v-for="staff in cleaningStaff" :key="staff.idx" class="staff-check-with-leader">
                <label class="form-check-inline">
                  <input
                      type="checkbox"
                      :checked="isStaffAssigned(task, staff.idx)"
                      @change="toggleScheduleStaff(task, staff.idx)"
                  />
                  {{ staff.name }}
                </label>
                <button
                    v-if="isStaffAssigned(task, staff.idx)"
                    type="button"
                    class="btn-leader-toggle"
                    :class="{ 'is-leader': isScheduleLeaderAnyDay(task, staff.idx) }"
                    :title="isScheduleLeaderAnyDay(task, staff.idx) ? '팀장 해제' : '전체 날짜 팀장으로 지정'"
                    @click="setScheduleLeader(task, staff.idx)"
                >
                  <i class="mdi mdi-crown"></i>
                </button>
              </div>
              <p v-if="cleaningStaff.length === 0" class="empty-members">등록된 청소 인력이 없습니다.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 탭5: 공문 · 점검표 ============ -->
    <div v-if="activeTab === 'documents'" class="doc-tab">

      <!-- 발송 대기 -->
      <div class="status-card status-card-full">
        <div class="status-header">
          <i class="mdi mdi-email-fast-outline"></i>
          <h3>공문 발송 대기</h3>
          <span class="site-count-badge">{{ pendingDocSchedules.length }}건</span>
        </div>

        <div v-if="pendingDocSchedules.length === 0" class="empty-state">
          발송할 공문이 없습니다. 계약에서 공문 대상으로 설정한 과업의 발송 예정일이 되면 여기에 표시됩니다.
        </div>

        <div v-else class="doc-list">
          <div v-for="s in pendingDocSchedules" :key="s.idx" class="doc-item doc-item-pending">
            <div class="doc-header">
              <div class="doc-title">
                <strong>{{ s.siteName }} · {{ s.itemName }}</strong>
                <span class="doc-meta">작업 {{ s.startDt }} ~ {{ s.endDt }} ({{ s.durationDays }}일)</span>
              </div>
              <button class="btn-checklist" :disabled="issuingIdx === s.idx" @click="issueDocument(s)">
                <i class="mdi mdi-send"></i> {{ issuingIdx === s.idx ? '발송 중' : '공문 발송' }}
              </button>
            </div>
            <div class="doc-snapshot">
              <span><i class="mdi mdi-map-marker-outline"></i> {{ s.address || '주소 미등록' }}</span>
              <span><i class="mdi mdi-account-group-outline"></i> {{ getStaffNames(s.staffIds) || '인원 미배정' }}</span>
              <span><i class="mdi mdi-account-tie-outline"></i> {{ getManagerName(s.mnIdx) }}</span>
              <span v-if="s.equipment && s.equipment.length"><i class="mdi mdi-wrench-outline"></i> {{ s.equipment.join(', ') }}</span>
              <span v-if="s.memo"><i class="mdi mdi-message-alert-outline"></i> {{ s.memo }}</span>
            </div>
            <p v-if="!(s.staffIds && s.staffIds.length) || !s.mnIdx" class="doc-warn">
              <i class="mdi mdi-alert-outline"></i> 작업자 또는 담당자가 비어 있어 발송할 수 없습니다.
            </p>
          </div>
        </div>
      </div>

      <!-- 수신확인 현황 -->
      <div class="status-card status-card-full">
        <div class="status-header">
          <i class="mdi mdi-file-document-check-outline"></i>
          <h3>수신확인 현황</h3>
          <span class="site-count-badge">대기 {{ awaitingConfirmDocs.length }}건</span>
        </div>

        <div v-if="documents.length === 0" class="empty-state">발송된 공문이 없습니다.</div>

        <div v-else class="doc-list">
          <div v-for="doc in documents" :key="doc.idx" class="doc-item">
            <div class="doc-header">
              <div class="doc-title">
                <strong>{{ doc.snapshot.siteName }} · {{ doc.snapshot.itemName }}</strong>
                <span class="doc-meta">발송 {{ doc.sentAt }} · 확인 {{ docProgress(doc) }}</span>
              </div>
              <a v-if="doc.fileUrl" :href="`/api${doc.fileUrl}`" target="_blank" class="btn-mini">
                <i class="mdi mdi-file-pdf-box"></i> 공문 보기
              </a>
            </div>

            <div class="receipt-row">
              <div
                  v-for="r in doc.receipts"
                  :key="r.idx || r.targetType"
                  :class="['receipt-chip', { confirmed: isConfirmed(r) }]"
                  @click="confirmReceipt(doc, r)"
              >
                <i :class="['mdi', isConfirmed(r) ? 'mdi-check-circle' : 'mdi-clock-outline']"></i>
                {{ RECEIPT_TYPE_LABEL[r.targetType] || r.targetType }} ({{ r.targetName || '-' }})
                <span v-if="isConfirmed(r)" class="receipt-time">
                  {{ r.confirmedAt }}<template v-if="r.proxyYn === 'Y'"> · 대행</template>
                </span>
              </div>
            </div>
            <p v-if="doc.receipts?.some(r => r.proxyYn === 'Y')" class="doc-note">
              <i class="mdi mdi-phone-outline"></i>
              {{ doc.receipts.find(r => r.proxyYn === 'Y')?.proxyMemo }}
            </p>
          </div>
        </div>
      </div>

      <!-- 완료 점검표 -->
      <div class="status-card status-card-full">
        <div class="status-header">
          <i class="mdi mdi-clipboard-check-outline"></i>
          <h3>작업 완료 점검표</h3>
          <span class="site-count-badge">미작성 {{ checklistPendingCount }}건</span>
        </div>

        <div v-if="checklistTargets.length === 0" class="empty-state">
          진행중 또는 완료 상태의 작업일이 없습니다.
        </div>

        <div v-else class="doc-list">
          <div
              v-for="row in checklistTargets"
              :key="`${row.schedule.idx}-${row.workDt}`"
              class="doc-item"
          >
            <div class="doc-header">
              <div class="doc-title">
                <strong>{{ row.schedule.siteName }} · {{ row.schedule.itemName }}</strong>
                <span class="doc-meta">
                  작업일 {{ row.workDt }} · {{ getStaffNames(row.schedule.staffIds) || '인원 미배정' }}
                </span>
              </div>
              <button v-if="!row.checklist" class="btn-checklist" @click="openChecklistModal(row)">
                점검표 작성
              </button>
              <span v-else class="checklist-done-badge">
                <i class="mdi mdi-check-decagram"></i>
                {{ row.checklist.signerName }} 확인 · {{ '★'.repeat(row.checklist.rating) }}
              </span>
            </div>
            <p v-if="row.checklist?.issues" class="doc-note">
              <i class="mdi mdi-alert-outline"></i> 미비: {{ row.checklist.issues }}
            </p>
            <p v-if="row.checklist?.nextDayMemo" class="doc-note">
              <i class="mdi mdi-calendar-arrow-right"></i> 익일 지시: {{ row.checklist.nextDayMemo }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 일정 등록/수정 모달 ============ -->
    <div v-if="showAddModal" class="modal-overlay" @click="closeAddModal">
      <div class="modal-content modal-wide" @click.stop>
        <div class="modal-header">
          <h2>{{ isEditMode ? '대청소 일정 수정' : '대청소 일정 등록' }}</h2>
          <button class="btn-close" @click="closeAddModal"><i class="mdi mdi-close"></i></button>
        </div>

        <div class="modal-body">
          <div class="form-section">
            <h4 class="form-section-title">1. 어디를, 무엇을 청소하나요?</h4>
            <div class="form-group">
              <label>현장 <span class="req">*</span></label>
              <SiteSelect v-model="addForm.sIdx" width="100%" @change="onSiteChange" />
            </div>
            <div v-if="availableTasks.length > 0" class="form-group">
              <label>청소 항목 <span class="req">*</span></label>
              <select v-model="addForm.itemCd" class="form-control">
                <option value="" disabled>항목을 선택하세요</option>
                <option v-for="task in availableTasks" :key="task.code" :value="task.code">
                  {{ task.name }} (회당 {{ task.durationDays }}일{{ task.isService ? ' · 서비스' : '' }})
                </option>
              </select>
            </div>
            <p v-else-if="addForm.sIdx" class="field-hint">
              <i class="mdi mdi-information-outline"></i>
              이 현장 계약에 등록된 대청소 과업이 없습니다. 현장 상세 &gt; 계약정보에서 먼저 추가하세요.
            </p>
          </div>

          <div class="form-section">
            <h4 class="form-section-title">2. 언제 진행하나요?</h4>
            <div class="form-row">
              <div class="form-group">
                <label>시작일 <span class="req">*</span></label>
                <input v-model="addForm.startDt" type="date" class="form-control" max="9999-12-31" />
              </div>
              <div class="form-group">
                <label>종료일 <span class="req">*</span></label>
                <input v-model="addForm.endDt" type="date" class="form-control" max="9999-12-31" />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>시작 시간</label>
                <input v-model="addForm.startTm" type="time" class="form-control" />
              </div>
              <div class="form-group">
                <label>종료 시간</label>
                <input v-model="addForm.endTm" type="time" class="form-control" />
              </div>
            </div>

            <div v-if="formDuration > 0" class="duration-hint">
              <i class="mdi mdi-calendar-range"></i>
              전체 {{ formDuration }}일 범위 중 실제 소요일은
              <b>{{ formWorkingDays }}일</b>입니다.
              <span v-if="formWorkingDays !== formDuration" class="duration-hint-sub">
                (토·일·공휴일 미포함분 {{ formDuration - formWorkingDays }}일 제외)
              </span>
            </div>

            <!-- 토/일/공휴일 포함 여부 -->
            <div class="include-day-row">
              <span class="include-day-label"><i class="mdi mdi-calendar-check-outline"></i> 일정·소요일 포함 여부</span>
              <label class="form-check-inline"><input v-model="addForm.includeSat" type="checkbox" /> 토요일</label>
              <label class="form-check-inline"><input v-model="addForm.includeSun" type="checkbox" /> 일요일</label>
              <label class="form-check-inline"><input v-model="addForm.includeHoliday" type="checkbox" /> 공휴일</label>
            </div>
            <p class="field-hint">
              <i class="mdi mdi-information-outline"></i>
              체크를 해제하면 해당 날짜는 일정·소요일과 아래 일차별 작업표에서 자동으로 빠집니다.
            </p>
          </div>

          <div class="form-section">
            <h4 class="form-section-title">3. 담당 관리자</h4>
            <div class="form-group">
              <select v-model="addForm.mnIdx" class="form-control">
                <option value="">나중에 배정</option>
                <option v-for="m in managers" :key="m.idx" :value="m.idx">{{ m.name }}</option>
              </select>
            </div>
            <p class="field-hint">
              <i class="mdi mdi-information-outline"></i>
              공문을 발송하려면 작업자와 담당자가 모두 지정돼 있어야 합니다.
            </p>
          </div>

          <div class="form-section">
            <h4 class="form-section-title">
              4. 일차별 작업내용 및 인원 <span class="req">*</span>
              <span class="optional-tag">날짜마다 체크박스로 직접 골라요. 다음 날짜는 자동으로 전날 인원을 이어받아요</span>
            </h4>

            <div v-if="formStaffConflicts.length > 0" class="conflict-warning">
              <i class="mdi mdi-alert-outline"></i>
              <div>
                <div v-for="row in formStaffConflicts" :key="`${row.date}-${row.staffIdx}`">
                  <b>{{ row.date }}</b>: <b>{{ getStaffName(row.staffIdx) }}</b>님은 이미 다른 일정에 배정되어 있어요 —
                  {{ row.conflicts.map(c => `${c.siteName}·${c.itemName}`).join(', ') }}
                </div>
              </div>
            </div>

            <!-- 일차별 작업내용 + 인원 표 (JSON 저장) -->
            <div v-if="formCalendarDates.length > 0" class="daily-task-table">
              <div class="daily-task-header">
                <span>일차별 작업내용 · 인원</span>
                <span class="daily-task-count">실제 작업일 {{ formWorkingDays }}일</span>
              </div>
              <table class="daily-table">
                <tbody>
                <tr
                    v-for="row in addForm.dailyTasks"
                    :key="row.date"
                    :class="{ 'row-excluded': row.excluded }"
                >
                  <td class="daily-col-day">
                    <template v-if="!row.excluded">{{ row.dayIndex }}일차</template>
                    <template v-else>
                      <span class="daily-off-badge">{{ row.dayType }} 제외</span>
                    </template>
                    <span class="daily-date">{{ row.date.slice(5) }}</span>
                  </td>
                  <td class="daily-col-content">
                    <input
                        v-model="row.content"
                        type="text"
                        class="form-control"
                        :disabled="row.excluded"
                        :placeholder="row.excluded ? '휴무일 (작업 없음)' : '이 날 진행할 작업 내용을 입력하세요'"
                    />
                  </td>
                  <td class="daily-col-staff">
                    <template v-if="!row.excluded">
                      <div class="daily-staff-checks">
                        <div v-for="staff in cleaningStaff" :key="staff.idx" class="staff-check-with-leader">
                          <label class="form-check-inline">
                            <input
                                type="checkbox"
                                :checked="isDayStaffAssigned(row.date, staff.idx)"
                                @change="toggleDayStaff(row.date, staff.idx)"
                            />
                            {{ staff.name }}
                          </label>
                          <button
                              v-if="isDayStaffAssigned(row.date, staff.idx)"
                              type="button"
                              class="btn-leader-toggle"
                              :class="{ 'is-leader': isDayLeader(row.date, staff.idx) }"
                              :title="isDayLeader(row.date, staff.idx) ? '팀장 해제' : '이 날짜 팀장으로 지정'"
                              @click="setDayLeader(row.date, staff.idx)"
                          >
                            <i class="mdi mdi-crown"></i>
                          </button>
                        </div>
                        <span v-if="cleaningStaff.length === 0" class="empty-members">등록된 청소 인력이 없습니다.</span>
                      </div>
                    </template>
                    <span v-else class="empty-members">-</span>
                  </td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="form-section">
            <h4 class="form-section-title">
              5. 청소 완료 사진
              <span class="optional-tag">사진이 없으면 "완료" 상태로 저장할 수 없어요</span>
            </h4>

            <p v-if="!isEditMode" class="field-hint">
              <i class="mdi mdi-information-outline"></i>
              사진은 현장에서 작업 완료 후 업로드됩니다. 일정을 먼저 등록한 뒤, 사진이 올라오면 다시 열어 완료 처리하세요.
            </p>
            <template v-else>
              <div v-if="photosLoading" class="empty-state">사진을 불러오는 중...</div>
              <div v-else-if="schedulePhotos.length === 0" class="photo-empty">
                <i class="mdi mdi-camera-off-outline"></i>
                아직 업로드된 사진이 없습니다. 사진이 있어야 "완료" 처리할 수 있어요.
              </div>
              <div v-else class="photo-gallery">
                <a v-for="p in schedulePhotos" :key="p.idx || p.url" :href="p.url" target="_blank" class="photo-thumb">
                  <img :src="p.url" :alt="p.memo || '청소 완료 사진'" />
                  <span v-if="p.workDt" class="photo-date">{{ p.workDt }}</span>
                </a>
              </div>
            </template>
          </div>

          <div class="form-section">
            <h4 class="form-section-title">6. 현장에 전달할 내용</h4>

            <div class="form-group">
              <label>투입 장비 <span class="optional-tag">복수 선택 가능</span></label>
              <div class="equipment-check-row">
                <label v-for="opt in EQUIPMENT_OPTIONS" :key="opt" class="form-check-inline">
                  <input type="checkbox" :value="opt" v-model="addForm.equipment" /> {{ opt }}
                </label>
              </div>
            </div>
            <div class="form-group">
              <label>단지 요청사항</label>
              <textarea v-model="addForm.memo" class="form-control" rows="2" placeholder="현장에서 요청한 특이사항"></textarea>
            </div>
            <div class="form-group">
              <label>진행 상태</label>
              <select v-model.number="addForm.status" class="form-control">
                <option :value="0">예정</option>
                <option :value="1">확정</option>
                <option :value="2">진행중</option>
                <option :value="3" :disabled="schedulePhotos.length === 0">완료{{ schedulePhotos.length === 0 ? ' (사진 필요)' : '' }}</option>
                <option :value="4">취소</option>
              </select>
            </div>
          </div>

          <!--div class="form-section">
            <h4 class="form-section-title">7. 공문 발송</h4>
            <label class="doc-toggle">
              <input v-model="addForm.docRequired" type="checkbox" />
              <span>이 작업은 단지·담당자에게 공문을 보냅니다</span>
            </label>
            <div v-if="addForm.docRequired" class="form-row">
              <div class="form-group">
                <label>발송 시점</label>
                <div class="lead-input">
                  <span>작업 시작</span>
                  <input v-model.number="addForm.docLeadDays" type="number" min="0" max="60" class="form-control" />
                  <span>일 전</span>
                </div>
              </div>
              <div class="form-group">
                <label>발송 예정일</label>
                <input :value="formDocDueDate || '-'" type="text" class="form-control" readonly />
              </div>
            </div>
            <p class="field-hint">
              <i class="mdi mdi-information-outline"></i>
              저장하면 <b>공문·점검표</b> 탭의 발송 대기 목록에 올라갑니다. 발송은 그 화면에서 실행합니다.
            </p>
          </div-->
        </div>

        <div class="modal-footer">
          <button v-if="isEditMode" class="btn-danger btn-left" @click="deleteSchedule">삭제</button>
          <button class="btn-cancel" @click="closeAddModal">취소</button>
          <button class="btn-save" @click="saveAddModal">저장</button>
        </div>
      </div>
    </div>

    <!-- ============ 점검표 모달 ============ -->
    <div v-if="showChecklistModal" class="modal-overlay" @click="showChecklistModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>작업 완료 점검표</h2>
          <button class="btn-close" @click="showChecklistModal = false"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>작업일</label>
            <input v-model="checklistForm.workDt" type="date" class="form-control" readonly />
          </div>
          <div class="form-group">
            <label>소장 또는 책임자 성명 <span class="req">*</span></label>
            <input v-model="checklistForm.signerName" type="text" class="form-control" placeholder="확인자 성명" />
          </div>
          <div class="form-group">
            <label>만족도</label>
            <select v-model.number="checklistForm.rating" class="form-control">
              <option :value="5">★★★★★ 매우만족</option>
              <option :value="4">★★★★ 만족</option>
              <option :value="3">★★★ 보통</option>
              <option :value="2">★★ 미흡</option>
              <option :value="1">★ 매우미흡</option>
            </select>
          </div>
          <div class="form-group">
            <label>미비사항</label>
            <textarea v-model="checklistForm.issues" class="form-control" rows="2" placeholder="청소상태 미비사항이 있으면 기재"></textarea>
          </div>
          <div class="form-group">
            <label>익일 지시사항</label>
            <textarea v-model="checklistForm.nextDayMemo" class="form-control" rows="2" placeholder="미비 시 다음날 조치 지시사항"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="showChecklistModal = false">취소</button>
          <button class="btn-save" @click="saveChecklist">저장</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.site-cleaning-page { display: flex; flex-direction: column; gap: 20px; }
.page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.header-actions { display: flex; gap: 8px; }

/* ---------- 탭 ---------- */
.tab-nav { display: flex; gap: 4px; border-bottom: 1px solid var(--border-color, #e5e7eb); flex-wrap: wrap; }
.tab-item {
  display: flex; align-items: center; gap: 6px; padding: 10px 16px;
  background: none; border: none; border-bottom: 2px solid transparent;
  font-size: 14px; font-weight: 600; color: var(--text-sub, #4b5563);
  cursor: pointer; transition: color .2s, border-color .2s;
}
.tab-item:hover { color: var(--primary, #4f46e5); }
.tab-item.active { color: var(--primary, #4f46e5); border-bottom-color: var(--primary, #4f46e5); }
.tab-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  background: var(--danger, #ef4444); color: #fff;
  border-radius: 9px; font-size: 10px; font-weight: 700;
}
.tab-desc {
  display: flex; align-items: center; gap: 6px; margin: -8px 0 0;
  font-size: 12px; color: var(--text-sub, #4b5563);
}

/* ---------- 레이아웃 ---------- */
.content-body { display: grid; grid-template-columns: 3fr 1fr; gap: 20px; align-items: start; }
.doc-tab { display: flex; flex-direction: column; gap: 20px; }

.calendar-card, .status-card {
  background: var(--bg-surface, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 12px; padding: 24px;
  box-shadow: var(--shadow-sm, 0 1px 3px rgba(0,0,0,.06));
}
.status-card { display: flex; flex-direction: column; }
.status-card-full { width: 100%; }

.status-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 20px; padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.status-header i { font-size: 20px; color: var(--primary, #4f46e5); }
.status-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: var(--text-main, #111827); }
.status-header-with-controls { flex-wrap: wrap; justify-content: space-between; }

.side-header { flex-direction: column; align-items: stretch; gap: 10px; }
.side-header-top, .side-header-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.side-header-title { display: flex; align-items: center; gap: 8px; }
.btn-mini-group { display: flex; gap: 4px; }

.site-count-badge {
  font-size: 12px; font-weight: 600; color: var(--text-sub, #4b5563);
  background: var(--bg-hover, #f3f4f6); padding: 2px 8px; border-radius: 999px; white-space: nowrap;
}
.status-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.search-box {
  display: flex; align-items: center; gap: 4px; padding: 6px 10px;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; color: var(--text-sub, #4b5563);
}
.search-input { border: none; outline: none; font-size: 13px; width: 100%; min-width: 120px; background: transparent; }
.form-check-inline {
  display: flex; align-items: center; gap: 4px; font-size: 13px;
  color: var(--text-sub, #4b5563); cursor: pointer; white-space: nowrap;
}
.btn-mini {
  display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px;
  font-size: 12px; font-weight: 600; background: var(--bg-hover, #f3f4f6);
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px;
  cursor: pointer; white-space: nowrap; color: var(--text-sub, #4b5563); text-decoration: none;
}
.btn-mini:hover { background: var(--primary-soft, #e0e7ff); }

/* ---------- 캘린더 ---------- */
.filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
.filter-select { max-width: 180px; }
.filter-spacer { flex: 1; }

.calendar-header { display: flex; align-items: center; justify-content: center; gap: 16px; margin-bottom: 24px; }
.calendar-title {
  margin: 0; min-width: 130px; text-align: center;
  font-size: 20px; font-weight: 700; color: var(--text-main, #111827);
}
.btn-nav {
  width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;
  background: var(--bg-hover, #f3f4f6); border: none; border-radius: 8px;
  cursor: pointer; color: var(--text-sub, #4b5563); font-size: 20px;
}
.btn-nav:hover { background: var(--primary-soft, #e0e7ff); color: var(--primary, #4f46e5); }
.btn-today {
  padding: 6px 12px; background: var(--bg-canvas, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px;
  font-size: 13px; font-weight: 600; color: var(--text-sub, #4b5563); cursor: pointer;
}

.calendar-grid { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; overflow: hidden; }
.calendar-weekdays {
  display: grid; grid-template-columns: repeat(7, 1fr);
  background: var(--bg-canvas, #f9fafb); border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.weekday { padding: 12px 0; text-align: center; font-size: 14px; font-weight: 600; color: var(--text-sub, #4b5563); }
.text-danger { color: var(--danger, #ef4444); }
.text-primary { color: var(--primary, #4f46e5); }
.text-gray { color: #cbd5e1; }

.calendar-body {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 140px; /* 추가: 모든 주의 높이를 140px로 고정 */
}
.calendar-cell {
  display: flex; flex-direction: column; gap: 6px;
  height: 100%; /* 변경: min-height: 120px; 대신 height: 100% 사용 */
  overflow: hidden; /* 추가: 영역 밖으로 삐져나가는 것 방지 */
  cursor: pointer;
  border-right: 1px solid var(--border-color, #e5e7eb);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  transition: background .2s;
}
.calendar-cell:nth-child(7n) { border-right: none; }
.calendar-body .calendar-cell:nth-last-child(-n+7) { border-bottom: none; }
.calendar-cell:hover { background: var(--bg-canvas, #f9fafb); }
.not-current { background: var(--bg-canvas, #f9fafb); opacity: .55; }
.is-holiday-cell:not(.not-current) { background: rgba(239, 68, 68, .04); }
.cell-date-row {
  display: flex; align-items: baseline; justify-content: flex-end;
  gap: 4px; padding: 8px 8px 0;
}
.cell-date { font-size: 14px; font-weight: 500; color: var(--text-main, #111827); }
.cell-holiday-name {
  font-size: 10px; font-weight: 700; color: var(--danger, #ef4444);
  max-width: 72px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.is-today .cell-date {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 2px 8px; border-radius: 4px;
  background: var(--primary, #4f46e5); color: #fff; font-weight: 700;
}
.cell-schedules {
  display: flex; flex-direction: column; gap: 2px;
  flex: 1; /* 추가: 남은 세로 공간을 꽉 채움 */
  overflow-y: auto; /* 추가: 내용이 많으면 세로 스크롤 생성 */
  padding-bottom: 4px; /* 스크롤 여유 공간 */
}
.cell-schedules::-webkit-scrollbar {
  width: 4px;
}
.cell-schedules::-webkit-scrollbar-track {
  background: transparent;
}
.cell-schedules::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 4px;
}
.cell-add-hint {
  display: flex; align-items: center; justify-content: center; gap: 2px;
  padding: 4px 0; font-size: 11px; color: var(--primary, #4f46e5);
  opacity: 0; transition: opacity .15s;
}
.calendar-cell:hover .cell-add-hint { opacity: .85; }
.not-current .cell-add-hint { display: none; }

.schedule-bar {
  height: 22px; display: flex; align-items: center;
  color: #fff; cursor: pointer; box-sizing: border-box; transition: filter .2s;
}
.schedule-bar:hover { filter: brightness(.9); }
.schedule-bar.is-pending {
  background-image: repeating-linear-gradient(45deg, rgba(255,255,255,.25), rgba(255,255,255,.25) 8px, transparent 8px, transparent 16px) !important;
  border-top: 1px dashed rgba(0,0,0,.28);
  border-bottom: 1px dashed rgba(0,0,0,.28);
}
.schedule-bar.is-start { border-top-left-radius: 4px; border-bottom-left-radius: 4px; margin-left: 4px; }
.schedule-bar.is-end { border-top-right-radius: 4px; border-bottom-right-radius: 4px; margin-right: 4px; }
.schedule-bar.is-middle { border-radius: 0; margin: 0; }

/* 요구사항: 토/일/공휴일 체크 해제된 날은 달력에서도 색칠 없이 비워 보이게 */
.schedule-bar.is-excluded-day {
  background: transparent !important;
  background-image: none !important;
  border: 1px dashed var(--border-color, #d1d5db);
  cursor: pointer;
}
.schedule-bar.is-excluded-day:hover { filter: none; background: var(--bg-canvas, #f9fafb) !important; }
.schedule-bar.is-excluded-day .bar-content { visibility: hidden; }

/* 요구사항: 청소 상황에 "취소" 상태 추가 */
.schedule-bar.is-cancelled {
  background-image: repeating-linear-gradient(45deg, rgba(255,255,255,.4), rgba(255,255,255,.4) 6px, transparent 6px, transparent 12px) !important;
  opacity: .7;
}
.schedule-bar.is-cancelled .bar-title { text-decoration: line-through; }

.schedule-bar-empty { height: 22px; }

.bar-content {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 0 6px; overflow: hidden; white-space: nowrap; gap: 4px;
}
.bar-title { font-size: 10px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.bar-badge {
  flex-shrink: 0; padding: 1px 4px; border-radius: 4px;
  font-size: 9px; font-weight: 700; background: var(--danger, #ef4444);
}
.bar-badge.doc-ok { background: rgba(0,0,0,.22); }

.calendar-legend {
  display: flex; flex-wrap: wrap; gap: 16px; margin-top: 16px; padding-top: 12px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}
.legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-sub, #4b5563); }
.legend-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.legend-dot-pending {
  background: repeating-linear-gradient(45deg, #cbd5e1, #cbd5e1 2px, #fff 2px, #fff 4px);
  border: 1px solid #94a3b8;
}
.legend-dot-excluded { background: transparent; border: 1px dashed #94a3b8; }

/* ---------- 실시현황 ---------- */
.status-list { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; max-height: 700px; }
.status-masonry {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  grid-auto-rows: min-content; align-items: start; gap: 14px;
}
.status-item {
  background: var(--bg-surface, #fff); border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px; padding: 14px 16px; transition: border-color .2s, box-shadow .2s;
}
.status-item:hover { border-color: var(--primary-soft, #c7d2fe); box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.status-list .status-item { background: var(--bg-canvas, #f9fafb); }
.status-completed { opacity: .6; }

.status-item-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; cursor: pointer; }
.status-item-header h4 {
  margin: 0; min-width: 0; font-size: 14px; font-weight: 700; color: var(--text-main, #111827);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.status-summary { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.summary-chip {
  padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 700;
  background: var(--bg-hover, #f3f4f6); color: var(--text-sub, #4b5563); white-space: nowrap;
}
.summary-remain { background: #fef2f2; color: var(--danger, #ef4444); }
.summary-done { background: #f0fdf4; color: var(--success, #22c55e); }
.summary-warning { display: flex; align-items: center; gap: 2px; background: #fff7ed; color: #f97316; }
.expand-icon { flex-shrink: 0; font-size: 18px; color: var(--text-sub, #4b5563); }

.status-item-body {
  margin-top: 14px; padding-top: 14px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}
.task-info {
  display: flex; flex-direction: column; gap: 4px;
  margin-bottom: 12px; padding-bottom: 12px;
  border-bottom: 1px dashed var(--border-color, #e5e7eb);
}
.task-info:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
.task-name { font-size: 13px; font-weight: 600; color: var(--text-main, #111827); }
.task-completed .task-name { color: #9ca3af; }
.task-counts { display: flex; align-items: center; gap: 10px; font-size: 12px; font-weight: 500; flex-wrap: wrap; }
.task-counts.sub { margin-top: 2px; }
.count-total { color: #64748b; }
.count-used { color: var(--primary, #4f46e5); }
.count-remain { color: var(--danger, #ef4444); font-weight: 700; }
.task-completed .count-total, .task-completed .count-used, .task-completed .count-remain { color: #9ca3af; }

.badge-service, .badge-doc, .badge-done, .badge-notdone, .badge-notdone-warning {
  display: inline-block; margin-left: 4px; padding: 1px 6px;
  border-radius: 4px; font-size: 10px; font-weight: 700;
}
.badge-service { background: #64748b; color: #fff; }
.badge-doc { background: #eef2ff; color: #4338ca; }
.badge-done { background: #dcfce7; color: #166534; }
.badge-notdone { background: #f3f4f6; color: #6b7280; }
.badge-notdone-warning { display: inline-flex; align-items: center; gap: 2px; background: #fee2e2; color: #b91c1c; }

.cycle-badge {
  display: inline-block; margin-top: 6px; padding: 3px 8px;
  background: var(--bg-hover, #f3f4f6); border-radius: 4px;
  font-size: 11px; color: var(--text-sub, #4b5563);
}
.segment-row { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.segment-chip { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; }
.seg-done { background: #dcfce7; color: #166534; }
.seg-warn { background: #fee2e2; color: #b91c1c; }
.seg-planned { background: #e0f2fe; color: #0369a1; }
.seg-idle { background: #f3f4f6; color: #6b7280; }

/* ---------- 소요일 합산 ---------- */
.workload-summary {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px; margin-bottom: 20px;
}
.ws-card {
  display: flex; flex-direction: column; gap: 4px; padding: 14px 16px;
  background: var(--bg-canvas, #f9fafb); border: 1px solid var(--border-color, #e5e7eb); border-radius: 10px;
}
.ws-card.ws-alert { border-color: rgba(239,68,68,.4); background: rgba(239,68,68,.04); }
.ws-label { font-size: 12px; color: var(--text-sub, #4b5563); font-weight: 500; }
.ws-value { font-size: 20px; font-weight: 700; color: var(--text-main, #111827); }

.table-scroll { overflow-x: auto; }
.workload-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 640px; }
.workload-table th, .workload-table td {
  border: 1px solid var(--border-color, #e5e7eb); padding: 10px 12px; text-align: center; white-space: nowrap;
}
.workload-table th { background: var(--bg-canvas, #f9fafb); font-weight: 700; }
.th-team { text-align: left; }
.th-total, .cell-rowtotal {
  background: rgba(79,70,229,.06); color: var(--primary, #4f46e5); font-weight: 700;
}
.team-name-cell { font-weight: 700; text-align: left !important; }
.team-name-cell small { margin-left: 6px; font-weight: 500; color: var(--text-sub, #4b5563); }
.cell-overload { background: #fee2e2; color: var(--danger, #ef4444); font-weight: 700; }
.cell-zero { color: #cbd5e1; }
.row-unassigned td { background: #fffbeb; }
.row-total td { background: var(--bg-hover, #f3f4f6); font-weight: 700; border-top: 2px solid var(--border-color, #e5e7eb); }
.table-hint { margin-top: 12px; font-size: 12px; color: var(--text-sub, #4b5563); }

.th-compare { min-width: 110px; }
.cell-compare { font-weight: 700; color: var(--text-sub, #4b5563); background: var(--bg-canvas, #f9fafb); }
.cell-compare.is-over { color: var(--danger, #ef4444); background: #fef2f2; }

/* ---------- 인원 배정 (리스트형) ---------- */
.assign-wrapper { display: flex; flex-direction: column; gap: 16px; }
.kanban-intro {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  background: var(--bg-canvas, #f9fafb); border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px; font-size: 12px; color: var(--text-sub, #4b5563);
}
.kanban-intro i { flex-shrink: 0; font-size: 16px; color: var(--primary, #4f46e5); }

.assign-toolbar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }

.assign-list {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 14px; align-items: start;
}
.assign-card {
  display: flex; flex-direction: column; gap: 10px;
  background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px;
  box-shadow: 0 1px 2px rgba(0,0,0,.05);
}
.assign-card.is-unassigned { border-left: 3px solid var(--danger, #ef4444); }
.assign-card-main { cursor: pointer; }
.assign-card-staff {
  display: flex; flex-direction: column; gap: 8px;
  padding-top: 10px; border-top: 1px dashed var(--border-color, #e5e7eb);
}
.assigned-staff-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.daily-staff-summary {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 700; color: #b45309;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 4px 8px; width: fit-content;
}
.staff-editor-popover {
  display: flex; flex-direction: column; gap: 8px; padding: 10px;
  background: var(--bg-canvas, #f9fafb); border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px;
}
.staff-check-with-leader { display: flex; align-items: center; gap: 6px; }
.btn-leader-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; padding: 0; border-radius: 4px;
  background: transparent; border: 1px solid var(--border-color, #e5e7eb);
  color: #94a3b8; cursor: pointer; font-size: 13px; flex-shrink: 0;
}
.btn-leader-toggle:hover { border-color: #fcd34d; color: #d97706; }
.btn-leader-toggle.is-leader { background: #fffbeb; border-color: #fcd34d; color: #d97706; }
.leader-summary {
  display: flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 700; color: #b45309; width: fit-content;
}

.member-chip {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 2px 6px; background: #f1f5f9; color: #475569;
  border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px;
}
.member-chip.is-leader { background: #fffbeb; color: #b45309; border-color: #fcd34d; font-weight: 700; }
.member-chip.is-leader i { font-size: 12px; }
.empty-members { font-size: 11px; color: #94a3b8; }

.task-card-header { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.task-site { font-weight: 700; font-size: 14px; color: #0f172a; }
.task-date { font-size: 12px; color: #64748b; font-weight: 500; white-space: nowrap; }
.task-card-body p { margin: 0 0 6px; font-size: 13px; color: #334155; }
.task-card-body p:last-child { margin-bottom: 0; }
.dur-chip {
  margin-left: 4px; padding: 1px 6px; background: #f1f5f9;
  border-radius: 4px; font-size: 11px; font-weight: 700; color: #475569;
}
.task-address, .task-equip, .task-time { color: #64748b !important; font-size: 12px !important; }
.task-note {
  color: #92400e !important; background: #fefce8; padding: 6px;
  border: 1px dashed #fde047; border-radius: 4px; font-size: 12px !important;
}
.task-tags { display: flex; gap: 4px; margin-top: 10px; flex-wrap: wrap; }
.status-badge {
  padding: 2px 6px; background: #e2e8f0; color: #475569;
  border-radius: 4px; font-size: 11px; font-weight: 600;
}
.status-badge.is-fixed { background: #e0f2fe; color: #0369a1; }
.status-badge.is-progress { background: #fef3c7; color: #b45309; }
.status-badge.is-done { background: #dcfce7; color: #15803d; }
.status-badge.is-cancelled { background: #e5e7eb; color: #6b7280; text-decoration: line-through; }
.status-badge.is-warn { background: #fee2e2; color: #b91c1c; }
.btn-icon-small {
  display: flex; align-items: center; gap: 4px; padding: 4px 8px; width: fit-content;
  background: transparent; border: 1px solid #cbd5e1; border-radius: 6px;
  color: #64748b; cursor: pointer; font-size: 13px;
}
.btn-icon-small:hover { background: #f1f5f9; color: #0f172a; }

/* ---------- 공문 / 점검표 ---------- */
.doc-list { display: flex; flex-direction: column; gap: 12px; }
.doc-item { border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; padding: 14px 16px; }
.doc-item-pending { border-left: 3px solid var(--danger, #ef4444); }
.doc-header {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; margin-bottom: 10px; font-size: 13px;
}
.doc-title { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.doc-meta { font-size: 11px; color: var(--text-sub, #4b5563); }
.doc-snapshot { display: flex; flex-wrap: wrap; gap: 10px; font-size: 12px; color: var(--text-sub, #4b5563); }
.doc-snapshot span { display: inline-flex; align-items: center; gap: 4px; }
.doc-warn, .doc-note {
  display: flex; align-items: center; gap: 4px; margin: 8px 0 0;
  font-size: 12px; color: #b45309;
}
.doc-note { color: var(--text-sub, #4b5563); }

.receipt-row { display: flex; flex-wrap: wrap; gap: 8px; }
.receipt-chip {
  display: flex; align-items: center; gap: 4px; padding: 4px 10px;
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 999px;
  font-size: 12px; color: var(--text-sub, #4b5563); cursor: pointer; transition: all .2s;
}
.receipt-chip:hover { border-color: var(--primary, #4f46e5); }
.receipt-chip.confirmed {
  border-color: var(--success, #22c55e); color: var(--success, #22c55e);
  background: #f0fdf4; cursor: default;
}
.receipt-time { font-size: 10px; opacity: .8; }
.btn-checklist {
  display: inline-flex; align-items: center; gap: 4px; padding: 6px 12px;
  background: var(--primary, #4f46e5); color: #fff; border: none; border-radius: 6px;
  font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
.btn-checklist:disabled { opacity: .5; cursor: not-allowed; }
.checklist-done-badge {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; font-weight: 700; color: var(--success, #22c55e); white-space: nowrap;
}
.empty-state { padding: 24px; text-align: center; color: var(--text-sub, #4b5563); font-size: 13px; }

/* ---------- 모달 ---------- */
.modal-overlay {
  position: fixed; inset: 0; z-index: 1000; padding: 20px;
  background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center;
}
.modal-content {
  display: flex; flex-direction: column; width: 100%; max-width: 460px;
  max-height: 90vh; overflow-y: auto; background: #fff;
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.2);
}
.modal-wide { max-width: 720px; }
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.modal-header h2 { margin: 0; font-size: 18px; font-weight: 700; }
.btn-close { background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-sub, #4b5563); }
.modal-body { display: flex; flex-direction: column; gap: 20px; padding: 20px; }
.modal-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 16px 20px; border-top: 1px solid var(--border-color, #e5e7eb);
}
.modal-footer-split { justify-content: space-between; }
.footer-right { display: flex; gap: 8px; }
.btn-left { margin-right: auto; }

.form-section {
  display: flex; flex-direction: column; gap: 16px;
  padding-bottom: 16px; border-bottom: 1px dashed var(--border-color, #e5e7eb);
}
.form-section:last-of-type { padding-bottom: 0; border-bottom: none; }
.form-section-title {
  display: flex; align-items: center; gap: 6px; margin: 0;
  font-size: 13px; font-weight: 700; color: var(--primary, #4f46e5);
}
.form-group { display: flex; flex-direction: column; gap: 8px; }
.form-group label { font-size: 13px; font-weight: 600; color: var(--text-main, #111827); }
.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.form-control {
  padding: 10px 12px; border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px; font-size: 14px; width: 100%; box-sizing: border-box; background: #fff;
}
.form-control:focus {
  outline: none; border-color: var(--primary, #4f46e5);
  box-shadow: 0 0 0 3px rgba(79,70,229,.12);
}
textarea.form-control { resize: vertical; font-family: inherit; }
.req { color: var(--danger, #ef4444); }
.optional-tag {
  padding: 1px 6px; background: var(--bg-hover, #f3f4f6);
  border-radius: 4px; font-size: 10px; font-weight: 700; color: var(--text-sub, #4b5563);
}
.field-hint {
  display: flex; align-items: flex-start; gap: 4px; margin: 0; padding: 8px 10px;
  background: var(--bg-canvas, #f9fafb); border-radius: 6px;
  font-size: 12px; color: var(--text-sub, #4b5563);
}
.duration-hint { margin-top: -8px; font-size: 13px; font-weight: 600; color: var(--primary, #4f46e5); }
.duration-hint-sub { font-weight: 500; color: var(--text-sub, #4b5563); font-size: 12px; margin-left: 4px; }
.doc-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.lead-input { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-sub, #4b5563); }
.lead-input .form-control { width: 72px; text-align: right; }

/* 토/일/공휴일 포함 여부 */
.include-day-row {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 10px 12px; background: var(--bg-canvas, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px;
}
.include-day-label {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; font-weight: 700; color: var(--text-main, #111827); margin-right: 4px;
}

/* 투입 인원 / 투입 장비 (복수 선택) */
.equipment-check-row {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 10px 12px; background: var(--bg-canvas, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px;
}

/* 작업자 일정 겹침 경고 */
.conflict-warning {
  display: flex; align-items: flex-start; gap: 6px; margin-top: 8px;
  padding: 10px 12px; background: #fef2f2; border: 1px solid #fecaca;
  border-radius: 8px; font-size: 12px; color: #b91c1c; line-height: 1.6;
}
.conflict-warning i { flex-shrink: 0; font-size: 16px; margin-top: 1px; }

/* 청소 완료 사진 */
.photo-empty {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 28px 16px; text-align: center; color: #b91c1c;
  background: #fef2f2; border: 1px dashed #fecaca; border-radius: 8px; font-size: 13px;
}
.photo-empty i { font-size: 28px; }
.photo-gallery {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px;
}
.photo-thumb {
  position: relative; display: block; aspect-ratio: 1 / 1;
  border-radius: 8px; overflow: hidden; border: 1px solid var(--border-color, #e5e7eb);
}
.photo-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.photo-date {
  position: absolute; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,.55); color: #fff; font-size: 11px; padding: 2px 6px; text-align: center;
}

/* 일차별 작업내용 표 */
.daily-task-table {
  border: 1px solid var(--border-color, #e5e7eb); border-radius: 8px; overflow: hidden;
}
.daily-task-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 12px; background: var(--bg-canvas, #f9fafb);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  font-size: 13px; font-weight: 700; color: var(--text-main, #111827);
}
.daily-task-count { font-size: 12px; font-weight: 600; color: var(--primary, #4f46e5); }
.daily-table { width: 100%; border-collapse: collapse; }
.daily-table tr:not(:last-child) td { border-bottom: 1px solid var(--border-color, #e5e7eb); }
.daily-table td { padding: 10px; vertical-align: top; }
.daily-col-day {
  width: 92px; min-width: 92px;
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  font-size: 13px; font-weight: 700; color: var(--primary, #4f46e5);
}
.daily-date { font-size: 11px; font-weight: 500; color: var(--text-sub, #4b5563); }
.daily-col-content { width: 35%; }
.daily-col-content .form-control { padding: 6px 10px; font-size: 13px; }
.daily-col-staff { width: 40%; min-width: 220px; }
.daily-staff-checks {
  display: flex; flex-wrap: wrap; gap: 8px 12px;
  padding: 6px 8px; background: var(--bg-canvas, #f9fafb); border-radius: 6px;
}
.row-excluded { background: var(--bg-canvas, #f9fafb); }
.row-excluded .daily-col-day { color: #9ca3af; }
.daily-off-badge {
  display: inline-block; padding: 1px 6px; background: #f3f4f6;
  border-radius: 4px; font-size: 11px; font-weight: 700; color: #6b7280;
}

.btn-add, .btn-save {
  display: flex; align-items: center; gap: 6px; padding: 8px 16px;
  background: var(--primary, #4f46e5); color: #fff; border: none;
  border-radius: 8px; font-weight: 600; cursor: pointer;
}
.btn-add:hover, .btn-save:hover { background: var(--primary-hover, #4338ca); }
.btn-cancel {
  padding: 8px 16px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
}
.btn-danger {
  padding: 8px 16px; background: var(--danger, #ef4444); color: #fff;
  border: none; border-radius: 6px; font-weight: 600; cursor: pointer;
}
.btn-danger:hover { background: #dc2626; }

/* ---------- 반응형 ---------- */
@media (max-width: 1024px) {
  .content-body { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .calendar-body {
    grid-auto-rows: 110px; /* 모바일 화면에서는 달력 한 칸 높이를 110px로 고정 */
  }
  .form-row { grid-template-columns: 1fr; }
  .assign-list { grid-template-columns: 1fr; }
  .bar-title { font-size: 9px; }
  .workload-summary { grid-template-columns: repeat(2, 1fr); }
}
</style>