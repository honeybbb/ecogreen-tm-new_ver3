<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from 'axios';

const router = useRouter();
const { siteOptions, fetchSiteOptions } = useApi(); // 현장 목록 가져오기

// 상태 관리
const selectedSite = ref(''); // 선택된 sIdx
const excelFile = ref(null);
const isUploading = ref(false);
const uploadResult = ref(null);

// 파일 선택 핸들러
const onFileChange = (e) => {
  const file = e.target.files[0];
  if (file) {
    excelFile.value = file;
  }
};

// 파일 초기화
const clearFile = () => {
  excelFile.value = null;
  document.getElementById('excel-input').value = '';
};

// 양식 다운로드 (필요시 경로 수정)
const downloadTemplate = () => {
  window.location.href = '/직원등록_엑셀양식.xlsx';
  //alert('엑셀 양식 다운로드 로직을 연결해주세요.');
};

// 업로드 실행
const handleUpload = async () => {
  if (!selectedSite.value) return alert('배치할 현장을 먼저 선택해주세요.');
  if (!excelFile.value) return alert('업로드할 엑셀 파일을 선택해주세요.');

  const formData = new FormData();
  formData.append('file', excelFile.value);
  formData.append('sIdx', selectedSite.value); // 화면에서 선택한 현장 ID 전송

  isUploading.value = true;
  try {
    const res = await axios.post('/api/v1/member/upload-excel', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    if (res.data.result) {
      uploadResult.value = res.data;
      alert(`${res.data.count}명의 직원이 성공적으로 등록 및 배치되었습니다.`);
      router.push('/member/list');
    }
  } catch (err) {
    console.error(err);
    alert(err.response?.data?.message || '업로드 중 오류가 발생했습니다.');
  } finally {
    isUploading.value = false;
  }
};

onMounted(() => {
  fetchSiteOptions();
});
</script>

<template>
  <div class="excel-upload-page">

    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-file-excel-box"></i>
          직원 일괄 등록
        </h1>
        <p class="page-subtitle">엑셀(.xlsx) 파일을 업로드하여 다수의 직원을 현장에 한 번에 배치합니다.</p>
      </div>
      <div class="header-actions">
        <button @click="downloadTemplate" class="btn-outline">
          <i class="mdi mdi-download"></i> 엑셀 양식 다운로드
        </button>
      </div>
    </div>

    <div class="upload-card">

      <section class="config-section">
        <div class="step-header">
          <span class="step-num">1</span>
          <h3 class="section-title">배치 현장 선택</h3>
        </div>
        <div class="config-content">
          <label class="input-label">
            직원들이 소속될 현장을 선택하세요 <span class="required">*</span>
          </label>
          <div class="select-wrapper">
            <i class="mdi mdi-office-building-marker prefix-icon"></i>
            <select v-model="selectedSite" class="modern-select">
              <option value="" disabled>관리할 현장을 선택해주세요</option>
              <option v-for="site in siteOptions" :key="site.idx" :value="site.idx">
                {{ site.name }}
              </option>
            </select>
            <i class="mdi mdi-chevron-down suffix-icon"></i>
          </div>
        </div>
      </section>

      <div class="divider"></div>

      <section class="upload-section" :class="{ 'disabled': !selectedSite }">
        <div class="step-header">
          <span class="step-num" :class="{ 'inactive': !selectedSite }">2</span>
          <h3 class="section-title" :class="{ 'text-muted': !selectedSite }">엑셀 파일 업로드</h3>
        </div>

        <div class="config-content">
          <div class="file-drop-zone" :class="{ 'has-file': excelFile, 'disabled-zone': !selectedSite }">
            <input
                type="file"
                @change="onFileChange"
                accept=".xlsx, .xls"
                id="excel-input"
                :disabled="!selectedSite"
            />
            <label for="excel-input" class="file-label">

              <template v-if="!excelFile">
                <div class="icon-circle">
                  <i class="mdi mdi-cloud-upload"></i>
                </div>
                <div class="drop-text">
                  <strong>클릭</strong>하여 엑셀 파일을 선택하세요
                </div>
                <span class="drop-hint">지원 포맷: .xlsx, .xls</span>
              </template>

              <template v-else>
                <div class="icon-circle success">
                  <i class="mdi mdi-file-check"></i>
                </div>
                <div class="file-info">
                  <strong class="file-name">{{ excelFile.name }}</strong>
                </div>
                <button @click.prevent="clearFile" class="btn-clear-file">
                  다른 파일 선택하기
                </button>
              </template>

            </label>
          </div>

          <div class="info-box">
            <i class="mdi mdi-information"></i>
            <div class="info-text">
              <strong>업로드 시 주의사항</strong>
              <ul>
                <li>반드시 지정된 제공 양식을 다운로드하여 작성해 주세요.</li>
                <li>이미 등록된 사번이 포함되어 있을 경우 해당 데이터는 제외되거나 덮어쓰기 될 수 있습니다.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <div class="action-footer">
        <button @click="router.back()" class="btn-cancel">취소</button>
        <button
            @click="handleUpload"
            class="btn-primary"
            :disabled="isUploading || !selectedSite || !excelFile"
        >
          <i v-if="isUploading" class="mdi mdi-loading mdi-spin"></i>
          <i v-else class="mdi mdi-check"></i>
          <span>{{ isUploading ? '데이터를 등록하는 중...' : '일괄 등록 시작' }}</span>
        </button>
      </div>

    </div>
  </div>
</template>

<style scoped>
.btn-outline {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  background: white;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 2px 4px rgba(0,0,0,0.02);
}
.btn-outline:hover { background: #f8fafc; border-color: #94a3b8; color: #1e293b; }
.btn-outline i { font-size: 18px; color: #667eea; }

/* === 메인 카드 === */
.upload-card {
  background: white;
  border-radius: 20px;
  padding: 36px 40px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.04);
  border: 1px solid #f1f5f9;
}

.step-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}
.step-num {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 800;
  box-shadow: 0 4px 10px rgba(102, 126, 234, 0.3);
  transition: all 0.3s;
}
.step-num.inactive {
  background: #e2e8f0;
  color: #94a3b8;
  box-shadow: none;
}
.section-title {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
  margin: 0;
  transition: color 0.3s;
}
.text-muted { color: #94a3b8; }

.config-content { padding-left: 44px; }

/* === STEP 1: Select Box === */
.input-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 10px;
}
.required { color: #ef4444; margin-left: 2px; }

.select-wrapper { position: relative; max-width: 500px; }
.prefix-icon {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 20px;
  pointer-events: none;
}
.suffix-icon {
  position: absolute;
  right: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  font-size: 24px;
  pointer-events: none;
}
.modern-select {
  width: 100%;
  padding: 14px 44px 14px 48px;
  border: 2px solid #e2e8f0;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  outline: none;
  transition: all 0.3s;
  appearance: none;
  background: white;
  cursor: pointer;
}
.modern-select:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
}

.divider {
  height: 1px;
  background: #f1f5f9;
  margin: 40px 0;
}

/* === STEP 2: Dropzone === */
.upload-section.disabled { opacity: 0.6; pointer-events: none; }

.file-drop-zone {
  border: 2px dashed #cbd5e1;
  border-radius: 16px;
  padding: 48px 24px;
  text-align: center;
  background: #f8fafc;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  cursor: pointer;
}
.file-drop-zone:hover:not(.disabled-zone) {
  background: #f5f3ff;
  border-color: #8b5cf6;
}
.file-drop-zone.has-file {
  background: #f0fdf4;
  border-color: #10b981;
  border-style: solid;
}
.file-drop-zone input {
  position: absolute; width: 100%; height: 100%; top: 0; left: 0; opacity: 0; cursor: pointer;
}

.file-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  pointer-events: none; /* input이 이벤트를 받도록 */
}

