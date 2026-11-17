// .env 로더 — 외부 의존성 없이 상위 폴더의 .env를 찾아 읽는다.
// 우선순위: 이미 설정된 process.env > .env 파일
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function findEnvFile(startDir) {
  let dir = startDir;
  for (let i = 0; i < 5; i += 1) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * .env가 있으면 읽어 process.env에 채운다.
 * 파일이 없는 것은 오류가 아니다 — CI는 환경변수로 키를 직접 주입한다.
 * 키가 실제로 없는지는 쓰는 쪽(getApiKey)에서 판단한다.
 */
export function loadEnv() {
  const envPath = findEnvFile(HERE);
  if (!envPath) return process.env;
  const text = fs.readFileSync(envPath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
  return process.env;
}
