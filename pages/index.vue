<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";

const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

// 1. 주요 현황 데이터 (KPI)
const startDate = ref('');
const endDate = ref('');
const orderCount = ref(0);
const offCount = ref(0);

const stats = ref([
  {
    id:'site',
    title: '총 관리 현장',
    value: 12,
    unit: '개소',
    icon: 'mdi-office-building',
    change: '+1',
    changeText: '지난달 대비',
    color: '#667eea',
    bgColor: 'rgba(102, 126, 234, 0.1)'
  },
  {
    id:'member',
    title: '총 근무 인원',
    value: 145,
    unit: '명',
    icon: 'mdi-account-group',
    change: '+5',
    changeText: '이번달',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)'
  },
  {
    id:'payroll',
    title: '이번달 급여 총액',
    value: '3.5억',
    unit: '원',
    icon: 'mdi-cash-multiple',
    change: '+2%',
    changeText: '전월 대비',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)'
  },
  {
    id:'request',
    title: '승인 대기',
    value: 0, // computed나 함수에서 업데이트
    unit: '건',
    icon: 'mdi-clock-alert-outline',
    change: '', // 아래에서 세부 수치로 활용
    changeText: '',
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)'
  },
]);

const rawOrders = ref([]);
const rawOffs = ref([]);

// 2. 공지사항 (최신순)
const notices = ref([
    /*
  { id: 1, type: '인사', title: '5월 근무 스케줄 확정 안내', date: '2025-05-02', author: '인사팀', isNew: true },
  { id: 2, type: '시스템', title: 'ERP 서버 정기 점검 안내', date: '2025-05-01', author: '관리자', isNew: false },
  { id: 3, type: '공지', title: '하절기 복장 착용 규정', date: '2025-04-28', author: '총무팀', isNew: false },
  { id: 4, type: '교육', title: '안전교육 일정 안내', date: '2025-04-25', author: '안전팀', isNew: false },
     */
]);

// 3. 결재/승인 대기 현황
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
  { name: 'LH 위례 6단지', issueCount: 0, contractEnd: '2025-12-31', progress: 80, contract: '2025-01-01 ~ 2025-12-31' },
  { name: '강서 대명 강동', issueCount: 2, contractEnd: '2025-06-30', progress: 40, contract: '2025-01-01 ~ 2025-06-30' },
  { name: '판교 테크노밸리', issueCount: 0, contractEnd: '2026-02-28', progress: 95, contract: '2025-01-01 ~ 2026-02-28' },
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

// 최근 활동 로그
const recentActivities = ref([
  { id: 1, type: '급여', action: '4월 급여 계산 완료', time: '2시간 전', icon: 'mdi-calculator' },
  { id: 2, type: '직원', action: '신규 직원 3명 등록', time: '5시간 전', icon: 'mdi-account-plus' },
  { id: 3, type: '현장', action: '강남 A현장 계약 갱신', time: '1일 전', icon: 'mdi-file-document' },
  { id: 4, type: '공지', action: '안전교육 공지 발송', time: '2일 전', icon: 'mdi-bullhorn' },
]);

// 유틸리티 함수
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
    '피복신청': 'type-tag-purple',
    '용품신청': 'type-tag-blue',
    '연차신청': 'type-tag-green'
  };
  return classes[type] || 'type-tag-gray';
};

const getProgressColor = (progress) => {
  if (progress >= 80) return '#ef4444';
  if (progress >= 50) return '#f59e0b';
  return '#10b981';
};

// 데이터 가공 로직
const calculateProcessed = (data) => {
  if (!data || !Array.isArray(data)) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return data.map(site => {
    let progress = 0;
    let contractEnd = '';

    if (site.contract && site.contract.includes('~')) {
      const [startStr, endStr] = site.contract.split(' ~ ');
      contractEnd = endStr;

      const startDate = new Date(startStr);
      const endDate = new Date(endStr);

      const totalDuration = endDate.getTime() - startDate.getTime();
      const elapsedDuration = today.getTime() - startDate.getTime();

      if (totalDuration > 0) {
        progress = (elapsedDuration / totalDuration) * 100;
      }

      if (progress < 0) progress = 0;
      if (progress > 100) progress = 100;
    }

    return {
      ...site,
      progress: Math.round(progress),
      contractEnd: contractEnd,
    };
  });
};

