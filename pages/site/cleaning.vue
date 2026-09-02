<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";

const router = useRouter();

const {
  siteOptions,
  fetchSiteOptions
} = useApi();

// ========================================================
// 0. 탭 상태
// ========================================================
const activeTab = ref('calendar'); // calendar | status | workload | documents

// 탭별 한 줄 설명 (복잡해 보이는 화면을 "지금 무엇을 하는 탭인지"로 풀어주는 용도)
const tabDescriptions = {
  calendar: '날짜를 클릭해 새 일정을 등록하세요. 등록된 일정을 클릭하면 세부 내용을 보고 수정할 수 있어요.',
  workload: '팀별로 이번 달 전후 얼마나 바쁜지 한눈에 확인하세요. 15일 이상 배정된 팀은 강조 표시돼요.',
  assign: '왼쪽 미배정 현장을 원하는 팀 칸으로 끌어다 놓으면 바로 배정됩니다. 이미 배정된 일정도 다른 팀으로 옮길 수 있어요.'
};

// ========================================================
// 1. 달력 상태 및 생성 로직
// ========================================================
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


// ========================================================
// 팀 배정 (Kanban) 로직
// ========================================================
const draggedTask = ref(null);

const onDragStart = (e, task) => {
  draggedTask.value = task;
  e.dataTransfer.effectAllowed = 'move';
  // 드래그 시 고스트 이미지 디자인을 위해 약간의 딜레이
  setTimeout(() => {
    e.target.classList.add('is-dragging');
  }, 0);
};

const onDragEnd = (e) => {
  e.target.classList.remove('is-dragging');
  draggedTask.value = null;
};

const onDrop1 = (e, teamIdx) => {
  if (draggedTask.value) {
    draggedTask.value.teamIdx = teamIdx;
    // 배정 시 상태 자동 업데이트 (예: 예정)
    if (teamIdx !== null && draggedTask.value.status === '대기') {
      draggedTask.value.status = '0';
    }
  }
};

const onDrop = async (e, teamIdx) => {
  if (draggedTask.value) {
    const taskIdx = draggedTask.value.idx;
    const previousTeamIdx = draggedTask.value.tIdx; // 실패 시 롤백용
    const previousStatus = draggedTask.value.status;   // 실패 시 롤백용

    // 1. 프론트엔드 UI 즉시 업데이트 (사용자 경험을 위해 먼저 변경)
    draggedTask.value.teamIdx = teamIdx;
    let newStatus = draggedTask.value.status;
    if (teamIdx !== null && draggedTask.value.status === '대기') {
      newStatus = '0';
      draggedTask.value.status = newStatus;
    }

    try {
      const payload = {
        tIdx: teamIdx,
        status: newStatus
      };

      const res = await axios.put(`/api/v1/site/cleaning/schedule/${taskIdx}`, payload);

      if (!res.data.result) {
        throw new Error(res.data.message || '팀 배정 실패');
      }

      // 성공 시 별도 처리 불필요 (이미 UI는 변경됨)

    } catch (error) {
      console.error('팀 배정 DB 업데이트 에러:', error);
      window.customAlert('팀 배정 중 오류가 발생했습니다. 원래 상태로 되돌립니다.', 'error');

      // 3. 실패 시 프론트엔드 UI 롤백
      const task = cleaningSchedules.value.find(s => s.idx === taskIdx);
      if (task) {
        task.teamIdx = previousTeamIdx;
        task.status = previousStatus;
      }
    }
  }
};

const getUnassignedTasks = computed(() => {
  // console.log(cleaningSchedules.value, 'cleaningSchedules')
  return cleaningSchedules.value.filter(s => s.teamIdx == null || s.teamIdx == '');
});

const getTasksForTeam = (teamIdx) => {
  return cleaningSchedules.value.filter(s => s.teamIdx === teamIdx);
};

// ========================================================
// 2. 대청소팀 / 담당자 마스터 (임시 데이터 - 추후 API로 교체)
// ========================================================
const cleaningStaff = ref([
    /*
  { idx: 1, name: '김철수', position: '반장' },
  { idx: 2, name: '이영희', position: '반장' },
  { idx: 3, name: '박민수', position: '반장' },
  { idx: 4, name: '홍길동', position: '팀원' },
  { idx: 5, name: '유재석', position: '팀원' },
  { idx: 6, name: '강호동', position: '팀원' },
  { idx: 7, name: '신동엽', position: '팀원' },
  { idx: 8, name: '이수근', position: '팀원' },
  { idx: 9, name: '조세호', position: '팀원' },
  { idx: 10, name: '서장훈', position: '팀원' },

     */
]);

const teams = ref([
    /*
  { idx: 1, teamName: '1팀', leaderId: 1, leaderName: '김철수', memberIds: [1, 4, 5] },
  { idx: 2, teamName: '2팀', leaderId: 2, leaderName: '이영희', memberIds: [2, 6, 7] },
  { idx: 3, teamName: '3팀', leaderId: 3, leaderName: '박민수', memberIds: [3, 8] }

     */
]);

const getTeamMembers = (teamIdx) => {
  const team = teams.value.find(t => t.idx === teamIdx);
  if (!team || !team.memberIds) return [];
  return team.memberIds.map(idx => cleaningStaff.value.find(s => s.idx === idx)).filter(Boolean);
};

const showTeamModal = ref(false);
const editingTeam = ref(null);

const openTeamModal = (team) => {
  editingTeam.value = JSON.parse(JSON.stringify(team));
  // 기존 팀의 leaderId 유지, 없으면 선택된 첫 번째 사람을 리더로
  if (!editingTeam.value.leaderId && editingTeam.value.memberIds?.length > 0) {
    editingTeam.value.leaderId = editingTeam.value.memberIds[0];
  }
  if (!editingTeam.value.memberIds) editingTeam.value.memberIds = [];
  showTeamModal.value = true;
};

const closeTeamModal = () => {
  showTeamModal.value = false;
  editingTeam.value = null;
};

const toggleMember = (mIdx) => {
  if (!editingTeam.value.memberIds) editingTeam.value.memberIds = [];

  const index = editingTeam.value.memberIds.indexOf(mIdx);
  if (index > -1) {
    // 체크 해제 시
    editingTeam.value.memberIds.splice(index, 1);
    // 만약 해제된 사람이 팀장이었다면, 남은 사람 중 첫 번째를 팀장으로 변경
    if (editingTeam.value.leaderId === mIdx) {
      editingTeam.value.leaderId = editingTeam.value.memberIds.length > 0 ? editingTeam.value.memberIds[0] : null;
    }
  } else {
    // 체크 시
    editingTeam.value.memberIds.push(mIdx);
    // 첫 멤버가 추가되었다면 자동으로 팀장으로 지정
    if (editingTeam.value.memberIds.length === 1) {
      editingTeam.value.leaderId = mIdx;
    }
  }
};

const saveTeamMembersTmp = async () => {
  if (!editingTeam.value.teamName || !editingTeam.value.teamName.trim()) {
    alert('팀명을 입력해주세요.');
    return;
  }
  const idx = teams.value.findIndex(t => t.idx === editingTeam.value.idx);

  const memberIds = editingTeam.value.memberIds || [];
  const members = memberIds.map(idx => cleaningStaff.value.find(s => s.idx === idx)).filter(Boolean);
  const leader = members.find(m => m.position === '반장') || members[0];

  editingTeam.value.leaderName = leader ? leader.name : '-';

  if (idx > -1) {
    teams.value[idx] = { ...editingTeam.value };
  } else {
    teams.value.push({ ...editingTeam.value });
  }
  closeTeamModal();
};

const saveTeamMembers = async () => {
  const { idx, teamName, memberIds, leaderId } = editingTeam.value;

  if (!teamName || !teamName.trim()) {
    window.customAlert('팀명을 입력해주세요.', 'error');
    return;
  }

  // 1. 백엔드로 보낼 팀원 배열 (수동 지정된 leaderId 기준으로 leaderFl 부여)
  const membersPayload = (memberIds || []).map(mIdx => {
    return {
      mIdx: mIdx,
      leaderFl: (leaderId === mIdx) ? 'Y' : 'N'
    };
  });

  // (안전장치) 팀원이 있는데 리더가 없으면 첫 번째 인원 리더 지정
  if (membersPayload.length > 0 && !membersPayload.some(m => m.leaderFl === 'Y')) {
    membersPayload[0].leaderFl = 'Y';
    editingTeam.value.leaderId = membersPayload[0].mIdx;
  }

  try {
    const payload = { name: teamName, members: membersPayload };
    const isExisting = idx && String(idx).length < 13;
    const url = `/api/v1/member/cleaning/team${isExisting ? `/${idx}` : ''}`;
    const method = isExisting ? 'put' : 'post';

    const { data } = await axios[method](url, payload);

    if (data.result) {
      window.alert('팀 편성이 성공적으로 저장되었습니다.');
      closeTeamModal();
      await fetchCleaningTeam()
    } else {
      window.customAlert(`저장 실패: ${data.message}`, 'error');
    }
  } catch (error) {
    console.error('팀 저장 에러:', error);
    window.customAlert('서버 통신 중 오류가 발생했습니다.', 'error');
  }
};

const createNewTeam = () => {
  editingTeam.value = {
    idx: Date.now(),
    teamName: `${teams.value.length + 1}팀`,
    leaderId: null, // 신규 추가
    leaderName: '-',
    memberIds: []
  };
  showTeamModal.value = true;
};

const setLeader = (mIdx) => {
  editingTeam.value.leaderId = mIdx;
};

