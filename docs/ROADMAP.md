# Orchestral 고도화 로드맵

## 개요

이 문서는 Orchestral MVP를 프로덕션 레벨 시스템으로 발전시키기 위한 단계별 계획을 정의한다.

---

## 우선순위 요약

| 우선순위 | 기능 | 목표 |
|---------|------|------|
| **P0** | 에이전트 헬스체크 & 타임아웃 | 안정성 확보 |
| **P0** | 실시간 출력 스트리밍 | UX 핵심 |
| **P1** | Git 통합 | 실용성 |
| **P1** | 프로젝트 컨텍스트 자동 감지 | 품질 향상 |
| **P1** | Diff 뷰어 | 리뷰 효율 |
| **P2** | 메트릭 & 비용 추적 | 운영 |
| **P2** | VS Code Extension | 접근성 |
| **P3** | 학습 시스템 | 장기 개선 |
| **P3** | 멀티 에이전트 병렬 | 성능 |

---

## Phase 0: 안정성 및 실시간 스트리밍 (P0)

### 0.1 에이전트 헬스체크 & 타임아웃

**목표:** 에이전트 프로세스 장애를 감지하고 대응

**현재 문제:**
- Claude CLI가 죽어도 감지 불가
- 무한 대기 상태 발생 가능
- 에이전트 출력 확인 불가

**구현 내용:**

```typescript
// src/core/agent-monitor.ts
export class AgentMonitor {
  // tmux pane 출력 캡처 (tmux capture-pane)
  captureOutput(pane: number): string;

  // 마지막 출력 시간 추적 (heartbeat 대용)
  checkActivity(agent: AgentName): { lastActivity: Date; isStale: boolean };

  // 타임아웃 감지
  watchTimeout(agent: AgentName, timeoutMs: number): Promise<'completed' | 'timeout'>;

  // 에이전트 강제 종료
  killAgent(agent: AgentName): void;

  // 자동 재시작
  restartAgent(agent: AgentName): void;
}
```

**설정:**

```typescript
// config에 추가
interface AgentTimeoutConfig {
  refiner: number;   // 기본 300000 (5분)
  builder: number;   // 기본 600000 (10분)
  verifier: number;  // 기본 300000 (5분)
  gatekeeper: number; // 기본 300000 (5분)
  activityCheckInterval: number; // 기본 30000 (30초)
  maxInactivityTime: number; // 기본 120000 (2분)
}
```

**수정 파일:**
- `src/types/index.ts` - 새 타입 추가
- `src/config/defaults.ts` - 타임아웃 기본값
- `src/core/agent-monitor.ts` - 새 파일
- `src/core/tmux-manager.ts` - 출력 캡처 추가
- `src/core/orchestrator.ts` - 모니터 통합

---

### 0.2 실시간 출력 스트리밍

**목표:** 에이전트 작업 진행 상황을 실시간으로 표시

**현재 문제:**
- 완료 후에만 결과 확인 가능
- 긴 작업 시 진행 상황 불명

**구현 내용:**

```typescript
// src/core/output-streamer.ts
export class OutputStreamer extends EventEmitter {
  // tmux capture-pane을 주기적으로 실행
  startStreaming(runId: string): void;
  stopStreaming(): void;

  // 이벤트: 'output' | 'error'
  // emit('output', { agent, content, timestamp })
}
```

**프론트엔드:**

```html
<!-- 터미널 스타일 출력 영역 -->
<div class="agent-terminal" id="terminal-builder">
  <div class="terminal-header">Builder Output</div>
  <pre class="terminal-content"></pre>
</div>
```

**Socket.io 이벤트:**

```typescript
socket.emit('agent_output', {
  agent: 'builder',
  type: 'stdout',
  content: '파일 생성 중: src/middleware/auth.ts',
  timestamp: Date.now()
});
```

**수정 파일:**
- `src/core/output-streamer.ts` - 새 파일
- `src/server/index.ts` - Socket.io 이벤트 추가
- `src/server/public/index.html` - 실시간 로그 표시
- `src/server/public/run-detail.html` - 에이전트별 로그 탭
- `src/server/public/styles.css` - 터미널 스타일

---

## Phase 1: 실용성 및 품질 향상 (P1)

### 1.1 Git 통합

**목표:** Git 워크플로우 자동화

**기능:**

```typescript
interface GitIntegration {
  // 자동 브랜치 생성
  createBranch: (runId: string) => `orchestral/${runId}`;

  // MRP 승인 시 자동 커밋
  autoCommit: boolean;

  // PR 자동 생성
  createPR: {
    enabled: boolean;
    template: string;
    labels: string[];
  };

  // 충돌 해결
  conflictResolution: 'manual' | 'auto-merge' | 'abort';
}
```

**구현:**

