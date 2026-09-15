<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';

const { siteOptions, fetchSiteOptions } = useApi();

/* =========================================================================
 * 상수
 * ========================================================================= */
const DAY_MS = 86400000;
const WARN_AFTER_MONTHS = 4; // 요구사항 7: 구간 시작 후 4개월 경과하면 경고

const STATUS_LABEL = { 0: '예정', 1: '확정', 2: '진행중', 3: '완료' };
const DOC_STATUS_LABEL = { 0: '미발송', 1: '발송', 2: '일부확인', 3: '확인완료' };
const RECEIPT_TYPE_LABEL = { SITE: '단지', MANAGER: '담당자', TEAM: '팀장' };

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
  workload: '팀별 월 소요일 합계입니다. 월 15일을 넘긴 팀은 강조되니 추가 편성 판단에 쓰세요.',
  assign: '미배정 현장을 팀 칸으로 끌어다 놓으면 바로 배정됩니다. 배정된 일정도 옮길 수 있어요.',
  documents: '발송할 공문을 확인하고, 단지·담당자·팀장 세 곳의 수신확인 상태를 관리하세요.'
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

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push({ date: d.getDate(), isCurrentMonth: false, dateStr: fmtDate(d) });
  }
  for (let i = 1; i <= lastDate; i++) {
    const d = new Date(year, month, i);
    days.push({
      date: i,
      isCurrentMonth: true,
      isToday: fmtDate(d) === todayStr(),
      dateStr: fmtDate(d)
    });
  }
  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    days.push({ date: i, isCurrentMonth: false, dateStr: fmtDate(d) });
  }
  return days;
});

// 화면에 보이는 6주 범위 (레인 계산을 이 범위로 한정해 빈 스페이서 폭증을 막음)
const visibleRange = computed(() => ({
  from: calendarDays.value[0]?.dateStr ?? todayStr(),
  to: calendarDays.value[41]?.dateStr ?? todayStr()
}));

/* =========================================================================
 * 2. 마스터 데이터 (팀 / 팀원 / 관리자)
 * ========================================================================= */
const cleaningStaff = ref([]);
const teams = ref([]);
const managers = ref([]);

const getTeamName = (teamIdx) => teams.value.find((t) => t.idx === teamIdx)?.teamName || '미배정';
const getTeamLeaderName = (teamIdx) => teams.value.find((t) => t.idx === teamIdx)?.leaderName || '-';
const getManagerName = (mnIdx) => managers.value.find((m) => m.idx === mnIdx)?.name || '-';

const getTeamMembers = (teamIdx) => {
  const team = teams.value.find((t) => t.idx === teamIdx);
  if (!team?.memberIds) return [];
  return team.memberIds.map((i) => cleaningStaff.value.find((s) => s.idx === i)).filter(Boolean);
};

const fetchCleaningStaff = async () => {
  try {
    const { data } = await axios.get('/api/v1/member/cleaning');
    cleaningStaff.value = data.data || [];
  } catch (e) {
    console.error('청소 인력 로드 실패:', e);
    cleaningStaff.value = [];
  }
};

