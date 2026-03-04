<script setup>
import { ref, watch, onMounted } from 'vue';
import { useRoute, navigateTo, useRouter } from '#app';
import { useAuthStore } from '@/stores/auth';
import axios from "axios";

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

// === 1. 상태 및 반응성 변수 ===
const isProfileOpen = ref(false); // 프로필 드롭다운 상태
const miniVariant = ref(false);
const title = ref('에코그린티엠');
const activeGroup = ref(null);
const myEmail = authStore.user?.email;
const myManagerNm = authStore.user?.managerNm;

// === 2. 메뉴 데이터 ===
const items = ref([
    /*
  {
    id: 'home',
    icon: 'mdi-view-dashboard',
    title: '대시보드',
    to: '/'
  },
  {
    id: 'member',
    icon: 'mdi-account-group',
    title: '직원관리',
    group: true,
    child: [
      { title: '인사코드설정', to: '/member/settings', icon: 'mdi-cog' },
      { title: '직원명부관리', to: '/member/list', icon: 'mdi-account-multiple' },
    ]
  },
  {
    id: 'work',
    icon: 'mdi-clock-outline',
    title: '근태관리',
    group: true,
    child: [
      { title: '직원출근관리', to: '/work', icon: 'mdi-clock-check' },
      { title: '직원연차관리', to: '/annual/request', icon: 'mdi-calendar-month' },
    ]
  },
  {
    id: 'payroll',
    icon: 'mdi-cash-multiple',
    title: '급여관리',
    group: true,
    child: [
      { title: '기초급여정보', to: '/settings/payroll', icon: 'mdi-database' },
      { title: '공제요율설정', to: '/settings/tax', icon: 'mdi-percent' },
      { title: '직원급여정보', to: '/member/salary', icon: 'mdi-account-cash' },
      { title: '직원급여계산', to: '/member/payroll', icon: 'mdi-calculator' }
    ]
  },
  {
    id: 'site',
    icon: 'mdi-map-marker',
    title: '현장관리',
    to: '/site/list'
  },
  {
    id: 'equipment',
    icon: 'mdi-tools',
    title: '장비관리',
    to: '/equipment/list'
  },
  {
    id: 'supplies',
    icon: 'mdi-package-variant',
    title: '물품관리',
    group: true,
    child: [
      { title: '품목/단가 설정', to: '/supplies/settings', icon: 'mdi-tag' },
      { title: '피복 신청 관리', to: '/supplies/uniform', icon: 'mdi-tshirt-crew' },
      { title: '용품 신청 관리', to: '/supplies/item', icon: 'mdi-package' },
    ]
  },
  {
    id: 'settlement',
    icon: 'mdi-currency-krw',
    title: '정산관리',
    group: true,
    child: [
      { title: '정산내역', to: '/settlement', icon: 'mdi-file-document' },
      { title: '연차추계액', to: '/annual/cost', icon: 'mdi-calendar-clock' },
      { title: '퇴직금추계액', to: '/member/retirement', icon: 'mdi-wallet' },
    ]
  },
  {
    id: 'document',
    icon: 'mdi-folder-open',
    title: '문서관리',
    group: true,
    child: [
      { title: '업무문서관리', to: '/form', icon: 'mdi-file-multiple' },
      { title: '계약문서관리', to: '/contract', icon: 'mdi-file-sign' },
    ]
  },
  {
    id: 'notice',
    icon: 'mdi-bullhorn',
    title: '공지사항',
    to: '/notice'
  },

     */
]);

const systemItems = ref([
  {
    id: 'settings',
    icon: 'mdi-cog',
    title: '시스템설정',
    group: true,
    child: [
      { title: '기본설정', to: '/system/settings', icon: 'mdi-cog-outline' },
      { title: '권한관리', to: '/system/permission', icon: 'mdi-shield-account' },
    ]
  },
]);

// === 3. 메서드 및 Computed 속성 ===

