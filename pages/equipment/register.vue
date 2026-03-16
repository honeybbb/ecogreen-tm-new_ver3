<script setup>
import { ref } from 'vue';
import { useRouter } from 'nuxt/app';

const router = useRouter();

const equipment = ref({
  name: '',
  model: '',
  serial: '',
  assetCode: '',
  purchaseDate: '',
  purchasePrice: null,
  site: '',
  status: '보유 중',
  memo: '',
});

const equipmentImageFile = ref(null);
const imagePreviewUrl = ref(null);

const siteOptions = ref(['본사', 'LH 위례 6단지', '강서 대명 강동', 'LH 율곡 제일 8단지']);
const statusOptions = ref([
  { value: '보유 중',  color: 'green'  },
  { value: '대여 중',  color: 'orange' },
  { value: '수리 중',  color: 'red'    },
  { value: '폐기',     color: 'gray'   },
]);

const handleImageUpload = (event) => {
  const file = event.target.files[0];
  if (file && file.type.startsWith('image/')) {
    equipmentImageFile.value = file;
    const reader = new FileReader();
    reader.onload = (e) => { imagePreviewUrl.value = e.target.result; };
    reader.readAsDataURL(file);
  } else {
    equipmentImageFile.value = null;
    imagePreviewUrl.value = null;
    if (file) alert('이미지 파일(jpg, png 등)을 선택해 주세요.');
  }
};

const handleSubmit = () => {
  console.log('장비 등록 데이터:', equipment.value);
  alert(`${equipment.value.name} 장비가 성공적으로 등록되었습니다.`);
  router.push('/equipment');
};

const handleCancel = () => {
  if (confirm('작성 중인 내용이 사라집니다. 취소하시겠습니까?')) {
    router.push('/equipment');
  }
};
</script>

