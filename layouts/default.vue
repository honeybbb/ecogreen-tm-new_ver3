<script setup>
import { ref, watch, onMounted } from 'vue';
import { useRoute, navigateTo, useRouter } from '#app';
import { useAuthStore } from '@/stores/auth';
import axios from "axios";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
// === 1. 상태 및 반응성 변수 ===
const isProfileOpen = ref(false);
const miniVariant = ref(false); // PC에서 사이드바 축소 여부
const mobileMenuOpen = ref(false); // ★ 추가: 모바일에서 사이드바 열림 여부
const title = ref('에코그린티엠');
const activeGroup = ref(null);

const cIdx = computed(() => authStore.user?.cIdx ?? null);
const myEmail = computed(() => authStore.user?.email ?? null);
const myManagerNm = computed(() => authStore.user?.managerNm ?? null);

// === 2. 메뉴 데이터 ===
const items = ref([]);
const systemItems = ref([]);

// === 3. 메서드 및 Computed 속성 ===

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

// 현재 경로에 맞는 그룹 자동 열기 & 모바일 메뉴 닫기
watch(() => route.path, (newPath) => {
  const allGroups = [...items.value, ...systemItems.value].filter(item => item.group);
  const foundGroup = allGroups.find(group =>
      group.child.some(child => isActive(child))
  );
  if (foundGroup) {
    activeGroup.value = foundGroup.id;
  }

  // ★ 추가: 페이지 이동 시 모바일 메뉴 자동 닫기
  mobileMenuOpen.value = false;
  isProfileOpen.value = false;
}, { immediate: true });

const logout = () => {
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
</script>

<template>
  <div class="eg-app-container">

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

        <button class="eg-icon-btn eg-notification-btn">
          <i class="mdi mdi-bell-outline"></i>
          <span class="eg-badge"></span>
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
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === CSS 변수 정의 (테마 컬러) === */
:root {
  --eg-bg-canvas: #f8fafc; /* 아주 연한 그레이 베이스 */
  --eg-bg-surface: #ffffff;
  --eg-border-color: #e2e8f0;

  /* 사이드바 (Dark Slate) - 피로감 적은 다크 톤 */
  --eg-nav-bg: #20293a;
  --eg-nav-text: #94a3b8;
  --eg-nav-hover-bg: #2d3748;
  --eg-nav-active-text: #ffffff;
  --eg-nav-active-bg: #2d3748;
  --eg-nav-border: #2d3748;

  /* 포인트 컬러 (Soft Blue) - 그라디언트 제거, 단색 */
  --eg-primary: #3b82f6;
  --eg-primary-dark: #2563eb;
  --eg-text-main: #1e293b;
  --eg-text-sub: #64748b;
}

* { box-sizing: border-box; outline: none; }

.eg-app-container {
  display: flex;
  min-height: 100vh;
  background-color: #f8fafc; /* 가로 스크롤 방지 및 베이스 배경 */
  color: #1e293b;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow-x: hidden;
}

/* === 모바일 오버레이 === */
.eg-sidebar-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.3); /* 너무 어둡지 않게 */
  backdrop-filter: blur(2px);
  z-index: 1099;
}

/* === 사이드바 (왼쪽 네비게이션) === */
.eg-leftnav {
  position: fixed;
  top: 0; left: 0;
  height: 100vh;
  width: 260px;
  background-color: #20293a; /* Solid Color */
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid #2d3748;
}

.eg-leftnav.eg-mini { width: 72px; }

/* 브랜드 (로고 영역) */
.eg-brand {
  height: 70px; /* 헤더와 높이 맞춤 */
  display: flex; align-items: center;
  padding: 0 20px;
  border-bottom: 1px solid #2d3748;
}
.eg-logo-wrapper { display: flex; align-items: center; gap: 12px; text-decoration: none; cursor: pointer; }
.eg-logo-icon {
  width: 36px; height: 36px;
  background-color: #3b82f6; /* Solid Primary */
  border-radius: 8px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.eg-logo-text { color: white; font-weight: 800; font-size: 16px; letter-spacing: -0.5px; }
.eg-brand-text {
  color: white; font-weight: 700; font-size: 17px; white-space: nowrap;
  letter-spacing: -0.3px;
}

/* 스크롤 영역 */
.eg-scroll-area { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 16px 0; }
.eg-scroll-area::-webkit-scrollbar { width: 4px; }
.eg-scroll-area::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 2px; }

/* 메뉴 리스트 */
.eg-menu-list { list-style: none; padding: 0 12px; margin: 0; }
.eg-menu-item {
  display: flex; align-items: center; padding: 12px 16px; margin: 2px 0;
  color: #94a3b8; text-decoration: none; border-radius: 8px;
  transition: all 0.2s ease; cursor: pointer; position: relative;
  font-size: 14px; font-weight: 500;
}

