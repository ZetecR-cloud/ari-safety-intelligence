"use client";

import { useState } from "react";
import { AIRPORTS } from "./airports";

type WXLevel = "GREEN" | "AMBER" | "RED";

const RUNWAYS: Record<string, number[]> = {
  RJTT: [340, 160],
  RJAA: [340, 160],
  RCTP: [50, 230],
  PANC: [70, 250],
};

function calcCrosswind(
  windDir: number,
  windSpeed: number,
  runway: number
) {
  const diff = Math.abs(windDir - runway);
  const angle = Math.min(diff, 360 - diff);
  return Math.round(windSpeed * Math.sin((angle * Math.PI) / 180));
}

export default function Page() {
  const [icao, setIcao] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const airport = AIRPORTS.find(
    (a) => a.icao === icao.toUpperCase()
  );

  async function getWeather() {
    setLoading(true);
    const res = await fetch(`/api/weather?icao=${icao}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  if (!data) {
    return (
      <main style={{ padding: 30 }}>
        <h1>ARI Safety Intelligence</h1>
        <p>ICAO → METAR / TAF → Dispatch WX Judgment</p>

        <input
          value={icao}
          onChange={(e) => setIcao(e.target.value.toUpperCase())}
          placeholder="RJTT / PANC / RCTP"
          style={{
            padding: 10,
            width: 200,
            fontSize: 18,
            marginRight: 10,
          }}
        />

        <button onClick={getWeather}>Get Weather</button>
      </main>
    );
  }

  const metar = data.metar?.raw ?? "";
  const taf = data.taf ?? "";

  const windMatch = metar.match(/(\d{3})(\d{2})(G(\d{2}))?KT/);

  const windDir = windMatch ? Number(windMatch[1]) : 0;
  const windSpeed = windMatch ? Number(windMatch[2]) : 0;
  const gust = windMatch?.[4] ? Number(windMatch[4]) : null;

  let level: WXLevel = "GREEN";
  const reasons: string[] = [];

  if (/BKN|OVC/.test(metar)) {
    level = "AMBER";
    reasons.push("Ceiling present");
  }

  if (/TS|CB/.test(taf)) {
    level = "RED";
    reasons.push("Thunderstorm / CB in TAF");
  }

  if (/TEMPO.*(TS|CB)/.test(taf)) {
    level = "RED";
    reasons.push("TEMPO TS/CB");
  }

  return (
    <main style={{ padding: 30, fontFamily: "monospace" }}>
      <h1>ARI Safety Intelligence</h1>

      <h2>
        {airport?.icao} ({airport?.iata}) — {airport?.name}
      </h2>

      <hr />

      <section>
        <h3>METAR</h3>
        <pre>{metar}</pre>
      </section>

      <section>
        <h3>TAF</h3>
        <pre>{taf}</pre>
      </section>

      <hr />

      <section>
        <h3>Wind</h3>
        <p>
          Direction: {windDir}° <br />
          Speed: {windSpeed} kt <br />
          Gust: {gust ? `${gust} kt` : "—"}
        </p>
      </section>

      <hr />

      <section>
        <h3>Runway Analysis</h3>

        {(RUNWAYS[icao.toUpperCase()] ?? []).map((rwy) => {
          const steady = calcCrosswind(
            windDir,
            windSpeed,
            rwy
          );

          const peak = gust
            ? calcCrosswind(windDir, gust, rwy)
            : null;

          return (
            <div
              key={rwy}
              style={{
                border: "1px solid #555",
                padding: 10,
                marginBottom: 10,
              }}
            >
              <strong>RWY {rwy}</strong>
              <div>Crosswind steady: {steady} kt</div>
              {peak && (
                <div>Crosswind gust: {peak} kt</div>
              )}
            </div>
          );
        })}
      </section>

      <hr />

      <section>
        <h2>
          WX LEVEL:{" "}
          <span
            style={{
              color:
                level === "GREEN"
                  ? "lime"
                  : level === "AMBER"
                  ? "orange"
                  : "red",
            }}
          >
            {level}
          </span>
        </h2>

        <ul>
          {reasons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </section>

      <hr />

      <section>
        <h2>Dispatch Advisory</h2>
        {level === "GREEN" && (
          <p style={{ color: "lime" }}>
            ✔ Normal operation
          </p>
        )}
        {level === "AMBER" && (
          <p style={{ color: "orange" }}>
            ⚠ Review required
          </p>
        )}
        {level === "RED" && (
          <p style={{ color: "red" }}>
            ⛔ Dispatch NOT recommended
          </p>
        )}
      </section>
    </main>
  );
}
