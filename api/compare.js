// 한국 판매가 비교 (네이버 쇼핑 검색 공식 API 사용)
// GET /api/compare?productId=35          → 올리브영 판매처가 있으면 그 가격
// GET /api/compare?productId=35&debug=1  → 검색에 잡힌 판매처 목록까지 (연결 확인용)
// 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 이 없으면 configured:false 로 답한다.
import { getDb, findProduct } from '../lib/products.js';
import { normalize } from '../lib/shortlist.js';
import { sendJson, handleError } from '../lib/http.js';

const cache = new Map(); // productId → { at, body }
const TTL = 6 * 60 * 60 * 1000;

const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '');
const brandCore = (b) => String(b || '').split('(')[0].trim();

function bigrams(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}
function similarity(a, b) {
  const A = bigrams(normalize(a)), B = bigrams(normalize(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const x of A) if (B.has(x)) hit++;
  return hit / Math.sqrt(A.size * B.size);
}

async function naverShop(query) {
  const url = `https://openapi.naver.com/v1/search/shop.json?display=40&sort=sim&query=${encodeURIComponent(query)}`;
  const r = await fetch(url, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
    },
  });
  if (!r.ok) {
    const err = new Error(`naver ${r.status}`);
    err.status = r.status === 401 ? 401 : r.status;
    throw err;
  }
  const j = await r.json();
  return (j.items || []).map((it) => ({
    title: stripTags(it.title),
    price: Number(it.lprice) || 0,
    mall: it.mallName || '',
    link: it.link,
    brand: it.brand || '',
  }));
}

export default async function handler(req, res) {
  try {
    if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
      return sendJson(res, 200, { configured: false });
    }
    const u = new URL(req.url, 'http://x');
    const id = u.searchParams.get('productId');
    const debug = u.searchParams.get('debug') === '1';
    const db = await getDb();
    const p = findProduct(db, id);
    if (!p) return sendJson(res, 404, { error: '제품이 없어요.' });

    const hit = cache.get(id);
    if (!debug && hit && Date.now() - hit.at < TTL) return sendJson(res, 200, hit.body);

    const query = `${brandCore(p.brand)} ${p.name.replace(brandCore(p.brand), '')}`.trim();
    const items = await naverShop(query);
    const target = `${p.name} ${p.vol || ''}`;
    const scored = items
      .map((it) => ({ ...it, score: Math.round(similarity(target, it.title) * 100) / 100 }))
      .sort((a, b) => b.score - a.score);

    const oy = scored.filter((it) => /올리브영|olive\s*young/i.test(it.mall) && it.score >= 0.45);
    const body = {
      configured: true,
      query,
      oliveyoung: oy[0] ? { title: oy[0].title, price: oy[0].price, link: oy[0].link, score: oy[0].score } : null,
      checkedAt: new Date().toISOString(),
    };
    if (debug) body.malls = scored.slice(0, 40).map(({ title, price, mall, score }) => ({ mall, price, score, title }));
    else cache.set(id, { at: Date.now(), body });
    return sendJson(res, 200, body);
  } catch (err) {
    return handleError(res, err);
  }
}
