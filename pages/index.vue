<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";
import { useRouter } from 'nuxt/app';

const router = useRouter();

const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

// 1. 주요 현황 데이터 (KPI)
const startDate = ref('');
const endDate = ref('');
const orderCount = ref(0);
const offCount = ref(0);
const totalPayrollNet = ref(0); // 이번 달 실지급액 총합

// stats 변수의 컬러 정의를 common.css의 테마 변수로 매칭
const stats = ref([
  {
    id:'site',
    title: '총 관리 현장',
    value: 12,
    unit: '개소',
    icon: 'mdi-office-building-marker',
    change: '+1',
    changeText: '지난달 대비',
    color: 'var(--primary)',
    bgColor: 'var(--primary-soft)'
  },
  {
    id:'member',
    title: '총 근무 인원',
    value: 145,
    unit: '명',
    icon: 'mdi-account-group-outline',
    change: '+5',
    changeText: '이번달',
    color: 'var(--success)',
    bgColor: 'rgba(16, 185, 129, 0.1)' // success-soft
  },
  {
    id:'payroll',
    title: '이번달 급여 총액',
    value: '3.5억',
    unit: '원',
    icon: 'mdi-credit-card-check-outline',
    change: '+2%',
    changeText: '전월 대비',
    color: 'var(--warning)',
    bgColor: 'rgba(245, 158, 11, 0.1)' // warning-soft
  },
  {
    id:'request',
    title: '승인 대기 업무',
    value: 0,
    unit: '건',
    icon: 'mdi-clipboard-text-clock-outline',
    change: '',
    changeText: '',
    color: 'var(--danger)',
    bgColor: 'rgba(239, 68, 68, 0.1)' // danger-soft
  },
]);

const rawOrders = ref([]);
const rawOffs = ref([]);

// 2. 공지사항 (최신순)
const notices = ref([]);

// 3. 결재/승인 대기 현황
const pendingList = ref([]);
const pendingApprovals = computed(() => {
  const orders = rawOrders.value.map(item => ({
    id: `order-${item.idx}`,
    type: item.groupCode === '05' ? '피복신청' : '용품신청',
    site: item.siteName || '미지정 현장',
    applicant: item.applicant || '알 수 없음',
    date: item.regDt?.slice(0, 10) || '-',
    status: item.status,
    priority: 'normal'
  }));

  const offs = rawOffs.value.map(item => ({
    id: `off-${item.idx}`,
    type: '연차신청',
    site: item.site || '본사',
    applicant: item.staff,
    date: item.startDt,
    status: item.status,
    priority: 'high'
  }));

  // 최신순 정렬
  return [...orders, ...offs].sort((a, b) => new Date(b.date) - new Date(a.date));
});

// 4. 현장별 계약/이슈 현황
const siteStatus = ref([
  /*
{ name: 'LH 위례 6단지', issueCount: 0, contractEnd: '2025-12-31', progress: 80, contract: '2025-01-01 ~ 2025-12-31' },
{ name: '강서 대명 강동', issueCount: 2, contractEnd: '2025-06-30', progress: 40, contract: '2025-01-01 ~ 2025-06-30' },
{ name: '판교 테크노밸리', issueCount: 0, contractEnd: '2026-02-28', progress: 95, contract: '2025-01-01 ~ 2026-02-28' },

   */
]);

// 대청소 관련
const cleaningStats = ref({
  total: 5,
  completed: 2,
  upcoming: 3
});

const cleaningSchedules = ref([
  { id: 1, site: 'LH 위례 6단지', type: '계단 대청소', date: '2025-05-10', status: '예정', worker: '김반장 외 3명' },
  { id: 2, site: '강서 대명 강동', type: '지하주차장 물청소', date: '2025-05-12', status: '예정', worker: '청소팀 A' },
  { id: 3, site: '판교 테크노밸리', type: '외벽 유리창 청소', date: '2025-05-01', status: '완료', worker: '외부 용역' },
]);

// 유틸리티 함수 (테마 컬러와 연동)
const getCleaningStatusClass = (status) => {
  if (status === '완료') return 'status-complete';
  if (status === '예정') return 'status-upcoming';
  return 'status-delayed';
};

