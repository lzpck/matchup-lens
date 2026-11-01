import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { score, gamesVs, playerGames, defenseTotals, averages, nextOpponent, snapPct, groupsOf, groupOf, POSITIONS, topPerWeek, IDP_TOP } from '../src/core.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/golden.json', import.meta.url)));

test('score bate com players_points do Sleeper (golden, 5 posições x 2 semanas, ±0,1)', () => {
  assert.ok(new Set(golden.cases.map((c) => c.position)).size >= 5);
  assert.deepEqual([...new Set(golden.cases.map((c) => c.week))].length, 2);
  for (const c of golden.cases) {
    const got = score(c.stats, golden.scoring_settings);
    assert.ok(Math.abs(got - c.expected) <= 0.1, `${c.position} sem ${c.week}: ${got} vs ${c.expected}`);
  }
});

test('score ignora chave sem stat e stat não numérica', () => {
  assert.equal(score({ rec: 3, rec_yd: '40' }, { rec: 1, rec_yd: 0.1, pass_td: 4 }), 3);
});

const g = (week, playerId, opponent, position, gp, pts) => ({ week, playerId, name: playerId, team: 'X', opponent, position, stats: { gp, rec: pts } });
const scoring = { rec: 1 };
const games = [
  g(1, 'a', 'DEN', 'WR', 1, 10), g(1, 'b', 'DEN', 'WR', 1, 2), g(1, 'c', 'DEN', 'WR', 0, 0),
  g(2, 'd', 'DEN', 'WR', 1, 6), g(2, 'e', 'DEN', 'RB', 1, 9),
  g(3, 'a', 'KC', 'WR', 1, 4),
];

test('gamesVs: só gp>0, só a posição e a defesa pedidas, mais recente primeiro', () => {
  assert.deepEqual(gamesVs(games, 'DEN', 'WR').map((x) => x.playerId), ['d', 'a', 'b']);
  assert.deepEqual(gamesVs(games, 'DEN', 'WR', 1).map((x) => x.playerId), ['d']);
  assert.equal(gamesVs(games, 'DEN', 'WR', 50).length, 3); // N maior que o histórico
});

test('defenseTotals: total da posição por jogo em destaque, média por jogador secundária', () => {
  const t = defenseTotals(gamesVs(games, 'DEN', 'WR'), scoring);
  assert.equal(t.games, 2);
  assert.equal(t.perGame, (12 + 6) / 2);
  assert.equal(t.perPlayer, (10 + 2 + 6) / 3);
  assert.deepEqual(defenseTotals([], scoring), { games: 0, perGame: null, perPlayer: null });
});

test('playerGames e averages', () => {
  assert.deepEqual(playerGames(games, 'a').map((x) => x.week), [3, 1]);
  assert.equal(averages([]), null);
});

test('nextOpponent: jogo normal, bye e time desconhecido', () => {
  const sched = [{ week: 9, home: 'DEN', away: 'KC' }];
  assert.equal(nextOpponent(sched, 'KC', 9), 'DEN');
  assert.equal(nextOpponent(sched, 'DEN', 9), 'KC');
  assert.equal(nextOpponent(sched, 'BUF', 9), null);
  assert.equal(nextOpponent(sched, null, 9), null);
});

test('snapPct', () => {
  assert.equal(snapPct({ off_snp: 46, tm_off_snp: 50 }), 92);
  assert.equal(snapPct({}), null);
});

// ---- IDP (v1.1) ----
test('score de IDP bate com players_points da The Bad Place (golden, DL/LB/DB x 2 semanas, ±0,1)', () => {
  const { scoring_settings, cases } = golden.idp;
  assert.ok(cases.length >= 5);
  assert.deepEqual([...new Set(cases.map((c) => groupOf(c.position)))].sort(), ['DB', 'DL', 'LB']);
  assert.equal(new Set(cases.map((c) => c.week)).size, 2);
  for (const c of cases) {
    const got = score(c.stats, scoring_settings);
    assert.ok(Math.abs(got - c.expected) <= 0.1, `${c.position} sem ${c.week}: ${got} vs ${c.expected}`);
  }
});

test('POSITIONS: ataque primeiro, depois DL, LB, DB (ordem do roster)', () => {
  assert.deepEqual(POSITIONS, ['QB', 'RB', 'WR', 'TE', 'DL', 'LB', 'DB']);
});

