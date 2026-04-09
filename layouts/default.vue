<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import { useRoute, navigateTo, useRouter } from '#app';
import { useAuthStore } from '@/stores/auth';
import { useTabStore } from '@/stores/tab';
import axios from "axios";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const tabStore = useTabStore();

// === 1. 상태 및 반응성 변수 ===
const isProfileOpen = ref(false);
const miniVariant = ref(false);
const mobileMenuOpen = ref(false);
const title = ref('에코그린티엠');
const activeGroup = ref(null);

const isDarkMode = ref(false);

const cIdx = computed(() => authStore.user?.cIdx ?? null);
const myEmail = computed(() => authStore.user?.email ?? null);
const myManagerNm = computed(() => authStore.user?.managerNm ?? null);

// === 2. 메뉴 데이터 ===
const items = ref([]);
const systemItems = ref([]);

//현재 경로에 맞는 메뉴 타이틀을 찾아주는 재귀 함수
const findMenuTitle = (path, menuTree) => {
  if (path === '/') return 'Home';
  for (const item of menuTree) {
    if (item.to === path) return item.title;
    if (item.child && item.child.length > 0) {
      const childTitle = findMenuTitle(path, item.child);
      if (childTitle) return childTitle;
    }
  }
  return null;
};

// === 3. 메서드 ===
const isActive = (item) => {
  const path = route.path || '';
  const to = item?.to || '';
  if (to === '/') return path === '/';
  return path.startsWith(to.replace(/\/+$/, ''));
};

const toggleProfile = () => {
  isProfileOpen.value = !isProfileOpen.value;
};

const toggleGroup = (itemId) => {
  activeGroup.value = activeGroup.value === itemId ? null : itemId;
};

const toggleTheme = () => {
  isDarkMode.value = !isDarkMode.value;
  if (isDarkMode.value) {
    document.body.classList.add('theme-dark');
    localStorage.setItem('theme', 'dark');
  } else {
    document.body.classList.remove('theme-dark');
    localStorage.setItem('theme', 'light');
  }
};

watch(() => route.path, (newPath) => {
  const allGroups = [...items.value, ...systemItems.value].filter(item => item.group);
  const foundGroup = allGroups.find(group =>
      group.child.some(child => isActive(child))
  );
  if (foundGroup) {
    activeGroup.value = foundGroup.id;
  }
  mobileMenuOpen.value = false;
  isProfileOpen.value = false;

  const title = findMenuTitle(newPath, [...items.value, ...systemItems.value]) || '새 탭';
  tabStore.addTab({ title, path: newPath });

}, { immediate: true });

const closeTab = (path) => {
  // 닫으려는 탭이 현재 보고 있는 탭이라면? -> 이전 탭으로 라우팅 이동 후 닫기
  if (route.path === path) {
    const index = tabStore.tabs.findIndex(t => t.path === path);
    const prevTab = tabStore.tabs[index - 1] || tabStore.tabs[0];
    if (prevTab) router.push(prevTab.path);
  }
  tabStore.removeTab(path);
};

const logout = () => {
  authStore.logout();
  navigateTo('/login');
};

const toggleSidebar = () => {
  miniVariant.value = !miniVariant.value;
};

const buildMenuTree = (flatList) => {
  if (!flatList || !Array.isArray(flatList)) return [];
  const tree = [];
  const map = {};

  flatList.forEach(item => {
    map[item.menuNo] = {
      id: item.menuKey || `menu-${item.menuNo}`,
      icon: item.menuIcon,
      title: item.menuNm,
      to: item.menuPath,
      group: item.groupFl === 'Y',
      child: [],
      sort: item.sort,
      parentNo: item.parentNo
    };
  });

  flatList.forEach(item => {
    const currentItem = map[item.menuNo];
    if (item.parentNo && map[item.parentNo]) {
      map[item.parentNo].child.push(currentItem);
    } else {
      tree.push(currentItem);
    }
  });

  const sortFn = (a, b) => (a.sort || 0) - (b.sort || 0);
  tree.sort(sortFn);
  tree.forEach(rootItem => {
    if (rootItem.child.length > 0) {
      rootItem.child.sort(sortFn);
    }
  });

  return tree;
};

