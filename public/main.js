// TRIPICK 화면 동작
// 주소 끝에 ?demo=1 을 붙이면 API 키 없이 예시 데이터로 흐름을 볼 수 있다.
// 주소 끝에 ?p=제품번호 를 붙이면 그 제품 정보가 바로 열린다 (공유 링크).

const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const won = (n) => (n == null ? '-' : '₩' + Math.round(n).toLocaleString('ko-KR'));
const yen = (n) => (n == null ? '-' : '¥' + n.toLocaleString('ko-KR'));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const state = { info: null, product: null, store: null, photo: '', insight: null, prev: 'home' };

/* ---------- 면세 환급 (2026-11-01부터 출국 시 환급 방식) ---------- */
// 매장에서는 세금 포함 가격을 내고, 세금 제외 ¥5,000 이상이면 출국 때 소비세(10%)를 돌려받는다.
const REFUND_MIN_YEN = 5000;
const exTax = (yenIncl) => Math.round(yenIncl / 1.1);
const toWon = (y) => Math.round(y * (state.info?.rate100 || 0) / 100);

/* ---------- 내 폰에만 저장하는 정보 ---------- */
const KEYS = { profile: 'tripick.profile.v1', wish: 'tripick.saved.v1', history: 'tripick.history.v1', insight: 'tripick.insight.v1' };
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(KEYS[k])) ?? d; } catch { return d; } };
const save = (k, v) => { try { localStorage.setItem(KEYS[k], JSON.stringify(v)); } catch { toast('이 브라우저에서는 저장이 안 돼요'); } };

/* ---------- 화면 전환 ---------- */
function show(name) {
  const cur = $$('.screen.active')[0];
  if (cur && cur.id !== 's-' + name && !['s-analyzing', 's-splash'].includes(cur.id)) state.prev = cur.id.slice(2);
  $$('.screen').forEach((s) => s.classList.remove('active'));
  const el = $('#s-' + name);
  el.classList.add('active');
  el.scrollTop = 0;
  if (name === 'home') renderHome();
  if (name === 'wish') renderWish();
  if (name === 'history') renderHistory();
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) { closeAll(); show(go.dataset.go); return; }
  if (e.target.closest('[data-back]')) { show(['wish', 'history'].includes(state.prev) ? state.prev : 'home'); return; }
  if (e.target.closest('[data-menu]')) { openDrawer(); return; }
  if (e.target.closest('[data-close]')) { closeAll(); return; }
  const nav = e.target.closest('[data-nav]');
  if (nav) { closeAll(); nav.dataset.nav === 'settings' ? openProfile(true) : show(nav.dataset.nav); return; }
  const shoot = e.target.closest('[data-shoot]');
  if (shoot) openShootSheet(shoot.dataset.shoot);
});

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 1800);
}

/* ---------- 메뉴·아래 창 ---------- */
function openDrawer() {
  const p = load('profile', {});
  $('#drawer-name').textContent = p.name || '여행자';
  $('#drawer-avatar').textContent = (p.name || 'T').slice(0, 1);
  $('#drawer-meta').textContent = [p.skin && p.skin + ' 피부', p.budget && '예산 ' + BUDGET_LABEL[p.budget]].filter(Boolean).join(' · ');
  const cur = ($$('.screen.active')[0] || {}).id?.slice(2);
  $$('.drawer-item').forEach((b) => b.classList.toggle('on', b.dataset.nav === cur || (b.dataset.nav === 'settings' && cur === 'profile')));
  clearTimeout(drawerTimer);
  $('#drawer').hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => $('#app').classList.add('menu-open')));
}
let drawerTimer;
function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').hidden = false;
}
function closeAll() {
  if ($('#app').classList.contains('menu-open')) {
    $('#app').classList.remove('menu-open');
    drawerTimer = setTimeout(() => { $('#drawer').hidden = true; }, 330);
  } else $('#drawer').hidden = true;
  $('#sheet').hidden = true;
  if (window.speechSynthesis) speechSynthesis.cancel();
}

