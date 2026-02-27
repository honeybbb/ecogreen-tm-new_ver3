<script setup>
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'nuxt/app';
import axios from "axios";
import {useAuthStore} from "~/stores/auth.js";

const router = useRouter();
const authStore = useAuthStore();
const cIdx = authStore.user?.cIdx;
// 1. 전체 공통 코드 데이터 (구조 평탄화: '01' 제거 -> groupCd를 Key로 사용)
const allCodeData = {
  '04001': {
    name: '지급 항목',
    codes: ref([]), // 지급 항목 리스트
  },
  '04002': {
    name: '공제 항목',
    codes: ref([]), // 공제 항목 리스트
  },
};

// 2. 선택 상태
// 기존 selectedSubGroupKey 대신 selectedGroupKey 하나로 통합 관리
const selectedGroupKey = ref('04001'); // 기본값: 지급(04001)

const newCodeName = ref('');
const newCodeNumber = ref('');
const newTaxFree = ref(0);

// 3. 옵션 목록 계산 (드롭다운 메뉴용)
// 기존 subGroupOptions 역할을 대체하여 04001, 04002를 반환
const groupOptions = computed(() => {
  return Object.keys(allCodeData).map(key => ({
    key: key,
    name: allCodeData[key].name,
  }));
});

// 4. 현재 표시할 코드 목록 계산
const currentCodeList = computed(() => {
  const group = allCodeData[selectedGroupKey.value];
  return group ? group.codes.value : [];
});

// 5. 코드 관리 함수 (현재 선택된 리스트 반환)
const getCurrentCodeGroupRef = () => {
  return allCodeData[selectedGroupKey.value].codes;
};

// [수정 모드]
const startEdit = (code) => {
  code.useFl = true;
};

const saveCode = (code) => {
  console.log(`수정(임시): ${JSON.stringify(code)}`);
  axios.post(`/api/v1/code/${code.itemCd}`, code);
  code.useFl = false;
};

// [행 삭제]
const deleteCode = (itemCd) => {
  if (!confirm('정말 삭제하시겠습니까?')) return;
  axios.delete(`/api/v1/code/${itemCd}`);
  const list = getCurrentCodeGroupRef();
  list.value = list.value.filter(c => c.id !== itemCd);
};

// 신규 추가
const addCode = async () => {
  if (!newCodeName.value || !newCodeNumber.value) {
    alert('코드 번호와 항목명을 입력해주세요.');
    return;
  }

  const list = getCurrentCodeGroupRef();

  list.value.push({
    //id: Date.now(),
    itemCd: newCodeNumber.value, // 변수명 itemCd로 통일
    itemNm: newCodeName.value,   // 변수명 itemNm으로 통일
    status: 'Y',
    useFl: false,
    tax_free: newTaxFree.value
  });

  let params = {
    groupCd: selectedGroupKey.value,
    itemCd: newCodeNumber.value,
    itemNm: newCodeName.value,
    sort: 0,
    useFl: 'Y',
    tax_free: newTaxFree.value
  }
  await axios.post(`/api/v1/code/${cIdx}`, params)
      .then(res => {
        console.log(res.data.data, 'addCode')
      })

  newCodeName.value = '';
  newCodeNumber.value = '';
  newTaxFree.value = 0;
};

const getConfigWage = () => {
  axios.get(`/api/v1/config/code/wage/${cIdx}`)
      .then(res => {
        const result = res.data.data || [];
        console.log(result, 'result dd')
        // 1. 초기화
        allCodeData['04001'].codes.value = [];
        allCodeData['04002'].codes.value = [];

        // 2. 데이터 분류
        result.forEach((item, index) => {
          const formattedItem = {
            id: index + 1,
            itemCd: item.itemCd,
            groupCd: item.groupCd,
            itemNm: item.itemNm,
            isEditing: 'N', // DB 컬럼명 확인(use_fl 등)
            useFl: item.useFl,
            deleteFl: item.deleteFl,
            editFl: item.editFl,
            tax_free: item.tax_free || 0
          };

          // groupCd에 따라 알맞은 배열에 Push
          if (item.groupCd === '04001') {
            allCodeData['04001'].codes.value.push(formattedItem);
          } else if (item.groupCd === '04002') {
            allCodeData['04002'].codes.value.push(formattedItem);
          }
        });
      })
      .catch(err => console.error('로드 실패:', err));
}

// =========================================================
// ★ 핵심 2: 전체 저장 (Delete All -> Insert All)
// =========================================================
const saveSubGroup = async () => {
  if (!confirm('현재 리스트로 전체 데이터를 저장(재설정)합니다. 진행하시겠습니까?')) return;

  // allCodeData에서 직접 데이터 참조
  const paymentList = allCodeData['04001'].codes.value;
  const deductionList = allCodeData['04002'].codes.value;

  try {
    // 04001 그룹 처리
    await processGroupUpdate('04001', paymentList);

    // 04002 그룹 처리
    await processGroupUpdate('04002', deductionList);

    alert('저장되었습니다.');
    getConfigWage(); // 데이터 갱신
  } catch (error) {
    console.error('저장 실패:', error);
    alert('저장 중 오류가 발생했습니다.');
  }
};

// 그룹별 삭제 후 저장 헬퍼 함수
const processGroupUpdate = async (groupCd, list) => {
  const cIdx = 1;
  // 1. 해당 그룹 데이터 삭제
  await axios.delete(`/api/v1/code/${groupCd}`);

  // 2. 데이터가 있으면 저장 (Loop)
  if (list && list.length > 0) {
    const savePromises = list.map((item, index) => {
      return axios.post(`/api/v1/code/${cIdx}`, {
        groupCd: groupCd,
        itemCd: item.itemCd,
        itemNm: item.itemNm,
        sort: index + 1,
        useFl: item.status
      });
    });
    await Promise.all(savePromises);
  }
};

