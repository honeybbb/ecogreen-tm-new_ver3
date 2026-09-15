<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from 'axios';

const router = useRouter();

// =============================================
// 상태 및 옵션 관리
// =============================================
const EQUIP_CATEGORIES = ['청소기계 (탑승/보행)', '일반 청소용구', '경비/통신장비', '안전/제설장비', '기타'];

const form = ref({
  name: '',
  model: '',
  serialNo: '', // 일련번호
  type: '',
  totalQty: 1,
  price: 0,
  purchaseDate: new Date().toISOString().substring(0, 10), // 오늘 날짜 기본값
  mfgDt: '', // 제조년월
  note: ''
});

// =============================================
// 이미지 업로드 관리 (다중 업로드 지원)
// =============================================
const fileInput = ref(null);
// 여러 이미지를 담을 배열: { file: File, previewUrl: string } 형태
const selectedFiles = ref([]);

// 파일 선택 창 띄우기
const triggerFileInput = () => {
  fileInput.value.click();
};

// 파일 첨부 시 미리보기 생성 (다중 선택 처리)
const handleFileChange = (event) => {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  // 선택된 파일들을 순회하며 배열에 추가
  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (!file.type.startsWith('image/')) {
      alert(`${file.name}은(는) 이미지 파일이 아닙니다.`);
      continue;
    }

    // 5MB 용량 제한 검사
    if (file.size > 5 * 1024 * 1024) {
      alert(`${file.name}의 크기가 5MB를 초과합니다.`);
      continue;
    }

    selectedFiles.value.push({
      file: file,
      previewUrl: URL.createObjectURL(file) // 미리보기 URL 생성
    });
  }

  // 동일한 파일을 다시 선택할 수 있도록 input 초기화
  if (fileInput.value) fileInput.value.value = '';
};

// 첨부된 특정 이미지 삭제
const removeImage = (index) => {
  const removedFile = selectedFiles.value.splice(index, 1)[0];
  URL.revokeObjectURL(removedFile.previewUrl); // 메모리 누수 방지
};

// =============================================
// 퀵 네비게이션(스크롤 이동) 로직
// =============================================
const activeSection = ref('sec-basic');
const navItems = [
  { id: 'sec-image', title: '장비 사진', icon: 'mdi-image-outline' },
  { id: 'sec-basic', title: '기본 정보', icon: 'mdi-text-box-outline' },
];

const scrollToSection = (id) => {
  activeSection.value = id;
  const el = document.getElementById(id);
  const container = document.querySelector('.content-area');

  if (el && container) {
    const topPos = el.offsetTop - 24;
    container.scrollTo({ top: topPos, behavior: 'smooth' });
  }
};

let scrollHandler = null;

onMounted(() => {
  const container = document.querySelector('.content-area');
  if (container) {
    scrollHandler = () => {
      const sections = navItems.map(item => document.getElementById(item.id));
      let current = 'sec-basic';
      sections.forEach(section => {
        if (section && container.scrollTop >= (section.offsetTop - 150)) {
          current = section.getAttribute('id');
        }
      });
      activeSection.value = current;
    };
    container.addEventListener('scroll', scrollHandler);
  }
});

onBeforeUnmount(() => {
  const container = document.querySelector('.content-area');
  if (container && scrollHandler) {
    container.removeEventListener('scroll', scrollHandler);
  }
  // 컴포넌트 언마운트 시 남아있는 이미지 URL 메모리 해제
  selectedFiles.value.forEach(item => URL.revokeObjectURL(item.previewUrl));
});

// =============================================
// 액션 핸들러
// =============================================
const goBack = () => {
  if (confirm('작성 중인 내용이 초기화됩니다. 목록으로 돌아가시겠습니까?')) {
    router.push('/equipment/list');
  }
};

