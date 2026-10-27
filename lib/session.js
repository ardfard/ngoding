// Stateless student sessions: the token is "<seed>.<hmac>", so the server can
// regenerate a student's inputs and expected answers without storing anything,
// and students can't pick someone else's seed.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export function sessions(secret) {
  const sign = (seed) => createHmac("sha256", secret).update(String(seed)).digest("base64url").slice(0, 22);
  return {
    create() {
      const seed = randomInt(1, 2 ** 31);
      return { seed, token: `${seed}.${sign(seed)}` };
    },
    // Returns the seed, or null if the token is malformed or forged.
    verify(token) {
      const m = /^(\d{1,10})\.([\w-]{22})$/.exec(token ?? "");
      if (!m) return null;
      const expected = Buffer.from(sign(m[1]));
      return timingSafeEqual(expected, Buffer.from(m[2])) ? Number(m[1]) : null;
    },
  };
}
