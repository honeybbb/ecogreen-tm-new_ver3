<script setup>
import { ref, computed, watch } from 'vue';

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  members: { type: Array, default: () => [] },
});
const emit = defineEmits(['update:modelValue']);

const close = () => emit('update:modelValue', false);

// ── 컬럼 정의 ─────────────────────────────────────────────────────────────
const ALL_COLUMNS = [
  { key: 'id',               label: 'ID',        group: '기본정보' },
  { key: 'siteName',         label: '현장',       group: '기본정보' },
  { key: 'name',             label: '이름',       group: '기본정보' },
  { key: 'position',         label: '직책',       group: '기본정보' },
  { key: 'type',             label: '구분',       group: '기본정보' },
  { key: 'gender',           label: '성별',       group: '기본정보' },
  { key: 'birthDt',          label: '생년월일',   group: '기본정보' },
  { key: 'age',              label: '나이',       group: '기본정보' },
  { key: 'rrn',              label: '주민번호',   group: '기본정보' },
  { key: 'phone',            label: '연락처',     group: '기본정보' },
  { key: 'foreigner',        label: '내/외국인',  group: '기본정보' },
  { key: 'nationality',      label: '국적',       group: '기본정보' },
  { key: 'visa_code',        label: '비자종류',   group: '기본정보' },
  { key: 'visa_date',        label: '비자만료일', group: '기본정보' },
  { key: 'disability',       label: '장애여부',   group: '기본정보' },
  { key: 'disability_grade', label: '장애등급',   group: '기본정보' },
  { key: 'disability_date',  label: '장애판정일', group: '기본정보' },
  { key: 'inDate',           label: '입사일',     group: '근무정보' },
  { key: 'outDate',          label: '퇴사일',     group: '근무정보' },
  { key: 'outReason',        label: '퇴직사유',   group: '근무정보' },
  { key: 'contract',         label: '근로계약일', group: '근무정보' },
  { key: 'status',           label: '재직상태',   group: '근무정보' },
  { key: 'four_ins',         label: '4대보험',    group: '보험/급여' },
  { key: 'retire_pension',   label: '퇴직연금',   group: '보험/급여' },
  { key: 'bank',             label: '은행',       group: '보험/급여' },
  { key: 'accountNumber',    label: '계좌번호',   group: '보험/급여' },
];

const COLUMN_GROUPS = ['기본정보', '근무정보', '보험/급여'];

// ── 양식(프리셋) 정의 ─────────────────────────────────────────────────────
const PRESETS = [
  {
    id: 'basic',
    label: '기본 명부',
    desc: '이름·현장·연락처·입사일 등 핵심 정보',
    icon: 'mdi-account-card',
    keys: ['id','siteName','name','position','gender','birthDt','age','phone','inDate','status'],
  },
  {
    id: 'insurance',
    label: '4대보험 관리',
    desc: '보험·연금 관련 정보 및 제외 대상자',
    icon: 'mdi-shield-check',
    keys: ['id','siteName','name','birthDt','age','rrn','four_ins','retire_pension','inDate','outDate','status'],
  },
  {
    id: 'payroll',
    label: '급여/계좌',
    desc: '급여 이체용 계좌 정보 일괄 추출',
    icon: 'mdi-bank',
    keys: ['id','siteName','name','bank','accountNumber','phone','inDate','status'],
  },
  {
    id: 'foreigner',
    label: '외국인 관리',
    desc: '외국인 직원 비자·국적 정보',
    icon: 'mdi-earth',
    keys: ['id','siteName','name','nationality','visa_code','visa_date','phone','inDate','status'],
  },
  {
    id: 'disability',
    label: '장애인 관리',
    desc: '장애 등급·판정일 및 고용의무 현황',
    icon: 'mdi-wheelchair-accessibility',
    keys: ['id','siteName','name','disability','disability_grade','disability_date','inDate','status'],
  },
  {
    id: 'full',
    label: '전체 항목',
    desc: '모든 컬럼 포함 전체 데이터 추출',
    icon: 'mdi-table-large',
    keys: ALL_COLUMNS.map(c => c.key),
  },
  {
    id: 'custom',
    label: '직접 선택',
    desc: '원하는 컬럼을 직접 골라서 추출',
    icon: 'mdi-tune',
    keys: [],
  },
];

// ── 상태 ──────────────────────────────────────────────────────────────────
const selectedPreset = ref('basic');
const selectedKeys   = ref([...PRESETS[0].keys]);
const isDownloading  = ref(false);
const step           = ref(1); // 1: 양식선택, 2: 컬럼확인/편집

const activePreset = computed(() => PRESETS.find(p => p.id === selectedPreset.value));

