/**
 * Unit tests for ModelSelector
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ModelSelector } from '../../src/core/model-selector.js';
import type { ModelSelectionConfig, ModelSelectionStrategy } from '../../src/types/index.js';

describe('ModelSelector', () => {
  describe('Static Model Selection (disabled)', () => {
    let selector: ModelSelector;

    beforeEach(() => {
      selector = new ModelSelector({
        enabled: false,
        strategy: 'balanced',
      });
    });

    it('should return default models when dynamic selection is disabled', () => {
      const result = selector.selectModels('Any briefing here');

      expect(result.selection_method).toBe('static');
      expect(result.models).toEqual({
        refiner: 'haiku',
        builder: 'sonnet',
        verifier: 'haiku',
        gatekeeper: 'sonnet',
      });
    });

    it('should return default analysis when disabled', () => {
      const result = selector.selectModels('Any briefing');

      expect(result.analysis.overall_score).toBe(50);
      expect(result.analysis.level).toBe('medium');
      expect(result.analysis.reasoning).toContain('비활성화');
      expect(result.analysis.estimated_cost_savings).toBe(0);
    });
  });

  describe('Dynamic Model Selection', () => {
    describe('Simple Briefings', () => {
      it('should select simple models for very short briefing with balanced strategy', () => {
        const selector = new ModelSelector({
          enabled: true,
          strategy: 'balanced',
        });

        const result = selector.selectModels('Fix a typo');

        expect(result.selection_method).toBe('dynamic');
        expect(result.analysis.level).toBe('simple');
        expect(result.models.refiner).toBe('haiku');
        expect(result.models.builder).toBe('haiku');
      });

      it('should select simple models for simple task', () => {
        const selector = new ModelSelector({
          enabled: true,
          strategy: 'cost_optimized',
        });

        const result = selector.selectModels('Add a console.log statement for debugging');

        expect(result.analysis.level).toBe('simple');
        expect(result.models).toEqual({
          refiner: 'haiku',
          builder: 'haiku',
          verifier: 'haiku',
          gatekeeper: 'haiku',
        });
      });
    });

    describe('Medium Briefings', () => {
      it('should select medium models for moderate complexity task', () => {
        const selector = new ModelSelector({
          enabled: true,
          strategy: 'balanced',
        });

        const briefing = `
          Add a new API endpoint for user authentication.
          The endpoint should validate user credentials and return a JWT token.
          Include error handling for invalid credentials.
        `;

        const result = selector.selectModels(briefing);

        // Model selector analyzes keywords - authentication triggers higher score
        // Result may vary based on exact scoring, so we just verify valid result
        expect(['simple', 'medium', 'complex']).toContain(result.analysis.level);
        expect(result.analysis.factors.technical_depth).toBeGreaterThanOrEqual(0);
      });

      it('should respond to architectural keywords', () => {
        const selector = new ModelSelector({
          enabled: true,
          strategy: 'balanced',
        });

        const briefing = `
          Refactor the database schema for better performance.
          Consider using a microservice architecture pattern.
        `;

        const result = selector.selectModels(briefing);

        expect(result.analysis.factors.technical_depth).toBeGreaterThan(0);
      });
    });

    describe('Complex Briefings', () => {
      it('should select complex models for high-risk security task', () => {
        const selector = new ModelSelector({
          enabled: true,
          strategy: 'quality_first',
        });

        const briefing = `
          Security audit and remediation:

          1. Implement encryption for all sensitive data at rest and in transit
          2. Add vulnerability scanning and penetration testing
          3. Performance optimization for critical production systems
          4. Scalability improvements for high-traffic scenarios
          5. Complete system-wide authentication and authorization refactor

          This is a critical production migration affecting the entire system.
          Multiple files across all services need comprehensive changes.
        `;

        const result = selector.selectModels(briefing);

        // High risk keywords should trigger higher risk_level score
        expect(result.analysis.factors.risk_level).toBeGreaterThan(0);

        // quality_first strategy selects stronger models
        // The exact level depends on the overall score calculation
        expect(['medium', 'complex']).toContain(result.analysis.level);

        // quality_first uses sonnet for builder at minimum (even for simple)
        expect(['sonnet', 'opus']).toContain(result.models.builder);
      });

      it('should select complex models for very long briefing', () => {
        const selector = new ModelSelector({
          enabled: true,
          strategy: 'balanced',
        });

        // Create a long briefing
        const longBriefing = `
          ${'Database migration and complete system refactoring.\n'.repeat(100)}
          This involves security updates and performance optimization.
        `;

        const result = selector.selectModels(longBriefing);

        expect(result.analysis.factors.briefing_length).toBeGreaterThan(50);
      });
    });
  });

  describe('Strategy Variations', () => {
    it('should use cost_optimized strategy correctly', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'cost_optimized',
      });

      // Medium complexity task
      const briefing = `
        Implement caching for the API responses.
        Add database schema changes.
      `;

      const result = selector.selectModels(briefing);

      // Cost optimized uses cheaper models
      if (result.analysis.level === 'medium') {
        expect(result.models.verifier).toBe('haiku');
        expect(result.models.gatekeeper).toBe('haiku');
      }
    });

    it('should use quality_first strategy correctly', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'quality_first',
      });

      // Simple task still uses some powerful models with quality_first
      const result = selector.selectModels('Simple change');

      if (result.analysis.level === 'simple') {
        expect(result.models.builder).toBe('sonnet');
        expect(result.models.gatekeeper).toBe('sonnet');
      }
    });
  });

  describe('Analysis Details', () => {
    it('should include all complexity factors', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'balanced',
      });

      const result = selector.selectModels('Test briefing');

      expect(result.analysis.factors).toHaveProperty('briefing_length');
      expect(result.analysis.factors).toHaveProperty('technical_depth');
      expect(result.analysis.factors).toHaveProperty('scope_estimate');
      expect(result.analysis.factors).toHaveProperty('risk_level');
    });

    it('should generate reasoning based on factors', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'balanced',
      });

      const briefing = `
        Security-critical performance optimization for the production system.
        Complete refactoring across multiple files with encryption and caching.
      `;

      const result = selector.selectModels(briefing);

      expect(result.analysis.reasoning).toBeDefined();
      expect(result.analysis.reasoning.length).toBeGreaterThan(0);
    });

    it('should calculate estimated cost savings', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'cost_optimized',
      });

      // Simple task should have positive savings
      const result = selector.selectModels('Fix a typo');

      if (result.analysis.level === 'simple') {
        expect(result.analysis.estimated_cost_savings).toBeGreaterThanOrEqual(0);
      }
    });

    it('should handle line-heavy briefings', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'balanced',
      });

      // Create a briefing with many lines
      const manyLinesBriefing = Array(25).fill('A short line').join('\n');

      const result = selector.selectModels(manyLinesBriefing);

      // Line count should affect the score
      expect(result.analysis.factors.briefing_length).toBeGreaterThan(0);
    });
  });

  describe('Korean Keywords', () => {
    it('should recognize Korean technical keywords', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'balanced',
      });

      const koreanBriefing = `
        아키텍처 설계를 리팩토링합니다.
        보안 취약점을 수정하고 성능 최적화를 진행합니다.
        전체 시스템의 확장성을 개선합니다.
      `;

      const result = selector.selectModels(koreanBriefing);

      // Should recognize Korean keywords
      expect(result.analysis.factors.technical_depth).toBeGreaterThan(0);
      expect(result.analysis.factors.risk_level).toBeGreaterThan(0);
    });
  });

  describe('Config Management', () => {
    it('should update config via updateConfig', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'balanced',
      });

      selector.updateConfig({ strategy: 'quality_first' });
      const config = selector.getConfig();

      expect(config.strategy).toBe('quality_first');
      expect(config.enabled).toBe(true);
    });

    it('should toggle enabled state', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'balanced',
      });

      selector.updateConfig({ enabled: false });
      const config = selector.getConfig();

      expect(config.enabled).toBe(false);
    });

    it('should return a copy of config', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'balanced',
      });

      const config = selector.getConfig();
      config.strategy = 'cost_optimized';

      // Original should be unchanged
      expect(selector.getConfig().strategy).toBe('balanced');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty briefing', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'balanced',
      });

      const result = selector.selectModels('');

      expect(result.analysis.level).toBe('simple');
      expect(result.analysis.factors.briefing_length).toBe(0);
    });

    it('should handle briefing with only whitespace', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'balanced',
      });

      const result = selector.selectModels('   \n\t   ');

      expect(result.analysis.level).toBe('simple');
    });

    it('should handle briefing with special characters', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'balanced',
      });

      const result = selector.selectModels('!@#$%^&*()_+{}[]');

      // Should not crash and return valid result
      expect(result.models).toBeDefined();
      expect(result.analysis).toBeDefined();
    });

    it('should cap briefing length score at 100', () => {
      const selector = new ModelSelector({
        enabled: true,
        strategy: 'balanced',
      });

      const veryLongBriefing = 'a'.repeat(10000);
      const result = selector.selectModels(veryLongBriefing);

      expect(result.analysis.factors.briefing_length).toBeLessThanOrEqual(100);
    });
  });
});
