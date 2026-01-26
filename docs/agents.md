# Orchestral - 에이전트 정의

## Refiner

| 항목 | 값 |
|------|-----|
| 역할 | Briefing 검토 및 개선 |
| 기본 모델 | haiku |
| 입력 | `briefing/raw.md` |
| 출력 | `briefing/refined.md`, `briefing/clarifications.json`, `briefing/log.md` |

**행동 규칙:**
- 충분한 briefing → `refined.md` 생성, 다음 단계로
- 개선 가능 → `refined.md`에 보완, `log.md`에 근거 기록
- 모호함 → `crp/` 생성, 인간 응답 대기

**자동 개선 허용:**
- 숫자 기본값
- 네이밍 컨벤션
- 파일 경로

**CRP 필수:**
- 아키텍처 결정
- 외부 의존성 추가
- 보안 관련 사항

## Builder

| 항목 | 값 |
|------|-----|
| 역할 | 코드 구현 |
| 기본 모델 | sonnet |
| 입력 | `briefing/refined.md`, `briefing/clarifications.json` |
| 출력 | `builder/output/`, `builder/log.md`, `builder/done.flag` |

**행동 규칙:**
- `refined.md` 기반으로 코드 생성
- 설계 결정 근거를 `log.md`에 기록
- 완료 시 `done.flag` 생성

## Verifier

| 항목 | 값 |
|------|-----|
| 역할 | 테스트 생성 및 실행, 반례 탐색 |
| 기본 모델 | haiku |
| 입력 | `briefing/refined.md`, `builder/output/` |
| 출력 | `verifier/tests/`, `verifier/results.json`, `verifier/log.md`, `verifier/done.flag` |

**행동 규칙:**
- Builder 완료 후 시작 (`builder/done.flag` 감지)
- 기능 테스트, 경계 조건 테스트 생성
- 테스트 실행 결과를 `results.json`에 기록
- 실패 케이스, 엣지 케이스 명시

## Gatekeeper

| 항목 | 값 |
|------|-----|
| 역할 | 코드 리뷰, 최종 판정 |
| 기본 모델 | sonnet |
| 입력 | 전체 아티팩트 (briefing/, builder/, verifier/) |
| 출력 | `gatekeeper/review.md`, `gatekeeper/verdict.json`, `mrp/` |

**판정 결과:**
- `PASS` → `mrp/` 생성, 인간에게 제출
- `FAIL` → `review.md`에 사유, Phase 1로 복귀 (재시도)
- `NEEDS_HUMAN` → `crp/` 생성, 인간 응답 대기
