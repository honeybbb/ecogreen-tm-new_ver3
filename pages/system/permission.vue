<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";

// ==========================================
// 1. 상태 관리
// ==========================================
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;
const menuList = ref([]);
const searchQuery = ref('');
const showEditModal = ref(false);
const editingMenu = ref(null);


// 통계 데이터
const stats = ref({
  total: 0,
  masterOnly: 0,
  public: 0,
  active: 0
});

// 편집 폼 데이터
const menuForm = ref({
  menuNo: null,
  menuNm: '',
  menuKey: '',
  menuIcon: 'mdi-circle',
  menuPath: '',
  useFl: 'Y',
  masterOnly: 'Y',
  sort: 0
});

// ==========================================
// 2. API 호출
// ==========================================

// 메뉴 목록 조회
const getMenuList = async () => {
  const companyNo = cIdx;
  const params = { isMaster: authStore.user?.isMaster };
  try {
    const res = await axios.get(`/api/v1/menu/${companyNo}`, {params});
    const data = res.data.data;

    if (data.length > 0) {
      menuList.value = data.map(menu => ({
        ...menu,
        isEditing: false
      }));

      // 통계 계산
      // updateStats();
    }
  } catch (err) {
    console.error('메뉴 로드 실패:', err);
    alert('메뉴 목록을 불러오는데 실패했습니다.');
  }
};

// 메뉴 권한 업데이트
const updateMenuPermission = async (menu) => {
  const payload = {
    companyNo: cIdx,
    menuNo: menu.menuNo,
    masterOnly: menu.masterOnly,
    useFl: menu.useFl
  }

  try {
    await axios.put(`/api/v1/menu/update`, payload);
    console.log('권한 업데이트:', menu.menuNm, menu.masterOnly);
    // updateStats();
  } catch (err) {
    console.error('권한 업데이트 실패:', err);
    alert('권한 업데이트에 실패했습니다.');
    // 실패 시 원래 값으로 복원
    await getMenuList();
  }
};

// 메뉴 정보 저장
const saveMenu = async () => {
  if (!menuForm.value.menuNm || !menuForm.value.menuKey) {
    alert('메뉴명과 메뉴 키는 필수입니다.');
    return;
  }

  try {
    if (menuForm.value.menuNo) {
      // 수정
      await axios.put(`/api/v1/menu/${menuForm.value.menuNo}`, menuForm.value);
      alert('수정되었습니다.');
    } else {
      // 추가
      await axios.post(`/api/v1/menu/${cIdx}`, menuForm.value);
      alert('추가되었습니다.');
    }

    closeEditModal();
    getMenuList();
  } catch (err) {
    console.error('저장 실패:', err);
    alert('저장에 실패했습니다.');
  }
};

// 메뉴 삭제
const deleteMenu = async (menuNo, menuNm) => {
  if (!confirm(`'${menuNm}' 메뉴를 삭제하시겠습니까?`)) return;

  try {
    await axios.delete(`/api/v1/menu/${menuNo}`);
    alert('삭제되었습니다.');
    getMenuList();
  } catch (err) {
    console.error('삭제 실패:', err);
    alert('삭제에 실패했습니다.');
  }
};

// ==========================================
// 3. Computed Properties
// ==========================================

// 필터링된 메뉴 목록
const filteredMenuList = computed(() => {
  let filtered = menuList.value;

  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    filtered = filtered.filter(menu =>
        menu.menuNm?.toLowerCase().includes(query) ||
        menu.menuKey?.toLowerCase().includes(query) ||
        menu.menuPath?.toLowerCase().includes(query)
    );
  }

  return filtered;
});

// 계층 구조로 변환
const hierarchicalMenuList = computed(() => {
  const list = filteredMenuList.value;
  const grouped = [];

  // 1단계: parentNo가 null인 최상위 메뉴 찾기
  const topLevel = list.filter(m => !m.parentNo);

  topLevel.forEach(parent => {
    const children = list.filter(m => m.parentNo === parent.menuNo);
    grouped.push({
      ...parent,
      children: children.length > 0 ? children : null
    });
  });

  return grouped;
});

// ==========================================
// 4. 메서드
// ==========================================

