export type {
  WiringCheckResult,
  MissingImport,
  AvailableExport,
  AccumulatedContext,
  GoalVerificationResult,
  IntegrationIssue,
  FixChunkSuggestion,
} from './types';

export { WiringChecker } from './wiring-checker';
export { GoalVerifierService, goalVerifierService } from './goal-verifier-service';