// API 호출
const getSiteData = async () => {
  await axios.get(`/api/v1/site/list/${cIdx}`)
      .then(res => {
        const result = res.data.data;
        stats.value[0].value = result.length;
        const processedData = calculateProcessed(result.slice(0, 3));
        siteStatus.value = processedData;
      })
      .catch(err => {
        console.error('현장 로드 실패:', err);
      });
}

const getMemberData = async () => {
  await axios.get(`/api/v1/member/list`)
  .then(res => {
    stats.value[1].value = res.data.data.length;
  })
}

const getPayrollMonth = async () => {
  console.log('급여 총액')

}

const fetchNotices = () => {
  // alert(`검색: [${searchType.value}] ${searchQuery.value}`);
  axios.get('/api/v1/notice/list')
      .then(res => {
        notices.value = res.data.data.slice(0, 4);
      })
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
    //statObj.change = `연차 ${offCount.value} / 용품 ${orderCount.value}`;
    statObj.changeText = `연차 신청 ${offCount.value} / 용품 신청 ${orderCount.value}`; // 기존 '처리 필요' 대신 세부 수치 강조
  }
};

const setDefaultDate = () => {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  startDate.value = start;
  endDate.value = end;
};

onMounted(() => {
  setDefaultDate();
  getSiteData();
  fetchNotices();
  getMemberData();
  getMemberOff();
  fetchOrders();
})

// 현재 시간
const currentTime = ref(new Date().toLocaleString('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long'
}));
</script>

