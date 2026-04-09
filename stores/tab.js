// stores/tab.js
import { defineStore } from 'pinia';

export const useTabStore = defineStore('tab', {
    state: () => ({
        // 기본으로 열려있을 홈(대시보드) 탭
        tabs: [
            { title: 'Home', path: '/' }
        ],
    }),
    actions: {
        addTab(tab) {
            // 이미 열려있는 탭인지 확인
            const exists = this.tabs.find(t => t.path === tab.path);
            if (!exists) {
                this.tabs.push(tab);
            }
        },
        removeTab(path) {
            // Home 탭은 닫히지 않도록 방어 로직 (선택 사항)
            if (path === '/') return;

            const index = this.tabs.findIndex(t => t.path === path);
            if (index !== -1) {
                this.tabs.splice(index, 1);
            }
        }
    }
});
