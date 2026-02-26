from datetime import datetime, timedelta, timezone
import secrets
import hashlib
from typing import Optional
import os
from pymongo.collection import Collection
from fastapi import Request
import logging

logger = logging.getLogger("session")


class SessionManager:
    def __init__(self, sessions_collection: Collection):
        self.sessions = sessions_collection
        # Cookie name is non-guessable per requirements. Use an explicit
        # SESSION_COOKIE_NAME env var to keep it stable across restarts in dev.
        self.cookie_name = os.getenv("SESSION_COOKIE_NAME") or f"sess_{secrets.token_hex(16)}"
        # By default require Secure cookies. For local development an opt-in
        # env var `DEV_INSECURE_SESSIONS=true` can disable Secure flag.
        self.cookie_secure = not (os.getenv("DEV_INSECURE_SESSIONS", "false").lower() == "true")
        # Timeouts
        self.idle_timeout = timedelta(minutes=20)
        self.absolute_timeout = timedelta(hours=8)

    def _now(self):
        return datetime.now(timezone.utc)

    def _gen_session_id(self) -> str:
        # high-entropy cryptographic random
        return secrets.token_urlsafe(64)

    def _to_aware(self, dt):
        """Normalize a stored datetime to an aware UTC datetime.

        Accepts datetime objects or ISO-format strings. If dt is naive,
        assume UTC and attach tzinfo=UTC.
        """
        if dt is None:
            return None
        if isinstance(dt, datetime):
            if dt.tzinfo is None:
                return dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(timezone.utc)
        if isinstance(dt, str):
            try:
                parsed = datetime.fromisoformat(dt)
                if parsed.tzinfo is None:
                    return parsed.replace(tzinfo=timezone.utc)
                return parsed.astimezone(timezone.utc)
            except Exception:
                return None
        return None

    def _fingerprint(self, request: Request) -> dict:
        ua = request.headers.get("user-agent", "")
        # hash user agent to avoid storing raw UA
        ua_hash = hashlib.sha256(ua.encode("utf-8")).hexdigest()
        # partial IP fingerprint; use first 3 octets for IPv4, safe for privacy
        ip = request.client.host if request.client else ""
        ip_part = ""
        try:
            if ip and "." in ip:
                ip_part = ".".join(ip.split(".")[:3])
            else:
                ip_part = ip[:6]
        except Exception:
            ip_part = ""

        ip_hash = hashlib.sha256(ip_part.encode("utf-8")).hexdigest()
        return {"ua": ua_hash, "ip": ip_hash}

    def create_session(self, request: Request, user_email: str, role: str, extra: Optional[dict] = None) -> dict:
        sid = self._gen_session_id()
        now = self._now()
        session = {
            "_id": sid,
            "email": user_email,
            "role": role,
            "created_at": now,
            "last_active": now,
            "expires_at": now + self.idle_timeout,
            "absolute_expires_at": now + self.absolute_timeout,
            "csrf_token": secrets.token_urlsafe(32),
            "fingerprint": self._fingerprint(request),
        }
        if extra:
            session["data"] = extra

        # store in DB
        self.sessions.insert_one(session)
        logger.info("session created for user", extra={"email": user_email, "role": role})
        return session

    def get_session(self, sid: str):
        if not sid:
            return None
        return self.sessions.find_one({"_id": sid})

    def validate_session(self, request: Request, sid: str) -> Optional[dict]:
        s = self.get_session(sid)
        now = self._now()
        if not s:
            return None

        # check absolute expiry (normalize stored datetimes)
        abs_exp = self._to_aware(s.get("absolute_expires_at"))
        if abs_exp and abs_exp < now:
            self.destroy_session(sid)
            return None

        # check idle timeout
        idle_exp = self._to_aware(s.get("expires_at"))
        if idle_exp and idle_exp < now:
            self.destroy_session(sid)
            return None

        # check fingerprint
        fp = self._fingerprint(request)
        stored_fp = s.get("fingerprint", {})
        if stored_fp.get("ua") != fp.get("ua") or stored_fp.get("ip") != fp.get("ip"):
            logger.warning("session fingerprint mismatch", extra={"email": s.get("email")})
            self.destroy_session(sid)
            return None

        return s

    def refresh_session(self, sid: str):
        now = self._now()
        self.sessions.update_one({"_id": sid}, {"$set": {"last_active": now, "expires_at": now + self.idle_timeout}})

    def destroy_session(self, sid: str):
        try:
            self.sessions.delete_one({"_id": sid})
            logger.info("session destroyed", extra={})
        except Exception:
            logger.exception("error destroying session")

    def rotate_session(self, request: Request, old_sid: str, user_email: str, role: str) -> dict:
        # create new session, destroy old one
        self.destroy_session(old_sid)
        return self.create_session(request, user_email, role)

    def gc(self):
        # remove sessions expired by absolute time or idle expiration
        now = self._now()
        # Use naive UTC datetimes for the DB query if needed; pymongo will handle
        res = self.sessions.delete_many({"$or": [{"absolute_expires_at": {"$lt": now}}, {"expires_at": {"$lt": now}}]})
        if res.deleted_count:
            logger.info(f"session GC removed {res.deleted_count} sessions")