// 통계 업데이트
const updateStats = () => {
  stats.value.total = menuList.value.length;
  stats.value.masterOnly = menuList.value.filter(m => m.masterOnly === 'Y').length;
  stats.value.public = menuList.value.filter(m => m.masterOnly === 'N').length;
  stats.value.active = menuList.value.filter(m => m.useFl === 'Y').length;
};

// 권한 토글
const toggleMasterOnly = (menu) => {
  menu.masterOnly = menu.masterOnly === 'Y' ? 'N' : 'Y';
  updateMenuPermission(menu);
};

// 사용여부 토글
const toggleUseFl = (menu) => {
  menu.useFl = menu.useFl === 'Y' ? 'N' : 'Y';
  updateMenuPermission(menu);
};

// 편집 모달 열기
const openEditModal = (menu = null) => {
  if (menu) {
    menuForm.value = {
      menuNo: menu.menuNo,
      menuNm: menu.menuNm,
      menuKey: menu.menuKey,
      menuIcon: menu.menuIcon || 'mdi-circle',
      menuPath: menu.menuPath,
      useFl: menu.useFl,
      masterOnly: menu.masterOnly,
      sort: menu.sort || 0
    };
  } else {
    menuForm.value = {
      menuNo: null,
      menuNm: '',
      menuKey: '',
      menuIcon: 'mdi-circle',
      menuPath: '',
      useFl: 'Y',
      masterOnly: 'N',
      sort: 0
    };
  }
  showEditModal.value = true;
};

// 편집 모달 닫기
const closeEditModal = () => {
  showEditModal.value = false;
  menuForm.value = {
    menuNo: null,
    menuNm: '',
    menuKey: '',
    menuIcon: 'mdi-circle',
    menuPath: '',
    useFl: 'Y',
    masterOnly: 'Y',
    sort: 0
  };
};

// 인라인 편집 시작
const startInlineEdit = (menu) => {
  menu.isEditing = true;
  menu.tempSort = menu.sort;
};

// 인라인 편집 저장
const saveInlineEdit = async (menu) => {
  try {
    await axios.put(`/api/v1/menu/${menu.menuNo}`, {
      sort: menu.sort
    });
    menu.isEditing = false;
    getMenuList(); // 정렬 순서 반영을 위해 재로드
  } catch (err) {
    console.error('정렬 저장 실패:', err);
    menu.sort = menu.tempSort; // 원래 값으로 복원
    menu.isEditing = false;
  }
};

// 인라인 편집 취소
const cancelInlineEdit = (menu) => {
  menu.sort = menu.tempSort;
  menu.isEditing = false;
};

// 아이콘 선택 옵션
const iconOptions = [
  { value: 'mdi-view-dashboard', label: '대시보드' },
  { value: 'mdi-account-group', label: '직원' },
  { value: 'mdi-clock-outline', label: '근태' },
  { value: 'mdi-cash-multiple', label: '급여' },
  { value: 'mdi-map-marker', label: '현장' },
  { value: 'mdi-tools', label: '장비' },
  { value: 'mdi-package-variant', label: '물품' },
  { value: 'mdi-currency-krw', label: '정산' },
  { value: 'mdi-folder-open', label: '문서' },
  { value: 'mdi-bullhorn', label: '공지' },
  { value: 'mdi-cog', label: '설정' },
  { value: 'mdi-shield-account', label: '권한' },
];

// 새로고침
const refreshData = () => {
  getMenuList();
};

// ==========================================
// 5. 라이프사이클
// ==========================================
onMounted(() => {
  getMenuList();
});
</script>

