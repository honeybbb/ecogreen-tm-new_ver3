<script setup>
import { ref, computed } from 'vue';
import { useRoute, navigateTo } from 'nuxt/app';

const route = useRoute();
const router = useRouter();

// === 1. 상태 및 반응성 변수 ===
const miniVariant = ref(false);
const title = ref('에코그린티엠');
// 현재 활성화된 그룹 메뉴 ID를 저장하여 드롭다운 상태를 관리
const activeGroup = ref(null);

// === 2. 메뉴 데이터 (그룹 메뉴 구조 반영) ===
const items = ref([
  { id: 'home', icon: '🏠', title: '홈', to: '/' },
  {
    id: 'member',
    icon: '🧑‍💼',
    title: '직원관리',
    group: true, // 그룹 메뉴임을 명시
    child: [
      { title: '인사코드설정', to: '/member/settings' },
      { title: '직원명부관리', to: '/member/list' },
    ]
  },
  {
    id: 'work',
    icon: '🕒',
    title: '근태관리',
    group: true,
    child: [
      { title: '직원출근관리', to: '/work' },
      { title: '직원연차관리', to: '/annual/request' },
    ]
  },
  {
    id: 'payroll',
    icon: '💸',
    title: '급여관리',
    group: true,
    child: [
      { title: '기초급여정보', to: '/settings/payroll' },
      { title: '공제요율설정', to: '/settings/tax' },
      { title: '직원급여정보', to: '/member/salary' },
      { title: '직원급여계산', to: '/member/payroll' }
    ]
  },
  // { id: 'work', icon: '🕒', title: '근태관리', to: '/work' },
  // { id: 'site', icon: '📍', title: '현장관리', to: '/site' },
  { id: 'site', icon: '📍', title: '현장관리', to: '/site' },
  { id: 'equipment', icon: '🛠️', title: '장비관리', to: '/equipment' },
  {
    id: 'supplies',
    icon: '📦', // 아이콘 변경 추천 (박스, 창고 등)
    title: '물품관리', // 또는 '자재관리', '지급품관리'
    group: true,
    child: [
      { title: '품목/단가 설정', to: '/supplies/settings' }, // 관리자가 피복/청소용품 종류 및 가격 등록
      { title: '피복 신청 관리', to: '/supplies/uniform' },  // 직원들이 신청한 피복 승인/반려
      { title: '용품 신청 관리', to: '/supplies/item' }, // 현장별 청소용품 신청 내역
      // { title: '재고 현황', to: '/supplies/inventory' }, // (필요 시) 재고 관리
    ]
  },
  {
    id: 'settlement',
    icon: '💰',
    title: '정산관리',
    group: true,
    child: [
      { title: '정산내역', to: '/settlement' },
      { title: '연차추계액', to: '/annual/cost' },
      { title: '퇴직금추계액', to: '/member/retirement' },
      // { title: '수수료관리', to: '/settlement/fee' },
    ]
  },
  {
    id: 'document',
    icon: '📂',
    title: '문서관리',
    // to: '/form'
    group: true,
    child: [
      { title: '업무문서관리', to:'/form' },
      { title: '계약문서관리', to:'/contract' },
    ]
  },
  { id: 'notice', icon: '📢', title: '공지사항', to: '/notice' },
  // { id: 'data', icon: '📎', title: '자료실', to: '/data' },
]);

const systemItems = ref([
    /*
  {
    id: 'settings',
    icon: '⚙️',
    title: '설정',
    group: true,
    child: [
      // { title: '기준근무일수 설정', to: '/settings/config' },
    ]
  },

     */
]);

// === 3. 메서드 및 Computed 속성 ===

// NuxtLink가 현재 경로인지 확인
const isActive = (item) => {
  const path = route.path || '';
  const to = item?.to || '';
  if (to === '/') return path === '/';
  // 해당 to 경로로 시작하는 모든 하위 경로를 포함하여 활성화
  return path.startsWith(to.replace(/\/+$/, ''));
};

// 그룹 메뉴 클릭 시 드롭다운 토글
const toggleGroup = (itemId) => {
  if (activeGroup.value === itemId) {
    activeGroup.value = null; // 현재 열려있다면 닫기
  } else {
    activeGroup.value = itemId; // 다른 그룹 열기
  }
};

// 현재 경로가 속한 그룹을 자동으로 열어주기
watch(() => route.path, (newPath) => {
  const allGroups = [...items.value, ...systemItems.value].filter(item => item.group);

  // 현재 경로에 해당하는 그룹 ID 찾기
  const foundGroup = allGroups.find(group =>
      group.child.some(child => isActive(child))
  );

  if (foundGroup) {
    activeGroup.value = foundGroup.id;
  }
}, { immediate: true }); // 즉시 실행하여 초기 로드 시 반영

const logout = () => {
  navigateTo('/login');
};
</script>

