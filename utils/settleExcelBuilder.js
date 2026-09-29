// ──────────────────────────────────────────────────────────────
// 정산서 엑셀 빌더 (고정 양식)
//   1번 양식 : 공문형   (로고 → 문서번호/시행일자/수신/참조/제목 → 본문 → 청구표 → 대표이사 직인)
//   2번 양식 : 청구서형 (원형 로고 + 청구서 제목 → 청구표 → 날짜/계좌/로고/직인/주소)
//   두 양식 모두 2페이지는 "보험 정산내역서"
//
// DB 템플릿({{치환}}) 방식이 아니라 셀/병합/테두리/이미지를 코드로 직접 그립니다.
// 모달은 collect 한 "순수 데이터"만 넘기고, 레이아웃은 전부 여기서 책임집니다.
// ──────────────────────────────────────────────────────────────
import ExcelJS from 'exceljs';
import JSZip from 'jszip'; // exceljs 의존성으로 이미 설치돼 있음 (package.json에 명시 권장)

export const SETTLE_FORM = { OFFICIAL: 1, INVOICE: 2 };

// 화면 선택용 옵션
export const SETTLE_FORM_OPTIONS = [
    { value: SETTLE_FORM.OFFICIAL, label: '1번 양식', desc: '청구공문 + 정산내역서 + 급여대장 (안산고잔형)' },
    { value: SETTLE_FORM.INVOICE,  label: '2번 양식', desc: '청구서 + 보험 정산내역서 (가락극동형)' },
];

// 양식별 회사 정보 (양식 고정이므로 상수)
const COMPANY = {
    [SETTLE_FORM.OFFICIAL]: {
        name: '주식회사 에코그린티엠',
        headerLine: '서울시   강서구 공항대로 325 에이스빌딩 7층 TEL. 02)355-3322   FAX. 02)355-3318',
    },
    [SETTLE_FORM.INVOICE]: {
        name: '주식회사 이지종합관리',
        address: '경기도 파주시 돌단풍길 59 상가1층',
        tel: '031-906-2002',
        fax: '031-906-2211',
    },
};

// 양식 이미지 : assets/images/settle/ 폴더
//   Nuxt 의 assets/ 폴더는 '/assets/...' 주소로 서빙되지 않습니다(404).
//   import 해야 Vite 가 빌드에 포함시키고 실제 접근 가능한 URL(해시 포함)을 돌려줍니다.
//   ※ public/ 폴더에 두는 경우라면 import 대신 '/images/settle/xxx.png' 문자열 경로를 쓰면 됩니다.
import circleLogoUrl   from '~/assets/images/settle/logo_circle.png';
import egLogoUrl       from '~/assets/images/settle/logo_eg.png';
import stampUrl        from '~/assets/images/settle/stamp.png';
import ecoLogoUrl      from '~/assets/images/settle/eco_logo.png';
import ecoLogoSmallUrl from '~/assets/images/settle/eco_logo_small.png';
import ecoLogoMiniUrl  from '~/assets/images/settle/eco_logo_mini.png';
import ecoStampUrl     from '~/assets/images/settle/eco_stamp.png';
import egTotalLogoUrl  from '~/assets/images/settle/logo_egtotal.png'; // 연차·퇴직금 정산서 상단 로고

const IMAGE_PATHS = {
    // 2번 양식 (이지종합관리)
    circleLogo:   circleLogoUrl,   // 좌상단 원형 로고
    egLogo:       egLogoUrl,       // 하단 가로 로고
    stamp:        stampUrl,        // 직인
    // 1번 양식 (에코그린티엠)
    ecoLogo:      ecoLogoUrl,      // 청구공문 상단 로고
    ecoLogoSmall: ecoLogoSmallUrl, // 정산내역서 좌상단 로고
    ecoLogoMini:  ecoLogoMiniUrl,  // 급여대장 하단 로고
    ecoStamp:     ecoStampUrl,     // 직인
    // 연차·퇴직금 정산서 (이지종합관리)
    egTotalLogo:  egTotalLogoUrl,  // 상단 EG Total 로고 (직인은 stamp 공용)
};

const MALGUN = '맑은 고딕';
const GULIM  = '굴림';
const NUM  = '#,##0';
const NUM2 = '#,##0.00';
const AREA = '#,##0.00_ ';
const ACC  = '_-* #,##0_-;\\-* #,##0_-;_-* "-"_-;_-@_-';
const DATE = 'yyyy-mm-dd';
const FILL_HEAD = 'FFF2F2F2';  // 2번 양식 표 헤더 (흰색 -5%)
const FILL_ADDR2 = 'FFE5E0EC'; // 2번 양식 하단 주소 띠
const FILL_ADDR1 = 'FFEAF1DD'; // 1번 양식 상단 주소 띠
const FILL_P2HEAD = 'FFE2F0D9'; // 1번 양식 정산내역서 헤더 (연녹색)
const FILL_NA = 'FFD9E1F2';     // 1번 양식 '해당없음' 셀
const FILL_SUMBOX = 'FFD6DCE5'; // 1번 양식 요약표 강조행
const ACC_P = '_(* #,##0_);_(* \\(#,##0\\);_(* "-"_);_(@_)'; // 음수 괄호 회계서식
const NUM_R = '#,##0_ ';

const NA_KEYS = ['nationalPension', 'healthInsurance', 'longTermCare', 'unemployment']; // 0이면 '해당없음'

// ── 공통 헬퍼 ────────────────────────────────────────────────
const colLetter = (n) => {
    let s = '';
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
    return s;
};
const colNum = (letter) => letter.split('').reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
const n = (v) => Number(v) || 0;
const floor10 = (v) => Math.floor(v / 10) * 10;
const fx = (formula, result) => ({ formula, result });
const center = (extra = {}) => ({ horizontal: 'center', vertical: 'middle', ...extra });

function put(ws, addr, value, { font, align, fill, numFmt } = {}) {
    const c = ws.getCell(addr);
    if (value !== undefined) c.value = value;
    if (font) c.font = font;
    if (align) c.alignment = align;
    if (fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    if (numFmt) c.numFmt = numFmt;
    return c;
}

// 병합 + 값/서식 (서식은 범위 안 모든 셀에 동일 적용 → 병합 셀 채우기/테두리 깨짐 방지)
function mput(ws, range, value, opts = {}) {
    const [a, b] = range.includes(':') ? range.split(':') : [range, range];
    if (a !== b) ws.mergeCells(range);
    const { fill, font } = opts;
    if (fill || font) eachCell(ws, a, b, (c) => {
        if (fill) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        if (font) c.font = font;
    });
    return put(ws, a, value, opts);
}

function eachCell(ws, a, b, fn) {
    const pa = ws.getCell(a), pb = ws.getCell(b);
    for (let r = pa.row; r <= pb.row; r++)
        for (let c = pa.col; c <= pb.col; c++) fn(ws.getRow(r).getCell(c), r, c);
}

// 범위 테두리: 바깥선 outer, 안쪽선 inner
function box(ws, r1, c1, r2, c2, outer = 'thin', inner = 'thin') {
    for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++) {
            ws.getRow(r).getCell(c).border = {
                top:    { style: r === r1 ? outer : inner },
                bottom: { style: r === r2 ? outer : inner },
                left:   { style: c === c1 ? outer : inner },
                right:  { style: c === c2 ? outer : inner },
            };
        }
}

// 이미 그린 테두리 위에 특정 변만 덮어쓰기
function edge(ws, r1, c1, r2, c2, side, style) {
    for (let r = r1; r <= r2; r++)
        for (let c = c1; c <= c2; c++) {
            const cell = ws.getRow(r).getCell(c);
            cell.border = { ...(cell.border || {}), [side]: { style } };
        }
}

function setHeights(ws, map) {
    Object.entries(map).forEach(([r, h]) => { ws.getRow(Number(r)).height = h; });
}

function setWidths(ws, widths) {
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

const toExcelDate = (s) => {
    if (!s) return '';
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(s));
    if (!m) return String(s);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); // UTC 고정 → 하루 밀림 방지
};

function addImage(wb, ws, images, key, from, to) {
    const buf = images?.[key];
    if (!buf) return;
    const id = wb.addImage({ buffer: buf, extension: 'png' });
    ws.addImage(id, {
        tl: { nativeCol: from[0], nativeColOff: from[1], nativeRow: from[2], nativeRowOff: from[3] },
        br: { nativeCol: to[0],   nativeColOff: to[1],   nativeRow: to[2],   nativeRowOff: to[3] },
        editAs: 'oneCell',
    });
}

// ── 여러 줄 텍스트(메모) 높이 추정 ──
// 병합 셀은 엑셀이 행 높이를 자동으로 늘려주지 않으므로, 줄 수를 계산해서 직접 지정합니다.
const textUnits = (str) => { let u = 0; for (const ch of str) u += ch.charCodeAt(0) > 255 ? 1.9 : 1; return u; };
function sumColWidth(ws, c0, c1) {
    let w = 0;
    for (let c = c0; c <= c1; c++) w += Number(ws.getColumn(c).width) || 8.38;
    return w;
}
// 폭(문자 단위) 안에서 줄바꿈(엔터) + 자동 줄바꿈까지 고려한 표시 줄 수
function countLines(text, widthChars) {
    const w = Math.max(4, widthChars - 1);
    return String(text).split('\n').reduce((sum, ln) => sum + Math.max(1, Math.ceil(textUnits(ln) / w)), 0);
}
const MEMO_LINE_PT = 14;  // 10pt 글꼴 기준 줄 높이
const MAX_ROW_PT = 400;   // 엑셀 행 높이 한도(409) 여유

// ── 이미지 로더 (브라우저) ───────────────────────────────────
export async function loadSettleImages(baseUrl = '') {
    const entries = await Promise.all(Object.entries(IMAGE_PATHS).map(async ([k, url]) => {
        // import 로 받은 URL(해시 경로·data: URI)은 그대로, 문자열 경로만 baseUrl 을 붙임
        const src = /^(data:|blob:|https?:)/.test(url) || url.startsWith('/_nuxt/') ? url : baseUrl + url;
        try {
            const res = await fetch(src);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return [k, await res.arrayBuffer()];
        } catch (e) {
            // 이미지가 없어도 엑셀은 만들어지도록 계속 진행하되, 원인은 콘솔에 남김
            console.warn(`[정산서 이미지] '${k}' 로드 실패 (${src}):`, e.message);
            return [k, null];
        }
    }));
    return Object.fromEntries(entries);
}

// ──────────────────────────────────────────────────────────────
// 정산설정 기반 컬럼 구성
//   d.columns : 화면(급여 세부 내역서)에 실제로 켜져 있는 컬럼 플래그
//   d.summaryVisible : 정산 요약에 남아 있는 행(연차/퇴직 적립금 삭제 여부 등)
//   값이 없으면(구버전 호출) 전부 표시로 간주
// ──────────────────────────────────────────────────────────────
function resolveColumns(d) {
    const c = d.columns || {};
    const on = (v) => v === undefined ? true : !!v;
    const ins = {
        nationalPension: on(c.nationalPension),
        healthInsurance: on(c.healthInsurance),
        longTermCare:    on(c.longTermCare),
        employment:      on(c.employment),   // 실업급여 + 고용안정 한 묶음
        sanjae:          on(c.sanjae),
    };
    // 보험 컬럼이 하나도 없으면(설정 누락) 표가 비지 않도록 전부 표시
    if (!Object.values(ins).some(Boolean)) Object.keys(ins).forEach(k => { ins[k] = true; });
    const sv = d.summaryVisible || {};
    return {
        annualLeave: on(c.annualLeave),
        severance:   on(c.severance),
        ...ins,
        showAnnualRow: sv.annualLeave !== false,
        showSevRow:    sv.severance !== false,
    };
}

// 보험 값 필드 (정산설정에 켜진 것만)
function insuranceFields(cols, r) {
    const list = [];
    if (cols.nationalPension) list.push({ key: 'nationalPension', label: `국민연금\n(${r.nationalPension}%)`, estKey: 'nationalPension' });
    if (cols.healthInsurance) list.push({ key: 'healthInsurance', label: `건강보험\n(${r.healthInsurance}%)`, estKey: 'healthInsurance' });
    if (cols.longTermCare)    list.push({ key: 'longTermCare',    label: `장기요양\n(${r.longTermCare}%)`, estKey: 'longTermCare' });
    if (cols.employment) {
        list.push({ key: 'unemployment', label: `실업급여\n(${r.employmentInsurance}%)`, empGroup: 'first', estKey: 'employment' });
        list.push({ key: 'empStability', label: '고용안정\n(0.45%)', empGroup: 'second' });
    }
    if (cols.sanjae) list.push({ key: 'sanjae', label: `산재보험\n(${r.industrialAccident}%)`, estKey: 'sanjae' });
    return list.map(f => ({ ...f, isIns: true }));
}

// 인적사항 필드를 c0~c1 열에 배치 (필드 순서 유지, 각 필드는 연속된 열을 병합해서 사용)
//   정산설정에 따라 값 컬럼이 빠지면 인적사항 쪽에 열이 남는데, 남는 열을
//   어느 칸에 붙일지 모든 경우를 계산해서 각 칸의 '목표 폭'에 가장 가까운 배치를 고릅니다.
//   (열 너비 자체는 1페이지 청구공문과 공유하므로 바꾸지 않음)
// 과세 사업장 판단 → 과세면 '135㎡ 이하 / 135㎡ 초과' 면적·단가·공급가액·세액·합계 표 출력
//   1) 현장 is_vat 가 확인된 경우(d.vatFlag = 'Y' | 'N') : 그 값을 따름
//      (135㎡ 초과 면적이 있어도 면세로 등록된 단지가 있으므로 추정보다 우선)
//   2) 확인하지 못한 경우에만 : isVat 또는 135㎡ 초과 면적·부가세가 있으면 과세로 추정
const isTaxable = (d) => {
    if (d.vatFlag === 'Y') return true;
    if (d.vatFlag === 'N') return false;
    return !!(d.isVat
        || n(d.area?.overArea) > 0 || n(d.area?.overVat) > 0 || n(d.area?.overSupply) > 0
        || n(d.overArea) > 0);
};

