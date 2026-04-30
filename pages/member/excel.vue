<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from 'axios';
import * as XLSX from 'xlsx';

const router = useRouter();
const { siteOptions, fetchSiteOptions } = useApi();

// ── 상태 ─────────────────────────────────────────
const selectedSite  = ref('');
const isDragging    = ref(false);
const isUploading   = ref(false);
const uploadResult  = ref(null); // { total, success, fails[] }
const previewRows   = ref([]);   // 엑셀 파싱 미리보기 데이터
const selectedFile  = ref(null);
const fileInput     = ref(null);
const currentStep   = ref(1);   // 1: 현장 선택 + 파일 선택, 2: 미리보기, 3: 결과

// ── 컬럼 정의 ─────────────────────────────────────
const REQUIRED_COLUMNS = ['사번', '이름', '구분(경비/미화)', '성별', '생년월일'];
const ALL_COLUMNS = [
  { key: '사번',              width: '80px'  },
  { key: '이름',              width: '80px'  },
  { key: '구분(경비/미화)',     width: '110px' },
  { key: '성별',              width: '60px'  },
  { key: '생년월일',           width: '110px' },
  { key: '주민번호',           width: '110px' },
  { key: '연락처',             width: '120px' },
  { key: '직위',              width: '80px'  },
  { key: '이메일',             width: '160px' },
  { key: '주소',              width: '200px' },
  { key: '은행',              width: '80px'  },
  { key: '계좌번호',           width: '140px' },
  { key: '입사일',             width: '110px' },
  { key: '퇴사일',             width: '110px' },
  { key: '사직사유',           width: '120px' },
  { key: '장애여부(Y/N)',       width: '100px' },
  { key: '장애등록일',          width: '110px' },
  { key: '장애등급',           width: '80px'  },
  { key: '새터민여부(Y/N)',      width: '110px' },
  { key: '국가유공자여부(Y/N)',   width: '130px' },
  { key: '청년인턴(Y/N)',       width: '100px' },
  { key: '기초생활수급자(Y/N)',   width: '130px' },
  { key: '외국인여부(Y/N)',      width: '110px' },
  { key: '국적',              width: '80px'  },
  { key: '비자코드',           width: '80px'  },
  { key: '비자만료일',          width: '110px' },
  { key: '비고',              width: '160px' },
  { key: '4대보험가입여부',     width: '160px' },
  { key: '퇴직연금가입여부',    width: '160px' },
];

// ── 템플릿 다운로드 ───────────────────────────────
const downloadTemplate = () => {
  const headers = ALL_COLUMNS.map(c => c.key);

  const sampleRows = [
    [
      'EMP001', '홍길동', '경비', '남', '19850315','850315-1234567',
      '010-1234-5678', '경비원', 'hong@email.com', '서울시 강남구',
      '국민', '12345678901234', '2025-01-01', '', '',
      'N', '', '', 'N', 'N', 'N', 'N',
      'N', '', '', '', ''
    ],
    [
      'EMP002', '김미화', '미화', '여', '19900520','900520-2000000',
      '010-9876-5432', '미화원', '', '경기도 수원시',
      '신한', '98765432109876', '2025-01-01', '', '',
      'N', '', '', 'N', 'N', 'N', 'N',
      'N', '', '', '', ''
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);

  // 컬럼 너비 설정
  ws['!cols'] = ALL_COLUMNS.map(c => ({ wch: parseInt(c.width) / 7 + 4 }));

  // 헤더 스타일 (배경색)
  const headerRange = XLSX.utils.decode_range(ws['!ref']);
  for (let C = headerRange.s.c; C <= headerRange.e.c; C++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[addr]) continue;
    ws[addr].s = {
      fill: { fgColor: { rgb: '1e3a5f' } },
      font: { color: { rgb: 'FFFFFF' }, bold: true },
      alignment: { horizontal: 'center' }
    };
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '직원일괄등록');
  XLSX.writeFile(wb, '직원_일괄등록_양식.xlsx');
};

