import { getProjectConfig, saveProjectConfig, validateConfig, validateExecutor, validatePlanner, validateReviewer, ConfigValidationError } from './src/lib/config-loader.ts';

// Test ConfigValidationError
try {
  const invalidConfig = {
    executor: { type: 'opencode', endpoint: 'http://localhost:4096', model: 'glm-4.7', timeout: 300000, maxTokens: 8192 },
    planner: { type: 'opus', cliPath: 'claude' },
    reviewer: { type: 'sonnet-quick', cliPath: 'claude', autoApprove: false },
    maxIterations: 25  // Invalid: > 20
  };
  validateConfig(invalidConfig);
  console.error('FAIL: Should have thrown validation error');
} catch (error) {
  if (error instanceof ConfigValidationError && error.field === 'maxIterations') {
    console.log('PASS: ConfigValidationError thrown for invalid maxIterations');
  } else {
    console.error('FAIL: Wrong error type or field');
  }
}

// Test valid config
try {
  const validConfig = {
    executor: { type: 'opencode', endpoint: 'http://localhost:4096', model: 'glm-4.7', timeout: 300000, maxTokens: 8192 },
    planner: { type: 'opus', cliPath: 'claude' },
    reviewer: { type: 'sonnet-quick', cliPath: 'claude', autoApprove: false },
    maxIterations: 5
  };
  validateConfig(validConfig);
  console.log('PASS: Valid config passes validation');
} catch (error) {
  console.error('FAIL: Valid config should not throw error', error);
}

console.log('Tests completed');
