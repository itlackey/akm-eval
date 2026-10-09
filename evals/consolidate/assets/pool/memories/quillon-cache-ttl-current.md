---
description: The settings of the Quillon response cache.
tags: [cache, settings]
---

# Quillon cache settings

The Quillon response cache now keeps entries for 45 minutes, since release 3.2. The cache holds at most 2 GB. Entries are evicted least recently used first. A deploy clears the cache. The cache key includes the user language and the API version. Cache hits are counted in the metric quillon_cache_hits. Private responses are never cached.