<template>
  <div class="permission-page">
    <!-- 페이지 헤더 -->
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-shield-account"></i>
          시스템 권한 관리
        </h1>
        <p class="page-subtitle">메뉴별 접근 권한을 설정하여 최고관리자 전용 메뉴를 지정할 수 있습니다</p>
      </div>
      <div class="header-actions">
        <button @click="refreshData" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
        <!--button @click="openEditModal()" class="btn-add">
          <i class="mdi mdi-plus-circle"></i>
          <span>메뉴 추가</span>
        </button-->
      </div>
    </div>

    <!-- 통계 카드 -->
    <!--div class="stats-grid">
      <div class="stat-card" style="--card-color: #667eea;">
        <div class="stat-icon">
          <i class="mdi mdi-menu"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">전체 메뉴</span>
          <span class="stat-value">{{ stats.total }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #ef4444;">
        <div class="stat-icon">
          <i class="mdi mdi-shield-crown"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">관리자 전용</span>
          <span class="stat-value">{{ stats.masterOnly }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #10b981;">
        <div class="stat-icon">
          <i class="mdi mdi-earth"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">전체 공개</span>
          <span class="stat-value">{{ stats.public }}</span>
        </div>
      </div>

      <div class="stat-card" style="--card-color: #f59e0b;">
        <div class="stat-icon">
          <i class="mdi mdi-check-circle"></i>
        </div>
        <div class="stat-content">
          <span class="stat-label">활성 메뉴</span>
          <span class="stat-value">{{ stats.active }}</span>
        </div>
      </div>
    </div-->

    <!-- 메인 카드 -->
    <div class="filter-panel">
    <div class="main-card">
      <!-- 검색 영역 -->
      <div class="search-section">
        <div class="search-box">
          <i class="mdi mdi-magnify"></i>
          <input
              type="text"
              v-model="searchQuery"
              placeholder="메뉴명, 메뉴키, 경로 검색..."
              class="search-input"
          />
          <button v-if="searchQuery" @click="searchQuery = ''" class="search-clear">
            <i class="mdi mdi-close"></i>
          </button>
        </div>

        <div class="legend">
          <div class="legend-item">
            <span class="legend-icon master">
              <i class="mdi mdi-shield-crown"></i>
            </span>
            <span>최고관리자 전용</span>
          </div>
          <div class="legend-item">
            <span class="legend-icon public">
              <i class="mdi mdi-earth"></i>
            </span>
            <span>전체 공개</span>
          </div>
        </div>
      </div>
    </div>

      <div class="table-card">
        <!-- 메뉴 테이블 -->
        <div class="table-wrapper">
          <table class="menu-table">
            <thead>
            <tr>
              <th style="width: 60px;">
                <i class="mdi mdi-sort-numeric-variant"></i>
                순서
              </th>
              <th style="width: 80px;">
                <i class="mdi mdi-shape"></i>
                아이콘
              </th>
              <th style="width: 200px;">
                <i class="mdi mdi-format-title"></i>
                메뉴명
              </th>
              <th style="width: 120px;">
                <i class="mdi mdi-key"></i>
                메뉴 키
              </th>
              <th>
                <i class="mdi mdi-link"></i>
                경로
              </th>
              <th style="width: 100px;">
                <i class="mdi mdi-folder-multiple"></i>
                그룹 메뉴
              </th>
              <th style="width: 140px;">
                <i class="mdi mdi-shield"></i>
                접근 권한
              </th>
              <th style="width: 100px;">
                <i class="mdi mdi-toggle-switch"></i>
                사용 여부
              </th>
              <th style="width: 150px;">
                <i class="mdi mdi-cog"></i>
                관리
              </th>
            </tr>
            </thead>
            <tbody>
            <template v-for="parent in hierarchicalMenuList" :key="parent.menuNo">
              <!-- 부모 메뉴 -->
              <tr class="parent-row">
                <td class="text-center">
                  <template v-if="parent.isEditing">
                    <input
                        type="number"
                        v-model.number="parent.sort"
                        class="input-sort"
                        min="0"
                    />
                  </template>
                  <template v-else>
                    <span class="sort-number">{{ parent.sort }}</span>
                  </template>
                </td>

                <td class="text-center">
                  <div class="menu-icon-display">
                    <i :class="['mdi', parent.menuIcon || 'mdi-circle']"></i>
                  </div>
                </td>

                <td>
                  <div class="menu-name-cell">
                    <i class="mdi mdi-folder"></i>
                    <strong>{{ parent.menuNm }}</strong>
                  </div>
                </td>

                <td>
                  <code class="menu-key">{{ parent.menuKey }}</code>
                </td>

                <td>
                  <code class="menu-path">{{ parent.menuPath || '-' }}</code>
                </td>

                <td class="text-center">
                    <span :class="['badge-group', parent.groupFl === 'Y' ? 'active' : '']">
                      <i :class="['mdi', parent.groupFl === 'Y' ? 'mdi-check' : 'mdi-close']"></i>
                      {{ parent.groupFl === 'Y' ? '예' : '아니오' }}
                    </span>
                </td>

                <td class="text-center">
                  <button
                      @click="toggleMasterOnly(parent)"
                      :class="['toggle-permission', parent.masterOnly === 'Y' ? 'master' : 'public']"
                  >
                    <i :class="['mdi', parent.masterOnly === 'Y' ? 'mdi-shield-crown' : 'mdi-earth']"></i>
                    <span>{{ parent.masterOnly === 'Y' ? '관리자 전용' : '전체 공개' }}</span>
                  </button>
                </td>

                <td class="text-center">
                  <button
                      @click="toggleUseFl(parent)"
                      :class="['toggle-use', parent.useFl === 'Y' ? 'active' : 'inactive']"
                  >
                    <i :class="['mdi', parent.useFl === 'Y' ? 'mdi-check-circle' : 'mdi-close-circle']"></i>
                    <span>{{ parent.useFl === 'Y' ? '사용' : '사용안함' }}</span>
                  </button>
                </td>

                <td class="text-center">
                  <div class="action-buttons">
                    <template v-if="parent.isEditing">
                      <button @click="saveInlineEdit(parent)" class="btn-action btn-save-small" title="저장">
                        <i class="mdi mdi-check"></i>
                      </button>
                      <button @click="cancelInlineEdit(parent)" class="btn-action btn-cancel-small" title="취소">
                        <i class="mdi mdi-close"></i>
                      </button>
                    </template>
                    <template v-else>
                      <button @click="startInlineEdit(parent)" class="btn-action btn-sort" title="순서 변경">
                        <i class="mdi mdi-sort"></i>
                      </button>
                      <button @click="openEditModal(parent)" class="btn-action btn-edit" title="수정">
                        <i class="mdi mdi-pencil"></i>
                      </button>
                      <button @click="deleteMenu(parent.menuNo, parent.menuNm)" class="btn-action btn-delete" title="삭제">
                        <i class="mdi mdi-delete"></i>
                      </button>
                    </template>
                  </div>
                </td>
              </tr>

              <!-- 자식 메뉴 -->
              <template v-if="parent.children">
                <tr v-for="child in parent.children" :key="child.menuNo" class="child-row">
                  <td class="text-center">
                    <template v-if="child.isEditing">
                      <input
                          type="number"
                          v-model.number="child.sort"
                          class="input-sort"
                          min="0"
                      />
                    </template>
                    <template v-else>
                      <span class="sort-number">{{ child.sort }}</span>
                    </template>
                  </td>

                  <td class="text-center">
                    <div class="menu-icon-display child">
                      <i :class="['mdi', child.menuIcon || 'mdi-circle-small']"></i>
                    </div>
                  </td>

                  <td>
                    <div class="menu-name-cell child">
                      <i class="mdi mdi-subdirectory-arrow-right"></i>
                      {{ child.menuNm }}
                    </div>
                  </td>

                  <td>
                    <code class="menu-key">{{ child.menuKey }}</code>
                  </td>

                  <td>
                    <code class="menu-path">{{ child.menuPath || '-' }}</code>
                  </td>

                  <td class="text-center">
                      <span class="badge-group">
                        <i class="mdi mdi-close"></i>
                        아니오
                      </span>
                  </td>

                  <td class="text-center">
                    <button
                        @click="toggleMasterOnly(child)"
                        :class="['toggle-permission', child.masterOnly === 'Y' ? 'master' : 'public']"
                    >
                      <i :class="['mdi', child.masterOnly === 'Y' ? 'mdi-shield-crown' : 'mdi-earth']"></i>
                      <span>{{ child.masterOnly === 'Y' ? '관리자 전용' : '전체 공개' }}</span>
                    </button>
                  </td>

                  <td class="text-center">
                    <button
                        @click="toggleUseFl(child)"
                        :class="['toggle-use', child.useFl === 'Y' ? 'active' : 'inactive']"
                    >
                      <i :class="['mdi', child.useFl === 'Y' ? 'mdi-check-circle' : 'mdi-close-circle']"></i>
                      <span>{{ child.useFl === 'Y' ? '사용' : '사용안함' }}</span>
                    </button>
                  </td>

                  <td class="text-center">
                    <div class="action-buttons">
                      <template v-if="child.isEditing">
                        <button @click="saveInlineEdit(child)" class="btn-action btn-save-small" title="저장">
                          <i class="mdi mdi-check"></i>
                        </button>
                        <button @click="cancelInlineEdit(child)" class="btn-action btn-cancel-small" title="취소">
                          <i class="mdi mdi-close"></i>
                        </button>
                      </template>
                      <template v-else>
                        <button @click="startInlineEdit(child)" class="btn-action btn-sort" title="순서 변경">
                          <i class="mdi mdi-sort"></i>
                        </button>
                        <button @click="openEditModal(child)" class="btn-action btn-edit" title="수정">
                          <i class="mdi mdi-pencil"></i>
                        </button>
                        <button @click="deleteMenu(child.menuNo, child.menuNm)" class="btn-action btn-delete" title="삭제">
                          <i class="mdi mdi-delete"></i>
                        </button>
                      </template>
                    </div>
                  </td>
                </tr>
              </template>
            </template>

            <!-- 데이터 없음 -->
            <tr v-if="hierarchicalMenuList.length === 0">
              <td colspan="9">
                <div class="empty-state">
                  <i class="mdi mdi-menu-open"></i>
                  <p>등록된 메뉴가 없습니다</p>
                </div>
              </td>
            </tr>
            </tbody>
          </table>
        </div>
        </div>
      </div>

    <!-- 안내 박스 -->
    <div class="info-box">
      <i class="mdi mdi-information"></i>
      <div class="info-content">
        <strong>권한 설정 안내</strong>
        <ul>
          <li><strong>관리자 전용:</strong> 최고관리자만 접근 가능한 메뉴입니다. (정산관리, 급여관리 등)</li>
          <li><strong>전체 공개:</strong> 모든 사용자가 접근 가능한 메뉴입니다. (대시보드, 공지사항 등)</li>
          <li><strong>사용 여부:</strong> 메뉴 표시/숨김을 제어합니다. '중지' 설정 시 모든 사용자에게 숨겨집니다.</li>
          <li><strong>순서 변경:</strong> 정렬 아이콘을 클릭하여 메뉴 표시 순서를 변경할 수 있습니다.</li>
        </ul>
      </div>
    </div>

    <!-- 편집 모달 -->
    <div v-if="showEditModal" class="modal-overlay" @click.self="closeEditModal">
      <div class="modal">
        <div class="modal-header">
          <h3 class="modal-title">
            <i class="mdi mdi-menu-open"></i>
            {{ menuForm.menuNo ? '메뉴 수정' : '메뉴 추가' }}
          </h3>
          <button @click="closeEditModal" class="modal-close">
            <i class="mdi mdi-close"></i>
          </button>
        </div>

        <div class="modal-body">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-format-title"></i>
                메뉴명 <span class="required">*</span>
              </label>
              <input type="text" v-model="menuForm.menuNm" class="form-input" placeholder="직원관리" />
            </div>

            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-key"></i>
                메뉴 키 <span class="required">*</span>
              </label>
              <input type="text" v-model="menuForm.menuKey" class="form-input" placeholder="member" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-shape"></i>
                아이콘
              </label>
              <select v-model="menuForm.menuIcon" class="form-select">
                <option v-for="icon in iconOptions" :key="icon.value" :value="icon.value">
                  {{ icon.label }}
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-sort-numeric-variant"></i>
                정렬 순서
              </label>
              <input type="number" v-model.number="menuForm.sort" class="form-input" min="0" />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">
              <i class="mdi mdi-link"></i>
              경로
            </label>
            <input type="text" v-model="menuForm.menuPath" class="form-input" placeholder="/member" />
          </div>

          <div class="form-row">
            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-shield"></i>
                접근 권한
              </label>
              <select v-model="menuForm.masterOnly" class="form-select">
                <option value="Y">관리자 전용</option>
                <option value="N">전체 공개</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">
                <i class="mdi mdi-toggle-switch"></i>
                사용 여부
              </label>
              <select v-model="menuForm.useFl" class="form-select">
                <option value="Y">사용</option>
                <option value="N">중지</option>
              </select>
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="closeEditModal" class="btn-modal btn-cancel">
            취소
          </button>
          <button @click="saveMenu" class="btn-modal btn-primary">
            <i class="mdi mdi-content-save"></i>
            저장
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Material Design Icons */
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

/* === 기본 설정 === */
.permission-page {
  padding: 0;
}

/* === 페이지 헤더 === */
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 28px;
}

.header-left {
  flex: 1;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: #1e293b;
  margin: 0 0 8px 0;
  display: flex;
  align-items: center;
  gap: 12px;
}

.page-title i {
  font-size: 32px;
  color: #667eea;
}

.page-subtitle {
  font-size: 14px;
  color: #64748b;
  margin: 0;
  line-height: 1.6;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-refresh,
.btn-add {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-refresh {
  background: white;
  border: 1px solid #e2e8f0;
  color: #64748b;
}

.btn-refresh:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
}

.btn-add {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.btn-add:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(102, 126, 234, 0.4);
}

.btn-refresh i,
.btn-add i {
  font-size: 18px;
}

/* === 통계 카드 === */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 20px;
  margin-bottom: 28px;
}

.stat-card {
  background: white;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  display: flex;
  align-items: center;
  gap: 20px;
  transition: all 0.3s;
  position: relative;
  overflow: hidden;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: var(--card-color);
}

.stat-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
}

