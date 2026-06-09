<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";
import { useAuthStore } from "~/stores/auth.js";

const router = useRouter();
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;

// ==========================================
// 1. 사이드바 트리 데이터 (이미지 기준 1차-2차 고정)
// ==========================================
// 1차 카테고리(대분류)와 2차 카테고리(중분류)를 이미지 조직도에 맞게 정확히 하드코딩합니다.
// 이제 이 2차 카테고리의 id(예: 04001002)가 3차 세부항목의 groupCd가 됩니다.
const categories = ref([
  {
    id: '04001',
    name: '직접노무비',
    icon: 'mdi-account-hard-hat',
    children: [
      { id: '04001001', name: '기본급' },
      { id: '04001002', name: '수당' },
      { id: '04001003', name: '연차적립금' },
      { id: '04001004', name: '퇴직적립금' }
    ]
  },
  {
    id: '04002',
    name: '간접노무비',
    icon: 'mdi-account-tie',
    children: [
      { id: '04002001', name: '국민연금' },
      { id: '04002002', name: '건강보험' },
      { id: '04002003', name: '장기요양보험' },
      { id: '04002004', name: '산재보험' },
      { id: '04002005', name: '장애인채용부담금' },
      { id: '04002006', name: '환급주민세' },
      { id: '04002007', name: '지방소득세' },
      { id: '04002008', name: '소득세' },
      { id: '04002009', name: '법인주민세' },
      { id: '04002010', name: '신원보증료' },
      { id: '04002011', name: '기타공제 및 비용' }
    ]
  },
  {
    id: '04003',
    name: '제경비',
    icon: 'mdi-store-cog-outline',
    children: [
      { id: '04003001', name: '대청소비용' },
      { id: '04003002', name: '청소용품비' },
      { id: '04003003', name: '기타제공비' }
    ]
  }
]);

// ==========================================
// 2. 상태 관리 변수
// ==========================================
const selectedCategoryId = ref('04001002'); // 기본 선택: 직접노무비 > 수당 (2차)
const searchQuery = ref('');
const codeList = ref([]); // 백엔드에서 불러온 모든 3차 세부 코드 원본

// 2차 카테고리(사이드바) 편집용 상태
const addingToGroupId = ref(null);
const newCategoryName = ref('');
const editingCategoryId = ref(null);
const editingCategoryName = ref('');

// 3차 카테고리(우측 테이블) 신규 추가 폼
const newCodeName = ref('');
const newCodeSort = ref(0);
const newTaxFree = ref(0);

// ==========================================
// 3. Computed (핵심 3계층 매핑)
// ==========================================

// 현재 선택된 2차 카테고리 정보 찾기 (테이블 헤더용)
const currentCategoryInfo = computed(() => {
  if (!selectedCategoryId.value) return null;

  for (const group of categories.value) {
    const child = group.children.find(c => c.id === selectedCategoryId.value);

    if (child) {
      return {
        parentId: group.id,
        parentName: group.name,
        // 비과세는 '04001'(직접노무비) 하위에 속한 2차 카테고리일 때만 노출
        hasTaxFree: group.id === '04001',
        id: child.id,
        name: child.name
      };
    }
  }
  return null;
});

// 우측 테이블 렌더링 리스트 (선택된 2차 카테고리의 3차 자식들만 필터링)
const filteredCodeList = computed(() => {
  // DB에서 불러온 데이터 중, groupCd가 현재 선택된 2차 코드(예: 04001002)와 일치하는 것만 추출
  let list = codeList.value.filter(code => code.groupCd === selectedCategoryId.value);

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    list = list.filter(code =>
        code.itemNm.toLowerCase().includes(query) ||
        code.itemCd.toLowerCase().includes(query)
    );
  }
  return list;
});

