// 공개 저장소에는 금지어를 평문으로 두지 않는다.
// CI에서는 BANNED_WORDS 시크릿(쉼표 구분)으로 주입한다.
export const BANNED = (process.env.BANNED_WORDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
