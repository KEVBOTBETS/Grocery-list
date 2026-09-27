/* Grocery List — extra features:
   store showdown (split vs one store), usuals, meals -> list, barcode scanner,
   weekly budget + trip log, own coupons, price history and deal alerts.
   Loaded before app.js; only defines functions/listeners — app.js globals are used at call time. */
'use strict';

const REPO = 'KEVBOTBETS/Grocery-list';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/`;
const HIST_KEY = 'gl.hist.v1';

const MEALS = [
  { name: 'Tacos', items: ['Ground beef lean', 'Taco shells', 'Shredded cheese', 'Lettuce', 'Tomatoes', 'Salsa', 'Sour cream'] },
  { name: 'Spaghetti & meat sauce', items: ['Spaghetti', 'Pasta sauce', 'Ground beef lean', 'Parmesan cheese'] },
  { name: 'Chicken stir-fry', items: ['Chicken breast', 'Stir fry vegetables', 'Rice', 'Soy sauce'] },
  { name: 'Burgers', items: ['Ground beef extra lean', 'Hamburger buns', 'Cheese slices', 'Lettuce', 'Tomatoes', 'Ketchup'] },
  { name: 'Butter chicken', items: ['Chicken thighs', 'Butter chicken sauce', 'Rice', 'Naan'] },
  { name: 'Homemade pizza', items: ['Pizza dough', 'Pizza sauce', 'Mozzarella cheese', 'Pepperoni'] },
  { name: 'Chili', items: ['Ground beef lean', 'Kidney beans', 'Diced tomatoes', 'Onions', 'Shredded cheese'] },
  { name: 'Chicken fajitas', items: ['Chicken breast', 'Tortillas', 'Peppers', 'Onions', 'Salsa', 'Sour cream'] },
  { name: 'Grilled cheese & soup', items: ['Stonemill sourdough bread', 'Cheese slices', 'Butter', 'Tomato soup'] },
  { name: 'Pancake breakfast', items: ['Pancake mix', 'Maple syrup', 'Eggs', 'Lactose-free milk', 'Strawberries'] },
  { name: 'Mac & cheese night', items: ['Macaroni', 'Cheddar cheese', 'Lactose-free milk', 'Butter'] },
  { name: 'Sheet-pan sausages', items: ['Sausages', 'Potatoes', 'Peppers', 'Onions'] },
  { name: 'Salmon rice bowls', items: ['Salmon', 'Rice', 'Cucumber', 'Avocado'] },
  { name: 'School lunches', items: ['Stonemill sourdough bread', 'Sliced ham', 'Cheese slices', 'Apples', 'Mini Oreos', 'Fruitsations', 'Apple sauce pouches', 'Yogurt'] },
];

const FICON = {
  star: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  starOn: '<svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  meal: '<svg viewBox="0 0 24 24"><path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3.5 3.5-3.5 7s1.5 4 3.5 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 8v8M11 8v8M14 8v8M17 8v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  bell: '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
  tag: '<svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8zM7.5 8.5h.01" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---------- data from GitHub (price history + alert watch list) ----------
let serverHist = null;   // { updated, items: { key: { name, weeks: { 'YYYY-MM-DD': { p, per, store, product } } } } }
let serverWatch = null;  // watch.json as published
let localHist = {};

function featuresInit() {
  state.usuals = Array.isArray(state.usuals) ? state.usuals : [];
  state.meals = Array.isArray(state.meals) ? state.meals : [];
  state.budget = Object.assign({ weekly: 0, trips: [] }, state.budget || {});
  if (!Array.isArray(state.budget.trips)) state.budget.trips = [];
  localHist = lsGet(HIST_KEY) || {};
  serverHist = lsGet('gl.srvhist') || null;
  serverWatch = lsGet('gl.srvwatch') || null;
  loadRemote();
}
async function loadRemote() {
  const get = async path => {
    const r = await fetch(RAW + path + '?t=' + Math.floor(Date.now() / 300000), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return r.json();
  };
  try { serverWatch = await get('watch.json'); lsSet('gl.srvwatch', serverWatch); } catch { /* offline or not published yet */ }
  try { serverHist = await get('data/history.json'); lsSet('gl.srvhist', serverHist); } catch { /* first run hasn't happened */ }
  scheduleRender();
}

// ---------- weeks ----------
const pad2 = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
function flyerWeek(d = new Date()) { // flyers run Thursday to Wednesday
  const x = new Date(d); x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() - 4 + 7) % 7));
  return ymd(x);
}
function calWeek(d = new Date()) { // budgets run Monday to Sunday
  const x = new Date(d); x.setHours(12, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return ymd(x);
}
const shortDate = key => new Date(key + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });

// ---------- price history ----------
const priceKey = c => perLb(c) ?? effPrice(c, 1);
function onResults(k) {
  candMemo = new Map(); // results just changed
  const wk = flyerWeek();
  let changed = false;
  for (const item of state.items) {
    if (normText(item.q) !== k) continue;
    const ch = chooseFor(item);
    if (!ch.pick) continue;
    const key = normText(nameOf(item));
    const rec = { p: +priceKey(ch.pick).toFixed(2), per: ch.pick.per ? 'lb' : null, store: ch.pick.storeId, product: ch.pick.name.slice(0, 80) };
    const h = localHist[key] = localHist[key] || {};
    const prev = h[wk];
    if (!prev || rec.p < prev.p || prev.store === rec.store) { h[wk] = rec; changed = true; }
  }
  if (changed) {
    // keep 26 weeks per item
    for (const key of Object.keys(localHist)) {
      const weeks = Object.keys(localHist[key]).sort();
      weeks.slice(0, Math.max(0, weeks.length - 26)).forEach(w => delete localHist[key][w]);
    }
    lsSet(HIST_KEY, localHist);
  }
}
function histSeries(item) {
  const keys = [normText(nameOf(item)), normText(item.q)];
  const merged = {};
  for (const k of keys) Object.assign(merged, localHist[k] || {});
  const srv = serverHist && serverHist.items ? (serverHist.items[keys[0]] || serverHist.items[keys[1]]) : null;
  if (srv && srv.weeks) Object.assign(merged, srv.weeks); // the daily tracker wins where both exist
  return Object.keys(merged).sort().map(w => ({ week: w, ...merged[w] })).filter(x => x.p > 0);
}
function median(a) { const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function histVerdict(item, pick) {
  const series = histSeries(item);
  const wk = flyerWeek();
  const prev = series.filter(x => x.week < wk);
  if (prev.length < 2 || !pick) return { series, verdict: null };
  const cur = priceKey(pick);
  const min = Math.min(...prev.map(x => x.p));
  const med = median(prev.map(x => x.p));
  const weeks = Math.round((new Date(wk) - new Date(prev[0].week)) / 6048e5) + 1;
  if (cur <= min + 0.001) return { series, verdict: 'low', weeks, med, min };
  if (cur > med * 1.08) return { series, verdict: 'high', weeks, med, min };
  return { series, verdict: 'usual', weeks, med, min };
}
function watchItems() { return (serverWatch && Array.isArray(serverWatch.items)) ? serverWatch.items : []; }
function watchFor(item) {
  const keys = [normText(nameOf(item)), normText(item.q)];
  return watchItems().find(w => keys.includes(normText(w.name)) || keys.includes(normText(w.q || '')));
}

function itemBadges(item, pick) {
  const out = [];
  const h = histVerdict(item, pick);
  if (h.verdict === 'low') out.push(`<span class="pill sale">Lowest in ${h.weeks} wks</span>`);
  else if (h.verdict === 'high') out.push(`<span class="pill warn">Usually ~${money(h.med)}</span>`);
  const cp = couponFor(item, pick);
  if (cp) out.push(`<span class="pill sale">Coupon −${money(cp)}</span>`);
  if (pick.deal && (item.qty || 1) < pick.deal.n) out.push(`<span class="pill warn">Buy ${pick.deal.n} for the deal</span>`);
  const w = watchFor(item);
  if (w && w.alert) out.push('<span class="pill">Alert on</span>');
  return out.length ? ' ' + out.join(' ') : '';
}

function sparkline(series, per) {
  const pts = series.slice(-12);
  if (pts.length < 2) return '';
  const W = 300, H = 64, px = 8, py = 10;
  const vals = pts.map(p => p.p);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = i => px + i * (W - 2 * px) / (pts.length - 1);
  const y = v => H - py - (v - lo) / span * (H - 2 * py);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.p).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.p).toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 3}" class="${i === pts.length - 1 ? 'sp-now' : 'sp-dot'}"><title>Week of ${shortDate(p.week)}: ${money(p.p)}${per ? '/lb' : ''} at ${storeName(p.store)}</title></circle>`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Weekly best price, last ${pts.length} weeks">
    <path d="${d}" class="sp-line"/>${dots}</svg>
    <div class="row between tiny faint"><span>${shortDate(pts[0].week)}</span><span>low ${money(lo)} · high ${money(hi)}</span><span>this week</span></div>`;
}

// ---------- item sheet extras ----------
function isUsual(item) { return state.usuals.some(u => normText(u.name) === normText(nameOf(item))); }
function itemSheetExtras(item, ch) {
  const pick = ch.pick;
  const h = histVerdict(item, pick);
  const w = watchFor(item);
  let histText;
  if (h.verdict === 'low') histText = `<b style="color:var(--good)">Lowest price in ${h.weeks} weeks</b> — a good week to stock up.`;
  else if (h.verdict === 'high') histText = `<b style="color:var(--warn)">Higher than usual.</b> It's normally about ${money(h.med)}; low was ${money(h.min)}.`;
  else if (h.verdict === 'usual') histText = `About the usual price (typically ${money(h.med)}, low ${money(h.min)}).`;
  else histText = h.series.length ? 'Price history is building — check back next week.' : 'Price history builds each week as prices are checked.';
  const deal = pick && pick.deal && (item.qty || 1) < pick.deal.n
    ? `<div class="tip">This is <b>${esc(pick.deal.label)}</b>. Buy ${pick.deal.n} and they work out to ${money(effPrice(pick, pick.deal.n))} each. <button class="btn sm" data-fx="setqty" data-id="${item.id}" data-n="${pick.deal.n}">Make it ${pick.deal.n}</button></div>` : '';
  const cp = item.coupon || {};
  const storeOpts = STORES.filter(s => state.settings.stores[s.id]).map(s => `<option value="${s.id}" ${cp.store === s.id ? 'selected' : ''}>${esc(s.short)} only</option>`).join('');
  return `${deal}
    <div class="card pad" style="box-shadow:none">
      <div class="row between"><div class="strong small">Price history</div>${w ? `<span class="pill">${FICON.bell.replace('<svg', '<svg style="width:12px;height:12px;vertical-align:-2px"')} ${esc(alertText(w.alert))}</span>` : ''}</div>
      <div class="small muted" style="margin:4px 0 6px">${histText}</div>
      ${sparkline(h.series, pick && pick.per)}
    </div>
    <div class="row wrap" style="gap:6px">
      <button class="btn sm" data-fx="usual" data-id="${item.id}">${isUsual(item) ? FICON.starOn + ' In usuals' : FICON.star + ' Add to usuals'}</button>
      <button class="btn sm" data-fx="alert" data-id="${item.id}">${FICON.bell} ${w ? 'Edit alert' : 'Deal alert'}</button>
      ${item.link ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(item.link)}">${ICON.ext} Product page</a>` : ''}
    </div>
    <div class="row wrap" style="gap:12px;align-items:flex-end">
      <label class="field" style="width:130px">${FICON.tag.replace('<svg', '<svg style="width:12px;height:12px;vertical-align:-2px"')} My coupon ($ off)<input type="number" inputmode="decimal" step="0.25" min="0" id="cpAmt" value="${cp.amount || ''}" placeholder="0.00"></label>
      <label class="field grow">Coupon works at<select id="cpStore"><option value="">Any store</option>${storeOpts}</select></label>
    </div>`;
}

// ---------- list tools: usuals / meals / scan ----------
function listTools() {
  const n = state.usuals.length;
  return `<div class="row wrap" style="gap:6px">
    <button class="btn sm" data-fx="panel" data-panel="usuals">${FICON.star} Usuals${n ? ` (${n})` : ''}</button>
    <button class="btn sm" data-fx="panel" data-panel="meals">${FICON.meal} Meals</button>
    <button class="btn sm" data-fx="panel" data-panel="scan">${FICON.scan} Scan barcode</button>
  </div>`;
}
function usualFromItem(item) {
  return { name: nameOf(item), q: item.q, label: item.label || null, qty: item.qty || 1, exclude: item.exclude || '', loose: !!item.loose,
    prefer: item.prefer || null, lock: item.lock || null, mode: item.mode || 'price', link: item.link || null };
}
function addUsuals(list) {
  let n = 0;
  for (const u of list) {
    if (state.items.some(i => normText(nameOf(i)) === normText(u.name))) continue;
    state.items.push({ id: uid(), q: u.q, label: u.label, qty: u.qty || 1, exclude: u.exclude || '', loose: !!u.loose, prefer: u.prefer || null,
      mode: u.mode || 'price', pick: null, lock: u.lock || null, hidden: [], done: false, added: Date.now(), link: u.link || null });
    ensureResults(u.q);
    n++;
  }
  save(); render();
  toast(n ? `Added ${n} usual item${n > 1 ? 's' : ''}` : 'Your usuals are already on the list');
}

function panelUsuals() {
  const u = state.usuals;
  const missing = u.filter(x => !state.items.some(i => normText(nameOf(i)) === normText(x.name))).length;
  return `<div class="row between"><h2 style="font-size:18px">My usuals</h2><button class="x-btn" data-close aria-label="Close">${ICON.x}</button></div>
    <p class="small muted">The things you buy most weeks. One tap puts them all on the list with this week's prices.</p>
    <div class="row wrap" style="gap:8px">
      <button class="btn primary" data-fx="addusuals" ${missing ? '' : 'disabled'}>Add ${missing || 'all'} to list</button>
      <button class="btn" data-fx="saveusuals" ${state.items.length ? '' : 'disabled'}>Save current list as usuals</button>
    </div>
    ${u.length ? `<ul class="items card" style="margin-top:12px">${u.map((x, i) => `<li class="item"><div class="item-main"><div class="item-name">${esc(x.name)}</div><div class="item-sub">Qty ${x.qty || 1}${x.lock ? ' · always ' + esc(storeName(x.lock)) : ''}</div></div>
      <button class="x-btn" data-fx="delusual" data-i="${i}" aria-label="Remove ${esc(x.name)}">${ICON.x}</button></li>`).join('')}</ul>`
      : `<div class="empty small">No usuals yet. Tap the star in any item's details, or save your whole list.</div>`}`;
}

function allMeals() { return [...state.meals.map(m => ({ ...m, custom: true })), ...MEALS]; }
function panelMeals() {
  const onList = n => state.items.some(i => normText(nameOf(i)) === normText(n));
  const cards = allMeals().map((m, idx) => {
    const have = m.items.filter(onList).length;
    return `<div class="meal card pad">
      <div class="row between"><div class="strong">${esc(m.name)}</div>
        <div class="row" style="gap:4px">${m.custom ? `<button class="btn sm ghost danger" data-fx="delmeal" data-name="${esc(m.name)}">Delete</button>` : ''}
        <button class="btn sm ${have === m.items.length ? '' : 'primary'}" data-fx="addmeal" data-idx="${idx}" ${have === m.items.length ? 'disabled' : ''}>${have === m.items.length ? '✓ On list' : '+ Add'}</button></div></div>
      <div class="tiny muted" style="margin-top:4px">${m.items.map(n => onList(n) ? `<span style="color:var(--good)">${esc(n)}</span>` : esc(n)).join(' · ')}</div>
      ${have && have < m.items.length ? `<div class="tiny faint">${have} of ${m.items.length} already on your list</div>` : ''}
    </div>`;
  }).join('');
  return `<div class="row between"><h2 style="font-size:18px">Meals → list</h2><button class="x-btn" data-close aria-label="Close">${ICON.x}</button></div>
    <p class="small muted">Pick this week's meals and their ingredients go on the list (anything already there is skipped).</p>
    <details class="card pad" style="box-shadow:none;margin-bottom:12px"><summary class="strong small" style="cursor:pointer">+ Make your own meal</summary>
      <div class="stack" style="margin-top:10px">
        <label class="field">Meal name<input type="text" id="mealName" placeholder="e.g. Kate's lasagna"></label>
        <label class="field">Ingredients (comma separated)<input type="text" id="mealItems" placeholder="lasagna noodles, ricotta, ground beef lean, pasta sauce"></label>
        <button class="btn primary" data-fx="savemeal">Save meal</button>
      </div></details>
    <div class="stack">${cards}</div>`;
}
function addMeal(m) {
  const missing = m.items.filter(n => !state.items.some(i => normText(nameOf(i)) === normText(n)));
  if (missing.length) addItems(missing.join('\n'));
  for (const n of m.items) {
    const it = state.items.find(i => normText(nameOf(i)) === normText(n));
    if (it) it.meals = [...new Set([...(it.meals || []), m.name])];
  }
  save(); render();
  toast(`${m.name}: added ${missing.length} ingredient${missing.length === 1 ? '' : 's'}`);
}

// ---------- barcode scanner ----------
let scan = { stream: null, timer: null, reader: null, busy: false };
function panelScan(mode) {
  if (!mode.fresh) return null; // keep the live camera; don't re-render
  mode.fresh = false;
  setTimeout(startScan, 30);
  return `<div class="row between"><h2 style="font-size:18px">Scan a barcode</h2><button class="x-btn" data-close aria-label="Close">${ICON.x}</button></div>
    <p class="small muted">Point the camera at the barcode on an empty box or bottle. It looks the product up and adds it to your list.</p>
    <div class="scanbox"><video id="scanVideo" playsinline muted></video><div class="scanline"></div></div>
    <div id="scanStatus" class="small muted" style="margin:8px 0">Starting camera…</div>
    <div id="scanResult"></div>
    <form id="scanManual" class="addbar" style="margin-top:10px" autocomplete="off">
      <input id="scanCode" type="text" inputmode="numeric" placeholder="Or type the barcode number" aria-label="Barcode number">
      <button class="btn" type="submit">Look up</button>
    </form>`;
}
function setScanStatus(t) { const el = $('#scanStatus'); if (el) el.textContent = t; }
async function startScan() {
  const video = $('#scanVideo');
  if (!video) return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { setScanStatus('This browser can’t use the camera here — type the number below.'); return; }
  try {
    if ('BarcodeDetector' in window) {
      const formats = await BarcodeDetector.getSupportedFormats().catch(() => []);
      const want = ['ean_13', 'upc_a', 'ean_8', 'upc_e'].filter(f => formats.includes(f));
      if (want.length) {
        const det = new BarcodeDetector({ formats: want });
        scan.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = scan.stream; await video.play();
        setScanStatus('Scanning…');
        scan.timer = setInterval(async () => {
          if (scan.busy || video.readyState < 2) return;
          try { const codes = await det.detect(video); if (codes.length) gotCode(codes[0].rawValue); } catch { /* frame not ready */ }
        }, 250);
        return;
      }
    }
    // iPhone / Firefox: use the ZXing reader
    setScanStatus('Loading scanner…');
    await loadScript('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js');
    if (!$('#scanVideo')) return; // closed meanwhile
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_E]);
    scan.reader = new ZXing.BrowserMultiFormatReader(hints);
    setScanStatus('Scanning…');
    await scan.reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, 'scanVideo', res => { if (res && !scan.busy) gotCode(res.getText()); });
  } catch (err) {
    setScanStatus(err && err.name === 'NotAllowedError' ? 'Camera permission was blocked — allow it in your browser settings, or type the number below.' : 'Couldn’t start the camera — type the number below.');
  }
}
function stopScan() {
  clearInterval(scan.timer); scan.timer = null;
  if (scan.stream) { scan.stream.getTracks().forEach(t => t.stop()); scan.stream = null; }
  if (scan.reader) { try { scan.reader.reset(); } catch { /* ignore */ } scan.reader = null; }
  scan.busy = false;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('load')); document.head.appendChild(s);
  });
}
async function gotCode(code) {
  code = String(code || '').replace(/\D/g, '');
  if (code.length < 8) return;
  scan.busy = true;
  if (navigator.vibrate) navigator.vibrate(60);
  setScanStatus(`Found ${code} — looking it up…`);
  let name = '';
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_en,brands,quantity`);
    const j = await r.json();
    if (j && j.product) {
      const p = j.product;
      const brand = (p.brands || '').split(',')[0].trim();
      const pn = (p.product_name_en || p.product_name || '').trim();
      name = [brand && !pn.toLowerCase().includes(brand.toLowerCase()) ? brand : '', pn].filter(Boolean).join(' ');
    }
  } catch { /* lookup failed */ }
  const box = $('#scanResult');
  if (!box) return;
  setScanStatus(name ? 'Got it. Check the name, then add it.' : `Barcode ${code} isn't in the product database — type what it is.`);
  box.innerHTML = `<form id="scanAdd" class="card pad stack" style="box-shadow:none" autocomplete="off">
      <label class="field">Add to list as<input id="scanName" type="text" value="${esc(name)}" placeholder="e.g. Lactantia lactose free milk 1%"></label>
      <div class="row" style="gap:8px"><button class="btn primary" type="submit">Add to list</button><button class="btn" type="button" data-fx="scanagain">Scan another</button></div>
      <div class="tiny faint">Shorter names find more prices — brand + product works best.</div>
    </form>`;
}
function onPanelClose(mode) { if (mode && mode.type === 'scan') stopScan(); }

