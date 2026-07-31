"""Player and team name resolution across data sources.

Every external source spells names its own way: FBref writes "Gabriel Martinelli"
where FPL says "Martinelli", the odds feed writes "Nottingham Forest" where the
FPL API says "Nott'm Forest", and a beat reporter writes "M. Salah". Joining on
raw strings therefore silently drops rows, which is the worst failure mode for a
research engine: the model sees a smaller sample and never says so.

The modelling choice here is to make the join *explicit and scored* rather than
exact-or-nothing. Every resolution returns a confidence in [0, 1] that is stored
alongside the projected row, so a downstream consumer can decide its own
threshold — the FBref projection keeps everything and records the score, while
the news agent refuses to write an availability override below 0.8, because a
mis-attributed injury is far more damaging than a missing one.

The ladder is deliberately ordered from evidence-rich to evidence-poor:

    1.0   exact normalised full name              (unambiguous)
    1.0   exact normalised web_name               (unambiguous within the game)
    0.9   first initial + surname                 ("M. Salah")
    0.86  unique surname                          (only one "Saka" in the league)
    ratio difflib.SequenceMatcher over both forms (fuzzy, with team tiebreak)

Normalisation strips diacritics via unicodedata (so "Ødegaard" == "Odegaard"),
lowercases, drops punctuation and collapses whitespace. A `team_hint` never
creates a match on its own; it only breaks ties and adds a small bonus, so a
wrong hint degrades the score instead of inventing a player.
"""
from __future__ import annotations

import difflib
import re
import sqlite3
import unicodedata
from dataclasses import dataclass, field
from typing import Any

# --- normalisation ----------------------------------------------------------

_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)
_WS = re.compile(r"\s+")


def normalise(name: str | None) -> str:
    """Accent-free, lowercase, punctuation-free, single-spaced form of a name."""
    if not name:
        return ""
    decomposed = unicodedata.normalize("NFKD", str(name))
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    stripped = stripped.replace("ø", "o").replace("Ø", "O").replace("ł", "l").replace("đ", "d")
    lowered = stripped.lower()
    lowered = _PUNCT.sub(" ", lowered)
    return _WS.sub(" ", lowered).strip()


def _surname(norm: str) -> str:
    parts = norm.split()
    return parts[-1] if parts else ""


def _initial_surname(norm: str) -> str:
    parts = norm.split()
    if len(parts) < 2:
        return ""
    return f"{parts[0][0]} {parts[-1]}"


# --- cached index -----------------------------------------------------------


@dataclass(slots=True)
class PlayerIndex:
    """Pre-normalised lookup tables built once per connection."""

    n_players: int = 0
    by_full: dict[str, list[int]] = field(default_factory=dict)
    by_web: dict[str, list[int]] = field(default_factory=dict)
    by_initial_surname: dict[str, list[int]] = field(default_factory=dict)
    by_surname: dict[str, list[int]] = field(default_factory=dict)
    # player_id -> (normalised full, normalised web, team_id, normalised team names)
    meta: dict[int, tuple[str, str, int, set[str]]] = field(default_factory=dict)


@dataclass(slots=True)
class TeamIndex:
    n_teams: int = 0
    by_name: dict[str, int] = field(default_factory=dict)
    names: dict[int, set[str]] = field(default_factory=dict)


_PLAYER_CACHE: dict[int, PlayerIndex] = {}
_TEAM_CACHE: dict[int, TeamIndex] = {}

# Bookmaker/press aliases the normaliser cannot bridge on its own. Keyed by the
# normalised external form; the value is a normalised FPL `name`/`short_name`.
TEAM_ALIASES: dict[str, str] = {
    "nottingham forest": "nott m forest",
    "nottm forest": "nott m forest",
    "wolverhampton wanderers": "wolves",
    "wolverhampton": "wolves",
    "tottenham hotspur": "tottenham",
    "spurs": "tottenham",
    "manchester city": "man city",
    "manchester utd": "man utd",
    "manchester united": "man utd",
    "newcastle united": "newcastle",
    "west ham united": "west ham",
    "brighton and hove albion": "brighton",
    "brighton hove albion": "brighton",
    "leicester city": "leicester",
    "leeds united": "leeds",
    "ipswich town": "ipswich",
    "luton town": "luton",
    "norwich city": "norwich",
    "afc bournemouth": "bournemouth",
    "brentford fc": "brentford",
    "crystal palace fc": "crystal palace",
    "sheffield united": "sheffield utd",
    "west bromwich albion": "west brom",
    "hull city": "hull",
    "burnley fc": "burnley",
    "sunderland afc": "sunderland",
    "everton fc": "everton",
    "fulham fc": "fulham",
    "arsenal fc": "arsenal",
    "chelsea fc": "chelsea",
    "liverpool fc": "liverpool",
    "aston villa fc": "aston villa",
}


