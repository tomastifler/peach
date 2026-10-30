"""Verified backfill repairs reusable by startup repair and maintenance commands."""
from __future__ import annotations
import sqlite3
from .entities import normalize_entity_name, split_composite_person_name


PERSON_KINDS = ("performer", "creator")

FIELDS = ("verdict", "kind", "entity_id", "canonical_name", "field",
          "value", "source", "parts", "target", "note")

#: When a manual decision rewrites a canonical name, the replaced old name is recorded under this source. It was not given by any site; the user decided it.
CLEANUP_SOURCE = "user:name-cleanup"

EXTRA_COUNTS = {
    "composite_alias": (
        "SELECT count(*) FROM entity_alias WHERE alias LIKE '%(%' OR alias LIKE '%（%'"),
}


def _collision(connection: sqlite3.Connection, entity_id: int, part: str) -> str:
    """Whether this segment is the canonical name of another entity. If so, the whole row is not split and goes to manual review.

    A split-out name colliding with another entity's canonical name means the two entities may be the same person - that is the question a merge needs
    to answer, not something that splitting aliases can settle in passing. Quietly inserting it would only leave both sides holding each other's name.
    """
    row = connection.execute(
        "SELECT id, kind, canonical_name FROM entity "
        "WHERE normalized_name=? AND id<>?",
        (normalize_entity_name(part), entity_id)).fetchone()
    return "" if row is None else f"collides with entity {row[0]}({row[1]}){row[2]}"


def collect(connection: sqlite3.Connection) -> list[dict[str, object]]:
    """Every parenthesized entity name and alias in the ledger, with its verdict marked."""
    rows: list[dict[str, object]] = []
    scans = (
        ("alias", "SELECT a.entity_id, e.kind, e.canonical_name, a.alias, a.source "
                  "FROM entity_alias a JOIN entity e ON e.id=a.entity_id "
                  "WHERE a.alias LIKE '%(%' OR a.alias LIKE '%（%'"),
        ("canonical", "SELECT id, kind, canonical_name, canonical_name, '' FROM entity "
                      "WHERE canonical_name LIKE '%(%' OR canonical_name LIKE '%（%'"),
    )
    for field, sql in scans:
        for entity_id, kind, canonical, value, source in connection.execute(sql):
            parts = split_composite_person_name(value)
            note, verdict = "", "review"
            # The criterion is "the signature matched", not "how many segments came out". `Rei Mizuna (Rei Mizuna)` after deduplication
            # leaves only one segment, but it is still that packed field and still has to be replaced with a clean row.
            if parts == [value.strip()]:
                note = "Not a romanized compound name"
            elif kind not in PERSON_KINDS:
                note = f"{kind} parentheses are not a stage name"
            elif field == "canonical":
                note = "The canonical name needs a manual decision on which to keep"
            else:
                collisions = [c for c in (_collision(connection, int(entity_id), part)
                                          for part in parts) if c]
                if collisions:
                    note = "; ".join(collisions)
                else:
                    verdict = "auto"
            rows.append({
                "verdict": verdict, "kind": kind, "entity_id": int(entity_id),
                "canonical_name": canonical, "field": field, "value": value,
                "source": source or "", "parts": " | ".join(parts),
                "target": " | ".join(parts) if verdict == "auto" else "", "note": note,
            })
    rows.sort(key=lambda row: (row["verdict"] != "auto", str(row["kind"]),
                               int(row["entity_id"])))
    return rows


def apply_rows(connection: sqlite3.Connection,
               rows: list[dict[str, object]]) -> dict[str, int]:
    """Split the `auto` row: first add the segments, then delete the compound alias.

    Each segment is recorded under the source that provided it. They really were given by it, just packed into one field; rewriting them as
    "this script" would make it impossible for the next person to find out who supplied these romanizations.
    """
    added = removed = 0
    for row in rows:
        if row["verdict"] != "auto":
            continue
        entity_id, source = int(row["entity_id"]), str(row["source"])
        for part in str(row["parts"]).split(" | "):
            connection.execute(
                "INSERT OR IGNORE INTO entity_alias"
                "(entity_id,alias,normalized_alias,source) VALUES(?,?,?,?)",
                (entity_id, part, normalize_entity_name(part), source))
            added += connection.execute("SELECT changes()").fetchone()[0]
        connection.execute(
            "DELETE FROM entity_alias WHERE entity_id=? AND alias=? AND source=?",
            (entity_id, row["value"], source))
        removed += connection.execute("SELECT changes()").fetchone()[0]
    return {"added": added, "removed": removed}


def _blocked(connection: sqlite3.Connection, entity_id: int,
             names: list[str]) -> str:
    """Manual decisions also go through the collision check: colliding with another entity's canonical name must go through a merge, not a mere rename."""
    return "; ".join(hit for hit in (_collision(connection, entity_id, name)
                                     for name in names) if hit)
