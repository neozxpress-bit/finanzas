'use strict';

const APP_VERSION = '21';

/* =========================================================
   Finanzas — registro personal de gastos e ingresos
   Datos guardados localmente en IndexedDB.
   ========================================================= */

// ---------- Íconos y colores ----------
const ICONS = {
  heart: '❤️', home: '🏠', motorcycle: '🏍️', car: '🚗', family: '👨‍👩‍👧', sport: '⚽', present: '🎁',
  products: '🛒', education: '🎓', road: '👕', purse: '👛', transport: '🚌', drinks: '🍹', cafe: '☕',
  console: '🎮', pot: '🍲', crown: '👑', travels: '✈️', basket: '🧺', money: '💵', market: '🏪',
  cards: '💳', sale: '🏷️', building: '🏢', payment: '💰', bank: '🏦', tap: '🚰', bill: '🧾',
  prepaid: '🔁', runner: '🏃', school_alt: '🏫', other: '📦', electronics1: '💻', brush: '🖌️',
  croissant: '🥐', delivery: '🛵', graph: '📈', notebook: '📓', safe: '🔐', piggy_bank: '🐷',
  online_wallet: '👝', cash: '💵', zcash: '🪙', credit_card: '💳', bitcoin: '₿', phone: '📱',
  pet: '🐾', beauty: '💄', restaurant: '🍽️', fuel: '⛽', gift: '🎁', medicine: '💊', tools: '🛠️',
  music: '🎵', movie: '🎬', book: '📚', baby: '🍼', plant: '🪴', wifi: '📶', light: '💡', water: '💧',
  work: '💼', star: '⭐',
  deposit: '🐖', ethereum: '💎', parcel: '📦', rent: '🔑', shovel: '⛏️', toilet: '🚽'
};
const ICON_KEYS = Object.keys(ICONS);
const COLORS = ['#f63535', '#ff2aaa', '#a788d6', '#4e1685', '#3b4de8', '#2e78cf', '#4895dd', '#0478ff',
  '#35cdbb', '#41bca8', '#258877', '#044b40', '#00950f', '#00bd12', '#67af45', '#f1cc06',
  '#e9b90b', '#ec8207', '#b24a01', '#cc0101', '#819199', '#888888', '#2f3c42', '#242424'];

const DEFAULT_CAT_NAMES = {
  DefaultHealth: 'Salud', DefaultHome: 'Hogar', DefaultFamily: 'Familia', DefaultSport: 'Deportes',
  DefaultPresents: 'Regalos', DefaultProducts: 'Comestibles', DefaultEducation: 'Educación',
  DefaultLeisure: 'Ocio', DefaultTransport: 'Transporte', DefaultCafe: 'Café', other_expense: 'Otros',
  DefaultSalary: 'Salario', DefaultPresent: 'Regalos', DefaultPercents: 'Intereses', other_income: 'Otros'
};

function defaultState() {
  const c = (id, name, type, icon, color, position) => ({ id, name, type, icon, color, limit: 0, position, archived: false });
  return {
    version: 1,
    currency: 'CLP',
    accounts: [{ id: 'main', name: 'Personal', icon: 'cash', color: '#1f8a70', ignoreInBalance: false, archived: false, position: 0 }],
    categories: [
      c('DefaultHealth', 'Salud', 'expense', 'heart', '#f63535', 0),
      c('DefaultHome', 'Hogar', 'expense', 'home', '#00950f', 1),
      c('DefaultFamily', 'Familia', 'expense', 'family', '#3b4de8', 2),
      c('DefaultProducts', 'Comestibles', 'expense', 'products', '#4e1685', 3),
      c('DefaultCafe', 'Café', 'expense', 'cafe', '#a788d6', 4),
      c('DefaultTransport', 'Transporte', 'expense', 'transport', '#2e78cf', 5),
      c('DefaultLeisure', 'Ocio', 'expense', 'purse', '#41bca8', 6),
      c('DefaultEducation', 'Educación', 'expense', 'education', '#4895dd', 7),
      c('DefaultPresents', 'Regalos', 'expense', 'present', '#ff2aaa', 8),
      c('DefaultSport', 'Deportes', 'expense', 'sport', '#f1cc06', 9),
      c('other_expense', 'Otros', 'expense', 'other', '#888888', 10),
      c('DefaultSalary', 'Salario', 'income', 'money', '#819199', 0),
      c('DefaultPresent', 'Regalos', 'income', 'present', '#db4d87', 1),
      c('other_income', 'Otros', 'income', 'other', '#67af45', 2)
    ],
    transactions: [],
    transfers: []
  };
}

// ---------- Almacenamiento (IndexedDB) ----------
const DB = {
  _db: null,
  open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('finanzas', 2);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos'); // id → { blob, type }
      };
      r.onsuccess = () => { this._db = r.result; res(r.result); };
      r.onerror = () => rej(r.error);
    });
  },
  async get(key) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const r = db.transaction('kv').objectStore('kv').get(key);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  },
  async set(key, value) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  // ----- Fotos -----
  async photoTx(mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('photos', mode);
      const out = fn(tx.objectStore('photos'));
      tx.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
      tx.onerror = () => rej(tx.error);
    });
  },
  getPhoto(id) { return this.photoTx('readonly', (st) => st.get(id)); },
  putPhotos(entries) { return this.photoTx('readwrite', (st) => { for (const [id, rec] of entries) st.put(rec, id); }); },
  deletePhotos(ids) { window.onPhotosDeleted?.(ids); return this.photoTx('readwrite', (st) => { for (const id of ids) st.delete(id); }); },
  clearPhotos() { return this.photoTx('readwrite', (st) => { st.clear(); }); },
  photoKeys() { return this.photoTx('readonly', (st) => st.getAllKeys()); }
};

// URLs de fotos ya cargadas (id → blob: URL)
const photoURLs = new Map();
async function photoURL(id) {
  if (photoURLs.has(id)) return photoURLs.get(id);
  let rec = await DB.getPhoto(id).catch(() => null);
  if (!rec) rec = await window.fetchRemotePhoto?.(id).catch(() => null); // bajar de la nube
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  photoURLs.set(id, url);
  return url;
}
function forgetPhotoURL(id) { const u = photoURLs.get(id); if (u) URL.revokeObjectURL(u); photoURLs.delete(id); }

// Reduce la foto (máx. 1600 px, JPEG) para no llenar el teléfono
async function compressImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

const extFromType = (t) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'image/webp': 'webp' }[t] || 'jpg');
const typeFromName = (n) => ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', webp: 'image/webp' }[String(n).split('.').pop().toLowerCase()] || 'image/jpeg');

let S = null; // estado persistente
const UI = { tab: 'home', type: 'expense', period: 'month', anchor: new Date(), account: 'all', search: '', catFilter: null, tagFilter: null, open: new Set(), from: null, to: null };

async function save() {
  await DB.set('state', S);
  window.onStateSaved?.(); // sincronización (sync.js)
}

// ---------- Utilidades ----------
const $ = (sel, el = document) => el.querySelector(sel);
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad2 = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
// Ícono desconocido: si ya es un emoji se muestra tal cual; si es un nombre, un ícono genérico
const icon = (key) => ICONS[key] || (key && /\p{Extended_Pictographic}/u.test(key) ? key : '🏷️');

function currencySymbol() { return S.currency === 'CLP' ? 'CLP$' : S.currency; }
function money(n, { sign = false } = {}) {
  const dec = S.currency === 'CLP' ? 0 : 2;
  const s = Math.abs(n).toLocaleString('es-CL', { minimumFractionDigits: 0, maximumFractionDigits: dec }) + ' ' + currencySymbol();
  if (!sign) return (n < 0 ? '−' : '') + s;
  return (n < 0 ? '−' : n > 0 ? '+' : '') + s;
}
// Monto corto para filas: "245.200" o "3,1 M"
function short(n) {
  const a = Math.abs(n);
  const v = a >= 1e6 ? (a / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' M'
    : a.toLocaleString('es-CL', { maximumFractionDigits: S.currency === 'CLP' ? 0 : 2 });
  return (n < 0 ? '−' : '') + v;
}
// Formato abreviado como la app original: 24,8 MCLP$
function compact(n) {
  if (Math.abs(n) < 1e6) return money(n);
  const v = (Math.abs(n) / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 });
  return (n < 0 ? '−' : '') + v + ' M' + currencySymbol();
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2600);
}

const catById = (id) => S.categories.find((c) => c.id === id);
const accById = (id) => S.accounts.find((a) => a.id === id);

// ---------- Periodos ----------
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function periodRange(period = UI.period, anchor = UI.anchor) {
  const a = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (period === 'day') return [a, a];
  if (period === 'week') {
    const s = new Date(a); s.setDate(a.getDate() - ((a.getDay() + 6) % 7));
    const e = new Date(s); e.setDate(s.getDate() + 6);
    return [s, e];
  }
  if (period === 'month') return [new Date(a.getFullYear(), a.getMonth(), 1), new Date(a.getFullYear(), a.getMonth() + 1, 0)];
  if (period === 'year') return [new Date(a.getFullYear(), 0, 1), new Date(a.getFullYear(), 11, 31)];
  if (period === 'custom' && UI.from && UI.to) return [parseDate(UI.from), parseDate(UI.to)];
  return [null, null];
}

function shortDate(d, withYear) {
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined });
}

function periodLabel() {
  const [s, e] = periodRange();
  const a = UI.anchor;
  switch (UI.period) {
    case 'day': return a.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
    case 'week': return `${shortDate(s)} – ${shortDate(e, true)}`;
    case 'month': return `${MONTHS[a.getMonth()]} de ${a.getFullYear()}`;
    case 'year': return String(a.getFullYear());
    case 'custom': return s ? `${shortDate(s, true)} – ${shortDate(e, true)}` : 'Elegir período';
    default: return 'Todo el tiempo';
  }
}

function shiftPeriod(dir) {
  const a = new Date(UI.anchor);
  if (UI.period === 'day') a.setDate(a.getDate() + dir);
  if (UI.period === 'week') a.setDate(a.getDate() + 7 * dir);
  if (UI.period === 'month') { a.setDate(1); a.setMonth(a.getMonth() + dir); }
  if (UI.period === 'year') a.setFullYear(a.getFullYear() + dir);
  UI.anchor = a;
  render();
}

// No avanzar más allá del periodo actual (como la app original)
function isCurrentOrFuture() {
  const [, e] = periodRange();
  return !e || isoDate(e) >= isoDate(new Date());
}

function inPeriod(dateStr) {
  const [s, e] = periodRange();
  if (!s) return true;
  return dateStr >= isoDate(s) && dateStr <= isoDate(e);
}

// ---------- Cálculos ----------
function accountBalance(id) {
  let b = 0;
  for (const t of S.transactions) if (t.accountId === id) b += t.type === 'income' ? t.amount : -t.amount;
  for (const t of S.transfers) {
    if (t.fromId === id) b -= t.amount;
    if (t.toId === id) b += t.toAmount ?? t.amount;
  }
  return b;
}

function totalBalance() {
  if (UI.account !== 'all') return accountBalance(UI.account);
  return S.accounts.filter((a) => !a.ignoreInBalance && !a.archived).reduce((s, a) => s + accountBalance(a.id), 0);
}