<template>
  <div class="equipment-register-page">

    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <h2 class="page-title">
          <span class="material-symbols-outlined">build_circle</span>
          장비 등록
        </h2>
        <p class="page-subtitle">
          신규 장비 정보를 입력하고 시스템에 등록합니다.
          <span class="text-red" style="font-size:12px;">* 필수 항목</span>
        </p>
      </div>
      <div class="header-actions">
        <button type="button" @click="handleCancel" class="btn-refresh btn-cancel">
          <span class="material-symbols-outlined">close</span>
          취소
        </button>
        <button type="submit" form="register-form" class="btn-add">
          <span class="material-symbols-outlined">save</span>
          장비 등록
        </button>
      </div>
    </div>

    <form id="register-form" @submit.prevent="handleSubmit">

      <!-- 섹션 1: 장비 기본 정보 -->
      <div class="table-card form-card">
        <div class="table-header">
          <div class="table-title">
            <span class="material-symbols-outlined" style="display:inline-flex;">info</span>
            장비 기본 정보
          </div>
        </div>
        <div class="form-body">
          <div class="form-grid">

            <div class="form-field required">
              <label class="form-label" for="name">장비명</label>
              <input id="name" type="text" v-model="equipment.name" required
                     placeholder="예: 전동 드릴" class="form-input" />
            </div>

            <div class="form-field required">
              <label class="form-label" for="model">모델명</label>
              <input id="model" type="text" v-model="equipment.model" required
                     placeholder="예: DHP484Z" class="form-input" />
            </div>

            <div class="form-field required">
              <label class="form-label" for="serial">시리얼 번호 (S/N)</label>
              <input id="serial" type="text" v-model="equipment.serial" required
                     placeholder="예: SN-2024-00123" class="form-input" />
            </div>

            <div class="form-field">
              <label class="form-label" for="assetCode">
                자산 코드 <span class="label-optional">선택</span>
              </label>
              <input id="assetCode" type="text" v-model="equipment.assetCode"
                     placeholder="예: ASSET-2024-001" class="form-input" />
            </div>

          </div>
        </div>
      </div>

      <!-- 섹션 2: 구매 및 배치 정보 -->
      <div class="table-card form-card">
        <div class="table-header">
          <div class="table-title">
            <span class="material-symbols-outlined" style="display:inline-flex;">location_on</span>
            구매 및 배치 정보
          </div>
        </div>
        <div class="form-body">
          <div class="form-grid">

            <div class="form-field required">
              <label class="form-label" for="purchaseDate">구입일</label>
              <input id="purchaseDate" type="date" v-model="equipment.purchaseDate"
                     required class="form-input" />
            </div>

            <div class="form-field">
              <label class="form-label" for="purchasePrice">
                구입가 <span class="label-optional">선택</span>
              </label>
              <div class="input-suffix-wrap">
                <input id="purchasePrice" type="number" v-model="equipment.purchasePrice"
                       placeholder="0" class="form-input" />
                <span class="input-suffix">원</span>
              </div>
            </div>

            <div class="form-field required">
              <label class="form-label" for="site">현재 배치 현장</label>
              <div class="select-wrap">
                <select id="site" v-model="equipment.site" required class="form-input form-select">
                  <option value="" disabled>현장을 선택하세요</option>
                  <option v-for="s in siteOptions" :key="s" :value="s">{{ s }}</option>
                </select>
                <span class="material-symbols-outlined select-arrow">expand_more</span>
              </div>
            </div>

            <div class="form-field required">
              <label class="form-label">상태</label>
              <div class="status-chip-group">
                <label
                    v-for="s in statusOptions" :key="s.value"
                    class="toggle-chip status-chip"
                    :class="[{ active: equipment.status === s.value }, `chip-${s.color}`]"
                >
                  <input type="radio" v-model="equipment.status" :value="s.value" class="sr-only">
                  <span class="chip-dot"></span>
                  {{ s.value }}
                </label>
              </div>
            </div>

            <div class="form-field full-width">
              <label class="form-label" for="memo">
                특이사항 및 메모 <span class="label-optional">선택</span>
              </label>
              <textarea id="memo" v-model="equipment.memo"
                        placeholder="장비에 대한 특이사항이나 참고 메모를 입력하세요..."
                        class="form-input form-textarea" rows="3"></textarea>
            </div>

          </div>
        </div>
      </div>

      <!-- 섹션 3: 장비 사진 -->
      <div class="table-card form-card">
        <div class="table-header">
          <div class="table-title">
            <span class="material-symbols-outlined" style="display:inline-flex;">photo_camera</span>
            장비 사진
            <span class="label-optional" style="margin-left:6px;">선택</span>
          </div>
        </div>
        <div class="form-body">
          <div class="image-upload-layout">

            <div class="image-preview-box" :class="{ 'has-image': imagePreviewUrl }">
              <img v-if="imagePreviewUrl" :src="imagePreviewUrl" alt="장비 이미지 미리보기" class="preview-img">
              <div v-else class="image-placeholder">
                <span class="material-symbols-outlined">add_photo_alternate</span>
                <p>이미지를 업로드하세요</p>
                <span>JPG, PNG, WEBP 지원</span>
              </div>
            </div>

            <div class="image-actions">
              <input type="file" id="equipment-image" @change="handleImageUpload"
                     accept="image/*" class="sr-only">
              <label for="equipment-image" class="btn-add btn-upload-trigger">
                <span class="material-symbols-outlined">upload</span>
                파일 선택
              </label>
              <button
                  v-if="imagePreviewUrl"
                  @click="imagePreviewUrl = null; equipmentImageFile = null;"
                  type="button"
                  class="btn-refresh btn-cancel btn-img-delete"
              >
                <span class="material-symbols-outlined">delete</span>
                사진 삭제
              </button>
              <p v-if="equipmentImageFile" class="attached-filename">
                <span class="material-symbols-outlined">attach_file</span>
                {{ equipmentImageFile.name }}
              </p>
            </div>

          </div>
        </div>
      </div>

      <!-- 모바일 하단 버튼 -->
      <div class="mobile-actions">
        <button type="button" @click="handleCancel" class="btn-refresh btn-cancel">
          <span class="material-symbols-outlined">close</span>취소
        </button>
        <button type="submit" class="btn-add">
          <span class="material-symbols-outlined">save</span>장비 등록
        </button>
      </div>

    </form>
  </div>
</template>

<style scoped>
/* ===== 레이아웃 ===== */
.equipment-register-page {
  max-width: 900px;
}

.form-card {
  margin-bottom: 20px;
}

.form-body {
  padding: 24px;
}

/* ===== 그리드 ===== */
.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}
.full-width { grid-column: 1 / -1; }

/* ===== 개별 필드 ===== */
.form-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-sub);
}

.form-field.required .form-label::after {
  content: '*';
  color: var(--danger);
}

.label-optional {
  font-size: 11px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--bg-canvas);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1px 6px;
}

