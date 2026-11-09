// TRIPICK 화면 동작
// 주소 끝에 ?demo=1 을 붙이면 API 키 없이 예시 데이터로 흐름을 볼 수 있다.

const DEMO = new URLSearchParams(location.search).has('demo');
const $ = (s) => document.querySelector(s);
const won = (n) => (n == null ? '-' : '₩' + n.toLocaleString('ko-KR'));
const yen = (n) => (n == null ? '-' : '¥' + n.toLocaleString('ko-KR'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { info: null, product: null, store: null, lastScreen: 'home' };

/* ---------- 화면 전환 ---------- */
function show(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  $('#s-' + name).classList.add('active');
  $('#s-' + name).scrollTop = 0;
  if (name === 'home') renderHome();
  if (name === 'saved') renderSaved();
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) show(go.dataset.go);
});

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ---------- 저장 목록 (내 폰 안에만 저장) ---------- */
const SAVE_KEY = 'tripick.saved.v1';
function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || []; } catch { return []; }
}
function writeSaved(list) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); } catch { toast('이 브라우저에서는 저장이 안 돼요'); }
}

/* ---------- 사진 줄이기 (전송을 빠르게) ---------- */
function shrink(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* ---------- 서버 호출 ---------- */
async function api(path, body) {
  if (DEMO) return demoApi(path, body);
  const res = await fetch(path, body ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || '문제가 생겼어요'), { code: data.code });
  return data;
}

/* ---------- 분석 중 화면 ---------- */
const STEPS = {
  product: ['사진 보내기', '포장지에서 제품명 읽는 중', '제품 DB에서 같은 제품 찾기', '가격·전성분 한국어로 보여주기'],
  tag: ['사진 보내기', '가격표 글자 읽는 중', '찍은 제품과 비교하기', '판별 결과 보여주기'],
};
let stepTimer;
function startSteps(kind, dataUrl) {
  $('#preview').src = dataUrl;
  $('#an-title').textContent = kind === 'product' ? '상품을 알아보는 중이에요' : '가격표를 확인하는 중이에요';
  const ol = $('#an-steps');
  ol.innerHTML = STEPS[kind].map((t) => `<li><span class="dot"></span><span>${t}</span></li>`).join('');
  const items = [...ol.children];
  let i = 0;
  const tick = () => {
    items.forEach((li, j) => {
      li.className = j < i ? 'done' : j === i ? 'doing' : '';
      li.querySelector('.dot').textContent = j < i ? '✓' : '';
    });
    if (i < items.length - 1) i++;
  };
  tick();
  clearInterval(stepTimer);
  stepTimer = setInterval(tick, 900);
  show('analyzing');
}
function stopSteps() { clearInterval(stepTimer); }

/* ---------- 1차: 제품 사진 ---------- */
$('#in-product').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const dataUrl = await shrink(file);
    state.photo = dataUrl;
    startSteps('product', dataUrl);
    const r = await api('/api/identify', { image: dataUrl });
    stopSteps();
    state.store = null;
    if (r.found) { state.product = r.product; renderResult(); }
    else renderNotFound(r);
    show('result');
  } catch (err) {
    stopSteps();
    showError(err);
  }
});

function showError(err) {
  show(state.product ? 'result' : 'home');
  if (err.code === 'NO_KEY') toast('API 키가 아직 설정되지 않았어요');
  else toast(err.message || '문제가 생겼어요. 다시 찍어주세요');
}

/* ---------- 결과 화면 ---------- */
function ingredientList(ings) {
  let html = '';
  let group = null;
  ings.forEach((it, i) => {
    if (it.group && it.group !== group) { group = it.group; html += `<li class="group">${esc(group)}</li>`; }
    const chip = it.unsure ? `<span class="chip unsure">${it.unsure === '추정' ? '표준명 추정' : '확인 필요'}</span>`
      : it.role ? `<span class="chip">${esc(it.role)}</span>` : '';
    html += `<li class="${i >= 8 ? 'more' : ''}" ${i >= 8 ? 'hidden' : ''}><span>${esc(it.name)}</span>${chip}</li>`;
  });
  return html;
}

