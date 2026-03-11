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
      role: data.isMaster == 'Y' ? 'Super Admin (최고 관리자)' : 'General Admin (중간 관리자)', // 권한 등급
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
  <div class="my-profile-page">

    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-account-edit-outline"></i>
          내 정보 관리
        </h1>
        <p class="page-subtitle">계정 정보 확인 및 보안 설정을 관리합니다.</p>
      </div>
    </div>

    <div class="profile-grid">

      <div class="left-col">
        <div class="card profile-card">
          <div class="card-header">
            <h3><i class="mdi mdi-card-account-details-outline text-blue"></i> 기본 정보</h3>
          </div>

          <div class="profile-header">
            <div class="avatar-circle">
              {{ adminInfo.name.charAt(0) }}
            </div>
            <div class="profile-summary">
              <span class="p-name">{{ adminInfo.name }}</span>
              <span class="p-role">{{ adminInfo.role }}</span>
              <span class="p-last-login">
                <i class="mdi mdi-clock-time-four-outline"></i>
                최근 접속: {{ adminInfo.lastLogin }}
              </span>
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

            <div class="btn-wrap">
              <button type="submit" class="btn btn-save">
                <i class="mdi mdi-content-save-outline"></i> 정보 수정 저장
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="right-col">
        <div class="card security-card">
          <div class="card-header">
            <h3><i class="mdi mdi-lock-outline text-red"></i> 보안 설정 (비밀번호 변경)</h3>
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
              <button type="submit" class="btn btn-secondary">
                <i class="mdi mdi-key-outline"></i> 비밀번호 변경
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 전역 설정 === */
.my-profile-page {
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* === 페이지 헤더 === */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}

.header-left { flex: 1; }

.page-title {
  font-size: 24px; font-weight: 700; color: #1e293b;
  margin: 0 0 6px 0; display: flex; align-items: center; gap: 10px;
  letter-spacing: -0.5px;
}
.page-title i { font-size: 26px; color: #4f46e5; }
.page-subtitle { font-size: 14px; color: #64748b; margin: 0; }

/* === 그리드 레이아웃 === */
.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  align-items: start;
}

.left-col, .right-col {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* === 카드 공통 (플랫 스타일) === */
.card {
  background: white; border-radius: 12px; padding: 24px;
  border: 1px solid #e2e8f0; box-shadow: 0 1px 3px rgba(0,0,0,0.02);
}

.card-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #f1f5f9;
}
.card-header h3 { font-size: 16px; font-weight: 700; color: #1e293b; margin: 0; display: flex; align-items: center; gap: 8px;}
.card-header h3 i { font-size: 20px; }

.text-blue { color: #4f46e5; }
.text-red { color: #ef4444; }

/* === 프로필 헤더 (아바타 등) === */
.profile-header {
  display: flex; align-items: center; gap: 20px;
  margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px dashed #e2e8f0;
}
.avatar-circle {
  width: 64px; height: 64px; background-color: #eef2ff; color: #4f46e5;
  border-radius: 12px; display: flex; align-items: center; justify-content: center;
  font-size: 24px; font-weight: 700; flex-shrink: 0; border: 1px solid #c7d2fe;
}
.profile-summary { display: flex; flex-direction: column; gap: 6px; }
.p-name { font-size: 18px; font-weight: 700; color: #1e293b; letter-spacing: -0.5px;}
.p-role {
  font-size: 12px; color: #4f46e5; font-weight: 600;
  background-color: #e0e7ff; padding: 3px 10px; border-radius: 6px;
  display: inline-block; width: fit-content;
}
.p-last-login { font-size: 12px; color: #64748b; display: flex; align-items: center; gap: 4px; }
.p-last-login i { font-size: 14px; }

/* === 폼 스타일 === */
.form-group { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
.form-group label { font-size: 13px; font-weight: 600; color: #475569; }

.input-text {
  padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 8px;
  font-size: 13px; color: #334155; background: white; transition: all 0.2s; box-sizing: border-box;
}
.input-text:hover:not(.disabled) { border-color: #cbd5e1; background: #f8fafc; }
.input-text:focus:not(.disabled) {
  outline: none; border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.1); background: white;
}
.input-text::placeholder { color: #94a3b8; }
.input-text.disabled { background-color: #f1f5f9; color: #94a3b8; cursor: not-allowed; border-color: transparent;}

/* 버튼 래퍼 및 버튼 공통 (플랫 적용) */
.btn-wrap { margin-top: 24px; display: flex; justify-content: flex-end; }
.btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 20px; border-radius: 8px; font-weight: 600; border: none;
  cursor: pointer; font-size: 13px; transition: all 0.2s; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.btn i { font-size: 16px; }

.btn-save { background-color: #4f46e5; color: white; }
.btn-save:hover { background-color: #4338ca; transform: translateY(-1px); }

.btn-secondary { background-color: #64748b; color: white; }
.btn-secondary:hover { background-color: #475569; transform: translateY(-1px); }

/* === 반응형 미디어 쿼리 === */
@media (max-width: 1024px) {
  .profile-grid { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  .page-header { flex-direction: column; gap: 16px; align-items: flex-start; }

  .profile-header { flex-direction: column; align-items: flex-start; gap: 16px; }
  .btn-wrap { justify-content: stretch; }
  .btn { width: 100%; }
}
</style>
