import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { toolDefinitions } from "./tools/definitions.js";
import { delegateToGLM, delegateChunksToGLM } from "./tools/delegate.js";
import { splitSpecIntoChunks, writeSpec, writeReview } from "./tools/spec.js";
import {
  startFeatureWorkflow,
  runImplementationStage,
  visualizeWorkflowTool,
} from "./tools/workflow.js";

const server = new Server(
  { name: "glm-orchestrator", version: "3.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: toolDefinitions,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "delegate_to_glm": {
        const { task, workingDirectory, timeoutMs } = args as {
          task: string;
          workingDirectory: string;
          timeoutMs?: number;
        };
        return delegateToGLM(task, workingDirectory, timeoutMs);
      }

      case "delegate_chunks_to_glm": {
        const { chunks, workingDirectory, specFile, timeoutPerChunk } = args as {
          chunks: string[];
          workingDirectory: string;
          specFile?: string;
          timeoutPerChunk?: number;
        };
        return delegateChunksToGLM(chunks, workingDirectory, specFile, timeoutPerChunk);
      }

      case "split_spec_into_chunks": {
        const { specFile } = args as { specFile: string };
        return splitSpecIntoChunks(specFile);
      }

      case "write_spec": {
        const { name: featureName, spec, workingDirectory } = args as {
          name: string;
          spec: string;
          workingDirectory: string;
        };
        return writeSpec(featureName, spec, workingDirectory);
      }

      case "write_review": {
        const { findings, workingDirectory } = args as {
          findings: string;
          workingDirectory: string;
        };
        return writeReview(findings, workingDirectory);
      }

      case "start_feature_workflow": {
        const { featureName, workingDirectory, specFile } = args as {
          featureName: string;
          workingDirectory: string;
          specFile?: string;
        };
        return startFeatureWorkflow(featureName, workingDirectory, specFile);
      }

      case "run_implementation_stage": {
        const { workingDirectory, specFile, tasks } = args as {
          workingDirectory: string;
          specFile?: string;
          tasks?: Array<{
            id: string;
            name: string;
            description: string;
            dependsOn?: string[];
          }>;
        };
        return runImplementationStage(workingDirectory, specFile, tasks);
      }

      case "visualize_workflow": {
        const { workflowId } = args as { workflowId: string };
        return visualizeWorkflowTool(workflowId);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GLM Orchestrator MCP server v3.0 running");
}

main().catch(console.error);
