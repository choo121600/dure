import type {
  AgentModel,
  AgentName,
  ModelSelectionConfig,
  ModelSelectionStrategy,
  ComplexityFactors,
  ComplexityAnalysis,
  ModelSelectionResult,
} from '../types/index.js';

// Technical keyword categories
const TECHNICAL_KEYWORDS = {
  architecture: [
    'architecture', 'design pattern', 'microservice', 'monolith',
    'database', 'schema', 'api', 'rest', 'graphql', 'grpc',
    '아키텍처', '설계', '구조', '패턴',  // Korean: architecture, design, structure, pattern
  ],
  complexity: [
    'refactor', 'migration', 'integration', 'authentication', 'authorization',
    'caching', 'queue', 'async', 'concurrent', 'parallel',
    '리팩토링', '마이그레이션', '통합', '인증', '캐싱',  // Korean: refactoring, migration, integration, auth, caching
  ],
  risk: [
    'security', 'encryption', 'vulnerability', 'performance', 'optimization',
    'scalability', 'reliability', 'critical', 'production',
    '보안', '암호화', '취약점', '성능', '최적화', '확장성',  // Korean: security, encryption, vulnerability, performance, optimization, scalability
  ],
  scope: [
    'multiple files', 'across', 'entire', 'all', 'whole', 'system-wide',
    'full rewrite', 'complete', 'comprehensive',
    '여러 파일', '전체', '모든', '시스템', '완전히',  // Korean: multiple files, entire, all, system, completely
  ],
};

// Model costs (per 1M tokens, input/output)
const MODEL_COSTS = {
  haiku: { input: 0.25, output: 1.25 },
  sonnet: { input: 3.0, output: 15.0 },
  opus: { input: 15.0, output: 75.0 },
};

// Strategy-to-model mapping
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
  performance_first: {
    simple: { refiner: 'sonnet', builder: 'sonnet', verifier: 'sonnet', gatekeeper: 'sonnet' },
    medium: { refiner: 'sonnet', builder: 'sonnet', verifier: 'sonnet', gatekeeper: 'sonnet' },
    complex: { refiner: 'sonnet', builder: 'opus', verifier: 'sonnet', gatekeeper: 'opus' },
  },
};

// Default models (when dynamic selection is disabled)
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
   * Analyze briefing and select optimal models
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
   * Analyze briefing complexity
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
   * Calculate complexity factors
   */
  private calculateFactors(briefing: string): ComplexityFactors {
    const lowerBriefing = briefing.toLowerCase();

    // 1. Briefing length score (0-100)
    const lengthScore = this.calculateLengthScore(briefing);

    // 2. Technical keyword density score (0-100)
    const technicalScore = this.calculateKeywordScore(lowerBriefing, [
      ...TECHNICAL_KEYWORDS.architecture,
      ...TECHNICAL_KEYWORDS.complexity,
    ]);

    // 3. Scope estimate score (0-100)
    const scopeScore = this.calculateKeywordScore(lowerBriefing, TECHNICAL_KEYWORDS.scope);

    // 4. Risk level score (0-100)
    const riskScore = this.calculateKeywordScore(lowerBriefing, TECHNICAL_KEYWORDS.risk);

    return {
      briefing_length: lengthScore,
      technical_depth: technicalScore,
      scope_estimate: scopeScore,
      risk_level: riskScore,
    };
  }

  /**
   * Calculate length-based score
   */
  private calculateLengthScore(text: string): number {
    const charCount = text.length;
    const lineCount = text.split('\n').length;

    // Under 500 chars: simple, over 2000 chars: complex
    let score = 0;
    if (charCount < 500) {
      // Raised upper limit from 30 to 50 so short briefings can also get adequate scores
      score = (charCount / 500) * 50;
    } else if (charCount < 2000) {
      score = 50 + ((charCount - 500) / 1500) * 30;
    } else {
      score = 80 + Math.min(20, ((charCount - 2000) / 3000) * 20);
    }

    // Line count adjustment
    if (lineCount > 20) {
      score = Math.min(100, score + 10);
    }

    return Math.round(score);
  }

  /**
   * Calculate keyword-based score
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

    // Keyword density-based score (matched keywords / total keywords * 100)
    // Adjusted so that 20% matching can achieve an adequate score
    const matchRatio = uniqueMatches.size / keywords.length;
    const score = Math.min(100, matchRatio * 100);
    return Math.round(score);
  }

  /**
   * Calculate overall score (weighted average)
   */
  private calculateOverallScore(factors: ComplexityFactors): number {
    // Weight adjustment: higher weights for technical complexity and risk
    const weights = {
      briefing_length: 0.1,   // 20% → 10% (briefing length is a weak indicator of complexity)
      technical_depth: 0.4,   // 35% → 40% (technical complexity is most important)
      scope_estimate: 0.2,    // 25% → 20% (scope matters but may overlap with technical_depth)
      risk_level: 0.3,        // 20% → 30% (risk level has significant impact on model selection)
    };

    const score =
      factors.briefing_length * weights.briefing_length +
      factors.technical_depth * weights.technical_depth +
      factors.scope_estimate * weights.scope_estimate +
      factors.risk_level * weights.risk_level;

    return Math.round(score);
  }

  /**
   * Determine complexity level
   */
  private determineLevel(score: number): 'simple' | 'medium' | 'complex' {
    if (score < 30) return 'simple';
    if (score < 60) return 'medium';
    return 'complex';
  }

  /**
   * Generate analysis reasoning
   */
  private generateReasoning(factors: ComplexityFactors, level: 'simple' | 'medium' | 'complex'): string {
    const reasons: string[] = [];

    if (factors.briefing_length >= 70) {
      reasons.push('long briefing');
    } else if (factors.briefing_length < 30) {
      reasons.push('simple briefing');
    }

    if (factors.technical_depth >= 60) {
      reasons.push('high technical complexity');
    }

    if (factors.scope_estimate >= 50) {
      reasons.push('wide change scope');
    }

    if (factors.risk_level >= 50) {
      reasons.push('security/performance requirements present');
    }

    if (reasons.length === 0) {
      return `Determined as ${level} level task`;
    }

    return `${reasons.join(', ')} → ${level} level`;
  }

  /**
   * Calculate estimated cost savings
   */
  private estimateCostSavings(level: 'simple' | 'medium' | 'complex'): number {
    // Estimate savings compared to default settings (sonnet-focused)
    const defaultCost = this.estimateRunCost(DEFAULT_MODELS);
    const selectedModels = STRATEGY_MODEL_MAP[this.config.strategy][level];
    const selectedCost = this.estimateRunCost(selectedModels);

    if (defaultCost === 0) return 0;
    return Math.round(((defaultCost - selectedCost) / defaultCost) * 100);
  }

  /**
   * Calculate estimated run cost (for relative comparison)
   */
  private estimateRunCost(models: Record<AgentName, AgentModel>): number {
    // Estimated token usage per agent (approximate)
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
   * Create default analysis (when dynamic selection is disabled)
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
      reasoning: 'Dynamic model selection disabled - using default settings',
      estimated_cost_savings: 0,
    };
  }

  /**
   * Update config
   */
  updateConfig(config: Partial<ModelSelectionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Return current config
   */
  getConfig(): ModelSelectionConfig {
    return { ...this.config };
  }
}
