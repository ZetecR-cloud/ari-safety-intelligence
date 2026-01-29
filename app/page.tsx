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

// --- 理由の優先順位 ---
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

// --- UI helpers ---
function decisionTheme(v: "GREEN" | "AMBER" | "RED") {
  if (v === "GREEN") return { accent: "#16a34a", bg: "#052e16", soft: "rgba(22,163,74,0.10)" };
  if (v === "AMBER") return { accent: "#f59e0b", bg: "#2b1d00", soft: "rgba(245,158,11,0.12)" };
  return { accent: "#ef4444", bg: "#2b0b0e", soft: "rgba(239,68,68,0.12)" };
}
function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "danger" | "warn" | "ok" }) {
  const style =
    tone === "danger"
      ? { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.30)", color: "#ef4444" }
      : tone === "warn"
      ? { background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.30)", color: "#f59e0b" }
      : tone === "ok"
      ? { background: "rgba(22,163,74,0.12)", border: "1px solid rgba(22,163,74,0.30)", color: "#16a34a" }
      : { background: "rgba(148,163,184,0.10)", border: "1px solid rgba(148,163,184,0.25)", color: "#cbd5e1" };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, fontSize: 12, fontWeight: 700, ...style }}>
      {children}
    </span>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="cardTitle">{title}</div>
      {children}
    </section>
  );
}
function ProgressBar({ value, limit, accent }: { value: number; limit: number; accent: string }) {
  const pct = clamp(Math.round((value / Math.max(1, limit)) * 100));
  const warn = pct >= 80 && pct < 100;
  const bad = pct >= 100;
  const bar = bad ? "rgba(239,68,68,0.90)" : warn ? "rgba(245,158,11,0.90)" : accent;

  return (
    <div className="barWrap">
      <div className="bar" style={{ width: `${pct}%`, background: bar }} />
    </div>
  );
}
function TAFTag({ type }: { type: string }) {
  const t = type.toUpperCase();
  const tone =
    t === "TEMPO" ? "danger" :
    t.startsWith("PROB") ? "warn" :
    (t === "FM" || t === "BECMG") ? "neutral" : "ok";
  return <Pill tone={tone as any}>{type}</Pill>;
}