const groupedColumns = computed(() => {
  return COLUMN_GROUPS.map(group => ({
    group,
    cols: ALL_COLUMNS.filter(c => c.group === group),
  }));
});

const selectPreset = (preset) => {
  selectedPreset.value = preset.id;
  if (preset.id !== 'custom') {
    selectedKeys.value = [...preset.keys];
  }
};

const isAllGroupSelected = (group) => {
  const keys = ALL_COLUMNS.filter(c => c.group === group).map(c => c.key);
  return keys.every(k => selectedKeys.value.includes(k));
};

const toggleGroup = (group) => {
  const keys = ALL_COLUMNS.filter(c => c.group === group).map(c => c.key);
  if (isAllGroupSelected(group)) {
    selectedKeys.value = selectedKeys.value.filter(k => !keys.includes(k));
  } else {
    const merged = [...new Set([...selectedKeys.value, ...keys])];
    selectedKeys.value = merged;
  }
};

const toggleKey = (key) => {
  if (selectedKeys.value.includes(key)) {
    selectedKeys.value = selectedKeys.value.filter(k => k !== key);
  } else {
    selectedKeys.value = [...selectedKeys.value, key];
  }
  // 커스텀과 다르면 'custom'으로 전환
  const matched = PRESETS.find(p => p.id !== 'custom' && JSON.stringify([...p.keys].sort()) === JSON.stringify([...selectedKeys.value].sort()));
  selectedPreset.value = matched ? matched.id : 'custom';
};

// ── 다운로드 ──────────────────────────────────────────────────────────────
const calculateAge = (birthDt) => {
  if (!birthDt) return null;
  const today = new Date();
  const birth = new Date(birthDt);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

const formatDate = (val) => {
  if (!val) return '';
  return String(val).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
};

const resolveValue = (member, key) => {
  switch (key) {
    case 'age':    return calculateAge(member.birthDt) ?? '';
    case 'gender': return member.gender === 'M' ? '남' : '여';
    case 'foreigner': return (member.foreigner === 'Y' || member.foreigner === true) ? '외국인' : '내국인';
    case 'disability': return (member.disability === 'Y' || member.disability === true) ? '장애' : '-';
    case 'four_ins': return (member.four_ins === 'Y' || member.four_ins === true) ? 'Y' : 'N';
    case 'retire_pension': return (member.retire_pension === 'Y' || member.retire_pension === true) ? 'Y' : 'N';
    case 'inDate':
    case 'outDate':
    case 'birthDt':
    case 'visa_date':
    case 'disability_date':
    case 'contract':
      return formatDate(member[key]);
    case 'status':
      return member.status == 0 ? '재직' : member.status == 1 ? '퇴사' : member.status == 2 ? '일용직' : '대근';
    default: return member[key] ?? '';
  }
};

const downloadExcel = async () => {
  if (!selectedKeys.value.length) {
    alert('최소 1개 이상의 컬럼을 선택해주세요.');
    return;
  }
  isDownloading.value = true;

  try {
    // SheetJS (xlsx) 동적 로드
    if (!window.XLSX) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const orderedCols = ALL_COLUMNS.filter(c => selectedKeys.value.includes(c.key));
    const headers = orderedCols.map(c => c.label);
    const rows = props.members.map(member =>
        orderedCols.map(c => resolveValue(member, c.key))
    );

    const ws = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // 헤더 스타일
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
      fill: { fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
        right:  { style: 'thin', color: { rgb: 'FFFFFF' } },
      },
    };

    headers.forEach((_, ci) => {
      const cellAddr = window.XLSX.utils.encode_cell({ r: 0, c: ci });
      if (ws[cellAddr]) ws[cellAddr].s = headerStyle;
    });

    // 열 너비 자동 조정
    const colWidths = orderedCols.map((col, ci) => {
      const maxLen = Math.max(
          col.label.length * 2,
          ...rows.map(r => String(r[ci] ?? '').length)
      );
      return { wch: Math.min(maxLen + 2, 30) };
    });
    ws['!cols'] = colWidths;

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, '직원명부');

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const presetLabel = activePreset.value?.label ?? '커스텀';
    window.XLSX.writeFile(wb, `직원명부_${presetLabel}_${today}.xlsx`);

    close();
  } catch (e) {
    alert('엑셀 다운로드 중 오류가 발생했습니다.');
    console.error(e);
  } finally {
    isDownloading.value = false;
  }
};

