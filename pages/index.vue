<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';

const cIdx = 1;
// 1. 주요 현황 데이터 (KPI)
const stats = ref([
  { title: '총 관리 현장', value: 12, unit: '개소', icon: '🏢', change: '+1', type: 'increase' },
  { title: '총 근무 인원', value: 145, unit: '명', icon: '🧑‍💼', change: '0', type: 'neutral' },
  // { title: '결재 대기', value: 5, unit: '건', icon: '⚡', change: '신규', type: 'alert' }, // 피복/용품 신청 등
  { title: '이번달 급여 총액', value: '3.5억', unit: '원', icon: '💰', change: '+2%', type: 'increase' },
]);

// 2. 공지사항 (최신순)
const notices = ref([
  { id: 1, category: '인사', title: '5월 근무 스케줄 확정 안내', date: '2025-05-02', isNew: true },
  { id: 2, category: '시스템', title: 'ERP 서버 정기 점검 안내', date: '2025-05-01', isNew: false },
  { id: 3, category: '공지', title: '하절기 복장 착용 규정', date: '2025-04-28', isNew: false },
]);

// 3. 결재/승인 대기 현황 (피복, 용품 등)
const pendingApprovals = ref([
  { id: 101, type: '피복신청', site: 'LH 위례 6단지', applicant: '김철수', date: '2025-05-03', status: '승인대기' },
  { id: 102, type: '용품신청', site: '강서 대명 강동', applicant: '이영희', date: '2025-05-03', status: '승인대기' },
  { id: 103, type: '연차신청', site: 'LH 율곡 8단지', applicant: '박민준', date: '2025-05-02', status: '검토중' },
]);

// 4. 현장별 계약/이슈 현황
const siteStatus = ref([
  { name: 'LH 위례 6단지', issueCount: 0, contractEnd: '2025-12-31', progress: 80 },
  { name: '강서 대명 강동', issueCount: 2, contractEnd: '2025-06-30', progress: 40 }, // 이슈 발생
  { name: '판교 테크노밸리', issueCount: 0, contractEnd: '2026-02-28', progress: 95 },
]);

//대청소 관련
const cleaningStats = ref({
  total: 5,      // 이번 달 예정된 총 대청소
  completed: 2,  // 완료됨
  upcoming: 3    // 예정됨
});

const cleaningSchedules = ref([
  { id: 1, site: 'LH 위례 6단지', type: '계단 대청소', date: '2025-05-10', status: '예정', worker: '김반장 외 3명' },
  { id: 2, site: '강서 대명 강동', type: '지하주차장 물청소', date: '2025-05-12', status: '예정', worker: '청소팀 A' },
  { id: 3, site: '판교 테크노밸리', type: '외벽 유리창 청소', date: '2025-05-01', status: '완료', worker: '외부 용역' },
]);

const getCleaningStatusClass = (status) => {
  if (status === '완료') return 'status-complete';
  if (status === '예정') return 'status-upcoming';
  return 'status-delayed';
};

const getBadgeClass = (category) => {
  if (category === '인사') return 'badge-green';
  if (category === '시스템') return 'badge-red';
  return 'badge-gray';
};