const PERSONAL_TARGET = { no: 4, empName: 7.5, position: 8.5, personalNo: 8.5, inDate: 9, outDate: 9 };
function spreadFields(ws, fields, c0, c1) {
    const widths = [];
    for (let c = c0; c <= c1; c++) widths.push(Number(ws.getColumn(c).width) || 8.38);
    const m = widths.length, k = fields.length;
    if (m <= k) return fields.map((f, i) => ({ ...f, c1: c0 + i, c2: c0 + i })); // 남는 열 없음

    const cost = (w, t) => {
        const r = (w - t) / t;
        return r < 0 ? r * r * 3 : r * r; // 좁은 쪽(글자 잘림)을 더 크게 벌점
    };
    let best = null;
    // 경계 위치 선택: 1..m-1 중 k-1개
    const pick = (start, left, cuts) => {
        if (left === 0) {
            const bounds = [0, ...cuts, m];
            let total = 0;
            for (let i = 0; i < k; i++) {
                let w = 0;
                for (let j = bounds[i]; j < bounds[i + 1]; j++) w += widths[j];
                total += cost(w, fields[i].target || PERSONAL_TARGET[fields[i].key] || 8);
            }
            if (!best || total < best.total) best = { total, bounds };
            return;
        }
        for (let x = start; x <= m - left; x++) pick(x + 1, left - 1, [...cuts, x]);
    };
    pick(1, k - 1, []);
    return fields.map((f, i) => ({ ...f, c1: c0 + best.bounds[i], c2: c0 + best.bounds[i + 1] - 1 }));
}

// total 열을 n개 칸에 나눔 (앞쪽부터 1칸씩 더 받음, 첫 칸 제외)
function spreadBoxes(boxes, c0, c1) {
    const n = boxes.length, total = c1 - c0 + 1;
    const base = Math.floor(total / n);
    let extra = total - base * n;
    const spans = boxes.map(() => base);
    const order = [...Array(n).keys()].slice(1).concat(0); // 2번째 칸부터 1칸씩 더
    for (let i = 0; extra > 0; i++, extra--) spans[order[i % n]]++;
    let c = c0;
    return boxes.map((b, idx) => { const s = c; c += spans[idx]; return { ...b, c1: s, c2: c - 1 }; });
}


// ── 묶음(join) 처리 ──
// 화면(groupedPayrollData)은 groupNo 로 모아서 보여주므로, 배열상 떨어져 있는 행
// (예: 퇴사자 권기순 + 당월 중간입사자 김명순A)도 한 번호로 묶입니다.
// 출력도 같은 순서가 되도록 groupNo 기준 안정 정렬 후, 같은 groupNo 는 연속 배치합니다.
const hasGroupNo = (r) => r.groupNo !== undefined && r.groupNo !== null && r.groupNo !== '' && Number.isFinite(Number(r.groupNo));
function orderByGroup(rows = []) {
    return rows
        .map((r, i) => ({ r, i, k: hasGroupNo(r) ? Number(r.groupNo) : Infinity }))
        .sort((a, b) => (a.k - b.k) || (a.i - b.i))
        .map(x => x.r);
}
// 연속된 같은 groupNo 구간 → [{ start, end }]  (groupNo 가 없는 행은 각자 한 구간)
function groupRuns(rows = []) {
    const runs = [];
    rows.forEach((r, i) => {
        const last = runs[runs.length - 1];
        if (last && hasGroupNo(r) && last.groupNo === Number(r.groupNo)) last.end = i;
        else runs.push({ groupNo: hasGroupNo(r) ? Number(r.groupNo) : null, start: i, end: i });
    });
    return runs;
}
const rangeOf = (c1, c2, r) => (c1 === c2 ? `${colLetter(c1)}${r}` : `${colLetter(c1)}${r}:${colLetter(c2)}${r}`);

// ──────────────────────────────────────────────────────────────
// 계약 정산항목 표 (경비·일반관리비·기업이윤 등)  — 양식 1/2 공통
//   보험 정산표와 같은 직원 순서/묶음으로, 보험표 바로 아래에 별도 표로 출력
//   (1·2페이지가 같은 열을 공유하므로 보험표 옆에 붙이지 않고 아래에 둠)
//   구성 : 제목 1행 + 헤더 1행 + 직원 n행 + 계 1행
// ──────────────────────────────────────────────────────────────
const extraTableRowCount = (d) => ((d.extraCols || []).length ? 3 + Math.max((d.payroll || []).length, 1) : 0);
const EXTRA_GROUP_TITLE = { expense: '경비', manage: '일반관리비·이윤', other: '기타' };

function buildExtraTable(ws, d, emps, top, { c0, cEnd, style }) {
    let cols = d.extraCols || [];
    if (!cols.length) return top - 1;
    const maxVals = (cEnd - c0 + 1) - 1 - 3; // 계 1칸 + NO·이름·직책 최소 3칸
    if (cols.length > maxVals) {
        console.warn(`[정산서] 정산항목 ${cols.length}개 중 ${maxVals}개만 출력됩니다(양식 폭 한도).`);
        cols = cols.slice(0, maxVals);
    }
    // NO·이름·직책·항목들·계 전체를 c0~cEnd 열에 목표 폭 기준으로 배분 (금액 칸도 필요하면 2열 병합)
    const laid = spreadFields(ws, [
        { key: 'no', label: 'NO', target: 4 },
        { key: 'empName', label: style.nameLabel, target: 7.5 },
        { key: 'position', label: '직책', target: 9 },
        ...cols.map(c => ({ key: 'x:' + c.code, label: c.name, code: c.code, target: 9, isVal: true })),
        { key: 'total', label: '계', target: 10, isTotal: true },
    ], c0, cEnd);
    const personal = laid.slice(0, 3);
    const valF = laid.filter(f => f.isVal);
    const totF = laid[laid.length - 1];
    const firstV = valF[0], lastV = valF[valF.length - 1];

    const titleRow = top, headRow = top + 1, e0 = top + 2;
    const eEnd = e0 + Math.max(emps.length, 1) - 1;
    const sumRow = eEnd + 1;
    const cl = colLetter;
    const sc = center({ shrinkToFit: true });
    const hOpt = { font: { name: style.font, size: style.headSize }, align: center({ wrapText: true }), fill: style.headFill };

    // 제목 : 그룹 구성에 맞춰 "계약 정산항목 (경비 · 일반관리비·이윤)"
    const groupNames = [...new Set(cols.map(c => EXTRA_GROUP_TITLE[c.group] || '정산항목'))];
    mput(ws, `${cl(c0)}${titleRow}:${cl(cEnd)}${titleRow}`, `계약 정산항목 (${groupNames.join(' · ')})`,
        { font: { name: style.font, size: style.titleSize, bold: true }, align: { horizontal: 'left', vertical: 'middle' } });

    // 헤더
    laid.forEach(f => mput(ws, rangeOf(f.c1, f.c2, headRow), f.label, hOpt));

    // 직원 행 (NO 는 보험표와 같은 묶음 번호)
    const bodyF = { name: style.font, size: style.bodySize };
    const tot = cols.map(() => 0);
    let grand = 0;
    const noF = personal.find(p => p.key === 'no');
    groupRuns(emps).forEach((g, gi) =>
        mput(ws, `${cl(noF.c1)}${e0 + g.start}:${cl(noF.c2)}${e0 + g.end}`, gi + 1, { font: bodyF, align: center() }));
    emps.forEach((p, i) => {
        const row = e0 + i;
        personal.forEach(pf => { if (pf.key !== 'no') mput(ws, rangeOf(pf.c1, pf.c2, row), p[pf.key] || '', { font: bodyF, align: sc }); });
        let rowSum = 0;
        valF.forEach((f, ci) => {
            const v = n(p.extras?.[f.code]);
            tot[ci] += v; rowSum += v;
            mput(ws, rangeOf(f.c1, f.c2, row), v, { font: bodyF, align: sc, numFmt: style.numFmt });
        });
        grand += rowSum;
        mput(ws, rangeOf(totF.c1, totF.c2, row), fx(`SUM(${cl(firstV.c1)}${row}:${cl(lastV.c2)}${row})`, rowSum), { font: bodyF, align: sc, numFmt: style.numFmt });
    });

    // 계
    mput(ws, `${cl(c0)}${sumRow}:${cl(personal[2].c2)}${sumRow}`, '계', { font: { ...bodyF, bold: true }, align: center() });
    valF.forEach((f, ci) => mput(ws, rangeOf(f.c1, f.c2, sumRow), fx(`SUM(${cl(f.c1)}${e0}:${cl(f.c1)}${eEnd})`, tot[ci]),
        { font: { ...bodyF, bold: true }, align: sc, numFmt: style.numFmt }));
    mput(ws, rangeOf(totF.c1, totF.c2, sumRow), fx(`SUM(${cl(totF.c1)}${e0}:${cl(totF.c1)}${eEnd})`, grand), { font: { ...bodyF, bold: true }, align: sc, numFmt: style.numFmt });

    box(ws, headRow, c0, sumRow, cEnd, 'medium', 'thin');
    edge(ws, headRow, c0, headRow, cEnd, 'bottom', 'medium');
    edge(ws, sumRow, c0, sumRow, cEnd, 'top', 'medium');

    ws.getRow(titleRow).height = style.titleH;
    ws.getRow(headRow).height = style.headH;
    for (let r = e0; r <= eEnd; r++) ws.getRow(r).height = style.rowH;
    ws.getRow(sumRow).height = style.rowH;
    return sumRow;
}

// ──────────────────────────────────────────────────────────────
// 2번 양식 2페이지 : 보험 정산내역서
// ──────────────────────────────────────────────────────────────
const P2_STYLE = {
    [SETTLE_FORM.INVOICE]: {
        titleGap: 2, hTitle: 55.5, hSite: 37.5, hHead: [16.5, 24.75], hEmp: 24.75, hSum: 24.75, hEst: 24.75, hDiff: 24.75,
        hBlank: 24.75, hSHead: 38.25, hSVal: 33.75, headFont: 11, sumFont: 11, etcLabel: '기타 공제',
    },
};

// 행 번호를 먼저 계산해 두면 1페이지 청구표가 2페이지 요약 셀을 수식으로 참조할 수 있음
function page2Layout(form, p2Start, empCount, extraRows = 0) {
    const st = P2_STYLE[form];
    const title = p2Start + st.titleGap;
    const site = title + 1;
    const h1 = site + 1, h2 = h1 + 1;
    const e0 = h2 + 1;
    const eEnd = e0 + Math.max(empCount, 1) - 1;
    const sum = eEnd + 1, est = sum + 1, diff = est + 1;
    // 계약 정산항목 표 : 차액 행 아래 한 줄 띄우고
    const x0 = extraRows ? diff + 2 : null;
    const xEnd = extraRows ? x0 + extraRows - 1 : diff;
    const sHead = xEnd + 2, sVal = sHead + 1;
    return { title, site, h1, h2, e0, eEnd, sum, est, diff, x0, xEnd, sHead, sVal };
}

// 2번 양식 하단 요약칸 구성 (정산설정에 맞게 연차/퇴직 칸 on/off)
function form2Boxes(d, cols) {
    const boxes = [{ key: 'monthlyFee', label: '월계약금액' }];
    if (cols.showAnnualRow) boxes.push({ key: 'annualLeave', label: '연차적립금' });
    if (cols.showSevRow) boxes.push({ key: 'severance', label: '퇴직적립금' });
    boxes.push({ key: 'insuranceDiff', label: '4대보험\n정산차액' });
    boxes.push({ key: 'customTotal', label: P2_STYLE[SETTLE_FORM.INVOICE].etcLabel });
    boxes.push({ key: 'grandTotal', label: '당월 청구 금액' });
    return spreadBoxes(boxes, 1, 13); // A~M
}

