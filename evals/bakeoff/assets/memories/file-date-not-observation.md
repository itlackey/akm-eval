---
title: Undated worker timeout diagnosis
updated: 2026-10-18
---

A bridge-worker diagnosis linked interrupted transfers to an idle timeout of 45 seconds in the upstream proxy. The proposed fix was to raise proxy.idle_timeout to 90 seconds before retrying the transfer, but the note records no completed rollout. There is no observation date in this note; its file modification date does not establish when the timeout happened or when the proposed fix was verified.