function filteredTx({ type = null, cat = null, tag = null, search = '' } = {}) {
  const q = search.trim().toLowerCase();
  return S.transactions.filter((t) =>
    inPeriod(t.date) &&
    (UI.account === 'all' || t.accountId === UI.account) &&
    (!type || (t.type === type && !t.adjust)) &&
    (!cat || t.categoryId === cat) &&
    (!tag || (tag === NO_TAG ? !(t.tags || []).length : (t.tags || []).includes(tag))) &&
    (!q || (t.note || '').toLowerCase().includes(q) || (t.tags || []).some((g) => g.toLowerCase().includes(q)) ||
      (catById(t.categoryId)?.name || '').toLowerCase().includes(q) || String(t.amount).includes(q))
  );
}

// ---------- Componentes ----------
const SVG = {
  menu: '<svg viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18" stroke-linecap="round"/></svg>',
  receipt: '<svg viewBox="0 0 24 24"><path d="M6 2.5h12v19l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3z"/><path d="M9 7h6M9 10.5h6M9 14h6" stroke-linecap="round"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v16M4 12h16" stroke-linecap="round"/></svg>',
  chev: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  calc: '<svg viewBox="0 0 24 24" class="line-ico"><rect x="4.5" y="2.5" width="15" height="19" rx="2"/><rect x="7.5" y="5.5" width="9" height="4" rx=".6"/><path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01M16 16.5h.01M8 20h.01M12 20h.01M16 20h.01" stroke-width="2.4" stroke-linecap="round"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" class="line-ico"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke-linecap="round"/><path d="M7.5 13h.01M12 13h.01M16.5 13h.01M7.5 16.5h.01M12 16.5h.01M16.5 16.5h.01" stroke-width="2.4" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" class="line-ico"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21" stroke-linecap="round"/></svg>'
};
const NO_TAG = '\u0000sin-etiqueta';

function fabHtml(cls = '') {
  return `<button class="fab ${cls}" data-role="add" aria-label="Agregar">${SVG.plus}</button>`;
}

function periodControls() {
  const opts = [['day', 'Día'], ['week', 'Semana'], ['month', 'Mes'], ['year', 'Año'], ['custom', 'Período']];
  return `
    <div class="period-tabs" data-role="period">
      ${opts.map(([v, l]) => `<button data-v="${v}" class="${UI.period === v ? 'active' : ''}">${l}</button>`).join('')}
    </div>
    <div class="period-nav">
      <button class="arrow" data-shift="-1" ${UI.period === 'custom' || UI.period === 'all' ? 'disabled' : ''}>‹</button>
      <button class="label" data-role="period-label">${esc(periodLabel())}</button>
      <button class="arrow" data-shift="1" ${UI.period === 'custom' || UI.period === 'all' || isCurrentOrFuture() ? 'disabled' : ''}>›</button>
    </div>`;
}

