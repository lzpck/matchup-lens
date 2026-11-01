// Todo o conhecimento do Sleeper: URLs, formato, cache e diretório. Entrega tipos de domínio (Game).
import { groupsOf, nextOpponent } from './core.js';

export const ISSUES_URL = 'https://github.com/OWNER/matchup-lens/issues'; // ajustar ao publicar
const APP = 'https://api.sleeper.app/v1';
const API = 'https://api.sleeper.com';
const DAY = 24 * 60 * 60 * 1000;

export class FormatError extends Error {
  constructor(what) {
    super(`O Sleeper mudou o formato dos dados (${what}). Avise em ${ISSUES_URL}`);
  }
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sleeper respondeu ${res.status} em ${url}`);
  return res.json();
}

// ---- cache: IndexedDB com fallback para memória (modo privado, Node) ----
const memory = new Map();
let dbPromise;
function db() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    const req = indexedDB.open('matchup-lens', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}
function idb(mode, fn) {
  return db().then((d) => d && new Promise((resolve) => {
    const req = fn(d.transaction('kv', mode).objectStore('kv'));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  })).catch(() => null);
}
async function cacheGet(key) {
  const hit = memory.get(key) ?? (await idb('readonly', (s) => s.get(key)));
  return hit && Date.now() - hit.at < DAY ? hit.value : undefined;
}
async function cacheSet(key, value) {
  const entry = { at: Date.now(), value };
  memory.set(key, entry);
  await idb('readwrite', (s) => s.put(entry, key));
}

// ---- formato ----
export function parseUser(json) {
  // GET /user/<inexistente> devolve 200 com corpo null.
  if (!json?.user_id) throw new Error('Usuário não encontrado');
  return json;
}

export function assertStatsShape(rec) {
  if (!rec || typeof rec.stats !== 'object' || !rec.player_id) throw new FormatError('registro de stats');
  if (!rec.opponent || !rec.team) throw new FormatError('opponent/team');
  if (!rec.player?.position) throw new FormatError('player.position');
}

export function toGame(rec, week) {
  assertStatsShape(rec);
  const p = rec.player;
  return {
    week,
    playerId: String(rec.player_id),
    name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
    team: rec.team,
    opponent: rec.opponent,
    position: p.position,
    // Só o do próprio registro de stats; o grupo é decidido na leitura (core.groupsOf), então o cache não congela a regra.
    fantasyPositions: p.fantasy_positions ?? [],
    stats: rec.stats,
  };
}

export function slimDirectory(raw) {
  const out = {};
  for (const [id, p] of Object.entries(raw ?? {})) {
    if (!groupsOf(p?.position).length) continue;
    out[id] = {
      name: p.full_name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
      position: p.position,
      fantasyPositions: p.fantasy_positions ?? [],
      team: p.team ?? null,
      injury: p.injury_status ?? null,
    };
  }
  if (!Object.keys(out).length) throw new FormatError('diretório de jogadores vazio');
  return out;
}

export function weekIsFinal(schedule, week) {
  const games = schedule.filter((g) => g.week === week);
  return games.length > 0 && games.every((g) => g.status === 'complete');
}

// Time e adversário vêm do diretório (time atual), não das stats: cobre quem não jogou na última semana.
export function resolveOpponent(playerId, directory, schedule, week) {
  const team = directory[playerId]?.team ?? null;
  return { team, opponent: team && nextOpponent(schedule, team, week) };
}

// ---- carregamento ----
export const loadState = () => getJson(`${APP}/state/nfl`);
export const loadUser = async (username) => parseUser(await getJson(`${APP}/user/${encodeURIComponent(username)}`));
export const loadLeagues = (userId, season) => getJson(`${APP}/user/${userId}/leagues/nfl/${season}`).then((l) => l ?? []);
export const loadSchedule = (season) => getJson(`${API}/schedule/nfl/regular/${season}`);

export async function loadLeague(leagueId) {
  const [league, rosters] = await Promise.all([
    getJson(`${APP}/league/${leagueId}`),
    getJson(`${APP}/league/${leagueId}/rosters`),
  ]);
  return { league, rosters };
}

export async function loadDirectory() {
  // v2: o cache anterior (só QB/RB/WR/TE, sem fantasyPositions) esconderia o IDP por até 24 h.
  const hit = await cacheGet('directory:v2');
  if (hit) return hit;
  const slim = slimDirectory(await getJson(`${APP}/players/nfl`));
  await cacheSet('directory:v2', slim);
  return slim;
}

async function loadWeek(season, week, schedule) {
  const key = `stats:v2:${season}:${week}`; // v2: semanas antigas em cache não têm IDP
  const hit = await cacheGet(key);
  if (hit) return hit;
  const raw = await getJson(`${API}/stats/nfl/${season}/${week}?season_type=regular`);
  if (!Array.isArray(raw)) throw new FormatError('lista de stats');
  // Valida todos os registros; guarda só posições com grupo, com participação (34,7% não têm gp).
  const games = raw.map((r) => toGame(r, week)).filter((g) => groupsOf(g.position).length && (g.stats.gp ?? 0) > 0);
  if (weekIsFinal(schedule, week)) await cacheSet(key, games);
  return games;
}

// Busca as semanas em paralelo; uma falha de rede não derruba as outras, erro de formato sim.
export async function loadWeeks(season, weeks, schedule, onProgress = () => {}) {
  let done = 0;
  const results = await Promise.allSettled(weeks.map((w) =>
    loadWeek(season, w, schedule).finally(() => onProgress(++done, weeks.length))));
  const formatErr = results.find((r) => r.status === 'rejected' && r.reason instanceof FormatError);
  if (formatErr) throw formatErr.reason;
  return {
    games: results.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])),
    failed: weeks.filter((_, i) => results[i].status === 'rejected'),
  };
}
