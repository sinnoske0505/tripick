// 제품 이름으로 직접 찾기 (못 찾았을 때 화면). AI를 쓰지 않고 글자 겹침으로 고른다.
// GET /api/search?q=키워드 → { results: [{ id, name, vol, yen, img }] }
import { getDb, productImages } from '../lib/products.js';
import { shortlist } from '../lib/shortlist.js';
import { sendJson } from '../lib/http.js';

export default async function handler(req, res) {
  const q = String(new URL(req.url, 'http://x').searchParams.get('q') || '').trim().slice(0, 60);
  if (!q) return sendJson(res, 200, { results: [] });
  const db = await getDb();
  const results = shortlist(db, { read_text: q, product_name: q, keywords: q.split(/\s+/) }, 6)
    .map(({ p }) => ({ id: p.id, name: p.name, vol: p.vol, yen: p.yen, img: productImages(p.jan)[0] || '' }));
  return sendJson(res, 200, { results });
}