watch(() => props.modelValue, (v) => {
  if (v) step.value = 1;
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="modelValue" class="modal-backdrop" @click.self="close">
        <div class="modal-box">

          <!-- 헤더 -->
          <div class="modal-header">
            <div class="modal-title-wrap">
              <i class="mdi mdi-microsoft-excel modal-icon"></i>
              <div>
                <h2 class="modal-title">엑셀 다운로드</h2>
                <p class="modal-sub">양식을 선택하거나 컬럼을 직접 지정하세요</p>
              </div>
            </div>
            <button class="modal-close" @click="close"><i class="mdi mdi-close"></i></button>
          </div>

          <div class="modal-body">

            <!-- STEP 1: 양식 선택 -->
            <div class="section-title">
              <span class="step-badge">1</span> 양식 선택
            </div>
            <div class="preset-grid">
              <button
                  v-for="preset in PRESETS"
                  :key="preset.id"
                  :class="['preset-card', { active: selectedPreset === preset.id }]"
                  @click="selectPreset(preset)"
              >
                <i :class="['mdi', preset.icon, 'preset-icon']"></i>
                <span class="preset-label">{{ preset.label }}</span>
                <span class="preset-desc">{{ preset.desc }}</span>
                <i v-if="selectedPreset === preset.id" class="mdi mdi-check-circle preset-check"></i>
              </button>
            </div>

            <!-- STEP 2: 컬럼 선택 -->
            <div class="section-title" style="margin-top: 24px;">
              <span class="step-badge">2</span> 컬럼 선택
              <span class="col-count">{{ selectedKeys.length }} / {{ ALL_COLUMNS.length }} 선택됨</span>
            </div>

            <div class="column-panel">
              <div v-for="{ group, cols } in groupedColumns" :key="group" class="col-group">
                <div class="col-group-header">
                  <label class="group-check-label">
                    <input type="checkbox" :checked="isAllGroupSelected(group)" @change="toggleGroup(group)" />
                    <span class="group-name">{{ group }}</span>
                  </label>
                </div>
                <div class="col-chips">
                  <label
                      v-for="col in cols"
                      :key="col.key"
                      :class="['col-chip', { selected: selectedKeys.includes(col.key) }]"
                  >
                    <input type="checkbox" :checked="selectedKeys.includes(col.key)" @change="toggleKey(col.key)" />
                    {{ col.label }}
                  </label>
                </div>
              </div>
            </div>

            <!-- 미리보기 순서 -->
            <div v-if="selectedKeys.length" class="preview-order">
              <span class="preview-label"><i class="mdi mdi-eye-outline"></i> 출력 순서 미리보기</span>
              <div class="preview-chips">
                <span v-for="key in selectedKeys" :key="key" class="preview-chip">
                  {{ ALL_COLUMNS.find(c => c.key === key)?.label }}
                </span>
              </div>
            </div>
          </div>

          <!-- 푸터 -->
          <div class="modal-footer">
            <span class="footer-info">
              <i class="mdi mdi-account-multiple"></i>
              {{ members.length }}명 데이터 · {{ selectedKeys.length }}개 컬럼
            </span>
            <div class="footer-btns">
              <button class="btn-cancel" @click="close">취소</button>
              <button class="btn-download" :disabled="isDownloading || !selectedKeys.length" @click="downloadExcel">
                <i :class="['mdi', isDownloading ? 'mdi-loading mdi-spin' : 'mdi-download']"></i>
                {{ isDownloading ? '생성 중...' : '엑셀 다운로드' }}
              </button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── 오버레이 ── */
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(4px);
  display: flex; align-items: center; justify-content: center;
  z-index: 9999;
  padding: 20px;
}

.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity .2s, transform .2s; }
.modal-fade-enter-from,
.modal-fade-leave-to { opacity: 0; transform: scale(.96); }