<template>
  <div class="dashboard-page">
    <!-- 헤더 섹션 -->
    <div class="header-section">
      <div class="welcome-box">
        <h1 class="welcome-title">
          <i class="mdi mdi-hand-wave"></i>
          안녕하세요, {{ authStore.user?.managerNm }}님!
        </h1>
        <p class="welcome-subtitle">오늘도 좋은 하루 보내세요. {{ currentTime }}</p>
      </div>
      <!--div class="quick-actions">
        <button class="quick-btn">
          <i class="mdi mdi-plus-circle"></i>
          <span>신규 등록</span>
        </button>
        <button class="quick-btn">
          <i class="mdi mdi-file-export"></i>
          <span>보고서</span>
        </button>
      </div-->
    </div>

    <!-- KPI 카드 그리드 -->
    <div class="kpi-grid">
      <div
          v-for="(stat, index) in stats"
          :key="index"
          class="kpi-card"
          :style="{ '--card-color': stat.color, '--card-bg': stat.bgColor }"
      >
        <div class="kpi-icon-wrapper">
          <i :class="['mdi', stat.icon]"></i>
        </div>
        <div class="kpi-content">
          <span class="kpi-title">{{ stat.title }}</span>
          <div class="kpi-value-row">
            <span class="kpi-value">{{ stat.value }}</span>
            <span class="kpi-unit">{{ stat.unit }}</span>
          </div>
          <div class="kpi-change-row">
            <span class="kpi-change">{{ stat.change }}</span>
            <span class="kpi-change-text">{{ stat.changeText }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 메인 그리드 -->
    <div class="main-grid">
      <!-- 왼쪽 컬럼 -->
      <div class="grid-column">
        <!-- 승인 대기 업무 -->
        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <i class="mdi mdi-alert-circle-outline card-icon"></i>
              <h3>승인 대기 업무</h3>
              <span class="count-badge">{{ pendingApprovals.length }}</span>
            </div>
            <!--NuxtLink to="/supplies/list" class="btn-text">
              전체보기
              <i class="mdi mdi-arrow-right"></i>
            </NuxtLink-->
          </div>
          <div class="card-body">
            <div class="approval-list">
              <div
                  v-for="item in pendingApprovals"
                  :key="item.id"
                  class="approval-item"
              >
                <div class="approval-left">
                  <span :class="['type-tag', getTypeTagClass(item.type)]">
                    {{ item.type }}
                  </span>
                  <div class="approval-info">
                    <div class="approval-title">{{ item.site }}</div>
                    <div class="approval-sub">
                      <i class="mdi mdi-account-outline"></i>
                      {{ item.applicant }}
                    </div>
                  </div>
                </div>
                <div class="approval-right">
                  <div class="approval-date">{{ item.date }}</div>
                  <span class="status-badge" :class="['status-badge', getStatusClass(item.status)]">
                    <i class="mdi mdi-clock-outline"></i>
                    {{ item.status == 0 ? '승인대기': item.status == 1 ? '승인' : '반려' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 공지사항 -->
        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <i class="mdi mdi-bullhorn card-icon"></i>
              <h3>최신 공지사항</h3>
            </div>
            <NuxtLink to="/notice/list" class="btn-text">
              전체보기
              <i class="mdi mdi-arrow-right"></i>
            </NuxtLink>
          </div>
          <div class="card-body">
            <div class="notice-list">
              <div
                  v-for="notice in notices"
                  :key="notice.idx"
                  class="notice-item"
              >
                <div class="notice-header">
                  <span :class="['badge', getBadgeClass(notice.type)]">
                    {{ notice.type }}
                  </span>
                  <span v-if="notice.isNew" class="new-badge">NEW</span>
                </div>
                <div class="notice-title">{{ notice.title }}</div>
                <div class="notice-footer">
                  <span class="notice-author">
                    <i class="mdi mdi-account-circle"></i>
                    {{ notice.author }}
                  </span>
                  <span class="notice-date">
                    <i class="mdi mdi-calendar"></i>
                    {{ notice.date }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 최근 활동 -->
        <!--div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <i class="mdi mdi-history card-icon"></i>
              <h3>최근 활동</h3>
            </div>
          </div>
          <div class="card-body">
            <div class="activity-list">
              <div
                  v-for="activity in recentActivities"
                  :key="activity.id"
                  class="activity-item"
              >
                <div class="activity-icon">
                  <i :class="['mdi', activity.icon]"></i>
                </div>
                <div class="activity-content">
                  <div class="activity-action">{{ activity.action }}</div>
                  <div class="activity-time">{{ activity.time }}</div>
                </div>
              </div>
            </div>
          </div>
        </div-->
      </div>

      <!-- 오른쪽 컬럼 -->
      <div class="grid-column">
        <!-- 주요 현장 현황 -->
        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <i class="mdi mdi-map-marker card-icon"></i>
              <h3>주요 현장 현황</h3>
            </div>
            <NuxtLink to="/site/list" class="btn-icon">
              <i class="mdi mdi-cog"></i>
            </NuxtLink>
          </div>
          <div class="card-body">
            <div class="site-list">
              <div
                  v-for="(site, idx) in siteStatus"
                  :key="idx"
                  class="site-item"
              >
                <div class="site-header">
                  <div class="site-name-group">
                    <i class="mdi mdi-office-building site-icon"></i>
                    <span class="site-name">{{ site.name }}</span>
                  </div>
                  <span
                      v-if="site.issueCount > 0"
                      class="issue-badge"
                  >
                    <i class="mdi mdi-alert-circle"></i>
                    이슈 {{ site.issueCount }}건
                  </span>
                </div>
                <div class="site-info-row">
                  <span class="site-meta">
                    <i class="mdi mdi-calendar-end"></i>
                    계약 만료: {{ site.contractEnd }}
                  </span>
                  <span class="site-progress-text">{{ site.progress }}%</span>
                </div>
                <div class="progress-bar-wrapper">
                  <div class="progress-bar-bg">
                    <div
                        class="progress-bar-fill"
                        :style="{
                        width: site.progress + '%',
                        background: getProgressColor(site.progress)
                      }"
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 대청소 일정 -->
        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <i class="mdi mdi-broom card-icon"></i>
              <h3>이번 달 대청소 일정</h3>
            </div>
            <span class="sub-badge">
              완료 {{ cleaningStats.completed }} / 총 {{ cleaningStats.total }}건
            </span>
          </div>
          <div class="card-body">
            <div class="cleaning-list">
              <div
                  v-for="item in cleaningSchedules"
                  :key="item.id"
                  class="cleaning-item"
              >
                <div class="date-box">
                  <span class="day">{{ item.date.split('-')[2] }}</span>
                  <span class="month">{{ item.date.split('-')[1] }}월</span>
                </div>
                <div class="info-box">
                  <div class="cleaning-site">{{ item.site }}</div>
                  <div class="cleaning-type">{{ item.type }}</div>
                  <div class="cleaning-worker">
                    <i class="mdi mdi-account-hard-hat"></i>
                    {{ item.worker }}
                  </div>
                </div>
                <div class="status-box">
                  <span :class="['status-badge', getCleaningStatusClass(item.status)]">
                    {{ item.status }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Material Design Icons */
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 기본 설정 === */
.dashboard-page {
  padding: 0;
}

/* === 헤더 섹션 === */
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 32px;
  padding: 28px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 16px;
  color: white;
  box-shadow: 0 10px 30px rgba(102, 126, 234, 0.3);
}

.welcome-box {
  flex: 1;
}

.welcome-title {
  font-size: 28px;
  font-weight: 700;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.welcome-title i {
  font-size: 32px;
  animation: wave 1s ease-in-out infinite;
}

@keyframes wave {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(20deg); }
  75% { transform: rotate(-20deg); }
}

.welcome-subtitle {
  font-size: 15px;
  opacity: 0.95;
  margin: 0;
}

.quick-actions {
  display: flex;
  gap: 12px;
}

.quick-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  color: white;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s;
  backdrop-filter: blur(10px);
}

.quick-btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.quick-btn i {
  font-size: 20px;
}

/* === KPI 카드 === */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
  margin-bottom: 32px;
}

.kpi-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}

