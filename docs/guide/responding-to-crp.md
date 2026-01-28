# CRP 응답하기

CRP(Consultation Request Pack)에 효과적으로 응답하는 방법을 설명합니다.

## CRP란?

**CRP(Consultation Request Pack)**는 에이전트가 인간의 판단이 필요할 때 생성하는 질의서입니다.

에이전트는 다음 상황에서 CRP를 생성합니다:

- 🤔 **모호한 요구사항**: 여러 해석이 가능
- ⚖️ **트레이드오프 결정**: 장단점이 있는 선택지
- 🔒 **보안 관련 결정**: 리스크 판단 필요
- 🏗️ **아키텍처 선택**: 시스템 설계 방향
- 📦 **외부 의존성 추가**: 프로젝트 정책 확인

## CRP 알림

CRP가 생성되면:

1. **웹 대시보드**에 알림 표시
2. **터미널 벨** 울림 (설정된 경우)
3. **시스템 알림** (설정된 경우)

대시보드에서 "Respond Now" 클릭하여 CRP 페이지로 이동합니다.

## CRP 구조

### 전체 형식

```json
{
  "crp_id": "crp-001",
  "created_at": "2024-01-26T14:35:00Z",
  "created_by": "refiner",
  "type": "clarification",
  "question": "Rate limiting을 어떤 기준으로 적용할까요?",
  "context": "briefing에 '적절한 rate limiting'이라고만 명시됨",
  "options": [
    {
      "id": "A",
      "label": "IP당 분당 60회",
      "description": "일반적인 API 기본값",
      "risk": "낮음"
    },
    {
      "id": "B",
      "label": "사용자당 분당 100회",
      "description": "인증된 사용자 기준",
      "risk": "인증 시스템 필요"
    },
    {
      "id": "C",
      "label": "엔드포인트별 차등 적용",
      "description": "세밀한 제어 가능",
      "risk": "구현 복잡도 증가"
    }
  ],
  "recommendation": "A",
  "status": "pending"
}
```

### 필드 설명

| 필드 | 설명 |
|------|------|
| `question` | 핵심 질문 |
| `context` | 왜 이 질문이 필요한지 배경 설명 |
| `options` | 선택 가능한 옵션들 (2-4개) |
| `recommendation` | 에이전트가 권장하는 옵션 |

### 옵션 구조

각 옵션은:

- `id`: 선택지 식별자 (A, B, C...)
- `label`: 간단한 제목
- `description`: 상세 설명
- `risk`: 위험도 ("낮음", "중간", "높음")

## 응답 방법

### 1. 웹 UI에서 응답

CRP 페이지 구조:

```
┌─────────────────────────────────────────────┐
│  Consultation Request          CRP-001      │
├─────────────────────────────────────────────┤
│                                              │
│  From: Refiner                               │
│  Question:                                   │
│  ┌─────────────────────────────────────────┐│
│  │ Rate limiting을 어떤 기준으로 적용할까요?││
│  │                                          ││
│  │ Context: briefing에 '적절한 rate        ││
│  │ limiting'이라고만 명시됨                ││
│  └─────────────────────────────────────────┘│
│                                              │
│  Options:                                    │
│                                              │
│  ● A. IP당 분당 60회 (Recommended)          │
│       일반적인 API 기본값 / Risk: 낮음       │
│                                              │
│  ○ B. 사용자당 분당 100회                   │
│       인증된 사용자 기준 / Risk: 중간        │
│                                              │
│  ○ C. 엔드포인트별 차등 적용                │
│       세밀한 제어 / Risk: 높음              │
│                                              │
│  Additional Notes:                           │
│  ┌─────────────────────────────────────────┐│
│  │ MVP이므로 단순한 방식으로 시작          ││
│  └─────────────────────────────────────────┘│
│                                              │
│  ☑ Apply this decision to future similar    │
│    cases                                     │
│                                              │
│  [Submit Decision]                           │
│                                              │
└─────────────────────────────────────────────┘
```

**단계:**

