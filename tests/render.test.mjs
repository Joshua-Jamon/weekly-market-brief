import test from "node:test";
import assert from "node:assert/strict";
import { BANNED } from "./banned.mjs";

import { renderPage } from "../lib/render.mjs";

const sampleData = {
  week: "2026-W47",
  weekLabel: "2026년 11월 3주",
  generatedAt: "2026-11-17 15:40",
  indices: {
    SCFI: { value: 3572.33, changePct: -1.68, asOf: "2026-11-13" },
    CCFI: { value: 1919.27, changePct: -0.28, asOf: "2026-11-13" },
    KCCI: { value: 4608, changePct: -1.29, asOf: "2026-11-16" },
    BDI: { value: 2921, changePct: -1.98, asOf: "2026-11-16" },
  },
  lanes: {
    미주서안: { value: 8210, changePct: -0.69, asOf: "2026-11-16" },
    미주동안: { value: 11092, changePct: -3.9, asOf: "2026-11-16" },
    유럽: { value: 3519, changePct: -0.51, asOf: "2026-11-16" },
    동남아: { value: 1686, changePct: -0.12, asOf: "2026-11-16" },
    일본: { value: 217, changePct: 0.46, asOf: "2026-11-16" },
    중국: { value: 52, changePct: 0, asOf: "2026-11-16" },
  },
  series: [
    { date: "2026-10-26", value: 4666 },
    { date: "2026-11-02", value: 4667 },
    { date: "2026-11-09", value: 4668 },
    { date: "2026-11-16", value: 4608 },
  ],
  air: { BAI00: { value: 2924, changePct: 6.6 }, BAI30: { value: null, changePct: 4.2 }, BAI80: { value: null, changePct: 2.9 }, sourceUrl: "https://example.com/b", note: null, asOf: "2026-11-09" },
  news: [
    { no: 3, title: "해운 기사 제목", link: "https://example.com/n3", summary: "한 줄 요약", category: "해운" },
    { no: 7, title: "항공 기사 제목", link: "https://example.com/n7", summary: "한 줄 요약", category: "항공" },
  ],
  allArticles: [{ no: 3, title: "해운 기사 제목", link: "https://example.com/n3", outlet: "매체" }],
  pending: [],
  degraded: false,
};

test("지수 칸이 값과 기준일을 함께 표시한다", () => {
  const h = renderPage(sampleData);
  assert.match(h, /3,572\.33/);
  assert.match(h, /2026-11-13/);
  assert.match(h, /2026-11-16/);
});

test("값이 null인 칸은 [확인 필요]와 사유를 보여준다", () => {
  const h = renderPage({
    ...sampleData,
    air: { ...sampleData.air, BAI00: { value: null, changePct: null } },
    pending: [{ field: "BAI00", reason: "그 주 발표 기사 미확인" }],
  });
  assert.match(h, /\[확인 필요\]/);
  assert.match(h, /그 주 발표 기사 미확인/);
});

test("지수가 전부 실패해도 페이지는 생성되고 경고 배너가 뜬다", () => {
  const h = renderPage({ ...sampleData, degraded: true });
  assert.match(h, /지수 수집 실패/);
  assert.match(h, /^<!doctype html>/i);
});

test("뉴스 각 줄에 근거 기사번호가 붙는다", () => {
  const h = renderPage(sampleData);
  assert.match(h, /\[3\]/);
  assert.match(h, /\[7\]/);
});

test("회사명·팀명이 들어가지 않는다", () => {
  const h = renderPage(sampleData);
  for (const w of BANNED) {
    assert.ok(!h.includes(w), `금지어 노출: ${w}`);
  }
});

test("인쇄에서 기사 전체 목록이 숨겨진다", () => {
  const h = renderPage(sampleData);
  const printBlock = h.match(/@media print\s*\{([\s\S]*?)\n\s*\}\s*<\/style>/);
  assert.ok(printBlock, "@media print 블록이 있어야 한다");
  assert.match(printBlock[1], /\.article-list[^}]*display:\s*none/);
});

test("외부 리소스를 요청하지 않는다", () => {
  const h = renderPage(sampleData);
  assert.ok(!/<script\s+src=/i.test(h));
  assert.ok(!/<link[^>]+href="https?:/i.test(h));
  assert.ok(!/<img[^>]+src="https?:/i.test(h));
  assert.ok(!/@import|cdn\.|fonts\.googleapis/i.test(h));
});

test("검색엔진 차단 메타가 들어간다", () => {
  assert.match(renderPage(sampleData), /<meta name="robots" content="noindex/);
});

test("항로 막대 6개가 모두 이름으로 나온다", () => {
  const h = renderPage(sampleData);
  for (const n of ["미주서안", "미주동안", "유럽", "동남아", "일본", "중국"]) assert.ok(h.includes(n));
});

test("항공 수치에 출처 링크가 함께 붙는다", () => {
  assert.match(renderPage(sampleData), /href="https:\/\/example\.com\/b"/);
});

test("절대값이 없는 항공 지수는 증감률만 보여준다", () => {
  const h = renderPage(sampleData);
  // BAI30은 절대값이 없고 증감률만 있다 → 값 자리는 [확인 필요], 증감률은 그대로 표시
  assert.match(h, /▲4\.20%/);
  assert.match(h, /홍콩발/);
});

test("기사 제목의 꺾쇠는 이스케이프된다", () => {
  const h = renderPage({
    ...sampleData,
    news: [{ no: 1, title: "<script>alert(1)</script>", link: "https://example.com/x", summary: "요약", category: "해운" }],
  });
  assert.ok(!h.includes("<script>alert(1)"));
});
