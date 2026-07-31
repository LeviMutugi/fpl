"""Availability signals from news, extracted with an LLM.

The official `chance_of_playing_next_round` flag is the slowest-moving field in
the FPL API — it often lags a manager's press conference by a day or more, which
is exactly the window a research tool should be useful in. This adapter reads
availability text and turns it into a structured start probability that
overrides the official flag.

Two collection paths, in order of how much they need:

1. **The FPL API's own `news` field.** Already in the database, needs no network
   and no key. Every flagged player carries a short note ("Knee injury - 75%
   chance of playing") — genuine text from the source of record.
2. **Beat reporters on X.** Needs `X_BEARER_TOKEN`. The handles are configurable
   because which reporters are worth reading changes season to season.

Extraction runs through the Anthropic Messages API with a JSON schema, so the
model returns a validated object rather than prose that has to be parsed. An
override is only written when a name match is confident; anything looser is
counted and discarded. With no API key configured the adapter stores the news
items it collected and reports `unconfigured` for the extraction step — it never
invents a probability.
"""
from __future__ import annotations

import hashlib
import json
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable

from ..app import config
from ..app import db as dbm
from . import matching
from .fpl import log_finish, log_start, store_snapshot
from .http import SourceError, SourceUnreachable, fetch_json

X_SEARCH_URL = "https://api.x.com/2/tweets/search/recent"
NAME_MATCH_THRESHOLD = 0.8

EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "players": {
            "type": "array",
            "description": "One entry per player whose availability the text speaks to.",
            "items": {
                "type": "object",
                "properties": {
                    "player_name": {
                        "type": "string",
                        "description": "Player name exactly as written in the source text.",
                    },
                    "team": {
                        "type": "string",
                        "description": "Club named in the text, or an empty string if none is given.",
                    },
                    "start_probability": {
                        "type": "number",
                        "description": (
                            "Probability the player starts the next match, 0 to 1. "
                            "A fit first-choice starter is around 0.9; 'a doubt' is "
                            "around 0.4; 'ruled out' is 0."
                        ),
                    },
                    "minutes_estimate": {
                        "type": "number",
                        "description": "Expected minutes played in the next match, 0 to 90.",
                    },
                    "injury_status": {
                        "type": "string",
                        "description": (
                            "Short description such as 'Hamstring - doubtful', "
                            "'Fit', 'Suspended', or 'Unknown'."
                        ),
                    },
                    "confidence": {
                        "type": "number",
                        "description": (
                            "How confident you are in this reading of the text, 0 to 1. "
                            "Low when the text is vague or second-hand."
                        ),
                    },
                    "rationale": {
                        "type": "string",
                        "description": "One sentence quoting or paraphrasing the evidence.",
                    },
                },
                "required": [
                    "player_name",
                    "team",
                    "start_probability",
                    "minutes_estimate",
                    "injury_status",
                    "confidence",
                    "rationale",
                ],
                "additionalProperties": False,
            },
        }
    },
    "required": ["players"],
    "additionalProperties": False,
}

SYSTEM_PROMPT = (
    "You read Fantasy Premier League availability news and report what it says "
    "about whether each named player will start their next match.\n\n"
    "Rules:\n"
    "- Only report players the text actually speaks to. An empty list is the "
    "correct answer for text with no availability information.\n"
    "- Read the text literally. Do not use anything you know about these players "
    "beyond what is written.\n"
    "- When the source gives an explicit percentage, use it.\n"
    "- Set a low confidence when the wording is hedged, second-hand, or dated.\n"
    "- Keep the player's name exactly as the source spells it."
)


def _sha(text: str) -> str:
    return hashlib.sha256(text.strip().lower().encode("utf-8")).hexdigest()


