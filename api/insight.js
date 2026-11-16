// 제품 상세의 '핵심 특징': 이름만 보고는 알 수 없는 것만 0~3개.
// POST { productId } → { features: [{ key, text }] }
// 근거는 공식 설명·사용 주의·비고·전성분뿐. 없으면 빈 배열 (화면에서 칸을 숨긴다).
import { askText } from '../lib/claude.js';
import { getDb, findProduct, parseIngredients } from '../lib/products.js';
import { sendJson, readBody, handleError } from '../lib/http.js';

const SYSTEM = `너는 일본 화장품의 핵심 특징을 한국 여행자에게 짧게 알려 주는 도우미다. 한국어로 답한다.
규칙:
- 근거는 주어진 공식 설명, 사용 주의, 비고, 전성분뿐이다. 여기에 없는 효능·사용감·지속력·발색·후기·인기는 절대 쓰지 않는다.
- 뻔한 말 금지: 화면에 이미 보이는 것(제품명, 브랜드, 용량, 색상 번호, 제품 종류)과 상식(예: "피부에 붙이는 마스크팩", "얼굴에 바르는 크림")은 쓰지 않는다.
- 성분 이름을 나열하지 않는다. 성분은 공식 설명이 그 성분을 특징으로 내세울 때만 한 번 언급한다.
- 이름만 보고는 알 수 없는 정보만 쓴다. 예: 자외선 차단 지수, 향의 종류, 무향·무알코올 같은 표시, 사용 부위(얼굴·전신), 세안 필요 여부, 사용 순서, 꼭 알아야 할 사용 주의.
- 피부 타입이나 퍼스널 컬러 관련 내용은 공식 설명에 근거가 있을 때만 쓰고, "잘 맞아요" 같은 단정은 하지 않는다.
- 항목은 0~3개. 확실히 쓸 것이 없으면 빈 배열을 낸다. 억지로 채우지 않는다.
- key는 2~6글자 키워드, text는 25자 이내.
반드시 JSON 하나만 답한다.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST만 됩니다.' });
  try {
    const { productId } = await readBody(req);
    const db = await getDb();
    const p = findProduct(db, productId);
    if (!p) return sendJson(res, 404, { error: '제품이 없어요.' });
    const ings = parseIngredients(p.ings, db.dict).map((i) => i.name);
    const prompt = `제품명: ${p.name}
제품 종류: ${p.cat}
비고: ${p.note || '-'}
공식 설명: ${p.desc || '-'}
사용 주의: ${p.warn || '-'}
전성분: ${ings.join(', ')}

{"features": [{"key": "키워드", "text": "짧은 설명"}]} 형식으로만 답해.`;
    const ai = await askText({ system: SYSTEM, prompt, maxTokens: 500 });
    const shown = [p.name, p.brand, p.cat, p.vol].join(' ');
    const features = (ai.features || [])
      .filter((f) => f && f.key && f.text && !shown.includes(String(f.text).trim()))
      .slice(0, 3)
      .map((f) => ({ key: String(f.key).slice(0, 10), text: String(f.text).slice(0, 40) }));
    return sendJson(res, 200, { features });
  } catch (err) {
    return handleError(res, err);
  }
}
