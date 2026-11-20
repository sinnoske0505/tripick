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
  if (name === 'history') { histSel.on = false; histSel.ids.clear(); renderHistory(); }
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
  const p = getProfile();
  $('#drawer-name').textContent = '여행자';
  $('#drawer-avatar').textContent = 'T';
  $('#drawer-meta').textContent = [p.skins.length && p.skins.join('·') + ' 피부', p.colors.join('·')].filter(Boolean).join(' · ');
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

/* ---------- 내 정보 (첫 화면 · 설정): 전부 선택 사항 ---------- */
const BUDGET_LABEL = { '0-100000': '0원 ~ 10만원', '100000-200000': '10만 ~ 20만원', '200000-300000': '20만 ~ 30만원', '300000-': '30만원 ~' };
// 예전 형식(피부 타입 1개, 알레르기 메모)도 새 형식으로 읽는다
function getProfile() {
  const p = load('profile', {}) || {};
  return {
    ...p,
    skins: p.skins || (p.skin ? [p.skin] : []),
    colors: p.colors || (p.color ? [p.color] : []),
    allergens: p.allergens || [],
    allergyText: p.allergyText ?? p.allergyNote ?? '',
    allergyTerms: p.allergyTerms || [],
  };
}
function openProfile(editing) {
  const p = getProfile();
  const f = $('#profile-form');
  f.allergyText.value = p.allergyText;
  $$('#profile-form .choices').forEach((box) => {
    const vals = p[box.dataset.name] || [];
    box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', vals.includes(b.dataset.v)));
  });
  $('#profile-back').hidden = !editing;
  $('#profile-logo').hidden = editing;
  $('#profile-skip').hidden = editing;
  $('#profile-title').textContent = editing ? '내 피부 정보' : '나에게 맞게 알려드릴게요';
  $('#profile-save').textContent = editing ? '저장하기' : '시작하기';
  show('profile');
}
$$('#profile-form .choices').forEach((box) => box.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) b.classList.toggle('on');
}));
function afterProfile() {
  show('home');
  // 공유 링크로 처음 들어온 사람은 정보 입력 후 그 제품으로 바로 간다
  const shared = params.get('p');
  if (shared && !state.sharedOpened) { state.sharedOpened = true; openById(shared); }
}
$('#profile-skip').onclick = () => { save('profile', { ...getProfile(), done: true }); afterProfile(); };
$('#profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const picks = (n) => [...f.querySelectorAll(`[data-name="${n}"] .on`)].map((b) => b.dataset.v);
  const old = getProfile();
  const text = f.allergyText.value.trim();
  const prof = { ...old, done: true, skins: picks('skins'), colors: picks('colors'), allergens: picks('allergens'), allergyText: text };
  delete prof.skin; delete prof.color; delete prof.allergy; delete prof.allergyNote; delete prof.pregnant; delete prof.name;
  const changed = text !== old.allergyText || !old.allergyTerms.length;
  if (changed) prof.allergyTerms = text ? plainWords(text) : [];
  save('profile', prof);
  toast('저장했어요');
  afterProfile();
  // 직접 입력한 문장은 뒤에서 전성분 표기로 풀어 둔다 (기다리지 않음)
  if (changed && text) {
    const terms = await allergyTerms(text);
    const now = getProfile();
    if (now.allergyText === text) {
      save('profile', { ...now, allergyTerms: terms });
      if (state.product && $('#s-result').classList.contains('active')) renderResult();
    }
  }
});

// 직접 입력한 문장("티트리 알러지")을 전성분 표기로 풀어 둔다. 실패해도 입력한 낱말로 찾는다.
function plainWords(text) {
  return text.split(/[,，、/·\s]+/).map((w) => w.replace(/(알러지|알레르기|있어요|있음|성분|오일|추출물)$/g, '')).filter((w) => w.length >= 2);
}
async function allergyTerms(text) {
  const words = plainWords(text);
  try {
    const r = await api('/api/allergy', { text });
    return [...new Set([...(r.terms || []), ...words])].slice(0, 20);
  } catch { return words; }
}

