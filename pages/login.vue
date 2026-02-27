<script setup>
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import axios from 'axios';
import { useRouter } from 'vue-router'; // Nuxt의 경우 navigateTo 사용, 여기서는 일반적인 로직 유지
definePageMeta({
  layout: 'empty'
});
const authStore = useAuthStore();
// const router = useRouter(); // 필요시 사용

// 폼 데이터 상태 관리
const username = ref('');
const password = ref('');
const loading = ref(false);
const errorMessage = ref(''); // 💡 alert 대신 화면에 에러를 표시하기 위한 상태

// 로그인 버튼 클릭 시 실행될 함수
const handleLogin = async () => {
  errorMessage.value = '';

  if (!username.value || !password.value) {
    errorMessage.value = '아이디와 비밀번호를 모두 입력해주세요.';
    return;
  }

  loading.value = true;

  try {
    const res = await axios.post('/api/v1/auth/manager', {
      id: username.value,
      password: password.value,
    });

    if (res.data.result) {
      authStore.setLogin({
        user: JSON.stringify(res.data.data[0]),
        token: res.data.token,
      });

      await navigateTo('/', { replace: true });
    } else {
      errorMessage.value = res.data.msg || '아이디 또는 비밀번호가 올바르지 않습니다.';
      password.value = '';
    }
  } catch (error) {
    errorMessage.value = '로그인 중 오류가 발생했습니다.';
    password.value = '';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <div class="login-header">
        <div class="logo-circle">
          <!--span>EG</span-->
          <img src="/logo.jpg">
        </div>
        <!--h1>에코그린티엠</h1-->
        <p>통합 관리자 시스템 로그인</p>
      </div>

      <form @submit.prevent="handleLogin" class="login-form">
        <div class="input-group">
          <label for="username">아이디</label>
          <input
              id="username"
              v-model="username"
              type="text"
              placeholder="아이디를 입력하세요"
              required
              :disabled="loading"
              class="styled-input"
          >
        </div>

        <div class="input-group">
          <label for="password">비밀번호</label>
          <input
              id="password"
              v-model="password"
              type="password"
              placeholder="비밀번호를 입력하세요"
              required
              :disabled="loading"
              class="styled-input"
          >
        </div>

        <div v-if="errorMessage" class="error-message">
          ⚠️ {{ errorMessage }}
        </div>

        <button type="submit" :disabled="loading" class="login-btn">
          <span v-if="loading" class="loader"></span>
          <span v-else>로그인</span>
        </button>

        <div class="login-footer">
          <a href="#" class="reset-link">비밀번호 초기화 문의</a>
        </div>
      </form>
    </div>

    <div class="bg-decoration"></div>
  </div>
</template>

<style scoped>
/* === 전체 레이아웃 === */
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f0f2f5; /* 눈이 편안한 회색 배경 */
  position: relative;
  overflow: hidden;
}

/* === 로그인 카드 === */
.login-card {
  background: white;
  padding: 40px;
  border-radius: 16px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05); /* 부드러운 그림자 */
  width: 100%;
  max-width: 420px;
  z-index: 10;
  border: 1px solid #e1e4e8;
}

/* === 헤더 영역 === */
.login-header {
  text-align: center;
  margin-bottom: 30px;
}

.logo-circle {
  width: 60px;
  height: 60px;
  background-color: #3b82f6; /* 브랜드 컬러 (파란색 예시) */
  color: white;
  border-radius: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0 auto 15px;
  font-weight: bold;
  font-size: 24px;
}

.login-header h1 {
  font-size: 22px;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 8px 0;
}

.login-header p {
  color: #6b7280;
  font-size: 14px;
  margin: 0;
}

/* === 입력 폼 === */
.login-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.input-group {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.input-group label {
  font-size: 14px;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.styled-input {
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 15px;
  transition: all 0.2s ease;
  background-color: #fff;
  color: #111;
  box-sizing: border-box;
}

.styled-input:focus {
  border-color: #3b82f6;
  outline: none;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); /* 포커스 링 효과 */
}

/* === 에러 메시지 === */
.error-message {
  color: #ef4444;
  font-size: 13px;
  background-color: #fef2f2;
  padding: 10px;
  border-radius: 6px;
  text-align: center;
  border: 1px solid #fee2e2;
}

/* === 버튼 === */
.login-btn {
  width: 100%;
  padding: 14px;
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s, transform 0.1s;
  display: flex;
  justify-content: center;
  align-items: center;
}

.login-btn:hover:not(:disabled) {
  background-color: #2563eb;
}

.login-btn:active:not(:disabled) {
  transform: scale(0.98);
}

.login-btn:disabled {
  background-color: #93c5fd;
  cursor: not-allowed;
}

/* === 푸터 링크 === */
.login-footer {
  margin-top: 10px;
  text-align: center;
}

.reset-link {
  font-size: 13px;
  color: #6b7280;
  text-decoration: none;
  transition: color 0.2s;
}

.reset-link:hover {
  color: #3b82f6;
  text-decoration: underline;
}

/* === 배경 장식 (선택 사항) === */
.bg-decoration {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 50vh;
  background: linear-gradient(135deg, #dbeafe 0%, #f0f9ff 100%);
  z-index: 1;
  clip-path: polygon(0 0, 100% 0, 100% 80%, 0 100%);
}

/* === 로딩 스피너 === */
.loader {
  border: 2px solid #f3f3f3;
  border-top: 2px solid #fff;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
