<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { useAuthStore } from "~/stores/auth.js";

const authStore = useAuthStore();
const companyNo = authStore.user?.cIdx;

const rawMenus = ref([]);
const isLoading = ref(false);

const structuredMenus = computed(() => {
  const parents = rawMenus.value.filter(m => !m.parentNo || m.parentNo === 0);
  return parents.map(p => ({
    ...p,
    isEditing: false,
    children: rawMenus.value.filter(c => c.parentNo === p.menuNo).sort((a, b) => a.sort - b.sort)
  })).sort((a, b) => a.sort - b.sort);
});

// 데이터 로드
const fetchMenus = async () => {
  isLoading.value = true;
  try {
    let params = {
      isMaster: authStore.user?.isMaster
    }
    const res = await axios.get(`/api/v1/menu/${companyNo}`, {params});
    if (res.data.result) {
      rawMenus.value = res.data.data;
    }
  } catch (err) {
    console.error("메뉴 로드 실패", err);
  } finally {
    isLoading.value = false;
  }
};

// 사용 여부 토글
const toggleUse = async (menu) => {
  const nextStatus = menu.useFl === 'Y' ? 'N' : 'Y';
  try {
    await axios.put(`/api/v1/system/menu/status/${menu.menuNo}`, { useFl: nextStatus });
    menu.useFl = nextStatus;
  } catch (err) {
    alert("상태 변경에 실패했습니다.");
  }
};

// 메뉴 정보 저장 (이름, 순서 등)
const saveChanges = async (menu) => {
  try {
    await axios.put(`/api/v1/menu/update/${menu.menuNo}`, {
      menuNm: menu.menuNm,
      sort: menu.sort
    });
    menu.isEditing = false;
    alert("설정이 저장되었습니다.");
    await fetchMenus();
  } catch (err) {
    alert("저장 중 오류가 발생했습니다.");
  }
};

onMounted(() => {
  fetchMenus();
});
</script>