```typescript
// src/integrations/git-manager.ts
export class GitManager {
  constructor(projectRoot: string);

  // 브랜치 관리
  createBranch(name: string): void;
  checkout(branch: string): void;

  // 커밋
  stageFiles(files: string[]): void;
  commit(message: string): void;

  // PR (gh CLI 사용)
  createPullRequest(options: PROptions): Promise<string>;

  // 상태
  getStatus(): GitStatus;
  getDiff(files?: string[]): string;
}
```

**설정 추가 (`config/global.json`):**

```json
{
  "git": {
    "enabled": true,
    "autoBranch": true,
    "branchPrefix": "orchestral/",
    "autoCommit": false,
    "createPR": false,
    "prLabels": ["orchestral", "auto-generated"]
  }
}
```

**수정 파일:**
- `src/types/index.ts` - GitConfig 타입
- `src/integrations/git-manager.ts` - 새 파일
- `src/core/orchestrator.ts` - Git 통합
- `src/server/routes/mrp.ts` - 승인 시 커밋/PR 생성

---

### 1.2 프로젝트 컨텍스트 자동 감지

**목표:** 프로젝트 환경을 자동으로 분석하여 에이전트에게 전달

**데이터 구조:**

```typescript
interface ProjectContext {
  // 자동 감지
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust' | 'java';
  framework: string;  // express, nextjs, django, fastapi, etc.
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry' | 'go mod';
  testFramework: string;  // jest, vitest, pytest, go test

  // 코드베이스 분석
  structure: {
    srcDir: string;
    testDir: string;
    configFiles: string[];
  };

  existingPatterns: {
    naming: 'camelCase' | 'snake_case' | 'PascalCase';
    fileOrganization: string;
    importStyle: string;
  };

  relevantFiles: string[];  // briefing 관련 파일
  dependencies: Record<string, string>;
}
```

**구현:**

```typescript
// src/context/project-analyzer.ts
export class ProjectAnalyzer {
  constructor(projectRoot: string);

  // 전체 분석
  analyze(): Promise<ProjectContext>;

  // 개별 분석
  detectLanguage(): string;
  detectFramework(): string;
  detectTestFramework(): string;
  analyzeCodePatterns(): CodePatterns;

  // briefing 기반 관련 파일 찾기
  findRelevantFiles(briefing: string): string[];
}
```

**프롬프트 개선:**

```markdown
# Builder Agent

## 프로젝트 컨텍스트
- 언어: TypeScript
- 프레임워크: Express
- 테스트: Jest
- 패키지 매니저: npm

## 기존 코드 패턴
- 네이밍: camelCase
- 파일 구조: src/{feature}/{file}.ts
- 임포트 스타일: 절대 경로 (@/...)

## 관련 파일
- src/routes/users.ts (유사한 API 구현)
- src/middleware/auth.ts (인증 미들웨어)
```

**수정 파일:**
- `src/context/project-analyzer.ts` - 새 파일
- `src/agents/prompt-generator.ts` - 컨텍스트 주입
- `templates/*.md` - 컨텍스트 섹션 추가

---

### 1.3 Diff 뷰어

**목표:** GitHub 스타일의 코드 변경 리뷰 UI

**기능:**
- Side-by-side diff 표시
- Syntax highlighting
- 라인별 코멘트 (선택)
- 파일별 승인/거부

**구현:**

```typescript
// src/server/routes/diff.ts
router.get('/api/runs/:runId/diff', async (req, res) => {
  const changes = await getFileChanges(runId);
  // changes: { file, oldContent, newContent, status }[]
  res.json({ success: true, data: changes });
});
```

**프론트엔드 (diff2html 라이브러리 사용):**

```html
<!-- MRP 페이지에 추가 -->
<section id="diff-section">
  <h2>Code Changes</h2>
  <div id="diff-container"></div>
</section>

<script src="https://cdn.jsdelivr.net/npm/diff2html/bundles/js/diff2html-ui.min.js"></script>
```

**수정 파일:**
- `src/server/routes/diff.ts` - 새 파일
- `src/server/public/mrp.html` - Diff 뷰어 UI
- `src/server/public/styles.css` - Diff 스타일
- `package.json` - diff 라이브러리 추가

---

## Phase 2: 운영 및 접근성 (P2)

### 2.1 메트릭 & 비용 추적

**목표:** 실행 통계 수집 및 시각화

**데이터 구조:**

```typescript
interface RunMetrics {
  // 시간
  totalDuration: number;
  agentDurations: Record<AgentName, number>;

  // 토큰 (추정)
  tokenUsage: {
    input: number;
    output: number;
    estimatedCost: number;
  };

  // 품질
  testCoverage?: number;
  testsTotal: number;
  testsPassed: number;

  // 효율
  iterations: number;
  crpCount: number;
}

interface AggregateMetrics {
  totalRuns: number;
  successRate: number;
  avgDuration: number;
  totalCost: number;
  runsByDay: Record<string, number>;
}
```

