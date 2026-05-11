/**
 * CLI スクリプト用: Node の --env-file はファイル必須のため、
 * `.env` のあと `.env.local`（存在する方だけ）を読み、後から読んだ方が上書きする。
 * 各スクリプトの先頭で `import "./loadScriptEnv"` すること。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFromFile(absPath: string) {
  if (!existsSync(absPath)) return;
  const content = readFileSync(absPath, "utf8");
  for (let raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

const root = process.cwd();
loadEnvFromFile(resolve(root, ".env"));
loadEnvFromFile(resolve(root, ".env.local"));
