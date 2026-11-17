// 주차별 지수 누적 이력 — 출처 사이트가 바뀌어도 과거 그래프는 남는다 (설계 N7)
// 어떤 실패에도 예외로 죽지 않고 빈 이력을 돌려준다. 첫 실행과 중단된 쓰기를 같게 취급한다.
import fs from "node:fs";
import path from "node:path";

const EMPTY = () => ({ weeks: [] });

export function readHistory(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch {
    return EMPTY();
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return EMPTY();
  }
  if (!parsed || !Array.isArray(parsed.weeks)) return EMPTY();
  return parsed;
}

/** 같은 week가 있으면 교체, 없으면 추가. 항상 week 오름차순을 유지한다. */
export function upsertWeek(history, record) {
  const weeks = (history?.weeks ?? []).filter((w) => w.week !== record.week);
  weeks.push(record);
  weeks.sort((a, b) => String(a.week).localeCompare(String(b.week)));
  return { ...history, weeks };
}

export function writeHistory(filePath, history) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(history, null, 2)}\n`, "utf8");
}

/** 특정 지수의 시계열을 오래된 순으로 뽑는다. 값이 없는 주차는 건너뛴다. */
export function seriesOf(history, indexName) {
  return (history?.weeks ?? [])
    .map((w) => ({ x: w.week, y: w.indices?.[indexName]?.value ?? null }))
    .filter((p) => typeof p.y === "number" && Number.isFinite(p.y));
}
