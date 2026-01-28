import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type {
  OrchestraConfig,
  GlobalConfig,
  RefinerConfig,
  BuilderConfig,
  VerifierConfig,
  GatekeeperConfig,
} from '../types/index.js';
import type { Result } from '../types/result.js';
import { isErr } from '../types/result.js';
import { ValidationError } from '../types/errors.js';
import {
  defaultConfig,
  defaultGlobalConfig,
  defaultRefinerConfig,
  defaultBuilderConfig,
  defaultVerifierConfig,
  defaultGatekeeperConfig,
} from './defaults.js';
import { validateConfig, validateGlobalConfig } from './validation.js';

export class ConfigManager {
  private projectRoot: string;
  private configDir: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.configDir = join(projectRoot, '.dure', 'config');
  }

  /**
   * Initialize the config directory with default config files
   */
  initialize(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }

    // Write default configs if they don't exist
    this.writeIfNotExists('global.json', defaultGlobalConfig);
    this.writeIfNotExists('refiner.json', defaultRefinerConfig);
    this.writeIfNotExists('builder.json', defaultBuilderConfig);
    this.writeIfNotExists('verifier.json', defaultVerifierConfig);
    this.writeIfNotExists('gatekeeper.json', defaultGatekeeperConfig);
  }

  /**
   * Load the complete configuration
   */
  loadConfig(): OrchestraConfig {
    const config = {
      global: this.loadGlobalConfig(),
      refiner: this.loadRefinerConfig(),
      builder: this.loadBuilderConfig(),
      verifier: this.loadVerifierConfig(),
      gatekeeper: this.loadGatekeeperConfig(),
    };

    // Validate the loaded configuration
    const validationResult = validateConfig(config);
    if (isErr(validationResult)) {
      console.warn(`Configuration validation warning: ${validationResult.error.message}`);
      console.warn('Using default configuration values where validation failed.');
    }

    return config;
  }

  /**
   * Load and validate configuration, returning Result type
   */
  loadConfigSafe(): Result<OrchestraConfig, ValidationError> {
    const config = {
      global: this.loadGlobalConfig(),
      refiner: this.loadRefinerConfig(),
      builder: this.loadBuilderConfig(),
      verifier: this.loadVerifierConfig(),
      gatekeeper: this.loadGatekeeperConfig(),
    };

    return validateConfig(config);
  }

  /**
   * Load global configuration
   */
  loadGlobalConfig(): GlobalConfig {
    return this.loadConfigFile<GlobalConfig>('global.json', defaultGlobalConfig);
  }

  /**
   * Load refiner configuration
   */
  loadRefinerConfig(): RefinerConfig {
    return this.loadConfigFile<RefinerConfig>('refiner.json', defaultRefinerConfig);
  }

  /**
   * Load builder configuration
   */
  loadBuilderConfig(): BuilderConfig {
    return this.loadConfigFile<BuilderConfig>('builder.json', defaultBuilderConfig);
  }

  /**
   * Load verifier configuration
   */
  loadVerifierConfig(): VerifierConfig {
    return this.loadConfigFile<VerifierConfig>('verifier.json', defaultVerifierConfig);
  }

  /**
   * Load gatekeeper configuration
   */
  loadGatekeeperConfig(): GatekeeperConfig {
    return this.loadConfigFile<GatekeeperConfig>('gatekeeper.json', defaultGatekeeperConfig);
  }

  /**
   * Save a configuration file
   */
  saveConfig<T>(filename: string, config: T): void {
    const filePath = join(this.configDir, filename);
    writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Save the complete configuration
   */
  saveFullConfig(config: OrchestraConfig): void {
    this.saveConfig('global.json', config.global);
    this.saveConfig('refiner.json', config.refiner);
    this.saveConfig('builder.json', config.builder);
    this.saveConfig('verifier.json', config.verifier);
    this.saveConfig('gatekeeper.json', config.gatekeeper);
  }

  /**
   * Get the config directory path
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Check if config exists
   */
  configExists(): boolean {
    return existsSync(this.configDir) && existsSync(join(this.configDir, 'global.json'));
  }

  private loadConfigFile<T>(filename: string, defaultValue: T): T {
    const filePath = join(this.configDir, filename);

    if (!existsSync(filePath)) {
      return defaultValue;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      // Deep merge with defaults to ensure all fields exist
      return this.deepMerge(defaultValue, parsed) as T;
    } catch {
      console.warn(`Warning: Could not parse ${filename}, using defaults`);
      return defaultValue;
    }
  }

  /**
   * Deep merge two objects, with source taking precedence
   */
  private deepMerge(target: unknown, source: unknown): unknown {
    if (source === null || source === undefined) {
      return target;
    }

    if (typeof target !== 'object' || target === null) {
      return source;
    }

    if (typeof source !== 'object' || source === null) {
      return source;
    }

    if (Array.isArray(source)) {
      return source;
    }

    const result = { ...target as Record<string, unknown> };
    for (const key of Object.keys(source as Record<string, unknown>)) {
      const sourceValue = (source as Record<string, unknown>)[key];
      const targetValue = (target as Record<string, unknown>)[key];

      if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue)) {
        result[key] = this.deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue;
      }
    }

    return result;
  }

  private writeIfNotExists<T>(filename: string, config: T): void {
    const filePath = join(this.configDir, filename);

    if (!existsSync(filePath)) {
      writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
    }
  }
}
