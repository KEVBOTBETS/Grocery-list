/* Grocery List — compare this week's grocery prices and split a list by cheapest store.
   Data: Flipp's public flyer search (flyer deals + online regular prices), fetched live in the browser.
   Everything is saved on this device (localStorage). */
'use strict';

const APP_VERSION = '2.0.0';
const API = 'https://backflipp.wishabi.com/flipp/items/search';
const CACHE_TTL = 6 * 3600 * 1000; // re-check prices every 6 hours
const STATE_KEY = 'gl.state.v1';
const CACHE_PREFIX = 'gl.c.';

// ---------- stores ----------
// match = normalized Flipp merchant names. search = store's own product search (for online order / pickup).
const STORES = [
  { id: 'walmart',    name: 'Walmart',                  short: 'Walmart',    color: '#2f8fff', match: ['walmart'], search: 'https://www.walmart.ca/en/search?q=', site: 'https://www.walmart.ca/en/cp/grocery/10019', order: 'Walmart pickup & delivery' },
  { id: 'superstore', name: 'Real Canadian Superstore', short: 'Superstore', color: '#e4002b', match: ['realcanadiansuperstore', 'pcexpressrapiddelivery'], search: 'https://www.realcanadiansuperstore.ca/en/search?search-bar=', site: 'https://www.realcanadiansuperstore.ca/en', order: 'PC Express pickup' },
  { id: 'loblaws',    name: 'Loblaws',                  short: 'Loblaws',    color: '#ef6c00', match: ['loblaws'], search: 'https://www.loblaws.ca/en/search?search-bar=', site: 'https://www.loblaws.ca/en', order: 'PC Express pickup' },
  { id: 'sobeys',     name: 'Sobeys',                   short: 'Sobeys',     color: '#00843d', match: ['sobeys', 'voila'], search: 'https://voila.ca/products/search?q=', site: 'https://voila.ca/', order: 'Voilà by Sobeys delivery' },
  { id: 'metro',      name: 'Metro',                    short: 'Metro',      color: '#9c1b3c', match: ['metro'], search: 'https://www.metro.ca/en/online-grocery/search?filter=', site: 'https://www.metro.ca/en/online-grocery', order: 'Metro online pickup' },
  { id: 'farmboy',    name: 'Farm Boy',                 short: 'Farm Boy',   color: '#7cb342', match: ['farmboy', 'farmboymarketsltd'], search: 'https://www.instacart.ca/store/farm-boy/s?k=', site: 'https://www.farmboy.ca/', order: 'Instacart' },
  { id: 'freshco',    name: 'FreshCo',                  short: 'FreshCo',    color: '#00a19a', match: ['freshco'], search: null, site: 'https://freshco.com/flyer/', order: 'In-store' },
  { id: 'costco',     name: 'Costco',                   short: 'Costco',     color: '#1a3d7c', match: ['costco'], search: 'https://www.costco.ca/s?keyword=', site: 'https://www.costco.ca/grocery-household.html', order: 'Costco same-day' },
  { id: 'longos',     name: "Longo's",                  short: "Longo's",    color: '#6a3fb5', match: ['longos'], search: 'https://www.longos.com/search?text=', site: 'https://www.longos.com/', order: "Longo's pickup" },
  // optional extras (off by default — turn on in Settings)
  { id: 'nofrills',   name: 'No Frills',                short: 'No Frills',  color: '#e0a800', match: ['nofrills'], search: 'https://www.nofrills.ca/en/search?search-bar=', site: 'https://www.nofrills.ca/en', order: 'PC Express pickup', extra: true },
  { id: 'foodbasics', name: 'Food Basics',              short: 'Food Basics',color: '#3949ab', match: ['foodbasics'], search: 'https://www.foodbasics.ca/search?filter=', site: 'https://www.foodbasics.ca/', order: 'In-store', extra: true },
  { id: 'wholesale',  name: 'Wholesale Club',           short: 'Wholesale',  color: '#795548', match: ['wholesaleclubandclubentrepot', 'wholesaleclub'], search: null, site: 'https://www.wholesaleclub.ca/', order: 'In-store', extra: true },
  { id: 'yig',        name: 'Your Independent Grocer',  short: 'Independent',color: '#00897b', match: ['yourindependentgrocer'], search: 'https://www.yourindependentgrocer.ca/en/search?search-bar=', site: 'https://www.yourindependentgrocer.ca/en', order: 'PC Express pickup', extra: true },
  { id: 'tnt',        name: 'T&T Supermarket',          short: 'T&T',        color: '#d81b60', match: ['ttsupermarket'], search: null, site: 'https://www.tntsupermarket.com/', order: 'T&T online', extra: true },
  { id: 'shoppers',   name: 'Shoppers Drug Mart',       short: 'Shoppers',   color: '#c62828', match: ['shoppersdrugmart'], search: 'https://www.shoppersdrugmart.ca/search?text=', site: 'https://www.shoppersdrugmart.ca/', order: 'In-store', extra: true },
  { id: 'gianttiger', name: 'Giant Tiger',              short: 'Giant Tiger',color: '#455a64', match: ['gianttiger'], search: 'https://www.gianttiger.com/search?q=', site: 'https://www.gianttiger.com/', order: 'Giant Tiger online', extra: true },
];
const STORE_BY_ID = Object.fromEntries(STORES.map(s => [s.id, s]));
const MERCHANT_TO_STORE = {};
STORES.forEach(s => s.match.forEach(m => { MERCHANT_TO_STORE[m] = s.id; }));

const QUICK_ADD = ['Milk', 'Lactose-free milk', 'Eggs', 'Stonemill sourdough bread', 'Bread', 'Butter', 'Bananas', 'Apples', 'Spinach', 'Ground beef lean', 'Ground beef extra lean',
  'Mini Oreos', 'Mini Oreos white', 'Fruitsations', 'Apple sauce pouches', 'Chicken breast', 'Cheese', 'Yogurt', 'Coffee', 'Cereal', 'Pasta', 'Rice',
  'Potatoes', 'Onions', 'Tomatoes', 'Lettuce', 'Orange juice', 'Bacon', 'Strawberries', 'Toilet paper', 'Paper towels', 'Laundry detergent'];
// Tuned searches for items whose shelf names differ from what you'd type.
// q = what to search, exclude = words that rule a match out, loose = skip the "different product" word filter (brand names).
// prefer = patterns (most important first) that rank a match ahead of cheaper ones, e.g. your favourite brand/size.
const PRESETS = {
  'lactose-free milk': { q: 'lactose free milk', exclude: 'chocolate, cream, eggnog', loose: false, prefer: ['lactantia', '\\b1\\s?%'] },
  'stonemill sourdough bread': { q: 'stonemill sourdough', exclude: 'bagel, bagels, buns, rolls', loose: true, prefer: ['stonemill'],
    link: 'https://www.walmart.ca/en/ip/stonemill-bakehouse-sourdough-bread/6000208313757' },
  'stonemill bakehouse sourdough bread': { q: 'stonemill sourdough', exclude: 'bagel, bagels, buns, rolls', loose: true, prefer: ['stonemill'],
    link: 'https://www.walmart.ca/en/ip/stonemill-bakehouse-sourdough-bread/6000208313757' },
  'mini oreos': { q: 'oreo mini', exclude: 'golden, white fudge, puffs, cereal, ice cream, frozen, pudding', loose: true },
  'mini oreos white': { q: 'oreo mini golden', exclude: 'puffs, cereal, ice cream, frozen', loose: true },
  'fruitsations': { q: 'fruitsations', exclude: '', loose: true },
  'apple sauce pouches': { q: 'apple sauce', exclude: 'arrowroot, biscuits, cake, muffin, bread', loose: false },
  'ground beef lean': { q: 'lean ground beef', exclude: 'extra lean, medium, regular, patties, burgers', loose: false },
  'ground beef extra lean': { q: 'extra lean ground beef', exclude: 'patties, burgers', loose: false },
  'spinach': { q: 'spinach', exclude: 'dip, puree, pasta, ravioli, tortelloni, tortellini, gnocchi, cannelloni, lasagna, quiche, wrap, spanakopita, pie, pizza', loose: false },
};

