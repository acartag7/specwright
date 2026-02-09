/**
 * Config Loader - YAML config with hierarchical merging
 *
 * Loads config from:
 *   1. ~/.specwright/config.yaml (global defaults)
 *   2. <projectDir>/.specwright/config.yaml (project overrides)
 *
 * Project config is deep-merged on top of global config.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import { parse as parseYaml } from 'yaml';
import { specwrightConfigSchema, type SpecwrightConfig } from './config-schema';

const GLOBAL_CONFIG_PATH = join(homedir(), '.specwright', 'config.yaml');
const PROJECT_CONFIG_NAME = join('.specwright', 'config.yaml');

/**
 * Deep merge two objects. Source values override target values.
 * Arrays are replaced, not concatenated.
 */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceVal = source[key];
    const targetVal = result[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      ) as T[keyof T];
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal as T[keyof T];
    }
  }

  return result;
}

async function readYamlFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFile(path, 'utf-8');
    const parsed = parseYaml(content);
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function getDefaultConfig(): SpecwrightConfig {
  return specwrightConfigSchema.parse({});
}

/**
 * Load and merge YAML config from global + project paths.
 * Returns validated SpecwrightConfig (falls back to defaults on any error).
 */
export async function loadConfig(projectDir?: string): Promise<SpecwrightConfig> {
  const globalRaw = await readYamlFile(GLOBAL_CONFIG_PATH);
  const projectRaw = projectDir
    ? await readYamlFile(join(projectDir, PROJECT_CONFIG_NAME))
    : null;

  let merged: Record<string, unknown> = {};

  if (globalRaw) {
    merged = globalRaw;
  }
  if (projectRaw) {
    merged = deepMerge(merged, projectRaw);
  }

  const result = specwrightConfigSchema.safeParse(merged);
  if (result.success) {
    return result.data;
  }

  console.error('[ConfigLoader] Validation failed, using defaults:', result.error.format());
  return getDefaultConfig();
}