.stat-icon {
  width: 60px;
  height: 60px;
  border-radius: 14px;
  background: var(--card-color);
  opacity: 0.1;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
}

.stat-icon i {
  font-size: 28px;
  color: var(--card-color);
  position: absolute;
}

.stat-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-label {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
}

.stat-value {
  font-size: 32px;
  font-weight: 700;
  color: var(--card-color);
}

/* === 메인 카드 === */
.main-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  margin-bottom: 24px;
}

/* === 검색 섹션 === */
.search-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid #f1f5f9;
  gap: 20px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  flex: 1;
  max-width: 400px;
  transition: all 0.2s;
}

.search-box:focus-within {
  background: white;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.search-box i {
  font-size: 20px;
  color: #94a3b8;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #334155;
  outline: none;
}

.search-input::placeholder {
  color: #94a3b8;
}

.search-clear {
  background: none;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
}

.search-clear:hover {
  background: #e2e8f0;
  color: #64748b;
}

/* 범례 */
.legend {
  display: flex;
  gap: 20px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #64748b;
}

.legend-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
}

.legend-icon.master {
  background: #ef4444;
}

.legend-icon.public {
  background: #10b981;
}

.legend-icon i {
  font-size: 16px;
}

/* === 테이블 카드 === */
.table-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
  overflow: hidden;
  margin-bottom: 24px;
}

