// stores/tab.js
import { defineStore } from 'pinia';

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
                this.tabs.push(tab);
                this.saveTabs(); // 탭 추가 시 저장
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
