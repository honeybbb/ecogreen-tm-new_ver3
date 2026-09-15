<script setup>
import { ref, computed } from 'vue';

const props = defineProps({
  show: { type: Boolean, required: true },
  equipment: { type: Object, default: () => null }
});

const emit = defineEmits(['close', 'update']);

const detailTab = ref('info');

const closeDetailModal = () => {
  emit('close');
};

const formatCurrency = (val) => {
  if (val === undefined || val === null) return '0원';
  return val.toLocaleString() + '원';
};

// ========================================================
// 모달 상세 탭용 임시(가라) 데이터 및 필터 로직
// ========================================================
const mockMovements = ref([
  { idx: 1, eqIdx: 1, date: '2026-08-10', fromSite: '본사 창고', toSite: '반포 래미안', manager: '김철수' },
  { idx: 2, eqIdx: 2, date: '2026-07-15', fromSite: '옥정8단지', toSite: '북한산힐스테이트7차', manager: '이영희' },
  { idx: 3, eqIdx: 4, date: '2026-08-01', fromSite: '반포 래미안', toSite: '본사 창고', manager: '박민수' },
]);

const mockRepairs = ref([
  { idx: 1, eqIdx: 1, date: '2026-05-20', type: '수리', content: '엔진오일 및 필터 교체', center: '블루핸즈 강남점', cost: 150000 },
  { idx: 2, eqIdx: 2, date: '2026-06-11', type: '점검', content: '모터 정기 점검 (이상무)', center: '자체 점검', cost: 0 },
  { idx: 3, eqIdx: 4, date: '2026-08-15', type: '수리', content: '흡입 모터 고장 교체', center: 'LG전자 서비스', cost: 120000 },
]);

const mockTransactions = ref([
  { idx: 1, eqIdx: 1, date: '2023-01-15', type: 'BUY', partner: '현대자동차', qty: 1, price: 21000000 },
  { idx: 2, eqIdx: 2, date: '2025-04-10', type: 'GET', partner: '(주)크린환경 (양수)', qty: 1, price: 500000 },
  { idx: 3, eqIdx: 3, date: '2026-08-01', type: 'BUY', partner: '안전물산', qty: 500, price: 250000 },
  { idx: 4, eqIdx: 4, date: '2024-11-20', type: 'BUY', partner: '클린테크', qty: 3, price: 1500000 },
]);

const currentMovements = computed(() => mockMovements.value.filter(m => m.eqIdx === props.equipment?.idx));
const currentRepairs = computed(() => mockRepairs.value.filter(r => r.eqIdx === props.equipment?.idx));
const currentTransactions = computed(() => mockTransactions.value.filter(t => t.eqIdx === props.equipment?.idx));

// ========================================================
// 장비 이동 폼
// ========================================================
// const ALL_SITES = ['본사 창고', '반포 래미안', '북한산힐스테이트7차', '옥정8단지', 'LH 위례 6단지', '강서 대명 강동'];

const showMoveModal = ref(false);
const moveForm = ref({
  fromSite: '',
  toSite: '',
  qty: 1,
  maxQty: 1,
  date: new Date().toISOString().slice(0, 10),
  manager: ''
});

const openMoveForm = (assign) => {
  moveForm.value = {
    fromSite: assign.siteName,
    toSite: '',
    qty: 1,
    maxQty: assign.qty,
    date: new Date().toISOString().slice(0, 10),
    manager: ''
  };
  showMoveModal.value = true;
};

const executeMove = () => {
  const { fromSite, toSite, qty, maxQty, date, manager } = moveForm.value;

  if (!toSite) return alert('도착지를 선택해주세요.');
  if (fromSite === toSite) return alert('출발지와 도착지가 동일합니다.');
  if (qty < 1 || qty > maxQty) return alert(`수량은 1에서 ${maxQty} 사이여야 합니다.`);

  emit('update', { type: 'move', data: moveForm.value });

  mockMovements.value.unshift({
    idx: Date.now(),
    eqIdx: props.equipment?.idx,
    date: date,
    fromSite: fromSite,
    toSite: toSite,
    manager: manager || '미지정'
  });

  const payload = {
    eqIdx: props.equipment?.idx,
    fromSite: fromSite,
    toSite: toSite,
    qty: qty,
    date: date
  };

  axios.put(`/api/v1/equipment/move`, payload)
      .then(() => {
        alert('장비 이동 처리가 완료되었습니다.');
        showMoveModal.value = false;
      })
      .catch((err) => {
        console.error(err);
        alert('장비 이동 처리 중 오류가 발생했습니다.');
      });
};