.kpi-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--card-color);
}

.kpi-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
}

.kpi-icon-wrapper {
  width: 60px;
  height: 60px;
  border-radius: 14px;
  background: var(--card-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.kpi-icon-wrapper i {
  font-size: 28px;
  color: var(--card-color);
}

.kpi-content {
  flex: 1;
  min-width: 0;
}

.kpi-title {
  display: block;
  font-size: 13px;
  color: #64748b;
  margin-bottom: 8px;
  font-weight: 500;
}

.kpi-value-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 8px;
}

.kpi-value {
  font-size: 32px;
  font-weight: 700;
  color: #1e293b;
  line-height: 1;
}

.kpi-unit {
  font-size: 16px;
  color: #64748b;
  font-weight: 500;
}

.kpi-change-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.kpi-change {
  font-size: 14px;
  font-weight: 600;
  color: var(--card-color);
}

.kpi-change-text {
  font-size: 12px;
  color: #94a3b8;
}

/* === 메인 그리드 === */
.main-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  gap: 24px;
}

.grid-column {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* === 카드 === */
.card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  transition: all 0.3s;
}

.card:hover {
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid #f1f5f9;
}

.card-title-group {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-icon {
  font-size: 24px;
  color: #667eea;
}

.card-header h3 {
  font-size: 18px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.count-badge {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
}

.sub-badge {
  background: #f1f5f9;
  color: #64748b;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 500;
}

.btn-text {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #667eea;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: all 0.2s;
}

.btn-text:hover {
  gap: 8px;
}

.btn-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #f8fafc;
  border: none;
  color: #64748b;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
}

.btn-icon:hover {
  background: #e2e8f0;
  color: #334155;
}

.btn-icon i {
  font-size: 18px;
}

.card-body {
  padding: 24px;
}

/* === 승인 대기 목록 === */
.approval-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.approval-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  transition: all 0.2s;
}