// ── 파일 파싱 ─────────────────────────────────────
const parseFile = (file) => {
  selectedFile.value = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (rows.length === 0) {
        alert('엑셀 파일에 데이터가 없습니다.');
        return;
      }

      // 필수 컬럼 체크
      const missingCols = REQUIRED_COLUMNS.filter(col => !(col in rows[0]));
      if (missingCols.length > 0) {
        alert(`필수 컬럼이 없습니다: ${missingCols.join(', ')}\n템플릿을 사용해 주세요.`);
        return;
      }

      previewRows.value = rows.map((row, idx) => ({
        _rowNum: idx + 2, // 엑셀 행 번호 (헤더=1)
        _valid: validateRow(row),
        ...row,
      }));

      currentStep.value = 2;
    } catch (e) {
      alert('파일을 읽는 중 오류가 발생했습니다. 올바른 엑셀 파일인지 확인해주세요.');
    }
  };
  reader.readAsArrayBuffer(file);
};

const validateRow = (row) => {
  const errors = [];
  if (!row['사번'])           errors.push('사번 없음');
  if (!row['이름'])           errors.push('이름 없음');
  if (!row['구분(경비/미화)'])  errors.push('구분 없음');
  if (!row['성별'])           errors.push('성별 없음');
  if (!row['생년월일'])        errors.push('생년월일 없음');
  if (row['외국인여부(Y/N)'] === 'Y' && !row['국적']) errors.push('국적 없음(외국인)');
  return errors;
};

// ── 드래그 앤 드롭 ────────────────────────────────
const onDragOver  = (e) => { e.preventDefault(); isDragging.value = true; };
const onDragLeave = ()  => { isDragging.value = false; };
const onDrop      = (e) => {
  e.preventDefault();
  isDragging.value = false;
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
};
const onFileChange = (e) => {
  const file = e.target.files[0];
  if (file) handleFileSelect(file);
};

const handleFileSelect = (file) => {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls'].includes(ext)) {
    alert('엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.');
    return;
  }
  parseFile(file);
};

// ── 통계 ─────────────────────────────────────────
const stats = computed(() => ({
  total:   previewRows.value.length,
  valid:   previewRows.value.filter(r => r._valid.length === 0).length,
  invalid: previewRows.value.filter(r => r._valid.length > 0).length,
}));

// ── 실제 업로드 ───────────────────────────────────
const handleUpload = async () => {
  if (!selectedSite.value) {
    alert('현장을 선택해주세요.');
    return;
  }
  if (stats.value.invalid > 0) {
    if (!confirm(`오류가 있는 ${stats.value.invalid}건은 제외하고 ${stats.value.valid}건만 등록합니다. 계속하시겠습니까?`)) return;
  } else {
    if (!confirm(`총 ${stats.value.total}건을 등록합니다. 계속하시겠습니까?`)) return;
  }

  isUploading.value = true;
  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    formData.append('sIdx', selectedSite.value);

    const res = await axios.post('/api/v1/upload/member', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    uploadResult.value = res.data;
    currentStep.value = 3;
  } catch (e) {
    alert('업로드 중 오류가 발생했습니다.');
    console.error(e);
  } finally {
    isUploading.value = false;
  }
};

// ── 초기화 ───────────────────────────────────────
const resetAll = () => {
  selectedFile.value  = null;
  previewRows.value   = [];
  uploadResult.value  = null;
  currentStep.value   = 1;
  isDragging.value    = false;
  if (fileInput.value) fileInput.value.value = '';
};

const formatCellValue = (val) => {
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val ?? '');
};

onMounted(() => fetchSiteOptions());
</script>

