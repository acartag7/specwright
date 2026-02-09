/**
 * Model Registry - Dynamic Model Discovery
 *
 * Queries OpenCode's /provider endpoint to discover available models.
 * No hardcoded model IDs - everything is fetched dynamically.
 */

import type { ModelInfo, ValidationResult } from './types';

interface ProviderInfo {
  id: string;
  name: string;
  models: ModelInfo[];
}

export class ModelRegistry {
  private endpoint: string;
  private cache: Map<string, ProviderInfo> = new Map();
  private cacheExpiry = 0;
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(endpoint = 'http://localhost:4096') {
    this.endpoint = endpoint;
  }

  async getAllModels(): Promise<ModelInfo[]> {
    await this.refreshIfNeeded();
    const all: ModelInfo[] = [];
    for (const provider of this.cache.values()) {
      all.push(...provider.models);
    }
    return all;
  }

  async getModelsForProvider(providerId: string): Promise<ModelInfo[]> {
    await this.refreshIfNeeded();
    return this.cache.get(providerId)?.models ?? [];
  }

  async getProviders(): Promise<ProviderInfo[]> {
    await this.refreshIfNeeded();
    return Array.from(this.cache.values());
  }

  async validateModel(providerId: string, modelId: string): Promise<ValidationResult> {
    const models = await this.getModelsForProvider(providerId);
    const found = models.find(m => m.id === modelId);

    if (found) {
      return { valid: true, model: found };
    }

    // Find close matches for suggestions
    const prefix = modelId.split('-')[0].toLowerCase();
    const suggestions = models
      .filter(m => m.id.toLowerCase().includes(prefix))
      .slice(0, 5)
      .map(m => m.id);

    return {
      valid: false,
      error: `Model "${modelId}" not found for provider "${providerId}"`,
      suggestions: suggestions.length > 0 ? suggestions : undefined,
    };
  }

  /** Invalidate the cache, forcing a refresh on next query */
  invalidate(): void {
    this.cacheExpiry = 0;
  }

  private async refreshIfNeeded(): Promise<void> {
    if (Date.now() < this.cacheExpiry) return;

    try {
      const response = await fetch(`${this.endpoint}/provider`);
      if (!response.ok) {
        throw new Error(`Provider endpoint returned ${response.status}`);
      }

      const data = await response.json();

      this.cache.clear();
      for (const provider of data.all) {
        this.cache.set(provider.id, {
          id: provider.id,
          name: provider.name,
          models: Object.values(provider.models).map((m: any) => ({
            id: m.id,
            name: m.name,
            provider: provider.id,
            capabilities: {
              toolCall: m.capabilities?.toolcall ?? false,
              attachment: m.capabilities?.attachment ?? false,
              reasoning: m.capabilities?.reasoning ?? false,
            },
            cost: m.cost,
            limits: m.limit,
          })),
        });
      }
      this.cacheExpiry = Date.now() + this.cacheTTL;
    } catch (error) {
      // If OpenCode is not running, keep stale cache or empty
      console.error(
        `[ModelRegistry] Failed to refresh from ${this.endpoint}/provider:`,
        error instanceof Error ? error.message : error
      );
      // Don't update cacheExpiry so we retry next time
    }
  }
}

// Singleton
let registry: ModelRegistry | null = null;

export function getModelRegistry(endpoint?: string): ModelRegistry {
  if (!registry) {
    registry = new ModelRegistry(endpoint);
  }
  return registry;
}
