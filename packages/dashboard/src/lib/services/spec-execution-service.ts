/**
 * Spec Execution Service - Re-export module
 *
 * Split into domain modules (ORC-117):
 * - spec/execution-service.ts: Main orchestration service
 * - spec/dependency-resolver.ts: Dependency resolution logic
 *
 * This file re-exports everything for backward compatibility.
 */

export {
  SpecExecutionService,
  specExecutionService,
  type SpecExecutionEvents,
  type SpecExecutionStats,
  type RunAllOptions,
} from '../spec/execution-service';
