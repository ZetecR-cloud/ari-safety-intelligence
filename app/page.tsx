"use client";

import { useState } from "react";

/* ===============================
   Ceiling utilities (ICAO)
================================ */

function extractCeilingFt(clouds?: string[]) {
  if (!clouds || clouds.length === 0) return null;

  let ceiling: number | null = null;

  for (const layer of clouds) {
    const match = layer.match(/^(BKN|OVC|VV)(\d{3})/);
    if (!match) continue;

    const ft = parseInt(match[2], 10) * 100;
    if (ceiling === null || ft < ceiling) {
      ceiling = ft;
    }
  }

  return ceiling;
}

/* ===============================
   TAF timeline builder
================================ */

function buildTafTimeline(rawTaf: string) {
  if (!rawTaf) return [];

  const tokens = rawTaf.split(/\s+/);
  const timeline: any[] = [];

  // BASE is always present
  timeline.push({
    type: "BASE",
    label: "BASE",
  });

  let i = 0;

  while (i < tokens.length) {
    const t = tokens[i];

    if (t === "BECMG") {
      timeline.push({
        type: "BECMG",
        label: "BECMG",
        period: tokens[i + 1] || "",
      });
      i += 2;
      continue;
    }

    if (t === "TEMPO") {
      timeline.push({
        type: "TEMPO",
        label: "TEMPO",
        period: tokens[i + 1] || "",
      });
      i += 2;
      continue;
    }

    if (t.startsWith("FM")) {
      timeline.push({
        type: "FM",
        label: t,
      });
      i += 1;
      continue;
    }

    i++;
  }

  return timeline;
}

/* ===============================
   Main Page
================================ */

export default function Page() {
  const [icao, setIcao] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  async function getWeather() {
    if (!icao || loading) return;

    setLoading(true);
    setShowRaw(false);

    try {
      const res = await fetch(`/api/weather?icao=${icao}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      alert("Weather fetch failed");
    } finally {
      setLoading(false);
    }
  }

  /* ===============================
     Derived values
  ================================ */

  const clouds = data?.metar?.clouds ?? [];
  const ceilingFt = extractCeilingFt(clouds);

  // server reasons filter
  const serverReasonsRaw = data?.wx_analysis?.reasons ?? [];
  const serverReasons = serverReasonsRaw.filter(
    (r: string) => !r.toLowerCase().includes("ceiling")
  );

  const reasons: string[] = [...serverReasons];

  if (ceilingFt !== null && ceilingFt < 3000) {
    reasons.push(`Ceiling present (<3000ft): ${ceilingFt}ft`);
  }

  const tafRaw = data?.taf?.raw_text ?? "";
  const tafTimeline = buildTafTimeline(tafRaw);

  /* ===============================
     UI
  ================================ */

  return (
    <main style={{ padding: 24, fontFamily: "sans-serif" }}>
      <h1>ARI5 Weather</h1>

      {/* ICAO input */}
      <div style={{ marginBottom: 16 }}>
        <input
          placeholder="ICAO (e.g. ROAH)"
          value={icao}
          onChange={(e) => setIcao(e.target.value.toUpperCase())}
          style={{ padding: 8, width: 160 }}
        />
        <button
          onClick={getWeather}
          style={{ marginLeft: 8, padding: "8px 16px" }}
        >
          {loading ? "Loading..." : "Get Weather"}
        </button>

        <button
          onClick={() => setShowRaw((v) => !v)}
          style={{ marginLeft: 8, padding: "8px 16px" }}
        >
          Show Raw
        </button>
      </div>

      {/* Key summary */}
      {data && (
        <>
          <h2>Key Summary</h2>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 12 }}>
            <div>Station: {data?.metar?.station_id}</div>
            <div>Wind: {data?.metar?.wind}</div>
            <div>Visibility: {data?.metar?.visibility}</div>
            <div>QNH: {data?.metar?.altimeter}</div>
            <div>Clouds: {clouds.join(", ")}</div>
            <div>WX: {data?.metar?.wx_string}</div>
          </div>

          {/* Reasons */}
          <h3 style={{ marginTop: 24 }}>判定理由 / AMBER</h3>

          {reasons.length === 0 ? (
            <div>—</div>
          ) : (
            <ul>
              {reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}

          {/* TAF */}
          <h2 style={{ marginTop: 32 }}>TAF Timeline</h2>

          <div style={{ display: "flex", gap: 12 }}>
            {tafTimeline.map((p, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid #ccc",
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
        </>
      )}

      {/* Raw JSON */}
      {showRaw && (
        <pre
          style={{
            marginTop: 24,
            maxHeight: 400,
            overflow: "auto",
            background: "#111",
            color: "#0f0",
            padding: 12,
            fontSize: 12,
          }}
        >
          {JSON.stringify(data, null, 2).slice(0, 20000)}
        </pre>
      )}
    </main>
  );
}