<template>
  <div class="menu-settings-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-menu-open"></i>
          시스템 메뉴 설정
        </h1>
        <p class="page-subtitle">ERP 좌측 메뉴의 구성, 노출 여부 및 출력 순서를 관리합니다</p>
      </div>
      <div class="header-actions">
        <button @click="fetchMenus" class="btn-refresh">
          <i class="mdi mdi-refresh"></i>
          <span>새로고침</span>
        </button>
      </div>
    </div>

    <div class="table-card">
      <div class="table-scroll-container">
        <table class="data-table">
          <thead>
          <tr>
            <th style="width: 80px;"><div class="th-content"><i class="mdi mdi-sort-variant"></i><span>순서</span></div></th>
            <th style="width: 100px;"><div class="th-content"><i class="mdi mdi-emoticon-outline"></i><span>아이콘</span></div></th>
            <th><div class="th-content"><i class="mdi mdi-tag-outline"></i><span>메뉴명 (식별키)</span></div></th>
            <th><div class="th-content"><i class="mdi mdi-link-variant"></i><span>연결 경로</span></div></th>
            <th style="width: 140px;"><div class="th-content"><i class="mdi mdi-lock-outline"></i><span>접근 권한</span></div></th>
            <th style="width: 150px;">
              <div class="th-content">
                <i class="mdi mdi-toggle-switch-outline"></i>
                <span>노출 여부</span>
              </div>
            </th>
            <th class="text-center sticky-col" style="width: 160px;"><div class="th-content"><span>관리</span></div></th>
          </tr>
          </thead>

          <tbody v-for="parent in structuredMenus" :key="parent.menuNo">
          <tr class="row-parent">
            <td class="text-center">
              <input v-if="parent.isEditing" type="number" v-model="parent.sort" class="input-sort">
              <span v-else class="sort-badge">{{ parent.sort }}</span>
            </td>
            <td class="text-center">
              <div class="icon-box"><i :class="['mdi', parent.menuIcon]"></i></div>
            </td>
            <td>
              <div class="menu-name-wrap">
                <input v-if="parent.isEditing" type="text" v-model="parent.menuNm" class="input-edit">
                <span v-else class="parent-name">{{ parent.menuNm }}</span>
                <span class="menu-key-tag">{{ parent.menuKey }}</span>
              </div>
            </td>
            <td class="text-gray">{{ parent.menuPath }}</td>
            <td>
                <span :class="['auth-badge', parent.masterOnly === 'Y' ? 'master' : 'all']">
                  <i :class="['mdi', parent.masterOnly === 'Y' ? 'mdi-shield-lock' : 'mdi-account-group']"></i>
                  {{ parent.masterOnly === 'Y' ? '마스터 전용' : '전체 허용' }}
                </span>
            </td>
            <td>
              <div @click="toggleUse(parent)" :class="['toggle-switch', parent.useFl === 'Y' ? 'active' : '']">
                <div class="switch-handle"></div>
                <span class="switch-label">{{ parent.useFl === 'Y' ? 'ON' : 'OFF' }}</span>
              </div>
            </td>
            <td class="text-center sticky-col">
              <div class="action-buttons">
                <button v-if="!parent.isEditing" @click="parent.isEditing = true" class="btn-edit-sm">수정</button>
                <button v-else @click="saveChanges(parent)" class="btn-save-sm">저장</button>
              </div>
            </td>
          </tr>

          <tr v-for="child in parent.children" :key="child.menuNo" class="row-child">
            <td class="text-center">
              <input v-if="child.isEditing" type="number" v-model="child.sort" class="input-sort">
              <span v-else class="sort-dot">{{ child.sort }}</span>
            </td>
            <td class="text-center">
              <div class="child-connector"></div>
            </td>
            <td class="pl-8">
              <div class="menu-name-wrap">
                <i class="mdi mdi-subdirectory-arrow-right connector-icon"></i>
                <input v-if="child.isEditing" type="text" v-model="child.menuNm" class="input-edit-sm">
                <span v-else class="child-name">{{ child.menuNm }}</span>
              </div>
            </td>
            <td class="text-gray-sm">{{ child.menuPath }}</td>
            <td class="text-center">
              <!--span class="text-xs text-slate-400">{{ child.masterOnly === 'Y' ? '마스터' : '일반' }}</span-->
            </td>
            <td>
              <div @click="toggleUse(child)" :class="['toggle-switch sm', child.useFl === 'Y' ? 'active' : '']">
                <div class="switch-handle sm"></div>
              </div>
            </td>
            <td class="text-center sticky-col">
              <button v-if="!child.isEditing" @click="child.isEditing = true"
                      class="btn-edit">편집</button>
              <button v-else @click="saveChanges(child)"
                      class="btn-save">완료</button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="info-box">
      <i class="mdi mdi-information-outline"></i>
      <div class="info-content">
        <strong>메뉴 설정 안내</strong>
        <ul>
          <li><strong>순서:</strong> 숫자가 낮을수록 메뉴 바 상단에 먼저 노출됩니다.</li>
          <li><strong>노출 여부:</strong> 'OFF' 처리된 메뉴는 해당 회사 전체 사용자에게 보이지 않습니다.</li>
          <li><strong>마스터 전용:</strong> '마스터 전용' 메뉴는 일반 직원에게는 권한이 있더라도 노출되지 않습니다.</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css');

.menu-settings-page { padding: 0; }

/* 헤더 */
.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
.page-title { font-size: 28px; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 12px; }
.page-title i { color: #667eea; font-size: 32px; }
.page-subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }

