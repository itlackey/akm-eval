---
description: "After the shop moved to a new server, some resolvers kept serving the old address for a day because the record's TTL was 86400."
captureMode: hot
beliefState: asserted
type: memory
updated: 2026-09-16
---
When the Willowby shop moved to a new server on 2026-09-02, some resolvers kept
serving the old address for most of a day, and orders placed on the old server
had to be copied over by hand. The A record had a TTL of 86400 seconds, a full
day. For the next move the TTL was lowered to 300 seconds two days ahead, and
the change was seen everywhere within ten minutes.