/* ===== 인풋 공통 ===== */
.form-input {
  width: 100%;
  height: 42px;
  padding: 0 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  color: var(--text-main);
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
  -webkit-appearance: none;
}
.form-input::placeholder { color: var(--text-sub); opacity: 0.6; }
.form-input:hover { border-color: var(--border-focus); }
.form-input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

/* textarea */
.form-textarea {
  height: auto;
  padding: 10px 14px;
  resize: vertical;
  line-height: 1.6;
}

/* ===== 가격 입력 ===== */
.input-suffix-wrap { position: relative; }
.input-suffix-wrap .form-input { padding-right: 36px; }
.input-suffix {
  position: absolute;
  right: 12px; top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  color: var(--text-sub);
  pointer-events: none;
}

/* ===== 셀렉트 ===== */
.select-wrap { position: relative; }
.form-select { padding-right: 36px; cursor: pointer; }
.select-arrow {
  position: absolute;
  right: 10px; top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: var(--text-sub);
  pointer-events: none;
}

/* ===== 상태 칩 ===== */
.status-chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.status-chip {
  font-size: 13px;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
}

.chip-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

/* 비활성 */
.status-chip:not(.active) {
  background: var(--bg-surface);
  border-color: var(--border-color);
  color: var(--text-sub);
}
.status-chip:not(.active):hover {
  background: var(--bg-hover);
  border-color: var(--border-focus);
  color: var(--text-main);
}

/* 활성 */
.status-chip.active.chip-green  { background: #f0fdf4; border-color: var(--success); color: var(--success); }
.status-chip.active.chip-orange { background: #fffbeb; border-color: var(--warning); color: var(--warning); }
.status-chip.active.chip-red    { background: #fef2f2; border-color: var(--danger);  color: var(--danger);  }
.status-chip.active.chip-gray   { background: var(--bg-hover); border-color: var(--border-focus); color: var(--text-sub); }

/* 다크모드 */
:global(body.theme-dark) .status-chip.active.chip-green  { background: rgba(16,185,129,0.1); }
:global(body.theme-dark) .status-chip.active.chip-orange { background: rgba(245,158,11,0.1); }
:global(body.theme-dark) .status-chip.active.chip-red    { background: rgba(239,68,68,0.1); }

/* ===== 이미지 업로드 ===== */
.image-upload-layout {
  display: flex;
  gap: 28px;
  align-items: flex-start;
}

.image-preview-box {
  flex-shrink: 0;
  width: 180px;
  height: 148px;
  border: 1.5px dashed var(--border-color);
  border-radius: 12px;
  background: var(--bg-canvas);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s;
}
.image-preview-box:hover { border-color: var(--primary); }
.image-preview-box.has-image { border-style: solid; border-color: var(--border-focus); }

.preview-img { width: 100%; height: 100%; object-fit: cover; }

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--text-sub);
  padding: 16px;
  text-align: center;
}
.image-placeholder .material-symbols-outlined { font-size: 36px; color: var(--text-muted); }
.image-placeholder p { margin: 0; font-size: 13px; font-weight: 600; }
.image-placeholder span { font-size: 11px; color: var(--text-muted); }

.image-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
  justify-content: center;
}

.btn-upload-trigger { cursor: pointer; }

.btn-img-delete {
  color: var(--danger) !important;
  border-color: var(--danger) !important;
}
.btn-img-delete:hover {
  background: #fef2f2 !important;
  color: var(--danger) !important;
}
:global(body.theme-dark) .btn-img-delete:hover {
  background: rgba(239,68,68,0.1) !important;
}

.attached-filename {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--text-sub);
  word-break: break-all;
  max-width: 220px;
}
.attached-filename .material-symbols-outlined { font-size: 15px; flex-shrink: 0; }

/* ===== 모바일 하단 버튼 ===== */
.mobile-actions {
  display: none;
  gap: 10px;
  padding-bottom: 24px;
}

/* ===== sr-only ===== */
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
}

/* ===== 반응형 ===== */
@media (max-width: 768px) {
  .header-actions { display: none; }
  .mobile-actions { display: flex; }
  .mobile-actions .btn-refresh,
  .mobile-actions .btn-add { flex: 1; justify-content: center; }

  .form-grid { grid-template-columns: 1fr; }
  .full-width { grid-column: 1; }

  .image-upload-layout { flex-direction: column; align-items: stretch; }
  .image-preview-box { width: 100%; height: 180px; }
  .image-actions { flex-direction: row; flex-wrap: wrap; align-items: center; }
}
</style>