// 활성 메뉴 체크
const isActive = (item) => {
  const path = route.path || '';
  const to = item?.to || '';
  if (to === '/') return path === '/';
  return path.startsWith(to.replace(/\/+$/, ''));
};

const toggleProfile = () => {
  isProfileOpen.value = !isProfileOpen.value;
};

// 그룹 메뉴 토글
const toggleGroup = (itemId) => {
  if (activeGroup.value === itemId) {
    activeGroup.value = null;
  } else {
    activeGroup.value = itemId;
  }
};

// 현재 경로에 맞는 그룹 자동 열기
watch(() => route.path, (newPath) => {
  const allGroups = [...items.value, ...systemItems.value].filter(item => item.group);
  const foundGroup = allGroups.find(group =>
      group.child.some(child => isActive(child))
  );
  if (foundGroup) {
    activeGroup.value = foundGroup.id;
  }
}, { immediate: true });

const logout = () => {
  navigateTo('/login');
};

// 사이드바 토글
const toggleSidebar = () => {
  miniVariant.value = !miniVariant.value;
};

const buildMenuTree = (flatList) => {
  if (!flatList || !Array.isArray(flatList)) return [];

  const tree = [];
  const map = {};

  // 1. 먼저 모든 아이템을 Map에 등록 (덮어쓰지 않도록 key 사용)
  flatList.forEach(item => {
    map[item.menuNo] = {
      id: item.menuKey || `menu-${item.menuNo}`, // id 설정
      icon: item.menuIcon,
      title: item.menuNm,
      to: item.menuPath,
      group: item.groupFl === 'Y',
      child: [], // 자식 배열 초기화
      sort: item.sort,
      parentNo: item.parentNo // 관계 파악을 위해 임시 저장
    };
  });

  // 2. 부모-자식 관계 연결
  flatList.forEach(item => {
    const currentItem = map[item.menuNo];
    if (item.parentNo && map[item.parentNo]) {
      // 부모가 있으면 부모의 child 배열에 추가
      map[item.parentNo].child.push(currentItem);
    } else {
      // 부모가 없으면 최상위 트리(Root)에 추가
      tree.push(currentItem);
    }
  });

  // 3. 정렬 (부모들 정렬 및 각 부모 안의 자식들도 정렬)
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
  const params = { isMaster: authStore.user?.isMaster };

  axios.get(`/api/v1/menu/${companyNo}`, { params })
      .then(res => {
        // 1. 먼저 전체 메뉴 트리를 빌드합니다.
        const fullTree = buildMenuTree(res.data.data);

        // 2. id가 'system'인 것만 골라 systemItems에 넣습니다.
        systemItems.value = fullTree.filter(item => item.id === 'system');

        // 3. id가 'system'이 아닌 나머지를 items에 넣습니다.
        items.value = fullTree.filter(item => item.id !== 'system');

        console.log('일반 메뉴:', items.value);
        console.log('시스템 메뉴:', systemItems.value);
      })
      .catch(err => {
        console.error("메뉴 로딩 실패:", err);
      });
}

onMounted(() => {
  getMenus();
})
</script>

