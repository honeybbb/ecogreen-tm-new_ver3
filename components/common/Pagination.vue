<script setup>
import { computed } from 'vue';

const props = defineProps({
  currentPage: { type: Number, required: true },
  pageSize:    { type: Number, required: true },
  totalCount:  { type: Number, required: true },
  pageSizeOptions: { type: Array, default: () => [50, 100, 200, 500] }
});

const emit = defineEmits(['update:currentPage', 'update:pageSize', 'change']);

// 전체 페이지 수 계산
const totalPages = computed(() => Math.ceil(props.totalCount / props.pageSize));

// 페이지 번호 배열 생성 로직
const pageNumbers = computed(() => {
  const total = totalPages.value;
  const cur   = props.currentPage;
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages = [1];
  const delta = 2;
  const left  = Math.max(2, cur - delta);
  const right = Math.min(total - 1, cur + delta);

  if (left > 2) pages.push('...');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('...');
  pages.push(total);
  return pages;
});

const setPage = (page) => {
  if (typeof page !== 'number' || page < 1 || page > totalPages.value) return;
  emit('update:currentPage', page);
  emit('change', page);
};

const onPageSizeChange = (event) => {
  const newSize = Number(event.target.value);
  emit('update:pageSize', newSize);
  emit('update:currentPage', 1); // 개수 변경 시 1페이지로 리셋
  emit('change', 1);
};
</script>

<template>
  <div class="pagination-bar" v-if="totalCount > 0">
    <div class="pagination-left">
      <span class="pagination-info">
        <strong>{{ (currentPage - 1) * pageSize + 1 }}–{{ Math.min(currentPage * pageSize, totalCount) }}</strong> / 총 {{ totalCount }}건
      </span>
      <select :value="pageSize" @change="onPageSizeChange" class="page-size-select-sm">
        <option v-for="n in pageSizeOptions" :key="n" :value="n">{{ n }}개씩 보기</option>
      </select>
    </div>

    <div class="pagination-controls" v-if="totalPages > 1">
      <button class="page-btn" :disabled="currentPage === 1" @click="setPage(1)" title="처음">
        <i class="mdi mdi-chevron-double-left"></i>
      </button>
      <button class="page-btn" :disabled="currentPage === 1" @click="setPage(currentPage - 1)" title="이전">
        <i class="mdi mdi-chevron-left"></i>
      </button>

      <template v-for="(p, i) in pageNumbers" :key="i">
        <span v-if="p === '...'" class="page-ellipsis">…</span>
        <button
            v-else
            class="page-btn"
            :class="{ active: p === currentPage }"
            @click="setPage(p)"
        >{{ p }}</button>
      </template>

      <button class="page-btn" :disabled="currentPage === totalPages" @click="setPage(currentPage + 1)" title="다음">
        <i class="mdi mdi-chevron-right"></i>
      </button>
      <button class="page-btn" :disabled="currentPage === totalPages" @click="setPage(totalPages)" title="마지막">
        <i class="mdi mdi-chevron-double-right"></i>
      </button>
    </div>
  </div>
</template>

<style scoped>
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  /*border-top: 1px solid var(--border-color);*/
  background: var(--bg-hover);
  flex-wrap: wrap; gap: 12px;
}
.pagination-left { display: flex; align-items: center; gap: 12px; }
.pagination-info { font-size: 13px; color: var(--text-sub); }
.page-size-select-sm {
  height: 28px; padding: 0 4px; border: 1px solid var(--border-color);
  border-radius: 4px; font-size: 11px; background: var(--bg-surface);
  color: var(--text-sub); outline: none; cursor: pointer;
}
.pagination-controls { display: flex; align-items: center; gap: 4px; }
.page-btn {
  min-width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  border: 1px solid var(--border-color); border-radius: 6px;
  background: var(--bg-surface); color: var(--text-sub); font-size: 13px; cursor: pointer; transition: 0.15s;
}
.page-btn:hover:not(:disabled) { background: var(--primary-soft); border-color: var(--primary); color: var(--primary); }
.page-btn.active { background: var(--primary); border-color: var(--primary); color: #fff; font-weight: 700; }
.page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.page-ellipsis { min-width: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }

@media (max-width: 768px) {
  .pagination-bar { justify-content: center; flex-direction: column; }
}
</style>
