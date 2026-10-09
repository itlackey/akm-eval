---
description: How long Delmont sessions last.
tags: [sessions, security]
---

# Delmont session settings

Delmont sessions are stored in the session service. A session ends after 30 minutes without a request. Sessions end when the user signs out. A password change ends all sessions of the user. Session ids are 32 random bytes. Sessions are scoped to one browser. The session service is called delmont-sessions.
