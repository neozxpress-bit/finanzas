'use strict';

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
  deposit: '💰', ethereum: '💎', parcel: '📦', rent: '🔑', shovel: '⛏️', toilet: '🚽'
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
      const r = indexedDB.open('finanzas', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
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
  }
};

let S = null; // estado persistente
const UI = { tab: 'home', type: 'expense', period: 'month', anchor: new Date(), account: 'all', search: '', catFilter: null, tagFilter: null, open: new Set(), from: null, to: null };

async function save() {
  await DB.set('state', S);
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
    (!type || t.type === type) &&
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
  chev: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
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
      <div class="hero-balance num">${money(totalBalance())}</div>
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
  const inc = tx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const exp = tx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

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
  const c = catById(t.categoryId) || { name: 'Sin categoría', icon: 'other', color: '#888' };
  const a = accById(t.accountId);
  const tags = t.tags || [];
  return `<button class="tx" data-edit-tx="${t.id}">
    <div class="tx-main">
      <span class="tx-icon">${iconBubble(c.icon, c.color)}${t.hasPhoto ? '<span class="badge">📷</span>' : ''}</span>
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
        <button class="item" data-role="export-json"><span class="icon sm" style="background:#1f8a70">⤒</span>
          <div class="grow">Exportar copia de seguridad<div class="small muted">Archivo .json con todos tus datos</div></div></button>
        <label class="item" style="cursor:pointer"><span class="icon sm" style="background:#258877">↺</span>
          <div class="grow">Restaurar copia de seguridad<div class="small muted">Desde un archivo .json exportado</div></div>
          <input type="file" accept=".json,application/json" data-role="import-json" hidden></label>
        <button class="item" data-role="export-csv"><span class="icon sm" style="background:#ec8207">▦</span>
          <div class="grow">Exportar a Excel (CSV)</div></button>
        <button class="item" data-role="wipe"><span class="icon sm" style="background:#c0392b">✕</span>
          <div class="grow expense">Borrar todos los datos</div></button>
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

// Deslizar a izquierda/derecha para cambiar de período (Inicio y Movimientos)
(function swipe() {
  let x0 = null, y0 = null, t0 = 0;
  const canSwipe = (el) => (UI.tab === 'home' || UI.tab === 'list') && !el.closest('#sheet, .dialog-backdrop, input, select, .hbar') &&
    UI.period !== 'custom' && UI.period !== 'all' && $('#sheet').hidden;
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || !canSwipe(e.target)) { x0 = null; return; }
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5 || Date.now() - t0 > 700) return;
    const dir = dx < 0 ? 1 : -1; // izquierda = siguiente, derecha = anterior
    if (dir === 1 && isCurrentOrFuture()) return;
    swipePeriod(dir);
  }, { passive: true });
})();

function swipePeriod(dir) {
  shiftPeriod(dir); // cambio instantáneo, sin animación
}

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
  if (t.dataset.editTx) return openTx(S.transactions.find((x) => x.id === t.dataset.editTx));
  if (t.dataset.editTr) return openTransfer(S.transfers.find((x) => x.id === t.dataset.editTr));
  if (t.dataset.editAcc) return openAccount(accById(t.dataset.editAcc));
  if (t.dataset.role === 'new-account') return openAccount();
  if (t.dataset.role === 'new-transfer') return openTransfer();
  if (t.dataset.role === 'cats') return openCategories(t.dataset.v);
  if (t.dataset.role === 'export-json') return exportJSON();
  if (t.dataset.role === 'export-csv') return exportCSV();
  if (t.dataset.role === 'wipe') return wipe();
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.closest('#sheet')) return;
  if (t.dataset.role === 'account') { UI.account = t.value; render(); }
  if (t.dataset.role === 'currency') { S.currency = t.value; await save(); render(); }
  if (t.dataset.role === 'import-mm' && t.files[0]) { await importMMBackupFile(t.files[0]); t.value = ''; }
  if (t.dataset.role === 'import-json' && t.files[0]) { await importJSONFile(t.files[0]); t.value = ''; }
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

function topTags(n = 14) {
  const count = new Map();
  for (const t of S.transactions) for (const g of t.tags || []) count.set(g, (count.get(g) || 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([g]) => g);
}

// ----- Movimiento -----
function openTx(tx, type = 'expense') {
  const isNew = !tx;
  const d = tx ? { ...tx, tags: [...(tx.tags || [])] } : {
    id: uid(), type, amount: 0, date: isoDate(new Date()),
    accountId: UI.account !== 'all' ? UI.account : (S.lastAccount && accById(S.lastAccount) ? S.lastAccount : S.accounts[0]?.id),
    categoryId: null, note: '', tags: []
  };

  const draw = (sh) => {
    const cats = S.categories.filter((c) => c.type === d.type && (!c.archived || c.id === d.categoryId)).sort((a, b) => a.position - b.position);
    const accs = S.accounts.filter((a) => !a.archived || a.id === d.accountId).sort((a, b) => a.position - b.position);
    const tags = [...new Set([...d.tags, ...topTags()])];
    sh.innerHTML = `<div class="grip"></div>
      <div class="sheet-head">
        <button data-a="cancel">Cancelar</button>
        <h3>${isNew ? 'Nuevo' : 'Editar'} movimiento</h3>
        <button data-a="save">Guardar</button>
      </div>
      <div class="segmented type" data-a="type">
        <button data-v="expense" class="${d.type === 'expense' ? 'active' : ''}">Gasto</button>
        <button data-v="income" class="${d.type === 'income' ? 'active' : ''}">Ingreso</button>
      </div>
      <input class="amount-input num ${d.type}" inputmode="${S.currency === 'CLP' ? 'numeric' : 'decimal'}" placeholder="$0" value="${amountToInput(d.amount)}" data-f="amount" autocomplete="off">
      <div class="card">
        <div class="cat-grid">
          ${cats.map((c) => `<button data-cat="${c.id}" class="${d.categoryId === c.id ? 'sel' : ''}">${iconBubble(c.icon, c.color)}<span class="ellipsis">${esc(c.name)}</span></button>`).join('')}
        </div>
      </div>
      <div class="card list" style="margin-top:12px">
        <div class="field"><label>Cuenta</label><select data-f="accountId">${accs.map((a) => `<option value="${a.id}" ${a.id === d.accountId ? 'selected' : ''}>${icon(a.icon)} ${esc(a.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Fecha</label><input type="date" data-f="date" value="${d.date}"></div>
        <div class="field"><label>Nota</label><input type="text" data-f="note" placeholder="Opcional" value="${esc(d.note)}"></div>
        <div class="field"><label>Etiquetas</label><input type="text" data-f="newtag" placeholder="Escribe y presiona Enter"></div>
        ${tags.length ? `<div class="chips">${tags.map((g) => `<button data-tag="${esc(g)}" class="${d.tags.includes(g) ? 'on' : ''}">${esc(g)}</button>`).join('')}</div>` : ''}
      </div>
      ${isNew ? '' : `<button class="btn danger" data-a="delete" style="margin-top:12px">Eliminar movimiento</button>`}`;
    if (isNew && !d.amount) setTimeout(() => $('[data-f="amount"]', sh)?.focus(), 250);
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
    sh.onclick = async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'cancel') return closeSheet();
      if (b.closest('[data-a="type"]') && b.dataset.v) {
        collect(sh); d.type = b.dataset.v;
        if (catById(d.categoryId)?.type !== d.type) d.categoryId = null;
        return draw(sh);
      }
      if (b.dataset.cat) { collect(sh); d.categoryId = b.dataset.cat; return draw(sh); }
      if (b.dataset.tag !== undefined) {
        collect(sh); const g = b.dataset.tag;
        d.tags = d.tags.includes(g) ? d.tags.filter((x) => x !== g) : [...d.tags, g];
        return draw(sh);
      }
      if (b.dataset.a === 'delete') {
        if (!confirm('¿Eliminar este movimiento?')) return;
        S.transactions = S.transactions.filter((x) => x.id !== d.id);
        await save(); closeSheet(); render(); return toast('Movimiento eliminado');
      }
      if (b.dataset.a === 'save') {
        collect(sh);
        if (!d.amount || d.amount <= 0) return toast('Ingresa un monto');
        if (!d.categoryId) return toast('Elige una categoría');
        if (!d.accountId) return toast('Crea una cuenta primero');
        const now = new Date().toISOString();
        const rec = { id: d.id, type: d.type, amount: d.amount, date: d.date, accountId: d.accountId, categoryId: d.categoryId, note: d.note, tags: d.tags, created: d.created || now, modified: now };
        const i = S.transactions.findIndex((x) => x.id === d.id);
        if (i >= 0) S.transactions[i] = rec; else S.transactions.push(rec);
        S.lastAccount = d.accountId;
        await save(); closeSheet(); render();
        toast(isNew ? 'Movimiento guardado' : 'Cambios guardados');
      }
    };
    sh.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.dataset.f === 'newtag') { e.preventDefault(); collect(sh); draw(sh); $('[data-f="newtag"]', sh).focus(); }
    };
    sh.oninput = (e) => {
      if (e.target.dataset.f === 'amount') {
        const el = e.target; const v = parseAmount(el.value);
        if (S.currency === 'CLP') el.value = v ? amountToInput(v) : '';
      }
    };
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
      ${isNew ? `<div class="field"><label>Saldo inicial</label><input data-x="initial" data-num="1" inputmode="numeric" placeholder="$0"></div>` : ''}
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
function download(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function exportJSON() {
  download(`finanzas-${isoDate(new Date())}.json`, JSON.stringify(S, null, 1), 'application/json');
}

function exportCSV() {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [['Fecha', 'Tipo', 'Monto', 'Categoría', 'Cuenta', 'Nota', 'Etiquetas'].join(';')];
  for (const t of [...S.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push([t.date, t.type === 'income' ? 'Ingreso' : 'Gasto', t.type === 'income' ? t.amount : -t.amount,
      q(catById(t.categoryId)?.name), q(accById(t.accountId)?.name), q(t.note), q((t.tags || []).join(', '))].join(';'));
  }
  for (const t of S.transfers) {
    lines.push([t.date, 'Transferencia', t.amount, '', q(`${accById(t.fromId)?.name} → ${accById(t.toId)?.name}`), q(t.note), ''].join(';'));
  }
  download(`finanzas-${isoDate(new Date())}.csv`, '﻿' + lines.join('\n'), 'text/csv');
}

async function importJSONFile(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.transactions) || !Array.isArray(data.accounts)) throw new Error('Formato no válido');
    if (!confirm(`Esto reemplazará tus datos actuales con ${data.transactions.length} movimientos. ¿Continuar?`)) return;
    S = { ...defaultState(), ...data };
    await save(); render(); toast('Copia restaurada');
  } catch (err) { alert('No se pudo leer el archivo: ' + err.message); }
}

