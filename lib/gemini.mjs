// Gemini API 클라이언트 (의존성 없음 / Node 18+ 내장 fetch 사용)
import { loadEnv } from "./env.mjs";

// import 시점에 터지지 않게 한다. .env가 없어도(CI) 모듈은 정상적으로 로드되고,
// 키가 없다는 사실은 실제로 호출할 때 드러난다 — 설계 §7.1 "AI가 죽어도 페이지는 발행된다".
try {
  loadEnv();
} catch {
  /* .env 읽기 실패는 무시한다. 키는 환경변수로도 올 수 있다. */
}

// ── 모델 등록 ──────────────────────────────────────────────
// 기본 모델: Gemini 3.5 Flash Lite
export const MODELS = {
  "flash-lite": "gemini-3.5-flash-lite", // 기본값
};

export const DEFAULT_MODEL = MODELS["flash-lite"];

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export function getApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY가 설정되어 있지 않습니다. 프로젝트 루트의 .env를 확인하세요.");
  }
  return key;
}

/**
 * Gemini에 프롬프트를 보내고 텍스트 응답을 돌려준다.
 * @param {string} prompt
 * @param {{model?:string, system?:string, temperature?:number, maxOutputTokens?:number, json?:boolean, signal?:AbortSignal}} [options]
 * @returns {Promise<string>}
 */
export async function generateText(prompt, options = {}) {
  const {
    model = DEFAULT_MODEL,
    system,
    temperature,
    maxOutputTokens,
    json = false,
    signal,
  } = options;

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const generationConfig = {};
  if (temperature !== undefined) generationConfig.temperature = temperature;
  if (maxOutputTokens !== undefined) generationConfig.maxOutputTokens = maxOutputTokens;
  if (json) generationConfig.responseMimeType = "application/json";
  if (Object.keys(generationConfig).length) body.generationConfig = generationConfig;

  const res = await fetch(`${API_BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": getApiKey(),
    },
    body: JSON.stringify(body),
    signal,
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Gemini API 오류 ${res.status} (model=${model})\n${raw}`);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`응답 JSON 파싱 실패 (model=${model})\n${raw}`);
  }

  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("").trim();
  if (!text) {
    const reason = data?.candidates?.[0]?.finishReason ?? data?.promptFeedback?.blockReason ?? "unknown";
    throw new Error(`빈 응답 (finishReason=${reason})\n${raw}`);
  }
  return text;
}

export default { MODELS, DEFAULT_MODEL, generateText, getApiKey };
