<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import { useRoute, useRouter } from '#app';
import { useAuthStore } from '@/stores/auth';
import { useTabStore } from '@/stores/tab';
import axios from "axios";

import Header from '@/components/layout/Header.vue';
import Sidebar from '@/components/layout/Sidebar.vue';
import TabBar from '@/components/layout/TabBar.vue';
import Footer from '@/components/layout/Footer.vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const tabStore = useTabStore();

const miniVariant = ref(false);
const mobileMenuOpen = ref(false);
const title = ref('에코그린티엠');
const isDarkMode = ref(false);

const cIdx = computed(() => authStore.user?.cIdx ?? null);
const items = ref([]);
const systemItems = ref([]);

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

const toggleSidebar = () => {
  miniVariant.value = !miniVariant.value;
  localStorage.setItem('navMini', miniVariant.value);
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

watch(() => route.path, (newPath) => {
  mobileMenuOpen.value = false;
  const tabTitle = findMenuTitle(newPath, [...items.value, ...systemItems.value]) || '새 탭';
  tabStore.addTab({ title: tabTitle, path: newPath });
}, { immediate: true });

onMounted(() => {
  tabStore.initTabs();
  const currentTitle = findMenuTitle(route.path, [...items.value, ...systemItems.value]) || '새 탭';
  tabStore.addTab({ title: currentTitle, path: route.path });

  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    isDarkMode.value = true;
    document.body.classList.add('theme-dark');
  }

  if (authStore.token && authStore.remainingSeconds === 60 * 60) {
    authStore.startTimer();
  }

  const savedMini = localStorage.getItem('navMini');
  if (savedMini !== null) {
    miniVariant.value = savedMini === 'true';
  }
});
</script>

<template>
  <div class="eg-app-container">
    <SessionTimeoutModal />

    <transition name="fade">
      <div
          v-if="mobileMenuOpen"
          class="eg-sidebar-overlay"
          @click="mobileMenuOpen = false"
      ></div>
    </transition>

    <Sidebar
        :items="items"
        :systemItems="systemItems"
        :miniVariant="miniVariant"
        :mobileMenuOpen="mobileMenuOpen"
        :title="title"
        @toggleSidebar="toggleSidebar"
    />

    <div class="eg-main-wrapper" :class="{ 'eg-main-expanded': miniVariant }">
      <Header
          :isDarkMode="isDarkMode"
          @toggleMobileMenu="mobileMenuOpen = true"
          @toggleTheme="toggleTheme"
      />

      <TabBar />

      <main class="eg-main-content">
        <div class="eg-container">
          <slot />
        </div>
      </main>

      <Footer />
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; outline: none; }

.eg-app-container {
  display: flex;
  min-height: 100vh;
  background-color: var(--bg-canvas);
  color: var(--text-main);
  overflow-x: hidden;
  transition: background-color 0.3s, color 0.3s;
}

.eg-sidebar-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
  z-index: 1099;
}

.eg-main-wrapper {
  flex: 1; margin-left: 260px;
  transition: margin-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex; flex-direction: column; min-width: 0;
  background-color: var(--bg-canvas);
}
.eg-main-wrapper.eg-main-expanded { margin-left: 72px; }

.eg-main-content { flex: 1; padding: 24px; min-width: 0; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

@media (max-width: 1024px) {
  .eg-main-wrapper { margin-left: 72px; }
}

@media (max-width: 768px) {
  .eg-main-wrapper, .eg-main-wrapper.eg-main-expanded { margin-left: 0; }
  .eg-main-content { padding: 16px; }
}
</style>
