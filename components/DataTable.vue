<script setup>
import { computed } from 'vue';
import { useTableResize } from "~/composables/useTableResize.js";

const props = defineProps({
  items: { type: Array, required: true },
  columns: { type: Array, required: true },
  sortKey: { type: String, default: '' },
  sortOrder: { type: String, default: 'desc' },
  selectable: { type: Boolean, default: false },
  selectedIds: { type: Array, default: () => [] },
  itemKey: { type: String, default: 'idx' },
  rowClass: { type: Function, default: () => '' },
  cellClass: { type: Function, default: () => '' }
});

const emit = defineEmits(['update:sort', 'update:selectedIds', 'row-click', 'cell-contextmenu']);

const { startResize } = useTableResize();

const selectAll = computed({
  get: () => {
    if (props.items.length === 0) return false;
    return props.items.every(item => props.selectedIds.includes(item[props.itemKey]));
  },
  set: (val) => {
    let newSelected = [...props.selectedIds];
    if (val) {
      props.items.forEach(item => {
        if (!newSelected.includes(item[props.itemKey])) {
          newSelected.push(item[props.itemKey]);
        }
      });
    } else {
      const currentItemIds = props.items.map(item => item[props.itemKey]);
      newSelected = newSelected.filter(id => !currentItemIds.includes(id));
    }
    emit('update:selectedIds', newSelected);
  }
});

const toggleSelection = (id) => {
  let newSelected = [...props.selectedIds];
  if (newSelected.includes(id)) {
    newSelected = newSelected.filter(existingId => existingId !== id);
  } else {
    newSelected.push(id);
  }
  emit('update:selectedIds', newSelected);
};

const handleSort = (col) => {
  if (!col.sortable) return;
  emit('update:sort', col.key);
};
</script>

<template>
  <div class="table-scroll-container">
    <table class="data-table">
      <colgroup>
        <col v-if="selectable" width="40px" />
        <template v-for="col in columns" :key="'cg-' + col.key">
          <col v-if="col.visible !== false" :width="col.width" />
        </template>
      </colgroup>

      <thead>
      <tr>
        <th v-if="selectable" class="text-center">
          <input type="checkbox" v-model="selectAll" class="custom-checkbox" />
        </th>

        <template v-for="col in columns" :key="'th-' + col.key">
          <th
              v-if="col.visible !== false"
              @click="handleSort(col)"
              :class="['resizable', { 'sortable': col.sortable }, col.headerClass || '']"
          >
            <div class="th-content" :class="col.align === 'center' ? 'justify-center' : col.align === 'right' ? 'justify-end' : ''">
              <span>{{ col.label }}</span>
              <i v-if="col.sortable && sortKey === col.key"
                 :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']">
              </i>
            </div>
            <div class="resize-handle" @mousedown.stop="startResize"></div>
          </th>
        </template>
      </tr>
      </thead>

      <tbody>
      <tr
          v-for="item in items"
          :key="item[itemKey]"
          :class="['data-row', rowClass(item)]"
          @click="emit('row-click', item)"
      >
        <td v-if="selectable" class="text-center" @click.stop>
          <input
              type="checkbox"
              :checked="selectedIds.includes(item[itemKey])"
              @change="toggleSelection(item[itemKey])"
              class="custom-checkbox"
          />
        </td>

        <template v-for="col in columns" :key="'td-' + col.key">
          <td
              v-if="col.visible !== false"
              style="position: relative;"
              :class="[col.cellClass || '', cellClass(item, col.key)]"
              @contextmenu.prevent="emit('cell-contextmenu', $event, item, col.key)"
          >
            <slot :name="`cell-${col.key}`" :item="item" :value="item[col.key]">
              <div class="default-cell-text" :class="col.align === 'center' ? 'text-center' : col.align === 'right' ? 'text-right' : ''" :title="item[col.key] || '-'">
                {{ item[col.key] || '-' }}
              </div>
            </slot>

            <slot name="cell-append" :item="item" :colKey="col.key"></slot>
          </td>
        </template>
      </tr>

      <tr v-if="items.length === 0" class="empty-row">
        <td :colspan="columns.filter(c => c.visible !== false).length + (selectable ? 1 : 0)">
          <slot name="empty">
            <div class="empty-state">
              <i class="mdi mdi-database-off-outline"></i>
              <p>검색된 데이터가 없습니다.</p>
            </div>
          </slot>
        </td>
      </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.data-table {
  width: 100%;
  border-collapse: collapse;
}

/* ★ 핵심 해결책: max-width: 0 으로 설정하여, 컬럼 크기가 좁아졌을 때 텍스트가 테이블을 강제로 찢고 늘어나는 것을 방지하고 말줄임표 처리가 작동하도록 유도합니다. */
.data-table td {
  max-width: 0;
}

.table-scroll-container {
  overflow-x: auto;
  overflow-y: visible;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}
.table-scroll-container::-webkit-scrollbar {
  height: 8px;
}
.table-scroll-container::-webkit-scrollbar-track {
  background: var(--bg-hover);
  border-radius: 4px;
}
.table-scroll-container::-webkit-scrollbar-thumb {
  background: var(--border-focus);
  border-radius: 4px;
}

.default-cell-text {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: inherit;
}

.th-content {
  display: flex;
  align-items: center;
  gap: 6px;
}
.th-content.justify-center {
  justify-content: center;
}
.th-content.justify-end {
  justify-content: flex-end;
}
.th-content i {
  font-size: 14px;
  opacity: 0.8;
  color: var(--text-muted);
}
.sortable:hover .th-content i {
  color: var(--primary);
  opacity: 1;
}

.resizable {
  position: relative;
  overflow: hidden;
}
.resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 2px;
  height: 100%;
  cursor: col-resize;
  z-index: 1;
  user-select: none;
}
.resize-handle:hover,
.is-resizing .resize-handle {
  background: var(--primary);
  opacity: 0.5;
}

.empty-row {
  background-color: transparent !important;
}
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: var(--text-muted);
}
.empty-state i {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
  display: block;
}
.empty-state p {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-sub);
  margin: 0;
}

.custom-checkbox {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  cursor: pointer;
  border: 2px solid var(--border-focus);
  border-radius: 4px;
  position: relative;
  transition: all 0.2s;
  background: var(--bg-surface);
  margin: 0;
  vertical-align: middle;
}
.custom-checkbox:hover {
  border-color: var(--primary);
}
.custom-checkbox:checked {
  border-color: var(--primary);
  background: var(--primary);
}
.custom-checkbox:checked::after {
  content: '';
  position: absolute;
  top: 1px;
  left: 4px;
  width: 4px;
  height: 8px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

/* 숫자 컬럼 공용 유틸 (금액 등에서 재사용) */
.num-cell {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
</style>