**구현:**

```typescript
// src/metrics/collector.ts
export class MetricsCollector {
  recordAgentStart(runId: string, agent: AgentName): void;
  recordAgentEnd(runId: string, agent: AgentName): void;
  recordTokenUsage(runId: string, agent: AgentName, tokens: TokenCount): void;

  getRunMetrics(runId: string): RunMetrics;
  getAggregateMetrics(days?: number): AggregateMetrics;
}

// src/metrics/cost-estimator.ts
export class CostEstimator {
  // 모델별 가격 (per 1M tokens)
  private pricing = {
    haiku: { input: 0.25, output: 1.25 },
    sonnet: { input: 3, output: 15 },
    opus: { input: 15, output: 75 }
  };

  estimateCost(model: AgentModel, inputTokens: number, outputTokens: number): number;
}
```

**대시보드 추가:**

```
/metrics                    # 메트릭 대시보드
  ├─ 일별 run 수 차트
  ├─ 성공률 추이
  ├─ 비용 누적 그래프
  └─ 에이전트별 평균 시간
```

**수정 파일:**
- `src/types/index.ts` - 메트릭 타입
- `src/metrics/collector.ts` - 새 파일
- `src/metrics/cost-estimator.ts` - 새 파일
- `src/core/orchestrator.ts` - 메트릭 수집 통합
- `src/server/routes/metrics.ts` - API 라우트
- `src/server/public/metrics.html` - 대시보드 UI

---

### 2.2 VS Code Extension

**목표:** IDE 내에서 Orchestral 사용

**기능:**
- 사이드바: Run 상태 트리뷰
- 알림: CRP 도착 시 알림
- 명령어:
  - `Orchestral: Start Run`
  - `Orchestral: Open Dashboard`
  - `Orchestral: Respond to CRP`
- 인라인: 변경된 파일에 diff 마커

**구조:**

```
vscode-orchestral/
├── package.json
├── src/
│   ├── extension.ts
│   ├── providers/
│   │   ├── RunTreeProvider.ts
│   │   └── DiffDecorationProvider.ts
│   ├── commands/
│   │   ├── startRun.ts
│   │   ├── respondCRP.ts
│   │   └── openDashboard.ts
│   └── api/
│       └── client.ts
```

**package.json:**

```json
{
  "name": "vscode-orchestral",
  "displayName": "Orchestral",
  "description": "Agentic Software Engineering",
  "version": "0.1.0",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": ["workspaceContains:.orchestral"],
  "contributes": {
    "views": {
      "explorer": [{
        "id": "orchestralRuns",
        "name": "Orchestral"
      }]
    },
    "commands": [
      { "command": "orchestral.startRun", "title": "Start Run" },
      { "command": "orchestral.openDashboard", "title": "Open Dashboard" }
    ]
  }
}
```

---

## Phase 3: 고급 기능 (P3)

### 3.1 학습 시스템

**목표:** 과거 경험에서 학습하여 점진적 개선

**기능:**

```typescript
interface LearningSystem {
  // VCR 패턴 학습
  // "이 프로젝트에서는 항상 옵션 A를 선택했음"
  learnFromVCRs(): VCRPattern[];

  // 실패 패턴 분석
  // "이런 유형의 briefing은 자주 실패함"
  analyzeFailures(): FailurePattern[];

  // 프로젝트별 선호도
  // "이 프로젝트는 Jest보다 Vitest 선호"
  projectPreferences: Map<string, Preferences>;

  // 자동 제안
  suggestImprovements(briefing: string): Suggestion[];
}
```

**저장소:**

```
.orchestral/
├── learning/
│   ├── vcr-patterns.json      # VCR 패턴
│   ├── failure-patterns.json  # 실패 패턴
│   └── preferences.json       # 프로젝트 선호도
```

**구현:**

```typescript
// src/learning/pattern-analyzer.ts
export class PatternAnalyzer {
  // 모든 VCR 분석하여 패턴 추출
  analyzeVCRs(vcrs: VCR[]): VCRPattern[];

  // FAIL 판정 분석
  analyzeFailures(runs: RunState[]): FailurePattern[];

  // 패턴 기반 자동 응답 제안
  suggestVCR(crp: CRP): VCR | null;
}
```

---

### 3.2 멀티 에이전트 병렬 실행

**목표:** 독립적인 작업을 병렬로 처리하여 속도 향상

**시나리오:**

1. **Builder 병렬화**
   - 여러 파일을 동시에 생성
   - 각 Builder가 독립적인 파일 담당