const fetchCleaningTeam = async () => {
  try {
    const { data } = await axios.get('/api/v1/site/cleaning/team');
    if (!data.result) throw new Error(data.message);
    teams.value = (data.data || []).map((t) => {
      const memberIds = t.memberIds ? String(t.memberIds).split(',').map(Number) : [];
      const leader = cleaningStaff.value.find((s) => s.idx === t.leaderId);
      return {
        idx: t.idx,
        teamName: t.teamName,
        leaderId: t.leaderId ?? null,
        leaderName: leader ? leader.name : '-',
        memberIds
      };
    });
  } catch (e) {
    console.error('팀 목록 로드 실패:', e);
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
 * 3. 일정 데이터
 *    DB는 tIdx, 화면은 teamIdx를 쓰므로 로드 시 한 번만 정규화한다.
 * ========================================================================= */
const cleaningSchedules = ref([]);

const normalizeSchedule = (s) => {
  const startDt = s.startDt ? String(s.startDt).slice(0, 10) : '';
  const endDt = s.endDt ? String(s.endDt).slice(0, 10) : startDt;
  const durationDays =
      Number(s.durationDays) ||
      (startDt && endDt ? Math.floor((new Date(endDt) - new Date(startDt)) / DAY_MS) + 1 : 1);

  return {
    ...s,
    teamIdx: s.teamIdx ?? s.tIdx ?? null,
    mnIdx: s.mnIdx ?? null,
    status: Number(s.status ?? 0),
    startDt,
    endDt,
    durationDays,
    equipment: s.equipment || '',
    memo: s.memo || '',
    address: s.address || '',
    siteName: s.siteName || '',
    itemName: s.itemName || '',
    docRequired: s.docRequired === 'Y' || s.docRequired === true,
    docStatus: Number(s.docStatus ?? 0),
    docLeadDays: Number(s.docLeadDays ?? 7)
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

      // 주기 범위 안의 일정만 집계 (요구사항 2)
      const inCycle = siteSchedules.filter((s) => {
        if (s.itemCd !== config.code) return false;
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
const filterMode = ref('all');       // all | team | manager
const filterTeamIdx = ref('');
const filterManagerIdx = ref('');
const docFilter = ref('all');        // all | confirmed | pending

const isDocPending = (s) => s.docRequired && s.docStatus < 3;

const calendarFilteredSchedules = computed(() =>
    cleaningSchedules.value
        .filter((s) => {
          if (filterMode.value === 'team' && filterTeamIdx.value !== '' && s.teamIdx !== filterTeamIdx.value) return false;
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
      byDate[day.dateStr][lane] = { ...s, dayIndex, isStartDay: dayIndex === 1 };
    });
  });
  return byDate;
});

const getSchedulesForDate = (dateStr) => schedulesByDate.value[dateStr] || [];
const cellHasSchedules = (dateStr) => getSchedulesForDate(dateStr).some(Boolean);

const getStatusColor = (status) => {
  if (Number(status) === 3) return 'var(--success, #22c55e)';
  if (Number(status) === 2) return 'var(--warning, #f59e0b)';
  if (Number(status) === 1) return '#0ea5e9';
  return 'var(--primary, #4f46e5)';
};
const statusLabel = (status) => STATUS_LABEL[Number(status)] ?? '-';

/* =========================================================================
 * 8. 팀 배정 (Kanban) — teamIdx 로 통일, 롤백 안전
 * ========================================================================= */
const draggedTask = ref(null);

const onDragStart = (e, task) => {
  draggedTask.value = task;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => e.target.classList.add('is-dragging'), 0);
};
const onDragEnd = (e) => {
  e.target.classList.remove('is-dragging');
  draggedTask.value = null;
};

const onDrop = async (e, teamIdx) => {
  const task = draggedTask.value;
  if (!task || task.teamIdx === teamIdx) return;

  const prevTeamIdx = task.teamIdx;
  const prevStatus = task.status;

  // 낙관적 업데이트
  task.teamIdx = teamIdx;
  if (teamIdx !== null && task.status === 0) task.status = 1; // 팀 배정 → 확정

  try {
    const { data } = await axios.put(`/api/v1/site/cleaning/schedule/${task.idx}`, {
      tIdx: teamIdx,          // DB 컬럼명
      teamIdx: teamIdx,       // 호환용
      status: task.status
    });
    if (!data.result) throw new Error(data.message || '팀 배정 실패');
  } catch (error) {
    console.error('팀 배정 실패:', error);
    task.teamIdx = prevTeamIdx;
    task.status = prevStatus;
    window.customAlert?.('팀 배정에 실패했습니다. 이전 상태로 되돌렸습니다.', 'error');
  }
};

const getUnassignedTasks = computed(() =>
    cleaningSchedules.value
        .filter((s) => s.teamIdx === null || s.teamIdx === '' || s.teamIdx === undefined)
        .sort((a, b) => a.startDt.localeCompare(b.startDt))
);

const getTasksForTeam = (teamIdx) =>
    cleaningSchedules.value
        .filter((s) => s.teamIdx === teamIdx)
        .sort((a, b) => a.startDt.localeCompare(b.startDt));

const getTeamDays = (teamIdx) =>
    getTasksForTeam(teamIdx).reduce((a, s) => a + (s.durationDays || 0), 0);

/* =========================================================================
 * 9. 팀 편성 모달
 * ========================================================================= */
const showTeamModal = ref(false);
const editingTeam = ref(null);

const openTeamModal = (team) => {
  editingTeam.value = JSON.parse(JSON.stringify(team));
  editingTeam.value.memberIds ??= [];
  if (!editingTeam.value.leaderId && editingTeam.value.memberIds.length) {
    editingTeam.value.leaderId = editingTeam.value.memberIds[0];
  }
  showTeamModal.value = true;
};
const closeTeamModal = () => {
  showTeamModal.value = false;
  editingTeam.value = null;
};
const createNewTeam = () => {
  editingTeam.value = {
    idx: null,
    teamName: `${teams.value.length + 1}팀`,
    leaderId: null,
    leaderName: '-',
    memberIds: []
  };
  showTeamModal.value = true;
};

const toggleMember = (mIdx) => {
  const ids = (editingTeam.value.memberIds ??= []);
  const i = ids.indexOf(mIdx);
  if (i > -1) {
    ids.splice(i, 1);
    if (editingTeam.value.leaderId === mIdx) editingTeam.value.leaderId = ids[0] ?? null;
  } else {
    ids.push(mIdx);
    if (ids.length === 1) editingTeam.value.leaderId = mIdx;
  }
};
const setLeader = (mIdx) => { editingTeam.value.leaderId = mIdx; };

const saveTeamMembers = async () => {
  const { idx, teamName, memberIds, leaderId } = editingTeam.value;
  if (!teamName?.trim()) {
    window.customAlert?.('팀명을 입력해주세요.', 'error');
    return;
  }

  const members = (memberIds || []).map((mIdx) => ({
    mIdx,
    leaderFl: leaderId === mIdx ? 'Y' : 'N'
  }));
  if (members.length && !members.some((m) => m.leaderFl === 'Y')) members[0].leaderFl = 'Y';

  try {
    const url = `/api/v1/member/cleaning/team${idx ? `/${idx}` : ''}`;
    const method = idx ? 'put' : 'post';
    const { data } = await axios[method](url, { name: teamName.trim(), members });
    if (!data.result) throw new Error(data.message);

    closeTeamModal();
    await fetchCleaningTeam();
  } catch (error) {
    console.error('팀 저장 실패:', error);
    window.customAlert?.('팀 저장에 실패했습니다.', 'error');
  }
};

const deleteTeam = async (teamIdx) => {
  if (getTasksForTeam(teamIdx).length > 0) {
    window.customAlert?.('배정된 일정이 있어 삭제할 수 없습니다. 먼저 일정을 다른 팀으로 옮겨주세요.', 'error');
    return;
  }
  if (!(await (window.customConfirm?.('이 팀을 삭제하시겠습니까?') ?? Promise.resolve(confirm('이 팀을 삭제하시겠습니까?'))))) return;

  try {
    await axios.delete(`/api/v1/member/cleaning/team/${teamIdx}`);
    closeTeamModal();
    await fetchCleaningTeam();
  } catch (error) {
    console.error('팀 삭제 실패:', error);
    window.customAlert?.('팀 삭제에 실패했습니다.', 'error');
  }
};

/* =========================================================================
 * 10. 소요일 합산 (요구사항 8)
 *     팀별 + 미배정 + 전체 합계까지 한 표에서 확인
 * ========================================================================= */
const teamWorkload = computed(() => {
  const months = [];
  const base = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 2, 1);
  for (let i = 0; i < 6; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const sumFor = (predicate, ym) =>
      cleaningSchedules.value
          .filter((s) => s.startDt.startsWith(ym) && predicate(s))
          .reduce((a, s) => a + (s.durationDays || 0), 0);

  const rows = teams.value.map((team) => {
    const cells = months.map((ym) => sumFor((s) => s.teamIdx === team.idx, ym));
    const memberCount = getTeamMembers(team.idx).length;
    return {
      key: `team-${team.idx}`,
      teamIdx: team.idx,
      teamName: team.teamName,
      memberCount,
      cells,
      rowTotal: cells.reduce((a, b) => a + b, 0)
    };
  });

  const unassignedCells = months.map((ym) => sumFor((s) => !s.teamIdx, ym));
  const totalCells = months.map((ym) => sumFor(() => true, ym));

  return {
    months,
    rows,
    unassigned: {
      key: 'unassigned',
      teamName: '미배정',
      cells: unassignedCells,
      rowTotal: unassignedCells.reduce((a, b) => a + b, 0)
    },
    total: {
      key: 'total',
      teamName: '전체 합계',
      cells: totalCells,
      rowTotal: totalCells.reduce((a, b) => a + b, 0)
    }
  };
});

// 계약 기준 총 소요일 (전 단지) — 추가 팀 편성 판단용
const contractTotalDays = computed(() =>
    cleaningStatusBySite.value.reduce((a, s) => a + s.siteTotalDays, 0)
);
const plannedTotalDays = computed(() =>
    cleaningStatusBySite.value.reduce((a, s) => a + s.sitePlannedDays, 0)
);

/* =========================================================================
 * 11. 일정 등록 / 수정 모달 (요구사항 10)
 * ========================================================================= */
const showAddModal = ref(false);
const isEditMode = ref(false);
const editingIdx = ref(null);

const blankForm = () => ({
  sIdx: '',
  itemCd: '',
  startDt: '',
  endDt: '',
  status: 0,
  teamIdx: '',
  mnIdx: '',
  equipment: '',
  memo: '',
  docRequired: false,
  docLeadDays: 7
});

const addForm = ref(blankForm());

const availableTasks = computed(() => {
  if (!addForm.value.sIdx) return [];
  return siteContracts.value.find((s) => s.sIdx === addForm.value.sIdx)?.cleaningConfig || [];
});

const selectedSite = computed(() =>
    siteContracts.value.find((s) => s.sIdx === addForm.value.sIdx) || null
);

const formDuration = computed(() => {
  const { startDt, endDt } = addForm.value;
  if (!startDt || !endDt) return 0;
  return Math.floor((new Date(endDt) - new Date(startDt)) / DAY_MS) + 1;
});

const formDocDueDate = computed(() => {
  if (!addForm.value.startDt || !addForm.value.docRequired) return null;
  const d = new Date(addForm.value.startDt);
  d.setDate(d.getDate() - (Number(addForm.value.docLeadDays) || 0));
  return fmtDate(d);
});

const onSiteChange = () => {
  addForm.value.itemCd = '';
  addForm.value.docRequired = false;
};

// 항목을 고르면 계약 설정에서 소요일·공문 여부를 상속 (요구사항 1, 5)
watch(() => addForm.value.itemCd, (code) => {
  if (!code || isEditMode.value) return;
  const task = availableTasks.value.find((t) => t.code === code);
  if (!task) return;

  addForm.value.docRequired = task.docRequired;
  addForm.value.docLeadDays = task.docLeadDays;

  if (addForm.value.startDt && task.durationDays > 0) {
    const end = new Date(addForm.value.startDt);
    end.setDate(end.getDate() + task.durationDays - 1);
    addForm.value.endDt = fmtDate(end);
  }
});

const openAddModal = (dateStr = '') => {
  isEditMode.value = false;
  editingIdx.value = null;
  addForm.value = { ...blankForm(), startDt: dateStr, endDt: dateStr };
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
    status: Number(schedule.status),
    teamIdx: schedule.teamIdx ?? '',
    mnIdx: schedule.mnIdx ?? '',
    equipment: schedule.equipment,
    memo: schedule.memo,
    docRequired: schedule.docRequired,
    docLeadDays: schedule.docLeadDays
  };
  showAddModal.value = true;
};

const closeAddModal = () => { showAddModal.value = false; };

const saveAddModal = async () => {
  const f = addForm.value;
  if (!f.sIdx || !f.itemCd || !f.startDt || !f.endDt) {
    window.customAlert?.('현장, 청소 항목, 시작일, 종료일은 필수입니다.', 'error');
    return;
  }
  if (f.endDt < f.startDt) {
    window.customAlert?.('종료일은 시작일보다 앞설 수 없습니다.', 'error');
    return;
  }

  const site = selectedSite.value;
  const task = findConfig(f.sIdx, f.itemCd);
  if (!site || !task) {
    window.customAlert?.('현장 계약 정보를 찾을 수 없습니다.', 'error');
    return;
  }

  const payload = {
    cIdx: useAuthStore().user?.cIdx,
    sIdx: site.sIdx,
    siteName: site.siteName,
    itemCd: task.code,
    itemName: task.name,
    startDt: f.startDt,
    endDt: f.endDt,
    durationDays: formDuration.value,
    status: Number(f.status),
    tIdx: f.teamIdx === '' ? null : f.teamIdx,
    teamIdx: f.teamIdx === '' ? null : f.teamIdx,
    mnIdx: f.mnIdx === '' ? null : f.mnIdx,
    equipment: f.equipment || null,
    memo: f.memo || null,
    docRequired: f.docRequired ? 'Y' : 'N',
    docLeadDays: Number(f.docLeadDays) || 7
  };

  try {
    const url = `/api/v1/site/cleaning/schedule${isEditMode.value ? `/${editingIdx.value}` : ''}`;
    const method = isEditMode.value ? 'put' : 'post';
    const { data } = await axios[method](url, payload);
    if (!data.result) throw new Error(data.message);

    await fetchSchedules();
    closeAddModal();
  } catch (error) {
    console.error('일정 저장 실패:', error);
    window.customAlert?.('일정 저장에 실패했습니다.', 'error');
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
 * 12. 공문 발송 / 수신확인 (요구사항 5, 6)
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
      .filter((s) => s.docRequired && s.docStatus === 0)
      .map((s) => {
        const d = new Date(s.startDt);
        d.setDate(d.getDate() - (s.docLeadDays || 7));
        return { ...s, sendDueDt: fmtDate(d) };
      })
      .filter((s) => s.sendDueDt <= today)
      .sort((a, b) => a.startDt.localeCompare(b.startDt));
});

// 발송했지만 3자 확인이 안 끝난 건
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
    durationDays: schedule.durationDays,
    teamName: getTeamName(schedule.teamIdx),
    teamLeader: getTeamLeaderName(schedule.teamIdx),
    managerName: getManagerName(schedule.mnIdx),
    equipment: schedule.equipment,
    memo: schedule.memo
  };
};

