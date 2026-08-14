<script setup>
import { useRoute, useRouter } from '#app';
import { useTabStore } from '@/stores/tab';

const route = useRoute();
const router = useRouter();
const tabStore = useTabStore();

const closeTab = (path) => {
  if (route.path === path) {
    const index = tabStore.tabs.findIndex(t => t.path === path);
    const prevTab = tabStore.tabs[index - 1] || tabStore.tabs[0];
    if (prevTab) router.push(prevTab.path);
  }
  tabStore.removeTab(path);
};
</script>

<template>
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
</template>

<style scoped>
* { box-sizing: border-box; outline: none; }
.eg-tab-bar {
  display: flex;
  background-color: var(--bg-hover);
  padding: 8px 16px 0 16px;
  border-bottom: 1px solid var(--border-color);
  gap: 4px;
  overflow-x: auto;
}
.eg-tab-bar::-webkit-scrollbar { display: none; }

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
  top: 1px;
}

.eg-tab-item:hover {
  background-color: var(--bg-surface);
}

.eg-tab-item.active {
  background-color: var(--bg-surface);
  color: var(--primary);
  font-weight: 600;
  border-top: 2px solid var(--primary);
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
