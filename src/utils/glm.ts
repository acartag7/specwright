import { spawn } from "child_process";

export interface GLMResult {
  output: string;
  duration: number;
}

export async function executeGLM(
  task: string,
  workingDirectory: string,
  timeoutMs: number = 300000
): Promise<GLMResult> {
  const startTime = Date.now();

  // Escape double quotes in task for shell
  const escapedTask = task.replace(/"/g, '\\"');

  return new Promise((resolve, reject) => {
    const proc = spawn(
      `cd "${workingDirectory}" && opencode run -m zai-coding-plan/glm-4.7 --title glm-task "${escapedTask}" </dev/null`,
      {
        shell: true,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      proc.kill();
      if (stdout.length > 0) {
        const duration = Date.now() - startTime;
        resolve({ output: stdout, duration });
      } else {
        reject(new Error(`GLM execution timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      const duration = Date.now() - startTime;
      if (code === 0 || stdout.length > 0) {
        resolve({ output: stdout || "Task completed", duration });
      } else {
        reject(new Error(`GLM exited with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
