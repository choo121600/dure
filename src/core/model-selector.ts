import type {
  AgentModel,
  AgentName,
  ModelSelectionConfig,
  ModelSelectionStrategy,
  ComplexityFactors,
  ComplexityAnalysis,
  ModelSelectionResult,
} from '../types/index.js';

// 기술 키워드 카테고리
const TECHNICAL_KEYWORDS = {
  architecture: [
    'architecture', 'design pattern', 'microservice', 'monolith',
    'database', 'schema', 'api', 'rest', 'graphql', 'grpc',
    '아키텍처', '설계', '구조', '패턴',
  ],
  complexity: [
    'refactor', 'migration', 'integration', 'authentication', 'authorization',
    'caching', 'queue', 'async', 'concurrent', 'parallel',
    '리팩토링', '마이그레이션', '통합', '인증', '캐싱',
  ],
  risk: [
    'security', 'encryption', 'vulnerability', 'performance', 'optimization',
    'scalability', 'reliability', 'critical', 'production',
    '보안', '암호화', '취약점', '성능', '최적화', '확장성',
  ],
  scope: [
    'multiple files', 'across', 'entire', 'all', 'whole', 'system-wide',
    'full rewrite', 'complete', 'comprehensive',
    '여러 파일', '전체', '모든', '시스템', '완전히',
  ],
};

// 모델별 비용 (per 1M tokens, input/output)
const MODEL_COSTS = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3.0, output: 15.0 },
  opus: { input: 15.0, output: 75.0 },
};

// 전략별 모델 매핑
const STRATEGY_MODEL_MAP: Record<ModelSelectionStrategy, Record<'simple' | 'medium' | 'complex', Record<AgentName, AgentModel>>> = {
  cost_optimized: {
    simple: { refiner: 'haiku', builder: 'haiku', verifier: 'haiku', gatekeeper: 'haiku' },
    medium: { refiner: 'haiku', builder: 'sonnet', verifier: 'haiku', gatekeeper: 'haiku' },
    complex: { refiner: 'haiku', builder: 'sonnet', verifier: 'haiku', gatekeeper: 'sonnet' },
  },
  balanced: {
    simple: { refiner: 'haiku', builder: 'haiku', verifier: 'haiku', gatekeeper: 'haiku' },
    medium: { refiner: 'haiku', builder: 'sonnet', verifier: 'haiku', gatekeeper: 'sonnet' },
    complex: { refiner: 'sonnet', builder: 'sonnet', verifier: 'sonnet', gatekeeper: 'sonnet' },
  },
  quality_first: {
    simple: { refiner: 'haiku', builder: 'sonnet', verifier: 'haiku', gatekeeper: 'sonnet' },
    medium: { refiner: 'sonnet', builder: 'sonnet', verifier: 'sonnet', gatekeeper: 'sonnet' },
    complex: { refiner: 'sonnet', builder: 'opus', verifier: 'sonnet', gatekeeper: 'opus' },
  },
};

// 기본 모델 (동적 선택 비활성화 시)
const DEFAULT_MODELS: Record<AgentName, AgentModel> = {
  refiner: 'haiku',
  builder: 'sonnet',
  verifier: 'haiku',
  gatekeeper: 'sonnet',
};

export class ModelSelector {
  private config: ModelSelectionConfig;

  constructor(config: ModelSelectionConfig) {
    this.config = config;
  }

  /**
   * Briefing을 분석하고 최적의 모델을 선택
   */
  selectModels(briefing: string): ModelSelectionResult {
    if (!this.config.enabled) {
      return {
        models: { ...DEFAULT_MODELS },
        analysis: this.createDefaultAnalysis(),
        selection_method: 'static',
      };
    }

    const analysis = this.analyzeBriefing(briefing);
    const models = STRATEGY_MODEL_MAP[this.config.strategy][analysis.level];

    return {
      models: { ...models },
      analysis,
      selection_method: 'dynamic',
    };
  }

  /**
   * Briefing 복잡도 분석
   */
  private analyzeBriefing(briefing: string): ComplexityAnalysis {
    const factors = this.calculateFactors(briefing);
    const overallScore = this.calculateOverallScore(factors);
    const level = this.determineLevel(overallScore);
    const recommendedModels = STRATEGY_MODEL_MAP[this.config.strategy][level];

    const reasoning = this.generateReasoning(factors, level);
    const estimatedSavings = this.estimateCostSavings(level);

    return {
      overall_score: overallScore,
      level,
      factors,
      recommended_models: { ...recommendedModels },
      reasoning,
      estimated_cost_savings: estimatedSavings,
    };
  }

  /**
   * 복잡도 요소 계산
   */
  private calculateFactors(briefing: string): ComplexityFactors {
    const lowerBriefing = briefing.toLowerCase();

    // 1. Briefing 길이 점수 (0-100)
    const lengthScore = this.calculateLengthScore(briefing);

    // 2. 기술 키워드 밀도 점수 (0-100)
    const technicalScore = this.calculateKeywordScore(lowerBriefing, [
      ...TECHNICAL_KEYWORDS.architecture,
      ...TECHNICAL_KEYWORDS.complexity,
    ]);

    // 3. 범위 추정 점수 (0-100)
    const scopeScore = this.calculateKeywordScore(lowerBriefing, TECHNICAL_KEYWORDS.scope);

    // 4. 리스크 레벨 점수 (0-100)
    const riskScore = this.calculateKeywordScore(lowerBriefing, TECHNICAL_KEYWORDS.risk);

    return {
      briefing_length: lengthScore,
      technical_depth: technicalScore,
      scope_estimate: scopeScore,
      risk_level: riskScore,
    };
  }

