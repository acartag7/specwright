// Domain: spec
export {
  SpecExecutionService,
  specExecutionService,
  type SpecExecutionEvents,
  type SpecExecutionStats,
  type RunAllOptions,
} from './execution-service';

export {
  findRunnableChunks,
  validateDependencies,
  findDependentChunks,
  cancelDependentChunks,
} from './dependency-resolver';