def _add(bucket: dict[str, list[int]], key: str, pid: int) -> None:
    if not key:
        return
    bucket.setdefault(key, []).append(pid)


def _table_count(conn: sqlite3.Connection, table: str) -> int:
    try:
        return int(conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
    except sqlite3.Error:
        return 0


def player_index(conn: sqlite3.Connection, *, refresh: bool = False) -> PlayerIndex:
    """Build (or reuse) the normalised player index for this connection."""
    key = id(conn)
    cached = _PLAYER_CACHE.get(key)
    count = _table_count(conn, "players")
    if cached is not None and not refresh and cached.n_players == count:
        return cached

    teams = team_index(conn, refresh=refresh)
    idx = PlayerIndex(n_players=count)
    rows = conn.execute(
        "SELECT id, first_name, second_name, web_name, known_name, team_id FROM players"
    ).fetchall()
    for r in rows:
        pid = int(r["id"])
        full = normalise(f"{r['first_name']} {r['second_name']}")
        web = normalise(r["web_name"])
        known = normalise(r["known_name"]) if r["known_name"] else ""
        team_id = int(r["team_id"])
        idx.meta[pid] = (full, web, team_id, teams.names.get(team_id, set()))
        for form in {full, known}:
            _add(idx.by_full, form, pid)
        _add(idx.by_web, web, pid)
        for form in {full, known}:
            _add(idx.by_initial_surname, _initial_surname(form), pid)
            _add(idx.by_surname, _surname(form), pid)
        _add(idx.by_surname, _surname(web), pid)
    _PLAYER_CACHE[key] = idx
    return idx


def team_index(conn: sqlite3.Connection, *, refresh: bool = False) -> TeamIndex:
    key = id(conn)
    cached = _TEAM_CACHE.get(key)
    count = _table_count(conn, "teams")
    if cached is not None and not refresh and cached.n_teams == count:
        return cached
    idx = TeamIndex(n_teams=count)
    for r in conn.execute("SELECT id, name, short_name FROM teams").fetchall():
        tid = int(r["id"])
        forms = {normalise(r["name"]), normalise(r["short_name"])}
        forms.discard("")
        idx.names[tid] = forms
        for form in forms:
            idx.by_name[form] = tid
    _TEAM_CACHE[key] = idx
    return idx


def invalidate(conn: sqlite3.Connection | None = None) -> None:
    """Drop cached indexes (call after re-projecting players/teams)."""
    if conn is None:
        _PLAYER_CACHE.clear()
        _TEAM_CACHE.clear()
        return
    _PLAYER_CACHE.pop(id(conn), None)
    _TEAM_CACHE.pop(id(conn), None)


# --- matching ---------------------------------------------------------------


def match_team(conn: sqlite3.Connection, name: str | None) -> tuple[int | None, float]:
    """Resolve a team name to `teams.id` with a confidence in [0, 1]."""
    norm = normalise(name)
    if not norm:
        return None, 0.0
    idx = team_index(conn)
    if not idx.by_name:
        return None, 0.0

    if norm in idx.by_name:
        return idx.by_name[norm], 1.0
    alias = TEAM_ALIASES.get(norm)
    if alias and alias in idx.by_name:
        return idx.by_name[alias], 0.98

    # Drop common suffixes/prefixes ("fc", "afc", "united") and retry.
    tokens = [t for t in norm.split() if t not in {"fc", "afc", "cf", "the"}]
    reduced = " ".join(tokens)
    if reduced and reduced in idx.by_name:
        return idx.by_name[reduced], 0.95
    alias = TEAM_ALIASES.get(reduced)
    if alias and alias in idx.by_name:
        return idx.by_name[alias], 0.95

    best_id: int | None = None
    best_ratio = 0.0
    for form, tid in idx.by_name.items():
        ratio = difflib.SequenceMatcher(None, norm, form).ratio()
        if ratio > best_ratio:
            best_ratio, best_id = ratio, tid
    if best_id is not None and best_ratio >= 0.72:
        return best_id, round(best_ratio, 4)
    return None, round(best_ratio, 4)


def _team_matches(conn: sqlite3.Connection, pid: int, team_hint: str | None) -> bool:
    if not team_hint:
        return False
    idx = player_index(conn)
    meta = idx.meta.get(pid)
    if meta is None:
        return False
    hint_id, hint_conf = match_team(conn, team_hint)
    if hint_id is not None and hint_conf >= 0.7:
        return hint_id == meta[2]
    return normalise(team_hint) in meta[3]


def _pick(
    conn: sqlite3.Connection,
    candidates: list[int],
    team_hint: str | None,
    base: float,
) -> tuple[int | None, float]:
    """Resolve a candidate list, using the team as a tiebreaker."""
    if not candidates:
        return None, 0.0
    unique = list(dict.fromkeys(candidates))
    if len(unique) == 1:
        pid = unique[0]
        if team_hint and _team_matches(conn, pid, team_hint):
            return pid, min(1.0, base + 0.02)
        return pid, base
    if team_hint:
        narrowed = [pid for pid in unique if _team_matches(conn, pid, team_hint)]
        if len(narrowed) == 1:
            return narrowed[0], base
    # Ambiguous without a discriminating team: return the first but discount
    # heavily so callers with a threshold reject it.
    return unique[0], round(base * 0.6, 4)


def match_player(
    conn: sqlite3.Connection,
    name: str | None,
    team_hint: str | None = None,
) -> tuple[int | None, float]:
    """Resolve an external player name to `players.id` with a confidence.

    Returns `(None, 0.0)` when the players table is empty or the name is blank,
    and `(None, ratio)` when the best fuzzy candidate falls below the floor —
    callers log the miss rather than guessing.
    """
    norm = normalise(name)
    if not norm:
        return None, 0.0
    idx = player_index(conn)
    if not idx.meta:
        return None, 0.0

    if norm in idx.by_full:
        return _pick(conn, idx.by_full[norm], team_hint, 1.0)
    if norm in idx.by_web:
        return _pick(conn, idx.by_web[norm], team_hint, 1.0)

    init = _initial_surname(norm)
    if init and init in idx.by_initial_surname:
        return _pick(conn, idx.by_initial_surname[init], team_hint, 0.9)
    # "M Salah" style input where the source already abbreviated the forename.
    if norm in idx.by_initial_surname:
        return _pick(conn, idx.by_initial_surname[norm], team_hint, 0.9)

    surname = _surname(norm)
    if surname and surname in idx.by_surname and len(norm.split()) == 1:
        cands = list(dict.fromkeys(idx.by_surname[surname]))
        if len(cands) == 1:
            return cands[0], 0.86
        if team_hint:
            narrowed = [pid for pid in cands if _team_matches(conn, pid, team_hint)]
            if len(narrowed) == 1:
                return narrowed[0], 0.86

    best_id: int | None = None
    best_ratio = 0.0
    for pid, (full, web, _team_id, team_forms) in idx.meta.items():
        ratio = max(
            difflib.SequenceMatcher(None, norm, full).ratio(),
            difflib.SequenceMatcher(None, norm, web).ratio(),
        )
        if team_hint and normalise(team_hint) in team_forms:
            ratio = min(1.0, ratio + 0.05)  # team agreement breaks near-ties
        if ratio > best_ratio:
            best_ratio, best_id = ratio, pid
    if best_id is not None and best_ratio >= 0.7:
        return best_id, round(best_ratio, 4)
    return None, round(best_ratio, 4)


def describe(conn: sqlite3.Connection) -> dict[str, Any]:
    """Index sizes, for the CLI/status output."""
    p = player_index(conn)
    t = team_index(conn)
    return {"players_indexed": p.n_players, "teams_indexed": t.n_teams}
