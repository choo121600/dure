# 기여 가이드

Orchestral에 기여해주셔서 감사합니다! 🎼

## 기여 방법

### 버그 리포트

버그를 발견하셨나요? GitHub Issues에 리포트해주세요.

**포함할 정보:**

- 명확한 제목 (예: "Builder가 JSON 파싱 에러로 크래시")
- 재현 단계
- 예상 동작 vs 실제 동작
- 환경 정보:
  - OS 및 버전
  - Node.js 버전
  - tmux 버전
  - Claude CLI 버전
  - Orchestral 버전
- 로그 파일:
  - `events.log`
  - `state.json`
  - `error.flag` (있는 경우)

**템플릿:**

```markdown
## 버그 설명
Builder가 JSON 파싱 중 크래시합니다.

## 재현 단계
1. orchestral start 실행
2. 다음 Briefing 작성: [내용]
3. Run 시작
4. Builder Phase에서 크래시

## 예상 동작
Builder가 정상적으로 완료되어야 합니다.

## 실제 동작
error.flag가 생성되고 "Unexpected token" 에러 발생

## 환경
- OS: macOS 14.0
- Node.js: v20.0.0
- tmux: 3.3a
- Claude CLI: 1.2.0
- Orchestral: 0.1.0

## 로그
[첨부 파일 또는 내용]
```

### 기능 제안

새로운 기능을 제안하고 싶으신가요? GitHub Discussions의 "Feature Requests" 카테고리를 사용하세요.

**포함할 정보:**

- 문제점: 현재 어떤 불편함이 있나요?
- 제안: 어떤 기능이 필요한가요?
- 사용 사례: 어떤 상황에서 사용하나요?
- 대안: 다른 해결 방법은 없나요?

### 코드 기여

Pull Request는 언제나 환영합니다!

#### 사전 준비

1. **Fork & Clone**

```bash
# Fork: GitHub에서 "Fork" 버튼 클릭

# Clone
git clone https://github.com/your-username/orchestral.git
cd orchestral

# Upstream 추가
git remote add upstream https://github.com/yourusername/orchestral.git
```

2. **개발 환경 설정**

```bash
# 의존성 설치
npm install

# 빌드
npm run build

# 테스트
npm test

# 로컬 실행
npm run dev
```

#### 브랜치 전략

```bash
# 최신 main 받기
git checkout main
git pull upstream main

# Feature 브랜치 생성
git checkout -b feature/your-feature-name

# 또는 Bugfix 브랜치
git checkout -b fix/bug-description
```

브랜치 네이밍:

- `feature/` - 새 기능
- `fix/` - 버그 수정
- `docs/` - 문서 수정
- `refactor/` - 리팩토링
- `test/` - 테스트 추가

#### 코드 작성

**코딩 스타일:**

- TypeScript strict mode 준수
- ESLint 규칙 따르기
- 의미 있는 변수명/함수명
- 복잡한 로직에 주석 추가

**테스트:**

- 새 기능은 테스트 필수
- 기존 테스트가 통과해야 함
- 커버리지 80% 이상 유지

```bash
# 테스트 실행
npm test

# 커버리지 확인
npm run test:coverage
```

**커밋 메시지:**

```
<type>: <subject>

<body>

<footer>
```

타입:

- `feat`: 새 기능
- `fix`: 버그 수정
- `docs`: 문서 수정
- `style`: 코드 포매팅 (로직 변경 없음)
- `refactor`: 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 빌드 설정, 의존성 업데이트 등

예시:

```
feat: Add auto-retry for agent crashes

에이전트 크래시 시 자동으로 재시도하는 기능을 추가했습니다.
config.global.auto_retry.enabled 설정으로 제어할 수 있습니다.

Closes #123
```

#### Pull Request 제출

1. **변경 사항 Push**

```bash
git add .
git commit -m "feat: Add auto-retry"
git push origin feature/auto-retry
```

2. **PR 생성**

GitHub에서 "New Pull Request" 클릭

**PR 템플릿:**

```markdown
## 변경 사항
[무엇을 변경했나요?]

## 동기
[왜 이 변경이 필요한가요?]

## 테스트
[어떻게 테스트했나요?]

## 체크리스트
- [ ] 테스트 추가/업데이트
- [ ] 문서 업데이트
- [ ] CHANGELOG.md 업데이트 (breaking change인 경우)
- [ ] 모든 테스트 통과
- [ ] ESLint 통과

## 스크린샷 (UI 변경 시)
[스크린샷]

## 관련 이슈
Closes #123
```

