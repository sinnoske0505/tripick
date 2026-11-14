// 제품 DB를 화면에 쓰기 좋게 만든다. DB는 구글 시트에서 읽고(lib/sheet.js), 못 읽으면 내장 데이터를 쓴다.
export { getDb } from './sheet.js';
import { oyFor } from './sheet.js';

export function findProduct(db, id) {
  return db.products.find((p) => p.id === Number(id)) || null;
}

export function yenToWon(yen, rate100) {
  return Math.round((yen * rate100) / 100);
}

// AI에게 보여줄 짧은 제품 목록 (번호 | 브랜드 | 이름 | 온라인몰 표기 | 용량)
export function catalogText(db) {
  return db.products
    .map((p) => `${p.id} | ${p.brand} | ${p.name} | ${p.name_site} | ${p.vol}`)
    .join('\n');
}

// "[유효성분] A, B / [기타] C, D" 를 [{group, name, role, unsure}] 로 바꾼다.
// 쉼표로 나누되 괄호 안 쉼표, "1,2-헥산다이올"처럼 숫자 앞 쉼표는 나누지 않는다.
function splitTop(body) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '(' || c === '（') depth++;
    else if ((c === ')' || c === '）') && depth > 0) depth--;
    if (c === ',' && depth === 0 && !/\d/.test(body[i + 1] || '')) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

const NOTE = /[(（]([^()（）]*(?:확인|추정|중복)[^()（）]*)[)）]/g;

export function parseIngredients(text, roleDict = {}) {
  const out = [];
  const seen = new Set();
  let group = '';
  const parts = String(text).split(/\s*\/\s*(?=\[)/);
  for (const part of parts) {
    let body = part;
    const g = /^\s*\[([^\]]+)\]\s*/.exec(part);
    if (g) { group = g[1]; body = part.slice(g[0].length); }
    for (const raw of splitTop(body)) {
      let name = raw.trim();
      if (!name) continue;
      // 메모 괄호(확인 필요·추정·중복 표기)는 이름에서 떼어 표시로만 쓴다
      const notes = [...name.matchAll(NOTE)].map((m) => m[1]);
      name = name.replace(NOTE, '').replace(/\s{2,}/g, ' ').trim();
      if (!name) continue;
      const unsure = notes.some((n) => n.includes('추정')) ? '추정' : notes.some((n) => n.includes('확인')) ? '확인 필요' : '';
      // 같은 성분이 두 번 적혀 있으면 한 번만 보여준다
      const key = group + '|' + name.replace(/\s/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      const base = name.replace(/\([^)]*\)$/, '').trim();
      out.push({ group, name, role: roleDict[base] || '', unsure });
    }
  }
  return out;
}

// 공식 온라인몰 제품 사진 주소 후보 (사진 파일 이름이 JAN 번호라서 순서대로 시도한다)
export function productImages(jan) {
  const j = String(jan || '').replace(/\D/g, '');
  if (!j) return [];
  const base = 'https://donki-ec-static-1306051524.cos.ap-hongkong.myqcloud.com';
  return [`${base}/images/${j}-1.jpg`, `${base}/images-ss/${j}-1.jpg`, `${base}/images/${j}.jpg`, `${base}/images-ss/${j}.jpg`];
}

// 화면으로 보낼 제품 정보
export function publicProduct(db, p) {
  return {
    id: p.id, cat: p.cat, brand: p.brand, name: p.name, nameSite: p.name_site, vol: p.vol,
    yen: p.yen, won: yenToWon(p.yen, db.meta.rate100), note: p.note, url: p.url,
    jan: p.jan || '', images: productImages(p.jan),
    ingredients: parseIngredients(p.ings, db.dict),
    oy: oyFor(db, p),
  };
}