const getBadgeClass = (category) => {
  const classes = {
    '인사': 'badge-blue',
    '시스템': 'badge-red',
    '공지': 'badge-gray',
    '교육': 'badge-green',
  };
  return classes[category] || 'badge-gray';
};

const getTypeTagClass = (type) => {
  const classes = {
    '피복신청': 'type-tag-orange',
    '용품신청': 'type-tag-blue',
    '연차신청': 'type-tag-green'
  };
  return classes[type] || 'type-tag-gray';
};

const getProgressColor = (progress) => {
  if (progress >= 80) return 'var(--danger)';
  if (progress >= 50) return 'var(--warning)';
  return 'var(--success)';
};

const getStatusIconInfo = (status) => {
  if (status == 0) return { icon: 'mdi-clock-outline', class: 'status-pending-icon' };
  if (status == 1) return { icon: 'mdi-check-circle-outline', class: 'status-complete-icon' };
  return { icon: 'mdi-close-circle-outline', class: 'status-delayed-icon' };
};

// 데이터 가공 로직
const calculateProcessed = (data) => {
  if (!data || !Array.isArray(data)) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return data.map(site => {
    let progress = 0;
    let contractEnd = '';
    let urgentType = ''; // 임박한 계약의 종류 (예: '경비')

    if (site.contracts && site.contracts.length > 0) {
      // 1. 계약들을 '종료일(endDate)이 빠른 순'으로 정렬합니다.
      const sortedContracts = [...site.contracts].sort((a, b) => {
        const endA = new Date(a.contract_period.split(' ~ ')[1]).getTime();
        const endB = new Date(b.contract_period.split(' ~ ')[1]).getTime();
        return endA - endB;
      });

      // 2. 가장 종료일이 빠른(임박한) 계약을 타겟으로 잡습니다.
      const targetContract = sortedContracts[0];

      const [startStr, endStr] = targetContract.contract_period.split(' ~ ');
      contractEnd = endStr;

      // 만약 contract 객체 안에 계약 종류(type이나 category)가 있다면 가져옵니다.
      // (변수명은 실제 데이터에 맞게 수정하세요. 예: targetContract.category)
      urgentType = targetContract.type || targetContract.category || '계약';

      const startDate = new Date(startStr);
      const endDate = new Date(endStr);

      const totalDuration = endDate.getTime() - startDate.getTime();
      const elapsedDuration = today.getTime() - startDate.getTime();

      if (totalDuration > 0) {
        progress = (elapsedDuration / totalDuration) * 100;
      }

      // 3. 진행률 0 ~ 100 사이 보정 (기존 로직 유지, 더 깔끔하게 작성)
      progress = Math.max(0, Math.min(100, progress));
    }

    return {
      ...site,
      progress: Math.round(progress),
      contractEnd: contractEnd,
      urgentType: urgentType, // UI 표시용 (예: 경비)
      contractCount: site.contracts ? site.contracts.length : 0 // UI 표시용 (총 계약 수)
    };
  });
};

// API 호출
const getSiteData = async () => {
  try {
    const res = await axios.get(`/api/v1/site/list`);
    const result = res.data.data;
    // if (stats.value[0]) stats.value[0].value = result.length;
    const processedData = calculateProcessed(result.slice(0, 3));
    siteStatus.value = processedData;
  } catch (err) { console.error('현장 로드 실패:', err); }
}

const getMemberData = async () => {
  try {
    const res = await axios.get(`/api/v1/member/list`);
    if (stats.value[1]) stats.value[1].value = res.data.data.length;
  } catch (err) { console.error(err); }
}

const getPayrollMonth = async () => {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');

  try {
    const res = await axios.get(`/api/v1/member/payroll/month`, {
      params: { year, month }
    });

    if (res.data.result && res.data.data) {
      const payrollData = res.data.data;
      const totalNet = payrollData.reduce((acc, curr) => acc + (Number(curr.netPay) || 0), 0);
      totalPayrollNet.value = totalNet;

      const payrollStat = stats.value.find(s => s.id === 'payroll');
      if (payrollStat) {
        payrollStat.value = totalNet.toLocaleString();
        payrollStat.changeText = `${year}년 ${month}월 정산 기준`;
      }
    }
  } catch (err) { console.error('이번 달 급여 합계 로드 실패:', err); }
};

