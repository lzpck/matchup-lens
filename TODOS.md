# TODOS

## Data source

### Plano para quando o endpoint de stats do Sleeper quebrar

**What:** Pesquisar e decidir uma fonte alternativa de stats por jogador e semana (opponent, estatísticas brutas, snaps) caso `api.sleeper.com/stats/nfl/{ano}/{semana}` mude ou saia do ar.

**Why:** É a única dependência não documentada do app. A abordagem B (snapshot semanal) não resolve isso, porque usa o mesmo endpoint; sem esse TODO a ideia de que B é uma saída pode ser esquecida.

**Context:** `src/sleeper.js` isola toda a rede (decisão D3 da Eng Review), então se o formato mudar só esse arquivo e as fixtures mudam; `assertStatsShape` mostra uma mensagem de erro clara com o link das issues. Comece listando fontes abertas (por exemplo nflverse) e conferindo se trazem opponent e snaps por jogo; a fonte alternativa pode não ter snaps. Design doc: `C:\Users\Leandro\.gstack\projects\matchup-lens\Leandro-main-design-20261101-160130.md` (decisão R5). Vale fazer antes de divulgar o app publicamente.

**Effort:** M
**Priority:** P2
**Depends on:** None

## Completed

## QA (2026-11-01, /qa) — adiados (Low)

- ~~**ISSUE-001**~~ Não é bug: liga "chopped" em que o usuário já foi eliminado (roster realmente vazio).
- **ISSUE-002** `.chip` quebra no meio da linha; será resolvido no ajuste da interface.
- ~~**ISSUE-003**~~ Corrigido por /qa em 2026-11-01: opção "17 jogos" removida (o app só carrega 9 semanas).
- Não testado: acessibilidade, cold load em celular real, semana ao vivo, nome com HTML. Relatório: `.gstack/qa-reports/` (última execução).