function accountOptions() {
  const accs = S.accounts.filter((a) => !a.archived).sort((a, b) => a.position - b.position);
  return `<option value="all">Total</option>` +
    accs.map((a) => `<option value="${a.id}" ${UI.account === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('');
}

function accountPicker() {
  const a = UI.account !== 'all' && accById(UI.account);
  return `<button class="acct-picker" data-role="pick-account"><span>${a ? icon(a.icon) : '💰'}</span><span class="ellipsis">${esc(a ? a.name : 'Total')}</span><span class="caret">▼</span></button>`;
}

function pageHead(title) {
  return `<header class="page-head"><div class="wrap hero-top">
      <span></span><h1>${title}</h1><span></span>
    </div></header>`;
}

function iconBubble(key, color, cls = '') {
  return `<span class="icon ${cls}" style="background:${color}">${icon(key)}</span>`;
}

function donut(slices, total) {
  const r = 40, C = 2 * Math.PI * r;
  let off = 0;
  const gap = slices.length > 1 ? 0.5 : 0;
  const arcs = slices.map((s) => {
    const len = (s.value / total) * C;
    const seg = `<circle r="${r}" cx="50" cy="50" fill="none" stroke="${s.color}" stroke-width="16"
      stroke-dasharray="${Math.max(len - gap, 0.05)} ${C}" stroke-dashoffset="${-off}"></circle>`;
    off += len;
    return seg;
  }).join('');
  const bg = slices.length ? '' : `<circle r="${r}" cx="50" cy="50" fill="none" stroke="var(--card-2)" stroke-width="16"></circle>`;
  return `<svg viewBox="0 0 100 100">${bg}${arcs}
    <circle r="29" cx="50" cy="50" fill="none" stroke="#5b5d55" stroke-width="1" stroke-dasharray="2.2 1.6"></circle></svg>`;
}

function hbar(slices, total) {
  if (!slices.length) return `<div class="hbar"></div>`;
  return `<div class="hbar">${slices.map((s) => `<i style="flex:${s.value / total};background:${s.color}"></i>`).join('')}</div>`;
}

function categoryRows(type) {
  const tx = filteredTx({ type });
  const total = tx.reduce((s, t) => s + t.amount, 0);
  const map = new Map();
  for (const t of tx) {
    let r = map.get(t.categoryId);
    if (!r) map.set(t.categoryId, (r = { value: 0, tags: new Map(), untagged: 0 }));
    r.value += t.amount;
    if ((t.tags || []).length) for (const g of t.tags) r.tags.set(g, (r.tags.get(g) || 0) + t.amount);
    else r.untagged += t.amount;
  }
  const rows = [...map.entries()].map(([id, r]) => ({
    c: catById(id) || { id, name: 'Sin categoría', icon: 'other', color: '#888888', limit: 0 }, ...r
  })).sort((a, b) => b.value - a.value);
  return { rows, total };
}

// ---------- Vistas ----------
function viewHome() {
  const { rows, total } = categoryRows(UI.type);
  const slices = rows.map((r) => ({ value: r.value, color: r.c.color }));
  const kind = UI.type === 'expense' ? 'gastos' : 'ingresos';

  $('#mini').innerHTML = `<div class="inner">
      <div class="label">${esc(periodLabel())}</div>
      ${hbar(slices, total || 1)}${fabHtml()}
      <div class="total num">${compact(total)}</div>
    </div>`;

  return `
    <header class="hero"><div class="wrap">
      <div class="hero-top">
        <span></span>
        ${accountPicker()}
        <button class="icon-btn" data-go="list" aria-label="Movimientos">${SVG.receipt}</button>
      </div>
      <button class="hero-balance num" data-role="edit-balance" aria-label="Editar saldo">${money(totalBalance())} <span class="pencil">✏️</span></button>
      <div class="type-tabs" data-role="type">
        <button data-v="expense" class="${UI.type === 'expense' ? 'active' : ''}">GASTOS</button>
        <button data-v="income" class="${UI.type === 'income' ? 'active' : ''}">INGRESOS</button>
      </div>
    </div></header>

    <div class="wrap">
      <section class="card chart-card">
        ${periodControls()}
        <div class="donut-wrap">
          ${donut(slices, total || 1)}
          <div class="donut-center"><div class="t num">${compact(total)}</div></div>
        </div>
        ${fabHtml()}
      </section>

      <div class="cat-list">
        ${rows.length ? rows.map(({ c, value, tags, untagged }) => {
          const pct = total ? Math.round((value / total) * 100) : 0;
          const open = UI.open.has(c.id);
          const limitBar = c.limit && UI.type === 'expense' && UI.period === 'month'
            ? `<div style="padding:0 16px 12px"><div class="bar"><i style="width:${Math.min(100, (value / c.limit) * 100)}%;background:${value > c.limit ? 'var(--expense)' : c.color}"></i></div>
               <div class="small muted" style="margin-top:4px">${money(value)} de ${money(c.limit)}</div></div>` : '';
          const sub = open ? `<div class="cat-sub">
              ${[...tags.entries()].sort((a, b) => b[1] - a[1]).map(([g, v]) =>
                `<button data-open-cat="${c.id}" data-tag="${esc(g)}"><span class="hash">#</span><span class="grow ellipsis">${esc(g)}</span><span class="num">${money(v)}</span></button>`).join('')}
              ${untagged && tags.size ? `<button data-open-cat="${c.id}" data-tag="${NO_TAG}"><span class="hash"></span><span class="grow ellipsis muted">Sin etiqueta</span><span class="num">${money(untagged)}</span></button>` : ''}
              <button class="see" data-open-cat="${c.id}">Ver movimientos ›</button>
            </div>` : '';
          return `<div class="cat-row ${open ? 'open' : ''}">
            <button class="cat-head" data-toggle-cat="${c.id}">
              ${iconBubble(c.icon, c.color)}
              <span class="name">${esc(c.name)}</span>
              <span class="pct">${pct} %</span>
              <span class="amt num">${short(value)}</span>
              <span class="chev">${SVG.chev}</span>
            </button>${limitBar}${sub}
          </div>`;
        }).join('') : `<div class="empty">No hay ${kind} en este período.<br>Toca <b>+</b> para agregar.</div>`}
      </div>
    </div>`;
}

function viewList() {
  const tx = filteredTx({ cat: UI.catFilter, tag: UI.tagFilter, search: UI.search }).map((t) => ({ kind: 'tx', ...t }));
  const q = UI.search.trim().toLowerCase();
  const tr = UI.catFilter || UI.tagFilter ? [] : S.transfers.filter((t) =>
    inPeriod(t.date) && (UI.account === 'all' || t.fromId === UI.account || t.toId === UI.account) &&
    (!q || (t.note || '').toLowerCase().includes(q))
  ).map((t) => ({ kind: 'tr', ...t }));
  const items = [...tx, ...tr].sort((a, b) => (b.date + (b.created || '')).localeCompare(a.date + (a.created || '')));

  const groups = new Map();
  for (const it of items) { if (!groups.has(it.date)) groups.set(it.date, []); groups.get(it.date).push(it); }
  const limited = [...groups.entries()].slice(0, 120);

  const fc = UI.catFilter && catById(UI.catFilter);
  const inc = tx.filter((t) => t.type === 'income' && !t.adjust).reduce((s, t) => s + t.amount, 0);
  const exp = tx.filter((t) => t.type === 'expense' && !t.adjust).reduce((s, t) => s + t.amount, 0);

  return `
    ${pageHead('Movimientos')}
    <div class="wrap">
      <input class="search" type="search" placeholder="Buscar nota, etiqueta, categoría o monto" value="${esc(UI.search)}" data-role="search">
      <div>
        <button class="filter-chip" data-role="pick-account">${esc(UI.account === 'all' ? 'Todas las cuentas' : accById(UI.account)?.name)} ▾</button>
        ${fc ? `<button class="filter-chip" data-role="clear-cat">${icon(fc.icon)} ${esc(fc.name)} ✕</button>` : ''}
        ${UI.tagFilter ? `<button class="filter-chip" data-role="clear-tag"># ${esc(UI.tagFilter === NO_TAG ? 'Sin etiqueta' : UI.tagFilter)} ✕</button>` : ''}
      </div>
      <div class="card list-period">${periodControls()}
        <div class="row small" style="justify-content:center;gap:18px;padding-top:6px">
          <span class="muted">Ingresos <b class="income num">${money(inc)}</b></span>
          <span class="muted">Gastos <b class="expense num">${money(exp)}</b></span>
        </div>
      </div>
      ${limited.length ? limited.map(([date, list]) => {
        const net = list.reduce((s, t) => s + (t.kind === 'tx' ? (t.type === 'income' ? t.amount : -t.amount) : 0), 0);
        const d = parseDate(date);
        return `<div class="day-head"><span>${d.getDate()} de ${MONTHS[d.getMonth()]} de ${d.getFullYear()} (${d.toLocaleDateString('es-CL', { weekday: 'short' }).replace('.', '')})</span>
          <span class="num">${money(net, { sign: true })}</span></div>
          <div class="card list">${list.map(rowHtml).join('')}</div>`;
      }).join('') : `<div class="empty">Sin movimientos para mostrar.</div>`}
      ${groups.size > 120 ? `<div class="empty small">Mostrando los 120 días más recientes. Cambia el período para ver más.</div>` : ''}
      <div style="height:80px"></div>
    </div>
    ${fabHtml('floating')}`;
}

function rowHtml(t) {
  if (t.kind === 'tr') {
    const f = accById(t.fromId), to = accById(t.toId);
    return `<button class="item" data-edit-tr="${t.id}">
      <span class="icon" style="background:#819199">⇄</span>
      <div class="grow"><div class="ellipsis">Transferencia</div>
        <div class="small muted ellipsis">${esc(f?.name || '?')} → ${esc(to?.name || '?')}${t.note ? ' · ' + esc(t.note) : ''}</div></div>
      <div class="num">${money(t.amount)}</div>
    </button>`;
  }
  const c = t.adjust ? ADJUST_CAT : catById(t.categoryId) || { name: 'Sin categoría', icon: 'other', color: '#888' };
  const a = accById(t.accountId);
  const tags = t.tags || [];
  return `<button class="tx" data-edit-tx="${t.id}">
    <div class="tx-main">
      <span class="tx-icon">${iconBubble(c.icon, c.color)}${(t.photos || []).length || t.hasPhoto ? '<span class="badge">📷</span>' : ''}</span>
      <span class="tx-cat">${esc(c.name)}</span>
      <span class="tx-amt num ${t.type}">${t.type === 'income' ? '+' : ''}${money(t.amount)}</span>
    </div>
    ${tags.length ? `<div class="tx-tags">${tags.map((g) => `<span>${esc(g)}</span>`).join('')}</div>` : ''}
    ${t.note ? `<div class="tx-note">${esc(t.note)}</div>` : ''}
    ${UI.account === 'all' && a ? `<div class="tx-acc">${icon(a.icon)} ${esc(a.name)}</div>` : ''}
  </button>`;
}

function viewAccounts() {
  const accs = [...S.accounts].sort((a, b) => a.archived - b.archived || a.position - b.position);
  const total = S.accounts.filter((a) => !a.ignoreInBalance && !a.archived).reduce((s, a) => s + accountBalance(a.id), 0);
  return `
    ${pageHead('Cuentas')}
    <div class="wrap">
      <div class="card pad" style="margin-top:16px;text-align:center">
        <div class="muted small">Total</div>
        <div class="num" style="font-size:30px;font-weight:700">${money(total)}</div>
        <div class="small muted">Sin contar cuentas excluidas del total</div>
      </div>
      <div class="btn-row">
        <button class="btn secondary" data-role="new-transfer">⇄ Transferir</button>
        <button class="btn secondary" data-role="new-account">＋ Nueva cuenta</button>
      </div>
      <h2>Mis cuentas</h2>
      <div class="card list">
        ${accs.map((a) => {
          const b = accountBalance(a.id);
          return `<button class="item" data-edit-acc="${a.id}" style="${a.archived ? 'opacity:.5' : ''}">
            ${iconBubble(a.icon, a.color)}
            <div class="grow"><div class="ellipsis">${esc(a.name)}</div>
              <div class="small muted">${a.archived ? 'Archivada' : a.ignoreInBalance ? 'No se suma al total' : 'Se suma al total'}</div></div>
            <div class="num ${b < 0 ? 'expense' : ''}">${money(b)}</div>
          </button>`;
        }).join('')}
      </div>
    </div>`;
}

function viewMore() {
  const counts = `${S.transactions.length} movimientos · ${S.accounts.length} cuentas · ${S.categories.length} categorías`;
  return `
    ${pageHead('Ajustes y datos')}
    <div class="wrap">
      ${window.syncSectionHtml?.() || ''}
      <h2>Organización</h2>
      <div class="card list">
        <button class="item" data-role="cats" data-v="expense"><span class="icon sm" style="background:#c0392b">▾</span><div class="grow">Categorías de gastos</div><span class="muted">›</span></button>
        <button class="item" data-role="cats" data-v="income"><span class="icon sm" style="background:#27ae60">▴</span><div class="grow">Categorías de ingresos</div><span class="muted">›</span></button>
        <div class="field"><label>Moneda</label>
          <select data-role="currency">${['CLP', 'USD', 'EUR', 'ARS', 'PEN', 'COP', 'MXN', 'BRL'].map((c) => `<option ${S.currency === c ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </div>
      </div>

      <h2>Datos</h2>
      <div class="card list">
        <label class="item" style="cursor:pointer"><span class="icon sm" style="background:#3b4de8">⤓</span>
          <div class="grow">Importar desde Gestor de Gastos<div class="small muted">Copia .mmbackup o archivo MyFinance.db</div></div>
          <input type="file" data-role="import-mm" hidden></label>
        <label class="item" style="cursor:pointer"><span class="icon sm" style="background:#ec8207">📷</span>
          <div class="grow">Recuperar fotos de Gestor de Gastos<div class="small muted">Agrega las fotos de una copia .mmbackup sin cambiar tus datos</div></div>
          <input type="file" data-role="import-photos" hidden></label>
        <label class="item" style="cursor:pointer"><span class="icon sm" style="background:#12b857">＋</span>
          <div class="grow">Agregar movimientos desde archivo<div class="small muted">Suma movimientos sin borrar ni duplicar los que ya tienes</div></div>
          <input type="file" accept=".json,application/json" data-role="import-add" hidden></label>
        <button class="item" data-role="export-json"><span class="icon sm" style="background:#1f8a70">⤒</span>
          <div class="grow">Exportar copia de seguridad<div class="small muted">Todos tus datos y fotos (.json o .zip)</div></div></button>
        <label class="item" style="cursor:pointer"><span class="icon sm" style="background:#258877">↺</span>
          <div class="grow">Restaurar copia de seguridad<div class="small muted">Desde un archivo .json o .zip exportado</div></div>
          <input type="file" accept=".json,.zip,application/json,application/zip" data-role="import-json" hidden></label>
        <button class="item" data-role="export-csv"><span class="icon sm" style="background:#ec8207">▦</span>
          <div class="grow">Exportar a Excel (CSV)</div></button>
        <button class="item" data-role="wipe"><span class="icon sm" style="background:#c0392b">✕</span>
          <div class="grow expense">Borrar todos los datos</div></button>
      </div>
      <div class="card list" style="margin-top:18px">
        <button class="item" data-role="update-app"><span class="icon sm" style="background:#12b857">⟳</span>
          <div class="grow">Buscar actualización<div class="small muted">Versión ${APP_VERSION}</div></div></button>
      </div>
      <p class="small muted" style="text-align:center;margin-top:18px">${counts}<br>Tus datos se guardan solo en este dispositivo.</p>
    </div>`;
}

// ---------- Diálogo de selección de cuenta ----------
function openAccountDialog() {
  let sel = UI.account;
  const accs = S.accounts.filter((a) => !a.archived).sort((a, b) => a.position - b.position);
  const total = S.accounts.filter((a) => !a.ignoreInBalance && !a.archived).reduce((s, a) => s + accountBalance(a.id), 0);
  const opts = [{ id: 'all', name: 'Total', icon: '💰', color: '#0c3a22', bal: total }]
    .concat(accs.map((a) => ({ id: a.id, name: a.name, icon: icon(a.icon), color: a.color, bal: accountBalance(a.id) })));
  const el = document.createElement('div');
  el.className = 'dialog-backdrop';
  const draw = () => {
    el.innerHTML = `<div class="dialog" role="dialog" aria-label="Seleccione una cuenta">
      <h3>Seleccione una cuenta</h3>
      <div class="opts">${opts.map((o) => `<button class="opt ${o.id === sel ? 'sel' : ''}" data-id="${o.id}">
        <span class="radio"></span><span class="icon" style="background:${o.color}">${o.icon}</span>
        <span class="grow"><div class="name">${esc(o.name)}</div><div class="bal num ${o.bal < 0 ? 'neg' : ''}">${money(o.bal)}</div></span>
      </button>`).join('')}</div>
      <div class="actions"><button data-a="cancel">CANCELAR</button><button data-a="ok">SELECCIONAR</button></div>
    </div>`;
  };
  draw();
  document.body.appendChild(el);
  const y = opts.findIndex((o) => o.id === sel);
  if (y > 3) el.querySelector('.opt.sel')?.scrollIntoView({ block: 'center' });
  el.addEventListener('click', (e) => {
    if (e.target === el) return el.remove();
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.id) {
      const opts2 = el.querySelector('.opts'); const st = opts2.scrollTop;
      sel = b.dataset.id; draw(); el.querySelector('.opts').scrollTop = st;
      return;
    }
    if (b.dataset.a === 'cancel') return el.remove();
    if (b.dataset.a === 'ok') { UI.account = sel; el.remove(); render(); }
  });
}

// ---------- Menú lateral ----------
function openDrawer() {
  const items = [['home', '◔', 'Inicio'], ['list', '🧾', 'Movimientos'], ['accounts', '👛', 'Cuentas'], ['cats', '🏷️', 'Categorías'], ['more', '⚙️', 'Ajustes y datos']];
  const d = $('#drawer');
  d.innerHTML = `<div class="brand"><img src="icon-192.png" alt="">Finanzas</div>` +
    items.map(([k, i, l]) => `<button data-drawer="${k}" class="${UI.tab === k ? 'active' : ''}"><span>${i}</span>${l}</button>`).join('');
  d.hidden = false; $('#drawer-backdrop').hidden = false;
}
function closeDrawer() { $('#drawer').hidden = true; $('#drawer-backdrop').hidden = true; }
$('#drawer-backdrop').addEventListener('click', closeDrawer);
$('#drawer').addEventListener('click', (e) => {
  const b = e.target.closest('[data-drawer]'); if (!b) return;
  closeDrawer();
  if (b.dataset.drawer === 'cats') return openCategories(UI.type);
  go(b.dataset.drawer);
});

function go(tab) { UI.tab = tab; window.scrollTo(0, 0); render(); }

function openCustomPeriod() {
  const [s0, e0] = periodRange('month');
  openSheet(`
    <div class="sheet-head"><button data-a="cancel">Cancelar</button><h3>Elegir período</h3><button data-a="ok">Listo</button></div>
    <div class="card list">
      <div class="field"><label>Desde</label><input type="date" data-f="from" value="${UI.from || isoDate(s0)}"></div>
      <div class="field"><label>Hasta</label><input type="date" data-f="to" value="${UI.to || isoDate(e0)}"></div>
    </div>
    <button class="btn secondary" data-a="all" style="margin-top:12px">Todo el tiempo</button>`,
  (sh) => {
    sh.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'cancel') return closeSheet();
      if (b.dataset.a === 'all') { UI.period = 'all'; closeSheet(); return render(); }
      if (b.dataset.a === 'ok') {
        let f = $('[data-f="from"]', sh).value, t = $('[data-f="to"]', sh).value;
        if (!f || !t) return toast('Elige ambas fechas');
        if (f > t) [f, t] = [t, f];
        UI.from = f; UI.to = t; UI.period = 'custom';
        closeSheet(); render();
      }
    };
  });
}

// ---------- Render ----------
function render() {
  const v = $('#view');
  v.innerHTML = { home: viewHome, list: viewList, accounts: viewAccounts, more: viewMore }[UI.tab]();
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.go === UI.tab));
  updateMini();
}

function updateMini() {
  const d = UI.tab === 'home' && $('.donut-wrap');
  $('#mini').classList.toggle('show', !!d && d.getBoundingClientRect().bottom < 40);
}
window.addEventListener('scroll', updateMini, { passive: true });

// Deslizar a izquierda/derecha = tocar la flecha ‹ o › (Inicio y Movimientos)
(function swipe() {
  let x0 = null, y0 = null, horizontal = null;
  const canSwipe = (el) => (UI.tab === 'home' || UI.tab === 'list') && $('#sheet').hidden &&
    !el.closest('#sheet, .dialog-backdrop, input, select, textarea, .tabbar');
  document.addEventListener('touchstart', (e) => {
    x0 = null;
    if (e.touches.length !== 1 || !canSwipe(e.target)) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; horizontal = null;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (x0 === null || horizontal !== null) return;
    const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) horizontal = Math.abs(dx) > Math.abs(dy);
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (horizontal === false || Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return;
    // Izquierda = siguiente (›), derecha = anterior (‹): exactamente como tocar la flecha
    const arrow = $(`.period-nav .arrow[data-shift="${dx < 0 ? 1 : -1}"]`);
    if (arrow && !arrow.disabled) arrow.click();
  }, { passive: true });
})();

// Delegación de eventos en la vista principal
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-role]');
  if (!t || t.closest('#sheet, #drawer')) return;

  if (t.dataset.role === 'menu') return openDrawer();
  if (t.dataset.go) return go(t.dataset.go);
  if (t.dataset.role === 'add') return openTx(null, UI.type);
  if (t.dataset.role === 'pick-account') return openAccountDialog();

  const grp = t.parentElement;
  if (grp && t.dataset.v && grp.dataset.role === 'period') {
    if (t.dataset.v === 'custom') return openCustomPeriod();
    UI.period = t.dataset.v; UI.anchor = new Date();
    return render();
  }
  if (grp && t.dataset.v && grp.dataset.role === 'type') { UI.type = t.dataset.v; UI.open.clear(); return render(); }
  if (t.dataset.role === 'period-label') {
    if (UI.period === 'custom' || UI.period === 'all') return openCustomPeriod();
    UI.anchor = new Date(); return render();
  }
  if (t.dataset.shift) return shiftPeriod(Number(t.dataset.shift));
  if (t.dataset.toggleCat) {
    const id = t.dataset.toggleCat;
    UI.open.has(id) ? UI.open.delete(id) : UI.open.add(id);
    return render();
  }
  if (t.dataset.openCat) {
    UI.catFilter = t.dataset.openCat; UI.tagFilter = t.dataset.tag ?? null; UI.search = '';
    return go('list');
  }
  if (t.dataset.role === 'clear-cat') { UI.catFilter = null; return render(); }
  if (t.dataset.role === 'clear-tag') { UI.tagFilter = null; return render(); }
  if (t.dataset.editTx) {
    const tx = S.transactions.find((x) => x.id === t.dataset.editTx);
    return tx?.adjust ? openBalanceEditor(tx.accountId, tx) : openTx(tx);
  }
  if (t.dataset.role === 'edit-balance') return UI.account === 'all' ? pickAccountToAdjust() : openBalanceEditor(UI.account);
  if (t.dataset.editTr) return openTransfer(S.transfers.find((x) => x.id === t.dataset.editTr));
  if (t.dataset.editAcc) return openAccount(accById(t.dataset.editAcc));
  if (t.dataset.role === 'new-account') return openAccount();
  if (t.dataset.role === 'new-transfer') return openTransfer();
  if (t.dataset.role === 'cats') return openCategories(t.dataset.v);
  if (t.dataset.role === 'export-json') return exportJSON();
  if (t.dataset.role === 'export-csv') return exportCSV();
  if (t.dataset.role === 'wipe') return wipe();
  if (t.dataset.role === 'update-app') return updateApp();
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.closest('#sheet')) return;
  if (t.dataset.role === 'account') { UI.account = t.value; render(); }
  if (t.dataset.role === 'currency') { S.currency = t.value; await save(); render(); }
  if (t.dataset.role === 'import-mm' && t.files[0]) { await importMMBackupFile(t.files[0]); t.value = ''; }
  if (t.dataset.role === 'import-json' && t.files[0]) { await importJSONFile(t.files[0]); t.value = ''; }
  if (t.dataset.role === 'import-add' && t.files[0]) { await importAddFile(t.files[0]); t.value = ''; }
  if (t.dataset.role === 'import-photos' && t.files[0]) { await importMMPhotosFile(t.files[0]); t.value = ''; }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset.role === 'search') {
    UI.search = t.value;
    clearTimeout(render._s);
    render._s = setTimeout(() => {
      const pos = t.selectionStart;
      render();
      const n = $('[data-role="search"]'); n.focus(); n.setSelectionRange(pos, pos);
    }, 250);
  }
});

