// 일시적 오류(429/5xx/네트워크) 재시도 헬퍼 — 지수 백오프
const TRANSIENT = /\b(429|500|502|503|504)\b|timeout|ETIMEDOUT|ECONNRESET|fetch failed|aborted/i;

export function isTransient(err) {
  return TRANSIENT.test(String(err?.message ?? err));
}

/**
 * @param {Function} fn 실행 함수
 * @param {{tries?:number, baseMs?:number, label?:string, onRetry?:Function}} [opts]
 */
export async function withRetry(fn, opts = {}) {
  const { tries = 4, baseMs = 1500, label = "", onRetry } = opts;
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (e) {
      lastErr = e;
      if (attempt === tries || !isTransient(e)) break;
      const waitMs = baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 500);
      onRetry?.({ label, attempt, tries, waitMs, message: e.message });
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  throw lastErr;
}