<template>
  <div class="bulk-register-page">

    <!-- ── 페이지 헤더 ─────────────────────── -->
    <div class="page-header">
      <div class="header-left">
        <button type="button" @click="router.push('/member/list')" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title">
            <i class="mdi mdi-table-account"></i>
            직원 일괄 등록
          </h1>
          <p class="page-subtitle">엑셀 파일로 여러 명의 직원을 한 번에 등록합니다</p>
        </div>
      </div>
      <button @click="downloadTemplate" class="btn-template">
        <i class="mdi mdi-microsoft-excel"></i>
        <span>양식 다운로드</span>
      </button>
    </div>

    <!-- ── 단계 표시 ─────────────────────────── -->
    <div class="steps-bar">
      <div v-for="step in [{n:1,label:'파일 선택'},{n:2,label:'내용 확인'},{n:3,label:'등록 완료'}]"
           :key="step.n"
           :class="['step-item', { active: currentStep === step.n, done: currentStep > step.n }]">
        <div class="step-circle">
          <i v-if="currentStep > step.n" class="mdi mdi-check"></i>
          <span v-else>{{ step.n }}</span>
        </div>
        <span class="step-label">{{ step.label }}</span>
        <div v-if="step.n < 3" class="step-line"></div>
      </div>
    </div>

    <!-- ══════════════════════════════════════
         STEP 1: 현장 선택 + 파일 업로드
    ══════════════════════════════════════ -->
    <div v-if="currentStep === 1" class="step-panel">

      <!-- 현장 선택 -->
      <div class="panel-section">
        <h2 class="section-title">
          <i class="mdi mdi-office-building"></i> 배치 현장 선택
          <span class="required-mark">*</span>
        </h2>
        <p class="section-desc">직원들이 배치될 현장을 선택하세요.</p>
        <!--select v-model="selectedSite" class="site-select">
          <option value="">현장을 선택하세요</option>
          <option v-for="opt in siteOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select-->
        <SiteSelect v-model="selectedSite"/>
      </div>

      <!-- 파일 드롭존 -->
      <div class="panel-section">
        <h2 class="section-title">
          <i class="mdi mdi-file-upload"></i> 엑셀 파일 업로드
        </h2>
        <div
            class="drop-zone"
            :class="{ dragging: isDragging, 'no-site': !selectedSite }"
            @dragover="onDragOver"
            @dragleave="onDragLeave"
            @drop="onDrop"
            @click="selectedSite && fileInput.click()"
        >
          <input ref="fileInput" type="file" accept=".xlsx,.xls" class="hidden-input" @change="onFileChange" />
          <div class="drop-zone-inner">
            <div class="drop-icon-wrap">
              <i class="mdi mdi-cloud-upload-outline drop-icon"></i>
            </div>
            <p class="drop-title">
              {{ selectedSite ? '파일을 여기에 드래그하거나 클릭하여 선택' : '먼저 현장을 선택해주세요' }}
            </p>
            <p class="drop-sub">지원 형식: .xlsx, .xls</p>
          </div>
        </div>
      </div>

      <!-- 작성 가이드 -->
      <div class="guide-card">
        <div class="guide-header">
          <i class="mdi mdi-information-outline"></i>
          <span>엑셀 작성 가이드</span>
        </div>
        <div class="guide-grid">
          <div class="guide-item">
            <i class="mdi mdi-numeric-1-circle"></i>
            <div>
              <strong>엑셀양식 사용 필수</strong>
              <p>위 버튼으로 엑셀을 다운로드하여 해당 양식에 맞게 작성하세요.</p>
            </div>
          </div>
          <div class="guide-item">
            <i class="mdi mdi-numeric-2-circle"></i>
            <div>
              <strong>필수 입력 항목</strong>
              <p>사번, 이름, 구분(경비/미화), 성별, 생년월일은 반드시 입력해야 합니다.</p>
            </div>
          </div>
          <div class="guide-item">
            <i class="mdi mdi-numeric-3-circle"></i>
            <div>
              <strong>Y/N 형식</strong>
              <p>장애여부, 외국인여부 등은 반드시 대문자 Y 또는 N으로 입력하세요.</p>
            </div>
          </div>
          <div class="guide-item">
            <i class="mdi mdi-numeric-4-circle"></i>
            <div>
              <strong>날짜 형식</strong>
              <p>날짜는 YYYY-MM-DD 형식으로 입력하세요 (예: 2025-01-15).</p>
            </div>
          </div>
          <div class="guide-item">
            <i class="mdi mdi-numeric-5-circle"></i>
            <div>
              <strong>초기 비밀번호</strong>
              <p>등록된 직원의 초기 비밀번호는 주민번호 앞자리로 자동 설정됩니다.</p>
            </div>
          </div>
          <!--div class="guide-item">
            <i class="mdi mdi-numeric-6-circle"></i>
            <div>
              <strong>구분 입력</strong>
              <p style="display: flex;">구분 컬럼에는 반드시 <strong>경비</strong> 또는 <strong>미화</strong>로 입력하세요</p>
            </div>
          </div-->
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════
         STEP 2: 미리보기 + 검증
    ══════════════════════════════════════ -->
    <div v-if="currentStep === 2" class="step-panel">

      <!-- 요약 통계 -->
      <div class="preview-stats">
        <div class="pstat-card pstat-total">
          <i class="mdi mdi-file-table"></i>
          <div>
            <span class="pstat-num">{{ stats.total }}</span>
            <span class="pstat-label">전체 행</span>
          </div>
        </div>
        <div class="pstat-card pstat-valid">
          <i class="mdi mdi-check-circle"></i>
          <div>
            <span class="pstat-num">{{ stats.valid }}</span>
            <span class="pstat-label">정상 등록 가능</span>
          </div>
        </div>
        <div class="pstat-card" :class="stats.invalid > 0 ? 'pstat-error' : 'pstat-zero'">
          <i class="mdi mdi-alert-circle"></i>
          <div>
            <span class="pstat-num">{{ stats.invalid }}</span>
            <span class="pstat-label">오류 (제외됨)</span>
          </div>
        </div>
      </div>

      <!-- 오류 행 요약 -->
      <div v-if="stats.invalid > 0" class="error-summary">
        <div class="error-summary-header">
          <i class="mdi mdi-alert"></i>
          <span>오류가 있는 행은 등록에서 제외됩니다. 확인 후 수정하세요.</span>
        </div>
        <div class="error-list">
          <div v-for="row in previewRows.filter(r => r._valid.length > 0)" :key="row._rowNum" class="error-row-item">
            <span class="error-row-num">{{ row._rowNum }}행</span>
            <span class="error-name">{{ row['이름'] || '(이름 없음)' }}</span>
            <span class="error-tags">
              <span v-for="e in row._valid" :key="e" class="error-tag">{{ e }}</span>
            </span>
          </div>
        </div>
      </div>

      <!-- 데이터 테이블 -->
      <div class="preview-table-wrap">
        <div class="preview-table-header">
          <span class="preview-table-title">데이터 미리보기</span>
          <span class="preview-table-sub">총 {{ stats.total }}건 · 빨간 행은 오류</span>
        </div>
        <div class="table-scroll">
          <table class="data-table preview-table">
            <thead>
            <tr>
              <th style="width:40px">#</th>
              <th style="width:50px">상태</th>
              <th v-for="col in ALL_COLUMNS" :key="col.key" :style="{minWidth: col.width}">
                {{ col.key }}
                <span v-if="REQUIRED_COLUMNS.includes(col.key)" class="col-required">*</span>
              </th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="row in previewRows" :key="row._rowNum"
                :class="['data-row', { 'row-error': row._valid.length > 0 }]">
              <td>{{ row._rowNum }}</td>
              <td class="text-center">
                  <span v-if="row._valid.length === 0" class="row-ok-badge">
                    <i class="mdi mdi-check"></i>
                  </span>
                <span v-else class="row-err-badge" :title="row._valid.join(', ')">
                    <i class="mdi mdi-close"></i>
                  </span>
              </td>
              <td v-for="col in ALL_COLUMNS" :key="col.key" class="cell-ellipsis">
                {{ formatCellValue(row[col.key]) }}
              </td>
            </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 액션 버튼 -->
      <div class="step-actions">
        <button @click="resetAll" class="btn-back-step">
          <i class="mdi mdi-arrow-left"></i> 다시 선택
        </button>
        <button
            @click="handleUpload"
            :disabled="isUploading || stats.valid === 0"
            class="btn-upload"
        >
          <i v-if="isUploading" class="mdi mdi-loading mdi-spin"></i>
          <i v-else class="mdi mdi-upload"></i>
          {{ isUploading ? '등록 중...' : `${stats.valid}건 등록하기` }}
        </button>
      </div>
    </div>

    <!-- ══════════════════════════════════════
         STEP 3: 결과
    ══════════════════════════════════════ -->
    <div v-if="currentStep === 3 && uploadResult" class="step-panel">
      <div class="result-panel">
        <div class="result-icon-wrap" :class="uploadResult.fails?.length > 0 ? 'result-warn' : 'result-success'">
          <i :class="['mdi', uploadResult.fails?.length > 0 ? 'mdi-alert-circle' : 'mdi-check-circle']"></i>
        </div>
        <h2 class="result-title">
          {{ uploadResult.fails?.length > 0 ? '일부 등록 실패' : '등록 완료!' }}
        </h2>
        <p class="result-desc">{{ uploadResult.message }}</p>

        <div class="result-stats">
          <div class="rstat">
            <span class="rstat-num">{{ uploadResult.total }}</span>
            <span class="rstat-label">전체</span>
          </div>
          <div class="rstat rstat-s">
            <span class="rstat-num">{{ uploadResult.success }}</span>
            <span class="rstat-label">성공</span>
          </div>
          <div class="rstat rstat-f">
            <span class="rstat-num">{{ uploadResult.fails?.length ?? 0 }}</span>
            <span class="rstat-label">실패</span>
          </div>
        </div>

        <!-- 실패 목록 -->
        <div v-if="uploadResult.fails?.length > 0" class="fail-table-wrap">
          <p class="fail-table-title"><i class="mdi mdi-alert"></i> 등록 실패 목록</p>
          <table class="data-table">
            <thead>
            <tr>
              <th>사번</th>
              <th>이름</th>
              <th>실패 사유</th>
            </tr>
            </thead>
            <tbody>
            <tr v-for="f in uploadResult.fails" :key="f.id" class="data-row row-error">
              <td>{{ f.id }}</td>
              <td>{{ f.name }}</td>
              <td class="fail-reason">{{ f.reason || f.error?.message || '알 수 없는 오류' }}</td>
            </tr>
            </tbody>
          </table>
        </div>

        <div class="result-actions">
          <button @click="resetAll" class="btn-back-step">
            <i class="mdi mdi-refresh"></i> 추가 업로드
          </button>
          <button @click="router.push('/member/list')" class="btn-upload">
            <i class="mdi mdi-account-multiple"></i> 직원 명부 보기
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.header-left { display: flex; align-items: flex-start; gap: 16px; }
.btn-template {
  display: flex; align-items: center; gap: 7px;
  padding: 10px 18px; border-radius: 8px;
  background: rgba(16, 185, 129, 0.1); border: 1px solid var(--success);
  color: var(--success); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; white-space: nowrap;
}
.btn-template:hover { background: rgba(16, 185, 129, 0.2); }
.btn-template i { font-size: 18px; }