<template>
  <div class="eg-app-container">
    <!-- 사이드바 -->
    <nav
        :class="['eg-leftnav', { 'eg-mini': miniVariant }]"
    >
      <!-- 브랜드 영역 -->
      <div class="eg-brand">
        <div class="eg-logo-wrapper">
          <div class="eg-logo-icon">
            <span class="eg-logo-text">EG</span>
          </div>
          <transition name="fade">
            <span v-show="!miniVariant" class="eg-brand-text">{{ title }}</span>
          </transition>
        </div>
      </div>

      <!-- 메뉴 영역 -->
      <div class="eg-scroll-area">
        <!-- 업무 메뉴 -->
        <ul class="eg-menu-list">
          <li v-for="item in items" :key="item.id">
            <!-- 일반 메뉴 -->
            <NuxtLink
                v-if="!item.group"
                :to="item.to"
                :class="['eg-menu-item', { 'eg-active': isActive(item) }]"
            >
              <span class="eg-icon">{{ item.icon }}</span>
              <transition name="fade">
                <span v-show="!miniVariant" class="eg-title">{{ item.title }}</span>
              </transition>
            </NuxtLink>

            <!-- 그룹 메뉴 -->
            <div v-else>
              <div
                  :class="['eg-menu-item eg-group-item', {
                    'eg-active': activeGroup === item.id || item.child.some(isActive)
                  }]"
                  @click="toggleGroup(item.id)"
              >
                <span class="eg-icon">{{ item.icon }}</span>
                <transition name="fade">
                  <span v-show="!miniVariant" class="eg-title">{{ item.title }}</span>
                </transition>
                <transition name="fade">
                  <span
                      v-show="!miniVariant"
                      class="eg-arrow"
                      :class="{ 'eg-arrow-up': activeGroup === item.id }"
                  >
                    <i class="mdi mdi-chevron-down"></i>
                  </span>
                </transition>
              </div>

              <!-- 하위 메뉴 -->
              <transition name="slide-down">
                <ul v-if="!miniVariant && activeGroup === item.id" class="eg-submenu-list">
                  <li v-for="child in item.child" :key="child.to">
                    <NuxtLink
                        :to="child.to"
                        :class="['eg-submenu-item', { 'eg-active-child': isActive(child) }]"
                    >
                      <span class="eg-child-bullet">•</span>
                      <span class="eg-child-title">{{ child.title }}</span>
                    </NuxtLink>
                  </li>
                </ul>
              </transition>
            </div>
          </li>
        </ul>

        <!-- 구분선 -->
        <div v-if="systemItems.length > 0" class="eg-divider"></div>

        <!-- 시스템 메뉴 -->
        <ul class="eg-menu-list" v-if="systemItems.length > 0">
          <li v-for="item in systemItems" :key="item.id">
            <div v-if="item.group">
              <div
                  :class="['eg-menu-item eg-group-item', {
                    'eg-active': activeGroup === item.id || item.child.some(isActive)
                  }]"
                  @click="toggleGroup(item.id)"
              >
                <!--span class="eg-icon">{{ item.icon }}</span-->
                <transition name="fade">
                  <span v-show="!miniVariant" class="eg-title">{{ item.title }}</span>
                </transition>
                <transition name="fade">
                  <span
                      v-show="!miniVariant"
                      class="eg-arrow"
                      :class="{ 'eg-arrow-up': activeGroup === item.id }"
                  >
                    <i class="mdi mdi-chevron-down"></i>
                  </span>
                </transition>
              </div>

              <transition name="slide-down">
                <ul v-if="!miniVariant && activeGroup === item.id" class="eg-submenu-list">
                  <li v-for="child in item.child" :key="child.to">
                    <NuxtLink
                        :to="child.to"
                        :class="['eg-submenu-item', { 'eg-active-child': isActive(child) }]"
                    >
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

      <!-- 사이드바 하단 -->
      <div class="eg-nav-footer">
        <button @click="toggleSidebar" class="eg-toggle-btn">
          <i :class="['mdi', miniVariant ? 'mdi-chevron-right' : 'mdi-chevron-left']"></i>
        </button>
      </div>
    </nav>

    <!-- 메인 콘텐츠 영역 -->
    <div class="eg-main-wrapper" :class="{ 'eg-main-expanded': miniVariant }">
      <!-- 헤더 -->
      <header class="eg-appbar">
        <div class="eg-toolbar-title">
          <h1 class="eg-page-title">{{ route.meta.title || '대시보드' }}</h1>
        </div>
        <div class="eg-spacer"></div>

        <!-- 알림 버튼 -->
        <button class="eg-icon-btn eg-notification-btn">
          <i class="mdi mdi-bell-outline"></i>
          <span class="eg-badge">3</span>
        </button>

        <!-- 프로필 메뉴 -->
        <div class="eg-profile-menu">
          <button class="eg-profile-btn" @click.stop="toggleProfile">
            <div class="eg-avatar">
              <i class="mdi mdi-account"></i>
            </div>
            <span class="eg-profile-name">{{ myManagerNm }}</span>
            <i class="mdi" :class="isProfileOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'"></i>
          </button>

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
        </div>
      </header>

      <!-- 메인 콘텐츠 -->
      <main class="eg-main-content">
        <div class="eg-container">
          <slot />
        </div>
      </main>

      <!-- 푸터 -->
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
/* Material Design Icons 폰트 임포트 */
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 기본 설정 === */
* {
  box-sizing: border-box;
}

