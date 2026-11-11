// 판별 로직, 성분 정리, 구글 시트 읽기를 확인하는 테스트 (API 키·인터넷 없이 실행)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkPriceTag, decidePrice } from '../lib/pricecheck.js';
import { parseCsv, buildDb, toNumber, getDb } from '../lib/sheet.js';
import { findProduct, publicProduct, parseIngredients, yenToWon, catalogText } from '../lib/products.js';
import { shortlist, normalize } from '../lib/shortlist.js';

const fx = (n) => parseCsv(readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8'));

// 1) 구글 시트 CSV → DB
const db = buildDb(fx('product.csv'), fx('rate.csv'), fx('dict.csv'));
assert.equal(db.products.length, 40);
assert.equal(db.meta.rate100, 871.84);
assert.equal(db.meta.dataSource, 'sheet');
const mask = db.products.find((p) => p.name.includes('로열젤리'));
assert.equal(mask.yen, 748);
assert.equal(publicProduct(db, mask).won, 6521);
assert.equal(publicProduct(db, mask).ingredients.length, 22);
assert.equal(db.dict['글리세린'], '보습');
assert.ok(catalogText(db).split('\n').length === 40);
assert.equal(toNumber('1,260엔'), 1260);
assert.equal(toNumber('871.84원'), 871.84);

// 2) 시트에서 환율을 바꾸면 원화도 바뀐다
const rate2 = fx('rate.csv').map((r, i) => (i === 1 ? [r[0], '900.00원', ...r.slice(2)] : r));
const db2 = buildDb(fx('product.csv'), rate2, null);
assert.equal(publicProduct(db2, findProduct(db2, mask.id)).won, 6732);

// 3) 따옴표·쉼표·줄바꿈이 든 칸
assert.deepEqual(parseCsv('"a","b, c","d\nE"\n"1","2","3"\n'), [['a', 'b, c', 'd\nE'], ['1', '2', '3']]);

// 4) 시트를 못 읽으면 내장 데이터로 동작 (테스트 환경은 인터넷이 막혀 있어 이 경로를 탄다)
const fallback = await getDb();
assert.ok(fallback.products.length === 40);
assert.ok(['sheet', 'builtin'].includes(fallback.meta.dataSource));

// 5) 가격표 판별
assert.deepEqual(decidePrice({ price_tax_included: 698, price_tax_excluded: 635 }), { yen: 698, basis: 'included' });
assert.deepEqual(decidePrice({ price_tax_included: null, price_tax_excluded: 635 }), { yen: 698, basis: 'added' });
let r = checkPriceTag({ is_same_product: true, is_same_volume: true, legible: true, price_tax_included: 698 }, mask);
assert.equal(r.status, 'ok');
r = checkPriceTag({ is_same_product: false, is_same_volume: false, legible: true, price_tax_included: 660 }, mask);
assert.equal(r.status, 'fail');
r = checkPriceTag({ is_same_product: true, is_same_volume: null, legible: true, price_tax_included: 2244 }, mask);
assert.equal(r.status, 'confirm');
r = checkPriceTag({ is_same_product: true, is_same_volume: true, legible: false, price_tax_included: null }, mask);
assert.equal(r.status, 'fail');

// 6) 성분 정리
assert.equal(yenToWon(748, 871.84), 6521);
const ings = parseIngredients('[유효성분] A, B / [기타] 1,2-헥산다이올, C(확인 필요), D(추정)');
assert.deepEqual(ings.map((i) => i.name), ['A', 'B', '1,2-헥산다이올', 'C', 'D']);
assert.equal(ings[3].unsure, '확인 필요');

// 7) 후보 추리기: 사진에서 읽은 글자로 같은 제품이 상위에 와야 한다
assert.equal(normalize('ＫＯＳＥ　クリア'), 'koseくりあ');
const top = (read) => shortlist(db, read, 20).map((x) => x.p.id);
let t = top({ read_text: 'CLEAR TURN プレミアム ロイヤルゼリー マスク ヒアルロン酸', brand: 'クリアターン', brand_ko: '클리어턴', name_ko_guess: '클리어턴 프리미엄 로열젤리 마스크' });
assert.ok(t.slice(0, 3).includes(mask.id), '로열젤리 마스크가 상위 3위 안에 있어야 함');
const curel = db.products.find((p) => p.name.includes('큐렐 거품 세안료'));
t = top({ read_text: 'Curel 泡洗顔料 150ml', brand: 'キュレル', brand_ko: '큐렐', name_ko_guess: '큐렐 거품 세안제' });
assert.ok(t.slice(0, 5).includes(curel.id), '큐렐 거품 세안료가 상위 5위 안에 있어야 함');
const transino = db.products.find((p) => p.name.includes('UV 파우더'));
t = top({ read_text: 'TRANSINO 薬用UVパウダーEX', brand: 'トランシーノ', brand_ko: '트란시노', name_ko_guess: '트란시노 약용 UV 파우더' });
assert.equal(t[0], transino.id);
assert.equal(top({ read_text: '' }).length, 0);

// 8) 실제 시트 일부(비슷한 제품이 많은 브랜드)로 후보 추리기 확인
const live = { products: JSON.parse(readFileSync(new URL('./fixtures/live_sample.json', import.meta.url), 'utf8'))
  .map(([id, brand, name, name_site, vol]) => ({ id, brand, name, name_site, vol })) };
const liveTop = (read) => shortlist(live, read, 20).map((x) => x.p.id);
assert.equal(liveTop({ read_text: 'CLEAR TURN ビタミンBOMB FACE MASK 7sheets', brand: 'CLEAR TURN', brand_ko: '클리어턴', name_ko_guess: '클리어턴 비타민 봄 마스크' })[0], 31);
assert.equal(liveTop({ read_text: 'UZU MOTE MASCARA COPPER', brand: 'UZU', name_ko_guess: 'UZU 모테 마스카라 코퍼', shade: 'COPPER' })[0], 188);
assert.equal(liveTop({ read_text: 'Curel 泡洗顔料 つめかえ用 130ml', brand: 'キュレル', brand_ko: '큐렐', name_ko_guess: '큐렐 거품 세안제 리필', volume: '130ml' })[0], 132);
assert.ok(liveTop({ read_text: 'CLEAR TURN PREMIUM ロイヤルゼリー マスク', brand_ko: '클리어턴', name_ko_guess: '클리어턴 프리미엄 로열젤리 마스크' }).slice(0, 3).includes(30));

console.log(`모든 테스트 통과 ✓ (지금 데이터 출처: ${fallback.meta.dataSource})`);
