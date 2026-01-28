# MRP 검토하기

MRP(Merge-Readiness Pack)를 효과적으로 검토하는 방법을 설명합니다.

## MRP란?

**MRP(Merge-Readiness Pack)**는 Gatekeeper가 PASS 판정을 내렸을 때 생성되는 최종 결과물 패키지입니다.

MRP에는 코드를 머지하기 위해 필요한 모든 정보가 포함됩니다:

- 📄 변경 사항 요약
- 💾 최종 코드
- 🧪 테스트 파일
- 📊 테스트 결과
- 💰 비용 정보
- 📝 설계 근거 및 로그

## MRP 알림

MRP가 생성되면:

1. **웹 대시보드**에 알림 표시
2. **Run 상태**가 "ready_for_merge"로 변경
3. **터미널 벨** 울림 (설정된 경우)

대시보드에서 "Review MRP" 클릭하여 MRP 페이지로 이동합니다.

## MRP 구조

```
.dure/runs/{run_id}/mrp/
├── summary.md          # 요약 (가장 먼저 읽기)
├── code/               # 최종 코드 스냅샷
│   └── src/
│       └── ...
├── tests/              # 테스트 파일
│   └── *.test.ts
└── evidence.json       # 증거 및 메타데이터
```

### 1. summary.md

**가장 먼저 읽어야 할 파일입니다.**

```markdown
# Merge-Readiness Pack

## Run 정보
- Run ID: run-20240126-143022
- 총 iteration: 2
- 완료 시간: 2024-01-26T15:00:00Z
- 소요 시간: 30분

## 변경 사항
### 추가된 파일
- `src/middleware/rateLimiter.ts` (45줄)
- `src/middleware/__tests__/rateLimiter.test.ts` (120줄)

### 수정된 파일
- `src/app.ts` (+3줄, -0줄)
  - rateLimiter 미들웨어 등록

## 테스트 결과
- 총 15개 테스트
- 통과: 15 (100%)
- 실패: 0
- 커버리지: 95%

### 테스트 상세
✅ Happy path (5개)
✅ Edge cases (5개)
✅ Error cases (5개)

## 설계 결정
1. **Rate limiting 기준**: IP 기반, 분당 60회 (VCR-001)
2. **저장소**: 인메모리 Map 사용 (외부 라이브러리 금지 제약)
3. **클린업**: 1분마다 만료된 항목 정리

## 비용
- Total: $0.124
  - Refiner (iteration 1): $0.002
  - Builder (iteration 1): $0.055
  - Builder (iteration 2): $0.030
  - Verifier: $0.025
  - Gatekeeper: $0.012

## 리뷰 통과 사유
- ✅ 모든 테스트 통과
- ✅ Briefing 요구사항 100% 충족
- ✅ 코드 품질 양호 (가독성, 유지보수성)
- ✅ 보안 이슈 없음
- ✅ 성능 영향 미미
```

### 2. code/

최종 코드의 **스냅샷**입니다. 변경되거나 추가된 파일만 포함됩니다.

```
mrp/code/
└── src/
    ├── middleware/
    │   └── rateLimiter.ts
    └── app.ts
```

프로젝트에 직접 적용하려면:

```bash
cp -r .dure/runs/{run_id}/mrp/code/* .
```

### 3. tests/

생성된 테스트 파일입니다.

```
mrp/tests/
└── rateLimiter.test.ts
```

### 4. evidence.json

메타데이터 및 증거 링크:

```json
{
  "tests": {
    "total": 15,
    "passed": 15,
    "failed": 0,
    "coverage": 95,
    "details": [
      {"name": "should allow requests within limit", "status": "passed"},
      {"name": "should block requests over limit", "status": "passed"}
    ]
  },
  "files_changed": [
    {
      "path": "src/middleware/rateLimiter.ts",
      "type": "added",
      "lines": 45
    },
    {
      "path": "src/app.ts",
      "type": "modified",
      "lines_added": 3,
      "lines_removed": 0
    }
  ],
  "decisions": ["vcr-001"],
  "iterations": 2,
  "logs": {
    "refiner": "briefing/log.md",
    "builder": "builder/log.md",
    "verifier": "verifier/log.md",
    "gatekeeper": "gatekeeper/log.md"
  },
  "usage": {
    "total_input_tokens": 47500,
    "total_output_tokens": 12800,
    "total_cost_usd": 0.124
  }
}
```

## 검토 체크리스트

### 1단계: 요약 검토 (summary.md)

- [ ] Run 정보 확인 (iteration 횟수, 소요 시간)
- [ ] 변경 사항이 예상과 일치하는가?
- [ ] 테스트 결과가 모두 통과했는가?
- [ ] 설계 결정이 합리적인가?
- [ ] 비용이 예산 내인가?

