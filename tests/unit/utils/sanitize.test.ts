/**
 * Unit tests for sanitize utilities
 */
import { describe, it, expect } from 'vitest';
import { join } from 'path';
import {
  sanitizePath,
  sanitizeSessionName,
  escapeShellArg,
  isValidRunId,
  validateBriefing,
  isValidCrpId,
  isValidVcrId,
  validateDecision,
  sanitizeTextField,
  validatePort,
  isValidModel,
  isValidAgentName,
  MAX_BRIEFING_LENGTH,
  MAX_SESSION_NAME_LENGTH,
  MAX_PATH_LENGTH,
} from '../../../src/utils/sanitize.js';

describe('sanitizePath', () => {
  describe('basic functionality', () => {
    it('should normalize a simple path', () => {
      const result = sanitizePath('/tmp/test');
      expect(result).toBe('/tmp/test');
    });

    it('should normalize path with redundant separators', () => {
      const result = sanitizePath('/tmp//test///file');
      expect(result).toBe('/tmp/test/file');
    });

    it('should resolve relative paths', () => {
      const result = sanitizePath('./test');
      expect(result).toContain('test');
      expect(result).not.toContain('./');
    });
  });

  describe('path traversal prevention', () => {
    it('should reject paths with null bytes', () => {
      expect(() => sanitizePath('/tmp/test\0file')).toThrow('null bytes');
    });

    it('should prevent traversal outside baseDir', () => {
      expect(() => sanitizePath('../outside', '/tmp/safe')).toThrow('path traversal');
    });

    it('should allow paths within baseDir', () => {
      const result = sanitizePath('subdir/file.txt', '/tmp/safe');
      expect(result).toBe('/tmp/safe/subdir/file.txt');
    });

    it('should normalize .. within allowed directory', () => {
      const result = sanitizePath('subdir/../file.txt', '/tmp/safe');
      expect(result).toBe('/tmp/safe/file.txt');
    });

    it('should reject paths exceeding max length', () => {
      const longPath = '/tmp/' + 'a'.repeat(MAX_PATH_LENGTH);
      expect(() => sanitizePath(longPath)).toThrow('maximum length');
    });
  });

  describe('edge cases', () => {
    it('should throw for empty string', () => {
      expect(() => sanitizePath('')).toThrow('non-empty string');
    });

    it('should throw for null/undefined', () => {
      expect(() => sanitizePath(null as unknown as string)).toThrow('non-empty string');
      expect(() => sanitizePath(undefined as unknown as string)).toThrow('non-empty string');
    });
  });
});

describe('sanitizeSessionName', () => {
  describe('valid names', () => {
    it('should accept alphanumeric names', () => {
      expect(sanitizeSessionName('orchestral123')).toBe('orchestral123');
    });

    it('should accept names with dashes', () => {
      expect(sanitizeSessionName('orchestral-run-123')).toBe('orchestral-run-123');
    });

    it('should accept names with underscores', () => {
      expect(sanitizeSessionName('orchestral_test')).toBe('orchestral_test');
    });

    it('should trim whitespace', () => {
      expect(sanitizeSessionName('  test-session  ')).toBe('test-session');
    });
  });

  describe('invalid names', () => {
    it('should reject names with spaces', () => {
      expect(() => sanitizeSessionName('test session')).toThrow('only alphanumeric');
    });

    it('should reject names with special characters', () => {
      expect(() => sanitizeSessionName('test;session')).toThrow('only alphanumeric');
      expect(() => sanitizeSessionName('test|session')).toThrow('only alphanumeric');
      expect(() => sanitizeSessionName('test$session')).toThrow('only alphanumeric');
    });

    it('should reject empty names', () => {
      expect(() => sanitizeSessionName('')).toThrow('non-empty string');
      expect(() => sanitizeSessionName('   ')).toThrow('cannot be empty');
    });

    it('should reject names exceeding max length', () => {
      const longName = 'a'.repeat(MAX_SESSION_NAME_LENGTH + 1);
      expect(() => sanitizeSessionName(longName)).toThrow('maximum length');
    });
  });
});

