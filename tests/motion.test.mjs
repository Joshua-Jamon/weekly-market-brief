// 시네마틱 모션 요구사항 (사용자 요청 2026-11-17) — 화면은 움직이고 인쇄는 멈춘다
import test from "node:test";
import assert from "node:assert/strict";
import { BANNED } from "./banned.mjs";

import { renderPage } from "../lib/render.mjs";

const sample = {
  week: "2026-W47",
  weekLabel: "2026년 11월 3주",
  generatedAt: "2026-11-17 06:30 UTC",
  indices: {
    SCFI: { value: 3572.33, changePct: -1.68, asOf: "2026-11-13" },
    CCFI: { value: 1919.27, changePct: -0.28, asOf: "2026-11-13" },
    KCCI: { value: 4608, changePct: -1.29, asOf: "2026-11-16" },
    BDI: { value: 2921, changePct: -1.98, asOf: "2026-11-16" },
  },
  lanes: Object.fromEntries(
    ["미주서안", "미주동안", "유럽", "동남아", "일본", "중국"].map((n) => [n, { value: 1, changePct: -1, asOf: "2026-11-16" }])
  ),
  series: [{ date: "2026-11-09", value: 4668 }, { date: "2026-11-16", value: 4608 }],
  air: { BAI00: { value: null, changePct: null }, BAI30: {}, BAI80: {}, sourceUrl: null, note: "기사 미확인", asOf: null },
  news: [{ no: 1, title: "제목", link: "https://example.com/n", summary: "요약", category: "해운" }],
  allArticles: [{ no: 1, title: "제목", link: "https://example.com/n", outlet: "매체" }],
  pending: [{ field: "BAI00", reason: "기사 미확인" }],
  degraded: false,
};

const html = () => renderPage(sample);

test("인쇄에서 모든 애니메이션과 전환이 꺼진다", () => {
  const h = html();
  const print = h.match(/@media print\s*\{([\s\S]*?)\n\s*\}\s*<\/style>/);
  assert.ok(print, "@media print 블록이 있어야 한다");
  assert.match(print[1], /animation:\s*none\s*!important/);
  assert.match(print[1], /transition:\s*none\s*!important/);
});

test("인쇄에서 장식 요소(배경·커서·티커)가 숨겨진다", () => {
  const print = html().match(/@media print\s*\{([\s\S]*?)\n\s*\}\s*<\/style>/)[1];
  for (const sel of [".bg", ".grid-lines", ".cursor", ".ticker"]) {
    assert.ok(print.includes(sel), `인쇄에서 ${sel}가 처리되어야 한다`);
  }
  assert.match(print, /display:\s*none\s*!important/);
});

test("인쇄에서 리빌 요소가 보이도록 강제된다 (빈 지면 방지)", () => {
  const print = html().match(/@media print\s*\{([\s\S]*?)\n\s*\}\s*<\/style>/)[1];
  assert.match(print, /\.reveal\s*\{[^}]*opacity:\s*1\s*!important/);
});

test("모션 축소 설정을 존중한다", () => {
  const h = html();
  assert.match(h, /@media \(prefers-reduced-motion: reduce\)/);
  const block = h.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\s\s\}/);
  assert.ok(block);
  assert.match(block[1], /animation:\s*none\s*!important/);
});

test("카운트업은 원본 값을 data-count에 그대로 보존한다", () => {
  const h = html();
  assert.match(h, /data-count="3572\.33"/);
  assert.match(h, /data-count="4608"/);
  // 소수 자릿수도 값에 맞춰 지정된다
  assert.match(h, /data-count="3572\.33" data-dec="2"/);
  assert.match(h, /data-count="4608" data-dec="0"/);
});

test("값이 없는 칸에는 카운트업 속성이 붙지 않는다", () => {
  // BAI00은 value가 null → data-count 없이 [확인 필요]만
  const h = html();
  const baiCard = h.match(/<article class="card reveal"[^>]*>(?:(?!<\/article>)[\s\S])*?BAI(?:(?!<\/article>)[\s\S])*?<\/article>/);
  assert.ok(baiCard, "BAI 카드가 있어야 한다");
  assert.ok(!baiCard[0].includes("data-count"), "값이 없으면 카운트업 대상이 아니다");
  assert.match(baiCard[0], /\[확인 필요\]/);
});

test("선 그래프에 드로잉 애니메이션이 걸려 있다", () => {
  const h = html();
  assert.match(h, /stroke-dashoffset/);
  assert.match(h, /@keyframes draw/);
});

test("막대에 성장 애니메이션이 걸려 있다", () => {
  const h = html();
  assert.match(h, /@keyframes grow/);
  assert.match(h, /transform:\s*scaleX\(0\)/);
});

test("스크립트는 인라인이며 외부에서 불러오지 않는다", () => {
  const h = html();
  assert.ok(!/<script\s[^>]*src=/i.test(h), "외부 스크립트를 불러오면 안 된다");
  assert.match(h, /<script>/);
});

test("모션을 넣어도 회사명은 여전히 없다", () => {
  const h = html();
  for (const w of BANNED) assert.ok(!h.includes(w));
});
