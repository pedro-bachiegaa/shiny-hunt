import { UNOVA } from './data.js';
import { createStore } from './store.js';

/* ───────── Constantes ───────── */
const SPR = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const sprite = {
  animShiny: (id) => `${SPR}/versions/generation-v/black-white/animated/shiny/${id}.gif`,
  stillShiny: (id) => `${SPR}/versions/generation-v/black-white/shiny/${id}.png`,
  still: (id) => `${SPR}/versions/generation-v/black-white/${id}.png`,
  art: (id) => `${SPR}/other/official-artwork/${id}.png`,
  artShiny: (id) => `${SPR}/other/official-artwork/shiny/${id}.png`,
};
const GAMES = { black: 'Pokémon Black', white: 'Pokémon White', black2: 'Pokémon Black 2', white2: 'Pokémon White 2' };
const isB2W2 = (g) => g === 'black2' || g === 'white2';
const METHODS = {
  random: { label: 'Encontros aleatórios', inc: 1, unit: 'encontros' },
  reset: { label: 'Soft reset (estático / presente)', inc: 1, unit: 'resets' },
  masuda: { label: 'Método Masuda (breeding)', inc: 1, unit: 'ovos' },
  horde: { label: 'Hordas (5 por encontro)', inc: 5, unit: 'Pokémon' },
};
const BY_ID = new Map(UNOVA.map((p) => [p.id, p]));
const SESSION_KEY = 'shiny-hunt:session';

/* ───────── Utilidades ───────── */
const h = (tag, attrs, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style') e.style.cssText = v;
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
};

function img(chain, alt = '') {
  const urls = chain.slice();
  const el = h('img', { alt, loading: 'lazy', src: urls.shift() });
  el.addEventListener('error', () => { if (urls.length) el.src = urls.shift(); });
  return el;
}
const huntSprite = (id) => img([sprite.animShiny(id), sprite.stillShiny(id), sprite.artShiny(id)], BY_ID.get(id)?.name);
const shinyStill = (id) => img([sprite.stillShiny(id), sprite.artShiny(id)], BY_ID.get(id)?.name);
const normalStill = (id) => img([sprite.still(id), sprite.art(id)], BY_ID.get(id)?.name);

const hue = (s) => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) % 360; return x; };
const color = (name) => `hsl(${hue(name || '?')} 75% 66%)`;
const fmtN = (n) => Number(n).toLocaleString('pt-BR');
const pad = (n) => String(n).padStart(3, '0');

function fmtDur(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440), hr = Math.floor((m % 1440) / 60), mi = m % 60;
  if (d) return `${d}d ${hr}h`;
  if (hr) return `${hr}h ${mi}min`;
  return `${mi} min`;
}
const fmtDate = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

// Gen 5: base 1/8192. Masuda +5 rolls, Shiny Charm (só B2/W2) +2 rolls.
function rolls(hunt) {
  return 1 + (hunt.method === 'masuda' ? 5 : 0) + (hunt.charm && isB2W2(hunt.game) ? 2 : 0);
}
const oddsDen = (hunt) => Math.round(8192 / rolls(hunt));
const chanceDone = (hunt) => 1 - Math.pow(1 - 1 / oddsDen(hunt), hunt.count || 0);

let toastT;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ───────── Confete ───────── */
function confetti() {
  const c = document.getElementById('confetti');
  const ctx = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const cols = ['#ffd166', '#ff9f1c', '#ffffff', '#8b5cf6', '#38bdf8'];
  const ps = Array.from({ length: 160 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5,
    vx: (Math.random() - 0.5) * 4, vy: 2 + Math.random() * 5,
    s: 4 + Math.random() * 7, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    col: cols[(Math.random() * cols.length) | 0],
  }));
  const end = performance.now() + 3800;
  (function frame(now) {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of ps) {
      p.x += p.vx; p.y += p.vy; p.r += p.vr; p.vy += 0.03;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.col; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
    }
    if (now < end) requestAnimationFrame(frame); else ctx.clearRect(0, 0, c.width, c.height);
  })(performance.now());
}

/* ───────── Estado ───────── */
const state = {
  session: null, // { name, room }
  hunts: [],
  tab: 'hunts',
  dexFilter: 'all',
  store: null,
  online: true,
  error: null,
};
const root = document.getElementById('app');
let cards = new Map();
let unsub = null;

