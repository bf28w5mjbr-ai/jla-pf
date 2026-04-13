import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

let registered = false;

const require = createRequire(import.meta.url);

/** @react-pdf/font は src にファイルパス（文字列）を期待する。Buffer は不可。 */
function resolveNotoWoffPath(filename: string): string {
  // process.cwd() 依存だとサーバーの作業ディレクトリがアプリルートでないと 500 になる。
  // パッケージ解決で @fontsource/noto-sans-jp の実体へ常に辿る。
  let pkgRoot: string;
  try {
    pkgRoot = path.dirname(require.resolve("@fontsource/noto-sans-jp/package.json"));
  } catch {
    throw new Error(
      "PDF用フォントパッケージが解決できません。@fontsource/noto-sans-jp が dependencies に含まれているか確認してください。"
    );
  }
  const abs = path.join(pkgRoot, "files", filename);
  if (!existsSync(abs)) {
    throw new Error(
      "PDF用フォントが見つかりません: " +
        abs +
        "\n" +
        "pnpm install を実行し、パッケージ @fontsource/noto-sans-jp が入っているか確認してください。"
    );
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
