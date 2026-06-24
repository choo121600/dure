---
name: interview
description: dure 딥 인터뷰 — 막연한 요구사항을 이해도가 정량적으로 수렴할 때까지 인터뷰해 .dure/specs/<slug>.md로 박제. 코드근거·레드팀·자동리서치·정량 수렴게이트 4특성.
argument-hint: "<한 줄 요구사항>"
allowed-tools: Bash Read Grep Glob Task Write
disable-model-invocation: true
---

# /dure:interview — 딥 인터뷰

요청: **$ARGUMENTS**

목표: 위 요청을 [spec §4](../../.dure/spec.md)의 방법론으로 인터뷰해, 멈춤 조건(§4.4)을
만족한 뒤에만 `.dure/specs/<slug>.md` + `.dure/interview-logs/<slug>.md`를 박제한다.

## 0. 부트스트랩 + 컨텍스트 (E1.1)
1. `${CLAUDE_PLUGIN_ROOT}/scripts/dure-bootstrap.sh` 실행 → `.dure/` 보장(멱등).
2. `${CLAUDE_PLUGIN_ROOT}/scripts/dure-context.sh` 실행 → git/non-git·green/brownfield 파악.
3. **재개 확인(§4.6):** `.dure/interview-logs/`에 멈춤조건 미충족 로그가 있으면,
   새 인터뷰 대신 이어갈지 사용자에게 묻는다.

## 1. 딥 인터뷰 루프 (spec §4)
요청을 컴포넌트로 분해하고, 아래를 수렴까지 반복한다:

1. **근거** — `grounding-scout` 서브에이전트(Task)로 요청 키워드 범위의 코드/이슈를 읽어
   근거·후보답 수집. (특성①, 거대 repo는 바운드)
2. **점수** — 컴포넌트×차원(§4.2) 모호성을 정직하게 자기평가(0~5), 가중평균 산출.
3. **질문** — 최약 차원에 1~4개 질문(구조화 선택 + 자유서술, 후보답 동봉). AskUserQuestion 활용.
4. **레드팀** — `redteam-critic` 서브에이전트(Task)로 요구사항을 깨는 반대신문 ≥1개 주입.
5. **리서치** — 사용자가 모름/위임 시 `research-scout`로 출처 달린 후보답 제시.
6. **수렴** — 점수 갱신. 라운드별 (근거파일·점수·레드팀·결정)을 interview-log에 기록.

## 2. 멈춤 조건 + 게이밍 방지 가드 (§4.4) — 모두 충족해야 종료
1. 런 레벨 가중 모호성 ≤ `config.yml: interview.ambiguity_threshold`
2. 모든 활성 컴포넌트가 테스트 가능 수용기준 — **`redteam-critic`이 "테스트 가능" 사인오프**
3. 미해결 블로킹 오픈 질문 0
4. 최소 `min_rounds` 완료 AND 직전 라운드 신규 모호성 0

## 3. 크리스털라이즈
멈춤 조건 충족 시에만 spec을 박제하고, `.dure/active`에 slug를 기록한다.
이후 `/dure:plan`으로 분해.

---
> **구현 상태(E1.1 스캐폴드):** 0번(부트스트랩·컨텍스트·재개 감지)은 동작.
> 1~3번 루프의 서브에이전트 오케스트레이션·정량 점수화·게이트 가드는 **E1.2에서 강화** 중이다.
> 현재는 위 방법론을 직접 따라 인터뷰를 수행하되, 서브에이전트가 아직 없으면 메인 컨텍스트에서
> 근거수집/레드팀을 수행하고 그 사실을 로그에 명시한다.
