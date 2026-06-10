import {
  DEFAULT_PROFILE_PHOTO_SUBJECT,
  normalizeProfilePhotoSubjectRegion,
  type ProfilePhotoSubjectRegion,
} from "./profilePhotoSubject";

const GRID = 10;
const SCORE_PERCENTILE = 0.55;

function skinScore(r: number, g: number, b: number): number {
  if (r < 60 || g < 40 || b < 30) return 0;
  if (r <= g || g <= b) return 0;
  const rg = r - g;
  const rb = r - b;
  if (rg < 12 || rb < 15) return 0;
  return Math.min(1, (rg + rb) / 120);
}

/**
 * RGBA バッファから被写体らしい領域を推定する（ブラウザ・サーバー共通）。
 */
export function detectSubjectRegionFromRgba(
  width: number,
  height: number,
  data: Uint8ClampedArray | Uint8Array
): ProfilePhotoSubjectRegion {
  if (width <= 0 || height <= 0 || data.length < width * height * 4) {
    return DEFAULT_PROFILE_PHOTO_SUBJECT;
  }

  const cellW = width / GRID;
  const cellH = height / GRID;
  const scores: number[] = [];
  const cells: Array<{ col: number; row: number; score: number }> = [];

  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      const x0 = Math.floor(col * cellW);
      const y0 = Math.floor(row * cellH);
      const x1 = Math.min(width, Math.floor((col + 1) * cellW));
      const y1 = Math.min(height, Math.floor((row + 1) * cellH));

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumLum = 0;
      let sumLumSq = 0;
      let sumSkin = 0;
      let count = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const lum = 0.299 * r + 0.587 * g + 0.114 * b;
          sumR += r;
          sumG += g;
          sumB += b;
          sumLum += lum;
          sumLumSq += lum * lum;
          sumSkin += skinScore(r, g, b);
          count++;
        }
      }

      if (count === 0) continue;

      const meanLum = sumLum / count;
      const variance = Math.max(0, sumLumSq / count - meanLum * meanLum);
      const contrast = Math.sqrt(variance) / 128;
      const avgSkin = sumSkin / count;
      const cx = (col + 0.5) / GRID - 0.5;
      const cy = (row + 0.5) / GRID - 0.5;
      const centerWeight = 1 - Math.min(1, Math.hypot(cx, cy) * 1.1);
      const avgR = sumR / count;
      const avgG = sumG / count;
      const avgB = sumB / count;
      const saturation = (Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB)) / 255;

      const score =
        contrast * 1.8 + avgSkin * 2.4 + centerWeight * 0.9 + saturation * 0.6;
      scores.push(score);
      cells.push({ col, row, score });
    }
  }

  if (scores.length === 0) return DEFAULT_PROFILE_PHOTO_SUBJECT;

  const sorted = [...scores].sort((a, b) => a - b);
  const threshold =
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * SCORE_PERCENTILE))] ??
    0;

  const active = cells.filter((c) => c.score >= threshold);
  if (active.length === 0) return DEFAULT_PROFILE_PHOTO_SUBJECT;

  let minCol = GRID;
  let minRow = GRID;
  let maxCol = 0;
  let maxRow = 0;
  for (const cell of active) {
    minCol = Math.min(minCol, cell.col);
    minRow = Math.min(minRow, cell.row);
    maxCol = Math.max(maxCol, cell.col);
    maxRow = Math.max(maxRow, cell.row);
  }

  const padCol = 0.35;
  const padRow = 0.35;
  const x0 = Math.max(0, (minCol - padCol) / GRID);
  const y0 = Math.max(0, (minRow - padRow) / GRID);
  const x1 = Math.min(1, (maxCol + 1 + padCol) / GRID);
  const y1 = Math.min(1, (maxRow + 1 + padRow) / GRID);

  const region = normalizeProfilePhotoSubjectRegion({
    x: x0,
    y: y0,
    width: x1 - x0,
    height: y1 - y0,
  });

  return region ?? DEFAULT_PROFILE_PHOTO_SUBJECT;
}