/* ─── 단계 표시 ─── */
.steps-bar {
  display: flex; align-items: center; margin-bottom: 32px;
  background: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 12px; padding: 20px 32px;
}
.step-item {
  display: flex; align-items: center; gap: 12px; flex: 1;
}
.step-circle {
  width: 36px; height: 36px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: 700; flex-shrink: 0;
  background: var(--bg-hover); color: var(--text-muted);
  border: 2px solid var(--border-color); transition: all 0.3s;
}
.step-item.active .step-circle {
  background: var(--primary); color: var(--text-inverse);
  border-color: var(--primary); box-shadow: 0 0 0 4px var(--primary-soft);
}
.step-item.done .step-circle {
  background: var(--success); color: var(--text-inverse);
  border-color: var(--success);
}
.step-label { font-size: 14px; font-weight: 600; color: var(--text-muted); transition: color 0.3s; }
.step-item.active .step-label, .step-item.done .step-label { color: var(--text-main); }
.step-line { flex: 1; height: 2px; background: var(--border-color); margin: 0 8px; }
.step-item.done .step-line { background: var(--success); }

/* ─── 공통 패널 ─── */
.step-panel { display: flex; flex-direction: column; gap: 24px; }

.panel-section {
  background: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 12px; padding: 28px;
}
.section-title {
  display: flex; align-items: center; gap: 8px;
  font-size: 16px; font-weight: 700; color: var(--text-main);
  margin: 0 0 6px;
}
.section-title i { color: var(--primary); font-size: 20px; }
.required-mark { color: var(--danger); }
.section-desc { font-size: 13px; color: var(--text-sub); margin: 0 0 16px; }

