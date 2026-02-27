<script setup>
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";

const authStore = useAuthStore();
// 1. 관리자 정보 상태
const adminInfo = ref({
  name: '김관리',
  id: 'admin',
  email: 'admin@company.com',
  phone: '010-1234-5678',
  department: '경영지원팀',
  position: '팀장',
  role: 'Super Admin (최고 관리자)', // 권한 등급
  joinedDate: '2020-01-01',
  lastLogin: '2026-02-03 09:30:00 (192.168.0.1)',
});

// 2. 비밀번호 변경 폼 상태
const passwordForm = ref({
  current: '',
  new: '',
  confirm: ''
});

// 3. 활동 로그 (Audit Log) - 관리자는 보안상 중요
const activityLogs = ref([
  { id: 1, action: '로그인 성공', ip: '192.168.0.1', date: '2026-02-03 09:30:00' },
  { id: 2, action: '직원 정보 수정 (홍길동)', ip: '192.168.0.1', date: '2026-02-03 10:15:22' },
  { id: 3, action: '급여 대장 마감 처리', ip: '192.168.0.1', date: '2026-02-02 18:00:05' },
  { id: 4, action: '공지사항 등록', ip: '192.168.0.1', date: '2026-02-01 14:20:11' },
]);

// 4. 이벤트 핸들러
const updateProfile = () => {
  if(!confirm('회원 정보를 수정하시겠습니까?')) return;
  // API 호출 로직
  alert('정보가 수정되었습니다.');
};

const updatePassword = () => {
  if (!passwordForm.value.current || !passwordForm.value.new || !passwordForm.value.confirm) {
    return alert('모든 항목을 입력해주세요.');
  }
  if (passwordForm.value.new !== passwordForm.value.confirm) {
    return alert('새 비밀번호가 일치하지 않습니다.');
  }
  // API 호출 로직
  alert('비밀번호가 변경되었습니다. 다시 로그인해주세요.');
  // 초기화
  passwordForm.value = { current: '', new: '', confirm: '' };
};
const getMyInfo = async () => {
  if(authStore) {
    const data = authStore.user;
    adminInfo.value = {
      name: data.managerNm,
      id: data.managerId,
      email: data.email,
      phone: data.phone,
      // department: '경영지원팀',
      // position: '팀장',
      role: data.grade == 1 ? 'Super Admin (최고 관리자)' : 'General Admin (중간 관리자)', // 권한 등급
      joinedDate: data.regDt,
      lastLogin: '2026-02-03 09:30:00 (192.168.0.1)',
    };
  }

  /*
  const id = authStore.user?.managerId;

  try {
    axios.get(`/api/v1/member/admin/data/${id}`)
        .then((res) => {
          console.log(res.data.data)

        })
  }catch(err) {
    console.log(err);
  }

   */
}
onMounted(() => {
  getMyInfo()
})
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">👤 내 정보 관리</h2>
      <p class="page-subtitle">계정 정보 확인 및 보안 설정을 관리합니다.</p>
    </div>

    <div class="profile-grid">

      <div class="left-col">
        <div class="card profile-card">
          <div class="card-header">
            <h3>기본 정보</h3>
          </div>

          <div class="profile-header">
            <div class="avatar-circle">
              {{ adminInfo.name.charAt(0) }}
            </div>
            <div class="profile-summary">
              <span class="p-name">{{ adminInfo.name }}</span>
              <span class="p-role">{{ adminInfo.role }}</span>
              <span class="p-last-login">최근 접속: {{ adminInfo.lastLogin }}</span>
            </div>
          </div>

          <form @submit.prevent="updateProfile" class="info-form">
            <div class="form-group">
              <label>아이디</label>
              <input type="text" v-model="adminInfo.id" disabled class="input-text disabled">
            </div>
            <div class="form-group">
              <label>이름</label>
              <input type="text" v-model="adminInfo.name" class="input-text">
            </div>
            <div class="form-group">
              <label>이메일</label>
              <input type="email" v-model="adminInfo.email" class="input-text">
            </div>
            <div class="form-group">
              <label>연락처</label>
              <input type="tel" v-model="adminInfo.phone" class="input-text">
            </div>
            <!--div class="form-group-row">
              <div class="form-group half">
                <label>부서</label>
                <input type="text" v-model="adminInfo.department" disabled class="input-text disabled">
              </div>
              <div class="form-group half">
                <label>직책</label>
                <input type="text" v-model="adminInfo.position" disabled class="input-text disabled">
              </div>
            </div-->

            <div class="btn-wrap">
              <button type="submit" class="btn btn-primary">정보 수정 저장</button>
            </div>
          </form>
        </div>
      </div>

      <div class="right-col">

        <div class="card security-card">
          <div class="card-header">
            <h3>🔒 보안 설정 (비밀번호 변경)</h3>
          </div>
          <form @submit.prevent="updatePassword" class="security-form">
            <div class="form-group">
              <label>현재 비밀번호</label>
              <input type="password" v-model="passwordForm.current" placeholder="현재 비밀번호 입력" class="input-text">
            </div>
            <div class="form-group">
              <label>새 비밀번호</label>
              <input type="password" v-model="passwordForm.new" placeholder="영문/숫자/특수문자 포함 8자 이상" class="input-text">
            </div>
            <div class="form-group">
              <label>새 비밀번호 확인</label>
              <input type="password" v-model="passwordForm.confirm" placeholder="새 비밀번호 재입력" class="input-text">
            </div>
            <div class="btn-wrap">
              <button type="submit" class="btn btn-secondary">비밀번호 변경</button>
            </div>
          </form>
        </div>

        <!--div class="card log-card">
          <div class="card-header">
            <h3>📜 최근 활동 이력</h3>
            <button class="btn-text">전체보기 &rarr;</button>
          </div>
          <ul class="log-list">
            <li v-for="log in activityLogs" :key="log.id" class="log-item">
              <div class="log-icon">🕒</div>
              <div class="log-content">
                <p class="log-action">{{ log.action }}</p>
                <p class="log-meta">IP: {{ log.ip }} | {{ log.date }}</p>
              </div>
            </li>
          </ul>
        </div-->

      </div>
    </div>
  </div>
