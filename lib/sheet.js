// 구글 시트 'TRIPICK_제품DB2'에서 제품·환율·성분 역할을 읽어온다.
// 시트를 고치면 최대 10분 안에 앱에 반영된다.
// 시트를 못 읽으면(공유 꺼짐, 네트워크 문제 등) 코드에 들어 있는 데이터(data/products.js)로 계속 동작한다.
import BUILTIN from '../data/products.js';

const SHEET_ID = process.env.TRIPICK_SHEET_ID || '1PRbvM9GpbszEY3YX0yRx6WK5A3l4qRbkwJBrcE-8dA8';
const CACHE_MS = 10 * 60 * 1000;

let cache = null; // { at, db }

// 따옴표·줄바꿈이 들어간 칸도 처리하는 CSV 읽기
export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

// "1,260엔" → 1260, "871.84원" → 871.84
export function toNumber(v) {
  const n = parseFloat(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

async function fetchTab(name, range) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1`
    + `&sheet=${encodeURIComponent(name)}${range ? `&range=${range}` : ''}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  if (!res.ok || text.trimStart().startsWith('<')) throw new Error(`시트 '${name}' 탭을 읽지 못함 (${res.status})`);
  return parseCsv(text);
}

// 머리글 이름으로 열을 찾는다 (열 순서가 바뀌어도 동작)
function columns(header, wanted) {
  const idx = {};
  for (const [key, label] of Object.entries(wanted)) {
    idx[key] = header.findIndex((h) => h.replace(/\s/g, '').startsWith(label.replace(/\s/g, '')));
  }
  return idx;
}

// '올리브영 비교' 탭 → { 돈키No: { price, regular, startFrom, title, vol, link, checked } | { onlyDonki:true, checked } }
export function buildOy(rows) {
  const out = {};
  if (!rows || rows.length < 2) return out;
  const c = columns(rows[0], {
    title: '올리브영 제품명', vol: '용량', regular: '정가', price: '판매가', start: '시작가',
    link: '상품 페이지', checked: '확인일', no: '돈키 매칭', result: '비교 결과', memo: '상태',
  });
  for (const r of rows.slice(1)) {
    const nos = String(r[c.no] || '').split(/[,\s]+/).map(Number).filter((n) => n > 0);
    if (!nos.length) continue;
    const text = `${r[c.result] || ''} ${r[c.memo] || ''}`;
    const price = toNumber(r[c.price]);
    if (/미입점|미판매/.test(text)) {
      for (const n of nos) if (!out[n]) out[n] = { onlyDonki: true, checked: r[c.checked] || '' };
    } else if (price && nos.length === 1 && !/확인 필요|다른 구성/.test(text)) {
      out[nos[0]] = {
        price, regular: toNumber(r[c.regular]), startFrom: /시작가/.test(r[c.start] || ''),
        title: r[c.title] || '', vol: r[c.vol] || '', link: r[c.link] || '', checked: r[c.checked] || '',
      };
    }
  }
  return out;
}

export function buildDb(productRows, rateRows, dictRows) {
  const [ph, ...pr] = productRows;
  const c = columns(ph, {
    id: 'No', cat: '카테고리', brand: '브랜드', name: '제품명(한국어)', name_site: '제품명(온라인몰',
    vol: '용량', yen: '엔화 가격', ings: '전성분', note: '비고', jan: 'JAN', url: '상세 페이지',
  });
  if (c.name < 0 || c.yen < 0 || c.ings < 0) throw new Error('제품 탭 머리글이 예상과 다름');
  const products = pr
    .map((r) => ({
      id: toNumber(r[c.id]), cat: r[c.cat] || '', brand: r[c.brand] || '', name: r[c.name] || '',
      name_site: r[c.name_site] || '', vol: r[c.vol] || '', yen: toNumber(r[c.yen]),
      ings: r[c.ings] || '', note: r[c.note] || '', jan: r[c.jan] || '', url: r[c.url] || '',
    }))
    .filter((p) => p.id && p.name && p.yen);
  if (!products.length) throw new Error('제품 탭이 비어 있음');

  // 환율 탭: '100엔당 원화' 머리글 아래 첫 숫자
  let rate100 = null, rateDate = '';
  const hi = rateRows.findIndex((r) => r.some((v) => v.includes('100엔당')));
  if (hi >= 0 && rateRows[hi + 1]) {
    const col = rateRows[hi].findIndex((v) => v.includes('100엔당'));
    rate100 = toNumber(rateRows[hi + 1][col]);
    rateDate = rateRows[hi + 1][0] || '';
  }
  if (!rate100) throw new Error('환율을 찾지 못함');

  const dict = { ...BUILTIN.dict };
  if (dictRows && dictRows.length > 1) {
    const dc = columns(dictRows[0], { name: '한국어 표준명', role: '역할' });
    for (const r of dictRows.slice(1)) if (r[dc.name] && r[dc.role]) dict[r[dc.name].trim()] = r[dc.role].trim();
  }

  return {
    meta: { ...BUILTIN.meta, rate100, rateDate, dataSource: 'sheet' },
    dict, products,
  };
}

export async function getDb() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.db;
  try {
    const [p, r, d, o] = await Promise.all([
      fetchTab('제품'), fetchTab('환율', 'A3:D10'), fetchTab('성분 사전').catch(() => null),
      fetchTab('올리브영 비교').catch(() => null),
    ]);
    const db = buildDb(p, r, d);
    db.oy = buildOy(o);
    cache = { at: Date.now(), db };
    return db;
  } catch (err) {
    console.warn('구글 시트 대신 내장 데이터 사용:', err.message);
    const db = { ...BUILTIN, meta: { ...BUILTIN.meta, dataSource: 'builtin', sheetError: err.message } };
    cache = { at: Date.now() - CACHE_MS + 60 * 1000, db }; // 실패하면 1분 뒤 다시 시도
    return db;
  }
}
