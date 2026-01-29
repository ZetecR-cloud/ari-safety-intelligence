"use client";

import { useMemo, useState } from "react";
import { AIRPORTS } from "./airports";

type WXLevel = "GREEN" | "AMBER" | "RED";

/**
 * 暫定：RWY MAG HDG DB
 * ここは今後「完全化（全空港・全RWY）」のために別ファイル化推奨。
 */
type Rwy = { name: string; mag: number };
const RWY_DB: Record<string, Rwy[]> = {
  // Japan
  RJTT: [
    { name: "RWY 05", mag: 50 },
    { name: "RWY 23", mag: 230 },
    { name: "RWY 16L", mag: 160 },
    { name: "RWY 16R", mag: 160 },
    { name: "RWY 34L", mag: 340 },
    { name: "RWY 34R", mag: 340 },
  ],
  RJAA: [
    { name: "RWY 16L", mag: 160 },
    { name: "RWY 16R", mag: 160 },
    { name: "RWY 34L", mag: 340 },
    { name: "RWY 34R", mag: 340 },
  ],
  RJBB: [
    { name: "RWY 06L", mag: 60 },
    { name: "RWY 06R", mag: 60 },
    { name: "RWY 24L", mag: 240 },
    { name: "RWY 24R", mag: 240 },
  ],
  RJCC: [
    { name: "RWY 01L", mag: 10 },
    { name: "RWY 01R", mag: 10 },
    { name: "RWY 19L", mag: 190 },
    { name: "RWY 19R", mag: 190 },
  ],

  // Taiwan
  RCTP: [
    { name: "RWY 05L", mag: 50 },
    { name: "RWY 05R", mag: 50 },
    { name: "RWY 23L", mag: 230 },
    { name: "RWY 23R", mag: 230 },
  ],
  RCSS: [
    { name: "RWY 10", mag: 100 },
    { name: "RWY 28", mag: 280 },
  ],
  RCKH: [
    { name: "RWY 09", mag: 90 },
    { name: "RWY 27", mag: 270 },
  ],

  // USA (example)
  PANC: [
    { name: "RWY 07L", mag: 70 },
    { name: "RWY 07R", mag: 70 },
    { name: "RWY 25L", mag: 250 },
    { name: "RWY 25R", mag: 250 },
  ],
};

/**
 * 暫定：ICAO → IANA TimeZone
 * ここも本来は airports.ts に持たせるのが理想。
 */
const TZ_DB: Record<string, string> = {
  // Japan
  RJTT: "Asia/Tokyo",
  RJAA: "Asia/Tokyo",
  RJBB: "Asia/Tokyo",
  RJCC: "Asia/Tokyo",
  RJGG: "Asia/Tokyo",
  RJFF: "Asia/Tokyo",
  RJOO: "Asia/Tokyo",
  RJNN: "Asia/Tokyo",
  RJNT: "Asia/Tokyo",

  // Taiwan
  RCTP: "Asia/Taipei",
  RCSS: "Asia/Taipei",
  RCKH: "Asia/Taipei",

  // USA examples
  PANC: "America/Anchorage",
};

/** Crosswind/Headwind math */
function normalizeAngleDeg(a: number) {
  const x = ((a % 360) + 360) % 360;
  return x;
}
function angleDiffDeg(a: number, b: number) {
  const d = Math.abs(normalizeAngleDeg(a) - normalizeAngleDeg(b));
  return Math.min(d, 360 - d);
}
function calcComponents(windDir: number, windSpd: number, rwyMag: number) {
  const angle = angleDiffDeg(windDir, rwyMag);
  const rad = (angle * Math.PI) / 180;

  // Along-runway component: + = headwind, - = tailwind
  const along = Math.round(windSpd * Math.cos(rad));
  const cross = Math.round(windSpd * Math.sin(rad));

  return { head: Math.max(along, 0), tail: Math.max(-along, 0), cross: Math.abs(cross), angle };
}

/** Parse METAR wind like 02009G15KT */
function parseMetarWind(metar: string) {
  const m = metar.match(/(\d{3}|VRB)(\d{2})(G(\d{2}))?KT/);
  if (!m) return { dir: 0, spd: 0, gust: null as number | null, isVrb: false };
  const isVrb = m[1] === "VRB";
  const dir = isVrb ? 0 : Number(m[1]);
  const spd = Number(m[2]);
  const gust = m[4] ? Number(m[4]) : null;
  return { dir, spd, gust, isVrb };
}

