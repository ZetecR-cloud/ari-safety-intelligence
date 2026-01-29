"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AIRPORTS, type Airport, type Runway } from "./airports";

type WxApiResponse = {
  status?: string;
  icao?: string;
  source?: string;
  services?: {
    metar?: string;
    taf?: string;
    aviationweather_gov?: string;
  };
  metar?: { raw?: string; time?: number };
  taf?: { raw?: string; time?: number; validFrom?: number; validTo?: number };
  wind?: { dir?: number | null; spd?: number | null; gst?: number | null };
  visibility?: { value?: number | null; unit?: string | null };
  ceiling?: { value?: number | null; unit?: string | null };
  temp?: { c?: number | null };
  dewpoint?: { c?: number | null };
  qnh_hpa?: number | null;
  remarks?: string | null;
  wx_analysis?: {
    level?: "GREEN" | "AMBER" | "RED";
    score?: number;
    reasons?: string[];
  };
  issueTime?: string;
  message?: string;
  error?: string;
};

type MetarWind = {
  dirDeg: number | null; // steady direction
  spdKt: number | null; // steady speed
  gustKt: number | null; // gust speed (peak)
};

type TafSignals = {
  hasTSorCB: boolean;
  tempoHasTSorCB: boolean;
  hasTEMPO: boolean;
  hasBECMG: boolean;
  hasSHRA: boolean;
  raw: string;
};

type RunwayComponent = {
  runwayId: string;
  magHdg: number;
  steady: {
    headwind: number;
    crosswind: number;
    tailwind: number;
    from: "L" | "R" | "-";
  };
  gust: {
    headwind: number;
    crosswind: number;
    tailwind: number;
    from: "L" | "R" | "-";
  };
};

type Decision = {
  color: "GREEN" | "AMBER" | "RED";
  reasons: string[];
};

function clamp360(n: number) {
  let x = n % 360;
  if (x < 0) x += 360;
  return x;
}

function diffAngle(a: number, b: number) {
  // smallest difference in degrees [0..180]
  const d = Math.abs(clamp360(a) - clamp360(b));
  return d > 180 ? 360 - d : d;
}

function calcComponents(windDir: number, windSpd: number, rwyHdg: number) {
  // returns head/tail and cross components (kt)
  // Relative angle: wind FROM direction relative to runway heading
  const rel = clamp360(windDir - rwyHdg);
  const rad = (rel * Math.PI) / 180;

  const head = windSpd * Math.cos(rad); // + = headwind, - = tailwind
  const cross = windSpd * Math.sin(rad); // + = from right, - = from left (given our rel def)
  const headwind = Math.max(0, head);
  const tailwind = Math.max(0, -head);
  const crossAbs = Math.abs(cross);

  const from: "L" | "R" | "-" = cross === 0 ? "-" : cross > 0 ? "R" : "L";
  return { headwind, tailwind, crosswind: crossAbs, from };
}

