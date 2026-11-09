// 제품 DB를 화면에 쓰기 좋게 만든다. DB는 구글 시트에서 읽고(lib/sheet.js), 못 읽으면 내장 데이터를 쓴다.
export { getDb } from './sheet.js';

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
export function parseIngredients(text, roleDict = {}) {
  const out = [];
  let group = '';
  const parts = String(text).split(/\s*\/\s*(?=\[)/);
  for (const part of parts) {
    let body = part;
    const g = /^\s*\[([^\]]+)\]\s*/.exec(part);
    if (g) { group = g[1]; body = part.slice(g[0].length); }
    // 쉼표로 나누되, "1,2-헥산다이올"처럼 숫자 사이 쉼표는 나누지 않는다.
    for (const raw of body.split(/,(?!\d)/)) {
      let name = raw.trim();
      if (!name) continue;
      const unsure = /\((확인 필요|추정)\)/.exec(name);
      name = name.replace(/\((확인 필요|추정)\)/, '').trim();
      const base = name.replace(/\([^)]*\)$/, '').trim();
      out.push({ group, name, role: roleDict[base] || '', unsure: unsure ? unsure[1] : '' });
    }
  }
  return out;
}

// 화면으로 보낼 제품 정보
export function publicProduct(db, p) {
  return {
    id: p.id, cat: p.cat, brand: p.brand, name: p.name, nameSite: p.name_site, vol: p.vol,
    yen: p.yen, won: yenToWon(p.yen, db.meta.rate100), note: p.note, url: p.url,
    ingredients: parseIngredients(p.ings, db.dict),
  };
}
