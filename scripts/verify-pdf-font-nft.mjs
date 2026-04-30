#!/usr/bin/env node
/**
 * `pnpm build` 後に、領収書／請求 PDF ルートの output file trace に
 * registerPdfJapaneseFonts が参照する Noto japanese サブセット WOFF が含まれるか検証する。
 * next.config の outputFileTracingIncludes キー（動的セグメントの picomatch）の退行を検知する。
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** リポジトリルート（本ファイルは scripts/ 直下） */
const projectRoot = path.join(path.dirname(fileURLToPath(new URL(import.meta.url))), "..");

const REQUIRED_SUBSTRINGS = [
  "noto-sans-jp-japanese-400-normal.woff",
  "noto-sans-jp-japanese-700-normal.woff",
];

const NFT_REL_PATHS = [
  ".next/server/app/api/entries/[entryId]/receipt/route.js.nft.json",
  ".next/server/app/api/competitions/[id]/team-billing/receipt/route.js.nft.json",
  ".next/server/app/api/clubs/[clubId]/dues/[duesId]/receipt/route.js.nft.json",
  ".next/server/app/api/clubs/[clubId]/dues/[duesId]/invoice/route.js.nft.json",
];

function main() {
  let failed = false;
  for (const rel of NFT_REL_PATHS) {
    const abs = path.join(projectRoot, rel);
    if (!existsSync(abs)) {
      console.error(`verify-pdf-font-nft: 見つかりません（先に pnpm build を実行）: ${rel}`);
      failed = true;
      continue;
    }
    const raw = readFileSync(abs, "utf8");
    const missing = REQUIRED_SUBSTRINGS.filter((s) => !raw.includes(s));
    if (missing.length > 0) {
      console.error(`verify-pdf-font-nft: ${rel} に次が含まれません: ${missing.join(", ")}`);
      failed = true;
    } else {
      console.log(`verify-pdf-font-nft: OK ${rel}`);
    }
  }
  if (failed) {
    console.error(
      "verify-pdf-font-nft: 失敗。next.config.ts の outputFileTracingIncludes キー（\\[param\\] エスケープ）を確認してください。"
    );
    process.exit(1);
  }
}

main();