function buildPage2(ws, form, d, L, boxes) {
    const st = P2_STYLE[form];
    const r = d.rates || {};
    const emps = orderByGroup(d.payroll || []);
    const cols = resolveColumns(d);

    mput(ws, `A${L.title}:M${L.title}`, `${d.yyyy}년 ${d.mm}월 보험 정산내역서`,
        { font: { name: MALGUN, size: 18, bold: true }, align: center() });
    put(ws, `A${L.site}`, `단지명: ${d.siteName}`, { font: { name: MALGUN, size: 14 }, align: { vertical: 'middle' } });

    // ── 열 배치 : 보험 값은 L열에서 왼쪽으로, 총계 M, 남는 폭은 인적사항 칸을 넓힘 ──
    const vals = insuranceFields(cols, r);
    const vStart = 13 - vals.length;
    vals.forEach((f, i) => { f.col = vStart + i; });
    const personal = spreadFields(ws, [
        { key: 'no', label: 'NO' }, { key: 'empName', label: '성명' }, { key: 'position', label: '직책' },
        { key: 'personalNo', label: '생년월일' }, { key: 'inDate', label: '입사일' }, { key: 'outDate', label: '퇴사일' },
    ], 1, vStart - 1);
    const lastPC = vStart - 1;
    const firstV = colLetter(vStart), lastV = colLetter(12);

    // ── 헤더 ──
    const hf = (size = 11) => ({ name: GULIM, size });
    const wrapC = center({ wrapText: true });
    personal.forEach(p => mput(ws, `${colLetter(p.c1)}${L.h1}:${colLetter(p.c2)}${L.h2}`, p.label, { font: hf(), align: center() }));
    vals.forEach(f => {
        const c = colLetter(f.col);
        if (f.empGroup === 'first') {
            mput(ws, `${c}${L.h1}:${colLetter(f.col + 1)}${L.h1}`, '고용보험', { font: hf(), align: center() });
            put(ws, `${c}${L.h2}`, f.label, { font: hf(8), align: wrapC });
        } else if (f.empGroup === 'second') {
            put(ws, `${c}${L.h2}`, f.label, { font: hf(8), align: wrapC });
        } else {
            mput(ws, `${c}${L.h1}:${c}${L.h2}`, f.key === 'longTermCare' ? f.label.replace('장기요양', '장기요양보험') : f.label,
                { font: hf(f.key === 'longTermCare' ? 9 : st.headFont), align: wrapC });
        }
    });
    mput(ws, `M${L.h1}:M${L.h2}`, '계', { font: hf(), align: center() });

    // ── 직원 행 ──
    const totals = Object.fromEntries(vals.map(f => [f.key, 0]));
    let grandIns = 0;
    const base = { name: GULIM, size: 10 };
    const sc = center({ shrinkToFit: true });

    const groups = groupRuns(emps);
    const noF = personal.find(p => p.key === 'no');
    groups.forEach((g, gi) => {
        mput(ws, `${colLetter(noF.c1)}${L.e0 + g.start}:${colLetter(noF.c2)}${L.e0 + g.end}`, gi + 1, { font: base, align: center() });
    });

    emps.forEach((p, i) => {
        const row = L.e0 + i;
        personal.forEach(pf => {
            if (pf.key === 'no') return;
            const rng = rangeOf(pf.c1, pf.c2, row);
            if (pf.key === 'inDate' || pf.key === 'outDate') {
                mput(ws, rng, toExcelDate(p[pf.key]), { font: { name: GULIM, size: 8 }, align: sc, numFmt: DATE });
            } else if (pf.key === 'personalNo') {
                mput(ws, rng, p.personalNo ? String(p.personalNo) : '', { font: { name: GULIM, size: 9 }, align: sc });
            } else {
                mput(ws, rng, p[pf.key] || '', { font: base, align: sc });
            }
        });
        let rowSum = 0;
        vals.forEach(f => {
            const v = n(p[f.key]);
            totals[f.key] += v; rowSum += v;
            const addr = `${colLetter(f.col)}${row}`;
            if (NA_KEYS.includes(f.key) && v === 0) put(ws, addr, '해당없음', { font: base, align: sc });
            else put(ws, addr, v, { font: base, align: sc, numFmt: ACC });
        });
        grandIns += rowSum;
        put(ws, `M${row}`, fx(`SUM(${firstV}${row}:${lastV}${row})`, rowSum), { font: base, align: { vertical: 'middle', shrinkToFit: true }, numFmt: ACC });
    });

    // ── 계 / 견적서 / 차액 ──
    const sumF = { name: GULIM, size: st.sumFont };
    const estF = { name: GULIM, size: 11 };
    const dF = { name: GULIM, size: 12, bold: true };
    const e = d.estimate || {};
    mput(ws, `A${L.sum}:${colLetter(lastPC)}${L.sum}`, '계', { font: { name: GULIM, size: 11 }, align: center() });
    mput(ws, `A${L.est}:${colLetter(lastPC)}${L.est}`, '견적서/4대보험', { font: estF, align: center() });
    mput(ws, `A${L.diff}:${colLetter(lastPC)}${L.diff}`, '차액', { font: { name: GULIM, size: 12 }, align: center() });

    let estTotal = 0;
    vals.forEach(f => {
        const c = colLetter(f.col);
        put(ws, `${c}${L.sum}`, fx(`SUM(${c}${L.e0}:${c}${L.eEnd})`, totals[f.key]), { font: sumF, align: sc, numFmt: ACC });
        if (f.empGroup === 'second') return; // 고용보험은 두 칸 병합으로 처리
        const c2 = f.empGroup === 'first' ? colLetter(f.col + 1) : c;
        const ev = n(e[f.estKey]);
        estTotal += ev;
        mput(ws, `${c}${L.est}:${c2}${L.est}`, ev, { font: estF, align: sc, numFmt: ACC });
        const dv = f.empGroup === 'first'
            ? fx(`${c}${L.sum}+${c2}${L.sum}-${c}${L.est}`, totals.unemployment + totals.empStability - ev)
            : fx(`${c}${L.sum}-${c}${L.est}`, totals[f.key] - ev);
        mput(ws, `${c}${L.diff}:${c2}${L.diff}`, dv, { font: dF, align: sc, numFmt: ACC });
    });
    put(ws, `M${L.sum}`, fx(`SUM(M${L.e0}:M${L.eEnd})`, grandIns), { font: sumF, align: sc, numFmt: ACC });
    put(ws, `M${L.est}`, fx(`SUM(${firstV}${L.est}:${lastV}${L.est})`, estTotal), { font: estF, align: sc, numFmt: ACC });
    const diffTotal = grandIns - estTotal;
    put(ws, `M${L.diff}`, fx(`M${L.sum}-M${L.est}`, diffTotal), { font: dF, align: sc, numFmt: ACC });

    // 테두리: 전체 thin + 보험 구간(헤더~계) 굵은 테두리
    box(ws, L.h1, 1, L.diff, 13);

    // 계약 정산항목 표 (A~M)
    if (L.x0) {
        buildExtraTable(ws, d, emps, L.x0, { c0: 1, cEnd: 13, style: {
                font: GULIM, nameLabel: '성명', titleSize: 12, headSize: 10, bodySize: 10, numFmt: ACC,
                headFill: undefined, titleH: 26, headH: 30, rowH: st.hEmp,
            } });
    }
    edge(ws, L.h1, vStart, L.sum, vStart, 'left', 'medium');
    edge(ws, L.h1, 13, L.sum, 13, 'right', 'medium');
    edge(ws, L.h1, vStart, L.h1, 13, 'top', 'medium');
    edge(ws, L.sum, vStart, L.sum, 13, 'bottom', 'medium');

    // ── 하단 요약 ──
    const s = d.summary;
    const hF = { name: MALGUN, size: 12 };
    const sv = L.sVal;
    const insVal = n(s.insuranceDiff) === diffTotal ? fx(`M${L.diff}`, diffTotal) : n(s.insuranceDiff);
    const beforeGrand = boxes[boxes.length - 2];
    boxes.forEach(b => {
        mput(ws, rangeOf(b.c1, b.c2, L.sHead), b.label, { font: hF, align: center({ wrapText: true }) });
        let v;
        if (b.key === 'grandTotal') v = fx(`ROUNDDOWN(SUM(A${sv}:${colLetter(beforeGrand.c2)}${sv}),-1)`, n(s.grandTotal));
        else if (b.key === 'insuranceDiff') v = insVal;
        else v = n(s[b.key]);
        const big = b.key === 'monthlyFee' || b.key === 'grandTotal';
        mput(ws, rangeOf(b.c1, b.c2, sv), v, {
            font: { name: MALGUN, size: big ? 14 : 12, bold: b.key === 'grandTotal' }, align: sc, numFmt: ACC,
        });
    });
    box(ws, L.sHead, 1, L.sVal, 13);

    const hm = { [L.title]: st.hTitle, [L.site]: st.hSite, [L.h1]: st.hHead[0], [L.h2]: st.hHead[1],
        [L.sum]: st.hSum, [L.est]: st.hEst, [L.diff]: st.hDiff, [L.sHead]: st.hSHead, [L.sVal]: st.hSVal };
    for (let rr = L.e0; rr <= L.eEnd; rr++) hm[rr] = st.hEmp;
    if (st.hBlank) hm[L.diff + 1] = st.hBlank;
    if (L.x0) hm[L.xEnd + 1] = st.hBlank;

    // ── 정산 특이사항 및 메모 (전체 내용, 줄바꿈 유지) ──
    //   요약표 아래 A~M 병합. 길면 여러 행으로 나눠 행 높이 한도(409pt)를 넘지 않게 함
    let lastRow = L.sVal;
    if (d.memoText) {
        const widthChars = sumColWidth(ws, 1, 13);
        const lines = String(d.memoText).split('\n');
        const chunks = [];
        let cur = [], curPt = 0;
        lines.forEach(ln => {
            const pt = countLines(ln, widthChars) * MEMO_LINE_PT;
            if (cur.length && curPt + pt > MAX_ROW_PT) { chunks.push(cur); cur = []; curPt = 0; }
            cur.push(ln); curPt += pt;
        });
        if (cur.length) chunks.push(cur);

        let row = L.sVal + 2;
        chunks.forEach(ch => {
            const text = ch.join('\n');
            mput(ws, `A${row}:M${row}`, text, {
                font: { name: MALGUN, size: 10 }, align: { horizontal: 'left', vertical: 'top', wrapText: true },
            });
            hm[row] = Math.min(409, countLines(text, widthChars) * MEMO_LINE_PT + 6);
            lastRow = row;
            row++;
        });
    }
    setHeights(ws, hm);

    return { diffTotal, lastRow };
}

function buildAreaTable(ws, d, top, cols, { unitFmt, headBold }) {
    const a = d.area || {};
    const [cLab, cArea, cUnit, cSup, cVat, cTot] = cols; // 각 요소: [시작열, 끝열]
    const rng = (c, r) => (c[0] === c[1] ? `${c[0]}${r}` : `${c[0]}${r}:${c[1]}${r}`);
    const hF = { name: MALGUN, size: 11, bold: headBold };
    const bF = { name: MALGUN, size: 11 };
    const wc = center({ wrapText: true });
    const nc = center({ shrinkToFit: true });
    const r0 = top, r1 = top + 1, r2 = top + 2, r3 = top + 3;

    mput(ws, rng(cLab, r0), '면적(㎡) 구분', { font: hF, align: wc });
    mput(ws, rng(cArea, r0), '관리면적/㎡', { font: hF, align: wc });
    mput(ws, rng(cUnit, r0), '단가', { font: hF, align: wc });
    mput(ws, rng(cSup, r0), '공급가액', { font: hF, align: wc });
    mput(ws, rng(cVat, r0), '세액', { font: hF, align: wc });
    mput(ws, rng(cTot, r0), '합계', { font: hF, align: wc });

    const underArea = n(a.underArea), overArea = n(a.overArea);
    const underSup = n(a.underSupply), overSup = n(a.overSupply), overVat = n(a.overVat);

    mput(ws, rng(cLab, r1), a.underLabel || '135㎡ 이하', { font: bF, align: wc });
    mput(ws, rng(cArea, r1), underArea, { font: bF, align: nc, numFmt: AREA });
    mput(ws, `${cUnit[0]}${r1}:${cUnit[0]}${r2}`, n(a.unitPrice), { font: bF, align: nc, numFmt: unitFmt });
    mput(ws, rng(cSup, r1), underSup, { font: bF, align: nc, numFmt: NUM });
    mput(ws, rng(cVat, r1), null, { font: bF, align: nc, numFmt: NUM });
    mput(ws, rng(cTot, r1), fx(`SUM(${cSup[0]}${r1}:${cVat[1]}${r1})`, underSup), { font: bF, align: nc, numFmt: NUM });

    mput(ws, rng(cLab, r2), a.overLabel || '135㎡ 초과', { font: bF, align: wc });
    mput(ws, rng(cArea, r2), overArea, { font: bF, align: nc, numFmt: AREA });
    mput(ws, rng(cSup, r2), overSup, { font: bF, align: nc, numFmt: NUM });
    mput(ws, rng(cVat, r2), overVat, { font: bF, align: nc, numFmt: NUM });
    mput(ws, rng(cTot, r2), fx(`SUM(${cSup[0]}${r2}:${cVat[1]}${r2})`, overSup + overVat), { font: bF, align: nc, numFmt: NUM });

    mput(ws, rng(cLab, r3), null, { font: bF, align: wc });
    mput(ws, rng(cArea, r3), fx(`SUM(${cArea[0]}${r1}:${cArea[1]}${r2})`, underArea + overArea), { font: bF, align: nc, numFmt: AREA });
    mput(ws, rng(cUnit, r3), null, { font: bF, align: nc });
    mput(ws, rng(cSup, r3), fx(`SUM(${cSup[0]}${r1}:${cSup[1]}${r2})`, underSup + overSup), { font: bF, align: nc, numFmt: NUM });
    mput(ws, rng(cVat, r3), fx(`SUM(${cVat[0]}${r1}:${cVat[1]}${r2})`, overVat), { font: bF, align: nc, numFmt: NUM });
    mput(ws, rng(cTot, r3), fx(`SUM(${cSup[0]}${r3}:${cVat[1]}${r3})`, underSup + overSup + overVat),
        { font: { ...bF, bold: true }, align: nc, numFmt: NUM });

    box(ws, r0, colNum(cLab[0]), r3, colNum(cTot[1]));
}