function renderResult() {
  const p = state.product;
  const s = state.store;
  const priceBlock = s
    ? `<span class="tag store">매장 가격</span>
       <div><span class="won">${won(s.won)}</span><span class="yen">${yen(s.yen)}</span></div>
       <span class="small">온라인몰 ${yen(p.yen)} · 100엔 = ${state.info.rate100}원</span>
       <label class="btn" for="in-tag">가격표 다시 찍기</label>`
    : `<span class="tag">온라인몰 기준 가격</span>
       <div><span class="won">${won(p.won)}</span><span class="yen">${yen(p.yen)}</span></div>
       <span class="small">매장 가격은 다를 수 있어요 · 100엔 = ${state.info.rate100}원</span>
       <label class="btn" for="in-tag">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
         매장 가격표 찍기</label>`;
  const total = p.ingredients.length;
  $('#result-body').innerHTML = `
    <div class="stack">
      <div class="photo" style="background-image:url('${state.photo}')" role="img" aria-label="찍은 제품 사진"></div>
      <div>
        <div class="meta-line">${esc(p.brand)} · ${esc(p.cat)} · ${esc(p.vol)}</div>
        <h1 class="p-name">${esc(p.name)}</h1>
        <p class="p-site">온라인몰 표기: ${esc(p.nameSite)}</p>
      </div>
      <section class="price">${priceBlock}</section>
      ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
      <section class="card ings">
        <h2>전성분 <span>${total}개</span></h2>
        <ol>${ingredientList(p.ingredients)}</ol>
        ${total > 8 ? `<button class="btn outline" id="more-ings" style="min-height:44px;margin-top:12px">나머지 ${total - 8}개 더 보기</button>` : ''}
        <p class="source">표준 성분명 기준 · 출처: <a href="${esc(p.url)}" target="_blank" rel="noopener">돈키호테 공식 해외 온라인몰</a></p>
      </section>
      <div class="btn-row">
        <button class="btn primary" id="save-btn">저장하기</button>
        <button class="btn outline" data-go="saved" style="flex:0 0 120px">저장 목록</button>
      </div>
    </div>`;
  const more = $('#more-ings');
  if (more) more.onclick = () => { document.querySelectorAll('.ings li.more').forEach((li) => (li.hidden = false)); more.remove(); };
  $('#save-btn').onclick = saveCurrent;
}

function renderNotFound(r) {
  state.product = null;
  const cands = r.lowConfidenceProduct ? [r.lowConfidenceProduct, ...r.candidates] : r.candidates;
  $('#result-body').innerHTML = `
    <div class="stack">
      <div class="photo" style="background-image:url('${state.photo}')" role="img" aria-label="찍은 사진"></div>
      <div class="verdict">
        <h1>아직 등록되지 않은 제품이에요</h1>
        <p>TRIPICK 제품 DB(${state.info.productCount}개)에서 같은 제품을 찾지 못했어요.</p>
      </div>
      <section class="card">
        <div class="sub">사진에서 읽은 내용</div>
        <p style="margin:6px 0 0;font-size:16px;font-weight:700">${esc(r.nameGuess || '읽지 못했어요')}</p>
        ${r.readText ? `<p class="sub" style="margin:4px 0 0">${esc(r.readText)}</p>` : ''}
      </section>
      ${cands.length ? `<section class="card"><div class="sub" style="margin-bottom:8px">혹시 이 제품인가요?</div>
        ${cands.map((c) => `<button class="btn outline" style="min-height:48px;margin-top:8px;font-size:15px" data-pick="${c.id}">${esc(c.name)}</button>`).join('')}</section>` : ''}
      <label class="btn primary" for="in-product">다시 찍기</label>
    </div>`;
  document.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => pickProduct(b.dataset.pick)));
}

async function pickProduct(id) {
  try {
    const r = await api('/api/info?product=' + id);
    state.product = r.product;
    state.store = null;
    renderResult();
    show('result');
  } catch (err) { showError(err); }
}

