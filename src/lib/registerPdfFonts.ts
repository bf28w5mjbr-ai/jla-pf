import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Font } from "@react-pdf/renderer";

let registered = false;

const require = createRequire(import.meta.url);

/** @react-pdf/font は src にファイルパス（文字列）を期待する。Buffer は不可。 */
function resolveNotoWoffPath(filename: string): string {
  const candidates: string[] = [];
  try {
    const resolver = (
      import.meta as ImportMeta & { resolve?: (specifier: string, parent?: string) => string }
    ).resolve;
    if (typeof resolver === "function") {
      const resolved = resolver.call(import.meta, "@fontsource/noto-sans-jp/package.json");
      if (typeof resolved === "string" && resolved.startsWith("file:")) {
        candidates.push(path.join(path.dirname(fileURLToPath(resolved)), "files", filename));
      }
    }
  } catch {
    // import.meta.resolve 非対応・解決失敗
  }
  try {
    const pkgJson = require.resolve("@fontsource/noto-sans-jp/package.json");
    candidates.push(path.join(path.dirname(pkgJson), "files", filename));
  } catch {
    // パッケージ解決不可（極端なバンドル構成）
  }
  // Turbopack が require.resolve を壊すケースへのフォールバック
  candidates.push(
    path.join(process.cwd(), "node_modules", "@fontsource", "noto-sans-jp", "files", filename)
  );

  const abs = candidates.find((p) => existsSync(p));
  if (!abs) {
    const msg =
      "PDF用フォントが見つかりません。試したパス:\n" +
      candidates.join("\n") +
      "\npnpm install を実行し、パッケージ @fontsource/noto-sans-jp が入っているか確認してください。";
    throw new Error(msg);
  }
  return abs;
}

/**
 * Helvetica は日本語グリフを持たないため、@react-pdf/renderer で日本語 PDF を出す前に必ず呼ぶ。
 * @fontsource/noto-sans-jp の japanese サブセット WOFF を利用（約1.5MB×2）。
 */
export function registerPdfJapaneseFonts(): void {
  if (registered) return;

  Font.register({
    family: "NotoSansJP",
    fonts: [
      { src: resolveNotoWoffPath("noto-sans-jp-japanese-400-normal.woff"), fontWeight: 400 },
      { src: resolveNotoWoffPath("noto-sans-jp-japanese-700-normal.woff"), fontWeight: 700 },
    ],
  });

  registered = true;
}