/* ── 박스 ── */
.modal-box {
  background: var(--bg-surface, #fff);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0,0,0,.2);
  width: 100%; max-width: 760px;
  max-height: 90vh;
  display: flex; flex-direction: column;
  overflow: hidden;
}

/* ── 헤더 ── */
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  flex-shrink: 0;
}
.modal-title-wrap { display: flex; align-items: center; gap: 12px; }
.modal-icon { font-size: 28px; color: #16a34a; }
.modal-title { font-size: 18px; font-weight: 700; color: var(--text-main, #111); margin: 0; }
.modal-sub { font-size: 12px; color: var(--text-sub, #6b7280); margin: 2px 0 0; }
.modal-close {
  width: 32px; height: 32px; border-radius: 8px; border: none;
  background: var(--bg-hover, #f3f4f6); color: var(--text-sub, #6b7280);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  font-size: 18px; transition: .15s;
}
.modal-close:hover { background: var(--danger-soft, #fee2e2); color: var(--danger, #ef4444); }

/* ── 바디 ── */
.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}
.modal-body::-webkit-scrollbar { width: 6px; }
.modal-body::-webkit-scrollbar-thumb { background: var(--border-color, #e5e7eb); border-radius: 3px; }

/* ── 섹션 타이틀 ── */
.section-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; font-weight: 700; color: var(--text-main, #111);
  margin-bottom: 12px;
}
.step-badge {
  width: 20px; height: 20px; background: var(--primary, #2563eb); color: #fff;
  border-radius: 50%; font-size: 11px; font-weight: 700;
  display: inline-flex; align-items: center; justify-content: center;
}
.col-count {
  margin-left: auto; font-size: 12px; color: var(--text-sub, #6b7280); font-weight: 400;
}

/* ── 프리셋 카드 ── */
.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}
.preset-card {
  position: relative;
  display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  padding: 12px 14px;
  border: 1.5px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  background: var(--bg-canvas, #f9fafb);
  cursor: pointer; text-align: left;
  transition: .15s;
}
.preset-card:hover { border-color: var(--primary, #2563eb); background: var(--primary-soft, #eff6ff); }
.preset-card.active {
  border-color: var(--primary, #2563eb);
  background: var(--primary-soft, #eff6ff);
  box-shadow: 0 0 0 3px rgba(37,99,235,.12);
}
.preset-icon { font-size: 20px; color: var(--primary, #2563eb); }
.preset-label { font-size: 13px; font-weight: 700; color: var(--text-main, #111); }
.preset-desc { font-size: 11px; color: var(--text-sub, #6b7280); line-height: 1.4; }
.preset-check {
  position: absolute; top: 8px; right: 8px;
  font-size: 16px; color: var(--primary, #2563eb);
}

/* ── 컬럼 패널 ── */
.column-panel {
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  overflow: hidden;
}
.col-group { border-bottom: 1px solid var(--border-color, #e5e7eb); }
.col-group:last-child { border-bottom: none; }
.col-group-header {
  padding: 8px 14px;
  background: var(--bg-canvas, #f9fafb);
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}
.group-check-label {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
}
.group-check-label input { accent-color: var(--primary, #2563eb); }
.group-name { font-size: 12px; font-weight: 700; color: var(--text-main, #111); }
.col-chips {
  display: flex; flex-wrap: wrap; gap: 6px;
  padding: 10px 14px;
}
.col-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 4px 10px;
  border-radius: 20px;
  border: 1.5px solid var(--border-color, #e5e7eb);
  background: var(--bg-surface, #fff);
  font-size: 12px; color: var(--text-sub, #6b7280);
  cursor: pointer; transition: .12s;
  user-select: none;
}
.col-chip input { display: none; }
.col-chip:hover { border-color: var(--primary, #2563eb); color: var(--primary, #2563eb); }
.col-chip.selected {
  background: var(--primary, #2563eb);
  border-color: var(--primary, #2563eb);
  color: #fff;
  font-weight: 600;
}

/* ── 미리보기 ── */
.preview-order {
  margin-top: 16px;
  padding: 12px 14px;
  border: 1px dashed var(--border-color, #e5e7eb);
  border-radius: 10px;
  background: var(--bg-canvas, #f9fafb);
}
.preview-label {
  display: flex; align-items: center; gap: 6px;
  font-size: 12px; font-weight: 600; color: var(--text-sub, #6b7280);
  margin-bottom: 8px;
}
.preview-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.preview-chip {
  padding: 2px 8px;
  background: var(--bg-surface, #fff);
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 4px;
  font-size: 11px; color: var(--text-main, #111);
}

/* ── 푸터 ── */
.modal-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 24px;
  border-top: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-canvas, #f9fafb);
  flex-shrink: 0;
}
.footer-info { font-size: 12px; color: var(--text-sub, #6b7280); display: flex; align-items: center; gap: 6px; }
.footer-btns { display: flex; gap: 8px; }

.btn-cancel {
  padding: 8px 18px; border-radius: 8px;
  border: 1px solid var(--border-color, #e5e7eb);
  background: var(--bg-surface, #fff);
  color: var(--text-sub, #6b7280);
  font-size: 13px; font-weight: 600; cursor: pointer; transition: .15s;
}
.btn-cancel:hover { border-color: var(--danger, #ef4444); color: var(--danger, #ef4444); }

.btn-download {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 20px; border-radius: 8px; border: none;
  background: #16a34a; color: #fff;
  font-size: 13px; font-weight: 700; cursor: pointer; transition: .15s;
}
.btn-download:hover:not(:disabled) { background: #15803d; }
.btn-download:disabled { opacity: 0.55; cursor: not-allowed; }
</style>
