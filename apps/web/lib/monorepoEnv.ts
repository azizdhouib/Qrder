import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

let didLoad = false;

function addEnvPaths(out: string[], dir: string) {
  out.push(path.join(dir, ".env"), path.join(dir, ".env.local"));
}

export function loadMonorepoEnv(): void {
  if (didLoad) return;
  didLoad = true;

  const candidates: string[] = [];

  try {
    const libDir = path.dirname(fileURLToPath(import.meta.url));
    const webRoot = path.join(libDir, "..");
    const monorepoRoot = path.join(webRoot, "..", "..");
    addEnvPaths(candidates, monorepoRoot);
    addEnvPaths(candidates, webRoot);
  } catch {
    /* import.meta.url indisponible */
  }

  const cwd = process.cwd();
  addEnvPaths(candidates, cwd);
  addEnvPaths(candidates, path.join(cwd, ".."));
  addEnvPaths(candidates, path.join(cwd, "apps", "web"));
  addEnvPaths(candidates, path.join(cwd, "..", ".."));

  const seen = new Set<string>();
  for (const p of candidates) {
    const norm = path.normalize(p);
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (existsSync(norm)) {
      config({ path: norm, override: false });
    }
  }
}

loadMonorepoEnv();