const loadSession = () => { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } };
const saveSession = (s) => localStorage.setItem(SESSION_KEY, JSON.stringify(s));

// A dupla é fixa: não há salas. Para mudar os nomes, edite PLAYERS (e as caçadas iniciais em SEED).
const PLAYERS = ['Pedro', 'Thiago'];
const ROOM = 'dupla'; // caminho único no banco, compartilhado pelos dois
const SEED_KEY = 'shiny-hunt:seeded';
const SEED = [
  { id: 'seed-tepig', pokemonId: 498, hunter: PLAYERS[0] }, // Tepig
  { id: 'seed-snivy', pokemonId: 495, hunter: PLAYERS[1] }, // Snivy
];

// Na primeira vez que o app abre com o banco vazio, já cria as duas caçadas atuais.
function seedIfEmpty(list) {
  if (localStorage.getItem(SEED_KEY)) return;
  localStorage.setItem(SEED_KEY, '1');
  if (list.length) return;
  const now = Date.now();
  SEED.forEach((x) => state.store.save({
    ...x, status: 'active', startedAt: now, game: 'black2', method: 'random', charm: false, count: 0, notes: '',
  }));
}

/* ───────── Boot ───────── */
async function start(session) {
  state.session = session;
  saveSession(session);
  state.hunts = [];
  state.error = null;
  state.store = await createStore(ROOM);
  unsub && unsub();
  unsub = state.store.subscribe(
    (list) => { state.hunts = list; renderView(); seedIfEmpty(list); },
    (err) => { state.error = err?.message || 'erro'; renderShell(); toast('Sem permissão no Firebase — veja as regras no README'); },
  );
  state.store.onStatus((on) => { state.online = on; updateStatus(); });
  renderShell();
}

function leave() {
  unsub && unsub();
  localStorage.removeItem(SESSION_KEY);
  state.session = null; state.store = null; state.hunts = [];
  renderWelcome();
}

/* ───────── Boas-vindas ───────── */
function renderWelcome() {
  root.replaceChildren(h('div', { class: 'wrap' },
    h('div', { class: 'welcome' },
      h('div', { class: 'logo' }, '✨ ', h('b', null, 'Unova Shiny Hunt')),
      h('p', { style: 'color:var(--muted);margin:0' }, 'Caçada shiny da 5ª geração, com contadores sincronizados.'),
      h('div', { class: 'card' },
        h('div', { style: 'font-weight:700' }, 'Quem é você?'),
        PLAYERS.map((n) => h('button', {
          class: 'btn-primary', style: 'font-size:1.05rem', onclick: () => start({ name: n }),
        }, n)),
      ),
    ),
  ));
}

/* ───────── Estrutura principal ───────── */
function renderShell() {
  const s = state.session;
  const tabs = [['hunts', '🎯 Caçadas'], ['dex', '📖 Shiny Dex'], ['history', '🏆 Histórico']];
  root.replaceChildren(h('div', { class: 'wrap' },
    h('header', { class: 'top' },
      h('div', { class: 'logo' }, '✨ ', h('b', null, 'Unova Shiny Hunt')),
      h('div', { class: 'spacer' }),
      h('span', { class: 'chip', id: 'status' }),
      h('span', { class: 'chip', style: `color:${color(s.name)}` }, '👤 ' + s.name),
      h('button', { class: 'chip btn', onclick: leave }, 'Trocar'),
    ),
    state.store.mode === 'local' && h('div', { class: 'banner' },
      '⚠️ Modo local: os dados ficam só neste navegador. Para sincronizar com o Thiago, configure o Firebase (veja o README).'),
    state.error && h('div', { class: 'banner' }, '⚠️ Não consegui ler/gravar no Firebase: ' + state.error + '. Confira as regras do banco (README).'),
    h('nav', { class: 'tabs' }, tabs.map(([id, label]) =>
      h('button', { class: state.tab === id ? 'on' : '', onclick: () => { state.tab = id; renderShell(); } }, label))),
    h('main', { id: 'view' }),
  ));
  updateStatus();
  renderView(true);
}

