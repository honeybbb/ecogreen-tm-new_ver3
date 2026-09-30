<script setup>
import { ref, computed } from 'vue';
import { useRoute, useRouter } from '#app';
import { useTabStore } from '@/stores/tab';
import { useFavoriteStore } from '@/stores/favorite';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const tabStore = useTabStore();
const favStore = useFavoriteStore();
const authStore = useAuthStore();

// 관리자만 즐겨찾기 기능 노출 (관리자 로그인 시 managerId 필드가 채워진다)
const isAdmin = computed(() => !!authStore.user?.managerId);

const closeTab = (path) => {
  if (route.path === path) {
    const index = tabStore.tabs.findIndex(t => t.path === path);
    const prevTab = tabStore.tabs[index - 1] || tabStore.tabs[0];
    if (prevTab) router.push(prevTab.path);
  }
  tabStore.removeTab(path);
};

const toggleFavorite = (tab) => {
  if (!isAdmin.value || tab.path === '/') return;
  favStore.toggleFavorite({ path: tab.path, title: tab.title });
};

const openFavorite = (fav) => {
  tabStore.addTab({ path: fav.path, title: fav.title });
  if (route.path !== fav.path) router.push(fav.path);
};

const dragIndex = ref(-1);
const dragOverIndex = ref(-1);

const onDragStart = (index, e) => {
  if (index === 0) {
    e.preventDefault();
    return;
  }
  dragIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    // Firefox 는 setData 없이는 drag 를 시작하지 않음
    try { e.dataTransfer.setData('text/plain', String(index)); } catch (_) {}
  }
};

const onDragEnter = (index, e) => {
  if (dragIndex.value < 0 || index === 0) return;
  e.preventDefault();
};

const onDragOver = (index, e) => {
  if (dragIndex.value < 0 || index === 0) return;
  // drop 이 가능하려면 dragover 에서 preventDefault 반드시 호출
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  if (dragOverIndex.value !== index) dragOverIndex.value = index;
};

const onDrop = (index, e) => {
  e.preventDefault();
  e.stopPropagation();
  const from = dragIndex.value;
  if (from < 0 || index === 0 || from === index) {
    resetDrag();
    return;
  }
  tabStore.reorderTab(from, index);
  resetDrag();
};

const onDragEnd = () => {
  resetDrag();
};

const resetDrag = () => {
  dragIndex.value = -1;
  dragOverIndex.value = -1;
};
</script>

<template>
  <div class="eg-tab-wrapper">
    <!-- 즐겨찾기 바 (관리자 + 즐겨찾기 있을 때만) -->
    <div v-if="isAdmin && favStore.favorites.length" class="eg-fav-bar">
      <span class="eg-fav-label">
        <i class="mdi mdi-star"></i>
        즐겨찾기
      </span>
      <div class="eg-fav-list">
        <div
            v-for="fav in favStore.favorites"
            :key="'fav-' + fav.path"
            :class="['eg-fav-chip', { active: route.path === fav.path }]"
            @click="openFavorite(fav)"
        >
          <span class="eg-fav-title">{{ fav.title }}</span>
          <button
              class="eg-fav-remove"
              title="즐겨찾기 해제"
              @click.stop="favStore.removeFavorite(fav.path)"
          >
            <i class="mdi mdi-close"></i>
          </button>
        </div>
      </div>
    </div>

    <div class="eg-tab-bar">
      <div
          v-for="(tab, index) in tabStore.tabs"
          :key="tab.path"
          :class="[
            'eg-tab-item',
            { 'active': route.path === tab.path },
            { 'dragging': dragIndex === index },
            { 'drag-over': dragOverIndex === index && dragIndex !== index },
          ]"
          :draggable="tab.path !== '/' ? 'true' : 'false'"
          @click="router.push(tab.path)"
          @dragstart="onDragStart(index, $event)"
          @dragenter="onDragEnter(index, $event)"
          @dragover="onDragOver(index, $event)"
          @drop="onDrop(index, $event)"
          @dragend="onDragEnd"
      >
        <button
            v-if="isAdmin && tab.path !== '/'"
            class="eg-tab-fav"
            draggable="false"
            :title="favStore.isFavorite(tab.path) ? '즐겨찾기 해제' : '즐겨찾기에 추가'"
            @click.stop="toggleFavorite(tab)"
            @mousedown.stop
            @dragstart.prevent
        >
          <i :class="['mdi', favStore.isFavorite(tab.path) ? 'mdi-star' : 'mdi-star-outline']"></i>
        </button>

        <span class="eg-tab-title">{{ tab.title }}</span>

        <button
            v-if="tab.path !== '/'"
            class="eg-tab-close"
            draggable="false"
            @click.stop="closeTab(tab.path)"
            @mousedown.stop
            @dragstart.prevent
        >
          <i class="mdi mdi-close"></i>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; outline: none; }

.eg-tab-wrapper {
  display: flex;
  flex-direction: column;
  background-color: var(--bg-hover);
  border-bottom: 1px solid var(--border-color);
}

/* ================== 즐겨찾기 바 ================== */
.eg-fav-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px dashed var(--border-color);
  background-color: var(--bg-surface);
}

.eg-fav-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--warning);
  flex-shrink: 0;
}
.eg-fav-label i { font-size: 14px; }

.eg-fav-list {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  flex: 1;
}
.eg-fav-list::-webkit-scrollbar { display: none; }

.eg-fav-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 4px 10px;
  background-color: var(--bg-canvas);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  font-size: 12px;
  color: var(--text-sub);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}
.eg-fav-chip:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.eg-fav-chip.active {
  background-color: var(--primary-soft);
  border-color: var(--primary);
  color: var(--primary);
  font-weight: 600;
}
.eg-fav-title {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.eg-fav-remove {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  padding: 0;
  transition: all 0.15s ease;
}
.eg-fav-remove:hover {
  background-color: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}
.eg-fav-remove i { font-size: 12px; }

/* ================== 탭 바 ================== */
.eg-tab-bar {
  display: flex;
  padding: 8px 16px 0 16px;
  gap: 4px;
  overflow-x: auto;
}
.eg-tab-bar::-webkit-scrollbar { display: none; }

.eg-tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background-color: var(--bg-canvas);
  border: 1px solid var(--border-color);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  min-width: 120px;
  max-width: 220px;
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

.eg-tab-item.dragging {
  opacity: 0.4;
}

.eg-tab-item.drag-over {
  border-left: 2px solid var(--primary);
}

.eg-tab-title {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.eg-tab-fav {
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-muted);
  transition: color 0.2s;
}
.eg-tab-fav:hover { color: var(--warning); }
.eg-tab-fav i { font-size: 15px; }
.eg-tab-fav .mdi-star { color: var(--warning); }

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
