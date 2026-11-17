// A4 1장 HTML 렌더 — 설계 §6 + 시네마틱 모션 (사용자 요청 2026-11-17)
//
// 화면: 다크 시네마틱. 진입 리빌 · 숫자 카운트업 · 선 드로잉 · 막대 성장 · 호버 마이크로인터랙션.
// 인쇄: 효과를 전부 끄고 흑백 A4 1쪽. 두 모드가 같은 마크업을 공유한다.
// 규칙: 회사명 비표기 / 수치에 기준일 병기 / 없으면 [확인 필요]+사유 / 외부 리소스 0건.
import { lineChart, barChart, esc } from "./svg.mjs";

const LANES = ["미주서안", "미주동안", "유럽", "동남아", "일본", "중국"];
const TBD = '<span class="tbd">[확인 필요]</span>';

const fmt = (v) => (Number.isFinite(v) ? v.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) : null);

function pct(v) {
  if (!Number.isFinite(v)) return TBD;
  const cls = v > 0 ? "up" : v < 0 ? "down" : "flat";
  const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "─";
  return `<span class="chg ${cls}">${arrow}${Math.abs(v).toFixed(2)}%</span>`;
}

function card(name, v, i, { suffix = "" } = {}) {
  const value = fmt(v?.value);
  const raw = Number.isFinite(v?.value) ? v.value : "";
  const dec = Number.isFinite(v?.value) && !Number.isInteger(v.value) ? 2 : 0;
  return `<article class="card reveal" style="--i:${i}">
      <div class="card-name">${esc(name)}${suffix}</div>
      <div class="card-value"${raw !== "" ? ` data-count="${raw}" data-dec="${dec}"` : ""}>${value ?? TBD}</div>
      <div class="card-chg">${pct(v?.changePct)}</div>
      <div class="card-date">${v?.asOf ? esc(v.asOf) : TBD} 기준</div>
      <span class="card-glow" aria-hidden="true"></span>
    </article>`;
}

function pointsFrom(list) {
  return (list ?? []).map((p) => ({ x: p.date ?? p.x, y: p.value ?? p.y })).filter((p) => Number.isFinite(p.y));
}

