import { ref, computed } from 'vue';

/**
 * 공통 리스트 테이블 상태 관리 composable
 * - 정렬 (sortKey, sortOrder, toggleSort)
 * - 페이지네이션 (currentPage, pageSize, pagedItems)
 * - 공통 유틸 (resetPage, handlePageChange)
 *
 * 각 페이지는 자체적으로 filter/sort를 적용한 computed(filteredItems)를
 * sourceRef로 전달한다. 본 composable은 정렬 state를 보유하지만 비교 함수는
 * 호출측에서 toggleSort가 바꾼 sortKey/sortOrder를 참조해 적용한다.
 */
export function useListTable(sourceRef, options = {}) {
    const {
        initialSortKey = '',
        initialSortOrder = 'asc',
        initialPageSize = 50,
        pageSizeOptions = [50, 100, 200, 500],
        scrollTargetSelector = '.table-card',
    } = options;

    const sortKey = ref(initialSortKey);
    const sortOrder = ref(initialSortOrder);
    const currentPage = ref(1);
    const pageSize = ref(initialPageSize);

    const toggleSort = (key) => {
        if (sortKey.value === key) {
            sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
        } else {
            sortKey.value = key;
            sortOrder.value = 'asc';
        }
        currentPage.value = 1;
    };

    const resetPage = () => {
        currentPage.value = 1;
    };

    const readSource = () => {
        if (typeof sourceRef === 'function') return sourceRef() || [];
        return sourceRef?.value || [];
    };

    const pagedItems = computed(() => {
        const items = readSource();
        const start = (currentPage.value - 1) * pageSize.value;
        return items.slice(start, start + pageSize.value);
    });

    const totalCount = computed(() => readSource().length);

    const handlePageChange = () => {
        if (typeof document === 'undefined') return;
        document.querySelector(scrollTargetSelector)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    return {
        sortKey,
        sortOrder,
        currentPage,
        pageSize,
        pageSizeOptions,
        toggleSort,
        resetPage,
        pagedItems,
        totalCount,
        handlePageChange,
    };
}
