import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { extractBai, pickBaiArticle, collectAir } from "../lib/airIndex.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const readFixture = (n) => fs.readFileSync(path.join(HERE, "..", "fixtures", n), "utf8");

const articles = [
  { title: "Korean Air cargo volumes rise", link: "https://example.com/a", desc: "" },
  { title: "Airfreight rates rise for third consecutive week globally", link: "https://example.com/b", desc: "" },
  { title: "Port congestion in Europe", link: "https://example.com/c", desc: "" },
];

test("전주 대비만 실린 기사에서 증감률을 뽑는다", () => {
  const r = extractBai(readFixture("bai-pct-only.txt"));
  assert.equal(r.BAI00.changePct, 3.9);
  assert.equal(r.BAI30.changePct, 4.2);
  assert.equal(r.BAI80.changePct, 2.9);
});

test("절대 지수값이 없으면 value는 null이다 (추정하지 않는다)", () => {
  const r = extractBai(readFixture("bai-pct-only.txt"));
  assert.equal(r.BAI00.value, null);
});

test("절대 지수값이 실린 기사에서는 값도 함께 뽑는다", () => {
  const r = extractBai(readFixture("bai-with-level.txt"));
  assert.equal(r.BAI00.value, 2924);
  assert.equal(r.BAI00.changePct, 6.6);
  assert.equal(r.BAI30.value, 5168);
  assert.equal(r.BAI80.value, 6485);
});

// Review Focus 3 — 유사 숫자가 섞인 경우
test("라벨 없는 숫자가 많아도 BAI00에 붙은 값만 취한다", () => {
  const t = "Air cargo demand rose 7.7% and load factors hit 47.9%. The BAI00 gained +6.6% WoW.";
  const r = extractBai(t);
  assert.equal(r.BAI00.changePct, 6.6);
  assert.equal(r.BAI00.value, null);
});

test("BAI 언급이 전혀 없으면 전부 null이다", () => {
  const r = extractBai("항공 운임이 올랐다는 소식이다.");
  assert.equal(r.BAI00.value, null);
  assert.equal(r.BAI00.changePct, null);
});

test("AI는 기사를 고르기만 하고 숫자는 본문에서 나온다", async () => {
  const generate = async () => "2";
  const picked = await pickBaiArticle(articles, { generate });
  assert.equal(picked.link, "https://example.com/b");
});

test("AI가 범위 밖 번호를 답하면 null을 돌려준다", async () => {
  const generate = async () => "99";
  assert.equal(await pickBaiArticle(articles, { generate }), null);
});

test("AI가 숫자가 아닌 답을 해도 터지지 않고 null을 돌려준다", async () => {
  const generate = async () => "없음";
  assert.equal(await pickBaiArticle(articles, { generate }), null);
});

test("AI 호출이 실패해도 예외를 던지지 않는다", async () => {
  const generate = async () => {
    throw new Error("Gemini API 오류 503");
  };
  assert.equal(await pickBaiArticle(articles, { generate }), null);
});

test("collectAir 결과에는 출처 링크가 함께 담긴다", async () => {
  const generate = async () => "2";
  const fetchText = async () => readFixture("bai-with-level.txt");
  const r = await collectAir(articles, { generate, fetchText });
  assert.equal(r.sourceUrl, "https://example.com/b");
  assert.equal(r.BAI00.value, 2924);
});

test("기사를 못 고르면 값은 비고 사유가 남는다", async () => {
  const generate = async () => "없음";
  const fetchText = async () => "";
  const r = await collectAir(articles, { generate, fetchText });
  assert.equal(r.BAI00.value, null);
  assert.equal(r.BAI00.changePct, null);
  assert.equal(r.sourceUrl, null);
  assert.match(r.note, /기사/);
});
