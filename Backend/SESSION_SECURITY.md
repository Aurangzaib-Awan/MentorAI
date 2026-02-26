What is a session
------------------
A session represents a server-side record that associates an authenticated user with a short-lived, high-entropy identifier stored only in an HttpOnly cookie. The server stores all session state; the client only holds an opaque cookie value.

How this implementation works
-----------------------------
- Server-managed sessions: sessions are stored in the `sessions` MongoDB collection. Each session document contains `email`, `role`, `created_at`, `last_active`, `expires_at`, `absolute_expires_at`, a `csrf_token`, and a fingerprint derived from the user agent and partial IP.
- Session cookie: a non-guessable cookie name (`sess_<random>`) is generated on server start. The cookie is set with `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, and a short `max_age` equal to the idle timeout.
- Rolling expiration: each validated request refreshes the session's idle expiry.
- Rotation: when logging in (or on privilege changes) a new session is created and any prior session is destroyed to prevent session fixation.
- CSRF tokens: each session has a `csrf_token`. The frontend fetches `/session/csrf` (using credentials) and sends the token in an `X-CSRF-Token` header for state-changing requests.
- Session binding: sessions are bound to a user-agent hash and a partial IP fingerprint to detect session replay/hijacking.
- Session cleanup: a background GC removes expired sessions periodically.

Why each security measure exists
--------------------------------
- HttpOnly cookie: prevents JavaScript from reading the session identifier (mitigates XSS stealing session ids).
- Secure & SameSite=Strict: prevents leaking the cookie to insecure channels and cross-site requests (mitigates CSRF and eavesdropping).
- Server-managed store: central control over session invalidation, rotation, and auditing.
- CSRF token tied to session: defends against cross-site request forgery even when cookies are automatically sent.
- Fingerprinting: detects anomalous use of a session from a different client or network segment.
- Idle + absolute timeout: limits window of exposure for stolen sessions.

Checklist to verify session security
-----------------------------------
- Sessions are set as `HttpOnly` and cannot be read by JavaScript.
- Session cookie has `Secure` and `SameSite=Strict` flags.
- Session cookie name is not a static, guessable string.
- No JWTs or user data are stored in client-side storage (localStorage/sessionStorage).
- CSRF token endpoint returns only the CSRF token and requires an existing session.
- Session rotation occurs on login and session destruction on logout/password-change.
- Suspicious fingerprint mismatches remove sessions.
- Background GC removes expired sessions regularly.

Notes on what NOT to do in future changes
-----------------------------------------
- Do not move session data to client-side storage (localStorage/sessionStorage).
- Do not expose session ids in URLs, JSON responses, or any frontend-accessible variable.
- Do not disable `HttpOnly`, `Secure`, or `SameSite` flags for the session cookie.
- Avoid weakening CSRF checks — any new state-changing endpoint must validate `X-CSRF-Token`.
- Do not log session identifiers or cookie names.

Development notes
-----------------
- The session cookie is `Secure=True` by default and therefore requires HTTPS to be set by browsers. For local development you can opt-in to insecure cookies by setting the environment variable `DEV_INSECURE_SESSIONS=true` when starting the backend. This is strongly discouraged for production. Example (Windows PowerShell):

```
$env:DEV_INSECURE_SESSIONS = "true"
python main.py
```

- To keep the session cookie name stable across server restarts (useful during development), set `SESSION_COOKIE_NAME` in the environment. Otherwise a high-entropy name is generated at startup.
