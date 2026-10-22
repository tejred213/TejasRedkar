"""Build data/circuits.json — compact circuit outlines for the hero track map.

Sources: F1 layouts from bacinger/f1-circuits (MIT, © Tomislav Bacinger) for
MotoGP venues that also host F1; OpenStreetMap (© OpenStreetMap contributors,
ODbL) for MotoGP-only venues, using the circuit's one-way raceway (so points
follow the racing direction) with start/finish placed beside the pit lane.
Each outline is projected to local metres, resampled to evenly spaced points
along the lap (start/finish first, in racing direction) and normalised to
[-1, 1] with north = +y.

Run once when the list changes:  python3 scripts/build_circuits.py
"""
import json
import math
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson"
OVERPASS = "https://overpass-api.de/api/interpreter"
POINTS = 160

# key: (f1-circuits id, display name, words that identify it in MotoGP circuit names)
CIRCUITS = {
    "sepang": ("my-1999", "Sepang International Circuit", ["sepang"]),
    "losail": ("qa-2004", "Lusail International Circuit", ["lusail", "losail"]),
    "portimao": ("pt-2008", "Autódromo Internacional do Algarve", ["algarve", "portim"]),
    "catalunya": ("es-1991", "Circuit de Barcelona-Catalunya", ["catalunya"]),
    "redbullring": ("at-1969", "Red Bull Ring", ["red bull ring", "spielberg"]),
    "silverstone": ("gb-1948", "Silverstone Circuit", ["silverstone"]),
    "cota": ("us-2012", "Circuit of the Americas", ["americas"]),
    "mugello": ("it-1914", "Autodromo Internazionale del Mugello", ["mugello"]),
}

# MotoGP-only venues from OpenStreetMap:
# key: (circuit way id, pit-lane way id, display name, official length m, match words)
OSM_CIRCUITS = {
    "phillipisland": (43598473, 1436851709, "Phillip Island Grand Prix Circuit", 4448, ["phillip island"]),
}


def to_metres(lonlat, origin=None):
    lon0, lat0 = origin or (sum(p[0] for p in lonlat) / len(lonlat), sum(p[1] for p in lonlat) / len(lonlat))
    kx = 111_320 * math.cos(math.radians(lat0))
    return [((lon - lon0) * kx, (lat - lat0) * 110_540) for lon, lat in lonlat]


def osm_ways(*ids):
    """Fetch OSM ways in one Overpass request (retrying once — the public API sheds load)."""
    query = urllib.parse.urlencode({"data": f"[out:json][timeout:60];way(id:{','.join(map(str, ids))});out geom;"}).encode()
    for attempt in range(2):
        try:
            req = urllib.request.Request(OVERPASS, data=query, headers={"User-Agent": "tejred213-portfolio-trackmap"})
            with urllib.request.urlopen(req, timeout=90) as r:
                return {e["id"]: [(p["lon"], p["lat"]) for p in e["geometry"]] for e in json.load(r)["elements"]}
        except urllib.error.HTTPError as err:
            if attempt or err.code not in (429, 502, 503, 504):
                raise
            time.sleep(20)


def osm_outline(way_id, pit_way_id):
    ways = osm_ways(way_id, pit_way_id)
    loop = ways[way_id]
    if loop[0] == loop[-1]:
        loop = loop[:-1]
    origin = loop[0]
    pts, pit = to_metres(loop, origin), to_metres(ways[pit_way_id], origin)
    mid = pit[len(pit) // 2] if len(pit) > 2 else ((pit[0][0] + pit[-1][0]) / 2, (pit[0][1] + pit[-1][1]) / 2)
    start = min(range(len(pts)), key=lambda i: math.dist(pts[i], mid))
    return pts[start:] + pts[:start]


def resample(pts, n):
    if pts[0] != pts[-1]:
        pts = pts + [pts[0]]
    seg = [math.dist(a, b) for a, b in zip(pts, pts[1:])]
    total, out, i, acc = sum(seg), [], 0, 0.0
    for k in range(n):
        target = total * k / n
        while acc + seg[i] < target:
            acc += seg[i]
            i += 1
        t = (target - acc) / seg[i] if seg[i] else 0
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t))
    return out


def normalise(pts):
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    half = max(max(xs) - min(xs), max(ys) - min(ys)) / 2
    return [[round((x - cx) / half, 3), round((y - cy) / half, 3)] for x, y in pts]


def main():
    with urllib.request.urlopen(SOURCE, timeout=60) as r:
        features = {f["properties"]["id"]: f for f in json.load(r)["features"]}
    out = {
        "attribution": {
            "f1-circuits": "bacinger/f1-circuits, MIT, © Tomislav Bacinger",
            "openstreetmap": "© OpenStreetMap contributors, ODbL",
        },
        "circuits": {},
    }

    def add(key, name, length, match, source, metres):
        pts = resample(metres, POINTS)
        area = sum(x0 * y1 - x1 * y0 for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1])) / 2
        out["circuits"][key] = {"name": name, "length_m": length, "match": match, "source": source, "points": normalise(pts)}
        print(f"{key:14} {source:13} {'clockwise' if area < 0 else 'anticlockwise'}")

    for key, (fid, name, match) in CIRCUITS.items():
        f = features[fid]
        add(key, name, int(f["properties"]["length"]), match, "f1-circuits", to_metres(f["geometry"]["coordinates"]))
    for key, (way, pit, name, length, match) in OSM_CIRCUITS.items():
        add(key, name, length, match, "openstreetmap", osm_outline(way, pit))
    path = Path(__file__).resolve().parent.parent / "data" / "circuits.json"
    path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False) + "\n")
    print(f"wrote {path} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