/* === 테이블 === */
.table-wrapper {
  overflow-x: auto;
}

.menu-table {
  width: 100%;
  border-collapse: collapse;
}

.menu-table thead {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.menu-table th {
  padding: 16px 20px;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: white;
  white-space: nowrap;
}

.menu-table th i {
  margin-right: 6px;
  opacity: 0.9;
}

.menu-table td {
  padding: 16px 20px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 14px;
  color: #334155;
  vertical-align: middle;
}

.parent-row {
  background: #fafafa;
}

.parent-row:hover {
  background: #f5f5f5;
}

.child-row {
  background: white;
}

.child-row:hover {
  background: #f8fafc;
}

.text-center {
  text-align: center;
}

/* 정렬 번호 */
.sort-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: #f1f5f9;
  border-radius: 8px;
  font-weight: 600;
  color: #64748b;
  font-size: 13px;
}

.input-sort {
  width: 60px;
  padding: 6px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 13px;
  text-align: center;
}

.input-sort:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

/* 아이콘 표시 */
.menu-icon-display {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  margin: 0 auto;
}

.menu-icon-display.child {
  background: linear-gradient(135deg, #94a3b8 0%, #64748b 100%);
  width: 32px;
  height: 32px;
}

.menu-icon-display i {
  font-size: 20px;
}

.menu-icon-display.child i {
  font-size: 16px;
}

/* 메뉴명 */
.menu-name-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  color: #1e293b;
}

