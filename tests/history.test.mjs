import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readHistory, upsertWeek, writeHistory } from "../lib/history.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name) => path.join(HERE, "..", "fixtures", name);

test("파일이 없으면 빈 이력을 돌려준다", () => {
  assert.deepEqual(readHistory(fixture("없는경로.json")), { weeks: [] });
});

test("JSON이 깨져 있어도 예외 없이 빈 이력을 돌려준다", () => {
  assert.deepEqual(readHistory(fixture("broken.json")), { weeks: [] });
});

test("같은 주차를 다시 넣으면 교체되고 건수가 늘지 않는다", () => {
  let h = upsertWeek(
    { weeks: [] },
    { week: "2026-W47", indices: { SCFI: { value: 3572.33, changePct: -1.68, asOf: "2026-11-13" } } }
  );
  h = upsertWeek(
    h,
    { week: "2026-W47", indices: { SCFI: { value: 3600, changePct: 0.8, asOf: "2026-11-13" } } }
  );
  assert.equal(h.weeks.length, 1);
  assert.equal(h.weeks[0].indices.SCFI.value, 3600);
});

test("주차는 항상 오름차순으로 정렬된다", () => {
  let h = upsertWeek({ weeks: [] }, { week: "2026-W47", indices: {} });
  h = upsertWeek(h, { week: "2026-W45", indices: {} });
  assert.deepEqual(h.weeks.map((w) => w.week), ["2026-W45", "2026-W47"]);
});

test("쓰고 나서 다시 읽으면 같은 내용이 나온다", () => {
  const tmp = fixture("roundtrip.tmp.json");
  const h = upsertWeek({ weeks: [] }, { week: "2026-W47", indices: { BDI: { value: 2921, changePct: -1.98, asOf: "2026-11-16" } } });
  try {
    writeHistory(tmp, h);
    assert.deepEqual(readHistory(tmp), h);
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});
