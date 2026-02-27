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
// const newCodeNumber = ref('');
const newCodeOption = ref('');

const newCodeNumber = computed(() => {
  const list = currentCodeList.value;

  // 1. 현재 리스트에 코드가 하나도 없는 경우 처리
  if (!list || list.length === 0) {
    // 상세그룹 키가 있다면 해당 키 뒤에 001을 붙이는 등의 기본값 설정 가능
    // 여기서는 단순히 '정보 없음' 혹은 기본 시작 번호를 반환
    return selectedSubGroupKey.value ? `${selectedSubGroupKey.value}001` : '';
  }

  // 2. 코드들 중 가장 큰 숫자 찾기
  // (문자열이지만 숫자로 변환하여 비교)
  const lastCode = list.reduce((max, code) => {
    const currentNum = parseInt(code.codeNumber, 10);
    return currentNum > max ? currentNum : max;
  }, 0);

  // 3. 마지막 번호에 +1
  const nextNum = lastCode + 1;

  // 4. 원래 코드의 길이에 맞춰 앞자리에 0 채우기 (padStart)
  // 예: 01001001 (8자리) -> 01001002
  const codeLength = list[0].codeNumber.length;
  return String(nextNum).padStart(codeLength, '0');
});

const transformCodeData = (rows) => {
  const result = {};

  rows.forEach(row => {
    // DB의 원본 컬럼들을 구조분해 할당
    const {
      groupCode, groupName,
      subCode, subName,
      detailCode, detailName,
      useFl, editFl, deleteFl,
      option
    } = row;

    if (!result[groupCode]) {
      result[groupCode] = {
        name: groupName,
        subGroups: [],
        codes: []
      };
    }
    const currentGroup = result[groupCode];

    // 공통 객체 생성 로직
    const createCodeObj = (id, name, dbUseFl) => ({
      id: id,
      codeNumber: id,
      name: name,
      // DB의 useFl이 'Y'이면 '사용', 아니면 '중지'로 매핑
      useFl: dbUseFl,
      // UI 제어용 상태값
      isEditing: false,      // 현재 행이 수정 모드인지 여부
      editFl: editFl,   // 수정 가능 여부 (DB 기반)
      deleteFl: deleteFl, // 삭제 가능 여부 (DB 기반)
      option: option,
    });

    if (detailCode) {
      // 3단 구조
      let subGroup = currentGroup.subGroups.find(sg => sg.id === subCode);
      if (!subGroup) {
        subGroup = { id: subCode, subName: subName, codes: [] };
        currentGroup.subGroups.push(subGroup);
      }
      subGroup.codes.push(createCodeObj(detailCode, detailName, useFl));
    } else if (subCode) {
      // 2단 구조
      currentGroup.codes.push(createCodeObj(subCode, subName, useFl));
    }
  });

  return result;
};

