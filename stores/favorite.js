// stores/favorite.js
// 관리자 탭 즐겨찾기 스토어 (DB 동기화)
import { defineStore } from 'pinia';
import axios from 'axios';

export const useFavoriteStore = defineStore('favorite', {
    state: () => ({
        favorites: [],   // [{ idx, path, title, sort }]
        loaded: false,
        loading: false,
    }),
    getters: {
        isFavorite: (state) => (path) => state.favorites.some(f => f.path === path),
    },
    actions: {
        // 관리자 로그인 시점에 한 번 호출한다.
        async loadFavorites() {
            if (this.loading) return;
            this.loading = true;
            try {
                const res = await axios.get('/api/v1/favorite/list');
                if (res.data?.result) {
                    this.favorites = res.data.data || [];
                    this.loaded = true;
                }
            } catch (e) {
                console.error('favorite load', e);
            } finally {
                this.loading = false;
            }
        },

        async addFavorite(tab) {
            if (!tab || !tab.path || tab.path === '/') return;
            if (this.isFavorite(tab.path)) return;

            const optimistic = {
                path: tab.path,
                title: tab.title || tab.path,
                sort: this.favorites.length + 1,
            };
            this.favorites.push(optimistic);

            try {
                await axios.post('/api/v1/favorite', {
                    path: optimistic.path,
                    title: optimistic.title,
                });
            } catch (e) {
                // 실패 시 낙관 업데이트 롤백
                this.favorites = this.favorites.filter(f => f.path !== optimistic.path);
                console.error('favorite add', e);
            }
        },

        async removeFavorite(path) {
            if (!path) return;
            const backup = [...this.favorites];
            this.favorites = this.favorites.filter(f => f.path !== path);
            try {
                await axios.delete('/api/v1/favorite', { data: { path } });
            } catch (e) {
                this.favorites = backup;
                console.error('favorite remove', e);
            }
        },

        async toggleFavorite(tab) {
            if (this.isFavorite(tab.path)) {
                await this.removeFavorite(tab.path);
            } else {
                await this.addFavorite(tab);
            }
        },

        clear() {
            this.favorites = [];
            this.loaded = false;
        },
    },
});
