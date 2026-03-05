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
const myEmail = authStore.user?.email;
const myManagerNm = authStore.user?.managerNm;

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

const getMenus = () => {
  const companyNo = authStore.user?.cIdx;
  const params = { isMaster: authStore.user?.isMaster, path: route.path };

  axios.get(`/api/v1/menu/${companyNo}`, { params })
      .then(res => {
        const fullTree = buildMenuTree(res.data.data);
        systemItems.value = fullTree.filter(item => item.id === 'system');
        items.value = fullTree.filter(item => item.id !== 'system');
      })
      .catch(err => console.error("메뉴 로딩 실패:", err));
}

onMounted(() => {
  getMenus();
})
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
              <span class="eg-icon"><!--i :class="item.icon"></i--> {{item.icon}}</span>
              <transition name="fade">
                <span v-show="!miniVariant || mobileMenuOpen" class="eg-title">{{ item.title }}</span>
              </transition>
            </NuxtLink>

            <div v-else>
              <div
                  :class="['eg-menu-item eg-group-item', { 'eg-active': activeGroup === item.id || item.child.some(isActive) }]"
                  @click="toggleGroup(item.id)"
              >
                <span class="eg-icon"><!--i :class="item.icon"></i-->{{item.icon}}</span>
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
                      <span class="eg-child-bullet">•</span>
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
                  :class="['eg-menu-item eg-group-item', { 'eg-active': activeGroup === item.id || item.child.some(isActive) }]"
                  @click="toggleGroup(item.id)"
              >
                <span class="eg-icon"><i :class="item.icon"></i></span>
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
                      <span class="eg-child-bullet">•</span>
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

        <!--div class="eg-toolbar-title">
          <h1 class="eg-page-title">{{ route.meta || '대시보드' }}</h1>
        </div-->

        <div class="eg-spacer"></div>

        <button class="eg-icon-btn eg-notification-btn">
          <i class="mdi mdi-bell-outline"></i>
          <span class="eg-badge">3</span>
        </button>

        <div class="eg-profile-menu">
          <button class="eg-profile-btn" @click.stop="toggleProfile">
            <div class="eg-avatar">
              <i class="mdi mdi-account"></i>
            </div>
            <span class="eg-profile-name">{{ myManagerNm }}</span>
            <i class="mdi" :class="isProfileOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'"></i>
          </button>

          <transition name="fade">
            <div class="eg-dropdown-content" v-show="isProfileOpen">
              <div class="eg-dropdown-header">
                <div class="eg-avatar-large">
                  <i class="mdi mdi-account"></i>
                </div>
                <div class="eg-user-info">
                  <strong>{{ myManagerNm }}</strong>
                  <small>{{ myEmail }}</small>
                </div>
              </div>
              <div class="eg-dropdown-divider"></div>
              <NuxtLink to="/mypage" class="eg-dropdown-item" @click="isProfileOpen = false">
                <i class="mdi mdi-account-circle"></i>
                <span>내 정보</span>
              </NuxtLink>
              <NuxtLink to="/system/settings" class="eg-dropdown-item" @click="isProfileOpen = false">
                <i class="mdi mdi-cog"></i>
                <span>환경설정</span>
              </NuxtLink>
              <div class="eg-dropdown-divider"></div>
              <a href="#" @click.prevent="logout" class="eg-dropdown-item eg-logout">
                <i class="mdi mdi-logout"></i>
                <span>로그아웃</span>
              </a>
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

* { box-sizing: border-box; }

.eg-app-container {
  display: flex;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);
  color: #2c3e50;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  overflow-x: hidden; /* 가로 스크롤 방지 */
}

/* === 모바일 오버레이 === */
.eg-sidebar-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(3px);
  z-index: 1099;
}

/* === 사이드바 === */
.eg-leftnav {
  position: fixed;
  top: 0; left: 0;
  height: 100vh;
  width: 260px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1100;
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.eg-leftnav.eg-mini { width: 70px; }

/* 브랜드 */
.eg-brand { padding: 20px 16px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); }
.eg-logo-wrapper { display: flex; align-items: center; gap: 12px; }
.eg-logo-icon {
  width: 40px; height: 40px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 10px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; box-shadow: 0 4px 10px rgba(102, 126, 234, 0.3);
}
.eg-logo-text { color: white; font-weight: 700; font-size: 18px; }
.eg-brand-text { color: white; font-weight: 700; font-size: 18px; white-space: nowrap; }