const saveEquipment = async () => {
  // 1. 유효성 검사
  if (!form.value.name) {
    alert('장비명을 입력해주세요.');
    scrollToSection('sec-basic');
    return;
  }
  if (!form.value.type) {
    alert('장비 분류를 선택해주세요.');
    scrollToSection('sec-basic');
    return;
  }
  if (form.value.totalQty < 1) {
    alert('총 구매 수량은 1개 이상이어야 합니다.');
    scrollToSection('sec-basic');
    return;
  }

  // 2. FormData 객체 생성
  const formData = new FormData();
  formData.append('name', form.value.name);
  formData.append('type', form.value.type);
  formData.append('model', form.value.model);
  formData.append('serialNo', form.value.serialNo);
  formData.append('totalQty', form.value.totalQty);
  formData.append('price', form.value.price);
  formData.append('purchaseDate', form.value.purchaseDate);
  formData.append('mfgDt', form.value.mfgDt);
  formData.append('note', form.value.note);

  // 다중 이미지 파일 전송
  if (selectedFiles.value.length > 0) {
    selectedFiles.value.forEach(item => {
      formData.append('imgPath', item.file);
    });
  }

  if (!confirm('신규 장비를 등록하시겠습니까?')) return;

  try {
    await axios.post('/api/v1/equipment/register', formData);

    alert('장비 등록이 완료되었습니다.');
    await router.push('/equipment/list');
  } catch (e) {
    console.error(e);
    alert('등록 중 문제가 발생했습니다.');
    // 임시 테스트용 라우팅 (실제 환경에 맞게 수정)
    // await router.push('/equipment/list');
  }
};
</script>

<template>
  <div class="equip-register-page">

    <!-- 상단 고정(Sticky) 헤더 -->
    <div class="page-header sticky-header">
      <div class="header-left">
        <button type="button" @click="goBack" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title"><i class="mdi mdi-plus-box-multiple-outline text-primary"></i> 신규 장비 등록</h1>
          <p class="page-subtitle">본사 자산으로 귀속될 신규 장비를 등록합니다.</p>
        </div>
      </div>
      <div class="header-right">
        <button type="button" @click="goBack" class="btn-cancel">취소</button>
        <button type="button" @click="saveEquipment" class="btn-submit">
          <i class="mdi mdi-check"></i> 장비 등록
        </button>
      </div>
    </div>

    <!-- 메인 레이아웃: 좌측 네비 + 우측 스크롤 폼 -->
    <div class="register-layout">

      <!-- 좌측 퀵 네비게이션 -->
      <aside class="quick-nav-sidebar">
        <div class="nav-wrapper">
          <h3 class="nav-title">입력 항목</h3>
          <ul class="nav-list">
            <li v-for="nav in navItems" :key="nav.id"
                :class="['nav-item', { active: activeSection === nav.id }]"
                @click="scrollToSection(nav.id)">
              <i :class="['mdi', nav.icon]"></i>
              <span>{{ nav.title }}</span>
            </li>
          </ul>
        </div>
      </aside>

      <!-- 우측 메인 폼 영역 (스크롤) -->
      <main class="content-area">
        <form @submit.prevent="saveEquipment" id="registerForm">

          <!-- 카드 1: 장비 사진 -->
          <section id="sec-image" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-image-outline text-primary"></i>
              <h2>장비 사진</h2>
            </div>
            <div class="card-body">

              <!-- multiple 속성 추가 -->
              <input
                  type="file"
                  ref="fileInput"
                  @change="handleFileChange"
                  accept="image/png, image/jpeg, image/jpg"
                  multiple
                  hidden
              />

              <!-- 다중 이미지 갤러리 그리드 -->
              <div class="image-gallery-grid">

                <!-- 등록된 이미지들 미리보기 루프 -->
                <div v-for="(img, index) in selectedFiles" :key="index" class="image-preview-box">
                  <img :src="img.previewUrl" alt="장비 미리보기" />
                  <div class="image-overlay">
                    <button type="button" @click="removeImage(index)" class="btn-img-action btn-danger">
                      <i class="mdi mdi-trash-can-outline"></i> 삭제
                    </button>
                  </div>
                </div>

                <!-- 이미지 추가 버튼 -->
                <div class="image-empty-box" @click="triggerFileInput">
                  <i class="mdi mdi-plus-box-outline"></i>
                  <p>사진 추가</p>
                  <span>(최대 5MB)</span>
                </div>

              </div>

            </div>
          </section>

          <!-- 카드 2: 기본 정보 -->
          <section id="sec-basic" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-text-box-outline text-primary"></i>
              <h2>기본 정보 입력</h2>
            </div>
            <div class="card-body">
              <div class="form-grid">

                <div class="form-group">
                  <label class="form-label required">장비 분류</label>
                  <select v-model="form.type" required class="form-select">
                    <option value="">선택하세요</option>
                    <option v-for="cat in EQUIP_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label required">장비명</label>
                  <input type="text" v-model="form.name" required class="form-input" placeholder="예: 탑승식 습식 바닥세정기" />
                </div>

                <div class="form-group">
                  <label class="form-label">모델명</label>
                  <input type="text" v-model="form.model" class="form-input" placeholder="예: T-1000 PRO" />
                </div>

                <div class="form-group">
                  <label class="form-label">일련번호</label>
                  <input type="text" v-model="form.serialNo" class="form-input" placeholder="ASA23180" />
                </div>

                <div class="form-group">
                  <label class="form-label required">총 수량</label>
                  <input type="number" v-model.number="form.totalQty" min="1" required class="form-input text-right" />
                </div>

                <div class="form-group">
                  <label class="form-label">도입(구매)일</label>
                  <input type="date" v-model="form.purchaseDate" class="form-input" />
                </div>

                <div class="form-group">
                  <label class="form-label">제조년월</label>
                  <input type="date" v-model="form.mfgDt" class="form-input" />
                </div>

                <div class="form-group">
                  <label class="form-label">개당 구매 단가 (원)</label>
                  <div class="input-with-unit">
                    <input type="number" v-model.number="form.price" min="0" step="10000" class="form-input text-right" />
                    <span class="unit">원</span>
                  </div>
                  <p class="helper-text-sm">자산 가치 평가를 위해 입력합니다. (총액: {{ (form.price * form.totalQty).toLocaleString() }}원)</p>
                </div>

                <div class="form-group full-width">
                  <label class="form-label">비고 및 특이사항</label>
                  <textarea v-model="form.note" class="form-textarea" rows="4" placeholder="구매처, 기본 사양, 보증(A/S) 기간 등 필요한 메모를 남겨주세요."></textarea>
                </div>

              </div>
            </div>
          </section>

          <div style="height: 100px;"></div>
        </form>
      </main>

    </div>
  </div>