// "Try also" suggestions in an item's details
const VARIANTS = {
  milk: ['Lactose-free milk', '2% milk', 'Skim milk', 'Homogenized milk', 'Oat milk', 'Almond milk'],
  cream: ['Lactose-free cream', 'Coffee cream', 'Whipping cream'],
  yogurt: ['Lactose-free yogurt', 'Greek yogurt'],
  cheese: ['Lactose-free cheese', 'Cheddar cheese', 'Mozzarella cheese', 'Cheese slices'],
  'ice cream': ['Lactose-free ice cream'],
  'ground beef': ['Ground beef lean', 'Ground beef extra lean'],
  oreos: ['Mini Oreos', 'Mini Oreos white'],
  'sour cream': ['Lactose-free sour cream'],
  bread: ['Whole wheat bread', 'Gluten-free bread', 'Bagels'],
  coffee: ['Ground coffee', 'Coffee pods', 'Instant coffee'],
};
const STOP = new Set(['the', 'and', 'or', 'of', 'a', 'an', 'for', 'with', 'fresh', 'x']);

// ---------- helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n == null || !isFinite(n)) ? '—' : '$' + n.toFixed(2);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const normKey = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const normText = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9.]+/g, ' ').trim();
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cleanPostal = p => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const fmtPostal = p => { const c = cleanPostal(p); return c.length === 6 ? c.slice(0, 3) + ' ' + c.slice(3) : c; };
const storeName = id => (STORE_BY_ID[id] || {}).short || id;
function lsGet(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } }
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; }
  catch { pruneCache(true); try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
}
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
const ICON = {
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  ext: '<svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cart: '<svg viewBox="0 0 24 24"><path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  print: '<svg viewBox="0 0 24 24"><path d="M7 9V3h10v6M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v7H7z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
};

// ---------- state ----------
function defaultSettings() {
  return {
    postal: 'L1M2E2',
    stores: Object.fromEntries(STORES.map(s => [s.id, !s.extra])),
    online: true,     // include online regular prices (e.g. Walmart.ca)
    upcoming: false,  // include flyers that start in the next few days
  };
}
function loadState() {
  const s = lsGet(STATE_KEY) || {};
  const d = defaultSettings();
  s.settings = Object.assign(d, s.settings || {});
  s.settings.stores = Object.assign(defaultSettings().stores, s.settings.stores || {});
  s.items = Array.isArray(s.items) ? s.items : [];
  s.tab = s.tab || 'list';
  return s;
}
let state = loadState();
function save() { lsSet(STATE_KEY, state); }

// results[query] = { status: 'loading'|'ok'|'error', cands: [...], error }
const results = {};

// ---------- Flipp ----------
function slim(j) {
  const keep = m => MERCHANT_TO_STORE[normKey(m)];
  const f = (j.items || []).filter(i => i && i.name && keep(i.merchant_name)).map(i => ({
    i: i.flyer_item_id || i.id, m: i.merchant_name, n: i.name, p: i.current_price, pre: i.pre_price_text,
    post: i.post_price_text, o: i.original_price, st: i.sale_story, vf: i.valid_from, vt: i.valid_to,
    img: i.clean_image_url || i.clipping_image_url || null,
  }));
  const e = (j.ecom_items || []).filter(i => i && i.name && keep(i.merchant)).map(i => ({
    i: i.global_id || i.id || i.sku, m: i.merchant, n: i.name, p: i.current_price, o: i.original_price, img: i.image_url || null,
  }));
  return { f, e };
}

function pruneCache(aggressive) {
  try {
    const keys = [];
    for (let k = 0; k < localStorage.length; k++) { const key = localStorage.key(k); if (key && key.startsWith(CACHE_PREFIX)) keys.push(key); }
    const now = Date.now();
    keys.forEach(key => {
      const v = lsGet(key);
      if (aggressive || !v || now - v.ts > CACHE_TTL * 4) localStorage.removeItem(key);
    });
  } catch { /* storage unavailable */ }
}