// ---------- Hoja inferior (sheet) ----------
function openSheet(html, onMount) {
  const sh = $('#sheet');
  sh.innerHTML = `<div class="grip"></div>${html}`;
  sh.hidden = false; $('#sheet-backdrop').hidden = false;
  document.body.style.overflow = 'hidden';
  sh.scrollTop = 0;
  onMount && onMount(sh);
}
function closeSheet() {
  $('#sheet').hidden = true; $('#sheet-backdrop').hidden = true;
  $('#sheet').innerHTML = '';
  document.body.style.overflow = '';
}
$('#sheet-backdrop').addEventListener('click', closeSheet);

function parseAmount(s) {
  const clean = String(s).replace(/[^\d,.-]/g, '');
  if (S.currency === 'CLP') return Math.round(Number(clean.replace(/[.,]/g, '')) || 0);
  // "1.234,56" o "1234.56"
  const norm = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean;
  return Math.round((Number(norm) || 0) * 100) / 100;
}
function amountToInput(n) {
  if (!n) return '';
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(n);
}

// Fechas rápidas: hoy, ayer y el último día en que anotaste algo
const shortDM = (iso) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
function quickDateOptions() {
  const t = new Date(), y = new Date(); y.setDate(t.getDate() - 1);
  const today = isoDate(t), yest = isoDate(y);
  const opts = [{ date: today, short: shortDM(today), label: 'hoy' }, { date: yest, short: shortDM(yest), label: 'ayer' }];
  let last = null;
  for (const tx of S.transactions) if (tx.date < yest && (!last || (tx.created || '') > (last.created || ''))) last = tx;
  if (last) opts.push({ date: last.date, short: shortDM(last.date), label: 'último' });
  return opts;
}

// ----- Calculadora del monto -----
function calcPadHtml(expr) {
  const keys = ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', 'C', '0', '⌫', '+'];
  const v = calcEval(expr || '');
  return `<div class="calc">
    <div class="calc-display"><span class="calc-expr">${esc(expr || '0')}</span><span class="calc-res">${v === null ? '' : '= ' + money(v)}</span></div>
    <div class="calc-keys">${keys.map((k) => `<button data-k="${k}" class="${'÷×−+'.includes(k) ? 'op' : k === 'C' || k === '⌫' ? 'fn' : ''}">${k}</button>`).join('')}</div>
  </div>`;
}
function calcKey(expr, k) {
  if (k === 'C') return '';
  if (k === '⌫') return expr.slice(0, -1);
  const ops = '÷×−+';
  if (ops.includes(k)) return !expr ? '' : ops.includes(expr.slice(-1)) ? expr.slice(0, -1) + k : expr + k;
  return expr + k;
}
function calcEval(expr) {
  const e = String(expr).replace(/÷/g, '/').replace(/×/g, '*').replace(/−/g, '-').replace(/[+\-*/]+$/, '');
  if (!e || !/^[0-9+\-*/.]+$/.test(e)) return null;
  try { const v = Function(`"use strict";return (${e})`)(); return Number.isFinite(v) ? Math.round(v * 100) / 100 : null; } catch { return null; }
}

const TOP_CATS = 8;
function categoryUsage(type) {
  const since = new Date(); since.setMonth(since.getMonth() - 6);
  const from = isoDate(since);
  const count = (recent) => {
    const m = new Map();
    for (const t of S.transactions) if (t.type === type && (!recent || t.date >= from)) m.set(t.categoryId, (m.get(t.categoryId) || 0) + 1);
    return m;
  };
  const recent = count(true);
  return recent.size ? recent : count(false);
}