<template>
  <div class="eg-app-container">
    <nav
        :class="['eg-leftnav', { 'eg-mini': miniVariant }]"
        :style="{ width: miniVariant ? '60px' : '240px' }"
    >
      <div class="eg-brand">
        <span v-show="!miniVariant" class="eg-brand-text">{{ title }}</span>
      </div>

      <div class="eg-scroll-area">
        <ul class="eg-menu-list">
          <!--li class="eg-category-title" v-show="!miniVariant">업무</li-->

          <li v-for="(item, i) in items" :key="item.id">

            <NuxtLink
                v-if="!item.group"
                :to="item.to"
                :class="['eg-menu-item', { 'eg-active': isActive(item) }]"
            >
              <span class="eg-icon">{{ item.icon }}</span>
              <span v-show="!miniVariant" class="eg-title">{{ item.title }}</span>
            </NuxtLink>

            <div v-else>
              <div
                  :class="['eg-menu-item eg-group-item', { 'eg-active': activeGroup === item.id || item.child.some(isActive) }]"
                  @click="toggleGroup(item.id)"
              >
                <span class="eg-icon">{{ item.icon }}</span>
                <span v-show="!miniVariant" class="eg-title">{{ item.title }}</span>
                <span v-show="!miniVariant" class="eg-arrow">{{ activeGroup === item.id ? '▲' : '▼' }}</span>
              </div>

              <transition name="menu-slide">
                <ul v-if="!miniVariant && activeGroup === item.id" class="eg-submenu-list">
                  <li v-for="child in item.child" :key="child.to">
                    <NuxtLink
                        :to="child.to"
                        :class="['eg-submenu-item', { 'eg-active-child': isActive(child) }]"
                    >
                      <span class="eg-child-title">{{ child.title }}</span>
                    </NuxtLink>
                  </li>
                </ul>
              </transition>
            </div>
          </li>
        </ul>

        <div class="eg-divider"></div>

        <ul class="eg-menu-list">
          <!--li class="eg-category-title" v-show="!miniVariant">시스템</li-->
          <li v-for="(item, i) in systemItems" :key="item.id">
            <div v-if="item.group">
              <div
                  :class="['eg-menu-item eg-group-item', { 'eg-active': activeGroup === item.id || item.child.some(isActive) }]"
                  @click="toggleGroup(item.id)"
              >
                <span class="eg-icon">{{ item.icon }}</span>
                <span v-show="!miniVariant" class="eg-title">{{ item.title }}</span>
                <span v-show="!miniVariant" class="eg-arrow">{{ activeGroup === item.id ? '▲' : '▼' }}</span>
              </div>

              <transition name="menu-slide">
                <ul v-if="!miniVariant && activeGroup === item.id" class="eg-submenu-list">
                  <li v-for="child in item.child" :key="child.to">
                    <NuxtLink
                        :to="child.to"
                        :class="['eg-submenu-item', { 'eg-active-child': isActive(child) }]"
                    >
                      <span class="eg-child-title">{{ child.title }}</span>
                    </NuxtLink>
                  </li>
                </ul>
              </transition>
            </div>
          </li>
        </ul>
      </div>

      <div class="eg-nav-footer">
        <button @click.stop="miniVariant = !miniVariant" class="eg-toggle-btn">
          <span class="eg-icon">{{ miniVariant ? '▶' : '◀' }}</span>
        </button>
      </div>
    </nav>

    <div class="eg-main-wrapper" :style="{ marginLeft: miniVariant ? '60px' : '240px' }">

      <header class="eg-appbar">
        <!--div class="eg-toolbar-title">에코그린티엠 개발중 ..</div-->
        <div class="eg-spacer"></div>

        <div class="eg-profile-menu">
          <button class="eg-profile-btn">
            관리자
          </button>
          <div class="eg-dropdown-content">
            <a href="/mypage">내 정보</a>
            <!--a href="#">환경설정</a-->
            <a href="#" @click.prevent="logout">로그아웃</a>
          </div>
        </div>
      </header>

      <main class="eg-main-content">
        <div class="eg-container">
          <slot />
        </div>
      </main>

      <footer class="eg-footer">
        <span>&copy; {{ new Date().getFullYear() }} EcoGreen TM</span>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* Vuetify 스타일을 사용하지 않고 직접 스타일을 작성합니다. */

/* === 레이아웃 기본 설정 === */
.eg-app-container {
  display: flex;
  min-height: 100vh;
  background-color: #f7f8fa; /* 메인 배경색 */
  color: #374151; /* 기본 텍스트 색상 */
}

/* === 사이드바 (Left Nav) === */
.eg-leftnav {
  position: fixed;
  top: 0;
  left: 0;
  height: 100vh;
  width: 240px; /* 기본 너비 */
  background-color: #ffffff;
  border-right: 1px solid #e5e7eb;
  transition: width 0.3s ease;
  z-index: 1000;
  box-shadow: 2px 0 5px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
}

