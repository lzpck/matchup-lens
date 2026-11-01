// Regras puras: pontuação e recorte de jogos. Sem rede, sem DOM.
// Game = { week, playerId, name, team, opponent, position (crua), fantasyPositions, stats }

// Posição crua do Sleeper -> grupo. Única lista de posições: POSITIONS deriva das chaves (ordem do roster).
// K, DEF, OL e LS ficam fora de propósito.
const GROUP_OF = {
  QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE',
  DE: 'DL', DT: 'DL', NT: 'DL', DL: 'DL', LB: 'LB',
  CB: 'DB', S: 'DB', SS: 'DB', FS: 'DB', DB: 'DB',
};
export const POSITIONS = [...new Set(Object.values(GROUP_OF))];
const IDP = new Set(['DL', 'LB', 'DB']);
export const DEFAULT_WINDOW = 8;

export const groupOf = (position) => GROUP_OF[position];
export const isIdp = (group) => IDP.has(group);

// Grupos em que o jogador conta como "elegível". `fantasy_positions` do Sleeper vem em ordem alfabética
// (a primeira entrada não é a posição principal), então só amplia o grupo da `position`, e só em IDP:
// OL/LS/K com DL/LB/DB em `fantasy_positions` ficam de fora; ataque nunca ganha grupo de IDP.
export function groupsOf(position, fantasyPositions) {
  const own = GROUP_OF[position];
  if (!own) return [];
  if (!IDP.has(own)) return [own];
  return [...new Set([own, ...(fantasyPositions ?? []).filter((f) => IDP.has(f))])];
}

// Soma stat x peso; chaves de scoring sem stat numérica ficam fora (validado no spike: 2896/2896).
export function score(stats, scoring) {
  let total = 0;
  for (const [k, w] of Object.entries(scoring)) {
    if (typeof stats[k] === 'number') total += stats[k] * w;
  }
  return Math.round(total * 100) / 100;
}

// IDP: gp>0 inclui jogador só de times especiais (~16% dos registros). Exige participação defensiva por snaps
// ou por qualquer stat idp_* (a semana ao vivo ainda não tem snaps). Ataque segue gp>0.
const defended = (s) => s.def_snp > 0 || Object.entries(s).some(([k, v]) => k.startsWith('idp_') && v > 0);
const played = (g) => (g.stats.gp ?? 0) > 0 && (!IDP.has(GROUP_OF[g.position]) || defended(g.stats));

// Registros das `n` semanas mais recentes presentes na lista, da mais nova para a mais velha.
function lastWeeks(games, n) {
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => b - a).slice(0, n);
  return games.filter((g) => weeks.includes(g.week)).sort((a, b) => b.week - a.week);
}

// Jogadores elegíveis no grupo `position` que enfrentaram `defense` (o adversário) nos últimos `n` jogos dele, só quem jogou.
export function gamesVs(games, defense, position, n = DEFAULT_WINDOW) {
  return lastWeeks(games.filter((g) => played(g) && g.opponent === defense && groupsOf(g.position, g.fantasyPositions).includes(position)), n);
}

// Jogos do próprio jogador nos últimos `n` jogos dele, só com gp > 0.
export function playerGames(games, playerId, n = DEFAULT_WINDOW) {
  return lastWeeks(games.filter((g) => played(g) && g.playerId === playerId), n);
}

// Em IDP cada jogo do adversário tem 8-10 DLs ou DBs; só os que mais pontuaram importam para escalar.
export const IDP_TOP = 4;

// Ordena por pontos dentro de cada semana (semanas na ordem de entrada) e, com `top`, mantém só os melhores de cada semana.
export function topPerWeek(rows, scoring, top = Infinity) {
  const byWeek = new Map();
  for (const g of rows) {
    if (!byWeek.has(g.week)) byWeek.set(g.week, []);
    byWeek.get(g.week).push({ g, pts: score(g.stats, scoring) });
  }
  return [...byWeek.values()].flatMap((l) => l.sort((a, b) => b.pts - a.pts).slice(0, top).map((x) => x.g));
}

export function averages(list) {
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
}

// Destaque (D4): total da posição por jogo da defesa; secundário: média por jogador.
export function defenseTotals(rows, scoring) {
  const pts = rows.map((g) => score(g.stats, scoring));
  const byWeek = new Map();
  rows.forEach((g, i) => byWeek.set(g.week, (byWeek.get(g.week) ?? 0) + pts[i]));
  return {
    games: byWeek.size,
    perGame: averages([...byWeek.values()]),
    perPlayer: averages(pts),
  };
}

// Adversário de `team` na semana; null em bye ou time desconhecido.
export function nextOpponent(schedule, team, week) {
  const g = schedule.find((s) => s.week === week && (s.home === team || s.away === team));
  return g ? (g.home === team ? g.away : g.home) : null;
}

// Sem `group` (ou de ataque) usa snaps ofensivos; DL/LB/DB usam snaps defensivos.
export function snapPct(stats, group) {
  const [own, team] = IDP.has(group) ? ['def_snp', 'tm_def_snp'] : ['off_snp', 'tm_off_snp'];
  return stats[team] ? Math.round((100 * (stats[own] ?? 0)) / stats[team]) : null;
}
