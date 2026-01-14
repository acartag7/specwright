import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

export async function splitSpecIntoChunks(specFile: string) {
  const spec = await readFile(specFile, "utf-8");
  const chunks: string[] = [];

  if (spec.includes("File Structure") || spec.includes("```")) {
    const fileMatches = spec.match(
      /(?:├──|└──|│\s+├──|│\s+└──)\s+(\S+\.ts)/g
    );
    if (fileMatches) {
      const files = fileMatches.map((m) =>
        m.replace(/[├└│─\s]+/g, "").trim()
      );

      const typeFiles = files.filter(
        (f) => f.includes("types") || f.includes(".types.")
      );
      const utilFiles = files.filter(
        (f) => f.includes("util") || f.includes("helper")
      );
      const testFiles = files.filter((f) => f.includes("test"));
      const mainFiles = files.filter(
        (f) =>
          !typeFiles.includes(f) &&
          !utilFiles.includes(f) &&
          !testFiles.includes(f)
      );

      if (typeFiles.length > 0) {
        chunks.push(
          `Create TypeScript type definitions:\n${typeFiles.map((f) => `- ${f}`).join("\n")}\n\nExtract all interfaces and types from the spec.`
        );
      }

      if (utilFiles.length > 0) {
        chunks.push(
          `Create utility functions:\n${utilFiles.map((f) => `- ${f}`).join("\n")}\n\nImplement helper functions as specified.`
        );
      }

      for (let i = 0; i < mainFiles.length; i += 2) {
        const batch = mainFiles.slice(i, i + 2);
        chunks.push(
          `Implement core modules:\n${batch.map((f) => `- ${f}`).join("\n")}\n\nFollow the spec for implementation details.`
        );
      }

      if (testFiles.length > 0) {
        chunks.push(
          `Create test files:\n${testFiles.map((f) => `- ${f}`).join("\n")}\n\nWrite tests based on the spec requirements.`
        );
      }
    }
  }

  if (chunks.length === 0) {
    chunks.push(
      "Create type definitions and interfaces",
      "Implement core functionality",
      "Add utility functions",
      "Write tests"
    );
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `## Suggested Chunks for Implementation

Based on the spec, here are ${chunks.length} recommended implementation chunks:

${chunks.map((c, i) => `### Chunk ${i + 1}\n\`\`\`\n${c}\n\`\`\``).join("\n\n")}

**To execute these chunks**, call \`delegate_chunks_to_glm\` with the chunks array.

You may want to refine these chunks based on your specific needs.`,
      },
    ],
  };
}

export async function writeSpec(
  featureName: string,
  spec: string,
  workingDirectory: string
) {
  const handoffDir = join(workingDirectory, ".handoff");
  if (!existsSync(handoffDir)) {
    await mkdir(handoffDir, { recursive: true });
  }

  const specPath = join(handoffDir, `feature-${featureName}.md`);
  await writeFile(specPath, spec, "utf-8");

  return {
    content: [
      {
        type: "text" as const,
        text: `Spec written to: ${specPath}

**Next steps:**
1. Call \`split_spec_into_chunks\` to get recommended chunks
2. Call \`delegate_chunks_to_glm\` with the chunks`,
      },
    ],
  };
}

export async function writeReview(findings: string, workingDirectory: string) {
  const handoffDir = join(workingDirectory, ".handoff");
  if (!existsSync(handoffDir)) {
    await mkdir(handoffDir, { recursive: true });
  }

  const reviewPath = join(handoffDir, "review-findings.md");
  await writeFile(reviewPath, findings, "utf-8");

  return {
    content: [
      {
        type: "text" as const,
        text: `Review written to: ${reviewPath}`,
      },
    ],
  };
}