const fetchNotices = () => {
  axios.get(`/api/v1/notice/list/${cIdx}`)
      .then(res => {
        notices.value = res.data.data.slice(0, 4);
      })
      .catch(err => console.error(err));
};

const fetchOrders = async () => {
  try {
    const res = await axios.get('/api/v1/code/item/order');
    if (res.data.result) {
      rawOrders.value = res.data.data;
      orderCount.value = res.data.data.length;
      updateRequestStat();
    }
  } catch (err) { console.error(err); }
};

const getMemberOff = async () => {
  try {
    let params = { startDt: startDate.value, endDt: endDate.value };
    const res = await axios.get(`/api/v1/member/off/${cIdx}`, { params });
    rawOffs.value = res.data.data;
    offCount.value = res.data.data.length;
    updateRequestStat();
  } catch (err) { console.error(err); }
};

const updateRequestStat = () => {
  const total = orderCount.value + offCount.value;
  const statObj = stats.value.find(s => s.id === 'request');
  if (statObj) {
    statObj.value = total;
    statObj.changeText = `연차 신청 ${offCount.value} / 용품 신청 ${orderCount.value}`;
  }
};

const setDefaultDate = () => {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  startDate.value = start;
  endDate.value = end;
};

// API 호출 통합 및 데이터 매핑
const fetchDashboardData = async () => {
  try {
    // 백엔드에서 만든 통합 API 호출
    const res = await axios.get(`/api/v1/dashboard`);

    if (res.data) {
      const { pending, siteStatus: sStatus, memberStatus: mStatus } = res.data;

      // 1. 상단 통계 카드(KPI) 업데이트
      stats.value = stats.value.map(stat => {
        if (stat.id === 'site') {
          return {
            ...stat,
            value: sStatus.totalCount,
            change: sStatus.increaseCount > 0 ? `+${sStatus.increaseCount}` : sStatus.increaseCount,
            changeText: '지난달 대비'
          };
        }
        if (stat.id === 'member') {
          return {
            ...stat,
            value: mStatus.totalCount,
            change: mStatus.increaseCount > 0 ? `+${mStatus.increaseCount}` : mStatus.increaseCount,
            changeText: '지난달 대비 신규'
          };
        }
        if (stat.id === 'request') {
          return {
            ...stat,
            value: pending.length,
            change: '',
            changeText: '승인 대기 중인 업무'
          };
        }
        return stat;
      });

      // 2. 승인 대기 목록용 데이터는 기존 fetchOrders, getMemberOff를 유지하거나
      pendingList.value = pending.map(item => ({
        id: `${item.type}-${item.idx}`,
        type: item.type === 'order' ? '용품신청' : '연차신청', // 타입 한글화
        site: item.site,
        applicant: item.applicant,
        summary: item.summary,
        date: item.date,
        status: item.status,
        priority: item.type === 'off' ? 'high' : 'normal' // 연차인 경우 우선순위 높음 표시 예시
      }));
    }
  } catch (err) {
    console.error('대시보드 데이터 로드 실패:', err);
  }
};

const goDetail = async (type) => {
  if(type == '용품신청') {
    router.push('/supplies/list')
  } else {
    router.push('/work/annual')
  }
}

onMounted(async () => {
  setDefaultDate();
  // 모든 API를 병렬로 호출. 하나가 실패해도 나머지는 실행되도록 처리
  await Promise.allSettled([
    fetchDashboardData(), // 통계 및 승인대기
    getSiteData(),        // 계약 현황 리스트
    fetchNotices(),       // 공지사항
    getPayrollMonth()     // 급여 총액
  ]);
});

const currentTime = ref(new Date().toLocaleString('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long'
}));
</script>