const deleteTeam = (teamIdx) => {
  const tasks = getTasksForTeam(teamIdx);
  if (tasks.length > 0) {
    alert('배정된 일정이 있어 삭제할 수 없습니다. 먼저 일정을 다른 팀이나 미배정으로 옮겨주세요.');
    return;
  }
  if (confirm('이 팀을 정말로 삭제하시겠습니까?')) {
    teams.value = teams.value.filter(t => t.idx !== teamIdx);
    closeTeamModal();
  }
};

const managers = ref([
  { idx: 31, name: '조용우' },
  { idx: 32, name: '허주범' },
  { idx: 30, name: '유재준' },
  { idx: 28, name: '강태웅' },
  { idx: 29, name: '박승문' },
  { idx: 33, name: '황재춘' },
]);

const getTeamName = (teamIdx) => teams.value.find(t => t.idx === teamIdx)?.teamName || '-';
const getManagerName = (mIdx) => managers.value.find(m => m.idx === mIdx)?.name || '-';

// ========================================================
// 3. 대청소 일정 임시 데이터
//    (현장 계약의 cleaningConfig 기반으로 생성된 일정 + 신규 필드)
// ========================================================
const cleaningSchedules = ref([
    /*
  {
    idx: 1, sIdx: 106, siteName: "옥정8(율정)단지", itemCd: "04003001003", itemName: "주차장대청소",
    startDt: "2026-08-16", durationDays: 1, endDt: "2026-08-16", status: "0",
    teamIdx: 1, mnIdx: 1, address: "서울시 서초구 반포대로 000",
    equipment: "고압세척기, 사다리차", memo: "지하주차장 우선 진행 요청",
    docSent: true, docConfirmYn: true
  },
  {
    idx: 99, sIdx: 150, siteName: "신규 배정대기 아파트", itemCd: "04003001003", itemName: "주차장대청소",
    startDt: "2026-08-25", durationDays: 1, endDt: "2026-08-25", status: "0",
    teamIdx: null, mnIdx: null, address: "서울시 종로구",
    equipment: "고압세척기", memo: "배정 대기중",
    docSent: false, docConfirmYn: false
  },
  {
    idx: 2, sIdx: 141, siteName: "북한산힐스테이트7차", itemCd: "04003001005", itemName: "렉산대청소",
    startDt: "2026-08-18", durationDays: 1, endDt: "2026-08-18", status: "0",
    teamIdx: 1, mnIdx: 1, address: "서울시 서초구 반포대로 000",
    equipment: "고소작업대", memo: "",
    docSent: true, docConfirmYn: true
  },
  {
    idx: 3, sIdx: 102, siteName: "반포 래미안", itemCd: "04003001003", itemName: "주차장대청소",
    startDt: "2026-06-25", durationDays: 2, endDt: "2026-06-26", status: "0",
    teamIdx: 2, mnIdx: 2, address: "서울시 서초구 신반포로 000",
    equipment: "고압세척기", memo: "야간 진행 불가, 주간만 가능",
    docSent: true, docConfirmYn: false
  },
  {
    idx: 4, sIdx: 107, siteName: "묵동금호어울림아파트", itemCd: "04003001003", itemName: "주차장대청소",
    startDt: "2026-08-16", durationDays: 3, endDt: "2026-08-18", status: "2",
    teamIdx: 3, mnIdx: 3, address: "서울시 송파구 올림픽로 000",
    equipment: "고압세척기, 진공흡입차", memo: "지상+지하 전체",
    docSent: true, docConfirmYn: true
  },
  {
    idx: 5, sIdx: 114, siteName: "한숲대림아파트", itemCd: "04003001007", itemName: "현관대청소",
    startDt: "2026-08-20", durationDays: 2, endDt: "2026-08-21", status: "0",
    teamIdx: 2, mnIdx: 1, address: "서울시 강남구 개포로 000",
    equipment: "곤도라, 로프", memo: "고층부 안전점검 선행",
    docSent: false, docConfirmYn: false
  },
  {
    idx: 6, sIdx: 128, siteName: "백송마을상동자이", itemCd: "04003001003", itemName: "주차장대청소",
    startDt: "2026-09-02", durationDays: 1, endDt: "2026-09-02", status: "0",
    teamIdx: 1, mnIdx: 2, address: "서울시 강남구 도곡로 000",
    equipment: "고압세척기", memo: "",
    docSent: true, docConfirmYn: true
  }

     */
]);

// 캘린더 필터 (팀별 / 담당자별 / 전체) - 요구사항 3,4
const filterMode = ref('all'); // all | team | manager
const filterTeamIdx = ref('');
const filterManagerIdx = ref('');

// 캘린더에는 공문 발송 후 전원 수신확인 완료된 건만 정상 노출,
// 미확인 건은 "확인대기" 배지로 흐리게 표시 - 요구사항 6
const calendarFilteredSchedules = computed(() => {
  return cleaningSchedules.value.filter(s => {
    if (filterMode.value === 'team' && filterTeamIdx.value && s.teamIdx !== filterTeamIdx.value) return false;
    if (filterMode.value === 'manager' && filterManagerIdx.value && s.mnIdx !== filterManagerIdx.value) return false;
    return true;
  }).sort((a, b) => new Date(a.startDt) - new Date(b.startDt));
});

const scheduleLaneMap = computed(() => {
  const sorted = [...calendarFilteredSchedules.value].sort(
      (a, b) => new Date(a.startDt) - new Date(b.startDt) || a.idx - b.idx  // 동점이면 idx로 고정
  );
  const laneEndDates = [];
  const map = {};

  sorted.forEach(s => {
    let lane = laneEndDates.findIndex(endDt => endDt < s.startDt);
    if (lane === -1) {
      lane = laneEndDates.length;
    }
    laneEndDates[lane] = s.endDt;
    map[s.idx] = lane;
  });

  return map;
});

const maxLaneCount = computed(() => {
  const lanes = Object.values(scheduleLaneMap.value);
  return lanes.length ? Math.max(...lanes) + 1 : 0;
});

const getSchedulesForDate = (dateStr) => {
  // 레인 번호 순서로 고정된 슬롯 배열을 만들어, 같은 일정은 항상 같은 줄에 그려지도록 함
  const slots = new Array(maxLaneCount.value).fill(null);

  calendarFilteredSchedules.value
      .filter(s => dateStr >= s.startDt && dateStr <= s.endDt)
      .forEach(s => {
        const start = new Date(s.startDt);
        const curr = new Date(dateStr);
        const dayIndex = Math.floor((curr - start) / (1000 * 60 * 60 * 24)) + 1;
        const lane = scheduleLaneMap.value[s.idx] ?? 0;
        slots[lane] = { ...s, dayIndex, isStartDay: dayIndex === 1 };
      });

  return slots; // null인 자리는 빈 칸(스페이서)으로 렌더링
};

// 해당 날짜에 표시할 일정이 하나라도 있는지 여부 (빈 날짜에 "일정 추가" 힌트를 보여주기 위함)
const cellHasSchedules = (dateStr) => getSchedulesForDate(dateStr).some(Boolean);

const isPendingConfirm = (schedule) => schedule.docSent && !schedule.docConfirmYn;

const getStatusColor = (status) => {
  if (status == '3') return 'var(--success)';
  if (status == '2') return 'var(--warning)';
  return 'var(--primary)';
};