  /**
   * 길이 기반 점수 계산
   */
  private calculateLengthScore(text: string): number {
    const charCount = text.length;
    const lineCount = text.split('\n').length;

    // 500자 이하: 단순, 2000자 이상: 복잡
    let score = 0;
    if (charCount < 500) {
      // 상한을 30 → 50으로 상향하여 짧은 briefing도 적절한 점수 획득 가능
      score = (charCount / 500) * 50;
    } else if (charCount < 2000) {
      score = 50 + ((charCount - 500) / 1500) * 30;
    } else {
      score = 80 + Math.min(20, ((charCount - 2000) / 3000) * 20);
    }

    // 라인 수 보정
    if (lineCount > 20) {
      score = Math.min(100, score + 10);
    }

    return Math.round(score);
  }

  /**
   * 키워드 기반 점수 계산
   */
  private calculateKeywordScore(text: string, keywords: string[]): number {
    let matchCount = 0;
    const uniqueMatches = new Set<string>();

    for (const keyword of keywords) {
      if (text.includes(keyword.toLowerCase())) {
        matchCount++;
        uniqueMatches.add(keyword);
      }
    }

    // 키워드 밀도 기반 점수 (매칭된 키워드 / 전체 키워드 * 100)
    // 최소 20% 매칭 시 적절한 점수 획득 가능하도록 조정
    const matchRatio = uniqueMatches.size / keywords.length;
    const score = Math.min(100, matchRatio * 100);
    return Math.round(score);
  }

  /**
   * 전체 점수 계산 (가중 평균)
   */
  private calculateOverallScore(factors: ComplexityFactors): number {
    // 가중치 재조정: 기술적 복잡도와 위험도에 더 높은 가중치 부여
    const weights = {
      briefing_length: 0.1,   // 20% → 10% (briefing 길이는 복잡도의 약한 지표)
      technical_depth: 0.4,   // 35% → 40% (기술적 복잡도가 가장 중요)
      scope_estimate: 0.2,    // 25% → 20% (범위도 중요하지만 technical_depth와 중복 가능)
      risk_level: 0.3,        // 20% → 30% (위험도는 모델 선택에 큰 영향)
    };

    const score =
      factors.briefing_length * weights.briefing_length +
      factors.technical_depth * weights.technical_depth +
      factors.scope_estimate * weights.scope_estimate +
      factors.risk_level * weights.risk_level;

    return Math.round(score);
  }

  /**
   * 복잡도 레벨 결정
   */
  private determineLevel(score: number): 'simple' | 'medium' | 'complex' {
    if (score < 30) return 'simple';
    if (score < 60) return 'medium';
    return 'complex';
  }

  /**
   * 분석 근거 생성
   */
  private generateReasoning(factors: ComplexityFactors, level: 'simple' | 'medium' | 'complex'): string {
    const reasons: string[] = [];

    if (factors.briefing_length >= 70) {
      reasons.push('긴 briefing');
    } else if (factors.briefing_length < 30) {
      reasons.push('간단한 briefing');
    }

    if (factors.technical_depth >= 60) {
      reasons.push('높은 기술적 복잡도');
    }

    if (factors.scope_estimate >= 50) {
      reasons.push('넓은 변경 범위');
    }

    if (factors.risk_level >= 50) {
      reasons.push('보안/성능 요구사항 존재');
    }

    if (reasons.length === 0) {
      return `${level} 수준의 작업으로 판단됨`;
    }

    return `${reasons.join(', ')} → ${level} 수준`;
  }

  /**
   * 예상 비용 절감률 계산
   */
  private estimateCostSavings(level: 'simple' | 'medium' | 'complex'): number {
    // 기본 설정 (sonnet 위주) 대비 절감률 추정
    const defaultCost = this.estimateRunCost(DEFAULT_MODELS);
    const selectedModels = STRATEGY_MODEL_MAP[this.config.strategy][level];
    const selectedCost = this.estimateRunCost(selectedModels);

    if (defaultCost === 0) return 0;
    return Math.round(((defaultCost - selectedCost) / defaultCost) * 100);
  }

  /**
   * 예상 실행 비용 계산 (상대적 비교용)
   */
  private estimateRunCost(models: Record<AgentName, AgentModel>): number {
    // 에이전트별 예상 토큰 사용량 (대략적)
    const estimatedTokens: Record<AgentName, { input: number; output: number }> = {
      refiner: { input: 3000, output: 1000 },
      builder: { input: 15000, output: 5000 },
      verifier: { input: 8000, output: 3000 },
      gatekeeper: { input: 10000, output: 2000 },
    };

    let totalCost = 0;
    for (const agent of Object.keys(models) as AgentName[]) {
      const model = models[agent];
      const tokens = estimatedTokens[agent];
      const costs = MODEL_COSTS[model];
      totalCost += (tokens.input / 1000000) * costs.input + (tokens.output / 1000000) * costs.output;
    }

    return totalCost;
  }

  /**
   * 기본 분석 결과 생성 (동적 선택 비활성화 시)
   */
  private createDefaultAnalysis(): ComplexityAnalysis {
    return {
      overall_score: 50,
      level: 'medium',
      factors: {
        briefing_length: 50,
        technical_depth: 50,
        scope_estimate: 50,
        risk_level: 50,
      },
      recommended_models: { ...DEFAULT_MODELS },
      reasoning: '동적 모델 선택 비활성화 - 기본 설정 사용',
      estimated_cost_savings: 0,
    };
  }

  /**
   * 설정 업데이트
   */
  updateConfig(config: Partial<ModelSelectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 현재 설정 반환
   */
  getConfig(): ModelSelectionConfig {
    return { ...this.config };
  }
}