.eg-brand {
  padding: 10px 16px;
  display: flex;
  align-items: center;
  cursor: pointer;
  height: 64px; /* 헤더 높이와 맞춤 */
}
.eg-brand-text {
  font-weight: 700;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  font-size: 1.1rem;
}

/* 메뉴 리스트와 스크롤 영역 */
.eg-scroll-area {
  overflow-y: auto;
  flex-grow: 1;
  padding: 10px 0;
}
.eg-menu-list {
  list-style: none;
  padding: 0 10px;
}
.eg-category-title {
  font-size: 0.75rem;
  color: #6b7280;
  padding: 8px 10px 4px 10px;
  text-transform: uppercase;
}
.eg-divider {
  border-top: 1px solid #e5e7eb;
  margin: 10px 0;
}

/* 메뉴 아이템 공통 스타일 */
.eg-menu-item {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  margin: 4px 0;
  color: #374151;
  text-decoration: none;
  border-radius: 8px;
  transition: background-color 0.2s;
  cursor: pointer;
  white-space: nowrap;
}
.eg-menu-item:hover {
  background-color: #f3f4f6;
}

/* 활성 메뉴 스타일 */
.eg-active {
  background-color: #eff6ff !important;
  color: #2563eb !important;
  font-weight: 600;
  border-left: 3px solid #2563eb;
  padding-left: 9px; /* border-left 만큼 패딩 이동 */
}

.eg-icon {
  margin-right: 12px;
  font-size: 1.2rem;
  width: 24px;
  text-align: center;
}

/* 그룹 메뉴 (드롭다운 부모) 스타일 */
.eg-group-item {
  position: relative;
}
.eg-arrow {
  margin-left: auto; /* 우측 끝으로 이동 */
  font-size: 0.7rem;
  transition: transform 0.2s;
}

/* 하위 메뉴 리스트 */
.eg-submenu-list {
  list-style: none;
  padding: 0;
  margin: 0;
  overflow: hidden;
}

/* 하위 메뉴 아이템 */
.eg-submenu-item {
  display: block;
  padding: 8px 12px 8px 50px; /* 아이콘 공간 확보 및 들여쓰기 */
  text-decoration: none;
  color: #4b5563;
  font-size: 0.9rem;
}
.eg-submenu-item:hover {
  background-color: #f3f4f6;
}
.eg-active-child {
  font-weight: 600;
  color: #2563eb;
  background-color: #f0f7ff;
}
.eg-child-title {
  display: block;
}

/* === Nav Footer (토글 버튼) === */
.eg-nav-footer {
  padding: 10px;
  border-top: 1px solid #e5e7eb;
}
.eg-toggle-btn {
  width: 100%;
  padding: 8px;
  background-color: #f9fafb;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  cursor: pointer;
}

/* === 메인 콘텐츠 및 헤더 === */
.eg-main-wrapper {
  flex-grow: 1;
  margin-left: 240px; /* 사이드바 기본 너비만큼 마진 */
  transition: margin-left 0.3s ease;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.eg-appbar {
  display: flex;
  align-items: center;
  padding: 0 20px;
  height: 64px;
  background-color: #ffffff;
  border-bottom: 1px solid #e5e7eb;
  position: sticky;
  top: 0;
  z-index: 999;
}
.eg-toolbar-title {
  font-size: 1.25rem;
  font-weight: 500;
  color: #111827;
}
.eg-spacer {
  flex-grow: 1;
}

/* 프로필 드롭다운 메뉴 */
.eg-profile-menu {
  position: relative;
  display: inline-block;
}
.eg-profile-btn {
  background: #f3f4f6;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 8px 12px;
  cursor: pointer;
  font-weight: 500;
  transition: background-color 0.2s;
}
.eg-profile-btn:hover {
  background-color: #e5e7eb;
}
.eg-dropdown-content {
  display: none;
  position: absolute;
  right: 0;
  background-color: #ffffff;
  min-width: 160px;
  box-shadow: 0px 8px 16px 0px rgba(0,0,0,0.2);
  z-index: 10;
  border-radius: 6px;
  padding: 5px 0;
}
.eg-profile-menu:hover .eg-dropdown-content {
  display: block;
}
.eg-dropdown-content a {
  color: black;
  padding: 12px 16px;
  text-decoration: none;
  display: block;
  font-size: 0.9rem;
}
.eg-dropdown-content a:hover {
  background-color: #f1f1f1;
}


/* === 메인 콘텐츠 영역 === */
.eg-main-content {
  flex-grow: 1;
  padding: 24px;
}
.eg-container {
  margin: 0 auto;
}

/* === 푸터 === */
.eg-footer {
  padding: 10px 24px;
  border-top: 1px solid #e5e7eb;
  background-color: #ffffff;
  color: #6b7280;
  font-size: 0.8rem;
}
</style>