/* Hover & Active State */
.eg-menu-item:hover { background-color: #2d3748; color: white; }

.eg-active {
  background-color: #2d3748 !important; /* 약간 밝은 배경 */
  color: white !important;
  font-weight: 600;
}
/* Active일 때 왼쪽에 포인트 바 추가 */
.eg-active::before {
  content: ''; position: absolute; left: 0; top: 10px; bottom: 10px;
  width: 4px; background-color: #3b82f6; border-radius: 0 4px 4px 0;
}

.eg-active-group { color: white; }

.eg-icon {
  font-size: 20px; width: 24px; text-align: center; flex-shrink: 0; margin-right: 12px;
  display: flex; align-items: center; justify-content: center;
  opacity: 0.8;
}
.eg-menu-item:hover .eg-icon,
.eg-active .eg-icon,
.eg-active-group .eg-icon { opacity: 1; color: #3b82f6; }

.eg-mini .eg-icon { margin-right: 0; }
.eg-title { white-space: nowrap; }
.eg-arrow { margin-left: auto; transition: transform 0.3s; font-size: 18px; opacity: 0.7; }
.eg-arrow-up { transform: rotate(180deg); opacity: 1; }

/* 하위 메뉴 (Submenu) */
.eg-submenu-list { list-style: none; padding: 0; margin: 4px 0; border-left: 1px solid #2d3748; margin-left: 28px; }
.eg-mini .eg-submenu-list { display: none; } /* 미니 상태에선 서브메뉴 숨김 */

.eg-submenu-item {
  display: flex; align-items: center; padding: 9px 16px 9px 20px;
  color: #94a3b8; text-decoration: none; font-size: 13px; border-radius: 6px; margin: 1px 0;
  transition: all 0.2s;
}
.eg-submenu-item:hover { color: white; background-color: rgba(255,255,255,0.03); }
.eg-active-child { color: #3b82f6; font-weight: 600; background-color: rgba(59, 130, 246, 0.08); }

/* 기타 */
.eg-divider { height: 1px; background: #2d3748; margin: 16px 12px; }
.eg-nav-footer { padding: 12px; border-top: 1px solid #2d3748; margin-top: auto; }
.eg-toggle-btn {
  width: 100%; padding: 10px; background: transparent; border: none;
  border-radius: 8px; color: #94a3b8; cursor: pointer; transition: all 0.2s; font-size: 20px;
  display: flex; align-items: center; justify-content: center;
}
.eg-toggle-btn:hover { background-color: #2d3748; color: white; }

/* === 메인 콘텐츠 영역 === */
.eg-main-wrapper {
  flex: 1; margin-left: 260px;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex; flex-direction: column; min-width: 0;
  background-color: #f8fafc;
}
.eg-main-wrapper.eg-main-expanded { margin-left: 72px; }

/* --- 헤더 (Appbar) --- */
.eg-appbar {
  display: flex; align-items: center; padding: 0 24px; height: 70px;
  background-color: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px); /* 트렌디한 블러 효과 */
  border-bottom: 1px solid #e2e8f0;
  position: sticky; top: 0; z-index: 990;
}
.eg-mobile-menu-btn { display: none; margin-right: 12px; margin-left: -8px; background: transparent;}
.eg-page-title { font-size: 20px; font-weight: 700; color: #1e293b; margin: 0; white-space: nowrap; letter-spacing: -0.5px; }
.eg-spacer { flex: 1; }

/* 헤더 버튼 & 프로필 */
.eg-icon-btn {
  width: 40px; height: 40px; border-radius: 10px; border: 1px solid transparent; background: transparent;
  color: #64748b; cursor: pointer; display: flex; align-items: center; justify-content: center;
  margin-left: 4px; transition: all 0.2s; position: relative;
}
.eg-icon-btn:hover { background-color: #f1f5f9; color: #1e293b; border-color: #e2e8f0; }
.eg-icon-btn i { font-size: 22px; }

/* 알림 배지 - 원색 빼고 작게 */
.eg-badge {
  position: absolute; top: 10px; right: 10px;
  width: 6px; height: 6px; background-color: #ef4444;
  border-radius: 50%;
}

.eg-profile-menu { position: relative; margin-left: 8px; }
.eg-profile-btn {
  display: flex; align-items: center; gap: 10px; padding: 6px 10px 6px 6px;
  background: transparent; border: 1px solid transparent; border-radius: 12px; cursor: pointer;
  transition: all 0.2s;
}
.eg-profile-btn:hover { background-color: #f1f5f9; border-color: #e2e8f0; }

.eg-avatar {
  width: 36px; height: 36px;
  background-color: #e2e8f0; /* 무채색 배경 */
  color: #475569; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
  font-weight: 600; font-size: 18px; /* 아이콘 폰트 사이즈 조정 */
}
.eg-profile-name { font-size: 14px; font-weight: 600; color: #334155; }
.eg-profile-btn .mdi-chevron-down, .eg-profile-btn .mdi-chevron-up { color: #94a3b8; font-size: 18px;}

/* --- 프로필 드롭다운 (클린 디자인) --- */
.eg-dropdown-content {
  position: absolute; right: 0; top: calc(100% + 12px);
  background: white; min-width: 250px; border-radius: 16px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08); /* 부드러운 그림자 */
  border: 1px solid #e2e8f0; overflow: hidden; z-index: 100;
}
.eg-dropdown-header { padding: 20px; background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; }
.eg-user-info strong { display: block; font-size: 15px; color: #1e293b; font-weight: 700; margin-bottom: 2px;}
.eg-user-info small { font-size: 13px; color: #64748b; font-weight: 400; }

.eg-dropdown-list { padding: 8px; }
.eg-dropdown-item {
  display: flex; align-items: center; gap: 12px; padding: 10px 14px;
  color: #475569; text-decoration: none; font-size: 14px; font-weight: 500;
  border-radius: 10px; transition: all 0.2s;
}
.eg-dropdown-item:hover { background-color: #f1f5f9; color: #1e293b; }
.eg-dropdown-item i { font-size: 18px; color: #94a3b8; }
.eg-dropdown-item:hover i { color: #3b82f6; }

.eg-dropdown-divider { height: 1px; background: #e2e8f0; margin: 8px; }
.eg-dropdown-item.eg-logout { color: #ef4444; }
.eg-dropdown-item.eg-logout:hover { background-color: #fef2f2; }
.eg-dropdown-item.eg-logout i { color: #ef4444; opacity: 0.7; }

/* --- 메인 콘텐츠 & 푸터 --- */
.eg-main-content { flex: 1; padding: 24px; min-width: 0; }
@media (min-width: 1280px) { .eg-container { max-width: 1200px; margin: 0 auto; } } /* 와이드 화면 대응 */

.eg-footer {
  padding: 16px 24px; background: white;
  border-top: 1px solid #e2e8f0; color: #64748b; font-size: 13px;
}
.eg-footer-content { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.eg-footer-links { display: flex; gap: 16px; }
.eg-footer-links a { color: #64748b; text-decoration: none; transition: color 0.2s; }
.eg-footer-links a:hover { color: #3b82f6; text-decoration: underline; }
.eg-separator { color: #e2e8f0; }

/* === 애니메이션 === */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* 서브메뉴 슬라이드 */
.slide-down-enter-active { animation: slideDown 0.25s ease-out; overflow: hidden; }
.slide-down-leave-active { animation: slideDown 0.2s ease-in reverse; overflow: hidden; }
@keyframes slideDown { from { max-height: 0; opacity: 0; } to { max-height: 400px; opacity: 1; } }

/* 드롭다운 Fade-Down */
.fade-down-enter-active, .fade-down-leave-active { transition: all 0.2s ease-out; }
.fade-down-enter-from { opacity: 0; transform: translateY(-10px); }
.fade-down-leave-to { opacity: 0; transform: translateY(-5px); }

/* === 반응형 (Responsive) Utility === */
@media (min-width: 769px) {
  .desktop-only { display: block !important; }
}
@media (max-width: 768px) {
  .desktop-only { display: none !important; }
}

/* ==========================================
   반응형 Media Queries
============================================= */

/* 1. 태블릿 (Tablet) */
@media (max-width: 1024px) {
  .eg-leftnav { width: 72px; }
  .eg-brand-text, .eg-title, .eg-arrow { display: none !important; }
  .eg-icon { margin-right: 0; }
  .eg-main-wrapper { margin-left: 72px; }
  .eg-brand { padding: 0; justify-content: center; }
  .eg-logo-wrapper { gap: 0; }
}

/* 2. 모바일 (Mobile) */
@media (max-width: 768px) {
  .eg-mobile-menu-btn { display: flex; }

  .eg-leftnav {
    transform: translateX(-100%);
    width: 260px !important; /* 열렸을 땐 크게 */
    box-shadow: 10px 0 30px rgba(0,0,0,0.1);
  }

  .eg-leftnav.eg-mobile-open { transform: translateX(0); }

  /* 모바일 열림 상태일 때 요소 강제 표시 */
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
}
</style>
