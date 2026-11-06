<script setup>
import { ref, watch } from 'vue';
import axios from 'axios';

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  refType: { type: String, required: true },
  refIdx: { type: [Number, String], default: null },
  title: { type: String, default: '메일 발송 이력' },
});

const emit = defineEmits(['close']);

const mailHistory = ref([]);
const isLoading = ref(false);

const fetchMailHistory = async () => {
  if (!props.refIdx) { mailHistory.value = []; return; }
  isLoading.value = true;
  try {
    const res = await axios.get('/api/v1/mail/queue', {
      params: { refType: props.refType, refIdx: props.refIdx, limit: 50 },
    });
    mailHistory.value = res.data?.data || [];
  } catch (e) {
    console.error('메일 이력 조회 오류:', e);
    mailHistory.value = [];
  } finally {
    isLoading.value = false;
  }
};

const retryMailItem = async (idx) => {
  if (!confirm('이 메일을 다시 발송 대기열에 등록할까요?')) return;
  try {
    const res = await axios.post(`/api/v1/mail/queue/${idx}/retry`);
    if (res.data?.result) {
      alert('재발송 대기열에 등록되었습니다.');
      await fetchMailHistory();
    } else {
      alert(`재시도 실패: ${res.data?.msg || '알 수 없는 오류'}`);
    }
  } catch (e) {
    alert(e.response?.data?.msg || '재시도 중 오류가 발생했습니다.');
  }
};

const cancelMailItem = async (idx) => {
  if (!confirm('이 메일 발송을 취소할까요? (대기중인 메일만 취소 가능)')) return;
  try {
    const res = await axios.post(`/api/v1/mail/queue/${idx}/cancel`);
    if (res.data?.result) {
      alert('발송이 취소되었습니다.');
      await fetchMailHistory();
    } else {
      alert(`취소 실패: ${res.data?.msg || '알 수 없는 오류'}`);
    }
  } catch (e) {
    alert(e.response?.data?.msg || '취소 중 오류가 발생했습니다.');
  }
};

const mailStatusLabel = (s) => ({
  PENDING: '대기',
  SENDING: '전송 중',
  SENT: '발송 완료',
  FAILED: '실패',
  CANCELED: '취소',
}[s] || s);

const formatMailDt = (dt) => {
  if (!dt) return '-';
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const close = () => emit('close');

watch(() => props.isOpen, (val) => {
  if (val) fetchMailHistory();
  else mailHistory.value = [];
});
</script>

<template>
  <div v-if="isOpen" class="mh-overlay" @click.self="close">
    <div class="mh-container">
      <div class="mh-header">
        <h2>
          <i class="mdi mdi-email-outline"></i>
          {{ title }}
        </h2>
        <div class="mh-header-actions">
          <button type="button" class="mh-refresh" @click="fetchMailHistory" :disabled="isLoading">
            <i class="mdi mdi-refresh"></i>
            <span>{{ isLoading ? '불러오는 중...' : '새로고침' }}</span>
          </button>
          <button type="button" class="mh-close" @click="close" title="닫기">
            <i class="mdi mdi-close"></i>
          </button>
        </div>
      </div>

      <div class="mh-body">
        <div v-if="isLoading && mailHistory.length === 0" class="mh-empty">
          이력을 불러오는 중...
        </div>
        <div v-else-if="mailHistory.length === 0" class="mh-empty">
          발송된 메일이 없습니다.
        </div>
        <table v-else class="mh-table">
          <colgroup>
            <col style="width: 60px;">
            <col style="width: 110px;">
            <col style="width: 220px;">
            <col>
            <col style="width: 150px;">
            <col style="width: 150px;">
            <col style="width: 120px;">
          </colgroup>
          <thead>
            <tr>
              <th>ID</th>
              <th>상태</th>
              <th>수신자</th>
              <th>제목</th>
              <th>요청 시각</th>
              <th>발송 시각</th>
              <th>액션</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in mailHistory" :key="row.idx">
              <td class="text-center">{{ row.idx }}</td>
              <td class="text-center">
                <span :class="['mh-badge', 'mh-' + String(row.status).toLowerCase()]">
                  {{ mailStatusLabel(row.status) }}
                </span>
                <span v-if="row.attempts > 0" class="mh-attempts">({{ row.attempts }}회)</span>
              </td>
              <td>
                <div>{{ row.toEmail }}</div>
                <div v-if="row.toName" class="mh-sub">{{ row.toName }}</div>
              </td>
              <td :title="row.lastError || ''">
                <div class="mh-subject">{{ row.subject }}</div>
                <div v-if="row.status === 'FAILED' && row.lastError" class="mh-error">{{ row.lastError }}</div>
              </td>
              <td class="text-center mh-dt">{{ formatMailDt(row.regDt) }}</td>
              <td class="text-center mh-dt">{{ formatMailDt(row.sentAt) }}</td>
              <td class="text-center">
                <button
                    v-if="row.status === 'FAILED' || row.status === 'CANCELED'"
                    class="mh-btn mh-btn-retry"
                    @click="retryMailItem(row.idx)"
                >재시도</button>
                <button
                    v-if="row.status === 'PENDING'"
                    class="mh-btn mh-btn-cancel"
                    @click="cancelMailItem(row.idx)"
                >취소</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mh-overlay {
  position: fixed; inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 2500; padding: 16px; box-sizing: border-box;
}
.mh-container {
  background: var(--bg-surface);
  width: 100%; max-width: 1100px;
  max-height: 90vh;
  border-radius: 12px;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,.1);
  border: 1px solid var(--border-color);
  overflow: hidden;
}

