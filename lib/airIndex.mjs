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
export function extractBai(text) {
  const out = Object.fromEntries(CODES.map((c) => [c, EMPTY()]));
  if (!text) return out;
  const s = String(text).replace(/\s+/g, " ");

  for (const code of CODES) {
    // 코드 등장 위치부터 뒤로 220자까지만 본다 — 멀리 떨어진 남의 숫자를 집지 않기 위함
    const at = s.indexOf(code);
    if (at === -1) continue;
    const win = s.slice(at, at + 220);

    // 절대값: "stood at 2,924.00" / "was at 5,168.00" / "reached 6,485.00"
    const level = win.match(/(?:stood at|was at|reached|at)\s+([\d,]+(?:\.\d+)?)/i);
    if (level) {
      const n = Number(level[1].replace(/,/g, ""));
      if (Number.isFinite(n)) out[code].value = n;
    }

    // 증감률: 코드 뒤 첫 번째 퍼센트. "+6.6%" / "-12.0%" / "gained +4.2% WoW"
    const pct = win.match(/([+-]?\d+(?:\.\d+)?)\s*(?:%|percent)/i);
    if (pct) {
      const n = Number(pct[1]);
      if (Number.isFinite(n)) out[code].changePct = n;
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