function updateStatus() {
  const el = document.getElementById('status');
  if (!el) return;
  const local = state.store?.mode === 'local';
  el.replaceChildren(h('i', { class: 'dot' + (state.online ? ' on' : '') }), local ? 'Local' : state.online ? 'Sincronizado' : 'Offline');
}

function renderView() {
  const view = document.getElementById('view');
  if (!view) return;
  if (state.tab === 'hunts') renderHunts(view);
  else { cards = new Map(); delete view.dataset.built; (state.tab === 'dex' ? renderDex : renderHistory)(view); }
}

/* ───────── Caçadas ───────── */
function renderHunts(view) {
  if (view.dataset.built !== 'hunts') {
    cards = new Map();
    view.dataset.built = 'hunts';
    view.replaceChildren(
      h('div', { class: 'toolbar' }, h('button', { class: 'btn-primary', onclick: () => openHuntDialog() }, '➕ Nova caçada')),
      h('div', { class: 'grid', id: 'grid' }),
      h('div', { class: 'empty', id: 'empty' }, h('div', { class: 'big' }, '✨'), h('p', null, 'Nenhuma caçada ativa. Comece uma nova!')),
    );
  }
  const grid = document.getElementById('grid');
  const active = state.hunts.filter((x) => x.status === 'active').sort((a, b) => a.startedAt - b.startedAt || PLAYERS.indexOf(a.hunter) - PLAYERS.indexOf(b.hunter) || a.id.localeCompare(b.id));
  const seen = new Set();
  active.forEach((hunt, i) => {
    let c = cards.get(hunt.id);
    if (!c) { c = buildCard(hunt); cards.set(hunt.id, c); }
    updateCard(c, hunt);
    seen.add(hunt.id);
    if (grid.children[i] !== c.el) grid.insertBefore(c.el, grid.children[i] || null);
  });
  for (const [id, c] of cards) if (!seen.has(id)) { c.el.remove(); cards.delete(id); }
  document.getElementById('empty').style.display = active.length ? 'none' : '';
}

function getHunt(id) { return state.hunts.find((x) => x.id === id); }

function bump(id, dir) {
  const hunt = getHunt(id);
  if (!hunt) return;
  const step = METHODS[hunt.method]?.inc || 1;
  const delta = dir * step;
  if ((hunt.count || 0) + delta < 0) return;
  state.store.bump(id, delta);
}

function buildCard(hunt) {
  const refs = {};
  const el = h('article', { class: 'hunt' },
    h('div', { class: 'head' },
      h('div', { class: 'sprite-box' }, huntSprite(hunt.pokemonId), h('span', { class: 'spark' }, '✨')),
      h('div', { style: 'min-width:0' },
        h('div', { class: 'dexno' }, '#' + pad(hunt.pokemonId)),
        h('h3', null, BY_ID.get(hunt.pokemonId)?.name || '???'),
        (refs.meta = h('div', { class: 'meta' })),
      ),
    ),
    h('div', { class: 'counter' }, (refs.n = h('div', { class: 'n' }, '0')), (refs.unit = h('div', { class: 'lbl' }))),
    h('div', { class: 'bar' }, (refs.bar = h('i'))),
    h('div', { class: 'stats' },
      h('div', null, 'Chance por encontro', (refs.odds = h('b'))),
      h('div', null, 'Chance de já ter vindo', (refs.pct = h('b'))),
      h('div', null, 'Tempo de caça', (refs.time = h('b'))),
      h('div', null, 'Média por dia', (refs.rate = h('b'))),
    ),
    h('div', { class: 'tap' },
      h('button', { title: 'Desfazer um', onclick: () => bump(hunt.id, -1) }, '−'),
      (refs.plus = h('button', { class: 'plus', onclick: () => bump(hunt.id, 1) })),
    ),
    h('div', { class: 'row' },
      h('button', { class: 'btn-primary small', onclick: () => openFoundDialog(hunt.id) }, '✨ Achei o shiny!'),
      h('button', { class: 'btn-ghost small', onclick: () => openHuntDialog(hunt.id) }, '✏️ Editar'),
    ),
  );
  return { el, refs };
}

