// 1차 촬영: 제품 사진 → 제품 DB에서 같은 제품 찾기
import { askWithImage } from '../lib/claude.js';
import { getDb, catalogText, findProduct, publicProduct } from '../lib/products.js';
import { sendJson, readBody, handleError } from '../lib/http.js';

const SYSTEM = `너는 일본 돈키호테에서 화장품을 고르는 한국인 여행객을 돕는다.
사진 속 화장품 포장지의 글자(브랜드, 제품명, 용량, 색상 번호)를 읽고, 주어진 제품 목록에서 같은 제품을 찾는다.
맛·색상·용량·리필 여부가 다르면 다른 제품으로 본다. 확실하지 않으면 match_id를 null로 둔다.
반드시 JSON 하나만 답한다.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST만 됩니다.' });
  try {
    const { image } = await readBody(req);
    const db = await getDb();
    const prompt = `제품 목록 (번호 | 브랜드 | 한국어 이름 | 온라인몰 표기 | 용량):
${catalogText(db)}

사진 속 제품을 위 목록과 비교해서 아래 JSON으로만 답해.
{
  "read_text": "포장지에서 읽은 글자 그대로 (일본어 포함, 최대 80자)",
  "name_ko_guess": "읽은 내용을 바탕으로 한 자연스러운 한국어 제품명",
  "match_id": 목록 번호 또는 null,
  "confidence": 0~1 사이 숫자,
  "candidates": [가능성 있는 다른 목록 번호 최대 3개]
}`;
    const ai = await askWithImage({ dataUrl: image, system: SYSTEM, prompt });

    const product = ai.match_id ? findProduct(db, ai.match_id) : null;
    const confident = product && Number(ai.confidence) >= 0.6;
    const candidates = (ai.candidates || [])
      .map((id) => findProduct(db, id)).filter(Boolean)
      .filter((p) => !product || p.id !== product.id)
      .slice(0, 3)
      .map((p) => ({ id: p.id, name: p.name, vol: p.vol }));

    return sendJson(res, 200, {
      found: Boolean(confident),
      product: confident ? publicProduct(db, product) : null,
      lowConfidenceProduct: product && !confident ? { id: product.id, name: product.name, vol: product.vol } : null,
      candidates,
      readText: ai.read_text || '',
      nameGuess: ai.name_ko_guess || '',
      rate: { rate100: db.meta.rate100, date: db.meta.rateDate },
    });
  } catch (err) {
    return handleError(res, err);
  }
}