</template>

<style>
/* Vue/Nuxt 고질적인 Sticky 방해 요소 강제 해제 */
body, #__nuxt, #__layout, .v-application { overflow: visible !important; }
</style>

<style scoped>
.equip-register-page {
  background-color: var(--bg-canvas, #f1f5f9);
  margin: -24px;
  height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sticky-header {
  flex-shrink: 0; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(8px);
  padding: 16px 32px; border-bottom: 1px solid var(--border-color, #e2e8f0);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); display: flex; justify-content: space-between;
  align-items: center; z-index: 50; margin: 0;
}
.header-left { display: flex; align-items: center; gap: 16px; }
.header-right { display: flex; align-items: center; gap: 12px; }
.page-title { font-size: 20px; font-weight: 800; color: var(--text-main, #1e293b); margin: 0; display:flex; align-items:center; gap:8px; }
.page-subtitle { font-size: 13px; color: var(--text-sub, #475569); margin: 4px 0 0 0; }

.btn-back { width: 40px; height: 40px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); background: #fff; cursor: pointer; transition: 0.2s; display:flex; align-items:center; justify-content:center; }
.btn-back:hover { background: var(--bg-hover, #f8fafc); }
.btn-back i { font-size: 20px; color: var(--text-sub); }

.btn-cancel { padding: 10px 16px; border-radius: 8px; border: 1px solid var(--border-color, #e2e8f0); background: #fff; font-weight: 600; cursor: pointer; color: var(--text-sub); transition: 0.2s; }
.btn-cancel:hover { background: var(--bg-hover); color: var(--text-main); }
.btn-submit { padding: 10px 20px; border-radius: 8px; border: none; background: var(--primary, #3b82f6); color: #fff; font-weight: 700; cursor: pointer; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2); transition: 0.2s; display:flex; align-items:center; gap:6px; }
.btn-submit:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(59, 130, 246, 0.3); }

/* 퀵 네비게이션 & 메인 레이아웃 */
.register-layout { display: flex; flex: 1; max-width: 1400px; width: 100%; margin: 0 auto; padding-top: 24px; overflow: hidden; }

.quick-nav-sidebar { width: 220px; flex-shrink: 0; height: 100%; overflow-y: auto; padding: 0 16px; }
.nav-title { font-size: 12px; font-weight: 800; color: var(--text-muted, #94a3b8); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-left: 12px; }
.nav-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--text-sub, #475569); cursor: pointer; transition: all 0.2s; background: transparent; }
.nav-item i { font-size: 18px; opacity: 0.6; }
.nav-item:hover { background: rgba(0,0,0,0.04); color: var(--text-main, #1e293b); }
.nav-item.active { background: #fff; color: var(--primary, #3b82f6); box-shadow: 0 2px 8px rgba(0,0,0,0.05); font-weight: 700; }
.nav-item.active i { opacity: 1; }

.content-area { flex: 1; height: 100%; overflow-y: auto; position: relative; padding: 0 24px 80px 24px; scroll-behavior: smooth;}

/* =========================================
   카드 UI 공통
========================================= */
.category-card {
  background: #ffffff;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
  overflow: visible;
  margin-bottom: 24px;
}
.card-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  background: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
}
.card-header i { font-size: 24px; }
.card-header h2 { font-size: 18px; font-weight: 800; color: var(--text-main, #1e293b); margin: 0; }
.card-body { padding: 24px; }

/* =========================================
   공통 폼 요소
========================================= */
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 20px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.full-width { grid-column: 1 / -1; }
.form-label { font-size: 13px; font-weight: 700; color: var(--text-sub, #475569); }
.form-label.required::after { content: '*'; color: var(--danger, #ef4444); margin-left: 4px; }
.form-input, .form-select, .form-textarea { padding: 10px 12px; border: 1px solid var(--border-focus, #cbd5e1); border-radius: 6px; font-size: 13px; background: #fff; width: 100%; box-sizing: border-box; transition: 0.2s; color: var(--text-main); }
.form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); outline: none; }
.form-textarea { resize: vertical; min-height: 80px; }

.input-with-unit { display: flex; align-items: center; border: 1px solid var(--border-focus); border-radius: 6px; background: #fff; overflow: hidden; }
.input-with-unit:focus-within { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
.input-with-unit .form-input { border: none; box-shadow: none; flex: 1; border-radius: 0; }
.input-with-unit .form-input:focus { box-shadow: none; }
.input-with-unit .unit {
  padding: 0 12px;
  font-size: 13px;
  color: var(--text-sub);
  border-left: 1px solid var(--border-focus);
  display:flex;
  align-items:center;
}

.helper-text-sm { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

/* =========================================
   다중 이미지 갤러리 UI
========================================= */
.image-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 16px;
  width: 100%;
}

.image-preview-box, .image-empty-box {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.image-empty-box {
  border: 2px dashed var(--border-focus);
  background: var(--bg-canvas);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--text-sub);
}
.image-empty-box:hover {
  background: rgba(59, 130, 246, 0.05);
  border-color: var(--primary);
  color: var(--primary);
}
.image-empty-box i { font-size: 32px; margin-bottom: 8px; opacity: 0.8; }
.image-empty-box p { font-size: 13px; font-weight: 600; margin: 0 0 4px 0; }
.image-empty-box span { font-size: 11px; opacity: 0.7; }

.image-preview-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border: 1px solid var(--border-color);
}

.image-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.2s;
}
.image-preview-box:hover .image-overlay {
  opacity: 1;
}

.btn-img-action {
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.95);
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
}
.btn-img-action:hover { background: white; }
.btn-danger { color: var(--danger); }
</style>