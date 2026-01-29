import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Prompt loader service for loading prompt templates from disk
 *
 * This service provides a simple interface to load prompt template files
 * from the templates/prompts/ directory. It returns raw template content
 * without any processing or variable substitution.
 */
export class PromptLoader {
  private templatesDir: string;

  constructor(projectRoot?: string) {
    if (projectRoot) {
      // Use provided project root (for testing or explicit configuration)
      this.templatesDir = join(projectRoot, 'templates', 'prompts');
    } else {
      // Default: resolve relative to package installation
      this.templatesDir = join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        'templates',
        'prompts'
      );
    }
  }

  /**
   * Load a prompt template file
   *
   * @param promptType - The type of prompt to load (e.g., 'refiner', 'builder', 'verifier-phase1')
   * @returns Raw template content as a string
   * @throws Error if the prompt file cannot be found or read
   */
  async loadPrompt(promptType: string): Promise<string> {
    const filename = `${promptType}.md`;
    const filepath = join(this.templatesDir, filename);

    try {
      const content = await readFile(filepath, 'utf-8');
      return content;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        throw new Error(
          `Prompt template not found: ${promptType}\n` +
          `Expected location: ${filepath}\n` +
          `Available prompts: refiner, builder, verifier-phase1, verifier-phase2, gatekeeper`
        );
      }
      throw new Error(
        `Failed to load prompt template '${promptType}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get the templates directory path
   * Useful for debugging or testing
   */
  getTemplatesDir(): string {
    return this.templatesDir;
  }
}

/**
 * Convenience function to load a prompt without instantiating PromptLoader
 * Uses default template directory resolution
 */
export async function loadPrompt(promptType: string): Promise<string> {
  const loader = new PromptLoader();
  return loader.loadPrompt(promptType);
}
