// 주간 해운·항공 시황 브리핑 — 수집 → 누적 → 렌더 → 발행
//
// 설계 §7.1·§7.2: 블록별로 독립 실패한다. 지수가 하나라도 잡히면 정상 발행하고,
// 4종이 전멸한 경우에만 경고 배너를 띄운다. 어느 경우에도 지난주 숫자로 채우지 않는다.
// 이미 발행된 보관본은 절대 덮어쓰지 않는다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { fetchIndices as realFetchIndices, LANES } from "./lib/indices.mjs";
import { collectHeadlines as realCollectHeadlines } from "./lib/feeds.mjs";
import { collectAir as realCollectAir } from "./lib/airIndex.mjs";
import { summarizeAll as realSummarizeAll } from "./lib/summarize.mjs";
import { readHistory, upsertWeek, writeHistory, seriesOf } from "./lib/history.mjs";
import { renderPage } from "./lib/render.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEWS_LIMIT = 5;

/** ISO 주차 문자열 "2026-W47" */
export function isoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;          // 월=1 … 일=7
  d.setUTCDate(d.getUTCDate() + 4 - day);  // 그 주의 목요일
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const no = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(no).padStart(2, "0")}`;
}

/** 사람이 읽는 주차 표기 "2026년 11월 3주" */
export function weekLabel(date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const nth = Math.ceil(date.getUTCDate() / 7);
  return `${y}년 ${m}월 ${nth}주`;
}

const CORE = ["SCFI", "CCFI", "KCCI", "BDI"];

/**
 * 한 주치 데이터를 모은다. 수집 함수는 deps로 주입해 테스트에서 대체할 수 있다.
 * @param {{now:Date, deps?:object, history?:object}} opts
 */
export async function buildWeek({ now = new Date(), deps = {}, history = { weeks: [] } } = {}) {
  const {
    fetchIndices = realFetchIndices,
    collectHeadlines = realCollectHeadlines,
    collectAir = realCollectAir,
    summarizeAll = realSummarizeAll,
  } = deps;

  const pending = [];
  const week = isoWeek(now);

  // ── 1. 해상 지수 ────────────────────────────────────────
  let idx = { indices: {}, lanes: {}, series: [], errors: [] };
  try {
    idx = await fetchIndices({});
  } catch (e) {
    pending.push({ field: "해상 지수", reason: `수집 실패 (${e.message})` });
  }
  for (const e of idx.errors ?? []) pending.push({ field: e.source, reason: e.message });
  for (const name of CORE) {
    if (!Number.isFinite(idx.indices?.[name]?.value)) {
      pending.push({ field: name, reason: "출처에서 값을 찾지 못했습니다" });
    }
  }
  for (const lane of LANES) {
    if (!Number.isFinite(idx.lanes?.[lane]?.changePct)) {
      pending.push({ field: `항로 ${lane}`, reason: "KCCI 표에서 값을 찾지 못했습니다" });
    }
  }

  // ── 2. 뉴스 ────────────────────────────────────────────
  let articles = [];
  try {
    const sinceMs = now.getTime() - 7 * 86400000;
    const res = await collectHeadlines({ sinceMs, perFeedLimit: 8, totalLimit: 30 });
    articles = res.items ?? [];
    for (const e of res.errors ?? []) pending.push({ field: `뉴스 ${e.feed}`, reason: e.message });
  } catch (e) {
    pending.push({ field: "뉴스 수집", reason: e.message });
  }
  articles = articles.map((a, i) => ({ ...a, no: i + 1 }));

  // ── 3. 항공 BAI (기사 선별은 AI, 숫자는 본문에서) ───────
  let air = { BAI00: {}, BAI30: {}, BAI80: {}, sourceUrl: null, note: null };
  try {
    air = await collectAir(articles, { fetchText: fetchArticleText });
  } catch (e) {
    air = { ...air, note: `항공 수치 수집 실패 (${e.message})` };
  }
  if (air.note) pending.push({ field: "항공 BAI", reason: air.note });

  // ── 4. 뉴스 한 줄 요약 ──────────────────────────────────
  let summarized = articles;
  if (articles.length) {
    try {
      const res = await summarizeAll(articles);
      summarized = res.items ?? articles;
      if (res.failed) pending.push({ field: "뉴스 요약", reason: `${res.failed}건 요약 실패 (제목만 표시)` });
    } catch (e) {
      pending.push({ field: "뉴스 요약", reason: `${e.message} — 제목만 표시합니다` });
    }
  }

  const isAir = (a) => /항공/.test(a.topic ?? "") || /항공|air\s*cargo|airfreight/i.test(a.title ?? "");
  const sea = summarized.filter((a) => !isAir(a)).slice(0, 3);
  const airNews = summarized.filter(isAir).slice(0, NEWS_LIMIT - sea.length);
  const news = [...sea, ...airNews].map((a) => ({
    no: a.no,
    title: a.title,
    link: a.link,
    summary: a.summary && a.summary !== "[확인 필요]" ? a.summary : a.title,
    category: isAir(a) ? "항공" : "해운",
  }));

  // ── 5. 누적 (지난주 값으로 채우지 않는다) ────────────────
  const record = {
    week,
    indices: Object.fromEntries(
      CORE.map((n) => [n, idx.indices?.[n] ?? { value: null, changePct: null, asOf: null }])
    ),
  };
  const nextHistory = upsertWeek(history, record);

  const degraded = CORE.every((n) => !Number.isFinite(idx.indices?.[n]?.value));

  const data = {
    week,
    weekLabel: weekLabel(now),
    generatedAt: new Date(now).toISOString().slice(0, 16).replace("T", " ") + " UTC",
    indices: record.indices,
    lanes: Object.fromEntries(LANES.map((l) => [l, idx.lanes?.[l] ?? { value: null, changePct: null, asOf: null }])),
    series: idx.series ?? [],
    scfiPoints: seriesOf(nextHistory, "SCFI"),
    bdiPoints: seriesOf(nextHistory, "BDI"),
    air: { ...air, asOf: air.asOf ?? null },
    news,
    allArticles: summarized.map((a) => ({ no: a.no, title: a.title, link: a.link, outlet: a.outlet })),
    pending,
    degraded,
  };

  return { data, degraded, pending, history: nextHistory, week };
}

/** 기사 본문을 평문으로 받아온다. 실패는 호출 쪽에서 처리한다. */
async function fetchArticleText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) WeeklyBrief/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

/**
 * 최신 페이지는 항상 갱신하고, 보관본은 없을 때만 쓴다. (설계 §7.2)
 * @returns {{archiveWritten:boolean, indexPath:string, archivePath:string}}
 */
export function publish({ outDir, week, html }) {
  fs.mkdirSync(path.join(outDir, "archive"), { recursive: true });
  const indexPath = path.join(outDir, "index.html");
  const archivePath = path.join(outDir, "archive", `${week}.html`);

  fs.writeFileSync(indexPath, html, "utf8");

  let archiveWritten = false;
  if (!fs.existsSync(archivePath)) {
    fs.writeFileSync(archivePath, html, "utf8");
    archiveWritten = true;
  }
  return { archiveWritten, indexPath, archivePath };
}

// ── CLI ──────────────────────────────────────────────────
function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function main() {
  const outDir = path.resolve(arg("out", path.join(HERE, "public")));
  const historyPath = path.join(HERE, "data", "history.json");
  const now = new Date();

  console.log("[1/3] 수집 중…");
  const history = readHistory(historyPath);
  const { data, degraded, pending, history: next, week } = await buildWeek({ now, history });

  console.log(`      지수 ${degraded ? "전멸" : "수집됨"} · 기사 ${data.allArticles.length}건 · [확인 필요] ${pending.length}건`);

  console.log("[2/3] 렌더 중…");
  const html = renderPage(data);

  console.log("[3/3] 저장 중…");
  writeHistory(historyPath, next);
  const res = publish({ outDir, week, html });

  console.log(`\n완료: ${res.indexPath}`);
  console.log(`보관본: ${res.archivePath}${res.archiveWritten ? "" : " (이미 있어 건너뜀)"}`);
  if (pending.length) {
    console.log(`\n[확인 필요] ${pending.length}건:`);
    for (const p of pending.slice(0, 12)) console.log(`  · ${p.field} — ${p.reason}`);
    if (pending.length > 12) console.log(`  · 외 ${pending.length - 12}건`);
  }
}

// 윈도우 경로(드라이브 문자·한글·공백)에서도 맞도록 pathToFileURL로 비교한다
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("실행 실패:", e.message);
    process.exit(1);
  });
}
