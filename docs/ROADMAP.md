# Orchestral - 로드맵

## 구현 우선순위 (MVP)

### Phase 1: 핵심 구조

1. **CLI 기본** - `orchestral start` 명령어
2. **폴더 구조 생성** - `.orchestral/` 초기화
3. **state.json 관리** - 상태 읽기/쓰기
4. **tmux 세션 생성** - 기본 레이아웃

### Phase 2: 에이전트 실행

1. **Refiner 구현** - briefing 처리
2. **Builder 구현** - 코드 생성
3. **Verifier 구현** - 테스트 생성/실행
4. **Gatekeeper 구현** - 판정 로직

### Phase 3: 웹서버

1. **기본 서버** - Express 기반
2. **대시보드** - 상태 표시
3. **CRP 페이지** - 인간 응답 수집
4. **MRP 페이지** - 결과 검토

### Phase 4: 통합

1. **실시간 상태 동기화** - 웹소켓
2. **설정 UI** - 에이전트 설정
3. **히스토리** - 과거 run 조회

## 기술 스택

| 구성요소 | 기술 |
|---------|------|
| CLI | Node.js + Commander.js |
| 웹서버 | Express + Socket.io |
| 프론트엔드 | Vanilla JS (MVP) |
| 에이전트 실행 | Claude Code CLI (headless) |
| 프로세스 관리 | tmux |
| 상태 저장 | JSON 파일 |

## 제외 사항 (MVP 범위 밖)

- 화려한 UI
- 자동 머지
- 비용 최적화
- 클라우드 배포
- 멀티 유저
- Git 통합 자동화

## 성공 기준

1. `orchestral start` → 웹서버 시작
2. Briefing 입력 → 4개 에이전트 순차 실행
3. CRP 발생 시 → 웹에서 응답 가능
4. 최종 MRP 생성 → 인간이 검토 가능
5. 전체 과정이 로그로 기록됨
6. 단계 전환 시 → 웹 UI 실시간 업데이트
7. 에러/타임아웃 발생 시 → 알림 및 복구 옵션 제공
8. 모든 이벤트가 events.log에 기록됨
9. 에이전트별 토큰 사용량과 비용이 대시보드에 실시간 표시됨
