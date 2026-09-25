// Runs after `next build`. With a PIN set (the PIN secret on GitHub), the
// stream list is encrypted with a key derived from it and only the
// ciphertext is published, so the site cannot give out the links without
// the PIN. Without a PIN (local builds) the list stays plain.
import { readFile, rm, writeFile } from "node:fs/promises";
import { webcrypto as crypto } from "node:crypto";

const ITERATIONS = 600_000;
const pin = process.env.PIN?.trim();

if (!pin) {
  console.log("lock-links: no PIN set, links.json stays plain");
  process.exit(0);
}

const b64 = (bytes) => Buffer.from(bytes).toString("base64");
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));

const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
  "deriveKey",
]);
const key = await crypto.subtle.deriveKey(
  { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
  material,
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt"],
);
const plain = await readFile("out/links.json");
const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);

await writeFile(
  "out/links.enc",
  JSON.stringify({ iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) }),
);
await rm("out/links.json");
console.log("lock-links: out/links.enc written, out/links.json removed");