/* ─── 드롭존 ─── */
.drop-zone {
  border: 2px dashed var(--border-color); border-radius: 12px;
  padding: 48px 24px; text-align: center; cursor: pointer;
  transition: all 0.25s; background: var(--bg-canvas);
}
.drop-zone:not(.no-site):hover, .drop-zone.dragging {
  border-color: var(--primary); background: var(--primary-soft);
}
.drop-zone.no-site { cursor: not-allowed; opacity: 0.5; }
.drop-zone-inner { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.drop-icon-wrap {
  width: 72px; height: 72px; border-radius: 50%;
  background: var(--bg-hover); display: flex; align-items: center;
  justify-content: center; margin-bottom: 8px;
}
.drop-icon { font-size: 36px; color: var(--primary); }
.drop-title { font-size: 15px; font-weight: 600; color: var(--text-main); margin: 0; }
.drop-sub { font-size: 12px; color: var(--text-muted); margin: 0; }
.hidden-input { display: none; }

/* ─── 가이드 카드 ─── */
.guide-card {
  background: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 12px; overflow: hidden;
}
.guide-header {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 24px; background: var(--bg-hover);
  font-size: 14px; font-weight: 700; color: var(--text-main);
  border-bottom: 1px solid var(--border-color);
}
.guide-header i { color: var(--primary); font-size: 18px; }
.guide-grid {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0;
}
.guide-item {
  display: flex; align-items: flex-start; gap: 12px;
  padding: 16px 24px; border-bottom: 1px solid var(--border-color);
}
.guide-item:nth-last-child(-n+2) { border-bottom: none; }
.guide-item i { font-size: 22px; color: var(--primary); flex-shrink: 0; margin-top: 2px; }
.guide-item strong { display: block; font-size: 13px; color: var(--text-main); margin-bottom: 3px; }
.guide-item p { font-size: 12px; color: var(--text-sub); margin: 0; line-height: 1.5; }

/* ─── 미리보기 통계 ─── */
.preview-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;
}
.pstat-card {
  display: flex; align-items: center; gap: 16px;
  background: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 12px; padding: 20px 24px;
}
.pstat-card i { font-size: 32px; }
.pstat-num { display: block; font-size: 28px; font-weight: 800; line-height: 1; }
.pstat-label { display: block; font-size: 12px; color: var(--text-sub); margin-top: 4px; }
.pstat-total i { color: var(--primary); }
.pstat-total .pstat-num { color: var(--primary); }
.pstat-valid i { color: var(--success); }
.pstat-valid .pstat-num { color: var(--success); }
.pstat-error i { color: var(--danger); }
.pstat-error .pstat-num { color: var(--danger); }
.pstat-zero i { color: var(--text-muted); }
.pstat-zero .pstat-num { color: var(--text-muted); }

