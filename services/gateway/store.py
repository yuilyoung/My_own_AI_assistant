import json
import sqlite3
import threading
from pathlib import Path
from uuid import uuid4

from .contracts import SessionCreate
from .policy import require_assistant, scope_for


class Store:
    """Single-user SQLite repository. Scopes are derived from stored sessions, not request text."""

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            PRAGMA foreign_keys=ON;
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY, mode TEXT NOT NULL, character TEXT NOT NULL,
                scope TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS exchanges (
                id INTEGER PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
                turn_id TEXT NOT NULL UNIQUE, user_text TEXT NOT NULL, reply TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY, scope TEXT NOT NULL, text TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY, scope TEXT NOT NULL, text TEXT NOT NULL
            );
        """)
        self.db.commit()

    def close(self):
        self.db.close()

    def create_session(self, value: SessionCreate) -> dict:
        sid = str(uuid4())
        with self.lock, self.db:
            self.db.execute(
                "INSERT INTO sessions(id,mode,character,scope) VALUES(?,?,?,?)",
                (sid, value.mode, value.character, scope_for(value)),
            )
        return self.session(sid)

    def session(self, sid: str) -> dict:
        with self.lock:
            row = self.db.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
        if row is None:
            raise KeyError(sid)
        return dict(row)

    def history(self, sid: str) -> list[dict]:
        self.session(sid)
        with self.lock:
            rows = self.db.execute(
                "SELECT user_text,reply FROM exchanges WHERE session_id=? ORDER BY id DESC LIMIT 6",
                (sid,),
            ).fetchall()
        result = []
        for row in reversed(rows):
            result.extend(
                [
                    {"role": "user", "content": row["user_text"]},
                    {"role": "assistant", "content": row["reply"]},
                ]
            )
        return result

    def save_exchange(self, sid: str, tid: str, text: str, reply: dict):
        with self.lock, self.db:
            self.db.execute(
                "INSERT INTO exchanges(session_id,turn_id,user_text,reply) VALUES(?,?,?,?)",
                (sid, tid, text, json.dumps(reply, ensure_ascii=False)),
            )

    def memories(self, sid: str) -> list[dict]:
        scope = self.session(sid)["scope"]
        with self.lock:
            return [
                dict(r)
                for r in self.db.execute(
                    "SELECT id,text FROM memories WHERE scope=? ORDER BY rowid", (scope,)
                )
            ]

    def add_memory(self, sid: str, text: str) -> dict:
        scope = self.session(sid)["scope"]
        with self.lock, self.db:
            count = self.db.execute(
                "SELECT count(*) FROM memories WHERE scope=?", (scope,)
            ).fetchone()[0]
            if count >= 50:
                raise ValueError("Maximum 50 memories per scope")
            mid = str(uuid4())
            self.db.execute("INSERT INTO memories VALUES(?,?,?)", (mid, scope, text))
        return {"id": mid, "text": text}

    def delete_memory(self, sid: str, mid: str) -> bool:
        scope = self.session(sid)["scope"]
        with self.lock, self.db:
            return (
                self.db.execute(
                    "DELETE FROM memories WHERE id=? AND scope=?", (mid, scope)
                ).rowcount
                > 0
            )

    def notes(self, sid: str) -> list[dict]:
        s = self.session(sid)
        require_assistant(s["mode"])
        with self.lock:
            return [
                dict(r)
                for r in self.db.execute(
                    "SELECT id,text FROM notes WHERE scope=? ORDER BY rowid", (s["scope"],)
                )
            ]

    def add_note(self, sid: str, text: str) -> dict:
        s = self.session(sid)
        require_assistant(s["mode"])
        with self.lock, self.db:
            count = self.db.execute(
                "SELECT count(*) FROM notes WHERE scope=?", (s["scope"],)
            ).fetchone()[0]
            if count >= 200:
                raise ValueError("Maximum 200 notes")
            nid = str(uuid4())
            self.db.execute("INSERT INTO notes VALUES(?,?,?)", (nid, s["scope"], text))
        return {"id": nid, "text": text}
