/**
 * Security-focused tests for sanitize utilities
 * Tests for injection attacks, boundary conditions, and malicious inputs
 */
import { describe, it, expect } from 'vitest';
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

describe('Security Tests: Command Injection Prevention', () => {
  describe('sanitizeSessionName - shell injection attempts', () => {
    const injectionPayloads = [
      'test;rm -rf /',
      'test|cat /etc/passwd',
      'test`whoami`',
      'test$(whoami)',
      'test && ls',
      'test || true',
      'test\necho injected',
      'test\recho injected',
      'test > /tmp/file',
      'test < /etc/passwd',
      'test ; echo pwned',
      '$(cat /etc/passwd)',
      '`cat /etc/passwd`',
      'test#{system("ls")}',
      'test%0als',
      'test\x00ls',
    ];

    injectionPayloads.forEach((payload) => {
      it(`should reject injection payload: ${payload.slice(0, 30)}...`, () => {
        expect(() => sanitizeSessionName(payload)).toThrow();
      });
    });
  });

  describe('escapeShellArg - metacharacter escaping', () => {
    const metacharacters = [';', '|', '&', '`', '$', '(', ')', '{', '}', '[', ']', '<', '>', '!', '#', '*', '?', '~', '^', '\n', '\r'];

    metacharacters.forEach((char) => {
      it(`should escape metacharacter: ${JSON.stringify(char)}`, () => {
        const result = escapeShellArg(`test${char}value`);
        // Should either escape or not contain the raw character
        expect(result).not.toBe(`test${char}value`);
      });
    });

    it('should handle complex injection strings', () => {
      const result = escapeShellArg('$(cat /etc/passwd);rm -rf /');
      expect(result).not.toContain('$(');
      expect(result).toContain('\\$');
      expect(result).toContain('\\;');
    });
  });
});

describe('Security Tests: Path Traversal Prevention', () => {
  describe('sanitizePath - traversal attacks', () => {
    // These payloads should throw when they attempt to escape baseDir
    const traversalPayloads = [
      ['../../../etc/passwd', '/tmp/safe'],
      ['/tmp/safe/../../../etc/passwd', '/tmp/safe'],
      ['./././../../../etc/passwd', '/tmp/safe'],
    ];

    traversalPayloads.forEach(([payload, baseDir]) => {
      it(`should prevent traversal: ${payload}`, () => {
        expect(() => sanitizePath(payload, baseDir)).toThrow();
      });
    });

    // URL-encoded and Windows-style paths are handled differently
    // These are NOT decoded by sanitizePath, so they become literal filenames
    // This is acceptable because:
    // 1. URL decoding should happen at the HTTP layer before reaching sanitizePath
    // 2. Windows backslashes are treated as literal characters on Unix
    describe('URL-encoded payloads (treated as literal strings)', () => {
      it('should treat URL-encoded paths as literal strings (not decoded)', () => {
        // %2e%2e%2f is not decoded, so it's just a weird filename
        const result = sanitizePath('%2e%2e%2f%2e%2e%2f', '/tmp/safe');
        expect(result).toBe('/tmp/safe/%2e%2e%2f%2e%2e%2f');
      });

      it('should treat double-encoded paths as literal strings', () => {
        const result = sanitizePath('..%252f..%252f', '/tmp/safe');
        expect(result).toBe('/tmp/safe/..%252f..%252f');
      });
    });

    describe('Windows-style backslashes (Unix behavior)', () => {
      it('should treat backslashes as literal characters on Unix', () => {
        // On Unix, backslashes are not path separators
        const result = sanitizePath('..\\..\\..\\etc\\passwd', '/tmp/safe');
        // The result contains backslash as a literal character
        expect(result).toContain('\\');
      });
    });
  });

  describe('sanitizePath - null byte injection', () => {
    const nullBytePayloads = [
      '/tmp/file.txt\0.jpg',
      '/tmp/test\x00.txt',
      '\0/etc/passwd',
      '/tmp/\0',
      'file\u0000name',
    ];

    nullBytePayloads.forEach((payload) => {
      it(`should reject null byte: ${JSON.stringify(payload).slice(0, 30)}`, () => {
        expect(() => sanitizePath(payload)).toThrow('null bytes');
      });
    });
  });

  describe('sanitizePath - symlink-like patterns', () => {
    it('should normalize paths with multiple slashes', () => {
      const result = sanitizePath('/tmp///test////file');
      expect(result).toBe('/tmp/test/file');
    });

    it('should normalize paths with dots', () => {
      const result = sanitizePath('/tmp/./test/./file');
      expect(result).toBe('/tmp/test/file');
    });
  });
});