/* ─── 오류 요약 ─── */
.error-summary {
  background: rgba(239, 68, 68, 0.06); border: 1px solid var(--danger);
  border-radius: 12px; overflow: hidden;
}
.error-summary-header {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 20px; background: rgba(239, 68, 68, 0.1);
  font-size: 13px; font-weight: 600; color: var(--danger);
}
.error-list { padding: 12px 20px; display: flex; flex-direction: column; gap: 8px; }
.error-row-item { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.error-row-num {
  background: var(--danger); color: var(--text-inverse);
  padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;
}
.error-name { color: var(--text-main); font-weight: 600; min-width: 60px; }
.error-tags { display: flex; gap: 4px; flex-wrap: wrap; }
.error-tag {
  background: rgba(239, 68, 68, 0.15); color: var(--danger);
  padding: 2px 8px; border-radius: 4px; font-size: 11px;
}

/* ─── 미리보기 테이블 ─── */
.preview-table-wrap {
  background: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 12px; overflow: hidden;
}
.preview-table-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 14px 20px; border-bottom: 1px solid var(--border-color);
}
.preview-table-title { font-size: 14px; font-weight: 700; color: var(--text-main); }
.preview-table-sub { font-size: 12px; color: var(--text-sub); }
.table-scroll { overflow-x: auto; max-height: 480px; overflow-y: auto; }
.table-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.table-scroll::-webkit-scrollbar-track { background: var(--bg-hover); }
.table-scroll::-webkit-scrollbar-thumb { background: var(--border-focus); border-radius: 3px; }

