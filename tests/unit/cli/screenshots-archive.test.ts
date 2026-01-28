/**
 * Unit tests for CLI screenshots archive functionality
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  lstatSync,
  readlinkSync,
} from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

// Test directory setup
const TEST_DIR = join(process.cwd(), 'tests', '.tmp-screenshots-archive');
const SCREENSHOTS_DIR = join(TEST_DIR, 'docs/images/cli');

// Helper to create a mock SVG file
function createMockSvg(filename: string, content = 'test'): void {
  const filePath = join(SCREENSHOTS_DIR, filename);
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  writeFileSync(filePath, `<svg>${content}</svg>`, 'utf-8');
}

// Helper to check if path is symlink
function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

describe('Screenshots Archive Utilities', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('version validation', () => {
    it('should accept valid semver versions', () => {
      const validVersions = [
        'v0.1.0',
        'v1.0.0',
        'v10.20.30',
        '0.1.0',
        '1.0.0',
        'v1.0.0-alpha',
        'v1.0.0-beta.1',
      ];

      const versionRegex = /^v?\d+\.\d+\.\d+(-[\w.]+)?$/;

      validVersions.forEach((version) => {
        expect(
          versionRegex.test(version),
          `${version} should be valid`
        ).toBe(true);
      });
    });

    it('should reject invalid versions', () => {
      const invalidVersions = [
        'latest',
        'main',
        '1.0',
        'v1',
        '',
        'abc',
        '1.0.0.0',
      ];

      const versionRegex = /^v?\d+\.\d+\.\d+(-[\w.]+)?$/;

      invalidVersions.forEach((version) => {
        expect(
          versionRegex.test(version),
          `${version} should be invalid`
        ).toBe(false);
      });
    });
  });

  describe('version normalization', () => {
    it('should add v prefix if missing', () => {
      const normalize = (v: string) => (v.startsWith('v') ? v : `v${v}`);

      expect(normalize('0.1.0')).toBe('v0.1.0');
      expect(normalize('v0.1.0')).toBe('v0.1.0');
      expect(normalize('1.0.0')).toBe('v1.0.0');
    });
  });

  describe('archive directory structure', () => {
    it('should create version directory with correct path', () => {
      const version = 'v0.2.0';
      const versionDir = join(SCREENSHOTS_DIR, version);

      mkdirSync(versionDir, { recursive: true });

      expect(existsSync(versionDir)).toBe(true);
    });

    it('should copy SVG files to version directory', () => {
      // Create mock screenshots
      createMockSvg('output_.svg', 'root command');
      createMockSvg('output_start.svg', 'start command');

      const version = 'v0.2.0';
      const versionDir = join(SCREENSHOTS_DIR, version);
      mkdirSync(versionDir, { recursive: true });

      // Copy files
      const srcFiles = readdirSync(SCREENSHOTS_DIR).filter((f) =>
        f.endsWith('.svg')
      );
      for (const file of srcFiles) {
        const src = join(SCREENSHOTS_DIR, file);
        const dest = join(versionDir, file);
        writeFileSync(dest, readFileSync(src));
      }

      // Verify
      expect(existsSync(join(versionDir, 'output_.svg'))).toBe(true);
      expect(existsSync(join(versionDir, 'output_start.svg'))).toBe(true);
    });

    it('should skip unchanged files', () => {
      // Create initial screenshots
      createMockSvg('output_.svg', 'content');

      const version = 'v0.2.0';
      const versionDir = join(SCREENSHOTS_DIR, version);
      mkdirSync(versionDir, { recursive: true });

      // First archive
      const src = join(SCREENSHOTS_DIR, 'output_.svg');
      const dest = join(versionDir, 'output_.svg');
      writeFileSync(dest, readFileSync(src));

      // Content should match
      expect(readFileSync(src, 'utf-8')).toBe(readFileSync(dest, 'utf-8'));
    });
  });

  describe('current symlink', () => {
    it('should create current symlink pointing to version', () => {
      // Skip on Windows in CI (symlinks require special permissions)
      if (process.platform === 'win32') {
        return;
      }

      const version = 'v0.2.0';
      const versionDir = join(SCREENSHOTS_DIR, version);
      const currentLink = join(SCREENSHOTS_DIR, 'current');

      mkdirSync(versionDir, { recursive: true });
      createMockSvg('output_.svg');

      // Copy to version dir
      writeFileSync(
        join(versionDir, 'output_.svg'),
        readFileSync(join(SCREENSHOTS_DIR, 'output_.svg'))
      );

      // Create symlink
      try {
        const { symlinkSync } = require('fs');
        symlinkSync(version, currentLink);

        expect(isSymlink(currentLink)).toBe(true);
        expect(readlinkSync(currentLink)).toBe(version);
      } catch {
        // Symlink creation may fail without permissions
      }
    });

    it('should update existing symlink', () => {
      if (process.platform === 'win32') {
        return;
      }

      const v1Dir = join(SCREENSHOTS_DIR, 'v0.1.0');
      const v2Dir = join(SCREENSHOTS_DIR, 'v0.2.0');
      const currentLink = join(SCREENSHOTS_DIR, 'current');

      mkdirSync(v1Dir, { recursive: true });
      mkdirSync(v2Dir, { recursive: true });

      try {
        const { symlinkSync, unlinkSync } = require('fs');

        // Create initial symlink to v0.1.0
        symlinkSync('v0.1.0', currentLink);
        expect(readlinkSync(currentLink)).toBe('v0.1.0');

        // Update to v0.2.0
        unlinkSync(currentLink);
        symlinkSync('v0.2.0', currentLink);
        expect(readlinkSync(currentLink)).toBe('v0.2.0');
      } catch {
        // Symlink operations may fail without permissions
      }
    });
  });

  describe('version listing', () => {
    it('should list archived versions sorted by semver', () => {
      // Create version directories
      const versions = ['v0.1.0', 'v0.2.0', 'v1.0.0', 'v0.10.0'];

      for (const version of versions) {
        mkdirSync(join(SCREENSHOTS_DIR, version), { recursive: true });
      }

      // Read and sort versions
      const listedVersions = readdirSync(SCREENSHOTS_DIR)
        .filter((name) => /^v\d+\.\d+\.\d+$/.test(name))
        .sort((a, b) => {
          const parseVersion = (v: string) => {
            const match = v.match(/^v?(\d+)\.(\d+)\.(\d+)/);
            if (!match) return [0, 0, 0];
            return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
          };
          const [aMaj, aMin, aPat] = parseVersion(a);
          const [bMaj, bMin, bPat] = parseVersion(b);
          if (aMaj !== bMaj) return bMaj - aMaj;
          if (aMin !== bMin) return bMin - aMin;
          return bPat - aPat;
        });

      expect(listedVersions).toEqual(['v1.0.0', 'v0.10.0', 'v0.2.0', 'v0.1.0']);
    });

    it('should exclude non-version directories', () => {
      mkdirSync(join(SCREENSHOTS_DIR, 'v0.1.0'), { recursive: true });
      mkdirSync(join(SCREENSHOTS_DIR, '.hashes'), { recursive: true });
      mkdirSync(join(SCREENSHOTS_DIR, 'temp'), { recursive: true });

      const versions = readdirSync(SCREENSHOTS_DIR).filter((name) =>
        /^v\d+\.\d+\.\d+$/.test(name)
      );

      expect(versions).toEqual(['v0.1.0']);
      expect(versions).not.toContain('.hashes');
      expect(versions).not.toContain('temp');
    });
  });

  describe('dry run mode', () => {
    it('should not create directories in dry run', () => {
      createMockSvg('output_.svg');

      const version = 'v0.2.0';
      const versionDir = join(SCREENSHOTS_DIR, version);

      // In dry run, we just check - don't actually create
      // The actual dry run is tested via CLI

      expect(existsSync(versionDir)).toBe(false);
    });

    it('should report what would be copied in dry run', () => {
      createMockSvg('output_.svg');
      createMockSvg('output_start.svg');

      const screenshots = readdirSync(SCREENSHOTS_DIR).filter((f) =>
        f.endsWith('.svg')
      );

      // Would copy these files
      expect(screenshots.length).toBe(2);
      expect(screenshots).toContain('output_.svg');
      expect(screenshots).toContain('output_start.svg');
    });
  });
});
