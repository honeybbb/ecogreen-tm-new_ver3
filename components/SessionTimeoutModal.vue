<template>
  <Teleport to="body">
    <Transition name="session-modal">
      <div v-if="authStore.showWarningModal" class="session-overlay">
        <div class="session-modal">

          <!-- 상단 아이콘 -->
          <div class="session-icon-wrap">
            <div class="session-icon" :class="urgentClass">
              <i class="mdi mdi-clock-alert-outline"></i>
            </div>
            <!-- 원형 프로그레스 -->
            <svg class="session-progress" viewBox="0 0 56 56">
              <circle class="track" cx="28" cy="28" r="26" />
              <circle
                  class="bar"
                  cx="28" cy="28" r="26"
                  :stroke-dasharray="circumference"
                  :stroke-dashoffset="dashOffset"
                  :class="urgentClass"
              />
            </svg>
          </div>

          <!-- 텍스트 -->
          <h2 class="session-title">세션이 곧 만료됩니다</h2>
          <p class="session-desc">
            보안을 위해 일정 시간 후 자동으로 로그아웃됩니다.<br>
            계속 사용하시려면 <strong>연장</strong>을 눌러주세요.
          </p>

          <!-- 남은 시간 카운트다운 -->
          <div class="session-countdown" :class="urgentClass">
            <span class="countdown-label">남은 시간</span>
            <span class="countdown-time">{{ authStore.remainingFormatted }}</span>
          </div>

          <!-- 액션 버튼 -->
          <div class="session-actions">
            <button class="btn-logout" @click="handleLogout">
              <i class="mdi mdi-logout-variant"></i>
              로그아웃
            </button>
            <button class="btn-extend" @click="handleExtend">
              <i class="mdi mdi-refresh"></i>
              연장하기
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { navigateTo } from '#app';

const authStore = useAuthStore();

// 원형 프로그레스 계산
const WARN_BEFORE   = 5 * 60;  // 경고 시작 시점 (300초)
const circumference = 2 * Math.PI * 26;  // 원 둘레 (r=26)

const dashOffset = computed(() => {
  const ratio = Math.max(0, Math.min(authStore.remainingSeconds, WARN_BEFORE)) / WARN_BEFORE;
  return circumference * (1 - ratio);
});

// 남은 시간이 1분 이하면 urgent 스타일 적용
const urgentClass = computed(() => ({
  urgent: authStore.remainingSeconds <= 60
}));

const handleExtend = () => {
  authStore.extendSession();
};

const handleLogout = () => {
  authStore.logout();
  navigateTo('/login');
};
</script>

<style scoped>
/* =============================================
   오버레이
============================================= */
.session-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 16px;
}

/* =============================================
   모달 박스
============================================= */
.session-modal {
  background: var(--bg-surface);
  border-radius: 20px;
  padding: 40px 36px 32px;
  width: 100%;
  max-width: 400px;
  text-align: center;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

/* =============================================
   아이콘 + 원형 프로그레스
============================================= */
.session-icon-wrap {
  position: relative;
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
}

.session-icon {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: rgba(245, 158, 11, 0.12);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--warning);
  font-size: 28px;
  transition: all 0.4s;
  z-index: 1;
}

.session-icon.urgent {
  background: rgba(239, 68, 68, 0.12);
  color: var(--danger);
  animation: pulse-icon 1s infinite;
}

@keyframes pulse-icon {
  0%, 100% { transform: scale(1); }
  50%       { transform: scale(1.08); }
}

/* SVG 원형 프로그레스 */
.session-progress {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.session-progress .track {
  fill: none;
  stroke: var(--border-color);
  stroke-width: 3;
}

.session-progress .bar {
  fill: none;
  stroke: var(--warning);
  stroke-width: 3;
  stroke-linecap: round;
  transition: stroke-dashoffset 1s linear, stroke 0.4s;
}

.session-progress .bar.urgent {
  stroke: var(--danger);
}

/* =============================================
   텍스트
============================================= */
.session-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.session-desc {
  font-size: 13px;
  color: var(--text-sub);
  line-height: 1.7;
  margin: 0;
}

/* =============================================
   카운트다운
============================================= */
.session-countdown {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 32px;
  border-radius: 12px;
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.2);
  width: 100%;
  transition: all 0.4s;
}

.session-countdown.urgent {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.25);
}

.countdown-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.countdown-time {
  font-size: 36px;
  font-weight: 800;
  color: var(--warning);
  letter-spacing: 2px;
  font-variant-numeric: tabular-nums;
  transition: color 0.4s;
}

.session-countdown.urgent .countdown-time {
  color: var(--danger);
  animation: blink 1s step-start infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.4; }
}

/* =============================================
   버튼
============================================= */
.session-actions {
  display: flex;
  gap: 10px;
  width: 100%;
  margin-top: 4px;
}

.btn-logout, .btn-extend {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
}

.btn-logout {
  background: var(--bg-hover);
  color: var(--text-sub);
  border: 1px solid var(--border-color);
}

.btn-logout:hover {
  background: rgba(239, 68, 68, 0.1);
  color: var(--danger);
  border-color: rgba(239, 68, 68, 0.3);
}

.btn-extend {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
}

.btn-extend:hover {
  background: var(--primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.4);
}

.btn-extend i {
  font-size: 17px;
}

/* =============================================
   모달 트랜지션
============================================= */
.session-modal-enter-active {
  animation: modal-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.session-modal-leave-active {
  animation: modal-in 0.2s ease-in reverse;
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.88) translateY(20px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

/* =============================================
   반응형
============================================= */
@media (max-width: 480px) {
  .session-modal {
    padding: 28px 20px 24px;
  }
  .session-actions {
    flex-direction: column-reverse;
  }
  .countdown-time {
    font-size: 28px;
  }
}
</style>
