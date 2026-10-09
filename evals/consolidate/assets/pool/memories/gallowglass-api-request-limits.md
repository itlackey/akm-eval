---
description: The request limits of the Gallowglass public API and how clients should react.
tags: [api, limits]
---

# Gallowglass rate limits

The Gallowglass public API allows 600 requests a minute per API key. Bursts of up to 50 requests in one second are allowed. Above the limit, the API answers HTTP 429 with a Retry-After header. Keys on the partner plan get 3000 requests a minute. Clients should wait for the number of seconds in Retry-After before they retry. The limit is counted for each key and not per client address. Limit changes are announced 14 days in advance on the status page.