/* ---------- 촬영: 카메라 또는 사진첩 ---------- */
const CAM_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-3.2l-1.6-2.4A1 1 0 0 0 14.4 4H9.6a1 1 0 0 0-.8.6L7.2 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/><circle cx="12" cy="13" r="4"/></svg>';
const LIB_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/></svg>';
function openShootSheet(kind) {
  const what = kind === 'tag' ? '가격표' : '제품';
  openSheet(`<h2>${what} 사진 고르기</h2><p class="sub">${kind === 'tag' ? '찍은 제품의 가격표가 잘 보이게 해주세요' : '제품 앞면 글자가 잘 보이면 정확해요'}</p>
    <div class="sheet-list">
      <label class="sheet-opt" for="in-${kind}-cam"><span class="ic">${CAM_ICON}</span><span>사진 찍기<small>카메라로 바로 찍어요</small></span></label>
      <label class="sheet-opt" for="in-${kind}-lib"><span class="ic">${LIB_ICON}</span><span>사진첩에서 가져오기<small>미리 찍어 둔 사진을 골라요</small></span></label>
    </div>`);
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

/* ---------- 내 정보 (첫 화면 · 설정) ---------- */
const BUDGET_LABEL = { '0-100000': '0원 ~ 10만원', '100000-200000': '10만 ~ 20만원', '200000-300000': '20만 ~ 30만원', '300000-': '30만원 ~' };
function openProfile(editing) {
  const p = load('profile', {});
  const f = $('#profile-form');
  f.name.value = p.name || '';
  f.allergyNote.value = p.allergyNote || '';
  $$('#profile-form .choices').forEach((box) => {
    const v = box.dataset.name === 'allergy' ? (p.allergy ? 'yes' : p.allergy === false ? 'no' : '')
      : box.dataset.name === 'pregnant' ? (p.pregnant ? 'yes' : p.pregnant === false ? 'no' : '')
        : p[box.dataset.name] || '';
    box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === v));
  });
  f.allergyNote.hidden = !p.allergy;
  $('#profile-back').hidden = !editing;
  $('#profile-logo').hidden = editing;
  $('#profile-title').innerHTML = editing ? '내 정보 수정' : '반가워요!<br>나에게 맞게 알려드릴게요';
  $('#profile-desc').textContent = editing ? '바꾼 내용은 성분 안내와 찜 목록 예산에 바로 반영돼요.' : '한 번만 입력하면 다음부터는 바로 시작해요. 이 정보는 내 휴대폰에만 저장돼요.';
  $('#profile-save').textContent = editing ? '저장하기' : '시작하기';
  show('profile');
}
$$('#profile-form .choices').forEach((box) => box.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  if (box.dataset.name === 'allergy') $('#profile-form').allergyNote.hidden = b.dataset.v !== 'yes';
}));
$('#profile-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  const pick = (n) => (f.querySelector(`[data-name="${n}"] .on`) || {}).dataset?.v || '';
  const prof = {
    name: f.name.value.trim(), skin: pick('skin'), color: pick('color'),
    allergy: pick('allergy') === 'yes', allergyNote: pick('allergy') === 'yes' ? f.allergyNote.value.trim() : '',
    pregnant: pick('pregnant') === 'yes', budget: pick('budget'),
  };
  if (!prof.skin) { toast('피부 타입을 골라주세요'); return; }
  if (!prof.budget) { toast('쇼핑 예산을 골라주세요'); return; }
  const before = JSON.stringify(load('profile', {}));
  save('profile', prof);
  if (before !== JSON.stringify(prof)) save('insight', {}); // 정보가 바뀌면 성분 안내를 새로 받는다
  toast('저장했어요');
  show('home');
  // 공유 링크로 처음 들어온 사람은 정보 입력 후 그 제품으로 바로 간다
  const shared = params.get('p');
  if (shared && !state.sharedOpened) { state.sharedOpened = true; openById(shared); }
});

/* ---------- 분석 중 화면 (멘트·순서는 그대로, 디자인만 변경) ---------- */
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
  stepTimer = setInterval(tick, 1200);
  show('analyzing');
}
function stopSteps() { clearInterval(stepTimer); }

/* ---------- 1차: 제품 사진 ---------- */
async function onProductPhoto(e) {
  const file = e.target.files[0];
  e.target.value = '';
  closeAll();
  if (!file) return;
  try {
    const dataUrl = await shrink(file);
    state.photo = dataUrl;
    startSteps('product', dataUrl);
    const r = await api('/api/identify', { image: dataUrl });
    stopSteps();
    state.store = null;
    if (r.found) openProduct(r.product);
    else { renderNotFound(r); show('result'); }
  } catch (err) {
    stopSteps();
    showError(err);
  }
}
$('#in-product-cam').addEventListener('change', onProductPhoto);
$('#in-product-lib').addEventListener('change', onProductPhoto);

function showError(err) {
  show(state.product ? 'result' : 'home');
  if (err.code === 'NO_KEY') toast('API 키가 아직 설정되지 않았어요');
  else toast(err.message || '문제가 생겼어요. 다시 찍어주세요');
}

/* ---------- 제품 정보 ---------- */
function openProduct(p, store = null) {
  state.product = p;
  state.store = store;
  state.insight = null;
  addHistory(p);
  renderResult();
  show('result');
  loadInsight(p);
}

// 실제로 열린 공식 사진 주소를 찜·최근 본 제품 썸네일에도 쓴다
function rememberImage(id, url) {
  for (const k of ['history', 'wish']) {
    const list = load(k, []);
    if (list.some((x) => x.id === id && x.img !== url)) save(k, list.map((x) => (x.id === id ? { ...x, img: url } : x)));
  }
  state.imgUrl = { id, url };
}

// 공식 사진 → 안 되면 다음 주소 → 다 안 되면 내가 찍은 사진
function officialPhoto(el, p) {
  const urls = [...(p.images || [])];
  const next = () => {
    const u = urls.shift();
    if (!u) {
      if (state.photo) { el.style.backgroundImage = `url('${state.photo}')`; el.setAttribute('aria-label', '내가 찍은 사진'); }
      else { el.classList.add('empty'); el.textContent = '제품 사진이 없어요'; }
      return;
    }
    const img = new Image();
    img.onload = () => { el.style.backgroundImage = `url('${u}')`; rememberImage(p.id, u); };
    img.onerror = next;
    img.src = u;
  };
  next();
}

function profileFlags() {
  const p = load('profile', {});
  return { skin: p.skin || '', allergy: !!p.allergy, allergyNote: p.allergyNote || '', pregnant: !!p.pregnant };
}

async function loadInsight(p) {
  const prof = profileFlags();
  const key = `${p.id}|${prof.skin}|${prof.allergy}|${prof.allergyNote}|${prof.pregnant}`;
  const cache = load('insight', {});
  if (cache[key]) { state.insight = cache[key]; renderInsight(); return; }
  try {
    const r = await api('/api/insight', { productId: p.id, profile: prof });
    if (state.product?.id !== p.id) return;
    state.insight = r;
    const c = load('insight', {});
    c[key] = r;
    const keys = Object.keys(c);
    if (keys.length > 60) delete c[keys[0]];
    save('insight', c);
    renderInsight();
  } catch {
    if (state.product?.id !== p.id) return;
    state.insight = { summary: [], cautions: [], failed: true };
    renderInsight();
  }
}