function saveCurrent() {
  const p = state.product;
  const list = loadSaved().filter((x) => x.id !== p.id);
  const s = state.store;
  list.unshift({ id: p.id, name: p.name, yen: s ? s.yen : p.yen, won: s ? s.won : p.won, type: s ? 'store' : 'online' });
  writeSaved(list);
  toast('목록에 저장했어요');
}

/* ---------- 2차: 가격표 사진 ---------- */
$('#in-tag').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file || !state.product) return;
  try {
    const dataUrl = await shrink(file);
    startSteps('tag', dataUrl);
    const r = await api('/api/pricetag', { image: dataUrl, productId: state.product.id });
    stopSteps();
    renderPrice(r);
    show('price');
  } catch (err) {
    stopSteps();
    showError(err);
  }
});

function renderPrice(r) {
  const p = state.product;
  const ok = r.status === 'ok';
  const confirm = r.status === 'confirm';
  const badge = ok
    ? `<span class="badge" style="background:var(--ok)">✓</span><h1>가격표를 확인했어요</h1><p>찍은 제품과 같은 제품의 가격표예요</p>`
    : confirm
      ? `<span class="badge" style="background:var(--warn)">?</span><h1>가격이 예상과 많이 달라요</h1><p>온라인몰 ${yen(r.onlineYen)}과 차이가 커요. 가격표가 맞는지 확인해 주세요.</p>`
      : `<span class="badge" style="background:var(--warn)">!</span><h1>${esc(r.reason)}</h1><p>찍은 제품의 가격표를 다시 찍어주세요.</p>`;
  const diff = r.yen != null ? r.yen - r.onlineYen : null;
  const priceCard = r.yen != null && !(!ok && !confirm)
    ? `<section class="price"><span class="tag store">매장 가격</span>
        <div><span class="won">${won(r.won)}</span><span class="yen">${yen(r.yen)} (세금 포함)</span></div>
        <span class="small">${diff === 0 ? '온라인몰과 같아요' : diff < 0 ? `온라인몰보다 ¥${-diff} 저렴해요` : `온라인몰보다 ¥${diff} 비싸요`} (온라인몰 ${yen(r.onlineYen)})</span></section>`
    : '';
  const compare = !ok && !confirm
    ? `<section class="card"><div class="sub">찍은 제품</div><strong>${esc(p.name)}</strong>
        <hr style="border:none;border-top:1px solid var(--line);margin:10px 0">
        <div class="sub">가격표에서 읽은 제품</div><strong style="color:var(--warn-fg)">${esc(r.tag.name || '읽지 못했어요')}${r.tag.volume ? ' · ' + esc(r.tag.volume) : ''}</strong></section>`
    : '';
  const checks = `<ul class="card checks">${r.checks.map((c) => `
      <li><span class="mark ${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✕'}</span>
      <span class="label">${esc(c.label)}</span><span class="detail">${esc(c.detail)}</span></li>`).join('')}</ul>`;
  const buttons = ok || confirm
    ? `<button class="btn primary" id="use-store">매장 가격으로 바꾸기</button><label class="btn ghost" for="in-tag">가격표 다시 찍기</label>`
    : `<label class="btn primary" for="in-tag">가격표 다시 찍기</label><button class="btn ghost" data-go="result">온라인몰 가격 그대로 쓰기</button>`;
  $('#price-body').innerHTML = `<div class="stack"><div class="verdict">${badge}</div>${priceCard}${compare}${checks}${buttons}</div>`;
  const use = $('#use-store');
  if (use) use.onclick = () => {
    state.store = { yen: r.yen, won: r.won };
    renderResult();
    show('result');
    toast('매장 가격으로 바꿨어요');
  };
}

/* ---------- 홈·저장 목록 ---------- */
function renderHome() {
  if (!state.info) return;
  $('#rate-val').textContent = state.info.rate100.toLocaleString('ko-KR');
  $('#rate-date').textContent = state.info.rateDate;
  $('#saved-count').textContent = loadSaved().length;
}

