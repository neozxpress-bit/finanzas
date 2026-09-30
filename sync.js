'use strict';

/* =========================================================
   Sincronización en la nube (Supabase)
   - Inicio de sesión con usuario + PIN (función pin-login)
   - Cada cuenta, categoría, movimiento y transferencia es un registro en la tabla `records`
   - Se sube lo que cambió (comparando con la última versión sincronizada) y se baja lo nuevo
   - Fotos en el bucket privado `photos/<usuario>/<id>`
   ========================================================= */

const SB_URL = 'https://bovhituagnfjnfeslmfn.supabase.co';
const SB_KEY = 'sb_publishable__gaaI9q7cZ0_ZsZTYa6nog_EhpvEAIA'; // clave pública (segura por las políticas RLS)
const sb = supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'finanzas-auth' } });

const Sync = {
  user: null,          // { id, username }
  shadow: new Map(),   // "tipo:id" → JSON de la última versión sincronizada
  cursor: null,        // updated_at del último registro bajado
  running: false,
  again: false,
  lastOk: null,
  status: '',
  timer: null
};

// ---------- Estado local ⇄ registros ----------
function localRecords() {
  const m = new Map();
  const put = (kind, id, data) => m.set(`${kind}:${id}`, { kind, id, data, json: JSON.stringify(data) });
  for (const a of S.accounts) put('account', a.id, a);
  for (const c of S.categories) put('category', c.id, c);
  for (const t of S.transactions) put('transaction', t.id, t);
  for (const t of S.transfers) put('transfer', t.id, t);
  put('settings', 'main', { currency: S.currency, lastAccount: S.lastAccount || null });
  return m;
}

const LISTS = { account: 'accounts', category: 'categories', transaction: 'transactions', transfer: 'transfers' };
function applyRemote(row) {
  if (row.kind === 'settings') {
    if (!row.deleted && row.data) { S.currency = row.data.currency || S.currency; S.lastAccount = row.data.lastAccount || S.lastAccount; }
    return;
  }
  const list = S[LISTS[row.kind]];
  if (!list) return;
  const i = list.findIndex((x) => x.id === row.id);
  if (row.deleted) { if (i >= 0) list.splice(i, 1); return; }
  if (i >= 0) list[i] = row.data; else list.push(row.data);
}

async function loadSyncMeta() {
  const meta = (await DB.get('syncMeta').catch(() => null)) || {};
  Sync.shadow = new Map(Object.entries(meta.shadow || {}));
  Sync.cursor = meta.cursor || null;
  Sync.lastOk = meta.lastOk || null;
}
function saveSyncMeta() {
  return DB.set('syncMeta', { shadow: Object.fromEntries(Sync.shadow), cursor: Sync.cursor, lastOk: Sync.lastOk });
}

// ---------- Subir / bajar ----------
async function pushChanges() {
  const local = localRecords();
  const rows = [];
  for (const [key, r] of local) if (Sync.shadow.get(key) !== r.json) rows.push({ user_id: Sync.user.id, kind: r.kind, id: r.id, data: r.data, deleted: false });
  const deletes = [];
  for (const key of Sync.shadow.keys()) if (!local.has(key)) {
    const [kind, ...rest] = key.split(':');
    deletes.push({ user_id: Sync.user.id, kind, id: rest.join(':'), data: null, deleted: true });
  }
  // Protección: si este dispositivo "perdió" muchos registros, no se borran en la nube
  if (deletes.length > 20 && deletes.length > Sync.shadow.size * 0.03 && !Sync.allowMassDelete) {
    const err = new Error(`MASS_DELETE:${deletes.length}`); err.massDelete = deletes.length; throw err;
  }
  Sync.allowMassDelete = false;
  rows.push(...deletes);
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    if (rows.length > 500) setSyncStatus(`Subiendo ${Math.min(i + 500, rows.length)} de ${rows.length}…`);
    const { error } = await sb.from('records').upsert(chunk, { onConflict: 'user_id,kind,id' });
    if (error) throw error;
    for (const r of chunk) {
      const key = `${r.kind}:${r.id}`;
      if (r.deleted) Sync.shadow.delete(key); else Sync.shadow.set(key, JSON.stringify(r.data));
    }
  }
  return rows.length;
}

