import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { buildWeek, isoWeek, weekLabel, publish } from "../run.mjs";

const okIndices = {
  indices: {
    SCFI: { value: 3572.33, changePct: -1.68, asOf: "2026-11-13" },
    CCFI: { value: 1919.27, changePct: -0.28, asOf: "2026-11-13" },
    KCCI: { value: 4608, changePct: -1.29, asOf: "2026-11-16" },
    BDI: { value: 2921, changePct: -1.98, asOf: "2026-11-16" },
  },
  lanes: { 미주서안: { value: 8210, changePct: -0.69, asOf: "2026-11-16" } },
  series: [{ date: "2026-11-16", value: 4608 }],
  errors: [],
};

const nullIndices = {
  indices: {
    SCFI: { value: null, changePct: null, asOf: null },
    CCFI: { value: null, changePct: null, asOf: null },
    KCCI: { value: null, changePct: null, asOf: null },
    BDI: { value: null, changePct: null, asOf: null },
  },
  lanes: {},
  series: [],
  errors: [{ source: "forwarder.kr", message: "HTTP 503" }],
};

const noAir = { BAI00: { value: null, changePct: null }, BAI30: { value: null, changePct: null }, BAI80: { value: null, changePct: null }, sourceUrl: null, note: "그 주 BAI 발표 기사를 찾지 못했습니다" };
const okAir = { BAI00: { value: 2924, changePct: 6.6 }, BAI30: { value: null, changePct: 4.2 }, BAI80: { value: null, changePct: 2.9 }, sourceUrl: "https://example.com/b", note: null };

const deps = (indices, air = okAir) => ({
  fetchIndices: async () => indices,
  collectHeadlines: async () => ({ items: [{ title: "기사", link: "https://example.com/n", outlet: "매체", topic: "해운 운임", desc: "" }], errors: [] }),
  collectAir: async () => air,
  summarizeAll: async (items) => ({
    items: items.map((it) => ({ ...it, summary: "한 줄 요약", category: "해운" })),
    failed: 0,
    errors: [],
  }),
});

const now = new Date("2026-11-17T06:30:00+09:00");

test("isoWeek이 월요일 경계에서 맞는 주차를 낸다", () => {
  assert.equal(isoWeek(new Date("2026-11-16T00:00:00Z")), "2026-W47");
  assert.equal(isoWeek(new Date("2026-11-15T00:00:00Z")), "2026-W46");
});

test("weekLabel은 사람이 읽는 주차 표기를 만든다", () => {
  assert.match(weekLabel(new Date("2026-11-17T00:00:00Z")), /2026년 11월 \d주/);
});

test("지수가 하나라도 잡히면 degraded가 아니다", async () => {
  const half = { ...okIndices, indices: { ...nullIndices.indices, SCFI: okIndices.indices.SCFI } };
  const r = await buildWeek({ now, deps: deps(half), history: { weeks: [] } });
  assert.equal(r.degraded, false);
});

test("지수 4종이 전멸해야만 degraded가 된다", async () => {
  const r = await buildWeek({ now, deps: deps(nullIndices, noAir), history: { weeks: [] } });
  assert.equal(r.degraded, true);
});

test("degraded여도 지난주 숫자를 끌어다 채우지 않는다", async () => {
  const history = { weeks: [{ week: "2026-W46", indices: { SCFI: { value: 3633, changePct: 1, asOf: "2026-11-06" } } }] };
  const r = await buildWeek({ now, deps: deps(nullIndices, noAir), history });
  assert.equal(r.data.indices.SCFI.value, null);
});

test("수집 실패는 pending에 사유와 함께 쌓인다", async () => {
  const r = await buildWeek({ now, deps: deps(nullIndices, noAir), history: { weeks: [] } });
  assert.ok(r.pending.length >= 4);
  assert.ok(r.pending.every((p) => p.field && p.reason));
});

test("정상 수집이면 pending이 비고 뉴스에 번호가 붙는다", async () => {
  const r = await buildWeek({ now, deps: deps(okIndices), history: { weeks: [] } });
  assert.equal(r.degraded, false);
  assert.equal(r.data.news[0].no, 1);
  assert.equal(r.data.news[0].summary, "한 줄 요약");
});

test("이번 주 지수가 이력에 누적된다", async () => {
  const r = await buildWeek({ now, deps: deps(okIndices), history: { weeks: [] } });
  assert.equal(r.history.weeks.length, 1);
  assert.equal(r.history.weeks[0].indices.SCFI.value, 3572.33);
});

test("이미 있는 보관본은 덮어쓰지 않는다", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "brief-"));
  const archive = path.join(out, "archive", "2026-W47.html");
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.writeFileSync(archive, "기존내용", "utf8");

  const res = publish({ outDir: out, week: "2026-W47", html: "<html>새내용</html>" });

  assert.equal(fs.readFileSync(archive, "utf8"), "기존내용");
  assert.equal(res.archiveWritten, false);
  // 최신 페이지는 언제나 갱신된다
  assert.equal(fs.readFileSync(path.join(out, "index.html"), "utf8"), "<html>새내용</html>");
  fs.rmSync(out, { recursive: true, force: true });
});

test("보관본이 없으면 새로 쓴다", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "brief-"));
  const res = publish({ outDir: out, week: "2026-W48", html: "<html>내용</html>" });
  assert.equal(res.archiveWritten, true);
  assert.ok(fs.existsSync(path.join(out, "archive", "2026-W48.html")));
  fs.rmSync(out, { recursive: true, force: true });
});
