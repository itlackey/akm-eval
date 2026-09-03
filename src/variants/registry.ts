import type { VariantDefinition } from "./types.ts";

export const variantRegistry: VariantDefinition[] = [
  {
    id: "baseline",
    description: "Baseline agent without AKM or external memory.",
    tags: ["baseline"],
  },
  {
    id: "akm-no-memory",
    description: "AKM-enabled agent without memory backend.",
    tags: ["akm"],
  },
  {
    id: "akm-memory",
    description:
      "AKM memory backend variant, backed by the real akm CLI (see docs/memory-backends.md).",
    tags: ["akm", "memory"],
  },
  {
    id: "raw-vector",
    description: "Deterministic raw-vector baseline backend.",
    tags: ["memory", "baseline"],
  },
];
