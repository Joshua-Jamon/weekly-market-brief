// 전체 검토에서 나온 지적의 회귀 테스트 (2026-11-17)
// 원칙: 조건을 확신할 수 없으면 숫자를 버리고 [확인 필요]. "가장 가까운 숫자 채택" 금지.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { extractBai } from "../lib/airIndex.mjs";
import { parseChange, parseKcci } from "../lib/indices.mjs";
import { isoWeek, weekLabel } from "../run.mjs";
import { writeHistory, readHistory } from "../lib/history.mjs";
import { lineChart } from "../lib/svg.mjs";

// ── Critical 2: BAI 추출이 무관한 숫자를 집지 않는다 ───────────
test("적재율 같은 무관한 퍼센트를 지수값으로 집지 않는다", () => {
  const r = extractBai("The BAI00 index rose with load factors at 85.6% globally.");
  assert.equal(r.BAI00.value, null, "퍼센트가 뒤따르는 값은 지수값이 아니다");
});

test("하락 표현이면 증감률이 음수가 된다", () => {
  assert.equal(extractBai("The BAI00 fell 3.9% week-over-week.").BAI00.changePct, -3.9);
  assert.equal(extractBai("BAI00 dropped by 12.0% WoW.").BAI00.changePct, -12);
});

test("전년 대비만 있고 전주 대비가 없으면 증감률을 비운다", () => {
  const r = extractBai("BAI00 was up 27.1% year-on-year.");
  assert.equal(r.BAI00.changePct, null, "YoY를 WoW로 표시하면 안 된다");
});

test("전주·전년이 함께 있으면 전주 대비를 고른다", () => {
  const r = extractBai("BAI00 was up 27.1% year-on-year and 3.9% week-on-week.");
  assert.equal(r.BAI00.changePct, 3.9);
});

test("한국어 기사에서도 지수값과 전주 대비를 읽는다", () => {
  const r = extractBai("발틱항공화물지수(BAI00)는 2,924로 전주 대비 6.6% 상승했다.");
  assert.equal(r.BAI00.value, 2924);
  assert.equal(r.BAI00.changePct, 6.6);
});

test("한국어 하락 표현도 음수로 읽는다", () => {
  const r = extractBai("BAI00은 전주 대비 3.9% 하락했다.");
  assert.equal(r.BAI00.changePct, -3.9);
});

// ── Important 5: BAI 기준일 ──────────────────────────────────
test("기사 본문의 날짜를 기준일로 삼는다", () => {
  const r = extractBai("As of November 9, 2026, the BAI00 stood at 2,924.00, up +6.6% for the week.");
  assert.equal(r.asOf, "2026-11-09");
});

// ── Important 7: 전주 대비 부호 ───────────────────────────────
test("△▽ 화살표도 ▲▼와 같게 읽는다", () => {
  assert.equal(parseChange("▽1.68%"), -1.68);
  assert.equal(parseChange("△1.68%"), 1.68);
});

test("괄호 안에 부호가 없으면 화살표로 부호를 정한다", () => {
  assert.equal(parseChange("▼ 61.12 (1.68%)"), -1.68);
  assert.equal(parseChange("▲ 61.12 (1.68%)"), 1.68);
});

test("한국어 방향어도 부호로 읽는다", () => {
  assert.equal(parseChange("하락 1.68%"), -1.68);
  assert.equal(parseChange("상승 1.68%"), 1.68);
});

test("부호 정보가 이미 있으면 그대로 둔다", () => {
  assert.equal(parseChange("▼ 61.12 (-1.68%)"), -1.68);
  assert.equal(parseChange("-60(-1.29%)"), -1.29);
});

// ── Important 8: KCCI 열 위치 의존 제거 ───────────────────────
test("표에 열이 추가돼도 올바른 열을 읽는다", () => {
  const html = `<table><thead><tr>
      <th>Group</th><th>Code</th><th>Route</th><th>Weight</th>
      <th>Current Index 2026-11-16</th><th>Previous Index 2026-11-09</th>
      <th>Weekly Change</th><th>Note</th></tr></thead><tbody>
      <tr><td>Index</td><td>KCCI</td><td>Comprehensive</td><td>100%</td>
          <td>4,608</td><td>4,668</td><td>-60(-1.29%)</td><td>참고</td></tr>
    </tbody></table>`;
  const r = parseKcci(html);
  assert.equal(r.composite.value, 4608, "마지막에서 세 번째가 아니라 헤더로 찾아야 한다");
  assert.equal(r.composite.changePct, -1.29);
});

// ── Important 3: 주차가 KST 기준이어야 한다 ───────────────────
test("월요일 06:30 KST는 그 주차로 계산된다", () => {
  assert.equal(isoWeek(new Date("2026-11-16T06:30:00+09:00")), "2026-W47");
  assert.equal(isoWeek(new Date("2026-11-16T10:00:00+09:00")), "2026-W47");
});

test("일요일 밤은 아직 지난 주차다", () => {
  assert.equal(isoWeek(new Date("2026-11-15T23:00:00+09:00")), "2026-W46");
});

test("주차 표기도 KST 기준으로 만든다", () => {
  assert.match(weekLabel(new Date("2026-11-16T06:30:00+09:00")), /2026년 11월/);
});

// ── Important 6: 이력 저장이 원자적이어야 한다 ────────────────
test("이력 쓰기 중 임시 파일이 남지 않는다", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hist-"));
  const p = path.join(dir, "history.json");
  writeHistory(p, { weeks: [{ week: "2026-W47", indices: {} }] });
  assert.deepEqual(fs.readdirSync(dir), ["history.json"], "tmp 파일이 남으면 안 된다");
  assert.equal(readHistory(p).weeks.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("깨진 이력 파일은 백업으로 보존된다 (조용히 버리지 않는다)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hist-"));
  const p = path.join(dir, "history.json");
  fs.writeFileSync(p, "{ weeks: [", "utf8");
  const h = readHistory(p);
  assert.deepEqual(h, { weeks: [] });
  assert.ok(fs.existsSync(`${p}.corrupt`), "깨진 파일을 .corrupt로 남겨야 한다");
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Important 4: 두 계열이 같은 시간축에 놓여야 한다 ──────────
test("계열 길이가 달라도 같은 날짜는 같은 x에 놓인다", () => {
  const s = lineChart({
    series: [
      { label: "KCCI", points: [{ x: "2026-10-26", y: 10 }, { x: "2026-11-16", y: 20 }] },
      { label: "SCFI", points: [{ x: "2026-11-16", y: 30 }] },
    ],
    width: 400,
    height: 160,
  });
  const cx = Number(s.match(/<circle[^>]*cx="([\d.]+)"/)[1]);
  const lastKcciX = Number(s.match(/<polyline[^>]*points="[^"]*\s([\d.]+),[\d.]+"/)[1]);
  assert.equal(cx, lastKcciX, "SCFI의 11-16 점은 KCCI의 11-16 자리에 있어야 한다");
});
