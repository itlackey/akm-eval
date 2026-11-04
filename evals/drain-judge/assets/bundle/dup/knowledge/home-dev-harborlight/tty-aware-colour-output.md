---
description: "Colour output in harborlight goes through the paint helper, not chalk."
---

harborlight commands do not use chalk on their own. Coloured text is passed through `paint(chalk.fn, msg)`, exported by `src/util/tty.ts` next to `useColor()`; the helper drops the colour when stdout is not a terminal or `NO_COLOR` is set, so every command imports it for coloured output.
