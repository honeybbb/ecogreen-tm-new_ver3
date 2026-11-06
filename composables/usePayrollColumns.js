import { ref, computed } from 'vue';

/**
 * 급여 계산 테이블의 컬럼(고정/동적) 가시성 및 sticky 위치 계산
 *
 * @param {Object} opts
 * @param {Ref} opts.payItemsRef    - 지급항목 computed Ref (items 필터)
 * @param {Ref} opts.deductionItemsRef - 공제항목 computed Ref
 * @param {() => string} opts.getUserId - 로컬스토리지 키 식별에 쓸 사용자 ID 반환
 */
export function usePayrollColumns({ payItemsRef, deductionItemsRef, getUserId }) {
    const staticCols = ref([
        { id: 'siteName', name: '현장명', show: true, width: 110, sticky: true },
        { id: 'role',     name: '직책',   show: true, width: 70,  sticky: true },
        { id: 'id',       name: '사번',   show: true, width: 80,  sticky: true },
        { id: 'staff',    name: '성명',   show: true, width: 80,  sticky: true },
        { id: 'birthDt',  name: '생년월일', show: true, width: 100, sticky: true },
        { id: 'age',      name: '나이(만)', show: true, width: 70, sticky: true },
        { id: 'inDate',   name: '입사일', show: true, width: 110, sticky: true },
        { id: 'workDays', name: '근무/기준', show: true, width: 110, sticky: true },
        { id: 'gross',    name: '지급합계', show: true, width: 90, sticky: true },
        { id: 'ded',      name: '공제합계', show: true, width: 90, sticky: true },
        { id: 'net',      name: '실지급액', show: true, width: 90, sticky: true },
    ]);

    const hiddenDynamicCols = ref({});

    const visiblePayItems = computed(
        () => (payItemsRef.value || []).filter(i => !hiddenDynamicCols.value[i.itemCd])
    );

    const visibleDeductionItems = computed(
        () => (deductionItemsRef.value || []).filter(i => !hiddenDynamicCols.value[i.itemCd])
    );

    const findCol = (id) => staticCols.value.find(c => c.id === id);

    const getStickyStyle = (colId, extraStyle = {}) => {
        const baseOrder = [{ id: 'check', width: 40, show: true }, ...staticCols.value];
        let left = 0;
        for (const col of baseOrder) {
            if (col.id === colId) {
                if (!col.show) return { display: 'none' };
                return {
                    left: `${left}px`,
                    minWidth: `${col.width}px`,
                    maxWidth: `${col.width}px`,
                    width: `${col.width}px`,
                    ...extraStyle,
                };
            }
            if (col.show) left += col.width;
        }
        return {};
    };

    const getSummaryGroupStyle = () => {
        const baseOrder = [{ id: 'check', width: 40, show: true }, ...staticCols.value.slice(0, 8)];
        let left = 0;
        for (const col of baseOrder) if (col.show) left += col.width;
        const g = findCol('gross')?.show;
        const d = findCol('ded')?.show;
        const n = findCol('net')?.show;
        if (!g && !d && !n) return { display: 'none' };
        return { left: `${left}px` };
    };

    const getSummaryGroupColspan = () => {
        let count = 0;
        if (findCol('gross')?.show) count++;
        if (findCol('ded')?.show) count++;
        if (findCol('net')?.show) count++;
        return count;
    };

    const getFooterColspan = () => {
        let span = 1;
        for (let i = 0; i < 8; i++) if (staticCols.value[i].show) span++;
        return span;
    };

    const getFooterTotalWidth = () => {
        let width = 80;
        for (let i = 0; i < 8; i++) if (staticCols.value[i].show) width += staticCols.value[i].width;
        return width;
    };

    const storageKey = () => `payroll_cols_${getUserId?.() || 'default'}`;

    const loadColumnSettings = () => {
        if (typeof window === 'undefined') return;
        const saved = localStorage.getItem(storageKey());
        if (!saved) return;
        try {
            const settings = JSON.parse(saved);
            if (settings.staticCols) {
                settings.staticCols.forEach(sc => {
                    const col = findCol(sc.id);
                    if (col) col.show = sc.show;
                });
            }
            if (settings.hiddenDynamicCols) {
                hiddenDynamicCols.value = settings.hiddenDynamicCols;
            }
        } catch (e) {
            console.error('Failed to load column settings', e);
        }
    };

    const saveColumnSettings = () => {
        if (typeof window === 'undefined') return;
        try {
            localStorage.setItem(storageKey(), JSON.stringify({
                staticCols: staticCols.value.map(c => ({ id: c.id, show: c.show })),
                hiddenDynamicCols: hiddenDynamicCols.value,
            }));
        } catch (e) {
            console.error('Failed to save column settings', e);
        }
    };

    return {
        staticCols,
        hiddenDynamicCols,
        visiblePayItems,
        visibleDeductionItems,
        getStickyStyle,
        getSummaryGroupStyle,
        getSummaryGroupColspan,
        getFooterColspan,
        getFooterTotalWidth,
        loadColumnSettings,
        saveColumnSettings,
    };
}
