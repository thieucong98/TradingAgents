import json
import secrets
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .config import settings


class Database:
    def __init__(self, db_path: Path = settings.DB_PATH):
        self.db_path = db_path
        self._init_db()

    def get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        # Enable WAL mode for high-concurrency read/write
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=30000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self):
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self.get_connection() as conn:
            conn.executescript("""
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                ticker TEXT NOT NULL,
                trade_date TEXT NOT NULL,
                asset_type TEXT DEFAULT 'stock',
                analysts TEXT NOT NULL,
                llm_provider TEXT NOT NULL,
                deep_think_llm TEXT NOT NULL,
                quick_think_llm TEXT NOT NULL,
                max_debate_rounds INTEGER DEFAULT 1,
                max_risk_discuss_rounds INTEGER DEFAULT 1,
                output_language TEXT DEFAULT 'English',
                status TEXT NOT NULL,
                progress INTEGER DEFAULT 0,
                current_stage TEXT DEFAULT 'Queued',
                decision_signal TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                started_at TEXT,
                completed_at TEXT,
                duration_seconds REAL
            );

            CREATE TABLE IF NOT EXISTS job_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                event_type TEXT NOT NULL,
                data TEXT NOT NULL,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS job_reports (
                job_id TEXT PRIMARY KEY,
                final_state TEXT NOT NULL,
                complete_report_md TEXT,
                executive_summary TEXT,
                recommendation TEXT,
                entry_price REAL,
                stop_loss REAL,
                target_price REAL,
                market_report_md TEXT,
                sentiment_report_md TEXT,
                news_report_md TEXT,
                fundamentals_report_md TEXT,
                FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
            CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_job_events_job_id ON job_events(job_id, id ASC);

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                must_change_password INTEGER DEFAULT 1,
                failed_login_attempts INTEGER DEFAULT 0,
                locked_until TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_login_at TEXT
            );

            CREATE TABLE IF NOT EXISTS user_sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                ip_address TEXT,
                user_agent TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON user_sessions(expires_at);
            """)
            self._init_admin_user(conn)

    def _init_admin_user(self, conn: sqlite3.Connection):
        """Seed default admin user if users table is empty."""
        from .auth import hash_password

        row = conn.execute("SELECT COUNT(*) as count FROM users").fetchone()
        if row and row["count"] == 0:
            now_str = datetime.utcnow().isoformat()
            user_id = secrets.token_hex(8)
            pwd_hash, salt = hash_password(settings.ADMIN_INITIAL_PASSWORD)
            conn.execute(
                """
                INSERT INTO users (
                    id, username, password_hash, salt, must_change_password,
                    failed_login_attempts, locked_until, created_at, updated_at
                ) VALUES (?, ?, ?, ?, 1, 0, NULL, ?, ?)
                """,
                (user_id, settings.ADMIN_USERNAME, pwd_hash, salt, now_str, now_str),
            )
            conn.commit()

    # Jobs Operations
    def create_job(self, job_dict: dict[str, Any]) -> dict[str, Any]:
        data = dict(job_dict)
        if isinstance(data.get("analysts"), list):
            data["analysts"] = json.dumps(data["analysts"])
        elif not data.get("analysts"):
            data["analysts"] = json.dumps(["market", "social", "news", "fundamentals"])
        data.setdefault("asset_type", "stock")
        data.setdefault("llm_provider", "openai")
        data.setdefault("deep_think_llm", "gpt-5.6")
        data.setdefault("quick_think_llm", "gpt-5.6-luna")
        data.setdefault("max_debate_rounds", 1)
        data.setdefault("max_risk_discuss_rounds", 1)
        data.setdefault("output_language", "English")
        data.setdefault("status", "queued")
        data.setdefault("progress", 0)
        data.setdefault("current_stage", "Queued")
        data.setdefault("created_at", datetime.utcnow().isoformat())
        with self.get_connection() as conn:
            conn.execute("""
            INSERT OR REPLACE INTO jobs (
                id, ticker, trade_date, asset_type, analysts,
                llm_provider, deep_think_llm, quick_think_llm,
                max_debate_rounds, max_risk_discuss_rounds, output_language,
                status, progress, current_stage, created_at
            ) VALUES (
                :id, :ticker, :trade_date, :asset_type, :analysts,
                :llm_provider, :deep_think_llm, :quick_think_llm,
                :max_debate_rounds, :max_risk_discuss_rounds, :output_language,
                :status, :progress, :current_stage, :created_at
            )
            """, data)
            conn.commit()
        return job_dict

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self.get_connection() as conn:
            row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
            if not row:
                return None
            res = dict(row)
            res["analysts"] = json.loads(res["analysts"]) if res.get("analysts") else []
            return res

    def list_jobs(self, limit: int = 50, offset: int = 0, status: str | None = None) -> list[dict[str, Any]]:
        with self.get_connection() as conn:
            if status:
                cursor = conn.execute(
                    "SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                    (status, limit, offset)
                )
            else:
                cursor = conn.execute(
                    "SELECT * FROM jobs ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?",
                    (limit, offset)
                )
            rows = cursor.fetchall()
            result = []
            for r in rows:
                item = dict(r)
                item["analysts"] = json.loads(item["analysts"]) if item.get("analysts") else []
                result.append(item)
            return result

    def count_jobs(self, status: str | None = None) -> int:
        with self.get_connection() as conn:
            if status:
                row = conn.execute("SELECT COUNT(*) as cnt FROM jobs WHERE status = ?", (status,)).fetchone()
            else:
                row = conn.execute("SELECT COUNT(*) as cnt FROM jobs").fetchone()
            return int(row["cnt"]) if row else 0

    def update_job_status(
        self,
        job_id: str,
        status: str,
        progress: int | None = None,
        current_stage: str | None = None,
        decision_signal: str | None = None,
        error_message: str | None = None,
        started_at: str | None = None,
        completed_at: str | None = None,
        duration_seconds: float | None = None
    ):
        updates = ["status = :status"]
        params: dict[str, Any] = {"job_id": job_id, "status": status}

        if progress is not None:
            updates.append("progress = :progress")
            params["progress"] = progress
        if current_stage is not None:
            updates.append("current_stage = :current_stage")
            params["current_stage"] = current_stage
        if decision_signal is not None:
            updates.append("decision_signal = :decision_signal")
            params["decision_signal"] = decision_signal
        if error_message is not None:
            updates.append("error_message = :error_message")
            params["error_message"] = error_message
        if started_at is not None:
            updates.append("started_at = :started_at")
            params["started_at"] = started_at
        if completed_at is not None:
            updates.append("completed_at = :completed_at")
            params["completed_at"] = completed_at
        if duration_seconds is not None:
            updates.append("duration_seconds = :duration_seconds")
            params["duration_seconds"] = duration_seconds

        sql = f"UPDATE jobs SET {', '.join(updates)} WHERE id = :job_id"
        with self.get_connection() as conn:
            conn.execute(sql, params)
            conn.commit()

    def delete_job(self, job_id: str) -> bool:
        """Delete a single job from database. Cascades to job_events and job_reports."""
        with self.get_connection() as conn:
            cursor = conn.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
            conn.commit()
            return cursor.rowcount > 0

    def delete_jobs_batch(self, job_ids: list[str]) -> int:
        """Delete multiple jobs in a single transaction. Cascades to job_events and job_reports."""
        if not job_ids:
            return 0
        placeholders = ",".join("?" for _ in job_ids)
        sql = f"DELETE FROM jobs WHERE id IN ({placeholders})"
        with self.get_connection() as conn:
            cursor = conn.execute(sql, tuple(job_ids))
            conn.commit()
            return cursor.rowcount

    def clear_jobs(self, status: str | None = None, all_finished: bool = False) -> int:
        """Clear jobs matching criteria. Cascades to job_events and job_reports."""
        with self.get_connection() as conn:
            if status:
                cursor = conn.execute("DELETE FROM jobs WHERE status = ?", (status,))
            elif all_finished:
                cursor = conn.execute("DELETE FROM jobs WHERE status IN ('completed', 'failed', 'cancelled')")
            else:
                cursor = conn.execute("DELETE FROM jobs")
            conn.commit()
            return cursor.rowcount

    # Events Operations
    def add_event(self, job_id: str, event_type: str, data: dict[str, Any]):
        now = datetime.utcnow().isoformat() + "Z"
        with self.get_connection() as conn:
            conn.execute("""
            INSERT INTO job_events (job_id, timestamp, event_type, data)
            VALUES (?, ?, ?, ?)
            """, (job_id, now, event_type, json.dumps(data, ensure_ascii=False)))
            conn.commit()

    def get_events(self, job_id: str, after_id: int = 0) -> list[dict[str, Any]]:
        with self.get_connection() as conn:
            rows = conn.execute(
                "SELECT id, timestamp, event_type, data FROM job_events WHERE job_id = ? AND id > ? ORDER BY id ASC",
                (job_id, after_id)
            ).fetchall()
            result = []
            for r in rows:
                result.append({
                    "id": r["id"],
                    "job_id": job_id,
                    "timestamp": r["timestamp"],
                    "event_type": r["event_type"],
                    "data": json.loads(r["data"]) if r["data"] else {}
                })
            return result

    # Reports Operations
    def save_report(self, report_dict: dict[str, Any]):
        data = dict(report_dict)
        data.setdefault("final_state", "{}")
        data.setdefault("complete_report_md", "")
        data.setdefault("executive_summary", "")
        data.setdefault("recommendation", None)
        data.setdefault("entry_price", None)
        data.setdefault("stop_loss", None)
        data.setdefault("target_price", None)
        data.setdefault("market_report_md", "")
        data.setdefault("sentiment_report_md", "")
        data.setdefault("news_report_md", "")
        data.setdefault("fundamentals_report_md", "")
        with self.get_connection() as conn:
            conn.execute("""
            INSERT OR REPLACE INTO job_reports (
                job_id, final_state, complete_report_md, executive_summary,
                recommendation, entry_price, stop_loss, target_price,
                market_report_md, sentiment_report_md, news_report_md, fundamentals_report_md
            ) VALUES (
                :job_id, :final_state, :complete_report_md, :executive_summary,
                :recommendation, :entry_price, :stop_loss, :target_price,
                :market_report_md, :sentiment_report_md, :news_report_md, :fundamentals_report_md
            )
            """, data)
            conn.commit()

    def get_report(self, job_id: str) -> dict[str, Any] | None:
        with self.get_connection() as conn:
            row = conn.execute("SELECT * FROM job_reports WHERE job_id = ?", (job_id,)).fetchone()
            if not row:
                return None
            res = dict(row)
            if res.get("final_state"):
                res["final_state"] = json.loads(res["final_state"])
            return res

    # -------------------------------------------------------------
    # User & Authentication Operations
    # -------------------------------------------------------------
    def get_user_by_username(self, username: str) -> dict[str, Any] | None:
        """Fetch user record by unique username."""
        with self.get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE username = ?",
                (username.strip(),),
            ).fetchone()
            return dict(row) if row else None

    def get_user_by_id(self, user_id: str) -> dict[str, Any] | None:
        """Fetch user record by user ID."""
        with self.get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM users WHERE id = ?",
                (user_id,),
            ).fetchone()
            return dict(row) if row else None

    def record_login_failure(
        self, username: str, max_attempts: int, lockout_minutes: int
    ) -> dict[str, Any] | None:
        """Increment failed attempts and lock account if threshold exceeded."""
        user = self.get_user_by_username(username)
        if not user:
            return None

        attempts = user.get("failed_login_attempts", 0) + 1
        now = datetime.utcnow()
        locked_until = None

        if attempts >= max_attempts:
            locked_until = (now + timedelta(minutes=lockout_minutes)).isoformat()

        with self.get_connection() as conn:
            conn.execute(
                """
                UPDATE users
                SET failed_login_attempts = ?, locked_until = ?, updated_at = ?
                WHERE id = ?
                """,
                (attempts, locked_until, now.isoformat(), user["id"]),
            )
            conn.commit()

        user["failed_login_attempts"] = attempts
        user["locked_until"] = locked_until
        return user

    def record_login_success(self, user_id: str) -> None:
        """Reset failed login counter and update last login timestamp."""
        now = datetime.utcnow().isoformat()
        with self.get_connection() as conn:
            conn.execute(
                """
                UPDATE users
                SET failed_login_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, now, user_id),
            )
            conn.commit()

    def update_user_password(
        self,
        user_id: str,
        new_hash: str,
        new_salt: str,
        keep_token_hash: str | None = None,
    ) -> bool:
        """Update password hash, reset must_change_password flag, and revoke other sessions."""
        now = datetime.utcnow().isoformat()
        with self.get_connection() as conn:
            cursor = conn.execute(
                """
                UPDATE users
                SET password_hash = ?, salt = ?, must_change_password = 0, updated_at = ?
                WHERE id = ?
                """,
                (new_hash, new_salt, now, user_id),
            )
            if keep_token_hash:
                conn.execute(
                    "DELETE FROM user_sessions WHERE user_id = ? AND token_hash != ?",
                    (user_id, keep_token_hash),
                )
            else:
                conn.execute(
                    "DELETE FROM user_sessions WHERE user_id = ?",
                    (user_id,),
                )
            conn.commit()
            return cursor.rowcount > 0

    # -------------------------------------------------------------
    # Session Management Operations
    # -------------------------------------------------------------
    def create_session(
        self,
        token_hash: str,
        user_id: str,
        expires_at: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> None:
        """Store active session token hash in database."""
        now = datetime.utcnow().isoformat()
        with self.get_connection() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO user_sessions (
                    token_hash, user_id, created_at, expires_at, ip_address, user_agent
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (token_hash, user_id, now, expires_at, ip_address, user_agent),
            )
            conn.commit()

    def get_user_by_session(self, token_hash: str) -> dict[str, Any] | None:
        """Retrieve user associated with valid, non-expired session."""
        now = datetime.utcnow().isoformat()
        with self.get_connection() as conn:
            row = conn.execute(
                """
                SELECT u.id, u.username, u.must_change_password, u.created_at, u.last_login_at
                FROM user_sessions s
                JOIN users u ON s.user_id = u.id
                WHERE s.token_hash = ? AND s.expires_at > ?
                """,
                (token_hash, now),
            ).fetchone()
            return dict(row) if row else None

    def delete_session(self, token_hash: str) -> bool:
        """Revoke a single session token (logout)."""
        with self.get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM user_sessions WHERE token_hash = ?",
                (token_hash,),
            )
            conn.commit()
            return cursor.rowcount > 0

    def delete_all_user_sessions(self, user_id: str) -> None:
        """Revoke all active sessions for a user (after password change or security reset)."""
        with self.get_connection() as conn:
            conn.execute(
                "DELETE FROM user_sessions WHERE user_id = ?",
                (user_id,),
            )
            conn.commit()

    def cleanup_expired_sessions(self) -> int:
        """Purge expired sessions from database."""
        now = datetime.utcnow().isoformat()
        with self.get_connection() as conn:
            cursor = conn.execute(
                "DELETE FROM user_sessions WHERE expires_at <= ?",
                (now,),
            )
            conn.commit()
            return cursor.rowcount

db = Database()
