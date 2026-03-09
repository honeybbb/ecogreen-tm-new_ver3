// composables/useApi.js
import axios from 'axios';
import { ref } from 'vue';

export const useApi = () => {
    const bankOptions = ref([]);
    const siteOptions = ref([]);
    const typeOptions = ref([]);
    const positionOptions = ref([]);
    const disabledOptions = ref([]);
    // const categoryOptions = ref([]);
    const wagesData  = ref([]);

    //은행 코드 가져오기
    const fetchBankOption = async (groupCd = '02001') => {
        try {
            axios.get(`/api/v1/code/group/${groupCd}`).then(res => {
                console.log(res.data.data, 'getBanks');
                bankOptions.value = res.data.data
            })
        } catch (e) {
            console.error("은행 목록 로드 실패:", e);
        }
    }

    // 현장 목록 가져오기
    const fetchSiteOptions = async (cIdx = 1) => {
        try {
            const res = await axios.get(`/api/v1/site/list/${cIdx}`);
            siteOptions.value = res.data.data || [];
        } catch (e) {
            console.error("현장 목록 로드 실패:", e);
        }
    };

    // 공통 코드 타입 목록 가져오기
    const fetchTypeOptions = async (groupCd = '01001') => {
        try {
            const res = await axios.get(`/api/v1/code/group/${groupCd}`);
            typeOptions.value = res.data.data || [];
        } catch (e) {
            console.error(`구분 목록(${groupCd}) 로드 실패:`, e);
        }
    };

    //공통 코드 직책 목록 가져오기
    const fetchPositionOptions = async (groupCd = '01002') => {
        try{
            const res = await axios.get(`/api/v1/code/group/${groupCd}`);
            positionOptions.value = res.data.data;
        }catch(e){
            console.error(`직책 목록(${groupCd}) 로드 실패:`, e);
        }
    }

    const fetchWageCode = async () => {
        try {
            // 실제 API 경로에 맞게 수정해주세요
            const res = await axios.get(`/api/v1/config/code/wage/${cIdx}`);
            wagesData.value = res.data.data || [];
        } catch (err) {
            console.error("급여 항목 로드 실패", err);
        }
    };

    const fetchDisabledOptions = async (groupCd = '02002') => {
        try {
            axios.get(`/api/v1/code/group/${groupCd}`).then(res => {
                disabledOptions.value = res.data.data
            })
        } catch (e) {
            console.error("장애등급 목록 로드 실패:", e);
        }
    }

    return {
        bankOptions,
        siteOptions,
        typeOptions,
        positionOptions,
        disabledOptions,
        wagesData,
        fetchBankOption,
        fetchSiteOptions,
        fetchTypeOptions,
        fetchPositionOptions,
        fetchDisabledOptions,
        fetchWageCode
    };
};