# -----------------------------------------------------------------------------
# collection
# -----------------------------------------------------------------------------
def collect_official_flags(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    """The FPL API's own availability notes, already stored on each player."""
    items = []
    now = datetime.now(timezone.utc).isoformat()
    for r in conn.execute(
        """SELECT p.id, p.web_name, p.first_name, p.second_name, p.news, p.news_added,
                  p.status, p.chance_of_playing_next_round, t.name AS team
           FROM players p JOIN teams t ON t.id = p.team_id
           WHERE p.news IS NOT NULL AND TRIM(p.news) <> ''"""
    ):
        text = f"{r['first_name']} {r['second_name']} ({r['team']}): {r['news']}"
        items.append(
            {
                "source": "fpl_official_flag",
                "author": "Fantasy Premier League",
                "url": "https://fantasy.premierleague.com/",
                "published_at": r["news_added"] or now,
                "text": text,
                "sha256": _sha(text),
                "captured_at": now,
                "player_id": r["id"],
            }
        )
    return items


def collect_x_posts(handles: Iterable[str], lookback_hours: int = 72) -> tuple[list[dict[str, Any]], str]:
    """Recent posts from the configured beat reporters."""
    if not config.X_BEARER_TOKEN:
        return [], "X_BEARER_TOKEN is not set; skipping beat-reporter collection"

    handles = list(handles)
    if not handles:
        return [], "no handles configured in FPL_NEWS_SOURCES"

    query = "(" + " OR ".join(f"from:{h}" for h in handles) + ") -is:retweet"
    start_time = (datetime.now(timezone.utc) - timedelta(hours=lookback_hours)).strftime(
        "%Y-%m-%dT%H:%M:%SZ"
    )
    try:
        fetched = fetch_json(
            X_SEARCH_URL,
            headers={"Authorization": f"Bearer {config.X_BEARER_TOKEN}"},
            params={
                "query": query[:512],
                "max_results": 100,
                "start_time": start_time,
                "tweet.fields": "created_at,author_id,text",
                "expansions": "author_id",
                "user.fields": "username",
            },
        )
    except (SourceUnreachable, SourceError) as exc:
        return [], f"X search failed: {exc}"

    payload = fetched.payload if isinstance(fetched.payload, dict) else {}
    usernames = {
        u["id"]: u.get("username")
        for u in (payload.get("includes", {}) or {}).get("users", [])
    }
    now = datetime.now(timezone.utc).isoformat()
    items = []
    for post in payload.get("data", []) or []:
        text = str(post.get("text", "")).strip()
        if not text:
            continue
        author = usernames.get(post.get("author_id"), post.get("author_id"))
        items.append(
            {
                "source": f"x/{author}",
                "author": author,
                "url": f"https://x.com/{author}/status/{post.get('id')}",
                "published_at": post.get("created_at"),
                "text": text,
                "sha256": _sha(text),
                "captured_at": now,
                "player_id": None,
                "raw": post,
            }
        )
    return items, f"{len(items)} posts from {len(handles)} handles"


def store_items(conn: sqlite3.Connection, items: list[dict[str, Any]]) -> tuple[int, dict[str, int]]:
    """Insert news items, ignoring ones already seen. Returns (new, sha -> id)."""
    written = 0
    ids: dict[str, int] = {}
    for item in items:
        existing = conn.execute("SELECT id FROM news_items WHERE sha256 = ?", (item["sha256"],)).fetchone()
        if existing:
            ids[item["sha256"]] = existing["id"]
            continue
        cur = conn.execute(
            """INSERT INTO news_items (source, author, url, published_at, text, sha256, captured_at)
               VALUES (?,?,?,?,?,?,?)""",
            (
                item["source"], item["author"], item["url"], item["published_at"],
                item["text"], item["sha256"], item["captured_at"],
            ),
        )
        news_id = int(cur.lastrowid)
        ids[item["sha256"]] = news_id
        written += 1
        if item.get("player_id"):
            conn.execute(
                "INSERT OR IGNORE INTO news_player_links (news_id, player_id) VALUES (?,?)",
                (news_id, item["player_id"]),
            )
    conn.commit()
    return written, ids


# -----------------------------------------------------------------------------
# extraction
# -----------------------------------------------------------------------------
def extract(texts: list[str]) -> tuple[list[dict[str, Any]], str]:
    """Ask Claude for a structured reading of the collected text.

    Returns (extractions, message). An empty list with a message is the honest
    result when the key is missing or the API is unreachable.
    """
    if not config.ANTHROPIC_API_KEY:
        return [], (
            "ANTHROPIC_API_KEY is not set. The news agent stores collected items "
            "but writes no availability overrides without it."
        )
    if not texts:
        return [], "no news text to extract from"

    try:
        import anthropic
    except ImportError:
        return [], "the `anthropic` package is not installed (pip install anthropic)"

    client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
    document = "\n\n---\n\n".join(texts)
    try:
        response = client.messages.create(
            model=config.NEWS_MODEL,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            thinking={"type": "adaptive"},
            output_config={"format": {"type": "json_schema", "schema": EXTRACTION_SCHEMA}},
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Extract availability for every player these reports speak to.\n\n"
                        f"<reports>\n{document}\n</reports>"
                    ),
                }
            ],
        )
    except Exception as exc:  # network, auth, rate limit — all reported as-is
        return [], f"{type(exc).__name__}: {exc}"

    if response.stop_reason == "refusal":
        return [], "the model declined to answer this request"

    text = next((b.text for b in response.content if b.type == "text"), "")
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return [], "the model returned a response that was not valid JSON"
    return list(parsed.get("players", [])), (
        f"{len(parsed.get('players', []))} extractions from {len(texts)} reports "
        f"({response.usage.input_tokens} in / {response.usage.output_tokens} out tokens)"
    )


