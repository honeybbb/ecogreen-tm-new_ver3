// stores/tab.js
import { defineStore } from 'pinia';

const dynamicRouteMap = [
    { regex: /^\/site\/[^/]+$/, title: '현장 상세정보' },
    { regex: /^\/member\/[^/]+$/, title: '직원 상세정보' },
    // 필요에 따라 아래에 계속 추가하시면 됩니다.
    // { regex: /^\/payroll\/[^/]+$/, title: '급여 상세 내역' },
];

export const useTabStore = defineStore('tab', {
    state: () => ({
        tabs: [
            { title: 'Home', path: '/' } // 기본 탭
        ],
    }),
    actions: {
        // 1. 저장된 탭 불러오기 (새로고침 시 실행)
        initTabs() {
            if (process.client) { // Nuxt의 SSR 에러 방지를 위해 브라우저 환경인지 체크
                const savedTabs = sessionStorage.getItem('erp-tabs');
                if (savedTabs) {
                    this.tabs = JSON.parse(savedTabs);
                }
            }
        },
        // 2. 현재 탭 목록을 스토리지에 저장
        saveTabs() {
            if (process.client) {
                sessionStorage.setItem('erp-tabs', JSON.stringify(this.tabs));
            }
        },
        addTab(tab) {
            const exists = this.tabs.find(t => t.path === tab.path);
            if (!exists) {
                let finalTitle = tab.title;

                // 메뉴에서 넘어온 타이틀이 없거나 기본값('새 탭')일 경우 매핑 규칙 검사
                if (!finalTitle || finalTitle === '새 탭') {
                    const matchedRoute = dynamicRouteMap.find(route => route.regex.test(tab.path));
                    if (matchedRoute) {
                        finalTitle = matchedRoute.title;
                    } else {
                        finalTitle = '상세정보'; // 매핑 규칙에 없는 다른 동적 라우트의 기본 폴백
                    }
                }

                // 타이틀을 덮어씌워서 push
                this.tabs.push({ ...tab, title: finalTitle });
                this.saveTabs();
            }
        },
        removeTab(path) {
            if (path === '/') return;

            const index = this.tabs.findIndex(t => t.path === path);
            if (index !== -1) {
                this.tabs.splice(index, 1);
                this.saveTabs(); // 탭 닫을 때 저장
            }
        }
    }
});
