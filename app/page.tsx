"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { airports } from "./airports";
import { judgeDispatch } from "./lib/wxJudge";
import type { RwySurface, ApproachCat } from "./lib/limits";

type Wind = { dir: number; spd: number; gust?: number | null };

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}
function normDeg(x: number) {
  const v = x % 360;
  return v < 0 ? v + 360 : v;
}
function angleDiff(a: number, b: number) {
  const d = Math.abs(normDeg(a) - normDeg(b));
  return d > 180 ? 360 - d : d;
}
function headTailFrom(wdir: number, wspd: number, rwyMag: number) {
  const ang = angleDiff(wdir, rwyMag) * Math.PI / 180;
  return Math.round(Math.cos(ang) * wspd); // +head / -tail
}
function crossFrom(wdir: number, wspd: number, rwyMag: number) {
  const ang = angleDiff(wdir, rwyMag) * Math.PI / 180;
  return Math.round(Math.abs(Math.sin(ang) * wspd));
}

// --- 時刻表示（PCローカル時刻を表示しない）---
// Date.now() はUTC基準のタイムスタンプ。表示は必ず timeZone を指定。
function fmtZoned(ms: number, timeZone: string) {
  try {
    const dtf = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZoneName: "short",
    });
    return dtf.format(new Date(ms));
  } catch {
    return `TZ ERROR (${timeZone})`;
  }
}

// --- ③ AMBER/RED理由の優先順位 ---
function rankReason(r: string) {
  const s = r.toUpperCase();
  if (s.includes("TEMPO") && (s.includes("TS") || s.includes("CB"))) return 0;
  if (s.includes("TAILWIND") && s.includes(">")) return 1;
  if (s.includes("CROSSWIND") && s.includes(">")) return 2;
  if (s.includes("TAILWIND HIGH")) return 3;
  if (s.includes("CROSSWIND HIGH")) return 4;
  if (s.includes("PROB") && (s.includes("TS") || s.includes("CB"))) return 5;
  if (s.includes("FM") || s.includes("BECMG")) return 6;
  return 50;
}
function sortReasons(reasons: string[]) {
  return [...reasons].sort((a, b) => rankReason(a) - rankReason(b));
}

function Badge({ v }: { v: "GREEN" | "AMBER" | "RED" }) {
  const bg = v === "GREEN" ? "#0f5132" : v === "AMBER" ? "#664d03" : "#842029";
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        borderRadius: 14,
        background: bg,
        color: "#fff",
        fontWeight: 800,
        letterSpacing: 0.5,
        fontSize: 18,
      }}
    >
      {v}
    </div>
  );
}

function Meter({ label, value, limit }: { label: string; value: number; limit: number }) {
  const pct = clamp(Math.round((value / Math.max(1, limit)) * 100));
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.85 }}>
        <span>{label}</span>
        <span>
          {value} kt / LIM {limit} kt ({pct}%)
        </span>
      </div>
      <div style={{ height: 10, borderRadius: 999, background: "#e9ecef", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#212529" }} />
      </div>
    </div>
  );
}