function updateCard({ refs }, hunt) {
  const m = METHODS[hunt.method] || METHODS.random;
  const den = oddsDen(hunt);
  const count = hunt.count || 0;
  refs.n.textContent = fmtN(count);
  refs.unit.textContent = m.unit;
  refs.plus.textContent = '+' + m.inc;
  refs.odds.textContent = '1 / ' + fmtN(den);
  const pct = chanceDone(hunt) * 100;
  refs.pct.textContent = (pct >= 99.95 ? '99.9' : pct.toFixed(1)) + '%';
  refs.bar.style.width = Math.min(100, (count / den) * 100) + '%';
  const elapsed = Date.now() - (hunt.startedAt || Date.now());
  refs.time.textContent = fmtDur(elapsed);
  refs.rate.textContent = fmtN(Math.round(count / Math.max(elapsed / 86400000, 1)));
  refs.meta.replaceChildren(...[
    h('span', { class: 'tag hunter', style: `background:${color(hunt.hunter)}33;color:${color(hunt.hunter)}` }, hunt.hunter),
    h('span', { class: 'tag' }, GAMES[hunt.game] || hunt.game),
    h('span', { class: 'tag' }, m.label.split(' (')[0]),
    hunt.charm && isB2W2(hunt.game) && h('span', { class: 'tag' }, '🍀 Shiny Charm'),
  ].filter(Boolean));
}

setInterval(() => { if (state.tab === 'hunts') for (const [id, c] of cards) { const x = getHunt(id); x && updateCard(c, x); } }, 30000);

/* ───────── Diálogos ───────── */
function openDialog(content) {
  const dlg = h('dialog', null, content);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.body.append(dlg);
  dlg.showModal();
  return dlg;
}

function openHuntDialog(editId, presetPokemon) {
  const editing = editId ? getHunt(editId) : null;
  const v = {
    pokemonId: editing?.pokemonId ?? presetPokemon ?? null,
  };
  const hunter = h('select', null, PLAYERS.map((n) => h('option', { value: n }, n)));
  hunter.value = editing?.hunter || state.session.name;
  const game = h('select', null, Object.entries(GAMES).map(([k, l]) => h('option', { value: k }, l)));
  const method = h('select', null, Object.entries(METHODS).map(([k, m]) => h('option', { value: k }, m.label)));
  const charm = h('input', { type: 'checkbox' });
  const charmRow = h('label', { class: 'check' }, charm, '🍀 Tenho o Shiny Charm (só Black 2 / White 2)');
  const count = h('input', { type: 'number', min: 0, step: 1, value: editing?.count ?? 0 });
  const notes = h('textarea', { rows: 2, placeholder: 'Local, natureza desejada, etc.' }, editing?.notes || '');
  const note = h('div', { class: 'odds-note' });
  game.value = editing?.game || 'black2';
  method.value = editing?.method || 'random';
  charm.checked = !!editing?.charm;

  const refreshOdds = () => {
    charmRow.style.display = isB2W2(game.value) ? '' : 'none';
    const probe = { method: method.value, game: game.value, charm: charm.checked };
    const r = rolls(probe);
    note.replaceChildren('Chance por Pokémon: ', h('b', null, '1 / ' + fmtN(oddsDen(probe))), ` (${r}/8192${r > 1 ? ' — com bônus' : ''}).`);
  };
  [game, method, charm].forEach((x) => x.addEventListener('change', refreshOdds));

  let pickSection = null;
  if (!editing) {
    const search = h('input', { type: 'text', placeholder: 'Buscar por nome ou número…' });
    const grid = h('div', { class: 'pick-grid' });
    const busy = new Set(state.hunts.filter((x) => x.status === 'active').map((x) => x.pokemonId));
    const done = new Set(state.hunts.filter((x) => x.status === 'found').map((x) => x.pokemonId));
    const paint = () => {
      const q = search.value.trim().toLowerCase();
      grid.replaceChildren(...UNOVA.filter((p) => !q || p.name.toLowerCase().includes(q) || String(p.id).includes(q) || pad(p.id).includes(q))
        .map((p) => h('button', {
          type: 'button', class: 'pick' + (v.pokemonId === p.id ? ' sel' : '') + (busy.has(p.id) || done.has(p.id) ? ' dim' : ''),
          title: busy.has(p.id) ? 'Já em caça' : done.has(p.id) ? 'Já capturado shiny' : p.name,
          onclick: () => { v.pokemonId = p.id; paint(); },
        }, normalStill(p.id), h('span', null, p.name))));
    };
    search.addEventListener('input', paint);
    paint();
    pickSection = h('div', { class: 'f', style: 'display:flex;flex-direction:column;gap:8px' }, h('span', { style: 'color:var(--muted);font-size:.82rem' }, 'Pokémon'), search, grid);
  }

  const dlg = openDialog(h('form', {
    class: 'dlg', method: 'dialog',
    onsubmit: (e) => {
      e.preventDefault();
      if (!v.pokemonId) return toast('Escolha um Pokémon');
      const name = hunter.value.trim() || state.session.name;
      const data = {
        hunter: name, game: game.value, method: method.value, charm: charm.checked && isB2W2(game.value),
        count: Math.max(0, parseInt(count.value, 10) || 0), notes: notes.value.trim(),
      };
      if (editing) state.store.patch(editing.id, data);
      else state.store.save({ id: crypto.randomUUID(), pokemonId: v.pokemonId, status: 'active', startedAt: Date.now(), ...data });
      dlg.close();
      toast(editing ? 'Caçada atualizada' : 'Caçada iniciada! Boa sorte ✨');
    },
  },
    h('h2', null, editing ? `Editar · ${BY_ID.get(editing.pokemonId)?.name}` : 'Nova caçada'),
    pickSection,
    h('label', { class: 'f' }, 'Quem está caçando', hunter),
    h('div', { class: 'row' }, h('label', { class: 'f' }, 'Jogo', game), h('label', { class: 'f' }, 'Método', method)),
    charmRow, note,
    h('label', { class: 'f' }, 'Contador inicial / atual', count),
    h('label', { class: 'f' }, 'Anotações', notes),
    h('div', { class: 'row' },
      editing && h('button', { type: 'button', class: 'btn-danger', onclick: () => { if (confirm('Apagar esta caçada e o contador?')) { state.store.remove(editing.id); dlg.close(); } } }, '🗑 Apagar'),
      h('button', { type: 'button', class: 'btn-ghost', onclick: () => dlg.close() }, 'Cancelar'),
      h('button', { type: 'submit', class: 'btn-primary' }, editing ? 'Salvar' : 'Começar'),
    ),
  ));
  refreshOdds();
}

