// 해운 지수 수집 — forwarder.kr(SCFI·CCFI·KCCI·BDI) + KOBC(KCCI 항로별·시계열)
// 규칙: 값을 못 찾으면 예외가 아니라 null. 추정하지 않는다. (설계 N1·N3)
import { withRetry } from "./retry.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

export const SOURCES = {
  forwarder: "https://www.forwarder.kr/freight/index?device=pc",
  kcci: "https://www.kobc.or.kr/ebz/shippinginfo/kcci/gridList.do?mId=0304000000",
  timeseries: "https://www.kobc.or.kr/ebz/shippinginfo/timeseries/gridList.do?mId=0304000000",
};

/** 화면에 싣는 항로 6개 — 설계 L6 확정값 */
export const LANES = ["미주서안", "미주동안", "유럽", "동남아", "일본", "중국"];

/** 한국어 항로명 → KOBC 코드 */
const LANE_CODE = {
  미주서안: "KUWI",
  미주동안: "KUEI",
  유럽: "KNEI",
  동남아: "KSEI",
  일본: "KJI",
  중국: "KCI",
};

const EMPTY_VALUE = () => ({ value: null, changePct: null, asOf: null });

const stripTags = (s) => String(s).replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** "3,572.33" → 3572.33 / 찾을 수 없으면 null */
export function parseNumber(text) {
  if (text === null || text === undefined) return null;
  const m = String(text).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

/** 증감률(%)만 뽑는다. 괄호 안의 퍼센트를 우선하고, 없으면 ▲▼ 부호가 붙은 퍼센트를 본다. */
export function parseChange(text) {
  if (text === null || text === undefined) return null;
  const s = stripTags(text).replace(/,/g, "");
  const paren = s.match(/\(\s*(-?\+?\d+(?:\.\d+)?)\s*%\s*\)/);
  if (paren) return Number(paren[1]);
  const plain = s.match(/([▲▼]?)\s*(-?\+?\d+(?:\.\d+)?)\s*%/);
  if (plain) {
    const n = Number(plain[2]);
    return plain[1] === "▼" ? -Math.abs(n) : n;
  }
  return null;
}

/**
 * forwarder.kr 운임지수 카드에서 네 지수를 뽑는다.
 * 카드 구조: fkt-fi-code / fkt-fi-val / fkt-fi-chg / fkt-fi-date
 */
export function parseForwarder(html) {
  const out = { SCFI: EMPTY_VALUE(), CCFI: EMPTY_VALUE(), KCCI: EMPTY_VALUE(), BDI: EMPTY_VALUE() };
  const cards = String(html).match(/<a[^>]*class="[^"]*fkt-fi-card[^"]*"[^>]*>[\s\S]*?<\/a>/g) || [];
  for (const card of cards) {
    const code = stripTags((card.match(/class="fkt-fi-code"[^>]*>([\s\S]*?)<\/span>/) || [])[1] ?? "");
    if (!(code in out)) continue;
    const val = (card.match(/class="fkt-fi-val"[^>]*>([\s\S]*?)<\/strong>/) || [])[1];
    const chg = (card.match(/class="fkt-fi-chg[^"]*"[^>]*>([\s\S]*?)<\/span>/) || [])[1];
    const date = stripTags((card.match(/class="fkt-fi-date"[^>]*>([\s\S]*?)<\/span>/) || [])[1] ?? "");
    out[code] = {
      value: parseNumber(val),
      changePct: parseChange(chg),
      asOf: (date.match(/\d{4}-\d{2}-\d{2}/) || [null])[0],
    };
  }
  return out;
}

/** 표의 모든 행을 셀 배열로 돌려준다 (rowspan 때문에 셀 수가 행마다 다를 수 있다) */
function tableRows(html) {
  return (String(html).match(/<tr[\s>][\s\S]*?<\/tr>/g) || []).map((tr) =>
    [...tr.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => stripTags(m[1]))
  );
}

/** 코드가 들어 있는 행을 찾아 마지막 3칸(현재·직전·증감)을 읽는다 */
function rowByCode(rows, code) {
  const row = rows.find((cells) => cells.includes(code));
  if (!row || row.length < 3) return { value: null, changePct: null };
  return {
    value: parseNumber(row[row.length - 3]),
    changePct: parseChange(row[row.length - 1]),
  };
}

export function parseKcci(html) {
  const rows = tableRows(html);
  const asOf = (String(html).match(/Current Index[\s\S]{0,200}?(\d{4}-\d{2}-\d{2})/) || [null, null])[1];
  const comp = rowByCode(rows, "KCCI");
  const lanes = {};
  for (const name of LANES) {
    const r = rowByCode(rows, LANE_CODE[name]);
    lanes[name] = { ...r, asOf };
  }
  return { composite: { ...comp, asOf }, lanes };
}

/** 시계열 표 — 1열 날짜, 2열 KCCI 종합. 오래된 순으로 돌려준다. */
export function parseTimeseries(html) {
  const out = [];
  for (const cells of tableRows(html)) {
    if (cells.length < 2) continue;
    const date = (cells[0].match(/^\d{4}-\d{2}-\d{2}$/) || [null])[0];
    if (!date) continue;
    const value = parseNumber(cells[1]);
    if (value === null) continue;
    out.push({ date, value });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

async function getText(fetchImpl, url, tries) {
  return withRetry(
    async () => {
      const res = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(25000) });
      if (typeof res === "string") return res; // 테스트용 주입
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    { tries, baseMs: 2000, label: url }
  );
}

/**
 * 세 출처를 각각 독립적으로 수집한다. 하나가 죽어도 나머지는 돌려준다. (설계 7.1)
 * @param {{fetchImpl?:Function, tries?:number}} [opts]
 */
export async function fetchIndices({ fetchImpl = fetch, tries = 4 } = {}) {
  const errors = [];
  let indices = { SCFI: EMPTY_VALUE(), CCFI: EMPTY_VALUE(), KCCI: EMPTY_VALUE(), BDI: EMPTY_VALUE() };
  let lanes = Object.fromEntries(LANES.map((n) => [n, EMPTY_VALUE()]));
  let series = [];

  try {
    indices = parseForwarder(await getText(fetchImpl, SOURCES.forwarder, tries));
  } catch (e) {
    errors.push({ source: "forwarder.kr", message: e.message });
  }

  try {
    const kcci = parseKcci(await getText(fetchImpl, SOURCES.kcci, tries));
    lanes = kcci.lanes;
    // forwarder에서 KCCI를 못 얻었으면 KOBC 값으로 채운다 (둘 다 출처가 적은 값이다)
    if (indices.KCCI.value === null && kcci.composite.value !== null) indices.KCCI = kcci.composite;
  } catch (e) {
    errors.push({ source: "KOBC KCCI", message: e.message });
  }

  try {
    series = parseTimeseries(await getText(fetchImpl, SOURCES.timeseries, tries));
  } catch (e) {
    errors.push({ source: "KOBC 시계열", message: e.message });
  }

  return { indices, lanes, series, errors };
}