// ---------- store showdown: split vs everything at one store ----------
// The price this store would charge you for an item: your pinned product if it's there, your favourite brand if set, else its cheapest match.
function storePick(item, sid) {
  const cs = candidatesFor(item).filter(c => c.storeId === sid);
  if (!cs.length) return null;
  if (item.pick) { const pinned = cs.find(c => c.key === item.pick); if (pinned) return pinned; }
  return cs[0]; // same order as the split plan (favourite brand, then cheapest), so the comparison is like for like
}
function showdownData() {
  const priced = [];
  for (const item of state.items) { const ch = chooseFor(item); if (ch.pick) priced.push({ item, ch }); }
  const split = priced.reduce((a, r) => a + lineCost(r.item, r.ch.pick), 0);
  const splitStores = new Set(priced.map(r => r.ch.pick.storeId)).size;
  const rows = [];
  for (const s of STORES) {
    if (!state.settings.stores[s.id]) continue;
    let total = 0, has = 0;
    const lines = [];
    for (const r of priced) {
      const own = storePick(r.item, s.id);
      const cost = own ? lineCost(r.item, own) : lineCost(r.item, r.ch.pick);
      if (own) has++;
      total += cost;
      lines.push({ item: r.item, own, best: r.ch.pick, cost, splitCost: lineCost(r.item, r.ch.pick) });
    }
    if (has) rows.push({ sid: s.id, total, has, lines, extra: total - split });
  }
  // stores that carry more of the list first (a one-stop shop has to actually stock it), then cheapest
  rows.sort((a, b) => b.has - a.has || a.total - b.total);
  return { priced, split, splitStores, rows, n: priced.length };
}
function showdownHeadline() {
  const d = showdownData();
  if (d.n < 2 || !d.rows.length || d.splitStores < 2) return '';
  const best = d.rows[0];
  if (best.extra < 0.5 || best.has < Math.ceil(d.n * 0.6)) return '';
  return `<button class="savebar" data-go="shop"><span>Splitting across ${d.splitStores} stores saves <b>${money(best.extra)}</b> vs doing it all at ${esc(storeName(best.sid))} (has ${best.has} of ${d.n})</span><span aria-hidden="true">→</span></button>`;
}
function showdownCard() {
  const d = showdownData();
  if (!d.n) return '';
  const max = Math.max(d.split, ...d.rows.map(r => r.total)) || 1;
  const bar = (v, cls) => `<div class="sd-track"><div class="sd-bar ${cls}" style="width:${Math.max(3, v / max * 100).toFixed(1)}%"></div></div>`;
  const locked = state.items.some(i => i.lock);
  return `<div class="section-title">Split vs one store</div>
  <section class="card pad showdown">
    <div class="small muted">What your ${d.n} priced items would cost at one store. Stores are listed by how much of your list they have a price for; anything a store doesn't have is priced at its cheapest store, so every total covers the same list.</div>
    <div class="sd-row sd-split" title="Your split: ${money(d.split)}">
      <div class="sd-name"><b>Your split</b><span class="tiny muted">${d.splitStores} store${d.splitStores === 1 ? '' : 's'}</span></div>
      ${bar(d.split, 'is-split')}
      <div class="sd-val"><b class="num">${money(d.split)}</b><span class="tiny" style="color:var(--good)">cheapest</span></div>
    </div>
    ${d.rows.map(r => `<button class="sd-row${r.has < d.n ? ' partial' : ''}" data-fx="panel" data-panel="store" data-arg="${r.sid}" title="All at ${esc(storeName(r.sid))}: ${money(r.total)} (${r.has} of ${d.n} items carried)">
      <div class="sd-name">${storeTag(r.sid)}<span class="tiny muted">${r.has}/${d.n} items${r.has < d.n ? '*' : ''}</span></div>
      ${bar(r.total, '')}
      <div class="sd-val"><b class="num">${money(r.total)}</b><span class="tiny muted">${r.extra < 0.005 ? 'same' : '+' + money(r.extra)}</span></div>
    </button>`).join('')}
    <div class="tiny faint" style="margin-top:6px">* total includes items it doesn't have, at their best price elsewhere. Most stores only show prices for what's in their flyer; Walmart also has online prices, so it usually covers the most. Tap a store to see item by item.</div>
    <div class="row wrap" style="gap:6px;margin-top:10px">
      <button class="btn sm" data-fx="panel" data-panel="versus">Compare two stores</button>
      ${locked ? `<button class="btn sm ghost" data-fx="unlockall">Undo "shop only here"</button>` : ''}
    </div>
  </section>`;
}
function panelStore(sid) {
  const d = showdownData();
  const r = d.rows.find(x => x.sid === sid);
  if (!r) return `<div class="row between"><h2>${esc(storeName(sid))}</h2><button class="x-btn" data-close aria-label="Close">${ICON.x}</button></div><div class="empty small">No prices at this store for your list.</div>`;
  const rowsHtml = r.lines.map(l => {
    const diff = l.cost - l.splitCost;
    return `<li class="item"><div class="grow"><div class="item-name">${esc(nameOf(l.item))}</div>
      <div class="item-sub">${l.own ? esc(l.own.name) : `Not carried — ${money(l.splitCost)} at ${esc(storeName(l.best.storeId))}`}</div></div>
      <div class="price">${money(l.cost)}<div class="tiny ${diff > 0.005 ? '' : 'muted'}" style="${diff > 0.005 ? 'color:var(--warn)' : ''}">${diff > 0.005 ? '+' + money(diff) : diff < -0.005 ? money(diff) : 'best price'}</div></div></li>`;
  }).join('');
  return `<div class="row between"><h2 style="font-size:18px">Everything at ${esc(STORE_BY_ID[sid].name)}</h2><button class="x-btn" data-close aria-label="Close">${ICON.x}</button></div>
    <div class="summary" style="margin:10px 0">
      <div class="stat"><b class="num">${money(r.total)}</b><span>All here</span></div>
      <div class="stat"><b class="num">${money(d.split)}</b><span>Your split</span></div>
      <div class="stat${r.extra > 0.005 ? '' : ' good'}"><b class="num">${r.extra > 0.005 ? '+' + money(r.extra) : 'Same'}</b><span>Cost of one stop</span></div>
    </div>
    <div class="small muted">${r.has} of ${d.n} items carried here${r.has < d.n ? '; the rest are priced at their cheapest store' : ''}.</div>
    <ul class="items card" style="margin-top:10px">${rowsHtml}</ul>
    <div class="row wrap" style="gap:8px;margin-top:12px">
      <button class="btn primary" data-fx="shopnly" data-arg="${sid}">Shop only here</button>
      <span class="tiny muted">Moves every item ${esc(storeName(sid))} carries onto its list.</span>
    </div>`;
}
function panelVersus(arg) {
  const d = showdownData();
  const ids = d.rows.map(r => r.sid);
  const a = (arg && arg.a) || ids[0], b = (arg && arg.b) || ids[1] || ids[0];
  const opt = sel => STORES.filter(s => state.settings.stores[s.id]).map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  let winsA = 0, winsB = 0, totA = 0, totB = 0, both = 0;
  const rows = d.priced.map(({ item }) => {
    const ca = storePick(item, a), cb = storePick(item, b);
    const pa = ca ? lineCost(item, ca) : null, pb = cb ? lineCost(item, cb) : null;
    if (pa != null && pb != null) { both++; totA += pa; totB += pb; if (pa < pb - 0.004) winsA++; else if (pb < pa - 0.004) winsB++; }
    const cell = (p, other) => p == null ? '<td class="r faint">—</td>' : `<td class="r num${other != null && p < other - 0.004 ? ' win' : ''}">${money(p)}</td>`;
    return `<tr><td>${esc(nameOf(item))}</td>${cell(pa, pb)}${cell(pb, pa)}</tr>`;
  }).join('');
  return `<div class="row between"><h2 style="font-size:18px">Head to head</h2><button class="x-btn" data-close aria-label="Close">${ICON.x}</button></div>
    <div class="row" style="gap:8px;margin:10px 0">
      <select id="vsA" aria-label="First store">${opt(a)}</select><span class="muted">vs</span><select id="vsB" aria-label="Second store">${opt(b)}</select>
    </div>
    ${both ? `<div class="tip" style="border-color:var(--brand);background:var(--brand-soft)">On the ${both} item${both === 1 ? '' : 's'} both carry: <b>${esc(storeName(a))} ${money(totA)}</b> vs <b>${esc(storeName(b))} ${money(totB)}</b> —
      ${Math.abs(totA - totB) < 0.01 ? 'a tie' : `${esc(storeName(totA < totB ? a : b))} is ${money(Math.abs(totA - totB))} cheaper`}. Cheaper on ${winsA} vs ${winsB} items.</div>` : '<div class="small muted">No items with prices at both stores yet.</div>'}
    <table class="cmp" style="margin-top:10px"><thead><tr><th>Item</th><th class="r">${esc(storeName(a))}</th><th class="r">${esc(storeName(b))}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---------- budget ----------
function storeSavings(rows) {
  return rows.reduce((a, { item, pick }) => {
    if (!pick) return a;
    const q = item.qty || 1;
    return a + Math.max(0, ((pick.orig || pick.unit) - effPrice(pick, q)) * q) + couponFor(item, pick);
  }, 0);
}
function tripsIn(pred) { return state.budget.trips.filter(t => pred(t)).reduce((a, t) => a + (+t.amount || 0), 0); }
function renderBudget(p) {
  const B = state.budget;
  const wk = calWeek();
  const spent = tripsIn(t => calWeek(new Date(t.date + 'T12:00:00')) === wk);
  const month = ymd(new Date()).slice(0, 7);
  const spentMonth = tripsIn(t => t.date.slice(0, 7) === month);
  const savedMonth = B.trips.filter(t => t.date.slice(0, 7) === month).reduce((a, t) => a + (+t.saved || 0), 0);
  // last 8 calendar weeks
  const weeks = [];
  for (let i = 7; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i * 7); weeks.push(calWeek(d)); }
  const perWeek = weeks.map(w => ({ w, v: tripsIn(t => calWeek(new Date(t.date + 'T12:00:00')) === w) }));
  const logged = perWeek.filter(x => x.v > 0);
  const avg = logged.length ? logged.reduce((a, x) => a + x.v, 0) / logged.length : 0;
  const planned = p.total;
  const budget = +B.weekly || 0;
  const left = budget - spent - planned;
  const pct = v => budget ? Math.min(100, v / budget * 100) : 0;
  const trips = B.trips.slice().sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts).slice(0, 25);
  return `<div class="section-title">Weekly budget</div>
  <div class="card pad stack">
    <form id="budgetForm" class="row" style="align-items:flex-end;gap:8px" autocomplete="off">
      <label class="field grow">Budget per week<input id="budgetInput" type="number" inputmode="decimal" min="0" step="5" value="${budget || ''}" placeholder="e.g. 250"></label>
      <button class="btn primary" type="submit">Save</button>
    </form>
    ${budget ? `<div>
      <div class="row between small"><span><b>${money(spent)}</b> spent + <b>${money(planned)}</b> on your list</span><span class="${left < 0 ? '' : 'muted'}" style="${left < 0 ? 'color:var(--bad);font-weight:700' : ''}">${left < 0 ? money(-left) + ' over' : money(left) + ' left'}</span></div>
      <div class="bbar" role="img" aria-label="Spent ${money(spent)}, planned ${money(planned)} of ${money(budget)} budget">
        <div class="bb-spent" style="width:${pct(spent)}%"></div><div class="bb-plan" style="width:${Math.max(0, Math.min(100 - pct(spent), pct(planned)))}%"></div>
      </div>
      <div class="row tiny muted" style="gap:14px;margin-top:4px"><span><i class="key k-spent"></i>Spent this week</span><span><i class="key k-plan"></i>Current list</span><span>Budget ${money(budget)}</span></div>
    </div>` : '<div class="small muted">Set a weekly amount to see how this week is tracking.</div>'}
  </div>
  <div class="summary" style="margin-top:12px">
    <div class="stat"><b class="num">${money(spentMonth)}</b><span>Spent this month</span></div>
    <div class="stat"><b class="num">${logged.length ? money(avg) : '—'}</b><span>Avg per week</span></div>
    <div class="stat good"><b class="num">${money(savedMonth)}</b><span>Saved this month</span></div>
  </div>
  <div class="section-title">Last 8 weeks</div>
  <div class="card pad">${weekChart(perWeek, budget)}</div>
  <div class="row between" style="margin:20px 2px 8px"><div class="section-title" style="margin:0">Trips</div><button class="btn sm primary" data-fx="panel" data-panel="trip">+ Log a trip</button></div>
  ${trips.length ? `<ul class="items card">${trips.map(t => `<li class="item"><div class="grow"><div class="row" style="gap:8px">${t.store ? storeTag(t.store) : '<span class="store-tag">Other</span>'}<span class="small muted">${new Date(t.date + 'T12:00:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>
      ${t.note ? `<div class="item-sub">${esc(t.note)}</div>` : ''}</div>
      <div class="price">${money(+t.amount)}${t.saved ? `<div class="tiny" style="color:var(--good)">saved ${money(+t.saved)}</div>` : ''}</div>
      <button class="x-btn" data-fx="deltrip" data-id="${t.id}" aria-label="Delete trip">${ICON.x}</button></li>`).join('')}</ul>`
    : `<div class="empty small">No trips logged yet. After shopping, tap <b>Log trip</b> on a store's list (it fills in the total), or log one here.</div>`}`;
}
function weekChart(perWeek, budget) {
  const W = 320, H = 150, L = 34, R = 6, T = 10, Bm = 22;
  const max = Math.max(budget * 1.1, ...perWeek.map(x => x.v), 10);
  const step = niceStep(max / 3);
  const top = Math.ceil(max / step) * step;
  const y = v => T + (H - T - Bm) * (1 - v / top);
  const bw = (W - L - R) / perWeek.length;
  const grid = [];
  for (let v = 0; v <= top + 0.001; v += step) grid.push(`<line x1="${L}" x2="${W - R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="wc-grid"/><text x="${L - 5}" y="${(y(v) + 3.5).toFixed(1)}" class="wc-axis" text-anchor="end">$${v}</text>`);
  const bars = perWeek.map((x, i) => {
    const bx = L + i * bw + bw * 0.22, w = bw * 0.56;
    const h = Math.max(0, y(0) - y(x.v));
    const over = budget && x.v > budget;
    const r = Math.min(4, w / 2, h);
    const path = h > 0 ? `M${bx},${y(0)} V${y(x.v) + r} Q${bx},${y(x.v)} ${bx + r},${y(x.v)} H${bx + w - r} Q${bx + w},${y(x.v)} ${bx + w},${y(x.v) + r} V${y(0)} Z` : '';
    return `<g class="wc-col"><rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - Bm}" fill="transparent"><title>Week of ${shortDate(x.w)}: ${money(x.v)}${budget ? (over ? ' — over budget' : '') : ''}</title></rect>
      ${path ? `<path d="${path}" class="wc-bar${over ? ' over' : ''}"/>` : ''}
      ${i % 2 === perWeek.length % 2 ? '' : `<text x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" class="wc-axis" text-anchor="middle">${shortDate(x.w)}</text>`}</g>`;
  }).join('');
  const bl = budget ? `<line x1="${L}" x2="${W - R}" y1="${y(budget).toFixed(1)}" y2="${y(budget).toFixed(1)}" class="wc-budget"/><text x="${W - R}" y="${(y(budget) - 4).toFixed(1)}" class="wc-axis" text-anchor="end">budget</text>` : '';
  return `<svg class="weekchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grocery spending per week, last 8 weeks">${grid.join('')}${bars}${bl}</svg>
    <details class="tiny muted" style="margin-top:6px"><summary style="cursor:pointer">Show as table</summary><table class="cmp"><tbody>${perWeek.map(x => `<tr><td>Week of ${shortDate(x.w)}</td><td class="r num">${money(x.v)}</td></tr>`).join('')}</tbody></table></details>`;
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw || 1))); const n = raw / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }

