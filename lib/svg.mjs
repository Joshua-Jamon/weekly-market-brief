// 그래프 생성 — 외부 라이브러리 없이 SVG 문자열을 직접 만든다.
// 흑백 인쇄에서도 구분되도록 계열은 색이 아니라 실선/점선으로 나눈다 (설계 L9).

export const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const r1 = (n) => Math.round(n * 10) / 10;

/** 값이 전부 같거나 점이 하나여도 0으로 나누지 않는다 */
function scaleY(values, top, bottom) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1; // 분모 0 차단
  const pad = span * 0.15;
  const lo = min - pad;
  const hi = max + pad;
  const range = hi - lo || 1;
  return (v) => r1(bottom - ((v - lo) / range) * (bottom - top));
}

/**
 * 선 그래프. 점이 1개면 선 대신 점을 찍고, 0개면 [확인 필요]를 표시한다.
 * @param {{series:Array<{label:string, points:Array<{x:string,y:number}>, dashed?:boolean}>, width:number, height:number}} opts
 */
export function lineChart({ series = [], width = 400, height = 160 } = {}) {
  const L = 44;
  const R = width - 8;
  const T = 16;
  const B = height - 26;

  const all = series.flatMap((s) => (s.points ?? []).map((p) => p.y)).filter((v) => Number.isFinite(v));
  if (!all.length) {
    return [
      `<svg class="chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="자료 없음">`,
      `<text x="${width / 2}" y="${height / 2}" text-anchor="middle" class="tbd">[확인 필요] 자료 없음</text>`,
      `</svg>`,
    ].join("");
  }

  const y = scaleY(all, T, B);
  const maxLen = Math.max(...series.map((s) => (s.points ?? []).length));
  const x = (i) => r1(maxLen <= 1 ? (L + R) / 2 : L + (i / (maxLen - 1)) * (R - L));

  const parts = [`<svg class="chart" viewBox="0 0 ${width} ${height}" role="img">`];
  // 기준선 (위·아래)
  parts.push(`<line x1="${L}" y1="${B}" x2="${R}" y2="${B}" class="axis"/>`);
  parts.push(`<text x="4" y="${T + 4}" class="tick">${esc(Math.max(...all).toLocaleString())}</text>`);
  parts.push(`<text x="4" y="${B}" class="tick">${esc(Math.min(...all).toLocaleString())}</text>`);

  series.forEach((s, si) => {
    const pts = (s.points ?? []).filter((p) => Number.isFinite(p.y));
    if (!pts.length) return;
    if (pts.length === 1) {
      parts.push(`<circle cx="${x(0)}" cy="${y(pts[0].y)}" r="3.5" class="dot s${si}"/>`);
    } else {
      const d = pts.map((p, i) => `${x(i)},${y(p.y)}`).join(" ");
      parts.push(
        `<polyline points="${d}" class="line s${si}" fill="none"${s.dashed ? ' stroke-dasharray="5 3"' : ""}/>`
      );
    }
    // 계열 이름은 마지막 점 옆에
    const last = pts.length - 1;
    parts.push(`<text x="${x(last)}" y="${y(pts[last].y) - 6}" text-anchor="end" class="slabel">${esc(s.label)}</text>`);
  });

  // x축 끝 라벨 (첫·마지막 날짜)
  const first = series.find((s) => s.points?.length)?.points ?? [];
  if (first.length) {
    parts.push(`<text x="${L}" y="${height - 8}" class="tick">${esc(first[0].x)}</text>`);
    parts.push(`<text x="${R}" y="${height - 8}" text-anchor="end" class="tick">${esc(first.at(-1).x)}</text>`);
  }
  parts.push(`</svg>`);
  return parts.join("");
}

/**
 * 가로 막대 — 전주 대비(%)용. 0을 기준선으로 좌우로 뻗는다.
 * value가 null이면 막대 없이 [확인 필요]만 적는다.
 * @param {{bars:Array<{label:string, value:number|null}>, width:number, height:number}} opts
 */
export function barChart({ bars = [], width = 400, height = 140 } = {}) {
  const L = 62;                 // 라벨 영역
  const R = width - 46;         // 값 표기 영역
  const rowH = bars.length ? Math.min(20, (height - 14) / bars.length) : 20;
  const nums = bars.map((b) => b.value).filter((v) => Number.isFinite(v));
  const maxAbs = Math.max(1, ...nums.map((v) => Math.abs(v))); // 전부 0이어도 1
  const mid = r1((L + R) / 2);
  const half = (R - L) / 2;

  const parts = [`<svg class="chart bars" viewBox="0 0 ${width} ${height}" role="img">`];
  parts.push(`<line x1="${mid}" y1="8" x2="${mid}" y2="${r1(8 + rowH * bars.length)}" class="axis"/>`);

  bars.forEach((b, i) => {
    const yTop = r1(10 + i * rowH);
    parts.push(`<text x="${L - 6}" y="${r1(yTop + rowH * 0.62)}" text-anchor="end" class="blabel">${esc(b.label)}</text>`);
    if (!Number.isFinite(b.value)) {
      parts.push(`<text x="${mid + 4}" y="${r1(yTop + rowH * 0.62)}" class="tbd">[확인 필요]</text>`);
      return;
    }
    const w = r1((Math.abs(b.value) / maxAbs) * half);
    const x = b.value < 0 ? r1(mid - w) : mid;
    parts.push(
      `<rect class="bar ${b.value < 0 ? "neg" : "pos"}" x="${x}" y="${r1(yTop + rowH * 0.18)}" width="${Math.max(w, 0.5)}" height="${r1(rowH * 0.5)}"/>`
    );
    const sign = b.value > 0 ? "+" : "";
    parts.push(
      `<text x="${R + 4}" y="${r1(yTop + rowH * 0.62)}" class="bval">${esc(sign + b.value.toFixed(2))}%</text>`
    );
  });
  parts.push(`</svg>`);
  return parts.join("");
}
