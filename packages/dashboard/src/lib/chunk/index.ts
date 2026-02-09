// Domain: chunk
export {
  getChunksBySpec,
  getChunk,
  createChunk,
  updateChunk,
  deleteChunk,
  reorderChunks,
  insertFixChunk,
  archiveChunk,
  unarchiveChunk,
  getActiveChunksForSpec,
} from './repository';

export {
  ChunkExecutor,
  chunkExecutor,
  type VerificationResult,
  type ExecutionResult,
  type ExecutionCallbacks,
} from './executor';

export {
  ChunkPipeline,
  chunkPipeline,
  type ChunkPipelineResult,
  type ChunkPipelineEvents,
} from './pipeline';

export {
  ValidationService,
  validationService,
  type ValidationResult,
  type ValidationOptions,
} from './validation-service';
