# dure (두레)

> 한 프로젝트에 붙어 PM 역할을 수행하는 에이전트 — Claude Code 플러그인.

**두레**는 전통 협동 노동 공동체에서 따온 이름이다. dure는 임의의 코드베이스에 붙어,
딥 인터뷰로 요구사항을 수렴시키고 → 마일스톤/에픽/이슈로 분해하며 → 진척을 추적하는
**프로젝트 전문 PM 에이전트**다. 두뇌는 래핑된 Claude Code다.

## 무엇을 하나

1. **딥 인터뷰 → 이슈 분해** *(v1)* — 막연한 한 줄 입력을, 요구사항 이해도가 정량적으로
   수렴할 때까지 인터뷰해 확정하고, 마일스톤/에픽/이슈로 분해한다. (로컬 우선 + GitHub 동기화)
2. **전수조사·감사** *(이후)* — 기존 프로젝트를 훑어 부채·버그·구조 문제를 발굴한다.
3. **방향성 기획** *(이후)* — 프로젝트가 앞으로 필요로 할 것을 스스로 발굴하고,
   딥 인터뷰 + 철저한 크리틱으로 깎아낸 기획안을 낸다.

## 사용 (목표 형태, v1)

```bash
cd ~/any-project
claude
> /dure:interview "결제 모듈에 환불 기능 넣고 싶어"
# → dure가 코드 근거 기반 질문 + 레드팀 크리틱 + 후보답 제시로 수렴
# → 요구사항 Fix → .dure/specs/<slug>.md
> /dure:plan        # spec → 마일스톤/에픽/이슈 분해 (.dure/roadmap/)
> /dure:sync        # 로컬 → GitHub Issues/Milestones 동기화
> /dure:status      # 진척 추적·리포트
```

## 확정된 설계 결정

자세한 내용은 [`.dure/spec.md`](.dure/spec.md), 수렴 과정은
[`.dure/interview-log.md`](.dure/interview-log.md), 빌드 계획은
[`.dure/roadmap.md`](.dure/roadmap.md) 참조.

| 결정 | 값 |
|---|---|
| 정체성 | 완전 독립 신규 프로젝트 (odin-loop 비의존) |
| 관리 대상 | 임의의 외부 코드베이스 |
| 에이전트 엔진 | Claude Code를 두뇌로 사용 (v1=플러그인 인-프로세스, 래핑 경로는 설계상 개방) |
| 인터페이스 | Claude Code 플러그인 우선 (풀스크린 TUI는 이후 마일스톤) |
| 이슈 백엔드 | 하이브리드 — 로컬(항목별 파일=진실원본) 우선 + GitHub 동기화(gh CLI 우선) |
| v1 수직 슬라이스 | 딥 인터뷰 → 이슈 분해 + 진척 추적 |

> 설치 경로(plugin marketplace vs git clone)는 미정(OQ4) — v1 비블로킹.

## 플러그인 구조

```
.claude-plugin/plugin.json   # 매니페스트
skills/                      # /dure:* 슬래시 명령
  interview/SKILL.md         # /dure:interview — 딥 인터뷰
  plan/SKILL.md              # /dure:plan      — 이슈 분해
  sync/SKILL.md              # /dure:sync      — GitHub 동기화
  status/SKILL.md            # /dure:status    — 진척 리포트
agents/                      # 인터뷰 서브에이전트
  grounding-scout.md         # 근거수집(특성①)
  redteam-critic.md          # 레드팀+게이트 사인오프(특성②/④)
  research-scout.md          # 자동 리서치(특성③)
hooks/hooks.json             # SessionStart: 스크립트 실행권한
scripts/                     # 결정적 유틸(부트스트랩·컨텍스트)
.dure/                       # dure 자신의 PM 상태(도그푸딩)
```

## 개발 / 로컬 테스트

```bash
# 이 repo를 플러그인으로 로드해 테스트
claude --plugin-dir /Users/yeonguk/Project/dure
# 세션 안에서:
/plugin validate          # 매니페스트·프론트매터 검증
/dure:interview "..."      # 딥 인터뷰
/agents                    # 서브에이전트 3종 확인
/reload-plugins            # 편집 후 반영
```

## 상태

🚧 **M1 빌드 중** — E1.1(플러그인 스캐폴드) 완료: 매니페스트·4개 슬래시 명령·서브에이전트
3종·부트스트랩/컨텍스트 스크립트. 다음: **E1.2 딥 인터뷰 엔진**. 로드맵은 `.dure/roadmap.md`.
