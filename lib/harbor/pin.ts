// Prints one of the pins in PINS (harbor.ts): `bun lib/harbor/pin.ts harbor` prints the Harbor release. The Dockerfile, scripts/check and
// the workflows read a pin with this and do not match the text of harbor.ts. A name that is not a pin is an error: it exits with 2.

import { PINS } from "./harbor.ts";

const names = Object.keys(PINS);
const name = process.argv[2] ?? "";
if (!names.includes(name)) {
  console.error(`pin: "${name}" is not a pin; the pins are ${names.join(", ")}`);
  process.exit(2);
}
console.log(PINS[name as keyof typeof PINS]);
