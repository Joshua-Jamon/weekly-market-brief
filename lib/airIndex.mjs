// 항공 BAI 수집 — 설계 §4.2.1
// AI는 "어느 기사가 그 주 발표분인가"만 고른다. 숫자는 이 파일의 정규식이 기사 원문에서 직접 뽑는다.
// AI에게 숫자를 말하게 하지 않는 것이 이 모듈의 존재 이유다.
import { generateText } from "./gemini.mjs";

const CODES = ["BAI00", "BAI30", "BAI80"];
const EMPTY = () => ({ value: null, changePct: null });

/**
 * 기사 본문에서 BAI 지수값과 전주 대비를 뽑는다. AI를 쓰지 않는다.
 * 무료로 공개되는 주간 기사 대부분은 절대 지수값 없이 증감률만 싣는다 →
 * 값이 없으면 value는 null로 남기고 증감률만 채운다. 추정하지 않는다.
 */
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** 기사 본문의 기준일 — "As of November 9, 2026" / "2026년 11월 9일" */
function extractAsOf(s) {
  const en = s.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s+(\d{4})/i);
  if (en) {
    const m = MONTHS.indexOf(en[1].toLowerCase()) + 1;
    return `${en[3]}-${String(m).padStart(2, "0")}-${String(Number(en[2])).padStart(2, "0")}`;
  }
  const ko = s.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (ko) return `${ko[1]}-${String(Number(ko[2])).padStart(2, "0")}-${String(Number(ko[3])).padStart(2, "0")}`;
  const iso = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return iso ? iso[1] : null;
}

const DOWN = /\b(fell|dropped|declined|slipped|lost|down|eased)\b|하락|내렸|떨어/i;
const WEEKLY = /\b(WoW|week[- ]over[- ]week|week[- ]on[- ]week|over the week|for the week|in the week)\b|전주\s*대비|주간/i;
const YEARLY = /\b(YoY|year[- ]over[- ]year|year[- ]on[- ]year)\b|전년\s*대비/i;

/**
 * 기사 본문에서 BAI 지수값과 전주 대비를 뽑는다. AI를 쓰지 않는다.
 *
 * 확신할 수 없으면 숫자를 버린다 (검토 지적 Critical 2):
 *  · 뒤에 %가 붙은 수는 지수값이 아니다 (적재율·수요 증감 등)
 *  · 증감률은 '전주' 맥락이 같은 문장에 있을 때만 채택한다 (전년 대비를 전주로 싣지 않는다)
 *  · 하락 표현이면 음수로 돌린다
 */
export function extractBai(text) {
  const out = Object.fromEntries(CODES.map((c) => [c, EMPTY()]));
  out.asOf = null;
  if (!text) return out;
  const s = String(text).replace(/\s+/g, " ");
  out.asOf = extractAsOf(s);

  for (const code of CODES) {
    // 코드 등장 위치부터 뒤로 220자까지만 본다 — 멀리 떨어진 남의 숫자를 집지 않기 위함
    const at = s.indexOf(code);
    if (at === -1) continue;
    const win = s.slice(at, at + 220);

    // ── 절대 지수값 ──
    // "stood at 2,924.00" / "was at 5,168" / "reached 6,485" / "는 2,924로"
    // 바로 뒤에 %가 오면 지수값이 아니다 (적재율·증감률).
    const level =
      win.match(/(?:stood at|was at|reached|came in at|registered)\s+([\d,]+(?:\.\d+)?)(?!\s*%)/i) ||
      win.match(/(?:는|은|가|이)?\s*([\d,]+(?:\.\d+)?)\s*(?:로|으로|포인트|pt)(?!\s*%)/);
    if (level) {
      const n = Number(level[1].replace(/,/g, ""));
      if (Number.isFinite(n)) out[code].value = n;
    }

    // ── 전주 대비 ──
    // 창 안에서 퍼센트 후보를 모으고, '전주' 맥락이 붙은 것만 고른다.
    // 판정은 숫자 '바로 앞뒤의 꼬리말'로만 한다. 멀리 있는 다른 기간 표현에 휘둘리지 않는다.
    const candidates = [...win.matchAll(/([+-]?\d+(?:\.\d+)?)\s*(?:%|percent|퍼센트)/gi)].map((m) => {
      const before = win.slice(Math.max(0, m.index - 20), m.index);
      const after = win.slice(m.index + m[0].length, m.index + m[0].length + 30);
      return { num: Number(m[1]), raw: m[0], before, after, ctx: `${before}${m[0]}${after}` };
    });
    // 뒤쪽에서 '먼저 나오는' 기간 표현이 그 숫자의 기간이다.
    // "+2.9% WoW to leave it at +19.2% YoY"에서 2.9는 주간, 19.2는 연간이다.
    const weekly = candidates.filter((c) => {
      const w = c.after.search(WEEKLY);
      const y = c.after.search(YEARLY);
      if (w !== -1 && (y === -1 || w < y)) return true;
      if (y !== -1 && (w === -1 || y < w)) return false;
      return WEEKLY.test(c.before) && !YEARLY.test(c.before);
    });
    const pick = weekly[0] ?? null;
    if (pick && Number.isFinite(pick.num)) {
      const explicitSign = /^[+-]/.test(pick.raw.trim());
      const negative = explicitSign ? pick.num < 0 : DOWN.test(pick.ctx);
      out[code].changePct = negative ? -Math.abs(pick.num) : Math.abs(pick.num);
    }
  }
  return out;
}