function ingredientList(ings, cautions) {
  const warn = new Map((cautions || []).map((c) => [c.name, c.reason]));
  let html = '';
  let group = null;
  ings.forEach((it) => {
    if (it.group && it.group !== group) { group = it.group; html += `<li class="group">${esc(group)}</li>`; }
    const chip = it.unsure ? `<span class="chip unsure">${it.unsure === '추정' ? '표준명 추정' : '확인 필요'}</span>`
      : it.role ? `<span class="chip">${esc(it.role)}</span>` : '';
    const name = warn.has(it.name)
      ? `<button class="ing-warn" data-why="${esc(it.name)}"><span aria-hidden="true">⚠</span>${esc(it.name)}<span class="warn-label">주의</span></button>`
      : `<span>${esc(it.name)}</span>`;
    html += `<li>${name}${chip}</li>`;
  });
  return html;
}

// 한국 올리브영 온라인몰 가격과 비교 (시트 '올리브영 비교' 탭 기준)
function oyCard(p, s) {
  const o = p.oy;
  if (!o) return '';
  const date = o.checked ? `${esc(o.checked)} 확인` : '';
  if (o.onlyDonki) {
    return `<section class="oy only"><span class="oy-badge">돈키호테에만 있어요</span>
      <p>${o.brandLevel ? '이 브랜드는 한국 올리브영 온라인몰에 입점해 있지 않아요.' : '한국 올리브영 온라인몰에서는 찾지 못한 제품이에요.'}</p><span class="small">${date}</span></section>`;
  }
  if (o.brandIn) {
    return `<section class="oy only"><span class="oy-badge">올리브영 입점 브랜드</span>
      <p>한국 올리브영에도 이 브랜드가 있어요. 같은 제품 가격은 아직 확인 중이에요.</p><span class="small">${date}</span></section>`;
  }
  const here = s ? s.won : p.won;
  const hereYen = s ? s.yen : p.yen;
  const refund = toWon(exTax(hereYen));
  const link = o.link ? ` · <a href="${esc(o.link)}" target="_blank" rel="noopener">올리브영에서 보기</a>` : '';
  if (o.differentSize) {
    const a = parseVol(o.vol), b = parseVol(p.vol);
    if (!a || !b) return '';
    const per = (won, v) => Math.round(won / v.n * 100);
    const oyPer = per(o.price, a), herePer = per(here, b);
    const diff = oyPer - herePer;
    const head = diff > 0 ? `<strong class="oy-win">100${b.u}당 돈키호테가 ${won(diff)} 저렴해요</strong>`
      : diff < 0 ? `<strong class="oy-lose">100${b.u}당 올리브영이 ${won(-diff)} 저렴해요</strong>` : `<strong>용량당 가격이 같아요</strong>`;
    return `<section class="oy">
      <span class="oy-badge">한국 올리브영과 비교 · 용량 다름</span>
      ${head}
      <div class="oy-row"><span>올리브영 ${esc(o.vol)} ${won(o.price)}</span><b>100${a.u}당 ${won(oyPer)}</b></div>
      <div class="oy-row"><span>${s ? '이 매장' : '돈키호테'} ${esc(p.vol)} ${won(here)}</span><b>100${b.u}당 ${won(herePer)}</b></div>
      <span class="small">${date}${link} · 용량이 달라 용량당 가격으로 비교했어요${a.u !== b.u ? ' (g·ml 단위 차이는 무시한 참고값)' : ''}</span>
    </section>`;
  }
  const diff = o.price - here;
  const head = diff > 0
    ? `<strong class="oy-win">돈키호테가 ${won(diff)} 저렴해요</strong>`
    : diff < 0 ? `<strong class="oy-lose">올리브영이 ${won(-diff)} 저렴해요</strong>`
    : `<strong>가격이 같아요</strong>`;
  const refundLine = o.price - refund > 0 && diff <= 0
    ? `<span class="small">면세 환급까지 받으면 돈키호테가 ${won(o.price - refund)} 저렴해요</span>` : '';
  return `<section class="oy">
      <span class="oy-badge">한국 올리브영과 비교</span>
      ${head}
      <div class="oy-row"><span>올리브영 온라인몰${o.startFrom ? ' (옵션별 시작가)' : ''}</span><b>${won(o.price)}</b></div>
      <div class="oy-row"><span>${s ? '이 매장' : '돈키호테 온라인몰'} (세금 포함)</span><b>${won(here)}</b></div>
      ${refundLine}
      <span class="small">${date}${link} · 세일에 따라 달라질 수 있어요</span>
    </section>`;
}

// "150ml", "169g", "30g(4회분)" → { n: 150, u: 'ml' }
function parseVol(v) {
  const m = /([\d.]+)\s*(ml|mL|g|ｇ|ｍｌ)/.exec(String(v || ''));
  if (!m) return null;
  const n = parseFloat(m[1]);
  return n > 0 ? { n, u: /g|ｇ/.test(m[2]) ? 'g' : 'ml' } : null;
}

