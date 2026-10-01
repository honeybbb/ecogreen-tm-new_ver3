import { usePopup } from '#imports';

export default defineNuxtPlugin((nuxtApp) => {
    if (process.client) {
        const { show, showPrompt, showConfirm } = usePopup();
        window.alert = (msg) => {
            show(msg, 'info'); // 기본 타입 지정
        };

        // 커스텀 alert 추가 (타입 지정 가능)
        window.customAlert = (msg, type = 'info') => {
            show(msg, type);
        };

        // 커스텀 프롬프트 추가 (Promise 반환)
        window.customPrompt = async (msg, defaultVal = '') => {
            return await showPrompt(msg, defaultVal);
        };

        // 커스텀 confirm 추가 (Promise 반환, variant로 색상 지정 가능: info/warning/error/success)
        window.customConfirm = async (msg, variant = 'info') => {
            return await showConfirm(msg, variant);
        };
    }
});