describe('escapeShellArg', () => {
  it('should escape single quotes', () => {
    const result = escapeShellArg("test'value");
    expect(result).toContain("\\'");
  });

  it('should escape shell metacharacters', () => {
    const result = escapeShellArg('test;cmd');
    expect(result).toBe("test\\;cmd");
  });

  it('should escape multiple metacharacters', () => {
    const result = escapeShellArg('test;cmd|another');
    expect(result).toBe("test\\;cmd\\|another");
  });

  it('should return empty string for null/undefined', () => {
    expect(escapeShellArg(null as unknown as string)).toBe('');
    expect(escapeShellArg(undefined as unknown as string)).toBe('');
  });
});

describe('isValidRunId', () => {
  describe('valid run IDs', () => {
    it('should accept properly formatted run ID', () => {
      expect(isValidRunId('run-20260126120000')).toBe(true);
    });

    it('should accept run ID with different timestamps', () => {
      expect(isValidRunId('run-20251231235959')).toBe(true);
      expect(isValidRunId('run-20260101000000')).toBe(true);
    });
  });

  describe('invalid run IDs', () => {
    it('should reject run ID without prefix', () => {
      expect(isValidRunId('20260126120000')).toBe(false);
    });

    it('should reject run ID with wrong prefix', () => {
      expect(isValidRunId('runs-20260126120000')).toBe(false);
    });

    it('should reject run ID with too few digits', () => {
      expect(isValidRunId('run-2026012612')).toBe(false);
    });

    it('should reject run ID with too many digits', () => {
      expect(isValidRunId('run-202601261200001')).toBe(false);
    });

    it('should reject run ID with non-numeric characters', () => {
      expect(isValidRunId('run-2026012612000a')).toBe(false);
    });

    it('should reject null/undefined', () => {
      expect(isValidRunId(null as unknown as string)).toBe(false);
      expect(isValidRunId(undefined as unknown as string)).toBe(false);
    });

    it('should reject path traversal attempts', () => {
      expect(isValidRunId('../run-20260126120000')).toBe(false);
      expect(isValidRunId('run-20260126120000/../other')).toBe(false);
    });
  });
});

describe('validateBriefing', () => {
  describe('valid briefings', () => {
    it('should accept a normal briefing', () => {
      const result = validateBriefing('Create a simple function');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept a long briefing within limits', () => {
      const result = validateBriefing('a'.repeat(MAX_BRIEFING_LENGTH));
      expect(result.isValid).toBe(true);
    });
  });

  describe('invalid briefings', () => {
    it('should reject null briefing', () => {
      const result = validateBriefing(null);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject empty briefing', () => {
      const result = validateBriefing('');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject non-string briefing', () => {
      const result = validateBriefing(123);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('string');
    });

    it('should reject briefing exceeding max length', () => {
      const result = validateBriefing('a'.repeat(MAX_BRIEFING_LENGTH + 1));
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('maximum length');
    });

    it('should reject briefing with null bytes', () => {
      const result = validateBriefing('test\0value');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('invalid characters');
    });
  });
});

describe('isValidCrpId', () => {
  it('should accept valid CRP ID formats', () => {
    expect(isValidCrpId('crp-001')).toBe(true);
    expect(isValidCrpId('crp-123')).toBe(true);
    expect(isValidCrpId('crp-20260126120000')).toBe(true);
    expect(isValidCrpId('crp-abc123')).toBe(true);
  });

  it('should reject invalid CRP IDs', () => {
    expect(isValidCrpId('001')).toBe(false);
    expect(isValidCrpId('vcr-001')).toBe(false);
    expect(isValidCrpId('')).toBe(false);
    expect(isValidCrpId(null as unknown as string)).toBe(false);
  });

  it('should reject CRP IDs exceeding max length', () => {
    expect(isValidCrpId('crp-' + 'a'.repeat(100))).toBe(false);
  });
});