3. **코드 리뷰 대응**

- 리뷰어의 피드백에 정중하게 응답
- 변경 요청 사항 반영
- 토론은 PR 코멘트에서

### 문서 기여

문서 개선도 큰 기여입니다!

**문서 위치:**

- 가이드: `docs/guide/`
- 아키텍처: `docs/architecture/`
- API: `docs/api/`
- 기타: `docs/misc/`

**수정 방법:**

1. `docs/` 폴더의 Markdown 파일 수정
2. 로컬에서 확인:

```bash
# Docsify 서버 실행
npx docsify serve docs

# http://localhost:3000 접속
```

3. PR 제출

**문서 작성 가이드라인:**

- 명확하고 간결하게
- 코드 예시 포함
- 스크린샷 활용 (UI 관련)
- 내부 링크 활용

## 개발 가이드

### 프로젝트 구조

```
orchestral/
├── src/
│   ├── cli/              # CLI 명령어
│   ├── core/             # 핵심 로직
│   ├── server/           # 웹 서버
│   ├── agents/           # 에이전트 로직
│   └── types/            # TypeScript 타입
├── templates/            # 프롬프트 템플릿
├── docs/                 # 문서
└── tests/                # 테스트
```

### 주요 모듈

| 모듈 | 설명 |
|------|------|
| `Orchestrator` | 에이전트 실행 조율 |
| `StateManager` | 상태 관리 |
| `FileWatcher` | 파일 시스템 감시 |
| `TmuxManager` | tmux 세션 관리 |
| `UsageTracker` | 토큰 사용량 추적 |

### 테스트 작성

```typescript
// tests/core/orchestrator.test.ts
import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../src/core/orchestrator';

describe('Orchestrator', () => {
  it('should start run with valid briefing', async () => {
    const orchestrator = new Orchestrator();
    const runId = await orchestrator.startRun('# Test Briefing');

    expect(runId).toMatch(/^run-\d{8}-\d{6}$/);
  });

  it('should emit agent.started event', async () => {
    const orchestrator = new Orchestrator();
    let eventReceived = false;

    orchestrator.on('agent.started', () => {
      eventReceived = true;
    });

    await orchestrator.startAgent('refiner');
    expect(eventReceived).toBe(true);
  });
});
```

### 디버깅

**로그 레벨 조정:**

```bash
orchestral start --log-level debug
```

**브레이크포인트:**

```typescript
// src/core/orchestrator.ts
console.log('[DEBUG] Starting agent:', agentName);
debugger; // Node.js 디버거 사용
```

**VSCode 디버깅:**

`.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Orchestral",
      "program": "${workspaceFolder}/src/cli/index.ts",
      "args": ["start"],
      "runtimeArgs": ["-r", "tsx"],
      "console": "integratedTerminal"
    }
  ]
}
```

## 커뮤니티 가이드라인

### 행동 강령

- 🤝 존중과 배려
- 💬 건설적인 피드백
- 🌍 다양성 존중
- 🚫 괴롭힘 금지

### 소통 채널

- **GitHub Issues**: 버그 리포트
- **GitHub Discussions**: 질문, 토론
- **Pull Requests**: 코드 리뷰

### 응답 시간

- 이슈/PR: 보통 3-5일 이내
- 긴급한 경우: "urgent" 라벨 추가

## 릴리스 프로세스

### 버전 관리

[Semantic Versioning](https://semver.org/) 사용:

- **Major** (1.0.0): Breaking changes
- **Minor** (0.1.0): 새 기능 (하위 호환)
- **Patch** (0.0.1): 버그 수정

### 릴리스 체크리스트

1. [ ] 모든 테스트 통과
2. [ ] CHANGELOG.md 업데이트
3. [ ] package.json 버전 업데이트
4. [ ] Git tag 생성
5. [ ] npm publish
6. [ ] GitHub Release 작성

## 라이선스

기여한 코드는 [MIT License](../LICENSE)가 적용됩니다.

## 질문이 있으신가요?

- GitHub Discussions에 질문 작성
- 이메일: orchestral@example.com (가상)

감사합니다! 🎼
