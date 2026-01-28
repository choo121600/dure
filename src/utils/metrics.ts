/**
 * Metrics collection utilities for Orchestral
 * Provides interfaces and implementations for collecting operational metrics
 */

// ============================================================================
// Metric Names Constants
// ============================================================================

export const MetricNames = {
  // Run metrics
  RUN_TOTAL: 'orchestral_runs_total',
  RUN_DURATION: 'orchestral_run_duration_seconds',
  RUN_ITERATIONS: 'orchestral_run_iterations_total',

  // Agent metrics
  AGENT_DURATION: 'orchestral_agent_duration_seconds',
  AGENT_ERRORS: 'orchestral_agent_errors_total',
  AGENT_RETRIES: 'orchestral_agent_retries_total',

  // Token and cost metrics
  TOKEN_USAGE: 'orchestral_token_usage_total',
  COST_USD: 'orchestral_cost_usd_total',

  // CRP/VCR metrics
  CRP_CREATED: 'orchestral_crp_created_total',
  VCR_RECEIVED: 'orchestral_vcr_received_total',
  HUMAN_WAIT_DURATION: 'orchestral_human_wait_duration_seconds',

  // System metrics
  ACTIVE_RUNS: 'orchestral_active_runs',
} as const;

export type MetricName = (typeof MetricNames)[keyof typeof MetricNames];

// ============================================================================
// Types
// ============================================================================

/**
 * Labels for metric dimensions
 */
export type Labels = Record<string, string>;

/**
 * Timer stop function
 */
export type TimerStop = () => number;

/**
 * Histogram data
 */
export interface HistogramData {
  count: number;
  sum: number;
  values: number[];
}

// ============================================================================
// Metrics Interface
// ============================================================================

/**
 * Metrics collection interface
 * Provides methods for recording various types of metrics
 */
export interface Metrics {
  /**
   * Increment a counter by a value (default 1)
   */
  incrementCounter(name: string, labels?: Labels, value?: number): void;

  /**
   * Set a gauge to a specific value
   */
  setGauge(name: string, value: number, labels?: Labels): void;

  /**
   * Record a value in a histogram
   */
  observeHistogram(name: string, value: number, labels?: Labels): void;

  /**
   * Start a timer and return a function to stop it
   * Returns elapsed time in seconds when stopped
   */
  startTimer(name: string, labels?: Labels): TimerStop;

  /**
   * Reset all metrics
   */
  reset(): void;
}

// ============================================================================
// No-Op Metrics Implementation
// ============================================================================

/**
 * No-op metrics implementation that discards all metrics
 * Useful when metrics collection is disabled
 */
export class NoOpMetrics implements Metrics {
  incrementCounter(_name: string, _labels?: Labels, _value?: number): void {
    // No-op
  }

  setGauge(_name: string, _value: number, _labels?: Labels): void {
    // No-op
  }

  observeHistogram(_name: string, _value: number, _labels?: Labels): void {
    // No-op
  }

  startTimer(_name: string, _labels?: Labels): TimerStop {
    return () => 0;
  }

  reset(): void {
    // No-op
  }
}

// ============================================================================
// In-Memory Metrics Implementation
// ============================================================================

/**
 * In-memory metrics implementation for testing and development
 * Stores all metrics in memory for inspection
 */
export class InMemoryMetrics implements Metrics {
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private histograms: Map<string, HistogramData> = new Map();

  /**
   * Create a key from name and labels
   */
  private createKey(name: string, labels?: Labels): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  incrementCounter(name: string, labels?: Labels, value: number = 1): void {
    const key = this.createKey(name, labels);
    const current = this.counters.get(key) ?? 0;
    this.counters.set(key, current + value);
  }

  setGauge(name: string, value: number, labels?: Labels): void {
    const key = this.createKey(name, labels);
    this.gauges.set(key, value);
  }

  observeHistogram(name: string, value: number, labels?: Labels): void {
    const key = this.createKey(name, labels);
    const current = this.histograms.get(key) ?? { count: 0, sum: 0, values: [] };
    current.count += 1;
    current.sum += value;
    current.values.push(value);
    this.histograms.set(key, current);
  }