function panelTrip(sid) {
  const p = plan();
  const rows = sid ? (p.byStore[sid] || []) : [];
  const est = rows.reduce((a, { item, pick }) => a + (lineCost(item, pick) || 0), 0);
  const saved = storeSavings(rows);
  const opts = STORES.map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  const nDone = rows.filter(r => r.item.done).length;
  return `<div class="row between"><h2 style="font-size:18px">Log a trip</h2><button class="x-btn" data-close aria-label="Close">${ICON.x}</button></div>
    <form id="tripForm" class="stack" style="margin-top:10px" autocomplete="off">
      <div class="row wrap" style="gap:12px">
        <label class="field grow">Store<select id="tripStore"><option value="">Other</option>${opts}</select></label>
        <label class="field" style="width:150px">Date<input id="tripDate" type="date" value="${ymd(new Date())}"></label>
      </div>
      <div class="row wrap" style="gap:12px">
        <label class="field grow">Amount paid<input id="tripAmt" type="number" inputmode="decimal" step="0.01" min="0" value="${est ? est.toFixed(2) : ''}" placeholder="0.00" required></label>
        <label class="field grow">Saved (from flyer deals)<input id="tripSaved" type="number" inputmode="decimal" step="0.01" min="0" value="${saved ? saved.toFixed(2) : ''}" placeholder="0.00"></label>
      </div>
      <label class="field">Note (optional)<input id="tripNote" type="text" placeholder="e.g. weekly shop"></label>
      ${sid && rows.length ? `<label class="row small" style="gap:8px"><input type="checkbox" id="tripClear" class="check" ${nDone ? 'checked' : ''}> Remove ${nDone ? `the ${nDone} checked` : `this store's ${rows.length}`} item${(nDone || rows.length) === 1 ? '' : 's'} from the list</label>` : ''}
      ${est ? `<div class="tiny faint">Filled in from your list's estimate for this store — change it to what the receipt says.</div>` : ''}
      <button class="btn primary" type="submit">Save trip</button>
    </form>`;
}

// ---------- deal alerts (GitHub Action reads watch.json) ----------
function alertText(a) {
  if (!a) return 'Tracking price';
  if (a.below) return `Alert under ${money(+a.below)}`;
  if (a.newLow) return 'Alert on new low';
  return 'Tracking price';
}
function draftWatch() {
  if (!state.watchDraft) state.watchDraft = JSON.parse(JSON.stringify(serverWatch || { postal: state.settings.postal, ntfyTopic: '', items: [] }));
  return state.watchDraft;
}
function panelAlert(itemId) {
  const item = findItem(itemId);
  if (!item) return '';
  const w = (state.watchDraft ? state.watchDraft.items : watchItems()).find(x => normText(x.name) === normText(nameOf(item)));
  const a = (w && w.alert) || {};
  const pick = chooseFor(item).pick;
  return `<div class="row between"><h2 style="font-size:18px">Deal alert: ${esc(nameOf(item))}</h2><button class="x-btn" data-close aria-label="Close">${ICON.x}</button></div>
    <p class="small muted">Every morning the tracker checks this week's flyers and sends a push to your phone (ntfy) when this deal shows up.${pick ? ` Right now it's ${money(priceKey(pick))}${pick.per ? '/lb' : ''} at ${esc(storeName(pick.storeId))}.` : ''}</p>
    <form id="alertForm" class="stack" autocomplete="off" data-id="${item.id}">
      <label class="row small" style="gap:8px"><input type="radio" name="arule" value="below" class="check" ${a.below ? 'checked' : ''}> Tell me when it's under
        <input id="alertBelow" type="number" inputmode="decimal" step="0.01" min="0" style="width:110px" value="${a.below || ''}" placeholder="${pick ? priceKey(pick).toFixed(2) : '0.00'}">${pick && pick.per ? '/lb' : ''}</label>
      <label class="row small" style="gap:8px"><input type="radio" name="arule" value="newLow" class="check" ${a.newLow && !a.below ? 'checked' : ''}> Tell me when it hits its lowest price in 8 weeks</label>
      <label class="row small" style="gap:8px"><input type="radio" name="arule" value="track" class="check" ${w && !a.below && !a.newLow ? 'checked' : ''}> Just track the price (no push)</label>
      <div class="row" style="gap:8px"><button class="btn primary" type="submit">Save alert</button>${w ? `<button class="btn danger" type="button" data-fx="delalert" data-name="${esc(w.name)}">Remove</button>` : ''}</div>
      <div class="tiny faint">Alerts go live once you publish them (Settings → Deal alerts).</div>
    </form>`;
}
function settingsExtras() {
  const pub = watchItems();
  const d = state.watchDraft;
  const list = d ? d.items : pub;
  const topic = (d || serverWatch || {}).ntfyTopic || '';
  const hist = serverHist && serverHist.updated ? `Last price check: ${new Date(serverHist.updated).toLocaleString('en-CA', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.` : 'The price tracker hasn’t run yet.';
  return `<div class="section-title">Deal alerts & price tracking</div>
  <div class="card pad stack">
    <div class="small muted">A tracker runs every morning on GitHub, saves each item's best price (for the “lowest in X weeks” badges) and pushes a phone alert when a deal hits. ${hist}</div>
    ${topic ? `<div class="small">Get the alerts: install the free <b>ntfy</b> app, tap +, and subscribe to <code class="code">${esc(topic)}</code>. <a href="https://ntfy.sh/${encodeURIComponent(topic)}" target="_blank" rel="noopener">Open in browser</a></div>` : ''}
    ${list.length ? `<ul class="items">${list.map(w => `<li class="item"><div class="grow"><div class="item-name">${esc(w.name)}</div><div class="item-sub">${esc(alertText(w.alert))}</div></div>
      <button class="x-btn" data-fx="delalert" data-name="${esc(w.name)}" aria-label="Remove ${esc(w.name)}">${ICON.x}</button></li>`).join('')}</ul>` : '<div class="small muted">No tracked items yet — open any item and tap Deal alert.</div>'}
    ${d ? `<div class="tip"><b>You have unpublished changes.</b> Tap publish: it copies the new list and opens GitHub — select everything in the file, paste, then tap “Commit changes”.
        <div class="row" style="gap:8px;margin-top:8px"><button class="btn sm primary" data-fx="publishwatch">Publish to GitHub</button><button class="btn sm ghost" data-fx="discardwatch">Discard</button></div></div>` : ''}
  </div>`;
}

