// plugins/axios.js
import axios from 'axios'

export default defineNuxtPlugin((nuxtApp) => {
    // 1. 기본 baseURL 설정 (프록시 경로인 /api를 기본으로 함)
    axios.defaults.baseURL = '/api';

    // 요청(Request) 인터셉터
    axios.interceptors.request.use((config) => {
        const token = useCookie('user_token').value;
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    })

    // 응답(Response) 인터셉터 (기존과 동일)
    axios.interceptors.response.use(
        (response) => response,
        async (error) => {
            if (error.response?.status === 401) {
                const token = useCookie('user_token');
                token.value = null;
                const { useAuthStore } = await import('~/stores/auth');
                const authStore = useAuthStore();
                authStore.logout();
                return navigateTo('/login');
            }
            return Promise.reject(error);
        }
    )
})
