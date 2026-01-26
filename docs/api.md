# Orchestral - API 및 이벤트 명세

## CLI 명령어

```bash
orchestral start                    # 프로젝트 시작
orchestral start --port 3001        # 포트 지정
orchestral start --no-browser       # 브라우저 자동 열기 비활성화
orchestral status                   # 현재 run 상태
orchestral logs                     # 실시간 로그
orchestral stop                     # run 중지
orchestral history                  # 과거 run 목록
```

## ACE 웹서버 페이지 구조

```
/                       # 대시보드 (현재 상태, 최근 runs)
/settings               # 에이전트별 설정
/run/new                # 새 run 시작 (briefing 입력)
/run/:id                # run 상세 (실시간 진행 상황)
/run/:id/crp/:crpId     # CRP 응답 페이지
/run/:id/mrp            # MRP 검토 페이지
/history                # 과거 runs 목록
```

UI 구현: `src/server/public/`

## 이벤트 유형

| 이벤트 | 트리거 | 심각도 | 액션 |
|--------|--------|--------|------|
| `agent.started` | 에이전트 실행 시작 | info | 상태 업데이트, UI 갱신 |
| `agent.completed` | done.flag 생성 | info | 다음 에이전트 시작, UI 갱신 |
| `agent.failed` | error.flag 또는 크래시 | error | 중단, 알림, 인간 개입 요청 |
| `agent.timeout` | 제한 시간 초과 | warning | 경고, 재시도 또는 중단 선택 |
| `crp.created` | CRP 파일 생성 | warning | 인간 입력 필요 알림 |
| `vcr.created` | VCR 파일 생성 | info | 해당 에이전트 재시작 |
| `mrp.created` | MRP 디렉토리 생성 | success | 완료 알림, 검토 요청 |
| `iteration.started` | 재시도 시작 | info | 상태 업데이트 |
| `iteration.exhausted` | max_iterations 도달 | error | 중단, 인간 개입 요청 |

## 알림 채널

- **WebSocket (필수)**: 실시간 UI 푸시, 재연결 및 상태 동기화
- **Terminal Bell (선택)**: `\a`, `config.global.terminal_bell: true`
- **System Notification (선택)**: macOS `osascript`, Linux `notify-send`
- **File Log (필수)**: `events.log`에 모든 이벤트 기록

## WebSocket 이벤트

**서버→클라이언트:**
- `agent.started`, `agent.completed`, `agent.failed`, `agent.timeout`
- `crp.created`, `phase.changed`, `run.completed`, `run.failed`

**클라이언트→서버:**
- `retry.agent`, `stop.run`, `extend.timeout`, `vcr.submit`

## 에러 처리

**에러 유형:**
- `crash` (재시도 가능): 프로세스 비정상 종료
- `timeout` (재시도 가능): 시간 초과
- `validation` (재시도 가능): 출력 형식 오류
- `permission` (복구 불가): 파일/명령 권한 오류
- `resource` (복구 불가): 메모리/디스크 부족

**에이전트 status 값:**
`pending`, `running`, `completed`, `failed`, `timeout`, `waiting_human`

## 타임아웃 처리

| 에이전트 | 기본값 |
|---------|--------|
| Refiner | 5분 (300000ms) |
| Builder | 10분 (600000ms) |
| Verifier | 5분 (300000ms) |
| Gatekeeper | 5분 (300000ms) |

**timeout_action 옵션:** `warn`, `retry`, `stop`

## events.log 형식

```
{timestamp} [{level}] {event_type} {key=value pairs}
```

예시:
```
2024-01-15T14:30:22Z [INFO] run.started run_id=run-20240115-143022
2024-01-15T14:30:25Z [INFO] agent.started agent=refiner
2024-01-15T14:31:00Z [INFO] agent.completed agent=refiner duration_ms=35000
```

## Usage 추적

[ccusage](https://ccusage.com/)를 활용하여 `~/.claude/projects/`의 JSONL 파일에서 사용량 수집.
구현: `src/core/usage-tracker.ts`