.menu-name-cell i {
  font-size: 18px;
  color: #667eea;
}

.menu-name-cell.child {
  padding-left: 20px;
  font-weight: 500;
  color: #475569;
}

.menu-name-cell.child i {
  color: #94a3b8;
  font-size: 16px;
}

/* 코드 */
.menu-key,
.menu-path {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  background: #f1f5f9;
  color: #475569;
}

/* 배지 */
.badge-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  background: #f1f5f9;
  color: #94a3b8;
}

.badge-group.active {
  background: #dbeafe;
  color: #1e40af;
}

.badge-group i {
  font-size: 14px;
}

/* 토글 버튼 */
.toggle-permission,
.toggle-use {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.toggle-permission.master {
  background: #fef2f2;
  color: #dc2626;
  border: 1px solid #fecaca;
}

.toggle-permission.master:hover {
  background: #fee2e2;
  transform: translateY(-1px);
}

.toggle-permission.public {
  background: #f0fdf4;
  color: #16a34a;
  border: 1px solid #bbf7d0;
}

.toggle-permission.public:hover {
  background: #dcfce7;
  transform: translateY(-1px);
}

.toggle-use.active {
  background: #d1fae5;
  color: #065f46;
}

.toggle-use.inactive {
  background: #fee2e2;
  color: #991b1b;
}

.toggle-use:hover {
  transform: translateY(-1px);
}

.toggle-permission i,
.toggle-use i {
  font-size: 16px;
}

/* 액션 버튼 */
.action-buttons {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.btn-action {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.btn-action i {
  font-size: 16px;
}

.btn-sort {
  background: #f1f5f9;
  color: #64748b;
}

.btn-sort:hover {
  background: #e2e8f0;
  color: #475569;
}

.btn-edit {
  background: #eff6ff;
  color: #2563eb;
}

.btn-edit:hover {
  background: #dbeafe;
  transform: translateY(-1px);
}

.btn-delete {
  background: #fef2f2;
  color: #dc2626;
}

.btn-delete:hover {
  background: #fee2e2;
  transform: translateY(-1px);
}

.btn-save-small {
  background: #d1fae5;
  color: #065f46;
}

.btn-save-small:hover {
  background: #a7f3d0;
}

.btn-cancel-small {
  background: #fee2e2;
  color: #991b1b;
}

.btn-cancel-small:hover {
  background: #fecaca;
}

/* === 빈 상태 === */
.empty-state {
  text-align: center;
  padding: 60px 20px;
  color: #94a3b8;
}

.empty-state i {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.3;
}

.empty-state p {
  font-size: 14px;
  margin: 0;
}

/* === 안내 박스 === */
.info-box {
  display: flex;
  gap: 16px;
  padding: 20px 24px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
  color: #1e40af;
}

.info-box i {
  font-size: 24px;
  flex-shrink: 0;
  margin-top: 2px;
}

.info-content {
  flex: 1;
}

.info-content strong {
  display: block;
  font-size: 15px;
  margin-bottom: 10px;
}

.info-content ul {
  margin: 0;
  padding-left: 20px;
}

.info-content li {
  font-size: 13px;
  line-height: 1.8;
  margin-bottom: 6px;
}

.info-content li:last-child {
  margin-bottom: 0;
}

/* === 모달 === */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal {
  background: white;
  border-radius: 16px;
  width: 90%;
  max-width: 600px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.3s ease;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24px;
  border-bottom: 1px solid #f1f5f9;
}

.modal-title {
  font-size: 20px;
  font-weight: 600;
  color: #1e293b;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.modal-title i {
  font-size: 24px;
  color: #667eea;
}

.modal-close {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #f8fafc;
  border: none;
  color: #64748b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.modal-close:hover {
  background: #e2e8f0;
  color: #334155;
}

.modal-close i {
  font-size: 20px;
}

.modal-body {
  padding: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 8px;
}

.form-label i {
  font-size: 16px;
  color: #667eea;
}

.required {
  color: #ef4444;
}

.form-input,
.form-select {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 14px;
  color: #334155;
  transition: all 0.2s;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
}

.form-input::placeholder {
  color: #94a3b8;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid #f1f5f9;
}

.btn-modal {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-cancel {
  background: #f8fafc;
  color: #64748b;
}

.btn-cancel:hover {
  background: #e2e8f0;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* === 반응형 === */
@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    gap: 16px;
  }

  .header-actions {
    width: 100%;
  }

  .btn-refresh,
  .btn-add {
    flex: 1;
    justify-content: center;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .search-section {
    flex-direction: column;
    align-items: stretch;
  }

  .search-box {
    max-width: 100%;
  }

  .legend {
    justify-content: center;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .menu-table {
    font-size: 12px;
  }

  .menu-table th,
  .menu-table td {
    padding: 12px 10px;
  }

  .action-buttons {
    flex-direction: column;
  }
}
</style>
