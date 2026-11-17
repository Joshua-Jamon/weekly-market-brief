// 해운 시황 뉴스 RSS 수집기 (외부 의존성 없음)
// 국내는 구글뉴스 RSS 키워드 검색, 해외는 매체 공식 RSS를 사용한다.

import { withRetry } from "./retry.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ShippingDigest/1.0";

const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;

export const FEEDS = [
  { source: "구글뉴스(국내)", topic: "해운 운임", url: gnews("해운 운임 when:7d") },
  { source: "구글뉴스(국내)", topic: "컨테이너선 시황", url: gnews("컨테이너선 시황 when:7d") },
  { source: "구글뉴스(국내)", topic: "SCFI 운임지수", url: gnews("SCFI 운임지수 when:7d") },
  { source: "구글뉴스(국내)", topic: "해상운송 물동량", url: gnews("해상운송 물동량 when:7d") },
  { source: "구글뉴스(항공)", topic: "항공화물 운임", url: gnews("항공화물 운임 when:7d") },
  { source: "구글뉴스(항공)", topic: "항공화물 시황", url: gnews("항공화물 시황 when:7d") },
  { source: "구글뉴스(항공)", topic: "BAI 항공운임지수", url: gnews("Baltic Air Freight Index when:7d") },
  { source: "Splash247", topic: "글로벌 해운", url: "https://splash247.com/feed/" },
  { source: "gCaptain", topic: "글로벌 해운", url: "https://gcaptain.com/feed/" },
  { source: "Container News", topic: "컨테이너 시황", url: "https://container-news.com/feed/" },
];

const ENTITIES = [
  [/<!\[CDATA\[([^]*?)\]\]>/g, "$1"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
  [/&apos;/g, "'"],
  [/&nbsp;/g, " "],
];

function decodeEntities(s) {
  let out = s;
  for (const [re, rep] of ENTITIES) out = out.replace(re, rep);
  out = out.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
  return out.replace(/&amp;/g, "&");
}

/** 블록 안에서 특정 태그의 텍스트를 뽑는다 (정규식 이스케이프 의존 없음) */
function pick(block, tag) {
  const openIdx = block.toLowerCase().indexOf(`<${tag}`);
  if (openIdx === -1) return "";
  const gt = block.indexOf(">", openIdx);
  if (gt === -1) return "";
  const closeIdx = block.toLowerCase().indexOf(`</${tag}>`, gt);
  if (closeIdx === -1) return "";
  const inner = block.slice(gt + 1, closeIdx);
  return decodeEntities(inner)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseItems(xml) {
  const blocks = xml.match(/<item[\s>][^]*?<\/item>/gi) || [];
  return blocks.map((b) => ({
    title: pick(b, "title"),
    link: pick(b, "link"),
    pubDate: pick(b, "pubdate"),
    outlet: pick(b, "source"),
    desc: pick(b, "description").slice(0, 400),
  }));
}

/** 제목 정규화 — 중복 판정용 */
function normTitle(t) {
  return t.toLowerCase().replace(/[^0-9a-z가-힣]/g, "").slice(0, 50);
}

/**
 * 모든 피드를 수집해 기간 내 기사만 돌려준다.
 * 구글뉴스는 동시 요청 시 429가 나므로 순차 호출한다.
 * @param {{sinceMs:number, perFeedLimit?:number, totalLimit?:number}} opts
 */
export async function collectHeadlines({ sinceMs, perFeedLimit = 12, totalLimit = 40 }) {
  const errors = [];
  const results = [];
  const perFeedCount = [];

  for (const feed of FEEDS) {
    try {
      const xml = await withRetry(
        async () => {
          const res = await fetch(feed.url, {
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(20000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.text();
        },
        {
          tries: 4,
          baseMs: 2000,
          label: feed.topic,
          onRetry: (r) => console.warn(`      · 재시도 ${r.attempt}/${r.tries}: ${feed.source} ${feed.topic} (${r.message}) ${r.waitMs}ms 대기`),
        }
      );
      const items = parseItems(xml);
      let kept = 0;
      for (const it of items) {
        if (!it.title || !it.link) continue;
        const ts = it.pubDate ? Date.parse(it.pubDate) : NaN;
        if (Number.isFinite(ts) && ts < sinceMs) continue;
        results.push({
          source: feed.source,
          topic: feed.topic,
          outlet: it.outlet || feed.source,
          title: it.title,
          link: it.link,
          publishedMs: Number.isFinite(ts) ? ts : null,
          desc: it.desc,
        });
        kept += 1;
        if (kept >= perFeedLimit) break;
      }
      perFeedCount.push({ feed: `${feed.source} / ${feed.topic}`, count: kept });
    } catch (e) {
      errors.push({ feed: `${feed.source} / ${feed.topic}`, message: e.message });
      perFeedCount.push({ feed: `${feed.source} / ${feed.topic}`, count: 0 });
    }
    await new Promise((r) => setTimeout(r, 400)); // 레이트리밋 회피
  }

  // 중복 제거 (제목 기준) 후 최신순 정렬
  const seen = new Set();
  const deduped = [];
  for (const r of results.sort((a, b) => (b.publishedMs ?? 0) - (a.publishedMs ?? 0))) {
    const key = normTitle(r.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(r);
  }

  return { items: deduped.slice(0, totalLimit), errors, perFeedCount, rawCount: results.length };
}