// 신규 3차 코드 번호 생성 (2차 코드 뒤에 순번 3자리 부여, 예: 04001002 + 001)
const newCodeNumber = computed(() => {
  if (!selectedCategoryId.value) return '';
  const prefix = selectedCategoryId.value;

  const currentCodes = codeList.value.filter(c => c.groupCd === prefix);
  if (!currentCodes.length) return prefix + '001';

  const nums = currentCodes.map(c => parseInt(c.itemCd.slice(-3)) || 0);
  const next = Math.max(...nums, 0) + 1;
  return prefix + String(next).padStart(3, '0');
});


// ==========================================
// 4. 2차 카테고리 (사이드바) 조작 함수
// ==========================================
const selectCategory = (childId) => {
  selectedCategoryId.value = childId;
  searchQuery.value = '';
  newTaxFree.value = 0;
};

const startCategoryAdd = (groupId) => {
  addingToGroupId.value = groupId;
  newCategoryName.value = '';
};

const addCategory = (group) => {
  if (!newCategoryName.value.trim()) return alert('중분류명을 입력해주세요.');

  // 2차 코드 채번: 상위 1차 코드 뒤에 순번 3자리 부여
  const nums = group.children.map(c => parseInt(c.id.slice(-3)) || 0);
  const nextNum = Math.max(...nums, 0) + 1;
  const newId = `${group.id}${String(nextNum).padStart(3, '0')}`;

  group.children.push({ id: newId, name: newCategoryName.value });
  alert('중분류가 추가되었습니다.\n(※ 프론트 UI 상에 추가된 상태이므로, 백엔드 연동이 필요할 수 있습니다.)');

  addingToGroupId.value = null;
  newCategoryName.value = '';
  selectCategory(newId);
};

const startCategoryEdit = (child) => {
  editingCategoryId.value = child.id;
  editingCategoryName.value = child.name;
};

const saveCategoryEdit = (child) => {
  if (!editingCategoryName.value.trim()) return alert('분류명을 입력해주세요.');
  child.name = editingCategoryName.value;
  editingCategoryId.value = null;
};

const cancelCategoryEdit = () => {
  editingCategoryId.value = null;
  editingCategoryName.value = '';
};

const deleteCategory = (group, childId) => {
  if (!confirm('이 중분류를 삭제하시겠습니까?')) return;
  group.children = group.children.filter(c => c.id !== childId);
  if (selectedCategoryId.value === childId) {
    selectedCategoryId.value = null;
  }
};


// ==========================================
// 5. 3차 카테고리 (우측 테이블) CRUD
// ==========================================

// 3차 세부 코드 원본 데이터 전체 호출
const fetchCodesByCategory = async () => {
  try {
    const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
    const result = res.data.data || [];

    // 원본 데이터를 그대로 맵핑
    codeList.value = result.map((item) => ({
      groupCd: item.groupCd, // 부모가 되는 2차 카테고리 ID
      itemCd: item.itemCd,   // 3차 본인 ID
      itemNm: item.itemNm,
      sort: item.sort || 0,
      useFl: item.useFl || 'Y',
      tax_free: item.tax_free || 0,
      isEditing: false,
      deleteFl: item.deleteFl || 'N',
      editFl: item.editFl || 'N'
    }));
  } catch (err) {
    console.error('코드 로드 실패:', err);
    codeList.value = [];
  }
};

const startEdit = (code) => {
  code._original = { ...code };
  code.isEditing = true;
};

const cancelEdit = (code) => {
  Object.assign(code, code._original);
  delete code._original;
  code.isEditing = false;
};

// 3차 코드 수정 저장
const saveCode = async (code) => {
  try {
    const payload = {
      groupCd: selectedCategoryId.value, // 현재 선택된 2차 카테고리 ID가 부모가 됨
      itemCd: code.itemCd,
      itemNm: code.itemNm,
      sort: code.sort,
      useFl: code.useFl,
      tax_free: currentCategoryInfo.value?.hasTaxFree ? code.tax_free : 0
    };

    await axios.post(`/api/v1/code/${cIdx}`, payload);
    alert('수정되었습니다.');
    code.isEditing = false;
  } catch (err) {
    console.error('수정 실패:', err);
    alert('수정에 실패했습니다.');
  }
};