.btn-refresh { display: flex; align-items: center; gap: 8px; padding: 10px 18px; background: white; border: 1px solid #e2e8f0; border-radius: 10px; font-weight: 600; color: #64748b; cursor: pointer; transition: 0.2s; }
.btn-refresh:hover { background: #f8fafc; border-color: #cbd5e1; }

/* 통계 그리드 */
.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 28px; }
.stat-card { background: white; border-radius: 16px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 16px; position: relative; overflow: hidden; }
.stat-card::before { content: ''; position: absolute; left: 0; top: 0; width: 4px; height: 100%; background: var(--card-color); }
.stat-icon { width: 48px; height: 48px; border-radius: 12px; background: var(--card-color); opacity: 0.1; display: flex; align-items: center; justify-content: center; position: relative; }
.stat-icon i { font-size: 24px; color: var(--card-color); position: absolute; }
.stat-label { font-size: 12px; color: #64748b; font-weight: 600; }
.stat-value { font-size: 24px; font-weight: 700; color: #1e293b; }

/* 테이블 카드 */
.table-card { background: white; border-radius: 16px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden; }
.table-header { padding: 18px 24px; border-bottom: 1px solid #f1f5f9; background: #fafbfc; }
.table-title { display: flex; align-items: center; gap: 10px; font-weight: 700; color: #1e293b; }
.table-title i { color: #667eea; font-size: 20px; }

.table-scroll-container { overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; min-width: 1000px; }
.data-table thead { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
.data-table th { padding: 14px 20px; color: white; text-align: left; font-size: 12px; font-weight: 600; text-transform: uppercase; }
.th-content { display: flex; align-items: center; gap: 6px; }

/* 부모 & 자식 행 */
.row-parent { background: #fff; border-bottom: 1px solid #f1f5f9; }
.row-parent td { padding: 16px 20px; }
.row-child { background: #fafbfc; border-bottom: 1px solid #f1f5f9; }
.row-child td { padding: 10px 20px; font-size: 13px; }

/* 순서 표시 */
.sort-badge { display: inline-flex; width: 30px; height: 30px; background: #667eea; color: white; border-radius: 8px; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; }
.sort-dot { display: inline-flex; width: 22px; height: 22px; background: #e2e8f0; color: #64748b; border-radius: 6px; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; }
.input-sort { width: 50px; padding: 5px; border: 1px solid #667eea; border-radius: 6px; text-align: center; outline: none; }

/* 메뉴명 & 아이콘 */
.menu-name-wrap { display: flex; align-items: center; gap: 10px; }
.parent-name { font-weight: 700; color: #1e293b; font-size: 15px; }
.child-name { color: #475569; font-weight: 500; }
.menu-key-tag { font-family: 'monospace'; font-size: 10px; background: #f1f5f9; color: #94a3b8; padding: 2px 6px; border-radius: 4px; }
.icon-box { font-size: 22px; color: #64748b; }
.connector-icon { color: #cbd5e1; font-size: 18px; }

/* 토글 스위치 */
.toggle-switch { width: 68px; background: #cbd5e1; border-radius: 15px; position: relative; cursor: pointer; transition: 0.3s; padding: 4px; }
.toggle-switch.active { background: #10b981; }
.switch-handle { width: 22px; height: 22px; background: #fff; border-radius: 50%; transition: 0.3s; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.toggle-switch.active .switch-handle { transform: translateX(38px); }
.switch-label { position: absolute; right: 10px; top: 6px; font-size: 10px; font-weight: 900; color: #fff; }
.toggle-switch.active .switch-label { left: 10px; right: auto; }

.toggle-switch.sm { width: 42px; height: 22px; }
.switch-handle.sm { width: 14px; height: 14px; }
.toggle-switch.sm.active .switch-handle { transform: translateX(20px); }

/* 권한 배지 */
.auth-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; }
.auth-badge.master { background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; }
.auth-badge.all { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

/* 관리 버튼 */
.btn-edit-sm { padding: 6px 12px; background: white; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; font-weight: 600; color: #64748b; cursor: pointer; }
.btn-save-sm { padding: 6px 12px; background: #667eea; color: white; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; }
.input-edit, .input-edit-sm { padding: 6px 10px; border: 1px solid #667eea; border-radius: 6px; font-size: 13px; width: 150px; }

/* 고정 컬럼 */
.sticky-col { position: sticky; right: 0; background: inherit; box-shadow: -4px 0 8px rgba(0,0,0,0.05); }

/* 정보 박스 */
.info-box { display: flex; gap: 16px; padding: 20px; background: #f0f7ff; border: 1px solid #dbeafe; border-radius: 16px; margin-top: 24px; color: #1e40af; }
.info-box i { font-size: 24px; }
.info-content strong { display: block; font-size: 15px; margin-bottom: 8px; }
.info-content ul { padding-left: 20px; margin: 0; }
.info-content li { font-size: 13px; line-height: 1.8; }

.text-gray { color: #94a3b8; font-size: 12px; }
.text-gray-sm { color: #cbd5e1; font-size: 11px; }
</style>
