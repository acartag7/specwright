/**
 * Wiring Checker (v2-07, ORC-102)
 *
 * Validates cross-chunk dependencies by tracking exports created by
 * completed chunks and checking them against a chunk's consumes list.
 */

import { readFileSync } from 'fs';
import path from 'path';
import type { Chunk } from '@specwright/shared';
import { getChunksBySpec } from '@/lib/db/chunks';
import { gitSync } from '@/lib/git';
import type {
  WiringCheckResult,
  MissingImport,
  AvailableExport,
  AccumulatedContext,
} from './types';

export class WiringChecker {
  private accumulated: AccumulatedContext;
  private specId: string;

  constructor(specId: string) {
    this.specId = specId;
    this.accumulated = {
      exports: [],
      filesCreated: [],
      filesModified: [],
    };
  }

  /**
   * Check if chunk can execute based on available exports.
   * Called BEFORE chunk execution.
   */
  checkWiring(chunk: Chunk): WiringCheckResult {
    const missingImports: MissingImport[] = [];

    // Use consumes if available, otherwise skip wiring check
    const consumes = (chunk as Chunk & { consumes?: string[] }).consumes ?? [];

    for (const required of consumes) {
      const available = this.accumulated.exports.find(e => e.name === required);

      if (!available) {
        const expectedChunk = this.findChunkThatCreates(chunk.specId, required);

        missingImports.push({
          name: required,
          requiredBy: chunk.id,
          expectedFrom: expectedChunk?.id,
          suggestion: expectedChunk
            ? `Chunk "${expectedChunk.title}" should create ${required} but hasn't completed yet`
            : `No chunk declares ${required} in its creates[]. Add it to an earlier chunk.`,
        });
      }
    }

    return {
      canExecute: missingImports.length === 0,
      missingImports,
      availableExports: [...this.accumulated.exports],
    };
  }

  /**
   * Record exports created by a completed chunk.
   * Called AFTER chunk passes validation and review.
   */
  recordChunkCompletion(chunk: Chunk, createdExports: AvailableExport[]): void {
    this.accumulated.exports.push(...createdExports);

    for (const file of chunk.files || []) {
      if (!this.accumulated.filesCreated.includes(file)) {
        this.accumulated.filesCreated.push(file);
      }
    }
  }

  /**
   * Extract exports from git diff after chunk execution.
   * Uses regex-based parsing for fast tier-1 validation.
   */
  async extractCreatedExports(
    chunkId: string,
    workingDir: string
  ): Promise<AvailableExport[]> {
    const exports: AvailableExport[] = [];
    const now = new Date().toISOString();

    const changedFiles = this.getChangedFiles(workingDir);

    for (const file of changedFiles) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;

      let content: string;
      try {
        content = readFileSync(path.join(workingDir, file), 'utf-8');
      } catch {
        continue;
      }

      const pattern = /export\s+(const|function|interface|type|class)\s+(\w+)/g;

      let match;
      while ((match = pattern.exec(content)) !== null) {
        exports.push({
          name: match[2],
          type: match[1] as AvailableExport['type'],
          file,
          importFrom: this.getImportPath(file),
          createdByChunk: chunkId,
          createdAt: now,
        });
      }
    }

    return exports;
  }

  /** Get the accumulated context snapshot */
  getContext(): AccumulatedContext {
    return {
      exports: [...this.accumulated.exports],
      filesCreated: [...this.accumulated.filesCreated],
      filesModified: [...this.accumulated.filesModified],
    };
  }

  /** Load previously accumulated context (e.g., from database) */
  loadContext(context: AccumulatedContext): void {
    this.accumulated = {
      exports: [...context.exports],
      filesCreated: [...context.filesCreated],
      filesModified: [...context.filesModified],
    };
  }

  private findChunkThatCreates(specId: string, exportName: string): Chunk | undefined {
    const chunks = getChunksBySpec(specId);
    return chunks.find(c => {
      const creates = (c as Chunk & { creates?: string[] }).creates;
      return creates?.includes(exportName);
    });
  }

  private getImportPath(filePath: string): string {
    if (filePath.startsWith('packages/shared/')) return '@specwright/shared';
    if (filePath.startsWith('packages/dashboard/src/')) {
      return '@/' + filePath.replace('packages/dashboard/src/', '').replace(/\.tsx?$/, '');
    }
    return filePath;
  }

  /** Get changed files from git status using safe gitSync */
  private getChangedFiles(workingDir: string): string[] {
    const result = gitSync(['diff', '--name-only', 'HEAD'], workingDir);
    if (result.status !== 0) {
      // Fallback to status --porcelain for untracked files
      const statusResult = gitSync(['status', '--porcelain'], workingDir);
      if (statusResult.status !== 0) return [];
      return statusResult.stdout
        .split('\n')
        .filter(Boolean)
        .map(line => line.slice(3).trim());
    }
    return result.stdout.split('\n').filter(Boolean);
  }
}
