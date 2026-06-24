---
name: sync
description: dure 동기화 — 로컬 로드맵을 GitHub Issues/Milestones와 멱등 동기화. 구조는 push, 상태는 pull, 충돌은 보고. gh CLI 우선.
argument-hint: ""
allowed-tools: Bash Read Write
disable-model-invocation: true
---

# /dure:sync — GitHub 동기화

목표: [spec §5.3](../../.dure/spec.md)대로 로컬 로드맵 ↔ GitHub를 **멱등** 동기화.

## 규칙
- 도구: `gh` CLI 우선, 없으면 github MCP 폴백(`config.yml: github.sync`).
- **구조 = 로컬 → GitHub push**: 마일스톤→Milestone, 에픽→트래킹 이슈(label `epic`), 이슈→Issue.
- **상태 = GitHub → 로컬 pull**: 닫힘/라벨/담당.
- 매핑 키: 항목 `id` ↔ GH 번호, `.dure/sync/github-map.json`에 캐시(멱등 보장).
- **충돌**(양쪽 상이 변경) 시 자동 병합하지 않고 **감지·보고**.
- GitHub 미연결/오프라인이면 push/pull을 스킵하고 그 사실을 명확히 보고(로컬은 정상).

## 절차
1. `gh auth status`로 가용성 확인. `config.yml: github.repo` 확인(없으면 remote 추정 또는 질문).
2. `github-map.json` 로드 → 신규 항목만 생성, 기존은 갱신(중복 생성 금지).
3. 상태 pull → 로컬 프론트매터 `status`/`github` 갱신, 충돌 목록 보고.

---
> **구현 상태(E1.1 스캐폴드):** 규칙·절차 정의 완료. gh 어댑터·멱등 매핑은 **E1.4에서 구현**.