// ========================================================
// 수리/점검 등록 폼
// ========================================================
const showRepairModal = ref(false);
const repairForm = ref({
  date: new Date().toISOString().slice(0, 10),
  type: '수리',
  content: '',
  center: '',
  cost: 0,
  updateStatus: false
});

const openRepairForm = () => {
  repairForm.value = {
    date: new Date().toISOString().slice(0, 10),
    type: '수리',
    content: '',
    center: '',
    cost: 0,
    updateStatus: props.equipment?.status !== 'check'
  };
  showRepairModal.value = true;
};

const executeRepair = () => {
  if (!repairForm.value.content) return alert('수리 또는 점검 내용을 입력해주세요.');

  emit('update', { type: 'repair', data: repairForm.value });

  mockRepairs.value.unshift({
    idx: Date.now(),
    eqIdx: props.equipment?.idx,
    date: repairForm.value.date,
    type: repairForm.value.type,
    content: repairForm.value.content,
    center: repairForm.value.center || '자체 점검',
    cost: repairForm.value.cost
  });

  alert('수리/점검 내역이 성공적으로 등록되었습니다.');
  showRepairModal.value = false;
};

// 모달이 열릴 때 기본 탭 초기화
import { watch } from 'vue';
import axios from "axios";
watch(() => props.show, (newVal) => {
  if (newVal) {
    detailTab.value = props.equipment?.assignments ? 'assignment' : 'info';
  }
});
</script>