// 데이터 가공 로직 분리
const calculateProcessed = (data) => {
  // 데이터가 없거나 배열이 아닌 경우 빈 배열 반환
  if (!data || !Array.isArray(data)) return [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return data.map(site => {
    let progress = 0;
    let contractEnd = '';

    // 1. 계약 기간 데이터 유효성 검사
    if (site.contract && site.contract.includes('~')) {
      const [startStr, endStr] = site.contract.split(' ~ ');
      contractEnd = endStr;

      const startDate = new Date(startStr);
      const endDate = new Date(endStr);

      // 2. 진행률 계산
      const totalDuration = endDate.getTime() - startDate.getTime();
      const elapsedDuration = today.getTime() - startDate.getTime();

      if (totalDuration > 0) {
        progress = (elapsedDuration / totalDuration) * 100;
      }

      // 3. 범위 보정 (0 ~ 100)
      if (progress < 0) progress = 0;
      if (progress > 100) progress = 100;
    }

    // 4. 가공된 객체 반환
    return {
      ...site,
      progress: Math.round(progress),
      contractEnd: contractEnd,
      // issueCount: site.issueCount !== undefined ? site.issueCount : 0 //이슈체킹 부분인데 일단 보류
    };
  });
};

// API 호출 함수
const getSiteData = () => {
  axios.get(`/api/v1/site/list/${cIdx}`)
      .then(res => {
        // 분리한 함수 호출 (여기서 이제 정상적으로 배열이 반환됨)
        const processedData = calculateProcessed(res.data.data);

        // 상태 업데이트
        siteStatus.value = processedData;
      })
      .catch(err => {
        console.error('현장 로드 실패:', err);
      });
}

onMounted(() => {
  getSiteData();
})
</script>
<style scoped src="@/assets/css/dashboard.css"></style>
<template>
  <div class="dashboard-page">
    <div class="header-section">
      <h2>👋 안녕하세요, 관리자님!</h2>
      <p>오늘 처리해야 할 주요 업무를 확인하세요.</p>
    </div>

    <div class="kpi-grid">
      <div v-for="(stat, index) in stats" :key="index" class="kpi-card">
        <div class="kpi-icon">{{ stat.icon }}</div>
        <div class="kpi-content">
          <span class="kpi-title">{{ stat.title }}</span>
          <div class="kpi-value-row">
            <span class="kpi-value">{{ stat.value }}</span>
            <span class="kpi-unit">{{ stat.unit }}</span>
          </div>
          <span :class="['kpi-change', stat.type]">{{ stat.change }}</span>
        </div>
      </div>
    </div>

    <div class="main-grid">
      <div class="grid-column">

        <div class="card card-action">
          <div class="card-header">
            <h3>⚡ 승인 대기 업무 <span class="count-badge">{{ pendingApprovals.length }}</span></h3>
            <button class="btn-text">전체보기 &rarr;</button>
          </div>
          <table class="simple-table">
            <thead>
            <tr>
              <th>구분</th>
              <th>현장/신청자</th>
              <th>날짜</th>
              <th>상태</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="item in pendingApprovals" :key="item.id">
              <td><span class="type-tag">{{ item.type }}</span></td>
              <td>
                <div class="cell-primary">{{ item.site }}</div>
                <div class="cell-sub">{{ item.applicant }}</div>
              </td>
              <td class="cell-date">{{ item.date }}</td>
              <td><span class="status-dot"></span>{{ item.status }}</td>
            </tr>
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>📢 최신 공지사항</h3>
          </div>
          <ul class="notice-list">
            <li v-for="notice in notices" :key="notice.id">
              <div class="notice-top">
                <span :class="['badge', getBadgeClass(notice.category)]">{{ notice.category }}</span>
                <span v-if="notice.isNew" class="new-icon">N</span>
              </div>
              <div class="notice-title">{{ notice.title }}</div>
              <div class="notice-date">{{ notice.date }}</div>
            </li>
          </ul>
        </div>
      </div>

      <div class="grid-column">

        <div class="card">
          <div class="card-header">
            <h3>📍 주요 현장 현황</h3>
            <button class="btn-icon" @click="$router.push('/site')">⚙️</button>
          </div>
          <div class="site-list">
            <div v-for="(site, idx) in siteStatus" :key="idx" class="site-item">
              <div class="site-info">
                <span class="site-name">{{ site.name }}</span>
                <span v-if="site.issueCount > 0" class="issue-tag">이슈 {{ site.issueCount }}건</span>
              </div>
              <div class="site-meta">
                <span>계약 만료: {{ site.contractEnd }}</span>
              </div>
              <div class="progress-bar-bg">
                <div class="progress-bar-fill" :style="{ width: site.progress + '%' }"></div>
              </div>
            </div>
          </div>
        </div>

        <!--div class="card quick-links">
          <h3>🚀 바로가기</h3>
          <div class="link-grid">
            <button class="link-btn">👕 피복 신청</button>
            <button class="link-btn">📦 용품 주문</button>
            <button class="link-btn">💰 급여 대장</button>
            <button class="link-btn">📄 계약 등록</button>
          </div>
        </div-->
        <div class="card">
          <div class="card-header">
            <h3>🧹 이번 달 대청소 일정</h3>
            <span class="sub-text">완료 {{ cleaningStats.completed }} / 총 {{ cleaningStats.total }}건</span>
          </div>

          <div class="cleaning-list">
            <div v-for="item in cleaningSchedules" :key="item.id" class="cleaning-item">
              <div class="date-box">
                <span class="day">{{ item.date.split('-')[2] }}</span>
                <span class="month">{{ item.date.split('-')[1] }}월</span>
              </div>
              <div class="info-box">
                <div class="site-title">{{ item.site }}</div>
                <div class="task-desc">{{ item.type }}</div>
                <div class="worker-info">담당: {{ item.worker }}</div>
              </div>
              <div class="status-box">
                <span :class="['status-badge', getCleaningStatusClass(item.status)]">{{ item.status }}</span>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>