/* === 레이아웃 컨테이너 === */
.eg-app-container {
  display: flex;
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #e8ecf1 100%);
  color: #2c3e50;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}

/* === 사이드바 === */
.eg-leftnav {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 260px;
  background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
  transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1000;
  box-shadow: 4px 0 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.eg-leftnav.eg-mini {
  width: 70px;
}

/* 브랜드 영역 */
.eg-brand {
  padding: 20px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.eg-logo-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.eg-logo-icon {
  width: 40px;
  height: 40px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 4px 10px rgba(102, 126, 234, 0.3);
}

.eg-logo-text {
  color: white;
  font-weight: 700;
  font-size: 18px;
}

.eg-brand-text {
  color: white;
  font-weight: 700;
  font-size: 18px;
  letter-spacing: -0.5px;
  white-space: nowrap;
}

/* 스크롤 영역 */
.eg-scroll-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 0;
}

.eg-scroll-area::-webkit-scrollbar {
  width: 6px;
}

.eg-scroll-area::-webkit-scrollbar-track {
  background: transparent;
}

.eg-scroll-area::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.eg-scroll-area::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* 메뉴 리스트 */
.eg-menu-list {
  list-style: none;
  padding: 0 12px;
  margin: 0;
}

/* 메뉴 아이템 */
.eg-menu-item {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  margin: 4px 0;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  border-radius: 10px;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  position: relative;
  overflow: hidden;
}

.eg-menu-item::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  width: 4px;
  height: 100%;
  background: transparent;
  transition: background 0.3s;
}

.eg-menu-item:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  transform: translateX(2px);
}

/* 활성 메뉴 */
.eg-active {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.2) 0%, rgba(118, 75, 162, 0.2) 100%) !important;
  color: white !important;
  font-weight: 600;
}

.eg-active::before {
  background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
}

/* 아이콘 */
.eg-icon {
  font-size: 20px;
  width: 24px;
  text-align: center;
  flex-shrink: 0;
  margin-right: 12px;
}

.eg-mini .eg-icon {
  margin-right: 0;
}

/* 타이틀 */
.eg-title {
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
}

/* 화살표 */
.eg-arrow {
  margin-left: auto;
  transition: transform 0.3s;
  font-size: 18px;
}

.eg-arrow-up {
  transform: rotate(180deg);
}

/* 하위 메뉴 */
.eg-submenu-list {
  list-style: none;
  padding: 0;
  margin: 4px 0;
}

.eg-submenu-item {
  display: flex;
  align-items: center;
  padding: 10px 14px 10px 48px;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  font-size: 13px;
  border-radius: 8px;
  transition: all 0.2s;
  margin: 2px 0;
}

.eg-submenu-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.9);
  transform: translateX(2px);
}

.eg-active-child {
  background: rgba(102, 126, 234, 0.15);
  color: #a5b4fc;
  font-weight: 500;
}

.eg-child-bullet {
  margin-right: 8px;
  font-size: 16px;
}

/* 구분선 */
.eg-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 12px 16px;
}

