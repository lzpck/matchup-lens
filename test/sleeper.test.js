import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUser, assertStatsShape, toGame, slimDirectory, weekIsFinal, resolveOpponent, loadWeeks, FormatError, ISSUES_URL } from '../src/sleeper.js';

const rec = (over = {}) => ({ player_id: '1', team: 'KC', opponent: 'DEN', stats: { gp: 1, rec: 3 }, player: { position: 'WR', first_name: 'A', last_name: 'B' }, ...over });
const schedule = [
  { week: 1, home: 'DEN', away: 'KC', status: 'complete' },
  { week: 2, home: 'DEN', away: 'LV', status: 'complete' },
  { week: 2, home: 'KC', away: 'BUF', status: 'in_game' },
];

test('parseUser: corpo null vira "Usuário não encontrado"', () => {
  assert.throws(() => parseUser(null), /Usuário não encontrado/);
  assert.equal(parseUser({ user_id: '9' }).user_id, '9');
});

test('assertStatsShape: falta opponent ou player.position -> erro com link das issues', () => {
  assert.doesNotThrow(() => assertStatsShape(rec()));
  assert.throws(() => assertStatsShape(rec({ opponent: undefined })), FormatError);
  assert.throws(() => assertStatsShape(rec({ player: {} })), (e) => e instanceof FormatError && e.message.includes(ISSUES_URL));
});

test('slimDirectory: mantém QB/RB/WR/TE, time nulo vira null, vazio é erro', () => {
  const d = slimDirectory({ 1: { position: 'WR', full_name: 'A B', team: 'KC' }, 2: { position: 'K', team: 'KC' }, 3: { position: 'RB', first_name: 'C', last_name: 'D' } });
  assert.deepEqual(Object.keys(d), ['1', '3']);
  assert.equal(d[3].team, null);
  assert.equal(d[3].name, 'C D');
  assert.throws(() => slimDirectory({}), FormatError);
});

test('toGame: guarda position crua e fantasyPositions; lineman sem o campo não lança FormatError', () => {
  const lb = toGame(rec({ player: { position: 'LB', fantasy_positions: ['DL', 'LB'], first_name: 'A', last_name: 'B' } }), 3);
  assert.equal(lb.position, 'LB');
  assert.deepEqual(lb.fantasyPositions, ['DL', 'LB']);
  const g = toGame(rec({ player: { position: 'G', first_name: 'A', last_name: 'B' } }), 3); // 12 de 1343 registros da semana 8
  assert.equal(g.position, 'G');
  assert.deepEqual(g.fantasyPositions, []);
});

test('slimDirectory: inclui IDP com position crua e fantasyPositions; OL, LS e K ficam fora', () => {
  const d = slimDirectory({
    1: { position: 'DE', fantasy_positions: ['DL', 'LB'], full_name: 'A B', team: 'KC' },
    2: { position: 'OL', fantasy_positions: ['DL', 'OL', 'OT'], team: 'KC' },
    3: { position: 'LS', fantasy_positions: ['LB', 'LS'], team: 'KC' },
    4: { position: 'CB', fantasy_positions: ['DB'], team: 'DEN' },
    5: { position: 'WR', team: 'KC' },
  });
  assert.deepEqual(Object.keys(d), ['1', '4', '5']);
  assert.equal(d[1].position, 'DE');
  assert.deepEqual(d[1].fantasyPositions, ['DL', 'LB']);
  assert.deepEqual(d[5].fantasyPositions, []);
});

test('weekIsFinal: todos complete = true; algum in_game = false; semana sem jogos = false', () => {
  assert.equal(weekIsFinal(schedule, 1), true);
  assert.equal(weekIsFinal(schedule, 2), false);
  assert.equal(weekIsFinal(schedule, 3), false);
});

test('resolveOpponent: jogador fora das stats usa diretório + schedule', () => {
  const dir = { 7: { team: 'LV' }, 8: { team: null } };
  assert.deepEqual(resolveOpponent('7', dir, schedule, 2), { team: 'LV', opponent: 'DEN' });
  assert.deepEqual(resolveOpponent('8', dir, schedule, 2), { team: null, opponent: null });
});

test('loadWeeks: uma semana falha e o resto aparece; erro de formato propaga; só cacheia semana final', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (url) => {
    calls++;
    const week = Number(url.match(/stats\/nfl\/\d+\/(\d+)/)[1]);
    if (week === 3) return { ok: false, status: 500 };
    return { ok: true, json: async () => [rec(), rec({ player_id: '2', stats: {} }), rec({ player_id: '3', player: { position: 'K' } })] };
  });
  const r = await loadWeeks(1999, [1, 2, 3], schedule);
  assert.deepEqual(r.failed, [3]);
  assert.equal(r.games.length, 2); // gp=0 e K ficam fora
  calls = 0;
  await loadWeeks(1999, [1, 2], schedule);
  assert.equal(calls, 1); // semana 1 (final) veio do cache, semana 2 (in_game) não

  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => [rec({ opponent: null })] }));
  await assert.rejects(loadWeeks(1998, [1], schedule), FormatError);
});

test('loadWeeks: guarda IDP com gp>0 e descarta OL com DL em fantasy_positions', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    json: async () => [
      rec({ player_id: '1', stats: { gp: 1, idp_tkl: 4 }, player: { position: 'LB', fantasy_positions: ['DL', 'LB'], first_name: 'A', last_name: 'B' } }),
      rec({ player_id: '2', stats: { gp: 1 }, player: { position: 'OL', fantasy_positions: ['DL', 'OL', 'OT'], first_name: 'C', last_name: 'D' } }),
    ],
  }));
  const r = await loadWeeks(1997, [1], schedule);
  assert.deepEqual(r.games.map((g) => g.position), ['LB']);
  assert.deepEqual(r.games[0].fantasyPositions, ['DL', 'LB']);
});