export function renderPage(data) {
  const d = data ?? {};
  const ind = d.indices ?? {};
  const lanes = d.lanes ?? {};
  const air = d.air ?? {};

  const containerSeries = [
    { label: "KCCI", points: pointsFrom(d.series) },
    { label: "SCFI", points: pointsFrom(d.scfiPoints), dashed: true },
  ].filter((s) => s.points.length);

  const bdiSeries = [{ label: "BDI", points: pointsFrom(d.bdiPoints) }];
  const bars = LANES.map((n) => ({ label: n, value: lanes[n]?.changePct ?? null }));

  // 상단 티커 — 지수를 가로로 흘린다 (물류·금융 화면의 관용 표현)
  const tickerItems = [
    ["SCFI", ind.SCFI],
    ["CCFI", ind.CCFI],
    ["KCCI", ind.KCCI],
    ["BDI", ind.BDI],
    ["BAI", air.BAI00],
  ]
    .map(
      ([n, v]) =>
        `<span class="tk"><b>${esc(n)}</b> ${fmt(v?.value) ?? "—"} ${pct(v?.changePct)}</span>`
    )
    .join("");

  const newsRows = (d.news ?? [])
    .map(
      (n, i) => `<li class="reveal" style="--i:${i}"><span class="cat">${esc(n.category ?? "")}</span>
        <a href="${esc(n.link)}" target="_blank" rel="noopener"><span class="swipe">${esc(n.summary || n.title)}</span></a>
        <span class="ref">[${esc(n.no)}]</span></li>`
    )
    .join("\n");

  const airRow = ["BAI00", "BAI30", "BAI80"]
    .map((code, i) => {
      const v = air[code];
      const label = { BAI00: "글로벌", BAI30: "홍콩발", BAI80: "상하이발" }[code];
      const lvl = fmt(v?.value);
      const raw = Number.isFinite(v?.value) ? v.value : "";
      return `<span class="air-item reveal" style="--i:${i}"><b>${esc(label)}</b><span class="air-val"${
        raw !== "" ? ` data-count="${raw}" data-dec="0"` : ""
      }>${lvl ?? TBD}</span> ${pct(v?.changePct)}</span>`;
    })
    .join("");

  const pendingList = (d.pending ?? []).length
    ? `<ul class="pending">${d.pending.map((p) => `<li><b>${esc(p.field)}</b> — ${esc(p.reason)}</li>`).join("")}</ul>`
    : "";

  const articleList = (d.allArticles ?? [])
    .map(
      (a) =>
        `<li>[${esc(a.no)}] <a href="${esc(a.link)}" target="_blank" rel="noopener">${esc(a.title)}</a> <span class="outlet">${esc(a.outlet ?? "")}</span></li>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>주간 해운·항공 시황 — ${esc(d.weekLabel ?? d.week ?? "")}</title>
<style>
  :root {
    --void: #04100f; --deep: #071d1b; --panel: #0b2724; --edge: #16403b;
    --ink: #eaf4f2; --dim: #8fa9a5; --faint: #5d7a76;
    --amber: #f0b45e; --cyan: #4fd6c0; --up: #ff7a59; --down: #5bb8ff; --tbd: #ff6b6b;
    --sheet-w: 210mm;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; }
  body {
    margin: 0; background: var(--void); color: var(--ink);
    font-family: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", sans-serif;
    font-size: 11px; line-height: 1.45; overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ── 배경: 흐르는 그라데이션 메시 + 드리프트 그리드 ── */
  .bg { position: fixed; inset: -20vmax; z-index: 0; pointer-events: none; }
  .bg::before, .bg::after {
    content: ""; position: absolute; width: 70vmax; height: 70vmax; border-radius: 50%;
    filter: blur(80px); opacity: .5; mix-blend-mode: screen;
  }
  .bg::before { background: radial-gradient(circle, #0e5f55 0%, transparent 65%);
    top: 4%; left: 6%; animation: drift1 24s ease-in-out infinite; }
  .bg::after { background: radial-gradient(circle, #7a4f12 0%, transparent 65%);
    bottom: 2%; right: 4%; animation: drift2 31s ease-in-out infinite; }
  .grid-lines { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: .17;
    background-image: linear-gradient(var(--edge) 1px, transparent 1px),
                      linear-gradient(90deg, var(--edge) 1px, transparent 1px);
    background-size: 46px 46px; animation: slide 22s linear infinite;
    mask-image: radial-gradient(ellipse at 50% 30%, #000 20%, transparent 78%); }
  @keyframes drift1 { 0%,100% { transform: translate3d(0,0,0) scale(1); }
                      50% { transform: translate3d(9vmax,5vmax,0) scale(1.18); } }
  @keyframes drift2 { 0%,100% { transform: translate3d(0,0,0) scale(1.1); }
                      50% { transform: translate3d(-8vmax,-6vmax,0) scale(.92); } }
  @keyframes slide { to { background-position: 46px 46px; } }

  /* ── 커서 글로우 ── */
  .cursor { position: fixed; z-index: 1; width: 340px; height: 340px; border-radius: 50%;
    pointer-events: none; transform: translate3d(-50%,-50%,0); opacity: 0;
    background: radial-gradient(circle, rgba(79,214,192,.13) 0%, transparent 65%);
    transition: opacity .5s ease; }

  /* ── 시트 ── */
  .stage { position: relative; z-index: 2; padding: 26px 16px 48px;
    perspective: 1600px; }
  .page { width: var(--sheet-w); margin: 0 auto; padding: 13mm 11mm 11mm;
    background: linear-gradient(170deg, rgba(11,39,36,.93), rgba(7,29,27,.97));
    border: 1px solid var(--edge); border-radius: 3px;
    box-shadow: 0 40px 90px -30px rgba(0,0,0,.85), 0 0 0 1px rgba(79,214,192,.06) inset;
    animation: sheetIn 1.1s cubic-bezier(.16,.84,.3,1) both;
    backdrop-filter: blur(3px); }
  @keyframes sheetIn {
    from { opacity: 0; transform: translateY(46px) rotateX(9deg) scale(.975); }
    to   { opacity: 1; transform: none; }
  }

  /* ── 헤더 ── */
  header { display: flex; align-items: flex-end; justify-content: space-between;
    gap: 12px; padding-bottom: 9px; border-bottom: 1px solid var(--edge); position: relative; }
  header::after { content: ""; position: absolute; left: 0; bottom: -1px; height: 2px; width: 0;
    background: linear-gradient(90deg, var(--amber), var(--cyan));
    animation: rule 1.5s .5s cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes rule { to { width: 100%; } }
  h1 { font-size: 23px; margin: 0; letter-spacing: -.035em; font-weight: 800; line-height: 1.05; }
  h1 .accent { background: linear-gradient(92deg, var(--amber), var(--cyan));
    -webkit-background-clip: text; background-clip: text; color: transparent; }
  .eyebrow { font-size: 9px; letter-spacing: .34em; color: var(--faint);
    text-transform: uppercase; margin-bottom: 5px; }
  .meta { color: var(--dim); font-size: 9.5px; text-align: right; white-space: nowrap; }

  /* ── 티커 ── */
  .ticker { margin-top: 9px; overflow: hidden; border: 1px solid var(--edge);
    background: rgba(4,16,15,.55); mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent); }
  .ticker-track { display: inline-flex; gap: 30px; padding: 5px 0; white-space: nowrap;
    animation: marquee 26s linear infinite; }
  .ticker:hover .ticker-track { animation-play-state: paused; }
  .tk { font-size: 10px; color: var(--dim); }
  .tk b { color: var(--ink); letter-spacing: .08em; margin-right: 4px; }
  @keyframes marquee { to { transform: translateX(-50%); } }

  .banner { margin: 9px 0 0; padding: 7px 10px; border: 1px solid var(--tbd);
    color: var(--tbd); font-weight: 700; background: rgba(255,107,107,.07);
    animation: pulse 2.6s ease-in-out infinite; }
  @keyframes pulse { 50% { background: rgba(255,107,107,.15); } }

  h2 { font-size: 9.5px; margin: 13px 0 6px; padding-bottom: 4px; color: var(--dim);
    border-bottom: 1px solid var(--edge); letter-spacing: .2em; text-transform: uppercase;
    display: flex; align-items: center; gap: 7px; }
  h2::before { content: ""; width: 5px; height: 5px; background: var(--amber);
    transform: rotate(45deg); flex: none; }

  /* ── 지수 카드 ── */
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .card { position: relative; border: 1px solid var(--edge); padding: 9px 10px;
    background: linear-gradient(160deg, rgba(22,64,59,.4), rgba(7,29,27,.3));
    overflow: hidden; transition: transform .45s cubic-bezier(.2,.8,.2,1), border-color .45s; }
  .card:hover { transform: translateY(-4px); border-color: var(--cyan); }
  .card-glow { position: absolute; inset: 0; opacity: 0; pointer-events: none;
    background: radial-gradient(260px circle at 50% 0%, rgba(79,214,192,.18), transparent 70%);
    transition: opacity .45s; }
  .card:hover .card-glow { opacity: 1; }
  .card-name { font-size: 9px; color: var(--faint); font-weight: 700; letter-spacing: .16em; }
  .card-value { font-size: 25px; font-weight: 800; letter-spacing: -.045em;
    font-variant-numeric: tabular-nums; line-height: 1.12; }
  .card-chg { font-size: 11px; font-weight: 700; }
  .card-date { font-size: 8.5px; color: var(--faint); margin-top: 3px; }
  .chg.up { color: var(--up); } .chg.down { color: var(--down); } .chg.flat { color: var(--dim); }
  .note { font-size: 8.5px; color: var(--faint); margin-top: 5px; line-height: 1.5; }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
  .panel { border: 1px solid var(--edge); padding: 7px 8px 4px;
    background: rgba(4,16,15,.35); transition: border-color .45s; }
  .panel:hover { border-color: var(--cyan); }
  .chart { width: 100%; height: auto; display: block; overflow: visible; }
  .chart .axis { stroke: var(--edge); stroke-width: 1; }
  .chart .line { stroke: var(--cyan); stroke-width: 1.8; stroke-linejoin: round; stroke-linecap: round;
    filter: drop-shadow(0 0 5px rgba(79,214,192,.5));
    stroke-dasharray: 2600; stroke-dashoffset: 2600; }
  .chart .line.s1 { stroke: var(--amber); filter: drop-shadow(0 0 5px rgba(240,180,94,.45)); }
  .in-view .chart .line { animation: draw 1.9s .25s cubic-bezier(.3,.7,.2,1) forwards; }
  .in-view .chart .line.s1 { animation-delay: .55s; }
  @keyframes draw { to { stroke-dashoffset: 0; } }
  .chart .dot { fill: var(--cyan); filter: drop-shadow(0 0 6px rgba(79,214,192,.7)); }
  .in-view .chart .dot { animation: pop .6s .3s cubic-bezier(.2,1.5,.4,1) both; }
  @keyframes pop { from { r: 0; } }
  .chart .tick, .chart .slabel, .chart .blabel, .chart .bval { font-size: 8px; fill: var(--faint); }
  .chart .slabel { fill: var(--cyan); font-weight: 800; letter-spacing: .06em; }
  .chart .slabel:nth-of-type(2) { fill: var(--amber); }
  .chart .blabel { fill: var(--ink); font-weight: 600; }
  .chart .bval { fill: var(--dim); font-variant-numeric: tabular-nums; }
  .chart .bar { fill: var(--cyan); transform: scaleX(0); transform-box: fill-box;
    transform-origin: left center; transition: filter .3s; }
  .chart .bar.neg { fill: var(--amber); transform-origin: right center; }
  .in-view .chart .bar { animation: grow .95s cubic-bezier(.2,.85,.25,1) forwards; }
  .chart .bar:nth-of-type(1) { animation-delay: .06s } .chart .bar:nth-of-type(2) { animation-delay: .14s }
  .chart .bar:nth-of-type(3) { animation-delay: .22s } .chart .bar:nth-of-type(4) { animation-delay: .3s }
  .chart .bar:nth-of-type(5) { animation-delay: .38s } .chart .bar:nth-of-type(6) { animation-delay: .46s }
  .chart .bars:hover .bar { filter: drop-shadow(0 0 7px currentColor); }
  @keyframes grow { to { transform: scaleX(1); } }
  .chart .tbd { font-size: 8px; fill: var(--tbd); }
  .tbd { color: var(--tbd); font-weight: 700; }

  .air { border: 1px solid var(--edge); padding: 9px 10px; display: flex;
    flex-wrap: wrap; gap: 20px; align-items: baseline; background: rgba(4,16,15,.35); }
  .air-item b { font-size: 9px; color: var(--faint); margin-right: 5px; letter-spacing: .14em; }
  .air-val { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums;
    margin-right: 5px; letter-spacing: -.03em; }
  .air-src { margin-left: auto; font-size: 8.5px; color: var(--faint); }

  ul { margin: 0; padding-left: 0; list-style: none; }
  .news li { padding: 4px 0; border-bottom: 1px solid rgba(22,64,59,.6);
    display: flex; gap: 8px; align-items: baseline; }
  .news .cat { flex: none; min-width: 24px; font-size: 8.5px; color: var(--amber);
    font-weight: 800; letter-spacing: .08em; }
  .news .ref { margin-left: auto; color: var(--faint); font-size: 8.5px; flex: none; }
  .news a { flex: 1; }
  a { color: inherit; text-decoration: none; }
  .swipe { background-image: linear-gradient(var(--cyan), var(--cyan));
    background-size: 0% 1px; background-repeat: no-repeat; background-position: 0 100%;
    transition: background-size .45s cubic-bezier(.2,.8,.2,1); }
  a:hover .swipe { background-size: 100% 1px; }

  footer { margin-top: 12px; padding-top: 7px; border-top: 1px solid var(--edge);
    font-size: 8.5px; color: var(--faint); line-height: 1.6; }
  .pending li { color: var(--tbd); }
  .article-list { width: var(--sheet-w); margin: 18px auto 0; padding: 14px 11mm 18px;
    border: 1px solid var(--edge); background: rgba(7,29,27,.5); }
  .article-list li { padding: 3px 0; font-size: 9.5px; color: var(--dim); }
  .article-list a:hover { color: var(--cyan); }
  .outlet { color: var(--faint); }

  /* ── 스크롤 리빌 ── */
  .reveal { opacity: 0; transform: translateY(18px);
    transition: opacity .75s cubic-bezier(.2,.8,.2,1), transform .75s cubic-bezier(.2,.8,.2,1);
    transition-delay: calc(var(--i, 0) * 80ms); }
  .in-view .reveal, .reveal.in-view { opacity: 1; transform: none; }

  @media (max-width: 820px) {
    .page, .article-list { width: auto; max-width: 100%; padding: 16px; }
    .cards { grid-template-columns: repeat(2, 1fr); }
    .grid2 { grid-template-columns: 1fr; }
    h1 { font-size: 19px; }
  }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation: none !important; transition: none !important; }
    .reveal { opacity: 1; transform: none; }
    .chart .line { stroke-dashoffset: 0; }
    .chart .bar { transform: scaleX(1); }
  }

  @media print {
    @page { size: A4 portrait; margin: 10mm; }
    *, *::before, *::after { animation: none !important; transition: none !important; }
    body { background: #fff; color: #111; font-size: 10px; }
    .bg, .grid-lines, .cursor, .ticker, .card-glow { display: none !important; }
    .stage { padding: 0; perspective: none; }
    .page { width: auto; margin: 0; padding: 0; background: #fff; border: 0;
      box-shadow: none; backdrop-filter: none; }
    .reveal { opacity: 1 !important; transform: none !important; }
    h1 { font-size: 16px; color: #111; }
    h1 .accent { color: #111; -webkit-text-fill-color: #111; }
    h2 { color: #333; border-color: #bbb; }
    .card { border-color: #bbb; background: none; }
    .card-value { font-size: 18px; color: #111; }
    .card-name, .card-date, .note, .air-src, footer { color: #555; }
    .panel, .air { border-color: #bbb; background: none; }
    .chg.up, .chg.down, .chg.flat { color: #111; }
    .chart .line { stroke: #111; stroke-dasharray: none; stroke-dashoffset: 0; filter: none; }
    .chart .line.s1 { stroke: #777; }
    .chart .bar { fill: #333; transform: scaleX(1); }
    .chart .bar.neg { fill: #999; }
    .chart .dot { fill: #111; filter: none; }
    .chart .blabel { fill: #111; }
    .chart .tick, .chart .slabel, .chart .bval { fill: #555; }
    .tbd, .pending li, .chart .tbd { color: #111; fill: #111; }
    .news li { border-color: #ddd; }
    .news .cat { color: #555; }
    .article-list { display: none; }
  }
</style>
</head>
<body>
<div class="bg" aria-hidden="true"></div>
<div class="grid-lines" aria-hidden="true"></div>
<div class="cursor" id="cursor" aria-hidden="true"></div>

<div class="stage">
<div class="page">
  <header>
    <div>
      <div class="eyebrow">Weekly Market Brief</div>
      <h1>주간 <span class="accent">해운 · 항공</span> 시황</h1>
    </div>
    <div class="meta">${esc(d.weekLabel ?? d.week ?? "")} 기준<br>생성 ${esc(d.generatedAt ?? "")}</div>
  </header>

  <div class="ticker" aria-hidden="true"><div class="ticker-track">${tickerItems}${tickerItems}</div></div>

  ${d.degraded ? '<div class="banner">이번 주 지수 수집 실패 · 숫자 미반영 (아래 [확인 필요] 참조)</div>' : ""}

  <section data-animate>
    <h2>해상 · 항공 운임 지수</h2>
    <div class="cards">
      ${card("SCFI", ind.SCFI, 0)}
      ${card("KCCI", ind.KCCI, 1)}
      ${card("BDI", ind.BDI, 2)}
      ${card("BAI", air.BAI00 ? { ...air.BAI00, asOf: air.asOf } : null, 3, { suffix: " <span style='font-weight:400;letter-spacing:0'>항공</span>" })}
    </div>
    <div class="note">
      발표 주기 — SCFI·CCFI 금요일 / KCCI 월요일 14시(월요일 아침 기준 1주 시차) / BDI 일간 / BAI 주간 ·
      CCFI ${fmt(ind.CCFI?.value) ?? TBD} ${pct(ind.CCFI?.changePct)} (${ind.CCFI?.asOf ? esc(ind.CCFI.asOf) : TBD} 기준)
    </div>
  </section>

  <section data-animate>
    <h2>운임 추이</h2>
    <div class="grid2">
      <div class="panel">${lineChart({
        series: containerSeries.length ? containerSeries : [{ label: "KCCI", points: [] }],
        width: 420,
        height: 150,
      })}<div class="note">컨테이너 — KCCI 실선 · SCFI 점선</div></div>
      <div class="panel">${lineChart({ series: bdiSeries, width: 420, height: 150 })}<div class="note">벌크 — BDI · 매주 수집분이 쌓이며 길어집니다</div></div>
    </div>
  </section>

  <section data-animate>
    <h2>주요 항로 전주 대비 (KCCI)</h2>
    <div class="panel">${barChart({ bars, width: 860, height: 136 })}</div>
  </section>

  <section data-animate>
    <h2>항공</h2>
    <div class="air">
      ${airRow}
      <span class="air-src">${
        air.sourceUrl
          ? `출처 <a href="${esc(air.sourceUrl)}" target="_blank" rel="noopener"><span class="swipe">기사 원문</span></a>`
          : TBD
      }${air.asOf ? ` · ${esc(air.asOf)} 기준` : ""}</span>
    </div>
    ${air.note ? `<div class="note tbd">${esc(air.note)}</div>` : ""}
  </section>

  <section data-animate>
    <h2>이번 주 동향</h2>
    <ul class="news">
${newsRows || `<li>${TBD} 수집된 기사가 없습니다</li>`}
    </ul>
  </section>

  <footer>
    기준 ${esc(d.weekLabel ?? d.week ?? "")} · 출처 forwarder.kr · 한국해양진흥공사 · 공개 기사 ·
    [확인 필요] ${(d.pending ?? []).length}건
    ${pendingList}
    <div>수치는 각 출처 발표분을 그대로 옮긴 것이며, 자료에 없는 값은 채우지 않습니다. 운임 전망·권고를 담지 않습니다.</div>
  </footer>
</div>

<div class="article-list">
  <h2>수집 기사 전체 · 화면 전용</h2>
  <ul>
${articleList || "<li>없음</li>"}
  </ul>
</div>
</div>

<script>
(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // 스크롤 진입 시 섹션 리빌 + 차트 애니메이션 시작
  var sections = document.querySelectorAll("[data-animate]");
  if (reduce || !("IntersectionObserver" in window)) {
    sections.forEach(function (s) { s.classList.add("in-view"); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in-view");
        countUp(e.target);
        io.unobserve(e.target);
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });
    sections.forEach(function (s) { io.observe(s); });
  }

  // 숫자 카운트업 — 원본 값은 data-count에 그대로 있고 표시만 움직인다
  function countUp(root) {
    if (reduce) return;
    root.querySelectorAll("[data-count]").forEach(function (el) {
      var target = parseFloat(el.getAttribute("data-count"));
      var dec = parseInt(el.getAttribute("data-dec") || "0", 10);
      if (!isFinite(target)) return;
      var dur = 1250, t0 = performance.now();
      function tick(now) {
        var p = Math.min(1, (now - t0) / dur);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = (target * eased).toLocaleString("ko-KR", {
          minimumFractionDigits: dec, maximumFractionDigits: dec
        });
        if (p < 1) requestAnimationFrame(tick);
        else el.textContent = target.toLocaleString("ko-KR", {
          minimumFractionDigits: dec, maximumFractionDigits: dec
        });
      }
      requestAnimationFrame(tick);
    });
  }

  // 커서 글로우
  var cur = document.getElementById("cursor");
  if (cur && !reduce && window.matchMedia("(pointer: fine)").matches) {
    var cx = 0, cy = 0, tx = 0, ty = 0, on = false;
    window.addEventListener("mousemove", function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!on) { on = true; cur.style.opacity = "1"; cx = tx; cy = ty; }
    }, { passive: true });
    (function loop() {
      cx += (tx - cx) * 0.12; cy += (ty - cy) * 0.12;
      cur.style.transform = "translate3d(" + cx + "px," + cy + "px,0) translate(-50%,-50%)";
      requestAnimationFrame(loop);
    })();
  }

  // 시트 미세 기울기 (마우스 추종)
  var page = document.querySelector(".page");
  if (page && !reduce && window.matchMedia("(pointer: fine)").matches) {
    window.addEventListener("mousemove", function (e) {
      var rx = (e.clientY / window.innerHeight - 0.5) * -1.1;
      var ry = (e.clientX / window.innerWidth - 0.5) * 1.1;
      page.style.transform = "rotateX(" + rx + "deg) rotateY(" + ry + "deg)";
    }, { passive: true });
  }
})();
</script>
</body>
</html>`;
}
