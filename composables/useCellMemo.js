// composables/useCellMemo.js
import { ref } from 'vue';
import axios from 'axios';

export function useCellMemo(entity, labelMap = {}) {
    const panel = ref({ visible: false, x: 0, y: 0, row: null, colName: null, text: '', type: '02004002' });

    const parseMemo = (row) => {
        if (!row || !row.memo) return {};
        if (typeof row.memo === 'string') {
            try { return JSON.parse(row.memo); } catch { return {}; }
        }
        return row.memo;
    };
    const getMemo   = (row, colName) => parseMemo(row)[colName] || null;
    const hasMemo   = (row, colName) => !!getMemo(row, colName);
    const dotClass  = (row, colName) => {
        const m = getMemo(row, colName);
        if (!m) return '';
        return m.type === '02004001' ? 'memo-dot--important' : 'memo-dot--normal';
    };
    const label = (colName) => labelMap[colName] || colName;

    const openPanel = (e, row, colName, allowedCols) => {
        if (allowedCols && !allowedCols.includes(colName)) return;
        e.preventDefault();
        const existing = getMemo(row, colName);
        panel.value = {
            visible: true,
            x: Math.min(e.clientX, window.innerWidth - 280),
            y: Math.min(e.clientY, window.innerHeight - 260),
            row, colName,
            text: existing ? existing.content : '',
            type: existing ? existing.type : '02004002',
        };
    };
    const closePanel = () => { panel.value.visible = false; };

    const save = async () => {
        const { row, colName, text, type } = panel.value;
        const t = text.trim();
        if (!t) return;
        try {
            const res = await axios.post(`/api/v1/${entity}/memo/${row.idx}`, { colName, type, text: t });
            if (res.data.result) { row.memo = res.data.data; closePanel(); }
        } catch (e) {
            console.error('메모 저장 실패:', e);
            window.customAlert?.('메모 저장에 실패했습니다.', 'error');
        }
    };

    const remove = async () => {
        const { row, colName } = panel.value;
        console.log(colName, row)
        if (!await window.customConfirm('이 메모를 삭제하시겠습니까?')) return;
        try {
            const res = await axios.put(`/api/v1/${entity}/memo/${row.idx}`, { colName });
            if (res.data.result) { row.memo = res.data.data; closePanel(); }
        } catch (e) {
            console.error('메모 삭제 실패:', e);
            window.customAlert?.('메모 삭제에 실패했습니다.', 'error');
        }
    };

    return { panel, getMemo, hasMemo, dotClass, label, openPanel, closePanel, save, remove };
}