const getMenus = (companyNo) => {
  if(!companyNo) return;
  const params = { isMaster: authStore.user?.isMaster, path: route.path };

  axios.get(`/api/v1/menu/${companyNo}`, { params })
      .then(res => {
        const fullTree = buildMenuTree(res.data.data);
        systemItems.value = fullTree.filter(item => item.id === 'system');
        items.value = fullTree.filter(item => item.id !== 'system');
      })
      .catch(err => console.error("메뉴 로딩 실패:", err));
}

watch(() => cIdx.value, (val) => {
  if (val) getMenus(val);
}, { immediate: true });

onMounted(() => {
  // 세션 스토리지에서 탭 목록 복구
  tabStore.initTabs();

  // 만약 새로고침 후 접속한 현재 주소가 복구된 탭 목록에 없다면 현재 탭 추가
  const currentTitle = findMenuTitle(route.path, [...items.value, ...systemItems.value]) || '새 탭';
  tabStore.addTab({ title: currentTitle, path: route.path });

  // 저장된 테마 확인
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    isDarkMode.value = true;
    document.body.classList.add('theme-dark');
  }

  // 세션 타이머 시작 (이미 로그인된 상태로 레이아웃이 마운트됐을 때)
  // 토큰이 있고 타이머가 아직 안 돌고 있을 때만 시작
  if (authStore.token && authStore.remainingSeconds === 60 * 60) {
    authStore.startTimer();
  }
});
</script>

