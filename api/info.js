// 시작 화면에서 부르는 정보: 오늘 환율, 제품 수, 데이터 출처(구글 시트/내장)
// ?product=번호 를 붙이면 그 제품 정보를 돌려준다 (저장 목록에서 다시 열 때).
import { getDb, findProduct, publicProduct } from '../lib/products.js';
import { sendJson } from '../lib/http.js';

export default async function handler(req, res) {
  const db = await getDb();
  const url = new URL(req.url, 'http://x');
  const id = url.searchParams.get('product');
  if (id) {
    const p = findProduct(db, id);
    return p ? sendJson(res, 200, { product: publicProduct(db, p) }) : sendJson(res, 404, { error: '제품이 없어요.' });
  }
  return sendJson(res, 200, {
    rate100: db.meta.rate100,
    rateDate: db.meta.rateDate,
    productCount: db.products.length,
    source: db.meta.source,
    dataSource: db.meta.dataSource,
    sheetError: db.meta.sheetError || undefined,
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