.data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.data-table thead th {
  position: sticky; top: 0; z-index: 1;
  padding: 10px 12px; background: var(--bg-hover);
  font-size: 11px; font-weight: 700; color: var(--text-sub);
  border-bottom: 2px solid var(--border-color);
  white-space: nowrap; text-align: left;
}
.data-table tbody td {
  padding: 9px 12px; border-bottom: 1px solid var(--border-color);
  color: var(--text-main); white-space: nowrap;
}
.data-row:hover td { background: var(--bg-hover); }
.row-error td { background: rgba(239, 68, 68, 0.05); color: var(--text-main); }
.row-error:hover td { background: rgba(239, 68, 68, 0.1); }
.cell-ellipsis { max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.col-required { color: var(--danger); margin-left: 2px; }
.text-center { text-align: center; }

.row-ok-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(16, 185, 129, 0.15); color: var(--success); font-size: 13px;
}
.row-err-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 50%;
  background: rgba(239, 68, 68, 0.15); color: var(--danger); font-size: 13px;
  cursor: help;
}

/* ─── 액션 버튼 ─── */
.step-actions {
  display: flex; justify-content: flex-end; gap: 12px;
  padding: 20px; background: var(--bg-surface);
  border: 1px solid var(--border-color); border-radius: 12px;
}
.btn-back-step {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 20px; border-radius: 8px; font-size: 13px; font-weight: 600;
  background: var(--bg-surface); border: 1px solid var(--border-color);
  color: var(--text-sub); cursor: pointer; transition: all 0.2s;
}
.btn-back-step:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-upload {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 24px; border-radius: 8px; font-size: 13px; font-weight: 700;
  background: var(--primary); border: none; color: var(--text-inverse);
  cursor: pointer; transition: all 0.2s;
}
.btn-upload:hover:not(:disabled) { background: var(--primary-hover); transform: translateY(-1px); }
.btn-upload:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* ─── 결과 패널 ─── */
.result-panel {
  background: var(--bg-surface); border: 1px solid var(--border-color);
  border-radius: 12px; padding: 48px 32px; text-align: center;
}
.result-icon-wrap {
  width: 80px; height: 80px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  margin: 0 auto 20px; font-size: 40px;
}
.result-success { background: rgba(16, 185, 129, 0.1); color: var(--success); }
.result-warn    { background: rgba(245, 158, 11, 0.1); color: var(--warning); }
.result-title { font-size: 24px; font-weight: 800; color: var(--text-main); margin: 0 0 8px; }
.result-desc { font-size: 14px; color: var(--text-sub); margin: 0 0 28px; }
.result-stats {
  display: flex; justify-content: center; gap: 32px; margin-bottom: 32px;
}
.rstat { text-align: center; }
.rstat-num { display: block; font-size: 32px; font-weight: 800; color: var(--text-main); }
.rstat-label { font-size: 12px; color: var(--text-sub); }
.rstat-s .rstat-num { color: var(--success); }
.rstat-f .rstat-num { color: var(--danger); }

.fail-table-wrap {
  text-align: left; margin: 0 auto 32px; max-width: 700px;
  border: 1px solid var(--danger); border-radius: 8px; overflow: hidden;
}
.fail-table-title {
  display: flex; align-items: center; gap: 6px;
  padding: 10px 16px; background: rgba(239, 68, 68, 0.1);
  font-size: 13px; font-weight: 700; color: var(--danger);
  margin: 0;
}
.fail-reason { color: var(--danger); font-size: 12px; }
.result-actions { display: flex; justify-content: center; gap: 12px; }
</style>
