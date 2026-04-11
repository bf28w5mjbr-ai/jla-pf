/**
 * API ルートの catch で NextResponse.json(..., { status: 500 }) を
 * jsonInternalError500 に置換する（ワンショット用）。
 * 実行: node scripts/apply-json-internal-error-500.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "../src/app/api");

function walkDir(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walkDir(p, acc);
    else if (name === "route.ts") acc.push(p);
  }
  return acc;
}

/** catch の直前にある export async function の HTTP メソッド */
function methodBeforeCatch(content, catchStart) {
  const head = content.slice(0, catchStart);
  const re =
    /export async function (GET|POST|PUT|PATCH|DELETE)\b/g;
  let m;
  let last = null;
  while ((m = re.exec(head)) !== null) last = m[1];
  return last ?? "HANDLER";
}

function apiRel(file) {
  return path.relative(apiRoot, file).replace(/\\/g, "/");
}

/**
 * catch (id) { ... return NextResponse.json( ..., { status: 500 } ); }
 * のブロックを置換。ネストした catch は未対応。
 */
function replaceCatchBlocks(content, file) {
  const rel = apiRel(file);
  let out = "";
  let i = 0;
  const len = content.length;

  while (i < len) {
    const catchIdx = content.indexOf("} catch (", i);
    if (catchIdx === -1) {
      out += content.slice(i);
      break;
    }
    out += content.slice(i, catchIdx);

    const openParen = catchIdx + "} catch (".length;
    const closeParen = content.indexOf(")", openParen);
    if (closeParen === -1) {
      out += content.slice(catchIdx);
      break;
    }
    const errVar = content.slice(openParen, closeParen).trim();

    const braceOpen = content.indexOf("{", closeParen);
    if (braceOpen === -1) {
      out += content.slice(catchIdx);
      break;
    }

    let depth = 0;
    let j = braceOpen;
    for (; j < len; j++) {
      const c = content[j];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    const blockBody = content.slice(braceOpen + 1, j - 1);
    const blockFull = content.slice(catchIdx, j);

    const has500 =
      /status:\s*500/.test(blockBody) &&
      /NextResponse\.json/.test(blockBody);

    if (!has500) {
      out += blockFull;
      i = j;
      continue;
    }

    // 分岐がある catch は手動対応（置換で if 枝が消えるのを防ぐ）
    if (
      /\bif\s*\(/.test(blockBody) ||
      /\bswitch\s*\(/.test(blockBody) ||
      /\btry\s*\{/.test(blockBody)
    ) {
      out += blockFull;
      i = j;
      continue;
    }

    const method = methodBeforeCatch(content, catchIdx);
    const ctx = `${method} api/${rel}`;

    const trimmed = blockBody.trim();

    // 既に jsonInternalError500 のみ → スキップ
    if (/^return jsonInternalError500\(/s.test(trimmed)) {
      out += blockFull;
      i = j;
      continue;
    }

    // Stripe: 設定不備など例外でない 500
    if (
      rel.includes("webhooks/stripe") &&
      /STRIPE_WEBHOOK_SECRET/.test(blockBody) &&
      !/catch/.test(blockBody)
    ) {
      out += blockFull;
      i = j;
      continue;
    }

    const replacement = `} catch (${errVar}) {\n    return jsonInternalError500(${JSON.stringify(
      ctx
    )}, ${errVar});\n  }`;

    out += replacement;
    i = j;
  }

  return out;
}

function ensureImport(content) {
  if (!content.includes("jsonInternalError500")) return content;
  if (/from ["']@\/lib\/apiInternalError["']/.test(content)) return content;

  const firstImport = content.indexOf("import ");
  if (firstImport === -1) {
    return `import { jsonInternalError500 } from "@/lib/apiInternalError";\n\n${content}`;
  }
  const lineStart = content.lastIndexOf("\n", firstImport - 1) + 1;
  const before = content.slice(0, lineStart);
  const after = content.slice(lineStart);
  return `${before}import { jsonInternalError500 } from "@/lib/apiInternalError";\n${after}`;
}

const files = walkDir(apiRoot);
let changed = 0;
for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  if (!content.includes("status: 500") && !content.includes("status:500"))
    continue;

  const next = replaceCatchBlocks(content, file);
  if (next === content) continue;

  let merged = ensureImport(next);
  // import が二重になった場合は除去
  merged = merged.replace(
    /import \{ jsonInternalError500 \} from "@\/lib\/apiInternalError";\nimport \{ jsonInternalError500 \} from "@\/lib\/apiInternalError";\n/g,
    'import { jsonInternalError500 } from "@/lib/apiInternalError";\n'
  );

  fs.writeFileSync(file, merged);
  changed++;
  console.log("updated:", path.relative(process.cwd(), file));
}

console.log("done, files changed:", changed);