1. **옵션 선택**: 라디오 버튼 클릭
2. **근거 작성** (선택): "Additional Notes"에 이유 작성
3. **향후 적용** (선택): "Apply to future" 체크
4. **제출**: "Submit Decision" 클릭

### 2. VCR 생성

제출하면 **VCR(Version Controlled Resolution)**이 생성됩니다:

```json
{
  "vcr_id": "vcr-001",
  "crp_id": "crp-001",
  "created_at": "2024-01-26T14:40:00Z",
  "decision": "A",
  "rationale": "MVP이므로 단순한 방식으로 시작",
  "additional_notes": "추후 사용자별 제한 추가 예정",
  "applies_to_future": true
}
```

### 3. 에이전트 재시작

VCR 생성 후:

1. 해당 에이전트 컨텍스트가 초기화됩니다
2. VCR 내용을 반영하여 작업 재개
3. 대시보드에서 진행 상황 확인 가능

## CRP 유형별 응답 가이드

### Type: clarification

**의미:** 요구사항 명확화

**예시:**

```json
{
  "type": "clarification",
  "question": "사용자 인증은 어떤 방식으로 구현할까요?",
  "options": [
    {"id": "A", "label": "JWT", ...},
    {"id": "B", "label": "Session", ...},
    {"id": "C", "label": "OAuth 2.0", ...}
  ]
}
```

**응답 팁:**

- ✅ 프로젝트의 기존 패턴 고려
- ✅ 팀의 기술 스택 고려
- ✅ 향후 확장성 고려

### Type: architecture

**의미:** 아키텍처 결정

**예시:**

```json
{
  "type": "architecture",
  "question": "데이터베이스 스키마를 어떻게 설계할까요?",
  "options": [
    {"id": "A", "label": "정규화된 스키마", ...},
    {"id": "B", "label": "비정규화 (성능 우선)", ...}
  ]
}
```

**응답 팁:**

- ✅ 성능 vs 유지보수 트레이드오프 고려
- ✅ 데이터 규모 고려
- ✅ 쿼리 패턴 고려

### Type: security

**의미:** 보안 관련 결정

**예시:**

```json
{
  "type": "security",
  "question": "사용자 입력을 어떻게 검증할까요?",
  "options": [
    {"id": "A", "label": "기본 검증만", ...},
    {"id": "B", "label": "엄격한 검증 + 이스케이프", ...}
  ]
}
```

**응답 팁:**

- ⚠️ 보수적으로 접근 (더 안전한 옵션 선택)
- ⚠️ 리스크가 높으면 전문가 상담
- ✅ 규정 준수 여부 확인

### Type: dependency

**의미:** 외부 라이브러리 추가

**예시:**

```json
{
  "type": "dependency",
  "question": "날짜 처리를 위해 라이브러리를 추가할까요?",
  "options": [
    {"id": "A", "label": "day.js 사용", ...},
    {"id": "B", "label": "네이티브 Date 사용", ...}
  ]
}
```

**응답 팁:**

- ✅ 라이브러리 크기 고려
- ✅ 유지보수 상태 확인
- ✅ 라이선스 확인
- ✅ 팀 정책 확인

## 응답 시 고려사항

### 1. Recommendation 검토

에이전트의 권장 사항은 다음을 고려합니다:

- 일반적인 베스트 프랙티스
- 낮은 리스크
- 구현 복잡도

하지만 **프로젝트 특수성**을 모르므로, 맹목적으로 따르지 마세요.

### 2. Risk 평가

| Risk | 의미 | 고려사항 |
|------|------|---------|
| **낮음** | 표준적인 방법 | 안전하게 선택 가능 |
| **중간** | 추가 작업 필요 | 비용 vs 이익 판단 |
| **높음** | 복잡도/리스크 증가 | 신중한 판단 필요 |

### 3. Rationale 작성

근거를 작성하면:

- ✅ 향후 참고 가능
- ✅ 팀원과 공유 가능
- ✅ VCR 히스토리에 기록됨

**좋은 Rationale 예시:**

```
MVP 단계이므로 단순한 IP 기반 제한으로 시작합니다.
사용자 인증 시스템이 추가되면 사용자별 제한으로 전환 예정입니다.
```