// 3차 코드 삭제
const deleteCode = async (itemCd) => {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  try {
    await axios.delete(`/api/v1/code/${itemCd}`);
    codeList.value = codeList.value.filter(c => c.itemCd !== itemCd);
    alert('삭제되었습니다.');
  } catch (err) {
    console.error('삭제 실패:', err);
    alert('삭제에 실패했습니다.');
  }
};

// 신규 3차 코드 추가
const addCode = async () => {
  if (!newCodeName.value.trim()) return alert('항목명을 입력해주세요.');

  try {
    const payload = {
      groupCd: selectedCategoryId.value, // 핵심! 저장할 때 2차 카테고리 코드를 부모로 지정
      itemCd: newCodeNumber.value,       // 11자리 (예: 04001002001)
      itemNm: newCodeName.value,
      sort: newCodeSort.value || (filteredCodeList.value.length + 1),
      useFl: 'Y',
      tax_free: currentCategoryInfo.value?.hasTaxFree ? newTaxFree.value : 0
    };

    await axios.post(`/api/v1/code/${cIdx}`, payload);
    alert('추가되었습니다.');

    // 다시 서버에서 최신 리스트 불러오기 (자동 필터링 반영)
    await fetchCodesByCategory();

    // 입력 폼 리셋
    newCodeName.value = '';
    newCodeSort.value = 0;
    newTaxFree.value = 0;
  } catch (err) {
    console.error('추가 실패:', err);
    alert('추가에 실패했습니다.');
  }
};