function openFoundDialog(id) {
  const hunt = getHunt(id);
  if (!hunt) return;
  const p = BY_ID.get(hunt.pokemonId);
  const dlg = openDialog(h('div', { class: 'dlg celebrate' },
    h('h2', null, `Shiny ${p?.name}?`),
    h('div', null, huntSprite(hunt.pokemonId)),
    h('p', { style: 'color:var(--muted);margin:0' }, `Confirmar o shiny depois de ${fmtN(hunt.count || 0)} ${METHODS[hunt.method]?.unit || 'encontros'}?`),
    h('div', { class: 'row' },
      h('button', { class: 'btn-ghost', onclick: () => dlg.close() }, 'Ainda não'),
      h('button', {
        class: 'btn-primary', onclick: async () => {
          await state.store.patch(id, { status: 'found', foundAt: Date.now(), foundCount: hunt.count || 0 });
          dlg.close(); confetti(); toast(`✨ Shiny ${p?.name} capturado! Parabéns!`);
        },
      }, '✨ Confirmar!'),
    ),
  ));
}

/* ───────── Shiny Dex ───────── */
function renderDex(view) {
  const hunters = [...new Set(state.hunts.map((x) => x.hunter))].sort();
  if (state.dexFilter !== 'all' && !hunters.includes(state.dexFilter)) state.dexFilter = 'all';
  const found = new Map();
  for (const x of state.hunts) if (x.status === 'found' && (state.dexFilter === 'all' || x.hunter === state.dexFilter)) found.set(x.pokemonId, x);
  const hunting = new Set(state.hunts.filter((x) => x.status === 'active').map((x) => x.pokemonId));
  const total = UNOVA.length, got = found.size;
  const filter = h('select', { style: 'width:auto', onchange: (e) => { state.dexFilter = e.target.value; renderDex(view); } },
    h('option', { value: 'all' }, 'Dupla (todos)'), hunters.map((n) => h('option', { value: n }, n)));
  filter.value = state.dexFilter;
  view.replaceChildren(
    h('div', { class: 'progress-top' },
      h('b', { style: 'font-size:1.3rem' }, `${got} / ${total}`),
      h('div', { class: 'bar' }, h('i', { style: `width:${(got / total) * 100}%` })),
      h('span', { style: 'color:var(--muted);font-size:.85rem' }, `${((got / total) * 100).toFixed(1)}%`),
      filter,
    ),
    h('div', { class: 'legend' }, h('span', null, '⭐ Capturado shiny'), h('span', null, '🎯 Em caça'), h('span', null, '▫️ Falta (toque para começar a caçar)')),
    h('div', { class: 'dex-grid' }, UNOVA.map((p) => {
      const f = found.get(p.id);
      const cls = f ? 'found' : hunting.has(p.id) ? 'hunting' : 'todo';
      return h('div', { class: 'dex-cell ' + cls, style: f ? '' : 'cursor:pointer', onclick: f || hunting.has(p.id) ? null : () => openHuntDialog(null, p.id) },
        f ? shinyStill(p.id) : normalStill(p.id),
        f && h('span', { class: 'badge' }, '⭐'),
        !f && hunting.has(p.id) && h('span', { class: 'badge' }, '🎯'),
        h('div', { class: 'no' }, '#' + pad(p.id)),
        h('div', { class: 'nm' }, p.name),
        f && h('div', { class: 'by', style: `color:${color(f.hunter)}` }, f.hunter),
      );
    })),
  );
}

