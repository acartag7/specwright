/**
 * Config Schema - Zod validation for Specwright YAML config
 */

import { z } from 'zod';

const providerConfigSchema = z.object({
  type: z.enum(['opencode', 'claude-code', 'api']),
  enabled: z.boolean().default(true),
  baseUrl: z.string().url().optional(),
  model: z.string().optional(),
  timeout: z.number().min(1000).max(600000).optional(),
  options: z.record(z.string(), z.unknown()).optional(),
});

const defaultsSchema = z.object({
  provider: z.string().default('opencode'),
  model: z.string().optional(),
  timeout: z.number().min(1000).max(600000).default(300000),
  maxRetries: z.number().min(0).max(10).default(2),
});

const rulesSchema = z.object({
  maxFileSize: z.number().positive().default(300),
  shellSafety: z.boolean().default(true),
  requireReview: z.boolean().default(false),
});

const parallelSchema = z.object({
  enabled: z.boolean().default(true),
  maxConcurrent: z.number().min(1).max(10).default(3),
  autoSerializeOverlap: z.boolean().default(true),
});

export const specwrightConfigSchema = z.object({
  providers: z.record(z.string(), providerConfigSchema).default(() => ({})),
  defaults: defaultsSchema.default(() => ({
    provider: 'opencode',
    timeout: 300000,
    maxRetries: 2,
  })),
  rules: rulesSchema.default(() => ({
    maxFileSize: 300,
    shellSafety: true,
    requireReview: false,
  })),
  parallel: parallelSchema.default(() => ({
    enabled: true,
    maxConcurrent: 3,
    autoSerializeOverlap: true,
  })),
});

export type SpecwrightConfig = z.infer<typeof specwrightConfigSchema>;
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