// ==========================================
// 6. 초기 구동
// ==========================================
onMounted(async () => {
  // DB에서 3차 항목 리스트 로드
  await fetchCodesByCategory();
});
</script>
<template>
  <div class="payroll-settings-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title"><i class="mdi mdi-cash-multiple"></i> 급여 코드 및 카테고리 관리</h1>
        <p class="page-subtitle">좌측에서 중분류를 관리하고, 우측에서 세부 급여 코드를 설정하세요.</p>
      </div>
    </div>

    <div class="layout-container">

      <!-- ── 사이드바 (기존 유지) ── -->
      <aside class="sidebar-tree">
        <div v-for="group in categories" :key="group.id" class="tree-group">
          <div class="tree-group-title">
            <i :class="['mdi', group.icon]"></i> {{ group.name }}
          </div>
          <ul class="tree-children">
            <li v-for="child in group.children" :key="child.id">

              <div v-if="editingCategoryId === child.id" class="tree-edit-box">
                <input
                    type="text" v-model="editingCategoryName" class="tree-input"
                    @keyup.enter="saveCategoryEdit(child)" @keyup.esc="cancelCategoryEdit"
                />
                <div class="tree-edit-actions">
                  <button @click="saveCategoryEdit(child)" class="icon-btn text-success" title="저장"><i class="mdi mdi-check"></i></button>
                  <button @click="cancelCategoryEdit" class="icon-btn text-danger" title="취소"><i class="mdi mdi-close"></i></button>
                </div>
              </div>

              <div v-else class="tree-item-wrapper">
                <button
                    :class="['tree-item-btn', { active: selectedCategoryId === child.id }]"
                    @click="selectCategory(child.id)"
                >
                  <span class="tree-item-name">{{ child.name }}</span>
                </button>
                <div class="tree-item-hover-actions">
                  <button @click.stop="startCategoryEdit(child)" class="icon-btn" title="수정"><i class="mdi mdi-pencil-outline"></i></button>
                  <button @click.stop="deleteCategory(group, child.id)" class="icon-btn text-danger" title="삭제"><i class="mdi mdi-trash-can-outline"></i></button>
                </div>
              </div>

            </li>

            <li v-if="addingToGroupId === group.id" class="tree-add-box">
              <input
                  type="text" v-model="newCategoryName" placeholder="새 중분류명 입력" class="tree-input"
                  @keyup.enter="addCategory(group)" @keyup.esc="addingToGroupId = null" autofocus
              />
              <div class="tree-edit-actions">
                <button @click="addCategory(group)" class="icon-btn text-success"><i class="mdi mdi-check"></i></button>
                <button @click="addingToGroupId = null" class="icon-btn text-danger"><i class="mdi mdi-close"></i></button>
              </div>
            </li>
            <li v-else>
              <button class="tree-add-btn" @click="startCategoryAdd(group.id)">
                <i class="mdi mdi-plus"></i> 중분류 추가
              </button>
            </li>
          </ul>
        </div>
      </aside>

      <!-- ── 메인 콘텐츠 ── -->
      <main class="main-content">

        <!-- 카테고리 미선택 -->
        <div v-if="!selectedCategoryId" class="empty-selection-box">
          <i class="mdi mdi-arrow-left-top-bold"></i>
          <p>좌측에서 관리할 카테고리를 선택해주세요.</p>
        </div>

        <template v-else>

          <!-- 콘텐츠 헤더 -->
          <div class="content-header">
            <div class="breadcrumb">
              <span class="breadcrumb-parent">{{ currentCategoryInfo?.parentName }}</span>
              <i class="mdi mdi-chevron-right"></i>
              <span class="breadcrumb-current">{{ currentCategoryInfo?.name }}</span>
            </div>
            <div class="search-box">
              <i class="mdi mdi-magnify"></i>
              <input
                  type="text" v-model="searchQuery"
                  placeholder="코드번호 또는 항목명 검색..."
                  class="search-input"
              />
              <button v-if="searchQuery" @click="searchQuery = ''" class="search-clear">
                <i class="mdi mdi-close"></i>
              </button>
            </div>
          </div>

          <!-- 테이블 카드 -->
          <div class="table-card">
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                <tr>
                  <th style="width:52px;">No.</th>
                  <th style="width:150px;">코드 번호</th>
                  <th>항목명</th>
                  <th v-if="currentCategoryInfo?.hasTaxFree" style="width:160px;">비과세한도</th>
                  <th style="width:72px;">순서</th>
                  <th style="width:100px;">사용 여부</th>
                  <th style="width:84px;"></th>
                </tr>
                </thead>
                <tbody>

                <tr v-for="(code, index) in filteredCodeList" :key="code.id" class="data-row">

                  <td class="text-center">
                    <span class="row-number">{{ index + 1 }}</span>
                  </td>

                  <td>
                    <span class="code-number">{{ code.itemCd }}</span>
                  </td>

                  <td>
                    <input v-if="code.isEditing" type="text" v-model="code.itemNm" class="input-inline w-full" />
                    <span v-else class="code-name">{{ code.itemNm }}</span>
                  </td>

                  <td v-if="currentCategoryInfo?.hasTaxFree">
                    <div v-if="code.isEditing" class="tax-input-wrapper">
                      <input type="number" v-model.number="code.tax_free" class="input-inline text-right" min="0" />
                      <span class="tax-unit">원</span>
                    </div>
                    <span v-else class="tax-display">
                        {{ Number(code.tax_free).toLocaleString() }}<em class="tax-em"> 원</em>
                      </span>
                  </td>

                  <td class="text-center">
                    <input v-if="code.isEditing" type="number" v-model.number="code.sort" class="input-inline text-center" style="width:52px;" min="0" />
                    <span v-else class="sort-number">{{ code.sort }}</span>
                  </td>

                  <td>
                    <select v-if="code.isEditing" v-model="code.useFl" class="select-inline">
                      <option value="Y">사용</option>
                      <option value="N">미사용</option>
                    </select>
                    <span v-else :class="['use-dot', code.useFl === 'Y' ? 'use-on' : 'use-off']">
                        {{ code.useFl === 'Y' ? '사용' : '미사용' }}
                      </span>
                  </td>

                  <td class="text-center">
                    <div class="row-actions">
                      <template v-if="code.isEditing">
                        <button @click="saveCode(code)" class="icon-btn-row icon-btn-row--save" title="저장">
                          <i class="mdi mdi-check"></i>
                        </button>
                        <button @click="cancelEdit(code)" class="icon-btn-row icon-btn-row--cancel" title="취소">
                          <i class="mdi mdi-close"></i>
                        </button>
                      </template>
                      <template v-else>
                        <button @click="startEdit(code)" class="icon-btn-row icon-btn-row--edit" title="수정">
                          <i class="mdi mdi-pencil-outline"></i>
                        </button>
                        <button @click="deleteCode(code.itemCd)" class="icon-btn-row icon-btn-row--del" title="삭제">
                          <i class="mdi mdi-trash-can-outline"></i>
                        </button>
                      </template>
                    </div>
                  </td>
                </tr>

                <!-- 빈 상태 -->
                <tr v-if="filteredCodeList.length === 0" class="empty-row">
                  <td :colspan="currentCategoryInfo?.hasTaxFree ? 7 : 6">
                    <div class="empty-state">
                      <i class="mdi mdi-tray-remove"></i>
                      <p>등록된 항목이 없습니다</p>
                      <span>아래 입력란에서 새로운 항목을 추가해주세요</span>
                    </div>
                  </td>
                </tr>

                </tbody>
              </table>
            </div>

            <!-- ── 추가 폼 (테이블 밖 분리) ── -->
            <div class="add-form-bar">
              <div class="add-form-fields">
                <div class="add-field">
                  <label>코드번호</label>
                  <input type="text" :value="newCodeNumber" disabled class="add-input add-input--disabled" />
                </div>
                <div class="add-field add-field--grow">
                  <label>항목명 <span class="req">*</span></label>
                  <input
                      type="text" v-model="newCodeName"
                      placeholder="항목명을 입력하세요"
                      class="add-input"
                      @keyup.enter="addCode"
                  />
                </div>
                <div v-if="currentCategoryInfo?.hasTaxFree" class="add-field">
                  <label>비과세한도</label>
                  <div class="tax-input-wrapper">
                    <input type="number" v-model.number="newTaxFree" placeholder="0" class="add-input text-right" min="0" />
                    <span class="tax-unit">원</span>
                  </div>
                </div>
                <div class="add-field" style="width:72px;">
                  <label>순서</label>
                  <input type="number" v-model.number="newCodeSort" placeholder="0" class="add-input text-center" min="0" />
                </div>
              </div>
              <button @click="addCode" class="btn-add-submit">
                <i class="mdi mdi-plus"></i> 추가
              </button>
            </div>

          </div>
        </template>
      </main>
    </div>
  </div>