/** Parse visibility (rough) */
function parseMetarVisibility(metar: string) {
  // US: 10SM / 1/2SM etc
  const sm = metar.match(/(\d{1,2})(?:\s)?SM/);
  if (sm) return { km: Number(sm[1]) * 1.852, raw: sm[0] };

  // ICAO: 9999 / 5000 etc
  const m = metar.match(/\b(\d{4})\b/);
  if (m) return { km: Number(m[1]) / 1000, raw: m[1] };

  return { km: null as number | null, raw: null as string | null };
}

/** Parse ceiling base from BKN/OVC/VV */
function parseCeilingFt(metar: string) {
  // e.g. BKN020 -> 2000ft
  const m = metar.match(/\b(BKN|OVC|VV)(\d{3})\b/);
  if (!m) return null;
  return Number(m[2]) * 100;
}

/** TAF segmentation (very light) */
type TafSeg = { kind: "BASE" | "FM" | "BECMG" | "TEMPO"; from?: string; text: string; flags: string[] };
function parseTafSegments(taf: string): TafSeg[] {
  const t = (taf || "").replace(/\s+/g, " ").trim();
  if (!t) return [];

  // split tokens with markers, keep marker in result
  const tokens = t.split(" ");
  const segs: TafSeg[] = [];

  let cur: TafSeg = { kind: "BASE", text: "", flags: [] };

  function pushCur() {
    const s = { ...cur, text: cur.text.trim(), flags: extractFlags(cur.text) };
    if (s.text) segs.push(s);
  }
  function extractFlags(x: string) {
    const flags: string[] = [];
    if (/\bTS\b|\bTSRA\b|\bVCTS\b/.test(x)) flags.push("TS");
    if (/\bCB\b/.test(x)) flags.push("CB");
    if (/\bTEMPO\b/.test(x)) flags.push("TEMPO");
    if (/\bBECMG\b/.test(x)) flags.push("BECMG");
    if (/\bFM\d{6}\b/.test(x)) flags.push("FM");
    if (/\bPROB\d{2}\b/.test(x)) flags.push("PROB");
    if (/\bFG\b|\bBR\b/.test(x)) flags.push("FG/BR");
    if (/\bSN\b|\bFZRA\b|\bRA\b/.test(x)) flags.push("PRECIP");
    return flags;
  }

  for (const tok of tokens) {
    if (/^FM\d{6}$/.test(tok)) {
      pushCur();
      cur = { kind: "FM", from: tok, text: tok + " ", flags: [] };
      continue;
    }
    if (tok === "BECMG") {
      pushCur();
      cur = { kind: "BECMG", text: "BECMG ", flags: [] };
      continue;
    }
    if (tok === "TEMPO") {
      pushCur();
      cur = { kind: "TEMPO", text: "TEMPO ", flags: [] };
      continue;
    }
    cur.text += tok + " ";
  }
  pushCur();

  return segs;
}

/** Policies */
type PolicyPresetKey = "B777_Generic" | "A320_Generic" | "Custom";
type Policy = {
  name: string;
  xwindSteady: number; // kt
  xwindGust: number;   // kt (peak)
  tailwind: number;    // kt
  redIfTempoTSorCB: boolean;
};

const PRESETS: Record<PolicyPresetKey, Policy> = {
  B777_Generic: {
    name: "B777 (Generic)",
    xwindSteady: 30,
    xwindGust: 35,
    tailwind: 10,
    redIfTempoTSorCB: true,
  },
  A320_Generic: {
    name: "A320 (Generic)",
    xwindSteady: 25,
    xwindGust: 30,
    tailwind: 10,
    redIfTempoTSorCB: true,
  },
  Custom: {
    name: "Custom",
    xwindSteady: 30,
    xwindGust: 35,
    tailwind: 10,
    redIfTempoTSorCB: true,
  },
};

function levelColor(level: WXLevel) {
  if (level === "GREEN") return "lime";
  if (level === "AMBER") return "orange";
  return "red";
}

