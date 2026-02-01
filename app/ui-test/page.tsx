"use client";

import { useMemo, useState } from "react";

type WxLevel = "GREEN" | "AMBER" | "RED" | "UNKNOWN";

type WxResponse = {
  status?: string;
  icao?: string;
  sources?: string[];
  metar?: {
    raw?: string;
    wind?: string;
    visibility?: string;
    qnh?: string;
    clouds?: string[];
    [k: string]: any;
  };
  taf?: string;
  wx_analysis?: {
    level?: WxLevel;
    reasons?: string[];
    [k: string]: any;
  };
  time?: string;
  [k: string]: any;
};

type TafSegment = {
  kind: "BASE" | "FM" | "BECMG" | "TEMPO" | "PROB";
  startMin: number; // minutes since validity start
  endMin: number; // minutes since validity start
  label: string; // e.g. "BASE", "FM 0900Z"
  text: string; // condition string
  visM?: number | null;
  ceilingFt?: number | null;
  category: "VFR" | "MVFR" | "IFR" | "LIFR" | "UNK";
};

function safeUpper(s: string) {
  return (s ?? "").trim().toUpperCase();
}

function normalizeLevel(lv?: string): WxLevel {
  const x = (lv ?? "").toUpperCase();
  if (x === "GREEN" || x === "AMBER" || x === "RED") return x;
  return "UNKNOWN";
}

function levelCopy(level: WxLevel) {
  switch (level) {
    case "GREEN":
      return { label: "GREEN", desc: "通常運航可（監視継続）" };
    case "AMBER":
      return { label: "AMBER", desc: "注意（条件確認・要監視）" };
    case "RED":
      return { label: "RED", desc: "要判断（PIC/Dispatch Review）" };
    default:
      return { label: "UNKNOWN", desc: "判定情報が不足しています" };
  }
}

/** ---------- TAF timeline parsing (robust, minimal assumptions) ---------- */

function parseTafValidity(taf: string): { startDay: number; startHour: number; endDay: number; endHour: number } | null {
  // Example: "TAF RJNK 010505Z 0106/0212 ..."
  const m = taf.match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/);
  if (!m) return null;
  const startDay = Number(m[1]);
  const startHour = Number(m[2]);
  const endDay = Number(m[3]);
  const endHour = Number(m[4]);
  if ([startDay, startHour, endDay, endHour].some((n) => Number.isNaN(n))) return null;
  return { startDay, startHour, endDay, endHour };
}

function dayHourToMinFromStart(day: number, hour: number, startDay: number, startHour: number): number {
  // validity can cross midnight (day increases)
  const dayOffset = day - startDay;
  const totalHours = dayOffset * 24 + (hour - startHour);
  return totalHours * 60;
}