**나쁜 Rationale 예시:**

```
이게 나을 것 같아서
```

### 4. "Apply to future" 옵션

체크하면:

- ✅ 유사한 상황에서 자동으로 적용
- ✅ 반복적인 CRP 방지
- ⚠️ 맥락이 다를 수 있으니 주의

**언제 체크할까?**

- ✅ 일관된 정책 (예: 네이밍 컨벤션)
- ✅ 기술 스택 선택 (예: 항상 JWT 사용)
- ❌ 맥락 의존적 결정 (예: 특정 API의 rate limit)

## 실전 예시

### 예시 1: Rate Limiting

**CRP:**

```json
{
  "question": "Rate limiting을 어떤 기준으로 적용할까요?",
  "options": [
    {"id": "A", "label": "IP당 60/분", "risk": "낮음"},
    {"id": "B", "label": "사용자당 100/분", "risk": "중간"},
    {"id": "C", "label": "엔드포인트별 차등", "risk": "높음"}
  ],
  "recommendation": "A"
}
```

**응답 예시 1 (MVP):**

```
Decision: A
Rationale: MVP 단계이므로 단순한 IP 기반 제한으로 시작
Apply to future: No (상황에 따라 다를 수 있음)
```

**응답 예시 2 (프로덕션):**

```
Decision: B
Rationale: 인증 시스템이 이미 있으므로 사용자별 제한이 더 적절
Apply to future: Yes (향후 API도 동일 정책 적용)
```

### 예시 2: Database Choice

**CRP:**

```json
{
  "question": "데이터베이스를 선택해주세요",
  "options": [
    {"id": "A", "label": "PostgreSQL", "risk": "낮음"},
    {"id": "B", "label": "MongoDB", "risk": "중간"}
  ],
  "recommendation": "A"
}
```

**응답 예시:**

```
Decision: A
Rationale:
- 프로젝트가 관계형 데이터 구조 (User, Order, Product)
- 트랜잭션 필요
- 팀이 PostgreSQL 경험 많음
Apply to future: Yes (향후 모든 서비스에 PostgreSQL 사용)
```

### 예시 3: Security Trade-off

**CRP:**

```json
{
  "question": "XSS 방지를 어느 수준으로 적용할까요?",
  "options": [
    {"id": "A", "label": "기본 이스케이프", "risk": "중간"},
    {"id": "B", "label": "엄격한 CSP + 이스케이프", "risk": "낮음"}
  ],
  "recommendation": "B"
}
```

**응답 예시:**

```
Decision: B
Rationale:
- 사용자 생성 콘텐츠를 다루므로 보안 우선
- CSP 설정이 복잡하지만 필수적
Apply to future: Yes (모든 페이지에 동일한 보안 정책)
```

## VCR 히스토리 확인

과거 결정을 확인하려면:

```bash
# 특정 Run의 모든 VCR
ls .dure/runs/{run_id}/vcr/

# VCR 내용 확인
cat .dure/runs/{run_id}/vcr/vcr-001.json

# 모든 VCR 검색
find .dure/runs -name "vcr-*.json" -exec cat {} \;
```

웹 UI에서는 Run 상세 페이지에서 "Decisions" 탭에서 확인 가능합니다.

## 자주 하는 실수

### ❌ Recommendation을 맹목적으로 따름

에이전트는 프로젝트 특수성을 모릅니다. 항상 **맥락을 고려**하세요.

### ❌ Rationale을 작성하지 않음

향후 왜 그런 결정을 했는지 기억하기 어렵습니다.

### ❌ "Apply to future"를 무분별하게 체크

맥락이 다른 상황에 잘못 적용될 수 있습니다.

### ❌ 너무 오래 방치

CRP가 대기 중이면 전체 Run이 멈춥니다. 빠르게 응답하세요.

## 다음 단계

- [MRP 검토](/guide/reviewing-mrp.md) - 최종 결과물 검토 방법
- [에이전트 이해하기](/guide/understanding-agents.md) - CRP 생성 로직 이해
- [데이터 포맷](/architecture/data-formats.md) - CRP/VCR 형식 상세
