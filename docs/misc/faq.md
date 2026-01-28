# 자주 묻는 질문 (FAQ)

Dure 사용 시 자주 묻는 질문과 답변입니다.

## 일반

### Dure이 무엇인가요?

Dure은 AI 에이전트를 활용한 소프트웨어 엔지니어링 시스템입니다. 4개의 전문화된 에이전트(Refiner, Builder, Verifier, Gatekeeper)가 순차적으로 협력하여 코드를 생성하고, 인간은 중요한 판단 시점에만 개입합니다.

### 왜 "Dure"인가요?

오케스트라처럼 여러 에이전트가 조화롭게 협력한다는 의미입니다. 🎼

### 완성된 제품인가요?

아니오, Dure은 **MVP(Minimum Viable Product)**입니다. "Agentic Software Engineering" 패러다임이 실제로 동작함을 증명하는 것이 목표입니다.

### 상업적으로 사용할 수 있나요?

네, MIT 라이선스입니다.

## 설치 및 설정

### Node.js 버전이 맞지 않습니다

Dure은 Node.js 18.0.0 이상이 필요합니다:

```bash
node --version
# v18.0.0 이상이어야 함

# nvm 사용 시
nvm install 18
nvm use 18
```

### tmux가 설치되어 있지 않습니다

tmux는 필수 의존성입니다:

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install tmux