.icon-circle {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: white;
  box-shadow: 0 4px 12px rgba(0,0,0,0.05);
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon-circle i { font-size: 32px; color: #64748b; }
.file-drop-zone:hover:not(.disabled-zone) .icon-circle i { color: #8b5cf6; }

.icon-circle.success { background: #10b981; box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3); }
.icon-circle.success i { color: white; }

.drop-text { font-size: 16px; color: #334155; }
.drop-text strong { color: #667eea; }
.drop-hint { font-size: 13px; color: #94a3b8; }

.file-info { display: flex; flex-direction: column; gap: 4px; }
.file-name { font-size: 18px; color: #065f46; font-weight: 800; }

.btn-clear-file {
  margin-top: 8px;
  background: white;
  border: 1px solid #cbd5e1;
  padding: 6px 16px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  pointer-events: auto; /* label 뚫고 클릭되도록 */
  z-index: 10;
  transition: all 0.2s;
}
.btn-clear-file:hover { background: #f1f5f9; color: #1e293b; }

/* === 안내 박스 === */
.info-box {
  display: flex;
  gap: 16px;
  margin-top: 24px;
  padding: 20px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  color: #1e40af;
}
.info-box i { font-size: 24px; margin-top: 2px; flex-shrink: 0; color: #3b82f6; }
.info-text strong { display: block; font-size: 15px; margin-bottom: 8px; color: #1d4ed8; }
.info-text ul { margin: 0; padding-left: 20px; color: #1e3a8a; }
.info-text li { font-size: 13px; line-height: 1.6; margin-bottom: 4px; }

/* === 하단 버튼 === */
.action-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid #f1f5f9;
}
.btn-cancel {
  background: white;
  border: 1px solid #cbd5e1;
  color: #64748b;
  padding: 14px 28px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: 0.2s;
}
.btn-cancel:hover { background: #f8fafc; color: #1e293b; }

.btn-primary {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  color: white;
  border: none;
  padding: 14px 32px;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
  transition: all 0.3s;
}
.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
}
.btn-primary:disabled {
  background: #cbd5e1;
  box-shadow: none;
  cursor: not-allowed;
  transform: none;
}

/* === 반응형 === */
@media (max-width: 768px) {
  .upload-card { padding: 24px; }
  .config-content { padding-left: 0; margin-top: 16px; }
  .action-footer { flex-direction: column; }
  .action-footer button { width: 100%; justify-content: center; }
  .btn-outline { width: 100%; justify-content: center; }
  .header-actions { width: 100%; }
}
</style>