<template>
  <div class="dashboard-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-view-dashboard-variant-outline"></i>
          대시보드
        </h1>
        <p class="page-subtitle">안녕하세요, {{ authStore.user?.managerNm }}님. 현재 시스템 현황입니다. ({{ currentTime }})</p>
      </div>
    </div>

    <div class="stats-grid">
      <div
          v-for="(stat, index) in stats"
          :key="index"
          class="stat-card"
          :style="{ '--card-color': stat.color, '--card-bg': stat.bgColor }"
      >
        <div class="stat-icon">
          <i :class="['mdi', stat.icon]"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">{{ stat.title }}</span>
          <div class="stat-value-group">
            <span class="stat-value">{{ stat.value }}</span>
            <small class="stat-unit">{{ stat.unit }}</small>
          </div>
          <div class="stat-footer">
            <span class="stat-change" v-if="stat.change">{{ stat.change }}</span>
            <span class="stat-footer-text">{{ stat.changeText }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="main-grid">
      <div class="grid-column">
        <div class="table-card">
          <div class="table-header">
            <h3 class="table-title">
              <i class="mdi mdi-file-sign"></i>
              승인 대기 업무
              <span class="badge-count">{{ pendingList.length }}</span>
            </h3>
          </div>
          <div class="list-body">
            <div v-if="pendingList.length === 0" class="empty-state">
              <i class="mdi mdi-check-decagram-outline"></i>
              <p>대기 중인 업무가 없습니다.</p>
            </div>
            <div
                v-for="item in pendingList"
                :key="item.id"
                class="list-item"
            >
              <div class="item-main">
                <span :class="['type-tag', getTypeTagClass(item.type)]">{{ item.type }}</span>
                <div class="item-info">
                  <div class="item-title">{{ item.site }}</div>
                  <div class="item-meta">
                    <span class="meta-user"><i class="mdi mdi-account-outline"></i> {{ item.applicant }}</span>
                    <span class="meta-date"><i class="mdi mdi-calendar-outline"></i> {{ item.date }}</span>
                    <span class="meta-summary" v-if="item.summary">| {{ item.summary }}</span>
                  </div>
                </div>
              </div>
              <div class="item-action">
                <button class="btn-detail" @click="goDetail(item.type)">상세보기</button>
              </div>
            </div>
          </div>
        </div>

        <div class="table-card">
          <div class="table-header">
            <h3 class="table-title">최신 공지사항</h3>
          </div>
          <div class="list-body">
            <div v-for="notice in notices" :key="notice.idx" class="notice-row">
              <span :class="['badge', getBadgeClass(notice.type)]">{{ notice.type }}</span>
              <div class="notice-content">
                <div class="notice-subject">{{ notice.title }}</div>
                <div class="notice-date">{{ notice.date }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid-column">
        <div class="table-card">
          <div class="table-header">
            <h3 class="table-title">주요 현장 계약 현황</h3>
          </div>
          <div class="list-body">
            <div v-for="(site, idx) in siteStatus" :key="idx" class="site-status-row">
              <div class="site-top">
                <span class="site-name">{{ site.name }}</span>
                <span class="site-progress-num" :style="{ color: getProgressColor(site.progress) }">{{ site.progress }}%</span>
              </div>
              <div class="site-mid">
                <div class="progress-bar-container">
                  <div class="progress-bar-fill" :style="{ width: site.progress + '%', background: getProgressColor(site.progress) }"></div>
                </div>
              </div>
              <div class="site-bottom">
                <span><i class="mdi mdi-clock-end"></i> 종료: {{ site.contractEnd }}</span>
                <span v-if="site.issueCount > 0" class="text-red"><i class="mdi mdi-alert-circle"></i> 이슈 {{ site.issueCount }}건</span>
              </div>
            </div>
          </div>
        </div>

        <div class="table-card">
          <div class="table-header">
            <h3 class="table-title">이번 달 대청소 일정</h3>
            <span class="stat-footer-text">완료 {{ cleaningStats.completed }} / 총 {{ cleaningStats.total }}</span>
          </div>
          <div class="list-body">
            <div v-for="item in cleaningSchedules" :key="item.id" class="cleaning-row">
              <div class="date-chip">
                <span class="d-day">{{ item.date.split('-')[2] }}</span>
                <span class="d-month">{{ item.date.split('-')[1] }}월</span>
              </div>
              <div class="cleaning-info">
                <div class="c-site">{{ item.site }}</div>
                <div class="c-type">{{ item.type }}</div>
              </div>
              <div class="c-status">
                <span :class="['status-chip', getCleaningStatusClass(item.status)]">{{ item.status }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 1. 레이아웃 및 섹션 가이드 */
.dashboard-page {
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.table-title { margin: 0; }

/* 2. KPI 통계 카드 (common.css 설정 활용) */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
}

.stat-value-group {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin: 4px 0;
}

.stat-unit {
  font-size: 14px;
  color: var(--text-sub);
  font-weight: 500;
}

.stat-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.stat-change {
  font-weight: 700;
  color: var(--card-color);
}

.stat-footer-text {
  color: var(--text-sub);
}

/* 3. 메인 그리드 설정 */
.main-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  align-items: start;
}

.grid-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* 4. 리스트 공통 바디 */
.list-body {
  padding: 0;
}

/* 5. 리스트 아이템 스타일 */
.list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 24px;
  border-bottom: 1px solid var(--border-color);
  transition: background 0.2s ease;
}

.list-item:hover {
  background-color: var(--bg-hover);
}

.list-item:last-child {
  border-bottom: none;
}

.item-main {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  min-width: 0;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-sub);
}

