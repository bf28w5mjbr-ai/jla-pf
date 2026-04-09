import { existsSync } from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

/** @react-pdf/font は src にファイルパス（文字列）を期待する。Buffer は不可。 */
function resolveNotoWoffPath(filename: string): string {
  // Turbopack が require.resolve を [project]/... のまま残すことがあるため process.cwd() で組み立てる。
  const abs = path.join(
    process.cwd(),
    "node_modules",
    "@fontsource",
    "noto-sans-jp",
    "files",
    filename
  );
  if (!existsSync(abs)) {
    const msg =
      "PDF用フォントが見つかりません: " +
      abs +
      "\n" +
      "pnpm install を実行し、パッケージ @fontsource/noto-sans-jp が入っているか確認してください。";
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
