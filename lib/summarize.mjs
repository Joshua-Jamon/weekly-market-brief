// Gemini로 헤드라인 한 줄 요약을 만든다.
// 원칙: 기사에 없는 수치·전망은 만들어내지 않는다. 실패한 건은 [확인 필요]로 남긴다.
import { generateText } from "./gemini.mjs";
import { withRetry } from "./retry.mjs";

const SYSTEM = [
  "당신은 한국 포워딩·해운 영업팀의 시황 담당자다.",
  "주어진 해운 뉴스 헤드라인을 영업 담당자가 아침에 훑어볼 수 있게 한 줄로 요약한다.",
  "규칙:",
  "1) 요약은 한국어 한 문장, 40~60자. 명사형 종결(~, ~함, ~전망)로 간결하게 쓴다.",
  "2) 제목과 요약문에 없는 수치·날짜·전망을 절대 지어내지 않는다. 근거가 없으면 사실만 적는다.",
  "3) 영문 기사도 한국어로 요약한다.",
  "4) 분류는 다음 중 하나만 고른다: 운임, 물동량, 선사동향, 항만/터미널, 규제/환경, 지정학/항로, 기타",
  "5) 반드시 JSON 배열만 출력한다. 형식: [{\"no\":1,\"summary\":\"...\",\"category\":\"운임\"}]",
].join("\n");

function buildPrompt(batch) {
  const lines = batch.map((it, i) => {
    const desc = it.desc ? ` / 발췌: ${it.desc.slice(0, 180)}` : "";
    return `${i + 1}. [${it.outlet}] ${it.title}${desc}`;
  });
  return `다음 ${batch.length}건을 각각 한 줄로 요약하라.\n\n${lines.join("\n")}`;
}

function parseJsonArray(text) {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) throw new Error("JSON 배열을 찾지 못함");
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * @param {Array} items 수집된 헤드라인
 * @param {{batchSize?:number, onProgress?:Function}} [opts]
 * @returns {Promise<{items:Array, failed:number, errors:Array}>}
 */
export async function summarizeAll(items, opts = {}) {
  const { batchSize = 8, onProgress } = opts;
  const errors = [];
  const out = items.map((it) => ({ ...it, summary: "[확인 필요]", category: "[확인 필요]" }));

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    try {
      const text = await withRetry(
        () =>
          generateText(buildPrompt(batch), {
            system: SYSTEM,
            temperature: 0.2,
            json: true,
            maxOutputTokens: 2048,
          }),
        {
          tries: 4,
          baseMs: 3000,
          onRetry: (r) =>
            console.warn(`\n      · 요약 재시도 ${r.attempt}/${r.tries} (${i + 1}~${i + batch.length}번): ${r.waitMs}ms 대기`),
        }
      );
      const arr = parseJsonArray(text);
      for (const row of arr) {
        const idx = i + (Number(row.no) - 1);
        if (!Number.isInteger(idx) || idx < i || idx >= i + batch.length) continue;
        if (typeof row.summary === "string" && row.summary.trim()) {
          out[idx].summary = row.summary.trim();
        }
        if (typeof row.category === "string" && row.category.trim()) {
          out[idx].category = row.category.trim();
        }
      }
    } catch (e) {
      errors.push({ batch: `${i + 1}~${i + batch.length}번`, message: e.message });
    }
    onProgress?.(Math.min(i + batchSize, items.length), items.length);
  }

  const failed = out.filter((r) => r.summary === "[확인 필요]").length;
  return { items: out, failed, errors };
}
