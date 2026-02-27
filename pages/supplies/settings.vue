<script setup>
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import {useAuthStore} from "~/stores/auth.js";

// ==========================================
// 1. 상태 관리 (State)
// ==========================================
const allCodeData = ref({});      // 변환된 계층형 데이터가 저장될 곳
const selectedGroupKey = ref('');    // 1차 분류 (대분류) 선택값
const selectedSubGroupKey = ref(''); // 2차 분류 (중분류/서브그룹) 선택값
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;
// 입력 폼 상태
const newCodeName = ref('');
const newCodeNumber = ref('');
const newCodePrice = ref('');
// ==========================================
// 2. 데이터 변환 로직 (DB Flat Data -> Tree)
// ==========================================
const transformCodeData = (rows) => {
  const result = {};

  rows.forEach(row => {
    // DB 컬럼명 매핑 (실제 DB 컬럼명에 맞춰 조정 필요)
    const { groupCode, groupName, subCode, subName, detailCode, detailName, price } = row;
    // 1. 대분류 그룹 생성
    if (!result[groupCode]) {
      result[groupCode] = {
        name: groupName,
        description: `${groupName} 관리`,
        subGroups: [], // 서브그룹이 있는 경우 (예: 직원->구분->미화)
        codes: [],      // 서브그룹이 없는 경우 (예: 현장->아파트)
        price: price
      };
    }
    const currentGroup = result[groupCode];

    // 2. 데이터 구조에 따라 분류
    if (detailCode) {
      // [Case A] 3단 구조 (대분류 > 중분류 > 소분류)
      let subGroup = currentGroup.subGroups.find(sg => sg.id === subCode);
      if (!subGroup) {
        subGroup = { id: subCode, subName: subName, codes: [] };
        currentGroup.subGroups.push(subGroup);
      }
      subGroup.codes.push({
        id: detailCode, // 고유키
        itemCd: detailCode,
        name: detailName,
        status: '사용',
        useFl: false,
        price: price,
      });
    } else if (subCode) {
      // [Case B] 2단 구조 (대분류 > 코드)
      currentGroup.codes.push({
        id: subCode, // 고유키
        itemCd: subCode,
        name: subName,
        status: '사용',
        useFl: false,
        price: price,
      });
    }
  });

  return result;
};

// ==========================================
// 3. API 호출 (Mocking)
// ==========================================
const getCode = async () => {
  try {
    const res = await axios.get(`/api/v1/code/${cIdx}`);
    if(!res.data.data.length > 0) return console.error("코드를 가져오지 못 했습니다.");
    const result = res.data.data.filter(item => item.groupCode == '03' || item.groupCode == '05');
    console.log(result);

    // [중요] 데이터가 배열인지 확인 (안전장치)
    if (!Array.isArray(result)) {
      console.error("데이터가 배열 형식이 아닙니다:", result);
      return;
    }

    // 3. 변환 함수 실행 (이제 데이터가 확실히 존재함)
    allCodeData.value = transformCodeData(result);

    // 4. 초기 선택값 설정
    const firstKey = Object.keys(allCodeData.value)[0];
    console.log(allCodeData.value)
    if (firstKey) {
      selectedGroupKey.value = firstKey;
      handleMainGroupChange();
    }

  } catch (err) {
    console.error("데이터 로드 실패", err);
  }
};

onMounted(() => {
  getCode();
});

// ==========================================
// 4. Computed Properties (UI 연결용)
// ==========================================

// ① 대분류 드롭다운 옵션
const mainGroupOptions = computed(() => {
  return Object.keys(allCodeData.value).map(key => ({
    key: key,
    name: allCodeData.value[key].name,
    hasSub: allCodeData.value[key].subGroups.length > 0
  }));
});

// ② 중분류(코드그룹) 드롭다운 옵션
const subGroupOptions = computed(() => {
  const group = allCodeData.value[selectedGroupKey.value];
  if (group && group.subGroups.length > 0) {
    return group.subGroups.map(sub => ({
      key: sub.id,
      name: sub.subName
    }));
  }
  return [];
});

// ③ 실제 테이블에 뿌려줄 코드 목록
const currentCodeList = computed(() => {
  const group = allCodeData.value[selectedGroupKey.value];
  if (!group) return [];

  // 서브그룹이 존재하는 경우 (예: 직원코드) -> 서브그룹 선택값에 따라 표시
  if (group.subGroups.length > 0) {
    const sub = group.subGroups.find(s => s.id === selectedSubGroupKey.value);
    return sub ? sub.codes : [];
  }
  // 서브그룹이 없는 경우 (예: 현장코드) -> 바로 코드 목록 표시
  else {
    return group.codes;
  }
});

