# matchup-lens

**Pergunta que o app responde:** "Meu WR vai enfrentar o DEN. Como os WRs que enfrentaram o DEN pontuaram, jogo a jogo, na pontuação da *minha* liga?"

O Sleeper mostra o confronto só como uma cor. O matchup-lens mostra a evidência: quem enfrentou a defesa, com que % de snaps, quantos pontos na pontuação da sua liga, ao lado da média do seu jogador. É evidência, não veredito: a amostra é pequena e "mesma posição" ignora o papel (WR1 vs WR3).

## Uso

1. Abra o site, digite seu username do Sleeper e escolha a liga.
2. Marque os jogadores em dúvida no roster.
3. Para cada um: total de pontos da posição por jogo cedido pela defesa adversária (destaque), média por jogador, e a tabela jogo a jogo.

Sem login, sem servidor: tudo roda no navegador contra a API pública do Sleeper, com cache no IndexedDB (diretório de jogadores e semanas finalizadas, 24 h).

## Como funciona

- Pontos recalculados a partir das stats brutas com o `scoring_settings` da liga (validado contra o Sleeper em 2896 pontuações, diferença máxima 0,000).
- Só jogadores com `gp > 0` entram nas contas. Posições: QB, RB, WR, TE e IDP (DL, LB, DB; DE/DT/NT contam como DL, CB/S como DB). Em IDP também é preciso ter participado da defesa (snaps defensivos ou alguma stat `idp_*`), para jogador só de times especiais não puxar a média para baixo.
- Híbridos (`fantasy_positions` com DL e LB, por exemplo) ganham um painel por posição elegível ("como DL" e "como LB"), para comparar onde escalar. O Sleeper lista `fantasy_positions` em ordem alfabética; a posição principal é a `position`.
- Cada semana da tabela vem ordenada por pontos. Em IDP, só os 4 que mais pontuaram por jogo do adversário entram (`IDP_TOP` em `src/core.js`); total por jogo, média por jogador e tabela usam o mesmo corte. No ataque não há corte.
- Em IDP, o time em foco é o ataque que o jogador enfrenta ("como LBs pontuaram contra o ataque do DEN").
- Limitações: a posição é a atual do jogador, não a do jogo; fora de temporada o app não tem dados; `custom_points` de comissário não é considerado.
- Depende do endpoint de stats do Sleeper, que não é documentado. Se ele mudar, o app mostra um erro com o link das issues.

## Desenvolvimento

Sem build e sem dependências. JavaScript puro em módulos ES.

```sh
node --test                 # testes
python -m http.server 8000  # ou qualquer servidor estático; abra http://localhost:8000
```

- `src/core.js`: pontuação e recortes (puro).
- `src/sleeper.js`: rede, cache, checagem de formato, diretório.
- `index.html`: interface.

Antes de publicar, troque `ISSUES_URL` em `src/sleeper.js` pelo endereço do seu repositório.

## Licença

MIT