// Todas las etiquetas, de la más usada a la menos usada
function allTags() {
  const count = new Map();
  for (const t of S.transactions) for (const g of t.tags || []) count.set(g, (count.get(g) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
}
const fold = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
// Etiquetas cuyo nombre (o alguna de sus palabras) empieza con lo escrito; sin distinguir mayúsculas ni tildes
function filterTags(q, exclude = []) {
  const f = fold(q.trim());
  if (!f) return [];
  const starts = [], words = [];
  for (const g of allTags()) {
    if (exclude.includes(g)) continue;
    const n = fold(g);
    if (n.startsWith(f)) starts.push(g);
    else if (n.split(/[\s\-_./]+/).some((w) => w.startsWith(f))) words.push(g);
  }
  return [...starts, ...words].slice(0, 24);
}
function tagChips(selected, q) {
  const chip = (g) => `<button data-tag="${esc(g)}" class="${selected.includes(g) ? 'on' : ''}">${esc(g)}</button>`;
  if (!q.trim()) return [...new Set([...selected, ...topTags()])].map(chip).join('');
  const found = filterTags(q, selected);
  return selected.map(chip).join('') + (found.length ? found.map(chip).join('')
    : `<span class="small muted" style="padding:5px 4px">Sin coincidencias · Enter para crear «${esc(q.trim())}»</span>`);
}

function topTags(n = 14) {
  const count = new Map();
  for (const t of S.transactions) for (const g of t.tags || []) count.set(g, (count.get(g) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g);
}

// ----- Movimiento -----
function openTx(tx, type = 'expense') {
  const isNew = !tx;
  const d = tx ? { ...tx, tags: [...(tx.tags || [])], photos: [...(tx.photos || [])] } : {
    id: uid(), type, amount: 0, date: isoDate(new Date()),
    accountId: UI.account !== 'all' ? UI.account : (S.lastAccount && accById(S.lastAccount) ? S.lastAccount : S.accounts[0]?.id),
    categoryId: null, note: '', tags: [], photos: []
  };
  const quickDates = quickDateOptions();
  const newPhotos = new Map(); // fotos nuevas, se guardan al tocar Guardar
  const removedPhotos = new Set();

  const draw = (sh) => {
    const all = S.categories.filter((c) => c.type === d.type && (!c.archived || c.id === d.categoryId)).sort((a, b) => a.position - b.position);
    // Las más usadas primero (últimos 6 meses; si no hay datos, todo el historial)
    const usage = categoryUsage(d.type);
    const ranked = [...all].sort((a, b) => (usage.get(b.id) || 0) - (usage.get(a.id) || 0) || a.position - b.position);
    let cats = d.showAll ? all : ranked.slice(0, TOP_CATS);
    if (!d.showAll && d.categoryId && !cats.some((c) => c.id === d.categoryId)) cats = [...cats.slice(0, TOP_CATS - 1), catById(d.categoryId)];
    const accs = S.accounts.filter((a) => !a.archived || a.id === d.accountId).sort((a, b) => a.position - b.position);
    const acc = accById(d.accountId);
    sh.innerHTML = `<div class="grip"></div>
      <div class="sheet-head">
        <button data-a="cancel">Cancelar</button>
        <h3>${isNew ? 'Nuevo' : 'Editar'} movimiento</h3>
        <span style="width:70px"></span>
      </div>
      <div class="segmented type" data-a="type">
        <button data-v="expense" class="${d.type === 'expense' ? 'active' : ''}">Gasto</button>
        <button data-v="income" class="${d.type === 'income' ? 'active' : ''}">Ingreso</button>
      </div>
      <div class="amt-row">
        <input class="amount-big num ${d.type}" type="text" inputmode="${d.calc ? 'none' : S.currency === 'CLP' ? 'numeric' : 'decimal'}" pattern="[0-9]*" enterkeyhint="done" placeholder="0" value="${amountToInput(d.amount)}" data-f="amount" autocomplete="off" ${d.calc ? 'readonly' : ''}>
        <span class="amt-cur">${esc(S.currency)}</span>
        <button class="calc-btn ${d.calc ? 'on' : ''}" data-a="calc" aria-label="Calculadora">${SVG.calc}</button>
      </div>
      ${d.calc ? calcPadHtml(d.expr) : ''}

      <div class="mv-label">Cuenta</div>
      <label class="mv-value">${acc ? `${icon(acc.icon)} ${esc(acc.name)}` : 'Elegir cuenta'} <span class="caret">▾</span>
        <select data-f="accountId" class="overlay-select">${accs.map((a) => `<option value="${a.id}" ${a.id === d.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      </label>

      <div class="date-chips">
        ${quickDates.map((q) => `<button class="dchip ${d.date === q.date ? 'sel' : ''}" data-date="${q.date}"><b>${q.short}</b><span>${q.label}</span></button>`).join('')}
        ${quickDates.some((q) => q.date === d.date) ? '' : `<button class="dchip sel" data-date="${d.date}"><b>${shortDM(d.date)}</b><span>${d.date.slice(0, 4)}</span></button>`}
        <label class="cal-btn" aria-label="Elegir fecha">${SVG.calendar}<input type="date" data-f="date" value="${d.date}"></label>
      </div>

      <div class="mv-label row">Etiquetas <button class="search-btn ${d.tagSearch ? 'on' : ''}" data-a="tag-search" aria-label="Buscar etiqueta">${SVG.search}</button></div>
      ${d.tagSearch ? '<input class="mv-input" data-f="newtag" placeholder="Buscar o crear etiqueta" autocomplete="off">' : '<input type="hidden" data-f="newtag" value="">'}
      <div class="chips outline" data-role="tag-chips">${tagChips(d.tags, '')}</div>

      <div class="mv-label">Comentario</div>
      <input class="mv-input" type="text" data-f="note" placeholder="Comentario" value="${esc(d.note)}">

      <h2>Fotos</h2>
      <div class="card photo-strip">
        ${d.photos.map((id) => `<button class="thumb" data-photo="${id}"><img alt="" data-src="${id}"></button>`).join('')}
        <label class="thumb add">📷<span>Agregar</span><input type="file" accept="image/*" multiple hidden data-f="photo-input"></label>
      </div>
      <h2>Categoría</h2>
      <div class="card">
        <div class="cat-grid big">
          ${cats.map((c) => `<button data-cat="${c.id}" class="${d.categoryId === c.id ? 'sel' : ''}">${iconBubble(c.icon, c.color)}<span class="ellipsis">${esc(c.name)}</span></button>`).join('')}
        </div>
        ${all.length > TOP_CATS ? `<button class="see-all" data-a="toggle-cats">${d.showAll ? 'Ver menos ▴' : `Ver todas (${all.length}) ▾`}</button>` : ''}
      </div>
      <button class="btn save-btn" data-a="save">Guardar</button>
      ${isNew ? '' : `<button class="btn danger" data-a="delete" style="margin-top:4px">Eliminar movimiento</button>`}`;
    sh.querySelectorAll('img[data-src]').forEach(async (img) => { const u = await photoURL(img.dataset.src); if (u) img.src = u; });
  };

  const collect = (sh) => {
    d.amount = parseAmount($('[data-f="amount"]', sh).value);
    d.accountId = $('[data-f="accountId"]', sh).value;
    d.date = $('[data-f="date"]', sh).value || isoDate(new Date());
    d.note = $('[data-f="note"]', sh).value.trim();
    const nt = $('[data-f="newtag"]', sh).value.trim();
    if (nt && !d.tags.includes(nt)) d.tags.push(nt);
  };

  openSheet('', (sh) => {
    draw(sh);
    if (isNew) { const a = $('[data-f="amount"]', sh); a.focus({ preventScroll: true }); a.click(); }
    sh.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'cancel') return closeSheet();
      if (b.dataset.photo) {
        return openPhotoViewer(b.dataset.photo, () => {
          collect(sh); d.photos = d.photos.filter((x) => x !== b.dataset.photo);
          if (newPhotos.has(b.dataset.photo)) { newPhotos.delete(b.dataset.photo); forgetPhotoURL(b.dataset.photo); }
          else removedPhotos.add(b.dataset.photo);
          const y = sh.scrollTop; draw(sh); sh.scrollTop = y;
        });
      }
      if (b.dataset.date) { collect(sh); d.date = b.dataset.date; const y = sh.scrollTop; draw(sh); sh.scrollTop = y; return; }
      if (b.dataset.a === 'tag-search') {
        collect(sh); d.tagSearch = !d.tagSearch; const y = sh.scrollTop; draw(sh); sh.scrollTop = y;
        if (d.tagSearch) $('[data-f="newtag"]', sh).focus();
        return;
      }
      if (b.dataset.a === 'calc') {
        collect(sh); d.calc = !d.calc; d.expr = d.calc && d.amount ? String(d.amount) : '';
        const y = sh.scrollTop; draw(sh); sh.scrollTop = y;
        if (!d.calc) $('[data-f="amount"]', sh).focus();
        return;
      }
      if (b.dataset.k !== undefined) {
        d.expr = calcKey(d.expr || '', b.dataset.k);
        const v = calcEval(d.expr);
        $('.calc-expr', sh).textContent = d.expr || '0';
        $('.calc-res', sh).textContent = v === null ? '' : '= ' + money(v);
        if (v !== null) $('[data-f="amount"]', sh).value = amountToInput(Math.max(0, v));
        return;
      }
      if (b.dataset.a === 'toggle-cats') { collect(sh); d.showAll = !d.showAll; const y = sh.scrollTop; draw(sh); sh.scrollTop = y; return; }
      if (b.closest('[data-a="type"]') && b.dataset.v) {
        collect(sh); d.type = b.dataset.v;
        if (catById(d.categoryId)?.type !== d.type) d.categoryId = null;
        return draw(sh);
      }
      if (b.dataset.cat) { collect(sh); d.categoryId = b.dataset.cat; const y = sh.scrollTop; draw(sh); sh.scrollTop = y; return; }
      if (b.dataset.tag !== undefined) {
        $('[data-f="newtag"]', sh).value = '';
        collect(sh); const g = b.dataset.tag;
        d.tags = d.tags.includes(g) ? d.tags.filter((x) => x !== g) : [...d.tags, g];
        const y = sh.scrollTop; draw(sh); sh.scrollTop = y; return;
      }
      if (b.dataset.a === 'delete') {
        if (!confirm('¿Eliminar este movimiento?')) return;
        S.transactions = S.transactions.filter((x) => x.id !== d.id);
        const ids = (tx?.photos || []); if (ids.length) { await DB.deletePhotos(ids).catch(() => {}); ids.forEach(forgetPhotoURL); }
        await save(); closeSheet(); render(); return toast('Movimiento eliminado');
      }
      if (b.dataset.a === 'save') {
        collect(sh);
        if (!d.amount || d.amount <= 0) return toast('Ingresa un monto');
        if (!d.categoryId) return toast('Elige una categoría');
        if (!d.accountId) return toast('Crea una cuenta primero');
        const now = new Date().toISOString();
        const rec = { id: d.id, type: d.type, amount: d.amount, date: d.date, accountId: d.accountId, categoryId: d.categoryId, note: d.note, tags: d.tags, photos: d.photos, created: d.created || now, modified: now };
        if (d.hasPhoto && !d.photos.length && !removedPhotos.size) rec.hasPhoto = true;
        try {
          const toAdd = [...newPhotos].filter(([id]) => d.photos.includes(id));
          if (toAdd.length) await DB.putPhotos(toAdd);
          if (removedPhotos.size) { await DB.deletePhotos([...removedPhotos]); removedPhotos.forEach(forgetPhotoURL); }
        } catch (err) { return alert('No se pudo guardar la foto: ' + err.message); }
        const i = S.transactions.findIndex((x) => x.id === d.id);
        if (i >= 0) S.transactions[i] = rec; else S.transactions.push(rec);
        S.lastAccount = d.accountId;
        await save(); closeSheet(); render();
        toast(isNew ? 'Movimiento guardado' : 'Cambios guardados');
      }
    };
    sh.onchange = async (e) => {
      if (e.target.dataset.f === 'date' || e.target.dataset.f === 'accountId') { collect(sh); const y = sh.scrollTop; draw(sh); sh.scrollTop = y; return; }
      if (e.target.dataset.f !== 'photo-input' || !e.target.files.length) return;
      collect(sh);
      for (const f of e.target.files) {
        const blob = await compressImage(f);
        const id = uid();
        newPhotos.set(id, { blob, type: blob.type || typeFromName(f.name) });
        photoURLs.set(id, URL.createObjectURL(blob));
        d.photos.push(id);
      }
      const y = sh.scrollTop; draw(sh); sh.scrollTop = y;
    };
    sh.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.dataset.f === 'newtag') {
        e.preventDefault();
        const q = e.target.value.trim();
        const first = q && filterTags(q, d.tags)[0];
        if (first && !d.tags.includes(first)) { d.tags.push(first); e.target.value = ''; }
        collect(sh); const y = sh.scrollTop; draw(sh); sh.scrollTop = y; $('[data-f="newtag"]', sh).focus();
      }
    };
    sh.oninput = (e) => {
      if (e.target.dataset.f === 'amount') {
        const el = e.target; const v = parseAmount(el.value);
        if (S.currency === 'CLP') el.value = v ? amountToInput(v) : '';
      }
      if (e.target.dataset.f === 'newtag') $('[data-role="tag-chips"]', sh).innerHTML = tagChips(d.tags, e.target.value);
    };
  });
}

// ----- Ajuste de saldo -----
const ADJUST_CAT = { id: 'ajuste_saldo', name: 'Ajuste de saldo', icon: '⚖️', color: '#5b6b62' };

// Con "Total" seleccionado: elegir la cuenta a ajustar
function pickAccountToAdjust() {
  const accs = S.accounts.filter((a) => !a.archived).sort((a, b) => a.position - b.position);
  openSheet(`
    <div class="sheet-head"><button data-a="cancel">Cancelar</button><h3>¿Qué saldo quieres editar?</h3><span style="width:70px"></span></div>
    <div class="card list">${accs.map((a) => {
      const b = accountBalance(a.id);
      return `<button class="item" data-acc="${a.id}">${iconBubble(a.icon, a.color)}
        <div class="grow ellipsis">${esc(a.name)}</div><span class="num ${b < 0 ? 'expense' : ''}">${money(b)}</span><span style="color:var(--accent)">✏️</span></button>`;
    }).join('')}</div>`,
  (sh) => {
    sh.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'cancel') return closeSheet();
      if (b.dataset.acc) { closeSheet(); openBalanceEditor(b.dataset.acc); }
    };
  });
}

// Escribes el saldo real de la cuenta y se crea (o edita) un movimiento de ajuste por la diferencia
function openBalanceEditor(accountId, existing = null) {
  const acc = accById(accountId);
  if (!acc) return toast('Cuenta no encontrada');
  const prev = existing ? (existing.type === 'income' ? existing.amount : -existing.amount) : 0;
  const base = accountBalance(accountId) - prev; // saldo sin este ajuste
  let target = base + prev;
  let negative = target < 0;
  const date0 = existing?.date || isoDate(new Date());
  const note0 = existing?.note || '';
  const draw = (sh) => {
    const diff = target - base;
    sh.innerHTML = `<div class="grip"></div>
      <div class="sheet-head"><button data-a="cancel">Cancelar</button><h3>Saldo de ${esc(acc.name)}</h3><span style="width:70px"></span></div>
      <p class="small muted" style="text-align:center;margin:0">Saldo según la app: <b class="num">${money(base + prev)}</b></p>
      <div class="balance-edit">
        <button class="sign-btn ${negative ? 'neg' : ''}" data-a="sign" aria-label="Cambiar signo">${negative ? '−' : '+'}</button>
        <input class="amount-input num" data-f="bal" inputmode="numeric" pattern="[0-9]*" value="${amountToInput(Math.abs(target))}" placeholder="0" autocomplete="off">
      </div>
      <p class="small" style="text-align:center;margin:0 0 12px" data-role="diff">${diffText(diff)}</p>
      <div class="card list">
        <div class="field"><label>Fecha</label><input type="date" data-f="date" value="${date0}"></div>
        <div class="field"><label>Nota</label><input type="text" data-f="note" placeholder="Opcional" value="${esc(note0)}"></div>
      </div>
      <button class="btn save-btn" data-a="save">Guardar saldo</button>
      ${existing ? '<button class="btn danger" data-a="delete" style="margin-top:4px">Eliminar ajuste</button>' : ''}
      <p class="small muted" style="text-align:center">Se registra como un movimiento "Ajuste de saldo" por la diferencia. No aparece en tus gráficos de gastos ni ingresos.</p>`;
  };
  const diffText = (diff) => diff === 0 ? '<span class="muted">Sin cambios</span>'
    : `Se registrará un ajuste de <b class="num ${diff > 0 ? 'income' : 'expense'}">${money(diff, { sign: true })}</b>`;
  const readTarget = (sh) => { const v = Math.abs(parseAmount($('[data-f="bal"]', sh).value)); target = negative ? -v : v; };

  openSheet('', (sh) => {
    draw(sh);
    const inp = $('[data-f="bal"]', sh); inp.focus({ preventScroll: true }); inp.select();
    sh.oninput = (e) => {
      if (e.target.dataset.f !== 'bal') return;
      const v = Math.abs(parseAmount(e.target.value));
      if (S.currency === 'CLP') e.target.value = v ? amountToInput(v) : '';
      readTarget(sh);
      $('[data-role="diff"]', sh).innerHTML = diffText(target - base);
    };
    sh.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'cancel') return closeSheet();
      if (b.dataset.a === 'sign') {
        readTarget(sh); negative = !negative; target = -target;
        const date = $('[data-f="date"]', sh).value, note = $('[data-f="note"]', sh).value;
        draw(sh); $('[data-f="date"]', sh).value = date; $('[data-f="note"]', sh).value = note;
        return;
      }
      if (b.dataset.a === 'delete') {
        if (!confirm('¿Eliminar este ajuste de saldo?')) return;
        S.transactions = S.transactions.filter((x) => x.id !== existing.id);
        await save(); closeSheet(); render(); return toast('Ajuste eliminado');
      }
      if (b.dataset.a !== 'save') return;
      readTarget(sh);
      const diff = target - base;
      const date = $('[data-f="date"]', sh).value || isoDate(new Date());
      const note = $('[data-f="note"]', sh).value.trim();
      const now = new Date().toISOString();
      if (existing) S.transactions = S.transactions.filter((x) => x.id !== existing.id);
      if (diff !== 0) {
        S.transactions.push({
          id: existing?.id || uid(), type: diff > 0 ? 'income' : 'expense', amount: Math.abs(diff), date, accountId,
          categoryId: ADJUST_CAT.id, note, tags: [], photos: [], adjust: true, created: existing?.created || now, modified: now
        });
      }
      await save(); closeSheet(); render();
      toast(`Saldo de ${acc.name}: ${money(target)}`);
    };
  });
}

// ----- Visor de fotos -----
async function openPhotoViewer(id, onDelete) {
  const el = document.createElement('div');
  el.className = 'photo-viewer';
  el.innerHTML = `<img alt="">
    <div class="pv-bar"><button data-a="del">🗑 Eliminar</button><button data-a="close">Cerrar</button></div>`;
  document.body.appendChild(el);
  const u = await photoURL(id); if (u) el.querySelector('img').src = u;
  el.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'del') { if (!confirm('¿Eliminar esta foto?')) return; el.remove(); onDelete(); return; }
    if (a === 'close' || e.target === el) el.remove();
  });
}

// ----- Transferencia -----
function openTransfer(tr) {
  const isNew = !tr;
  const accs = S.accounts.filter((a) => !a.archived || (tr && (a.id === tr.fromId || a.id === tr.toId)));
  if (accs.length < 2) return toast('Necesitas al menos dos cuentas');
  const d = tr ? { ...tr } : { id: uid(), fromId: accs[0].id, toId: accs[1].id, amount: 0, date: isoDate(new Date()), note: '' };
  const opts = (sel) => accs.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${icon(a.icon)} ${esc(a.name)}</option>`).join('');
  openSheet(`
    <div class="sheet-head"><button data-a="cancel">Cancelar</button><h3>${isNew ? 'Nueva' : 'Editar'} transferencia</h3><button data-a="save">Guardar</button></div>
    <input class="amount-input num" inputmode="numeric" placeholder="$0" value="${amountToInput(d.amount)}" data-f="amount">
    <div class="card list">
      <div class="field"><label>Desde</label><select data-f="fromId">${opts(d.fromId)}</select></div>
      <div class="field"><label>Hacia</label><select data-f="toId">${opts(d.toId)}</select></div>
      <div class="field"><label>Fecha</label><input type="date" data-f="date" value="${d.date}"></div>
      <div class="field"><label>Nota</label><input type="text" data-f="note" placeholder="Opcional" value="${esc(d.note)}"></div>
    </div>
    ${isNew ? '' : `<button class="btn danger" data-a="delete" style="margin-top:12px">Eliminar transferencia</button>`}`,
  (sh) => {
    sh.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'cancel') return closeSheet();
      if (b.dataset.a === 'delete') {
        if (!confirm('¿Eliminar esta transferencia?')) return;
        S.transfers = S.transfers.filter((x) => x.id !== d.id);
        await save(); closeSheet(); render(); return;
      }
      if (b.dataset.a === 'save') {
        const amount = parseAmount($('[data-f="amount"]', sh).value);
        const fromId = $('[data-f="fromId"]', sh).value, toId = $('[data-f="toId"]', sh).value;
        if (!amount) return toast('Ingresa un monto');
        if (fromId === toId) return toast('Elige cuentas distintas');
        const rec = { id: d.id, fromId, toId, amount, toAmount: null, date: $('[data-f="date"]', sh).value || isoDate(new Date()), note: $('[data-f="note"]', sh).value.trim(), created: d.created || new Date().toISOString() };
        const i = S.transfers.findIndex((x) => x.id === d.id);
        if (i >= 0) S.transfers[i] = rec; else S.transfers.push(rec);
        await save(); closeSheet(); render(); toast('Transferencia guardada');
      }
    };
    sh.oninput = (e) => {
      if (e.target.dataset.f === 'amount' && S.currency === 'CLP') { const v = parseAmount(e.target.value); e.target.value = v ? amountToInput(v) : ''; }
    };
  });
}

// ----- Editor genérico de cuenta / categoría -----
function openEntityEditor({ title, entity, isNew, extraFields, onSave, onDelete, deleteLabel }) {
  const d = { ...entity };
  const draw = (sh) => {
    sh.innerHTML = `<div class="grip"></div>
      <div class="sheet-head"><button data-a="cancel">Cancelar</button><h3>${title}</h3><button data-a="save">Guardar</button></div>
      <div style="display:flex;justify-content:center;margin:6px 0 14px">${iconBubble(d.icon, d.color).replace('class="icon ', 'style="width:64px;height:64px;font-size:32px;background:' + d.color + '" class="icon ')}</div>
      <div class="card list">
        <div class="field"><label>Nombre</label><input type="text" data-f="name" value="${esc(d.name)}" placeholder="Nombre"></div>
        ${extraFields(d)}
      </div>
      <h2>Color</h2>
      <div class="card color-grid">${COLORS.map((c) => `<button data-color="${c}" style="background:${c}" class="${d.color === c ? 'sel' : ''}"></button>`).join('')}</div>
      <h2>Ícono</h2>
      <div class="card icon-grid">${ICON_KEYS.map((k) => `<button data-icon="${k}" class="${d.icon === k ? 'sel' : ''}">${ICONS[k]}</button>`).join('')}</div>
      ${isNew || !onDelete ? '' : `<button class="btn danger" data-a="delete" style="margin-top:12px">${deleteLabel}</button>`}`;
  };
  const collect = (sh) => {
    d.name = $('[data-f="name"]', sh).value.trim();
    sh.querySelectorAll('[data-x]').forEach((el) => { d[el.dataset.x] = el.type === 'checkbox' ? el.checked : el.dataset.num ? parseAmount(el.value) : el.value; });
  };
  openSheet('', (sh) => {
    draw(sh);
    sh.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'cancel') return closeSheet();
      if (b.dataset.adjust) { closeSheet(); return openBalanceEditor(b.dataset.adjust); }
      if (b.dataset.color) { collect(sh); d.color = b.dataset.color; const y = sh.scrollTop; draw(sh); sh.scrollTop = y; return; }
      if (b.dataset.icon) { collect(sh); d.icon = b.dataset.icon; const y = sh.scrollTop; draw(sh); sh.scrollTop = y; return; }
      if (b.dataset.a === 'delete') { if (await onDelete(d)) { await save(); closeSheet(); render(); } return; }
      if (b.dataset.a === 'save') {
        collect(sh);
        if (!d.name) return toast('Ponle un nombre');
        onSave(d); await save(); closeSheet(); render();
      }
    };
  });
}