test('groupsOf: IDP amplia com fantasy_positions; ataque, OL, LS e K nunca ganham grupo de IDP', () => {
  const rows = [
    ['WR', ['WR'], ['WR']],
    ['WR', ['DB', 'WR'], ['WR']],        // ataque de duas posições segue só ataque
    ['DE', ['DL', 'LB'], ['DL', 'LB']],  // híbrido: elegível nos dois
    ['LB', ['DL', 'LB'], ['LB', 'DL']],  // a ordem alfabética do Sleeper não manda: grupo da position vem primeiro
    ['LB', ['DL'], ['LB', 'DL']],        // o grupo da própria position sempre entra
    ['CB', undefined, ['DB']],           // sem fantasy_positions
    ['OL', ['DL', 'OL', 'OT'], []],
    ['LS', ['LB', 'LS'], []],
    ['K', ['K'], []],
  ];
  for (const [pos, fp, want] of rows) assert.deepEqual(groupsOf(pos, fp), want, `${pos} ${fp}`);
});

const d = (week, playerId, opponent, position, fantasyPositions, stats) => ({ week, playerId, name: playerId, team: 'X', opponent, position, fantasyPositions, stats });
const idpGames = [
  d(1, 'de', 'DEN', 'DE', ['DL'], { gp: 1, def_snp: 40, idp_tkl: 3 }),
  d(1, 'hyb', 'DEN', 'LB', ['DL', 'LB'], { gp: 1, def_snp: 50, idp_tkl: 5 }),
  d(1, 'lb', 'DEN', 'LB', ['LB'], { gp: 1, def_snp: 30, idp_tkl: 2 }),
  d(1, 'ol', 'DEN', 'OL', ['DL', 'OL'], { gp: 1, def_snp: 10 }),
  d(1, 'st', 'DEN', 'LB', ['LB'], { gp: 1, st_snp: 12 }),                // só times especiais: fora
  d(2, 'live', 'DEN', 'LB', ['LB'], { gp: 1, idp_tkl: 4 }),             // semana ao vivo: stat sem snaps, entra
  d(2, 'bench', 'DEN', 'DB', ['DB'], { gp: 1, def_snp: 8 }),            // jogou e não produziu: entra
];

test('gamesVs IDP: híbrido entra uma vez em cada amostra; OL e só-times-especiais ficam fora', () => {
  assert.deepEqual(gamesVs(idpGames, 'DEN', 'DL').map((x) => x.playerId), ['de', 'hyb']);
  assert.deepEqual(gamesVs(idpGames, 'DEN', 'LB').map((x) => x.playerId), ['live', 'hyb', 'lb']);
  assert.deepEqual(gamesVs(idpGames, 'DEN', 'DB').map((x) => x.playerId), ['bench']);
});

test('snapPct IDP usa snaps defensivos; denominador zero ou ausente é null', () => {
  assert.equal(snapPct({ def_snp: 23, tm_def_snp: 69 }, 'LB'), 33);
  assert.equal(snapPct({ def_snp: 23, tm_def_snp: 0 }, 'LB'), null);
  assert.equal(snapPct({ off_snp: 46, tm_off_snp: 50 }, 'WR'), 92);
});

test('topPerWeek: ordena por pontos em cada semana, corta só com `top` e mantém a ordem das semanas', () => {
  const rows = [g(2, 'x', 'DEN', 'WR', 1, 3), g(2, 'y', 'DEN', 'WR', 1, 9), g(1, 'z', 'DEN', 'WR', 1, 1), g(1, 'w', 'DEN', 'WR', 1, 7), g(1, 'v', 'DEN', 'WR', 1, 5)];
  assert.deepEqual(topPerWeek(rows, scoring).map((r) => r.playerId), ['y', 'x', 'w', 'v', 'z']);          // sem corte: só ordena
  assert.deepEqual(topPerWeek(rows, scoring, 2).map((r) => r.playerId), ['y', 'x', 'w', 'v']);            // top 2 por semana
  assert.deepEqual(topPerWeek([], scoring, 2), []);
  assert.equal(IDP_TOP, 4);
});

// R4: o ataque não muda quando há IDP na lista. Valores esperados são os do teste de defenseTotals acima, feitos antes do IDP.
test('regressão do ataque: gamesVs, defenseTotals e snapPct idênticos com linhas de IDP misturadas', () => {
  const mixed = [...games, ...idpGames];
  assert.deepEqual(gamesVs(mixed, 'DEN', 'WR').map((x) => x.playerId), ['d', 'a', 'b']);
  assert.deepEqual(gamesVs(mixed, 'DEN', 'RB').map((x) => x.playerId), ['e']);
  const t = defenseTotals(gamesVs(mixed, 'DEN', 'WR'), scoring);
  assert.deepEqual(t, { games: 2, perGame: 9, perPlayer: 6 });
  assert.deepEqual(playerGames(mixed, 'a').map((x) => x.week), [3, 1]);
  assert.equal(snapPct({ off_snp: 46, tm_off_snp: 50 }, 'WR'), snapPct({ off_snp: 46, tm_off_snp: 50 }));
});
