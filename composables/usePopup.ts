import { ref } from 'vue';

// 클라이언트 사이드 전용 싱글톤 상태
const isVisible = ref(false);
const message = ref('');
const type = ref('info');
const promptValue = ref('');
let resolvePromise = null;

export const usePopup = () => {
    const show = (msg: string, t: string = 'info') => {
        message.value = msg;
        type.value = t;
        isVisible.value = true;

        return new Promise((resolve) => {
            resolvePromise = resolve;
        });
    };

    const showPrompt = (msg: string, defaultVal: string = '') => {
        message.value = msg;
        type.value = 'prompt';
        promptValue.value = defaultVal;
        isVisible.value = true;

        return new Promise((resolve) => {
            resolvePromise = resolve;
        });
    };

    const showConfirm = (msg: string) => {
        message.value = msg;
        type.value = 'confirm';
        isVisible.value = true;

        return new Promise((resolve) => {
            resolvePromise = resolve;
        });
    };

    const confirm = () => {
        isVisible.value = false;
        if (resolvePromise) {
            resolvePromise(type.value === 'prompt' ? promptValue.value : true);
            resolvePromise = null;
        }
    };

    const hide = () => {
        isVisible.value = false;
        if (resolvePromise) {
            if (type.value === 'confirm') resolvePromise(false);
            else resolvePromise(null); // prompt의 경우 null 반환
            resolvePromise = null;
        }
    };

    return {
        isVisible,
        message,
        type,
        promptValue,
        show,
        showPrompt,
        showConfirm,
        confirm,
        hide
    };
};
