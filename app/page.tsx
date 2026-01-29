"use client";

import { useEffect, useMemo, useState } from "react";
import { airports } from "./airports";
import { judgeDispatch } from "./lib/wxJudge";
import type { RwySurface, ApproachCat } from "./lib/limits";

type Wind = { dir: number; spd: number; gust?: number | null };

function clamp(n: number, min=0, max=100){ return Math.max(min, Math.min(max, n)); }

function Badge({ v }: { v: "GREEN"|"AMBER"|"RED" }) {
  const bg =
    v === "GREEN" ? "#0f5132" :
    v === "AMBER" ? "#664d03" : "#842029";
  const fg = "#fff";
  return (
    <div style={{
      display:"inline-flex", alignItems:"center", gap:10,
      padding:"10px 14px", borderRadius:14, background:bg, color:fg,
      fontWeight:800, letterSpacing:0.5, fontSize:18
    }}>
      {v}
    </div>
  );
}

function Meter({ label, value, limit }: { label:string; value:number; limit:number }) {
  const pct = clamp(Math.round((value/limit)*100));
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, opacity:0.85 }}>
        <span>{label}</span>
        <span>{value} kt / LIM {limit} kt ({pct}%)</span>
      </div>
      <div style={{ height:10, borderRadius:999, background:"#e9ecef", overflow:"hidden" }}>
        <div style={{ width:`${pct}%`, height:"100%", background:"#212529" }} />
      </div>
    </div>
  );
}

