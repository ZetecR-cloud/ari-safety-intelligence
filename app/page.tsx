"use client";

import { useState } from "react";

export default function Home() {
  const [icao, setIcao] = useState("RJTT");
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  const run = async () => {
    setErr("");
    setData(null);

    try {
      const r = await fetch(`/api/weather?icao=${encodeURIComponent(icao.trim())}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const text = await r.text();

      if (!r.ok) {
        setErr(`HTTP ${r.status}: ${text.slice(0, 200)}`);
        return;
      }

      setData(JSON.parse(text));
    } catch (e: any) {
      setErr(e?.message ? String(e.message) : "Unknown error");
    }
  };

  return (
    <main style={{ padding: 30, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
        <div style={{ fontWeight: 800, width: 60 }}>ICAO</div>
        <input
          value={icao}
          onChange={(e) => setIcao(e.target.value)}
          style={{ padding: 10, width: 220 }}
        />
        <button onClick={run} style={{ padding: "10px 14px", fontWeight: 700 }}>
          Get Weather
        </button>
      </div>

      {err ? <pre style={{ color: "red" }}>{`Error: ${err}`}</pre> : null}
      {data ? <pre>{JSON.stringify(data, null, 2)}</pre> : <div>—</div>}
    </main>
  );
}
