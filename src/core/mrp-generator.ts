import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync } from 'fs';
import { join, relative } from 'path';
import type { RunState, MRPEvidence, VerifierResults, BuilderOutputManifest, VCR } from '../types/index.js';

/**
 * MRPGenerator - Generates Merge-Readiness Pack when Gatekeeper passes
 */
export class MRPGenerator {
  private runDir: string;
  private projectRoot: string;

  constructor(runDir: string, projectRoot: string) {
    this.runDir = runDir;
    this.projectRoot = projectRoot;
  }

  /**
   * Generate the complete MRP
   */
  generate(): void {
    const mrpDir = join(this.runDir, 'mrp');

    // Ensure directories exist
    mkdirSync(join(mrpDir, 'code'), { recursive: true });
    mkdirSync(join(mrpDir, 'tests'), { recursive: true });

    // Generate each component
    this.copyChangedFiles(mrpDir);
    this.copyTests(mrpDir);
    this.generateEvidence(mrpDir);
    this.generateSummary(mrpDir);
  }

  /**
   * Copy changed files to mrp/code/
   */
  private copyChangedFiles(mrpDir: string): void {
    const codeDir = join(mrpDir, 'code');
    const outputDir = join(this.runDir, 'builder', 'output');

    // Try to read builder output manifest
    const manifestPath = join(outputDir, 'manifest.json');
    let filesToCopy: string[] = [];

    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as BuilderOutputManifest;
        filesToCopy = [...manifest.files_created, ...manifest.files_modified];
      } catch {
        // Fall back to directory listing
        filesToCopy = this.listFilesRecursively(outputDir);
      }
    } else {
      // List all files in output directory
      filesToCopy = this.listFilesRecursively(outputDir);
    }

    // Copy each file
    for (const file of filesToCopy) {
      const srcPath = file.startsWith('/') ? file : join(this.projectRoot, file);
      if (existsSync(srcPath)) {
        const destPath = join(codeDir, relative(this.projectRoot, srcPath));
        const destDir = join(destPath, '..');
        mkdirSync(destDir, { recursive: true });
        copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Copy test files to mrp/tests/
   */
  private copyTests(mrpDir: string): void {
    const testsDir = join(mrpDir, 'tests');
    const verifierTestsDir = join(this.runDir, 'verifier', 'tests');

    if (!existsSync(verifierTestsDir)) return;

    const testFiles = this.listFilesRecursively(verifierTestsDir);

    for (const file of testFiles) {
      const srcPath = join(verifierTestsDir, file);
      const destPath = join(testsDir, file);
      const destDir = join(destPath, '..');
      mkdirSync(destDir, { recursive: true });
      copyFileSync(srcPath, destPath);
    }
  }

  /**
   * Generate evidence.json
   */
  private generateEvidence(mrpDir: string): void {
    // Read state
    const state = this.readState();

    // Read verifier results
    const verifierResults = this.readVerifierResults();

    // Get list of changed files
    const filesChanged = this.getChangedFiles();

    // Get VCR decisions
    const decisions = this.getVCRDecisions();

    const evidence: MRPEvidence = {
      tests: {
        total: verifierResults?.total || 0,
        passed: verifierResults?.passed || 0,
        failed: verifierResults?.failed || 0,
        coverage: verifierResults?.coverage,
      },
      files_changed: filesChanged,
      decisions: decisions,
      iterations: state?.iteration || 1,
      logs: {
        refiner: 'briefing/log.md',
        builder: 'builder/log.md',
        verifier: 'verifier/log.md',
        gatekeeper: 'gatekeeper/log.md',
      },
    };

    writeFileSync(
      join(mrpDir, 'evidence.json'),
      JSON.stringify(evidence, null, 2),
      'utf-8'
    );
  }

  /**
   * Generate summary.md
   */
  private generateSummary(mrpDir: string): void {
    const state = this.readState();
    const verifierResults = this.readVerifierResults();
    const filesChanged = this.getChangedFiles();
    const decisions = this.getVCRDecisions();

    const completedAt = new Date().toISOString();

    let summary = `# Merge-Readiness Pack

## Run Information
- **Run ID:** ${state?.run_id || 'unknown'}
- **Total Iterations:** ${state?.iteration || 1}
- **Completed At:** ${completedAt}

## Changes
`;

    if (filesChanged.length > 0) {
      for (const file of filesChanged) {
        summary += `- \`${file}\`\n`;
      }
    } else {
      summary += '- No files changed\n';
    }

    summary += `
## Test Results
- **Total:** ${verifierResults?.total || 0}
- **Passed:** ${verifierResults?.passed || 0}
- **Failed:** ${verifierResults?.failed || 0}
`;

    if (verifierResults?.coverage !== undefined) {
      summary += `- **Coverage:** ${verifierResults.coverage}%\n`;
    }

    if (decisions.length > 0) {
      summary += `
## Design Decisions
`;
      for (const decision of decisions) {
        summary += `- ${decision}\n`;
      }
    }

    // Read gatekeeper review if available
    const reviewPath = join(this.runDir, 'gatekeeper', 'review.md');
    if (existsSync(reviewPath)) {
      const review = readFileSync(reviewPath, 'utf-8');
      summary += `
## Review Notes
${review}
`;
    }

    writeFileSync(join(mrpDir, 'summary.md'), summary, 'utf-8');
  }

  /**
   * Helper: Read state.json
   */
  private readState(): RunState | null {
    const statePath = join(this.runDir, 'state.json');
    if (!existsSync(statePath)) return null;

    try {
      return JSON.parse(readFileSync(statePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Helper: Read verifier results
   */
  private readVerifierResults(): VerifierResults | null {
    const resultsPath = join(this.runDir, 'verifier', 'results.json');
    if (!existsSync(resultsPath)) return null;

    try {
      return JSON.parse(readFileSync(resultsPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Helper: Get changed files list
   */
  private getChangedFiles(): string[] {
    const manifestPath = join(this.runDir, 'builder', 'output', 'manifest.json');

    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as BuilderOutputManifest;
        return [...manifest.files_created, ...manifest.files_modified];
      } catch {
        // Fall through
      }
    }

    // Fall back to listing files
    const outputDir = join(this.runDir, 'builder', 'output');
    return this.listFilesRecursively(outputDir);
  }

  /**
   * Helper: Get VCR decision IDs
   */
  private getVCRDecisions(): string[] {
    const vcrDir = join(this.runDir, 'vcr');
    if (!existsSync(vcrDir)) return [];

    const files = readdirSync(vcrDir).filter(f => f.endsWith('.json'));
    const decisions: string[] = [];

    for (const file of files) {
      try {
        const vcr = JSON.parse(readFileSync(join(vcrDir, file), 'utf-8')) as VCR;
        decisions.push(vcr.vcr_id);
      } catch {
        // Skip invalid files
      }
    }

    return decisions;
  }

  /**
   * Helper: List files recursively in a directory
   */
  private listFilesRecursively(dir: string, prefix: string = ''): string[] {
    if (!existsSync(dir)) return [];

    const files: string[] = [];
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        files.push(...this.listFilesRecursively(join(dir, entry.name), relativePath));
      } else if (entry.isFile() && entry.name !== 'manifest.json') {
        files.push(relativePath);
      }
    }

    return files;
  }
}
