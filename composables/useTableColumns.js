import { ref } from 'vue';
import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

export const useTableColumns = (tableId, defaultColumns) => {
    const authStore = useAuthStore();

    // 상태
    const columns = ref(JSON.parse(JSON.stringify(defaultColumns)));
    const isSettingModalOpen = ref(false);

    // 1. DB에서 내 설정 불러오기
    const fetchColumns = async () => {
        try {
            const cIdx = authStore.user?.cIdx;
            const mnIdx = authStore.user?.mnIdx || authStore.user?.idx;

            if (!cIdx || !mnIdx) return;

            const res = await axios.get(`/api/v1/auth/menu/setting`, {
                params: { cIdx, mnIdx, tableId }
            });

            if (res.data && res.data.data) {
                // 1) 백엔드 응답이 배열( [ { columsData: '...' } ] )일 경우 첫 번째 행을 추출
                let rowData = res.data.data;
                if (Array.isArray(rowData)) {
                    rowData = rowData[0];
                }

                if (rowData) {
                    // 2) DB 컬럼명 오타(columsData)와 정상명(columnsData) 모두 안전하게 추출
                    let jsonStr = rowData.columnsData || rowData.columsData;

                    // 만약 rowData 자체가 배열이 아닌 단순 문자열 형태라면
                    if (!jsonStr && typeof rowData === 'string') {
                        jsonStr = rowData;
                    }

                    if (jsonStr) {
                        // 3) JSON 문자열을 실제 자바스크립트 객체 배열로 변환
                        let savedCols = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;

                        // (방어코드) 이중으로 JSON.stringify 되어 저장되었을 경우 한 번 더 파싱
                        if (typeof savedCols === 'string') {
                            savedCols = JSON.parse(savedCols);
                        }

                        // 4) 최종 파싱된 결과가 배열 형태인지 확인 후 화면에 적용
                        if (Array.isArray(savedCols) && savedCols.length > 0) {
                            columns.value = savedCols;
                        }
                    }
                }
            }
        } catch (e) {
            console.error(`[${tableId}] 컬럼 설정 로드 실패 (기본값 사용):`, e);
        }
    };

    // 2. DB에 내 설정 저장하기
    const saveColumns = async (newColumns) => {
        try {
            const cIdx = authStore.user?.cIdx;
            const mnIdx = authStore.user?.mnIdx || authStore.user?.idx;

            if (!cIdx || !mnIdx) {
                alert("사용자 정보를 찾을 수 없어 설정을 저장할 수 없습니다.");
                return;
            }

            await axios.post(`/api/v1/auth/menu/setting`, {
                cIdx: cIdx,
                mnIdx: mnIdx,
                tableId: tableId,
                // 백엔드에서 columsData로 받고 있다면 이 부분도 맞춰주는 것이 안전할 수 있습니다.
                // 일단은 백엔드에서 어떻게 받는지에 따라 다를 수 있으니 jsonData 형태로 전송합니다.
                columnsData: JSON.stringify(newColumns)
            });

            // DB 저장 성공 시 상태 업데이트 및 모달 닫기
            columns.value = JSON.parse(JSON.stringify(newColumns));
            isSettingModalOpen.value = false;
        } catch (err) {
            console.error(`[${tableId}] 컬럼 설정 저장 실패:`, err);
            alert('설정을 저장하는 중 문제가 발생했습니다.');
        }
    };

    return {
        columns,
        isSettingModalOpen,
        fetchColumns,
        saveColumns
    };
};