/* ───────── Histórico ───────── */
function renderHistory(view) {
  const foundList = state.hunts.filter((x) => x.status === 'found').sort((a, b) => b.foundAt - a.foundAt);
  const activeCount = state.hunts.filter((x) => x.status === 'active').reduce((s, x) => s + (x.count || 0), 0);
  const foundEnc = foundList.reduce((s, x) => s + (x.foundCount || 0), 0);
  const perHunter = {};
  foundList.forEach((x) => { perHunter[x.hunter] = (perHunter[x.hunter] || 0) + 1; });
  const box = (b, s) => h('div', { class: 'box' }, h('b', null, b), h('span', null, s));
  view.replaceChildren(
    h('div', { class: 'summary' },
      box(fmtN(foundList.length), 'shinies capturados'),
      box(fmtN(foundList.length ? Math.round(foundEnc / foundList.length) : 0), 'média de encontros por shiny'),
      box(fmtN(activeCount), 'encontros nas caçadas ativas'),
      ...Object.entries(perHunter).map(([n, c]) => h('div', { class: 'box' }, h('b', { style: `color:${color(n)}` }, c), h('span', null, 'shinies de ' + n))),
    ),
    foundList.length
      ? h('div', { class: 'hist' }, foundList.map((x) => h('div', { class: 'hist-item' },
        shinyStill(x.pokemonId),
        h('div', { class: 't' },
          h('b', null, BY_ID.get(x.pokemonId)?.name), ' ', h('span', { class: 'tag hunter', style: `background:${color(x.hunter)}33;color:${color(x.hunter)}` }, x.hunter),
          h('div', null, `${fmtN(x.foundCount || 0)} ${METHODS[x.method]?.unit || 'encontros'} · ${GAMES[x.game] || x.game} · ${METHODS[x.method]?.label.split(' (')[0]}`),
          h('div', null, `${fmtDate(x.foundAt)} · caçou por ${fmtDur(x.foundAt - x.startedAt)}`),
          x.notes && h('div', null, '📝 ' + x.notes),
        ),
        h('button', { class: 'btn-ghost small', onclick: () => confirm('Reabrir esta caçada?') && state.store.patch(x.id, { status: 'active', foundAt: null }) }, 'Reabrir'),
      )))
      : h('div', { class: 'empty' }, h('div', { class: 'big' }, '🏆'), h('p', null, 'Os shinies capturados aparecem aqui.')),
  );
}

/* ───────── Início ───────── */
const initial = loadSession();
if (initial && PLAYERS.includes(initial.name)) start(initial);
else renderWelcome();