</template>
<style scoped>
/* ── 유틸 ── */
.w-full    { width: 100%; box-sizing: border-box; }
.text-center { text-align: center; }
.text-right  { text-align: right; }
.text-primary{ color: var(--primary); }
.text-success{ color: var(--success) !important; }
.text-danger { color: var(--danger)  !important; }

/* ── 페이지 ── */
.layout-container { display: flex; gap: 20px; align-items: flex-start; }

/* ═══════════════════════════
   사이드바 트리
═══════════════════════════ */
.sidebar-tree {
  width: 240px; flex-shrink: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 12px;
}
.tree-group          { margin-bottom: 20px; }
.tree-group:last-child{ margin-bottom: 0; }
.tree-group-title    { font-weight: 700; font-size: 12px; color: var(--text-sub); letter-spacing: .5px; text-transform: uppercase; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; padding: 0 4px; }
.tree-group-title i  { font-size: 16px; }
.tree-children       { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }

.tree-item-wrapper   { position: relative; display: flex; align-items: center; border-radius: 7px; overflow: hidden; }
.tree-item-btn       { flex: 1; text-align: left; padding: 8px 10px 8px 18px; background: transparent; border: none; color: var(--text-sub); font-size: 13px; cursor: pointer; transition: all .15s; display: flex; align-items: center; }
.tree-item-wrapper:hover .tree-item-btn { background: var(--bg-hover); color: var(--text-main); }
.tree-item-btn.active{ background: var(--primary-soft); color: var(--primary); font-weight: 600; }
.tree-item-name      { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tree-item-hover-actions {
  position: absolute; right: 4px;
  display: flex; gap: 2px;
  opacity: 0; transition: opacity .15s;
}
.tree-item-wrapper:hover .tree-item-hover-actions { opacity: 1; }

.tree-add-box, .tree-edit-box { display: flex; align-items: center; gap: 4px; padding: 4px 4px 4px 18px; }
.tree-input  { flex: 1; padding: 5px 7px; border: 1px solid var(--border-color); border-radius: 5px; font-size: 12px; }
.tree-input:focus { outline: none; border-color: var(--primary); }
.tree-edit-actions { display: flex; gap: 2px; }

.icon-btn {
  background: none; border: none; padding: 4px; border-radius: 4px;
  cursor: pointer; color: var(--text-sub);
  display: flex; align-items: center; justify-content: center; font-size: 14px;
}
.icon-btn:hover { background: var(--bg-canvas); color: var(--text-main); }

.tree-add-btn { width: 100%; text-align: left; padding: 7px 10px 7px 18px; background: transparent; border: none; border-radius: 7px; color: var(--primary); font-size: 12px; font-weight: 600; cursor: pointer; transition: background .15s; opacity: .75; }
.tree-add-btn:hover { background: var(--primary-soft); opacity: 1; }

/* ═══════════════════════════
   메인 콘텐츠
═══════════════════════════ */
.main-content { flex: 1; min-width: 0; }

.empty-selection-box { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; background: var(--bg-surface); border: 1px dashed var(--border-color); border-radius: 12px; color: var(--text-sub); font-size: 14px; gap: 12px; }
.empty-selection-box i { font-size: 32px; color: var(--border-color); }

/* 콘텐츠 헤더 */
.content-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 12px; background: var(--bg-surface);
  padding: 14px 16px; border-radius: 12px; border: 1px solid var(--border-color);
  gap: 16px;
}
.breadcrumb          { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.breadcrumb-parent   { font-size: 13px; color: var(--text-sub); font-weight: 500; }
.breadcrumb .mdi-chevron-right { font-size: 16px; color: var(--border-color); }
.breadcrumb-current  { font-size: 14px; color: var(--text-main); font-weight: 700; }

.editable-chip {
  display: inline-flex; align-items: center; gap: 3px;
  font-size: 10px; font-weight: 700;
  background: var(--success); color: #fff;
  padding: 2px 8px; border-radius: 20px; margin-left: 4px;
}
.editable-chip .mdi { font-size: 11px; }

/* 검색 */
.search-box  { display: flex; align-items: center; background: var(--bg-canvas); border: 1px solid var(--border-color); border-radius: 8px; padding: 6px 12px; min-width: 220px; }
.search-box i{ color: var(--text-sub); margin-right: 8px; font-size: 15px; }
.search-input{ border: none; background: transparent; outline: none; width: 100%; font-size: 13px; }
.search-clear{ background: none; border: none; cursor: pointer; color: var(--text-sub); padding: 0; }

/* 테이블 카드 */
.table-card    { background: var(--bg-surface); border-radius: 12px; border: 1px solid var(--border-color); overflow: hidden; }
.table-wrapper { overflow-x: auto; }
.data-table    { width: 100%; border-collapse: collapse; font-size: 13px; }

.data-table thead th {
  background: var(--bg-canvas); padding: 10px 12px;
  font-size: 11px; font-weight: 700; color: var(--text-sub); letter-spacing: .3px;
  border-bottom: 1px solid var(--border-color); white-space: nowrap;
}
.data-table tbody td { padding: 10px 12px; border-bottom: 1px solid var(--border-color); vertical-align: middle; }
.data-row:last-child td { border-bottom: none; }
.data-row:hover { background: var(--bg-hover); }

/* 셀 요소 */
.row-number  { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; background: var(--bg-hover); border-radius: 5px; font-weight: 600; color: var(--text-sub); font-size: 11px; }
.code-number { font-size: 12px; font-weight: 600; color: var(--primary); background: var(--primary-soft); padding: 3px 9px; border-radius: 5px; white-space: nowrap; }
.code-name   { font-size: 13px; font-weight: 500; color: var(--text-main); }
.sort-number { font-size: 13px; color: var(--text-sub); }
.tax-display { font-size: 13px; color: var(--text-main); }
.tax-em      { font-style: normal; font-size: 11px; color: var(--text-sub); margin-left: 2px; }
.tax-unit    { font-size: 12px; color: var(--text-sub); white-space: nowrap; }
.tax-input-wrapper { display: flex; align-items: center; gap: 6px; }

/* 사용여부 도트 */
.use-dot::before { content: ''; display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 5px; flex-shrink: 0; }
.use-dot  { display: inline-flex; align-items: center; font-size: 12px; font-weight: 600; }
.use-on   { color: var(--success); }
.use-on::before  { background: var(--success); }
.use-off  { color: var(--text-sub); }
.use-off::before { background: var(--border-color); }

/* 인라인 편집 */
.input-inline { padding: 6px 9px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); box-sizing: border-box; transition: border-color .15s; }
.input-inline:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.select-inline { padding: 5px 8px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 12px; background: var(--bg-surface); cursor: pointer; }