describe('Security Tests: Input Validation Bypass Attempts', () => {
  describe('isValidRunId - bypass attempts', () => {
    const bypassPayloads = [
      'run-20260126120000/../../../etc/passwd',
      'run-20260126120000\0',
      'run-20260126120000;ls',
      'run-20260126120000|cat',
      'run-2026012612000\n0',
      'run-20260126120000\rextra',
      ' run-20260126120000',
      'run-20260126120000 ',
      'run-20260126120000\t',
      'RUN-20260126120000', // case sensitivity
      'run-0000000000000a', // non-digit
      'run--20260126120000', // double dash
    ];

    bypassPayloads.forEach((payload) => {
      it(`should reject bypass attempt: ${JSON.stringify(payload).slice(0, 40)}`, () => {
        expect(isValidRunId(payload)).toBe(false);
      });
    });
  });

  describe('isValidCrpId/isValidVcrId - bypass attempts', () => {
    const bypassPayloads = [
      '../crp-001',
      'crp-001/../../../etc',
      'crp-001\0',
      'crp-001;ls',
      'crp-' + 'a'.repeat(100), // length overflow
    ];

    bypassPayloads.forEach((payload) => {
      it(`CRP should reject: ${payload.slice(0, 30)}`, () => {
        expect(isValidCrpId(payload)).toBe(false);
      });

      it(`VCR should reject: ${payload.replace('crp', 'vcr').slice(0, 30)}`, () => {
        expect(isValidVcrId(payload.replace('crp', 'vcr'))).toBe(false);
      });
    });
  });
});

