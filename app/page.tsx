"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/weather?icao=RJTT", { cache: "no-store" });
        const j = await r.json();
        setData(j);
      } catch (e: any) {
        setErr(e?.message ? String(e.message) : "fetch failed");
      }
    })();
  }, []);

  return (
    <main style={{ padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1>ARI Safety Intelligence</h1>
      {err && <pre>{err}</pre>}
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </main>
  );
}