// ==========================================
// 5. 이벤트 핸들러
// ==========================================

// 대분류 변경 시 중분류 선택 초기화
const handleMainGroupChange = () => {
  const group = allCodeData.value[selectedGroupKey.value];
  if (group && group.subGroups.length > 0) {
    selectedSubGroupKey.value = group.subGroups[0].id;
  } else {
    selectedSubGroupKey.value = '';
  }
};

// 수정 모드 진입
const startEdit = (code) => {
  code.useFl = true;
};

// 수정 저장 (API 호출)
const saveCode = (code) => {
  console.log('Update Code:', code);
  // axios.put(...)
  alert('수정되었습니다.');
  code.useFl = false;
};

// 삭제 (API 호출)
const deleteCode = (itemCd) => {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  console.log(itemCd)
  axios.delete(`/api/v1/code/item/${itemCd}`);
  // 여기서는 프론트엔드 배열에서만 제거하는 시늉
  const group = allCodeData.value[selectedGroupKey.value];
  let targetList = group.codes; // 기본적으로 2단 구조라 가정

  // 3단 구조라면 서브그룹 안에서 찾음
  if (group.subGroups.length > 0) {
    const sub = group.subGroups.find(s => s.id === selectedSubGroupKey.value);
    if(sub) targetList = sub.codes;
  }

  const idx = targetList.findIndex(c => c.id === itemCd);
  if (idx > -1) targetList.splice(idx, 1);
};

// 신규 추가
const addCode = async () => {
  if (!newCodeName.value || !newCodeNumber.value) {
    alert('코드 번호와 항목명을 입력해주세요.');
    return;
  }

  // 현재 보고 있는 리스트 찾기
  const group = allCodeData.value[selectedGroupKey.value];
  let targetList = group.codes;
  if (group.subGroups.length > 0) {
    const sub = group.subGroups.find(s => s.id === selectedSubGroupKey.value);
    if(sub) targetList = sub.codes;
  }

  // 데이터 추가
  targetList.push({
    //id: newCodeNumber.value, // 임시 ID
    itemCd: newCodeNumber.value,
    name: newCodeName.value,
    status: '사용',
    useFl: false,
    price: newCodePrice.value
  });

  let params = {
    groupCd: selectedSubGroupKey.value,
    itemCd: newCodeNumber.value,
    itemNm: newCodeName.value,
    sort: 0,
    useFl: 'Y',
    price: newCodePrice.value
  }
  await axios.post(`/api/v1/code/item/${cIdx}`, params)
      .then(res => {
        console.log(res.data.data, 'addCode')
      })

  // 초기화
  newCodeName.value = '';
  newCodeNumber.value = '';
  newCodePrice.value = '';
};
</script>