export default function Page() {
  const [icao, setIcao] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const [presetKey, setPresetKey] = useState<PolicyPresetKey>("B777_Generic");
  const [customPolicy, setCustomPolicy] = useState<Policy>(PRESETS.Custom);

  const icaoU = (icao || "").toUpperCase();
  const airport = AIRPORTS.find((a) => a.icao === icaoU);
  const rwyList = RWY_DB[icaoU] ?? [];
  const tz = TZ_DB[icaoU] ?? "UTC";

  const policy = useMemo(() => {
    if (presetKey === "Custom") return customPolicy;
    return PRESETS[presetKey];
  }, [presetKey, customPolicy]);

  async function getWeather() {
    setLoading(true);
    const res = await fetch(`/api/weather?icao=${icaoU}`);
    const json = await res.json();
    setData(json);
    setLoading(false);
  }

  const now = new Date();
  const utcStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  const localStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(now);

  const metar = data?.metar?.raw ?? "";
  const taf = data?.taf ?? "";
  const segments = useMemo(() => parseTafSegments(taf), [taf]);

  const wind = parseMetarWind(metar);
  const vis = parseMetarVisibility(metar);
  const ceilingFt = parseCeilingFt(metar);

  // --- Hazard / Level logic ---
  let level: WXLevel = "GREEN";
  const reasons: string[] = [];

  // Ceiling presence raises attention
  if (ceilingFt !== null) {
    level = "AMBER";
    reasons.push(`Ceiling detected: ${ceilingFt} ft`);
  }

  // TEMPO TS/CB policy
  const tempoTsCb = /TEMPO.*(TS|TSRA|VCTS|CB)/.test(taf);
  if (policy.redIfTempoTSorCB && tempoTsCb) {
    level = "RED";
    reasons.push("Policy: TEMPO TS/CB => RED");
  }

  // Any TS/CB anywhere in TAF (even not TEMPO) -> at least AMBER
  const anyTsCb = /\b(TS|TSRA|VCTS)\b/.test(taf) || /\bCB\b/.test(taf);
  if (anyTsCb && level !== "RED") {
    level = "AMBER";
    reasons.push("TS/CB mentioned in TAF");
  }

  // --- Alternate minima logic (simple operational heuristic) ---
  // You can tune thresholds later (or make airline-profile based).
  let altDecision: "NOT REQUIRED" | "REVIEW" | "REQUIRED" = "NOT REQUIRED";
  if (level === "RED") altDecision = "REQUIRED";
  else {
    const lowCeil = ceilingFt !== null && ceilingFt < 2000;
    const lowVis = vis.km !== null && vis.km < 5;
    if (lowCeil || lowVis) altDecision = "REVIEW";
    if ((lowCeil && lowVis) || tempoTsCb) altDecision = "REQUIRED";
  }

  // --- NOTAM links (simple) ---
  const notamLinks = useMemo(() => {
    // Return a couple of useful entry points; exact coverage varies by region.
    // (API integration is next step; here we keep it practical.)
    const q = encodeURIComponent(icaoU);
    return [
      {
        label: "NOTAM (FAA Search - works best for US)",
        href: `https://www.notams.faa.gov/dinsQueryWeb/queryRetrievalMapAction.do?reportType=Raw&retrieveLocId=${q}`,
      },
      {
        label: "NOTAM (SkyVector - quick lookup)",
        href: `https://skyvector.com/airport/${q}`,
      },
    ];
  }, [icaoU]);

  // --- UI helpers ---
  const card: React.CSSProperties = {
    border: "1px solid #2d2d2d",
    borderRadius: 14,
    padding: 16,
    background: "#0f0f10",
  };
  const label: React.CSSProperties = { opacity: 0.8, fontSize: 12 };
  const h2: React.CSSProperties = { margin: "0 0 10px 0" };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif", background: "#0b0b0c", color: "#f2f2f2", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 16 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34 }}>ARI Safety Intelligence</h1>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              ICAO入力 → METAR/TAF取得 → RWY別風成分 → 運航判定（試作）
            </div>
          </div>

          <div style={{ ...card, minWidth: 320 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <div>
                <div style={label}>UTC</div>
                <div style={{ fontWeight: 700 }}>{utcStr}Z</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={label}>{icaoU || "----"} Local ({tz})</div>
                <div style={{ fontWeight: 700 }}>{localStr}</div>
              </div>
            </div>
          </div>
        </header>

        {/* Input row */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 0.8fr", gap: 12, marginBottom: 12 }}>
          <div style={card}>
            <div style={label}>ICAO / IATA / Name</div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <input
                value={icaoU}
                onChange={(e) => setIcao(e.target.value.toUpperCase())}
                placeholder="RJTT / RCTP / PANC"
                style={{
                  flex: 1,
                  padding: 12,
                  fontSize: 16,
                  borderRadius: 12,
                  border: "1px solid #333",
                  background: "#0b0b0c",
                  color: "#f2f2f2",
                  outline: "none",
                }}
              />
              <button
                onClick={getWeather}
                disabled={!icaoU || loading}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #333",
                  background: loading ? "#222" : "#ffffff",
                  color: loading ? "#aaa" : "#000",
                  cursor: loading ? "not-allowed" : "pointer",
                  fontWeight: 700,
                }}
              >
                {loading ? "Loading..." : "Get Weather"}
              </button>
            </div>

            {airport && (
              <div style={{ marginTop: 10, opacity: 0.9 }}>
                <strong>{airport.icao}</strong> ({airport.iata}) — {airport.name} / {airport.city}
              </div>
            )}
          </div>

          {/* Company policy preset */}
          <div style={card}>
            <div style={label}>Company Crosswind Policy Preset</div>
            <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
              <select
                value={presetKey}
                onChange={(e) => setPresetKey(e.target.value as PolicyPresetKey)}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #333",
                  background: "#0b0b0c",
                  color: "#f2f2f2",
                }}
              >
                <option value="B777_Generic">B777 (Generic)</option>
                <option value="A320_Generic">A320 (Generic)</option>
                <option value="Custom">Custom</option>
              </select>
            </div>

            {presetKey === "Custom" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                <div>
                  <div style={label}>XWIND steady (kt)</div>
                  <input
                    type="number"
                    value={customPolicy.xwindSteady}
                    onChange={(e) => setCustomPolicy({ ...customPolicy, xwindSteady: Number(e.target.value) })}
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid #333",
                      background: "#0b0b0c",
                      color: "#f2f2f2",
                    }}
                  />
                </div>
                <div>
                  <div style={label}>XWIND gust (kt)</div>
                  <input
                    type="number"
                    value={customPolicy.xwindGust}
                    onChange={(e) => setCustomPolicy({ ...customPolicy, xwindGust: Number(e.target.value) })}
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid #333",
                      background: "#0b0b0c",
                      color: "#f2f2f2",
                    }}
                  />
                </div>
                <div>
                  <div style={label}>Tailwind limit (kt)</div>
                  <input
                    type="number"
                    value={customPolicy.tailwind}
                    onChange={(e) => setCustomPolicy({ ...customPolicy, tailwind: Number(e.target.value) })}
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 12,
                      border: "1px solid #333",
                      background: "#0b0b0c",
                      color: "#f2f2f2",
                    }}
                  />
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 18, opacity: 0.9 }}>
                  <input
                    type="checkbox"
                    checked={customPolicy.redIfTempoTSorCB}
                    onChange={(e) => setCustomPolicy({ ...customPolicy, redIfTempoTSorCB: e.target.checked })}
                  />
                  TEMPO TS/CB => RED
                </label>
              </div>
            )}

            {presetKey !== "Custom" && (
              <div style={{ marginTop: 10, opacity: 0.9, fontSize: 13, lineHeight: 1.4 }}>
                <div><b>Steady XWIND</b>: {policy.xwindSteady} kt</div>
                <div><b>Gust XWIND</b>: {policy.xwindGust} kt</div>
                <div><b>Tailwind</b>: {policy.tailwind} kt</div>
                <div><b>TEMPO TS/CB</b>: {policy.redIfTempoTSorCB ? "RED" : "Not forced"}</div>
              </div>
            )}
          </div>

          {/* Level */}
          <div style={card}>
            <div style={label}>WX Level</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: levelColor(level), marginTop: 6 }}>
              {level}
            </div>
            <div style={{ marginTop: 8, opacity: 0.9 }}>
              <div style={label}>Alternate minima logic</div>
              <div style={{ fontWeight: 800 }}>
                {altDecision === "NOT REQUIRED" && <span style={{ color: "lime" }}>ALT: NOT REQUIRED</span>}
                {altDecision === "REVIEW" && <span style={{ color: "orange" }}>ALT: REVIEW</span>}
                {altDecision === "REQUIRED" && <span style={{ color: "red" }}>ALT: REQUIRED</span>}
              </div>
            </div>
          </div>
        </div>

        {/* Data panels */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={card}>
            <div style={{ ...label, marginBottom: 6 }}>METAR</div>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
              {metar || "(no metar)"}
            </pre>
            <div style={{ display: "flex", gap: 14, marginTop: 10, opacity: 0.9, fontSize: 13 }}>
              <div>
                <div style={label}>Visibility</div>
                <div>{vis.raw ?? "—"}{vis.km !== null ? ` (~${vis.km.toFixed(1)} km)` : ""}</div>
              </div>
              <div>
                <div style={label}>Ceiling</div>
                <div>{ceilingFt !== null ? `${ceilingFt} ft` : "—"}</div>
              </div>
              <div>
                <div style={label}>Wind</div>
                <div>
                  {wind.isVrb ? "VRB" : `${wind.dir}°`} / {wind.spd}kt {wind.gust ? `G${wind.gust}` : ""}
                </div>
              </div>
            </div>
          </div>

          <div style={card}>
            <div style={{ ...label, marginBottom: 6 }}>TAF</div>
            <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
              {taf || "(no taf)"}
            </pre>
          </div>
        </div>

        {/* RWY analysis */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <div style={card}>
            <h2 style={h2}>RWY MAG HDG / Components</h2>
            {rwyList.length === 0 ? (
              <div style={{ opacity: 0.85 }}>
                RWY MAG DBに {icaoU} が未登録です。<br />
                → まずはこの画面の <b>RWY_DB</b> に追加すればOK（次ステップで完全DB化します）。
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {rwyList.map((r) => {
                  const steady = wind.isVrb ? null : calcComponents(wind.dir, wind.spd, r.mag);
                  const peak = wind.gust && !wind.isVrb ? calcComponents(wind.dir, wind.gust, r.mag) : null;

                  // Policy check (steady + gust separate)
                  const xwSteady = steady ? steady.cross : null;
                  const xwPeak = peak ? peak.cross : null;
                  const tailSteady = steady ? steady.tail : null;
                  const tailPeak = peak ? peak.tail : null;

                  const steadyOk =
                    xwSteady !== null &&
                    tailSteady !== null &&
                    xwSteady <= policy.xwindSteady &&
                    tailSteady <= policy.tailwind;

                  const gustOk =
                    xwPeak === null ||
                    (xwPeak <= policy.xwindGust && (tailPeak ?? 0) <= policy.tailwind);

                  const rwyStatus: WXLevel =
                    wind.isVrb ? "AMBER" : steadyOk && gustOk ? "GREEN" : "RED";

                  return (
                    <div key={r.name} style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <div style={{ fontWeight: 900 }}>
                          {r.name} <span style={{ opacity: 0.75, fontWeight: 700 }}>MAG {r.mag}°</span>
                        </div>
                        <div style={{ fontWeight: 900, color: levelColor(rwyStatus) }}>
                          {rwyStatus}
                        </div>
                      </div>

                      {wind.isVrb ? (
                        <div style={{ marginTop: 8, opacity: 0.9 }}>
                          VRB風はRWY別成分計算が不確実 → 目視確認/ATIS/塔情報を推奨
                        </div>
                      ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                          <div style={{ border: "1px dashed #333", borderRadius: 10, padding: 10 }}>
                            <div style={label}>Steady ({wind.spd}kt)</div>
                            <div>Headwind: <b>{steady?.head ?? 0}</b> kt</div>
                            <div>Tailwind: <b>{steady?.tail ?? 0}</b> kt</div>
                            <div>Crosswind: <b>{steady?.cross ?? 0}</b> kt</div>
                          </div>
                          <div style={{ border: "1px dashed #333", borderRadius: 10, padding: 10 }}>
                            <div style={label}>Gust ({wind.gust ?? "—"}kt)</div>
                            {peak ? (
                              <>
                                <div>Headwind: <b>{peak.head}</b> kt</div>
                                <div>Tailwind: <b>{peak.tail}</b> kt</div>
                                <div>Crosswind: <b>{peak.cross}</b> kt</div>
                              </>
                            ) : (
                              <div style={{ opacity: 0.85 }}>No gust group</div>
                            )}
                          </div>
                        </div>
                      )}

                      <div style={{ marginTop: 10, opacity: 0.9, fontSize: 13, lineHeight: 1.5 }}>
                        <div style={label}>Policy check</div>
                        <div>
                          XWIND steady ≤ {policy.xwindSteady} / gust ≤ {policy.xwindGust} / tailwind ≤ {policy.tailwind}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* TAF trend */}
          <div style={card}>
            <h2 style={h2}>TAF Trend (FM / BECMG / TEMPO)</h2>
            {segments.length === 0 ? (
              <div style={{ opacity: 0.85 }}>TAFが未取得、または空です。</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {segments.map((s, idx) => {
                  const segLevel: WXLevel =
                    (policy.redIfTempoTSorCB && s.kind === "TEMPO" && (/\bTS\b|\bTSRA\b|\bVCTS\b|\bCB\b/.test(s.text)))
                      ? "RED"
                      : (/\bTS\b|\bTSRA\b|\bVCTS\b|\bCB\b/.test(s.text))
                      ? "AMBER"
                      : "GREEN";

                  return (
                    <div key={idx} style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div style={{ fontWeight: 900 }}>
                          {s.kind}{s.from ? ` (${s.from})` : ""}
                        </div>
                        <div style={{ fontWeight: 900, color: levelColor(segLevel) }}>{segLevel}</div>
                      </div>
                      <div style={{ marginTop: 6, opacity: 0.9, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
                        {s.text}
                      </div>
                      {s.flags.length > 0 && (
                        <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {s.flags.map((f) => (
                            <span
                              key={f}
                              style={{
                                padding: "3px 8px",
                                borderRadius: 999,
                                border: "1px solid #333",
                                fontSize: 12,
                                opacity: 0.9,
                              }}
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Dispatch panel */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={card}>
            <h2 style={h2}>Dispatch Release (style)</h2>
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
                  <div style={label}>Airport</div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>
                    {airport ? `${airport.icao} (${airport.iata})` : icaoU || "—"}
                  </div>
                  <div style={{ opacity: 0.85 }}>{airport ? `${airport.name} / ${airport.city}` : ""}</div>
                </div>

                <div style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
                  <div style={label}>Decision</div>
                  <div style={{ fontWeight: 1000, fontSize: 18, color: levelColor(level) }}>
                    {level === "GREEN" ? "✔ GO" : level === "AMBER" ? "⚠ REVIEW" : "⛔ NO-GO (provisional)"}
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.9, fontSize: 13 }}>
                    ALT: <b>{altDecision}</b>
                  </div>
                </div>
              </div>

              <div style={{ border: "1px solid #2a2a2a", borderRadius: 12, padding: 12 }}>
                <div style={label}>Reasons</div>
                {reasons.length === 0 ? (
                  <div style={{ opacity: 0.9 }}>No special flags.</div>
                ) : (
                  <ul style={{ margin: "6px 0 0 18px", opacity: 0.95 }}>
                    {reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
              ※本画面は試作（注意喚起レベル）。最終判断はSOP/運航規程/機種別AFM/Company policyに従うこと。
            </div>
          </div>

          <div style={card}>
            <h2 style={h2}>NOTAM</h2>
            <div style={{ opacity: 0.85, marginBottom: 10 }}>
              まずは外部検索リンク（次ステップでNOTAM API直結にします）
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {notamLinks.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "block",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #333",
                    textDecoration: "none",
                    color: "#fff",
                    background: "#0b0b0c",
                  }}
                >
                  {l.label}
                  <div style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
                    {icaoU ? `Query: ${icaoU}` : "Enter ICAO first"}
                  </div>
                </a>
              ))}
            </div>

            <div style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
              次段：NOTAMの「RWY CLSD / ILS OTS / TWY CLSD / LVP / OBST / CRANE」などを抽出して、運航判定に自動反映します。
            </div>
          </div>
        </div>

        {/* Raw data debug */}
        <details style={{ marginTop: 14, opacity: 0.9 }}>
          <summary style={{ cursor: "pointer" }}>Raw JSON</summary>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      </div>
    </main>
  );
}