function openAccount(acc) {
  const isNew = !acc;
  const entity = acc || { id: uid(), name: '', icon: 'cash', color: '#1f8a70', ignoreInBalance: false, archived: false, position: S.accounts.length };
  openEntityEditor({
    title: isNew ? 'Nueva cuenta' : 'Editar cuenta', entity, isNew,
    extraFields: (d) => `
      ${isNew ? `<div class="field"><label>Saldo inicial</label><input data-x="initial" data-num="1" inputmode="numeric" placeholder="$0"></div>`
        : `<button type="button" class="field" data-adjust="${d.id}" style="width:100%"><label>Saldo actual</label><span class="grow right num">${money(accountBalance(d.id))}</span><span style="color:var(--accent)">✏️ Ajustar</span></button>`}
      <div class="field"><label class="grow" style="width:auto">Excluir del saldo total</label><input type="checkbox" data-x="ignoreInBalance" ${d.ignoreInBalance ? 'checked' : ''}></div>
      ${isNew ? '' : `<div class="field"><label class="grow" style="width:auto">Archivar cuenta</label><input type="checkbox" data-x="archived" ${d.archived ? 'checked' : ''}></div>`}`,
    onSave: (d) => {
      const { initial, ...rec } = d;
      const i = S.accounts.findIndex((a) => a.id === rec.id);
      if (i >= 0) S.accounts[i] = rec; else S.accounts.push(rec);
      if (isNew && initial > 0) {
        let cat = S.categories.find((c) => c.type === 'income' && /capital inicial|saldo inicial/i.test(c.name));
        if (!cat) { cat = { id: uid(), name: 'Saldo inicial', type: 'income', icon: 'payment', color: '#044b40', limit: 0, position: 99, archived: false }; S.categories.push(cat); }
        const now = new Date().toISOString();
        S.transactions.push({ id: uid(), type: 'income', amount: initial, date: isoDate(new Date()), accountId: rec.id, categoryId: cat.id, note: 'Saldo inicial', tags: [], created: now, modified: now });
      }
    },
    deleteLabel: 'Eliminar cuenta',
    onDelete: async (d) => {
      const used = S.transactions.some((t) => t.accountId === d.id) || S.transfers.some((t) => t.fromId === d.id || t.toId === d.id);
      if (used) { toast('Esta cuenta tiene movimientos. Puedes archivarla.'); return false; }
      if (!confirm('¿Eliminar esta cuenta?')) return false;
      S.accounts = S.accounts.filter((a) => a.id !== d.id);
      return true;
    }
  });
}

