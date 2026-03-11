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

// === [디자인 변경] 기존의 고유 포인트 색상들을 플랫하게 복원 ===
const stats = ref([
  {
    id:'site',
    title: '총 관리 현장',
    value: 12,
    unit: '개소',
    icon: 'mdi-office-building',
    change: '+1',
    changeText: '지난달 대비',
    color: '#667eea', // 기존 보라색 복원 (그라디언트 없이 사용)
    bgColor: '#eef2ff'  // 부드러운 배경색
  },
  {
    id:'member',
    title: '총 근무 인원',
    value: 145,
    unit: '명',
    icon: 'mdi-account-group',
    change: '+5',
    changeText: '이번달',
    color: '#10b981', // 기존 초록색 복원
    bgColor: '#ecfdf5'
  },
  {
    id:'payroll',
    title: '이번달 급여 총액',
    value: '3.5억',
    unit: '원',
    icon: 'mdi-cash-multiple',
    change: '+2%',
    changeText: '전월 대비',
    color: '#f59e0b', // 기존 노란색 복원
    bgColor: '#fffbeb'
  },
  {
    id:'request',
    title: '승인 대기',
    value: 0, // computed나 함수에서 업데이트
    unit: '건',
    icon: 'mdi-clock-alert-outline',
    change: '',
    changeText: '',
    color: '#ef4444', // 기존 빨간색 복원
    bgColor: '#fef2f2'
  },
]);

const rawOrders = ref([]);
const rawOffs = ref([]);

// 2. 공지사항 (최신순)
const notices = ref([]);

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

