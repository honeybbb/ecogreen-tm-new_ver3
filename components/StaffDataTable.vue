<script setup>
import { computed } from 'vue';
import { useCellMemo } from '@/composables/useCellMemo';
import CellMemoPanel from '@/components/CellMemoPanel.vue';

const props = defineProps({
  members: { type: Array, required: true },
  // 표시할 컬럼 key 배열. 순서 = 표시 순서
  columns: {
    type: Array,
    default: () => ['id', 'siteName', 'name', 'position', 'contract', 'gender', 'birthDt',
      'rrn', 'foreigner', 'disability', 'inDate', 'outDate', 'outReason',
      'four_ins', 'retire_pension', 'accountNumber', 'phone', 'status']
  },
  showActions:   { type: Boolean, default: true },  // 상세/삭제 버튼
  showRRN:       { type: Boolean, default: false },
  revealedRRNs:  { type: Object, default: () => ({}) },
  disabledOptions: { type: Array, default: () => [] },
  ageLimits:     { type: Object, default: () => ({ pension: 60, employment: 65 }) },
  sortKey:       { type: String, default: '' },
  sortOrder:     { type: String, default: 'asc' },
});

const emit = defineEmits(['toggle-sort', 'detail', 'remove', 'toggle-four-ins']);

// ── 컬럼 메타데이터 (라벨, 폭, 정렬가능 여부) ─────────────
const COLUMN_META = {
  id:            { label: '사번',          width: '3%',  sortable: true },
  siteName:      { label: '현장',          width: '*',   sortable: true, class: 'col-site' },
  name:          { label: '이름',          width: '4%',  sortable: true },
  position:      { label: '직책',          width: '4%',  sortable: true },
  contract:      { label: '근로계약 만료일', width: '6%' },
  gender:        { label: '성별',          width: '3%',  sortable: true },
  birthDt:       { label: '나이',          width: '3%',  sortable: true },
  rrn:           { label: '주민번호',       width: '8%' },
  foreigner:     { label: '내/외국인',      width: '4%' },
  disability:    { label: '장애여부',       width: '3%' },
  inDate:        { label: '입사일',         width: '8%',  sortable: true },
  outDate:       { label: '퇴사일',         width: '8%',  sortable: true },
  outReason:     { label: '퇴직사유',       width: '5%' },
  four_ins:      { label: '4대보험',        width: '2%' },
  retire_pension:{ label: '퇴직연금',       width: '2%' },
  accountNumber: { label: '계좌번호',       width: '10%' },
  phone:         { label: '연락처',         width: '10%' },
  status:        { label: '상태',           width: '5%',  sortable: true },
};

const visibleColumns = computed(() =>
    props.columns.map(key => ({ key, ...COLUMN_META[key] })).filter(c => c.label)
);

const memoColLabelMap = Object.fromEntries(
    Object.entries(COLUMN_META).map(([k, v]) => [k, v.label])
);

const {
  panel: memoPanel, getMemo, hasMemo, dotClass, label: memoLabel,
  openPanel: onCellContextMenu, closePanel: closeMemoPanel, save: addMemo, remove: removeMemo,
} = useCellMemo('member', memoColLabelMap);

const displayRRN = (member) => {
  if (!member.rrn) return '-';
  if (props.showRRN && props.revealedRRNs[member.idx]) {
    const clean = props.revealedRRNs[member.idx].replace(/[^0-9]/g, '');
    return clean.length === 13 ? `${clean.substring(0, 6)}-${clean.substring(6)}` : props.revealedRRNs[member.idx];
  }
  return member.rrn;
};

const getContractDaysLeft = (contractDate) => {
  if (!contractDate) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  const end = new Date(contractDate); end.setHours(0,0,0,0);
  return Math.ceil((end - today) / (1000 * 60 * 60 * 24));
};