// ──────────────────────────────────────────────────────────────
// 2번 양식 : 청구서형 (원본 '26.08' 시트)
// ──────────────────────────────────────────────────────────────
function buildForm2(wb, ws, d, images) {
    const CO2 = COMPANY[SETTLE_FORM.INVOICE];
    setWidths(ws, [9.25, 8.38, 8.38, 8.38, 9.375, 8.38, 8.38, 8.38, 9.75, 8.38, 8.38, 8.38, 8.38]);

    const s = d.summary;
    const notes = d.notes || {};
    const cols = resolveColumns(d);
    // 청구표 : 정산설정에서 연차/퇴직 적립을 안 쓰면 행 자체를 뺌
    const items = [
        { key: 'monthlyFee',    label: `${d.typeName} (월) 용역비`, note: notes.monthlyFee || '' },
        cols.showAnnualRow && { key: 'annualLeave', label: '연차 적립',   note: notes.annualLeave || '관리실 적립' },
        cols.showSevRow    && { key: 'severance',   label: '퇴직금 적립', note: notes.severance || '관리실 적립' },
        { key: 'insuranceDiff', label: '4대보험 정산', note: notes.insuranceDiff || '' },
    ].filter(Boolean);
    if (n(s.customTotal) !== 0) items.push({ key: 'customTotal', label: '기타 공제', note: notes.customTotal || '' });

    const off = items.length - 4;   // 항목 수가 바뀐 만큼 아래를 밀고/당기고, 큰 여백행으로 흡수해 1페이지 높이 유지
    const R = (row) => row + off;    // 합계 이후 행 보정
    const p1End = R(38);
    const L = page2Layout(SETTLE_FORM.INVOICE, p1End + 1, (d.payroll || []).length, extraTableRowCount(d));
    const boxes = form2Boxes(d, cols);
    const refs = Object.fromEntries(boxes.map(b => [b.key, `${colLetter(b.c1)}${L.sVal}`]));

    // 제목 / 수신
    mput(ws, 'B3:L4', `${d.yyyy}년 ${d.mm}월 ${d.typeName}용역비 청구서`, { font: { name: MALGUN, size: 20 }, align: center() });
    mput(ws, 'J6:L6', d.siteName, { font: { name: MALGUN, size: 11 }, align: { horizontal: 'right', vertical: 'middle', shrinkToFit: true } });
    put(ws, 'M6', '귀중', { font: { name: MALGUN, size: 11 }, align: { vertical: 'middle' } });

    // 청구표
    const f11 = { name: MALGUN, size: 11 };
    mput(ws, 'B11:C11', '구분', { font: f11, align: center(), fill: FILL_HEAD });
    mput(ws, 'D11:G11', '산출금액', { font: f11, align: center(), fill: FILL_HEAD });
    mput(ws, 'H11:K11', '비고', { font: f11, align: center(), fill: FILL_HEAD });
    items.forEach((it, i) => {
        const r = 12 + i;
        mput(ws, `B${r}:C${r}`, it.label, { font: f11, align: center({ shrinkToFit: true }), fill: FILL_HEAD });
        // 가로 모드(상세는 별도 시트)면 같은 시트의 2페이지가 없으므로 값으로 기록
        mput(ws, `D${r}:G${r}`, d._landscape ? n(s[it.key]) : fx(refs[it.key], n(s[it.key])), { font: f11, align: center(), numFmt: NUM });
        mput(ws, `H${r}:K${r}`, it.note, { font: f11, align: center({ shrinkToFit: true }) });
    });
    const tr = 12 + items.length;
    mput(ws, `B${tr}:C${tr}`, '합계', { font: f11, align: center(), fill: FILL_HEAD });
    mput(ws, `D${tr}:G${tr}`, fx(`ROUNDDOWN(SUM(D12:G${tr - 1}),-1)`, n(s.grandTotal)), { font: f11, align: center(), numFmt: NUM });
    mput(ws, `H${tr}:K${tr}`, null, { font: f11, align: center() });
    box(ws, 11, 2, tr, 11, 'medium', 'thin');

    // 면적표 (과세 사업장만)
    if (isTaxable(d)) {
        buildAreaTable(ws, d, R(18), [['B', 'C'], ['D', 'E'], ['F', 'F'], ['G', 'H'], ['I', 'I'], ['J', 'K']], { unitFmt: NUM, headBold: true });
    }

    // 날짜 / 안내 / 계좌 / 주소
    mput(ws, `C${R(28)}:K${R(28)}`, `${d.yyyy}.${String(d.mm).padStart(2, '0')}.${String(d.lastDay).padStart(2, '0')}`,
        { font: { name: MALGUN, size: 15 }, align: center() });
    mput(ws, `C${R(30)}:K${R(30)}`, '상기와 같이 청구하오니 아래의 계좌로 입금하여주시기 바랍니다.', { font: f11, align: center() });
    mput(ws, `C${R(32)}:K${R(32)}`, d.bankInfo, { font: f11, align: center({ shrinkToFit: true }) });
    mput(ws, `C${R(38)}:K${R(38)}`, `${CO2.address} TEL. ${CO2.tel} FAX. ${CO2.fax}`,
        { font: f11, align: center({ shrinkToFit: true }), fill: FILL_ADDR2 });

    const hm = { 2: 15.75, 3: 16.5, 4: 39.75, 6: 28.5, 7: 25.5, 8: 25.5, 9: 25.5, 10: 25.5, 11: 24.95 };
    for (let r = 12; r <= tr; r++) hm[r] = 24.95;
    Object.assign(hm, {
        [R(17)]: 9.75, [R(18)]: 27, [R(19)]: 27, [R(20)]: 27, [R(21)]: 27, [R(22)]: 27, [R(23)]: 27,
        [R(24)]: Math.max(20, 162 - off * 24.95), // 항목이 줄면 여백이 늘어 하단 위치 유지
        [R(25)]: 27, [R(26)]: 27, [R(27)]: 27, [R(28)]: 24, [R(32)]: 21,
    });
    setHeights(ws, hm);

    // 이미지 (원본 앵커 좌표 그대로, EMU)
    addImage(wb, ws, images, 'circleLogo', [0, 333375, 1, 123825], [1, 657300, 4, 104775]);
    addImage(wb, ws, images, 'egLogo', [2, 352425, R(32), 0], [10, 28575, R(35), 200026]);
    addImage(wb, ws, images, 'stamp', [10, 200025, R(31), 180975], [11, 547432, R(36), 119522]);

    // 2페이지
    if (d._landscape) {
        setHeights(ws, {}); // 1페이지 행 높이는 위에서 지정됨
        return { p1End, lastRow: p1End, scale: 68 };
    }
    const p2 = buildPage2(ws, SETTLE_FORM.INVOICE, d, L, boxes);

    return { p1End, lastRow: p2.lastRow, scale: 68 };
}