.approval-item:hover {
  background: #f1f5f9;
  transform: translateX(4px);
}

.approval-left {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
}

.type-tag {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.type-tag-purple {
  background: #ede9fe;
  color: #7c3aed;
}

.type-tag-blue {
  background: #dbeafe;
  color: #2563eb;
}

.type-tag-green {
  background: #d1fae5;
  color: #059669;
}

.approval-info {
  flex: 1;
  min-width: 0;
}

.approval-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
  word-break: keep-all;
}

.approval-sub {
  font-size: 13px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 4px;
}

.approval-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}

.approval-date {
  font-size: 12px;
  color: #94a3b8;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.status-pending {
  background: #fef3c7;
  color: #d97706;
}

.status-complete {
  background: #d1fae5;
  color: #059669;
}

.status-upcoming {
  background: #dbeafe;
  color: #2563eb;
}

/* === 공지사항 === */
.notice-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.notice-item {
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  transition: all 0.2s;
  cursor: pointer;
}

.notice-item:hover {
  background: #f1f5f9;
  transform: translateX(4px);
}

.notice-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.badge {
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}

.badge-blue {
  background: #dbeafe;
  color: #2563eb;
}

.badge-red {
  background: #fee2e2;
  color: #dc2626;
}

.badge-gray {
  background: #f1f5f9;
  color: #64748b;
}

.badge-green {
  background: #d1fae5;
  color: #059669;
}

.new-badge {
  background: #ef4444;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 700;
}

.notice-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 10px;
  line-height: 1.5;
}

.notice-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
  color: #94a3b8;
}

.notice-author,
.notice-date {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* === 최근 활동 === */
.activity-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.activity-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  flex-shrink: 0;
}

.activity-icon i {
  font-size: 20px;
}

.activity-content {
  flex: 1;
}

.activity-action {
  font-size: 14px;
  font-weight: 500;
  color: #1e293b;
  margin-bottom: 4px;
}

.activity-time {
  font-size: 12px;
  color: #94a3b8;
}

/* === 현장 현황 === */
.site-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.site-item {
  padding: 20px;
  background: #f8fafc;
  border-radius: 12px;
  transition: all 0.3s;
}

.site-item:hover {
  background: #f1f5f9;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.site-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.site-name-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.site-icon {
  font-size: 20px;
  color: #667eea;
}

.site-name {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
}

.issue-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  background: #fee2e2;
  color: #dc2626;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
}

.site-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.site-meta {
  font-size: 13px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 4px;
}

.site-progress-text {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.progress-bar-wrapper {
  margin-top: 8px;
}

.progress-bar-bg {
  height: 8px;
  background: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.5s ease;
}

/* === 대청소 일정 === */
.cleaning-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cleaning-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #f8fafc;
  border-radius: 12px;
  transition: all 0.2s;
}

.cleaning-item:hover {
  background: #f1f5f9;
  transform: translateX(4px);
}

.date-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  color: white;
  flex-shrink: 0;
}

.date-box .day {
  font-size: 24px;
  font-weight: 700;
  line-height: 1;
}

.date-box .month {
  font-size: 11px;
  margin-top: 4px;
  opacity: 0.9;
}

.info-box {
  flex: 1;
  min-width: 0;
}

.cleaning-site {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
}

.cleaning-type {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 6px;
}

.cleaning-worker {
  font-size: 12px;
  color: #94a3b8;
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-box {
  flex-shrink: 0;
}

/* === 반응형 === */
@media (max-width: 1200px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .header-section {
    flex-direction: column;
    gap: 16px;
    align-items: flex-start;
  }

  .quick-actions {
    width: 100%;
  }

  .quick-btn {
    flex: 1;
    justify-content: center;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .main-grid {
    grid-template-columns: 1fr;
  }

  .approval-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .approval-right {
    flex-direction: row;
    width: 100%;
    justify-content: space-between;
  }
}
</style>