function openCategories(type) {
  const draw = (sh) => {
    const cats = S.categories.filter((c) => c.type === type).sort((a, b) => a.archived - b.archived || a.position - b.position);
    sh.innerHTML = `<div class="grip"></div>
      <div class="sheet-head"><button data-a="cancel">Cerrar</button><h3>Categorías de ${type === 'expense' ? 'gastos' : 'ingresos'}</h3><button data-a="new">Nueva</button></div>
      <div class="card list">${cats.map((c) => `<button class="item" data-cat="${c.id}" style="${c.archived ? 'opacity:.5' : ''}">
        ${iconBubble(c.icon, c.color, 'sm')}
        <div class="grow ellipsis">${esc(c.name)}${c.archived ? ' <span class="small muted">(archivada)</span>' : ''}</div>
        ${c.limit ? `<span class="small muted">Límite ${money(c.limit)}</span>` : ''}<span class="muted">›</span></button>`).join('')}</div>
      <p class="small muted" style="text-align:center">En categorías de gastos puedes fijar un límite mensual (presupuesto).</p>`;
  };
  openSheet('', (sh) => {
    draw(sh);
    sh.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'cancel') return closeSheet();
      if (b.dataset.a === 'new') return openCategory(null, type);
      if (b.dataset.cat) return openCategory(catById(b.dataset.cat), type);
    };
  });
}

function openCategory(cat, type) {
  const isNew = !cat;
  const entity = cat || { id: uid(), name: '', type, icon: 'other', color: COLORS[Math.floor(Math.random() * COLORS.length)], limit: 0, position: S.categories.length, archived: false };
  openEntityEditor({
    title: isNew ? 'Nueva categoría' : 'Editar categoría', entity, isNew,
    extraFields: (d) => `
      ${d.type === 'expense' ? `<div class="field"><label>Límite mensual</label><input data-x="limit" data-num="1" inputmode="numeric" placeholder="Sin límite" value="${amountToInput(d.limit)}"></div>` : ''}
      ${isNew ? '' : `<div class="field"><label class="grow" style="width:auto">Archivar (ocultar al registrar)</label><input type="checkbox" data-x="archived" ${d.archived ? 'checked' : ''}></div>`}`,
    onSave: (d) => {
      const i = S.categories.findIndex((c) => c.id === d.id);
      if (i >= 0) S.categories[i] = d; else S.categories.push(d);
      setTimeout(() => openCategories(d.type), 0);
    },
    deleteLabel: 'Eliminar categoría',
    onDelete: async (d) => {
      if (S.transactions.some((t) => t.categoryId === d.id)) { toast('Tiene movimientos. Puedes archivarla.'); return false; }
      if (!confirm('¿Eliminar esta categoría?')) return false;
      S.categories = S.categories.filter((c) => c.id !== d.id);
      setTimeout(() => openCategories(d.type), 0);
      return true;
    }
  });
}

// ---------- Exportar / importar ----------
async function download(name, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  // En iPhone, el menú Compartir permite "Guardar en Archivos"
  try {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file] }); return; }
  } catch (err) { if (err.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function exportJSON() {
  const json = JSON.stringify(S, null, 1);
  const ids = (await DB.photoKeys().catch(() => [])) || [];
  if (!ids.length) return download(`finanzas-${isoDate(new Date())}.json`, json, 'application/json');
  // Con fotos: un .zip con finanzas.json + photos/
  toast('Preparando copia con fotos…');
  if (!window.fflate) await loadScript(FFLATE_URL);
  const files = { 'finanzas.json': fflate.strToU8(json) }, types = {};
  for (const id of ids) {
    const rec = await DB.getPhoto(id);
    if (!rec) continue;
    types[id] = rec.type;
    files['photos/' + id] = [new Uint8Array(await rec.blob.arrayBuffer()), { level: 0 }];
  }
  files['photos.json'] = fflate.strToU8(JSON.stringify(types));
  download(`finanzas-${isoDate(new Date())}.zip`, new Blob([fflate.zipSync(files)], { type: 'application/zip' }), 'application/zip');
}

function exportCSV() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Fecha', 'Tipo', 'Monto', 'Categoría', 'Cuenta', 'Nota', 'Etiquetas'].join(';')];
  for (const t of [...S.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push([t.date, t.adjust ? 'Ajuste de saldo' : t.type === 'income' ? 'Ingreso' : 'Gasto', t.type === 'income' ? t.amount : -t.amount,
      q(catById(t.categoryId)?.name), q(accById(t.accountId)?.name), q(t.note), q((t.tags || []).join(', '))].join(';'));
  }
  for (const t of S.transfers) {
    lines.push([t.date, 'Transferencia', t.amount, '', q(`${accById(t.fromId)?.name} → ${accById(t.toId)?.name}`), q(t.note), ''].join(';'));
  }
  download(`finanzas-${isoDate(new Date())}.csv`, '﻿' + lines.join('\n'), 'text/csv');
}

async function importJSONFile(file) {
  try {
    const buf = new Uint8Array(await file.arrayBuffer());
    let data, photos = [];
    if (buf[0] === 0x50 && buf[1] === 0x4b) { // copia .zip con fotos
      if (!window.fflate) await loadScript(FFLATE_URL);
      const z = fflate.unzipSync(buf);
      data = JSON.parse(fflate.strFromU8(z['finanzas.json']));
      const types = z['photos.json'] ? JSON.parse(fflate.strFromU8(z['photos.json'])) : {};
      for (const [name, bytes] of Object.entries(z)) {
        if (!name.startsWith('photos/') || name.endsWith('/')) continue;
        const id = name.slice(7), type = types[id] || 'image/jpeg';
        photos.push([id, { blob: new Blob([bytes], { type }), type }]);
      }
    } else data = JSON.parse(new TextDecoder().decode(buf));
    if (!Array.isArray(data.transactions) || !Array.isArray(data.accounts)) throw new Error('Formato no válido');
    if (!confirm(`Esto reemplazará tus datos actuales con ${data.transactions.length} movimientos${photos.length ? ` y ${photos.length} fotos` : ''}. ¿Continuar?`)) return;
    await DB.clearPhotos(); photoURLs.forEach((u) => URL.revokeObjectURL(u)); photoURLs.clear();
    if (photos.length) await DB.putPhotos(photos);
    allowCloudReplace();
    S = { ...defaultState(), ...data };
    await save(); render(); toast('Copia restaurada');
  } catch (err) { alert('No se pudo leer el archivo: ' + err.message); }
}

// Agrega movimientos de un archivo sin borrar nada. Omite los que ya están registrados:
// mismo id, o misma cuenta + tipo + monto anotado hasta `before` días antes o `after` días después
// de la fecha del banco (el banco suele registrar los gastos días más tarde). Cada uno cuenta una sola vez.
function mergeTransactions(existing, incoming, { before = 1, after = 1 } = {}) {
  const DAY = 86400000;
  const used = new Set();
  const ids = new Set(existing.map((t) => t.id));
  const added = [], skipped = [];
  for (const n of incoming) {
    if (ids.has(n.id)) { skipped.push(n); continue; }
    const d = parseDate(n.date).getTime();
    let best = null, bestGap = Infinity;
    for (const t of existing) {
      if (used.has(t.id) || t.accountId !== n.accountId || t.type !== n.type || t.amount !== n.amount) continue;
      const diff = Math.round((d - parseDate(t.date).getTime()) / DAY); // > 0: anotado antes que el banco
      if (diff > before || diff < -after) continue;
      if (Math.abs(diff) < bestGap) { best = t; bestGap = Math.abs(diff); }
    }
    if (best) { used.add(best.id); skipped.push(n); continue; }
    added.push(n);
  }
  return { added, skipped };
}

async function importAddFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.kind !== 'finanzas-movimientos' || !Array.isArray(data.transactions)) throw new Error('No es un archivo de movimientos');
    const now = new Date().toISOString();
    const incoming = data.transactions.map((t) => {
      const type = t.type === 'income' ? 'income' : 'expense';
      const cat = catById(t.categoryId);
      return {
        id: String(t.id), type, amount: Math.abs(Number(t.amount) || 0), date: String(t.date).slice(0, 10),
        accountId: t.accountId || data.accountId,
        categoryId: cat && cat.type === type ? cat.id : (type === 'income' ? 'other_income' : 'other_expense'),
        note: t.note || '', tags: Array.isArray(t.tags) ? t.tags : [], created: t.created || now, modified: now
      };
    }).filter((t) => t.amount > 0 && accById(t.accountId));
    const { added, skipped } = mergeTransactions(S.transactions, incoming, data.match || {});
    const accId = data.accountId;
    const acc = accById(accId);
    const before = acc ? accountBalance(accId) : 0;
    const net = added.filter((t) => t.accountId === accId).reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
    const after = before + net;
    const list = (arr) => arr.slice(0, 8).map((t) => `• ${t.date.slice(8)}/${t.date.slice(5, 7)} ${t.note || ''} ${money(t.amount)}`).join('\n') + (arr.length > 8 ? `\n… y ${arr.length - 8} más` : '');
    let msg = `Se agregarán ${added.length} movimiento${added.length === 1 ? '' : 's'}.`;
    if (skipped.length) msg += `\nYa registrados (se omiten): ${skipped.length}\n${list(skipped)}`;
    if (acc) {
      msg += `\n\nSaldo ${acc.name}: ${money(before)} → ${money(after)}`;
      if (typeof data.bankBalance === 'number') {
        const diff = data.bankBalance - after;
        msg += `\nSaldo en el banco: ${money(data.bankBalance)}` + (diff ? `\nDiferencia: ${money(diff, { sign: true })}` : '\n✓ Cuadra con el banco');
      }
    }
    if (!added.length) return alert(msg.replace('Se agregarán 0 movimientos.', 'No hay movimientos nuevos para agregar.'));
    if (!confirm(msg + '\n\n¿Agregar?')) return;
    S.transactions.push(...added);
    await save(); render();
    toast(`${added.length} movimiento${added.length === 1 ? '' : 's'} agregado${added.length === 1 ? '' : 's'}`);
  } catch (err) { alert('No se pudo leer el archivo: ' + err.message); }
}