2. **Builder + Verifier 파이프라인**
   - Builder가 파일 생성할 때마다 Verifier가 즉시 테스트
   - 점진적 검증

3. **여러 Verifier 병렬**
   - 유닛 테스트, 통합 테스트, 보안 테스트 동시 실행

**구현:**

```typescript
interface ParallelConfig {
  builder: {
    parallel: boolean;
    maxInstances: number;
    splitBy: 'file' | 'feature';
  };

  verifier: {
    parallel: boolean;
    types: ('unit' | 'integration' | 'security')[];
  };

  pipeline: {
    // Builder 완료 대기 없이 Verifier 시작
    streamingVerification: boolean;
  };
}
```

**tmux 레이아웃 변경:**

```
┌────────────┬────────────┬────────────┬────────────┐
│  Refiner   │ Builder-1  │ Builder-2  │ Builder-3  │
├────────────┼────────────┼────────────┼────────────┤
│ Verifier-U │ Verifier-I │ Verifier-S │ Gatekeeper │
├────────────┴────────────┴────────────┴────────────┤
│                    Debug Shell                     │
└───────────────────────────────────────────────────┘
```

---

### 3.3 보안 강화

**목표:** 에이전트 실행의 안전성 보장

**기능:**

```typescript
interface SecurityFeatures {
  // 샌드박스 실행
  sandbox: {
    enabled: boolean;
    allowedPaths: string[];      // 쓰기 가능 경로
    blockedPaths: string[];      // 접근 차단 경로
    networkPolicy: 'none' | 'limited' | 'full';
  };

  // 코드 검증
  codeReview: {
    blockPatterns: RegExp[];     // 위험 패턴 차단
    requireApproval: string[];   // 특정 파일은 승인 필요
  };

  // 감사 로그
  auditLog: {
    allFileChanges: boolean;
    commandExecution: boolean;
    externalCalls: boolean;
  };
}
```

**위험 패턴 예시:**

```typescript
const dangerousPatterns = [
  /eval\s*\(/,                    // eval 사용
  /child_process/,               // 프로세스 실행
  /fs\.(unlink|rmdir|rm)/,      // 파일 삭제
  /process\.env\./,              // 환경변수 접근
  /https?:\/\//,                 // 외부 URL
];
```

---

## Phase 4: 확장 (P4, 장기)

### 4.1 CI/CD 통합

```yaml
# .github/workflows/orchestral.yml
name: Orchestral
on:
  issue_comment:
    types: [created]

jobs:
  orchestral:
    if: contains(github.event.comment.body, '/orchestral')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: orchestral/action@v1
        with:
          briefing: ${{ github.event.comment.body }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 4.2 MCP 서버

```typescript
// Claude Desktop에서 직접 사용
const orchestralMCP = {
  name: 'orchestral',
  version: '1.0.0',
  tools: [
    {
      name: 'start_run',
      description: 'Start new orchestral run',
      parameters: { briefing: 'string' }
    },
    {
      name: 'respond_crp',
      description: 'Respond to CRP',
      parameters: { crpId: 'string', decision: 'string' }
    },
    {
      name: 'get_status',
      description: 'Get current run status',
      parameters: {}
    }
  ]
};
```

### 4.3 플러그인 에이전트

```typescript
// 커스텀 에이전트 정의
interface AgentPlugin {
  name: string;
  role: string;
  model: AgentModel;

  // 실행 조건
  trigger: 'after_builder' | 'after_verifier' | 'on_demand';

  // 프롬프트 템플릿
  promptTemplate: string;

  // 출력
  outputs: string[];
}

// 예: SecurityAuditor
const securityAuditor: AgentPlugin = {
  name: 'security-auditor',
  role: 'Security vulnerability analysis',
  model: 'sonnet',
  trigger: 'after_builder',
  promptTemplate: 'templates/security-auditor.md',
  outputs: ['security/report.json', 'security/log.md']
};
```

---

## 구현 일정 (예상)

```
Phase 0 (P0): 1-2주
├── 에이전트 헬스체크 & 타임아웃
└── 실시간 출력 스트리밍

Phase 1 (P1): 2-3주
├── Git 통합
├── 프로젝트 컨텍스트 자동 감지
└── Diff 뷰어

Phase 2 (P2): 2-3주
├── 메트릭 & 비용 추적
└── VS Code Extension

Phase 3 (P3): 장기
├── 학습 시스템
├── 멀티 에이전트 병렬
└── 보안 강화
```

---

## 다음 단계

1. **Phase 0 시작** - 안정성 확보가 최우선
2. **피드백 수집** - MVP 사용자들의 의견 반영
3. **Phase 1 병행** - Git 통합은 실용성 측면에서 중요

---

## 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2025-01-25 | 0.1 | 초안 작성 |