// ──────────────────────────────────────────────────────────────
// 1번 양식 : 청구공문 + 정산내역서 (원본 '청구26.03' 시트, 에코그린티엠)
// ──────────────────────────────────────────────────────────────
function buildForm1(wb, ws, d, images) {
    const CO = COMPANY[SETTLE_FORM.OFFICIAL];
    //          A     B      C     D     E     F   G      H  I  J      K      L      M      N      O      P       Q
    setWidths(ws, [1.25, 3.875, 6.75, 5.75, 7.25, 10, 9.375, 7, 7, 7.375, 7.375, 7.375, 7.375, 7.375, 7.375, 11.875, 0.75]);

    const s = d.summary;
    const notes = d.notes || {};
    const G12 = { name: GULIM, size: 12 };
    const G11 = { name: GULIM, size: 11 };
    const G10 = { name: GULIM, size: 10 };
    const mm2 = String(d.mm).padStart(2, '0');
    const dd2 = String(d.lastDay).padStart(2, '0');
    const NB = '\u00a0';

    // 공문 본문 줄
    const lines = (d.headerLines && d.headerLines.length) ? d.headerLines : [
        '1. 귀 소의 무궁한 발전을 기원합니다.',
        `2. 당월 ${d.typeName}용역비를 아래와 같이 첨부하오니 검토하시여 결재를 부탁드립니다.`,
    ];

    // 청구표 항목 : 고정 행(정산설정에 따라 연차/퇴직 on/off) + 정산 추가항목(공백공제 등)
    const cols = resolveColumns(d);
    const custom = d.customItems || [];
    const items = [
        { label: `${d.typeName}용역비(월)`, sumKey: 'fee',    value: n(s.monthlyFee),  note: notes.monthlyFee || '월 계약금액' },
        cols.showAnnualRow && { label: '연차적립',   sumKey: 'annual', value: n(s.annualLeave), note: notes.annualLeave || '관리소 적립' },
        cols.showSevRow    && { label: '퇴직금적립', sumKey: 'sev',    value: n(s.severance),   note: notes.severance || '관리소 적립' },
        { label: '4대보험실비정산차액',      sumKey: 'diff',   value: n(s.insuranceDiff), note: notes.insuranceDiff || '상세내역 참조' },
        ...custom.map((c, i) => ({ label: c.label || '추가 항목', sumKey: `c${i}`, value: n(c.amount), note: c.note || '' })),
    ].filter(Boolean);

    // ── 행 배치 (원본 : 본문 2줄, 청구항목 5행 기준) ──
    const lineStart = 11;
    const ahRow = lineStart + lines.length;      // '- 아 래 -'
    const tHead = ahRow + 2;                     // 표 헤더
    const it0 = tHead + 1;
    const itEnd = tHead + items.length;
    const tr = itEnd + 1;                        // 합계
    const area0 = tr + 2;                        // 면적표 4행
    const bankRow = tr + 6, att1 = tr + 7, att2 = tr + 8, dateRow = tr + 9;
    const ceoRow = tr + 21;
    const p1End = tr + 23;
    // 본문/항목이 늘거나 줄어든 만큼 하단 여백행(9행, 원래 15pt씩)으로 흡수 → 직인/대표이사 위치 유지
    const delta = (lines.length - 2) * 24.95 + (items.length - 5) * 21.95;
    const spacerH = Math.min(40, Math.max(1, (135 - delta) / 9));

    // 페이지2 배치
    const p2 = p1End + 1;
    const P = {
        title: p2 + 2, siteRow: p2 + 4, head: p2 + 5, e0: p2 + 6,
    };
    const emps = orderByGroup(d.payroll || []);
    P.eEnd = P.e0 + Math.max(emps.length, 1) - 1;
    P.sum = P.eEnd + 1;
    // 계약 정산항목 표 : 보험표 합계 아래 한 줄 띄우고, 요약표는 그 아래로
    const xRows = extraTableRowCount(d);
    P.x0 = xRows ? P.sum + 2 : null;
    P.xEnd = xRows ? P.x0 + xRows - 1 : P.sum;
    P.box0 = xRows ? P.xEnd + 2 : P.sum + 1;
    // 요약표 행 : 월간용역비, 연차, 퇴직, 견적서, 실비정산, 차액, 추가항목..., 당월청구
    const boxRows = [
        { key: 'fee', label: '월간용역비' },
        cols.showAnnualRow && { key: 'annual', label: '연차귀속(-)' },
        cols.showSevRow    && { key: 'sev', label: '퇴직금 귀속(-)' },
        { key: 'est', label: '4대보험료(견적서)' },
        { key: 'act', label: '4대보험료(실비정산)' },
        { key: 'diff', label: '4대보험차액 (-)' },
        ...custom.map((c, i) => ({ key: `c${i}`, label: c.label || '추가 항목' })),
        { key: 'grand', label: '당월 청구금액' },
    ].filter(Boolean);
    const boxRowOf = {};
    boxRows.forEach((b, i) => { boxRowOf[b.key] = P.box0 + i; });
    P.boxEnd = P.box0 + boxRows.length - 1;
    let lastRow = P.boxEnd + 1; // 메모가 요약표보다 길면 아래에서 갱신

    // ════════ 1페이지 : 청구공문 ════════
    mput(ws, 'A4:Q4', CO.headerLine, { font: G11, align: { horizontal: 'distributed', vertical: 'middle' }, fill: FILL_ADDR1 });
    const infoAlign = { horizontal: 'left', vertical: 'middle', shrinkToFit: true };
    mput(ws, 'A5:Q5', `${NB}문서번호 : ${d.docNo || ''}`, { font: G12, align: infoAlign });
    mput(ws, 'A6:Q6', `${NB}시행일자 : ${d.billingDtText || `${d.yyyy}.  ${mm2}.  ${dd2}.`}`, { font: G12, align: infoAlign });
    const receiver = /아파트$/.test(d.siteName || '') ? d.siteName : `${d.siteName} 아파트`;
    mput(ws, 'A7:Q7', `${NB}수${NB}${NB}${NB} 신 :  ${receiver} 관리사무소`, { font: G12, align: infoAlign });
    mput(ws, 'A8:Q8', `${NB}제${NB}${NB}${NB} 목 :  ${d.title || `${d.typeName}용역비 청구의 건`}`, { font: G12, align: infoAlign });
    edge(ws, 10, 1, 10, 17, 'top', 'medium');

    lines.forEach((t, i) => {
        const r = lineStart + i;
        mput(ws, `A${r}:Q${r}`, `${NB.repeat(8)}${t}`, { font: G11, align: { horizontal: 'left', vertical: 'middle', shrinkToFit: true } });
    });
    mput(ws, `A${ahRow}:Q${ahRow}`, `-${NB.repeat(3)} 아${NB.repeat(4)} 래${NB.repeat(2)} -`, { font: G10, align: center() });

    // 청구표
    const hB = { name: GULIM, size: 10, bold: true };
    mput(ws, `B${tHead}:D${tHead}`, '산정기간', { font: { ...G11, bold: true }, align: center() });
    mput(ws, `E${tHead}:I${tHead}`, '구분(공제내역)', { font: hB, align: center({ wrapText: true }) });
    mput(ws, `J${tHead}:M${tHead}`, '산출금액', { font: hB, align: center({ wrapText: true }) });
    mput(ws, `N${tHead}:P${tHead}`, '비고', { font: hB, align: center({ wrapText: true }) });
    mput(ws, `B${it0}:D${itEnd}`, `${d.yyyy}.${mm2}.01~\n${d.yyyy}.${mm2}.${dd2}`, { font: G10, align: center({ wrapText: true }) });

    const P2REF = (key) => `O${boxRowOf[key]}`; // 요약표 금액 셀 참조
    items.forEach((it, i) => {
        const r = it0 + i;
        const isCustom = it.sumKey.startsWith('c');
        mput(ws, `E${r}:I${r}`, (isCustom && !d._landscape) ? fx(`L${boxRowOf[it.sumKey]}`, it.label) : it.label,
            { font: G10, align: center({ shrinkToFit: true }) });
        mput(ws, `J${r}:M${r}`, d._landscape ? it.value : fx(P2REF(it.sumKey), it.value), { font: G10, align: { horizontal: 'right', vertical: 'middle' }, numFmt: NUM_R });
        mput(ws, `N${r}:P${r}`, it.note, { font: G10, align: center({ shrinkToFit: true }) });
    });
    mput(ws, `B${tr}:I${tr}`, '합계', { font: G11, align: center() });
    mput(ws, `J${tr}:M${tr}`, fx(`ROUNDDOWN(SUM(J${it0}:M${itEnd}),-1)`, n(s.grandTotal)),
        { font: G10, align: { horizontal: 'right', vertical: 'middle' }, numFmt: NUM_R });
    mput(ws, `N${tr}:P${tr}`, null, { font: G10, align: center() });
    box(ws, tHead, 2, tr, 16);

    // 면적표 (원본처럼 항상 그리고, 면세 사업장이면 행 숨김)
    {
        const a = d.area || {};
        const r0 = area0, r1 = area0 + 1, r2 = area0 + 2, r3 = area0 + 3;
        const f = { name: GULIM, size: 10 };
        const fb = { ...f, bold: true };
        const c = center({ shrinkToFit: true });
        const uA = n(a.underArea), oA = n(a.overArea), uS = n(a.underSupply), oS = n(a.overSupply), oV = n(a.overVat);
        mput(ws, `B${r0}:E${r0}`, '면적(㎡)', { font: f, align: c });
        mput(ws, `F${r0}:H${r0}`, '공급면적(㎡)', { font: f, align: c });
        mput(ws, `I${r0}`, '단가', { font: f, align: c });
        mput(ws, `J${r0}:K${r0}`, '공급가액', { font: f, align: c });
        mput(ws, `L${r0}:M${r0}`, '세액', { font: { name: GULIM, size: 9 }, align: c });
        mput(ws, `N${r0}:P${r0}`, '합계금액', { font: f, align: c });
        const AREA3 = '_-* #,##0.000_-;\\-* #,##0.000_-;_-* "-"_-;_-@_-';
        mput(ws, `B${r1}:E${r1}`, a.underLabel || '135㎡ 이하', { font: f, align: c });
        mput(ws, `F${r1}:H${r1}`, uA, { font: f, align: c, numFmt: AREA3 });
        mput(ws, `I${r1}:I${r2}`, n(a.unitPrice), { font: f, align: c, numFmt: '_-* #,##0.0_-;\\-* #,##0.0_-;_-* "-"??_-;_-@_-' });
        mput(ws, `J${r1}:K${r1}`, uS, { font: f, align: c, numFmt: ACC_P });
        mput(ws, `L${r1}:M${r1}`, null, { font: f, align: c, numFmt: ACC_P });
        mput(ws, `N${r1}:P${r1}`, fx(`SUM(J${r1}:M${r1})`, uS), { font: f, align: c, numFmt: ACC_P });
        mput(ws, `B${r2}:E${r2}`, a.overLabel || '135㎡ 초과', { font: f, align: c });
        mput(ws, `F${r2}:H${r2}`, oA, { font: f, align: c, numFmt: AREA3 });
        mput(ws, `J${r2}:K${r2}`, oS, { font: f, align: c, numFmt: ACC_P });
        mput(ws, `L${r2}:M${r2}`, oV, { font: f, align: c, numFmt: ACC_P });
        mput(ws, `N${r2}:P${r2}`, fx(`SUM(J${r2}:M${r2})`, oS + oV), { font: f, align: c, numFmt: ACC_P });
        mput(ws, `B${r3}:E${r3}`, '청구합계', { font: fb, align: c });
        mput(ws, `F${r3}:H${r3}`, fx(`SUM(F${r1}:H${r2})`, uA + oA), { font: fb, align: c, numFmt: AREA3 });
        mput(ws, `I${r3}`, null, { font: fb, align: c });
        mput(ws, `J${r3}:K${r3}`, fx(`SUM(J${r1}:K${r2})`, uS + oS), { font: fb, align: c, numFmt: ACC_P });
        mput(ws, `L${r3}:M${r3}`, fx(`SUM(L${r1}:M${r2})`, oV), { font: fb, align: c, numFmt: ACC_P });
        mput(ws, `N${r3}:P${r3}`, fx(`SUM(J${r3}:M${r3})`, uS + oS + oV), { font: fb, align: c, numFmt: ACC_P });
        box(ws, r0, 2, r3, 16);
        if (!isTaxable(d)) for (let r = r0; r <= r3; r++) ws.getRow(r).hidden = true;
    }

    put(ws, `B${bankRow}`, `2) 입금계좌 : ${d.bankInfo}`, { font: G10, align: { vertical: 'middle' } });
    put(ws, `B${att1}`, `첨부 :${NB} 1. 전자계산서`, { font: G10, align: { vertical: 'middle' } });
    put(ws, `B${att2}`, '          2. 정산내역서', { font: G10, align: { vertical: 'middle' } });
    put(ws, `P${dateRow}`, d.billingDtText || `${d.yyyy}. ${mm2}. ${dd2}.`, { font: { name: MALGUN, size: 11 }, align: { horizontal: 'right', vertical: 'middle' } });
    mput(ws, `A${ceoRow}:Q${ceoRow}`, `${CO.name}${NB} 대표이사${NB}`, { font: { name: GULIM, size: 14, bold: true }, align: center() });

    // 1페이지 행 높이
    const hm = { 3: 38.25, 4: 13.5, 5: 30, 6: 30, 7: 30, 8: 30, 9: 9.95, 10: 9.75 };
    lines.forEach((_, i) => { hm[lineStart + i] = 24.95; });
    Object.assign(hm, { [ahRow]: 30, [ahRow + 1]: 9.95, [tHead]: 33.75 });
    for (let r = it0; r <= tr; r++) hm[r] = 21.95;
    hm[tr + 1] = 6.75;
    for (let r = area0; r <= area0 + 3; r++) hm[r] = 21.95;
    Object.assign(hm, { [bankRow]: 21, [att1]: 21, [att2]: 21, [dateRow]: 24.75 });
    for (let r = dateRow + 1; r <= dateRow + 9; r++) hm[r] = spacerH;
    Object.assign(hm, { [dateRow + 10]: 9, [ceoRow]: 24 });

    if (d._landscape) {
        // 가로 모드 : 정산내역서는 별도 가로 시트(buildDetailSheet)로 출력, 이 시트는 1페이지만
        setHeights(ws, hm);
        addImage(wb, ws, images, 'ecoLogo', [5, 517551, 0, 0], [10, 461277, 2, 476249]);
        addImage(wb, ws, images, 'ecoStamp', [11, 222803, ceoRow - 2, 16626], [12, 399837, ceoRow + 1, 11244]);
        return { p1End, lastRow: p1End, printCols: 'Q',
            margins: { left: 0.354, right: 0.354, top: 0.984, bottom: 0.512, header: 0.3, footer: 0.3 } };
    }

    // ════════ 2페이지 : 정산내역서 ════════
    mput(ws, `A${P.title}:Q${P.title}`, `${d.yyyy}년 ${mm2}월 (${d.typeName}) 정산내역서`,
        { font: { name: MALGUN, size: 20, bold: true }, align: center() });
    mput(ws, `N${P.siteRow}:P${P.siteRow}`, `${d.siteName}-${emps.length}명`,
        { font: { name: MALGUN, size: 12 }, align: center({ shrinkToFit: true }) });
    box(ws, P.siteRow, 14, P.siteRow, 16, 'medium', 'medium');

    // ── 열 배치 (정산설정 기준) ──
    //   값 컬럼 : 연차수당·퇴직금(설정에 있을 때만) + 켜진 4대보험 → O열에서 왼쪽으로 채움
    //   총계 : P열 고정 / 빠진 컬럼 자리는 입사일·퇴사일·이름 칸을 넓혀 표 폭 유지
    const r = d.rates || {};
    const vals = [
        cols.annualLeave && { key: 'annualLeave', label: '연차\n수당', size: 10 },
        cols.severance && { key: 'severance', label: '퇴직금', size: 10 },
        ...insuranceFields(cols, r).map(f => ({ ...f, size: 8 })),
    ].filter(Boolean);
    const vStart = 16 - vals.length; // O(15)열이 마지막 값 컬럼
    vals.forEach((f, i) => { f.col = vStart + i; });
    const insVals = vals.filter(f => f.isIns);
    const firstIns = insVals[0]?.col ?? 15;
    const personal = spreadFields(ws, [
        { key: 'no', label: 'NO' }, { key: 'empName', label: '이름' }, { key: 'position', label: '직책' },
        { key: 'personalNo', label: '생년\n월일' }, { key: 'inDate', label: '입사일' }, { key: 'outDate', label: '퇴사일' },
    ], 2, vStart - 1);

    const headOpt = (sz) => ({ font: { name: MALGUN, size: sz }, align: center({ wrapText: true }), fill: FILL_P2HEAD });
    personal.forEach(p => mput(ws, rangeOf(p.c1, p.c2, P.head), p.label, headOpt(10)));
    vals.forEach(f => put(ws, `${colLetter(f.col)}${P.head}`, f.label, headOpt(f.size)));
    put(ws, `P${P.head}`, '총계', headOpt(10));

    const tot = Object.fromEntries(vals.map(f => [f.key, 0]));
    let insTotal = 0;
    const M9 = { name: MALGUN, size: 9 };
    const insRange = (row) => insVals.length ? `${colLetter(firstIns)}${row}:O${row}` : null;

    // NO : groupNo 묶음은 세로 병합
    const groups = groupRuns(emps);
    const noF = personal.find(p => p.key === 'no');
    groups.forEach((g, gi) => mput(ws, `${colLetter(noF.c1)}${P.e0 + g.start}:${colLetter(noF.c2)}${P.e0 + g.end}`, gi + 1,
        { font: { name: MALGUN, size: 11 }, align: center() }));

    emps.forEach((p, i) => {
        const row = P.e0 + i;
        const c = center({ shrinkToFit: true });
        personal.forEach(pf => {
            if (pf.key === 'no') return;
            const rng = rangeOf(pf.c1, pf.c2, row);
            if (pf.key === 'inDate' || pf.key === 'outDate') mput(ws, rng, toExcelDate(p[pf.key]), { font: M9, align: c, numFmt: DATE });
            else if (pf.key === 'personalNo') mput(ws, rng, p.personalNo ? String(p.personalNo) : '', { font: M9, align: c });
            else mput(ws, rng, p[pf.key] || '', { font: M9, align: c });
        });
        let rowIns = 0;
        vals.forEach(f => {
            const v = n(p[f.key]);
            tot[f.key] += v;
            if (f.isIns) rowIns += v; // 총계는 4대보험만
            const addr = `${colLetter(f.col)}${row}`;
            if (NA_KEYS.includes(f.key) && v === 0) put(ws, addr, '해당없음', { font: M9, align: c, fill: FILL_NA });
            else put(ws, addr, v, { font: M9, align: c, numFmt: ACC_P });
        });
        insTotal += rowIns;
        put(ws, `P${row}`, insRange(row) ? fx(`SUM(${insRange(row)})`, rowIns) : 0, { font: M9, align: c, numFmt: ACC_P });
    });

    // 합계행 (라벨 없음, 원본과 동일)
    mput(ws, `B${P.sum}:${colLetter(vStart - 1)}${P.sum}`, null, { font: G10, align: center() });
    vals.forEach(f => {
        const cl = colLetter(f.col);
        put(ws, `${cl}${P.sum}`, fx(`SUM(${cl}${P.e0}:${cl}${P.eEnd})`, tot[f.key]), { font: M9, align: center({ shrinkToFit: true }), numFmt: ACC_P });
    });
    put(ws, `P${P.sum}`, fx(`SUM(P${P.e0}:P${P.eEnd})`, insTotal), { font: M9, align: center({ shrinkToFit: true }), numFmt: ACC_P });

    // 테두리 : 전체 thin, 바깥/헤더/보험구간 구분선 medium
    box(ws, P.head, 2, P.sum, 16);
    edge(ws, P.head, 2, P.head, 16, 'top', 'medium');
    edge(ws, P.head, 2, P.head, 16, 'bottom', 'medium');
    edge(ws, P.sum, 2, P.sum, 16, 'bottom', 'medium');
    edge(ws, P.head, 2, P.sum, 2, 'left', 'medium');
    if (insVals.length) edge(ws, P.head, firstIns, P.sum, firstIns, 'left', 'medium');
    edge(ws, P.head, 16, P.sum, 16, 'right', 'medium');

    // 계약 정산항목 표 (B~P)
    if (P.x0) {
        buildExtraTable(ws, d, emps, P.x0, { c0: 2, cEnd: 16, style: {
                font: MALGUN, nameLabel: '이름', titleSize: 11, headSize: 9, bodySize: 9, numFmt: ACC_P,
                headFill: FILL_P2HEAD, titleH: 24, headH: 30, rowH: 22,
            } });
    }

    // ── 정산 특이사항 및 메모 (전체 내용, 줄바꿈 유지) ──
    //   원본의 '※ 공백 대근자 지원' 자리 : 요약표 왼쪽 B~K 를 요약표 높이만큼 병합
    //   요약표보다 길면 요약표는 원래 높이로 두고, 넘치는 만큼 아래로 행을 이어 붙임
    const BOX_ROW_H = 21.75;
    let memoEnd = P.boxEnd;
    if (d.memoText) {
        const needPt = countLines(d.memoText, sumColWidth(ws, 2, 11)) * MEMO_LINE_PT + 6;
        const boxPt = (P.boxEnd - P.box0 + 1) * BOX_ROW_H;
        if (needPt > boxPt) memoEnd = P.boxEnd + Math.ceil((needPt - boxPt) / BOX_ROW_H);
        mput(ws, `B${P.box0}:K${memoEnd}`, String(d.memoText), {
            font: G10, align: { horizontal: 'left', vertical: 'top', wrapText: true },
        });
        lastRow = Math.max(lastRow, memoEnd);
    }

    // 요약표 (L:N 라벨, O:P 금액)
    const est = n(d.estimate?.total);
    const diffCalc = insTotal - est;
    const boxVal = {
        fee: n(s.monthlyFee), annual: n(s.annualLeave), sev: n(s.severance),
        est, act: fx(`P${P.sum}`, insTotal),
        // 4대보험 차액: 자동계산값과 같으면 원본처럼 수식, 수동 수정값이면 값 그대로
        diff: n(s.insuranceDiff) === diffCalc ? fx(`O${boxRowOf.act}-O${boxRowOf.est}`, diffCalc) : n(s.insuranceDiff),
    };
    custom.forEach((c, i) => { boxVal[`c${i}`] = n(c.amount); });
    const sumKeys = ['fee', 'annual', 'sev', 'diff', ...custom.map((_, i) => `c${i}`)].filter(k => boxRowOf[k]);
    boxVal.grand = fx(`ROUNDDOWN(${sumKeys.map(k => `O${boxRowOf[k]}`).join('+')},-1)`, n(s.grandTotal));

    boxRows.forEach((b) => {
        const row = boxRowOf[b.key];
        const strong = b.key === 'fee' || b.key === 'grand';
        const lf = { name: GULIM, size: b.key === 'est' || b.key === 'act' ? 8 : (strong ? 11 : 10), bold: strong };
        mput(ws, `L${row}:N${row}`, b.label, { font: lf, align: center({ shrinkToFit: true }), fill: strong ? FILL_SUMBOX : undefined });
        mput(ws, `O${row}:P${row}`, boxVal[b.key], { font: { name: GULIM, size: 11, bold: strong },
            align: { horizontal: 'right', vertical: 'middle', shrinkToFit: true }, numFmt: NUM_R, fill: strong ? FILL_SUMBOX : undefined });
    });
    box(ws, P.box0, 12, P.boxEnd, 16, 'medium', 'thin');
    edge(ws, P.box0, 12, P.box0, 16, 'bottom', 'medium');
    edge(ws, boxRowOf.diff, 12, boxRowOf.diff, 16, 'top', 'medium');
    edge(ws, P.boxEnd, 12, P.boxEnd, 16, 'top', 'medium');
    edge(ws, P.box0, 15, P.boxEnd, 15, 'left', 'medium');

    // 2페이지 행 높이
    Object.assign(hm, { [P.title]: 30, [P.title + 1]: 30, [P.siteRow]: 26.25, [P.head]: 47.25, [P.sum]: 24.75 });
    for (let rr = P.e0; rr <= P.eEnd; rr++) hm[rr] = 26.25;
    for (let rr = P.box0; rr <= memoEnd; rr++) hm[rr] = BOX_ROW_H;
    if (lastRow > memoEnd) hm[lastRow] = 17.25;
    setHeights(ws, hm);

    // 이미지 (원본 앵커 좌표, EMU)
    addImage(wb, ws, images, 'ecoLogo', [5, 517551, 0, 0], [10, 461277, 2, 476249]);
    addImage(wb, ws, images, 'ecoStamp', [11, 222803, ceoRow - 2, 16626], [12, 399837, ceoRow + 1, 11244]);
    addImage(wb, ws, images, 'ecoLogoSmall', [1, 56195, P.title, 65493], [4, 131566, P.title + 1, 114048]);

    return {
        p1End, lastRow, printCols: 'Q',
        margins: { left: 0.354, right: 0.354, top: 0.984, bottom: 0.512, header: 0.3, footer: 0.3 },
    };
}

