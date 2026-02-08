/**
 * Provider Registry - Factory for Execution Providers
 *
 * Maps provider type strings to ExecutionProvider instances.
 * Supports 'opencode' and 'claude-code' out of the box.
 */

import type { ExecutionProvider } from './types';
import { OpencodeProvider } from './providers/opencode-provider';
import { ClaudeCodeProvider } from './providers/claude-code-provider';

type ProviderFactory = (config?: Record<string, unknown>) => ExecutionProvider;

const factories = new Map<string, ProviderFactory>();
const instances = new Map<string, ExecutionProvider>();

// Register built-in providers
factories.set('opencode', (config) => {
  return new OpencodeProvider(config as { baseUrl?: string } | undefined);
});

factories.set('claude-code', (config) => {
  return new ClaudeCodeProvider(config as { model?: string } | undefined);
});

/**
 * Get a provider instance by type. Returns a cached instance unless config changes.
 */
export function getProvider(
  type: string,
  config?: Record<string, unknown>
): ExecutionProvider {
  // If config is provided, always create a fresh instance
  if (config) {
    const factory = factories.get(type);
    if (!factory) {
      throw new Error(
        `Unknown provider type "${type}". Available: ${getAvailableProviderTypes().join(', ')}`
      );
    }
    return factory(config);
  }

  // Otherwise, return cached singleton
  let instance = instances.get(type);
  if (!instance) {
    const factory = factories.get(type);
    if (!factory) {
      throw new Error(
        `Unknown provider type "${type}". Available: ${getAvailableProviderTypes().join(', ')}`
      );
    }
    instance = factory();
    instances.set(type, instance);
  }
  return instance;
}

/**
 * List all registered provider type strings.
 */
export function getAvailableProviderTypes(): string[] {
  return Array.from(factories.keys());
}

/**
 * Register a custom provider factory. Useful for plugins or testing.
 */
export function registerProvider(type: string, factory: ProviderFactory): void {
  factories.set(type, factory);
  // Clear cached instance so next getProvider call uses new factory
  instances.delete(type);
}