describe('isValidVcrId', () => {
  it('should accept valid VCR ID formats', () => {
    expect(isValidVcrId('vcr-001')).toBe(true);
    expect(isValidVcrId('vcr-123')).toBe(true);
    expect(isValidVcrId('vcr-abc_123')).toBe(true);
  });

  it('should reject invalid VCR IDs', () => {
    expect(isValidVcrId('001')).toBe(false);
    expect(isValidVcrId('crp-001')).toBe(false);
    expect(isValidVcrId('')).toBe(false);
  });
});

describe('validateDecision', () => {
  it('should accept valid decisions', () => {
    const result = validateDecision('A');
    expect(result.isValid).toBe(true);
  });

  it('should validate against allowed options', () => {
    const result = validateDecision('A', ['A', 'B', 'C']);
    expect(result.isValid).toBe(true);

    const invalidResult = validateDecision('D', ['A', 'B', 'C']);
    expect(invalidResult.isValid).toBe(false);
    expect(invalidResult.error).toContain('Invalid decision');
  });

  it('should reject empty decisions', () => {
    const result = validateDecision('');
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('required');
  });

  it('should reject decisions exceeding max length', () => {
    const result = validateDecision('a'.repeat(1001));
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('maximum length');
  });
});

describe('sanitizeTextField', () => {
  it('should trim whitespace', () => {
    expect(sanitizeTextField('  test  ')).toBe('test');
  });

  it('should remove null bytes', () => {
    expect(sanitizeTextField('test\0value')).toBe('testvalue');
  });

  it('should truncate long strings', () => {
    const result = sanitizeTextField('a'.repeat(200), 100);
    expect(result.length).toBe(100);
  });

  it('should return empty string for invalid input', () => {
    expect(sanitizeTextField(null)).toBe('');
    expect(sanitizeTextField(undefined)).toBe('');
    expect(sanitizeTextField(123)).toBe('');
  });
});

describe('validatePort', () => {
  it('should accept valid ports', () => {
    expect(validatePort(3000)).toBe(3000);
    expect(validatePort(80)).toBe(80);
    expect(validatePort(65535)).toBe(65535);
  });

  it('should accept string ports', () => {
    expect(validatePort('3000')).toBe(3000);
  });

  it('should reject invalid ports', () => {
    expect(() => validatePort(0)).toThrow('between 1 and 65535');
    expect(() => validatePort(65536)).toThrow('between 1 and 65535');
    expect(() => validatePort(-1)).toThrow('between 1 and 65535');
  });

  it('should reject non-numeric ports', () => {
    expect(() => validatePort('abc')).toThrow('must be a number');
  });

  it('should reject non-integer ports', () => {
    expect(() => validatePort(3000.5)).toThrow('must be an integer');
  });
});

describe('isValidModel', () => {
  it('should accept valid models', () => {
    expect(isValidModel('haiku')).toBe(true);
    expect(isValidModel('sonnet')).toBe(true);
    expect(isValidModel('opus')).toBe(true);
  });

  it('should reject invalid models', () => {
    expect(isValidModel('gpt-4')).toBe(false);
    expect(isValidModel('')).toBe(false);
    expect(isValidModel(null as unknown as string)).toBe(false);
  });
});

describe('isValidAgentName', () => {
  it('should accept valid agent names', () => {
    expect(isValidAgentName('refiner')).toBe(true);
    expect(isValidAgentName('builder')).toBe(true);
    expect(isValidAgentName('verifier')).toBe(true);
    expect(isValidAgentName('gatekeeper')).toBe(true);
  });

  it('should reject invalid agent names', () => {
    expect(isValidAgentName('unknown')).toBe(false);
    expect(isValidAgentName('')).toBe(false);
    expect(isValidAgentName(null as unknown as string)).toBe(false);
  });
});