// ──────────────────────────────────────────────────────────────
// 1번 양식 별도 시트 : 급여대장 (원본 '급여대장26.03' 시트, 가로 인쇄)
//   지급항목 열은 데이터에 있는 항목만큼 동적으로, 공제항목 열은 고정
// ──────────────────────────────────────────────────────────────
function buildLedgerSheet(wb, d, images) {
    const L = d.ledger;
    if (!L || !L.rows || !L.rows.length) return;
    const mm2 = String(d.mm).padStart(2, '0');
    const ws = wb.addWorksheet(`급여대장${String(d.yyyy).slice(2)}.${mm2}`, { views: [{ showGridLines: false, zoomScale: 100 }] });

    const payCols = L.payCols || [];
    const r = d.rates || {};
    const DEDS = [
        ['nationalPension', `국민\n연금\n(${r.nationalPension}%)`, 8],
        ['healthInsurance', `건강\n보험\n(${r.healthInsurance}%)`, 10],
        ['longTermCare', `노인\n장기요양\n(${r.longTermCare}%)`, 8],
        ['unemployment', `실업급여\n(${r.employmentInsurance}%)`, 9],
        ['incomeTax', '갑근세', 9],
        ['localTax', '주민세', 9],
        ['etcDeduct', '기타공제', 8],
    ];
    const cPay0 = 6;
    const cGross = cPay0 + payCols.length;
    const cDed0 = cGross + 1;
    const cDedSum = cDed0 + DEDS.length;
    const cNet = cDedSum + 1;
    const last = colLetter(cNet);
    const CL = colLetter;

    const widths = [4.5, 7.125, 7.75, 10.125, 4.625];
    payCols.forEach((_, i) => widths.push(i === 0 ? 8.25 : 7.625));
    widths.push(8.625);
    DEDS.forEach(() => widths.push(7.625));
    widths.push(9.25, 11.125);
    setWidths(ws, widths);

    const G = (size, bold = false) => ({ name: GULIM, size, bold });
    mput(ws, `A2:${last}3`, `  ${d.yyyy}년 ${mm2}월  급여대장`, { font: G(18, true), align: center() });
    put(ws, 'A5', `단지명: ${d.siteName}`, { font: G(12, true), align: { vertical: 'middle' } });

    // 헤더 (6~7행)
    const H1 = 6, H2 = 7;
    const hc = center({ wrapText: true });
    const vh = (c, t, f) => mput(ws, `${CL(c)}${H1}:${CL(c)}${H2}`, t, { font: f, align: hc });
    vh(1, 'NO', G(10)); vh(2, '성명', G(10)); vh(3, '생년월일', G(10));
    put(ws, `D${H1}`, '입사일자', { font: G(8), align: hc });
    put(ws, `D${H2}`, '퇴사일자', { font: G(8), align: hc });
    vh(5, '근무\n일수', G(10));
    payCols.forEach((pc, i) => vh(cPay0 + i, pc.name, G(10)));
    vh(cGross, '합계', G(10, true));
    DEDS.forEach(([, t, sz], i) => vh(cDed0 + i, t, G(sz)));
    vh(cDedSum, '공제합계', G(10, true));
    vh(cNet, '총계', G(10, true));

    const e0 = 8;
    const rows = orderByGroup(L.rows);
    const eEnd = e0 + rows.length - 1;
    const tr = eEnd + 1;
    const c9 = center({ shrinkToFit: true });
    const colTot = {};
    const addT = (c, v) => { colTot[c] = (colTot[c] || 0) + v; };

    rows.forEach((row, i) => {
        const rr = e0 + i;
        put(ws, `B${rr}`, row.empName || '', { font: G(10), align: c9 });
        put(ws, `C${rr}`, row.personalNo ? String(row.personalNo) : '', { font: G(9), align: c9 });
        // 입사일(퇴사일이 있으면 두 줄)
        const inD = row.inDate ? String(row.inDate).substring(0, 10) : '';
        const outD = row.outDate ? String(row.outDate).substring(0, 10) : '';
        put(ws, `D${rr}`, outD ? `${inD}\n${outD}` : toExcelDate(inD), { font: G(8), align: center({ wrapText: !!outD }), numFmt: DATE });
        put(ws, `E${rr}`, n(row.workDays) || d.lastDay, { font: G(10), align: c9 });

        let gross = 0;
        payCols.forEach((pc, pi) => {
            const v = n(row.pays?.[pc.code]);
            gross += v; addT(cPay0 + pi, v);
            put(ws, `${CL(cPay0 + pi)}${rr}`, v || null, { font: G(10), align: c9, numFmt: ACC_P });
        });
        addT(cGross, gross);
        put(ws, `${CL(cGross)}${rr}`, payCols.length ? fx(`SUM(${CL(cPay0)}${rr}:${CL(cGross - 1)}${rr})`, gross) : 0,
            { font: G(10, true), align: c9, numFmt: ACC_P });

        let ded = 0;
        DEDS.forEach(([k], di) => {
            const v = n(row[k]);
            ded += v; addT(cDed0 + di, v);
            const addr = `${CL(cDed0 + di)}${rr}`;
            if (NA_KEYS.includes(k) && v === 0) put(ws, addr, '해당없음', { font: G(9), align: c9, fill: FILL_NA });
            else put(ws, addr, v || null, { font: G(10), align: c9, numFmt: ACC_P });
        });
        addT(cDedSum, ded); addT(cNet, gross - ded);
        put(ws, `${CL(cDedSum)}${rr}`, fx(`SUM(${CL(cDed0)}${rr}:${CL(cDedSum - 1)}${rr})`, ded), { font: G(10, true), align: c9, numFmt: ACC_P });
        put(ws, `${CL(cNet)}${rr}`, fx(`${CL(cGross)}${rr}-${CL(cDedSum)}${rr}`, gross - ded), { font: G(10, true), align: c9, numFmt: ACC_P });
    });

    // NO : 묶음(join) 행은 세로 병합 (정산내역서와 동일한 번호)
    groupRuns(rows).forEach((g, gi) => mput(ws, `A${e0 + g.start}:A${e0 + g.end}`, gi + 1, { font: G(10), align: c9 }));
    mput(ws, `A${tr}:E${tr}`, '합   계', { font: G(10, true), align: center() });
    for (let c = cPay0; c <= cNet; c++) {
        put(ws, `${CL(c)}${tr}`, fx(`SUM(${CL(c)}${e0}:${CL(c)}${eEnd})`, colTot[c] || 0), { font: G(10, true), align: c9, numFmt: ACC_P });
    }
    box(ws, H1, 1, tr, cNet);

    const hm = { 1: 11.25, 2: 24, 3: 24, 4: 24, 5: 43.5, 6: 20.25, 7: 20.25, [tr]: 24 };
    for (let rr = e0; rr <= eEnd; rr++) hm[rr] = rr === e0 ? 25.5 : 24;
    setHeights(ws, hm);

    addImage(wb, ws, images, 'ecoLogoMini', [0, 66675, tr, 85725], [3, 381000, tr + 1, 295275]);

    ws.pageSetup = {
        paperSize: 9, orientation: 'landscape', scale: 85, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        horizontalCentered: true, printArea: `A1:${last}${tr + 2}`,
        margins: { left: 0.59, right: 0.2, top: 1.14, bottom: 0.75, header: 0.3, footer: 0.3 },
    };
}

// ──────────────────────────────────────────────────────────────
// 가로형 상세 시트 (원본 '상세26.08' 시트 형태)
//   정산항목(경비·일반관리비·이윤)까지 들어가 세로 한 장에 담기 어려울 때 사용.
//   엑셀은 용지 방향을 '시트 단위'로만 정할 수 있으므로,
//   1페이지(청구공문/청구서)는 세로 시트에 두고 상세 내역을 가로 시트로 분리합니다.
//
//   ① 산출내역서 : 계약서의 직책별 단가 + (단가 × 인원) 합계
//   ② 직원별 내역 : 계 / 견적서 금액(①의 합계) / 정산차액 / 당월 청구금액
//   컬럼 : 급여(지급항목…, 계) · 연차 · 퇴직 · 간접노무비(4대보험) · 제경비(합산) · 일반관리비 · 기업이윤 · 계
// ──────────────────────────────────────────────────────────────
// 상세 출력 방향 (자동) : 정산항목(경비·일반관리비·기업이윤)이 있으면 가로, 없으면 세로
function resolveLandscape(d) {
    return (d.extraCols || []).length > 0;
}

function detailFields(d, cols) {
    const r = d.rates || {};
    const f = [];
    // 급여
    const payCols = d.payCols || [];
    payCols.forEach(pc => f.push({ key: `pay:${pc.code}`, label: pc.name, group: 'pay', get: (p) => n(p.pays?.[pc.code]) }));
    f.push({ key: 'grossPay', label: payCols.length ? '계' : '급여', group: payCols.length ? 'pay' : null, sumStart: true,
        get: (p) => n(p.grossPay) || payCols.reduce((s, pc) => s + n(p.pays?.[pc.code]), 0) });
    // 연차/퇴직 : 요약에서 차감(관리소 적립)되는 경우 원본처럼 '관리소적립' 표시
    if (cols.annualLeave) f.push({ key: 'annualLeave', label: '연차\n적립금', text: n(d.summary?.annualLeave) < 0 ? '관리소적립' : null, get: (p) => n(p.annualLeave) });
    if (cols.severance) f.push({ key: 'severance', label: '퇴직\n적립금', text: n(d.summary?.severance) < 0 ? '관리소적립' : null, get: (p) => n(p.severance) });
    // 간접노무비 (4대보험)
    insuranceFields(cols, r).forEach(x => f.push({ ...x, group: 'ins', get: (p) => n(p[x.key]) }));
    // 제경비 : 경비 항목은 원본처럼 한 칸으로 합산
    const ex = d.extraCols || [];
    const expense = ex.filter(c => c.group === 'expense');
    if (expense.length) {
        f.push({ key: 'expense', label: `제경비\n(${expense.map(c => c.name).join('·')})`, small: true,
            codes: expense.map(c => c.code), get: (p) => expense.reduce((s, c) => s + n(p.extras?.[c.code]), 0) });
    }
    ex.filter(c => c.group !== 'expense').forEach(c =>
        f.push({ key: `x:${c.code}`, label: c.name, codes: [c.code], get: (p) => n(p.extras?.[c.code]) }));
    f.push({ key: 'total', label: '계', isTotal: true });
    return f;
}

// 필드 key → 계약서 직책별 금액 (d.contractStaff[].values 는 모달에서 같은 key 로 전달)
function contractFieldValue(field, v = {}) {
    if (field.key === 'grossPay') return n(v.grossPay);
    if (field.key.startsWith('pay:')) return n(v.pays?.[field.key.slice(4)]);
    if (field.codes) return field.codes.reduce((s, c) => s + n(v.extras?.[c]), 0);
    if (field.empGroup === 'first') return n(v.employment);
    if (field.empGroup === 'second') return null; // 고용보험은 실업급여 칸과 병합
    return n(v[field.key]);
}