// ---------- panels ----------
function renderPanel(mode) {
  switch (mode.type) {
    case 'usuals': return panelUsuals();
    case 'meals': return panelMeals();
    case 'scan': return panelScan(mode);
    case 'store': return panelStore(mode.arg);
    case 'versus': return panelVersus(mode.arg);
    case 'trip': return panelTrip(mode.arg);
    case 'alert': return panelAlert(mode.arg);
    default: return '';
  }
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-fx]');
  if (!t) return;
  const d = t.dataset;
  const item = d.id ? findItem(d.id) : null;
  switch (d.fx) {
    case 'panel': return openPanel(d.panel, d.arg || null);
    case 'setqty': if (item) { item.qty = +d.n; save(); render(); } return;
    case 'usual': {
      if (!item) return;
      const i = state.usuals.findIndex(u => normText(u.name) === normText(nameOf(item)));
      if (i >= 0) state.usuals.splice(i, 1); else state.usuals.push(usualFromItem(item));
      save(); render(); return toast(i >= 0 ? 'Removed from usuals' : 'Added to usuals');
    }
    case 'addusuals': return addUsuals(state.usuals);
    case 'saveusuals':
      if (state.usuals.length && !confirm('Replace your usuals with the current list?')) return;
      state.usuals = state.items.map(usualFromItem); save(); render(); return toast(`Saved ${state.usuals.length} usuals`);
    case 'delusual': state.usuals.splice(+d.i, 1); save(); return render();
    case 'addmeal': { const m = allMeals()[+d.idx]; if (m) addMeal(m); return; }
    case 'delmeal': state.meals = state.meals.filter(m => m.name !== d.name); save(); return render();
    case 'savemeal': {
      const name = ($('#mealName') || {}).value || '';
      const items = (($('#mealItems') || {}).value || '').split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
      if (!name.trim() || !items.length) return toast('Add a name and at least one ingredient');
      state.meals = state.meals.filter(m => normText(m.name) !== normText(name));
      state.meals.unshift({ name: name.trim(), items });
      save(); renderSheet(true); return toast('Meal saved');
    }
    case 'scanagain': { const r = $('#scanResult'); if (r) r.innerHTML = ''; scan.busy = false; return setScanStatus('Scanning…'); }
    case 'shopnly': {
      const sid = d.arg; let n = 0;
      for (const it of state.items) { if (candidatesFor(it).some(c => c.storeId === sid)) { it.lock = sid; it.pick = null; n++; } }
      save(); closeSheet(); render(); return toast(`${n} items moved to ${storeName(sid)}`);
    }
    case 'unlockall': state.items.forEach(i => { i.lock = null; }); save(); render(); return toast('Back to cheapest store for each item');
    case 'deltrip': {
      const i = state.budget.trips.findIndex(x => x.id === d.id);
      if (i < 0) return;
      const [gone] = state.budget.trips.splice(i, 1); save(); render();
      return toastUndo('Trip deleted', () => { state.budget.trips.push(gone); save(); render(); });
    }
    case 'alert': return openPanel('alert', d.id);
    case 'delalert': {
      const w = draftWatch(); w.items = w.items.filter(x => normText(x.name) !== normText(d.name));
      save(); render(); if (sheetMode && sheetMode.type === 'alert') closeSheet();
      return toast('Removed — publish to apply');
    }
    case 'publishwatch': {
      const json = JSON.stringify(state.watchDraft, null, 2) + '\n';
      await copyText(json, 'Copied — paste it over the whole file on GitHub');
      window.open(`https://github.com/${REPO}/edit/main/watch.json`, '_blank', 'noopener');
      return;
    }
    case 'discardwatch': state.watchDraft = null; save(); return render();
  }
});

