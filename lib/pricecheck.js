// 가격표 판별: AI가 가격표에서 읽은 값과 1차로 찍은 제품을 비교한다.
// 기준 5가지 — 제품 일치, 용량 일치, 가격 범위, 숫자 읽기, 세금 구분

const TAX = 0.10; // 일본 소비세 (화장품은 10%)

export function decidePrice(tag) {
  // 세금 포함 가격이 있으면 그대로, 세금 별도만 있으면 10%를 더한다.
  if (Number.isFinite(tag.price_tax_included) && tag.price_tax_included > 0) {
    return { yen: Math.round(tag.price_tax_included), basis: 'included' };
  }
  if (Number.isFinite(tag.price_tax_excluded) && tag.price_tax_excluded > 0) {
    return { yen: Math.floor(tag.price_tax_excluded * (1 + TAX)), basis: 'added' };
  }
  return { yen: null, basis: 'none' };
}

export function checkPriceTag(tag, product) {
  const price = decidePrice(tag);
  const ratio = price.yen ? price.yen / product.yen : null;

  const checks = [
    {
      key: 'product', label: '제품 일치',
      ok: tag.is_same_product === true,
      detail: tag.is_same_product === true ? '같은 제품이에요' : `가격표: ${tag.tag_product_name_ko || '읽지 못함'}`,
      fail: '다른 제품의 가격표 같아요',
    },
    {
      key: 'volume', label: '용량 일치',
      ok: tag.is_same_volume !== false,
      detail: tag.is_same_volume === false ? `${product.vol} ≠ ${tag.tag_volume || '?'}` : (tag.tag_volume || product.vol),
      fail: '용량이 다른 제품이에요',
    },
    {
      key: 'range', label: '가격 범위',
      ok: ratio !== null && ratio >= 0.5 && ratio <= 2,
      detail: ratio === null ? '가격을 찾지 못했어요' : `온라인몰 가격의 ${ratio.toFixed(2)}배`,
      fail: '가격이 예상과 많이 달라요',
    },
    {
      key: 'legible', label: '숫자 읽기',
      ok: tag.legible === true && price.yen !== null,
      detail: tag.legible === true ? '또렷하게 읽혔어요' : '흐리거나 가려져 있어요',
      fail: '가격이 잘 안 보여요. 가까이서 다시 찍어주세요',
    },
    {
      key: 'tax', label: '세금 구분',
      ok: price.basis !== 'none',
      detail: price.basis === 'included' ? '세금 포함(税込) 가격 사용'
        : price.basis === 'added' ? '세금 별도(税抜) 가격에 10% 더함' : '세금 표시를 찾지 못했어요',
      fail: '세금 포함 여부를 알 수 없어요',
    },
  ];

  // 제품·용량·숫자가 틀리면 실패. 가격 범위만 벗어나면 사용자에게 확인을 받는다.
  const hard = checks.filter((c) => ['product', 'volume', 'legible', 'tax'].includes(c.key) && !c.ok);
  const rangeBad = !checks.find((c) => c.key === 'range').ok;
  let status = 'ok';
  if (hard.length) status = 'fail';
  else if (rangeBad) status = 'confirm';

  const reason = status === 'fail' ? hard[0].fail : status === 'confirm' ? '가격이 예상과 많이 달라요. 맞나요?' : '';
  return { status, reason, yen: price.yen, basis: price.basis, checks };
}