function parseFmTime(token: string): { day: number; hour: number; min: number } | null {
  // FMDDHHMM e.g. FM010900 or FM021230
  const m = token.match(/^FM(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  return { day: Number(m[1]), hour: Number(m[2]), min: Number(m[3]) };
}

function parseWindow(tokenA: string, tokenB: string): { sDay: number; sHour: number; eDay: number; eHour: number } | null {
  // token like 0110/0118 or 0203/0206 etc.
  const m = (tokenA + " " + tokenB).match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/);
  if (!m) return null;
  return { sDay: Number(m[1]), sHour: Number(m[2]), eDay: Number(m[3]), eHour: Number(m[4]) };
}

function parseVisibilityMeters(text: string): number | null {
  // Common formats: 9999, 8000, 3000, 1500, also "P6SM" "3SM" etc.
  // We'll support meters (4 digits) primarily. SM parsing kept simple.
  const mMeters = text.match(/\b(\d{4})\b/);
  if (mMeters) {
    const v = Number(mMeters[1]);
    if (!Number.isNaN(v) && v >= 0 && v <= 9999) return v;
  }
  const mP6 = text.match(/\bP6SM\b/);
  if (mP6) return 9999; // treat as very good
  const mSm = text.match(/\b(\d+)\s*SM\b/);
  if (mSm) {
    const sm = Number(mSm[1]);
    if (!Number.isNaN(sm)) return Math.round(sm * 1609.34); // rough meters
  }
  return null;
}

function parseCeilingFeet(text: string): number | null {
  // Ceiling defined by lowest BKN/OVC/VV layer. Format: BKN020 => 2000ft
  const layers = Array.from(text.matchAll(/\b(BKN|OVC|VV)(\d{3})\b/g));
  if (!layers.length) return null;
  let minFt = Infinity;
  for (const l of layers) {
    const hundreds = Number(l[2]);
    if (!Number.isNaN(hundreds)) {
      const ft = hundreds * 100;
      if (ft < minFt) minFt = ft;
    }
  }
  return minFt === Infinity ? null : minFt;
}

function flightCategory(visM: number | null, ceilingFt: number | null): "VFR" | "MVFR" | "IFR" | "LIFR" | "UNK" {
  // Practical categories (rough, ICAO/FAA-ish):
  // VFR: vis >= 5000m and ceiling >= 3000ft
  // MVFR: vis 3000-4999 or ceiling 1000-2999
  // IFR: vis 1600-2999 or ceiling 500-999
  // LIFR: vis < 1600 or ceiling < 500
  if (visM == null && ceilingFt == null) return "UNK";

  const v = visM ?? 9999;
  const c = ceilingFt ?? 99999;

  if (v < 1600 || c < 500) return "LIFR";
  if (v < 3000 || c < 1000) return "IFR";
  if (v < 5000 || c < 3000) return "MVFR";
  return "VFR";
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function buildTafTimeline(tafRaw: string): { segments: TafSegment[]; totalMin: number; validityLabel: string } {
  const taf = (tafRaw ?? "").trim().replace(/\s+/g, " ");
  const validity = parseTafValidity(taf);
  if (!taf || !validity) {
    return { segments: [], totalMin: 0, validityLabel: "Validity: —" };
  }

  const { startDay, startHour, endDay, endHour } = validity;
  const startMin = 0;
  const totalMin = dayHourToMinFromStart(endDay, endHour, startDay, startHour);

  // Split into tokens
  const tokens = taf.split(" ");

  // Find where actual forecast begins (after validity token)
  const validityIdx = tokens.findIndex((t) => /^\d{4}\/\d{4}$/.test(t));
  const afterValidity = validityIdx >= 0 ? tokens.slice(validityIdx + 1) : tokens;

  // We'll create blocks by detecting markers: FMxxxxxx, BECMG ddhh/ddhh, TEMPO ddhh/ddhh, PROBnn ddhh/ddhh (optional)
  type Marker = { kind: TafSegment["kind"]; startMin: number; endMin: number; label: string; textStartIdx: number };

  const markers: Marker[] = [];
  markers.push({ kind: "BASE", startMin: 0, endMin: totalMin, label: "BASE", textStartIdx: 0 });

  for (let i = 0; i < afterValidity.length; i++) {
    const t = afterValidity[i];

    // FM
    const fm = parseFmTime(t);
    if (fm) {
      const s = dayHourToMinFromStart(fm.day, fm.hour, startDay, startHour) + fm.min;
      markers.push({
        kind: "FM",
        startMin: s,
        endMin: totalMin,
        label: `FM ${String(fm.day).padStart(2, "0")}${String(fm.hour).padStart(2, "0")}${String(fm.min).padStart(2, "0")}Z`,
        textStartIdx: i + 1,
      });
      continue;
    }

    // BECMG / TEMPO / PROBxx
    if (t === "BECMG" || t === "TEMPO" || t.startsWith("PROB")) {
      const kind: TafSegment["kind"] =
        t === "BECMG" ? "BECMG" : t === "TEMPO" ? "TEMPO" : "PROB";

      // Next token should be window ddhh/ddhh
      const winToken = afterValidity[i + 1] ?? "";
      const win = winToken.match(/^(\d{4})\/(\d{4})$/) ? winToken : "";
      if (win) {
        const m = win.match(/^(\d{2})(\d{2})\/(\d{2})(\d{2})$/);
        if (m) {
          const sDay = Number(m[1]);
          const sHour = Number(m[2]);
          const eDay = Number(m[3]);
          const eHour = Number(m[4]);
          const s = dayHourToMinFromStart(sDay, sHour, startDay, startHour);
          const e = dayHourToMinFromStart(eDay, eHour, startDay, startHour);
          markers.push({
            kind,
            startMin: s,
            endMin: e,
            label: `${t} ${winToken}`,
            textStartIdx: i + 2,
          });
        }
      }
    }
  }

  // Sort markers by time; BASE should stay at 0
  markers.sort((a, b) => a.startMin - b.startMin);

  // Determine text ranges for each marker until next marker keyword at same level
  const keywordRe = /^(FM\d{6}|BECMG|TEMPO|PROB\d{2})$/;

  const segments: TafSegment[] = [];

  for (let mi = 0; mi < markers.length; mi++) {
    const m = markers[mi];

    // Determine end for BASE/FM by next BASE/FM marker start; for BECMG/TEMPO/PROB use their window end already
    let s = clamp(m.startMin, 0, totalMin);
    let e = clamp(m.endMin, 0, totalMin);

    if (m.kind === "BASE") {
      // end at first marker after BASE (excluding itself)
      const next = markers.find((x) => x !== m && x.startMin > s);
      e = next ? clamp(next.startMin, 0, totalMin) : totalMin;
    } else if (m.kind === "FM") {
      // end at next FM marker start, else validity end
      const nextFm = markers.find((x) => x.kind === "FM" && x.startMin > s);
      e = nextFm ? clamp(nextFm.startMin, 0, totalMin) : totalMin;
    } // BECMG/TEMPO/PROB keep their window end

    if (e <= s) continue;

    // Extract text from afterValidity starting at textStartIdx until next keyword (FM/BECMG/TEMPO/PROB) encountered
    let j = m.textStartIdx;
    const parts: string[] = [];
    while (j < afterValidity.length) {
      const tk = afterValidity[j];
      if (keywordRe.test(tk)) break;
      // Stop if we hit a time-window token that belongs to next marker (rare)
      if (/^\d{4}\/\d{4}$/.test(tk) && (afterValidity[j - 1] === "BECMG" || afterValidity[j - 1] === "TEMPO" || afterValidity[j - 1]?.startsWith("PROB"))) {
        break;
      }
      parts.push(tk);
      j++;
    }

    const text = parts.join(" ").trim() || "—";
    const visM = parseVisibilityMeters(text);
    const ceilFt = parseCeilingFeet(text);
    const cat = flightCategory(visM, ceilFt);

    segments.push({
      kind: m.kind,
      startMin: s,
      endMin: e,
      label: m.label,
      text,
      visM,
      ceilingFt: ceilFt,
      category: cat,
    });
  }

  const validityLabel = `Validity: ${String(startDay).padStart(2, "0")}${String(startHour).padStart(2, "0")}Z / ${String(endDay).padStart(2, "0")}${String(endHour).padStart(2, "0")}Z`;

  return { segments, totalMin, validityLabel };
}

function catClass(cat: TafSegment["category"]) {
  switch (cat) {
    case "VFR":
      return "cat vfr";
    case "MVFR":
      return "cat mvfr";
    case "IFR":
      return "cat ifr";
    case "LIFR":
      return "cat lifr";
    default:
      return "cat unk";
  }
}

export default function UiTest() {
  const [icao, setIcao] = useState("RJTT");
  const [data, setData] = useState<WxResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  const level: WxLevel = useMemo(
    () => normalizeLevel(data?.wx_analysis?.level),
    [data]
  );
  const lv = levelCopy(level);

  const metarRaw = data?.metar?.raw ?? "—";
  const tafRaw = data?.taf ?? "—";

  const station = data?.icao ?? "—";
  const wind = data?.metar?.wind ?? "—";
  const vis = data?.metar?.visibility ?? "—";
  const qnh = data?.metar?.qnh ?? "—";
  const clouds = data?.metar?.clouds?.length ? data.metar.clouds.join(", ") : "—";
  const updated = data?.time ?? "—";
  const reasons = data?.wx_analysis?.reasons ?? [];

  const timeline = useMemo(() => buildTafTimeline(typeof tafRaw === "string" ? tafRaw : ""), [tafRaw]);

  async function go() {
    const q = safeUpper(icao);
    if (!q) return;

    setLoading(true);
    setErr(null);

    try {
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const json = (await res.json()) as WxResponse;
      setData(json);
    } catch (e: any) {
      setErr(e?.message ?? "Fetch failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <style jsx>{`
        .page {
          min-height: 100vh;
          background: #f6f7f8;
          color: #111;
          font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
            Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        }
        .wrap {
          max-width: 1080px;
          margin: 0 auto;
          padding: 20px 16px 40px;
        }
        .header {
          background: #fff;
          border: 1px solid #e6e6e6;
          border-radius: 14px;
          padding: 18px 16px;
        }
        .title {
          font-size: 28px;
          font-weight: 800;
          margin: 0;
          letter-spacing: -0.02em;
        }
        .subtitle {
          margin-top: 6px;
          font-size: 13px;
          color: #555;
        }
        .toprow {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          margin-top: 14px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 800;
          border: 1px solid #e6e6e6;
        }
        .badge small {
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }
        .green {
          background: #0f5132;
          color: #d1e7dd;
          border-color: #b7dfc6;
        }
        .amber {
          background: #b45309;
          color: #fffbeb;
          border-color: #f5d090;
        }
        .red {
          background: #991b1b;
          color: #fee2e2;
          border-color: #fecaca;
        }
        .unknown {
          background: #3f3f46;
          color: #f4f4f5;
          border-color: #d4d4d8;
        }

        .controls {
          margin-top: 14px;
          background: #fff;
          border: 1px solid #e6e6e6;
          border-radius: 14px;
          padding: 14px;
        }
        .row {
          display: flex;
          gap: 10px;
          align-items: end;
          flex-wrap: wrap;
        }
        label {
          font-size: 12px;
          font-weight: 700;
          color: #444;
          display: block;
        }
        input {
          margin-top: 6px;
          border: 1px solid #d4d4d8;
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 16px;
          width: 220px;
          outline: none;
          background: #fff;
        }
        input:focus {
          border-color: #a1a1aa;
          box-shadow: 0 0 0 4px rgba(161, 161, 170, 0.2);
        }
        .hint {
          margin-top: 6px;
          font-size: 12px;
          color: #666;
        }
        .btn {
          border: 1px solid #e6e6e6;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 800;
          cursor: pointer;
          background: #111;
          color: #fff;
        }
        .btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .btn2 {
          border: 1px solid #e6e6e6;
          border-radius: 10px;
          padding: 10px 14px;
          font-weight: 800;
          cursor: pointer;
          background: #fff;
          color: #111;
        }

        .grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-top: 14px;
        }
        @media (min-width: 900px) {
          .grid {
            grid-template-columns: 360px 1fr;
          }
        }

        .card {
          background: #fff;
          border: 1px solid #e6e6e6;
          border-radius: 14px;
          padding: 14px;
        }
        .card h2 {
          margin: 0;
          font-size: 14px;
          font-weight: 900;
        }
        .small {
          font-size: 12px;
          color: #666;
        }

        .kgrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }
        .k {
          background: #f8fafc;
          border: 1px solid #e6e6e6;
          border-radius: 12px;
          padding: 10px;
        }
        .k .lab {
          font-size: 11px;
          color: #666;
          font-weight: 800;
        }
        .k .val {
          margin-top: 4px;
          font-size: 16px;
          font-weight: 900;
        }

        .twocol {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-top: 12px;
        }
        @media (min-width: 900px) {
          .twocol {
            grid-template-columns: 1fr 1fr;
          }
        }
        pre {
          white-space: pre-wrap;
          word-break: break-word;
          margin: 0;
          font-size: 12px;
          line-height: 1.45;
        }
        .prebox {
          background: #f8fafc;
          border: 1px solid #e6e6e6;
          border-radius: 12px;
          padding: 10px;
        }

        .rawjson {
          margin-top: 10px;
          background: #0b1220;
          color: #6ef08f;
          border: 1px solid #1f2937;
          border-radius: 12px;
          padding: 10px;
          max-height: 420px;
          overflow: auto;
        }

        .error {
          margin-top: 12px;
          border: 1px solid #fecaca;
          background: #fef2f2;
          color: #7f1d1d;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 13px;
          font-weight: 700;
        }
        .footer {
          margin-top: 14px;
          font-size: 12px;
          color: #666;
        }

        /* --- Timeline --- */
        .timelineWrap {
          margin-top: 12px;
          background: #f8fafc;
          border: 1px solid #e6e6e6;
          border-radius: 12px;
          padding: 10px;
        }
        .timelineHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          margin-bottom: 8px;
        }
        .tlLegend {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .pill {
          font-size: 11px;
          font-weight: 900;
          border-radius: 999px;
          padding: 4px 10px;
          border: 1px solid #e6e6e6;
          background: #fff;
          color: #111;
        }
        .bar {
          position: relative;
          height: 54px;
          background: #fff;
          border: 1px solid #e6e6e6;
          border-radius: 12px;
          overflow: hidden;
        }
        .seg {
          position: absolute;
          top: 6px;
          bottom: 6px;
          border-radius: 10px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          padding: 6px 8px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: center;
          gap: 2px;
        }
        .seg .t1 {
          font-size: 11px;
          font-weight: 900;
          color: rgba(0, 0, 0, 0.85);
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
        }
        .seg .t2 {
          font-size: 10px;
          color: rgba(0, 0, 0, 0.65);
          white-space: nowrap;
          text-overflow: ellipsis;
          overflow: hidden;
        }

        .cat.vfr { background: #d1fae5; }
        .cat.mvfr { background: #fef3c7; }
        .cat.ifr { background: #fee2e2; }
        .cat.lifr { background: #e9d5ff; }
        .cat.unk { background: #e5e7eb; }

        .tlTable {
          margin-top: 10px;
          display: grid;
          gap: 8px;
        }
        .rowSeg {
          background: #fff;
          border: 1px solid #e6e6e6;
          border-radius: 12px;
          padding: 10px;
        }
        .rowTop {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
          align-items: baseline;
        }
        .rowTitle {
          font-weight: 900;
          font-size: 12px;
        }
        .rowMeta {
          font-size: 11px;
          color: #666;
        }
        .rowText {
          margin-top: 6px;
          font-size: 12px;
          color: #111;
        }
      `}</style>

      <div className="wrap">
        {/* Header */}
        <div className="header">
          <h1 className="title">ARI UI Test</h1>
          <div className="subtitle">ICAO入力 → METAR/TAF取得 → WX注意喚起（UI先行）</div>

          <div className="toprow">
            <div
              className={
                "badge " +
                (level === "GREEN"
                  ? "green"
                  : level === "AMBER"
                  ? "amber"
                  : level === "RED"
                  ? "red"
                  : "unknown")
              }
              aria-label={`WX LEVEL ${lv.label}`}
            >
              WX LEVEL: {lv.label} <small>{lv.desc}</small>
            </div>

            <div className="small">
              Sources: {(data?.sources ?? []).join(", ") || "—"}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="controls">
          <div className="row">
            <div>
              <label>ICAO</label>
              <input
                value={icao}
                onChange={(e) => setIcao(e.target.value.toUpperCase())}
                placeholder="RJTT"
              />
              <div className="hint">例: RJTT / RJAA / KJFK</div>
            </div>

            <button className="btn" onClick={go} disabled={loading}>
              {loading ? "Fetching..." : "Get Weather"}
            </button>

            <button className="btn2" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Hide Raw" : "Show Raw"}
            </button>
          </div>

          {err && <div className="error">Error: {err}</div>}
        </div>

        {/* Main Grid */}
        <div className="grid">
          {/* Key Summary */}
          <div className="card">
            <h2>Key Summary</h2>

            <div className="kgrid">
              <div className="k">
                <div className="lab">Station</div>
                <div className="val">{station}</div>
              </div>
              <div className="k">
                <div className="lab">Wind</div>
                <div className="val">{wind}</div>
              </div>
              <div className="k">
                <div className="lab">Visibility</div>
                <div className="val">{vis}</div>
              </div>
              <div className="k">
                <div className="lab">QNH</div>
                <div className="val">{qnh}</div>
              </div>
              <div className="k" style={{ gridColumn: "1 / -1" }}>
                <div className="lab">Clouds</div>
                <div className="val">{clouds}</div>
              </div>
            </div>

            <div className="footer">Updated (UTC): {updated}</div>
          </div>

          {/* METAR / TAF */}
          <div className="card">
            <h2>METAR / TAF</h2>
            <div className="small">原文はカード表示（折返し対応）</div>

            <div className="twocol">
              <div className="prebox">
                <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>
                  METAR RAW
                </div>
                <pre>{metarRaw}</pre>
              </div>

              <div className="prebox">
                <div className="small" style={{ fontWeight: 900, marginBottom: 6 }}>
                  TAF RAW
                </div>
                <pre>{tafRaw}</pre>
              </div>
            </div>

            {/* --- TAF Timeline --- */}
            <div className="timelineWrap">
              <div className="timelineHead">
                <div>
                  <div className="small" style={{ fontWeight: 900 }}>
                    TAF Timeline（時系列）
                  </div>
                  <div className="small">{timeline.validityLabel}</div>
                </div>

                <div className="tlLegend">
                  <span className="pill">VFR</span>
                  <span className="pill">MVFR</span>
                  <span className="pill">IFR</span>
                  <span className="pill">LIFR</span>
                  <span className="pill">UNK</span>
                </div>
              </div>

              {timeline.segments.length === 0 || timeline.totalMin <= 0 ? (
                <div className="small">TAFの時系列解析ができません（TAF形式またはValidityが取得できない可能性）。</div>
              ) : (
                <>
                  <div className="bar" aria-label="TAF timeline bar">
                    {timeline.segments.map((s, idx) => {
                      const leftPct = (s.startMin / timeline.totalMin) * 100;
                      const widthPct = ((s.endMin - s.startMin) / timeline.totalMin) * 100;

                      return (
                        <div
                          key={idx}
                          className={`seg ${catClass(s.category)}`}
                          style={{
                            left: `${leftPct}%`,
                            width: `${Math.max(widthPct, 2)}%`,
                          }}
                          title={`${s.label} / ${s.category}\n${s.text}`}
                        >
                          <div className="t1">{s.label} — {s.category}</div>
                          <div className="t2">
                            {s.ceilingFt != null ? `Ceil ${s.ceilingFt}ft` : "Ceil —"} /{" "}
                            {s.visM != null ? `Vis ${s.visM}m` : "Vis —"}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="tlTable">
                    {timeline.segments.map((s, idx) => (
                      <div key={idx} className="rowSeg">
                        <div className="rowTop">
                          <div className="rowTitle">
                            {s.label} / {s.category}
                          </div>
                          <div className="rowMeta">
                            {Math.round(s.startMin / 60)}h → {Math.round(s.endMin / 60)}h（Validity startからの経過）
                          </div>
                        </div>
                        <div className="rowText">{s.text}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="small" style={{ fontWeight: 900 }}>
                判定理由（reasons） / {lv.label}
              </div>

              {reasons.length === 0 ? (
                <div className="small" style={{ marginTop: 6 }}>
                  まだ理由がありません（解析ロジックは次フェーズで追加します）。
                </div>
              ) : (
                <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                  {reasons.map((r, i) => (
                    <li key={i} className="small" style={{ marginBottom: 6 }}>
                      {r}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {showRaw && (
              <pre className="rawjson">{JSON.stringify(data ?? {}, null, 2)}</pre>
            )}
          </div>
        </div>

        <div className="footer">
          ※ 次フェーズで「Crosswind」「TS/CB即RED」「Alternate minima」を追加します。
        </div>
      </div>
    </div>
  );
}
