// 2차 촬영: 가격표 사진 → 읽고 판별하기
import { askWithImage } from '../lib/claude.js';
import { getDb, findProduct, yenToWon } from '../lib/products.js';
import { checkPriceTag } from '../lib/pricecheck.js';
import { sendJson, readBody, handleError } from '../lib/http.js';

const SYSTEM = `너는 일본 매장의 가격표(プライスカード)를 읽는다.
가격표에는 보통 세금 별도(税抜·本体価格)와 세금 포함(税込) 가격이 함께 적혀 있다.
숫자가 흐리거나 가려져 확실하지 않으면 legible을 false로 한다. 추측으로 숫자를 만들지 않는다.
반드시 JSON 하나만 답한다.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST만 됩니다.' });
  try {
    const { image, productId } = await readBody(req);
    const db = await getDb();
    const product = findProduct(db, productId);
    if (!product) return sendJson(res, 400, { error: '먼저 제품을 찍어주세요.' });

    const prompt = `비교할 제품: ${product.brand} / ${product.name} / 온라인몰 표기 "${product.name_site}" / 용량 ${product.vol}

이 가격표를 읽고 아래 JSON으로만 답해. 가격은 엔화 숫자만(쉼표 없이), 없으면 null.
{
  "tag_product_name": "가격표에 적힌 제품명 그대로",
  "tag_product_name_ko": "그 제품명의 한국어 번역",
  "tag_volume": "가격표에 적힌 용량·매수 (없으면 null)",
  "price_tax_included": 세금 포함 가격 또는 null,
  "price_tax_excluded": 세금 별도 가격 또는 null,
  "is_same_product": 비교할 제품과 같은 제품이면 true, 다르면 false,
  "is_same_volume": 용량이 같으면 true, 다르면 false, 가격표에 용량이 없으면 null,
  "legible": 가격 숫자가 또렷하게 읽혔으면 true
}`;
    const tag = await askWithImage({ dataUrl: image, system: SYSTEM, prompt, maxTokens: 500 });
    const result = checkPriceTag(tag, product);

    return sendJson(res, 200, {
      ...result,
      won: result.yen ? yenToWon(result.yen, db.meta.rate100) : null,
      onlineYen: product.yen,
      tag: { name: tag.tag_product_name_ko || tag.tag_product_name || '', volume: tag.tag_volume || '' },
      rate: { rate100: db.meta.rate100, date: db.meta.rateDate },
    });
  } catch (err) {
    return handleError(res, err);
  }
}
