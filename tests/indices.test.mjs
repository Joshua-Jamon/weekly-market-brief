import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseNumber,
  parseChange,
  parseForwarder,
  parseKcci,
  parseTimeseries,
  fetchIndices,
  LANES,
} from "../lib/indices.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readFixture = (n) => fs.readFileSync(path.join(HERE, "..", "fixtures", n), "utf8");

test("forwarder 페이지에서 네 지수를 기준일과 함께 뽑는다", () => {
  const r = parseForwarder(readFixture("forwarder.html"));
  assert.equal(r.SCFI.value, 3572.33);
  assert.equal(r.SCFI.changePct, -1.68);
  assert.equal(r.SCFI.asOf, "2026-11-13");
  assert.equal(r.CCFI.value, 1919.27);
  assert.equal(r.BDI.value, 2921);
  assert.equal(r.BDI.asOf, "2026-11-16");
});

// Review Focus 2 — 숫자 표기 변형
test("쉼표·소수점·하락부호가 섞여도 같은 값으로 파싱된다", () => {
  assert.equal(parseNumber("3,572.33"), 3572.33);
  assert.equal(parseNumber("2,921"), 2921);
  assert.equal(parseNumber(" 52 "), 52);
  assert.equal(parseNumber("자료없음"), null);
  assert.equal(parseChange("▼ 61.12 <small>(-1.68%)</small>"), -1.68);
  assert.equal(parseChange("▲6.6%"), 6.6);
  assert.equal(parseChange("-60(-1.29%)"), -1.29);
  assert.equal(parseChange("0(0.00%)"), 0);
});

// Review Focus 1 — 구조가 바뀌어도 조용히 비지 않는다
test("구조가 바뀌어 못 찾으면 null을 남긴다", () => {
  const r = parseForwarder("<html><body>개편되었습니다</body></html>");
  assert.equal(r.SCFI.value, null);
  assert.equal(r.SCFI.changePct, null);
  assert.equal(r.SCFI.asOf, null);
});

test("KCCI 종합값을 기준일과 함께 뽑는다", () => {
  const r = parseKcci(readFixture("kobc-kcci.html"));
  assert.equal(r.composite.value, 4608);
  assert.equal(r.composite.changePct, -1.29);
  assert.equal(r.composite.asOf, "2026-11-16");
});

test("항로 7개를 한국어 이름으로 돌려준다", () => {
  const r = parseKcci(readFixture("kobc-kcci.html"));
  assert.deepEqual(Object.keys(r.lanes), LANES);
  assert.equal(r.lanes["미주서안"].value, 8210);
  assert.equal(r.lanes["미주동안"].changePct, -3.9);
  assert.equal(r.lanes["유럽"].value, 3519);
  assert.equal(r.lanes["중국"].changePct, 0);
  assert.equal(r.lanes["일본"].value, 217);
  assert.equal(r.lanes["동남아"].value, 1686);
  assert.equal(r.lanes["중동"].value, 8837);
  assert.equal(r.lanes["중동"].changePct, -1.04);
});

test("KCCI 표에 없는 항로는 null로 남는다", () => {
  const r = parseKcci("<table><tr><td>Index</td><td>KCCI</td><td>x</td><td>100%</td><td>1</td><td>1</td><td>0(0.00%)</td></tr></table>");
  assert.equal(r.lanes["유럽"].value, null);
});

test("시계열은 오래된 순으로 날짜와 값을 돌려준다", () => {
  const s = parseTimeseries(readFixture("kobc-timeseries.html"));
  assert.ok(s.length >= 4);
  assert.deepEqual(s.at(-1), { date: "2026-11-16", value: 4608 });
  assert.ok(s[0].date < s.at(-1).date);
});

test("한 출처가 죽어도 나머지는 수집되고 errors에 기록된다", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("kobc.or.kr")) throw new Error("HTTP 503");
    return readFixture("forwarder.html");
  };
  const r = await fetchIndices({ fetchImpl, tries: 1 });
  assert.equal(r.indices.SCFI.value, 3572.33);
  // KCCI 종합은 forwarder에도 실리므로 KOBC가 죽어도 살아남는다 (이중화)
  assert.equal(r.indices.KCCI.value, 4608);
  // 항로별 값은 KOBC에만 있으므로 전부 비어야 한다
  assert.equal(r.lanes["유럽"].value, null);
  assert.deepEqual(r.series, []);
  assert.equal(r.errors.length, 2); // kcci 페이지 + timeseries 페이지
  assert.ok(r.errors[0].message.includes("503"));
});

test("전 출처가 죽어도 예외 대신 null 묶음을 돌려준다", async () => {
  const fetchImpl = async () => {
    throw new Error("fetch failed");
  };
  const r = await fetchIndices({ fetchImpl, tries: 1 });
  assert.equal(r.indices.SCFI.value, null);
  assert.equal(r.indices.KCCI.value, null);
  assert.deepEqual(r.series, []);
  assert.equal(r.errors.length, 3);
});
