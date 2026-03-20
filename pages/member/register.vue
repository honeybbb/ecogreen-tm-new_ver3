<script setup>
import { ref } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";

const authStore = useAuthStore();
const router = useRouter();

// 1. 등록할 데이터 모델 (딱 5개 필수 항목)
const admin = ref({
  role: 'MANAGER', // 기본: 중간관리자
  loginId: '',
  password: '',
  name: '',
  phone: ''
});

// 2. 저장 함수
const handleSubmit = async () => {
  if (!confirm(`${admin.value.name} 관리자를 등록하시겠습니까?`)) return;

  const payload = {
    ...admin.value,
    cIdx: authStore.user?.cIdx,
  };

  try {
    const res = await axios.post('/api/v1/manager/register', payload);

    if (res.data.result) {
      alert('등록이 완료되었습니다.');
      router.push('/manager/list'); // 관리자 목록 페이지로 이동
    } else {
      alert('등록 실패: ' + (res.data.message || '오류 발생'));
    }
  } catch (error) {
    console.error(error);
    alert('서버 통신 중 오류가 발생했습니다.');
  }
};

// 3. 취소 함수
const handleCancel = () => {
  if (confirm('작성을 취소하시겠습니까? 목록으로 돌아갑니다.')) {
    router.push('/manager/list');
  }
};
</script>

<template>
  <div class="admin-register-page">
    <div class="page-header">
      <h1 class="page-title">
        <i class="mdi mdi-shield-account-outline"></i> 본사 관리자 등록
      </h1>
    </div>

    <div class="form-card">
      <form @submit.prevent="handleSubmit">

        <div class="form-group">
          <label class="required">시스템 권한</label>
          <div class="radio-group">
            <label class="radio-label">
              <input type="radio" value="SUPER" v-model="admin.role" />
              <span>최고관리자 (전체 권한)</span>
            </label>
            <label class="radio-label">
              <input type="radio" value="MANAGER" v-model="admin.role" />
              <span>중간관리자 (일반 권한)</span>
            </label>
          </div>
        </div>

        <div class="form-group">
          <label class="required">아이디</label>
          <input type="text" v-model="admin.loginId" required class="form-input" placeholder="로그인에 사용할 아이디 입력" />
        </div>

        <div class="form-group">
          <label class="required">비밀번호</label>
          <input type="password" v-model="admin.password" required class="form-input" placeholder="비밀번호 입력" />
        </div>

        <div class="form-group">
          <label class="required">이름</label>
          <input type="text" v-model="admin.name" required class="form-input" placeholder="담당자 이름 입력" />
        </div>

        <div class="form-group">
          <label>연락처</label>
          <input type="tel" v-model="admin.phone" class="form-input" placeholder="010-0000-0000" />
        </div>

        <div class="button-group">
          <button type="button" class="btn-cancel" @click="handleCancel">취소</button>
          <button type="submit" class="btn-submit">
            <i class="mdi mdi-check"></i> 등록 완료
          </button>
        </div>

      </form>
    </div>
  </div>
</template>

<style scoped>
.admin-register-page {
  padding-bottom: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 헤더 */
.page-header {
  width: 100%;
  max-width: 500px;
  margin-bottom: 20px;
}
.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main);
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
}
.page-title i {
  color: var(--primary);
  font-size: 24px;
}

/* 카드 디자인 */
.form-card {
  width: 100%;
  max-width: 500px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 32px;
  box-shadow: var(--shadow-sm);
}

/* 입력 폼 공통 */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 24px;
}
.form-group label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-sub);
}
.form-group label.required::after {
  content: '*';
  color: var(--danger);
  margin-left: 4px;
}

.form-input {
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-main);
  background: var(--bg-canvas);
  transition: all 0.2s;
}
.form-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
  background: var(--bg-surface);
}

/* 라디오 버튼 (권한) */
.radio-group {
  display: flex;
  gap: 10px;
}
.radio-label {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-canvas);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-sub);
  transition: all 0.2s;
}
.radio-label input[type="radio"] {
  display: none;
}
.radio-label:hover {
  border-color: var(--border-focus);
}
.radio-label:has(input:checked) {
  border-color: var(--primary);
  background: var(--primary-soft);
  color: var(--primary);
  font-weight: 700;
}

/* 하단 버튼 */
.button-group {
  display: flex;
  gap: 12px;
  margin-top: 32px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}
.btn-cancel, .btn-submit {
  flex: 1;
  padding: 14px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  transition: all 0.2s;
  border: none;
}
.btn-cancel {
  background: var(--bg-canvas);
  color: var(--text-sub);
  border: 1px solid var(--border-color);
}
.btn-cancel:hover {
  background: var(--bg-hover);
  color: var(--text-main);
}
.btn-submit {
  background: var(--primary);
  color: var(--text-inverse);
  box-shadow: var(--shadow-sm);
}
.btn-submit:hover {
  background: var(--primary-hover);
  transform: translateY(-1px);
}
</style>
