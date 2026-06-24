---
name: status
description: dure 진척 리포트 — 로컬 로드맵과 GitHub 상태를 머지해 마일스톤별 완료율·블로커·충돌을 리포트.
argument-hint: "[milestone-id]"
allowed-tools: Bash Read
disable-model-invocation: true
---

# /dure:status — 진척 리포트

범위: **$ARGUMENTS** (비면 전체 마일스톤)

목표: [spec §5.3 / E1.5](../../.dure/spec.md)대로 로컬 항목 상태와 GitHub 상태를 머지해
진척을 리포트한다.

## 절차
1. `${CLAUDE_PLUGIN_ROOT}/scripts/dure-context.sh`로 컨텍스트·active spec 확인.
2. `.dure/roadmap/`의 항목 상태(todo/doing/done/blocked)를 집계.
3. `.dure/sync/github-map.json`이 있으면 GitHub 상태를 머지(충돌은 표시).
4. 리포트: 마일스톤별 완료율, 블로커 목록, 로컬↔GitHub 충돌.

---
> **구현 상태(E1.1 스캐폴드):** 절차 정의 완료. 상태 머지·리포트 집계는 **E1.5에서 구현**.