describe('Security Tests: Denial of Service Prevention', () => {
  describe('length limits enforcement', () => {
    it('should reject overly long paths', () => {
      const longPath = '/tmp/' + 'a'.repeat(MAX_PATH_LENGTH + 1);
      expect(() => sanitizePath(longPath)).toThrow('maximum length');
    });

    it('should reject overly long session names', () => {
      const longName = 'a'.repeat(MAX_SESSION_NAME_LENGTH + 1);
      expect(() => sanitizeSessionName(longName)).toThrow('maximum length');
    });

    it('should reject overly long briefings', () => {
      const result = validateBriefing('a'.repeat(MAX_BRIEFING_LENGTH + 1));
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('maximum length');
    });

    it('should truncate overly long text fields', () => {
      const result = sanitizeTextField('a'.repeat(20000), 100);
      expect(result.length).toBe(100);
    });
  });

  describe('regex DoS prevention', () => {
    // These inputs could cause ReDoS if patterns are poorly written
    it('should handle repetitive patterns efficiently', () => {
      const start = Date.now();
      const result = sanitizeSessionName('a'.repeat(MAX_SESSION_NAME_LENGTH));
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100); // Should complete quickly
      expect(result).toBe('a'.repeat(MAX_SESSION_NAME_LENGTH));
    });

    it('should handle alternating patterns efficiently', () => {
      const start = Date.now();
      const pattern = 'ab'.repeat(MAX_SESSION_NAME_LENGTH / 2);
      const result = sanitizeSessionName(pattern.slice(0, MAX_SESSION_NAME_LENGTH));
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });
});

describe('Security Tests: Type Coercion Attacks', () => {
  describe('type confusion prevention', () => {
    const typeConfusionInputs = [
      { value: { toString: () => 'malicious' }, desc: 'object with toString' },
      { value: ['array', 'value'], desc: 'array' },
      { value: 123, desc: 'number' },
      { value: true, desc: 'boolean' },
      { value: Symbol('test'), desc: 'symbol' },
      { value: () => 'function', desc: 'function' },
    ];

    typeConfusionInputs.forEach(({ value, desc }) => {
      it(`sanitizePath should reject ${desc}`, () => {
        expect(() => sanitizePath(value as unknown as string)).toThrow();
      });

      it(`sanitizeSessionName should reject ${desc}`, () => {
        expect(() => sanitizeSessionName(value as unknown as string)).toThrow();
      });

      it(`isValidRunId should return false for ${desc}`, () => {
        expect(isValidRunId(value as unknown as string)).toBe(false);
      });

      it(`isValidModel should return false for ${desc}`, () => {
        expect(isValidModel(value as unknown as string)).toBe(false);
      });

      it(`isValidAgentName should return false for ${desc}`, () => {
        expect(isValidAgentName(value as unknown as string)).toBe(false);
      });
    });
  });

  describe('prototype pollution prevention', () => {
    it('validateBriefing should handle __proto__ safely', () => {
      const result = validateBriefing('__proto__');
      // Should be treated as valid string, not cause pollution
      expect(result.isValid).toBe(true);
    });

    it('validateBriefing should handle constructor safely', () => {
      const result = validateBriefing('constructor');
      expect(result.isValid).toBe(true);
    });

    it('validateDecision should handle prototype properties', () => {
      const result = validateDecision('__proto__', ['A', 'B', '__proto__']);
      expect(result.isValid).toBe(true);
    });
  });
});

describe('Security Tests: Encoding Attacks', () => {
  describe('Unicode normalization attacks', () => {
    it('should handle Unicode homoglyphs', () => {
      // Cyrillic 'а' looks like Latin 'a'
      const homoglyphInput = 'hаiku'; // Contains Cyrillic 'а'
      expect(isValidModel(homoglyphInput)).toBe(false);
    });

    it('should handle Unicode combining characters', () => {
      const combining = 'hai\u0301ku'; // 'haíku' with combining acute
      expect(isValidModel(combining)).toBe(false);
    });

    it('should handle zero-width characters', () => {
      const zeroWidth = 'ha\u200Biku'; // Contains zero-width space
      expect(isValidModel(zeroWidth)).toBe(false);
    });

    it('should handle right-to-left override', () => {
      const rtlOverride = '\u202Ehaiku'; // RTL override
      expect(isValidModel(rtlOverride)).toBe(false);
    });
  });

  describe('escaped character handling', () => {
    it('should handle escaped newlines in session names', () => {
      expect(() => sanitizeSessionName('test\\nvalue')).toThrow();
    });

    it('should handle URL-encoded characters', () => {
      // %2F is URL-encoded /
      expect(() => sanitizeSessionName('test%2Fvalue')).toThrow();
    });
  });
});

describe('Security Tests: Edge Cases and Boundary Conditions', () => {
  describe('empty and whitespace handling', () => {
    it('should reject empty string for sanitizePath', () => {
      expect(() => sanitizePath('')).toThrow('non-empty');
    });

    it('should reject whitespace-only for sanitizeSessionName', () => {
      expect(() => sanitizeSessionName('   ')).toThrow('empty');
      expect(() => sanitizeSessionName('\t\n')).toThrow('empty');
    });

    it('should handle whitespace in briefing', () => {
      const result = validateBriefing('   ');
      // Whitespace-only should still be valid as it's not empty string
      expect(result.isValid).toBe(true);
    });
  });

  describe('validatePort boundary conditions', () => {
    it('should reject port 0', () => {
      expect(() => validatePort(0)).toThrow('between 1 and 65535');
    });

    it('should accept port 1', () => {
      expect(validatePort(1)).toBe(1);
    });

    it('should accept port 65535', () => {
      expect(validatePort(65535)).toBe(65535);
    });

    it('should reject port 65536', () => {
      expect(() => validatePort(65536)).toThrow('between 1 and 65535');
    });

    it('should reject negative ports', () => {
      expect(() => validatePort(-1)).toThrow('between 1 and 65535');
      expect(() => validatePort(-65535)).toThrow('between 1 and 65535');
    });

    it('should reject Infinity', () => {
      expect(() => validatePort(Infinity)).toThrow();
    });

    it('should reject NaN', () => {
      expect(() => validatePort(NaN)).toThrow('must be a number');
    });
  });

  describe('maximum length boundary tests', () => {
    it('should accept path at exactly max length', () => {
      const maxLengthPath = '/tmp/' + 'a'.repeat(MAX_PATH_LENGTH - 5);
      expect(() => sanitizePath(maxLengthPath)).not.toThrow();
    });

    it('should accept session name at exactly max length', () => {
      const maxLengthName = 'a'.repeat(MAX_SESSION_NAME_LENGTH);
      expect(sanitizeSessionName(maxLengthName)).toBe(maxLengthName);
    });

    it('should accept briefing at exactly max length', () => {
      const result = validateBriefing('a'.repeat(MAX_BRIEFING_LENGTH));
      expect(result.isValid).toBe(true);
    });
  });
});

describe('Security Tests: Model and Agent Validation', () => {
  describe('isValidModel strict validation', () => {
    it('should reject model names with extra characters', () => {
      expect(isValidModel('haiku ')).toBe(false);
      expect(isValidModel(' sonnet')).toBe(false);
      expect(isValidModel('HAIKU')).toBe(false);
      expect(isValidModel('Haiku')).toBe(false);
    });

    it('should reject similar but invalid model names', () => {
      expect(isValidModel('haikus')).toBe(false);
      expect(isValidModel('sonnets')).toBe(false);
      expect(isValidModel('opuss')).toBe(false);
    });
  });

  describe('isValidAgentName strict validation', () => {
    it('should reject agent names with extra characters', () => {
      expect(isValidAgentName('refiner ')).toBe(false);
      expect(isValidAgentName(' builder')).toBe(false);
      expect(isValidAgentName('VERIFIER')).toBe(false);
    });

    it('should reject similar but invalid agent names', () => {
      expect(isValidAgentName('refiners')).toBe(false);
      expect(isValidAgentName('build')).toBe(false);
      expect(isValidAgentName('verify')).toBe(false);
      expect(isValidAgentName('gate')).toBe(false);
    });
  });
});
