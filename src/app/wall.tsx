"use client";

import { useEffect, useState } from "react";
import { bestColumns } from "@/lib/grid";
import { useLinks } from "@/lib/use-links";

export default function Wall() {
  const { links, status } = useLinks();
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const update = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (links === null) {
    return <div className="empty">Connecting...</div>;
  }
  if (links.length === 0) {
    return <div className="empty">No streams yet.</div>;
  }

  const cols = bestColumns(links.length, size.w, size.h);
  const rows = Math.ceil(links.length / cols);

  return (
    <main
      className="wall"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
    >
      {links.map((link) => (
        <div className="tile" key={link.url}>
          <iframe
            src={link.url}
            title={link.label || link.url}
            allow="autoplay; fullscreen; camera; microphone; display-capture; encrypted-media; picture-in-picture"
            allowFullScreen
          />
          {link.label && <span className="tile-label">{link.label}</span>}
        </div>
      ))}
      {status !== "live" && <span className="status-dot" title={status} />}
    </main>
  );
}