<template>
  <div class="eg-app-container">

    <!-- 세션 만료 경고 모달 -->
    <SessionTimeoutModal />

    <transition name="fade">
      <div
          v-if="mobileMenuOpen"
          class="eg-sidebar-overlay"
          @click="mobileMenuOpen = false"
      ></div>
    </transition>

    <nav :class="['eg-leftnav', { 'eg-mini': miniVariant, 'eg-mobile-open': mobileMenuOpen }]">
      <div class="eg-brand">
        <div class="eg-logo-wrapper">
          <div class="eg-logo-icon">
            <span class="eg-logo-text">EG</span>
          </div>
          <transition name="fade">
            <span v-show="!miniVariant || mobileMenuOpen" class="eg-brand-text">{{ title }}</span>
          </transition>
        </div>
      </div>

      <div class="eg-scroll-area">
        <ul class="eg-menu-list">
          <li v-for="item in items" :key="item.id">
            <NuxtLink v-if="!item.group" :to="item.to" :class="['eg-menu-item', { 'eg-active': isActive(item) }]">
              <span class="eg-icon"><i :class="['mdi', item.icon]"></i></span>
              <transition name="fade">
                <span v-show="!miniVariant || mobileMenuOpen" class="eg-title">{{ item.title }}</span>
              </transition>
            </NuxtLink>

            <div v-else>
              <div
                  :class="['eg-menu-item eg-group-item', { 'eg-active-group': activeGroup === item.id || item.child.some(isActive) }]"
                  @click="toggleGroup(item.id)"
              >
                <span class="eg-icon"><i :class="['mdi', item.icon]"></i></span>
                <transition name="fade">
                  <span v-show="!miniVariant || mobileMenuOpen" class="eg-title">{{ item.title }}</span>
                </transition>
                <transition name="fade">
                  <span v-show="!miniVariant || mobileMenuOpen" class="eg-arrow" :class="{ 'eg-arrow-up': activeGroup === item.id }">
                    <i class="mdi mdi-chevron-down"></i>
                  </span>
                </transition>
              </div>

              <transition name="slide-down">
                <ul v-if="(!miniVariant || mobileMenuOpen) && activeGroup === item.id" class="eg-submenu-list">
                  <li v-for="child in item.child" :key="child.to">
                    <NuxtLink :to="child.to" :class="['eg-submenu-item', { 'eg-active-child': isActive(child) }]">
                      <span class="eg-child-title">{{ child.title }}</span>
                    </NuxtLink>
                  </li>
                </ul>
              </transition>
            </div>
          </li>
        </ul>

        <div v-if="systemItems.length > 0" class="eg-divider"></div>

        <ul class="eg-menu-list" v-if="systemItems.length > 0">
          <li v-for="item in systemItems" :key="item.id">
            <div v-if="item.group">
              <div
                  :class="['eg-menu-item eg-group-item', { 'eg-active-group': activeGroup === item.id || item.child.some(isActive) }]"
                  @click="toggleGroup(item.id)"
              >
                <span class="eg-icon"><i :class="['mdi', item.icon]"></i></span>
                <transition name="fade">
                  <span v-show="!miniVariant || mobileMenuOpen" class="eg-title">{{ item.title }}</span>
                </transition>
                <transition name="fade">
                  <span v-show="!miniVariant || mobileMenuOpen" class="eg-arrow" :class="{ 'eg-arrow-up': activeGroup === item.id }">
                    <i class="mdi mdi-chevron-down"></i>
                  </span>
                </transition>
              </div>

              <transition name="slide-down">
                <ul v-if="(!miniVariant || mobileMenuOpen) && activeGroup === item.id" class="eg-submenu-list">
                  <li v-for="child in item.child" :key="child.to">
                    <NuxtLink :to="child.to" :class="['eg-submenu-item', { 'eg-active-child': isActive(child) }]">
                      <span class="eg-child-title">{{ child.title }}</span>
                    </NuxtLink>
                  </li>
                </ul>
              </transition>
            </div>
          </li>
        </ul>
      </div>

      <div class="eg-nav-footer desktop-only">
        <button @click="toggleSidebar" class="eg-toggle-btn">
          <i :class="['mdi', miniVariant ? 'mdi-chevron-right' : 'mdi-chevron-left']"></i>
        </button>
      </div>
    </nav>

    <div class="eg-main-wrapper" :class="{ 'eg-main-expanded': miniVariant }">
      <header class="eg-appbar">

        <button class="eg-icon-btn eg-mobile-menu-btn" @click="mobileMenuOpen = true">
          <i class="mdi mdi-menu"></i>
        </button>

        <div class="eg-spacer"></div>

        <!-- ★ 헤더에 남은 시간 미니 표시 (선택사항) -->
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

        <button class="eg-icon-btn theme-toggle" @click="toggleTheme" :title="isDarkMode ? '라이트 모드로 변경' : '다크 모드로 변경'">
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

      <div class="eg-tab-bar">
        <div
            v-for="tab in tabStore.tabs"
            :key="tab.path"
            :class="['eg-tab-item', { 'active': route.path === tab.path }]"
            @click="router.push(tab.path)"
        >
          <span class="eg-tab-title">{{ tab.title }}</span>
          <button v-if="tab.path !== '/'" class="eg-tab-close" @click.stop="closeTab(tab.path)">
            <i class="mdi mdi-close"></i>
          </button>
        </div>
      </div>

      <main class="eg-main-content">
        <div class="eg-container">
          <slot />
        </div>
      </main>

      <footer class="eg-footer">
        <div class="eg-footer-content">
          <span>&copy; {{ new Date().getFullYear() }} EcoGreen TM. All rights reserved.</span>
          <div class="eg-footer-links">
            <a href="#">이용약관</a>
            <span class="eg-separator">|</span>
            <a href="#">개인정보처리방침</a>
            <span class="eg-separator">|</span>
            <a href="#">문의하기</a>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* CSS 커스텀 변수는 common.css에서 관리 */
* { box-sizing: border-box; outline: none; }

.eg-app-container {
  display: flex;
  min-height: 100vh;
  background-color: var(--bg-canvas);
  color: var(--text-main);
  overflow-x: hidden;
  transition: background-color 0.3s, color 0.3s;
}

/* === 모바일 오버레이 === */
.eg-sidebar-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  z-index: 1099;
}

/* === 사이드바 === */
.eg-leftnav {
  position: fixed;
  top: 0; left: 0;
  height: 100vh;
  width: 260px;
  background-color: var(--nav-bg);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease, background-color 0.3s;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid var(--nav-border);
}

.eg-leftnav.eg-mini { width: 72px; }

