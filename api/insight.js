// 제품 상세의 추가 정보: 3줄 소개 + 내 피부 정보 기준으로 살펴볼 성분
// POST { productId, profile: { skin, allergy, allergyNote, pregnant } }
// 성분 표시는 '참고 정보'다. 진단·처방처럼 말하지 않는다.
import { askText } from '../lib/claude.js';
import { getDb, findProduct, parseIngredients } from '../lib/products.js';
import { sendJson, readBody, handleError } from '../lib/http.js';

const SKINS = ['건성', '지성', '수부지', '민감성'];

const SYSTEM = `너는 화장품 성분 정보를 쉽게 풀어 주는 도우미다. 한국어로 답한다.
- 제품 소개는 제품 정보와 전성분에서 확인되는 사실만 쓴다. 효능을 과장하거나 '치료', '개선된다' 같은 의학적 표현을 쓰지 않는다.
- '살펴볼 성분'은 사용자의 피부 타입에서 일반적으로 자극·건조·트러블과 관련해 자주 언급되는 성분만 고른다. 근거가 약하면 고르지 않는다.
- 임신 중이라고 한 경우 레티노이드(레티놀 등), 고농도 살리실산 등 일반적으로 주의 안내가 있는 성분은 고를 수 있다. 이때 이유에 '사용 전 의사·약사와 상의'를 권한다.
- 알레르기 메모가 있으면 그 메모와 직접 관련된 성분만 고른다.
- 이유는 1~2문장, 단정하지 말고 '~할 수 있어요', '~로 알려져 있어요'처럼 쓴다.
- 성분 이름은 반드시 주어진 전성분 목록의 표기 그대로 쓴다.
반드시 JSON 하나만 답한다.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST만 됩니다.' });
  try {
    const { productId, profile = {} } = await readBody(req);
    const db = await getDb();
    const p = findProduct(db, productId);
    if (!p) return sendJson(res, 404, { error: '제품이 없어요.' });

    const ings = parseIngredients(p.ings, db.dict).map((i) => i.name);
    const skin = SKINS.includes(profile.skin) ? profile.skin : '';
    const who = [
      skin ? `피부 타입: ${skin}` : '피부 타입: 입력 안 함',
      profile.pregnant ? '임신 중: 예' : '',
      profile.allergy ? `알레르기: 있음${profile.allergyNote ? ` (${String(profile.allergyNote).slice(0, 80)})` : ''}` : '',
    ].filter(Boolean).join('\n');

    const prompt = `제품: ${p.name} (${p.brand}, ${p.cat}, ${p.vol})
비고: ${p.note || '-'}
전성분: ${ings.join(', ')}

사용자 정보:
${who}

아래 JSON으로만 답해.
{
  "summary": ["제품을 소개하는 짧은 문장 3개 (각 40자 안팎, 어떤 제품인지·특징 성분·쓰는 방법이나 용도)"],
  "cautions": [{"name": "전성분 표기 그대로", "reason": "이 사용자에게 살펴볼 이유 1~2문장"}]
}
cautions는 해당 없으면 빈 배열, 많아도 5개까지.`;

    const ai = await askText({ system: SYSTEM, prompt, maxTokens: 1500 });
    const set = new Set(ings);
    const cautions = (ai.cautions || [])
      .filter((c) => c && set.has(String(c.name).trim()))
      .slice(0, 5)
      .map((c) => ({ name: String(c.name).trim(), reason: String(c.reason || '').slice(0, 200) }));
    const summary = (ai.summary || []).map((s) => String(s).slice(0, 80)).slice(0, 3);
    return sendJson(res, 200, { summary, cautions, basis: skin || '' });
  } catch (err) {
    return handleError(res, err);
  }
}