// Fuerza descargar la última versión (no toca tus datos, que están en IndexedDB)
async function updateApp() {
  toast('Buscando actualización…');
  try {
    for (const r of (await navigator.serviceWorker?.getRegistrations?.()) || []) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  } catch (e) { console.error(e); }
  location.replace(location.pathname + '?v=' + Date.now());
}

// Reemplazar todo a propósito (importar, restaurar, borrar): permite que la nube también se reemplace
function allowCloudReplace() { if (typeof Sync !== 'undefined') Sync.allowMassDelete = true; }

async function wipe() {
  if (!confirm(window.syncSectionHtml && localStorage.getItem('finanzas-user')
    ? '¿Borrar TODOS los datos? Como tienes la sincronización activa, se borrarán en TODOS tus dispositivos y en la nube. No se puede deshacer.'
    : '¿Borrar TODOS los datos de este dispositivo? Esta acción no se puede deshacer.')) return;
  if (!confirm('¿Seguro? Te recomiendo exportar una copia antes.')) return;
  await DB.clearPhotos().catch(() => {}); photoURLs.clear();
  allowCloudReplace();
  S = defaultState(); await save(); render(); toast('Datos borrados');
}

// ----- Importador de Gestor de Gastos (.mmbackup) -----
// Formato: 8 bytes de cabecera + ZIP con MyFinance.db (SQLite).
function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src));
    document.head.appendChild(s);
  });
}

const SQLJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
const FFLATE_URL = 'vendor/fflate.js';

async function importMMBackupFile(file) {
  try {
    toast('Leyendo copia de seguridad…');
    const buf = new Uint8Array(await file.arrayBuffer());
    const data = await parseMMBackup(buf);
    const msg = `Encontré ${data.transactions.length} movimientos, ${data.accounts.length} cuentas, ${data.categories.length} categorías, ${data.transfers.length} transferencias y ${data.photoBlobs.size} fotos.\n\n` +
      `Esto reemplazará los datos actuales de la app. ¿Importar?`;
    if (!confirm(msg)) return;
    await DB.clearPhotos(); photoURLs.forEach((u) => URL.revokeObjectURL(u)); photoURLs.clear();
    if (data.photoBlobs.size) await DB.putPhotos([...data.photoBlobs]);
    allowCloudReplace();
    S = { ...defaultState(), ...data };
    UI.account = 'all'; UI.anchor = new Date();
    await save(); render(); toast('¡Importación completa!');
  } catch (err) {
    console.error(err);
    alert('No se pudo importar: ' + err.message);
  }
}

// Agrega a tus movimientos actuales las fotos de una copia de Gestor de Gastos, sin reemplazar nada
async function importMMPhotosFile(file) {
  try {
    toast('Leyendo fotos de la copia…');
    const data = await parseMMBackup(new Uint8Array(await file.arrayBuffer()));
    if (!data.photoBlobs.size) return alert('Esta copia no trae fotos. Usa el archivo .mmbackup (el .db no incluye fotos).');
    const byId = new Map(S.transactions.map((t) => [t.id, t]));
    const toStore = []; let txCount = 0, missing = 0;
    for (const t of data.transactions) {
      if (!t.photos.length) continue;
      const mine = byId.get(t.id);
      if (!mine) { missing += t.photos.length; continue; }
      const have = new Set(mine.photos || []);
      const add = t.photos.filter((id) => !have.has(id));
      if (!add.length) continue;
      mine.photos = [...have, ...add]; txCount++;
      for (const id of add) toStore.push([id, data.photoBlobs.get(id)]);
    }
    if (!toStore.length) return alert('Tus movimientos ya tienen todas las fotos de esta copia.');
    let msg = `Se agregarán ${toStore.length} fotos a ${txCount} movimientos.`;
    if (missing) msg += `\n${missing} fotos son de movimientos que ya no están en la app y se omitirán.`;
    if (!confirm(msg + '\n\nNo se borra ni cambia nada más. ¿Continuar?')) return;
    await DB.putPhotos(toStore);
    await save(); render(); toast(`${toStore.length} fotos recuperadas`);
  } catch (err) { console.error(err); alert('No se pudieron importar las fotos: ' + err.message); }
}

async function parseMMBackup(buf) {
  if (!window.fflate) await loadScript(FFLATE_URL);
  if (!window.initSqlJs) await loadScript(SQLJS_BASE + 'sql-wasm.js');

  const isSqlite = String.fromCharCode(...buf.subarray(0, 15)) === 'SQLite format 3';
  const SQL = await initSqlJs({ locateFile: (f) => SQLJS_BASE + f });
  let dbBytes = buf, zipBytes = null;
  if (!isSqlite) {
  // Buscar la firma ZIP "PK\x03\x04" (la cabecera suele ser de 8 bytes)
  let start = -1;
  for (let i = 0; i < Math.min(buf.length - 4, 1024); i++) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x03 && buf[i + 3] === 0x04) { start = i; break; }
  }
  if (start < 0) throw new Error('El archivo no parece una copia de Gestor de Gastos.');
  zipBytes = buf.subarray(start);
  const files = fflate.unzipSync(zipBytes, { filter: (f) => f.name.endsWith('.db') });
  const dbName = Object.keys(files)[0];
  if (!dbName) throw new Error('No se encontró la base de datos dentro de la copia.');
  dbBytes = files[dbName];
  }
  const db = new SQL.Database(dbBytes);
  const rows = (sql) => {
    const res = db.exec(sql);
    if (!res.length) return [];
    const { columns, values } = res[0];
    return values.map((v) => Object.fromEntries(columns.map((c, i) => [c, v[i]])));
  };
  const argb = (n) => '#' + ((Number(n) >>> 0) & 0xffffff).toString(16).padStart(6, '0');

  const settings = Object.fromEntries(rows('SELECT uid, value FROM syncable_settings').map((r) => [r.uid, r.value]));

  const accounts = rows('SELECT * FROM account ORDER BY position').map((a) => ({
    id: a.uid, name: a.title || 'Cuenta', icon: a.icon || 'cash', color: argb(a.color),
    ignoreInBalance: !!a.ignoreInBalance, archived: !!a.isRemoved || a.isActive === 0, position: a.position ?? 0
  }));

  const categories = rows('SELECT * FROM category').map((c) => ({
    id: c.uid, name: c.title || DEFAULT_CAT_NAMES[c.uid] || 'Categoría',
    type: String(c.type).toLowerCase() === 'income' ? 'income' : 'expense',
    icon: c.icon || 'other', color: argb(c.color), limit: c.limitAmount || 0,
    position: c.position ?? 0, archived: !!c.isRemoved
  }));

  // Relaciones (movimiento → cuenta / categoría / etiqueta)
  const links = {};
  for (const l of rows("SELECT entityUid, otherType, otherUid, modified FROM sync_link WHERE COALESCE(isRemoved, 0) = 0 ORDER BY modified")) {
    const e = (links[l.entityUid] ||= { Tag: [], Photo: [] });
    if (l.otherType === 'Tag') e.Tag.push(l.otherUid);
    else if (l.otherType === 'Photo') e.Photo.push(l.otherUid);
    else e[l.otherType] = l.otherUid;
  }
  const tagNames = Object.fromEntries(rows('SELECT uid, name FROM tag').map((t) => [t.uid, t.name]));
  // Fotos: sync_link (Photo) → sync_file.uid → localPath → photos/<localPath> dentro del ZIP
  const photoFile = {};
  try {
    for (const f of rows("SELECT uid, localPath FROM sync_file WHERE fileType = 'photo' AND COALESCE(isRemoved, 0) = 0 AND localPath IS NOT NULL"))
      photoFile[f.uid] = f.localPath;
  } catch { /* copia sin tabla de archivos */ }

  const firstAcc = accounts[0]?.id || 'main';
  const transactions = rows('SELECT * FROM "transaction" WHERE COALESCE(isRemoved, 0) = 0').map((t) => {
    const l = links[t.uid] || { Tag: [], Photo: [] };
    return {
      id: t.uid, type: String(t.type).toLowerCase() === 'income' ? 'income' : 'expense',
      amount: Math.abs(t.amountInAccountCurrency ?? t.amountInDefaultCurrency ?? 0),
      date: String(t.date).slice(0, 10),
      accountId: l.Account || firstAcc,
      categoryId: l.Category || (String(t.type).toLowerCase() === 'income' ? 'other_income' : 'other_expense'),
      note: (t.comment || '').trim(),
      tags: l.Tag.map((id) => tagNames[id]).filter(Boolean),
      photos: l.Photo.filter((id) => photoFile[id]),
      hasPhoto: l.Photo.length > 0,
      created: t.created, modified: t.modified
    };
  });

  const transfers = rows('SELECT * FROM transfer WHERE COALESCE(isRemoved, 0) = 0').map((t) => {
    const l = links[t.uid] || {};
    return {
      id: t.uid, fromId: l.FromAccount, toId: l.ToAccount,
      amount: t.fromAmount || 0, toAmount: t.toAmount || null,
      date: String(t.date).slice(0, 10), note: (t.comment || '').trim(), created: t.created
    };
  }).filter((t) => t.fromId && t.toId);

  // Asegurar que las cuentas referenciadas existan
  const accIds = new Set(accounts.map((a) => a.id));
  for (const t of transactions) if (!accIds.has(t.accountId)) {
    accounts.push({ id: t.accountId, name: 'Cuenta importada', icon: 'cash', color: '#888888', ignoreInBalance: false, archived: false, position: 99 });
    accIds.add(t.accountId);
  }
  db.close();

  // Extraer del ZIP solo las fotos que usan los movimientos
  const photoBlobs = new Map();
  if (zipBytes) {
    const wanted = new Map();
    for (const t of transactions) for (const id of t.photos) wanted.set('photos/' + photoFile[id], id);
    if (wanted.size) {
      const pf = fflate.unzipSync(zipBytes, { filter: (f) => wanted.has(f.name) });
      for (const [name, bytes] of Object.entries(pf)) {
        const type = typeFromName(name);
        photoBlobs.set(wanted.get(name), { blob: new Blob([bytes], { type }), type });
      }
    }
  }
  for (const t of transactions) t.photos = t.photos.filter((id) => photoBlobs.has(id));

  const data = { version: 1, currency: settings.defaultCurrencyCode || 'CLP', accounts, categories, transactions, transfers };
  emojiNamesToIcons(data);
  Object.defineProperty(data, 'photoBlobs', { value: photoBlobs, enumerable: false });
  return data;
}

// Si el nombre empieza con un emoji ("🚘Compra y venta"), ese emoji pasa a ser el ícono
function emojiNamesToIcons(st) {
  let changed = false;
  for (const e of [...st.accounts, ...st.categories]) {
    const m = /^\s*((?:\p{Extended_Pictographic}|\p{Regional_Indicator})(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*)\s*/u.exec(e.name || '');
    if (m && m[0].length < e.name.length) {
      e.icon = m[1]; e.name = e.name.slice(m[0].length).trim(); changed = true;
    }
  }
  return changed;
}

// ---------- Inicio ----------
let appReadyResolve; window.appReady = new Promise((r) => (appReadyResolve = r));
(async function init() {
  try { S = await DB.get('state'); } catch (e) { console.error(e); }
  if (!S) { S = defaultState(); await save(); }
  if (emojiNamesToIcons(S)) await save();
  appReadyResolve();
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Recargar una vez cuando se instala una versión nueva de la app
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    navigator.serviceWorker.register('sw.js').then((r) => r.update()).catch(() => {});
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
})();

// Exponer para pruebas
window.__finanzas = { parseMMBackup, mergeTransactions, get state() { return S; } };