/**
 * 기사 목록에서 그 주 BAI 발표분을 고른다. AI의 역할은 번호를 고르는 것뿐이다.
 * 유효 범위 밖 응답·비숫자 응답·호출 실패는 모두 null (추정하지 않는다).
 * @param {Array<{title:string, link:string}>} articles
 * @param {{generate?:Function}} [opts] generate는 테스트에서 주입
 */
export async function pickBaiArticle(articles, { generate = generateText } = {}) {
  if (!articles?.length) return null;
  const list = articles.map((a, i) => `${i + 1}. ${a.title}`).join("\n");
  const prompt = [
    "아래는 뉴스 기사 제목 목록이다.",
    "이 중 '항공화물 운임지수(Baltic Air Freight Index / BAI / TAC Index)의 주간 발표'를 다룬 기사가 있으면 그 번호만 답하라.",
    "없으면 '없음'이라고만 답하라. 숫자나 설명을 덧붙이지 마라.",
    "",
    list,
  ].join("\n");

  let answer;
  try {
    answer = await generate(prompt, { temperature: 0 });
  } catch {
    return null; // AI가 죽어도 페이지 생성을 막지 않는다
  }

  const m = String(answer).match(/\d+/);
  if (!m) return null;
  const idx = Number(m[0]) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= articles.length) return null;
  return articles[idx];
}

/**
 * 기사 선별 → 본문 수집 → 숫자 추출까지. 실패해도 예외 대신 note를 남긴다.
 * 반환은 평면 구조 {BAI00, BAI30, BAI80, sourceUrl, note} — render가 air.BAI00.value로 읽는다.
 */
export async function collectAir(articles, { generate = generateText, fetchText } = {}) {
  const empty = Object.fromEntries(CODES.map((c) => [c, EMPTY()]));

  const picked = await pickBaiArticle(articles, { generate });
  if (!picked) {
    return { ...empty, sourceUrl: null, note: "그 주 BAI 발표 기사를 찾지 못했습니다" };
  }

  let body;
  try {
    body = await fetchText(picked.link);
  } catch (e) {
    return { ...empty, sourceUrl: picked.link, note: `기사 본문을 읽지 못했습니다 (${e.message})` };
  }

  const values = extractBai(`${picked.title} ${picked.desc ?? ""} ${body ?? ""}`);
  const nothing = CODES.every((c) => values[c].value === null && values[c].changePct === null);
  return {
    ...values,
    sourceUrl: picked.link,
    note: nothing ? "기사에서 BAI 수치를 찾지 못했습니다" : null,
  };
}