# 확인
tmux -V
```

### Claude CLI가 무엇인가요?

Claude CLI는 Anthropic의 공식 CLI 도구로, 터미널에서 Claude를 사용할 수 있게 해줍니다. 설치 방법은 [Anthropic 공식 문서](https://docs.anthropic.com/claude/docs/claude-cli)를 참고하세요.

## 사용법

### Briefing을 어떻게 작성하나요?

[Briefing 작성 가이드](/guide/writing-briefings.md)를 참고하세요. 핵심은:

- ✅ 구체적인 요구사항
- ✅ 명확한 제약 조건
- ✅ 예상 동작 정의
- ❌ 모호한 표현 지양

### CRP가 너무 자주 생성됩니다

Briefing에 모호한 표현("적당히", "알아서", "합리적으로")이 포함되어 있을 가능성이 높습니다. 구체적인 값으로 수정하세요.

예:
- ❌ "적절한 제한" → ✅ "분당 60회"
- ❌ "빠르게" → ✅ "100ms 이내"

### 에이전트가 너무 오래 걸립니다

몇 가지 해결 방법:

1. **모델 다운그레이드**: Opus/Sonnet → Haiku
2. **Briefing 단순화**: 복잡한 요구사항을 여러 Run으로 분할
3. **타임아웃 단축**: config에서 조정

[성능 문제 해결](/guide/troubleshooting.md#성능-문제) 참고

### 비용이 너무 많이 듭니다

1. **모델 최적화**: Builder만 Sonnet, 나머지는 Haiku
2. **Iteration 제한**: `max_iterations`를 2로 감소
3. **Briefing 품질 향상**: 명확한 Briefing → 재시도 감소

[비용 최적화](/advanced/cost-optimization.md) 참고

### MRP를 자동으로 머지할 수 있나요?

현재 MVP 버전에서는 수동으로 코드를 적용해야 합니다:

```bash
cp -r .dure/runs/{run_id}/mrp/code/* .
git add .
git commit -m "..."
```

향후 버전에서 자동 머지 기능 추가 예정입니다.

## 기술적 질문

### tmux 세션을 어떻게 확인하나요?

```bash
# tmux 세션 목록
tmux list-sessions

# 특정 세션 접속
tmux attach-session -t dure-run-{timestamp}

# 세션에서 나오기
Ctrl-b + d
```

### 에이전트는 어떤 권한으로 실행되나요?

에이전트는 `--dangerously-skip-permissions` 플래그로 실행됩니다. 즉, 프로젝트 내 모든 파일에 접근 가능합니다.

⚠️ 신뢰할 수 있는 프로젝트에서만 사용하세요.

### 여러 프로젝트를 동시에 실행할 수 있나요?

현재는 한 번에 하나의 프로젝트만 지원합니다. 각 프로젝트 폴더에서 별도로 `dure start`를 실행하면 포트 충돌이 발생합니다.

해결 방법:
```bash
cd project1
dure start --port 3000

cd project2
dure start --port 3001
```

### .dure 폴더를 Git에 커밋해야 하나요?

선택사항입니다:

**커밋하는 경우:**
- ✅ 팀원과 설정 공유
- ✅ 실행 기록 보존
- ❌ 저장소 크기 증가

**커밋하지 않는 경우:**
- ✅ 저장소 크기 절약
- ❌ 설정을 매번 재구성

권장: `.dure/config/`만 커밋

```gitignore
# .gitignore
.dure/runs/
!.dure/config/
```

### 사용량 추적은 어떻게 동작하나요?

Dure은 [ccusage](https://ccusage.com/)를 활용하여 Claude Code의 로컬 JSONL 파일에서 사용량을 수집합니다:

1. Claude Code가 `~/.claude/projects/`에 JSONL 기록
2. UsageTracker가 파일 변경 감지 (chokidar)
3. ccusage로 사용량 파싱
4. WebSocket으로 UI에 실시간 업데이트

ccusage 설치:
```bash
npm install -g ccusage
```

## 에러 및 문제 해결

### "Port 3000 is already in use"

다른 포트로 시작하거나 기존 프로세스를 종료하세요:

```bash
# 다른 포트 사용
dure start --port 3001

# 또는 3000 포트 프로세스 종료
lsof -ti:3000 | xargs kill
```

### 에이전트가 크래시했습니다

error.flag 파일을 확인하세요:

```bash
cat .dure/runs/{run_id}/{agent}/error.flag
```

대부분의 경우 자동으로 재시도됩니다. 계속 실패하면:

1. Briefing이 너무 복잡한지 확인
2. 모델을 더 강력한 것으로 변경 (Haiku → Sonnet)
3. GitHub Issue 생성

### tmux 세션이 남아있습니다

수동으로 종료하세요:

```bash
tmux kill-session -t dure-run-{timestamp}

# 모든 dure 세션 종료
tmux list-sessions | grep dure | cut -d: -f1 | xargs -I {} tmux kill-session -t {}
```

### 디스크 공간이 부족합니다

오래된 Run을 정리하세요:

```bash
# 30일 이전 Run 삭제
dure clean

# 7일 이전 Run 삭제
dure clean --days 7
```

## 고급 사용

### 커스텀 프롬프트를 사용할 수 있나요?

현재 MVP 버전에서는 지원하지 않지만, 향후 버전에서 프롬프트 템플릿 커스터마이징을 추가할 예정입니다.

### 자체 AI 모델을 사용할 수 있나요?

현재는 Claude API만 지원합니다. OpenAI, Gemini 등 다른 모델 지원은 로드맵에 있습니다.

### CI/CD에서 사용할 수 있나요?

현재는 대화형 사용만 지원합니다. CI/CD 통합은 향후 추가 예정입니다.

### 에이전트를 커스터마이징할 수 있나요?

현재는 모델과 타임아웃 정도만 설정 가능합니다. 향후 에이전트 행동을 더 세밀하게 제어할 수 있는 기능을 추가할 예정입니다.

## 로드맵

### 언제 v1.0이 출시되나요?

현재 v0.1 (MVP)입니다. 커뮤니티 피드백을 받아 개선 후 v1.0을 목표로 하고 있습니다.

### 자동 머지는 언제 추가되나요?

v0.2 또는 v0.3에서 추가 예정입니다. 안전성을 충분히 검증한 후 제공할 계획입니다.

### 다른 AI 모델 지원 계획은?

OpenAI (GPT-4), Google (Gemini), Anthropic Claude API 외 모델 지원을 계획 중입니다.

### 클라우드 버전 계획은?

장기 로드맵에는 있지만, 먼저 로컬 버전을 안정화하는 것이 우선입니다.

## 기여

### 어떻게 기여할 수 있나요?

- 🐛 버그 리포트: GitHub Issues
- 💡 기능 제안: GitHub Discussions
- 📝 문서 개선: Pull Request
- 💻 코드 기여: Pull Request

[기여 가이드](/misc/contributing.md) 참고

### 기능 요청은 어디에 하나요?

GitHub Discussions의 "Feature Requests" 카테고리에 작성해주세요.

### 버그를 발견했습니다

GitHub Issues에 다음 정보와 함께 리포트해주세요:

- 에러 메시지
- `events.log` 내용
- `state.json` 내용
- 실행 환경 (OS, Node 버전, tmux 버전)

## 커뮤니티

### 공식 커뮤니티가 있나요?

- GitHub Discussions: 질문, 토론
- GitHub Issues: 버그 리포트
- Twitter: [@dure_dev](https://twitter.com/dure_dev) (가상)

### 뉴스레터가 있나요?

현재는 없지만, GitHub에서 "Watch" 설정하면 업데이트를 받을 수 있습니다.

## 기타

### "Agentic Software Engineering"이 무엇인가요?

AI 에이전트가 소프트웨어 엔지니어링 작업을 주도적으로 수행하고, 인간은 판단과 결정에만 집중하는 패러다임입니다.

### 이름이 비슷한 다른 프로젝트와 차이점은?

Dure의 차이점:

- ✅ 파일 기반 조율 (명확한 인터페이스)
- ✅ 완전한 추적성 (모든 과정 기록)
- ✅ 인간 중심 설계 (CRP/VCR)
- ✅ tmux 기반 격리 (디버깅 용이)

### 상업적 지원이 있나요?

현재는 커뮤니티 지원만 제공됩니다. 상업적 지원은 추후 검토 예정입니다.

## 문제가 해결되지 않았나요?

1. [문제 해결 가이드](/guide/troubleshooting.md) 확인
2. [GitHub Discussions](https://github.com/yourusername/dure/discussions) 검색
3. 새 질문 작성

도움을 드리겠습니다! 🎼