onMounted(() => {
  getConfigWage();
});
</script>

<template>
  <div class="system-settings-page">
    <div class="page-header">
      <h2 class="page-title">기초 급여 정보</h2>
    </div>

    <div class="code-management-area">

      <div class="sort-panel">
        <div class="input-group">
          <label class="input-label">설정 구분</label>
          <select v-model="selectedGroupKey" class="input-select">
            <option v-for="opt in groupOptions" :key="opt.key" :value="opt.key">
              {{ opt.name }}
            </option>
          </select>
        </div>

        <div class="spacer"></div>

        <!--button @click="saveSubGroup" class="btn btn-save">전체 저장</button-->
      </div>

      <div class="table-container">
        <table class="data-table">
          <thead>
          <tr>
            <th style="width: 50px;">번호</th>
            <th style="width: 150px;">코드 번호</th>
            <th>항목명</th>
            <th style="width: 150px;">사용 설정</th>
            <th v-if="selectedGroupKey == '04001'" class="text-center" style="width: 80px;">비과세한도</th>
            <th class="text-center" style="width: 120px;">관리</th>
          </tr>
          </thead>
          <tbody>
          <tr v-for="(code, index) in currentCodeList" :key="code.id">
            <td>{{ index + 1 }}</td>
            <td>{{ code.itemCd }}</td>
            <td><input type="text" v-model="code.itemNm" class="input-text-small" /></td>
            <td>
              <select v-model="code.useFl" class="input-select-small">
                <option value="Y">사용</option>
                <option value="N">사용안함</option>
              </select>
            </td>
            <td v-if="selectedGroupKey == '04001'">
              <input type="number" v-model="code.tax_free" class="input-text-small" />
            </td>
            <td class="text-center">
              <button
                  @click="deleteCode(code.itemCd)"
                  class="btn btn-sm delete-btn"
                  :class="{'btn-danger': code.deleteFl == 'Y'}"
                  :disabled="code.deleteFl == 'N'"
              >
                삭제
              </button>
              <!--template v-if="code.isEditing">
                <button @click="saveCode(code)" class="btn btn-sm btn-primary save-btn">확인</button>
              </template>
              <template v-else>
                <button
                    @click="startEdit(code)"
                    class="btn btn-sm edit-btn"
                    :class="{'btn-info': code.editFl}"
                    :disabled="!code.editFl"
                >
                  수정
                </button>
                <button
                    @click="deleteCode(code.itemCd)"
                    class="btn btn-sm delete-btn"
                    :class="{'btn-danger': code.deleteFl}"
                    :disabled="!code.deleteFl"
                >
                  삭제
                </button>
              </template-->
            </td>
          </tr>

          <tr class="add-row">
            <td>*</td>
            <td>
              <input type="text" v-model="newCodeNumber" placeholder="코드 번호" class="input-text-small" />
            </td>
            <td>
              <input type="text" v-model="newCodeName" placeholder="항목명" class="input-text-small" />
            </td>
            <td>
              <span class="status-new-code">사용</span>
            </td>
            <td v-if="selectedGroupKey == '04001'">
              <input type="number" v-model="newTaxFree" placeholder="비과세" class="input-text-small" />
            </td>
            <td class="text-center">
              <button @click="addCode" class="btn btn-sm btn-success add-btn">추가</button>
            </td>
          </tr>
          <tr v-if="currentCodeList.length === 0">
            <td colspan="5" class="text-center-none">데이터가 없습니다.</td>
          </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
.search-panel { display: flex; align-items: center; gap: 15px; background-color: #f9fafb; padding: 15px 20px; border-radius: 8px 8px 0 0; border: 1px solid #e5e7eb; border-bottom: none; }
.input-group { display: flex; align-items: center; gap: 8px; }
.input-label { font-size: 0.9rem; font-weight: 500; color: #4b5563; white-space: nowrap; }
.input-select { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.9rem; min-width: 150px; }

 */
.input-select-small { padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.85rem; width: 100%; }
.input-text-small { padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 4px; font-size: 0.85rem; width: 100%; box-sizing: border-box; }

.btn { padding: 8px 15px; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; transition: background-color 0.2s; white-space: nowrap; }
.btn-save { background-color: #3b82f6; color: white; padding: 7px 15px; font-size: 0.9rem; }
.btn-save:hover { background-color: #2563eb; }
.btn-sm { padding: 4px 8px; font-size: 0.75rem; font-weight: 500; }
.btn-primary { background-color: #3b82f6; color: white; }
.btn-info { background-color: #60a5fa; color: white; }
.btn-success { background-color: #10b981; color: white; }
.btn-danger { background-color: #ef4444; color: white; margin-left: 5px; }


.table-container { background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { padding: 10px 15px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 0.9rem; vertical-align: middle; }
.data-table th { background-color: #f9fafb; color: #1f2937; font-weight: 600; text-transform: uppercase; font-size: 0.85rem; }
.text-center { text-align: center; }
.text-center-none { text-align: center; padding: 30px !important; color: #9ca3af; }
/*.add-row td { background-color: #f7f8fa; border-top: 1px solid #e5e7eb; }*/
.add-row td { background-color: #f0fdf4; border-top: 2px solid #e5e7eb; } /* 약간 초록빛 배경 */
.status-new-code { font-size: 0.85rem; color: #10b981; font-weight: 500; display: block; text-align: center; }
</style>
