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
const updateProfile = async () => {
  //if(!confirm('회원 정보를 수정하시겠습니까?')) return;
  if(!await window.customConfirm('회원 정보를 수정하시겠습니까?')) return;
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
            <h3><i class="mdi mdi-card-account-details-outline text-primary"></i> 기본 정보</h3>
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
            <h3><i class="mdi mdi-lock-outline text-danger"></i> 보안 설정 (비밀번호 변경)</h3>
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
/* =========================================
   그리드 레이아웃
========================================= */
.profile-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start;
}

.left-col, .right-col {
  display: flex; flex-direction: column; gap: 24px;
}

/* =========================================
   카드 공통 영역
========================================= */
.card {
  background: var(--bg-surface); border-radius: 12px; padding: 24px;
  border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);
}

.card-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color);
}
.card-header h3 { font-size: 16px; font-weight: 700; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 8px;}
.card-header h3 i { font-size: 20px; }

.text-primary { color: var(--primary); }
.text-danger { color: var(--danger); }

/* =========================================
   프로필 헤더 (아바타 영역)
========================================= */
.profile-header {
  display: flex; align-items: center; gap: 20px;
  margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px dashed var(--border-color);
}
.avatar-circle {
  width: 64px; height: 64px; background-color: var(--primary-soft); color: var(--primary);
  border-radius: 12px; display: flex; align-items: center; justify-content: center;
  font-size: 24px; font-weight: 700; flex-shrink: 0; border: 1px solid rgba(37, 99, 235, 0.2);
}
.profile-summary { display: flex; flex-direction: column; gap: 6px; }
.p-name { font-size: 18px; font-weight: 700; color: var(--text-main); letter-spacing: -0.5px;}
.p-role {
  font-size: 12px; color: var(--primary); font-weight: 600;
  background-color: var(--primary-soft); padding: 3px 10px; border-radius: 6px;
  display: inline-block; width: fit-content;
}
.p-last-login { font-size: 12px; color: var(--text-sub); display: flex; align-items: center; gap: 4px; }
.p-last-login i { font-size: 14px; }

/* =========================================
   폼 영역
========================================= */
.form-group { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
.form-group label { font-size: 13px; font-weight: 600; color: var(--text-sub); }

.input-text {
  padding: 10px 14px; border: 1px solid var(--border-color); border-radius: 8px;
  font-size: 13px; color: var(--text-main); background: var(--bg-surface); transition: border-color 0.2s, box-shadow 0.2s; box-sizing: border-box;
}
.input-text:hover:not(.disabled) { border-color: var(--border-focus); background: var(--bg-canvas); }
.input-text:focus:not(.disabled) {
  outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); background: var(--bg-surface);
}
.input-text::placeholder { color: var(--text-muted); }
.input-text.disabled { background-color: var(--bg-hover); color: var(--text-muted); cursor: not-allowed; border-color: transparent;}

/* =========================================
   버튼 (플랫)
========================================= */
.btn-wrap { margin-top: 24px; display: flex; justify-content: flex-end; }
.btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 10px 20px; border-radius: 8px; font-weight: 600; border: none;
  cursor: pointer; font-size: 13px; transition: all 0.2s; box-shadow: var(--shadow-sm);
}
.btn i { font-size: 16px; }

.btn-save { background-color: var(--primary); color: var(--text-inverse); }
.btn-save:hover { background-color: var(--primary-hover); transform: translateY(-1px); }

.btn-secondary { background-color: var(--text-sub); color: var(--text-inverse); }
.btn-secondary:hover { background-color: var(--text-main); transform: translateY(-1px); }

/* =========================================
   반응형 (Responsive)
========================================= */
@media (max-width: 1024px) {
  .profile-grid { grid-template-columns: 1fr; }
}

@media (max-width: 768px) {
  .profile-header { flex-direction: column; align-items: flex-start; gap: 16px; }
  .btn-wrap { justify-content: stretch; }
  .btn { width: 100%; }
}
</style>
