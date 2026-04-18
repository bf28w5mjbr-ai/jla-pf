#!/usr/bin/env node
/**
 * HTML 等の応答について、curl の time_starttransfer を TTFB として計測する。
 *
 * 使い方:
 *   BASE_URL=https://bluvium.jp node scripts/measure-ttfb.mjs / /login
 *   BASE_URL=http://localhost:3000 node scripts/measure-ttfb.mjs -n 5 --warmup 1 /competitions/<id> /competitions/<id>?tab=start-list
 *
 * 環境変数:
 *   BASE_URL / E2E_BASE_URL — 先頭のスラッシュまで含めない（末尾スラッシュは自動除去）
 *   CURL_EXTRA_ARGS — curl に追加で渡す引数（JSON 配列文字列。例: '["-H","Cookie: session=..."]'）
 */

import { spawnSync } from "node:child_process";

const base = (process.env.BASE_URL || process.env.E2E_BASE_URL || "https://bluvium.jp").replace(
  /\/$/,
  ""
);

function parseArgs(argv) {
  const paths = [];
  let iterations = 3;
  let warmup = 0;
  /** pnpm/npm が `script -- flags` の区切りとして渡す `--` を捨てる */
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-h" || a === "--help") {
      return { help: true, paths, iterations, warmup };
    }
    if (a === "-n" || a === "--iterations") {
      iterations = Math.max(1, Number(args[++i]) || 3);
      continue;
    }
    if (a === "--warmup") {
      warmup = Math.max(0, Number(args[++i]) || 0);
      continue;
    }
    paths.push(a);
  }
  return { help: false, paths, iterations, warmup };
}

function formatMs(sec) {
  if (!Number.isFinite(sec)) return "—";
  return `${(sec * 1000).toFixed(1)} ms`;
}

function mean(nums) {
  if (nums.length === 0) return NaN;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function extraCurlArgsFromEnv() {
  const raw = process.env.CURL_EXTRA_ARGS;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) {
      throw new Error("not a string[]");
    }
    return parsed;
  } catch {
    console.error(
      "環境変数 CURL_EXTRA_ARGS は JSON の文字列配列である必要があります（例: '[\"-H\",\"Cookie: a=b\"]'）。無視します。"
    );
    return [];
  }
}

function curlTtfbOnce(url) {
  const extra = extraCurlArgsFromEnv();
  const args = [
    ...extra,
    "-sS",
    "-L",
    "-o",
    "/dev/null",
    "-w",
    "%{http_code}\t%{time_namelookup}\t%{time_connect}\t%{time_appconnect}\t%{time_pretransfer}\t%{time_starttransfer}\t%{time_total}\n",
    url,
  ];
  const r = spawnSync("curl", args, { encoding: "utf8" });
  if (r.error) {
    throw r.error;
  }
  if (r.status !== 0) {
    throw new Error(r.stderr || `curl exited ${r.status}`);
  }
  const line = r.stdout.trim().split("\n").pop();
  const parts = line.split("\t");
  if (parts.length < 7) {
    throw new Error(`unexpected curl -w output: ${JSON.stringify(r.stdout)}`);
  }
  const [
    httpCode,
    timeNamelookup,
    timeConnect,
    timeAppconnect,
    timePretransfer,
    timeStarttransfer,
    timeTotal,
  ] = parts.map((x) => Number(x));
  return {
    httpCode,
    timeNamelookup,
    timeConnect,
    timeAppconnect,
    timePretransfer,
    timeStarttransfer,
    timeTotal,
  };
}

function measurePath(path, iterations, warmup) {
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  for (let i = 0; i < warmup; i++) {
    curlTtfbOnce(url);
  }
  const ttfb = [];
  const total = [];
  let last;
  for (let i = 0; i < iterations; i++) {
    last = curlTtfbOnce(url);
    ttfb.push(last.timeStarttransfer);
    total.push(last.timeTotal);
  }
  return { url, last, ttfb, total };
}

function main() {
  const { help, paths: rawPaths, iterations, warmup } = parseArgs(process.argv.slice(2));
  if (help) {
    console.log(`measure-ttfb — TTFB (curl time_starttransfer)

BASE_URL を付けてパスを列挙:

  BASE_URL=https://bluvium.jp node scripts/measure-ttfb.mjs / /login

繰り返し（既定 3）とウォームアップ:

  node scripts/measure-ttfb.mjs -n 5 --warmup 1 /competitions/<id> /competitions/<id>?tab=start-list

Cookie 等を付ける（JSON 配列）:

  CURL_EXTRA_ARGS='["-H","Cookie: session=..."]' node scripts/measure-ttfb.mjs /dashboard
`);
    return;
  }

  const paths =
    rawPaths.length > 0
      ? rawPaths
      : ["/", "/login", "/api/health/live"];

  console.log(`Base: ${base}`);
  console.log(`Iterations: ${iterations}${warmup ? `, warmup: ${warmup}` : ""}\n`);

  for (const p of paths) {
    try {
      const { url, last, ttfb, total } = measurePath(p, iterations, warmup);
      const tMin = Math.min(...ttfb);
      const tMax = Math.max(...ttfb);
      const tAvg = mean(ttfb);
      const totAvg = mean(total);
      console.log(`${url}`);
      console.log(
        `  HTTP ${last.httpCode}  TTFB min/avg/max: ${formatMs(tMin)} / ${formatMs(tAvg)} / ${formatMs(tMax)}  total avg: ${formatMs(totAvg)}`
      );
      console.log(
        `  last breakdown: DNS ${formatMs(last.timeNamelookup)}  connect ${formatMs(last.timeConnect)}  TLS ${formatMs(last.timeAppconnect)}  pretransfer ${formatMs(last.timePretransfer)}  TTFB ${formatMs(last.timeStarttransfer)}  total ${formatMs(last.timeTotal)}`
      );
      console.log("");
    } catch (e) {
      console.error(`${p}: ${e instanceof Error ? e.message : String(e)}\n`);
      process.exitCode = 1;
    }
  }
}

main();