const buildReceipts = (schedule) => [
  { targetType: 'SITE', targetIdx: schedule.sIdx, targetName: schedule.siteName },
  { targetType: 'MANAGER', targetIdx: schedule.mnIdx, targetName: getManagerName(schedule.mnIdx) },
  { targetType: 'TEAM', targetIdx: schedule.teamIdx, targetName: getTeamLeaderName(schedule.teamIdx) }
];

const issuingIdx = ref(null);

const issueDocument = async (schedule) => {
  if (!schedule.teamIdx || !schedule.mnIdx) {
    window.customAlert?.('팀과 담당 관리자를 먼저 배정해야 공문을 발송할 수 있습니다.', 'error');
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
 * 13. 완료 점검표 (요구사항 9)
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
      .filter((s) => s.status >= 2)
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
 * 14. 초기 로드
 * ========================================================================= */
onMounted(async () => {
  await Promise.all([fetchSiteOptions(), fetchCleaningStaff(), fetchManagers()]);
  await Promise.all([fetchCleaningTeam(), fetchSchedules(), fetchDocuments(), fetchChecklists()]);
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
      <button :class="['tab-item', { active: activeTab === 'status' }]" @click="activeTab = 'status'">
        <i class="mdi mdi-clipboard-text-outline"></i> 현장별 실시현황
        <span v-if="totalWarningCount > 0" class="tab-badge">{{ totalWarningCount }}</span>
      </button>
      <button :class="['tab-item', { active: activeTab === 'workload' }]" @click="activeTab = 'workload'">
        <i class="mdi mdi-account-group-outline"></i> 소요일 합산
      </button>
      <button :class="['tab-item', { active: activeTab === 'assign' }]" @click="activeTab = 'assign'">
        <i class="mdi mdi-account-switch"></i> 팀 배정
        <span v-if="getUnassignedTasks.length > 0" class="tab-badge">{{ getUnassignedTasks.length }}</span>
      </button>
      <button :class="['tab-item', { active: activeTab === 'documents' }]" @click="activeTab = 'documents'">
        <i class="mdi mdi-file-document-outline"></i> 공문·점검표
        <span v-if="pendingDocSchedules.length + checklistPendingCount > 0" class="tab-badge">
          {{ pendingDocSchedules.length + checklistPendingCount }}
        </span>
      </button>
    </div>
    <p class="tab-desc"><i class="mdi mdi-arrow-right-thin"></i> {{ tabDescriptions[activeTab] }}</p>

    <!-- ============ 탭1: 캘린더 ============ -->
    <div v-if="activeTab === 'calendar'" class="content-body">
      <div class="calendar-card">
        <div class="filter-bar">
          <select v-model="filterMode" class="form-control filter-select">
            <option value="all">전체 보기</option>
            <option value="team">팀별</option>
            <option value="manager">담당자별</option>
          </select>
          <select v-if="filterMode === 'team'" v-model="filterTeamIdx" class="form-control filter-select">
            <option value="">팀 선택</option>
            <option v-for="t in teams" :key="t.idx" :value="t.idx">{{ t.teamName }} ({{ t.leaderName }})</option>
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
                :class="['calendar-cell', { 'not-current': !day.isCurrentMonth, 'is-today': day.isToday }]"
                @click="openAddModal(day.dateStr)"
            >
              <div class="cell-date">{{ day.date }}</div>
              <div class="cell-schedules">
                <template v-for="(schedule, lane) in getSchedulesForDate(day.dateStr)" :key="lane">
                  <div
                      v-if="schedule"
                      :class="['schedule-bar', {
                        'is-pending': isDocPending(schedule),
                        'is-start': schedule.isStartDay,
                        'is-end': schedule.dayIndex === schedule.durationDays,
                        'is-middle': !schedule.isStartDay && schedule.dayIndex < schedule.durationDays
                      }]"
                      :style="{ backgroundColor: getStatusColor(schedule.status) }"
                      :title="`${schedule.siteName} · ${schedule.itemName}\n${getTeamName(schedule.teamIdx)} / ${getManagerName(schedule.mnIdx)}\n${schedule.startDt} ~ ${schedule.endDt} (${schedule.durationDays}일)`"
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
          <span class="legend-item"><i class="legend-dot legend-dot-pending"></i> 공문 수신확인 대기</span>
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
        <h3>팀별 월 소요일 합계</h3>
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
          <span class="ws-label">운영 팀 수</span>
          <span class="ws-value">{{ teams.length }}팀</span>
        </div>
        <div class="ws-card" :class="{ 'ws-alert': getUnassignedTasks.length > 0 }">
          <span class="ws-label">미배정 일정</span>
          <span class="ws-value">{{ getUnassignedTasks.length }}건</span>
        </div>
      </div>

      <div class="table-scroll">
        <table class="workload-table">
          <thead>
          <tr>
            <th class="th-team">팀</th>
            <th v-for="ym in teamWorkload.months" :key="ym">{{ ym }}</th>
            <th class="th-total">누적</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="row in teamWorkload.rows" :key="row.key">
            <td class="team-name-cell">
              {{ row.teamName }}
              <small>{{ row.memberCount }}명</small>
            </td>
            <td v-for="(cell, i) in row.cells" :key="i" :class="{ 'cell-overload': cell >= 15, 'cell-zero': cell === 0 }">
              {{ cell }}일
            </td>
            <td class="cell-rowtotal">{{ row.rowTotal }}일</td>
          </tr>
          <tr class="row-unassigned">
            <td class="team-name-cell">{{ teamWorkload.unassigned.teamName }}</td>
            <td v-for="(cell, i) in teamWorkload.unassigned.cells" :key="i" :class="{ 'cell-zero': cell === 0 }">
              {{ cell }}일
            </td>
            <td class="cell-rowtotal">{{ teamWorkload.unassigned.rowTotal }}일</td>
          </tr>
          </tbody>
          <tfoot>
          <tr class="row-total">
            <td class="team-name-cell">{{ teamWorkload.total.teamName }}</td>
            <td v-for="(cell, i) in teamWorkload.total.cells" :key="i">{{ cell }}일</td>
            <td class="cell-rowtotal">{{ teamWorkload.total.rowTotal }}일</td>
          </tr>
          </tfoot>
        </table>
      </div>

      <p class="table-hint">
        월 15일 이상 배정된 팀은 붉게 표시됩니다. 미배정 행에 소요일이 쌓여 있으면 팀 추가 편성을 검토하세요.
      </p>
    </div>

    <!-- ============ 탭4: 팀 배정 ============ -->
    <div v-if="activeTab === 'assign'" class="kanban-wrapper">
      <div class="kanban-intro">
        <i class="mdi mdi-information-outline"></i>
        현장 카드를 팀 칸으로 끌어다 놓으면 배정되고 상태가 '확정'으로 바뀝니다. 저장에 실패하면 원래 자리로 되돌아갑니다.
      </div>

      <div class="kanban-board">
        <div class="kanban-col unassigned-col" @dragover.prevent @drop="onDrop($event, null)">
          <div class="col-header">
            <h4><i class="mdi mdi-clipboard-text-outline"></i> 미배정 현장</h4>
            <span class="task-count">{{ getUnassignedTasks.length }}</span>
          </div>
          <div class="col-body">
            <div
                v-for="task in getUnassignedTasks"
                :key="task.idx"
                class="task-card"
                draggable="true"
                @dragstart="onDragStart($event, task)"
                @dragend="onDragEnd"
            >
              <div class="task-card-header">
                <span class="task-site">{{ task.siteName }}</span>
                <span class="task-date">
                  {{ task.startDt === task.endDt ? task.startDt : `${task.startDt} ~ ${task.endDt}` }}
                </span>
              </div>
              <div class="task-card-body">
                <p><strong>{{ task.itemName }}</strong> <span class="dur-chip">{{ task.durationDays }}일</span></p>
                <p v-if="task.address" class="task-address"><i class="mdi mdi-map-marker-outline"></i> {{ task.address }}</p>
                <p v-if="task.equipment" class="task-equip"><i class="mdi mdi-wrench-outline"></i> {{ task.equipment }}</p>
                <p v-if="task.memo" class="task-note"><i class="mdi mdi-alert-circle-outline"></i> {{ task.memo }}</p>
              </div>
              <div class="task-card-footer"><i class="mdi mdi-drag"></i> 끌어서 팀에 배정</div>
            </div>
            <div v-if="getUnassignedTasks.length === 0" class="empty-col">미배정 건이 없습니다.</div>
          </div>
        </div>

        <div
            v-for="team in teams"
            :key="team.idx"
            class="kanban-col team-col"
            @dragover.prevent
            @drop="onDrop($event, team.idx)"
        >
          <div class="col-header col-header-team">
            <div class="col-header-top">
              <h4><i class="mdi mdi-account-group-outline"></i> {{ team.teamName }}</h4>
              <button class="btn-icon-small" @click="openTeamModal(team)">
                <i class="mdi mdi-account-cog"></i> 인원편성
              </button>
            </div>
            <div class="team-info">
              <div class="team-member-list">
                <span
                    v-for="member in getTeamMembers(team.idx)"
                    :key="member.idx"
                    class="member-chip"
                    :class="{ 'is-leader': member.idx === team.leaderId }"
                >
                  {{ member.name }}
                </span>
                <span v-if="getTeamMembers(team.idx).length === 0" class="empty-members">편성된 인원 없음</span>
              </div>
              <div class="team-metrics">
                <span class="task-count">{{ getTasksForTeam(team.idx).length }}건</span>
                <span class="task-count days">{{ getTeamDays(team.idx) }}일</span>
              </div>
            </div>
          </div>
          <div class="col-body">
            <div
                v-for="task in getTasksForTeam(team.idx)"
                :key="task.idx"
                class="task-card assigned"
                draggable="true"
                @dragstart="onDragStart($event, task)"
                @dragend="onDragEnd"
            >
              <div class="task-card-header">
                <span class="task-site">{{ task.siteName }}</span>
                <span class="task-date">
                  {{ task.startDt === task.endDt ? task.startDt : `${task.startDt} ~ ${task.endDt}` }}
                </span>
              </div>
              <div class="task-card-body">
                <p><strong>{{ task.itemName }}</strong> <span class="dur-chip">{{ task.durationDays }}일</span></p>
                <div class="task-tags">
                  <span
                      class="status-badge"
                      :class="{ 'is-done': task.status === 3, 'is-progress': task.status === 2, 'is-fixed': task.status === 1 }"
                  >
                    {{ statusLabel(task.status) }}
                  </span>
                  <span v-if="task.docRequired" class="status-badge" :class="task.docStatus === 3 ? 'is-done' : 'is-warn'">
                    공문 {{ DOC_STATUS_LABEL[task.docStatus] }}
                  </span>
                </div>
              </div>
            </div>
            <div v-if="getTasksForTeam(team.idx).length === 0" class="empty-col">
              배정된 일정이 없습니다.<br />왼쪽에서 카드를 끌어다 놓으세요.
            </div>
          </div>
        </div>

        <div class="kanban-col add-team-col" @click="createNewTeam">
          <i class="mdi mdi-plus-circle-outline"></i>
          <span>새 청소팀 추가</span>
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
              <span><i class="mdi mdi-account-group-outline"></i> {{ getTeamName(s.teamIdx) }} / {{ getTeamLeaderName(s.teamIdx) }}</span>
              <span><i class="mdi mdi-account-tie-outline"></i> {{ getManagerName(s.mnIdx) }}</span>
              <span v-if="s.equipment"><i class="mdi mdi-wrench-outline"></i> {{ s.equipment }}</span>
              <span v-if="s.memo"><i class="mdi mdi-message-alert-outline"></i> {{ s.memo }}</span>
            </div>
            <p v-if="!s.teamIdx || !s.mnIdx" class="doc-warn">
              <i class="mdi mdi-alert-outline"></i> 팀 또는 담당자가 비어 있어 발송할 수 없습니다.
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
                  작업일 {{ row.workDt }} · {{ getTeamName(row.schedule.teamIdx) }}
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

    <!-- ============ 팀 편성 모달 ============ -->
    <div v-if="showTeamModal" class="modal-overlay" @click="closeTeamModal">
      <div class="modal-content modal-wide" @click.stop>
        <div class="modal-header">
          <h2>팀 설정 및 인원 편성</h2>
          <button class="btn-close" @click="closeTeamModal"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>팀명</label>
            <input v-model="editingTeam.teamName" type="text" class="form-control" placeholder="예: 4팀, 외벽특수팀" />
          </div>

          <div class="form-group">
            <label>인원 선택 <span class="optional-tag">왕관을 누르면 팀장</span></label>
            <div class="staff-selection-list">
              <div
                  v-for="staff in cleaningStaff"
                  :key="staff.idx"
                  class="staff-item"
                  :class="{ 'is-selected': editingTeam?.memberIds?.includes(staff.idx) }"
                  @click="toggleMember(staff.idx)"
              >
                <div class="staff-info">
                  <span class="staff-role">{{ staff.position }}</span>
                  <span class="staff-name">{{ staff.name }}</span>
                </div>
                <div class="staff-actions-row">
                  <button
                      v-if="editingTeam?.memberIds?.includes(staff.idx)"
                      type="button"
                      class="btn-leader-select"
                      :class="{ 'is-leader': editingTeam.leaderId === staff.idx }"
                      @click.stop="setLeader(staff.idx)"
                  >
                    <i class="mdi mdi-crown"></i>
                    {{ editingTeam.leaderId === staff.idx ? '팀장' : '팀장 지정' }}
                  </button>
                  <i
                      class="mdi check-icon"
                      :class="editingTeam?.memberIds?.includes(staff.idx) ? 'mdi-check-circle text-primary' : 'mdi-checkbox-blank-circle-outline text-gray'"
                  ></i>
                </div>
              </div>
              <div v-if="cleaningStaff.length === 0" class="empty-state">등록된 청소 인력이 없습니다.</div>
            </div>
          </div>
        </div>
        <div class="modal-footer modal-footer-split">
          <button v-if="editingTeam?.idx" class="btn-danger" @click="deleteTeam(editingTeam.idx)">팀 삭제</button>
          <div v-else></div>
          <div class="footer-right">
            <button class="btn-cancel" @click="closeTeamModal">취소</button>
            <button class="btn-save" @click="saveTeamMembers">저장</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 일정 등록/수정 모달 ============ -->
    <div v-if="showAddModal" class="modal-overlay" @click="closeAddModal">
      <div class="modal-content" @click.stop>
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
            <div v-if="formDuration > 0" class="duration-hint">
              <i class="mdi mdi-calendar-range"></i> 총 {{ formDuration }}일간 진행되는 일정으로 등록됩니다.
            </div>
          </div>

          <div class="form-section">
            <h4 class="form-section-title">3. 누가 담당하나요? <span class="optional-tag">선택</span></h4>
            <div class="form-row">
              <div class="form-group">
                <label>대청소팀</label>
                <select v-model="addForm.teamIdx" class="form-control">
                  <option value="">나중에 배정</option>
                  <option v-for="t in teams" :key="t.idx" :value="t.idx">{{ t.teamName }} ({{ t.leaderName }})</option>
                </select>
              </div>
              <div class="form-group">
                <label>담당 관리자</label>
                <select v-model="addForm.mnIdx" class="form-control">
                  <option value="">나중에 배정</option>
                  <option v-for="m in managers" :key="m.idx" :value="m.idx">{{ m.name }}</option>
                </select>
              </div>
            </div>
            <p class="field-hint">
              <i class="mdi mdi-information-outline"></i>
              공문을 발송하려면 팀과 담당자가 모두 지정돼 있어야 합니다.
            </p>
          </div>

          <div class="form-section">
            <h4 class="form-section-title">4. 현장에 전달할 내용</h4>
            <div class="form-group">
              <label>투입 장비</label>
              <!--input v-model="addForm.equipment" type="text" class="form-control" placeholder="예: 고압세척기, 사다리차" /-->
              <select v-model="addForm.equipment" class="form-control">
                <option value="" disabled>투입 장비가 있다면 선택하세요.</option>
                <option value="고압세척기">고압세척기</option>
                <option value="사다리차">사다리차</option>
              </select>
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
                <option :value="3">완료</option>
              </select>
            </div>
          </div>

          <!--div class="form-section">
            <h4 class="form-section-title">5. 공문 발송</h4>
            <label class="doc-toggle">
              <input v-model="addForm.docRequired" type="checkbox" />
              <span>이 작업은 단지·담당자·팀장에게 공문을 보냅니다</span>
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
.cell-date { padding: 8px; align-self: flex-end; font-size: 14px; font-weight: 500; color: var(--text-main, #111827); }
.is-today .cell-date {
  display: inline-flex; align-items: center; justify-content: center;
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

/* ---------- 칸반 ---------- */
.kanban-wrapper { display: flex; flex-direction: column; }
.kanban-intro {
  display: flex; align-items: center; gap: 8px; margin-bottom: 16px; padding: 10px 14px;
  background: var(--bg-canvas, #f9fafb); border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px; font-size: 12px; color: var(--text-sub, #4b5563);
}
.kanban-intro i { flex-shrink: 0; font-size: 16px; color: var(--primary, #4f46e5); }
.kanban-board { display: flex; gap: 16px; overflow-x: auto; padding-bottom: 8px; align-items: flex-start; }
.kanban-col {
  display: flex; flex-direction: column; width: 320px; min-width: 320px;
  background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;
  max-height: calc(100vh - 240px);
}
.unassigned-col { background: #fdf8f6; border-color: #fce7f3; }
.col-header {
  display: flex; justify-content: space-between; align-items: center; padding: 16px;
  background: #fff; border-bottom: 1px solid #e2e8f0; border-radius: 12px 12px 0 0;
}
.col-header-team { flex-direction: column; align-items: stretch; gap: 8px; }
.col-header-top { display: flex; justify-content: space-between; align-items: center; }
.unassigned-col .col-header { border-bottom-color: #fce7f3; }
.col-header h4 {
  margin: 0; display: flex; align-items: center; gap: 6px;
  font-size: 15px; font-weight: 700; color: #1e293b;
}
.unassigned-col .col-header h4 { color: #be123c; }
.team-info { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; width: 100%; }
.team-member-list { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
.member-chip {
  padding: 2px 6px; background: #f1f5f9; color: #475569;
  border: 1px solid #e2e8f0; border-radius: 4px; font-size: 12px;
}
.member-chip.is-leader { background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; font-weight: 600; }
.empty-members { font-size: 11px; color: #94a3b8; }
.team-metrics { display: flex; gap: 4px; flex-shrink: 0; }
.task-count {
  padding: 2px 8px; background: #e2e8f0; color: #475569;
  border-radius: 12px; font-size: 12px; font-weight: 700; white-space: nowrap;
}
.task-count.days { background: #eef2ff; color: #4338ca; }
.unassigned-col .task-count { background: #ffe4e6; color: #e11d48; }

.col-body {
  display: flex; flex-direction: column; gap: 12px; flex: 1;
  padding: 12px; overflow-y: auto; min-height: 180px;
}
.task-card {
  background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px;
  cursor: grab; box-shadow: 0 1px 2px rgba(0,0,0,.05); transition: border-color .2s, box-shadow .2s;
}
.task-card:hover { border-color: #cbd5e1; box-shadow: 0 4px 6px -1px rgba(0,0,0,.1); }
.task-card:active { cursor: grabbing; }
.task-card.is-dragging { opacity: .5; background: #f1f5f9; }
.task-card.assigned { border-left: 4px solid #3b82f6; }
.task-card-header { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.task-site { font-weight: 700; font-size: 14px; color: #0f172a; }
.task-date { font-size: 12px; color: #64748b; font-weight: 500; white-space: nowrap; }
.task-card-body p { margin: 0 0 6px; font-size: 13px; color: #334155; }
.task-card-body p:last-child { margin-bottom: 0; }
.dur-chip {
  margin-left: 4px; padding: 1px 6px; background: #f1f5f9;
  border-radius: 4px; font-size: 11px; font-weight: 700; color: #475569;
}
.task-address, .task-equip { color: #64748b !important; font-size: 12px !important; }
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
.status-badge.is-warn { background: #fee2e2; color: #b91c1c; }
.task-card-footer {
  display: flex; align-items: center; gap: 4px; margin-top: 10px; padding-top: 8px;
  border-top: 1px dashed #e2e8f0; font-size: 11px; color: #94a3b8;
}
.empty-col {
  padding: 24px 0; text-align: center; color: #94a3b8;
  font-size: 13px; font-style: italic; line-height: 1.6;
}
.add-team-col {
  justify-content: center; align-items: center; min-height: 200px;
  background: transparent; border: 2px dashed #cbd5e1; color: #64748b; cursor: pointer;
}
.add-team-col:hover { border-color: #3b82f6; color: #3b82f6; background: #eff6ff; }
.add-team-col i { font-size: 32px; margin-bottom: 8px; }
.add-team-col span { font-weight: 600; font-size: 15px; }
.btn-icon-small {
  display: flex; align-items: center; gap: 4px; padding: 4px 8px;
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
.modal-wide { max-width: 560px; }
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
.doc-toggle { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.lead-input { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--text-sub, #4b5563); }
.lead-input .form-control { width: 72px; text-align: right; }

.staff-selection-list {
  display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  max-height: 360px; overflow-y: auto;
}
.staff-item {
  display: flex; justify-content: space-between; align-items: center; gap: 8px;
  padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; cursor: pointer; transition: all .2s;
}
.staff-item:hover { border-color: #cbd5e1; background: #f8fafc; }
.staff-item.is-selected { border-color: #3b82f6; background: #eff6ff; }
.staff-role {
  margin-right: 6px; padding: 2px 6px; background: #e2e8f0;
  border-radius: 4px; font-size: 12px; color: #475569;
}
.staff-name { font-size: 14px; font-weight: 500; color: #1e293b; }
.staff-actions-row { display: flex; align-items: center; gap: 8px; }
.check-icon { font-size: 20px; }
.btn-leader-select {
  display: flex; align-items: center; gap: 4px; padding: 4px 8px;
  background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px;
  color: #64748b; font-size: 11px; font-weight: 700; cursor: pointer; white-space: nowrap;
}
.btn-leader-select.is-leader { background: #fffbeb; border-color: #fcd34d; color: #d97706; }
.btn-leader-select.is-leader i { color: #f59e0b; }

.btn-add, .btn-save {
  display: flex; align-items: center; gap: 6px; padding: 8px 16px;
  background: var(--primary, #4f46e5); color: #fff; border: none;
  border-radius: 8px; font-weight: 600; cursor: pointer;
}
.btn-add:hover, .btn-save:hover { background: var(--primary-hover, #4338ca); }
.btn-cancel {
  padding: 8px 16px; background: #fff; border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px; font-weight: 600; cursor: pointer;
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
  .staff-selection-list { grid-template-columns: 1fr; }
  .bar-title { font-size: 9px; }
  .workload-summary { grid-template-columns: repeat(2, 1fr); }
}
</style>