### 2단계: 코드 검토 (code/)

#### 구조 및 위치

- [ ] 파일 위치가 적절한가?
- [ ] 네이밍이 프로젝트 컨벤션을 따르는가?
- [ ] 폴더 구조가 일관적인가?

#### 코드 품질

- [ ] 가독성이 좋은가?
- [ ] 중복 코드가 없는가?
- [ ] 주석이 적절한가? (과도하지 않은가?)
- [ ] 에러 처리가 적절한가?

#### 기능 정확성

- [ ] Briefing의 요구사항을 충족하는가?
- [ ] Edge case가 고려되었는가?
- [ ] 보안 취약점이 없는가?

### 3단계: 테스트 검토 (tests/)

- [ ] 테스트가 충분한가?
- [ ] Happy path가 커버되는가?
- [ ] Edge case가 테스트되는가?
- [ ] Error case가 테스트되는가?
- [ ] 테스트 코드가 읽기 쉬운가?

### 4단계: 로그 검토 (선택)

설계 근거를 이해하고 싶다면:

```bash
# Builder 로그
cat .dure/runs/{run_id}/builder/log.md

# Verifier 로그
cat .dure/runs/{run_id}/verifier/log.md

# Gatekeeper 리뷰
cat .dure/runs/{run_id}/gatekeeper/review.md
```

## 웹 UI에서 검토

### MRP 페이지 구조

```
┌─────────────────────────────────────────────┐
│  Merge-Readiness Pack      run-{timestamp}  │
├─────────────────────────────────────────────┤
│                                              │
│  [Summary] [Code] [Tests] [Evidence] [Logs] │
│                                              │
│  ## Summary                                  │
│                                              │
│  ✅ All tests passed (15/15)                │
│  ✅ Requirements met (100%)                 │
│  💰 Cost: $0.124                            │
│  ⏱️ Duration: 30 minutes                    │
│                                              │
│  ### Changes                                 │
│  + src/middleware/rateLimiter.ts (45 lines) │
│  ~ src/app.ts (+3, -0)                       │
│                                              │
│  ### Tests                                   │
│  ✅ Happy path (5)                           │
│  ✅ Edge cases (5)                           │
│  ✅ Error cases (5)                          │
│                                              │
│  ### Design Decisions                        │
│  1. IP-based rate limiting (VCR-001)        │
│  2. In-memory storage                        │
│  3. Cleanup every 1 minute                   │
│                                              │
│  [Approve]  [Request Changes]  [Download]    │
│                                              │
└─────────────────────────────────────────────┘
```

### 탭별 내용

#### Summary 탭

- 요약 정보 (summary.md)
- 빠른 결정을 위한 핵심 정보

#### Code 탭

- 코드 diff 뷰어
- Syntax highlighting
- 파일별 변경 사항

#### Tests 탭

- 테스트 코드
- 테스트 결과 상세
- 커버리지 리포트

#### Evidence 탭

- evidence.json 내용
- 메타데이터
- 링크

#### Logs 탭

- 모든 에이전트 로그
- 시간순 이벤트
- 디버그 정보

## 결정 내리기

### 옵션 1: Approve

**언제 Approve?**

- ✅ 모든 요구사항 충족
- ✅ 코드 품질 양호
- ✅ 테스트 충분
- ✅ 설계 결정 합리적

**Approve 후:**

1. Run 상태가 "completed"로 변경
2. 코드를 프로젝트에 수동으로 적용

```bash
# 코드 복사
cp -r .dure/runs/{run_id}/mrp/code/* .

# Git commit
git add .
git commit -m "feat: Add rate limiter middleware

Generated by Dure run-{timestamp}

Co-Authored-By: Claude Sonnet <noreply@anthropic.com>"

# Git push
git push
```

### 옵션 2: Request Changes

**언제 Request Changes?**

- ❌ 요구사항 누락
- ❌ 코드 품질 문제
- ❌ 테스트 부족
- ❌ 설계 문제

**Request Changes 시:**

1. 피드백 작성:

```markdown
## 변경 요청 사항

### 1. 성능 문제
- 인메모리 Map이 계속 커질 수 있음
- 메모리 누수 가능성

### 2. 테스트 누락
- 동시 요청 테스트 필요
- 클린업 로직 테스트 필요

### 3. 코드 개선
- 매직 넘버 (60, 60000) 상수로 추출
```

2. 제출 후:
   - Briefing이 업데이트됨
   - Builder가 재시작됨 (iteration 증가)
   - 변경 사항 반영하여 재구현

