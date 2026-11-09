// 시작 화면에서 부르는 정보: 오늘 환율, 제품 수, 그리고 저장 목록을 다시 열 때 필요한 제품 정보
import { meta, products, findProduct, publicProduct } from '../lib/products.js';
import { sendJson } from '../lib/http.js';

export default function handler(req, res) {
  const url = new URL(req.url, 'http://x');
  const id = url.searchParams.get('product');
  if (id) {
    const p = findProduct(id);
    return p ? sendJson(res, 200, { product: publicProduct(p) }) : sendJson(res, 404, { error: '제품이 없어요.' });
  }
  return sendJson(res, 200, {
    rate100: meta.rate100,
    rateDate: meta.rateDate,
    productCount: products.length,
    source: meta.source,
    collected: meta.collected,
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
