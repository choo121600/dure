# dure — 레드팀 크리틱 원장 (critique.md)

> spec/roadmap(초안)에 dure의 "공격적 레드팀 크리틱"을 적용한 결과.
> 모든 항목 해소 완료 → [`spec.md`](spec.md) v1.1에 반영.

| # | 심각도 | 발견 | 해소 |
|---|---|---|---|
| C1 | 🔴 BLOCKING | D3('CLI 래핑') ↔ D4('플러그인') 모순. 플러그인은 세션 *안* 확장이지 외부 오케스트레이터가 아님 | **결정**: 플러그인-퍼스트. D3을 "Claude Code를 두뇌로 사용"으로 재해석. 코어 로직을 인터페이스와 분리해 subprocess 래핑 경로를 설계상 개방 |
| C2 | 🔴 BLOCKING | '엔진'이 코드인지 프롬프트인지 불명확 | 엔진 = `스킬 지시 + 서브에이전트 오케스트레이션 + 파일 상태`로 명시 (spec §3.1) |
| C3 | 🔴 BLOCKING | 정량 수렴 게이트가 모델 자기평가라 게이밍 가능 | 멈춤조건에 **독립 크리틱 서브에이전트 사인오프** + "직전 라운드 신규 모호성 0" 객관 신호 + 최소 1라운드 (spec §4.4) |
| C4 | 🟠 MAJOR | 서브에이전트 역할이 설계에 없음 | 4특성을 서브에이전트로 분업: grounding-scout / redteam-critic / research-scout / 메인 오케스트레이터 (spec §4.5) |
| C5 | 🟠 MAJOR | sync 방향 미정의(추적은 GitHub 상태를 읽어야 함) | 양방향 명시: 구조=로컬→GH push, 상태=GH→로컬 pull, 충돌은 감지·보고 (spec §5.3) |
| C6 | 🟠 MAJOR | 로드맵 포맷 불일치(spec=분리파일 vs 자신=단일파일) | **결정**: 항목별 파일=진실원본, `index.md`=생성 인덱스 (spec §5.1) |
| C7 | 🟠 MAJOR | 재개(resume) 부재 | in-progress 인터뷰 로그 감지 후 이어가기 (spec §4.6) |
| C8 | 🟠 MAJOR | 다중 spec 선택 부재 | 'active spec' 포인터 + slug 선택 (spec §6) |
| C9 | 🟠 MAJOR | 거대 repo 근거수집 폭주 | 요청 키워드로 바운드된 타깃 grounding (spec §4.5 grounding-scout) |
| C10 | 🟡 MINOR | 차원 가중치 기본값 없음 | Problem×3·Scope×3·Acceptance×3·Constraints×2·Edge×2·Stakeholders×1 (spec §4.2) |
| C11 | 🟡 MINOR | sync 도구 미정 | **결정**: gh CLI 우선, github MCP 폴백 (spec §5.2) |
| C12 | 🟡 MINOR | 배포/설치 경로 미정 | README에 설치 경로 명기, v1 비블로킹 (OQ로 잔류) |
