---
description: Missing translation keys that broke the pt-BR storefront.
updated: 2026-06-02
---

On 2026-06-02 the `pt-BR` storefront showed raw message keys because its
translation file lacked twelve keys present in `en.json`. The i18n build now
fails whenever a translation file is missing a key.