function renderResult() {
  const p = state.product;
  const s = state.store;
  const rate = state.info?.rate100 || '-';
  const priceBlock = s
    ? `<span class="tag store">매장 가격</span>
       <div><span class="won">${won(s.won)}</span><span class="yen">${yen(s.yen)} 세금 포함</span></div>
       <div class="refund"><span>면세 환급 받으면</span><strong>${won(toWon(exTax(s.yen)))}</strong><span class="yen">${yen(exTax(s.yen))}</span></div>
       <span class="small">온라인몰 ${yen(p.yen)} · 100엔 = ${rate}원 · 환급은 세금 제외 ¥5,000 이상 구매 시</span>
       <button class="btn" data-shoot="tag">가격표 다시 찍기</button>`
    : `<span class="tag">온라인몰 기준 가격</span>
       <div><span class="won">${won(p.won)}</span><span class="yen">${yen(p.yen)} 세금 포함</span></div>
       <div class="refund"><span>면세 환급 받으면</span><strong>${won(toWon(exTax(p.yen)))}</strong><span class="yen">${yen(exTax(p.yen))}</span></div>
       <span class="small">매장 가격은 다를 수 있어요 · 100엔 = ${rate}원 · 환급은 세금 제외 ¥5,000 이상 구매 시</span>
       <button class="btn" data-shoot="tag">
         <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
         매장 가격표 찍기</button>`;
  const wished = load('wish', []).some((x) => x.id === p.id);
  const oyBlock = oyCard(p, s);
  const ICON = (d) => `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  $('#result-body').innerHTML = `
    <div class="stack">
      <div class="photo" id="p-photo" role="img" aria-label="공식 온라인몰 제품 사진"></div>
      <div>
        <div class="meta-line">${esc(p.brand)} · ${esc(p.cat)} · ${esc(p.vol)}</div>
        <h1 class="p-name">${esc(p.name)}</h1><div class="p-price">${won(s ? s.won : p.won)}</div>
        <p class="p-site">온라인몰 표기: ${esc(p.nameSite)}</p>
      </div>
      <section class="card"><p class="desc-label">제품 소개</p><ul class="summary loading" id="p-summary"><li>.</li><li>.</li><li>.</li></ul></section>
      <div class="quick">
        <button id="q-ings">${ICON('<path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4a1.5 1.5 0 0 0 1.3-2L14 9V3"/><path d="M7.5 14h9"/>')}전성분</button>
        <button id="ask-btn">${ICON('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>')}직원에게 묻기</button>
        <button id="share-btn">${ICON('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>')}공유</button>
      </div>
      <section class="price">${priceBlock}</section>
      ${oyBlock}
      <div id="p-caution"></div>
      ${p.note ? `<div class="note">${esc(p.note)}</div>` : ''}
      <section class="card acc ings" id="ing-acc">
        <button class="acc-head" id="ing-toggle" aria-expanded="false">
          <span class="card-title">전성분 <span>${p.ingredients.length}개</span></span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="acc-body">
          <ol id="ing-list">${ingredientList(p.ingredients, [])}</ol>
          <p class="source">표준 성분명 기준 · 출처: <a href="${esc(p.url)}" target="_blank" rel="noopener">돈키호테 공식 해외 온라인몰</a></p>
        </div>
      </section>
      <div class="result-foot btn-row">
        <button class="btn ${wished ? 'soft' : 'primary'}" id="wish-btn">${wished ? '♥ 찜했어요' : '♡ 찜하기'}</button>
        <button class="btn outline" data-go="wish" style="flex:0 0 128px">찜한 목록</button>
      </div>
    </div>`;
  officialPhoto($('#p-photo'), p);
  $('#ing-toggle').onclick = () => {
    const acc = $('#ing-acc');
    acc.classList.toggle('open');
    $('#ing-toggle').setAttribute('aria-expanded', acc.classList.contains('open'));
  };
  $('#wish-btn').onclick = toggleWish;
  $('#ask-btn').onclick = openAsk;
  $('#share-btn').onclick = shareProduct;
  $('#q-ings').onclick = () => {
    const acc = $('#ing-acc');
    acc.classList.add('open');
    $('#ing-toggle').setAttribute('aria-expanded', 'true');
    acc.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  $('#ing-list').onclick = onWhy;
  if (state.insight) renderInsight();
}

function renderInsight() {
  const ins = state.insight;
  const p = state.product;
  if (!ins || !p || !$('#p-summary')) return;
  const ul = $('#p-summary');
  ul.classList.remove('loading');
  ul.innerHTML = ins.summary?.length
    ? ins.summary.map((t) => `<li>${esc(t)}</li>`).join('')
    : `<li>${ins.failed ? '소개를 불러오지 못했어요.' : esc(p.name)}</li>`;
  const cautions = ins.cautions || [];
  $('#ing-list').innerHTML = ingredientList(p.ingredients, cautions);
  const prof = load('profile', {});
  $('#p-caution').innerHTML = cautions.length
    ? `<div class="caution-banner"><span aria-hidden="true">⚠️</span><span><strong>${cautions.length}개 성분</strong>을 ${esc(prof.skin || '내')} 피부 기준으로 살펴보면 좋아요. 전성분에서 <strong>⚠ 주의</strong> 표시를 눌러 이유를 확인하세요.</span></div>`
    : '';
}

function onWhy(e) {
  const b = e.target.closest('[data-why]');
  if (!b) return;
  const c = (state.insight?.cautions || []).find((x) => x.name === b.dataset.why);
  if (!c) return;
  const prof = load('profile', {});
  openSheet(`<h2 style="color:var(--primary-hover)">⚠ ${esc(c.name)}</h2>
    <p class="sub">${esc(prof.skin || '내')} 피부${prof.pregnant ? ' · 임신 중' : ''}${prof.allergy ? ' · 알레르기 있음' : ''} 기준</p>
    <p style="font-size:15px;line-height:1.6;margin:0 0 14px">${esc(c.reason)}</p>
    <p class="disclaimer">일반적으로 알려진 정보를 바탕으로 한 참고용 안내예요. 피부 상태에 따라 다를 수 있고, 의학적 진단이 아니에요. 걱정되면 전문가와 상의해 주세요.</p>
    <button class="btn outline" data-close style="margin-top:16px">닫기</button>`);
}

/* ---------- 공유: 링크 복사 ---------- */
async function shareProduct() {
  const p = state.product;
  if (!p) return;
  const url = `${location.origin}/?p=${p.id}`;
  try {
    await navigator.clipboard.writeText(url);
    toast('링크를 복사했어요');
  } catch {
    if (navigator.share) navigator.share({ title: p.name, url }).catch(() => {});
    else prompt('이 링크를 복사하세요', url);
  }
}

/* ---------- 일본인 직원에게 물어보기 ---------- */
const QUESTIONS = [
  { ko: '이 제품은 어디에 있나요?', ja: 'この商品はどこにありますか？' },
  { ko: '이 제품 재고 있나요?', ja: 'この商品の在庫はありますか？' },
  { ko: '테스터를 써봐도 되나요?', ja: 'テスターを試してもいいですか？' },
  { ko: '다른 색상(호수)도 있나요?', ja: 'ほかの色もありますか？' },
  { ko: '이 가격은 세금 포함인가요?', ja: 'この値段は税込ですか？' },
  { ko: '면세 받을 수 있나요?', ja: '免税できますか？' },
  { ko: '민감한 피부에도 괜찮나요?', ja: '敏感肌でも使えますか？' },
];
function openAsk() {
  openSheet(`<h2>일본인 직원에게 물어보기</h2><p class="sub">질문을 고르면 큰 일본어 문장으로 보여드려요. 화면을 직원에게 보여주세요.</p>
    <div class="sheet-list">${QUESTIONS.map((q, i) => `<button class="sheet-opt" data-q="${i}">${esc(q.ko)}<span class="chev" aria-hidden="true">›</span></button>`).join('')}</div>`);
  $('#sheet-body').onclick = (e) => {
    const b = e.target.closest('[data-q]');
    if (b) showQuestion(QUESTIONS[Number(b.dataset.q)]);
  };
}
function speak(text) {
  if (!window.speechSynthesis) { toast('이 브라우저는 음성 재생을 지원하지 않아요'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = 0.9;
  const ja = speechSynthesis.getVoices().find((v) => v.lang.startsWith('ja'));
  if (ja) u.voice = ja;
  speechSynthesis.speak(u);
}
function showQuestion(q) {
  // 온라인몰 표기에 일본어·한자가 있을 때만 직원에게 보여준다 (한국어 기계번역 표기는 숨김)
  const p = state.product && /[\u3040-\u30ff\u4e00-\u9fff]/.test(state.product.nameSite) ? state.product : null;
  $('#sheet-body').innerHTML = `
    <div class="ja-card">
      <p class="ja-text" lang="ja">${esc(q.ja)}</p>
      ${p ? `<p class="ja-prod" lang="ja">${esc(p.nameSite)}</p>` : ''}
      <p class="ko-text">${esc(q.ko)}</p>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="speak-btn">🔊 일본어로 듣기</button>
      <button class="btn outline" id="ask-back" style="flex:0 0 110px">다른 질문</button>
    </div>`;
  $('#sheet-body').onclick = null;
  $('#speak-btn').onclick = () => speak(q.ja + (p ? '。' + p.nameSite : ''));
  $('#ask-back').onclick = openAsk;
}

/* ---------- 찜하기 ---------- */
function toggleWish() {
  const p = state.product;
  let list = load('wish', []);
  if (list.some((x) => x.id === p.id)) {
    list = list.filter((x) => x.id !== p.id);
    toast('찜을 해제했어요');
  } else {
    const s = state.store;
    list.unshift({ id: p.id, name: p.name, yen: s ? s.yen : p.yen, won: s ? s.won : p.won, type: s ? 'store' : 'online', img: state.imgUrl?.id === p.id ? state.imgUrl.url : (p.images || [])[0] || '', checked: true });
    toast('찜했어요');
  }
  save('wish', list);
  renderResult();
}

/* ---------- 조회한 상품 ---------- */
function addHistory(p) {
  const list = load('history', []).filter((x) => x.id !== p.id);
  list.unshift({ id: p.id, name: p.name, won: p.won, yen: p.yen, img: (p.images || [])[0] || '', at: Date.now() });
  save('history', list.slice(0, 50));
}

function thumb(url) {
  return `<span class="thumb" ${url ? `style="background-image:url('${esc(url)}')"` : ''}></span>`;
}

// 2열 그리드 한 칸 (최근 본 제품). + 버튼 = 찜 (기존 찜 기능 그대로)
function gridCell(x) {
  const on = load('wish', []).some((w) => w.id === x.id);
  return `<div class="pcell">
    <button class="open" data-open="${x.id}"><span class="pimg" ${x.img ? `style="background-image:url('${esc(x.img)}')"` : ''}></span><span class="nm">${esc(x.name)}</span></button>
    <div class="foot"><span class="w">${won(x.won)}</span><button class="plus ${on ? 'on' : ''}" data-plus="${x.id}" aria-label="${on ? '찜 해제' : '찜하기'}">${on ? '♥' : '+'}</button></div>
  </div>`;
}
function wishFromList(id) {
  let list = load('wish', []);
  if (list.some((w) => w.id === id)) { list = list.filter((w) => w.id !== id); toast('찜을 해제했어요'); }
  else {
    const h = load('history', []).find((x) => x.id === id);
    if (!h) return;
    list.unshift({ id: h.id, name: h.name, yen: h.yen, won: h.won, type: 'online', img: h.img || '', checked: true });
    toast('찜했어요');
  }
  save('wish', list);
}

function dayLabel(t) {
  const d = new Date(t);
  const today = new Date();
  const diff = Math.floor((new Date(today.toDateString()) - new Date(d.toDateString())) / 86400000);
  return diff === 0 ? '오늘' : diff === 1 ? '어제' : `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

function renderHistory() {
  const list = load('history', []);
  if (!list.length) {
    $('#history-body').innerHTML = `<p class="empty">아직 본 제품이 없어요.<br>제품을 찍으면 여기에 차곡차곡 쌓여요.</p>
      <button class="btn primary" data-shoot="product">제품 찍기</button>`;
    return;
  }
  let html = '<div class="stack">';
  let day = '';
  let open = false;
  list.forEach((x) => {
    const d = dayLabel(x.at);
    if (d !== day) {
      if (open) html += '</div>';
      day = d;
      html += `<div class="date-label">${d}</div><div class="pgrid">`;
      open = true;
    }
    html += gridCell(x);
  });
  if (open) html += '</div>';
  html += `<button class="btn ghost" id="clear-history">기록 지우기</button></div>`;
  $('#history-body').innerHTML = html;
  $('#history-body').onclick = (e) => {
    const o = e.target.closest('[data-open]');
    const plus = e.target.closest('[data-plus]');
    if (plus) { wishFromList(Number(plus.dataset.plus)); renderHistory(); return; }
    if (o) openById(o.dataset.open);
    if (e.target.closest('#clear-history')) { save('history', []); renderHistory(); toast('기록을 지웠어요'); }
  };
}

/* ---------- 찜한 상품: 골라서 합계 ---------- */
function budgetMax() {
  const b = load('profile', {}).budget || '';
  const [, hi] = b.split('-');
  return hi ? Number(hi) : null;
}
function renderWish() {
  const list = load('wish', []);
  if (!list.length) {
    $('#wish-body').innerHTML = `<p class="empty">아직 찜한 제품이 없어요.<br>제품을 찍고 '찜하기'를 눌러보세요.</p>
      <button class="btn primary" data-shoot="product">제품 찍기</button>`;
    return;
  }
  const q = (x) => Math.max(1, x.qty || 1);
  const sel = list.filter((x) => x.checked !== false);
  const sumSel = sel.reduce((a, x) => a + x.won * q(x), 0);
  const sumSelYen = sel.reduce((a, x) => a + x.yen * q(x), 0);
  const sumAll = list.reduce((a, x) => a + x.won * q(x), 0);
  const cntSel = sel.reduce((a, x) => a + q(x), 0);
  const max = budgetMax();
  const budget = load('profile', {}).budget;
  const pct = max ? Math.min(100, Math.round((sumSel / max) * 100)) : 0;
  const allOn = sel.length === list.length;
  const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  const exSel = exTax(sumSelYen);
  const notice = exSel >= REFUND_MIN_YEN
    ? `<div class="notice">면세 환급 대상이에요 · 출국 때 소비세를 돌려받으면 <strong>${won(toWon(exSel))}</strong></div>`
    : `<div class="notice">세금 제외 <strong>${yen(REFUND_MIN_YEN - exSel)}</strong> 더 사면 면세 환급 대상이에요</div>`;
  $('#wish-body').innerHTML = `<div class="stack">
    ${notice}
    <button class="select-all" id="sel-all"><span class="check ${allOn ? 'on' : ''}">${CHECK}</span>전체 선택 (${sel.length}/${list.length})</button>
    <div class="plist">${list.map((x) => `
      <div class="pitem">
        <button class="check ${x.checked !== false ? 'on' : ''}" data-check="${x.id}" aria-label="${esc(x.name)} 선택">${CHECK}</button>
        ${thumb(x.img)}
        <button class="open" data-open="${x.id}">
          <span class="nm">${esc(x.name)}</span>
          <span class="row2"><span class="tg ${x.type}">${x.type === 'store' ? '매장' : '온라인몰'} · ${yen(x.yen)}</span><span class="w">${won(x.won * q(x))}</span></span>
        </button>
        <div class="qty" aria-label="${esc(x.name)} 수량">
          <button data-minus="${x.id}" aria-label="수량 줄이기">−</button><span>${q(x)}</span><button data-add="${x.id}" aria-label="수량 늘리기">+</button>
        </div>
        <button class="del" data-del="${x.id}" aria-label="${esc(x.name)} 찜 해제">✕</button>
      </div>`).join('')}</div>
    <div class="total">
      <div class="row"><span class="lbl">엔화 (세금 포함)</span><span class="w small">${yen(sumSelYen)}</span></div>
      <div class="row"><span class="lbl">면세 환급 받으면</span><span class="w small">${exSel >= REFUND_MIN_YEN ? won(toWon(exSel)) : '아직 대상 아님'}</span></div>
      <div class="row"><span class="lbl">찜 전체 ${list.length}종 합계</span><span class="w small">${won(sumAll)}</span></div>
      <div class="row big"><span class="card-title">선택한 ${sel.length}종 ${cntSel}개 합계</span><span class="w">${won(sumSel)}</span></div>
      ${budget ? `<div class="budget-bar" aria-hidden="true"><span class="${max && sumSel > max ? 'over' : ''}" style="width:${max ? pct : 100}%"></span></div>
        <span class="lbl">${max ? (sumSel > max ? `예산(${BUDGET_LABEL[budget]})보다 ${won(sumSel - max)} 많아요` : `예산(${BUDGET_LABEL[budget]})까지 ${won(max - sumSel)} 남았어요`) : `예산 ${BUDGET_LABEL[budget]}`}</span>` : ''}
    </div>
    <button class="btn primary" data-shoot="product">다른 제품 찍기</button></div>`;
  $('#wish-body').onclick = (e) => {
    const c = e.target.closest('[data-check]');
    const d = e.target.closest('[data-del]');
    const o = e.target.closest('[data-open]');
    let l = load('wish', []);
    if (e.target.closest('#sel-all')) { l = l.map((x) => ({ ...x, checked: !allOn })); save('wish', l); renderWish(); }
    else if (c) { l = l.map((x) => (x.id === Number(c.dataset.check) ? { ...x, checked: x.checked === false } : x)); save('wish', l); renderWish(); }
    else if (d) { confirmRemove(Number(d.dataset.del)); }
    else if (e.target.closest('[data-add]')) {
      const id = Number(e.target.closest('[data-add]').dataset.add);
      save('wish', l.map((x) => (x.id === id ? { ...x, qty: Math.min(99, q(x) + 1) } : x))); renderWish();
    } else if (e.target.closest('[data-minus]')) {
      const id = Number(e.target.closest('[data-minus]').dataset.minus);
      const it = l.find((x) => x.id === id);
      if (it && q(it) <= 1) confirmRemove(id);
      else { save('wish', l.map((x) => (x.id === id ? { ...x, qty: q(x) - 1 } : x))); renderWish(); }
    }
    else if (o) {
      const saved = l.find((x) => x.id === Number(o.dataset.open));
      openById(o.dataset.open, saved && saved.type === 'store' ? { yen: saved.yen, won: saved.won } : null);
    }
  };
}

// 수량 1개에서 −를 누르거나 ✕를 누르면 삭제할지 먼저 묻는다
function confirmRemove(id) {
  const it = load('wish', []).find((x) => x.id === id);
  if (!it) return;
  openSheet(`<h2>찜 목록에서 삭제할까요?</h2>
    <p class="sub">${esc(it.name)}</p>
    <div class="btn-row"><button class="btn outline" data-close>취소</button><button class="btn primary" id="rm-yes">삭제하기</button></div>`);
  $('#rm-yes').onclick = () => {
    save('wish', load('wish', []).filter((x) => x.id !== id));
    closeAll();
    renderWish();
    toast('삭제했어요');
  };
}

/* ---------- 목록에서 다시 열기 · 공유 링크 ---------- */
async function openById(id, store = null) {
  try {
    const r = await api('/api/info?product=' + id);
    state.photo = '';
    openProduct(r.product, store);
  } catch (err) { showError(err); }
}

/* ---------- 찾지 못했을 때 (혹시 이 제품인가요? 유지) ---------- */
function renderNotFound(r) {
  state.product = null;
  const cands = r.lowConfidenceProduct ? [r.lowConfidenceProduct, ...r.candidates] : r.candidates;
  $('#result-body').innerHTML = `
    <div class="stack">
      <div class="photo" style="background-image:url('${state.photo}')" role="img" aria-label="찍은 사진"></div>
      <div class="verdict">
        <h1>아직 등록되지 않은 제품이에요</h1>
        <p>TRIPICK 제품 DB(${state.info?.productCount ?? '-'}개)에서 같은 제품을 찾지 못했어요.</p>
      </div>
      <section class="card">
        <div class="sub">사진에서 읽은 내용</div>
        <p style="margin:6px 0 0;font-size:16px;font-weight:700">${esc(r.nameGuess || '읽지 못했어요')}</p>
        ${r.readText ? `<p class="sub" style="margin:4px 0 0">${esc(r.readText)}</p>` : ''}
      </section>
      ${cands.length ? `<section class="card"><div class="card-title" style="margin-bottom:4px">혹시 이 제품인가요?</div>
        ${cands.map((c) => `<button class="btn outline" style="min-height:48px;margin-top:8px;font-size:15px" data-pick="${c.id}">${esc(c.name)}</button>`).join('')}</section>` : ''}
      <button class="btn primary" data-shoot="product">다시 찍기</button>
    </div>`;
  $$('[data-pick]').forEach((b) => (b.onclick = () => openById(b.dataset.pick)));
}

/* ---------- 2차: 가격표 사진 ---------- */
async function onTagPhoto(e) {
  const file = e.target.files[0];
  e.target.value = '';
  closeAll();
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
}
$('#in-tag-cam').addEventListener('change', onTagPhoto);
$('#in-tag-lib').addEventListener('change', onTagPhoto);

function renderPrice(r) {
  const p = state.product;
  const ok = r.status === 'ok';
  const confirm = r.status === 'confirm';
  const badge = ok
    ? `<span class="badge ok">✓</span><h1>가격표를 확인했어요</h1><p>찍은 제품과 같은 제품의 가격표예요</p>`
    : confirm
      ? `<span class="badge warn">?</span><h1>가격이 예상과 많이 달라요</h1><p>온라인몰 ${yen(r.onlineYen)}과 차이가 커요. 가격표가 맞는지 확인해 주세요.</p>`
      : `<span class="badge warn">!</span><h1>${esc(r.reason)}</h1><p>찍은 제품의 가격표를 다시 찍어주세요.</p>`;
  const diff = r.yen != null ? r.yen - r.onlineYen : null;
  const priceCard = r.yen != null && (ok || confirm)
    ? `<section class="price"><span class="tag store">매장 가격</span>
        <div><span class="won">${won(r.won)}</span><span class="yen">${yen(r.yen)} (세금 포함)</span></div>
        <span class="small">${diff === 0 ? '온라인몰과 같아요' : diff < 0 ? `온라인몰보다 ¥${-diff} 저렴해요` : `온라인몰보다 ¥${diff} 비싸요`} (온라인몰 ${yen(r.onlineYen)})</span></section>`
    : '';
  const compare = !ok && !confirm
    ? `<section class="card"><div class="sub">찍은 제품</div><strong>${esc(p.name)}</strong>
        <hr style="border:none;border-top:1px solid var(--line);margin:10px 0">
        <div class="sub">가격표에서 읽은 제품</div><strong style="color:var(--primary-hover)">${esc(r.tag.name || '읽지 못했어요')}${r.tag.volume ? ' · ' + esc(r.tag.volume) : ''}</strong></section>`
    : '';
  const checks = `<ul class="card checks">${r.checks.map((c) => `
      <li><span class="mark ${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✕'}</span>
      <span class="label">${esc(c.label)}</span><span class="detail">${esc(c.detail)}</span></li>`).join('')}</ul>`;
  const buttons = ok || confirm
    ? `<button class="btn primary" id="use-store">매장 가격으로 바꾸기</button><button class="btn ghost" data-shoot="tag">가격표 다시 찍기</button>`
    : `<button class="btn primary" data-shoot="tag">가격표 다시 찍기</button><button class="btn ghost" data-go="result">온라인몰 가격 그대로 쓰기</button>`;
  $('#price-body').innerHTML = `<div class="stack"><div class="verdict">${badge}</div>${priceCard}${compare}${checks}${buttons}</div>`;
  const use = $('#use-store');
  if (use) use.onclick = () => {
    state.store = { yen: r.yen, won: r.won };
    const list = load('wish', []).map((x) => (x.id === p.id ? { ...x, yen: r.yen, won: r.won, type: 'store' } : x));
    save('wish', list);
    renderResult();
    show('result');
    toast('매장 가격으로 바꿨어요');
  };
}

/* ---------- 홈 ---------- */
function renderHome() {
  if (!state.info) return;
  $('#rate-val').textContent = Number(state.info.rate100).toLocaleString('ko-KR');
  $('#rate-date').textContent = state.info.rateDate;
  const n = load('wish', []).length;
  $('#wish-count').textContent = n;
  $('#wish-count').classList.toggle('zero', !n);
  const recent = load('history', []).slice(0, 4);
  $('#recent-head').hidden = !recent.length;
  $('#recent-body').innerHTML = recent.length
    ? `<div class="pgrid">${recent.map(gridCell).join('')}</div>`
    : `<section class="card"><p class="desc-label">이렇게 찍어 보세요</p><ol class="tips">
        <li><span class="n">1</span><span>제품 앞면의 글자가 잘 보이게 찍어요</span></li>
        <li><span class="n">2</span><span>제품명·원화 가격·전성분을 한국어로 보여줘요</span></li>
        <li><span class="n">3</span><span>매장 가격표도 찍으면 실제 가격으로 바꿔줘요</span></li></ol></section>`;
}
$('#recent-body').addEventListener('click', (e) => {
  const plus = e.target.closest('[data-plus]');
  if (plus) { wishFromList(Number(plus.dataset.plus)); renderHome(); return; }
  const o = e.target.closest('[data-open]');
  if (o) openById(o.dataset.open);
});

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
  setTimeout(() => {
    const prof = load('profile', null);
    if (!prof || !prof.skin) { openProfile(false); return; }
    show('home');
    const shared = params.get('p');
    if (shared) { state.sharedOpened = true; openById(shared); }
  }, wait);
}
boot();