def write_overrides(
    conn: sqlite3.Connection,
    extractions: list[dict[str, Any]],
    event_id: int,
    news_ids: list[int],
) -> tuple[int, int]:
    """Persist extractions as availability overrides. Returns (written, dropped)."""
    written = 0
    dropped = 0
    now = datetime.now(timezone.utc).isoformat()
    for item in extractions:
        name = str(item.get("player_name", "")).strip()
        if not name:
            dropped += 1
            continue
        player_id, confidence = matching.match_player(conn, name, item.get("team") or None)
        if player_id is None or confidence < NAME_MATCH_THRESHOLD:
            dropped += 1
            continue
        conn.execute(
            """INSERT INTO availability_overrides
               (player_id, event_id, start_probability, minutes_estimate, injury_status,
                confidence, rationale, model, source_news_ids, created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)
               ON CONFLICT(player_id, event_id) DO UPDATE SET
                 start_probability=excluded.start_probability,
                 minutes_estimate=excluded.minutes_estimate,
                 injury_status=excluded.injury_status,
                 confidence=excluded.confidence,
                 rationale=excluded.rationale,
                 model=excluded.model,
                 source_news_ids=excluded.source_news_ids,
                 created_at=excluded.created_at""",
            (
                player_id,
                event_id,
                max(0.0, min(1.0, float(item.get("start_probability", 0.0)))),
                max(0.0, min(90.0, float(item.get("minutes_estimate", 0.0)))),
                str(item.get("injury_status", ""))[:200],
                max(0.0, min(1.0, float(item.get("confidence", 0.0)))),
                str(item.get("rationale", ""))[:1000],
                config.NEWS_MODEL,
                json.dumps(news_ids[:50]),
                now,
            ),
        )
        written += 1
    conn.commit()
    return written, dropped


# -----------------------------------------------------------------------------
# entry point
# -----------------------------------------------------------------------------
def _next_event(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        "SELECT id FROM events WHERE finished = 0 ORDER BY is_current DESC, is_next DESC, id LIMIT 1"
    ).fetchone()
    return int(row["id"]) if row else 1


def ingest(conn: sqlite3.Connection, event_id: int | None = None, limit: int | None = None) -> dict[str, Any]:
    run = log_start(conn, "news")
    event_id = int(event_id or _next_event(conn))

    official = collect_official_flags(conn)
    posts, post_message = collect_x_posts(config.NEWS_SOURCES)
    items = official + posts
    if not items:
        message = f"no availability text found ({post_message})"
        log_finish(conn, run, "ok", 0, message)
        return {"source": "news", "mode": "live", "rows": 0, "message": message}

    if posts:
        store_snapshot(conn, "x:beat_reporters", [p.get("raw") for p in posts], source="news")

    new_items, sha_to_id = store_items(conn, items)
    texts = [i["text"] for i in items][: (limit or 120)]
    extractions, extract_message = extract(texts)
    news_ids = list(sha_to_id.values())

    if not extractions:
        status = "unconfigured" if not config.ANTHROPIC_API_KEY else "partial"
        message = (
            f"collected {len(items)} availability reports ({new_items} new); "
            f"no overrides written — {extract_message}. {post_message}"
        )
        log_finish(conn, run, status, new_items, message)
        return {"source": "news", "mode": status, "rows": new_items, "message": message}

    written, dropped = write_overrides(conn, extractions, event_id, news_ids)
    message = (
        f"collected {len(items)} reports ({new_items} new); {extract_message}; "
        f"wrote {written} overrides for GW{event_id}"
        + (f"; dropped {dropped} whose name match was below {NAME_MATCH_THRESHOLD}" if dropped else "")
    )
    log_finish(conn, run, "ok", new_items + written, message)
    return {"source": "news", "mode": "live", "rows": new_items + written, "message": message}


def summarise_flag(text: str) -> str | None:
    """Pull the percentage out of an official FPL news note, when it has one."""
    match = re.search(r"(\d{1,3})\s*%", text or "")
    return match.group(0) if match else None