### 옵션 3: Download

코드만 다운로드하고 수동으로 적용:

```bash
# 웹 UI에서 "Download" 클릭
# 또는
tar -czf mrp.tar.gz .dure/runs/{run_id}/mrp/
```

## 실전 예시

### 예시 1: 간단한 유틸리티 함수

**summary.md:**

```markdown
## 변경 사항
+ src/utils/formatDate.ts (30줄)

## 테스트 결과
- 총 8개 테스트
- 통과: 8 (100%)

## 비용
Total: $0.018
```

**검토:**

```bash
# 코드 확인
cat .dure/runs/{run_id}/mrp/code/src/utils/formatDate.ts

# 간단하고 테스트 충분 → Approve
```

### 예시 2: 복잡한 API 구현

**summary.md:**

```markdown
## 변경 사항
+ src/api/users.ts (150줄)
+ src/models/User.ts (80줄)
~ src/app.ts (+5, -0)

## 테스트 결과
- 총 25개 테스트
- 통과: 23 (92%)
- 실패: 2

## Iteration
2번 재시도 후 통과
```

**검토:**

```bash
# 코드 확인 (복잡함)
cat .dure/runs/{run_id}/mrp/code/src/api/users.ts

# 로그 확인 (왜 2번 재시도?)
cat .dure/runs/{run_id}/gatekeeper/review.md

# 실패한 테스트 확인
cat .dure/runs/{run_id}/verifier/results.json
```

**발견:**

- 인증 미들웨어가 누락됨
- 에러 메시지가 일관적이지 않음

**결정:** Request Changes

```markdown
## 변경 요청

1. 인증 미들웨어 추가 필요
2. 에러 메시지 표준화
3. 입력 검증 강화
```

### 예시 3: 리팩토링

**summary.md:**

```markdown
## 변경 사항
~ src/services/UserService.ts (-120줄, +85줄)
+ src/services/validators.ts (40줄)

## 테스트 결과
- 기존 테스트 모두 통과
- 새 테스트 10개 추가

## 비용
Total: $0.095
```

**검토:**

```bash
# Diff 확인
diff -u src/services/UserService.ts \
  .dure/runs/{run_id}/mrp/code/src/services/UserService.ts

# 리팩토링 결과:
# - 함수가 작아지고 읽기 쉬워짐
# - 재사용 가능한 validator 분리
# - 기존 동작 유지 (테스트 통과)
```

**결정:** Approve

## 자동화 스크립트

### 빠른 적용 스크립트

```bash
#!/bin/bash
# apply-mrp.sh

RUN_ID=$1

if [ -z "$RUN_ID" ]; then
  echo "Usage: ./apply-mrp.sh run-{timestamp}"
  exit 1
fi

MRP_DIR=".dure/runs/$RUN_ID/mrp"

if [ ! -d "$MRP_DIR" ]; then
  echo "Error: MRP not found"
  exit 1
fi

# 요약 확인
echo "=== Summary ==="
cat "$MRP_DIR/summary.md"
echo ""

read -p "Apply this MRP? (y/N): " confirm
if [ "$confirm" != "y" ]; then
  echo "Cancelled"
  exit 0
fi

# 코드 적용
cp -r "$MRP_DIR/code/"* .

# Git commit
git add .
git commit -m "feat: Apply MRP from $RUN_ID

$(head -n 20 $MRP_DIR/summary.md)

Co-Authored-By: Claude Sonnet <noreply@anthropic.com>"

echo "Applied successfully"
```

사용:

```bash
chmod +x apply-mrp.sh
./apply-mrp.sh run-20240126-143022
```

## 주의사항

### ⚠️ 맹목적으로 Approve 하지 말 것

테스트가 통과했어도:

- 요구사항 누락 가능
- 엣지 케이스 미고려 가능
- 성능 문제 존재 가능

### ⚠️ 기존 코드와 충돌 확인

MRP는 Run 시작 시점의 코드 기반입니다. 그 사이 다른 변경이 있었다면 충돌 가능:

```bash
# 최신 코드 pull
git pull

# MRP 적용 전 diff 확인
diff -r .dure/runs/{run_id}/mrp/code/ .
```

### ⚠️ 보안 검토

특히 다음 항목은 수동 검토 필수:

- 사용자 입력 처리
- 인증/인가
- 데이터베이스 쿼리
- 외부 API 호출

## 다음 단계

- [문제 해결](/guide/troubleshooting.md) - MRP 관련 문제 해결
- [데이터 포맷](/architecture/data-formats.md) - MRP 형식 상세
- [비용 최적화](/advanced/cost-optimization.md) - 비용 절감 방법
