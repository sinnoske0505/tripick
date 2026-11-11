// 제품이 많아져도 빠르게: 사진에서 읽은 글자로 후보를 먼저 추린다.
// AI에게 전체 목록 대신 이 후보만 보내서 시간과 비용을 줄인다.

// 비교하기 좋게 글자를 정리한다: 전각→반각, 대문자→소문자, 가타카나→히라가나, 공백·기호 제거
export function normalize(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s・·.,、。/／()（）\[\]【】「」『』'"`~!?！？:：;；\-_ー─–—+＋*＊#&%＄$@|\\]/g, '');
}

// 두 글자씩 묶은 조각 모음 (일본어처럼 띄어쓰기가 없어도 비교가 된다)
function bigrams(s) {
  const out = new Set();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  if (s.length === 1) out.add(s);
  return out;
}

function productText(p) {
  return normalize(`${p.brand} ${p.name_site} ${p.name} ${p.vol}`);
}

// 사진에서 읽은 정보(read)와 제품 하나가 얼마나 겹치는지 점수를 매긴다.
export function scoreProduct(read, p) {
  const text = productText(p);
  const grams = bigrams(text);
  // 원문(일본어)과 한국어 추정을 함께 쓴다: 시트에는 한국어 이름과 원문 표기가 섞여 있다
  const query = normalize([read.read_text, read.brand, read.product_name, read.brand_ko, read.name_ko_guess, ...(read.keywords || [])].join(' '));
  if (!query) return 0;
  const qg = bigrams(query);
  let hit = 0;
  for (const g of qg) if (grams.has(g)) hit += 1;
  let score = qg.size ? hit / Math.sqrt(qg.size * Math.max(grams.size, 1)) : 0;

  // 브랜드, 색상·번호, 용량이 그대로 들어 있으면 가산점
  for (const b of [read.brand, read.brand_ko]) {
    const brand = normalize(b);
    if (brand.length >= 2 && text.includes(brand)) { score += 0.3; break; }
  }
  for (const k of [read.shade, read.volume]) {
    const n = normalize(k);
    if (n.length >= 2 && text.includes(n)) score += 0.15;
  }
  return score;
}

// 점수 높은 순으로 최대 limit개
export function shortlist(db, read, limit = 20) {
  return db.products
    .map((p) => ({ p, score: scoreProduct(read, p) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
