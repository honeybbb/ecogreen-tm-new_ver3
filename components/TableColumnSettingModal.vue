<template>
  <div v-if="isOpen" class="modal-overlay" @mousedown.self="close">
    <div class="modal-container col-modal">
      <div class="modal-header">
        <h3><!--i class="mdi mdi-table-cog"></i--> 보기 설정</h3>
        <button @click="close" class="btn-close"><i class="mdi mdi-close"></i></button>
      </div>

      <div class="modal-body col-modal-body">
        <p class="modal-desc">
          원하는 항목을 켜고 끄거나, 화살표를 눌러 순서를 변경하세요.<br>
          <span style="font-size:11px; color:#888;">(설정은 서버에 안전하게 저장됩니다)</span>
        </p>

        <div class="column-edit-list">
          <div v-for="(col, index) in tempColumns" :key="col.key" class="column-edit-item">
            <div class="col-item-left">
              <label class="custom-toggle">
                <input type="checkbox" v-model="col.visible" />
                <span class="toggle-slider"></span>
              </label>
              <span :class="{'text-disabled': !col.visible}" class="col-label-text">{{ col.label }}</span>
            </div>
            <div class="col-item-right">
              <button type="button" @click="moveColumn(index, 'up')" :disabled="index === 0" class="btn-move">
                <i class="mdi mdi-arrow-up"></i>
              </button>
              <button type="button" @click="moveColumn(index, 'down')" :disabled="index === tempColumns.length - 1" class="btn-move">
                <i class="mdi mdi-arrow-down"></i>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer flex-between">
        <button @click="resetColumns" class="btn-reset"><i class="mdi mdi-refresh"></i> 초기화</button>
        <div class="footer-right">
          <button @click="close" class="btn-cancel">취소</button>
          <button @click="save" class="btn-submit">저장 및 적용</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
  isOpen: Boolean,
  currentColumns: Array,
  defaultColumns: Array
});

const emit = defineEmits(['update:isOpen', 'save']);

const tempColumns = ref([]);

// 모달이 열릴 때 원본 컬럼 복사본 만들기
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    tempColumns.value = JSON.parse(JSON.stringify(props.currentColumns));
  }
});

const close = () => {
  emit('update:isOpen', false);
};

const save = () => {
  emit('save', tempColumns.value);
};

const resetColumns = () => {
  tempColumns.value = JSON.parse(JSON.stringify(props.defaultColumns));
};

const moveColumn = (index, direction) => {
  if (direction === 'up' && index > 0) {
    const temp = tempColumns.value[index];
    tempColumns.value[index] = tempColumns.value[index - 1];
    tempColumns.value[index - 1] = temp;
  } else if (direction === 'down' && index < tempColumns.value.length - 1) {
    const temp = tempColumns.value[index];
    tempColumns.value[index] = tempColumns.value[index + 1];
    tempColumns.value[index + 1] = temp;
  }
};
</script>

<style scoped>
.modal-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center; z-index: 9999;
}
.modal-container {
  background: #ffffff; width: 450px; max-width: 90%;
  border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);
  display: flex; flex-direction: column; overflow: hidden;
}
.modal-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 16px 20px; border-bottom: 1px solid #e2e8f0;
}
.modal-header h3 { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; display:flex; align-items:center; gap:6px;}
.btn-close { background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer; }

.col-modal-body { padding: 0; max-height: 60vh; overflow-y: auto;}
.modal-desc { padding: 16px 20px 0; margin-bottom: 12px; font-size: 13px; color: #475569; line-height: 1.4;}

.column-edit-list { display: flex; flex-direction: column; padding: 0 12px 12px; }
.column-edit-item {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px; border-radius: 8px; transition: background 0.2s;
  border-bottom: 1px solid #f1f5f9;
}
.column-edit-item:last-child { border-bottom: none; }
.column-edit-item:hover { background: #f8fafc; }

.col-item-left { display: flex; align-items: center; gap: 12px; }
.col-label-text { font-size: 14px; font-weight: 600; color: #1e293b; transition: color 0.2s;}
.text-disabled { color: #94a3b8; text-decoration: line-through; }

.col-item-right { display: flex; gap: 4px; }
.btn-move {
  width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;
  background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 6px;
  color: #475569; cursor: pointer; transition: 0.2s;
}
.btn-move:hover:not(:disabled) { background: #cbd5e1; color: #1e293b; }
.btn-move:disabled { opacity: 0.3; cursor: not-allowed; }

.custom-toggle { position: relative; display: inline-block; width: 36px; height: 20px; }
.custom-toggle input { opacity: 0; width: 0; height: 0; }
.toggle-slider {
  position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
  background-color: #cbd5e1; transition: .3s; border-radius: 20px;
}
.toggle-slider:before {
  position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px;
  background-color: white; transition: .3s; border-radius: 50%;
}
input:checked + .toggle-slider { background-color: #3b82f6; }
input:checked + .toggle-slider:before { transform: translateX(16px); }

.modal-footer {
  display: flex; padding: 16px 20px; border-top: 1px solid #e2e8f0; background: #f8fafc;
}
.flex-between { justify-content: space-between; }
.footer-right { display: flex; gap: 10px; }

.btn-cancel, .btn-reset {
  padding: 8px 16px; background: white; border: 1px solid #e2e8f0;
  border-radius: 6px; color: #475569; font-weight: 600; cursor: pointer; font-size: 13px;
}
.btn-reset { color: #ef4444; border-color: rgba(239,68,68,0.3); }
.btn-reset:hover { background: rgba(239,68,68,0.05); }

.btn-submit {
  padding: 8px 16px; background: #3b82f6; border: none;
  border-radius: 6px; color: white; font-weight: 600; cursor: pointer; font-size: 13px;
}
.btn-submit:hover { background: #2563eb; }
</style>