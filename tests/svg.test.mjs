import test from "node:test";
import assert from "node:assert/strict";

import { lineChart, barChart } from "../lib/svg.mjs";

const p1 = [
  { x: "2026-10-26", y: 4666 },
  { x: "2026-11-02", y: 4667 },
  { x: "2026-11-09", y: 4668 },
  { x: "2026-11-16", y: 4608 },
];
const p2 = p1.map((p) => ({ ...p, y: p.y - 1000 }));

test("선 두 개를 그리고 한쪽은 점선으로 구분한다", () => {
  const s = lineChart({
    series: [
      { label: "KCCI", points: p1 },
      { label: "SCFI", points: p2, dashed: true },
    ],
    width: 400,
    height: 160,
  });
  assert.match(s, /^<svg/);
  assert.equal((s.match(/<polyline/g) || []).length, 2);
  assert.match(s, /stroke-dasharray/);
  assert.match(s, /KCCI/);
  assert.match(s, /SCFI/);
});

// Review Focus 5 — 점 1개 / 전 구간 동일값
test("점이 하나뿐이어도 NaN 없이 그려진다", () => {
  const s = lineChart({ series: [{ label: "KCCI", points: [{ x: "2026-11-16", y: 4608 }] }], width: 400, height: 160 });
  assert.ok(!s.includes("NaN"));
  assert.match(s, /<circle/);
});

test("모든 값이 같아도 (분모 0) NaN이 좌표에 들어가지 않는다", () => {
  const same = [{ x: "a", y: 100 }, { x: "b", y: 100 }, { x: "c", y: 100 }];
  const s = lineChart({ series: [{ label: "X", points: same }], width: 400, height: 160 });
  assert.ok(!s.includes("NaN"));
});

test("점이 하나도 없으면 [확인 필요]를 표시한다", () => {
  const s = lineChart({ series: [{ label: "KCCI", points: [] }], width: 400, height: 160 });
  assert.ok(!s.includes("NaN"));
  assert.match(s, /확인 필요/);
});

test("막대를 그리고 값이 없는 항목은 [확인 필요]로 표시한다", () => {
  const s = barChart({
    bars: [
      { label: "미주서안", value: -0.69 },
      { label: "미주동안", value: -3.9 },
      { label: "유럽", value: -0.51 },
      { label: "동남아", value: -0.12 },
      { label: "일본", value: 0.46 },
      { label: "중국", value: null },
    ],
    width: 400,
    height: 140,
  });
  assert.equal((s.match(/<rect[^>]*class="bar[^"]*"/g) || []).length, 5);
  assert.match(s, /확인 필요/);
  assert.ok(!s.includes("NaN"));
});

test("음수 막대와 양수 막대가 기준선 반대편에 그려진다", () => {
  const s = barChart({ bars: [{ label: "유럽", value: -0.8 }, { label: "일본", value: 0.46 }], width: 400, height: 140 });
  const xs = [...s.matchAll(/<rect[^>]*class="bar[^"]*"[^>]*x="([\d.]+)"/g)].map((m) => Number(m[1]));
  assert.equal(xs.length, 2);
  assert.ok(xs[0] < xs[1], "음수 막대가 기준선 왼쪽에서 시작해야 한다");
  assert.ok(!s.includes("NaN"));
});

test("모든 막대 값이 0이어도 터지지 않는다", () => {
  const s = barChart({ bars: [{ label: "중국", value: 0 }], width: 400, height: 140 });
  assert.ok(!s.includes("NaN"));
});

test("라벨에 들어간 꺾쇠는 이스케이프된다", () => {
  const s = barChart({ bars: [{ label: "a<b>", value: 1 }], width: 400, height: 140 });
  assert.ok(!s.includes("<b>"));
  assert.match(s, /&lt;b&gt;/);
});
