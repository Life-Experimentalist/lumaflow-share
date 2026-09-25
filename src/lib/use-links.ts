"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Link = { url: string; name: string };
export type Status = "loading" | "synced" | "offline";

const POLL_MS = 30_000;
// Where this device remembers the PIN, so a phone does not ask on every visit.
const PIN_KEY = "pin";

// links.enc, written by scripts/lock-links.mjs: the stream list encrypted
// with a key derived from the PIN.
type Sealed = { iterations: number; salt: string; iv: string; data: string };

function storedPin(): string {
  try {
    return localStorage.getItem(PIN_KEY) ?? "";
  } catch {
    return "";
  }
}

function storePin(pin: string) {
  try {
    if (pin) localStorage.setItem(PIN_KEY, pin);
    else localStorage.removeItem(PIN_KEY);
  } catch {
    // Blocked storage: the PIN just lasts until reload.
  }
}

const bytes = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

// Deriving the key is slow on purpose, so do it once per PIN and deploy.
let cachedKey: { id: string; key: Promise<CryptoKey> } | null = null;

function deriveKey(sealed: Sealed, pin: string) {
  const id = `${sealed.salt}:${sealed.iterations}:${pin}`;
  if (cachedKey?.id !== id) {
    const key = crypto.subtle
      .importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveKey"])
      .then((material) =>
        crypto.subtle.deriveKey(
          { name: "PBKDF2", hash: "SHA-256", salt: bytes(sealed.salt), iterations: sealed.iterations },
          material,
          { name: "AES-GCM", length: 256 },
          false,
          ["decrypt"],
        ),
      );
    cachedKey = { id, key };
  }
  return cachedKey.key;
}

// Throws when the PIN is wrong: AES-GCM refuses to decrypt with the wrong key.
async function unseal(sealed: Sealed, pin: string): Promise<string> {
  const key = await deriveKey(sealed, pin);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(sealed.iv) }, key, bytes(sealed.data));
  return new TextDecoder().decode(plain);
}

async function fetchFile(name: string) {
  return fetch(`/${name}?t=${Date.now()}`, { cache: "no-store" });
}

// The camera name is the last path segment of the URL (a name or a UUID).
function cameraName(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last) : u.hostname;
  } catch {
    return url;
  }
}

// Accepts either "https://..." strings or { "url": "...", "label": "..." } objects.
function normalize(data: unknown): Link[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const links: Link[] = [];
  for (const item of data) {
    const url = typeof item === "string" ? item.trim() : item?.url;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    const label = typeof item === "object" && typeof item?.label === "string" ? item.label.trim() : "";
    seen.add(url);
    links.push({ url, name: label || cameraName(url) });
  }
  return links;
}

// Polls the stream list so edits in the repo reach every open page after the
// next Pages deploy, without a reload. A published site only has links.enc,
// which needs the PIN; local builds have a plain links.json.
export function useLinks() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  // The list is encrypted and this device has no working PIN for it.
  const [locked, setLocked] = useState(false);
  // Whether the list is encrypted at all, so the page can offer to lock.
  const [sealed, setSealed] = useState(false);
  const last = useRef("");
  const load = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let stopped = false;
    let plain = false;

    const show = (text: string) => {
      if (stopped || text === last.current) return;
      last.current = text;
      setLinks(normalize(JSON.parse(text)));
    };

    load.current = async () => {
      try {
        if (!plain) {
          const res = await fetchFile("links.enc");
          if (res.ok) {
            const payload: Sealed = await res.json();
            if (stopped) return;
            setSealed(true);
            setStatus("synced");
            const pin = storedPin();
            if (!pin) {
              setLocked(true);
              return;
            }
            try {
              const text = await unseal(payload, pin);
              // Locked again while decrypting.
              if (stopped || !storedPin()) return;
              setLocked(false);
              show(text);
            } catch {
              // The PIN was changed since this device last unlocked.
              storePin("");
              if (!stopped) setLocked(true);
            }
            return;
          }
          if (res.status !== 404) throw new Error(String(res.status));
          plain = true;
        }
        const res = await fetchFile("links.json");
        if (!res.ok) throw new Error(String(res.status));
        const text = await res.text();
        JSON.parse(text);
        if (stopped) return;
        setStatus("synced");
        show(text);
      } catch {
        // Keep showing the last good list; a bad edit or network blip must not blank the wall.
        if (!stopped) setStatus("offline");
      }
    };

    const poll = () => load.current();
    poll();
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", poll);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", poll);
    };
  }, []);

  // Resolves false for a wrong PIN.
  const unlock = useCallback(async (pin: string) => {
    const res = await fetchFile("links.enc");
    if (!res.ok) return false;
    try {
      await unseal(await res.json(), pin);
    } catch {
      return false;
    }
    storePin(pin);
    await load.current();
    return true;
  }, []);

  const lock = useCallback(() => {
    storePin("");
    cachedKey = null;
    last.current = "";
    setLinks(null);
    setLocked(true);
  }, []);

  return { links, status, locked, sealed, unlock, lock };
}
