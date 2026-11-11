// 1차 촬영: 제품 사진 → 제품 DB에서 같은 제품 찾기
// 제품이 많아도 빠르게 동작하도록 3단계로 나눈다.
//   ① AI가 사진 속 포장지 글자만 읽는다 (제품 목록 없이)
//   ② 서버가 읽은 글자로 제품 목록에서 후보 20개를 추린다 (AI 안 씀)
//   ③ AI가 그 후보 20개 중에서 같은 제품을 고른다 (글자만, 이미지 없이)
// 제품이 적으면(SMALL_DB 이하) ②를 건너뛰고 전체 목록을 쓴다.
import { askWithImage, askText } from '../lib/claude.js';
import { getDb, findProduct, publicProduct } from '../lib/products.js';
import { shortlist } from '../lib/shortlist.js';
import { sendJson, readBody, handleError } from '../lib/http.js';

const SMALL_DB = 40;
const SHORTLIST = 20;

const READ_SYSTEM = `너는 일본 돈키호테 화장품 포장지를 읽는다.
사진 속 글자를 보이는 그대로 옮기고, 브랜드·제품명·색상 번호·용량을 따로 정리한다. 추측으로 글자를 만들지 않는다.
반드시 JSON 하나만 답한다.`;

const READ_PROMPT = `사진 속 화장품 포장지를 읽고 아래 JSON으로만 답해.
{
  "read_text": "포장지에서 읽은 글자 그대로 (일본어·영어 포함, 최대 120자)",
  "brand": "브랜드 표기 그대로 (모르면 빈 문자열)",
  "product_name": "제품명 표기 그대로",
  "keywords": ["제품을 구별할 핵심 단어 3~6개 (원문 표기)"],
  "shade": "색상 이름·번호 (없으면 빈 문자열)",
  "volume": "용량 표기 (없으면 빈 문자열)",
  "brand_ko": "브랜드의 한국어 표기 (예: クリアターン → 클리어턴, キュレル → 큐렐)",
  "name_ko_guess": "읽은 내용을 바탕으로 한 자연스러운 한국어 제품명"
}`;

const MATCH_SYSTEM = `너는 일본 돈키호테에서 화장품을 고르는 한국인 여행객을 돕는다.
포장지에서 읽은 글자를 주어진 후보 목록과 비교해서 같은 제품을 찾는다.
색상·용량·리필·세트 여부가 다르면 다른 제품으로 본다. 확실하지 않으면 match_id를 null로 둔다.
반드시 JSON 하나만 답한다.`;

function line(p) {
  return `${p.id} | ${p.brand} | ${p.name} | ${p.name_site} | ${p.vol}`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST만 됩니다.' });
  try {
    const { image } = await readBody(req);
    const db = await getDb();

    // ① 포장지 읽기
    const read = await askWithImage({ dataUrl: image, system: READ_SYSTEM, prompt: READ_PROMPT, maxTokens: 500 });

    // ② 후보 추리기
    const pool = db.products.length <= SMALL_DB
      ? db.products
      : shortlist(db, read, SHORTLIST).map((x) => x.p);

    let ai = { match_id: null, confidence: 0, candidates: [] };
    if (pool.length) {
      // ③ 후보 중에서 고르기
      const prompt = `포장지에서 읽은 내용:
- 글자: ${read.read_text || ''}
- 브랜드: ${read.brand || ''}
- 제품명: ${read.product_name || ''}
- 색상·번호: ${read.shade || ''}
- 용량: ${read.volume || ''}

후보 목록 (번호 | 브랜드 | 한국어 이름 | 온라인몰 표기 | 용량):
${pool.map(line).join('\n')}

아래 JSON으로만 답해.
{
  "match_id": 후보 번호 또는 null,
  "confidence": 0~1 사이 숫자,
  "candidates": [가능성 있는 다른 후보 번호 최대 3개]
}`;
      ai = await askText({ system: MATCH_SYSTEM, prompt, maxTokens: 300 });
    }

    // 후보 목록 밖의 번호는 쓰지 않는다
    const inPool = new Set(pool.map((p) => p.id));
    const pick = (id) => (inPool.has(Number(id)) ? findProduct(db, id) : null);

    const product = ai.match_id ? pick(ai.match_id) : null;
    const confident = product && Number(ai.confidence) >= 0.6;
    const candidates = (ai.candidates || [])
      .map(pick).filter(Boolean)
      .filter((p) => !product || p.id !== product.id)
      .slice(0, 3)
      .map((p) => ({ id: p.id, name: p.name, vol: p.vol }));

    return sendJson(res, 200, {
      found: Boolean(confident),
      product: confident ? publicProduct(db, product) : null,
      lowConfidenceProduct: product && !confident ? { id: product.id, name: product.name, vol: product.vol } : null,
      candidates,
      readText: read.read_text || '',
      nameGuess: read.name_ko_guess || '',
      rate: { rate100: db.meta.rate100, date: db.meta.rateDate },
      searched: pool.length,
    });
  } catch (err) {
    return handleError(res, err);
  }
}