function buildDetailSheet(wb, form, d, images) {
    const mm2 = String(d.mm).padStart(2, '0');
    const ws = wb.addWorksheet(`상세${String(d.yyyy).slice(2)}.${mm2}`, { views: [{ showGridLines: false, zoomScale: 100 }] });
    const cols = resolveColumns(d);
    const fields = detailFields(d, cols);
    const emps = orderByGroup(d.payroll || []);
    const staff = d.contractStaff || [];
    const cl = colLetter;

    // ── 열 배치 : A~F 인적사항, G~ 값 ──
    const C0 = 7;
    fields.forEach((f, i) => { f.col = C0 + i; });
    const lastC = C0 + fields.length - 1;
    const L = cl(lastC);
    const totF = fields[fields.length - 1];
    const sumStartCol = fields.find(f => f.sumStart).col;
    const widths = [4.625, 8, 6.5, 8.5, 8.75, 8.375];
    fields.forEach(f => widths.push(f.isTotal ? 10.5 : f.key === 'grossPay' ? 9.5 : f.small ? 11 : f.group === 'ins' ? 8 : 8.9));
    setWidths(ws, widths);

    const F = (size, bold = false) => ({ name: MALGUN, size, bold });
    const hOpt = (sz = 10) => ({ font: F(sz), align: center({ wrapText: true }), fill: FILL_HEAD });
    const sc = center({ shrinkToFit: true });
    const NUMF = form === SETTLE_FORM.OFFICIAL ? ACC_P : ACC;

    // 제목
    mput(ws, `A2:${L}2`, `${d.yyyy}년 ${d.mm}월 ${d.typeName}용역비 정산내역서`, { font: F(18, true), align: center() });
    put(ws, 'A3', `단지명: ${d.siteName}`, { font: F(11), align: { vertical: 'middle' } });
    const hm = { 2: 33, 3: 20 };

    // 헤더 2행 (그룹 → 항목) — 두 표가 같은 헤더 사용
    const GROUP_LABEL = { pay: '급여', ins: '간접노무비' };
    const writeHeader = (h1, leftCells) => {
        const h2 = h1 + 1;
        leftCells.forEach(([range, label]) => mput(ws, range, label, hOpt()));
        for (let i = 0; i < fields.length; i++) {
            const f = fields[i];
            if (f.group && GROUP_LABEL[f.group]) {
                let j = i; while (j + 1 < fields.length && fields[j + 1].group === f.group) j++;
                if (i === 0 || fields[i - 1].group !== f.group) {
                    mput(ws, `${cl(f.col)}${h1}:${cl(fields[j].col)}${h1}`, GROUP_LABEL[f.group], hOpt());
                }
                if (f.empGroup === 'first') {
                    put(ws, `${cl(f.col)}${h2}`, f.label, hOpt(8));
                } else if (f.empGroup === 'second') {
                    put(ws, `${cl(f.col)}${h2}`, f.label, hOpt(8));
                } else {
                    put(ws, `${cl(f.col)}${h2}`, f.label, hOpt(f.group === 'ins' ? 8 : 9));
                }
            } else {
                mput(ws, `${cl(f.col)}${h1}:${cl(f.col)}${h2}`, f.label, hOpt(f.small ? 7 : 9));
            }
        }
        hm[h1] = 24; hm[h2] = 36;
    };

    // ════ ① 산출내역서 (계약 직책별) ════
    let row = 5;
    let cTotalRow = null;
    const cTot = {}; // 계약 합계 (견적서 금액)
    if (staff.length) {
        const h1 = row;
        writeHeader(h1, [[`F${h1}:F${h1 + 1}`, '직책']]);
        const s0 = h1 + 2;
        staff.forEach((st, i) => {
            const r = s0 + i;
            put(ws, `F${r}`, `${st.name}${st.count > 1 ? ` (${st.count}명)` : ''}`, { font: F(9), align: sc });
            fields.forEach(f => {
                if (f.isTotal) return;
                const v = contractFieldValue(f, st.values);
                if (v === null) return;
                const rng = f.empGroup === 'first' ? `${cl(f.col)}${r}:${cl(f.col + 1)}${r}` : `${cl(f.col)}${r}`;
                mput(ws, rng, v, { font: F(9), align: sc, numFmt: NUMF });
            });
            put(ws, `${cl(totF.col)}${r}`, fx(`SUM(${cl(sumStartCol)}${r}:${cl(totF.col - 1)}${r})`,
                    fields.filter(f => !f.isTotal && f.col >= sumStartCol).reduce((s, f) => s + (contractFieldValue(f, st.values) || 0), 0)),
                { font: F(9, true), align: sc, numFmt: NUMF });
            hm[r] = 20.25;
        });
        // 계 = Σ 단가 × 인원
        cTotalRow = s0 + staff.length;
        put(ws, `F${cTotalRow}`, '계', { font: F(9, true), align: center() });
        fields.forEach(f => {
            if (f.empGroup === 'second') return;
            const c = cl(f.col);
            const expr = staff.map((st, i) => `${c}${s0 + i}*${Math.max(1, n(st.count))}`).join('+');
            const val = f.isTotal
                ? staff.reduce((s, st) => s + fields.filter(x => !x.isTotal && x.col >= sumStartCol).reduce((a, x) => a + (contractFieldValue(x, st.values) || 0), 0) * Math.max(1, n(st.count)), 0)
                : staff.reduce((s, st) => s + (contractFieldValue(f, st.values) || 0) * Math.max(1, n(st.count)), 0);
            cTot[f.key] = val;
            const rng = f.empGroup === 'first' ? `${c}${cTotalRow}:${cl(f.col + 1)}${cTotalRow}` : `${c}${cTotalRow}`;
            mput(ws, rng, fx(expr, val), { font: F(9, true), align: sc, numFmt: NUMF });
        });
        hm[cTotalRow] = 20.25;
        mput(ws, `A${h1}:E${cTotalRow}`, '산출내역서', { font: F(12, true), align: center() });
        box(ws, h1, 1, cTotalRow, lastC);
        edge(ws, cTotalRow, 1, cTotalRow, lastC, 'top', 'medium');
        row = cTotalRow + 2;
    }

    // ════ ② 직원별 내역 ════
    const h1 = row;
    writeHeader(h1, [
        [`A${h1}:A${h1 + 1}`, 'NO'], [`B${h1}:B${h1 + 1}`, '직책'], [`C${h1}:C${h1 + 1}`, '성명'],
        [`D${h1}:D${h1 + 1}`, '생년월일'], [`E${h1}:E${h1 + 1}`, '입사일'], [`F${h1}:F${h1 + 1}`, '퇴사일'],
    ]);
    const e0 = h1 + 2;
    const eEnd = e0 + Math.max(emps.length, 1) - 1;
    const bodyF = F(9);
    groupRuns(emps).forEach((g, gi) => mput(ws, `A${e0 + g.start}:A${e0 + g.end}`, gi + 1, { font: F(10), align: center() }));
    const tot = {};
    emps.forEach((p, i) => {
        const r = e0 + i;
        put(ws, `B${r}`, p.position || '', { font: bodyF, align: sc });
        put(ws, `C${r}`, p.empName || '', { font: bodyF, align: sc });
        put(ws, `D${r}`, p.personalNo ? String(p.personalNo) : '', { font: F(8), align: sc });
        put(ws, `E${r}`, toExcelDate(p.inDate), { font: F(8), align: sc, numFmt: DATE });
        put(ws, `F${r}`, toExcelDate(p.outDate), { font: F(8), align: sc, numFmt: DATE });
        let rowSum = 0;
        fields.forEach(f => {
            if (f.isTotal) return;
            const addr = `${cl(f.col)}${r}`;
            const v = f.get(p);
            if (f.text) { put(ws, addr, f.text, { font: F(8), align: sc }); tot[f.key] = tot[f.key] || 0; return; }
            tot[f.key] = (tot[f.key] || 0) + v;
            if (f.col >= sumStartCol) rowSum += v;
            if (NA_KEYS.includes(f.key) && v === 0) put(ws, addr, '해당없음', { font: F(8), align: sc, fill: FILL_NA });
            else put(ws, addr, v, { font: bodyF, align: sc, numFmt: NUMF });
        });
        tot.total = (tot.total || 0) + rowSum;
        put(ws, `${cl(totF.col)}${r}`, fx(`SUM(${cl(sumStartCol)}${r}:${cl(totF.col - 1)}${r})`, rowSum), { font: F(9, true), align: sc, numFmt: NUMF });
        hm[r] = 20.25;
    });

    // 계 / 견적서 금액 / 정산차액 / 당월 청구금액
    const sumRow = eEnd + 1, estRow = sumRow + 1, diffRow = estRow + 1, billRow = diffRow + 1;
    mput(ws, `A${sumRow}:F${sumRow}`, '계', { font: F(10, true), align: center() });
    mput(ws, `A${estRow}:F${estRow}`, '견적서 금액', { font: F(10), align: center() });
    mput(ws, `A${diffRow}:F${diffRow}`, '정산차액', { font: F(10), align: center() });
    mput(ws, `A${billRow}:F${billRow}`, '당월 청구금액', { font: F(11, true), align: center(), fill: FILL_SUMBOX });
    fields.forEach(f => {
        const c = cl(f.col);
        put(ws, `${c}${sumRow}`, fx(`SUM(${c}${e0}:${c}${eEnd})`, tot[f.key] || 0), { font: F(9, true), align: sc, numFmt: NUMF });
        if (f.empGroup === 'second') return;
        const c2 = f.empGroup === 'first' ? cl(f.col + 1) : c;
        const rngE = `${c}${estRow}:${c2}${estRow}`, rngD = `${c}${diffRow}:${c2}${diffRow}`;
        const estV = n(cTot[f.key]);
        mput(ws, rngE, cTotalRow ? fx(`${c}${cTotalRow}`, estV) : 0, { font: F(9), align: sc, numFmt: NUMF });
        const actV = n(tot[f.key]) + (f.empGroup === 'first' ? n(tot.empStability) : 0);
        const dExpr = f.empGroup === 'first' ? `${c}${sumRow}+${c2}${sumRow}-${c}${estRow}` : `${c}${sumRow}-${c}${estRow}`;
        mput(ws, rngD, fx(dExpr, actV - estV), { font: F(9, true), align: sc, numFmt: NUMF });
    });
    // 당월 청구금액 : 화면 정산 요약의 최종 금액 (청구서 1페이지와 동일)
    mput(ws, `G${billRow}:${cl(totF.col - 1)}${billRow}`, null, { fill: FILL_SUMBOX });
    put(ws, `${cl(totF.col)}${billRow}`, n(d.summary?.grandTotal), { font: F(11, true), align: sc, numFmt: NUMF, fill: FILL_SUMBOX });
    Object.assign(hm, { [sumRow]: 20.25, [estRow]: 20.25, [diffRow]: 20.25, [billRow]: 22 });

    box(ws, h1, 1, billRow, lastC);
    edge(ws, sumRow, 1, sumRow, lastC, 'top', 'medium');
    edge(ws, billRow, 1, billRow, lastC, 'top', 'medium');

    // 메모 (전체 내용, 줄바꿈 유지)
    let lastRow = billRow;
    if (d.memoText) {
        const r = billRow + 2;
        mput(ws, `A${r}:${L}${r}`, String(d.memoText), { font: F(10), align: { horizontal: 'left', vertical: 'top', wrapText: true } });
        hm[r] = Math.min(409, countLines(d.memoText, sumColWidth(ws, 1, lastC)) * MEMO_LINE_PT + 6);
        lastRow = r;
    }
    setHeights(ws, hm);

    ws.pageSetup = {
        paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        horizontalCentered: true, printArea: `A1:${L}${lastRow}`,
        margins: { left: 0.2, right: 0.2, top: 0.6, bottom: 0.4, header: 0.2, footer: 0.2 },
    };
    return ws;
}

// ══════════════════════════════════════════════════════════════
// 연차·퇴직금 정산서 (원본 '이지연차퇴직금양식.xlsx', 이지종합관리 공문형)
//   1페이지 : 청구공문 (구분 = 연차 / 퇴직금 / 합계, 면적별 산출내역, 입금계좌, 대표이사 직인)
//   2페이지 : 연차 청구내역 · 퇴직금 청구내역 (직원 1명당 2행)
//   DB 템플릿({{치환}}) 방식이 아니라 셀/병합/테두리/이미지를 코드로 직접 그립니다.
// ══════════════════════════════════════════════════════════════
const EST_COMPANY = {
    name: '주식회사 이지종합관리',
    headerLine: '경기 파주시 돌단풍길 59 상가 1층     TEL. 031-906-2002 FAX. 031-906-2211',
};
const xlRound10 = (v) => Math.sign(v) * Math.round(Math.abs(v) / 10) * 10;  // 엑셀 ROUND(x,-1)
const xlFloor10 = (v) => Math.sign(v) * Math.floor(Math.abs(v) / 10) * 10;  // 엑셀 ROUNDDOWN(x,-1)

/**
 * @param {object} d  모달에서 수집한 데이터
 *   { docNo, billingDtText, billingDtShort, siteName, receiver, title, bankInfo,
 *     isVat, underArea, overArea,
 *     annualItems: [{ empName, joinDate, middleText, period, basis, amount, note }],
 *     retireItems: [{ empName, joinDate, endDate, period, basis, amount, note }] }
 */
