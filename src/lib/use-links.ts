"use client";

import { useEffect, useState } from "react";

export type Link = { url: string; name: string };
export type Status = "loading" | "synced" | "offline";

const POLL_MS = 30_000;

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

// Polls /links.json so edits in the repo reach every open page after the next
// Pages deploy, without a reload.
export function useLinks() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let last = "";
    let stopped = false;

    const load = async () => {
      try {
        const res = await fetch(`/links.json?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const text = await res.text();
        const parsed = JSON.parse(text);
        if (stopped) return;
        setStatus("synced");
        if (text !== last) {
          last = text;
          setLinks(normalize(parsed));
        }
      } catch {
        // Keep showing the last good list; a bad edit or network blip must not blank the wall.
        if (!stopped) setStatus("offline");
      }
    };

    load();
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", load);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", load);
    };
  }, []);

  return { links, status };
}
