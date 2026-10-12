<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRouter, useRoute } from 'nuxt/app';
import axios from 'axios';
import { useAuthStore } from '~/stores/auth.js';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

const equipIdx = route.params.id;

// =============================================
// 상태 및 옵션 관리
// =============================================
const equipCodes = ref([]);
const isLoading = ref(true);

const fetchEquipCategories = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/new/${cIdx}`);
    equipCodes.value = (res.data?.data || []).filter(c =>
        c.useFl === 'Y' && (c.groupCd === '06' || c.itemCd?.startsWith('06'))
    );
  } catch (e) {
    console.error('장비 분류 코드를 불러오지 못했습니다.', e);
    equipCodes.value = [];
  }
};

// 선택된 분류 (itemCd, 모든 레벨 통합)
const selectedTypeCd = ref('');

// 트리 메뉴 상태
const isCategoryMenuOpen = ref(false);
const expandedBaseCd = ref(null);
const expandedMidCd = ref(null);

const equipTree = computed(() => {
  const bases = equipCodes.value
      .filter(c => c.groupCd === '06' && c.itemCd?.length === 5)
      .sort((a, b) => (a.sort || 0) - (b.sort || 0));

  return bases.map(base => {
    const mids = equipCodes.value
        .filter(c => c.groupCd === base.itemCd)
        .sort((a, b) => (a.sort || 0) - (b.sort || 0))
        .map(mid => {
          const subs = equipCodes.value
              .filter(c => c.groupCd === mid.itemCd)
              .sort((a, b) => (a.sort || 0) - (b.sort || 0));
          return { ...mid, children: subs };
        });
    return { ...base, children: mids };
  });
});

const selectedTypeLabel = computed(() => {
  const cd = selectedTypeCd.value;
  if (!cd) return '선택하세요';
  const path = [];
  if (cd.length >= 5) {
    const b = equipCodes.value.find(c => c.itemCd === cd.substring(0, 5));
    if (b) path.push(b.itemNm);
  }
  if (cd.length >= 8) {
    const m = equipCodes.value.find(c => c.itemCd === cd.substring(0, 8));
    if (m) path.push(m.itemNm);
  }
  if (cd.length >= 11) {
    const s = equipCodes.value.find(c => c.itemCd === cd.substring(0, 11));
    if (s) path.push(s.itemNm);
  }
  return path.length ? path.join(' > ') : '선택하세요';
});

const toggleBase = (itemCd) => {
  expandedBaseCd.value = expandedBaseCd.value === itemCd ? null : itemCd;
  expandedMidCd.value = null;
};
const toggleMid = (itemCd) => {
  expandedMidCd.value = expandedMidCd.value === itemCd ? null : itemCd;
};
const selectType = (node) => {
  selectedTypeCd.value = node.itemCd;
  form.value.type = node.itemCd;
  isCategoryMenuOpen.value = false;
};
const handleBaseClick = (base) => {
  if (base.children.length > 0) toggleBase(base.itemCd);
  else selectType(base);
};
const handleMidClick = (mid) => {
  if (mid.children.length > 0) toggleMid(mid.itemCd);
  else selectType(mid);
};

const form = ref({
  name: '',
  model: '',
  serialNo: '',
  type: '',
  supplyPrice: 0,
  vat: 0,
  totalPrice: 0,
  purchaseDate: '',
  note: ''
});

const isAutoVat = ref(false);

// =============================================
// 가격 계산 로직 (Watch)
// =============================================
watch(
    () => form.value.supplyPrice,
    (newVal) => {
      if (isAutoVat.value) {
        form.value.vat = Math.floor(newVal * 0.1);
      }
      form.value.totalPrice = newVal + form.value.vat;
    }
);

watch(
    () => form.value.vat,
    (newVal) => {
      form.value.totalPrice = form.value.supplyPrice + (newVal || 0);
    }
);

watch(isAutoVat, (newVal) => {
  if (newVal) {
    form.value.vat = Math.floor(form.value.supplyPrice * 0.1);
  }
});

// =============================================
// 이미지 관리 (기존 유지 + 신규 추가)
// =============================================
// 유지할 기존 이미지 (서버에 이미 저장된 경로)
const keptImages = ref([]); // [{ path: '/uploads/x.png', url: '/api/uploads/x.png' }]
// 신규 업로드 파일
const fileInput = ref(null);
const newFiles = ref([]); // [{ file, previewUrl }]

const triggerFileInput = () => {
  fileInput.value.click();
};

const handleFileChange = (event) => {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    if (!file.type.startsWith('image/')) {
      alert(`${file.name}은(는) 이미지 파일이 아닙니다.`);
      continue;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert(`${file.name}의 크기가 5MB를 초과합니다.`);
      continue;
    }

    newFiles.value.push({
      file,
      previewUrl: URL.createObjectURL(file)
    });
  }
  if (fileInput.value) fileInput.value.value = '';
};

const removeKeptImage = (index) => {
  keptImages.value.splice(index, 1);
};

const removeNewFile = (index) => {
  const removed = newFiles.value.splice(index, 1)[0];
  if (removed) URL.revokeObjectURL(removed.previewUrl);
};

// =============================================
// 퀵 네비게이션
// =============================================
const activeSection = ref('sec-basic');
const navItems = [
  { id: 'sec-image', title: '장비 사진', icon: 'mdi-image-outline' },
  { id: 'sec-basic', title: '기본 정보', icon: 'mdi-text-box-outline' }
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

// =============================================
// 데이터 로드
// =============================================
const loadEquipment = async () => {
  try {
    const res = await axios.get(`/api/v1/equipment/${equipIdx}`);
    if (!res.data?.result) {
      alert(res.data?.msg || '장비 정보를 불러오지 못했습니다.');
      return router.push('/equipment/list');
    }
    const eq = res.data.data;

    form.value.name = eq.name || '';
    form.value.model = eq.model || '';
    form.value.serialNo = eq.serialNo || '';
    form.value.type = eq.type || '';
    selectedTypeCd.value = eq.type || '';
    form.value.supplyPrice = Number(eq.supplyPrice) || 0;
    form.value.vat = Number(eq.vat) || 0;
    form.value.totalPrice = Number(eq.totalPrice) || 0;
    form.value.purchaseDate = eq.purchaseDt ? String(eq.purchaseDt).slice(0, 10) : '';
    form.value.note = eq.bigo || '';

    // 기존 이미지 파싱
    if (eq.imgPath) {
      keptImages.value = String(eq.imgPath)
          .split(',')
          .map(p => p.trim())
          .filter(Boolean)
          .map(p => ({
            path: p,
            url: p.startsWith('http') ? p : `/api${p.startsWith('/') ? '' : '/'}${p}`
          }));
    }
  } catch (e) {
    console.error('장비 로드 실패:', e);
    alert('장비 정보를 불러오지 못했습니다.');
    router.push('/equipment/list');
  } finally {
    isLoading.value = false;
  }
};

onMounted(async () => {
  await fetchEquipCategories();
  await loadEquipment();

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
  newFiles.value.forEach(item => URL.revokeObjectURL(item.previewUrl));
});

// =============================================
// 저장
// =============================================
const goBack = () => {
  if (confirm('변경 사항이 저장되지 않을 수 있습니다. 목록으로 돌아가시겠습니까?')) {
    router.push('/equipment/list');
  }
};

const saveEquipment = async () => {
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

  if (!confirm('장비 정보를 수정하시겠습니까?')) return;

  const formData = new FormData();
  formData.append('name', form.value.name);
  formData.append('type', form.value.type);
  formData.append('model', form.value.model);
  formData.append('serialNo', form.value.serialNo);
  formData.append('supplyPrice', form.value.supplyPrice);
  formData.append('vat', form.value.vat);
  formData.append('totalPrice', form.value.totalPrice);
  formData.append('purchaseDt', form.value.purchaseDate);
  formData.append('bigo', form.value.note);
  // 유지할 기존 이미지 경로 (CSV)
  formData.append('keptImgPath', keptImages.value.map(k => k.path).join(','));

  // 신규 업로드 파일
  newFiles.value.forEach(item => {
    formData.append('imgPath', item.file);
  });

  try {
    const res = await axios.put(`/api/v1/equipment/${equipIdx}`, formData);
    if (res.data?.result) {
      alert('장비 정보가 수정되었습니다.');
      await router.push('/equipment/list');
    } else {
      alert(res.data?.msg || '수정에 실패했습니다.');
    }
  } catch (e) {
    console.error(e);
    alert('수정 중 문제가 발생했습니다.');
  }
};
</script>

<template>
  <div class="equip-register-page">

    <div class="page-header sticky-header">
      <div class="header-left">
        <button type="button" @click="goBack" class="btn-back">
          <i class="mdi mdi-arrow-left"></i>
        </button>
        <div>
          <h1 class="page-title"><i class="mdi mdi-pencil-box-outline text-primary"></i> 장비 정보 수정</h1>
          <p class="page-subtitle">기본 정보, 단가, 사진 등을 수정합니다. 수량·배치·폐기는 목록 모달에서 관리하세요.</p>
        </div>
      </div>
      <div class="header-right">
        <button type="button" @click="goBack" class="btn-cancel">취소</button>
        <button type="button" @click="saveEquipment" class="btn-submit" :disabled="isLoading">
          <i class="mdi mdi-check"></i> 수정 저장
        </button>
      </div>
    </div>

    <div v-if="isLoading" class="loading-state">
      <i class="mdi mdi-loading mdi-spin"></i> 장비 정보를 불러오는 중...
    </div>

    <div v-else class="register-layout">
      <!-- 좌측 퀵 네비 -->
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

      <!-- 우측 메인 폼 -->
      <main class="content-area">
        <form @submit.prevent="saveEquipment" id="editForm">

          <!-- 카드 1: 장비 사진 -->
          <section id="sec-image" class="category-card">
            <div class="card-header">
              <i class="mdi mdi-image-outline text-primary"></i>
              <h2>장비 사진</h2>
            </div>
            <div class="card-body">
              <input type="file" ref="fileInput" @change="handleFileChange" accept="image/png, image/jpeg, image/jpg" multiple hidden />
              <div class="image-gallery-grid">
                <!-- 기존 이미지 -->
                <div v-for="(img, index) in keptImages" :key="`kept-${index}`" class="image-preview-box">
                  <img :src="img.url" alt="기존 장비 사진" @error="e => e.target.style.display='none'" />
                  <div class="image-badge">기존</div>
                  <div class="image-overlay">
                    <button type="button" @click="removeKeptImage(index)" class="btn-img-action btn-danger">
                      <i class="mdi mdi-trash-can-outline"></i> 삭제
                    </button>
                  </div>
                </div>
                <!-- 신규 이미지 -->
                <div v-for="(img, index) in newFiles" :key="`new-${index}`" class="image-preview-box">
                  <img :src="img.previewUrl" alt="장비 미리보기" />
                  <div class="image-badge new">신규</div>
                  <div class="image-overlay">
                    <button type="button" @click="removeNewFile(index)" class="btn-img-action btn-danger">
                      <i class="mdi mdi-trash-can-outline"></i> 삭제
                    </button>
                  </div>
                </div>
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
              <h2>기본 정보 수정</h2>
            </div>
            <div class="card-body">
              <div class="form-grid">

                <div class="form-group category-dropdown-container full-width">
                  <label class="form-label required">장비 분류</label>
                  <div class="custom-select-btn" @click="isCategoryMenuOpen = !isCategoryMenuOpen">
                    <span>{{ selectedTypeLabel }}</span>
                    <i class="mdi mdi-chevron-down"></i>
                  </div>
                  <div v-if="isCategoryMenuOpen" class="dropdown-overlay" @click="isCategoryMenuOpen = false"></div>
                  <ul v-if="isCategoryMenuOpen" class="custom-dropdown-menu">
                    <li v-for="base in equipTree" :key="base.itemCd" class="menu-item">
                      <div class="menu-label" @click.stop="handleBaseClick(base)">
                        <i v-if="base.children.length > 0" class="mdi tree-chevron" :class="expandedBaseCd === base.itemCd ? 'mdi-chevron-down' : 'mdi-chevron-right'"></i>
                        <i v-else class="mdi tree-chevron tree-chevron-leaf mdi-circle-small"></i>
                        <span class="menu-text">{{ base.itemNm }}</span>
                      </div>
                      <ul v-show="expandedBaseCd === base.itemCd" class="custom-submenu">
                        <li v-for="mid in base.children" :key="mid.itemCd" class="submenu-item-wrap">
                          <div class="submenu-label" @click.stop="handleMidClick(mid)">
                            <i v-if="mid.children.length > 0" class="mdi tree-chevron" :class="expandedMidCd === mid.itemCd ? 'mdi-chevron-down' : 'mdi-chevron-right'"></i>
                            <i v-else class="mdi tree-chevron tree-chevron-leaf mdi-circle-small"></i>
                            <span class="menu-text">{{ mid.itemNm }}</span>
                          </div>
                          <ul v-show="expandedMidCd === mid.itemCd" class="custom-subsubmenu">
                            <li v-for="sub in mid.children" :key="sub.itemCd" class="subsubmenu-item" @click.stop="selectType(sub)">
                              <i class="mdi tree-chevron tree-chevron-leaf mdi-circle-small"></i>
                              {{ sub.itemNm }}
                            </li>
                          </ul>
                        </li>
                      </ul>
                    </li>
                  </ul>
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
                  <label class="form-label">도입(구매)일</label>
                  <input type="date" v-model="form.purchaseDate" class="form-input" />
                </div>

                <div class="form-group full-width price-group-container">
                  <label class="form-label">단가 정보 (원)</label>
                  <div class="price-inputs-wrapper">
                    <div class="price-box">
                      <label class="sub-label">공급가</label>
                      <div class="input-with-unit">
                        <input type="number" v-model.number="form.supplyPrice" min="0" step="1000" class="form-input text-right" />
                        <span class="unit">원</span>
                      </div>
                    </div>
                    <div class="math-sign"><i class="mdi mdi-plus"></i></div>
                    <div class="price-box">
                      <div class="sub-label-wrap">
                        <label class="sub-label">부가세</label>
                        <label class="checkbox-label">
                          <input type="checkbox" v-model="isAutoVat" /> 자동 (10%)
                        </label>
                      </div>
                      <div class="input-with-unit">
                        <input type="number" v-model.number="form.vat" min="0" step="10" :readonly="isAutoVat" :class="['form-input text-right', { 'bg-readonly': isAutoVat }]" />
                        <span class="unit">원</span>
                      </div>
                    </div>
                    <div class="math-sign"><i class="mdi mdi-equal"></i></div>
                    <div class="price-box total-box">
                      <label class="sub-label">단가(합계)</label>
                      <div class="input-with-unit">
                        <input type="number" :value="form.totalPrice" readonly class="form-input text-right bg-readonly text-primary-bold" />
                        <span class="unit">원</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="form-group full-width">
                  <label class="form-label">비고 및 특이사항</label>
                  <textarea v-model="form.note" class="form-textarea" rows="4" placeholder="구매처, 기본 사양, 보증(A/S) 기간 등 필요한 메모를 남겨주세요."></textarea>
                </div>

              </div>
              <p class="helper-text-sm" style="margin-top:16px;">
                <i class="mdi mdi-information-outline"></i>
                총 수량·투입 단지·폐기·수리 이력은 장비 목록의 상세 모달에서 관리됩니다.
              </p>
            </div>
          </section>

          <div style="height: 100px;"></div>
        </form>
      </main>

    </div>
  </div>
</template>

<style>
body, #__nuxt, #__layout, .v-application { overflow: visible !important; }
</style>

<style scoped>
.equip-register-page { background-color: var(--bg-canvas, #f1f5f9); margin: -24px; height: calc(100vh - 60px); display: flex; flex-direction: column; overflow: hidden; }
.sticky-header { flex-shrink: 0; background: rgba(255, 255, 255, 0.98); backdrop-filter: blur(8px); padding: 16px 32px; border-bottom: 1px solid var(--border-color, #e2e8f0); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05); display: flex; justify-content: space-between; align-items: center; z-index: 50; margin: 0; }
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
.btn-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(59, 130, 246, 0.3); }
.btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }

.loading-state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-sub); font-size: 14px; gap: 8px; }
.loading-state i { font-size: 20px; color: var(--primary); }

.register-layout { display: flex; flex: 1; max-width: 1400px; width: 100%; margin: 0 auto; padding-top: 24px; overflow: hidden; }
.quick-nav-sidebar { width: 220px; flex-shrink: 0; height: 100%; overflow-y: auto; padding: 0 16px; }
.nav-title { font-size: 12px; font-weight: 800; color: var(--text-muted, #94a3b8); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; padding-left: 12px; }
.nav-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.nav-item { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 8px; font-size: 14px; font-weight: 600; color: var(--text-sub, #475569); cursor: pointer; transition: all 0.2s; background: transparent; }
.nav-item i { font-size: 18px; opacity: 0.6; }
.nav-item:hover { background: rgba(0,0,0,0.04); color: var(--text-main, #1e293b); }
.nav-item.active { background: #fff; color: var(--primary, #3b82f6); box-shadow: 0 2px 8px rgba(0,0,0,0.05); font-weight: 700; }
.nav-item.active i { opacity: 1; }

.content-area { flex: 1; height: 100%; overflow-y: auto; position: relative; padding: 0 24px 80px 24px; scroll-behavior: smooth; }

.category-card { background: #ffffff; border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03); overflow: visible; margin-bottom: 24px; }
.card-header { padding: 20px 24px; border-bottom: 1px solid var(--border-color, #e2e8f0); background: #fff; display: flex; align-items: center; gap: 12px; border-top-left-radius: 12px; border-top-right-radius: 12px; }
.card-header i { font-size: 24px; }
.card-header h2 { font-size: 18px; font-weight: 800; color: var(--text-main, #1e293b); margin: 0; }
.card-body { padding: 24px; }

.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px 20px; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
.full-width { grid-column: 1 / -1; }
.form-label { font-size: 13px; font-weight: 700; color: var(--text-sub, #475569); }
.form-label.required::after { content: '*'; color: var(--danger, #ef4444); margin-left: 4px; }
.form-input, .form-select, .form-textarea { padding: 10px 12px; border: 1px solid var(--border-focus, #cbd5e1); border-radius: 6px; font-size: 13px; background: #fff; width: 100%; box-sizing: border-box; transition: 0.2s; color: var(--text-main); }
.form-input:focus, .form-select:focus, .form-textarea:focus { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); outline: none; }
.form-textarea { resize: vertical; min-height: 80px; }
.bg-readonly { background-color: var(--bg-canvas, #f1f5f9) !important; color: var(--text-sub) !important; pointer-events: none; }
.text-primary-bold { color: var(--primary, #3b82f6) !important; font-weight: 800; }

.input-with-unit { display: flex; align-items: center; border: 1px solid var(--border-focus); border-radius: 6px; background: #fff; overflow: hidden; }
.input-with-unit:focus-within { border-color: var(--primary, #3b82f6); box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1); }
.input-with-unit .form-input { border: none; box-shadow: none; flex: 1; border-radius: 0; }
.input-with-unit .form-input:focus { box-shadow: none; }
.input-with-unit .unit { padding: 0 12px; font-size: 13px; color: var(--text-sub); border-left: 1px solid var(--border-focus); display:flex; align-items:center; }

.helper-text-sm { font-size: 12px; color: var(--text-muted); margin-top: 4px; }

.price-group-container { background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid var(--border-color); }
.price-inputs-wrapper { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-top: 4px;}
.price-box { flex: 1; min-width: 180px; display: flex; flex-direction: column; gap: 6px;}
.math-sign { display: flex; align-items: center; justify-content: center; height: 40px; font-size: 20px; color: #94a3b8; font-weight: bold; }
.sub-label-wrap { display: flex; justify-content: space-between; align-items: center; }
.sub-label { font-size: 12px; font-weight: 600; color: var(--text-sub); }
.checkbox-label { font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer; color: var(--text-main); font-weight: 600;}
.checkbox-label input { cursor: pointer; accent-color: var(--primary); }

.image-gallery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 16px; width: 100%; }
.image-preview-box, .image-empty-box { width: 100%; aspect-ratio: 1 / 1; border-radius: 12px; overflow: hidden; position: relative; }
.image-empty-box { border: 2px dashed var(--border-focus); background: var(--bg-canvas); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; color: var(--text-sub); }
.image-empty-box:hover { background: rgba(59, 130, 246, 0.05); border-color: var(--primary); color: var(--primary); }
.image-empty-box i { font-size: 32px; margin-bottom: 8px; opacity: 0.8; }
.image-empty-box p { font-size: 13px; font-weight: 600; margin: 0 0 4px 0; }
.image-empty-box span { font-size: 11px; opacity: 0.7; }
.image-preview-box img { width: 100%; height: 100%; object-fit: cover; border: 1px solid var(--border-color); }
.image-badge { position: absolute; top: 6px; left: 6px; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; background: rgba(100, 116, 139, 0.9); color: #fff; z-index: 2; }
.image-badge.new { background: rgba(59, 130, 246, 0.9); }
.image-overlay { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
.image-preview-box:hover .image-overlay { opacity: 1; }
.btn-img-action { padding: 8px 12px; background: rgba(255, 255, 255, 0.95); border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; }
.btn-img-action:hover { background: white; }
.btn-danger { color: var(--danger); }

.category-dropdown-container { position: relative; }
.dropdown-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; z-index: 99; cursor: default; }
.custom-select-btn { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border: 1px solid var(--border-focus); border-radius: 6px; background: #fff; font-size: 13px; color: var(--text-main); cursor: pointer; transition: 0.2s; height: 41px; box-sizing: border-box; }
.custom-select-btn:hover { border-color: var(--primary); }
.category-dropdown-container:focus-within .custom-select-btn { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.custom-dropdown-menu { position: absolute; top: calc(100% + 4px); left: 0; width: 100%; background: #fff; border: 1px solid var(--border-focus); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); padding: 6px 0; margin: 0; list-style: none; z-index: 100; max-height: 360px; overflow-y: auto; }
.menu-label { display: flex; align-items: center; gap: 6px; padding: 10px 16px; font-size: 13px; color: var(--text-main); cursor: pointer; transition: 0.15s; }
.menu-label:hover { background: var(--bg-hover); color: var(--primary); font-weight: 700; }
.menu-text { flex: 1; }
.tree-chevron { font-size: 18px; color: var(--text-sub); width: 20px; text-align: center; flex-shrink: 0; }
.tree-chevron-leaf { font-size: 14px; opacity: 0.5; }
.custom-submenu { width: 100%; background: var(--bg-canvas); padding: 4px 0; margin: 0; list-style: none; border-top: 1px solid var(--border-color); border-bottom: 1px solid var(--border-color); }
.submenu-label { display: flex; align-items: center; gap: 6px; padding: 8px 16px 8px 32px; font-size: 12px; color: var(--text-sub); cursor: pointer; transition: 0.15s; }
.submenu-label:hover { background: var(--primary-soft); color: var(--primary); font-weight: 700; }
.custom-subsubmenu { width: 100%; background: #fff; padding: 2px 0; margin: 0; list-style: none; border-top: 1px dashed var(--border-color); border-bottom: 1px dashed var(--border-color); }
.subsubmenu-item { display: flex; align-items: center; gap: 6px; padding: 7px 16px 7px 52px; font-size: 12px; color: var(--text-sub); cursor: pointer; transition: 0.15s; }
.subsubmenu-item:hover { background: var(--primary-soft); color: var(--primary); font-weight: 700; }
</style>