export async function buildEstimateExcelBuffer(d, images = {}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = EST_COMPANY.name;
    const ws = wb.addWorksheet('연차퇴직금정산', { views: [{ showGridLines: false, zoomScale: 100 }] });
    setWidths(ws, [6.125, 9, 5.75, 5.75, 10.875, 8.625, 8.625, 8.625, 8.625, 11.5, 9.625, 7.5, 12.5]);

    const annual = d.annualItems || [];
    const retire = d.retireItems || [];
    const hasA = annual.length > 0, hasR = retire.length > 0;
    const subject = hasA && hasR ? '연차수당 및 퇴직금' : (hasA ? '연차수당' : '퇴직금');

    const M = (size, bold = false) => ({ name: MALGUN, size, bold });
    const G = (size, bold = false) => ({ name: GULIM, size, bold });
    const NB = '\u00a0';
    const hm = {};

    // ════════ 1페이지 : 청구공문 ════════
    mput(ws, 'A5:M5', EST_COMPANY.headerLine, { font: M(9, true), align: { horizontal: 'distributed', vertical: 'middle' }, fill: FILL_ADDR1 });
    [['문서번호', d.docNo], ['시행일자', d.billingDtText], ['수신', d.receiver], ['참조', '경리 담당자'], ['제목', d.title]]
        .forEach(([k, v], i) => {
            const r = 6 + i;
            mput(ws, `A${r}:C${r}`, k, { font: M(12), align: { horizontal: 'distributed', vertical: 'middle' } });
            put(ws, `D${r}`, `:   ${v || ''}`, { font: M(12), align: { vertical: 'middle' } });
        });
    edge(ws, 11, 1, 11, 13, 'bottom', 'medium');
    put(ws, 'A13', `${NB.repeat(7)}1. 귀 아파트 입주자대표회의 및 관리사무소의 무궁한 발전을 기원합니다.`, { font: M(12), align: { horizontal: 'left', vertical: 'middle' } });
    put(ws, 'A14', `${NB.repeat(7)}2. ${subject}을 아래와 같이 청구하오니 검토하시여 결재를 부탁드립니다.`, { font: M(12), align: { horizontal: 'left', vertical: 'middle' } });
    mput(ws, 'A15:M15', '-     아     래   -', { font: M(14), align: center() });

    // 2페이지 행 배치를 먼저 계산 (1페이지 청구표가 2페이지 합계를 수식으로 참조)
    const P2 = 44;
    let row = P2 + 2;                       // 46 : 제목
    const titleRow = row; row += 1;         // 47 : 단지명
    const siteRow = row; row += 1;          // 48 : 첫 블록 시작
    const blockLayout = (items) => {
        const b = { t0: row };                // 블록 제목 2행 (t0, t0+1)
        b.head = b.t0 + 2;
        b.e0 = b.head + 1;
        b.eEnd = b.e0 + Math.max(items.length, 1) * 2 - 1;
        b.sum = b.eEnd + 1;
        row = b.sum + 2;                      // 블록 사이 한 줄
        return b;
    };
    const LA = hasA ? blockLayout(annual) : null;
    const LR = hasR ? blockLayout(retire) : null;
    const lastRow = row - 2;

    // 청구표
    const f11 = M(11);
    mput(ws, 'B17:E17', '구분', { font: f11, align: center() });
    mput(ws, 'F17:I17', '산 출 금 액', { font: f11, align: center() });
    mput(ws, 'J17:L17', '비    고', { font: f11, align: center() });
    const aTotal = annual.reduce((s, x) => s + n(x.amount), 0);
    const rTotal = retire.reduce((s, x) => s + n(x.amount), 0);
    const grand = xlFloor10(aTotal + rTotal);
    mput(ws, 'B18:E18', '연차', { font: f11, align: center() });
    mput(ws, 'F18:I18', LA ? fx(`K${LA.sum}`, aTotal) : 0, { font: f11, align: center(), numFmt: NUM });
    mput(ws, 'J18:L18', null, { font: M(10), align: center() });
    mput(ws, 'B19:E19', '퇴직금', { font: f11, align: center() });
    mput(ws, 'F19:I19', LR ? fx(`K${LR.sum}`, rTotal) : 0, { font: f11, align: center(), numFmt: NUM });
    mput(ws, 'J19:L19', null, { font: M(10), align: center() });
    mput(ws, 'B20:E20', '합계', { font: f11, align: center() });
    mput(ws, 'F20:I20', fx('ROUNDDOWN(SUM(F18:I19),-1)', grand), { font: M(11, true), align: center(), numFmt: NUM });
    mput(ws, 'J20:L20', '(원단위절사)', { font: M(9), align: center() });
    box(ws, 17, 2, 20, 12);
    // 원본처럼 내역이 없는 구분 행은 숨김 (합계 수식에는 그대로 포함)
    if (!hasA) ws.getRow(18).hidden = true;
    if (!hasR) ws.getRow(19).hidden = true;

    // 면적별 산출내역 (과세 사업장만 표시, 원본 수식 그대로)
    {
        const uA = n(d.underArea), oA = n(d.overArea), sumA = uA + oA;
        const unit = sumA > 0 ? grand / sumA : 0;
        const uS = xlRound10(uA * unit), oS = xlRound10(oA * unit), oV = xlFloor10(oS * 0.1);
        const c = center({ shrinkToFit: true });
        const hdr = [['B22:D22', '면적(㎡) 구분'], ['E22:F22', '관리면적/㎡'], ['G22', '단가'], ['H22:I22', '공급가액'], ['J22', '세액'], ['K22:L22', '합계']];
        hdr.forEach(([r, t]) => mput(ws, r, t, { font: f11, align: center({ wrapText: true }) }));
        mput(ws, 'B23:D23', '135㎡ 이하', { font: f11, align: c });
        mput(ws, 'E23:F23', uA, { font: f11, align: c, numFmt: AREA });
        mput(ws, 'G23:G24', fx('F20/E25', unit), { font: f11, align: c, numFmt: NUM2 });
        mput(ws, 'H23:I23', fx('ROUND(E23*G23,-1)', uS), { font: f11, align: c, numFmt: NUM });
        mput(ws, 'J23', null, { font: f11, align: c, numFmt: NUM });
        mput(ws, 'K23:L23', fx('SUM(H23:J23)', uS), { font: f11, align: c, numFmt: NUM });
        mput(ws, 'B24:D24', '135㎡ 초과', { font: f11, align: c });
        mput(ws, 'E24:F24', oA, { font: f11, align: c, numFmt: AREA });
        mput(ws, 'H24:I24', fx('ROUND(E24*G23,-1)', oS), { font: f11, align: c, numFmt: NUM });
        mput(ws, 'J24', fx('ROUNDDOWN(H24*10%,-1)', oV), { font: f11, align: c, numFmt: NUM });
        mput(ws, 'K24:L24', fx('SUM(H24:J24)', oS + oV), { font: f11, align: c, numFmt: NUM });
        mput(ws, 'B25:D25', null, { font: f11, align: c });
        mput(ws, 'E25:F25', fx('SUM(E23:F24)', sumA), { font: f11, align: c, numFmt: AREA });
        mput(ws, 'H25:I25', fx('SUM(H23:I24)', uS + oS), { font: f11, align: c, numFmt: NUM });
        mput(ws, 'J25', fx('SUM(J23:J24)', oV), { font: f11, align: c, numFmt: NUM });
        mput(ws, 'K25:L25', fx('SUM(H25:J25)', uS + oS + oV), { font: M(11, true), align: c, numFmt: NUM });
        box(ws, 22, 2, 25, 12);
        if (!isTaxable(d)) for (let r = 21; r <= 25; r++) ws.getRow(r).hidden = true;
    }

    mput(ws, 'A26:M26', `${NB}${NB}입금계좌 : ${d.bankInfo || ''}`, { font: M(12), align: { horizontal: 'left', vertical: 'middle', shrinkToFit: true } });
    put(ws, 'L30', d.billingDtShort || '', { font: f11, align: { horizontal: 'right', vertical: 'middle' } });
    mput(ws, 'A38:M38', `${EST_COMPANY.name}    대표이사`, { font: M(19, true), align: center() });

    Object.assign(hm, { 1: 17.25, 4: 17.25, 5: 17.45, 6: 24.95, 7: 24.95, 8: 24.95, 9: 24.95, 10: 24.95, 11: 6.75, 12: 6.75,
        13: 36.75, 14: 36.75, 15: 36.75, 16: 9, 26: 20.25, 33: 20.25, 34: 20.25, 35: 20.25, 36: 20.25, 37: 42, 38: 36.75 });
    for (let r = 17; r <= 25; r++) hm[r] = 30;

    addImage(wb, ws, images, 'egTotalLogo', [2, 97996, 0, 68563], [10, 684513, 4, 1888]);
    addImage(wb, ws, images, 'stamp', [9, 777530, 36, 252455], [11, 185326, 39, 76200]);

    // ════════ 2페이지 : 청구내역 ════════
    mput(ws, `A${titleRow}:M${titleRow}`, hasA && hasR ? '연차 · 퇴직금 정산' : (hasA ? '연차 정산' : '퇴직금 정산'),
        { font: M(18, true), align: center() });
    put(ws, `A${siteRow}`, `단지명: ${d.siteName || ''}`, { font: M(14), align: { vertical: 'middle' } });
    Object.assign(hm, { [titleRow]: 35.1, [siteRow]: 35.1 });

    const drawBlock = (L, items, kind) => {
        mput(ws, `A${L.t0}:M${L.t0 + 1}`, kind === 'A' ? '연차 청구내역' : '퇴직금 청구내역', { font: M(16, true), align: center() });
        box(ws, L.t0, 1, L.t0 + 1, 13);
        const heads = [['A', 'B', '성명'], ['C', 'D', '입사일'], ['E', 'E', kind === 'A' ? '중간정산일' : '퇴사일'],
            ['F', 'G', '정산기간'], ['H', 'J', '산출내역'], ['K', 'L', '금액'], ['M', 'M', '비고']];
        heads.forEach(([a, b, t]) => mput(ws, `${a}${L.head}:${b}${L.head}`, t, { font: G(11), align: center() }));
        const sc = center({ shrinkToFit: true });
        let total = 0;
        items.forEach((it, i) => {
            const r1 = L.e0 + i * 2, r2 = r1 + 1;
            mput(ws, `A${r1}:B${r2}`, it.empName || '', { font: G(10), align: sc });
            mput(ws, `C${r1}:D${r2}`, toExcelDate(it.joinDate), { font: G(9), align: sc, numFmt: DATE });
            mput(ws, `E${r1}:E${r2}`, kind === 'A' ? (it.middleText || '') : toExcelDate(it.endDate), { font: G(9), align: sc, numFmt: DATE });
            mput(ws, `F${r1}:G${r2}`, it.period || '', { font: G(10), align: sc });
            mput(ws, `H${r1}:J${r2}`, it.basis || '', { font: G(10), align: center({ wrapText: true }) });
            const v = n(it.amount); total += v;
            mput(ws, `K${r1}:L${r2}`, v, { font: G(10), align: sc, numFmt: ACC });
            mput(ws, `M${r1}:M${r2}`, it.note || '', { font: G(9), align: center({ wrapText: true }) });
            hm[r1] = 23.1; hm[r2] = 23.1;
        });
        mput(ws, `A${L.sum}:J${L.sum}`, '합  계', { font: G(12, true), align: center() });
        mput(ws, `K${L.sum}:L${L.sum}`, fx(`SUM(K${L.e0}:L${L.eEnd})`, total), { font: G(10, true), align: sc, numFmt: ACC });
        mput(ws, `M${L.sum}`, null, { font: G(10) });
        box(ws, L.head, 1, L.sum, 13);
        Object.assign(hm, { [L.t0]: 24.95, [L.t0 + 1]: 24.95, [L.head]: 23.1, [L.sum]: 45, [L.sum + 1]: 10.5 });
    };
    if (LA) drawBlock(LA, annual, 'A');
    if (LR) drawBlock(LR, retire, 'R');

    setHeights(ws, hm);
    ws.getRow(43).addPageBreak();
    ws.pageSetup = {
        paperSize: 9, orientation: 'portrait', scale: 70, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        horizontalCentered: true, printArea: `A1:M${lastRow}`,
        margins: { left: 0.709, right: 0.709, top: 0.748, bottom: 0.748, header: 0.3, footer: 0.3 },
    };
    wb.calcProperties.fullCalcOnLoad = true;
    const buf = await wb.xlsx.writeBuffer();
    return patchDefaultFont(buf);
}

// ──────────────────────────────────────────────────────────────
// 진입점
// ──────────────────────────────────────────────────────────────
/**
 * @param {1|2} form  SETTLE_FORM.OFFICIAL(1, 안산고잔형) | SETTLE_FORM.INVOICE(2, 가락극동형)
 * @param {object} d   collectSettleExcelData() 결과
 * @param {object} images  loadSettleImages() 결과 (없으면 이미지 없이 생성)
 * @param {object} opt  { includeLedger } 1번 양식에 급여대장 시트 포함 여부
 * @returns {Promise<ArrayBuffer>}
 */
export async function buildSettleExcelBuffer(form, d, images = {}, opt = {}) {
    // 상세 출력 방향 : 정산항목이 있으면 가로 상세 시트, 없으면 세로 (자동)
    d = { ...d, _landscape: resolveLandscape(d) };
    const wb = new ExcelJS.Workbook();
    wb.creator = COMPANY[form]?.name || '';
    const mm2 = String(d.mm).padStart(2, '0');
    const yy = String(d.yyyy).slice(2);
    const sheetName = form === SETTLE_FORM.OFFICIAL ? `청구${yy}.${mm2}` : `${yy}.${mm2}`;
    const ws = wb.addWorksheet(sheetName, { views: [{ showGridLines: false, zoomScale: 100 }] });

    let res;
    if (form === SETTLE_FORM.OFFICIAL) {
        res = buildForm1(wb, ws, d, images);
    } else {
        const r2 = buildForm2(wb, ws, d, images);
        res = { ...r2, printCols: 'M', margins: { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } };
    }

    if (!d._landscape) ws.getRow(res.p1End).addPageBreak();
    // 너비만 1페이지에 맞추고(높이 0 = 제한 없음) 페이지 나눔은 수동 구분선을 따름.
    // 고정 배율만 쓰면 뷰어/변환기(LibreOffice) 글꼴 폭 차이로 오른쪽 열이 옆 페이지로 넘어감.
    ws.pageSetup = {
        paperSize: 9, orientation: 'portrait', scale: 71, fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        horizontalCentered: true, verticalCentered: false,
        printArea: `A1:${res.printCols}${res.lastRow}`,
        margins: res.margins,
    };

    // 가로 모드 : 상세 내역 가로 시트 추가 (1페이지 시트 다음)
    if (d._landscape) buildDetailSheet(wb, form, d, images);

    if (form === SETTLE_FORM.OFFICIAL && opt.includeLedger !== false) buildLedgerSheet(wb, d, images);

    wb.calcProperties.fullCalcOnLoad = true;
    const buf = await wb.xlsx.writeBuffer();
    return patchDefaultFont(buf);
}

// 열 너비(문자 단위)는 워크북 '기본 글꼴'의 숫자 폭으로 픽셀 환산됩니다.
// ExcelJS 기본 글꼴은 Calibri라서 원본(맑은 고딕)과 같은 너비값을 줘도 표가 좁아지므로,
// styles.xml 의 기본 글꼴(fonts[0])을 맑은 고딕 11로 교체합니다.
async function patchDefaultFont(buf) {
    const zip = await JSZip.loadAsync(buf);
    const path = 'xl/styles.xml';
    const xml = await zip.file(path).async('string');
    const patched = xml.replace(
        /(<fonts[^>]*>)<font>[\s\S]*?<\/font>/,
        `$1<font><sz val="11"/><color theme="1"/><name val="${MALGUN}"/><family val="3"/><charset val="129"/><scheme val="minor"/></font>`
    );
    zip.file(path, patched);
    return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}