export default function Home() {
  const [icao, setIcao] = useState("RJTT");
  const [rwyId, setRwyId] = useState<string>("");
  const [surface, setSurface] = useState<RwySurface>("DRY");
  const [approachCat, setApproachCat] = useState<ApproachCat>("CATI");
  const [autoland, setAutoland] = useState(false);

  const [wx, setWx] = useState<{ metar:string|null; taf:string|null; wind:Wind|null } | null>(null);
  const [judge, setJudge] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const airport = useMemo(() => airports.find(a => a.icao === icao) ?? airports[0], [icao]);
  const runways = airport?.runways ?? [];
  const selectedRwy = useMemo(() => {
    if (!runways.length) return null;
    if (!rwyId) return runways[0];
    return runways.find(r => r.id === rwyId) ?? runways[0];
  }, [runways, rwyId]);

  // airportが変わったらRWYを初期化
  useEffect(() => {
    if (runways?.length) setRwyId(runways[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [icao]);

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
    const data = wx ?? await fetchWeather();
    if (!data?.wind || !selectedRwy) return;

    const out = judgeDispatch({
      wind: data.wind,
      rwyMag: selectedRwy.mag,
      surface,
      approachCat,
      autoland,
      tafText: data.taf
    });

    setJudge(out);
  }

  function autoSelectRwyHeadwind() {
    if (!wx?.wind || !runways.length) return;
    // “headwind最大”のRWYを選ぶ（簡易）
    const w = wx.wind;
    const best = runways
      .map(r => {
        const diff = Math.abs(((w.dir - r.mag + 540) % 360) - 180);
        const head = Math.round(Math.cos(diff * Math.PI/180) * w.spd); // +head / -tail
        return { r, head };
      })
      .sort((a,b) => b.head - a.head)[0]?.r;

    if (best) setRwyId(best.id);
  }

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
      tafBlocks: judge.tafRisk?.blocks ?? []
    };

    const res = await fetch("/api/release", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  }

  const decision: "GREEN"|"AMBER"|"RED" = judge?.decision ?? "GREEN";
  const reasons: string[] = judge?.reason ?? [];

  const tailUse = (judge?.comp?.tailPeak ?? judge?.comp?.tailSteady ?? 0) as number;
  const crossUse = (judge?.comp?.crossPeak ?? judge?.comp?.crossSteady ?? 0) as number;
  const limTail = (judge?.limits?.maxTailwind ?? 10) as number;
  const limCross = (judge?.limits?.maxCrosswind ?? 35) as number;

  return (
    <main style={{ padding:18, fontFamily:"system-ui, -apple-system, Segoe UI, sans-serif" }}>
      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:12 }}>
        <div>
          <div style={{ fontSize:20, fontWeight:800 }}>ARI Safety Intelligence</div>
          <div style={{ fontSize:12, opacity:0.7 }}>Inputs → Decision → Evidence (Dispatch-style)</div>
        </div>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={fetchWeather} disabled={loading}
            style={{ padding:"10px 12px", borderRadius:12, border:"1px solid #ced4da", background:"#fff" }}>
            {loading ? "Loading..." : "Fetch WX"}
          </button>
          <button onClick={run}
            style={{ padding:"10px 12px", borderRadius:12, border:"1px solid #212529", background:"#212529", color:"#fff", fontWeight:700 }}>
            Run Dispatch Check
          </button>
          <button onClick={openPdf} disabled={!judge}
            style={{ padding:"10px 12px", borderRadius:12, border:"1px solid #ced4da", background:"#fff" }}>
            PDF Release
          </button>
        </div>
      </div>

      <div style={{
        marginTop:14,
        display:"grid",
        gridTemplateColumns:"320px 1fr 420px",
        gap:14
      }}>
        {/* LEFT: Inputs */}
        <section style={{ border:"1px solid #dee2e6", borderRadius:16, padding:14, background:"#fff" }}>
          <div style={{ fontWeight:800, marginBottom:10 }}>Inputs</div>

          <label style={{ display:"block", fontSize:12, opacity:0.75 }}>Airport (ICAO)</label>
          <select value={icao} onChange={(e)=>setIcao(e.target.value)}
            style={{ width:"100%", padding:10, borderRadius:12, border:"1px solid #ced4da", margin:"6px 0 12px" }}>
            {airports.map(a => <option key={a.icao} value={a.icao}>{a.icao}</option>)}
          </select>

          <label style={{ display:"block", fontSize:12, opacity:0.75 }}>Runway</label>
          <div style={{ display:"flex", gap:8, margin:"6px 0 12px" }}>
            <select value={rwyId} onChange={(e)=>setRwyId(e.target.value)}
              style={{ flex:1, padding:10, borderRadius:12, border:"1px solid #ced4da" }}>
              {runways.map(r => <option key={r.id} value={r.id}>{r.id} (MAG {r.mag})</option>)}
            </select>
            <button onClick={autoSelectRwyHeadwind}
              style={{ padding:"10px 10px", borderRadius:12, border:"1px solid #ced4da", background:"#fff" }}>
              Auto
            </button>
          </div>

          <label style={{ display:"block", fontSize:12, opacity:0.75 }}>Runway Surface</label>
          <select value={surface} onChange={(e)=>setSurface(e.target.value as RwySurface)}
            style={{ width:"100%", padding:10, borderRadius:12, border:"1px solid #ced4da", margin:"6px 0 12px" }}>
            <option value="DRY">DRY</option>
            <option value="WET">WET</option>
            <option value="CONTAM">CONTAM</option>
          </select>

          <label style={{ display:"block", fontSize:12, opacity:0.75 }}>Approach Category</label>
          <select value={approachCat} onChange={(e)=>setApproachCat(e.target.value as ApproachCat)}
            style={{ width:"100%", padding:10, borderRadius:12, border:"1px solid #ced4da", margin:"6px 0 12px" }}>
            <option value="CATI">CAT I</option>
            <option value="CATII">CAT II</option>
            <option value="CATIII">CAT III</option>
          </select>

          <label style={{ display:"flex", alignItems:"center", gap:10, marginTop:6 }}>
            <input type="checkbox" checked={autoland} onChange={(e)=>setAutoland(e.target.checked)} />
            <span style={{ fontSize:13, fontWeight:700 }}>Autoland</span>
          </label>

          <div style={{ marginTop:12, fontSize:12, opacity:0.75 }}>
            AMBER = Limit高接近 / 予報リスク（PROB等）<br/>
            RED = Limit超過 / TEMPO TS/CB など
          </div>
        </section>

        {/* CENTER: Decision */}
        <section style={{ border:"1px solid #dee2e6", borderRadius:16, padding:14, background:"#fff" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
            <div style={{ fontWeight:800 }}>Decision</div>
            <Badge v={decision} />
          </div>

          <div style={{ marginTop:12, display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div style={{ border:"1px solid #e9ecef", borderRadius:14, padding:12 }}>
              <div style={{ fontSize:12, opacity:0.7 }}>Selected RWY</div>
              <div style={{ fontSize:18, fontWeight:800 }}>
                {selectedRwy ? `${icao} RWY ${selectedRwy.id}` : "—"}
              </div>
              <div style={{ fontSize:12, opacity:0.7 }}>MAG {selectedRwy?.mag ?? "—"}</div>
            </div>

            <div style={{ border:"1px solid #e9ecef", borderRadius:14, padding:12 }}>
              <div style={{ fontSize:12, opacity:0.7 }}>Wind</div>
              <div style={{ fontSize:18, fontWeight:800 }}>
                {wx?.wind ? `${wx.wind.dir}° / ${wx.wind.spd}${wx.wind.gust ? `G${wx.wind.gust}` : ""} kt` : "—"}
              </div>
              <div style={{ fontSize:12, opacity:0.7 }}>
                Surface {surface} / {approachCat} / {autoland ? "Autoland" : "Manual"}
              </div>
            </div>
          </div>

          <div style={{ marginTop:12, border:"1px solid #e9ecef", borderRadius:14, padding:12 }}>
            <div style={{ fontWeight:800, marginBottom:6 }}>Why</div>
            {reasons.slice(0,3).map((r, i) => (
              <div key={i} style={{ fontSize:13, margin:"6px 0" }}>• {r}</div>
            ))}
            {!reasons.length && <div style={{ opacity:0.7 }}>—</div>}

            <Meter label="Tailwind (use peak if exists)" value={tailUse} limit={limTail} />
            <Meter label="Crosswind (use peak if exists)" value={crossUse} limit={limCross} />
          </div>
        </section>

        {/* RIGHT: Evidence */}
        <section style={{ border:"1px solid #dee2e6", borderRadius:16, padding:14, background:"#fff" }}>
          <div style={{ fontWeight:800, marginBottom:10 }}>Evidence</div>

          <div style={{ fontSize:12, opacity:0.7, marginBottom:6 }}>METAR</div>
          <pre style={{ whiteSpace:"pre-wrap", border:"1px solid #e9ecef", borderRadius:14, padding:12, marginTop:0 }}>
            {wx?.metar ?? "—"}
          </pre>

          <div style={{ fontSize:12, opacity:0.7, margin:"10px 0 6px" }}>TAF (blocks)</div>
          <div style={{ display:"grid", gap:8 }}>
            {(judge?.tafRisk?.blocks ?? []).map((b: any, idx: number) => (
              <div key={idx} style={{ border:"1px solid #e9ecef", borderRadius:14, padding:10 }}>
                <div style={{ fontSize:12, fontWeight:800, opacity:0.8 }}>{b.type}</div>
                <div style={{ fontSize:13, whiteSpace:"pre-wrap" }}>{b.text}</div>
              </div>
            ))}
            {!judge?.tafRisk?.blocks?.length && (
              <div style={{ border:"1px solid #e9ecef", borderRadius:14, padding:10, opacity:0.7 }}>
                — (Run Dispatch Check で表示)
              </div>
            )}
          </div>

          <div style={{ fontSize:12, opacity:0.7, margin:"12px 0 6px" }}>Limits used</div>
          <pre style={{ whiteSpace:"pre-wrap", border:"1px solid #e9ecef", borderRadius:14, padding:12, marginTop:0 }}>
            {judge ? JSON.stringify(judge.limits, null, 2) : "—"}
          </pre>
        </section>
      </div>
    </main>
  );
}
