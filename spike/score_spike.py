"""Spike: recalcula pontos de jogadores a partir das stats brutas + scoring_settings
e compara com players_points do Sleeper (gabarito). Uso: python score_spike.py <week> <league_id>..."""
import json, sys, urllib.request
from collections import Counter

SEASON = 2026
UA = {"User-Agent": "matchup-lens-spike"}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return json.load(r)

def score(stats, scoring):
    # Pura soma stat * peso; chaves de scoring sem stat correspondente ficam fora (e são reportadas).
    return sum(stats[k] * w for k, w in scoring.items() if k in stats and isinstance(stats[k], (int, float)))

def main(week, league_ids):
    raw = get(f"https://api.sleeper.com/stats/nfl/{SEASON}/{week}?season_type=regular")
    by_pid = {str(r["player_id"]): r for r in raw}
    print(f"semana {week}: {len(by_pid)} jogadores com stats\n")
    for lid in league_ids:
        lg = get(f"https://api.sleeper.app/v1/league/{lid}")
        scoring = lg["scoring_settings"]
        matchups = get(f"https://api.sleeper.app/v1/league/{lid}/matchups/{week}")
        rows, unseen = [], Counter()
        for m in matchups:
            for pid, truth in (m.get("players_points") or {}).items():
                rec = by_pid.get(pid)
                if rec is None or truth is None:
                    continue
                mine = score(rec["stats"], scoring)
                rows.append((pid, rec["player"].get("position"), round(mine, 2), truth))
                for k in scoring:
                    if k not in rec["stats"]:
                        unseen[k] += 1
        ok = [r for r in rows if abs(r[2] - r[3]) <= 0.1]
        bad = sorted((r for r in rows if abs(r[2] - r[3]) > 0.1), key=lambda r: -abs(r[2] - r[3]))
        print(f"== {lg['name']} ({lid}) rec={scoring.get('rec')} bonus_rec_te={scoring.get('bonus_rec_te')}")
        print(f"   comparados={len(rows)} dentro_de_0.1={len(ok)} ({100*len(ok)/max(len(rows),1):.1f}%)")
        for pid, pos, mine, truth in bad[:6]:
            p = by_pid[pid]["player"]
            print(f"   DIVERGE {p.get('first_name')} {p.get('last_name')} {pos}: meu={mine} sleeper={truth}")
        print()

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2:])