/* 스크롤 영역 */
.eg-scroll-area { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 12px 0; }
.eg-scroll-area::-webkit-scrollbar { width: 6px; }
.eg-scroll-area::-webkit-scrollbar-track { background: transparent; }
.eg-scroll-area::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 3px; }

/* 메뉴 리스트 */
.eg-menu-list { list-style: none; padding: 0 12px; margin: 0; }
.eg-menu-item {
  display: flex; align-items: center; padding: 12px 14px; margin: 4px 0;
  color: rgba(255, 255, 255, 0.7); text-decoration: none; border-radius: 10px;
  transition: all 0.3s; cursor: pointer; position: relative; overflow: hidden;
}
.eg-menu-item:hover { background: rgba(255, 255, 255, 0.1); color: white; transform: translateX(2px); }
.eg-active { background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%) !important; color: white !important; font-weight: 600; }
.eg-icon { font-size: 20px; width: 24px; text-align: center; flex-shrink: 0; margin-right: 12px; }
.eg-mini .eg-icon { margin-right: 0; }
.eg-title { font-size: 14px; font-weight: 500; white-space: nowrap; }
.eg-arrow { margin-left: auto; transition: transform 0.3s; font-size: 18px; }
.eg-arrow-up { transform: rotate(180deg); }

/* 하위 메뉴 */
.eg-submenu-list { list-style: none; padding: 0; margin: 4px 0; }
.eg-submenu-item {
  display: flex; align-items: center; padding: 10px 14px 10px 48px;
  color: rgba(255, 255, 255, 0.6); text-decoration: none; font-size: 13px; border-radius: 8px; margin: 2px 0;
}
.eg-submenu-item:hover { background: rgba(255, 255, 255, 0.05); color: rgba(255, 255, 255, 0.9); }
.eg-active-child { background: rgba(102, 126, 234, 0.15); color: #a5b4fc; font-weight: 500; }
.eg-child-bullet { margin-right: 8px; font-size: 16px; }

/* 기타 */
.eg-divider { height: 1px; background: rgba(255, 255, 255, 0.1); margin: 12px 16px; }
.eg-nav-footer { padding: 12px; border-top: 1px solid rgba(255, 255, 255, 0.1); }
.eg-toggle-btn { width: 100%; padding: 10px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; color: white; cursor: pointer; transition: all 0.3s; font-size: 18px; }

/* === 메인 콘텐츠 영역 === */
.eg-main-wrapper {
  flex: 1; margin-left: 260px;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex; flex-direction: column; min-width: 0;
}
.eg-main-wrapper.eg-main-expanded { margin-left: 70px; }

/* 헤더 */
.eg-appbar {
  display: flex; align-items: center; padding: 0 32px; height: 70px;
  background: white; border-bottom: 1px solid #e5e7eb; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  position: sticky; top: 0; z-index: 990;
}
.eg-mobile-menu-btn { display: none; margin-right: 16px; margin-left: 0; }
.eg-page-title { font-size: 24px; font-weight: 600; color: #1e293b; margin: 0; white-space: nowrap; }
.eg-spacer { flex: 1; }

/* 헤더 버튼 & 프로필 */
.eg-icon-btn {
  width: 40px; height: 40px; border-radius: 50%; border: none; background: #f8fafc;
  color: #64748b; cursor: pointer; display: none; align-items: center; justify-content: center;
  margin-left: 8px; transition: all 0.2s; position: relative;
}
.eg-icon-btn i { font-size: 20px; }
.eg-badge {
  position: absolute; top: 6px; right: 6px; background: #ef4444; color: white;
  font-size: 10px; font-weight: 600; padding: 2px 5px; border-radius: 10px;
}
.eg-profile-menu { position: relative; margin-left: 12px; }
.eg-profile-btn { display: flex; align-items: center; gap: 10px; padding: 6px 12px 6px 6px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 50px; cursor: pointer; }
.eg-avatar { width: 32px; height: 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; }
.eg-profile-name { font-size: 14px; font-weight: 500; color: #334155; }

/* 드롭다운 */
.eg-dropdown-content {
  position: absolute; right: 0; top: calc(100% + 8px); background: white;
  min-width: 240px; border-radius: 12px; box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15); z-index: 100;
}
.eg-dropdown-header { padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; display: flex; align-items: center; gap: 12px; border-radius: 12px 12px 0 0; }
.eg-avatar-large { width: 48px; height: 48px; background: rgba(255, 255, 255, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px; }
.eg-user-info strong { display: block; font-size: 15px; }
.eg-user-info small { font-size: 12px; opacity: 0.9; }
.eg-dropdown-item { display: flex; align-items: center; gap: 12px; padding: 12px 20px; color: #334155; text-decoration: none; }
.eg-dropdown-item:hover { background: #f8fafc; }
.eg-dropdown-item.eg-logout { color: #ef4444; }

/* 메인 & 푸터 */
.eg-main-content { flex: 1; padding: 32px; min-width: 0; }
.eg-container { margin: 0 auto; width: 100%; min-width: 0; }
.eg-footer { padding: 20px 32px; background: white; border-top: 1px solid #e5e7eb; }
.eg-footer-content { display: flex; justify-content: space-between; align-items: center; color: #64748b; font-size: 13px; }
.eg-footer-links { display: flex; gap: 8px; }
.eg-footer-links a { color: #64748b; text-decoration: none; }
.eg-separator { color: #cbd5e1; }

/* === 애니메이션 === */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-down-enter-active { animation: slideDown 0.3s ease; }
.slide-down-leave-active { animation: slideDown 0.3s ease reverse; }
@keyframes slideDown { from { max-height: 0; opacity: 0; } to { max-height: 500px; opacity: 1; } }

/* ==========================================
   반응형 (Responsive) Media Queries
============================================= */

/* 1. 태블릿 (Tablet) - 사이드바를 무조건 축소시킴 */
@media (max-width: 1024px) {
  .eg-leftnav { width: 70px; }
  .eg-brand-text, .eg-title, .eg-arrow { display: none !important; }
  .eg-icon { margin-right: 0; }
  .eg-main-wrapper { margin-left: 70px; }
}

/* 2. 모바일 (Mobile) - 사이드바 숨김 & 햄버거 메뉴 */
@media (max-width: 768px) {
  /* 상단 햄버거 메뉴 버튼 표시 */
  .eg-mobile-menu-btn { display: flex; }

  /* 사이드바 화면 밖으로 밀어내기 */
  .eg-leftnav {
    transform: translateX(-100%);
    width: 260px !important; /* 모바일에서 열리면 큰 사이즈 유지 */
  }

  /* 햄버거 메뉴 클릭시 화면 안으로 들어옴 */
  .eg-leftnav.eg-mobile-open {
    transform: translateX(0);
  }

  /* 모바일 열림 상태일 때 글자 보이게 강제 */
  .eg-leftnav.eg-mobile-open .eg-brand-text,
  .eg-leftnav.eg-mobile-open .eg-title,
  .eg-leftnav.eg-mobile-open .eg-arrow { display: block !important; }
  .eg-leftnav.eg-mobile-open .eg-icon { margin-right: 12px; }

  /* 하단 접기 버튼 숨김 */
  .desktop-only { display: none; }

  /* 메인 영역 넓이 전체 차지 */
  .eg-main-wrapper, .eg-main-wrapper.eg-main-expanded { margin-left: 0; }

  /* 헤더 & 콘텐츠 패딩 줄임 */
  .eg-appbar { padding: 0 16px; height: 60px; }
  .eg-page-title { font-size: 18px; }
  .eg-profile-name { display: none; } /* 모바일 프사 이름 숨김 */
  .eg-main-content { padding: 16px; }
  .eg-footer { padding: 16px; }

  /* 푸터 세로 정렬 */
  .eg-footer-content { flex-direction: column; gap: 8px; text-align: center; }

  /* 프로필 팝업창 모바일 대응 */
  .eg-dropdown-content { right: 16px; max-width: calc(100vw - 32px); }
}
</style>