// ========================================================
// 4. 달력 셀 계산 (6주 그리드)
// ========================================================
const calendarDays = computed(() => {
  const year = currentDate.value.getFullYear();
  const month = currentDate.value.getMonth();

  const firstDay = new Date(year, month, 1).getDay(); // 0(일) ~ 6(토)
  const lastDate = new Date(year, month + 1, 0).getDate();
  const prevLastDate = new Date(year, month, 0).getDate();

  const days = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const dd = prevLastDate - i;
    const mm = month === 0 ? 12 : month;
    const yy = month === 0 ? year - 1 : year;
    days.push({ date: dd, isCurrentMonth: false, dateStr: `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` });
  }

  for (let i = 1; i <= lastDate; i++) {
    days.push({
      date: i,
      isCurrentMonth: true,
      isToday: new Date().toDateString() === new Date(year, month, i).toDateString(),
      dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`
    });
  }

  const remaining = 42 - days.length;
  for (let i = 1; i <= remaining; i++) {
    const mm = month === 11 ? 1 : month + 2;
    const yy = month === 11 ? year + 1 : year;
    days.push({ date: i, isCurrentMonth: false, dateStr: `${yy}-${String(mm).padStart(2, '0')}-${String(i).padStart(2, '0')}` });
  }

  return days;
});

const openDetail = (schedule) => {
  isEditMode.value = true;
  editingIdx.value = schedule.idx;
  addForm.value = {
    sIdx: schedule.sIdx,
    itemCd: schedule.itemCd,
    startDt: schedule.startDt,
    endDt: schedule.endDt,
    status: schedule.status,
    teamIdx: schedule.teamIdx,
    mnIdx: schedule.mnIdx,
    equipment: schedule.equipment,
    memo: schedule.memo,
    sendDoc: schedule.docSent
  };
  showAddModal.value = true;
};

// ========================================================
// 5. 현장 계약의 대청소 설정 (cleaningConfig) - 신규 필드 반영
//    itemCd/itemName/count 외에 cyclePerYear, cycleStartDt,
//    durationDays, isService를 백엔드가 내려준다고 가정 (기본값 fallback)
// ========================================================
const siteContracts = computed(() => {
  if (!siteOptions.value) return [];

  const result = [];
  siteOptions.value.forEach(site => {
    const configs = [];
    if (site.contracts && Array.isArray(site.contracts)) {
      site.contracts.forEach(contract => {
        let cleaningData = contract.cleaningConfig;
        if (typeof cleaningData === 'string' && cleaningData.trim()) {
          try { cleaningData = JSON.parse(cleaningData); } catch (e) { cleaningData = []; }
        }
        if (cleaningData && Array.isArray(cleaningData)) {
          cleaningData.forEach(c => configs.push({
            ...c,
            cyclePerYear: c.cyclePerYear ?? 1,
            cycleMonths: c.cycleMonths ?? 12,
            cycleStartDt: c.cycleStartDt ?? contract.startDt ?? null,
            durationDays: c.durationDays ?? 1,
            isService: c.isService ?? 0
          }));
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
          mergedConfigs.push({
            code: conf.code,
            name: conf.name,
            count: Number(conf.count),
            cyclePerYear: conf.cyclePerYear,
            cycleMonths: conf.cycleMonths,
            cycleStartDt: conf.cycleStartDt,
            durationDays: Number(conf.durationDays),
            isService: !!conf.isService
          });
        }
      });

      result.push({
        sIdx: site.idx || site.sIdx,
        siteName: site.name,
        cleaningConfig: mergedConfigs
      });
    }
  });
  return result;
});

// 사이클 만료일 계산 (실시일 + cycleMonths) - 요구사항 2
const getCycleRange = (cycleStartDt, cycleMonths) => {
  if (!cycleStartDt) return null;
  const start = new Date(cycleStartDt);
  const end = new Date(start);
  end.setMonth(end.getMonth() + cycleMonths);
  end.setDate(end.getDate() - 1);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { start: fmt(start), end: fmt(end), label: `${cycleMonths}개월` };
};

const isDelayedWarning = (sIdx, itemCd, cyclePerYear = 1) => {
  const now = new Date();
  const year = now.getFullYear();

  const doneInRange = (fromStr, toStr) => cleaningSchedules.value.some(s =>
      s.sIdx === sIdx && s.itemCd === itemCd && s.status == '3' &&
      s.startDt >= fromStr && s.startDt <= toStr
  );

  if (cyclePerYear >= 2) {
    // 상반기(1~6월): 5/1부터 4개월 경과 판단 / 하반기(7~12월): 11/1부터
    const h1WarnFrom = new Date(year, 4, 1);
    const h2WarnFrom = new Date(year, 10, 1);
    const h1Done = doneInRange(`${year}-01-01`, `${year}-06-30`);
    const h2Done = doneInRange(`${year}-07-01`, `${year}-12-31`);
    if (now >= h1WarnFrom && !h1Done) return '상반기';
    if (now >= h2WarnFrom && !h2Done) return '하반기';
    return null;
  }

  // 연 1회: 1/1 기준 4개월 경과(5/1)부터 판단
  const warnFrom = new Date(year, 4, 1);
  if (now < warnFrom) return null;
  return doneInRange(`${year}-01-01`, `${year}-12-31`) ? null : '올해';
};

// 진행된 일정 횟수 계산 및 잔여 항목 추출 (소요일 합계 포함) - 요구사항 1,8
const cleaningStatusBySite = computed(() => {
  return siteContracts.value.map(site => {
    const siteSchedules = cleaningSchedules.value.filter(s => s.sIdx === site.sIdx);

    const tasks = site.cleaningConfig.map(config => {
      const scheduled = siteSchedules.filter(s => s.itemCd === config.code);
      const scheduledCount = scheduled.length;
      const totalDurationDays = config.durationDays * config.count;
      const usedDurationDays = scheduled.reduce((sum, s) => sum + (s.durationDays || 0), 0);

      return {
        code: config.code,
        name: config.name,
        total: config.count,
        used: scheduledCount,
        remain: config.count - scheduledCount,
        durationDays: config.durationDays,
        totalDurationDays,
        usedDurationDays,
        isService: config.isService,
        cyclePerYear: config.cyclePerYear,
        cycleRange: getCycleRange(config.cycleStartDt, config.cycleMonths),
        warningPeriod: isDelayedWarning(site.sIdx, config.code, config.cyclePerYear),
        warning: !!isDelayedWarning(site.sIdx, config.code, config.cyclePerYear)
      };
    });

    const isAllCompleted = tasks.length > 0 && tasks.every(t => t.remain <= 0);
    const remainCount = tasks.filter(t => t.remain > 0).length;
    const warningCount = tasks.filter(t => t.warning).length;

    return { sIdx: site.sIdx, siteName: site.siteName, tasks, isAllCompleted, remainCount, warningCount };
  });
});

// ------ 현장별 실시현황 탭: 카드가 많을 때 정리용 검색/펼치기 상태 ------
const statusSearch = ref('');
const statusOnlyRemaining = ref(false);
const expandedSiteIdx = ref(new Set());

const toggleSiteExpand = (sIdx) => {
  const next = new Set(expandedSiteIdx.value);
  if (next.has(sIdx)) next.delete(sIdx); else next.add(sIdx);
  expandedSiteIdx.value = next;
};
const isSiteExpanded = (sIdx) => expandedSiteIdx.value.has(sIdx);

const expandAllSites = () => {
  expandedSiteIdx.value = new Set(filteredStatusSites.value.map(s => s.sIdx));
};
const collapseAllSites = () => {
  expandedSiteIdx.value = new Set();
};

// 검색어(현장명/항목명) + "미완료만 보기" 필터 적용
const filteredStatusSites = computed(() => {
  const keyword = statusSearch.value.trim().toLowerCase();
  return cleaningStatusBySite.value
      .filter(site => {
        if (!keyword) return true;
        if (site.siteName.toLowerCase().includes(keyword)) return true;
        return site.tasks.some(t => t.name.toLowerCase().includes(keyword));
      })
      .filter(site => !statusOnlyRemaining.value || site.remainCount > 0);
});

// 팀별 월별 소요일 합계 매트릭스 - 요구사항 8
const teamWorkload = computed(() => {
  const months = [];
  const base = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth() - 2, 1);
  for (let i = 0; i < 5; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const rows = teams.value.map(team => {
    const cells = months.map(ym => {
      const sum = cleaningSchedules.value
          .filter(s => s.teamIdx === team.idx && s.startDt.startsWith(ym))
          .reduce((acc, s) => acc + (s.durationDays || 0), 0);
      return sum;
    });
    return { teamIdx: team.idx, teamName: team.teamName, cells };
  });

  return { months, rows };
});

const getCleaningStaff = () => {
  axios.get(`/api/v1/member/cleaning`).then((res) => {
    console.log(res.data.data);
    cleaningStaff.value = res.data.data;
  })
}

const fetchCleaningTeam = async function () {
  try {
    const { data } = await axios.get('/api/v1/site/cleaning/team');

    if (data.result) {
      // 서버에서 온 데이터(data.data)를 프론트엔드 UI 구조에 맞게 변환
      teams.value = data.data.map(t => {
        // leaderName을 구하기 위해 cleaningStaff에서 leaderId로 사람을 찾음
        const leader = cleaningStaff.value.find(s => s.idx === t.leaderId);

        return {
          idx: t.idx,
          teamName: t.teamName,
          leaderId: t.leaderId,
          leaderName: leader ? leader.name : '-',
          // memberIds 문자열("1,4,5")을 배열([1, 4, 5])로 변환 (팀원이 없을 경우 빈 배열)
          memberIds: t.memberIds ? t.memberIds.split(',').map(Number) : []
        };
      });
    } else {
      console.error('팀 목록 로드 실패:', data.data);
    }
  } catch (error) {
    console.error('팀 목록 통신 에러:', error);
  }
}

const fetchSchedules = async () => {
  axios.get(`/api/v1/site/cleaning/schedule`).then((res) => {
    console.log(res.data.data)
    cleaningSchedules.value = res.data.data;
  })
}

onMounted(async () => {
  fetchSiteOptions();
  await getCleaningStaff();
  fetchSchedules();
  fetchCleaningTeam();
});

// ========================================================
// 6. 모달 및 폼 상태
// ========================================================
const showAddModal = ref(false);
const isEditMode = ref(false);
const editingIdx = ref(null);

const addForm = ref({
  sIdx: '',
  itemCd: '',
  startDt: '',
  endDt: '',
  status: '0',
  teamIdx: '',
  mnIdx: '',
  equipment: '',
  memo: '',
  sendDoc: true
});

const availableTasks = computed(() => {
  if (!addForm.value.sIdx) return [];
  const site = siteContracts.value.find(s => s.sIdx === addForm.value.sIdx);
  return site ? site.cleaningConfig : [];
});

const selectedTaskDuration = computed(() => {
  const task = availableTasks.value.find(t => t.code === addForm.value.itemCd);
  return task ? task.durationDays : 1;
});

const onSiteChange = () => {
  addForm.value.itemCd = '';
};

const openAddModalWithDate = (dateStr) => {
  isEditMode.value = false;
  editingIdx.value = null;
  addForm.value = {
    sIdx: '',
    itemCd: '',
    startDt: dateStr,
    endDt: dateStr,
    status: '0',
    teamIdx: '',
    mnIdx: '',
    equipment: '',
    memo: '',
    sendDoc: true
  };
  showAddModal.value = true;
};

const openAddModal = () => {
  isEditMode.value = false;
  editingIdx.value = null;
  addForm.value = {
    sIdx: '',
    itemCd: '',
    startDt: '',
    endDt: '',
    status: '0',
    teamIdx: '',
    mnIdx: '',
    equipment: '',
    memo: '',
    sendDoc: true
  };
  showAddModal.value = true;
};

const closeAddModal = () => {
  showAddModal.value = false;
};

// 공문 + 수신확인 레코드 발급 (현장/담당자/대청소팀장 3자 확인 필요) - 요구사항 5,6
const documents = ref([]);
let docSeq = 1;

const issueDocument = (schedule) => {
  const teamName = getTeamName(schedule.teamIdx);
  documents.value.push({
    idx: docSeq++,
    scheduleIdx: schedule.idx,
    siteName: schedule.siteName,
    itemName: schedule.itemName,
    docType: '공문',
    sentAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
    receipts: [
      { type: '현장', name: schedule.siteName, confirmedYn: false, confirmedAt: null },
      { type: '담당자', name: getManagerName(schedule.mnIdx), confirmedYn: false, confirmedAt: null },
      { type: '대청소팀장', name: teamName, confirmedYn: false, confirmedAt: null }
    ]
  });
};

const saveAddModalTmp = () => {
  if (!addForm.value.sIdx || !addForm.value.itemCd || !addForm.value.startDt || !addForm.value.endDt) {
    window.customAlert("필수 입력 값을 입력해주세요.", 'error');
    return;
  }
  if (addForm.value.endDt < addForm.value.startDt) {
    window.customAlert("종료일은 시작일보다 앞설 수 없습니다.", 'error');
    return;
  }

  const site = siteContracts.value.find(s => s.sIdx === addForm.value.sIdx);
  const task = site.cleaningConfig.find(t => t.code === addForm.value.itemCd);

  const startDt = addForm.value.startDt;
  const endDt = addForm.value.endDt;
  const durationDays = Math.floor((new Date(endDt) - new Date(startDt)) / (1000 * 60 * 60 * 24)) + 1;

  const payload = {
    sIdx: site.sIdx,
    siteName: site.siteName,
    itemCd: task.code,
    itemName: task.name,
    startDt: startDt,
    durationDays,
    endDt,
    status: addForm.value.status,
    teamIdx: addForm.value.teamIdx,
    mnIdx: addForm.value.mnIdx,
    equipment: addForm.value.equipment,
    memo: addForm.value.memo,
    docSent: addForm.value.sendDoc,
    docConfirmYn: false
  };

  let savedSchedule;
  if (isEditMode.value) {
    const idx = cleaningSchedules.value.findIndex(s => s.idx === editingIdx.value);
    if (idx !== -1) {
      cleaningSchedules.value[idx] = { ...cleaningSchedules.value[idx], ...payload };
      savedSchedule = cleaningSchedules.value[idx];
    }
  } else {
    savedSchedule = { idx: Date.now(), ...payload };
    cleaningSchedules.value.push(savedSchedule);
  }

  if (addForm.value.sendDoc && savedSchedule) {
    issueDocument(savedSchedule);
  }

  closeAddModal();
};

const saveAddModal = async () => {
  if (!addForm.value.sIdx || !addForm.value.itemCd || !addForm.value.startDt || !addForm.value.endDt) {
    window.customAlert("필수 입력 값을 입력해주세요.", 'error');
    return;
  }
  if (addForm.value.endDt < addForm.value.startDt) {
    window.customAlert("종료일은 시작일보다 앞설 수 없습니다.", 'error');
    return;
  }

  const site = siteContracts.value.find(s => s.sIdx === addForm.value.sIdx);
  const task = site.cleaningConfig.find(t => t.code === addForm.value.itemCd);

  const startDt = addForm.value.startDt;
  const endDt = addForm.value.endDt;

  // 날짜 계산
  const durationDays = Math.floor((new Date(endDt) - new Date(startDt)) / 86400000) + 1;

  // 백엔드로 보낼 Payload 객체
  // (빈 값이나 선택하지 않은 팀/관리자는 null로 처리하여 DB에 NULL 값으로 들어가게 합니다)
  const payload = {
    cIdx: useAuthStore().user?.cIdx, // 또는 백엔드에서 session으로 알아서 처리한다면 생략 가능
    sIdx: site.sIdx,
    siteName: site.siteName,
    itemCd: task.code,
    itemName: task.name,
    startDt: startDt,
    durationDays: durationDays,
    endDt: endDt,
    status: addForm.value.status,
    teamIdx: addForm.value.teamIdx || null,
    mnIdx: addForm.value.mnIdx || null,
    equipment: addForm.value.equipment || null,
    memo: addForm.value.memo || null,
    docSent: 'N' // 최초 등록 시 기본값 N 세팅
  };

  try {
    // 신규 등록(POST)인지, 기존 수정(PUT)인지 판별
    const url = `/api/v1/site/cleaning/schedule${isEditMode.value ? `/${editingIdx.value}` : ''}`;
    const method = isEditMode.value ? 'put' : 'post';

    // API 통신
    const { data } = await axios[method](url, payload);

    if (data.result) {
      window.alert(isEditMode.value ? '일정이 성공적으로 수정되었습니다.' : '일정이 성공적으로 등록되었습니다.');

      // TODO: 데이터 목록 새로고침 API 호출 (예: getCleaningSchedules())
      await fetchSchedules();

      closeAddModal();
    } else {
      window.customAlert(`저장 실패: ${data.message || '알 수 없는 오류'}`, 'error');
    }
  } catch (error) {
    console.error('일정 저장 에러:', error);
    window.customAlert('서버 통신 중 에러가 발생했습니다.', 'error');
  }
};

const deleteSchedule = () => {
  if (confirm("일정을 삭제하시겠습니까?")) {
    cleaningSchedules.value = cleaningSchedules.value.filter(s => s.idx !== editingIdx.value);
    closeAddModal();
  }
};

// 수신확인 처리 - 3자 모두 확인되면 스케줄 docConfirmYn = true (캘린더 정상 노출) - 요구사항 6
const toggleReceiptConfirm = (doc, receipt) => {
  receipt.confirmedYn = !receipt.confirmedYn;
  receipt.confirmedAt = receipt.confirmedYn ? new Date().toISOString().slice(0, 16).replace('T', ' ') : null;

  const allConfirmed = doc.receipts.every(r => r.confirmedYn);
  const schedule = cleaningSchedules.value.find(s => s.idx === doc.scheduleIdx);
  if (schedule) schedule.docConfirmYn = allConfirmed;
};

// ========================================================
// 7. 완료 점검표 (서명 / 만족도 / 익일 지시사항) - 요구사항 9
// ========================================================
const checklists = ref([]);
const showChecklistModal = ref(false);
const checklistForm = ref({ scheduleIdx: null, siteManagerSign: '', rating: 5, issues: '', nextDayInstruction: '' });

const completedSchedules = computed(() => cleaningSchedules.value.filter(s => s.status == '3'));

const hasChecklist = (scheduleIdx) => checklists.value.some(c => c.scheduleIdx === scheduleIdx);

const openChecklistModal = (schedule) => {
  checklistForm.value = { scheduleIdx: schedule.idx, siteManagerSign: '', rating: 5, issues: '', nextDayInstruction: '' };
  showChecklistModal.value = true;
};

const saveChecklist = () => {
  if (!checklistForm.value.siteManagerSign) {
    window.customAlert("소장/책임자 확인 서명을 입력해주세요.", 'error');
    return;
  }
  checklists.value.push({
    idx: Date.now(),
    ...checklistForm.value,
    completedAt: new Date().toISOString().slice(0, 16).replace('T', ' ')
  });
  showChecklistModal.value = false;
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

    <!-- 탭 네비게이션 -->
    <div class="tab-nav">
      <button :class="['tab-item', { active: activeTab === 'calendar' }]" @click="activeTab = 'calendar'">
        <i class="mdi mdi-calendar-month"></i> 일정 캘린더
      </button>
      <!--button :class="['tab-item', { active: activeTab === 'status' }]" @click="activeTab = 'status'">
        <i class="mdi mdi-clipboard-text-outline"></i> 현장별 실시현황
      </button-->
      <button :class="['tab-item', { active: activeTab === 'workload' }]" @click="activeTab = 'workload'">
        <i class="mdi mdi-account-group-outline"></i> 팀별 소요일 현황
      </button>
      <button :class="['tab-item', { active: activeTab === 'assign' }]" @click="activeTab = 'assign'">
        <i class="mdi mdi-account-switch"></i> 팀 배정
      </button>
      <!--button :class="['tab-item', { active: activeTab === 'documents' }]" @click="activeTab = 'documents'">
        <i class="mdi mdi-file-document-outline"></i> 공문/점검표함
      </button-->
    </div>
    <p class="tab-desc">
      <i class="mdi mdi-arrow-right-thin"></i> {{ tabDescriptions[activeTab] }}
    </p>

    <!-- ============ 탭1: 일정 캘린더 ============ -->
    <div v-if="activeTab === 'calendar'" class="content-body" style="display: grid; grid-template-columns: 3fr 1fr; gap: 20px;">
      <div class="calendar-card">
        <div class="filter-bar">
          <select v-model="filterMode" class="form-control filter-select">
            <option value="all">전체</option>
            <option value="team">팀별</option>
            <option value="manager">관리자별</option>
          </select>
          <select v-if="filterMode === 'team'" v-model="filterTeamIdx" class="form-control filter-select">
            <option value="">팀 선택</option>
            <option v-for="t in teams" :key="t.idx" :value="t.idx">{{ t.teamName }} ({{ t.leaderName }})</option>
          </select>
          <select v-if="filterMode === 'manager'" v-model="filterManagerIdx" class="form-control filter-select">
            <option value="">담당자 선택</option>
            <option v-for="m in managers" :key="m.idx" :value="m.idx">{{ m.name }}</option>
          </select>
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
                @click="openAddModalWithDate(day.dateStr)"
                style="cursor: pointer;"
            >
              <div class="cell-date">{{ day.date }}</div>
              <div class="cell-schedules">
                <template v-for="(schedule, lane) in getSchedulesForDate(day.dateStr)" :key="lane">
                  <div
                      v-if="schedule"
                      :class="[
                        'schedule-bar',
                        { 'is-pending': isPendingConfirm(schedule) },
                        { 'is-start': schedule.isStartDay },
                        { 'is-end': schedule.dayIndex === schedule.durationDays },
                        { 'is-middle': !schedule.isStartDay && schedule.dayIndex < schedule.durationDays }
                      ]"
                      @click.stop="openDetail(schedule)"
                      :style="{ backgroundColor: getStatusColor(schedule.status) }"
                      :title="`${schedule.siteName} · ${schedule.itemName} (${getTeamName(schedule.teamIdx)})`"
                  >
                    <div class="bar-content" :style="{ opacity: schedule.isStartDay ? 1 : 0 }">
                      <span class="bar-title">{{ schedule.siteName }} · {{ schedule.itemName }}</span>
                      <span v-if="isPendingConfirm(schedule)" class="bar-badge">대기</span>
                    </div>
                  </div>
                  <div v-else class="schedule-bar-empty"></div>
                </template>
                <div
                    v-if="day.isCurrentMonth && !cellHasSchedules(day.dateStr)"
                    class="cell-add-hint"
                >
                  <i class="mdi mdi-plus"></i> 일정 추가
                </div>
              </div>

            </div>
          </div>

        </div>

        <div class="calendar-legend">
          <span class="legend-item"><i class="legend-dot" style="background: var(--primary);"></i> 예정</span>
          <span class="legend-item"><i class="legend-dot" style="background: var(--warning);"></i> 진행중</span>
          <span class="legend-item"><i class="legend-dot" style="background: var(--success);"></i> 완료</span>
          <span class="legend-item"><i class="legend-dot legend-dot-pending"></i> 수신확인 대기</span>
        </div>
      </div>

      <!-- 현장별 대청소 잔여 횟수 미니 카드 -->
      <div class="status-card">
        <!-- 사이드 패널용 헤더 & 검색 컨트롤 -->
        <div class="status-header" style="flex-direction: column; align-items: stretch; gap: 12px; border-bottom: none; padding-bottom: 0;">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <i class="mdi mdi-clipboard-text-outline"></i>
              <h3>현장별 과업 잔여 현황</h3>
            </div>
            <span class="site-count-badge">{{ filteredStatusSites.length }}개</span>
          </div>

          <div class="status-controls" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
            <div class="search-box" style="width: 100%;">
              <i class="mdi mdi-magnify"></i>
              <input type="text" v-model="statusSearch" placeholder="현장명/항목명 검색" class="search-input" style="width: 100%;" />
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center; gap:8px;">
              <label class="form-check-inline">
                <input type="checkbox" v-model="statusOnlyRemaining" /> 미완료만 보기
              </label>
              <div style="display: flex; gap: 4px;">
                <button class="btn-mini" @click="collapseAllSites">전체 접기</button>
                <button class="btn-mini" @click="expandAllSites">펼치기</button>
              </div>
            </div>
          </div>
        </div>

        <!-- 통합된 리스트 영역 -->
        <div class="status-list" style="border-top: 1px solid var(--border-color, #e5e7eb); padding-top: 12px;">
          <div v-if="filteredStatusSites.length === 0" class="empty-state" style="padding: 12px;">검색 결과가 없습니다.</div>

          <div
              :class="['status-item', { 'status-completed': site.isAllCompleted, 'status-expanded': isSiteExpanded(site.sIdx) }]"
              v-for="site in filteredStatusSites" :key="site.sIdx"
          >
            <div class="status-item-header" @click="toggleSiteExpand(site.sIdx)">
              <h4>{{ site.siteName }}</h4>
              <div class="status-summary">
                <span class="summary-chip summary-remain" v-if="site.remainCount > 0">잔여 {{ site.remainCount }}</span>
                <span class="summary-chip summary-done" v-else>전체완료</span>
                <span class="summary-chip summary-warning" v-if="site.warningCount > 0">
                  <i class="mdi mdi-alert-circle"></i> {{ site.warningCount }}
                </span>
                <i :class="['mdi', isSiteExpanded(site.sIdx) ? 'mdi-chevron-up' : 'mdi-chevron-down', 'expand-icon']"></i>
              </div>
            </div>

            <div v-show="isSiteExpanded(site.sIdx)" class="status-item-body">
              <div :class="['task-info', { 'task-completed': task.remain <= 0 }]" v-for="task in site.tasks" :key="task.code">
                <div class="task-name">
                  • {{ task.name }}
                  <span v-if="task.isService" class="badge-service">서비스</span>
                  <span v-if="task.remain <= 0" class="badge-done">완료</span>
                  <span v-else-if="task.warning" class="badge-notdone-warning">
                    <i class="mdi mdi-alert-circle"></i> {{ task.warningPeriod }} 미실시
                  </span>
                  <span v-else class="badge-notdone">미실시</span>
                </div>
                <div class="task-counts" style="flex-wrap: wrap;">
                  <span class="count-total">총 {{ task.total }}회</span>
                  <span class="count-used">진행 {{ task.used }}회</span>
                  <span class="count-remain" v-if="task.remain > 0">잔여 {{ task.remain }}회</span>
                  <span class="count-remain" v-else>완료</span>
                </div>
                <div class="task-counts" style="margin-top: 2px;">
                  <span class="count-used">소요일 {{ task.usedDurationDays }}/{{ task.totalDurationDays }}일</span>
                </div>
                <div v-if="task.cycleRange" class="cycle-badge">
                  주기 {{ task.cycleRange.start }} ~ {{ task.cycleRange.end }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 탭2: 현장별 실시현황 (전체화면) ============ -->
    <div v-if="activeTab === 'status'" class="status-card status-card-full">
      <div class="status-header status-header-with-controls">
        <div style="display:flex; align-items:center; gap:8px;">
          <i class="mdi mdi-clipboard-text-outline"></i>
          <h3>현장별 대청소 실시현황</h3>
          <span class="site-count-badge">{{ filteredStatusSites.length }}개 현장</span>
        </div>
        <div class="status-controls">
          <div class="search-box">
            <i class="mdi mdi-magnify"></i>
            <input type="text" v-model="statusSearch" placeholder="현장명 또는 항목명 검색" class="search-input" />
          </div>
          <label class="form-check-inline">
            <input type="checkbox" v-model="statusOnlyRemaining" /> 미완료만
          </label>
          <button class="btn-mini" @click="collapseAllSites">전체 접기</button>
          <button class="btn-mini" @click="expandAllSites">전체 펼치기</button>
        </div>
      </div>

      <div v-if="filteredStatusSites.length === 0" class="empty-state">검색 결과가 없습니다.</div>

      <div class="status-masonry">
        <div
            :class="['status-item', { 'status-completed': site.isAllCompleted, 'status-expanded': isSiteExpanded(site.sIdx) }]"
            v-for="site in filteredStatusSites" :key="site.sIdx"
        >
          <div class="status-item-header" @click="toggleSiteExpand(site.sIdx)">
            <h4>{{ site.siteName }}</h4>
            <div class="status-summary">
              <span class="summary-chip">항목 {{ site.tasks.length }}</span>
              <span class="summary-chip summary-remain" v-if="site.remainCount > 0">잔여 {{ site.remainCount }}</span>
              <span class="summary-chip summary-done" v-else>전체완료</span>
              <span class="summary-chip summary-warning" v-if="site.warningCount > 0">
                <i class="mdi mdi-alert-circle"></i> {{ site.warningCount }}
              </span>
              <i :class="['mdi', isSiteExpanded(site.sIdx) ? 'mdi-chevron-up' : 'mdi-chevron-down', 'expand-icon']"></i>
            </div>
          </div>

          <div v-show="isSiteExpanded(site.sIdx)" class="status-item-body">
            <div :class="['task-info', { 'task-completed': task.remain <= 0 }]" v-for="task in site.tasks" :key="task.code">
              <div class="task-name">
                • {{ task.name }}
                <span v-if="task.isService" class="badge-service">서비스</span>
                <span v-if="task.remain <= 0" class="badge-done">실시완료</span>
                <span v-else-if="task.warning" class="badge-notdone-warning">
                  <i class="mdi mdi-alert-circle"></i> {{ task.warningPeriod }} 미실시
                </span>
                <span v-else class="badge-notdone">미실시</span>
              </div>
              <div class="task-counts">
                <span class="count-total">총 {{ task.total }}회</span>
                <span class="count-used">진행 {{ task.used }}회</span>
                <span class="count-remain" v-if="task.remain > 0">잔여 {{ task.remain }}회</span>
                <span class="count-remain" v-else>완료</span>
              </div>
              <div class="task-counts" style="margin-top: 2px;">
                <span class="count-total">회당 소요일 {{ task.durationDays }}일</span>
                <span class="count-used">누적 소요일 {{ task.usedDurationDays }}/{{ task.totalDurationDays }}일</span>
              </div>
              <div v-if="task.cycleRange" class="cycle-badge">
                계약주기 {{ task.cycleRange.start }} ~ {{ task.cycleRange.end }} ({{ task.cycleRange.label }})
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 탭3: 팀별 소요일 현황 ============ -->
    <div v-if="activeTab === 'workload'" class="status-card status-card-full">
      <div class="status-header">
        <i class="mdi mdi-account-group-outline"></i>
        <h3>팀별 월별 소요일 합계</h3>
      </div>
      <table class="workload-table">
        <thead>
        <tr>
          <th>팀</th>
          <th v-for="ym in teamWorkload.months" :key="ym">{{ ym }}</th>
        </tr>
        </thead>
        <tbody>
        <tr v-for="row in teamWorkload.rows" :key="row.teamIdx">
          <td class="team-name-cell">{{ row.teamName }}</td>
          <td v-for="(cell, i) in row.cells" :key="i" :class="{ 'cell-overload': cell >= 15 }">
            {{ cell }}일
          </td>
        </tr>
        </tbody>
      </table>
      <p class="table-hint">※ 월 15일 이상 배정된 팀은 강조 표시됩니다. 인력 추가 편성 판단 시 참고하세요.</p>
    </div>


    <!-- ============ 팀 배정 (Kanban) ============ -->
    <div v-if="activeTab === 'assign'" class="kanban-wrapper">
      <div class="status-header" style="margin-bottom: 12px;">
        <i class="mdi mdi-account-switch"></i>
        <h3>현장 대청소 팀 배정</h3>
      </div>

      <div class="kanban-intro">
        <i class="mdi mdi-information-outline"></i>
        현장 카드를 원하는 팀 칸으로 끌어다 놓으면 바로 배정돼요. 일정을 등록할 때 이미 팀을 골랐다면 처음부터 해당 팀 칸에 표시됩니다.
      </div>

      <div class="kanban-board">
        <!-- 미배정 컬럼 -->
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
                <span class="task-date">{{ task.startDt === task.endDt ? task.startDt : `${task.startDt} ~ ${task.endDt}` }}</span>
              </div>
              <div class="task-card-body">
                <p><strong>{{ task.itemName }}</strong></p>
                <p class="task-address"><i class="mdi mdi-map-marker-outline"></i> {{ task.address }}</p>
                <p v-if="task.memo" class="task-note"><i class="mdi mdi-alert-circle-outline"></i> {{ task.memo }}</p>
              </div>
              <div class="task-card-footer">
                <i class="mdi mdi-drag"></i> 끌어서 팀에 배정
              </div>
            </div>
            <div v-if="getUnassignedTasks.length === 0" class="empty-col">미배정 건이 없습니다.</div>
          </div>
        </div>

        <!-- 각 팀별 컬럼 -->
        <div
            class="kanban-col team-col"
            v-for="team in teams"
            :key="team.idx"
            @dragover.prevent
            @drop="onDrop($event, team.idx)"
        >
          <div class="col-header" style="flex-direction: column; align-items: stretch; gap: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <h4><i class="mdi mdi-account-group-outline"></i> {{ team.teamName }}</h4>
              <button class="btn-icon-small" @click="openTeamModal(team)" title="팀원 편성"><i class="mdi mdi-account-cog"></i> 인원편성</button>
            </div>
            <div class="team-info" style="justify-content: space-between; align-items: flex-start; width: 100%;">
              <div class="team-member-list">
                <span v-for="member in getTeamMembers(team.idx)" :key="member.id" class="member-chip" :class="{'is-leader': member.position === '반장'}">
                  {{ member.name }}
                </span>
                <span v-if="getTeamMembers(team.idx).length === 0" class="empty-members">편성된 인원 없음</span>
              </div>
              <span class="task-count">{{ getTasksForTeam(team.idx).length }}건</span>
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
                <span class="task-date">{{ task.startDt === task.endDt ? task.startDt : `${task.startDt} ~ ${task.endDt}` }}</span>
              </div>
              <div class="task-card-body">
                <p><strong>{{ task.itemName }}</strong></p>
                <div class="task-tags">
                  <span class="status-badge" :class="{'is-done': task.status == '3', 'is-progress': task.status == '2'}">{{ task.status }}</span>
                </div>
              </div>
            </div>
            <div v-if="getTasksForTeam(team.idx).length === 0" class="empty-col">배정된 일정이 없습니다.<br>왼쪽에서 카드를 끌어다 놓으세요.</div>
          </div>
        </div>

        <!-- 팀 추가 버튼 컬럼 -->
        <div class="kanban-col add-team-col" @click="createNewTeam">
          <i class="mdi mdi-plus-circle-outline"></i>
          <span>새 청소팀 추가</span>
        </div>
      </div>
    </div>

    <!-- ============ 탭4: 공문/수신확인 + 완료 점검표 ============ -->
    <div v-if="activeTab === 'documents'" style="display: flex; flex-direction: column; gap: 20px;">
      <div class="status-card status-card-full">
        <div class="status-header">
          <i class="mdi mdi-file-document-outline"></i>
          <h3>발송 공문 / 수신확인 현황</h3>
        </div>
        <div v-if="documents.length === 0" class="empty-state">발송된 공문이 없습니다. 일정 등록 시 "공문 발송"을 체크하면 여기에 표시됩니다.</div>
        <div class="doc-list">
          <div class="doc-item" v-for="doc in documents" :key="doc.idx">
            <div class="doc-header">
              <strong>{{ doc.siteName }} - {{ doc.itemName }}</strong>
              <span class="doc-sent-at">발송일시 {{ doc.sentAt }}</span>
            </div>
            <div class="receipt-row">
              <div :class="['receipt-chip', { confirmed: r.confirmedYn }]" v-for="r in doc.receipts" :key="r.type" @click="toggleReceiptConfirm(doc, r)">
                <i :class="['mdi', r.confirmedYn ? 'mdi-check-circle' : 'mdi-clock-outline']"></i>
                {{ r.type }} ({{ r.name }})
                <span v-if="r.confirmedYn" class="receipt-time">{{ r.confirmedAt }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="status-card status-card-full">
        <div class="status-header">
          <i class="mdi mdi-clipboard-check-outline"></i>
          <h3>완료 작업 점검표</h3>
        </div>
        <div class="doc-list">
          <div class="doc-item" v-for="s in completedSchedules" :key="s.idx">
            <div class="doc-header">
              <strong>{{ s.siteName }} - {{ s.itemName }} ({{ s.startDt }})</strong>
              <button v-if="!hasChecklist(s.idx)" class="btn-checklist" @click="openChecklistModal(s)">점검표 작성</button>
              <span v-else class="checklist-done-badge">점검완료</span>
            </div>
          </div>
        </div>
      </div>
    </div>


    <!-- 팀원 편성 모달 -->
    <div v-if="showTeamModal" class="modal-overlay" @click="closeTeamModal">
      <div class="modal-content" style="width: 500px;" @click.stop>
        <div class="modal-header">
          <h2>팀 설정 및 인원 편성</h2>
          <button class="btn-close" @click="closeTeamModal"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group" style="margin-bottom: 20px;">
            <label style="font-weight:600; color:#334155; margin-bottom:8px; display:block;">팀명</label>
            <input type="text" v-model="editingTeam.teamName" class="form-input" placeholder="예: 4팀, 외벽특수팀" />
          </div>
          <p class="modal-desc" style="margin-bottom:12px;">이 팀에 배정할 인원을 선택해주세요.</p>
          <!-- 기존 팀원 편성 모달 내부의 staff-selection-list를 아래 코드로 교체하세요 -->
          <div class="staff-selection-list">
            <div
                v-for="staff in cleaningStaff"
                :key="staff.idx"
                class="staff-item"
                :class="{'is-selected': editingTeam?.memberIds?.includes(staff.idx)}"
                @click="toggleMember(staff.idx)"
            >
              <div class="staff-info">
                <span class="staff-role">{{ staff.position }}</span>
                <span class="staff-name">{{ staff.name }}</span>
              </div>

              <!-- 액션 영역 (버튼 + 체크아이콘) -->
              <div class="staff-actions-row">
                <!-- 이 사람이 선택된 상태일 때만 팀장 지정 버튼 노출 -->
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

                <!-- 기존 선택 체크박스 -->
                <i class="mdi check-icon"
                   :class="editingTeam?.memberIds?.includes(staff.idx) ? 'mdi-check-circle text-primary' : 'mdi-checkbox-blank-circle-outline text-gray'">
                </i>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="justify-content: space-between;">
          <button v-if="teams.find(t => t.idx === editingTeam?.idx)" class="btn-danger" @click="deleteTeam(editingTeam.idx)">팀 삭제</button>
          <div v-else></div>
          <div style="display:flex; gap:8px;">
            <button class="btn-cancel" @click="closeTeamModal">취소</button>
            <button class="btn-add" @click="saveTeamMembers">저장</button>
          </div>
        </div>
      </div>
    </div>

    <!-- 대청소 일정 등록/수정 모달 -->
    <div v-if="showAddModal" class="modal-overlay" @click="closeAddModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>{{ isEditMode ? '대청소 일정 수정' : '대청소 일정 등록' }}</h2>
          <button class="btn-close" @click="closeAddModal"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">

          <!-- 1) 기본 정보: 현장과 청소 항목 -->
          <div class="form-section">
            <h4 class="form-section-title">1. 어디를, 무엇을 청소하나요?</h4>
            <div class="form-group">
              <label>현장 선택 <span class="req">*</span></label>
              <SiteSelect v-model="addForm.sIdx" width="100%" @change="onSiteChange"/>
            </div>

            <div class="form-group" v-if="availableTasks.length > 0">
              <label>청소 항목 <span class="req">*</span></label>
              <select v-model="addForm.itemCd" class="form-control">
                <option value="" disabled>항목을 선택하세요</option>
                <option v-for="task in availableTasks" :key="task.code" :value="task.code">
                  {{ task.name }} <!--(회당 {{ task.durationDays }}일 소요)-->
                </option>
              </select>
            </div>
          </div>

          <!-- 2) 일정: 시작일/종료일 -->
          <div class="form-section">
            <h4 class="form-section-title">2. 언제 진행하나요?</h4>
            <div class="form-row">
              <div class="form-group">
                <label>청소 시작일자 <span class="req">*</span></label>
                <input type="date" v-model="addForm.startDt" class="form-control" />
              </div>
              <div class="form-group">
                <label>청소 종료일자 <span class="req">*</span></label>
                <input type="date" v-model="addForm.endDt" class="form-control" />
              </div>
            </div>
            <div v-if="addForm.startDt && addForm.endDt" class="duration-hint">
              <i class="mdi mdi-calendar-range"></i>
              총 {{ Math.floor((new Date(addForm.endDt) - new Date(addForm.startDt)) / (1000 * 60 * 60 * 24)) + 1 }}일간 진행되는 일정으로 등록됩니다.
            </div>
          </div>

          <!-- 3) 배정: 팀/담당자 (선택 사항임을 명시) -->
          <div class="form-section">
            <h4 class="form-section-title">3. 누가 담당하나요? <span class="optional-tag">선택</span></h4>
            <div class="form-row">
              <div class="form-group">
                <label>대청소팀</label>
                <select v-model="addForm.teamIdx" class="form-control">
                  <option value="" disabled>팀을 선택하세요</option>
                  <option v-for="t in teams" :key="t.idx" :value="t.idx">{{ t.teamName }} ({{ t.leaderName }})</option>
                </select>
              </div>
              <div class="form-group">
                <label>담당 관리자</label>
                <select v-model="addForm.mnIdx" class="form-control">
                  <option value="" disabled>담당자를 선택하세요</option>
                  <option v-for="m in managers" :key="m.idx" :value="m.idx">{{ m.name }}</option>
                </select>
              </div>
            </div>
            <p class="field-hint">
              <i class="mdi mdi-information-outline"></i>
              지금 정하지 않아도 됩니다. 나중에 <b>팀 배정</b> 탭에서 끌어다 놓아 배정하거나, 이 일정을 다시 눌러 바꿀 수 있어요.
            </p>
          </div>

          <!-- 4) 추가 정보 -->
          <div class="form-section">
            <h4 class="form-section-title">4. 추가로 알아둘 내용</h4>
            <div class="form-group">
              <label>투입 장비</label>
              <input type="text" v-model="addForm.equipment" class="form-control" placeholder="예: 고압세척기, 사다리차" />
            </div>

            <div class="form-group">
              <label>단지 요청사항</label>
              <textarea v-model="addForm.memo" class="form-control" rows="2" placeholder="현장에서 요청한 특이사항"></textarea>
            </div>

            <div class="form-group">
              <label>진행 상태</label>
              <select v-model="addForm.status" class="form-control">
                <option value="0">예정</option>
                <option value="1">확정</option> <!-- 알림톡 -->
                <option value="2">진행중</option>
                <option value="3">완료</option>
              </select>
            </div>
          </div>

          <!--div class="form-group form-check">
            <label><input type="checkbox" v-model="addForm.sendDoc" /> 저장과 동시에 공문 발송 (현장/담당자/팀장 수신확인 필요)</label>
          </div-->
        </div>
        <div class="modal-footer">
          <button v-if="isEditMode" class="btn-danger" @click="deleteSchedule" style="margin-right: auto;">삭제</button>
          <button class="btn-cancel" @click="closeAddModal">취소</button>
          <button class="btn-save" @click="saveAddModal">저장</button>
        </div>
      </div>
    </div>

    <!-- 완료 점검표 작성 모달 -->
    <div v-if="showChecklistModal" class="modal-overlay" @click="showChecklistModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h2>작업 완료 점검표</h2>
          <button class="btn-close" @click="showChecklistModal = false"><i class="mdi mdi-close"></i></button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>소장/책임자 확인 서명 (이름 입력으로 대체)</label>
            <input type="text" v-model="checklistForm.siteManagerSign" class="form-control" placeholder="확인자 성명" />
          </div>
          <div class="form-group">
            <label>만족도</label>
            <select v-model="checklistForm.rating" class="form-control">
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
            <textarea v-model="checklistForm.nextDayInstruction" class="form-control" rows="2" placeholder="미비 시 다음날 조치 지시사항"></textarea>
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
.site-cleaning-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 탭 네비게이션 */
.tab-nav {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-sub, #4b5563);
  cursor: pointer;
  transition: all 0.2s;
}
.tab-item:hover {
  color: var(--primary, #4f46e5);
}
.tab-item.active {
  color: var(--primary, #4f46e5);
  border-bottom-color: var(--primary, #4f46e5);
}
.tab-desc {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: -8px 0 0 0;
  font-size: 12px;
  color: var(--text-sub, #4b5563);
}

/* 캘린더 필터바 */
.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.filter-select {
  max-width: 180px;
}

/* 확인대기 배지 */
.schedule-pending {
  opacity: 0.55;
}
.pending-badge {
  display: inline-block;
  margin-top: 2px;
  font-size: 9px;
  font-weight: 700;
  color: var(--warning, #f59e0b);
}

/* 서비스청소 / 경고 */
.badge-service {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 6px;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: #64748b;
  border-radius: 4px;
}
.warning-icon {
  margin-left: 4px;
  color: var(--danger, #ef4444);
  font-size: 14px;
}
.cycle-badge {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-sub, #4b5563);
  background: var(--bg-hover, #f3f4f6);
  padding: 3px 8px;
  border-radius: 4px;
  display: inline-block;
}

/* 상태 카드 전체화면 */
.status-card-full {
  width: 100%;
}

.status-header-with-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.site-count-badge {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-sub, #4b5563);
  background: var(--bg-hover, #f3f4f6);
  padding: 2px 8px;
  border-radius: 999px;
}
.status-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.search-box {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  color: var(--text-sub, #4b5563);
}
.search-input {
  border: none;
  outline: none;
  font-size: 13px;
  width: 180px;
}
.form-check-inline {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--text-sub, #4b5563);
  cursor: pointer;
  white-space: nowrap;
}
.btn-mini {
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-hover, #f3f4f6);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 6px;
  cursor: pointer;
  white-space: nowrap;
}
.btn-mini:hover {
  background: var(--primary-soft, #e0e7ff);
}

/* 카드 높이가 제각각이어도(펼침/접힘) 다른 카드가 밀리지 않도록 그리드 + align-items: start 사용
   (column-count 방식은 카드 폭이 좁아지면서 텍스트가 눌리고 정렬이 어긋나는 문제가 있어 grid로 교체) */
.status-masonry {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  grid-auto-rows: min-content;
  align-items: start;
  gap: 14px;
}

.status-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
}
.status-item-header h4 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  margin: 0;
}
.status-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.summary-chip {
  font-size: 11px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--bg-hover, #f3f4f6);
  color: var(--text-sub, #4b5563);
  white-space: nowrap;
}
.summary-remain {
  background: #fef2f2;
  color: var(--danger, #ef4444);
}
.summary-done {
  background: #f0fdf4;
  color: var(--success, #22c55e);
}
.summary-warning {
  background: #fff7ed;
  color: #f97316;
  display: flex;
  align-items: center;
  gap: 2px;
}
.expand-icon {
  color: var(--text-sub, #4b5563);
  font-size: 18px;
  flex-shrink: 0;
}
.status-item-body {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}


/* 팀별 소요일 매트릭스 */
.workload-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.workload-table th, .workload-table td {
  border: 1px solid var(--border-color, #e5e7eb);
  padding: 10px 12px;
  text-align: center;
}
.workload-table th {
  background: var(--bg-canvas, #f9fafb);
  font-weight: 700;
}
.team-name-cell {
  font-weight: 700;
  text-align: left !important;
}
.cell-overload {
  background: #fee2e2;
  color: var(--danger, #ef4444);
  font-weight: 700;
}
.table-hint {
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-sub, #4b5563);
}

/* 공문/점검표함 */
.empty-state {
  padding: 24px;
  text-align: center;
  color: var(--text-sub, #4b5563);
  font-size: 13px;
}
.doc-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.doc-item {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 12px 16px;
}
.doc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}
.doc-sent-at {
  font-size: 11px;
  color: var(--text-sub, #4b5563);
}
.receipt-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.receipt-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-color, #e5e7eb);
  font-size: 12px;
  cursor: pointer;
  color: var(--text-sub, #4b5563);
  transition: all 0.2s;
}
.receipt-chip.confirmed {
  border-color: var(--success, #22c55e);
  color: var(--success, #22c55e);
  background: #f0fdf4;
}
.receipt-time {
  font-size: 10px;
  opacity: 0.8;
}
.btn-checklist {
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  background: var(--primary, #4f46e5);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}
.checklist-done-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--success, #22c55e);
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.form-check label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500 !important;
  cursor: pointer;
}
textarea.form-control {
  resize: vertical;
  font-family: inherit;
}

/* 모달 내 구획(1. 어디를... / 2. 언제... 등) */
.form-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 16px;
  border-bottom: 1px dashed var(--border-color, #e5e7eb);
}
.form-section:last-of-type {
  border-bottom: none;
  padding-bottom: 0;
}
.form-section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--primary, #4f46e5);
  display: flex;
  align-items: center;
  gap: 6px;
}
.optional-tag {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-sub, #4b5563);
  background: var(--bg-hover, #f3f4f6);
  padding: 1px 6px;
  border-radius: 4px;
}
.req {
  color: var(--danger, #ef4444);
}
.field-hint {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  margin: 0;
  font-size: 12px;
  color: var(--text-sub, #4b5563);
  background: var(--bg-canvas, #f9fafb);
  padding: 8px 10px;
  border-radius: 6px;
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
  max-width: 440px;
  max-height: 90vh;
  overflow-y: auto;
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
  gap: 20px;
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

.form-input, .form-select, .form-textarea { padding: 10px 12px; border: 1px solid var(--border-focus, #cbd5e1); border-radius: 6px; font-size: 13px; background: #fff; width: 100%; box-sizing: border-box; transition: 0.2s; }
.form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); outline: none; }

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
  /*background: var(--bg-hover, #f3f4f6);*/
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

.calendar-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border-color, #e5e7eb);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-sub, #4b5563);
}
.legend-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}
.legend-dot-pending {
  background: repeating-linear-gradient(45deg, #cbd5e1, #cbd5e1 2px, #fff 2px, #fff 4px);
  border: 1px solid #94a3b8;
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
  background: var(--bg-surface, #ffffff);
  border-radius: 10px;
  padding: 14px 16px;
  border: 1px solid var(--border-color, #e5e7eb);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04));
  transition: box-shadow 0.2s, border-color 0.2s;
}
.status-item:hover {
  border-color: var(--primary-soft, #c7d2fe);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}

/* 미니 캘린더 옆 카드(status-list, 접기 없음)에서는 기존처럼 은은한 배경 유지 */
.status-list .status-item {
  background: var(--bg-canvas, #f9fafb);
  box-shadow: none;
}

.status-completed {
  opacity: 0.55;
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
  transition: all 0.2s;
}

.task-completed .task-name {
  color: #9ca3af;
  text-decoration: line-through;
}

.task-completed .count-total,
.task-completed .count-used {
  color: #9ca3af;
}

.task-completed .count-remain {
  color: #9ca3af;
  font-weight: 600;
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
  background: var(--primary, #4f46e5);
  color: #fff;
  /*border-radius: 50%;*/
  font-weight: 700;
}

.cell-date {
  padding: 8px;
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

.cell-add-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: 11px;
  color: var(--primary, #4f46e5);
  opacity: 0;
  padding: 4px 0;
  transition: opacity 0.15s;
}
.calendar-cell:hover .cell-add-hint {
  opacity: 0.85;
}
.not-current .cell-add-hint {
  display: none;
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

.duration-hint {
  font-size: 13px;
  color: var(--primary, #4f46e5);
  font-weight: 600;
  margin-top: -8px;
}
.badge-done {
  display: inline-block; margin-left: 4px; padding: 1px 6px;
  font-size: 10px; font-weight: 700; color: #166534; background: #dcfce7; border-radius: 4px;
}
.badge-notdone {
  display: inline-block; margin-left: 4px; padding: 1px 6px;
  font-size: 10px; font-weight: 700; color: #6b7280; background: #f3f4f6; border-radius: 4px;
}
.badge-notdone-warning {
  display: inline-flex; align-items: center; gap: 2px; margin-left: 4px; padding: 1px 6px;
  font-size: 10px; font-weight: 700; color: #b91c1c; background: #fee2e2; border-radius: 4px;
}

.schedule-text span {
  color: var(--text-sub, #4b5563);
}

/* 추가 */
.cell-schedules {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.schedule-bar {
  height: 22px;
  display: flex;
  align-items: center;
  color: #fff;
  cursor: pointer;
  box-sizing: border-box;
  transition: filter 0.2s;
}
.schedule-bar:hover { filter: brightness(0.9); }

.schedule-bar.is-pending {
  background-image: repeating-linear-gradient(45deg, rgba(255,255,255,0.2), rgba(255,255,255,0.2) 10px, transparent 10px, transparent 20px) !important;
  border-top: 1px dashed rgba(0,0,0,0.3);
  border-bottom: 1px dashed rgba(0,0,0,0.3);
}

.bar-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 0 6px;
  overflow: hidden;
  white-space: nowrap;
}
.bar-title { font-size: 10px; font-weight: 700; text-overflow: ellipsis; overflow: hidden; }
.bar-badge { background: rgba(0,0,0,0.2); padding: 1px 4px; border-radius: 4px; font-size: 9px; flex-shrink: 0; }

.schedule-bar.is-start { border-top-left-radius: 4px; border-bottom-left-radius: 4px; margin-left: 4px; }
.schedule-bar.is-end { border-top-right-radius: 4px; border-bottom-right-radius: 4px; margin-right: 4px; }
.schedule-bar.is-middle { border-radius: 0; margin: 0; }
.schedule-bar.is-start.is-end { border-radius: 4px; margin-left: 4px; margin-right: 4px; }

.schedule-bar-empty {
  height: 22px;
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
    display: none;
  }
  .schedule-text {
    font-size: 10px;
  }
  .form-row {
    grid-template-columns: 1fr;
  }
}

/* ==================== KANBAN BOARD ==================== */
.kanban-wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.kanban-intro {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-canvas, #f9fafb);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  font-size: 12px;
  color: var(--text-sub, #4b5563);
}
.kanban-intro i {
  color: var(--primary, #4f46e5);
  font-size: 16px;
  flex-shrink: 0;
}
.kanban-board {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 8px;
  align-items: flex-start;
}
.kanban-col {
  background: #f8fafc;
  border-radius: 12px;
  width: 320px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  border: 1px solid #e2e8f0;
  max-height: calc(100vh - 200px);
}
.unassigned-col {
  background: #fdf8f6;
  border-color: #fce7f3;
}
.col-header {
  padding: 16px;
  border-bottom: 1px solid #e2e8f0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #ffffff;
  border-radius: 12px 12px 0 0;
}
.unassigned-col .col-header {
  border-bottom-color: #fce7f3;
}
.col-header h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #1e293b;
  display: flex;
  align-items: center;
  gap: 6px;
}
.unassigned-col .col-header h4 {
  color: #be123c;
}
.team-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.team-leader {
  font-size: 12px;
  color: #64748b;
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
}
.task-count {
  background: #e2e8f0;
  color: #475569;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 12px;
}
.unassigned-col .task-count {
  background: #ffe4e6;
  color: #e11d48;
}
.col-body {
  padding: 12px;
  overflow-y: auto;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
}
.task-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 14px;
  cursor: grab;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  transition: all 0.2s;
}
.task-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
  transform: translateY(-2px);
}
.task-card:active {
  cursor: grabbing;
}
.task-card.is-dragging {
  opacity: 0.5;
  background: #f1f5f9;
}
.task-card.assigned {
  border-left: 4px solid #3b82f6;
}
.task-card-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}
.task-site {
  font-weight: 700;
  font-size: 14px;
  color: #0f172a;
}
.task-date {
  font-size: 12px;
  color: #64748b;
  font-weight: 500;
}
.task-card-body p {
  margin: 0 0 6px 0;
  font-size: 13px;
  color: #334155;
}
.task-card-body p:last-child {
  margin-bottom: 0;
}
.task-address {
  color: #64748b !important;
  font-size: 12px !important;
}
.task-note {
  color: #eab308 !important;
  background: #fefce8;
  padding: 6px;
  border-radius: 4px;
  border: 1px dashed #fde047;
}
.task-tags {
  display: flex;
  margin-top: 10px;
}
.status-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: #e2e8f0;
  color: #475569;
  font-weight: 600;
}
.status-badge.is-progress {
  background: #dbeafe;
  color: #1d4ed8;
}
.status-badge.is-done {
  background: #dcfce7;
  color: #15803d;
}
.empty-col {
  text-align: center;
  padding: 24px 0;
  color: #94a3b8;
  font-size: 13px;
  font-style: italic;
  line-height: 1.6;
}
.task-card-footer {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed #e2e8f0;
  font-size: 11px;
  color: #94a3b8;
}


.btn-icon-small {
  background: transparent;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  color: #64748b;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 13px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}
.btn-icon-small:hover {
  background: #f1f5f9;
  color: #0f172a;
}
.team-member-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  flex: 1;
}
.member-chip {
  font-size: 12px;
  background: #f1f5f9;
  color: #475569;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
}
.member-chip.is-leader {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
  font-weight: 600;
}
.empty-members {
  font-size: 11px;
  color: #94a3b8;
}
.modal-desc {
  font-size: 14px;
  color: #64748b;
  margin-bottom: 16px;
}
.staff-selection-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  max-height: 400px;
  overflow-y: auto;
}
.staff-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}
.staff-item:hover {
  border-color: #cbd5e1;
  background: #f8fafc;
}
.staff-item.is-selected {
  border-color: #3b82f6;
  background: #eff6ff;
}
.staff-role {
  font-size: 12px;
  background: #e2e8f0;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 6px;
  color: #475569;
}
.staff-role.is-leader {
  background: #dbeafe;
  color: #1d4ed8;
}
.staff-name {
  font-size: 15px;
  font-weight: 500;
  color: #1e293b;
}

/* 팀원 모달 - 우측 액션 영역 */
.staff-actions-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.check-icon {
  font-size: 20px;
}

/* 팀장 지정 버튼 */
.btn-leader-select {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #64748b;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-leader-select:hover {
  background: #e2e8f0;
}
/* 팀장으로 활성화되었을 때의 스타일 (금색/오렌지색 계열 강조) */
.btn-leader-select.is-leader {
  background: #fffbeb;
  border-color: #fcd34d;
  color: #d97706;
}
.btn-leader-select.is-leader i {
  color: #f59e0b;
  font-size: 14px;
}

.add-team-col {
  background: transparent;
  border: 2px dashed #cbd5e1;
  justify-content: center;
  align-items: center;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  min-height: 200px;
}
.add-team-col:hover {
  border-color: #3b82f6;
  color: #3b82f6;
  background: #eff6ff;
}
.add-team-col i {
  font-size: 32px;
  margin-bottom: 8px;
}
.add-team-col span {
  font-weight: 600;
  font-size: 15px;
}
.btn-danger {
  background: #ef4444;
  color: white;
  border: 1px solid #dc2626;
  padding: 8px 16px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  font-size: 14px;
}
.btn-danger:hover {
  background: #dc2626;
}
</style>