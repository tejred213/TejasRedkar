"""Write data/last-race.json — the hero's "last race" board and track map.

Uses PyMotoGP (https://pypi.org/project/pymotogp/) to find the latest MotoGP
race with a classification, and records the podium, pole and fastest lap. It
also picks the circuit the hero draws: this week's race if one is underway or
starts within RACE_WEEK_DAYS, otherwise the last race's track, otherwise the
next race with an outline in data/circuits.json.

Runs daily from .github/workflows/last-race.yml. Locally:
    pip install pymotogp && python scripts/last_race.py
The file is only rewritten when the data actually changes.
"""
import datetime as dt
import json
import re
from importlib.metadata import version
from pathlib import Path

import motogp

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "last-race.json"
CIRCUITS = json.loads((ROOT / "data" / "circuits.json").read_text())["circuits"]
SMALL_WORDS = {"of", "the", "de", "do", "del", "di", "la"}
RACE_WEEK_DAYS = 6


def title(text):
    words = text.lower().split()
    return " ".join(w if i and w in SMALL_WORDS else w.capitalize() for i, w in enumerate(words))


def lap_time(value):
    if value is None:
        return None
    ms = value.total_seconds() * 1000 if hasattr(value, "total_seconds") else value
    if isinstance(ms, (int, float)):
        minutes, rest = divmod(round(ms), 60_000)
        return f"{minutes}:{rest / 1000:06.3f}"
    return str(value)


def rider_name(name, number, known):
    # Lap objects use "Raul FERNANDEZ"; prefer the classification's full name
    return known.get(number) or " ".join(p if not p.isupper() else p.capitalize() for p in name.split())


def circuit_key(circuit_name):
    name = circuit_name.lower()
    return next((key for key, c in CIRCUITS.items() if any(m in name for m in c["match"])), None)


def load_race(year, event):
    race = motogp.load(year, event["short_name"], "race")
    return race if race.classification else None


def build():
    today = dt.datetime.now(dt.timezone.utc).date()
    year = today.year
    schedule = motogp.get_event_schedule(year)
    events = schedule[~schedule["test"]].sort_values("date_start").reset_index(drop=True)
    if not (events["date_end"].astype(str) < str(today)).any():  # season not started yet
        year -= 1
        schedule = motogp.get_event_schedule(year)
        events = schedule[~schedule["test"]].sort_values("date_start").reset_index(drop=True)

    # The API's "finished" flag can be set before a weekend is over, so also
    # require the last day to have passed, and fall back to earlier rounds.
    past = events[(events["date_end"].astype(str) < str(today)) & events["finished"]]
    race, event, rnd = None, None, None
    for idx in reversed(past.index[-3:]):
        race = load_race(year, events.loc[idx])
        if race:
            event, rnd = events.loc[idx], int(idx) + 1
            break
    if race is None:
        raise SystemExit("no race with a classification found")

    known = {r["rider"]["number"]: r["rider"]["full_name"] for r in race.classification}
    podium = []
    for r in race.classification[:3]:
        gap = r.get("gap") or {}
        laps_down = int(gap.get("lap") or 0)
        podium.append({
            "pos": r["position"],
            "number": r["rider"]["number"],
            "rider": r["rider"]["full_name"],
            "team": r["team"]["name"],
            "bike": (r.get("constructor") or {}).get("name"),
            "time": r["time"] if r["position"] == 1 else (f"+{laps_down} lap" if laps_down else f"+{gap.get('first')}"),
        })

    def lap_entry(lap):
        if lap is None:
            return None
        return {"rider": rider_name(lap.rider_name, lap.rider_number, known), "number": lap.rider_number,
                "time": lap_time(lap.lap_time)}

    try:
        pole = lap_entry(motogp.load(year, event["short_name"], "Q2").best_lap)
    except Exception as err:  # Q2 PDF not published yet, etc.
        print(f"pole unavailable: {err}")
        pole = None

    # Track for the hero: this week's race, else the last race, else the next
    # (or most recent) circuit we have an outline for
    upcoming = events[events["date_end"].astype(str) >= str(today)]
    this_week = [
        ev for _, ev in upcoming.head(1).iterrows()
        if (dt.date.fromisoformat(str(ev["date_start"])[:10]) - today).days <= RACE_WEEK_DAYS
    ]
    candidates = [(ev, "next") for ev in this_week] + [(event, "last")]
    candidates += [(ev, "next") for _, ev in upcoming.iterrows()] + [(ev, "past") for _, ev in events.iloc[::-1].iterrows()]
    key, relation, track_event = None, None, None
    for ev, rel in candidates:
        key = circuit_key(ev["circuit"])
        if key:
            relation, track_event = rel, ev
            break
    circuit = CIRCUITS[key or "sepang"]

    return {
        "source": f"pymotogp {version('pymotogp')}",
        "season": int(year),
        "race": {
            "round": rnd,
            "event": title(event["name"]),
            "short": event["short_name"],
            "circuit": event["circuit"],
            "country": event["country"],
            "date": str(event["date_end"])[:10],
            "podium": podium,
            "pole": pole,
            "fastest_lap": lap_entry(race.best_lap),
        },
        "track": {
            "key": key or "sepang",
            "name": circuit["name"],
            "length_m": circuit["length_m"],
            "relation": relation if key else None,
            "event": title(track_event["name"]) if key else None,
            "dates": [str(track_event["date_start"])[:10], str(track_event["date_end"])[:10]] if key else None,
            "points": circuit["points"],
        },
    }


def main():
    data = build()
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    if {k: v for k, v in old.items() if k != "updated"} == data:
        print("last-race.json is up to date")
        return
    data["updated"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d")
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    r = data["race"]
    print(f"R{r['round']} {r['event']}: " + ", ".join(f"P{p['pos']} {p['rider']}" for p in r["podium"]))
    print(f"track: {data['track']['name']} ({data['track']['relation']})")


if __name__ == "__main__":
    main()