export default function Home() {
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

  const utcNow = useMemo(() => fmtZoned(nowMs, "UTC"), [nowMs]);
  const aptLocalNow = useMemo(() => fmtZoned(nowMs, airport?.tz || "UTC"), [nowMs, airport?.tz]);

  // RWY 推奨
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
  const theme = decisionTheme(decision);

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

  const windText = wx?.wind
    ? `${wx.wind.dir}° / ${wx.wind.spd}${wx.wind.gust ? `G${wx.wind.gust}` : ""} kt`
    : "—";

  return (
    <main className="app">
      <style jsx global>{`
        :root {
          color-scheme: dark;
        }
        body {
          margin: 0;
          background: radial-gradient(1200px 800px at 20% 0%, rgba(59,130,246,0.16), transparent 60%),
                      radial-gradient(900px 700px at 80% 10%, rgba(16,185,129,0.14), transparent 55%),
                      #05070c;
          color: #e5e7eb;
        }
      `}</style>

      {/* Mobile対応 */}
      <style jsx>{`
        .app {
          padding: 18px;
          font-family: system-ui, -apple-system, Segoe UI, sans-serif;
        }
        .topbar {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
        }
        .grid {
          display: grid;
          grid-template-columns: 340px 1fr 420px;
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
            min-width: 160px;
          }
        }
        .brand {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .title {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 0.2px;
        }
        .subtitle {
          font-size: 12px;
          opacity: 0.7;
        }
        .timeRow {
          margin-top: 10px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .timeChip {
          border: 1px solid rgba(148,163,184,0.18);
          background: rgba(15,23,42,0.55);
          border-radius: 16px;
          padding: 10px 12px;
          backdrop-filter: blur(8px);
        }
        .timeLabel {
          font-size: 11px;
          opacity: 0.7;
        }
        .timeValue {
          font-size: 13px;
          font-weight: 900;
          margin-top: 2px;
        }
        .actions {
          display: flex;
          gap: 10px;
        }
        button {
          cursor: pointer;
        }
        .btn {
          padding: 11px 12px;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.20);
          background: rgba(15,23,42,0.55);
          color: #e5e7eb;
          font-weight: 800;
          backdrop-filter: blur(8px);
        }
        .btnPrimary {
          border: 1px solid rgba(226,232,240,0.18);
          background: linear-gradient(180deg, rgba(15,23,42,0.9), rgba(15,23,42,0.55));
        }
        .btnDanger {
          border: 1px solid rgba(239,68,68,0.35);
          background: linear-gradient(180deg, rgba(239,68,68,0.18), rgba(15,23,42,0.55));
          box-shadow: 0 10px 30px rgba(239,68,68,0.20);
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .card {
          border: 1px solid rgba(148,163,184,0.18);
          background: rgba(15,23,42,0.55);
          border-radius: 18px;
          padding: 14px;
          backdrop-filter: blur(10px);
        }
        .cardTitle {
          font-weight: 900;
          margin-bottom: 10px;
          letter-spacing: 0.2px;
        }
        .label {
          font-size: 12px;
          opacity: 0.75;
          margin-top: 6px;
        }
        .input, select {
          width: 100%;
          margin-top: 6px;
          padding: 10px 12px;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.22);
          background: rgba(2,6,23,0.55);
          color: #e5e7eb;
          outline: none;
        }
        .candList {
          display: grid;
          gap: 6px;
          max-height: 170px;
          overflow: auto;
          padding-bottom: 8px;
          margin-top: 8px;
        }
        .candBtn {
          text-align: left;
          padding: 9px 10px;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.18);
          background: rgba(2,6,23,0.35);
          color: #e5e7eb;
          font-weight: 800;
        }
        .candBtnActive {
          border: 1px solid rgba(226,232,240,0.22);
          background: rgba(148,163,184,0.12);
        }
        .row {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .rowGrow {
          flex: 1;
        }
        .miniBtn {
          padding: 10px 10px;
          border-radius: 14px;
          border: 1px solid rgba(148,163,184,0.20);
          background: rgba(2,6,23,0.35);
          color: #e5e7eb;
          font-weight: 900;
        }
        .kpiGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .kpi {
          border: 1px solid rgba(148,163,184,0.16);
          background: rgba(2,6,23,0.35);
          border-radius: 18px;
          padding: 12px;
        }
        .kpiLabel { font-size: 11px; opacity: 0.72; }
        .kpiValue { font-size: 18px; font-weight: 1000; margin-top: 4px; }
        .kpiSub { font-size: 12px; opacity: 0.75; margin-top: 4px; }
        .decisionCard {
          border: 1px solid rgba(148,163,184,0.18);
          background: linear-gradient(180deg, ${theme.soft}, rgba(15,23,42,0.55));
          border-radius: 18px;
          padding: 14px;
          backdrop-filter: blur(10px);
        }
        .decisionHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: 16px;
          background: rgba(2,6,23,0.45);
          border: 1px solid rgba(148,163,184,0.18);
          font-weight: 1000;
          letter-spacing: 0.5px;
          font-size: 18px;
        }
        .badgeDot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: ${theme.accent};
          box-shadow: 0 0 0 6px rgba(255,255,255,0.02);
        }
        .whyBox {
          margin-top: 12px;
          border: 1px solid rgba(148,163,184,0.16);
          background: rgba(2,6,23,0.35);
          border-radius: 18px;
          padding: 12px;
        }
        .whyItem {
          font-size: 13px;
          margin: 7px 0;
          line-height: 1.35;
        }
        .barWrap {
          height: 10px;
          border-radius: 999px;
          background: rgba(148,163,184,0.12);
          overflow: hidden;
          margin-top: 6px;
        }
        .bar {
          height: 100%;
          border-radius: 999px;
        }
        pre {
          white-space: pre-wrap;
          border: 1px solid rgba(148,163,184,0.16);
          border-radius: 18px;
          padding: 12px;
          background: rgba(2,6,23,0.35);
          margin: 0;
        }
        .tafList {
          display: grid;
          gap: 8px;
          margin-top: 8px;
        }
        .tafItem {
          border: 1px solid rgba(148,163,184,0.16);
          background: rgba(2,6,23,0.35);
          border-radius: 18px;
          padding: 10px;
        }
        .tafTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 6px;
        }
        .muted {
          opacity: 0.7;
          font-size: 12px;
        }
      `}</style>

      {/* Top bar */}
      <div className="topbar">
        <div className="brand">
          <div className="title">ARI Safety Intelligence</div>
          <div className="subtitle">Dispatch board UI — fast inputs, loud decision, clean evidence</div>

          <div className="timeRow">
            <div className="timeChip">
              <div className="timeLabel">UTC NOW</div>
              <div className="timeValue">{utcNow}</div>
            </div>
            <div className="timeChip">
              <div className="timeLabel">
                {icao} LOCAL NOW ({airport?.tz || "UTC"})
              </div>
              <div className="timeValue">{aptLocalNow}</div>
            </div>
          </div>
        </div>

        <div className="actions">
          <button className="btn" onClick={fetchWeather} disabled={loading}>
            {loading ? "Loading..." : "Fetch WX"}
          </button>
          <button className="btn btnPrimary" onClick={run}>
            Run Dispatch Check
          </button>
          <button className={`btn ${pdfEmphasis ? "btnDanger" : ""}`} onClick={openPdf} disabled={!judge} title={pdfEmphasis ? "Recommended to export (AMBER/RED)" : "Export PDF"}>
            PDF Release
          </button>
        </div>
      </div>

      <div className="grid">
        {/* Inputs */}
        <Card title="Inputs">
          <div className="label">Airport (ICAO)</div>
          <input
            ref={icaoInputRef}
            className="input"
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
          />

          <div className="candList">
            {airportCandidates.map((code) => (
              <button
                key={code}
                className={`candBtn ${code === icao ? "candBtnActive" : ""}`}
                onClick={() => {
                  commitIcao(code);
                  icaoInputRef.current?.blur();
                }}
              >
                {code}
              </button>
            ))}
          </div>

          <div className="label">Runway (recommended order)</div>
          <div className="row" style={{ marginTop: 6 }}>
            <select className="rowGrow" value={rwyId} onChange={(e) => setRwyId(e.target.value)}>
              {recommendedRunways.map((x, idx) => (
                <option key={x.r.id} value={x.r.id}>
                  {idx === 0 ? "★ " : ""}
                  {x.r.id} (MAG {x.r.mag})  HW {x.headUse} / TW {x.tailUse} / XW {x.crossUse}
                </option>
              ))}
            </select>
            <button className="miniBtn" onClick={setBestRwy} title="Select top recommendation">
              Best
            </button>
          </div>

          <div className="label">Runway Surface</div>
          <select value={surface} onChange={(e) => setSurface(e.target.value as RwySurface)}>
            <option value="DRY">DRY</option>
            <option value="WET">WET</option>
            <option value="CONTAM">CONTAM</option>
          </select>

          <div className="label">Approach Category</div>
          <select value={approachCat} onChange={(e) => setApproachCat(e.target.value as ApproachCat)}>
            <option value="CATI">CAT I</option>
            <option value="CATII">CAT II</option>
            <option value="CATIII">CAT III</option>
          </select>

          <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
            <label className="row" style={{ gap: 10 }}>
              <input type="checkbox" checked={autoland} onChange={(e) => setAutoland(e.target.checked)} />
              <span style={{ fontSize: 13, fontWeight: 900 }}>Autoland</span>
            </label>

            <Pill tone={surface === "DRY" ? "ok" : surface === "WET" ? "warn" : "danger"}>
              {surface}
            </Pill>
          </div>

          <div style={{ marginTop: 12 }} className="muted">
            AMBER = limit close / forecast risk (PROB, trend)<br />
            RED = limit exceed / TEMPO TS/CB
          </div>
        </Card>

        {/* Decision */}
        <section className="decisionCard">
          <div className="decisionHeader">
            <div style={{ fontWeight: 1000, letterSpacing: 0.2 }}>Decision</div>
            <div className="badge">
              <span className="badgeDot" />
              {decision}
            </div>
          </div>

          <div className="kpiGrid">
            <div className="kpi">
              <div className="kpiLabel">Selected</div>
              <div className="kpiValue">{selectedRwy ? `${icao} RWY ${selectedRwy.id}` : "—"}</div>
              <div className="kpiSub">MAG {selectedRwy?.mag ?? "—"}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Wind</div>
              <div className="kpiValue">{windText}</div>
              <div className="kpiSub">
                {approachCat} / {autoland ? "Autoland" : "Manual"}
              </div>
            </div>
          </div>

          <div className="whyBox">
            <div style={{ fontWeight: 1000, marginBottom: 6 }}>Why (top reasons)</div>

            {reasons.slice(0, 4).map((r, i) => (
              <div className="whyItem" key={i}>
                • {r}
              </div>
            ))}
            {!reasons.length && <div className="muted">—</div>}

            <div style={{ marginTop: 12 }}>
              <div className="muted">Tailwind (peak if exists)</div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 1000 }}>{tailUse} kt</div>
                <div className="muted">LIM {limTail} kt</div>
              </div>
              <ProgressBar value={tailUse} limit={limTail} accent={theme.accent} />
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="muted">Crosswind (peak if exists)</div>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 1000 }}>{crossUse} kt</div>
                <div className="muted">LIM {limCross} kt</div>
              </div>
              <ProgressBar value={crossUse} limit={limCross} accent={theme.accent} />
            </div>
          </div>
        </section>

        {/* Evidence */}
        <Card title="Evidence">
          <div className="muted">METAR</div>
          <pre style={{ marginTop: 8 }}>{wx?.metar ?? "—"}</pre>

          <div className="muted" style={{ marginTop: 12 }}>
            TAF (blocks)
          </div>

          <div className="tafList">
            {(judge?.tafRisk?.blocks ?? []).map((b: any, idx: number) => (
              <div className="tafItem" key={idx}>
                <div className="tafTop">
                  <TAFTag type={b.type} />
                  <span className="muted">priority {rankReason(b.text ?? b.type)}</span>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.35 }}>{b.text}</div>
              </div>
            ))}
            {!judge?.tafRisk?.blocks?.length && <div className="tafItem muted">— (Run Dispatch Check で表示)</div>}
          </div>

          <div className="muted" style={{ marginTop: 12 }}>
            Limits used
          </div>
          <pre style={{ marginTop: 8 }}>{judge ? JSON.stringify(judge.limits, null, 2) : "—"}</pre>
        </Card>
      </div>
    </main>
  );
}
