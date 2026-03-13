<script setup>
import { ref } from 'vue';
import { useAuthStore } from '@/stores/auth';
import axios from 'axios';

definePageMeta({
  layout: 'empty'
});

const authStore = useAuthStore();

const username = ref('');
const password = ref('');
const loading = ref(false);
const errorMessage = ref('');
const showPassword = ref(false);

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
        user: res.data.data[0],
        token: res.data.token,
      });
      await navigateTo('/', { replace: true });
    } else {
      errorMessage.value = res.data.msg || '아이디 또는 비밀번호가 올바르지 않습니다.';
      password.value = '';
    }
  } catch (error) {
    errorMessage.value = '로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    password.value = '';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="page">

    <!-- 왼쪽 브랜드 패널 -->
    <aside class="brand-panel">
      <div class="brand-inner">
        <div class="brand-logo">
          <img src="/logo.jpg" alt="로고" />
        </div>
        <div class="brand-text">
          <h2 class="brand-title">통합 관리자 시스템</h2>
          <p class="brand-sub">업무를 더 스마트하게, 관리를 더 쉽게</p>
        </div>
        <ul class="brand-features">
          <li><span class="feat-icon">📊</span> 급여 정산 자동화</li>
          <li><span class="feat-icon">👥</span> 직원 정보 통합 관리</li>
          <li><span class="feat-icon">🛡️</span> 4대보험 자동 계산</li>
        </ul>
      </div>
      <!-- 배경 도형 -->
      <div class="panel-orb orb1"></div>
      <div class="panel-orb orb2"></div>
    </aside>

    <!-- 오른쪽 로그인 폼 -->
    <main class="form-panel">
      <div class="form-wrap">

        <div class="form-header">
          <p class="form-eyebrow">관리자 전용</p>
          <h1 class="form-title">로그인</h1>
          <p class="form-desc">계속하려면 계정 정보를 입력해 주세요.</p>
        </div>

        <form @submit.prevent="handleLogin" class="form-body" novalidate>

          <!-- 아이디 -->
          <div class="field">
            <label for="username" class="field-label">아이디</label>
            <div class="field-input-wrap" :class="{ 'has-error': errorMessage && !username }">
              <span class="field-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <input
                  id="username"
                  v-model="username"
                  type="text"
                  placeholder="아이디를 입력하세요"
                  autocomplete="username"
                  :disabled="loading"
                  class="field-input"
              />
            </div>
          </div>

          <!-- 비밀번호 -->
          <div class="field">
            <label for="password" class="field-label">비밀번호</label>
            <div class="field-input-wrap" :class="{ 'has-error': errorMessage && !password }">
              <span class="field-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                  id="password"
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  placeholder="비밀번호를 입력하세요"
                  autocomplete="current-password"
                  :disabled="loading"
                  class="field-input"
              />
              <button
                  type="button"
                  class="toggle-pw"
                  @click="showPassword = !showPassword"
                  tabindex="-1"
                  :aria-label="showPassword ? '비밀번호 숨기기' : '비밀번호 보기'"
              >
                <!-- 보이는 눈 -->
                <svg v-if="!showPassword" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <!-- 숨긴 눈 -->
                <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                  <line x1="1" y1="1" x2="23" y2="23"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- 에러 메시지 -->
          <transition name="slide-fade">
            <div v-if="errorMessage" class="error-box" role="alert">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {{ errorMessage }}
            </div>
          </transition>

          <!-- 로그인 버튼 -->
          <button type="submit" :disabled="loading" class="submit-btn">
            <span v-if="loading" class="spinner"></span>
            <span v-else>로그인</span>
          </button>

        </form>

        <div class="form-footer">
          <a href="#" class="footer-link">비밀번호 초기화 문의</a>
        </div>

      </div>
    </main>

  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;600;700;800&display=swap');

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── 페이지 레이아웃 ── */
.page {
  display: grid;
  grid-template-columns: 420px 1fr;
  min-height: 100vh;
}

/* ══════════════════════════════
   왼쪽 브랜드 패널
══════════════════════════════ */
.brand-panel {
  position: relative;
  background: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  padding: 40px 48px;
}

.brand-inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.brand-logo {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  background: #1e293b;
  border: 1px solid rgba(255,255,255,0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.brand-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.brand-title {
  font-size: 22px;
  font-weight: 800;
  color: #f1f5f9;
  letter-spacing: -0.5px;
  line-height: 1.3;
  margin-bottom: 8px;
}
.brand-sub {
  font-size: 14px;
  color: #64748b;
  line-height: 1.6;
}

.brand-features {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;
}
.brand-features li {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  color: #94a3b8;
  font-weight: 500;
}
.feat-icon {
  font-size: 16px;
  width: 32px;
  height: 32px;
  background: #1e293b;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.06);
}

/* 배경 오브 */
.panel-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(72px);
  pointer-events: none;
  z-index: 1;
}
.orb1 {
  width: 320px; height: 320px;
  background: radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%);
  top: -80px; right: -80px;
}
.orb2 {
  width: 240px; height: 240px;
  background: radial-gradient(circle, rgba(16,185,129,0.12) 0%, transparent 70%);
  bottom: -40px; left: -40px;
}

/* ══════════════════════════════
   오른쪽 폼 패널
══════════════════════════════ */
.form-panel {
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

.form-wrap {
  width: 100%;
  max-width: 400px;
  animation: fadeUp 0.45s ease both;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* 헤더 */
.form-header { margin-bottom: 36px; }
.form-eyebrow {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #3b82f6;
  margin-bottom: 10px;
}
.form-title {
  font-size: 30px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.8px;
  margin-bottom: 8px;
}
.form-desc {
  font-size: 14px;
  color: #64748b;
  line-height: 1.6;
}

/* 폼 바디 */
.form-body {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

/* 필드 */
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label {
  font-size: 13px;
  font-weight: 600;
  color: #374151;
}

.field-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.field-icon {
  position: absolute;
  left: 14px;
  color: #9ca3af;
  display: flex;
  align-items: center;
  pointer-events: none;
  transition: color 0.2s;
}

.field-input {
  width: 100%;
  padding: 13px 44px;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  border-radius: 10px;
  font-size: 14px;
  color: #0f172a;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.field-input::placeholder { color: #c4c8d0; }
.field-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3.5px rgba(59,130,246,0.12);
}
.field-input:focus + .field-icon,
.field-input-wrap:focus-within .field-icon {
  color: #3b82f6;
}
.field-input:disabled {
  background: #f1f5f9;
  color: #94a3b8;
  cursor: not-allowed;
}
.field-input-wrap.has-error .field-input {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239,68,68,0.1);
}

/* 비밀번호 토글 */
.toggle-pw {
  position: absolute;
  right: 14px;
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
  padding: 4px;
  border-radius: 4px;
  transition: color 0.2s;
}
.toggle-pw:hover { color: #3b82f6; }

/* 에러 박스 */
.error-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  font-size: 13px;
  color: #dc2626;
  font-weight: 500;
}

/* 에러 트랜지션 */
.slide-fade-enter-active { transition: all 0.25s ease; }
.slide-fade-leave-active { transition: all 0.2s ease; }
.slide-fade-enter-from { opacity: 0; transform: translateY(-6px); }
.slide-fade-leave-to { opacity: 0; transform: translateY(-4px); }

/* 제출 버튼 */
.submit-btn {
  width: 100%;
  padding: 14px;
  background: #1d4ed8;
  color: white;
  border: none;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0.02em;
  transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
  margin-top: 4px;
  box-shadow: 0 4px 14px rgba(29,78,216,0.3);
}
.submit-btn:hover:not(:disabled) {
  background: #1e40af;
  box-shadow: 0 6px 20px rgba(29,78,216,0.38);
  transform: translateY(-1px);
}
.submit-btn:active:not(:disabled) {
  transform: scale(0.98);
  box-shadow: 0 2px 8px rgba(29,78,216,0.2);
}
.submit-btn:disabled {
  background: #93c5fd;
  cursor: not-allowed;
  box-shadow: none;
}

/* 스피너 */
.spinner {
  width: 18px; height: 18px;
  border: 2.5px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.75s linear infinite;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 푸터 */
.form-footer {
  margin-top: 24px;
  text-align: center;
}
.footer-link {
  font-size: 13px;
  color: #94a3b8;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}
.footer-link:hover { color: #3b82f6; }

/* ══════════════════════════════
   반응형
══════════════════════════════ */

/* 태블릿: 브랜드 패널 상단으로 */
@media (max-width: 900px) {
  .page {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }

  .brand-panel {
    padding: 32px 24px 28px;
    min-height: unset;
  }

  .brand-inner {
    flex-direction: row;
    align-items: center;
    flex-wrap: wrap;
    gap: 20px;
    width: 100%;
    max-width: 560px;
  }

  .brand-features { display: none; }
  .brand-text { flex: 1; }
  .brand-title { font-size: 18px; margin-bottom: 4px; }
  .brand-sub { font-size: 13px; }

  .orb1 { width: 180px; height: 180px; top: -40px; right: -40px; }
  .orb2 { width: 140px; height: 140px; }

  .form-panel {
    padding: 40px 24px;
    align-items: flex-start;
    padding-top: 48px;
  }
}

/* 모바일 */
@media (max-width: 480px) {
  .brand-panel { padding: 24px 20px; }
  .brand-logo { width: 44px; height: 44px; }
  .brand-title { font-size: 16px; }
  .brand-sub { display: none; }

  .form-panel { padding: 32px 20px; }
  .form-title { font-size: 26px; }

  .field-input { padding: 12px 42px; font-size: 15px; }
  .submit-btn { padding: 14px; font-size: 15px; }
}
</style>
