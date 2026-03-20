// plugins/axios.js
import axios from 'axios'

export default defineNuxtPlugin((nuxtApp) => {
    // 요청(Request) 인터셉터
    axios.interceptors.request.use((config) => {
        const token = useCookie('user_token').value;
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    })

    // 응답(Response) 인터셉터
    axios.interceptors.response.use(
        (response) => response,
        async (error) => {
            // 401 권한 없음 에러 발생 시
            if (error.response?.status === 401) {
                const token = useCookie('user_token');
                token.value = null; // 쿠키 초기화

                const { useAuthStore } = await import('~/stores/auth');
                const authStore = useAuthStore();
                authStore.logout();

                return navigateTo('/login');
            }
            return Promise.reject(error);
        }
    )
})