document.addEventListener('change', e => {
  const t = e.target;
  const item = sheetMode && sheetMode.type === 'item' ? findItem(sheetMode.arg) : null;
  if (item && (t.id === 'cpAmt' || t.id === 'cpStore')) {
    const amount = Math.max(0, parseFloat(($('#cpAmt') || {}).value) || 0);
    const store = ($('#cpStore') || {}).value || null;
    item.coupon = amount ? { amount: Math.round(amount * 100) / 100, store } : null;
    save(); renderSoon(); return;
  }
  if (t.id === 'vsA' || t.id === 'vsB') {
    sheetMode.arg = { a: $('#vsA').value, b: $('#vsB').value };
    renderSheet(true); return;
  }
});

document.addEventListener('submit', async e => {
  const f = e.target;
  if (f.id === 'scanManual') {
    e.preventDefault(); e.stopImmediatePropagation();
    const code = $('#scanCode').value; gotCode(code); return;
  }
  if (f.id === 'scanAdd') {
    e.preventDefault(); e.stopImmediatePropagation();
    const name = $('#scanName').value.trim();
    if (!name) return toast('Type a name first');
    addItems(name);
    const r = $('#scanResult'); if (r) r.innerHTML = '';
    scan.busy = false; setScanStatus('Added! Scan another, or close.');
    return;
  }
  if (f.id === 'budgetForm') {
    e.preventDefault(); e.stopImmediatePropagation();
    state.budget.weekly = Math.max(0, parseFloat($('#budgetInput').value) || 0); save(); render(); return toast('Budget saved');
  }
  if (f.id === 'tripForm') {
    e.preventDefault(); e.stopImmediatePropagation();
    const amount = parseFloat($('#tripAmt').value);
    if (!(amount > 0)) return toast('Enter what you paid');
    const store = $('#tripStore').value || null;
    state.budget.trips.push({ id: uid(), ts: Date.now(), date: $('#tripDate').value || ymd(new Date()), store, amount: Math.round(amount * 100) / 100,
      saved: Math.round((parseFloat($('#tripSaved').value) || 0) * 100) / 100, note: $('#tripNote').value.trim() });
    const clear = $('#tripClear');
    if (clear && clear.checked && store) {
      const p = plan();
      const rows = p.byStore[store] || [];
      const anyDone = rows.some(r => r.item.done);
      const ids = new Set(rows.filter(r => !anyDone || r.item.done).map(r => r.item.id));
      state.items = state.items.filter(i => !ids.has(i.id));
    }
    save(); closeSheet(); render(); return toast('Trip logged');
  }
  if (f.id === 'alertForm') {
    e.preventDefault(); e.stopImmediatePropagation();
    const it = findItem(f.dataset.id);
    if (!it) return;
    const rule = (f.querySelector('input[name=arule]:checked') || {}).value;
    if (!rule) return toast('Pick an option');
    const below = parseFloat($('#alertBelow').value);
    if (rule === 'below' && !(below > 0)) return toast('Enter a price');
    const w = draftWatch();
    const entry = { name: nameOf(it), q: it.q, exclude: it.exclude || '', loose: !!it.loose, prefer: it.prefer || null,
      alert: rule === 'below' ? { below: Math.round(below * 100) / 100 } : rule === 'newLow' ? { newLow: true } : null };
    w.items = w.items.filter(x => normText(x.name) !== normText(entry.name));
    w.items.push(entry);
    save(); closeSheet(); render();
    return toast('Saved — publish it in Settings → Deal alerts');
  }
}, true);
