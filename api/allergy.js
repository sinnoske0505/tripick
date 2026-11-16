// 사용자가 직접 쓴 알레르기 문장을 전성분 표기로 풀어 준다.
// POST { text: "티트리 알러지" } → { terms: ["티트리잎오일", "티트리"] }
// 결과는 휴대폰에 저장되고, 대조는 화면에서 글자 일치로만 한다.
import { askText } from '../lib/claude.js';
import { sendJson, readBody, handleError } from '../lib/http.js';

const SYSTEM = `사용자가 피하고 싶은 화장품 성분을 자유롭게 적는다. 이것을 한국 화장품 전성분 표준명(대한화장품협회 표기)으로 바꾼다.
- 실제 전성분에 쓰이는 표기와, 그 표기들에 공통으로 들어가는 짧은 핵심 낱말을 함께 준다. 예: "티트리" → ["티트리잎오일", "티트리"].
- 사용자가 말한 범위를 넓히지 않는다. 모르는 말이면 빈 배열.
- 많아도 6개. 반드시 {"terms": [...]} JSON 하나만 답한다.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST만 됩니다.' });
  try {
    const { text } = await readBody(req);
    const t = String(text || '').trim().slice(0, 60);
    if (!t) return sendJson(res, 200, { terms: [] });
    const ai = await askText({ system: SYSTEM, prompt: t, maxTokens: 900 });
    const terms = (ai.terms || []).map((x) => String(x).trim()).filter((x) => x.length >= 2 && x.length <= 30).slice(0, 6);
    return sendJson(res, 200, { terms });
  } catch (err) {
    return handleError(res, err);
  }
}
