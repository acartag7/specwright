import { execSync } from "child_process";

export async function getProjectFiles(dir: string): Promise<string[]> {
  try {
    const result = execSync(
      `find "${dir}" -type f -name "*.ts" -o -name "*.tsx" -o -name "*.json" 2>/dev/null | grep -v node_modules | grep -v .next | head -50`,
      { encoding: "utf-8" }
    );
    return result.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}