.mh-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-canvas);
}
.mh-header h2 {
  margin: 0; font-size: 16px; font-weight: 700; color: var(--text-main);
  display: inline-flex; align-items: center; gap: 8px;
}
.mh-header h2 .mdi { color: var(--primary); font-size: 20px; }

.mh-header-actions { display: flex; align-items: center; gap: 8px; }

.mh-refresh {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--bg-surface); color: var(--text-sub);
  border: 1px solid var(--border-color); border-radius: 6px;
  padding: 6px 12px; font-size: 12px; cursor: pointer;
}
.mh-refresh:hover:not(:disabled) {
  background: var(--bg-hover); color: var(--text-main);
}
.mh-refresh:disabled { opacity: .6; cursor: not-allowed; }

.mh-close {
  width: 32px; height: 32px; border-radius: 6px;
  background: var(--bg-surface); border: 1px solid var(--border-color);
  color: var(--text-sub);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.mh-close:hover { background: var(--bg-hover); color: var(--text-main); }
.mh-close i { font-size: 18px; }

.mh-body {
  flex: 1; overflow: auto;
  padding: 20px 24px;
}

.mh-empty {
  padding: 60px 20px; text-align: center;
  color: var(--text-sub); font-size: 13px;
  background: var(--bg-canvas); border-radius: 8px;
}

.mh-table {
  width: 100%; border-collapse: collapse; font-size: 13px;
}
.mh-table thead th {
  background: var(--bg-canvas); color: var(--text-sub); font-weight: 600;
  padding: 10px 8px; text-align: center;
  border-bottom: 1px solid var(--border-color);
}
.mh-table tbody td {
  padding: 10px 8px; border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
}
.mh-table tbody tr:hover { background: var(--bg-hover); }

.mh-badge {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 700;
}
.mh-pending  { background: #fef3c7; color: #92400e; }
.mh-sending  { background: #dbeafe; color: #1e40af; }
.mh-sent     { background: #d1fae5; color: #065f46; }
.mh-failed   { background: #fee2e2; color: #991b1b; }
.mh-canceled { background: #e5e7eb; color: #374151; }

.mh-attempts { font-size: 11px; color: var(--text-sub); margin-left: 4px; }
.mh-sub { font-size: 11px; color: var(--text-sub); margin-top: 2px; }
.mh-subject { color: var(--text-main); }
.mh-error {
  margin-top: 4px; font-size: 11px; color: var(--danger);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  max-width: 420px;
}
.mh-dt { font-variant-numeric: tabular-nums; color: var(--text-sub); }

.mh-btn {
  padding: 4px 10px; border-radius: 6px; font-size: 12px;
  border: 1px solid transparent; cursor: pointer;
}
.mh-btn-retry  { background: var(--primary-soft); color: var(--primary); border-color: var(--primary-soft); }
.mh-btn-retry:hover { background: var(--primary); color: #fff; }
.mh-btn-cancel { background: #fef2f2; color: var(--danger); border-color: #fecaca; }
.mh-btn-cancel:hover { background: var(--danger); color: #fff; }

.text-center { text-align: center; }
</style>