// 최근 활동 로그 (주석 해제 대비 디자인 적용)
const recentActivities = ref([
  { id: 1, type: '급여', action: '4월 급여 계산 완료', time: '2시간 전', icon: 'mdi-calculator', color: '#f59e0b' },
  { id: 2, type: '직원', action: '신규 직원 3명 등록', time: '5시간 전', icon: 'mdi-account-plus', color: '#10b981' },
  { id: 3, type: '현장', action: '강남 A현장 계약 갱신', time: '1일 전', icon: 'mdi-file-document', color: '#667eea' },
  { id: 4, type: '공지', action: '안전교육 공지 발송', time: '2일 전', icon: 'mdi-bullhorn', color: '#ef4444' },
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
  if (progress >= 80) return '#ef4444'; // 위험 (레드)
  if (progress >= 50) return '#f59e0b'; // 진행 (옐로우)
  return '#10b981'; // 초기 (그린)
};

// [추가] 승인 상태 아이콘 유틸
const getStatusIconInfo = (status) => {
  if (status == 0) return { icon: 'mdi-clock-outline', class: 'status-pending-icon' };
  if (status == 1) return { icon: 'mdi-check-circle-outline', class: 'status-complete-icon' };
  return { icon: 'mdi-close-circle-outline', class: 'status-delayed-icon' }; // 반려
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
  try {
    const res = await axios.get(`/api/v1/site/list/${cIdx}`);
    const result = res.data.data;
    if (stats.value[0]) stats.value[0].value = result.length;
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
  console.log('급여 총액 API 호출 위치')
}

const fetchNotices = () => {
  axios.get('/api/v1/notice/list')
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
    <div class="header-section">
      <div class="welcome-box">
        <h1 class="welcome-title">
          <i class="mdi mdi-hand-wave wave-icon"></i>
          안녕하세요, {{ authStore.user?.managerNm }}님!
        </h1>
        <p class="welcome-subtitle">오늘도 좋은 하루 보내세요. {{ currentTime }}</p>
      </div>
    </div>

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

    <div class="main-grid">
      <div class="grid-column">
        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <i class="mdi mdi-file-sign card-icon"></i>
              <h3>승인 대기 업무</h3>
              <span class="count-badge">{{ pendingApprovals.length }}</span>
            </div>
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
                  <span :class="['status-icon', getStatusIconInfo(item.status).class]">
                    <i :class="['mdi', getStatusIconInfo(item.status).icon]"></i>
                    {{ item.status == 0 ? '승인대기': item.status == 1 ? '승인' : '반려' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title-group">
              <i class="mdi mdi-bullhorn card-iconBull"></i>
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
                    <i class="mdi mdi-account-circle-outline"></i>
                    {{ notice.author }}
                  </span>
                  <span class="notice-date">
                    <i class="mdi mdi-calendar-blank-outline"></i>
                    {{ notice.date }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <div class="grid-column">
        <div class="card site-card">
          <div class="card-header">
            <div class="card-title-group">
              <i class="mdi mdi-map-marker-radius card-iconGreen"></i>
              <h3>주요 현장 현황</h3>
            </div>
            <NuxtLink to="/site/list" class="btn-icon-cog">
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
                    <i class="mdi mdi-calendar-clock"></i>
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

        <div class="card cleaning-card">
          <div class="card-header">
            <div class="card-title-group">
              <i class="mdi mdi-broom card-iconBroom"></i>
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
                <div class="date-box-flat">
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

/* === 전역 설정 === */
.dashboard-page {
  padding: 0;
  /* 눈의 피로를 줄이기 위한 차분한 베이스 배경색 (옅은회색) */
  background-color: #f1f5f9;
  min-height: 100vh;
}

/* === 헤더 섹션 (그라디언트 제거, 플랫 보라색) === */
.header-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  padding: 30px;
  /* 그라디언트 제거 -> 원본 보라색 톤 단색 적용 */
  background-color: #6d28d9;
  border-radius: 12px;
  color: white;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.welcome-box { flex: 1; }
.welcome-title { font-size: 26px; font-weight: 700; margin: 0 0 10px 0; display: flex; align-items: center; gap: 12px; }
.wave-icon { font-size: 30px; color: #fbbf24; animation: wave-animation 2.5s infinite; transform-origin: 70% 70%; }
.welcome-subtitle { font-size: 15px; opacity: 0.9; margin: 0; }

@keyframes wave-animation {
  0% { transform: rotate( 0.0deg) }
  10% { transform: rotate(14.0deg) }
  20% { transform: rotate(-8.0deg) }
  30% { transform: rotate(14.0deg) }
  40% { transform: rotate(-4.0deg) }
  50% { transform: rotate(10.0deg) }
  60% { transform: rotate( 0.0deg) }
  100% { transform: rotate( 0.0deg) }
}

/* === KPI 카드 (포인트 컬러 활용, 그라디언트 무) === */
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 30px;
}

.kpi-card {
  background: white; /* 카드는 화이트로 깔끔하게 */
  border-radius: 12px;
  padding: 24px;
  display: flex;
  align-items: center;
  gap: 20px;
  /* 옅은 보더로 카드 구분 */
  border: 1px solid #e2e8f0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  position: relative;
  overflow: hidden;
}

/* 왼쪽에 포인트 컬러 바 */
.kpi-card::before {
  content: '';
  position: absolute;
  top: 0; left: 0; width: 4px; height: 100%;
  background-color: var(--card-color);
}

.kpi-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
}

.kpi-icon-wrapper {
  width: 56px; height: 56px;
  border-radius: 12px;
  /* 플랫한 연한 배경색 */
  background-color: var(--card-bg);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}

.kpi-icon-wrapper i { font-size: 26px; color: var(--card-color); }
.kpi-content { flex: 1; min-width: 0; }
.kpi-title { display: block; font-size: 13px; color: #64748b; margin-bottom: 6px; font-weight: 500; }
.kpi-value-row { display: flex; align-items: baseline; gap: 4px; margin-bottom: 4px; }
.kpi-value { font-size: 30px; font-weight: 700; color: #1e293b; line-height: 1; }
.kpi-unit { font-size: 14px; color: #64748b; }
.kpi-change-row { display: flex; align-items: center; gap: 5px; font-size: 12px; }
.kpi-change { font-weight: 600; color: var(--card-color); }
.kpi-change-text { color: #94a3b8; }

/* === 메인 그리드 및 카드 === */
.main-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
  gap: 25px;
  padding-bottom: 30px;
}
.grid-column { display: flex; flex-direction: column; gap: 25px; }

.card {
  background: white;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}

.card-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 18px 24px;
  border-bottom: 1px solid #f1f5f9;
}
.card-title-group { display: flex; align-items: center; gap: 10px; }

/* 카드별 아이콘 색상 고정 (원본 톤 복원) */
.card-icon { font-size: 22px; color: #667eea; } /* 보라 */
.card-iconBull { font-size: 22px; color: #ef4444; } /* 레드 */
.card-iconGreen { font-size: 22px; color: #10b981; } /* 그린 */
.card-iconBroom { font-size: 22px; color: #f59e0b; } /* 옐로우 */
.gray-icon { font-size: 22px; color: #94a3b8; }

.card-header h3 { font-size: 16px; font-weight: 600; color: #1e293b; margin: 0; }

/* 배지 디자인 (그라디언트 제거, 단색 플랫 적용) */
.count-badge {
  background-color: #ede9fe; /* 연한보라 */
  color: #6d28d9; /* 진한보라 */
  padding: 3px 10px; border-radius: 12px;
  font-size: 12px; font-weight: 600;
}

.sub-badge {
  background-color: #fffbeb; /* 연한노랑 */
  color: #b45309; /* 진한노랑 */
  padding: 4px 10px; border-radius: 8px;
  font-size: 12px; font-weight: 500;
}

.btn-text {
  display: flex; align-items: center; gap: 4px;
  color: #4f46e5; font-size: 13px; font-weight: 500;
  text-decoration: none;
}
.btn-icon-cog { color: #94a3b8; border: none; background: none; cursor: pointer; font-size: 18px; }
.btn-icon-cog:hover { color: #64748b; }

/*.card-body { padding: 24px; }*/

/* === 승인 대기 목록 디자인 === */
.approval-list { display: flex; flex-direction: column; gap: 12px; }

.approval-item {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px;
  border-bottom: 1px solid #f1f5f9;
  /*
  background-color: white;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
   */
}
/*.approval-item:hover { background-color: #f8fafc; border-color: #e2e8f0; }*/

.approval-left { display: flex; align-items: center; gap: 14px; flex: 1; }

/* 플랫 태그 디자인 */
.type-tag {
  padding: 4px 10px; border-radius: 6px;
  font-size: 11px; font-weight: 600; white-space: nowrap;
}
.type-tag-purple { background-color: #f3e8ff; color: #9333ea; }
.type-tag-blue { background-color: #e0f2fe; color: #0284c7; }
.type-tag-green { background-color: #d1fae5; color: #059669; }

.approval-info { flex: 1; min-width: 0; }
.approval-title { font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 3px; }
.approval-sub { font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 4px; }

.approval-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
.approval-date { font-size: 11px; color: #94a3b8; }

/* 아이콘 중심 상태 표시 */
.status-icon { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 500; }
.status-pending-icon { color: #f59e0b; } /* 대기 - 옐로우 */
.status-complete-icon { color: #10b981; } /* 승인 - 그린 */
.status-delayed-icon { color: #ef4444; } /* 반려 - 레드 */

/* === 공지사항 디자인 === */
.notice-list { display: flex; flex-direction: column; gap: 12px; }
.notice-item {
  padding: 16px;
  border-bottom: 1px solid #f1f5f9;
  /*
  background-color: white;
  border: 1px solid #f1f5f9;
  border-radius: 10px; cursor: pointer;

   */
}
/*.notice-item:hover { background-color: #f8fafc; border-color: #e2e8f0; }*/

.notice-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
/* 플랫 배지 */
.badge { padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
.badge-blue { background-color: #dbeafe; color: #1e40af; }
.badge-red { background-color: #fee2e2; color: #b91c1c; }
.badge-gray { background-color: #f1f5f9; color: #475569; }
.badge-green { background-color: #d1fae5; color: #065f46; }

.new-badge { color: #ef4444; font-size: 11px; font-weight: 700; }
.notice-title { font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 8px; }
.notice-footer { display: flex; align-items: center; gap: 12px; font-size: 12px; color: #94a3b8; }
.notice-author, .notice-date { display: flex; align-items: center; gap: 4px; }

/* === 최근 활동 (주석 해제 대비) === */
.activity-list { display: flex; flex-direction: column; gap: 16px; }
.activity-item { display: flex; align-items: center; gap: 14px; }
.activity-icon-w {
  width: 36px; height: 36px; border-radius: 10px;
  background-color: #f1f5f9;
  display: flex; align-items: center; justify-content: center;
  font-size: 18px; flex-shrink: 0;
}
.activity-action { font-size: 13px; font-weight: 500; color: #334155; margin-bottom: 2px; }
.activity-time { font-size: 11px; color: #94a3b8; }

/* === 주요 현장 현황 디자인 === */
.site-list { display: flex; flex-direction: column; gap: 18px; }
.site-item {
  padding: 16px;
  border-bottom: 1px solid #f1f5f9;
  /*
  background-color: white;
  border: 1px solid #f1f5f9;
  border-radius: 10px;

   */
}

.site-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.site-name-group { display: flex; align-items: center; gap: 8px; }
.site-icon { font-size: 18px; color: #667eea; }
.site-name { font-size: 15px; font-weight: 600; color: #1e293b; }

.issue-badge {
  display: flex; align-items: center; gap: 3px;
  background-color: #fee2e2; color: #b91c1c;
  padding: 3px 8px; border-radius: 6px;
  font-size: 11px; font-weight: 600;
}

.site-info-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.site-meta { font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 4px; }
.site-progress-text { font-size: 12px; font-weight: 600; color: #1e293b; }

.progress-bar-bg { height: 6px; background-color: #e2e8f0; border-radius: 3px; overflow: hidden; }
.progress-bar-fill { height: 100%; border-radius: 3px; transition: width 0.4s ease; }

/* === 대청소 일정 디자인 === */
.cleaning-list { display: flex; flex-direction: column; gap: 12px; }
.cleaning-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  border-bottom: 1px solid #f1f5f9;
  /*
  background-color: white;
  border: 1px solid #f1f5f9;
  border-radius: 10px;

   */
}

/* 그라디언트 제거 -> 원본 보라색 플랫 배경 */
.date-box-flat {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 54px; height: 54px;
  background-color: #6d28d9; /* 진한보라 단색 */
  border-radius: 10px; color: white; flex-shrink: 0;
}
.date-box-flat .day { font-size: 22px; font-weight: 700; line-height: 1; }
.date-box-flat .month { font-size: 11px; margin-top: 3px; opacity: 0.9; }

.info-box { flex: 1; min-width: 0; }
.cleaning-site { font-size: 14px; font-weight: 600; color: #1e293b; margin-bottom: 3px; }
.cleaning-type { font-size: 13px; color: #64748b; margin-bottom: 5px; }
.cleaning-worker { font-size: 11px; color: #94a3b8; display: flex; align-items: center; gap: 4px; }

/* 상태 배지 (플랫 톤 고정) */
.status-badge { padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600; white-space: nowrap; }
.status-complete { background-color: #d1fae5; color: #065f46; } /* 완료 - 그린 */
.status-upcoming { background-color: #e0f2fe; color: #0369a1; } /* 예정 - 블루 */
.status-delayed { background-color: #fee2e2; color: #991b1b; } /* 지연 - 레드 */

/* === 반응형 미디어 쿼리 === */
@media (max-width: 1024px) {
  .main-grid { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  .header-section { flex-direction: column; gap: 15px; align-items: flex-start; padding: 20px; }
  .kpi-grid { grid-template-columns: 1fr; }
  .approval-item { flex-direction: column; align-items: flex-start; gap: 12px; }
  .approval-right { flex-direction: row; width: 100%; justify-content: space-between; }
}
</style>
