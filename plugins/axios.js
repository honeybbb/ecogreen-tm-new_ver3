// plugins/axios.js
import axios from 'axios'

export default defineNuxtPlugin((nuxtApp) => {
    // 요청(Request) 인터셉터
    axios.interceptors.request.use((config) => {
        // localStorage 대신 useCookie 사용
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

                // Pinia 상태 초기화를 위해 스토어 호출
                // 주의: 플러그인 내부에서는 런타임 에러 방지를 위해 이렇게 호출하는 것이 안전합니다.
                const { useAuthStore } = await import('~/stores/auth');
                const authStore = useAuthStore();
                authStore.logout();

                return navigateTo('/login');
            }
            return Promise.reject(error);
        }
    )
})