async function wipe() {
  if (!confirm('¿Borrar TODOS los datos de este dispositivo? Esta acción no se puede deshacer.')) return;
  if (!confirm('¿Seguro? Te recomiendo exportar una copia antes.')) return;
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
const FFLATE_URL = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/umd/index.js';

async function importMMBackupFile(file) {
  try {
    toast('Leyendo copia de seguridad…');
    const buf = new Uint8Array(await file.arrayBuffer());
    const data = await parseMMBackup(buf);
    const msg = `Encontré ${data.transactions.length} movimientos, ${data.accounts.length} cuentas, ${data.categories.length} categorías y ${data.transfers.length} transferencias.\n\n` +
      `Esto reemplazará los datos actuales de la app. ¿Importar?`;
    if (!confirm(msg)) return;
    S = { ...defaultState(), ...data };
    UI.account = 'all'; UI.anchor = new Date();
    await save(); render(); toast('¡Importación completa!');
  } catch (err) {
    console.error(err);
    alert('No se pudo importar: ' + err.message);
  }
}

async function parseMMBackup(buf) {
  if (!window.fflate) await loadScript(FFLATE_URL);
  if (!window.initSqlJs) await loadScript(SQLJS_BASE + 'sql-wasm.js');

  const isSqlite = String.fromCharCode(...buf.subarray(0, 15)) === 'SQLite format 3';
  const SQL = await initSqlJs({ locateFile: (f) => SQLJS_BASE + f });
  let dbBytes = buf;
  if (!isSqlite) {
  // Buscar la firma ZIP "PK\x03\x04" (la cabecera suele ser de 8 bytes)
  let start = -1;
  for (let i = 0; i < Math.min(buf.length - 4, 1024); i++) {
    if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x03 && buf[i + 3] === 0x04) { start = i; break; }
  }
  if (start < 0) throw new Error('El archivo no parece una copia de Gestor de Gastos.');
  const files = fflate.unzipSync(buf.subarray(start), { filter: (f) => f.name.endsWith('.db') });
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
    const e = (links[l.entityUid] ||= { Tag: [] });
    if (l.otherType === 'Tag') e.Tag.push(l.otherUid); else e[l.otherType] = l.otherUid;
  }
  const tagNames = Object.fromEntries(rows('SELECT uid, name FROM tag').map((t) => [t.uid, t.name]));

  const firstAcc = accounts[0]?.id || 'main';
  const transactions = rows('SELECT * FROM "transaction" WHERE COALESCE(isRemoved, 0) = 0').map((t) => {
    const l = links[t.uid] || { Tag: [] };
    return {
      id: t.uid, type: String(t.type).toLowerCase() === 'income' ? 'income' : 'expense',
      amount: Math.abs(t.amountInAccountCurrency ?? t.amountInDefaultCurrency ?? 0),
      date: String(t.date).slice(0, 10),
      accountId: l.Account || firstAcc,
      categoryId: l.Category || (String(t.type).toLowerCase() === 'income' ? 'other_income' : 'other_expense'),
      note: (t.comment || '').trim(),
      tags: l.Tag.map((id) => tagNames[id]).filter(Boolean),
      hasPhoto: !!l.Photo,
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

  return { version: 1, currency: settings.defaultCurrencyCode || 'CLP', accounts, categories, transactions, transfers };
}

// ---------- Inicio ----------
(async function init() {
  try { S = await DB.get('state'); } catch (e) { console.error(e); }
  if (!S) { S = defaultState(); await save(); }
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
})();

// Exponer para pruebas
window.__finanzas = { parseMMBackup, get state() { return S; } };
