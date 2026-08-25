import { UnknownVariantError } from "../core/errors.ts";
import { variantRegistry } from "./registry.ts";

export function resolveVariant(variantId: string) {
  const variant = variantRegistry.find((entry) => entry.id === variantId);
  if (!variant) {
    throw new UnknownVariantError(variantId);
  }
  return variant;
}
