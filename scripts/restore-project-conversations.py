"""Restore existing project conversations to the active desktop thread catalog."""

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("thread_ids", nargs="+")
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    home = Path(os.environ["CODEX_HOME"])
    database = Path(os.environ["CODEX_SQLITE_HOME"]) / "state_5.sqlite"
    connection = sqlite3.connect(database.as_uri() + "?mode=rw", uri=True, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys=ON")
    ids = list(dict.fromkeys(args.thread_ids))
    for thread_id in ids:
        if str(uuid.UUID(thread_id)) != thread_id:
            raise ValueError("Expected canonical conversation IDs")
    marks = ",".join("?" for _ in ids)
    rows = [dict(row) for row in connection.execute(
        f"SELECT * FROM threads WHERE id IN ({marks})", ids
    )]
    if len(rows) != len(ids):
        raise ValueError("Some requested conversations are absent from the active database")
    projects = [row["project_id"] for row in connection.execute(
        "SELECT project_id, path FROM project_roots"
    ) if Path(row["path"]).samefile(root)]
    if len(set(projects)) != 1:
        raise ValueError("The workspace must resolve to one existing desktop project")
    project_id = projects[0]
    for row in rows:
        if not Path(row["cwd"]).samefile(root):
            raise ValueError(f"Unexpected conversation workspace: {row['id']}")
        if row["archived"] or not Path(row["rollout_path"]).is_file():
            raise ValueError(f"Conversation is archived or missing its history: {row['id']}")
        if row["project_id"] not in (None, project_id):
            raise ValueError(f"Conversation already belongs to another project: {row['id']}")
    now = dt.datetime.now(dt.timezone.utc)
    backup = home / "backups" / ("zhihu-sidebar-" + now.strftime("%Y%m%dT%H%M%S%fZ"))
    suffix = hashlib.sha256("\n".join(sorted(ids)).encode()).hexdigest()[:16]
    trigger_name = "desktop_import_source_" + suffix
    if args.apply:
        backup.mkdir(parents=True)
        (backup / "threads-before.json").write_text(json.dumps({
            "database": str(database), "project_id": project_id, "threads": rows,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        with connection:
            # Active CLI writers repeatedly persist their original exec source.
            # Keep this explicit import decision scoped to the requested IDs.
            literals = ",".join("'" + thread_id + "'" for thread_id in ids)
            connection.execute(f"""
                CREATE TRIGGER IF NOT EXISTS {trigger_name}
                AFTER UPDATE OF source, thread_source ON threads
                WHEN NEW.id IN ({literals}) AND NEW.source = 'exec'
                BEGIN
                    UPDATE threads SET source='cli',
                        thread_source='agent_created_thread' WHERE id=NEW.id;
                END
            """)
            for row in rows:
                title = (row["name"] or row["title"]).splitlines()[0].strip()
                # Desktop excludes exec sessions. Import these requested sessions
                # as browsable CLI conversations without rewriting their history.
                source = "cli" if row["source"] == "exec" else row["source"]
                connection.execute(
                    "UPDATE threads SET source=?, thread_source=?, name=?, "
                    "project_id=?, has_user_event=1, updated_at=?, updated_at_ms=?, "
                    "recency_at=?, recency_at_ms=? WHERE id=?",
                    (source, "agent_created_thread", title, project_id,
                     int(now.timestamp()), int(now.timestamp() * 1000),
                     int(now.timestamp()), int(now.timestamp() * 1000), row["id"]),
                )
    after = [dict(row) for row in connection.execute(
        f"SELECT id, name, source, thread_source, project_id, archived "
        f"FROM threads WHERE id IN ({marks})", ids
    )]
    connection.close()
    result = {
        "applied": args.apply, "database": str(database),
        "backup": str(backup) if args.apply else None,
        "source_protection_trigger": trigger_name if args.apply else None,
        "history_rewritten": False, "threads": after,
    }
    if args.apply:
        (backup / "recovery-result.json").write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