.item-meta span {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 6. 태그 및 배지 디자인 (다크/라이트 테마 변수 활용) */
.type-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  min-width: 65px;
  white-space: nowrap;
}

/* 촌스러운 보라색 제거 -> ERP 테마 컬러 활용 */
.type-tag-orange { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }
.type-tag-blue { background-color: var(--primary-soft); color: var(--primary); }
.type-tag-green { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.type-tag-gray { background-color: var(--bg-hover); color: var(--text-sub); }

.badge-count {
  margin-left: 8px;
  background-color: var(--primary);
  color: var(--text-inverse);
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
}

/* 7. 공지사항 행 디자인 */
.notice-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-color);
  transition: background 0.2s;
}

.notice-row:hover {
  background-color: var(--bg-hover);
}

.notice-row:last-child {
  border-bottom: none;
}

.notice-content {
  flex: 1;
}

.notice-subject {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main);
  margin-bottom: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.notice-date {
  font-size: 11px;
  color: var(--text-sub);
}

/* 8. 현장 상태 및 진행바 */
.site-status-row {
  padding: 16px 24px;
  border-bottom: 1px solid var(--border-color);
}

.site-status-row:last-child {
  border-bottom: none;
}

.site-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.site-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}

.site-progress-num {
  font-size: 13px;
  font-weight: 700;
}

.progress-bar-container {
  height: 8px;
  background-color: var(--bg-hover);
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 10px;
  transition: width 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.site-bottom {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-sub);
}

.site-bottom span {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 9. 청소 일정 디자인 */
.cleaning-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  border-bottom: 1px solid var(--border-color);
}

.cleaning-row:last-child {
  border-bottom: none;
}

.date-chip {
  width: 50px;
  height: 50px;
  background-color: var(--header-bg);
  color: var(--text-inverse);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.d-day {
  font-size: 18px;
  font-weight: 800;
  line-height: 1;
}

.d-month {
  font-size: 10px;
  opacity: 0.8;
  margin-top: 2px;
}

.cleaning-info {
  flex: 1;
}

.c-site {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 2px;
}

.c-type {
  font-size: 12px;
  color: var(--text-sub);
}

.status-chip {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}

.status-complete { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-upcoming { background-color: var(--primary-soft); color: var(--primary); }
.status-delayed { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }

/* 상태 아이콘 색상 보정 */
.status-pending-icon { color: var(--warning); }
.status-complete-icon { color: var(--success); }
.status-delayed-icon { color: var(--danger); }

/* 10. 반응형 조정 */
@media (max-width: 1024px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .list-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }
  .item-action {
    width: 100%;
  }
  .item-action button {
    width: 100%;
  }
  .stats-grid {
    /*grid-template-columns: 1fr 1fr;*/
  }
}
</style>