const getDisabilityStyle = (grade) => {
  const opt = props.disabledOptions.find(o => o.itemCd == grade);
  return {
    backgroundColor: opt?.option || 'var(--bg-hover)',
    color: 'var(--bg-surface)',
    border: 'none'
  };
};

defineExpose({}); // 필요시 부모에서 ref로 접근할 것 대비
</script>

<template>
  <div class="table-scroll-container">
    <table class="data-table">
      <colgroup>
        <col v-for="col in visibleColumns" :key="'g-'+col.key" :width="col.width" />
        <col v-if="showActions" width="8%" />
      </colgroup>

      <thead>
      <tr>
        <th v-for="col in visibleColumns" :key="col.key"
            :class="['resizable', col.class, { sortable: col.sortable }]"
            @click="col.sortable && emit('toggle-sort', col.key)">
          <div class="th-content">
            {{ col.label }}
            <i v-if="sortKey === col.key" :class="['mdi', sortOrder === 'asc' ? 'mdi-arrow-up' : 'mdi-arrow-down']"></i>
          </div>
        </th>
        <th v-if="showActions" class="text-center">관리</th>
      </tr>
      </thead>

      <tbody>
      <tr v-for="member in members" :key="member.idx" :class="['data-row', { 'is-resigned': member.status == 1 }]">

        <template v-for="col in visibleColumns" :key="col.key">
          <!-- 사번 -->
          <td v-if="col.key === 'id'" :class="[dotClass(member,'id')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'id')">
            {{ member.id }}
            <span v-if="hasMemo(member,'id')" class="memo-dot" :class="dotClass(member,'id')"></span>
          </td>

          <!-- 현장 -->
          <td v-else-if="col.key === 'siteName'" class="cell-ellipsis" :title="member.siteName"
              :class="[dotClass(member,'siteName')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'siteName')">
            {{ member.siteName }}
            <span v-if="hasMemo(member,'siteName')" class="memo-dot" :class="dotClass(member,'siteName')"></span>
          </td>

          <!-- 이름 -->
          <td v-else-if="col.key === 'name'" class="member-name"
              :class="[dotClass(member,'name')?'has-memo':'']"
              @click="emit('detail', member.id)" @contextmenu="onCellContextMenu($event, member, 'name')">
            {{ member.name }}
            <span v-if="hasMemo(member,'name')" class="memo-dot" :class="dotClass(member,'name')"></span>
          </td>

          <!-- 직책 -->
          <td v-else-if="col.key === 'position'" :class="[dotClass(member,'position')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'position')">
            {{ member.position }}
            <span v-if="hasMemo(member,'position')" class="memo-dot" :class="dotClass(member,'position')"></span>
          </td>

          <!-- 근로계약 만료일 -->
          <td v-else-if="col.key === 'contract'"
              :class="[{ 'contract-danger': getContractDaysLeft(member.contract) !== null && getContractDaysLeft(member.contract) < 60 }, dotClass(member,'contract')?'has-memo':'']"
              @contextmenu="onCellContextMenu($event, member, 'contract')">
            <span v-if="member.contract" class="tooltip-container">
              {{ member.contract }}
              <span v-if="getContractDaysLeft(member.contract) !== null && getContractDaysLeft(member.contract) < 60" class="tooltip-text">
                {{ getContractDaysLeft(member.contract) < 0 ? `계약 만료 (${Math.abs(getContractDaysLeft(member.contract))}일 경과)` : `만료 ${getContractDaysLeft(member.contract)}일 전` }}
              </span>
            </span>
            <span v-else class="text-gray">-</span>
            <span v-if="hasMemo(member,'contract')" class="memo-dot" :class="dotClass(member,'contract')"></span>
          </td>

          <!-- 성별 -->
          <td v-else-if="col.key === 'gender'" :class="[dotClass(member,'gender')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'gender')">
            {{ member.gender === 'M' ? '남' : '여' }}
            <span v-if="hasMemo(member,'gender')" class="memo-dot" :class="dotClass(member,'gender')"></span>
          </td>

          <!-- 나이 -->
          <td v-else-if="col.key === 'birthDt'"
              :class="[{ 'age-warning': calculateAge(member.birthDt) >= ageLimits.employment }, dotClass(member,'birthDt')?'has-memo':'']"
              @contextmenu="onCellContextMenu($event, member, 'birthDt')">
            {{ calculateAge(member.birthDt) ? calculateAge(member.birthDt) + '세' : '-' }}
            <span v-if="hasMemo(member,'birthDt')" class="memo-dot" :class="dotClass(member,'birthDt')"></span>
          </td>

          <!-- 주민번호 -->
          <td v-else-if="col.key === 'rrn'" :class="[dotClass(member,'rrn')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'rrn')">
            {{ displayRRN(member) }}
            <span v-if="hasMemo(member,'rrn')" class="memo-dot" :class="dotClass(member,'rrn')"></span>
          </td>

          <!-- 내/외국인 -->
          <td v-else-if="col.key === 'foreigner'" :class="[dotClass(member,'foreigner')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'foreigner')">
            <span v-if="member.foreigner === 'Y' || member.foreigner === true" class="badge badge-foreigner tooltip-container">
              <i class="mdi mdi-earth"></i> 외국인
            </span>
            <span v-else class="text-gray">내국인</span>
            <span v-if="hasMemo(member,'foreigner')" class="memo-dot" :class="dotClass(member,'foreigner')"></span>
          </td>

          <!-- 장애여부 -->
          <td v-else-if="col.key === 'disability'" :class="[dotClass(member,'disability')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'disability')">
            <span v-if="member.disability === 'Y' || member.disability === true" class="badge" :style="getDisabilityStyle(member.disability_grade)">
              <i class="mdi mdi-wheelchair-accessibility"></i> 장애
            </span>
            <span v-else class="text-gray">-</span>
            <span v-if="hasMemo(member,'disability')" class="memo-dot" :class="dotClass(member,'disability')"></span>
          </td>

          <!-- 입사일 -->
          <td v-else-if="col.key === 'inDate'" class="cursor-pointer"
              :class="[member.inYn=='N'?'contract-warning':'', dotClass(member,'inDate')?'has-memo':'']"
              @click="emit('toggle-four-ins', member, 'inYn')" @contextmenu.prevent="onCellContextMenu($event, member, 'inDate')">
            {{ formatDate(member.inDate) }}
            <span v-if="hasMemo(member,'inDate')" class="memo-dot" :class="dotClass(member,'inDate')"></span>
          </td>

          <!-- 퇴사일 -->
          <td v-else-if="col.key === 'outDate'" class="cursor-pointer"
              :class="[member.outYn=='N'?'contract-warning':'', dotClass(member,'outDate')?'has-memo':'']"
              @click="emit('toggle-four-ins', member, 'outYn')" @contextmenu.prevent="onCellContextMenu($event, member, 'outDate')">
            {{ formatDate(member.outDate) }}
            <span v-if="hasMemo(member,'outDate')" class="memo-dot" :class="dotClass(member,'outDate')"></span>
          </td>

          <!-- 퇴직사유 -->
          <td v-else-if="col.key === 'outReason'" :class="[dotClass(member,'outReason')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'outReason')">
            {{ member.outReason }}
            <span v-if="hasMemo(member,'outReason')" class="memo-dot" :class="dotClass(member,'outReason')"></span>
          </td>

          <!-- 4대보험 -->
          <td v-else-if="col.key === 'four_ins'" class="text-center" :class="[dotClass(member,'four_ins')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'four_ins')">
            <i v-if="member.four_ins==='Y'||member.four_ins===true" class="mdi mdi-check-circle check-icon"></i>
            <i v-else class="mdi mdi-close-circle uncheck-icon"></i>
            <span v-if="hasMemo(member,'four_ins')" class="memo-dot" :class="dotClass(member,'four_ins')"></span>
          </td>

          <!-- 퇴직연금 -->
          <td v-else-if="col.key === 'retire_pension'" class="text-center" :class="[dotClass(member,'retire_pension')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'retire_pension')">
            <i v-if="member.retire_pension==='Y'||member.retire_pension===true" class="mdi mdi-check-circle check-icon"></i>
            <i v-else class="mdi mdi-close-circle uncheck-icon"></i>
            <span v-if="hasMemo(member,'retire_pension')" class="memo-dot" :class="dotClass(member,'retire_pension')"></span>
          </td>

          <!-- 계좌번호 -->
          <td v-else-if="col.key === 'accountNumber'" :class="[dotClass(member,'accountNumber')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'accountNumber')">
            <div v-if="member.accountNumber" class="account-info">
              <span class="bank-badge">{{ member.bank }}</span>
              <span class="account-number">{{ member.accountNumber }}</span>
            </div>
            <span v-else class="text-gray">-</span>
            <span v-if="hasMemo(member,'accountNumber')" class="memo-dot" :class="dotClass(member,'accountNumber')"></span>
          </td>

          <!-- 연락처 -->
          <td v-else-if="col.key === 'phone'" :class="[dotClass(member,'phone')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'phone')">
            {{ member.phone }}
            <span v-if="hasMemo(member,'phone')" class="memo-dot" :class="dotClass(member,'phone')"></span>
          </td>

          <!-- 상태 -->
          <td v-else-if="col.key === 'status'" :class="[dotClass(member,'status')?'has-memo':'']" @contextmenu="onCellContextMenu($event, member, 'status')">
            <span
                :class="[
                    'status-badge', member.status==0?
                    'status-active':member.status==1?
                    'status-inactive':'status-preparing']">
              {{ member.status==0?'재직':member.status==1?'퇴사':member.status==2?'일용직':member.status==3?'대근':'휴직' }}
            </span>
            <span v-if="hasMemo(member,'status')" class="memo-dot" :class="dotClass(member,'status')"></span>
          </td>
        </template>

        <td v-if="showActions" class="text-center">
          <div style="display:flex;gap:4px;">
            <button @click="emit('detail', member.id)" class="btn-detail"><i class="mdi mdi-eye"></i><span>상세</span></button>
            <button @click="emit('remove', member.id)" class="btn-remove-cost"><i class="mdi mdi-close"></i></button>
          </div>
        </td>
      </tr>

      <tr v-if="members.length === 0" class="empty-row">
        <td :colspan="visibleColumns.length + (showActions?1:0)">
          <div class="empty-state">
            <i class="mdi mdi-account-off-outline"></i>
            <p>표시할 직원이 없습니다</p>
          </div>
        </td>
      </tr>
      </tbody>
    </table>

    <CellMemoPanel
        v-bind="memoPanel"
        :title="memoLabel(memoPanel.colName)"
        :has-existing="hasMemo(memoPanel.row, memoPanel.colName)"
        :updated-at="hasMemo(memoPanel.row, memoPanel.colName) ? getMemo(memoPanel.row, memoPanel.colName).regDt : ''"
        @update:text="memoPanel.text = $event"
        @update:type="memoPanel.type = $event"
        @close="closeMemoPanel"
        @save="addMemo"
        @remove="removeMemo"
    />
  </div>
</template>
<style>
.btn-remove-cost {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--danger);
  border: none; color: var(--text-inverse);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.check-icon   { font-size: 18px; color: var(--success); }
.uncheck-icon { font-size: 18px; color: var(--text-muted); }

.status-badge {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 600;
}
.status-active   { background-color: rgba(16, 185, 129, 0.1); color: var(--success); }
.status-inactive { background-color: rgba(239, 68, 68, 0.1); color: var(--danger); }
.status-preparing { background-color: rgba(245, 158, 11, 0.1); color: var(--warning); }

</style>