/* 사이드바 하단 */
.eg-nav-footer {
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.eg-toggle-btn {
  width: 100%;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: white;
  cursor: pointer;
  transition: all 0.3s;
  font-size: 18px;
}

.eg-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* === 메인 콘텐츠 영역 === */
.eg-main-wrapper {
  flex: 1;
  margin-left: 260px;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.eg-main-wrapper.eg-main-expanded {
  margin-left: 70px;
}

/* 헤더 */
.eg-appbar {
  display: flex;
  align-items: center;
  padding: 0 32px;
  height: 70px;
  background: white;
  border-bottom: 1px solid #e5e7eb;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  position: sticky;
  top: 0;
  z-index: 999;
}

.eg-toolbar-title {
  display: flex;
  align-items: center;
}

.eg-page-title {
  font-size: 24px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
}

.eg-spacer {
  flex: 1;
}

/* 아이콘 버튼 */
.eg-icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: #f8fafc;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: 8px;
  transition: all 0.2s;
  position: relative;
}

.eg-icon-btn:hover {
  background: #e2e8f0;
  color: #334155;
}

.eg-icon-btn i {
  font-size: 20px;
}

/* 알림 배지 */
.eg-notification-btn .eg-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #ef4444;
  color: white;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 5px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

/* 프로필 메뉴 */
.eg-profile-menu {
  position: relative;
  margin-left: 12px;
}

.eg-profile-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 12px 6px 6px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 50px;
  cursor: pointer;
  transition: all 0.2s;
}

.eg-profile-btn:hover {
  background: #e2e8f0;
  border-color: #cbd5e1;
}

.eg-avatar {
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.eg-avatar i {
  font-size: 18px;
}

.eg-profile-name {
  font-size: 14px;
  font-weight: 500;
  color: #334155;
}

/* 드롭다운 */
.eg-dropdown-content {
  display: block;
  position: absolute;
  right: 0;
  top: calc(100% + 8px);
  background: white;
  min-width: 240px;
  border-radius: 12px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
  z-index: 100;
  overflow: hidden;
}

@keyframes dropdownFadeIn {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.eg-dropdown-header {
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  gap: 12px;
}

.eg-avatar-large {
  width: 48px;
  height: 48px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.eg-avatar-large i {
  font-size: 24px;
}

.eg-user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.eg-user-info strong {
  font-size: 15px;
}

.eg-user-info small {
  font-size: 12px;
  opacity: 0.9;
}

.eg-dropdown-divider {
  height: 1px;
  background: #e5e7eb;
  margin: 8px 0;
}

.eg-dropdown-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  color: #334155;
  text-decoration: none;
  transition: background 0.2s;
}

.eg-dropdown-item:hover {
  background: #f8fafc;
}

.eg-dropdown-item i {
  font-size: 18px;
  color: #64748b;
}

.eg-dropdown-item.eg-logout {
  color: #ef4444;
}

.eg-dropdown-item.eg-logout i {
  color: #ef4444;
}

/* 메인 콘텐츠 */
.eg-main-content {
  flex: 1;
  padding: 32px;
}

.eg-container {
  /*max-width: 1400px;*/
  margin: 0 auto;
}

/* 푸터 */
.eg-footer {
  padding: 20px 32px;
  background: white;
  border-top: 1px solid #e5e7eb;
}

.eg-footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #64748b;
  font-size: 13px;
}

.eg-footer-links {
  display: flex;
  gap: 8px;
  align-items: center;
}

.eg-footer-links a {
  color: #64748b;
  text-decoration: none;
  transition: color 0.2s;
}

.eg-footer-links a:hover {
  color: #334155;
}

.eg-separator {
  color: #cbd5e1;
}

/* === 애니메이션 === */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.slide-down-enter-active {
  animation: slideDown 0.3s ease;
}

.slide-down-leave-active {
  animation: slideDown 0.3s ease reverse;
}

@keyframes slideDown {
  from {
    max-height: 0;
    opacity: 0;
  }
  to {
    max-height: 500px;
    opacity: 1;
  }
}

/* === 반응형 === */
@media (max-width: 768px) {
  .eg-leftnav {
    width: 70px;
  }

  .eg-main-wrapper {
    margin-left: 70px;
  }

  .eg-appbar {
    padding: 0 16px;
  }

  .eg-main-content {
    padding: 20px 16px;
  }

  .eg-page-title {
    font-size: 20px;
  }

  .eg-profile-name {
    display: none;
  }

  .eg-footer-content {
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }
}
</style>