.eg-brand {
  height: 70px;
  display: flex; align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid var(--nav-border);
}
.eg-logo-wrapper { display: flex; align-items: center; gap: 12px; text-decoration: none; cursor: pointer; }
.eg-logo-icon {
  width: 36px; height: 36px;
  background-color: var(--primary);
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.eg-logo-text { color: #ffffff; font-weight: 800; font-size: 16px; letter-spacing: -0.5px; }
.eg-brand-text { color: var(--nav-brand-text); font-weight: 700; font-size: 17px; white-space: nowrap; letter-spacing: -0.3px; }

.eg-scroll-area { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 16px 0; }
.eg-scroll-area::-webkit-scrollbar { width: 4px; }
.eg-scroll-area::-webkit-scrollbar-thumb { background: var(--nav-border); border-radius: 2px; }

.eg-menu-list { list-style: none; padding: 0 12px; margin: 0; }
.eg-menu-item {
  display: flex; align-items: center; padding: 12px 16px; margin: 2px 0;
  color: var(--nav-text); text-decoration: none; border-radius: 8px;
  transition: all 0.2s ease; cursor: pointer; position: relative;
  font-size: 14px; font-weight: 500;
}
.eg-menu-item:hover { background-color: var(--nav-item-hover); color: var(--nav-text-hover); }
.eg-active {
  background-color: var(--nav-active-bg) !important;
  color: var(--primary) !important;
  font-weight: 600;
}
.eg-active::before {
  content: ''; position: absolute; left: 0; top: 10px; bottom: 10px;
  width: 4px; background-color: var(--primary); border-radius: 0 4px 4px 0;
}
.eg-active-group { color: var(--nav-text-hover); }
.eg-icon {
  font-size: 20px; width: 24px; text-align: center; flex-shrink: 0; margin-right: 12px;
  display: flex; align-items: center; justify-content: center;
  opacity: var(--nav-icon-opacity);
}
.eg-menu-item:hover .eg-icon,
.eg-active .eg-icon,
.eg-active-group .eg-icon { opacity: 1; color: var(--primary); }
.eg-mini .eg-icon { margin-right: 0; }
.eg-title { white-space: nowrap; }
.eg-arrow { margin-left: auto; transition: transform 0.3s; font-size: 18px; opacity: 0.7; }
.eg-arrow-up { transform: rotate(180deg); opacity: 1; }

.eg-submenu-list { list-style: none; padding: 0; margin: 4px 0; border-left: 1px solid var(--nav-border); margin-left: 28px; }
.eg-mini .eg-submenu-list { display: none; }
.eg-submenu-item {
  display: flex; align-items: center; padding: 9px 16px 9px 20px;
  color: var(--nav-text); text-decoration: none; font-size: 13px; border-radius: 6px; margin: 1px 0;
  transition: all 0.2s;
}
.eg-submenu-item:hover { color: var(--nav-text-hover); background-color: var(--nav-item-hover); }
.eg-active-child { color: var(--primary); font-weight: 600; background-color: var(--primary-soft); }

.eg-divider { height: 1px; background: var(--nav-border); margin: 16px 12px; }
.eg-nav-footer { padding: 12px; border-top: 1px solid var(--nav-border); margin-top: auto; }
.eg-toggle-btn {
  width: 100%; padding: 10px; background: transparent; border: none;
  border-radius: 8px; color: var(--nav-text); cursor: pointer; transition: all 0.2s; font-size: 20px;
  display: flex; align-items: center; justify-content: center;
}
.eg-toggle-btn:hover { background-color: var(--nav-item-hover); color: var(--nav-text-hover); }

/* === 메인 콘텐츠 === */
.eg-main-wrapper {
  flex: 1; margin-left: 260px;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex; flex-direction: column; min-width: 0;
  background-color: var(--bg-canvas);
}
.eg-main-wrapper.eg-main-expanded { margin-left: 72px; }

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

/* ★ 헤더 세션 미니 배지 */
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

.eg-badge {
  position: absolute; top: 10px; right: 10px;
  width: 6px; height: 6px; background-color: var(--danger);
  border-radius: 50%;
}

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

.eg-main-content { flex: 1; padding: 24px; min-width: 0; }
.eg-footer {
  padding: 16px 24px; background: var(--bg-surface);
  border-top: 1px solid var(--border-color); color: var(--text-sub); font-size: 13px;
}
.eg-footer-content { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.eg-footer-links { display: flex; gap: 16px; }
.eg-footer-links a { color: var(--text-sub); text-decoration: none; transition: color 0.2s; }
.eg-footer-links a:hover { color: var(--primary); text-decoration: underline; }
.eg-separator { color: var(--border-color); }

/* === 애니메이션 === */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-down-enter-active { animation: slideDown 0.25s ease-out; overflow: hidden; }
.slide-down-leave-active { animation: slideDown 0.2s ease-in reverse; overflow: hidden; }
@keyframes slideDown { from { max-height: 0; opacity: 0; } to { max-height: 400px; opacity: 1; } }
.fade-down-enter-active, .fade-down-leave-active { transition: all 0.2s ease-out; }
.fade-down-enter-from { opacity: 0; transform: translateY(-10px); }
.fade-down-leave-to { opacity: 0; transform: translateY(-5px); }

/* === 반응형 === */
@media (min-width: 769px) { .desktop-only { display: block !important; } }
@media (max-width: 768px) { .desktop-only { display: none !important; } }

@media (max-width: 1024px) {
  .eg-leftnav { width: 72px; }
  .eg-brand-text, .eg-title, .eg-arrow { display: none !important; }
  .eg-icon { margin-right: 0; }
  .eg-main-wrapper { margin-left: 72px; }
  .eg-brand { padding: 0; justify-content: center; }
  .eg-logo-wrapper { gap: 0; }
}

@media (max-width: 768px) {
  .eg-mobile-menu-btn { display: flex; }
  .eg-leftnav {
    transform: translateX(-100%);
    width: 260px !important;
    box-shadow: 10px 0 30px rgba(0,0,0,0.2);
  }
  .eg-leftnav.eg-mobile-open { transform: translateX(0); }
  .eg-leftnav.eg-mobile-open .eg-brand-text,
  .eg-leftnav.eg-mobile-open .eg-title,
  .eg-leftnav.eg-mobile-open .eg-arrow,
  .eg-leftnav.eg-mobile-open .eg-submenu-list { display: block !important; }
  .eg-leftnav.eg-mobile-open .eg-icon { margin-right: 12px; }
  .eg-leftnav.eg-mobile-open .eg-brand { padding: 0 20px; justify-content: flex-start; }
  .eg-leftnav.eg-mobile-open .eg-logo-wrapper { gap: 12px; }
  .eg-main-wrapper, .eg-main-wrapper.eg-main-expanded { margin-left: 0; }
  .eg-appbar { padding: 0 16px; height: 60px; }
  .eg-main-content { padding: 16px; }
  .eg-footer-content { flex-direction: column; text-align: center; gap: 8px; }
  .eg-footer-links { justify-content: center; }
  .eg-dropdown-content { right: 8px; width: calc(100vw - 16px); max-width: 300px; }
  .session-mini-badge { padding: 4px 8px; font-size: 12px; }
}

/* === 멀티 탭 바 스타일 === */
.eg-tab-bar {
  display: flex;
  background-color: var(--bg-hover); /* 회색 배경 */
  padding: 8px 16px 0 16px;
  border-bottom: 1px solid var(--border-color);
  gap: 4px;
  overflow-x: auto;
}
.eg-tab-bar::-webkit-scrollbar { display: none; } /* 스크롤바 숨김 */

.eg-tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background-color: var(--bg-canvas);
  border: 1px solid var(--border-color);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  min-width: 120px;
  max-width: 200px;
  color: var(--text-sub);
  transition: all 0.2s;
  position: relative;
  top: 1px; /* border 겹침 효과 */
}

.eg-tab-item:hover {
  background-color: var(--bg-surface);
}

.eg-tab-item.active {
  background-color: var(--bg-surface); /* 활성화 시 하얀 배경 */
  color: var(--primary);
  font-weight: 600;
  border-top: 2px solid var(--primary); /* 위쪽 강조 선 */
  z-index: 10;
}

.eg-tab-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.eg-tab-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;
}

.eg-tab-close:hover {
  background-color: rgba(239, 68, 68, 0.1);
  color: var(--danger);
}
.eg-tab-close i { font-size: 14px; }
</style>