<template>
  <div class="system-settings-page">
    <div class="page-header">
      <h2 class="page-title">품목 단가 관리</h2>
    </div>

    <div class="code-management-area">

      <div class="sort-panel">

        <div class="input-group">
          <label for="main-group-select" class="input-label">대분류</label>
          <select
              id="main-group-select"
              v-model="selectedGroupKey"
              @change="handleMainGroupChange"
              class="input-select"
          >
            <option v-for="group in mainGroupOptions" :key="group.key" :value="group.key">
              {{ group.name }}
            </option>
          </select>
        </div>

        <div class="input-group" v-if="subGroupOptions.length > 0">
          <label for="sub-group-select" class="input-label">상세그룹</label>
          <select
              id="sub-group-select"
              v-model="selectedSubGroupKey"
              class="input-select"
          >
            <option v-for="subGroup in subGroupOptions" :key="subGroup.key" :value="subGroup.key">
              {{ subGroup.name }}
            </option>
          </select>
        </div>

        <div class="spacer"></div>
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
          <tr>
            <th style="width: 50px;">No.</th>
            <th style="width: 150px;">코드 번호</th>
            <th>항목명</th>
            <th style="width: 120px;">사용 여부</th>
            <th style="width: 120px;">단가</th>
            <th class="text-center" style="width: 130px;">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(code, index) in currentCodeList" :key="code.id">
            <td>{{ index + 1 }}</td>

            <td>
              <template v-if="code.useFl">
                <input type="text" v-model="code.itemCd" class="input-text-small" />
              </template>
              <template v-else>{{ code.itemCd }}</template>
            </td>

            <td>
              <template v-if="code.useFl">
                <input type="text" v-model="code.name" class="input-text-small" />
              </template>
              <template v-else>{{ code.name }}</template>
            </td>

            <td>
              <template v-if="code.useFl">
                <select v-model="code.status" class="input-select-small">
                  <option value="사용">사용</option>
                  <option value="중지">중지</option>
                </select>
              </template>
              <template v-else>
                  <span :class="{'text-green': code.status === '사용', 'text-gray': code.status !== '사용'}">
                    {{ code.status }}
                  </span>
              </template>
            </td>

            <td>
              <template v-if="code.useFl">
                <input type="text" v-model="code.price" class="input-text-small" />
              </template>
              <template v-else>{{ code.price }}</template>
            </td>

            <td class="text-center">
              <template v-if="code.useFl">
                <button @click="saveCode(code)" class="btn btn-sm btn-primary">저장</button>
              </template>
              <template v-else>
                <button @click="startEdit(code)" class="btn btn-sm btn-info" style="margin-right:4px;">수정</button>
                <button @click="deleteCode(code.id)" class="btn btn-sm btn-danger">삭제</button>
              </template>
            </td>
          </tr>

          <tr v-if="currentCodeList.length === 0">
            <td colspan="5" class="text-center-none">등록된 코드가 없습니다.</td>
          </tr>

          <tr class="add-row">
            <td class="text-center fw-bold">+</td>
            <td>
              <input type="text" v-model="newCodeNumber" placeholder="코드번호 (예: 01001003)" class="input-text-small" />
            </td>
            <td>
              <input type="text" v-model="newCodeName" placeholder="항목명 입력" class="input-text-small" @keyup.enter="addCode"/>
            </td>
            <td><span class="status-new-code">사용</span></td>
            <td>
              <input type="text" v-model="newCodePrice" placeholder="항목 단가 입력" class="input-text-small" @keyup.enter="addCode"/>
            </td>
            <td class="text-center">
              <button @click="addCode" class="btn btn-sm btn-success add-btn">추가</button>
            </td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* === 조회 조건 및 버튼 패널 === */
.search-panel {
  display: flex;
  align-items: center;
  gap: 15px;
  background-color: #f9fafb;
  padding: 15px 20px;
  border-radius: 8px 8px 0 0;
  border: 1px solid #e5e7eb; border-bottom: none;
}
.input-group { display: flex; align-items: center; gap: 8px; }
.input-label { font-size: 0.9rem; font-weight: 500; color: #4b5563; white-space: nowrap; }
.input-select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.9rem; min-width: 150px; }
.input-select-small { padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.85rem; width: 100%; }
.input-text-small { padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.85rem; width: 100%; box-sizing: border-box; }

/* === 버튼 스타일 === */
.btn { padding: 6px 12px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; transition: background-color 0.2s; white-space: nowrap; }
.btn-save { background-color: #3b82f6; color: white; padding: 8px 20px; }
.btn-save:hover { background-color: #2563eb; }

/* 테이블 내부 버튼 */
.btn-sm { padding: 5px 10px; font-size: 0.8rem; }
.btn-primary { background-color: #3b82f6; color: white; }
.btn-info { background-color: #60a5fa; color: white; }
.btn-success { background-color: #10b981; color: white; }
.btn-danger { background-color: #ef4444; color: white; }

.btn-primary:hover { background-color: #2563eb; }
.btn-info:hover { background-color: #3b82f6; }
.btn-success:hover { background-color: #059669; }
.btn-danger:hover { background-color: #dc2626; }

/* === 데이터 테이블 스타일 === */
.table-container { background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { padding: 12px 15px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 0.9rem; vertical-align: middle; }
.data-table th { background-color: #f9fafb; color: #374151; font-weight: 600; font-size: 0.85rem; }
.data-table tbody tr:last-child { border-bottom: none; }
.text-center { text-align: center; }
.text-center-none { text-align: center; padding: 40px !important; color: #9ca3af; }

/* 추가 행 스타일 */
.add-row td { background-color: #f0fdf4; border-top: 2px solid #e5e7eb; } /* 약간 초록빛 배경 */
.status-new-code { font-size: 0.85rem; color: #10b981; font-weight: 600; display: block; text-align: center; }
.text-green { color: #10b981; font-weight: 600; }
.text-gray { color: #9ca3af; }
.fw-bold { font-weight: bold; }
</style>
