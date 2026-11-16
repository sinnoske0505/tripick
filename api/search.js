// 제품 이름으로 직접 찾기 (못 찾았을 때 화면). AI를 쓰지 않는다.
// 낱말이 모두 들어 있는 제품을 먼저, 그다음 많이 들어 있는 순서. 하나도 안 맞으면 글자 겹침으로.
// GET /api/search?q=키워드 → { results: [{ id, name, vol, yen, img }] }
import { getDb, productImages } from '../lib/products.js';
import { shortlist, normalize } from '../lib/shortlist.js';
import { sendJson } from '../lib/http.js';

const out = (p) => ({ id: p.id, name: p.name, vol: p.vol, yen: p.yen, img: productImages(p.jan)[0] || '' });

export default async function handler(req, res) {
  const q = String(new URL(req.url, 'http://x').searchParams.get('q') || '').trim().slice(0, 60);
  if (!q) return sendJson(res, 200, { results: [] });
  const db = await getDb();
  const words = q.split(/\s+/).map(normalize).filter(Boolean);
  const scored = db.products
    .map((p) => {
      const text = normalize(`${p.brand} ${p.name} ${p.name_site}`);
      return { p, hit: words.filter((w) => text.includes(w)).length };
    })
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.hit - a.hit);
  let results = scored.filter((x) => x.hit === scored[0]?.hit).slice(0, 6).map((x) => out(x.p));
  if (!results.length) results = shortlist(db, { read_text: q, product_name: q, keywords: q.split(/\s+/) }, 6).map(({ p }) => out(p));
  return sendJson(res, 200, { results });
}
