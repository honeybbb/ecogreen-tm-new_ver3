<script setup>
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { navigateTo } from '#app';

const props = defineProps({
  isDarkMode: Boolean,
});

const emit = defineEmits(['toggleMobileMenu', 'toggleTheme']);

const authStore = useAuthStore();
const myEmail = computed(() => authStore.user?.email ?? null);
const myManagerNm = computed(() => authStore.user?.managerNm ?? null);

const isProfileOpen = ref(false);
const toggleProfile = () => {
  isProfileOpen.value = !isProfileOpen.value;
};

const logout = () => {
  authStore.logout();
  navigateTo('/login');
};
</script>

<template>
  <header class="eg-appbar">

    <button class="eg-icon-btn eg-mobile-menu-btn" @click="emit('toggleMobileMenu')">
      <i class="mdi mdi-menu"></i>
    </button>

    <div class="eg-spacer"></div>

    <!-- 헤더에 남은 시간 미니 표시 (선택사항) -->
    <div
        v-if="authStore.remainingSeconds <= 10 * 60"
        class="session-mini-badge"
        :class="{ urgent: authStore.remainingSeconds <= 60 }"
        @click="authStore.showWarningModal = true"
        title="클릭하여 세션 연장"
    >
      <i class="mdi mdi-clock-outline"></i>
      <span>{{ authStore.remainingFormatted }}</span>
    </div>

    <button class="eg-icon-btn theme-toggle" @click="emit('toggleTheme')" :title="isDarkMode ? '라이트 모드로 변경' : '다크 모드로 변경'">
      <i :class="['mdi', isDarkMode ? 'mdi-weather-sunny' : 'mdi-weather-night']"></i>
    </button>

    <div class="eg-profile-menu">
      <button class="eg-profile-btn" @click.stop="toggleProfile">
        <div class="eg-avatar">
          <i class="mdi mdi-account"></i>
        </div>
        <span class="eg-profile-name desktop-only">{{ myManagerNm }}</span>
        <i class="mdi desktop-only" :class="isProfileOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'"></i>
      </button>

      <transition name="fade-down">
        <div class="eg-dropdown-content" v-show="isProfileOpen">
          <div class="eg-dropdown-header">
            <div class="eg-user-info">
              <strong>{{ myManagerNm }}</strong>
              <small>{{ myEmail }}</small>
            </div>
          </div>
          <div class="eg-dropdown-list">
            <NuxtLink to="/mypage" class="eg-dropdown-item" @click="isProfileOpen = false">
              <i class="mdi mdi-account-circle-outline"></i>
              <span>내 정보</span>
            </NuxtLink>
            <NuxtLink to="/system/settings" class="eg-dropdown-item" @click="isProfileOpen = false">
              <i class="mdi mdi-cog-outline"></i>
              <span>환경설정</span>
            </NuxtLink>
            <div class="eg-dropdown-divider"></div>
            <a href="#" @click.prevent="logout" class="eg-dropdown-item eg-logout">
              <i class="mdi mdi-logout-variant"></i>
              <span>로그아웃</span>
            </a>
          </div>
        </div>
      </transition>
    </div>
  </header>
</template>

<style scoped>
* { box-sizing: border-box; outline: none; }
.eg-appbar {
  display: flex; align-items: center; padding: 0 24px; height: 70px;
  background-color: var(--bg-surface);
  border-bottom: 1px solid var(--border-color);
  position: sticky; top: 0; z-index: 990;
  transition: background-color 0.3s, border-color 0.3s;
}
.eg-mobile-menu-btn { display: none; margin-right: 12px; margin-left: -8px; background: transparent;}
.eg-spacer { flex: 1; }

.eg-icon-btn {
  width: 40px; height: 40px; border-radius: 10px; border: 1px solid transparent; background: transparent;
  color: var(--text-sub); cursor: pointer; display: flex; align-items: center; justify-content: center;
  margin-left: 4px; transition: all 0.2s; position: relative;
}
.eg-icon-btn:hover { background-color: var(--bg-hover); color: var(--primary); border-color: var(--border-focus); }
.eg-icon-btn i { font-size: 22px; }