/* 행 아이콘 버튼 */
.row-actions    { display: flex; gap: 4px; justify-content: center; }
.icon-btn-row   { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border-color); border-radius: 6px; background: var(--bg-surface); cursor: pointer; transition: all .15s; font-size: 15px; color: var(--text-sub); }
.icon-btn-row:disabled { opacity: .35; cursor: not-allowed; }
.icon-btn-row--edit:hover   { background: var(--primary); border-color: var(--primary); color: #fff; }
.icon-btn-row--del:hover    { background: var(--danger);  border-color: var(--danger);  color: #fff; }
.icon-btn-row--save:hover   { background: var(--success); border-color: var(--success); color: #fff; }
.icon-btn-row--cancel:hover { background: var(--text-sub);border-color: var(--text-sub);color: #fff; }

/* 빈 상태 */
.empty-row td { padding: 40px 0 !important; border-bottom: none; }
.empty-state  { display: flex; flex-direction: column; align-items: center; gap: 6px; color: var(--text-sub); }
.empty-state i{ font-size: 30px; opacity: .4; }
.empty-state p{ font-size: 13px; font-weight: 600; margin: 0; }
.empty-state span{ font-size: 12px; opacity: .7; }

/* ── 추가 폼 바 ── */
.add-form-bar {
  display: flex; align-items: flex-end; gap: 10px;
  padding: 14px 16px;
  background: var(--bg-canvas);
  border-top: 1px solid var(--border-color);
}
.add-form-fields { display: flex; gap: 10px; flex: 1; flex-wrap: wrap; }
.add-field       { display: flex; flex-direction: column; gap: 4px; }
.add-field--grow { flex: 1; min-width: 160px; }
.add-field label { font-size: 11px; font-weight: 600; color: var(--text-sub); white-space: nowrap; }
.add-field .req  { color: var(--danger); }

.add-input { padding: 7px 10px; border: 1px solid var(--border-color); border-radius: 6px; font-size: 13px; color: var(--text-main); background: var(--bg-surface); box-sizing: border-box; width: 100%; transition: border-color .15s; }
.add-input:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.add-input--disabled { background: var(--bg-hover); color: var(--text-sub); cursor: not-allowed; border-color: transparent; }

.btn-add-submit { display: inline-flex; align-items: center; gap: 5px; padding: 0 20px; height: 36px; background: var(--primary); border: none; border-radius: 7px; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .15s; white-space: nowrap; flex-shrink: 0; }
.btn-add-submit:hover { background: var(--primary-hover, #2563eb); }
.btn-add-submit .mdi { font-size: 16px; }
</style>
