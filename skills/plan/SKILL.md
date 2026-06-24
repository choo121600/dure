---
name: plan
description: dure 분해 — 확정된 active spec을 마일스톤/에픽/이슈 항목별 파일로 분해하고 roadmap/index.md를 생성. 모든 이슈에 테스트 가능 수용기준.
argument-hint: "[spec-slug]"
allowed-tools: Bash Read Grep Glob Write Task
disable-model-invocation: true
---

# /dure:plan — 이슈 분해

대상 spec: **$ARGUMENTS** (비면 `.dure/active`의 slug 사용)

목표: [spec §5](../../.dure/spec.md)의 분해 모델로, 확정 spec을 마일스톤 ⊃ 에픽 ⊃ 이슈로
분해한다. **항목별 파일이 진실원본**(`.dure/roadmap/{milestones,epics,issues}/<id>.md`),
`roadmap/index.md`는 생성 인덱스.

## 절차
1. `${CLAUDE_PLUGIN_ROOT}/scripts/dure-bootstrap.sh` 실행(멱등).
2. active spec 결정: 인자 > `.dure/active` > 사용자에게 질문.
3. spec을 마일스톤/에픽/이슈로 분해. 각 이슈는 **비어있지 않은 테스트 가능 수용기준** 필수.
   - 항목별 파일 프론트매터: `id`, `slug`, `type`, `title`, `status`, `github`, 링크, (이슈)`acceptance`.
   - `id`는 안정적으로 유지(재분해 시 동일 spec→동일 id).
4. `redteam-critic`으로 분해 검토: 누락/중복/과대 이슈 크리틱 후 정리(I1.3.3).
5. `roadmap/index.md` 생성(요약 트리, 편집 금지 표식).

포맷 예시는 `.dure/roadmap/`의 m1 / e1.2 / i1.2.5 샘플 참조.

---
> **구현 상태(E1.1 스캐폴드):** 절차 정의 완료. 자동 분해기·index 생성기는 **E1.3에서 구현**.