/* ---------- 데모 모드 (?demo=1) ---------- */
let demoProducts;
async function demoApi(path, body) {
  await new Promise((r) => setTimeout(r, path.startsWith('/api/info') ? 300 : path === '/api/insight' ? 900 : 2400));
  if (!demoProducts) demoProducts = (await import('./demo-data.js')).default;
  const rate100 = demoProducts.meta.rate100;
  const pick = (id) => demoProducts.products.find((p) => p.id === Number(id));
  if (path.startsWith('/api/info?product=')) return { product: pick(path.split('=')[1]) };
  if (path === '/api/info') return { rate100, rateDate: demoProducts.meta.rateDate, productCount: demoProducts.products.length };
  if (path === '/api/identify') return { found: true, product: pick(30), candidates: [], readText: '', nameGuess: '' };
  if (path === '/api/insight') {
    const p = pick(body.productId);
    return {
      summary: ['로열젤리 추출물과 히알루론산이 들어간 시트 마스크예요.', '한 봉지에 4회분이 들어 있어 여행 중에 쓰기 좋아요.', '세안 후 스킨으로 정돈한 다음 붙이는 제품이에요.'],
      cautions: body.profile.skin === '민감성' && p ? p.ingredients.filter((i) => /에탄올|향료/.test(i.name)).map((i) => ({ name: i.name, reason: '민감한 피부에서는 따가움이나 붉어짐을 느낄 수 있다고 알려져 있어요.' })) : [],
    };
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
