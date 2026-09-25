"use client";

import { useEffect, useState } from "react";

export type Link = { url: string; label: string };
export type Status = "loading" | "live" | "offline";

const POLL_MS = 30_000;

// Accepts either "https://..." strings or { "url": "...", "label": "..." } objects.
function normalize(data: unknown): Link[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const links: Link[] = [];
  for (const item of data) {
    const url = typeof item === "string" ? item : item?.url;
    const label = typeof item === "object" && typeof item?.label === "string" ? item.label : "";
    if (typeof url !== "string" || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
    seen.add(url);
    links.push({ url, label });
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
        if (stopped) return;
        setStatus("live");
        if (text !== last) {
          last = text;
          setLinks(normalize(JSON.parse(text)));
        }
      } catch {
        if (!stopped) setStatus("offline");
      }
    };

    load();
    const timer = setInterval(load, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { links, status };
}
