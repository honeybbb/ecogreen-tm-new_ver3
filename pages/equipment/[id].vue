<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'nuxt/app';

const route = useRoute();
const router = useRouter();
const equipmentId = route.params.id;

// 장비 상세 데이터 (API 연동 시 reactive하게 변경 권장)
const equipmentData = ref({
  id: equipmentId,
  name: '고압 세척기 A-3000',
  model: 'A-3000',
  serial: 'SN12345678',
  assetCode: 'EQP-001',
  purchaseDate: '2024-03-15',
  purchasePrice: 1500000,
  site: 'LH 위례 6단지',
  status: '보유 중',
  memo: '2025년 3월 정기 점검 예정. 고압 노즐 교체 필요.\n(최근 현장 이동 없음)',
  imageUrl: 'https://via.placeholder.com/300x300?text=Equipment+Image',
});

const handleEdit = () => {
  router.push(`/equipment/register?eqIdx=${equipmentId}`);
};

const handleDelete = () => {
  if (confirm(`장비 [${equipmentData.value.name}]을(를) 정말로 삭제하시겠습니까?`)) {
    alert('장비가 삭제되었습니다.');
    router.push('/equipment');
  }
};

const handleBack = () => {
  router.push('/equipment');
};
</script>

<template>
  <div class="equipment-detail-page">
    <div class="page-header">
      <div class="header-left">
        <h1 class="page-title">
          <i class="mdi mdi-tools"></i>
          장비 상세 정보
        </h1>
        <p class="page-subtitle">등록된 장비의 세부 제원 및 관리 이력을 확인합니다.</p>
      </div>
      <div class="header-actions">
        <button @click="handleBack" class="btn-refresh">
          <i class="mdi mdi-arrow-left"></i>
          <span>목록으로</span>
        </button>
      </div>
    </div>

    <div class="detail-card">
      <div class="card-body">

        <section class="overview-section">
          <div class="equipment-image-wrapper">
            <img :src="equipmentData.imageUrl" alt="장비 사진" class="equipment-image">
          </div>

          <div class="overview-content">
            <div class="status-badge-group">
              <span :class="['status-badge', `status-${equipmentData.status.replace(/ /g, '')}`]">
                <i class="mdi mdi-circle"></i>
                {{ equipmentData.status }}
              </span>
            </div>
            <h2 class="equipment-name">{{ equipmentData.name }}</h2>
            <div class="quick-info">
              <div class="info-tag"><span>자산 코드</span> <strong>{{ equipmentData.assetCode || '미등록' }}</strong></div>
              <div class="info-tag"><span>S/N</span> <strong>{{ equipmentData.serial }}</strong></div>
            </div>
          </div>
        </section>

        <section class="info-grid-section">
          <h3 class="section-title">기본 및 구매 정보</h3>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">모델명</span>
              <span class="value">{{ equipmentData.model }}</span>
            </div>
            <div class="detail-item">
              <span class="label">현재 배치 현장</span>
              <span class="value text-blue font-bold">{{ equipmentData.site }}</span>
            </div>
            <div class="detail-item">
              <span class="label">구입일</span>
              <span class="value">{{ equipmentData.purchaseDate }}</span>
            </div>
            <div class="detail-item">
              <span class="label">구입가</span>
              <span class="value font-bold text-green">{{ equipmentData.purchasePrice ? equipmentData.purchasePrice.toLocaleString() + ' 원' : '정보 없음' }}</span>
            </div>
          </div>
        </section>

        <section class="memo-section">
          <h3 class="section-title">특이사항 및 메모</h3>
          <div class="memo-box">
            {{ equipmentData.memo || '등록된 특이사항 및 메모가 없습니다.' }}
          </div>
        </section>

        <div class="card-footer-actions">
          <button @click="handleDelete" class="btn-action-delete">
            <i class="mdi mdi-delete-outline"></i>
            <span>장비 폐기/삭제</span>
          </button>
          <button @click="handleEdit" class="btn-submit">
            <i class="mdi mdi-pencil"></i>
            <span>정보 수정하기</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 페이지 전체 배경은 common.css body에서 처리됨 */

/* 상세 카드 스타일 */
.detail-card {
  background: white;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  overflow: hidden;
}

.card-body {
  padding: 32px;
}

/* 1. 상단 개요 섹션 */
.overview-section {
  display: flex;
  gap: 32px;
  padding-bottom: 32px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 32px;
  align-items: center;
}

.equipment-image-wrapper {
  width: 180px;
  height: 180px;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: #f8fafc;
  flex-shrink: 0;
}

.equipment-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.overview-content {
  flex: 1;
}

.equipment-name {
  font-size: 28px;
  font-weight: 800;
  color: var(--text-main);
  margin: 12px 0;
  letter-spacing: -0.02em;
}

.status-badge-group {
  margin-bottom: 8px;
}

/* 상태별 세련된 배지 디자인 */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 50px;
  font-size: 13px;
  font-weight: 700;
}
.status-badge i { font-size: 8px; }

.status-보유중 { background: #d1fae5; color: #065f46; }
.status-대여중 { background: #fef3c7; color: #92400e; }
.status-수리중 { background: #dbeafe; color: #1e40af; }
.status-폐기 { background: #fee2e2; color: #991b1b; }

.quick-info {
  display: flex;
  gap: 20px;
}

.info-tag {
  font-size: 14px;
  color: var(--text-sub);
}
.info-tag strong {
  color: var(--text-main);
  margin-left: 6px;
}

/* 2. 정보 그리드 */
.section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.section-title::before {
  content: '';
  display: block;
  width: 4px;
  height: 16px;
  background: var(--primary);
  border-radius: 2px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  margin-bottom: 32px;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}

.detail-item .label {
  font-size: 14px;
  color: var(--text-sub);
  font-weight: 500;
}

.detail-item .value {
  font-size: 15px;
  color: var(--text-main);
  text-align: right;
}

/* 3. 메모 박스 */
.memo-box {
  background: #f8fafc;
  border: 1px solid var(--border-color);
  padding: 20px;
  border-radius: 12px;
  color: var(--text-main);
  line-height: 1.7;
  font-size: 14px;
  min-height: 100px;
}

/* 4. 카드 하단 버튼 영역 */
.card-footer-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 40px;
  padding-top: 24px;
  border-top: 1px solid var(--border-color);
}

.btn-action-delete {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: #ef4444;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  padding: 10px;
  border-radius: 8px;
  transition: all 0.2s;
}
.btn-action-delete:hover {
  background: #fee2e2;
}

@media (max-width: 768px) {
  .overview-section { flex-direction: column; text-align: center; }
  .detail-grid { grid-template-columns: 1fr; }
  .quick-info { justify-content: center; }
  .detail-item { flex-direction: column; align-items: flex-start; gap: 4px; }
  .detail-item .value { text-align: left; }
  .card-footer-actions { flex-direction: column-reverse; gap: 16px; }
  .btn-submit { width: 100%; }
}
</style>
