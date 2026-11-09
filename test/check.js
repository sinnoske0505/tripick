// 판별 로직과 성분 정리 기능을 확인하는 간단한 테스트 (API 키 없이 실행)
import assert from 'node:assert/strict';
import { checkPriceTag, decidePrice } from '../lib/pricecheck.js';
import { products, publicProduct, parseIngredients, yenToWon } from '../lib/products.js';

const mask = products.find((p) => p.name.includes('로열젤리'));

// 1) 세금 구분
assert.deepEqual(decidePrice({ price_tax_included: 698, price_tax_excluded: 635 }), { yen: 698, basis: 'included' });
assert.deepEqual(decidePrice({ price_tax_included: null, price_tax_excluded: 635 }), { yen: 698, basis: 'added' });
assert.equal(decidePrice({}).basis, 'none');

// 2) 같은 제품 가격표 → 성공
let r = checkPriceTag({ is_same_product: true, is_same_volume: true, legible: true, price_tax_included: 698 }, mask);
assert.equal(r.status, 'ok');
// 3) 옆 제품 가격표 → 실패
r = checkPriceTag({ is_same_product: false, is_same_volume: false, legible: true, price_tax_included: 660, tag_product_name_ko: '비타민 BOMB 마스크' }, mask);
assert.equal(r.status, 'fail');
assert.equal(r.reason, '다른 제품의 가격표 같아요');
// 4) 가격이 3배 → 확인 요청
r = checkPriceTag({ is_same_product: true, is_same_volume: null, legible: true, price_tax_included: 2244 }, mask);
assert.equal(r.status, 'confirm');
// 5) 흐린 사진 → 실패
r = checkPriceTag({ is_same_product: true, is_same_volume: true, legible: false, price_tax_included: null }, mask);
assert.equal(r.status, 'fail');

// 6) 환산과 성분 정리
assert.equal(yenToWon(748, 871.84), 6521);
const ings = parseIngredients('[유효성분] A, B / [기타] 1,2-헥산다이올, C(확인 필요), D(추정)');
assert.deepEqual(ings.map((i) => i.name), ['A', 'B', '1,2-헥산다이올', 'C', 'D']);
assert.equal(ings[3].unsure, '확인 필요');
assert.equal(ings[0].group, '유효성분');
assert.equal(products.length, 40);
for (const p of products) assert.ok(publicProduct(p).ingredients.length >= 1, p.name);

console.log('모든 테스트 통과 ✓');
