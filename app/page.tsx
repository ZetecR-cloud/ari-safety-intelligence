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
      const url = `/api/weather?icao=${encodeURIComponent(icao.trim())}`;
      const r = await fetch(url, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });

      const text = await r.text();

      // ここで必ず画面に出す（console不要）
      if (!r.ok) {
        setErr(`HTTP ${r.status} ${r.statusText} | ${text.slice(0, 300)}`);
        return;
      }

      try {
        setData(JSON.parse(text));
      } catch {
        setErr(`JSON parse failed | first300=${text.slice(0, 300)}`);
      }
    } catch (e: any) {
      const name = e?.name ? String(e.name) : "";
      const msg = e?.message ? String(e.message) : "Unknown error";
      setErr(`FETCH FAILED | ${name} | ${msg}`);
    }
  };

  return (
    <main style={{ padding: 30, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 20, alignItems: "center" }}>
        <div style={{ fontWeight: 800, width: 60 }}>ICAO</div>
        <input value={icao} onChange={(e) => setIcao(e.target.value)} style={{ padding: 10, width: 220 }} />
        <button onClick={run} style={{ padding: "10px 14px", fontWeight: 700 }}>Get Weather</button>
      </div>

      {err ? <pre style={{ color: "rgb(187,0,0)", whiteSpace: "pre-wrap" }}>{err}</pre> : <div>—</div>}
      {data ? <pre>{JSON.stringify(data, null, 2)}</pre> : null}
    </main>
  );
}
