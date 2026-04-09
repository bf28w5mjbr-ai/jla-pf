export type LogoImageAnalysis = {
  /** ライトUI向けの背景 */
  softTintLight: string | null;
  /** ダークUI向けの背景 */
  softTintDark: string | null;
  /** 透過が多いとき枠を外して見栄えを優先 */
  prefersFrameless: boolean;
  /**
   * 枠に対するロゴ周りの余白（CSS。小枠でも最低 px、大枠では最大まで伸ばす）
   */
  insetPadding: string;
};

/** sRGB 0–255 の簡易相対輝度 0..1 */
function luminance255(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

const INSET_FRAMELESS = "clamp(0.5rem, 11%, 1.05rem)";
const INSET_FRAMED = "clamp(0.35rem, 8%, 0.85rem)";

/**
 * 縮小した ImageData から透過率・主色・明暗を推定し、背景と余白を決める。
 */
export function analyzeLogoImageData(imageData: ImageData): LogoImageAnalysis {
  const { data, width, height } = imageData;
  const total = width * height;
  let transparent = 0;
  let sr = 0,
    sg = 0,
    sb = 0,
    count = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 20) {
      transparent++;
      continue;
    }
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 252 && g > 252 && b > 252) continue;
    sr += r;
    sg += g;
    sb += b;
    count++;
  }

  const transparentRatio = transparent / total;
  const prefersFrameless = transparentRatio > 0.1;
  const insetPadding = prefersFrameless ? INSET_FRAMELESS : INSET_FRAMED;

  if (count === 0) {
    return {
      softTintLight: null,
      softTintDark: null,
      prefersFrameless,
      insetPadding,
    };
  }

  const r = Math.round(sr / count);
  const g = Math.round(sg / count);
  const b = Math.round(sb / count);
  const L = luminance255(r, g, b);
  const isDarkLogo = L < 0.44;
  const isLightLogo = L > 0.78;

  // 黒系・暗色の透過ロゴ → 白〜極薄グレーの台（コントラスト確保）
  if (prefersFrameless && isDarkLogo) {
    return {
      softTintLight: "rgb(255 255 255 / 0.96)",
      softTintDark: "rgb(248 250 252 / 0.94)",
      prefersFrameless: true,
      insetPadding: INSET_FRAMELESS,
    };
  }

  // 白〜極薄の透過ロゴ → やや暗いニュートラル（ダークモードではしっかりめ）
  if (prefersFrameless && isLightLogo) {
    return {
      softTintLight: "rgb(15 23 42 / 0.06)",
      softTintDark: "rgb(15 23 42 / 0.42)",
      prefersFrameless: true,
      insetPadding: INSET_FRAMELESS,
    };
  }

  // 透過だが中間トーン → 主色のうすい染め
  if (prefersFrameless) {
    return {
      softTintLight: `rgba(${r},${g},${b},0.12)`,
      softTintDark: `rgba(${r},${g},${b},0.22)`,
      prefersFrameless: true,
      insetPadding: INSET_FRAMELESS,
    };
  }

  // ほぼ不透明：暗いロゴは白系キャンバス、それ以外は主色タント
  if (isDarkLogo) {
    return {
      softTintLight: "rgb(250 250 250 / 1)",
      softTintDark: "rgb(241 245 249 / 0.92)",
      prefersFrameless: false,
      insetPadding: INSET_FRAMED,
    };
  }

  return {
    softTintLight: `rgba(${r},${g},${b},0.14)`,
    softTintDark: `rgba(${r},${g},${b},0.24)`,
    prefersFrameless: false,
    insetPadding: INSET_FRAMED,
  };
}

const MAX_ANALYZE = 56;

export function analyzeLogoFromHtmlImage(img: HTMLImageElement): LogoImageAnalysis | null {
  if (!img.naturalWidth || !img.naturalHeight) return null;

  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const scale = Math.min(1, MAX_ANALYZE / Math.max(nw, nh));
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);
    return analyzeLogoImageData(imageData);
  } catch {
    return null;
  }
}

/** CORS で解析できないときの弱いヒューリスティック */
export function logoUrlLooksLikelyVectorOrTransparent(url: string): boolean {
  const u = url.split("?")[0]?.toLowerCase() ?? "";
  return u.endsWith(".svg") || u.endsWith(".png") || u.includes(".svg");
}

/** フォールバック解析（ピクセル不可時）。透過っぽいURLは枠なし＋白系寄りの中間背景 */
export function fallbackLogoAnalysisForUrl(url: string): LogoImageAnalysis {
  const guess = logoUrlLooksLikelyVectorOrTransparent(url);
  if (guess) {
    return {
      softTintLight: "rgb(255 255 255 / 0.92)",
      softTintDark: "rgb(248 250 252 / 0.88)",
      prefersFrameless: true,
      insetPadding: INSET_FRAMELESS,
    };
  }
  return {
    softTintLight: null,
    softTintDark: null,
    prefersFrameless: false,
    insetPadding: INSET_FRAMED,
  };
}