async function pullChanges() {
  let changed = 0;
  const local = localRecords();
  const dirty = new Set();
  for (const [key, r] of local) if (Sync.shadow.get(key) !== r.json) dirty.add(key);
  for (;;) {
    let q = sb.from('records').select('kind,id,data,deleted,updated_at').order('updated_at', { ascending: true }).limit(1000);
    if (Sync.cursor) q = q.gt('updated_at', Sync.cursor);
    const { data, error } = await q;
    if (error) throw error;
    for (const row of data) {
      const key = `${row.kind}:${row.id}`;
      Sync.cursor = row.updated_at;
      if (dirty.has(key)) continue; // hay un cambio local pendiente: se sube en la próxima vuelta
      const json = row.deleted ? null : JSON.stringify(row.data);
      if (row.deleted ? !Sync.shadow.has(key) && !local.has(key) : Sync.shadow.get(key) === json) continue; // ya estaba igual
      applyRemote(row);
      if (row.deleted) Sync.shadow.delete(key); else Sync.shadow.set(key, json);
      changed++;
    }
    if (data.length < 1000) break;
    setSyncStatus(`Descargando… ${changed} cambios`);
  }
  return changed;
}

// ---------- Fotos ----------
const photoPath = (id) => `${Sync.user.id}/${id}`;

async function pushPhotos() {
  const ids = (await DB.photoKeys().catch(() => [])) || [];
  const pending = [];
  for (const id of ids) { const rec = await DB.getPhoto(id); if (rec && !rec.synced) pending.push([id, rec]); }
  let n = 0;
  for (const [id, rec] of pending) {
    setSyncStatus(`Subiendo fotos ${++n} de ${pending.length}…`);
    const { error } = await sb.storage.from('photos').upload(photoPath(id), rec.blob, { contentType: rec.type || 'image/jpeg', upsert: true });
    if (error && !/exists/i.test(error.message)) throw error;
    await DB.putPhotos([[id, { ...rec, synced: true }]]);
  }
  return pending.length;
}

// Llamado por app.js cuando una foto no está en este dispositivo
window.fetchRemotePhoto = async (id) => {
  if (!Sync.user || !navigator.onLine) return null;
  const { data, error } = await sb.storage.from('photos').download(photoPath(id));
  if (error || !data) return null;
  const rec = { blob: data, type: data.type || 'image/jpeg', synced: true };
  await DB.putPhotos([[id, rec]]);
  return rec;
};

// Llamado por app.js al borrar fotos
window.onPhotosDeleted = (ids) => {
  if (!Sync.user || !ids.length) return;
  sb.storage.from('photos').remove(ids.map(photoPath)).catch(() => {});
};

// ---------- Ciclo de sincronización ----------
function setSyncStatus(s) {
  Sync.status = s;
  const el = document.querySelector('[data-role="sync-status"]');
  if (el) el.textContent = s;
}

async function syncNow({ quiet = true } = {}) {
  if (!Sync.user) return;
  if (Sync.running) { Sync.again = true; return; }
  if (!navigator.onLine) { setSyncStatus('Sin conexión: se sincronizará al volver internet'); return; }
  Sync.running = true;
  try {
    setSyncStatus('Sincronizando…');
    const pushed = await pushChanges();
    const pulled = await pullChanges();
    if (pulled) { await DB.set('state', S); render(); }
    Sync.lastOk = new Date().toISOString();
    await saveSyncMeta();
    setSyncStatus(syncSummary());
    if (!quiet) toast(pulled || pushed ? `Sincronizado: ${pushed} subidos, ${pulled} bajados` : 'Todo al día');
    pushPhotos().then((n) => { if (n) setSyncStatus(syncSummary()); }).catch((e) => console.warn('fotos', e));
  } catch (err) {
    console.error(err);
    if (err.massDelete) {
      setSyncStatus('Sincronización detenida por seguridad');
      Sync.running = false;
      if (confirm(`Por seguridad detuve la sincronización: este dispositivo iba a borrar ${err.massDelete} registros de la nube.\n\n` +
        `Aceptar: reemplazar los datos de este dispositivo con los de la nube (recomendado).\nCancelar: no hacer nada por ahora.`)) {
        await replaceLocalWithCloud();
      }
      return;
    }
    setSyncStatus('Error al sincronizar: ' + (err.message || err));
    if (!quiet) toast('No se pudo sincronizar');
  } finally {
    Sync.running = false;
    if (Sync.again) { Sync.again = false; setTimeout(syncNow, 300); }
  }
}

