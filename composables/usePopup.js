import { ref } from 'vue';

// 클라이언트 사이드 전용 싱글톤 상태
const isVisible = ref(false);
const message = ref('');
const type = ref('info');
const variant = ref('info'); // confirm/prompt 시 색상(info/warning/error/success)
const promptValue = ref('');
let resolvePromise = null;

export const usePopup = () => {
    const show = (msg, t = 'info') => {
        message.value = msg;
        type.value = t;
        variant.value = 'info';
        isVisible.value = true;

        return new Promise((resolve) => {
            resolvePromise = resolve;
        });
    };

    const showPrompt = (msg, defaultVal = '') => {
        message.value = msg;
        type.value = 'prompt';
        variant.value = 'info';
        promptValue.value = defaultVal;
        isVisible.value = true;

        return new Promise((resolve) => {
            resolvePromise = resolve;
        });
    };

    const showConfirm = (msg, v = 'info') => {
        message.value = msg;
        type.value = 'confirm';
        variant.value = v;
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
        variant,
        promptValue,
        show,
        showPrompt,
        showConfirm,
        confirm,
        hide
    };
};