function renderSaved() {
  const list = loadSaved();
  if (!list.length) {
    $('#saved-body').innerHTML = `<p class="empty">아직 저장한 제품이 없어요.<br>제품을 찍고 '저장하기'를 눌러보세요.</p>
      <label class="btn primary" for="in-product">제품 찍기</label>`;
    return;
  }
  const sumYen = list.reduce((a, x) => a + x.yen, 0);
  const sumWon = list.reduce((a, x) => a + x.won, 0);
  $('#saved-body').innerHTML = `<div class="stack">
    <ul class="saved-list">${list.map((x) => `
      <li class="saved-item">
        <button class="open" data-open="${x.id}">
          <span class="nm">${esc(x.name)}</span>
          <span class="tg ${x.type}">${x.type === 'store' ? '매장 가격' : '온라인몰 기준'} · ${yen(x.yen)}</span>
        </button>
        <span class="w">${won(x.won)}</span>
        <button class="del" data-del="${x.id}" aria-label="${esc(x.name)} 삭제">✕</button>
      </li>`).join('')}</ul>
    <div class="total"><span>합계 ${list.length}개</span><span><span class="sub" style="color:#D6D6D6;margin-right:8px">${yen(sumYen)}</span><span class="w">${won(sumWon)}</span></span></div>
    <label class="btn primary" for="in-product">다른 제품 찍기</label></div>`;
  document.querySelectorAll('[data-del]').forEach((b) => (b.onclick = () => {
    writeSaved(loadSaved().filter((x) => x.id !== Number(b.dataset.del)));
    renderSaved();
  }));
  document.querySelectorAll('[data-open]').forEach((b) => (b.onclick = async () => {
    const saved = loadSaved().find((x) => x.id === Number(b.dataset.open));
    state.photo = '';
    await pickProduct(b.dataset.open);
    if (saved && saved.type === 'store') { state.store = { yen: saved.yen, won: saved.won }; renderResult(); }
  }));
}

/* ---------- 시작 ---------- */
async function boot() {
  const started = Date.now();
  try {
    state.info = await api('/api/info');
  } catch {
    state.info = { rate100: 0, rateDate: '-', productCount: 0 };
    toast('서버에 연결하지 못했어요');
  }
  const wait = Math.max(0, 1200 - (Date.now() - started)); // 시작 화면은 최소 1.2초
  setTimeout(() => show('home'), wait);
}
boot();

/* ---------- 데모 모드 (?demo=1) ---------- */
let demoProducts;
async function demoApi(path, body) {
  await new Promise((r) => setTimeout(r, path.startsWith('/api/info') ? 300 : 2400));
  if (!demoProducts) demoProducts = (await import('./demo-data.js')).default;
  const rate100 = demoProducts.meta.rate100;
  const pick = (id) => demoProducts.products.find((p) => p.id === Number(id));
  if (path.startsWith('/api/info?product=')) return { product: pick(path.split('=')[1]) };
  if (path === '/api/info') return { rate100, rateDate: demoProducts.meta.rateDate, productCount: 40 };
  if (path === '/api/identify') {
    const p = pick(30);
    return { found: true, product: p, candidates: [], readText: '', nameGuess: '' };
  }
  if (path === '/api/pricetag') {
    const fail = Math.random() < 0.5;
    const checks = (oks) => ['제품 일치', '용량 일치', '가격 범위', '숫자 읽기', '세금 구분'].map((label, i) => ({
      label, ok: oks[i],
      detail: [oks[0] ? '같은 제품이에요' : '가격표: 클리어턴 비타민 BOMB 마스크', oks[1] ? '4회분' : '4회분 ≠ 7매',
        '온라인몰 가격의 0.93배', '또렷하게 읽혔어요', '세금 포함(税込) 가격 사용'][i],
    }));
    return fail
      ? { status: 'fail', reason: '다른 제품의 가격표 같아요', yen: 660, won: Math.round(660 * rate100 / 100), onlineYen: 748,
          tag: { name: '클리어턴 비타민 BOMB 마스크', volume: '7매' }, checks: checks([false, false, true, true, true]) }
      : { status: 'ok', reason: '', yen: 698, won: Math.round(698 * rate100 / 100), onlineYen: 748,
          tag: { name: '클리어턴 프리미엄 로열젤리 마스크', volume: '4회분' }, checks: checks([true, true, true, true, true]) };
  }
  throw new Error('demo');
}