function syncSummary() {
  if (!Sync.lastOk) return 'Aún no sincronizado';
  const s = Math.round((Date.now() - new Date(Sync.lastOk)) / 1000);
  return 'Sincronizado ' + (s < 60 ? 'recién' : s < 3600 ? `hace ${Math.round(s / 60)} min` : new Date(Sync.lastOk).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }));
}

// app.js avisa después de cada guardado
window.onStateSaved = () => {
  if (!Sync.user) return;
  clearTimeout(Sync.timer);
  Sync.timer = setTimeout(syncNow, 1500);
};

// ---------- Primera sincronización de un dispositivo ----------
async function firstSync() {
  const { count, error } = await sb.from('records').select('id', { count: 'exact', head: true }).eq('deleted', false);
  if (error) throw error;
  const localTx = S.transactions.length;
  if (!count) {
    // La nube está vacía: subir todo lo de este dispositivo
    Sync.shadow = new Map(); Sync.cursor = null;
    toast('Subiendo tus datos a la nube…');
    return syncNow({ quiet: false });
  }
  if (localTx && !confirm(
    `Tu cuenta en la nube ya tiene datos.\n\n` +
    `Los ${localTx} movimientos de este dispositivo se reemplazarán por los de la nube.\n` +
    `(Si quieres, cancela y exporta antes una copia desde Más → Exportar copia de seguridad.)\n\n¿Continuar?`)) {
    Sync.user = null; localStorage.removeItem('finanzas-user'); await sb.auth.signOut().catch(() => {});
    toast('No se inició sesión. Tus datos siguen igual.');
    return;
  }
  await replaceLocalWithCloud();
}

// Bajar todo desde la nube y reemplazar lo de este dispositivo (se guarda de inmediato)
async function replaceLocalWithCloud() {
  const keepCurrency = S.currency;
  S = { ...defaultState(), accounts: [], categories: [], transactions: [], transfers: [], currency: keepCurrency };
  Sync.shadow = new Map(); Sync.cursor = null;
  await DB.clearPhotos().catch(() => {}); photoURLs.clear();
  setSyncStatus('Descargando tus datos…');
  await pullChanges();
  await DB.set('state', S);
  Sync.lastOk = new Date().toISOString();
  await saveSyncMeta();
  UI.account = 'all'; render();
  toast(`Listo: ${S.transactions.length} movimientos descargados`);
  setSyncStatus(syncSummary());
}