function parseMetarWind(metarRaw: string): MetarWind {
  // Minimal METAR wind parser: e.g. "34010KT", "VRB03KT", "18012G22KT"
  // Returns nulls if not found.
  const m = metarRaw.match(/\b(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?KT\b/);
  if (!m) return { dirDeg: null, spdKt: null, gustKt: null };
  const dir = m[1] === "VRB" ? null : Number(m[1]);
  const spd = Number(m[2]);
  const gst = m[4] ? Number(m[4]) : null;
  return { dirDeg: Number.isFinite(dir as any) ? (dir as number) : null, spdKt: spd, gustKt: gst };
}

function parseTafSignals(tafRaw: string): TafSignals {
  const t = (tafRaw || "").toUpperCase();
  const hasTSorCB = /\b(TS|TSRA|VCTS|CB)\b/.test(t);
  // Heuristic: if TS/CB appears within ~120 chars after TEMPO, treat as TEMPO convective
  const tempoHasTSorCB = /\bTEMPO\b[\s\S]{0,120}\b(TS|TSRA|VCTS|CB)\b/.test(t);
  const hasTEMPO = /\bTEMPO\b/.test(t);
  const hasBECMG = /\bBECMG\b/.test(t);
  const hasSHRA = /\bSHRA\b/.test(t);

  return { hasTSorCB, tempoHasTSorCB, hasTEMPO, hasBECMG, hasSHRA, raw: tafRaw || "" };
}

function baseDecisionColorFromLimits(args: {
  xw: number;
  tw: number;
  xwLimit: number;
  twLimit: number;
}): Decision {
  const reasons: string[] = [];
  let color: Decision["color"] = "GREEN";

  if (args.tw > args.twLimit) {
    color = "RED";
    reasons.push(`Tailwind ${args.tw.toFixed(0)}kt > limit ${args.twLimit}kt`);
  } else if (args.tw > Math.max(0, args.twLimit - 2)) {
    color = color === "RED" ? "RED" : "AMBER";
    reasons.push(`Tailwind near limit (${args.tw.toFixed(0)}kt / ${args.twLimit}kt)`);
  }

  if (args.xw > args.xwLimit) {
    color = "RED";
    reasons.push(`Crosswind ${args.xw.toFixed(0)}kt > limit ${args.xwLimit}kt`);
  } else if (args.xw > Math.max(0, args.xwLimit - 3)) {
    color = color === "RED" ? "RED" : "AMBER";
    reasons.push(`Crosswind near limit (${args.xw.toFixed(0)}kt / ${args.xwLimit}kt)`);
  }

  return { color, reasons };
}

function mergeColor(current: Decision["color"], next: Decision["color"]): Decision["color"] {
  const rank = { GREEN: 0, AMBER: 1, RED: 2 } as const;
  return rank[next] > rank[current] ? next : current;
}

function colorBadge(color: Decision["color"]) {
  const bg =
    color === "GREEN" ? "#0b6" : color === "AMBER" ? "#f5a300" : "#e22";
  return {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 999,
    color: "#fff",
    fontWeight: 700 as const,
    background: bg,
    letterSpacing: 0.3,
    fontSize: 12,
  };
}

function cardStyle() {
  return {
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 14,
    padding: 14,
    background: "rgba(255,255,255,0.03)",
  } as const;
}

export default function Page() {
  const [selectedIcao, setSelectedIcao] = useState<string>("RJTT");
  const [icaoInput, setIcaoInput] = useState<string>("RJTT");
  const [selectedAirport, setSelectedAirport] = useState<Airport | null>(null);

  // Runway list in UI (comes from airports.ts if available)
  const [runways, setRunways] = useState<Runway[]>([]);
  const [selectedRunwayId, setSelectedRunwayId] = useState<string>("");

  // Limits (steady vs gust)
  const [limitCrossSteady, setLimitCrossSteady] = useState<number>(20);
  const [limitCrossGust, setLimitCrossGust] = useState<number>(25);
  const [limitTailSteady, setLimitTailSteady] = useState<number>(10);
  const [limitTailGust, setLimitTailGust] = useState<number>(10);

  // Policy
  const [tempoConvectivePolicy, setTempoConvectivePolicy] = useState<"AMBER" | "RED">("RED");

  // Fetched WX
  const [loading, setLoading] = useState(false);
  const [wx, setWx] = useState<WxApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Find airport
  useEffect(() => {
    const a = AIRPORTS.find((x) => x.icao.toUpperCase() === selectedIcao.toUpperCase()) || null;
    setSelectedAirport(a);

    if (a?.runways?.length) {
      setRunways(a.runways);
      setSelectedRunwayId(a.runways[0].id);
    } else {
      setRunways([]);
      setSelectedRunwayId("");
    }
  }, [selectedIcao]);

  // Autocomplete list
  const filteredAirports = useMemo(() => {
    const q = icaoInput.trim().toUpperCase();
    if (!q) return AIRPORTS.slice(0, 20);
    const res = AIRPORTS.filter((a) => {
      return (
        a.icao.toUpperCase().includes(q) ||
        a.iata.toUpperCase().includes(q) ||
        a.name.toUpperCase().includes(q) ||
        a.city.toUpperCase().includes(q)
      );
    });
    return res.slice(0, 20);
  }, [icaoInput]);

  async function fetchWx(icao: string) {
    setLoading(true);
    setError(null);
    setWx(null);
    try {
      const url = `/api/weather?icao=${encodeURIComponent(icao.trim().toUpperCase())}`;
      const r = await fetch(url, { cache: "no-store" });
      const j = (await r.json()) as WxApiResponse;

      if (!r.ok || j.error) {
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      setWx(j);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // initial fetch
    fetchWx(selectedIcao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const metarRaw = wx?.metar?.raw || "";
  const tafRaw = wx?.taf?.raw || "";

  const metarWind = useMemo(() => parseMetarWind(metarRaw), [metarRaw]);
  const tafSignals = useMemo(() => parseTafSignals(tafRaw), [tafRaw]);

  const components: RunwayComponent[] = useMemo(() => {
    const dir = metarWind.dirDeg;
    const spd = metarWind.spdKt;
    if (dir == null || spd == null || !runways.length) return [];

    return runways.map((rwy) => {
      const steady = calcComponents(dir, spd, rwy.magHdg);
      const gustSpd = metarWind.gustKt ?? spd;
      const gust = calcComponents(dir, gustSpd, rwy.magHdg);

      return {
        runwayId: rwy.id,
        magHdg: rwy.magHdg,
        steady: {
          headwind: steady.headwind,
          crosswind: steady.crosswind,
          tailwind: steady.tailwind,
          from: steady.from,
        },
        gust: {
          headwind: gust.headwind,
          crosswind: gust.crosswind,
          tailwind: gust.tailwind,
          from: gust.from,
        },
      };
    });
  }, [metarWind.dirDeg, metarWind.spdKt, metarWind.gustKt, runways]);

  const selectedComp = useMemo(() => {
    return components.find((c) => c.runwayId === selectedRunwayId) || null;
  }, [components, selectedRunwayId]);

  const decision = useMemo(() => {
    const reasons: string[] = [];
    let color: Decision["color"] = "GREEN";

    if (!selectedComp || metarWind.dirDeg == null || metarWind.spdKt == null) {
      return { color: "AMBER", reasons: ["Insufficient wind/runway data for decision"] };
    }

    const hasGust = metarWind.gustKt != null;
    const xwLimit = hasGust ? limitCrossGust : limitCrossSteady;
    const twLimit = hasGust ? limitTailGust : limitTailSteady;

    const use = hasGust ? selectedComp.gust : selectedComp.steady;

    const base = baseDecisionColorFromLimits({
      xw: use.crosswind,
      tw: use.tailwind,
      xwLimit,
      twLimit,
    });

    color = mergeColor(color, base.color);
    reasons.push(...base.reasons);

    // Convective policy
    if (tafSignals.tempoHasTSorCB) {
      const c = tempoConvectivePolicy === "RED" ? "RED" : "AMBER";
      color = mergeColor(color, c);
      reasons.push("TAF: TEMPO includes TS/CB → convective risk policy");
    } else if (tafSignals.hasTSorCB) {
      // TS/CB somewhere in TAF -> at least AMBER
      color = mergeColor(color, "AMBER");
      reasons.push("TAF: TS/CB present → convective risk");
    }

    // Extra advisory flags (non-blocking)
    if (tafSignals.hasTEMPO) reasons.push("TAF: TEMPO present (variability)");
    if (tafSignals.hasBECMG) reasons.push("TAF: BECMG present (trend change)");

    // If no explicit reasons and green, keep a friendly note
    if (reasons.length === 0) reasons.push("Within limits (based on selected policy/limits)");

    return { color, reasons };
  }, [
    selectedComp,
    metarWind.dirDeg,
    metarWind.spdKt,
    metarWind.gustKt,
    limitCrossGust,
    limitCrossSteady,
    limitTailGust,
    limitTailSteady,
    tafSignals,
    tempoConvectivePolicy,
  ]);

  const page = useMemo(() => {
    const title = "ARI Safety Intelligence";
    const sub = "METAR/TAF → Runway crosswind & dispatch-style decision";
    return { title, sub };
  }, []);

  return (
    <main style={{ minHeight: "100vh", padding: 18, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ marginBottom: 14 }}>
          <h1 style={{ margin: 0, fontSize: 26 }}>{page.title}</h1>
          <div style={{ opacity: 0.75, marginTop: 4 }}>{page.sub}</div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          {/* Controls */}
          <div style={cardStyle()}>
            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Airport (ICAO)</div>
                <input
                  value={icaoInput}
                  onChange={(e) => setIcaoInput(e.target.value)}
                  placeholder="e.g. RJTT / RJAA / RCTP"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.16)",
                    background: "rgba(0,0,0,0.25)",
                    color: "inherit",
                    outline: "none",
                  }}
                />
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {filteredAirports.map((a) => (
                    <button
                      key={a.icao}
                      onClick={() => {
                        setSelectedIcao(a.icao);
                        setIcaoInput(a.icao);
                      }}
                      style={{
                        padding: "7px 10px",
                        borderRadius: 999,
                        border: a.icao === selectedIcao ? "1px solid rgba(255,255,255,0.55)" : "1px solid rgba(255,255,255,0.16)",
                        background: "rgba(255,255,255,0.06)",
                        color: "inherit",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      title={`${a.name} / ${a.city} (${a.iata})`}
                    >
                      <b>{a.icao}</b> <span style={{ opacity: 0.8 }}>{a.iata}</span>
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
                  <button
                    onClick={() => {
                      const icao = icaoInput.trim().toUpperCase();
                      if (!icao) return;
                      setSelectedIcao(icao);
                      fetchWx(icao);
                    }}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.2)",
                      background: "rgba(255,255,255,0.08)",
                      color: "inherit",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {loading ? "Fetching..." : "Fetch METAR/TAF"}
                  </button>

                  <span style={{ opacity: 0.75, fontSize: 13 }}>
                    Current: <b>{selectedIcao}</b>{" "}
                    {selectedAirport ? (
                      <>
                        — {selectedAirport.name} / {selectedAirport.city}
                      </>
                    ) : (
                      "— (not in list)"
                    )}
                  </span>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Policy</div>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ ...cardStyle(), padding: 10 }}>
                    <div style={{ fontWeight: 650, marginBottom: 6 }}>TEMPO convective policy</div>
                    <select
                      value={tempoConvectivePolicy}
                      onChange={(e) => setTempoConvectivePolicy(e.target.value as any)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,255,255,0.16)",
                        background: "rgba(0,0,0,0.25)",
                        color: "inherit",
                        outline: "none",
                      }}
                    >
                      <option value="RED">TEMPO includes TS/CB → RED</option>
                      <option value="AMBER">TEMPO includes TS/CB → AMBER</option>
                    </select>
                    <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
                      If TS/CB appears inside a TEMPO group, apply policy immediately.
                    </div>
                  </div>

                  <div style={{ ...cardStyle(), padding: 10 }}>
                    <div style={{ fontWeight: 650, marginBottom: 8 }}>Limits (kt)</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 5 }}>Crosswind (steady)</div>
                        <input
                          type="number"
                          value={limitCrossSteady}
                          onChange={(e) => setLimitCrossSteady(Number(e.target.value))}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(0,0,0,0.25)",
                            color: "inherit",
                            outline: "none",
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 5 }}>Crosswind (gust/peak)</div>
                        <input
                          type="number"
                          value={limitCrossGust}
                          onChange={(e) => setLimitCrossGust(Number(e.target.value))}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(0,0,0,0.25)",
                            color: "inherit",
                            outline: "none",
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 5 }}>Tailwind (steady)</div>
                        <input
                          type="number"
                          value={limitTailSteady}
                          onChange={(e) => setLimitTailSteady(Number(e.target.value))}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(0,0,0,0.25)",
                            color: "inherit",
                            outline: "none",
                          }}
                        />
                      </div>
                      <div>
                        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 5 }}>Tailwind (gust/peak)</div>
                        <input
                          type="number"
                          value={limitTailGust}
                          onChange={(e) => setLimitTailGust(Number(e.target.value))}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid rgba(255,255,255,0.16)",
                            background: "rgba(0,0,0,0.25)",
                            color: "inherit",
                            outline: "none",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12 }}>
                      If METAR has gusts (GxxKT), decision uses gust limits. Otherwise uses steady limits.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {error ? (
              <div style={{ marginTop: 12, ...cardStyle(), borderColor: "rgba(255,0,0,0.35)" }}>
                <b style={{ color: "#f66" }}>Error:</b> {error}
              </div>
            ) : null}
          </div>

          {/* Decision + Runway selection */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={cardStyle()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 16 }}>Dispatch Decision</div>
                  <div style={{ opacity: 0.75, fontSize: 13, marginTop: 3 }}>
                    Runway-based crosswind/tailwind + TAF convective policy
                  </div>
                </div>
                <span style={colorBadge(decision.color)}>{decision.color}</span>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Reasons</div>
                <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.95 }}>
                  {decision.reasons.map((r, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div style={cardStyle()}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>Runway & Wind</div>

              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 5 }}>Selected RWY (MAG)</div>
                  <select
                    value={selectedRunwayId}
                    onChange={(e) => setSelectedRunwayId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid rgba(255,255,255,0.16)",
                      background: "rgba(0,0,0,0.25)",
                      color: "inherit",
                      outline: "none",
                    }}
                  >
                    {runways.length ? (
                      runways.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.id} (MAG {String(r.magHdg).padStart(3, "0")})
                        </option>
                      ))
                    ) : (
                      <option value="">(No RWY data in airports.ts)</option>
                    )}
                  </select>
                  <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                    RWY headings should be MAG from RNAV chart basis (your policy).
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 5 }}>METAR Wind</div>
                  <div style={{ ...cardStyle(), padding: 10 }}>
                    <div style={{ fontSize: 14 }}>
                      <b>Dir:</b>{" "}
                      {metarWind.dirDeg == null ? (
                        <span style={{ opacity: 0.7 }}>VRB/Unknown</span>
                      ) : (
                        <span>{String(metarWind.dirDeg).padStart(3, "0")}°</span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, marginTop: 4 }}>
                      <b>Spd:</b> {metarWind.spdKt ?? <span style={{ opacity: 0.7 }}>—</span>} kt
                    </div>
                    <div style={{ fontSize: 14, marginTop: 4 }}>
                      <b>Gust:</b> {metarWind.gustKt ?? <span style={{ opacity: 0.7 }}>—</span>} kt
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>RWY Components (kt)</div>

                {!components.length ? (
                  <div style={{ opacity: 0.75 }}>
                    Need (1) METAR wind parsed (dddssKT) and (2) runway list in airports.ts to compute.
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ textAlign: "left", opacity: 0.85 }}>
                          <th style={{ padding: "8px 6px" }}>RWY</th>
                          <th style={{ padding: "8px 6px" }}>MAG</th>
                          <th style={{ padding: "8px 6px" }}>XW steady</th>
                          <th style={{ padding: "8px 6px" }}>TW steady</th>
                          <th style={{ padding: "8px 6px" }}>XW peak</th>
                          <th style={{ padding: "8px 6px" }}>TW peak</th>
                        </tr>
                      </thead>
                      <tbody>
                        {components.map((c) => {
                          const isSel = c.runwayId === selectedRunwayId;
                          return (
                            <tr
                              key={c.runwayId}
                              style={{
                                borderTop: "1px solid rgba(255,255,255,0.08)",
                                background: isSel ? "rgba(255,255,255,0.06)" : "transparent",
                              }}
                            >
                              <td style={{ padding: "8px 6px", fontWeight: 800 }}>{c.runwayId}</td>
                              <td style={{ padding: "8px 6px" }}>{String(c.magHdg).padStart(3, "0")}</td>

                              <td style={{ padding: "8px 6px" }}>
                                {c.steady.crosswind.toFixed(0)} {c.steady.from !== "-" ? `(${c.steady.from})` : ""}
                              </td>
                              <td style={{ padding: "8px 6px" }}>{c.steady.tailwind.toFixed(0)}</td>

                              <td style={{ padding: "8px 6px" }}>
                                {c.gust.crosswind.toFixed(0)} {c.gust.from !== "-" ? `(${c.gust.from})` : ""}
                              </td>
                              <td style={{ padding: "8px 6px" }}>{c.gust.tailwind.toFixed(0)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Raw METAR/TAF + Quick warnings */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={cardStyle()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>METAR</div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>
                  {wx?.issueTime ? `issueTime: ${wx.issueTime}` : ""}
                </div>
              </div>

              <div style={{ marginTop: 10, ...cardStyle(), padding: 10, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 }}>
                {metarRaw || "(no METAR)"}
              </div>

              <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                <b>Tip:</b> API endpoint: <span style={{ fontFamily: "ui-monospace" }}>/api/weather?icao=RJTT</span>
              </div>
            </div>

            <div style={cardStyle()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>TAF</div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {tafSignals.hasTSorCB ? <span style={colorBadge("AMBER")}>TS/CB</span> : null}
                  {tafSignals.tempoHasTSorCB ? <span style={colorBadge("RED")}>TEMPO TS/CB</span> : null}
                </div>
              </div>

              <div style={{ marginTop: 10, ...cardStyle(), padding: 10, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 }}>
                {tafRaw || "(no TAF)"}
              </div>

              <div style={{ marginTop: 10 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Quick flags</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {tafSignals.hasTEMPO ? <span style={colorBadge("AMBER")}>TEMPO</span> : <span style={{ opacity: 0.6 }}>TEMPO: none</span>}
                  {tafSignals.hasBECMG ? <span style={colorBadge("AMBER")}>BECMG</span> : <span style={{ opacity: 0.6 }}>BECMG: none</span>}
                  {tafSignals.hasSHRA ? <span style={colorBadge("AMBER")}>SHRA</span> : null}
                </div>
              </div>
            </div>
          </div>

          {/* Debug / JSON (optional) */}
          <div style={{ ...cardStyle(), opacity: 0.95 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Debug JSON</div>
            <div style={{ marginTop: 10, ...cardStyle(), padding: 10, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12 }}>
              {wx ? JSON.stringify(wx, null, 2) : loading ? "Loading..." : "(no data)"}
            </div>
          </div>
        </section>

        <footer style={{ marginTop: 18, opacity: 0.65, fontSize: 12 }}>
          Vercel domain example: <span style={{ fontFamily: "ui-monospace" }}>https://{selectedIcao.toLowerCase()}-xxx.vercel.app</span> (yours will be shown in Vercel Project → Domains)
        </footer>
      </div>
    </main>
  );
}