</template>

<style scoped>
.page-header { margin-bottom: 25px; }
.page-title { font-size: 1.5rem; font-weight: 700; color: #1e293b; margin-bottom: 5px; }
.page-subtitle { color: #64748b; font-size: 0.95rem; }

/* === 그리드 레이아웃 === */
.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr; /* 1:1 비율 */
  gap: 24px;
  align-items: start;
}
@media (max-width: 900px) {
  .profile-grid { grid-template-columns: 1fr; }
}

.left-col, .right-col {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* === 카드 공통 === */
.card {
  background: white;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e2e8f0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}
.card-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid #f1f5f9;
}
.card-header h3 { font-size: 1.1rem; font-weight: 700; color: #334155; margin: 0; }

/* === 프로필 헤더 (아바타 등) === */
.profile-header {
  display: flex;
  align-items: center;
  gap: 20px;
  margin-bottom: 30px;
  padding-bottom: 20px;
  border-bottom: 1px dashed #e2e8f0;
}
.avatar-circle {
  width: 70px; height: 70px;
  background-color: #3b82f6;
  color: white;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.8rem; font-weight: 700;
}
.profile-summary { display: flex; flex-direction: column; gap: 4px; }
.p-name { font-size: 1.2rem; font-weight: 700; color: #1e293b; }
.p-role { font-size: 0.85rem; color: #3b82f6; font-weight: 600; background: #eff6ff; padding: 2px 8px; border-radius: 4px; display: inline-block; width: fit-content; }
.p-last-login { font-size: 0.8rem; color: #94a3b8; margin-top: 4px; }

/* === 폼 스타일 === */
.form-group { margin-bottom: 16px; display: flex; flex-direction: column; gap: 6px; }
.form-group label { font-size: 0.9rem; font-weight: 600; color: #475569; }
.input-text {
  padding: 10px 12px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  font-size: 0.95rem;
  transition: all 0.2s;
}
.input-text:focus { border-color: #3b82f6; outline: none; }
.input-text.disabled { background-color: #f1f5f9; color: #64748b; cursor: not-allowed; }

.form-group-row { display: flex; gap: 15px; }
.half { flex: 1; }

.btn-wrap { margin-top: 20px; text-align: right; }
.btn { padding: 10px 16px; border-radius: 6px; font-weight: 600; border: none; cursor: pointer; font-size: 0.9rem; transition: background 0.2s; }
.btn-primary { background: #3b82f6; color: white; }
.btn-primary:hover { background: #2563eb; }
.btn-secondary { background: #64748b; color: white; }
.btn-secondary:hover { background: #475569; }
.btn-text { background: none; border: none; color: #3b82f6; font-size: 0.85rem; cursor: pointer; font-weight: 600; }

/* === 활동 로그 리스트 === */
.log-list { list-style: none; padding: 0; margin: 0; }
.log-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}
.log-item:last-child { border-bottom: none; }
.log-icon { font-size: 1.1rem; margin-top: 2px; }
.log-content { display: flex; flex-direction: column; gap: 2px; }
.log-action { font-size: 0.9rem; font-weight: 600; color: #334155; }
.log-meta { font-size: 0.8rem; color: #94a3b8; }
</style>