<template>
  <div v-if="show && equipment" class="modal-overlay" @click.self="closeDetailModal" style="z-index: 1000;">
    <div class="modal-content modal-box-wide" style="width: 800px; background: var(--bg-surface); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
      <div class="modal-header">
        <h3 style="margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center;">
          <span v-if="equipment.type" :class="['type-badge', `type-${equipment.type === '차량' ? 'car' : (equipment.type === '소모품' ? 'consumable' : 'equip')}`]" style="margin-right: 8px;">
            {{ equipment.type }}
          </span>
          <i v-else class="mdi mdi-toolbox" style="margin-right: 8px;"></i>
          {{ equipment.name }} 상세 정보
        </h3>
        <button class="btn-close" @click="closeDetailModal" style="background: none; border: none; font-size: 20px; color: #6b7280; cursor: pointer;"><i class="mdi mdi-close"></i></button>
      </div>

      <div class="modal-tabs" style="display: flex; background: var(--bg-canvas); border-bottom: 1px solid var(--border-color);">
        <button v-if="!equipment.assignments" :class="{ active: detailTab === 'info' }" @click="detailTab = 'info'">기본 정보</button>
        <button v-if="equipment.assignments" :class="{ active: detailTab === 'assignment' }" @click="detailTab = 'assignment'">현재 배치 현황</button>
        <button :class="{ active: detailTab === 'movement' }" @click="detailTab = 'movement'">단지 이동 이력</button>
        <button :class="{ active: detailTab === 'repair' }" @click="detailTab = 'repair'">수리/점검 대장</button>
        <button :class="{ active: detailTab === 'transaction' }" @click="detailTab = 'transaction'">구매/양도 내역</button>
      </div>

      <div class="modal-body" style="padding: 24px; overflow-y: auto; min-height: 300px;">
        <!-- 1-a) 기본 정보 탭 (현장 상세 페이지용) -->
        <div v-if="detailTab === 'info'">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; font-size:14px;">
            <div><strong style="color:var(--text-sub);">모델명:</strong> {{ equipment.model || '-' }}</div>
            <div><strong style="color:var(--text-sub);">고유번호(S/N):</strong> {{ equipment.serialNo || '-' }}</div>
            <div><strong style="color:var(--text-sub);">도입(구매)일:</strong> {{ equipment.purchaseDate || '-' }}</div>
            <div><strong style="color:var(--text-sub);">현재 상태:</strong> {{ equipment.status === 'normal' ? '정상' : equipment.status === 'check' ? '수리/점검중' : '고장' }}</div>
            <div style="grid-column: 1 / -1;"><strong style="color:var(--text-sub);">보관/지급 위치:</strong> {{ equipment.location || '-' }}</div>
            <div style="grid-column: 1 / -1;"><strong style="color:var(--text-sub);">보유 수량:</strong> <span class="fw-bold text-primary">{{ equipment.quantity || equipment.totalQty }}</span></div>
          </div>
        </div>

        <!-- 1-b) 현재 배치 탭 (장비 목록 페이지용) -->
        <div v-if="detailTab === 'assignment'">
          <div class="info-row"><strong>모델명:</strong> {{ equipment.model }}</div>
          <div class="info-row"><strong>고유번호:</strong> {{ equipment.serialNo }}</div>
          <div class="info-row" style="margin-top: 12px;">
            <strong>현재 투입 현장 (이동 처리):</strong>
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
              <div v-for="(assign, i) in equipment.assignments" :key="i" class="assignment-card">
                <div class="assign-info">
                  <span class="site-badge">{{ assign.siteName }}</span>
                  <strong style="color: var(--primary);">{{ assign.qty }}대(개)</strong>
                </div>
                <button class="btn-move" @click="openMoveForm(assign)">
                  <i class="mdi mdi-truck-delivery-outline"></i> 이동
                </button>
              </div>
            </div>
          </div>
          <p class="text-sub mt-2" style="margin-top: 8px; font-size: 13px;">※ 이동 버튼을 눌러 타 현장이나 창고로 장비를 탁송 처리할 수 있습니다.</p>
        </div>

        <!-- 2) 단지 이동 이력 탭 -->
        <div v-else-if="detailTab === 'movement'">
          <div v-if="currentMovements.length === 0" class="empty-state-mini">이동 이력이 없습니다.</div>
          <table v-else class="modal-table">
            <thead>
            <tr>
              <th>이동 일자</th>
              <th>출발지</th>
              <th>도착지</th>
              <th>담당자</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="item in currentMovements" :key="item.idx">
              <td>{{ item.date }}</td>
              <td>{{ item.fromSite }}</td>
              <td><strong>{{ item.toSite }}</strong></td>
              <td>{{ item.manager }}</td>
            </tr>
            </tbody>
          </table>
        </div>

        <!-- 3) 수리/점검 대장 탭 -->
        <div v-else-if="detailTab === 'repair'">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
            <p class="text-sub" style="margin: 0; font-size: 13px;">※ 장비의 수리 및 정기 점검 이력을 관리합니다.</p>
            <button class="btn-add" @click="openRepairForm" style="padding:6px 12px; border-radius:4px; border:none; background:var(--primary); color:#fff; cursor:pointer; display:flex; align-items:center; gap:4px; font-weight:600; font-size:12px;">
              <i class="mdi mdi-wrench-outline"></i> 수리/점검 등록
            </button>
          </div>
          <div v-if="currentRepairs.length === 0" class="empty-state-mini">수리 및 점검 내역이 없습니다.</div>
          <table v-else class="modal-table">
            <thead>
            <tr>
              <th>일자</th>
              <th>구분</th>
              <th>점검/수리 내용</th>
              <th>수리 업체</th>
              <th>비용</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="item in currentRepairs" :key="item.idx">
              <td>{{ item.date }}</td>
              <td>
                  <span :class="['type-badge', item.type === '수리' ? 'type-car' : (item.type === '점검' ? 'type-equip' : 'type-consumable')]">
                    {{ item.type }}
                  </span>
              </td>
              <td>{{ item.content }}</td>
              <td>{{ item.center }}</td>
              <td style="color: var(--danger); font-weight: 600;">{{ formatCurrency(item.cost) }}</td>
            </tr>
            </tbody>
          </table>
        </div>

        <!-- 4) 구매/양도 내역 탭 -->
        <div v-else-if="detailTab === 'transaction'">
          <div v-if="currentTransactions.length === 0" class="empty-state-mini">거래 이력이 없습니다.</div>
          <table v-else class="modal-table">
            <thead>
            <tr>
              <th>일자</th>
              <th>구분</th>
              <th>거래처 (대상)</th>
              <th>수량</th>
              <th>금액</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="item in currentTransactions" :key="item.idx">
              <td>{{ item.date }}</td>
              <td>
                  <span :class="['type-badge', item.type === 'BUY' ? 'bg-green' : (item.type === 'SELL' ? 'bg-red' : 'bg-blue')]">
                    {{ item.type === 'BUY' ? '구매' : (item.type === 'SELL' ? '양도' : '양수') }}
                  </span>
              </td>
              <td>{{ item.partner }}</td>
              <td>{{ item.qty }}</td>
              <td style="font-weight: 600;">{{ formatCurrency(item.price) }}</td>
            </tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  </div>

  <!-- ── 5) 장비 이동 폼 모달 (신규 추가) ── -->
  <div v-if="showMoveModal" class="modal-overlay" style="z-index: 1100;" @click.self="showMoveModal = false">
    <div class="modal-content" style="max-width: 400px; background: var(--bg-surface); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
      <div class="modal-header" style="padding: 18px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center;"><i class="mdi mdi-truck-delivery-outline"></i> 장비 이동 처리</h3>
        <button class="btn-close" @click="showMoveModal = false" style="background: none; border: none; font-size: 20px; color: #6b7280; cursor: pointer;"><i class="mdi mdi-close"></i></button>
      </div>
      <div class="modal-body" style="padding: 24px;">
        <div class="move-form-group">
          <label>출발지</label>
          <!--input type="text" :value="moveForm.fromSite" disabled class="form-input bg-gray" /-->
          <SiteSelect v-model="moveForm.toSite" disabled />
        </div>
        <div class="move-form-group">
          <label>도착지</label>
          <!--select v-model="moveForm.toSite" class="form-input">
            <option value="" disabled>도착 현장을 선택하세요</option>
            <option v-for="site in ALL_SITES" :key="site" :value="site" :disabled="site === moveForm.fromSite">
              {{ site }}
            </option>
          </select-->
          <SiteSelect v-model="moveForm.toSite" />
        </div>
        <div class="move-form-group">
          <label>이동 수량 (최대 {{ moveForm.maxQty }}개)</label>
          <input type="number" v-model.number="moveForm.qty" min="1" :max="moveForm.maxQty" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>이동 일자</label>
          <input type="date" v-model="moveForm.date" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>담당자 (선택)</label>
          <input type="text" v-model="moveForm.manager" placeholder="탁송자 입력" class="form-input" />
        </div>
      </div>
      <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color, #e5e7eb); display: flex; gap: 8px; justify-content: flex-end;">
        <button @click="showMoveModal = false" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #e5e7eb; background: var(--bg-surface); cursor: pointer;">취소</button>
        <button @click="executeMove" style="padding: 8px 16px; border-radius: 6px; border: none; background: var(--primary, #4f46e5); color: #fff; cursor: pointer; font-weight: 600;">이동 확정</button>
      </div>
    </div>
  </div>

  <!-- ── 6) 수리/점검 등록 모달 (신규 추가) ── -->
  <div v-if="showRepairModal" class="modal-overlay" style="z-index: 1100;" @click.self="showRepairModal = false">
    <div class="modal-content" style="max-width: 400px; background: var(--bg-surface); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
      <div class="modal-header" style="padding: 18px 20px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; font-size: 16px; font-weight: 700; display: flex; align-items: center;"><i class="mdi mdi-wrench-outline" style="margin-right: 4px;"></i> 수리/점검 내역 등록</h3>
        <button class="btn-close" @click="showRepairModal = false" style="background: none; border: none; font-size: 20px; color: #6b7280; cursor: pointer;"><i class="mdi mdi-close"></i></button>
      </div>
      <div class="modal-body" style="padding: 24px;">
        <div class="move-form-group">
          <label>등록 유형</label>
          <select v-model="repairForm.type" class="form-input">
            <option value="수리">고장 수리</option>
            <option value="점검">정기 점검</option>
          </select>
        </div>
        <div class="move-form-group">
          <label>발생 일자</label>
          <input type="date" v-model="repairForm.date" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>점검 및 수리 내용</label>
          <input type="text" v-model="repairForm.content" placeholder="예: 필터 교체 및 모터 점검" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>수리 업체 (카센터 등)</label>
          <input type="text" v-model="repairForm.center" placeholder="자체 점검인 경우 비워두세요" class="form-input" />
        </div>
        <div class="move-form-group">
          <label>발생 비용 (원)</label>
          <input type="number" v-model.number="repairForm.cost" min="0" step="1000" class="form-input" />
        </div>
        <div class="move-form-group" style="flex-direction: row; align-items: center; gap: 8px; margin-top: 6px;">
          <input type="checkbox" id="updateStatusChk" v-model="repairForm.updateStatus" style="width: 16px; height: 16px; cursor: pointer;" />
          <label for="updateStatusChk" style="margin: 0; cursor: pointer; color: var(--danger, #ef4444);">
            저장 시 장비 상태를 '수리/점검중'으로 변경
          </label>
        </div>
      </div>
      <div class="modal-footer" style="padding: 16px 20px; border-top: 1px solid var(--border-color, #e5e7eb); display: flex; gap: 8px; justify-content: flex-end;">
        <button @click="showRepairModal = false" style="padding: 8px 16px; border-radius: 6px; border: 1px solid #e5e7eb; background: var(--bg-surface); cursor: pointer;">취소</button>
        <button @click="executeRepair" style="padding: 8px 16px; border-radius: 6px; border: none; background: var(--primary, #4f46e5); color: #fff; cursor: pointer; font-weight: 600;">등록 완료</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── 뱃지 & 유틸 ── */