// ---------- Inicio de sesión ----------
async function pinLogin(username, pin, mode) {
  const res = await fetch(`${SB_URL}/functions/v1/pin-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY },
    body: JSON.stringify({ username, pin, mode })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.session) throw new Error(body.error || 'No se pudo iniciar sesión');
  const { data, error } = await sb.auth.setSession(body.session);
  if (error) throw error;
  return { id: data.user.id, username: body.username };
}

function openLogin({ canSkip = true } = {}) {
  let mode = 'login';
  const el = document.createElement('div');
  el.className = 'login-screen';
  const draw = (msg = '') => {
    el.innerHTML = `<div class="login-box">
      <img src="icon-192.png?v=13" alt="" class="login-logo">
      <h2 class="login-title">Finanzas</h2>
      <p class="muted small" style="text-align:center;margin:0 0 18px">Tus datos sincronizados en todos tus dispositivos</p>
      <div class="segmented" data-l="mode">
        <button data-m="login" class="${mode === 'login' ? 'active' : ''}">Entrar</button>
        <button data-m="register" class="${mode === 'register' ? 'active' : ''}">Crear usuario</button>
      </div>
      <input class="login-input" data-l="user" placeholder="Usuario" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false">
      <input class="login-input" data-l="pin" placeholder="PIN (4 a 8 números)" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" maxlength="8">
      ${mode === 'register' ? '<input class="login-input" data-l="pin2" placeholder="Repite el PIN" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="new-password" maxlength="8">' : ''}
      <div class="login-msg">${esc(msg)}</div>
      <button class="btn save-btn" data-l="go">${mode === 'login' ? 'Entrar' : 'Crear y entrar'}</button>
      ${canSkip ? '<button class="login-skip" data-l="skip">Seguir sin sincronizar</button>' : ''}
    </div>`;
  };
  draw();
  document.body.appendChild(el);
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.m) { const u = el.querySelector('[data-l="user"]').value; mode = b.dataset.m; draw(); el.querySelector('[data-l="user"]').value = u; return; }
    if (b.dataset.l === 'skip') { localStorage.setItem('finanzas-skip-login', '1'); el.remove(); return; }
    if (b.dataset.l !== 'go') return;
    const user = el.querySelector('[data-l="user"]').value.trim().toLowerCase();
    const pin = el.querySelector('[data-l="pin"]').value;
    const msgEl = el.querySelector('.login-msg');
    if (mode === 'register' && pin !== el.querySelector('[data-l="pin2"]').value) { msgEl.textContent = 'Los PIN no coinciden.'; return; }
    b.disabled = true; b.textContent = 'Conectando…'; msgEl.textContent = '';
    try {
      Sync.user = await pinLogin(user, pin, mode);
      localStorage.setItem('finanzas-user', JSON.stringify(Sync.user));
      localStorage.removeItem('finanzas-skip-login');
      el.remove();
      toast(`Hola, ${Sync.user.username}`);
      await firstSync();
    } catch (err) {
      msgEl.textContent = err.message;
      b.disabled = false; b.textContent = mode === 'login' ? 'Entrar' : 'Crear y entrar';
    }
  });
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') el.querySelector('[data-l="go"]').click(); });
}

async function logout() {
  if (!confirm('¿Cerrar sesión en este dispositivo?\n\nTus datos quedan guardados en la nube y en este dispositivo, pero dejarán de sincronizarse aquí.')) return;
  await sb.auth.signOut().catch(() => {});
  Sync.user = null;
  localStorage.removeItem('finanzas-user');
  await DB.set('syncMeta', {});
  Sync.shadow = new Map(); Sync.cursor = null; Sync.lastOk = null;
  render();
  toast('Sesión cerrada');
}

// Sección en "Más"
window.syncSectionHtml = () => Sync.user ? `
  <h2>Sincronización</h2>
  <div class="card list">
    <div class="item"><span class="icon sm" style="background:#12b857">☁︎</span>
      <div class="grow">Conectado como <b>${esc(Sync.user.username)}</b><div class="small muted" data-role="sync-status">${esc(Sync.status || syncSummary())}</div></div></div>
    <button class="item" data-role="sync-now"><span class="icon sm" style="background:#2e78cf">⟳</span><div class="grow">Sincronizar ahora</div></button>
    <button class="item" data-role="logout"><span class="icon sm" style="background:#555">⎋</span><div class="grow">Cerrar sesión</div></button>
  </div>
  <h2>Recordatorios de pago</h2>
  <div class="card list">
    <div class="item"><span class="icon sm" style="background:#ec8207">🔔</span>
      <div class="grow">Avisos de tarjetas<div class="small muted" data-role="push-status">${esc(pushStatusText())}</div></div></div>
    <button class="item" data-role="push-enable"><span class="icon sm" style="background:#12b857">✓</span><div class="grow">Activar notificaciones en este dispositivo</div></button>
    <button class="item" data-role="push-test"><span class="icon sm" style="background:#2e78cf">▶︎</span><div class="grow">Enviar notificación de prueba</div></button>
  </div>
  <p class="small muted" style="margin:6px 4px 0">Te aviso 2 días antes del día de pago de cada cuenta marcada como tarjeta de crédito (en Cuentas → tocar la cuenta → 💳).</p>` : `
  <h2>Sincronización</h2>
  <div class="card list">
    <button class="item" data-role="login"><span class="icon sm" style="background:#12b857">☁︎</span>
      <div class="grow">Iniciar sesión para sincronizar<div class="small muted">Mismos datos en tu iPhone, Mac y otros dispositivos</div></div><span class="muted">›</span></button>
  </div>`;

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-role]');
  if (!t) return;
  if (t.dataset.role === 'login') openLogin();
  if (t.dataset.role === 'logout') logout();
  if (t.dataset.role === 'sync-now') syncNow({ quiet: false });
  if (t.dataset.role === 'push-enable') enablePush();
  if (t.dataset.role === 'push-test') testPush();
});

// ---------- Notificaciones push ----------
const REMINDERS_URL = `${SB_URL}/functions/v1/send-reminders`;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function pushStatusText() {
  if (!pushSupported()) return isStandalone() ? 'Este dispositivo no admite notificaciones (requiere iOS 16.4 o superior)' : 'Abre la app desde el ícono de tu pantalla de inicio para activarlas';
  if (Notification.permission === 'denied') return 'Bloqueadas: actívalas en Ajustes del iPhone → Notificaciones → Finanzas';
  if (Notification.permission === 'granted') return localStorage.getItem('finanzas-push') ? 'Activadas en este dispositivo ✓' : 'Permiso dado: toca "Activar" para terminar';
  return 'Desactivadas';
}
function refreshPushStatus() { const el = document.querySelector('[data-role="push-status"]'); if (el) el.textContent = pushStatusText(); }
const b64ToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

async function enablePush() {
  if (!Sync.user) return toast('Inicia sesión primero');
  if (!pushSupported()) return alert(pushStatusText());
  // El permiso se pide en el mismo toque (requisito de iPhone)
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { refreshPushStatus(); return toast('No se dio permiso de notificaciones'); }
  try {
    const { publicKey } = await (await fetch(REMINDERS_URL)).json();
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    const j = sub.toJSON();
    const device = /iPhone|iPad/.test(navigator.userAgent) ? 'iPhone' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'Otro';
    const { error } = await sb.from('push_subscriptions').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device, user_id: Sync.user.id }, { onConflict: 'endpoint' });
    if (error) throw error;
    localStorage.setItem('finanzas-push', '1');
    refreshPushStatus();
    toast('Notificaciones activadas ✓');
  } catch (err) {
    console.error(err);
    alert('No se pudieron activar: ' + (err.message || err));
  }
}

async function testPush() {
  if (!Sync.user) return toast('Inicia sesión primero');
  const { data } = await sb.auth.getSession();
  const res = await fetch(REMINDERS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SB_KEY, Authorization: `Bearer ${data.session?.access_token}` }, body: '{"test":true}' });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) return alert(r.error || 'No se pudo enviar');
  if (!r.suscripciones) return alert('Este dispositivo aún no tiene las notificaciones activadas. Toca "Activar notificaciones" primero.');
  toast(r.enviadas ? `Notificación enviada a ${r.enviadas} dispositivo(s)` : 'No se pudo entregar: ' + (r.errores?.[0] || 'revisa el permiso'));
}

// ---------- Arranque ----------
(async function initSync() {
  await window.appReady;
  await loadSyncMeta();
  const { data } = await sb.auth.getSession();
  const saved = JSON.parse(localStorage.getItem('finanzas-user') || 'null');
  if (data.session && saved && saved.id === data.session.user.id) {
    Sync.user = saved;
    if (!Sync.lastOk) await firstSync(); else syncNow();
  } else if (!localStorage.getItem('finanzas-skip-login')) {
    openLogin();
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  window.addEventListener('online', () => syncNow());
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
})();