// 등록한 성분과 전성분을 글자로만 대조한다 (AI 추측 없음)
const ALLERGEN_RULES = {
  향료: (n) => /향료|리날룰|리모넨|시트로넬올|제라니올|쿠마린|유제놀|헥실신남알|시트랄|파네솔|신남알|아밀신남|하이드록시시트로넬알|벤질살리실레이트|벤질벤조에이트|벤질신나메이트|참나무이끼|나무이끼/.test(n),
  방부제: (n) => /파라벤|아이소싸이아졸리논|이소치아졸리논|페녹시에탄올|벤질알코올|소듐벤조에이트|포타슘소르베이트|소르빅애씨드|벤조익애씨드|클로페네신|디엠디엠하이단토인|이미다졸리디닐우레아|다이아졸리디닐우레아|데하이드로아세틱애씨드|소듐데하이드로아세테이트|클로로자이레놀|트리클로산/.test(n),
  오일: (n) => /오일/.test(n) && !/미네랄오일|실리콘|하이드로제네이티드|피이지|PEG/.test(n),
  알코올: (n) => /^(에탄올|알코올|변성알코올)$|^알코올\s*\(|^변성\s*알코올/.test(n.replace(/\s+/g, '')),
};
const ALLERGEN_LABEL = { 향료: '향료', 방부제: '방부제', 오일: '에센셜오일·식물 오일', 알코올: '알코올' };
function allergyHits(ings) {
  const p = getProfile();
  const terms = p.allergyTerms.filter((t) => t.length >= 2);
  const hits = new Map();
  ings.forEach((it) => {
    const n = String(it.name || '');
    const labels = p.allergens.filter((k) => ALLERGEN_RULES[k]?.(n)).map((k) => ALLERGEN_LABEL[k]);
    if (terms.some((t) => n.includes(t))) labels.push(p.allergyText);
    if (labels.length) hits.set(n, [...new Set(labels)]);
  });
  return { registered: p.allergens.length > 0 || terms.length > 0, hits };
}
// 퍼스널컬러 카드: 색조 제품만. 출처가 확인된 추천만 보여주고 추측하지 않는다.
function pcCard(pc) {
  if (!pc) return '';
  const mine = getProfile().colors;
  const src = pc.source ? `<small>출처: <a href="${esc(pc.source.url)}" target="_blank" rel="noopener">${esc(pc.source.name)}</a></small>` : '';
  const list = pc.seasons.join('·');
  if (!pc.seasons.length) {
    return mine.length ? `<div class="pc-card none">🎨 이 색의 퍼스널컬러 추천 정보는 아직 찾지 못했어요<small>브랜드·뷰티 매체·전문가가 밝힌 정보만 보여드려요</small></div>` : '';
  }
  if (!mine.length) return `<div class="pc-card">🎨 <strong>${esc(list)}</strong>에게 추천된 색이에요${src}<small>내 퍼스널컬러를 등록하면 맞는지 알려드려요</small></div>`;
  const hit = mine.filter((c) => pc.seasons.includes(c));
  if (hit.length) return `<div class="pc-card hit">🎨 내 퍼스널컬러(<strong>${esc(hit.join('·'))}</strong>)에 추천된 색이에요${src}</div>`;
  return `<div class="pc-card">🎨 <strong>${esc(list)}</strong>에게 추천된 색이에요 · 내 퍼스널컬러(${esc(mine.join('·'))})는 추천 목록에 없어요${src}</div>`;
}
function allergyAlert(ings) {
  const { registered, hits } = allergyHits(ings);
  if (!registered) return '';
  if (!hits.size) return `<div class="allergy-alert">내가 등록한 성분은 들어 있지 않아요<small>전성분 표기와 글자로 대조한 결과예요</small></div>`;
  const labels = [...new Set([...hits.values()].flat())].map((l) => `‘${esc(l)}’`).join(', ');
  return `<div class="allergy-alert hit">⚠ 내가 등록한 ${labels} 관련 성분이 들어 있어요: <strong>${[...hits.keys()].map(esc).join(', ')}</strong>
    <small>전성분 표기와 글자로 대조한 관련 성분 확인용이에요</small></div>`;
}

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

async function loadInsight(p) {
  const key = `v2|${p.id}`;
  const cache = load('insight', {});
  if (cache[key]) { state.insight = cache[key]; renderInsight(); return; }
  try {
    const r = await api('/api/insight', { productId: p.id });
    if (state.product?.id !== p.id) return;
    state.insight = r;
    const c = load('insight', {});
    c[key] = r;
    const keys = Object.keys(c);
    if (keys.length > 80) delete c[keys[0]];
    save('insight', c);
    renderInsight();
  } catch {
    if (state.product?.id === p.id) state.insight = { features: [] };
  }
}

function ingredientList(ings) {
  const { hits } = allergyHits(ings);
  const row = (it, mine) => {
    const chip = it.unsure ? `<span class="chip unsure">${it.unsure === '추정' ? '표준명 추정' : '확인 필요'}</span>`
      : it.role ? `<span class="chip">${esc(it.role)}</span>` : '';
    return `<li class="${mine ? 'mine' : ''}"><span>${mine ? '⚠ ' : ''}${esc(it.name)}</span>${chip}</li>`;
  };
  let html = '';
  if (hits.size) {
    html += `<li class="group mine">내가 등록한 성분 관련</li>`;
    ings.filter((it) => hits.has(it.name)).forEach((it) => { html += row(it, true); });
    html += `<li class="group">전체 (표기 순서)</li>`;
  }
  let group = null;
  ings.forEach((it) => {
    if (it.group && it.group !== group) { group = it.group; html += `<li class="group">${esc(group)}</li>`; }
    html += row(it, hits.has(it.name));
  });
  return html;
}

// 한국 올리브영 온라인몰 가격과 비교 (시트 '올리브영 비교'·'브랜드 입점' 탭 기준)
function oyCard(p, s) {
  const o = p.oy;
  if (!o) return '';
  if (o.onlyDonki) {
    return `<section class="oy only"><span class="oy-badge">돈키호테에만 있어요</span>
      <p>${o.brandLevel ? '한국 올리브영 온라인몰에 없는 브랜드예요.' : '한국 올리브영 온라인몰에 없는 제품이에요.'}</p></section>`;
  }
  if (o.brandIn) return '';
  const here = s ? s.won : p.won;
  const label = s ? '이 매장' : '돈키호테';
  if (o.differentSize) {
    const a = parseVol(o.vol), b = parseVol(p.vol);
    if (!a || !b) return '';
    const per = (w, v) => Math.round(w / v.n * 100);
    const oyPer = per(o.price, a), herePer = per(here, b);
    const diff = oyPer - herePer;
    const head = diff > 0 ? `100${b.u}당 돈키호테가 ${won(diff)} 저렴해요`
      : diff < 0 ? `100${b.u}당 올리브영이 ${won(-diff)} 저렴해요` : '용량당 가격이 같아요';
    return `<section class="oy"><span class="oy-badge">한국 올리브영과 비교</span>
      <p class="oy-head">${head}</p>
      <div class="oy-row"><span>올리브영 ${esc(o.vol)}</span><b>${won(o.price)} (100${a.u}당 ${won(oyPer)})</b></div>
      <div class="oy-row"><span>${label} ${esc(p.vol)}</span><b>${won(here)} (100${b.u}당 ${won(herePer)})</b></div></section>`;
  }
  const diff = o.price - here;
  const head = diff > 0 ? `돈키호테가 ${won(diff)} 저렴해요` : diff < 0 ? `올리브영이 ${won(-diff)} 저렴해요` : '가격이 같아요';
  return `<section class="oy"><span class="oy-badge">한국 올리브영과 비교</span>
      <p class="oy-head">${head}</p>
      <div class="oy-row"><span>올리브영${o.startFrom ? ' (시작가)' : ''}</span><b>${won(o.price)}</b></div>
      <div class="oy-row"><span>${label}</span><b>${won(here)}</b></div></section>`;
}

// "150ml", "169g", "30g(4회분)" → { n: 150, u: 'ml' }
function parseVol(v) {
  const m = /([\d.]+)\s*(ml|mL|g|ｇ|ｍｌ)/.exec(String(v || ''));
  if (!m) return null;
  const n = parseFloat(m[1]);
  return n > 0 ? { n, u: /g|ｇ/.test(m[2]) ? 'g' : 'ml' } : null;
}

// 일본어(가나·한자)가 들어 있을 때만 원문 이름으로 보여준다
const hasJa = (t) => /[぀-ヿ一-鿿ｦ-ﾟ]/.test(String(t || ''));

function renderResult() {
  const p = state.product;
  const s = state.store;
  const wished = load('wish', []).some((x) => x.id === p.id);
  const ICON = (d) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
  const CAM = ICON('<path d="M20 7h-3.2l-1.6-2.4A1 1 0 0 0 14.4 4H9.6a1 1 0 0 0-.8.6L7.2 7H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1z"/><circle cx="12" cy="13" r="4"/>');
  const ASK = ICON('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>');
  const TAG = ICON('<path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/>');
  const SHARE = ICON('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>');
  $('#result-body').innerHTML = `
    <div class="stack" style="gap:24px">
      <div class="photo" id="p-photo" role="img" aria-label="제품 사진"></div>
      <div>
        <h1 class="p-name">${esc(p.name)}</h1>
        ${hasJa(p.nameSite) ? `<p class="p-ja" lang="ja">${esc(p.nameSite)}</p>` : ''}
        <div class="p-price">${s ? '<span class="tag">매장 가격</span>' : ''}<span class="won">${won(s ? s.won : p.won)}</span><span class="yen">${yen(s ? s.yen : p.yen)}</span></div>
      </div>
      ${allergyAlert(p.ingredients)}
      ${pcCard(p.pc)}
      <section class="card" id="p-features" hidden><p class="desc-label">핵심 특징</p><ul class="summary" id="p-summary"></ul></section>
      ${oyCard(p, s)}
      <section class="card acc ings" id="ing-acc">
        <button class="acc-head" id="ing-toggle" aria-expanded="false">
          <span class="card-title">전성분 <span>${p.ingredients.length}개</span></span>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="acc-body">
          <ol id="ing-list">${ingredientList(p.ingredients)}</ol>
          <p class="source">출처: <a href="${esc(p.url)}" target="_blank" rel="noopener">돈키호테 공식 온라인몰</a></p>
        </div>
      </section>
      <div class="acts">
        <button class="btn" data-shoot="product">${CAM}다른 제품 찍기</button>
        <button class="btn" id="ask-btn">${ASK}직원에게 묻기</button>
        <button class="btn" data-shoot="tag">${TAG}${s ? '가격표 다시 찍기' : '매장 가격표 찍기'}</button>
        <button class="btn" id="share-btn">${SHARE}공유</button>
      </div>
      <div class="result-foot">
        <button class="btn ${wished ? 'soft' : 'primary'}" id="wish-btn">${wished ? '♥ 찜했어요' : '♡ 찜하기'}</button>
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
  if (state.insight) renderInsight();
}

function renderInsight() {
  const ins = state.insight;
  if (!ins || !state.product || !$('#p-features')) return;
  const items = (ins.features || []).slice(0, 3);
  $('#p-features').hidden = !items.length;
  $('#p-summary').innerHTML = items.map((f) => `<li><b>${esc(f.key)}</b> — ${esc(f.text)}</li>`).join('');
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
// 직원에게 묻기: 길게 설명해야 하는 질문은 빼고 4개만. 답은 직원이 손가락으로 고른다.
const QUESTIONS = [
  { ko: '이 제품은 어디에 있나요?', ja: 'この商品はどこにありますか？', say: '고노 쇼힌와 도코니 아리마스카?',
    answers: [['あちらです', '저쪽이에요'], ['この階です', '이 층에 있어요'], ['別の階です', '다른 층에 있어요'], ['売り切れです', '다 팔렸어요']] },
  { ko: '이 제품 재고 있나요?', ja: 'この商品の在庫はありますか？', say: '고노 쇼힌노 자이코와 아리마스카?',
    answers: [['はい、あります', '네, 있어요'], ['確認します', '확인해 볼게요'], ['在庫はありません', '재고가 없어요']] },
  { ko: '테스터를 써 봐도 되나요?', ja: 'テスターを試してもいいですか？', say: '테스타오 타메시테모 이이데스카?',
    answers: [['はい、どうぞ', '네, 써 보세요'], ['テスターはありません', '테스터가 없어요'], ['使えません', '쓸 수 없어요']] },
  { ko: '면세 되나요?', ja: '免税できますか？', say: '멘제 데키마스카?',
    answers: [['はい、できます', '네, 돼요'], ['レジでパスポートを見せてください', '계산대에서 여권을 보여 주세요'], ['税抜5,000円以上で免税です', '세금 빼고 5,000엔 이상이면 돼요'], ['できません', '안 돼요']] },
];
function openAsk() {
  openSheet(`<h2>직원에게 묻기</h2><p class="sub">질문을 고르면 일본어로 크게 보여드려요</p>
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
  const p = state.product;
  const jaName = p && hasJa(p.nameSite) ? p.nameSite : '';
  const img = p && state.imgUrl?.id === p.id ? state.imgUrl.url : '';
  $('#sheet-body').innerHTML = `
    <div class="ja-card">
      ${p ? `<div class="ask-prod">${img ? `<span class="thumb" style="background-image:url('${esc(img)}')"></span>` : ''}${jaName ? `<span lang="ja">${esc(jaName)}</span>` : ''}</div>` : ''}
      <p class="ja-text" lang="ja">${esc(q.ja)}</p>
      <p class="say">${esc(q.say)}</p>
      <p class="ko-text">${esc(q.ko)}</p>
    </div>
    <button class="btn primary" id="speak-btn">🔊 일본어로 듣기</button>
    <section class="point">
      <p class="point-head" lang="ja">こちらから指してください<span>직원이 손가락으로 답을 가리켜요</span></p>
      <div class="point-grid">${q.answers.map(([ja, ko]) => `<button class="point-btn" type="button"><b lang="ja">${esc(ja)}</b><span>${esc(ko)}</span></button>`).join('')}</div>
    </section>
    <button class="btn outline" id="ask-back">다른 질문</button>`;
  $('#sheet-body').onclick = (e) => {
    const b = e.target.closest('.point-btn');
    if (!b) return;
    $$('.point-btn').forEach((x) => x.classList.toggle('on', x === b));
  };
  $('#speak-btn').onclick = () => speak(q.ja + (jaName ? '。' + jaName : '') + '。こちらから指してください');
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

// 기록 지우기: 체크해서 고른 것만 지운다 (찜 목록과 같은 방식)
const histSel = { on: false, ids: new Set() };
function renderHistory() {
  const list = load('history', []);
  if (!list.length) {
    histSel.on = false; histSel.ids.clear();
    $('#history-body').innerHTML = `<p class="empty">아직 본 제품이 없어요.<br>제품을 찍으면 여기에 차곡차곡 쌓여요.</p>
      <button class="btn primary" data-shoot="product">제품 찍기</button>`;
    return;
  }
  const CHECK = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>';
  let html = '<div class="stack">';
  if (histSel.on) {
    const allOn = histSel.ids.size === list.length;
    html += `<div class="row-between"><button class="select-all" id="h-all"><span class="check ${allOn ? 'on' : ''}">${CHECK}</span>전체 선택 (${histSel.ids.size}/${list.length})</button>
      <button class="text-btn" id="h-cancel">취소</button></div>`;
  }
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
    html += histSel.on
      ? `<div class="pcell selectable ${histSel.ids.has(x.id) ? 'picked' : ''}" data-pick-h="${x.id}">
          <span class="check ${histSel.ids.has(x.id) ? 'on' : ''}">${CHECK}</span>
          <span class="pimg" ${x.img ? `style="background-image:url('${esc(x.img)}')"` : ''}></span><span class="nm">${esc(x.name)}</span>
          <div class="foot"><span class="w">${won(x.won)}</span></div></div>`
      : gridCell(x);
  });
  if (open) html += '</div>';
  html += histSel.on
    ? `<button class="btn primary" id="h-del" ${histSel.ids.size ? '' : 'disabled'}>선택한 ${histSel.ids.size}개 지우기</button>`
    : `<button class="btn ghost" id="clear-history">기록 지우기</button>`;
  html += '</div>';
  $('#history-body').innerHTML = html;
  $('#history-body').onclick = (e) => {
    if (histSel.on) {
      const c = e.target.closest('[data-pick-h]');
      if (c) { const id = Number(c.dataset.pickH); histSel.ids.has(id) ? histSel.ids.delete(id) : histSel.ids.add(id); renderHistory(); return; }
      if (e.target.closest('#h-all')) {
        if (histSel.ids.size === list.length) histSel.ids.clear(); else list.forEach((x) => histSel.ids.add(x.id));
        renderHistory(); return;
      }
      if (e.target.closest('#h-cancel')) { histSel.on = false; histSel.ids.clear(); renderHistory(); return; }
      if (e.target.closest('#h-del') && histSel.ids.size) {
        const n = histSel.ids.size;
        openSheet(`<h2>선택한 ${n}개 기록을 지울까요?</h2><p class="sub">지운 기록은 되돌릴 수 없어요. 찜한 상품은 그대로 남아요.</p>
          <div class="btn-row"><button class="btn outline" data-close>취소</button><button class="btn primary" id="h-yes">지우기</button></div>`);
        $('#h-yes').onclick = () => {
          save('history', load('history', []).filter((x) => !histSel.ids.has(x.id)));
          histSel.on = false; histSel.ids.clear();
          closeAll(); renderHistory(); toast(`${n}개 기록을 지웠어요`);
        };
      }
      return;
    }
    const o = e.target.closest('[data-open]');
    const plus = e.target.closest('[data-plus]');
    if (plus) { wishFromList(Number(plus.dataset.plus)); renderHistory(); return; }
    if (o) openById(o.dataset.open);
    if (e.target.closest('#clear-history')) { histSel.on = true; histSel.ids.clear(); renderHistory(); }
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
    ? `<div class="notice">면세 환급 대상이에요 · 돌려받으면 <strong>${won(toWon(exSel))}</strong><small>한 매장에서 세금 제외 ¥5,000 이상 사고 여권을 보여 주면, 출국할 때 공항 세관 확인 후 돌려받아요</small></div>`
    : `<div class="notice">세금 제외 <strong>${yen(REFUND_MIN_YEN - exSel)}</strong> 더 사면 면세 환급 대상이에요<small>한 매장에서 세금 제외 ¥5,000 이상 사고 여권을 보여 주면, 출국할 때 공항 세관 확인 후 돌려받아요</small></div>`;
  $('#wish-body').innerHTML = `<div class="stack">
    ${notice}
    <button class="select-all" id="sel-all"><span class="check ${allOn ? 'on' : ''}">${CHECK}</span>전체 선택 (${sel.length}/${list.length})</button>
    <div class="plist">${list.map((x) => `
      <div class="pitem">
        <button class="check ${x.checked !== false ? 'on' : ''}" data-check="${x.id}" aria-label="${esc(x.name)} 선택">${CHECK}</button>
        ${thumb(x.img)}
        <div class="wbody">
          <button class="open" data-open="${x.id}">
            <span class="nm">${esc(x.name)}</span>
            <span class="row2"><span class="tg ${x.type}">${x.type === 'store' ? '매장' : '온라인몰'} · ${yen(x.yen)}</span><span class="w">${won(x.won * q(x))}</span></span>
          </button>
          <div class="row3">
            <div class="qty" aria-label="${esc(x.name)} 수량">
              <button data-minus="${x.id}" aria-label="수량 줄이기">−</button><span>${q(x)}</span><button data-add="${x.id}" aria-label="수량 늘리기">+</button>
            </div>
            <button class="del" data-del="${x.id}" aria-label="${esc(x.name)} 찜 해제">삭제</button>
          </div>
        </div>
      </div>`).join('')}</div>
    <div class="total">
      <div class="row"><span class="lbl">엔화 (세금 포함)</span><span class="w small">${yen(sumSelYen)}</span></div>
      <div class="row"><span class="lbl">면세 환급 예상액 (참고)</span><span class="w small">${exSel >= REFUND_MIN_YEN ? won(toWon(exSel)) : '아직 대상 아님'}</span></div>
      <div class="row"><span class="lbl">찜 전체 ${list.length}종 합계</span><span class="w small">${won(sumAll)}</span></div>
      <div class="row big"><span class="card-title">선택한 ${sel.length}종 ${cntSel}개 합계</span><span class="w">${won(sumSel)}</span></div>
      <button class="text-btn budget-btn" id="budget-set">${budget ? '예산 바꾸기' : '+ 쇼핑 예산 정하기'}</button>
      ${budget ? `<div class="budget-bar" aria-hidden="true"><span class="${max && sumSel > max ? 'over' : ''}" style="width:${max ? pct : 100}%"></span></div>
        <span class="lbl">${max ? (sumSel > max ? `예산(${BUDGET_LABEL[budget]})보다 ${won(sumSel - max)} 많아요` : `예산(${BUDGET_LABEL[budget]})까지 ${won(max - sumSel)} 남았어요`) : `예산 ${BUDGET_LABEL[budget]}`}</span>` : ''}
    </div>
    <button class="btn primary" data-shoot="product">다른 제품 찍기</button></div>`;
  $('#wish-body').onclick = (e) => {
    const c = e.target.closest('[data-check]');
    const d = e.target.closest('[data-del]');
    const o = e.target.closest('[data-open]');
    let l = load('wish', []);
    if (e.target.closest('#budget-set')) { openBudget(); return; }
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

function openBudget() {
  const cur = getProfile().budget || '';
  openSheet(`<h2>쇼핑 예산</h2><p class="sub">찜 목록 합계와 비교해 알려드려요</p>
    <div class="sheet-list">${Object.entries(BUDGET_LABEL).map(([k, v]) => `<button class="sheet-opt" data-b="${k}">${v}${k === cur ? '<span class="chev">✓</span>' : ''}</button>`).join('')}
    <button class="sheet-opt" data-b="">정하지 않기</button></div>`);
  $('#sheet-body').onclick = (e) => {
    const b = e.target.closest('[data-b]');
    if (!b) return;
    save('profile', { ...getProfile(), budget: b.dataset.b });
    closeAll();
    renderWish();
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

/* ---------- 찾지 못했을 때: 후보 사진 · 이름으로 찾기 · 구글 검색 ---------- */
function candList(list) {
  return `<div class="plist">${list.map((c) => `
    <button class="pitem cand" data-pick="${c.id}">
      ${thumb(c.img)}
      <span class="wbody"><span class="nm">${esc(c.name)}</span><span class="w">${c.yen ? won(toWon(c.yen)) : ''}</span></span>
      <span aria-hidden="true" class="chev">›</span>
    </button>`).join('')}</div>`;
}
function renderNotFound(r) {
  state.product = null;
  const cands = r.lowConfidenceProduct ? [r.lowConfidenceProduct, ...r.candidates] : r.candidates;
  const g = r.searchText || r.nameGuess || '';
  $('#result-body').innerHTML = `
    <div class="stack" style="gap:24px">
      <div class="photo" style="background-image:url('${state.photo}')" role="img" aria-label="찍은 사진"></div>
      <h1 class="p-name">TRIPICK에 아직 등록되지 않은 제품이에요</h1>
      ${cands.length ? `<section><h2 class="sec-title">혹시 이 제품인가요?</h2>${candList(cands)}</section>` : ''}
      <section><h2 class="sec-title">이름으로 찾기</h2>
        <form class="search-row" id="nf-search"><input name="q" type="search" placeholder="브랜드나 제품 이름" value="${esc(r.nameGuess || '')}" aria-label="제품 이름"><button class="btn primary" type="submit">찾기</button></form>
        <div id="nf-results"></div></section>
      ${g ? `<a class="btn outline" href="https://www.google.com/search?q=${encodeURIComponent(g)}" target="_blank" rel="noopener">구글에서 이 제품 검색하기 ›</a>` : ''}
      <button class="btn primary" data-shoot="product">다시 찍기</button>
    </div>`;
  $('#result-body').onclick = (e) => { const b = e.target.closest('[data-pick]'); if (b) openById(b.dataset.pick); };
  $('#nf-search').onsubmit = async (e) => {
    e.preventDefault();
    const q = e.target.q.value.trim();
    if (!q) return;
    $('#nf-results').innerHTML = '<p class="hint">찾는 중…</p>';
    try {
      const { results } = await api('/api/search?q=' + encodeURIComponent(q));
      $('#nf-results').innerHTML = results.length ? candList(results) : '<p class="hint">맞는 제품이 없어요</p>';
    } catch { $('#nf-results').innerHTML = '<p class="hint">검색하지 못했어요</p>'; }
  };
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
    ? `<span class="badge ok">✓</span><h1>가격표를 확인했어요</h1>`
    : confirm
      ? `<span class="badge warn">?</span><h1>가격이 온라인몰과 많이 달라요</h1><p>숫자가 맞는지 확인하고 필요하면 고쳐 주세요</p>`
      : `<span class="badge warn">!</span><h1>${esc(r.reason)}</h1><p>찍은 제품의 가격표를 다시 찍어 주세요</p>`;
  if (!(ok || confirm) || r.yen == null) {
    $('#price-body').innerHTML = `<div class="stack" style="gap:24px"><div class="verdict">${badge}</div>
      <section class="card"><div class="sub">찍은 제품</div><strong>${esc(p.name)}</strong>
        <hr style="border:none;border-top:1px solid var(--line);margin:10px 0">
        <div class="sub">가격표에서 읽은 제품</div><strong>${esc(r.tag?.name || '읽지 못했어요')}${r.tag?.volume ? ' · ' + esc(r.tag.volume) : ''}</strong></section>
      <button class="btn primary" data-shoot="tag">가격표 다시 찍기</button>
      <button class="btn ghost" data-go="result">돌아가기</button></div>`;
    return;
  }
  $('#price-body').innerHTML = `<div class="stack" style="gap:24px"><div class="verdict">${badge}</div>
    <section class="price">
      <p class="tag-name">${esc(p.name)}</p>
      <label class="yen-edit"><span>¥</span><input id="tag-yen" type="number" inputmode="numeric" min="1" max="999999" value="${r.yen}" aria-label="매장 가격(엔, 세금 포함)"></label>
      <p class="tag-won">약 <strong id="tag-won">${won(toWon(r.yen))}</strong> · 세금 포함</p>
      <p class="tag-hint">숫자가 다르면 눌러서 고칠 수 있어요</p>
    </section>
    <button class="btn primary" id="tag-save">이 가격으로 찜에 저장</button>
    <button class="btn outline" id="tag-skip">저장하지 않기</button>
    <p class="hint">저장하지 않으면 이 가격은 사라지고 온라인몰 가격으로 돌아가요</p></div>`;
  const inp = $('#tag-yen');
  const val = () => Math.round(Number(inp.value));
  inp.oninput = () => { $('#tag-won').textContent = val() > 0 ? won(toWon(val())) : '-'; };
  $('#tag-skip').onclick = () => { show('result'); };
  $('#tag-save').onclick = () => {
    const y = val();
    if (!(y > 0)) { toast('가격을 입력해 주세요'); return; }
    state.store = { yen: y, won: toWon(y) };
    let list = load('wish', []);
    const item = { id: p.id, name: p.name, yen: y, won: toWon(y), type: 'store', img: state.imgUrl?.id === p.id ? state.imgUrl.url : (p.images || [])[0] || '', checked: true };
    list = list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? { ...x, ...item, qty: x.qty } : x)) : [item, ...list];
    save('wish', list);
    renderResult();
    show('result');
    toast('매장 가격으로 찜에 저장했어요');
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
    if (!prof || !(prof.done || prof.skin)) { openProfile(false); return; }
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
  const DEMO_PC = { 2: { seasons: ['봄웜', '여름쿨'], source: { name: 'VOCE · 메이크업&컬러 컨설턴트', url: 'https://i-voce.jp/' } }, 3: { seasons: [] } };
  const pick = (id) => { const p = demoProducts.products.find((x) => x.id === Number(id)); return p && { ...p, pc: DEMO_PC[p.id] || null }; };
  if (path.startsWith('/api/info?product=')) return { product: pick(path.split('=')[1]) };
  if (path === '/api/info') return { rate100, rateDate: demoProducts.meta.rateDate, productCount: demoProducts.products.length };
  if (path === '/api/identify') {
    if (params.has('nf')) {
      const c = demoProducts.products.slice(1, 3).map((p) => ({ id: p.id, name: p.name, vol: p.vol, yen: p.yen, img: '' }));
      return { found: false, product: null, lowConfidenceProduct: null, candidates: c, readText: '', nameGuess: '오페라 마이 래쉬', searchText: 'オペラ マイラッシュ' };
    }
    return { found: true, product: pick(30), candidates: [], readText: '', nameGuess: '' };
  }
  if (path === '/api/insight') return { features: [{ key: '자외선 차단', text: 'SPF40 PA+++' }] };
  if (path.startsWith('/api/search')) return { results: demoProducts.products.slice(0, 3).map((p) => ({ id: p.id, name: p.name, vol: p.vol, yen: p.yen, img: '' })) };
  if (path === '/api/allergy') return { terms: ['티트리잎오일', '티트리'] };
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