export default function Home() {
  // 時刻（UTC＋空港ローカル）を秒更新
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ICAO typeahead
  const [icao, setIcao] = useState("RJTT");
  const [icaoQuery, setIcaoQuery] = useState("RJTT");
  const icaoInputRef = useRef<HTMLInputElement | null>(null);

  const [rwyId, setRwyId] = useState<string>("");
  const [surface, setSurface] = useState<RwySurface>("DRY");
  const [approachCat, setApproachCat] = useState<ApproachCat>("CATI");
  const [autoland, setAutoland] = useState(false);

  const [wx, setWx] = useState<{ metar: string | null; taf: string | null; wind: Wind | null } | null>(null);
  const [judge, setJudge] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const airportCandidates = useMemo(() => {
    const q = (icaoQuery || "").trim().toUpperCase();
    const list = airports.map((a) => a.icao).sort();
    if (!q) return list.slice(0, 30);
    return list.filter((code) => code.includes(q)).slice(0, 30);
  }, [icaoQuery]);

  const airport = useMemo(() => airports.find((a) => a.icao === icao) ?? airports[0], [icao]);
  const runways = airport?.runways ?? [];

  // ★表示用：UTCと空港現地時刻（DST自動）
  const utcNow = useMemo(() => fmtZoned(nowMs, "UTC"), [nowMs]);
  const aptLocalNow = useMemo(() => fmtZoned(nowMs, airport?.tz || "UTC"), [nowMs, airport?.tz]);

  // RWY 推奨（風が取れていれば）
  const recommendedRunways = useMemo(() => {
    if (!runways.length) return [];
    const wind = wx?.wind;
    const wdir = wind?.dir ?? 0;
    const wspd = wind?.spd ?? 0;
    const gust = wind?.gust ?? null;

    const scored = runways.map((r) => {
      const headSteady = headTailFrom(wdir, wspd, r.mag);
      const tailSteady = headSteady < 0 ? Math.abs(headSteady) : 0;
      const crossSteady = crossFrom(wdir, wspd, r.mag);

      const headPeak = gust ? headTailFrom(wdir, gust, r.mag) : null;
      const tailPeak = headPeak !== null && headPeak < 0 ? Math.abs(headPeak) : null;
      const crossPeak = gust ? crossFrom(wdir, gust, r.mag) : null;

      const tailUse = tailPeak ?? tailSteady;
      const crossUse = crossPeak ?? crossSteady;
      const headUse = Math.max(0, headPeak ?? headSteady);

      const score = headUse * 10 - tailUse * 30 - crossUse * 2;

      return { r, score, headUse, tailUse, crossUse };
    });

    return scored.sort((a, b) => b.score - a.score);
  }, [runways, wx?.wind]);

  const selectedRwy = useMemo(() => {
    if (!runways.length) return null;
    if (!rwyId) return runways[0];
    return runways.find((r) => r.id === rwyId) ?? runways[0];
  }, [runways, rwyId]);

  useEffect(() => {
    if (!runways.length) return;
    const best = recommendedRunways[0]?.r ?? runways[0];
    setRwyId(best.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [icao, runways.length]);

  function commitIcao(next: string) {
    const code = (next || "").trim().toUpperCase();
    const ok = airports.some((a) => a.icao === code);
    if (!ok) {
      setIcaoQuery(icao);
      return;
    }
    setIcao(code);
    setIcaoQuery(code);
  }

  async function fetchWeather() {
    setLoading(true);
    try {
      const res = await fetch(`/api/weather?icao=${icao}`);
      const data = await res.json();
      setWx(data);
      return data;
    } finally {
      setLoading(false);
    }
  }

  async function run() {
    const data = wx ?? (await fetchWeather());
    if (!data?.wind || !selectedRwy) return;

    const out = judgeDispatch({
      wind: data.wind,
      rwyMag: selectedRwy.mag,
      surface,
      approachCat,
      autoland,
      tafText: data.taf,
    });

    out.reason = sortReasons(out.reason ?? []);
    setJudge(out);
  }

  function setBestRwy() {
    const best = recommendedRunways[0]?.r;
    if (best) setRwyId(best.id);
  }

  const decision: "GREEN" | "AMBER" | "RED" = judge?.decision ?? "GREEN";
  const pdfEmphasis = decision === "RED" || decision === "AMBER";

  async function openPdf() {
    if (!judge || !wx || !selectedRwy) return;
    const payload = {
      airport: icao,
      rwy: selectedRwy.id,
      rwyMag: selectedRwy.mag,
      surface,
      approachCat,
      autoland,
      wind: wx.wind,
      comp: judge.comp,
      limits: judge.limits,
      decision: judge.decision,
      reason: judge.reason,
      tafBlocks: judge.tafRisk?.blocks ?? [],
      utcNow,
      aptLocalNow,
      aptTimeZone: airport?.tz || "UTC",
    };

    const res = await fetch("/api/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  const reasons: string[] = judge?.reason ?? [];
  const tailUse = (judge?.comp?.tailPeak ?? judge?.comp?.tailSteady ?? 0) as number;
  const crossUse = (judge?.comp?.crossPeak ?? judge?.comp?.crossSteady ?? 0) as number;
  const limTail = (judge?.limits?.maxTailwind ?? 10) as number;
  const limCross = (judge?.limits?.maxCrosswind ?? 35) as number;

  return (
    <main style={{ padding: 18, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <style jsx>{`
        .grid {
          display: grid;
          grid-template-columns: 320px 1fr 420px;
          gap: 14px;
          margin-top: 14px;
        }
        @media (max-width: 980px) {
          .grid {
            grid-template-columns: 1fr;
          }
          .topbar {
            flex-direction: column;
            align-items: stretch;
          }
          .actions {
            width: 100%;
            flex-wrap: wrap;
          }
          .actions button {
            flex: 1;
            min-width: 140px;
          }
        }
      `}</style>

      <div className="topbar" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>ARI Safety Intelligence</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Inputs → Decision → Evidence (Dispatch-style)</div>

          {/* ★ UTC / Airport Local Time（DST自動） */}
          <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ border: "1px solid #e9ecef", borderRadius: 14, padding: "8px 10px", background: "#fff" }}>
              <div style={{ fontSize: 11, opacity: 0.7 }}>UTC NOW</div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{utcNow}</div>
            </div>

            <div style={{ border: "1px solid #e9ecef", borderRadius: 14, padding: "8px 10px", background: "#fff" }}>
              <div style={{ fontSize: 11, opacity: 0.7 }}>
                {icao} LOCAL NOW ({airport?.tz || "UTC"})
              </div>
              <div style={{ fontSize: 13, fontWeight: 800 }}>{aptLocalNow}</div>
            </div>
          </div>
        </div>

        <div className="actions" style={{ display: "flex", gap: 10 }}>
          <button
            onClick={fetchWeather}
            disabled={loading}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #ced4da", background: "#fff" }}
          >
            {loading ? "Loading..." : "Fetch WX"}
          </button>

          <button
            onClick={run}
            style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid #212529", background: "#212529", color: "#fff", fontWeight: 700 }}
          >
            Run Dispatch Check
          </button>

          <button
            onClick={openPdf}
            disabled={!judge}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: pdfEmphasis ? "1px solid #842029" : "1px solid #ced4da",
              background: pdfEmphasis ? "#842029" : "#fff",
              color: pdfEmphasis ? "#fff" : "#212529",
              fontWeight: pdfEmphasis ? 800 : 600,
              boxShadow: pdfEmphasis ? "0 8px 20px rgba(132,32,41,0.25)" : "none",
            }}
            title={pdfEmphasis ? "Recommended to export (AMBER/RED)" : "Export PDF"}
          >
            PDF Release
          </button>
        </div>
      </div>

      <div className="grid">
        {/* LEFT: Inputs */}
        <section style={{ border: "1px solid #dee2e6", borderRadius: 16, padding: 14, background: "#fff" }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Inputs</div>

          <label style={{ display: "block", fontSize: 12, opacity: 0.75 }}>Airport (ICAO)</label>
          <input
            ref={icaoInputRef}
            value={icaoQuery}
            onChange={(e) => setIcaoQuery(e.target.value.toUpperCase())}
            onBlur={() => commitIcao(icaoQuery)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitIcao(icaoQuery);
                (e.currentTarget as HTMLInputElement).blur();
              }
              if (e.key === "Escape") {
                setIcaoQuery(icao);
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            placeholder="Type ICAO (e.g. RJTT)"
            style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ced4da", margin: "6px 0 8px" }}
          />

          <div style={{ display: "grid", gap: 6, maxHeight: 170, overflow: "auto", paddingBottom: 8 }}>
            {airportCandidates.map((code) => (
              <button
                key={code}
                onClick={() => {
                  commitIcao(code);
                  icaoInputRef.current?.blur();
                }}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: code === icao ? "1px solid #212529" : "1px solid #e9ecef",
                  background: code === icao ? "#f8f9fa" : "#fff",
                  cursor: "pointer",
                  fontWeight: code === icao ? 800 : 600,
                }}
              >
                {code}
              </button>
            ))}
          </div>

          <label style={{ display: "block", fontSize: 12, opacity: 0.75, marginTop: 6 }}>Runway</label>
          <div style={{ display: "flex", gap: 8, margin: "6px 0 12px" }}>
            <select value={rwyId} onChange={(e) => setRwyId(e.target.value)} style={{ flex: 1, padding: 10, borderRadius: 12, border: "1px solid #ced4da" }}>
              {recommendedRunways.map((x, idx) => (
                <option key={x.r.id} value={x.r.id}>
                  {idx === 0 ? "★ " : ""}
                  {x.r.id} (MAG {x.r.mag})  HW {x.headUse} / TW {x.tailUse} / XW {x.crossUse}
                </option>
              ))}
            </select>

            <button onClick={setBestRwy} style={{ padding: "10px 10px", borderRadius: 12, border: "1px solid #ced4da", background: "#fff" }} title="Select recommended runway">
              Best
            </button>
          </div>

          <label style={{ display: "block", fontSize: 12, opacity: 0.75 }}>Runway Surface</label>
          <select value={surface} onChange={(e) => setSurface(e.target.value as RwySurface)} style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ced4da", margin: "6px 0 12px" }}>
            <option value="DRY">DRY</option>
            <option value="WET">WET</option>
            <option value="CONTAM">CONTAM</option>
          </select>

          <label style={{ display: "block", fontSize: 12, opacity: 0.75 }}>Approach Category</label>
          <select value={approachCat} onChange={(e) => setApproachCat(e.target.value as ApproachCat)} style={{ width: "100%", padding: 10, borderRadius: 12, border: "1px solid #ced4da", margin: "6px 0 12px" }}>
            <option value="CATI">CAT I</option>
            <option value="CATII">CAT II</option>
            <option value="CATIII">CAT III</option>
          </select>

          <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <input type="checkbox" checked={autoland} onChange={(e) => setAutoland(e.target.checked)} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Autoland</span>
          </label>

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
            AMBER = Limit高接近 / 予報リスク（PROB等）<br />
            RED = Limit超過 / TEMPO TS/CB など
          </div>
        </section>

        {/* CENTER: Decision */}
        <section style={{ border: "1px solid #dee2e6", borderRadius: 16, padding: 14, background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 800 }}>Decision</div>
            <Badge v={judge?.decision ?? "GREEN"} />
          </div>

          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ border: "1px solid #e9ecef", borderRadius: 14, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Selected RWY</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedRwy ? `${icao} RWY ${selectedRwy.id}` : "—"}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>MAG {selectedRwy?.mag ?? "—"}</div>
            </div>

            <div style={{ border: "1px solid #e9ecef", borderRadius: 14, padding: 12 }}>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Wind</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {wx?.wind ? `${wx.wind.dir}° / ${wx.wind.spd}${wx.wind.gust ? `G${wx.wind.gust}` : ""} kt` : "—"}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                Surface {surface} / {approachCat} / {autoland ? "Autoland" : "Manual"}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 12, border: "1px solid #e9ecef", borderRadius: 14, padding: 12 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Why</div>
            {reasons.slice(0, 4).map((r, i) => (
              <div key={i} style={{ fontSize: 13, margin: "6px 0" }}>
                • {r}
              </div>
            ))}
            {!reasons.length && <div style={{ opacity: 0.7 }}>—</div>}

            <Meter label="Tailwind (use peak if exists)" value={tailUse} limit={limTail} />
            <Meter label="Crosswind (use peak if exists)" value={crossUse} limit={limCross} />
          </div>
        </section>

        {/* RIGHT: Evidence */}
        <section style={{ border: "1px solid #dee2e6", borderRadius: 16, padding: 14, background: "#fff" }}>
          <div style={{ fontWeight: 800, marginBottom: 10 }}>Evidence</div>

          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>METAR</div>
          <pre style={{ whiteSpace: "pre-wrap", border: "1px solid #e9ecef", borderRadius: 14, padding: 12, marginTop: 0 }}>
            {wx?.metar ?? "—"}
          </pre>

          <div style={{ fontSize: 12, opacity: 0.7, margin: "10px 0 6px" }}>TAF (blocks)</div>
          <div style={{ display: "grid", gap: 8 }}>
            {(judge?.tafRisk?.blocks ?? []).map((b: any, idx: number) => (
              <div key={idx} style={{ border: "1px solid #e9ecef", borderRadius: 14, padding: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.8 }}>{b.type}</div>
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{b.text}</div>
              </div>
            ))}
            {!judge?.tafRisk?.blocks?.length && (
              <div style={{ border: "1px solid #e9ecef", borderRadius: 14, padding: 10, opacity: 0.7 }}>
                — (Run Dispatch Check で表示)
              </div>
            )}
          </div>

          <div style={{ fontSize: 12, opacity: 0.7, margin: "12px 0 6px" }}>Limits used</div>
          <pre style={{ whiteSpace: "pre-wrap", border: "1px solid #e9ecef", borderRadius: 14, padding: 12, marginTop: 0 }}>
            {judge ? JSON.stringify(judge.limits, null, 2) : "—"}
          </pre>
        </section>
      </div>
    </main>
  );
}