  startTimer(name: string, labels?: Labels): TimerStop {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      const elapsed = Number(end - start) / 1e9; // Convert nanoseconds to seconds
      this.observeHistogram(name, elapsed, labels);
      return elapsed;
    };
  }

  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  // ============ Query Methods ============

  /**
   * Get a counter value
   */
  getCounter(name: string, labels?: Labels): number {
    const key = this.createKey(name, labels);
    return this.counters.get(key) ?? 0;
  }

  /**
   * Get a gauge value
   */
  getGauge(name: string, labels?: Labels): number {
    const key = this.createKey(name, labels);
    return this.gauges.get(key) ?? 0;
  }

  /**
   * Get histogram data
   */
  getHistogram(name: string, labels?: Labels): HistogramData | undefined {
    const key = this.createKey(name, labels);
    return this.histograms.get(key);
  }

  /**
   * Get histogram values as array
   */
  getHistogramValues(name: string, labels?: Labels): number[] {
    const data = this.getHistogram(name, labels);
    return data?.values ?? [];
  }

  /**
   * Get all counter names and values
   */
  getAllCounters(): Map<string, number> {
    return new Map(this.counters);
  }

  /**
   * Get all gauge names and values
   */
  getAllGauges(): Map<string, number> {
    return new Map(this.gauges);
  }

  /**
   * Get all histogram names and data
   */
  getAllHistograms(): Map<string, HistogramData> {
    return new Map(this.histograms);
  }

  /**
   * Get a summary of all metrics for debugging
   */
  getSummary(): {
    counters: Record<string, number>;
    gauges: Record<string, number>;
    histograms: Record<string, { count: number; sum: number; avg: number }>;
  } {
    const counters: Record<string, number> = {};
    const gauges: Record<string, number> = {};
    const histograms: Record<string, { count: number; sum: number; avg: number }> = {};

    for (const [key, value] of this.counters) {
      counters[key] = value;
    }

    for (const [key, value] of this.gauges) {
      gauges[key] = value;
    }

    for (const [key, data] of this.histograms) {
      histograms[key] = {
        count: data.count,
        sum: data.sum,
        avg: data.count > 0 ? data.sum / data.count : 0,
      };
    }

    return { counters, gauges, histograms };
  }
}

// ============================================================================
// Aggregating Metrics Implementation
// ============================================================================

/**
 * Metrics implementation that aggregates to multiple backends
 */
export class AggregatingMetrics implements Metrics {
  private readonly backends: Metrics[];

  constructor(backends: Metrics[]) {
    this.backends = backends;
  }

  incrementCounter(name: string, labels?: Labels, value?: number): void {
    for (const backend of this.backends) {
      backend.incrementCounter(name, labels, value);
    }
  }

  setGauge(name: string, value: number, labels?: Labels): void {
    for (const backend of this.backends) {
      backend.setGauge(name, value, labels);
    }
  }

  observeHistogram(name: string, value: number, labels?: Labels): void {
    for (const backend of this.backends) {
      backend.observeHistogram(name, value, labels);
    }
  }

  startTimer(name: string, labels?: Labels): TimerStop {
    const timers = this.backends.map(b => b.startTimer(name, labels));
    return () => {
      let lastElapsed = 0;
      for (const timer of timers) {
        lastElapsed = timer();
      }
      return lastElapsed;
    };
  }

  reset(): void {
    for (const backend of this.backends) {
      backend.reset();
    }
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a no-op metrics instance
 */
export function createNoOpMetrics(): Metrics {
  return new NoOpMetrics();
}

/**
 * Create an in-memory metrics instance
 */
export function createInMemoryMetrics(): InMemoryMetrics {
  return new InMemoryMetrics();
}

/**
 * Create an aggregating metrics instance
 */
export function createAggregatingMetrics(backends: Metrics[]): Metrics {
  return new AggregatingMetrics(backends);
}

// ============================================================================
// Default Metrics Instance
// ============================================================================

/**
 * Default metrics instance (no-op by default)
 */
let defaultMetrics: Metrics = new NoOpMetrics();

/**
 * Get the default metrics instance
 */
export function getDefaultMetrics(): Metrics {
  return defaultMetrics;
}

/**
 * Set the default metrics instance
 */
export function setDefaultMetrics(metrics: Metrics): void {
  defaultMetrics = metrics;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create standard labels for agent metrics
 */
export function createAgentLabels(agent: string, runId?: string): Labels {
  const labels: Labels = { agent };
  if (runId) {
    labels.run_id = runId;
  }
  return labels;
}

/**
 * Create standard labels for run metrics
 */
export function createRunLabels(runId: string, status?: string): Labels {
  const labels: Labels = { run_id: runId };
  if (status) {
    labels.status = status;
  }
  return labels;
}

/**
 * Create standard labels for token metrics
 */
export function createTokenLabels(agent: string, tokenType: 'input' | 'output' | 'cache_creation' | 'cache_read'): Labels {
  return { agent, type: tokenType };
}