const getCode = async () => {
  try {
    const res = await axios.get(`/api/v1/code/${cIdx}`);
    if(!res.data.data.length > 0) return console.error("코드를 가져오지 못 했습니다.");
    const result = res.data.data.filter(item =>
        item.groupCode == '01' ||
        item.groupCode == '02'
    );

    allCodeData.value = transformCodeData(result);

    const firstKey = Object.keys(allCodeData.value)[0];
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
  console.log(code, 'dd')
  if (!code.editFl) {
    alert('수정 권한이 없는 항목입니다.');
    return;
  }
  code.isEditing = true;
};

// 수정 저장
const saveCode = async (code) => {
  console.log('Update Code:', code);
  // status를 다시 DB용 'Y'/'N'으로 변환하여 전송
  const params = {
    itemNm: code.name,
    useFl: code.useFl
  };
  // await axios.put(...) 호출 로직 추가 가능
  alert('수정되었습니다.');
  code.isEditing = false;
};

// 삭제 (API 호출)
const deleteCode = (itemCd) => {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  console.log(itemCd)
  axios.delete(`/api/v1/code/${itemCd}`);
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
  // name 검증 (number는 computed라 자동 생성됨)
  if (!newCodeName.value) {
    alert('항목명을 입력해주세요.');
    return;
  }

  const generatedNumber = newCodeNumber.value; // 계산된 번호 가져오기

  let params = {
    groupCd: selectedSubGroupKey.value,
    itemCd: generatedNumber, // 자동 생성된 번호 사용
    itemNm: newCodeName.value,
    option: newCodeOption.value,
    sort: 0,
    useFl: 'Y'
  };

  try {
    await axios.post(`/api/v1/code/${cIdx}`, params);

    // 추가 성공 후 데이터 다시 로드
    await getCode();

    // 항목명 및 옵션 초기화 (number는 computed이므로 초기화 불필요)
    newCodeName.value = '';
    newCodeOption.value = '';
  } catch (err) {
    console.error("추가 실패", err);
  }
};

</script>
<template>
  <div class="member-settings-page">
    <div class="page-header">
      <h2 class="page-title">통합 코드 관리</h2>
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
            <th v-if="selectedSubGroupKey == '02002'">옵션</th>
            <th style="width: 120px;">사용 여부</th>
            <th class="text-center" style="width: 130px;">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(code, index) in currentCodeList" :key="code.id">
            <td>{{ index + 1 }}</td>

            <td>{{ code.codeNumber }}</td>

            <td>
              <template v-if="code.isEditing">
                <input type="text" v-model="code.name" class="input-text-small" />
              </template>
              <template v-else>{{ code.name }}</template>
            </td>

            <td v-if="selectedSubGroupKey == '02002'">
              <div class="color-cell">
                <template v-if="code.isEditing">
                  <div class="color-input-wrapper">
                    <input type="color" v-model="code.option" class="input-color-custom" />
                    <input type="hidden" v-model="code.option" class="input-text-extra-small" placeholder="#000000" />
                  </div>
                </template>

                <template v-else>
                  <div class="color-preview">
                    <span class="color-box" :style="{ backgroundColor: code.option || '#cccccc' }"></span>
                    <!--span class="color-code">{{ code.option || '색상없음' }}</span-->
                  </div>
                </template>
              </div>
            </td>
            <td>
              <template v-if="code.isEditing">
                <select v-model="code.useFl" class="input-select-small">
                  <option value="Y">사용</option>
                  <option value="N">사용안함</option>
                </select>
              </template>
              <template v-else>
                  <span :class="{'text-green': code.useFl == 'Y', 'text-gray': code.useFl !== '사용'}">
                    {{ code.useFl == 'Y' ? '사용':'사용안함' }}
                  </span>
              </template>
            </td>

            <td class="text-center">
              <template v-if="code.isEditing">
                <button @click="saveCode(code)" class="btn btn-sm btn-primary">저장</button>
              </template>
              <template v-else>
                <button
                    @click="startEdit(code)"
                    class="btn btn-sm btn-info"
                    style="margin-right:4px;"
                    :disabled="!code.editFl"
                >
                  수정
                </button>
                <button
                    @click="deleteCode(code.id)"
                    class="btn btn-sm"
                    :class="{'btn-danger': code.deleteFl}"
                    :disabled="!code.deleteFl"
                >
                  삭제
                </button>
              </template>
            </td>
          </tr>

          <tr v-if="currentCodeList.length === 0">
            <td colspan="5" class="text-center-none">등록된 코드가 없습니다.</td>
          </tr>

          <tr class="add-row">
            <td class="text-center fw-bold">+</td>
            <td>
              <input type="text" v-model="newCodeNumber" disabled placeholder="코드번호 (예: 01001003)" class="input-text-small" />
            </td>
            <td>
              <input type="text" v-model="newCodeName" placeholder="항목명 입력" class="input-text-small" @keyup.enter="addCode"/>
            </td>
            <td v-if="selectedSubGroupKey == '02002'">
              <div class="color-input-wrapper">
                <input type="color" v-model="newCodeOption" class="input-color-custom" />
                <input type="hidden" v-model="newCodeOption" class="input-text-extra-small" placeholder="#000000" />
              </div>
            </td>
            <td><span class="status-new-code">사용</span></td>
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
/* === 데이터 테이블 스타일 === */
/*.table-container { background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; overflow-x: auto; }*/
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
/* 컬러 미리보기 박스 */
.color-preview {
  display: flex;
  align-items: center;
  gap: 8px;
}
.color-box {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid #ddd;
  display: inline-block;
}
.color-code {
  font-family: monospace;
  font-size: 0.8rem;
  color: #666;
}

/* 컬러 입력란 세트 */
.color-input-wrapper {
  display: flex;
  align-items: center;
  gap: 5px;
}

/* 실제 컬러 피커 버튼 스타일 커스텀 */
.input-color-custom {
  width: 30px;
  height: 30px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 4px;
}
.input-color-custom::-webkit-color-swatch-wrapper {
  padding: 0;
}
.input-color-custom::-webkit-color-swatch {
  border: 1px solid #ddd;
  border-radius: 4px;
}

/* Hex 텍스트 입력란 */
.input-text-extra-small {
  width: 80px;
  padding: 4px 6px;
  font-size: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  text-transform: uppercase;
}
</style>
