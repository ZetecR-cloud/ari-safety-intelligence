"use client";

import { useState } from "react";

/* ===============================
   Ceiling (ICAO official)
================================ */

function extractCeilingFt(clouds?: string[]) {
  if (!clouds) return null;

  let ceiling: number | null = null;

  for (const c of clouds) {
    const m = c.match(/^(BKN|OVC|VV)(\d{3})/);
    if (!m) continue;

    const ft = parseInt(m[2], 10) * 100;
    if (ceiling === null || ft < ceiling) ceiling = ft;
  }

  return ceiling;
}

/* ===============================
   TAF Timeline
================================ */

function buildTafTimeline(raw: string) {
  if (!raw) return [];

  const t = raw.split(/\s+/);
  const result: any[] = [];

  // ✅ BASE is ALWAYS present
  result.push({
    type: "BASE",
    label: "BASE",
    period: null,
  });

  for (let i = 0; i < t.length; i++) {
    if (t[i] === "BECMG") {
      result.push({
        type: "BECMG",
        label: "BECMG",
        period: t[i + 1],
      });
    }

    if (t[i] === "TEMPO") {
      result.push({
        type: "TEMPO",
        label: "TEMPO",
        period: t[i + 1],
      });
    }

    if (t[i].startsWith("FM")) {
      result.push({
        type: "FM",
        label: t[i],
        period: null,
      });
    }
  }

  return result;
}

/* ===============================
   PAGE
================================ */

export default function Page() {
  const [icao, setIcao] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function getWeather() {
    if (!icao || loading) return;

    setLoading(true);

    const res = await fetch(`/api/weather?icao=${icao}`);
    const json = await res.json();

    /* 🔥🔥🔥 完全遮断 */
    if (json?.wx_analysis?.reasons) {
      json.wx_analysis.reasons = [];
    }

    setData(json);
    setLoading(false);
  }

  if (!data) {
    return (
      <main style={{ padding: 30 }}>
        <input
          placeholder="ICAO"
          value={icao}
          onChange={(e) => setIcao(e.target.value.toUpperCase())}
        />
        <button onClick={getWeather}>Get Weather</button>
      </main>
    );
  }

  const clouds = data?.metar?.clouds ?? [];
  const ceilingFt = extractCeilingFt(clouds);

  const reasons: string[] = [];

  if (ceilingFt !== null && ceilingFt < 3000) {
    reasons.push(`Ceiling present (<3000ft): ${ceilingFt}ft`);
  }

  const tafTimeline = buildTafTimeline(data?.taf?.raw_text ?? "");

  return (
    <main style={{ padding: 30, fontFamily: "sans-serif" }}>
      <h1>ARI5 Weather</h1>

      <div>
        <strong>Station:</strong> {data.metar.station_id}
      </div>
      <div>
        <strong>Clouds:</strong> {clouds.join(", ")}
      </div>

      <h3>判定理由（AMBER）</h3>

      {reasons.length === 0 ? (
        <div>—</div>
      ) : (
        <ul>
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <h2 style={{ marginTop: 30 }}>TAF Timeline</h2>

      <div style={{ display: "flex", gap: 12 }}>
        {tafTimeline.map((p, i) => (
          <div
            key={i}
            style={{
              border: "1px solid #aaa",
              padding: 12,
              borderRadius: 6,
              minWidth: 90,
            }}
          >
            <strong>{p.label}</strong>
            {p.period && <div>{p.period}</div>}
          </div>
        ))}
      </div>
    </main>
  );
}