.type-badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
.type-car { background: #e0f2fe; color: #0284c7; }
.type-equip { background: #fef9c3; color: #ca8a04; }
.type-consumable { background: #f3f4f6; color: #4b5563; }
.bg-green { background: rgba(16,185,129,.1); color: var(--success); }
.bg-red { background: rgba(239,68,68,.1); color: var(--danger); }
.bg-blue { background: #e0f2fe; color: #0284c7; }
.site-badge { background: #e0e7ff; color: #4338ca; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.font-weight-bold { font-weight: 600; color: var(--text-main, #111827); }
.text-sub { color: var(--text-sub, #4b5563); }
.text-primary { color: var(--primary); }

/* ── 빈 상태 (Empty State) ── */
.empty-state-mini { text-align: center; padding: 40px 0; color: #9ca3af; font-size: 13px; }

/* ── 모달 ── */
.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; }
.modal-tabs button { flex: 1; padding: 14px; background: none; border: none; font-size: 13px; font-weight: 600; color: var(--text-sub, #4b5563); cursor: pointer; border-bottom: 2px solid transparent; }
.modal-tabs button:hover { color: var(--primary, #4f46e5); }
.modal-tabs button.active {
  color: var(--primary, #4f46e5);
  border-bottom-color: var(--primary, #4f46e5);
  background: var(--bg-surface);
}
.info-row { margin-bottom: 10px; font-size: 14px; color: var(--text-main, #111827); }
.modal-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.modal-table th, .modal-table td { padding: 12px; border-bottom: 1px solid var(--border-color, #e5e7eb); text-align: left; }
.modal-table th { background: var(--bg-canvas, #f9fafb); color: var(--text-sub, #4b5563); font-weight: 600; }

/* ── 배치 탭 이동 버튼 & 카드 ── */
.assignment-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 8px;
  background: var(--bg-surface);
}
.assign-info { display: flex; align-items: center; gap: 10px; }
.btn-move { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: var(--primary); border: 1px solid var(--primary, #4f46e5); color: #fff; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.btn-move:hover { background: var(--primary-hover); }

/* ── 장비 이동 폼 (Sub Modal) ── */
.move-form-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.move-form-group label { font-size: 12px; font-weight: 600; color: var(--text-main, #111827); }
.form-input { padding: 10px; border: 1px solid var(--border-color, #e5e7eb); border-radius: 6px; font-size: 13px; outline: none; }
.form-input:focus { border-color: var(--primary, #4f46e5); box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.1); }
.bg-gray { background: var(--bg-canvas, #f9fafb); color: var(--text-sub, #4b5563); }
</style>