---
description: The request limits of the Gallowglass public API and how clients should react.
tags: [api, limits]
---

# Gallowglass rate limits

The Gallowglass public API allows 600 requests per minute for each API key. Bursts of up to 50 requests in one second are accepted. Over the limit, the API answers HTTP 429 with a Retry-After header. Keys on the partner plan get 3000 requests per minute. The limit is counted per key and not per client address. Clients should back off for the number of seconds in Retry-After before they retry. Limit changes are announced 14 days ahead on the status page.