.theme-toggle i { transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), color 0.3s; color: var(--warning); }
.theme-toggle:hover i { transform: rotate(30deg); }
body.theme-dark .theme-toggle i { color: var(--primary-hover); }

.session-mini-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 20px;
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: var(--warning);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  margin-left: 8px;
  transition: all 0.2s;
  font-variant-numeric: tabular-nums;
}
.session-mini-badge:hover {
  background: rgba(245, 158, 11, 0.18);
  transform: translateY(-1px);
}
.session-mini-badge.urgent {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.35);
  color: var(--danger);
  animation: badge-pulse 1s infinite;
}
@keyframes badge-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}
.session-mini-badge i { font-size: 15px; }

.eg-profile-menu { position: relative; margin-left: 8px; }
.eg-profile-btn {
  display: flex; align-items: center; gap: 10px; padding: 6px 10px 6px 6px;
  background: transparent; border: 1px solid transparent; border-radius: 12px; cursor: pointer;
  transition: all 0.2s;
}
.eg-profile-btn:hover { background-color: var(--bg-hover); border-color: var(--border-focus); }
.eg-avatar {
  width: 36px; height: 36px;
  background-color: var(--bg-canvas);
  color: var(--text-sub); border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 18px;
}
.eg-profile-name { font-size: 14px; font-weight: 600; color: var(--text-main); }
.eg-profile-btn .mdi-chevron-down, .eg-profile-btn .mdi-chevron-up { color: var(--text-sub); font-size: 18px;}

.eg-dropdown-content {
  position: absolute; right: 0; top: calc(100% + 12px);
  background: var(--bg-surface); min-width: 250px; border-radius: 16px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border-color); overflow: hidden; z-index: 100;
}
.eg-dropdown-header { padding: 20px; background-color: var(--bg-canvas); border-bottom: 1px solid var(--border-color); }
.eg-user-info strong { display: block; font-size: 15px; color: var(--text-main); font-weight: 700; margin-bottom: 2px;}
.eg-user-info small { font-size: 13px; color: var(--text-sub); font-weight: 400; }
.eg-dropdown-list { padding: 8px; }
.eg-dropdown-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  color: var(--text-sub); text-decoration: none; font-size: 14px; font-weight: 500;
  border-radius: 10px; transition: all 0.2s;
}
.eg-dropdown-item:hover { background-color: var(--bg-hover); color: var(--primary); }
.eg-dropdown-item i { font-size: 18px; color: var(--text-muted); }
.eg-dropdown-item:hover i { color: var(--primary); }
.eg-dropdown-divider { height: 1px; background: var(--border-color); margin: 8px; }
.eg-dropdown-item.eg-logout { color: var(--danger); }
.eg-dropdown-item.eg-logout:hover { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }
.eg-dropdown-item.eg-logout i { color: var(--danger); opacity: 0.8; }
.eg-dropdown-item.eg-logout:hover i { color: var(--danger); opacity: 1; }

.fade-down-enter-active, .fade-down-leave-active { transition: all 0.2s ease-out; }
.fade-down-enter-from { opacity: 0; transform: translateY(-10px); }
.fade-down-leave-to { opacity: 0; transform: translateY(-5px); }

@media (min-width: 769px) { .desktop-only { display: block !important; } }
@media (max-width: 768px) { .desktop-only { display: none !important; } }

@media (max-width: 768px) {
  .eg-mobile-menu-btn { display: flex; }
  .eg-appbar { padding: 0 16px; height: 60px; }
  .eg-dropdown-content { right: 8px; width: calc(100vw - 16px); max-width: 300px; }
  .session-mini-badge { padding: 4px 8px; font-size: 12px; }
}
</style>