async function fetchQuery(q, force) {
  const postal = cleanPostal(state.settings.postal) || 'L1M2E2';
  const ck = CACHE_PREFIX + postal + '.' + normText(q);
  if (!force) {
    const c = lsGet(ck);
    if (c && Date.now() - c.ts < CACHE_TTL) return c;
  }
  const url = `${API}?locale=en-ca&postal_code=${encodeURIComponent(postal)}&q=${encodeURIComponent(q)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Price service returned ' + r.status);
  const j = await r.json();
  const out = { ts: Date.now(), ...slim(j) };
  lsSet(ck, out);
  return out;
}

// ---------- parsing prices ----------
const LB_PER_KG = 2.20462;
function parseSize(name) {
  const t = ' ' + String(name || '').toLowerCase().replace(/,/g, '.') + ' ';
  let m = t.match(/(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|ml|l|oz)\b/);
  let count = 1, amt, unit;
  if (m) { count = +m[1]; amt = +m[2]; unit = m[3]; }
  else {
    m = t.match(/(\d+(?:\.\d+)?)\s*(kg|g|lbs?|ml|l|oz)\b/);
    if (m) { amt = +m[1]; unit = m[2]; }
  }
  if (unit) {
    const tot = count * amt;
    if (unit === 'kg') return { dim: 'mass', base: tot * 1000 };
    if (unit === 'g') return { dim: 'mass', base: tot };
    if (unit === 'lb' || unit === 'lbs') return { dim: 'mass', base: tot * 453.592 };
    if (unit === 'oz') return { dim: 'mass', base: tot * 28.3495 };
    if (unit === 'l') return { dim: 'vol', base: tot * 1000 };
    if (unit === 'ml') return { dim: 'vol', base: tot };
  }
  m = t.match(/(\d+)\s*(?:'s|’s|s\b|\s?pk|\s?pack|\s?ct|\s?count|\s?rolls?|\s?eggs)\b/);
  if (m && +m[1] > 1 && +m[1] <= 200) return { dim: 'count', base: +m[1] };
  if (/\bdozen\b/.test(t)) return { dim: 'count', base: 12 };
  return null;
}

function toCand(raw, source) {
  const storeId = MERCHANT_TO_STORE[normKey(raw.m)];
  if (!storeId) return null;
  const p = Number(raw.p);
  if (!(p > 0)) return null;
  const pre = String(raw.pre || ''), post = String(raw.post || '');
  let n = 1;
  const mm = pre.match(/(\d+)\s*(?:\/|for\b)/i);
  if (mm && +mm[1] > 1 && +mm[1] < 20) n = +mm[1];
  const unit = p / n;
  let single = null;
  const om = post.match(/or\s*\$?\s*(\d+(?:\.\d{1,2})?)/i);
  if (om && n > 1) single = +om[1];
  let per = null;
  const pl = post.trim().toLowerCase();
  if (/^\/?\s*100\s*g\b/.test(pl)) per = '100g';
  else if (/^\/?\s*lbs?\b/.test(pl)) per = 'lb';
  else if (/^\/?\s*kg\b/.test(pl)) per = 'kg';
  const size = per ? null : parseSize(raw.n);
  const now = Date.now();
  const vf = raw.vf ? Date.parse(raw.vf) : null, vt = raw.vt ? Date.parse(raw.vt) : null;
  if (vt && vt < now) return null;
  const upcoming = vf && vf > now;
  const badges = [];
  if (/member|scene\+|pc optimum|pc plus/i.test(pre + ' ' + post)) badges.push('Member price');
  if (/online price/i.test(pre + ' ' + (raw.st || ''))) badges.push('Online price');
  if (/only!|this week only|saturday|sunday|friday/i.test(post + ' ' + (raw.st || ''))) badges.push('Limited days');
  const orig = Number(raw.o) > p ? Number(raw.o) / n : null;
  const deal = parseDeal([pre, post, raw.st].join(' '));
  return {
    key: source + ':' + raw.i, id: raw.i, source, storeId, name: raw.n, price: p, n, unit, single, per, size,
    orig, story: raw.st || '', badges, upcoming, vf, vt, img: raw.img, deal,
  };
}

// "Buy 2 get 3rd free", "Buy 1 get 1 free", "BOGO", "buy 1 get 2nd 50% off" -> { buy, free } (free can be 0.5)
function parseDeal(text) {
  const t = String(text || '').toLowerCase();
  if (/\bbogo\b/.test(t)) return { buy: 1, free: 1, label: 'Buy 1 get 1 free' };
  const m = t.match(/buy\s*(\d+)\s*(?:,\s*)?get\s*(?:the\s*)?(\d+|one|another|2nd|3rd|4th|5th)?\s*(?:one|item|of equal[^,]*?)?\s*(free|50\s*%\s*off|half\s*(?:off|price))/);
  if (!m) return null;
  const buy = +m[1];
  if (!(buy >= 1 && buy <= 6)) return null;
  let free = 1;
  if (m[2] && /^\d+$/.test(m[2])) free = +m[2];
  const frac = /free/.test(m[3]) ? 1 : 0.5;
  return { buy, free: free * frac, n: buy + free, label: m[0].replace(/\s+/g, ' ').trim() };
}

// Words that turn a match into a different product: "milk chocolate", "banana bread", "coconut milk", "peanut butter".
const FOLLOW_STOP = new Set(['chocolate', 'chocolates', 'bar', 'bars', 'bread', 'breads', 'cake', 'cakes', 'cupcakes', 'chips', 'crisps', 'muffin', 'muffins',
  'cookie', 'cookies', 'creamer', 'creamers', 'whitener', 'machine', 'machines', 'maker', 'makers', 'filter', 'filters', 'noodle', 'noodles', 'roll', 'rolls',
  'sauce', 'sauces', 'seasoning', 'flavour', 'flavoured', 'flavored', 'candy', 'candies', 'pudding', 'puddings', 'juice', 'juices', 'drink', 'drinks', 'shampoo',
  'soap', 'lotion', 'candle', 'candles', 'scented', 'mug', 'mugs', 'bowl', 'bowls', 'dish', 'dishes', 'toy', 'toys', 'treat', 'treats', 'popsicle', 'popsicles',
  'loaf', 'loaves', 'pie', 'pies', 'tart', 'tarts', 'danish', 'squares', 'wafers', 'bites', 'jerky', 'dog', 'cat', 'pet', 'bath', 'body', 'powder', 'spread', 'dip', 'dips',
  'syrup', 'syrups', 'rice', 'side', 'crackers', 'cereal', 'cereals', 'granola', 'gummies', 'gels', 'cups', 'flavour', 'ice', 'freezies', 'lip', 'balm', 'wash', 'cleaner']);
// checked in the 3 words before the match, so "Coconut Cream or Milk" is caught too
const PRECEDE_STOP = new Set(['chocolate', 'chocolated', 'coconut', 'almond', 'oat', 'soy', 'cashew', 'peanut', 'body', 'cocoa', 'shea', 'dog', 'cat', 'pet', 'baby',
  'evaporated', 'condensed', 'powdered', 'goat', 'hemp', 'rice', 'pistachio', 'apple']);

const SYNONYMS = [[/\bapplesauce\b/g, 'apple sauce'], [/\bminis\b/g, 'mini']];
const withSyn = t => SYNONYMS.reduce((acc, [re, rep]) => acc.replace(re, rep), t);

function relevant(name, q, exclude, loose) {
  const words = withSyn(normText(name)).split(' ').filter(Boolean);
  const hay = ' ' + words.join(' ') + ' ';
  const qn = withSyn(normText(q));
  const toks = qn.split(' ').filter(t => t.length > 1 && !STOP.has(t) && !/^\d/.test(t) && !/^(kg|g|l|ml|lb|lbs|pk|pack)$/.test(t));
  const stemOf = t => t.length > 3 ? t.replace(/ies$/, '').replace(/(es|s)$/, '') : t;
  const hits = [];
  for (const t of toks) {
    const stem = stemOf(t);
    const idx = words.findIndex(w => w.startsWith(stem) && w.length - stem.length <= 3);
    if (idx < 0) return false;
    hits.push(idx);
  }
  if (hits.length && !loose) {
    const qWords = new Set(qn.split(' '));
    const first = Math.min(...hits), last = Math.max(...hits);
    const next = words[last + 1], prev = words[first - 1];
    if (next && FOLLOW_STOP.has(next) && !qWords.has(next)) return false;
    if (prev && PRECEDE_STOP.has(prev) && !qWords.has(prev)) return false;
    for (let k = Math.max(0, first - 3); k < last; k++) if (PRECEDE_STOP.has(words[k]) && !qWords.has(words[k]) && words[k] !== 'apple') return false;
  }
  if (exclude) {
    for (const w of exclude.split(/[,;]+/).map(x => normText(x)).filter(Boolean)) {
      if (hay.includes(' ' + w)) return false;
    }
  }
  return true;
}

// price for one unit at this list quantity (handles "2 for $5, or $2.99 each")
function effPrice(c, qty) {
  qty = qty || 1;
  if (c.deal && c.deal.n && qty >= c.deal.n) {
    const groups = Math.floor(qty / c.deal.n), rest = qty % c.deal.n;
    return (groups * (c.deal.n - c.deal.free) * c.unit + rest * c.unit) / qty;
  }
  return (c.n > 1 && c.single && qty < c.n) ? c.single : c.unit;
}
const perLb = c => c.per === 'lb' ? c.unit : c.per === 'kg' ? c.unit / LB_PER_KG : c.per === '100g' ? c.unit * 4.53592 : null;
function unitValue(c) {
  if (c.per) return { dim: 'mass', v: perLb(c) * LB_PER_KG, label: '/kg' };
  if (c.size) {
    if (c.size.dim === 'mass') return { dim: 'mass', v: c.unit / c.size.base * 1000, label: '/kg' };
    if (c.size.dim === 'vol') return { dim: 'vol', v: c.unit / c.size.base * 1000, label: '/L' };
    if (c.size.dim === 'count') return { dim: 'count', v: c.unit / c.size.base, label: '/ea' };
  }
  return null;
}
function unitLabel(c) {
  const u = unitValue(c);
  return u ? money(u.v) + u.label : '';
}

// candidates for a list item (or ad-hoc query), filtered + sorted best first
let candMemo = new Map();
function candidatesFor(item) {
  if (candMemo.has(item)) return candMemo.get(item);
  const out = candidatesForRaw(item);
  candMemo.set(item, out);
  return out;
}
function candidatesForRaw(item) {
  const r = results[normText(item.q)];
  if (!r || r.status !== 'ok') return [];
  const s = state.settings;
  const hidden = new Set(item.hidden || []);
  const pass = (loose, onlineOnly) => {
    const seen = new Set();
    return r.cands.filter(c => {
      if (!s.stores[c.storeId]) return false;
      if (onlineOnly && c.source !== 'ecom') return false;
      if (c.upcoming && !s.upcoming) return false;
      if (hidden.has(c.key)) return false;
      if (!relevant(c.name, item.q, item.exclude, loose)) return false;
      const dk = c.storeId + '|' + normText(c.name) + '|' + c.price;
      if (seen.has(dk)) return false;
      seen.add(dk);
      return true;
    });
  };
  let list = pass(item.loose, false);
  // Online regular prices only fill in: kept when the item isn't in any flyer (or the setting says always show them).
  const anyFlyer = list.some(c => c.source === 'flyer');
  if (anyFlyer && !s.online) list = list.filter(c => c.source === 'flyer');
  // Not in any flyer and no strict online match: take the closest online match rather than no price.
  if (!list.length && !item.loose) list = pass(true, true).map(c => ({ ...c, loose: true }));
  const qty = item.qty || 1;
  const key = c => perLb(c) ?? effPrice(c, qty);
  // Cheapest wins whether it's a flyer deal or an online price — but a much smaller package than the
  // others (a 473 ml milk next to 2-4 L jugs) is pushed down so it doesn't "win" just by being small.
  const sizes = {};
  list.forEach(c => { if (c.size) (sizes[c.size.dim] = sizes[c.size.dim] || []).push(c.size.base); });
  const med = {};
  for (const [dim, arr] of Object.entries(sizes)) { const a = arr.slice().sort((x, y) => x - y); med[dim] = a.length >= 3 ? a[a.length >> 1] : 0; }
  const tier = c => (c.size && med[c.size.dim] && c.size.base < med[c.size.dim] * 0.4) ? 1 : 0;
  if (item.mode === 'unit') {
    const counts = {};
    list.forEach(c => { const u = unitValue(c); if (u) counts[u.dim] = (counts[u.dim] || 0) + 1; });
    const dim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    list.sort((a, b) => {
      if (tier(a) !== tier(b)) return tier(a) - tier(b);
      const ua = unitValue(a), ub = unitValue(b);
      const ha = ua && ua.dim === dim, hb = ub && ub.dim === dim;
      if (ha && hb) return ua.v - ub.v;
      if (ha !== hb) return ha ? -1 : 1;
      return key(a) - key(b);
    });
  } else {
    list.sort((a, b) => tier(a) - tier(b) || key(a) - key(b));
  }
  if (item.prefer && item.prefer.length) {
    const pats = item.prefer.map(p => { try { return new RegExp(p, 'i'); } catch { return null; } });
    const score = c => pats.reduce((acc, re, i) => acc + (re && re.test(c.name) ? pats.length - i : 0), 0);
    list.sort((a, b) => score(b) - score(a)); // stable: keeps cheapest-first within the same preference
  }
  return list;
}

// the deal chosen for a list item: pinned product > locked store > cheapest
function chooseFor(item) {
  const cands = candidatesFor(item);
  let pick = null, why = 'cheapest';
  if (item.pick) { pick = cands.find(c => c.key === item.pick) || null; if (pick) why = 'picked'; }
  if (!pick && item.lock) { pick = cands.find(c => c.storeId === item.lock) || null; if (pick) why = 'locked'; }
  if (!pick) pick = cands[0] || null;
  let storeId = pick ? pick.storeId : null;
  if (!pick && item.lock && state.settings.stores[item.lock]) storeId = item.lock;
  return { pick, cands, storeId, why };
}

function couponFor(item, c) {
  const cp = item.coupon;
  if (!cp || !(cp.amount > 0) || !c) return 0;
  if (cp.store && cp.store !== c.storeId) return 0;
  return Math.min(cp.amount, effPrice(c, item.qty || 1) * (item.qty || 1));
}
function lineCost(item, c) {
  if (!c) return null;
  return effPrice(c, item.qty || 1) * (item.qty || 1) - couponFor(item, c);
}

function plan() {
  const byStore = {};
  const unassigned = [];
  let total = 0, savings = 0, pending = 0, priced = 0;
  for (const item of state.items) {
    const r = results[normText(item.q)];
    if (!r || r.status === 'loading') pending++;
    const ch = chooseFor(item);
    if (ch.storeId) {
      (byStore[ch.storeId] = byStore[ch.storeId] || []).push({ item, ...ch });
      const cost = lineCost(item, ch.pick);
      if (cost != null) {
        total += cost; priced++;
        const q = item.qty || 1;
        const reg = ch.pick.orig || ch.pick.unit;
        savings += Math.max(0, (reg - effPrice(ch.pick, q)) * q) + couponFor(item, ch.pick);
      }
    } else unassigned.push({ item, ...ch });
  }
  const order = Object.keys(byStore).sort((a, b) => byStore[b].length - byStore[a].length);
  return { byStore, order, unassigned, total, savings: Math.max(0, savings), pending, priced };
}

// ---------- loading ----------
let inflight = 0;
const queue = [];
function ensureResults(q, force) {
  const k = normText(q);
  if (!k) return;
  if (!force && results[k] && results[k].status !== 'error') return;
  results[k] = { status: 'loading', cands: [] };
  queue.push({ q, k, force });
  pump();
}
function pump() {
  while (inflight < 4 && queue.length) {
    const job = queue.shift();
    inflight++;
    fetchQuery(job.q, job.force)
      .then(d => {
        const cands = [];
        d.f.forEach(r => { const c = toCand(r, 'flyer'); if (c) cands.push(c); });
        d.e.forEach(r => { const c = toCand(r, 'ecom'); if (c) cands.push(c); });
        results[job.k] = { status: 'ok', cands, ts: d.ts };
        if (typeof onResults === 'function') onResults(job.k);
      })
      .catch(err => { results[job.k] = { status: 'error', cands: [], error: err.message || 'Network error' }; })
      .finally(() => { inflight--; scheduleRender(); pump(); if (!inflight && !queue.length) $('#refreshBtn').classList.remove('spin'); });
  }
  if (inflight) $('#refreshBtn').classList.add('spin');
}
function loadAll(force) {
  state.items.forEach(i => ensureResults(i.q, force));
  if (compareQ) ensureResults(compareQ, force);
  if (!state.items.length && !compareQ) $('#refreshBtn').classList.remove('spin');
}
// Used after a field in the sheet changes: the change fires as focus leaves the field, often on the same tap
// that presses a button — rendering a moment later lets that tap land.
let renderSoonTimer = null;
function renderSoon() { clearTimeout(renderSoonTimer); renderSoonTimer = setTimeout(render, 350); }
let renderPending = false;
function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; render(); });
}

// ---------- list editing ----------
// A pasted product link (walmart.ca, superstore, metro, sobeys/voila...) becomes an item named from the link.
function nameFromLink(text) {
  let u;
  try { u = new URL(text.trim()); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const skip = /^(en|fr|ip|p|product|products|pd|aisles|search|online-grocery|grocery)$/i;
  const slug = parts.filter(x => /[a-z]/i.test(x) && x.includes('-') && !skip.test(x)).sort((a, b) => b.length - a.length)[0];
  if (!slug) return null;
  const name = slug.replace(/-+/g, ' ').replace(/\b\d{6,}\b/g, '').replace(/\s+/g, ' ').trim();
  if (!name) return null;
  return { name: name.replace(/\b\w/g, ch => ch.toUpperCase()), link: u.origin + u.pathname };
}
function parseEntry(text) {
  let t = text.trim().replace(/\s+/g, ' ');
  let qty = 1;
  let m = t.match(/^(\d{1,2})\s*(?:x|×)\s+(.+)$/i) || t.match(/^(\d{1,2})\s+(?!(?:kg|g|l|ml|lb|lbs|pk|pack)\b)(.+)$/i);
  if (m) { qty = +m[1]; t = m[2]; }
  else if ((m = t.match(/^(.+?)\s*(?:x|×)\s*(\d{1,2})$/i))) { t = m[1]; qty = +m[2]; }
  return { q: t, qty: Math.max(1, Math.min(99, qty)) };
}
function addItems(text) {
  const links = [];
  // pull out any pasted product links (tracking junk and all) and turn each into its own item
  text = text.replace(/https?:\/\/[^\s,]+/gi, m => {
    const l = nameFromLink(m);
    if (!l) return '\n';
    links.push(l);
    return '\n' + l.name + '\n';
  });
  const parts = text.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  let added = 0;
  for (const p of parts) {
    const { q: typed, qty } = parseEntry(p);
    if (!typed) continue;
    const preset = PRESETS[normText(typed)];
    const q = preset ? preset.q : typed;
    const label = preset ? typed : null;
    const existing = state.items.find(i => normText(nameOf(i)) === normText(typed));
    if (existing) { existing.qty = Math.min(99, (existing.qty || 1) + qty); continue; }
    state.items.push({ id: uid(), q, label, qty, exclude: preset ? preset.exclude : '', loose: preset ? preset.loose : false, prefer: preset && preset.prefer ? preset.prefer : null,
      mode: 'price', pick: null, lock: null, hidden: [], done: false, added: Date.now(),
      link: (links.find(l => l.name === typed) || {}).link || (preset && preset.link) || null });
    ensureResults(q);
    added++;
  }
  save();
  render();
  if (parts.length) toast(added ? `Added ${added} item${added > 1 ? 's' : ''} — checking prices` : 'Updated quantity');
}
const findItem = id => state.items.find(i => i.id === id);
const nameOf = item => item.label || item.q;
function removeItem(id) {
  const idx = state.items.findIndex(i => i.id === id);
  if (idx < 0) return;
  const [gone] = state.items.splice(idx, 1);
  save(); render();
  toastUndo(`Removed ${nameOf(gone)}`, () => { state.items.splice(idx, 0, gone); save(); render(); });
}
function toastUndo(msg, undo) {
  const t = $('#toast');
  t.innerHTML = `${esc(msg)} <button class="btn sm" style="margin-left:8px;pointer-events:auto" id="undoBtn">Undo</button>`;
  t.style.pointerEvents = 'auto';
  t.classList.add('show');
  $('#undoBtn').onclick = () => { undo(); t.classList.remove('show'); };
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.classList.remove('show'); t.style.pointerEvents = ''; }, 4000);
}

// ---------- rendering ----------
function thumb(c, size) {
  const px = size || 44;
  if (c && c.img) return `<img class="thumb" style="width:${px}px;height:${px}px" loading="lazy" src="${esc(c.img)}" alt="" onerror="this.outerHTML='<div class=&quot;thumb noimg&quot; style=&quot;width:${px}px;height:${px}px&quot;></div>'">`;
  return `<div class="thumb noimg" style="width:${px}px;height:${px}px"></div>`;
}
function storeTag(id) {
  const s = STORE_BY_ID[id];
  if (!s) return '';
  return `<span class="store-tag"><span class="dot" style="background:${s.color}"></span>${esc(s.short)}</span>`;
}
function priceHtml(c, qty) {
  if (!c) return '';
  const e = effPrice(c, qty || 1);
  const per = c.per ? `<small>/${c.per}</small>` : '';
  const multi = c.n > 1 ? `<div class="tiny muted">${c.n} for ${money(c.price)}${c.single ? ` · ${money(c.single)} ea` : ''}</div>` : '';
  const was = c.orig ? `<div class="was">${money(c.orig)}</div>` : '';
  return `<div class="price">${money(e)}${per}${multi}${was}</div>`;
}
function candPills(c) {
  const out = [];
  if (c.source === 'ecom') out.push(`<span class="pill">${c.loose ? 'Closest online match' : 'Regular price online'}</span>`);
  if (c.deal) out.push(`<span class="pill sale">${esc(c.deal.label)}</span>`);
  else if (c.orig || c.story) out.push(`<span class="pill sale">${esc((c.story || 'Sale').slice(0, 28))}</span>`);
  else out.push('<span class="pill sale">Flyer</span>');
  c.badges.forEach(b => out.push(`<span class="pill warn">${esc(b)}</span>`));
  if (c.upcoming) out.push(`<span class="pill warn">Starts ${new Date(c.vf).toLocaleDateString('en-CA', { weekday: 'short' })}</span>`);
  else if (c.vt && c.source === 'flyer') out.push(`<span class="pill">Ends ${new Date(c.vt - 1000).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}</span>`);
  const u = unitLabel(c);
  if (u) out.push(`<span class="pill">${u}</span>`);
  return out.join('');
}

function render() {
  candMemo = new Map();
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
  const p = plan();
  const nStores = p.order.length;
  $('#subline').textContent = `${fmtPostal(state.settings.postal)} · ${Object.values(state.settings.stores).filter(Boolean).length} stores` +
    (state.items.length ? ` · ${state.items.length} items` : '');
  const badge = $('#shopBadge');
  badge.textContent = nStores; badge.classList.toggle('hidden', !nStores);
  const view = $('#view');
  // keep whatever is being typed (prices arriving re-render the page)
  const kept = {};
  view.querySelectorAll('input[id]').forEach(el => { if (!/^(checkbox|radio)$/.test(el.type)) kept[el.id] = el.value; });
  const ae = document.activeElement;
  const focusId = ae && view.contains(ae) ? ae.id : null;
  let sel = null;
  try { sel = focusId ? [ae.selectionStart, ae.selectionEnd] : null; } catch { sel = null; }
  if (state.tab === 'list') view.innerHTML = renderList(p);
  else if (state.tab === 'shop') view.innerHTML = renderShop(p);
  else if (state.tab === 'compare') view.innerHTML = renderCompare();
  else if (state.tab === 'budget') view.innerHTML = renderBudget(p);
  else view.innerHTML = renderSettings();
  for (const [id, v] of Object.entries(kept)) { const el = document.getElementById(id); if (el && view.contains(el) && el.value !== v) el.value = v; }
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus({ preventScroll: true }); try { if (sel && sel[0] != null) el.setSelectionRange(sel[0], sel[1]); } catch { /* number inputs */ } }
  }
  if (sheetMode) renderSheet();
}

function renderSummary(p) {
  const loading = p.pending ? `<span class="loading-dots">Checking prices</span>` : '';
  return `<div class="summary">
    <div class="stat"><b class="num">${money(p.total)}</b><span>Estimated total${p.priced < state.items.length && !p.pending ? ' (priced items)' : ''}</span></div>
    <div class="stat"><b class="num">${p.order.length}</b><span>${p.order.length === 1 ? 'store' : 'stores'} to visit</span></div>
    <div class="stat good"><b class="num">${money(p.savings)}</b><span>Saved vs regular ${loading}</span></div>
  </div>`;
}

function renderList(p) {
  const chips = QUICK_ADD.filter(q => !state.items.some(i => normText(nameOf(i)) === normText(q)));
  let html = `<div class="card pad stack">
    <form id="addForm" class="addbar" autocomplete="off">
      <input id="addInput" type="text" enterkeyhint="done" placeholder="Add items — e.g. milk 4L, 2 x eggs, bananas" aria-label="Add grocery items">
      <button class="btn primary" type="submit">Add</button>
    </form>
    ${listTools()}
    <details class="more"${state.items.length ? '' : ' open'}><summary>＋ Quick add common items</summary>
      <div class="chips" style="margin-top:8px">${chips.map(q => `<button class="chip" data-quick="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    </details>
  </div>`;

  if (!state.items.length) {
    html += `<div class="empty">${ICON.cart.replace('<svg', '<svg style="width:44px;height:44px"')}<div class="strong">Your list is empty</div>
      <div class="small">Add what you need and it'll find the cheapest store for each item from this week's flyers around ${esc(fmtPostal(state.settings.postal))}.</div></div>`;
    return html;
  }
  html += `<div class="section-title">This week</div>` + renderSummary(p) + showdownHeadline(p);
  html += `<div class="row between" style="margin:18px 2px 8px"><div class="section-title" style="margin:0">Your list</div>
    <button class="btn sm ghost" data-go="shop">See lists by store →</button></div>`;
  html += `<ul class="items card">`;
  for (const item of state.items) {
    const r = results[normText(item.q)];
    const ch = chooseFor(item);
    let sub, right = '';
    if (!r || r.status === 'loading') sub = `<span class="loading-dots">Checking stores</span>`;
    else if (r.status === 'error') sub = `<span style="color:var(--bad)">Couldn't load prices — tap refresh</span>`;
    else if (!ch.pick) sub = ch.storeId ? `${storeTag(ch.storeId)} <span>no flyer price — buy at your pick</span>` : `<span class="faint">Not in any flyer this week · tap to choose a store</span>`;
    else {
      const others = new Set(ch.cands.map(c => c.storeId)).size;
      sub = `${storeTag(ch.pick.storeId)} ${esc(ch.pick.name)}${ch.why !== 'cheapest' ? ' · <b>' + (ch.why === 'picked' ? 'your pick' : 'store locked') + '</b>' : ''} <span class="faint">· ${others} store${others === 1 ? '' : 's'}</span>`;
      right = priceHtml(ch.pick, item.qty);
    }
    html += `<li class="lrow">
      <div class="limg" data-open="${item.id}">${thumb(ch.pick, 48)}</div>
      <div class="item-name" data-open="${item.id}">${esc(nameOf(item))}</div>
      <div class="lprice" data-open="${item.id}">${right}</div>
      <button class="x-btn ldel" data-del="${item.id}" aria-label="Remove ${esc(nameOf(item))}">${ICON.x}</button>
      <div class="item-sub lsub" data-open="${item.id}">${sub}${ch.pick ? itemBadges(item, ch.pick) : ''}</div>
      <div class="qty lqty" aria-label="Quantity"><button data-dec="${item.id}" aria-label="Less">−</button><span>${item.qty || 1}</span><button data-inc="${item.id}" aria-label="More">+</button></div>
    </li>`;
  }
  html += `</ul><p class="tiny faint" style="margin:10px 2px">Tap an item to see every store's price, pick a specific product, hide wrong matches, or lock it to a store.</p>`;
  return html;
}

function storeListText(sid, rows) {
  const s = STORE_BY_ID[sid];
  const lines = rows.map(({ item, pick }) => {
    const q = item.qty || 1;
    return `☐ ${q > 1 ? q + ' × ' : ''}${nameOf(item)}${pick ? ` — ${pick.name} ${money(effPrice(pick, q))}${pick.per ? '/' + pick.per : ''}` : ''}`;
  });
  const tot = rows.reduce((a, { item, pick }) => a + (lineCost(item, pick) || 0), 0);
  return `${s ? s.name : sid} (${rows.length} items, ~${money(tot)})\n${lines.join('\n')}`;
}

function tripTips(p) {
  // For small stops, what would it cost to move those items to another store already on the route?
  const tips = [];
  for (const sid of p.order) {
    const rows = p.byStore[sid];
    if (rows.length > 2 || p.order.length < 2) continue;
    let extra = 0, ok = true, dest = {};
    for (const row of rows) {
      if (!row.pick) { ok = false; break; }
      const alt = row.cands.find(c => c.storeId !== sid && p.byStore[c.storeId]);
      if (!alt) { ok = false; break; }
      extra += (lineCost(row.item, alt) - lineCost(row.item, row.pick));
      dest[alt.storeId] = 1;
    }
    if (ok) tips.push({ sid, extra, dest: Object.keys(dest), rows });
  }
  return tips.sort((a, b) => a.extra - b.extra);
}

function renderShop(p) {
  if (!state.items.length) return `<div class="empty"><div class="strong">Nothing to shop for yet</div><div class="small">Add items on the List tab first.</div><p><button class="btn primary" data-go="list">Go to list</button></p></div>`;
  let html = renderSummary(p);

  const tips = tripTips(p);
  if (tips.length) {
    html += `<div class="section-title">Trip savers</div><div class="stack">`;
    tips.forEach(t => {
      html += `<div class="tip row between wrap"><div class="grow">Skip <b>${esc(storeName(t.sid))}</b> (${t.rows.length} item${t.rows.length > 1 ? 's' : ''}) and buy ${t.rows.length > 1 ? 'them' : 'it'} at ${t.dest.map(storeName).map(esc).join(' / ')} for <b>+${money(Math.max(0, t.extra))}</b>.</div>
        <button class="btn sm" data-skip="${t.sid}">Skip ${esc(storeName(t.sid))}</button></div>`;
    });
    html += `</div>`;
  }

  html += `<div class="row between" style="margin:20px 2px 8px"><div class="section-title" style="margin:0">Your store lists</div>
    <div class="row no-print"><button class="btn sm ghost" data-print>${ICON.print} Print</button><button class="btn sm ghost" data-copyall>${ICON.copy} Copy all</button></div></div><div class="stack">`;
  for (const sid of p.order) {
    const s = STORE_BY_ID[sid];
    const rows = p.byStore[sid];
    const tot = rows.reduce((a, { item, pick }) => a + (lineCost(item, pick) || 0), 0);
    const done = rows.filter(r => r.item.done).length;
    html += `<section class="card store-card">
      <div class="store-head"><span class="swatch" style="background:${s.color}"></span>
        <div class="grow"><h2>${esc(s.name)}</h2><div class="tiny muted">${rows.length} item${rows.length > 1 ? 's' : ''}${done ? ` · ${done} in cart` : ''} · ${esc(s.order)}</div></div>
        <div class="price" style="font-size:18px">${money(tot)}</div></div>
      <ul class="items">`;
    for (const { item, pick, why } of rows) {
      const q = item.qty || 1;
      const find = s.search ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${esc(s.search + encodeURIComponent(item.q))}" title="Find on ${esc(s.short)} site">${ICON.ext}</a>` : '';
      html += `<li class="item${item.done ? ' done' : ''}">
        <input type="checkbox" class="check" data-done="${item.id}" ${item.done ? 'checked' : ''} aria-label="Got ${esc(nameOf(item))}">
        <div data-open="${item.id}" style="cursor:pointer">${thumb(pick, 44)}</div>
        <div class="item-main" data-open="${item.id}">
          <div class="item-name">${q > 1 ? q + ' × ' : ''}${esc(nameOf(item))}</div>
          <div class="item-sub">${pick ? esc(pick.name) : 'No flyer price — check shelf'}${pick && pick.badges.length ? ' · ' + esc(pick.badges.join(', ')) : ''}${why === 'locked' ? ' · locked here' : ''}</div>
        </div>
        ${pick ? `<div class="price">${money(lineCost(item, pick))}${pick.per ? `<div class="tiny muted">${money(effPrice(pick, q))}/${pick.per} est.</div>` : q > 1 ? `<div class="tiny muted">${money(effPrice(pick, q))} ea</div>` : ''}</div>` : ''}
        ${find}
      </li>`;
    }
    html += `</ul><div class="store-actions">
        <a class="btn sm primary" target="_blank" rel="noopener" href="${esc(s.site)}">${ICON.cart} ${s.search ? 'Order online' : 'Store site'}</a>
        <button class="btn sm" data-copy="${sid}">${ICON.copy} Copy list</button>
        <button class="btn sm" data-fx="panel" data-panel="trip" data-arg="${sid}">$ Log trip</button>
        ${navigator.share ? `<button class="btn sm" data-share="${sid}">${ICON.share} Share</button>` : ''}
      </div></section>`;
  }
  if (p.unassigned.length) {
    const opts = STORES.filter(s => state.settings.stores[s.id]).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
    html += `<section class="card store-card"><div class="store-head"><span class="swatch" style="background:var(--line)"></span>
      <div class="grow"><h2>No price found yet</h2><div class="tiny muted">Not in this week's flyers at your stores — pick where to buy</div></div></div><ul class="items">`;
    p.unassigned.forEach(({ item }) => {
      const r = results[normText(item.q)];
      const status = !r || r.status === 'loading' ? '<span class="loading-dots">Checking</span>' : r.status === 'error' ? 'Price check failed' : 'No match';
      html += `<li class="item"><div class="item-main" data-open="${item.id}"><div class="item-name">${esc(nameOf(item))}</div><div class="item-sub">${status}</div></div>
        <select style="width:auto" data-lock="${item.id}" aria-label="Store for ${esc(nameOf(item))}"><option value="">Choose store…</option>${opts}</select></li>`;
    });
    html += `</ul></section>`;
  }
  html += `</div>`;
  html += showdownCard(p);
  if (state.items.some(i => i.done)) html += `<p style="text-align:center;margin-top:18px"><button class="btn danger" data-cleardone>Remove checked items from list</button></p>`;
  html += `<p class="tiny faint" style="margin:14px 2px">Prices come from store flyers and online listings on Flipp for ${esc(fmtPostal(state.settings.postal))}. Weighted items (/lb) are estimates. Always confirm at checkout.</p>`;
  return html;
}

// ----- compare tab -----
let compareQ = '';
function renderCompare() {
  let html = `<div class="card pad stack">
    <form id="cmpForm" class="addbar" autocomplete="off">
      <input id="cmpInput" type="search" enterkeyhint="search" placeholder="Compare any item — e.g. coffee, chicken thighs" value="${esc(compareQ)}" aria-label="Search item">
      <button class="btn primary" type="submit">Search</button>
    </form>
    <div class="tiny muted">Searches every store's flyer and online prices near ${esc(fmtPostal(state.settings.postal))}.</div>
  </div>`;
  if (!compareQ) return html + `<div class="empty small">Search for anything to see who has it cheapest this week.</div>`;
  const r = results[normText(compareQ)];
  if (!r || r.status === 'loading') return html + `<div class="empty"><span class="loading-dots">Checking stores</span></div>`;
  if (r.status === 'error') return html + `<div class="empty">Couldn't load prices (${esc(r.error)}). Try again.</div>`;
  const pseudo = { q: compareQ, qty: 1, exclude: compareExclude, mode: compareMode, hidden: [] };
  const cands = candidatesFor(pseudo);
  const inList = state.items.some(i => normText(i.q) === normText(compareQ));
  html += `<div class="row between wrap" style="margin:16px 2px 8px">
    <div class="section-title" style="margin:0">${cands.length} price${cands.length === 1 ? '' : 's'} for “${esc(compareQ)}”</div>
    <div class="row">
      <div class="seg"><button data-cmode="price" class="${compareMode !== 'unit' ? 'on' : ''}">Price</button><button data-cmode="unit" class="${compareMode === 'unit' ? 'on' : ''}">Unit price</button></div>
      <button class="btn sm primary" data-addcmp ${inList ? 'disabled' : ''}>${inList ? 'In list' : '+ Add to list'}</button>
    </div></div>`;
  html += `<div class="card pad" style="margin-bottom:10px"><label class="field">Hide results containing (comma separated)
    <input id="cmpExclude" type="text" value="${esc(compareExclude)}" placeholder="e.g. chocolate, almond"></label></div>`;
  if (!cands.length) return html + `<div class="empty small">No matches at your selected stores. Try a simpler word (e.g. “cheese” instead of “old cheddar block”).</div>`;
  // best per store first, then everything
  const bestPer = [];
  const seenStore = new Set();
  cands.forEach(c => { if (!seenStore.has(c.storeId)) { seenStore.add(c.storeId); bestPer.push(c); } });
  html += `<div class="section-title">Cheapest at each store</div><div class="card pad">${bestPer.map((c, i) => candRow(c, i === 0, null)).join('')}</div>`;
  html += `<details class="card pad" style="margin-top:12px"><summary class="strong" style="cursor:pointer">All ${cands.length} matches</summary>${cands.map(c => candRow(c, false, null)).join('')}</details>`;
  return html;
}
let compareMode = 'price', compareExclude = '';

function candRow(c, best, itemId) {
  const img = thumb(c, 64);
  const actions = itemId ? `<div class="row" style="gap:4px;flex-direction:column">
      <button class="btn sm${best ? ' primary' : ''}" data-pick="${esc(c.key)}" data-item="${itemId}">${best ? 'Using' : 'Use'}</button>
      <button class="btn sm ghost" data-hide="${esc(c.key)}" data-item="${itemId}" title="Wrong item — hide">Hide</button></div>` : '';
  return `<div class="cand${best ? ' best' : ''}">${img}
    <div class="grow"><div class="row" style="gap:6px">${storeTag(c.storeId)}</div>
      <div class="cand-name" style="margin-top:3px">${esc(c.name)}</div>
      <div class="cand-meta">${candPills(c)}</div></div>
    ${priceHtml(c, 1)}${actions}</div>`;
}

// ----- item sheet -----
// sheetMode: { type: 'item', arg: itemId } or a panel from features.js (meals, scan, usuals, showdown, versus, trip, alerts)
let sheetMode = null;
let sheetItemId = null;
function openPanel(type, arg) {
  if (sheetMode && sheetMode.type !== type && typeof onPanelClose === 'function') onPanelClose(sheetMode);
  sheetMode = { type, arg, fresh: true };
  sheetItemId = type === 'item' ? arg : null;
  $('#sheetWrap').classList.remove('hidden');
  $('#sheetWrap').setAttribute('aria-hidden', 'false');
  $('#sheet').scrollTop = 0;
  renderSheet(true);
}
const openSheet = id => openPanel('item', id);
function closeSheet() {
  if (sheetMode && typeof onPanelClose === 'function') onPanelClose(sheetMode);
  sheetMode = null;
  sheetItemId = null;
  $('#sheetWrap').classList.add('hidden');
  $('#sheetWrap').setAttribute('aria-hidden', 'true');
}
let sheetDeferred = false;
function renderSheet(force) {
  if (!sheetMode) return;
  candMemo = new Map();
  // don't wipe a field the user is typing in; re-render once they leave it
  const ae = document.activeElement;
  if (!force && ae && $('#sheet').contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && ae.type !== 'checkbox') { sheetDeferred = true; return; }
  sheetDeferred = false;
  if (sheetMode.type !== 'item') {
    const html = renderPanel(sheetMode, force);
    if (html == null) return; // panel manages its own DOM (camera)
    const st = $('#sheet').scrollTop;
    $('#sheet').innerHTML = `<div class="sheet-grip"></div>` + html;
    $('#sheet').scrollTop = st;
    return;
  }
  const item = findItem(sheetItemId);
  if (!item) return closeSheet();
  const r = results[normText(item.q)];
  const ch = chooseFor(item);
  const storeOpts = STORES.filter(s => state.settings.stores[s.id])
    .map(s => `<option value="${s.id}" ${item.lock === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
  let body;
  if (!r || r.status === 'loading') body = `<div class="empty"><span class="loading-dots">Checking stores</span></div>`;
  else if (r.status === 'error') body = `<div class="empty">Couldn't load prices. <button class="btn sm" data-retry="${item.id}">Retry</button></div>`;
  else if (!ch.cands.length) body = `<div class="empty small">No matches at your stores this week. Try a simpler name (edit above), un-hide items, or turn on more stores in Settings.</div>`;
  else body = ch.cands.map(c => candRow(c, ch.pick && c.key === ch.pick.key, item.id)).join('');
  const nHidden = (item.hidden || []).length;
  const nm = normText(nameOf(item));
  const vkey = Object.keys(VARIANTS).find(k => nm === k || nm.endsWith(' ' + k));
  const variants = vkey ? VARIANTS[vkey].filter(v => normText(v) !== nm) : [];
  const variantHtml = variants.length ? `<div><div class="tiny muted strong" style="margin-bottom:6px">Try also</div><div class="chips">${variants.map(v => {
      const inList = state.items.some(i => normText(nameOf(i)) === normText(v));
      return `<button class="chip${inList ? ' on' : ''}" data-variant="${esc(v)}" ${inList ? 'disabled' : ''}>${inList ? '✓ ' : '+ '}${esc(v)}</button>`;
    }).join('')}</div><div class="tiny faint" style="margin-top:4px">Adds it as its own item so it gets its own cheapest store.</div></div>` : '';
  const hero = ch.pick ? `<div class="hero">${thumb(ch.pick, 96)}<div class="grow"><div class="row" style="gap:6px">${storeTag(ch.pick.storeId)}<span class="pill sale">${ch.why === 'picked' ? 'Your pick' : ch.why === 'locked' ? 'Store locked' : 'Cheapest'}</span></div>
      <div class="cand-name" style="margin-top:4px">${esc(ch.pick.name)}</div></div>${priceHtml(ch.pick, item.qty)}</div>` : '';
  const scrollTop = $('#sheet').scrollTop;
  $('#sheet').innerHTML = `<div class="sheet-grip"></div>
    <div class="row between"><h2 style="font-size:18px;text-transform:capitalize">${esc(nameOf(item))}</h2><button class="x-btn" data-close aria-label="Close">${ICON.x}</button></div>
    <div class="stack" style="margin-top:10px">
      ${hero}
      ${itemSheetExtras(item, ch)}
      <div class="row wrap" style="gap:12px">
        <label class="field grow">Item name<input type="text" id="sheetName" value="${esc(nameOf(item))}"></label>
        <label class="field" style="width:110px">Quantity<input type="number" id="sheetQty" min="1" max="99" value="${item.qty || 1}"></label>
      </div>
      <div class="row wrap" style="gap:12px">
        <label class="field grow">Always buy at<select id="sheetLock"><option value="">Cheapest store (auto)</option>${storeOpts}</select></label>
        <label class="field grow">Hide results containing<input type="text" id="sheetExclude" value="${esc(item.exclude || '')}" placeholder="e.g. chocolate, almond"></label>
      </div>
      <div class="row between wrap">
        <div class="seg" role="group" aria-label="Compare by"><button data-mode="price" class="${item.mode !== 'unit' ? 'on' : ''}">Sticker price</button><button data-mode="unit" class="${item.mode === 'unit' ? 'on' : ''}">Unit price</button></div>
        <div class="row">${item.pick ? `<button class="btn sm" data-unpick="${item.id}">Back to cheapest</button>` : ''}${nHidden ? `<button class="btn sm ghost" data-unhide="${item.id}">Show ${nHidden} hidden</button>` : ''}</div>
      </div>
      ${item.prefer ? `<div class="tiny muted">Your favourite is ranked first when it's on: <b>${esc(item.prefer.map(p => p.replace(/\\b|\\s\?/g, '')).join(' · '))}</b>. <button class="btn sm ghost" data-noprefer="${item.id}">Just show cheapest</button></div>` : ''}
      ${variantHtml}
      <div class="tiny muted">${ch.cands.length} match${ch.cands.length === 1 ? '' : 'es'} across ${new Set(ch.cands.map(c => c.storeId)).size} stores. Prices marked /lb are per pound. “Use” pins that exact product; “Hide” removes a wrong match.</div>
      <div>${body}</div>
    </div>`;
  $('#sheet').scrollTop = scrollTop;
}

// ----- settings -----
function renderSettings() {
  const s = state.settings;
  const toggle = st => `<div class="store-toggle"><span class="dot" style="background:${st.color};width:12px;height:12px"></span>
    <div class="grow"><div class="strong">${esc(st.name)}</div><div class="tiny muted">${esc(st.order)}</div></div>
    <label class="switch"><input type="checkbox" data-store="${st.id}" ${s.stores[st.id] ? 'checked' : ''}><span></span></label></div>`;
  return `<div class="section-title">Location</div>
  <div class="card pad stack">
    <form id="postalForm" class="row" style="align-items:flex-end">
      <label class="field grow">Postal code (flyers near you)<input id="postalInput" type="text" maxlength="7" value="${esc(fmtPostal(s.postal))}" autocapitalize="characters"></label>
      <button class="btn primary" type="submit">Save</button>
    </form>
  </div>
  <div class="section-title">Your stores</div>
  <div class="card pad">${STORES.filter(x => !x.extra).map(toggle).join('')}</div>
  <div class="section-title">More stores</div>
  <div class="card pad">${STORES.filter(x => x.extra).map(toggle).join('')}</div>
  <div class="section-title">Prices</div>
  <div class="card pad">
    <div class="store-toggle"><div class="grow"><div class="strong">Include online regular prices</div><div class="tiny muted">Regular prices from store websites (mostly Walmart). Used when an item isn't in any flyer this week; always shown in an item's details</div></div>
      <label class="switch"><input type="checkbox" data-setting="online" ${s.online ? 'checked' : ''}><span></span></label></div>
    <div class="store-toggle"><div class="grow"><div class="strong">Include flyers starting soon</div><div class="tiny muted">Next week's flyers once they're posted (marked “Starts …”)</div></div>
      <label class="switch"><input type="checkbox" data-setting="upcoming" ${s.upcoming ? 'checked' : ''}><span></span></label></div>
  </div>
  ${settingsExtras()}
  <div class="section-title">Your list data</div>
  <div class="card pad stack">
    <div class="small muted">Your list is saved on this device only. Use export/import to move it to another phone.</div>
    <div class="row wrap">
      <button class="btn" data-export>${ICON.copy} Copy list backup</button>
      <button class="btn" data-import>Paste backup…</button>
      <button class="btn" data-clearcache>Clear saved prices</button>
      <button class="btn danger" data-clearlist>Clear whole list</button>
    </div>
  </div>
  <p class="tiny faint" style="margin:16px 2px">Grocery List v${APP_VERSION}. Prices come from public flyer and online listings via Flipp and refresh every 6 hours (tap ↻ to force). Not affiliated with any store. Prices can differ in store — always check at checkout.</p>`;
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const t = e.target.closest('button, [data-open], a, [data-close]');
  if (!t) return;
  const d = t.dataset;
  if (t.matches('.tabs button')) { state.tab = d.tab; save(); closeSheet(); render(); window.scrollTo(0, 0); return; }
  if ('close' in d) return closeSheet();
  if (d.go) { state.tab = d.go; save(); render(); window.scrollTo(0, 0); return; }
  if (d.quick) return addItems(d.quick);
  if (d.variant) { addItems(d.variant); return renderSheet(); }
  if (d.open) return openSheet(d.open);
  if (d.inc || d.dec) {
    const it = findItem(d.inc || d.dec);
    it.qty = Math.max(1, Math.min(99, (it.qty || 1) + (d.inc ? 1 : -1)));
    save(); return render();
  }
  if (d.del) return removeItem(d.del);
  if (d.pick) {
    const it = findItem(d.item);
    const ch = chooseFor(it);
    it.pick = (ch.pick && ch.pick.key === d.pick && it.pick) ? null : d.pick;
    save(); render(); return toast(it.pick ? 'Pinned this product' : 'Back to cheapest');
  }
  if (d.hide) {
    const it = findItem(d.item);
    it.hidden = [...new Set([...(it.hidden || []), d.hide])];
    if (it.pick === d.hide) it.pick = null;
    save(); return render();
  }
  if (d.unhide) { const it = findItem(d.unhide); it.hidden = []; save(); return render(); }
  if (d.noprefer) { const it = findItem(d.noprefer); it.prefer = null; save(); return render(); }
  if (d.unpick) { const it = findItem(d.unpick); it.pick = null; save(); return render(); }
  if (d.mode) { const it = findItem(sheetItemId); it.mode = d.mode; it.pick = null; save(); return render(); }
  if (d.retry) { ensureResults(findItem(d.retry).q, true); return render(); }
  if (d.cmode) { compareMode = d.cmode; return render(); }
  if ('addcmp' in d) { addItems(compareQ); return; }
  if (d.skip) {
    const p = plan();
    (p.byStore[d.skip] || []).forEach(row => {
      const alt = row.cands.find(c => c.storeId !== d.skip && p.byStore[c.storeId]);
      if (alt) { row.item.lock = alt.storeId; row.item.pick = null; }
    });
    save(); render(); return toast(`Moved items off ${storeName(d.skip)}`);
  }
  if (d.copy || d.share) {
    const p = plan();
    const sid = d.copy || d.share;
    const text = storeListText(sid, p.byStore[sid] || []);
    if (d.share && navigator.share) { try { await navigator.share({ title: storeName(sid) + ' list', text }); } catch { /* cancelled */ } return; }
    return copyText(text, 'List copied');
  }
  if ('copyall' in d) {
    const p = plan();
    return copyText(p.order.map(sid => storeListText(sid, p.byStore[sid])).join('\n\n'), 'All lists copied');
  }
  if ('print' in d) return window.print();
  if ('cleardone' in d) {
    const before = state.items.slice();
    state.items = state.items.filter(i => !i.done);
    save(); render();
    return toastUndo(`Removed ${before.length - state.items.length} checked items`, () => { state.items = before; save(); render(); });
  }
  if ('export' in d) return copyText(JSON.stringify({ app: 'grocery-list', v: 1, items: state.items, settings: state.settings }), 'Backup copied — paste it into Notes or a message');
  if ('import' in d) {
    const txt = prompt('Paste your Grocery List backup:');
    if (!txt) return;
    try {
      const j = JSON.parse(txt);
      if (!Array.isArray(j.items)) throw new Error();
      state.items = j.items; if (j.settings) state.settings = Object.assign(defaultSettings(), j.settings);
      save(); loadAll(); render(); toast('List imported');
    } catch { toast("That doesn't look like a backup"); }
    return;
  }
  if ('clearcache' in d) { pruneCache(true); Object.keys(results).forEach(k => delete results[k]); loadAll(true); render(); return toast('Refreshing all prices'); }
  if ('clearlist' in d) {
    if (!confirm('Clear your whole grocery list?')) return;
    const before = state.items; state.items = []; save(); render();
    return toastUndo('List cleared', () => { state.items = before; save(); render(); });
  }
});

async function copyText(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg); }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(msg); } catch { toast('Copy failed'); }
    ta.remove();
  }
}

document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'addForm') {
    const inp = $('#addInput'); const v = inp.value; inp.value = '';
    if (v.trim()) addItems(v);
    setTimeout(() => { const i = $('#addInput'); if (i) i.focus(); }, 0);
  } else if (e.target.id === 'cmpForm') {
    compareQ = $('#cmpInput').value.trim(); compareExclude = '';
    if (compareQ) ensureResults(compareQ);
    render();
  } else if (e.target.id === 'postalForm') {
    const pc = cleanPostal($('#postalInput').value);
    if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(pc)) return toast('Enter a postal code like L1M 2E2');
    state.settings.postal = pc; save();
    Object.keys(results).forEach(k => delete results[k]);
    loadAll(); render(); toast('Location saved — refreshing prices');
  }
});

document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.store) { state.settings.stores[d.store] = t.checked; save(); return render(); }
  if (d.setting) { state.settings[d.setting] = t.checked; save(); return render(); }
  if (d.done) { const it = findItem(d.done); it.done = t.checked; save(); return render(); }
  if (d.lock) { const it = findItem(d.lock); it.lock = t.value || null; save(); return render(); }
  const item = findItem(sheetItemId);
  if (item) {
    if (t.id === 'sheetQty') { item.qty = Math.max(1, Math.min(99, parseInt(t.value, 10) || 1)); save(); return renderSoon(); }
    if (t.id === 'sheetLock') { item.lock = t.value || null; item.pick = null; save(); return renderSoon(); }
    if (t.id === 'sheetExclude') { item.exclude = t.value.trim(); save(); return renderSoon(); }
    if (t.id === 'sheetName') {
      const q = t.value.trim();
      if (q && q !== nameOf(item)) { item.q = q; item.label = null; item.loose = false; item.pick = null; item.hidden = []; ensureResults(q); save(); return renderSoon(); }
    }
  }
  if (t.id === 'cmpExclude') { compareExclude = t.value.trim(); return render(); }
});

// re-render a deferred sheet after the field loses focus — late enough that a tap on a button in the sheet still lands
document.addEventListener('focusout', () => { if (sheetDeferred) setTimeout(() => { if (sheetDeferred) renderSheet(); }, 400); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetMode) closeSheet(); });
$('#refreshBtn').addEventListener('click', () => { loadAll(true); toast('Refreshing prices'); render(); });

// ---------- boot ----------
pruneCache(false);
featuresInit();
render();
loadAll(false);
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
