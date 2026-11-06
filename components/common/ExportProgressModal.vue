<script setup>
defineProps({
  open: { type: Boolean, required: true },
  title: { type: String, required: true },
  iconClass: { type: String, default: 'mdi-microsoft-excel' },
  currentName: { type: String, default: '' },
  progress: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  cancelled: { type: Boolean, default: false },
});

const emit = defineEmits(['cancel', 'close']);
</script>

<template>
  <div v-if="open" class="export-modal-overlay">
    <div class="export-modal-box">
      <h3 class="modal-title">
        <i class="mdi" :class="iconClass"></i> {{ title }}
      </h3>

      <div class="modal-status-text">
        <span v-if="!cancelled">{{ currentName }} ({{ progress }} / {{ total }})</span>
        <span v-else class="text-red font-bold">출력이 사용자에 의해 중단되었습니다.</span>
      </div>

      <div class="progress-container">
        <div
            class="progress-bar-fill"
            :style="{ width: `${total ? (progress / total) * 100 : 0}%` }"
            :class="{ 'bg-red': cancelled }"
        ></div>
      </div>

      <div class="modal-actions mt-4">
        <button
            v-if="progress < total && !cancelled"
            @click="emit('cancel')"
            class="btn-cancel"
        >
          <i class="mdi mdi-stop-circle-outline"></i> 중단하기
        </button>
        <button v-else @click="emit('close')" class="btn-confirm">
          닫기
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.export-modal-overlay {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: rgba(0, 0, 0, 0.6); z-index: 9999;
  display: flex; align-items: center; justify-content: center;
}
.export-modal-box {
  background: #fff; width: 400px; padding: 24px;
  border-radius: 12px; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  text-align: center;
}
.modal-title {
  font-size: 18px; font-weight: 700; color: #1f2937;
  margin-bottom: 16px;
  display: flex; align-items: center; justify-content: center; gap: 8px;
}
.modal-title i { color: #217346; font-size: 24px; }
.modal-status-text { font-size: 14px; color: #4b5563; margin-bottom: 12px; height: 20px; }
.progress-container {
  width: 100%; height: 12px;
  background-color: #e5e7eb; border-radius: 6px; overflow: hidden;
}
.progress-bar-fill { height: 100%; background-color: #217346; transition: width 0.3s ease; }
.progress-bar-fill.bg-red { background-color: #ef4444 !important; }

.btn-cancel {
  padding: 8px 16px; border: none;
  background-color: #fee2e2; color: #b91c1c;
  border-radius: 6px; cursor: pointer; font-weight: 600;
  transition: background 0.2s;
}
.btn-cancel:hover { background-color: #fca5a5; }

.btn-confirm {
  padding: 8px 24px; border: none;
  background-color: #e5e7eb; color: #374151;
  border-radius: 6px; cursor: pointer; font-weight: 600;
}
.btn-confirm:hover { background-color: #d1d5db; }

.mt-4 { margin-top: 20px; }
.text-red { color: #ef4444; }
.font-bold { font-weight: 700; }
</style>
