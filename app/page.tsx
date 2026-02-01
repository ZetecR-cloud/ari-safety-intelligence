"use client";

import React, { useMemo, useState } from "react";

/* ===========================
   Types
=========================== */

type WxLevel = "GREEN" | "AMBER" | "RED";

type WxResp = {
  status: "OK" | "NG";
  icao?: string;
  sources?: string[];
  metar?: {
    raw?: string;
    wind?: string; // e.g. "09003KT" / "VRB03KT"
    visibility?: string; // e.g. "9999" / "10SM"
    qnh?: string; // e.g. "1013" or "Q1013"
    clouds?: string[]; // e.g. ["FEW008","BKN030"]
    wx?: string; // e.g. "-SHSN"
  };
  taf?: {
    raw?: string;
  };
  wx_analysis?: {
    level?: WxLevel;
    reasons?: string[];
  };
  time?: string;
  error?: string;
};

type WindParsed = {
  dirDeg: number | null; // null = VRB
  spdKt: number;
  gustKt?: number;
  isVrb?: boolean;
};

type RwyEntry = { id: string; magDeg: number };
type RwyDbEntry = { name: string; runways: RwyEntry[] };

type TafGroup = {
  kind: "BASE" | "TEMPO" | "BECMG" | "FM";
  range: string; // e.g. "0108Z → 0113Z" (as text only)
  raw: string; // group text
  flightRule: "VFR" | "MVFR" | "IFR" | "LIFR" | "UNK";
};

/* ===========================
   RWY MAG HDG DB (最低限)
   ※magDegは「RWY磁方位（°）」目安。必要に応じて拡張してください。
=========================== */

const RWY_DB: Record<string, RwyDbEntry> = {
  RJTT: {
    name: "Tokyo Haneda",
    runways: [
      { id: "04", magDeg: 44 },
      { id: "05", magDeg: 53 },
      { id: "16L", magDeg: 164 },
      { id: "16R", magDeg: 164 },
      { id: "22", magDeg: 224 },
      { id: "23", magDeg: 233 },
      { id: "34L", magDeg: 344 },
      { id: "34R", magDeg: 344 },
    ],
  },
  RJCC: {
    name: "Sapporo New Chitose",
    runways: [
      { id: "01L", magDeg: 13 },
      { id: "01R", magDeg: 13 },
      { id: "19L", magDeg: 193 },
      { id: "19R", magDeg: 193 },
    ],
  },
  RJNK: {
    name: "Komatsu",
    runways: [
      { id: "06", magDeg: 56 },
      { id: "24", magDeg: 236 },
    ],
  },
  PHNL: {
    name: "Honolulu",
    runways: [
      { id: "04L", magDeg: 40 },
      { id: "04R", magDeg: 40 },
      { id: "08L", magDeg: 80 },
      { id: "08R", magDeg: 80 },
      { id: "22L", magDeg: 220 },
      { id: "22R", magDeg: 220 },
      { id: "26L", magDeg: 260 },
      { id: "26R", magDeg: 260 },
    ],
  },
};

/* ===========================
   Utils
=========================== */

function normIcao(s: string) {
  return (s || "").trim().toUpperCase();
}

function angleDiff(a: number, b: number) {
  // returns a-b normalized to [-180..180]
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function safeRound(n: number) {
  return Math.round(n);
}

/* ===========================
   METAR parsing helpers
   - APIが欠けるケース(PHNL等)をRAWから補完
=========================== */

function tokenizeWx(raw?: string): string[] {
  if (!raw) return [];
  return raw.trim().split(/\s+/).filter(Boolean);
}

function isCloudToken(t: string) {
  return /^(FEW|SCT|BKN|OVC|VV)\d{3}$/.test(t) || /^(CLR|SKC|NSC|NCD)$/.test(t);
}

function parseMetarWindFromRaw(raw?: string): WindParsed | null {
  if (!raw) return null;
  const tokens = tokenizeWx(raw.toUpperCase());
  // wind token example: 09003KT, VRB03KT, 22010G20KT
  const w = tokens.find((t) => /^(VRB|\d{3})\d{2,3}(G\d{2,3})?KT$/.test(t));
  if (!w) return null;

  const vrb = w.match(/^VRB(\d{2,3})(G(\d{2,3}))?KT$/);
  if (vrb) {
    const spd = Number(vrb[1]);
    const gust = vrb[3] ? Number(vrb[3]) : undefined;
    return { dirDeg: null, spdKt: spd, gustKt: gust, isVrb: true };
    }

  const m = w.match(/^(\d{3})(\d{2,3})(G(\d{2,3}))?KT$/);
  if (!m) return null;

  const dir = Number(m[1]);
  const spd = Number(m[2]);
  const gust = m[4] ? Number(m[4]) : undefined;
  return { dirDeg: dir, spdKt: spd, gustKt: gust, isVrb: false };
}

function parseVisibilityFromRaw(raw?: string): string | null {
  if (!raw) return null;
  const tokens = tokenizeWx(raw.toUpperCase());
  // ICAO style: 9999 / 8000 / 1500 etc
  const v1 = tokens.find((t) => /^\d{4}$/.test(t));
  if (v1) return v1;
  // US style: 10SM / 1SM / 3/4SM etc
  const v2 = tokens.find((t) => /^(\d+|\d+\/\d+|\d+\s\d+\/\d+)SM$/.test(t.replace(/\s/g, "")) || /^\d+SM$/.test(t));
  if (v2) return v2;
  // P6SM
  const v3 = tokens.find((t) => /^P\d+SM$/.test(t));
  if (v3) return v3;
  return null;
}

function parseQnhFromRaw(raw?: string): string | null {
  if (!raw) return null;
  const tokens = tokenizeWx(raw.toUpperCase());
  // Q1013
  const q = tokens.find((t) => /^Q\d{4}$/.test(t));
  if (q) return q.replace(/^Q/, "");
  // A2994 (inHg)
  const a = tokens.find((t) => /^A\d{4}$/.test(t));
  if (a) return a; // keep "A2994" for display if no Q
  return null;
}

function parseCloudsFromRaw(raw?: string): string[] {
  if (!raw) return [];
  const tokens = tokenizeWx(raw.toUpperCase());
  const clouds: string[] = [];
  for (const t of tokens) {
    if (/^(FEW|SCT|BKN|OVC|VV)\d{3}$/.test(t)) clouds.push(t);
    if (/^(CLR|SKC|NSC|NCD)$/.test(t)) clouds.push(t);
  }
  return clouds;
}

function isLikelyWxPhenomena(t: string) {
  // Exclude obvious non-phenomena tokens
  if (!t) return false;
  if (t === "RMK" || t === "NOSIG" || t === "AUTO" || t === "COR") return false;
  if (t.endsWith("KT")) return false;
  if (/^\d{6}Z$/.test(t)) return false;
  if (/^\d{4}\/\d{4}$/.test(t)) return false;
  if (/^\d{4}$/.test(t)) return false;
  if (/^(Q\d{4}|A\d{4})$/.test(t)) return false;
  if (isCloudToken(t)) return false;

  // Phenomena patterns (rough but practical):
  // -RA, SN, -SNRA, TSRA, SHRA, FZFG, BR, HZ etc
  // Allow prefix +/-/VC and 2-8 letters.
  if (/^(-|\+|VC)?[A-Z]{2,8}$/.test(t)) {
    // must include at least one known wx code chunk
    const codes = ["DZ","RA","SN","SG","IC","PL","GR","GS","UP","BR","FG","FU","VA","DU","SA","HZ","PY","PO","SQ","FC","SS","DS","TS","SH","FZ","MI","PR","BC","DR","BL"];
    return codes.some((c) => t.includes(c));
  }
  return false;
}

function parseWxPhenomenaFromRaw(raw?: string): string | null {
  if (!raw) return null;
  const tokens = tokenizeWx(raw.toUpperCase());
  const wx = tokens.filter(isLikelyWxPhenomena);
  if (wx.length === 0) return null;
  // keep order, join
  return wx.join(" ");
}

/* ===========================
   Ceiling logic
   - Ceiling = lowest of BKN/OVC/VV
=========================== */

function getCeilingFt(clouds?: string[]): number | null {
  if (!clouds || clouds.length === 0) return null;
  let ceiling: number | null = null;

  for (const c of clouds) {
    if (c.startsWith("BKN") || c.startsWith("OVC") || c.startsWith("VV")) {
      const h = Number(c.slice(3)) * 100;
      if (!isNaN(h)) {
        ceiling = ceiling === null ? h : Math.min(ceiling, h);
      }
    }
  }
  return ceiling;
}

/* ===========================
   Crosswind calculation
=========================== */

function computeWindComponents(wind: WindParsed, rwyMag: number) {
  // returns steady components (head/tail, cross)
  // If VRB => cannot compute direction-based; we treat cross = spdKt as worst-case, head = 0.
  if (wind.spdKt <= 0) {
    return {
      steady: { head: 0, cross: 0, crossSide: "CALM" as const },
      gust: wind.gustKt ? { head: 0, cross: 0, crossSide: "CALM" as const } : null,
      note: "CALM",
    };
  }

  const calc = (spd: number) => {
    if (wind.dirDeg === null) {
      return { head: 0, cross: spd, crossSide: "VRB" as const };
    }
    const diff = angleDiff(wind.dirDeg, rwyMag);
    const rad = (diff * Math.PI) / 180;
    const head = spd * Math.cos(rad); // + headwind / - tailwind
    const crossSigned = spd * Math.sin(rad); // + from right / - from left
    const cross = Math.abs(crossSigned);

    const crossSide =
      cross < 0.5 ? "NEARLY CALM" : crossSigned > 0 ? "FROM RIGHT" : "FROM LEFT";

    return {
      head: safeRound(head),
      cross: safeRound(cross),
      crossSide: crossSide as "FROM RIGHT" | "FROM LEFT" | "NEARLY CALM",
    };
  };

  const steady = calc(wind.spdKt);
  const gust = wind.gustKt ? calc(wind.gustKt) : null;

  return { steady, gust, note: wind.dirDeg === null ? "VRB" : "" };
}

/* ===========================
   TAF parsing (simple but robust enough)
=========================== */

function parseTafGroups(tafRaw?: string): TafGroup[] {
  if (!tafRaw) return [];

  const raw = tafRaw.replace(/\s+/g, " ").trim();
  const up = raw.toUpperCase();

  // remove leading "TAF" if present
  const tokens = up.split(" ").filter(Boolean);
  if (tokens.length < 3) return [];

  // Try to skip header: TAF ICAO ISSUE VALID...
  let idx = 0;
  if (tokens[idx] === "TAF") idx++;
  const icao = tokens[idx] || "";
  idx++;

  // issue time: 0105Z etc (optional)
  if (tokens[idx] && /^\d{6}Z$/.test(tokens[idx])) idx++;

  // validity: 0106/0212 (optional)
  const validityToken = tokens[idx] && /^\d{4}\/\d{4}$/.test(tokens[idx]) ? tokens[idx] : null;
  if (validityToken) idx++;

  const groups: { kind: TafGroup["kind"]; rangeToken?: string; startToken?: string; rawTokens: string[] }[] = [];

  // BASE group initial
  groups.push({ kind: "BASE", rangeToken: validityToken ?? undefined, rawTokens: [] });

  // parse remaining tokens, splitting at TEMPO/BECMG/FM
  while (idx < tokens.length) {
    const t = tokens[idx];

    if (t === "TEMPO" && tokens[idx + 1] && /^\d{4}\/\d{4}$/.test(tokens[idx + 1])) {
      const rangeToken = tokens[idx + 1];
      groups.push({ kind: "TEMPO", rangeToken, rawTokens: [] });
      idx += 2;
      continue;
    }

    if (t === "BECMG" && tokens[idx + 1] && /^\d{4}\/\d{4}$/.test(tokens[idx + 1])) {
      const rangeToken = tokens[idx + 1];
      groups.push({ kind: "BECMG", rangeToken, rawTokens: [] });
      idx += 2;
      continue;
    }

    const fm = t.match(/^FM(\d{6})$/); // FMddhhmm
    if (fm) {
      groups.push({ kind: "FM", startToken: fm[1], rawTokens: [] });
      idx += 1;
      continue;
    }

    // otherwise append token to last group
    groups[groups.length - 1].rawTokens.push(t);
    idx += 1;
  }

  // helper to compute range display
  const toZ = (ddhh?: string) => (ddhh ? `${ddhh.slice(2, 4)}${ddhh.slice(4, 6)}Z` : "");
  const ddhhToZ = (ddhh: string) => `${ddhh.slice(2, 4)}${ddhh.slice(4, 6)}Z`;
  const rangeFromToken = (rangeToken?: string) => {
    if (!rangeToken) return "—";
    const [a, b] = rangeToken.split("/");
    if (!a || !b) return "—";
    return `${ddhhToZ(a)} → ${ddhhToZ(b)}`;
  };

  const groupsOut: TafGroup[] = groups.map((g) => {
    const rawText = g.rawTokens.join(" ").trim() || "—";
    let range = "—";
    if (g.kind === "FM") {
      // FMddhhmm => show start only
      const st = g.startToken || "";
      range = st ? `${st.slice(2, 4)}${st.slice(4, 6)}Z →` : "—";
    } else {
      range = rangeFromToken(g.rangeToken);
    }

    // flight rule heuristic from group raw
    const fr = classifyFlightRuleFromText(rawText);

    return { kind: g.kind, range, raw: rawText, flightRule: fr };
  });

  return groupsOut;
}

function classifyFlightRuleFromText(text: string): TafGroup["flightRule"] {
  const up = (text || "").toUpperCase();

  // parse vis: 9999 / 8000 / 1500 ... OR 10SM / P6SM
  let visSm: number | null = null;
  let visM: number | null = null;

  const mTok = up.split(" ").filter(Boolean);

  const vM = mTok.find((t) => /^\d{4}$/.test(t));
  if (vM) visM = Number(vM);

  const vP = mTok.find((t) => /^P\d+SM$/.test(t));
  if (vP) visSm = Number(vP.slice(1, -2));

  const vS = mTok.find((t) => /^\d+SM$/.test(t));
  if (vS) visSm = Number(vS.slice(0, -2));

  // ceiling from BKN/OVC/VV
  let ceilFt: number | null = null;
  for (const t of mTok) {
    if (/^(BKN|OVC|VV)\d{3}$/.test(t)) {
      const ft = Number(t.slice(3)) * 100;
      if (!isNaN(ft)) ceilFt = ceilFt === null ? ft : Math.min(ceilFt, ft);
    }
  }

  // convert meters to sm rough (1sm=1609m)
  const visSmFromM = visM !== null ? visM / 1609 : null;
  const v = visSm ?? visSmFromM;

  if (v === null && ceilFt === null) return "UNK";

  // LIFR: ceil <500 or vis <1
  if ((ceilFt !== null && ceilFt < 500) || (v !== null && v < 1)) return "LIFR";
  // IFR: ceil <1000 or vis <3
  if ((ceilFt !== null && ceilFt < 1000) || (v !== null && v < 3)) return "IFR";
  // MVFR: ceil <3000 or vis <5
  if ((ceilFt !== null && ceilFt < 3000) || (v !== null && v < 5)) return "MVFR";
  return "VFR";
}

/* ===========================
   UI helpers
=========================== */

function levelRank(l: WxLevel) {
  return l === "RED" ? 3 : l === "AMBER" ? 2 : 1;
}

function maxLevel(a: WxLevel, b: WxLevel): WxLevel {
  return levelRank(a) >= levelRank(b) ? a : b;
}

function levelPillStyle(level: WxLevel): React.CSSProperties {
  if (level === "RED") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 14px",
      borderRadius: 999,
      background: "#ffe5e5",
      border: "1px solid #e55353",
      color: "#8b1f1f",
      fontWeight: 700,
    };
  }
  if (level === "AMBER") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "10px 14px",
      borderRadius: 999,
      background: "#fff4e5",
      border: "1px solid #f0a500",
      color: "#7a4a00",
      fontWeight: 700,
    };
  }
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    borderRadius: 999,
    background: "#e7f7ef",
    border: "1px solid #2ecc71",
    color: "#0b5c2d",
    fontWeight: 700,
  };
}

function rwyCardStyle(level: WxLevel): React.CSSProperties {
  if (level === "RED") return { background: "#ffe5e5", border: "2px solid #e55353" };
  if (level === "AMBER") return { background: "#fff4e5", border: "2px solid #f0a500" };
  return { background: "#e7f7ef", border: "2px solid #2ecc71" };
}

function tagStyle(kind: TafGroup["kind"]): React.CSSProperties {
  if (kind === "TEMPO") return { background: "#fff4e5", border: "1px solid #f0a500", color: "#7a4a00" };
  if (kind === "BECMG") return { background: "#e7f7ef", border: "1px solid #2ecc71", color: "#0b5c2d" };
  if (kind === "FM") return { background: "#eaf2ff", border: "1px solid #4c7dff", color: "#1f3b7a" };
  return { background: "#f1f3f5", border: "1px solid #cfd4da", color: "#333" };
}

function frPill(fr: TafGroup["flightRule"]) {
  const base: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 999,
    fontWeight: 700,
    fontSize: 12,
    border: "1px solid #ddd",
    background: "#fff",
  };

  if (fr === "VFR") return <span style={{ ...base, borderColor: "#2ecc71" }}>VFR</span>;
  if (fr === "MVFR") return <span style={{ ...base, borderColor: "#f0a500" }}>MVFR</span>;
  if (fr === "IFR") return <span style={{ ...base, borderColor: "#e55353" }}>IFR</span>;
  if (fr === "LIFR") return <span style={{ ...base, borderColor: "#7d2ae8" }}>LIFR</span>;
  return <span style={{ ...base, borderColor: "#999" }}>UNK</span>;
}

/* ===========================
   Page
=========================== */

export default function Page() {
  const [icao, setIcao] = useState<string>("RJCC");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<WxResp | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  // Crosswind limits (user input)
  const [limitSteady, setLimitSteady] = useState<number>(30);
  const [limitGust, setLimitGust] = useState<number>(35);

  async function getWeather() {
    const key = normIcao(icao);
    if (!key) return;

    setLoading(true);
    setData(null);

    try {
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(key)}`, {
        method: "GET",
        headers: { "content-type": "application/json" },
      });

      const json = (await res.json()) as WxResp;
      setData(json);
    } catch (e: any) {
      setData({ status: "NG", error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  const icaoKey = useMemo(() => normIcao(icao), [icao]);

  const rwyList: RwyEntry[] = useMemo(() => {
    return RWY_DB[icaoKey]?.runways ?? [];
  }, [icaoKey]);

  // --- METAR RAW / fields (fallback) ---
  const metarRaw = data?.metar?.raw || "";
  const tafRaw = data?.taf?.raw || "";

  const metarWindParsed = useMemo(() => {
    // prefer API metar.wind else parse from raw
    const apiWind = data?.metar?.wind?.toUpperCase();
    if (apiWind && /^(VRB|\d{3})\d{2,3}(G\d{2,3})?KT$/.test(apiWind)) {
      return parseMetarWindFromRaw(`METAR XXXX 000000Z ${apiWind} 9999 SKC Q1013`); // hack: reuse parser
    }
    return parseMetarWindFromRaw(metarRaw);
  }, [data, metarRaw]);

  const metarVis = useMemo(() => {
    return data?.metar?.visibility || parseVisibilityFromRaw(metarRaw) || "";
  }, [data, metarRaw]);

  const metarQnh = useMemo(() => {
    const q = data?.metar?.qnh;
    if (q) return q;
    return parseQnhFromRaw(metarRaw) || "";
  }, [data, metarRaw]);

  const metarClouds = useMemo(() => {
    const c = data?.metar?.clouds;
    if (c && c.length > 0) return c;
    return parseCloudsFromRaw(metarRaw);
  }, [data, metarRaw]);

  const metarWx = useMemo(() => {
    return data?.metar?.wx || parseWxPhenomenaFromRaw(metarRaw) || "";
  }, [data, metarRaw]);

  const ceilingFt = useMemo(() => getCeilingFt(metarClouds), [metarClouds]);

  // --- TAF Timeline ---
  const tafGroups = useMemo(() => parseTafGroups(tafRaw), [tafRaw]);

  // --- Crosswind per RWY ---
  const crosswindRows = useMemo(() => {
    if (!metarWindParsed) return [];

    return rwyList.map((rwy) => {
      const comp = computeWindComponents(metarWindParsed, rwy.magDeg);

      const steadyCross = comp.steady.cross;
      const gustCross = comp.gust ? comp.gust.cross : null;

      let level: WxLevel = "GREEN";
      const reasons: string[] = [];

      if (metarWindParsed.dirDeg === null) {
        // VRB: cannot compute exact direction-based per RWY
        // Use conservative: cross = speed (steady/gust). Treat as AMBER by default, RED if exceeds gust limit.
        level = "AMBER";
        reasons.push("VRB wind (direction unknown)");

        if (gustCross !== null && gustCross > limitGust) {
          level = "RED";
          reasons.push(`Gust ${gustCross}kt > limit ${limitGust}kt`);
        } else if (steadyCross > limitSteady) {
          level = maxLevel(level, "AMBER");
          reasons.push(`Steady ${steadyCross}kt > limit ${limitSteady}kt`);
        }
      } else {
        if (gustCross !== null && gustCross > limitGust) {
          level = "RED";
          reasons.push(`Gust crosswind ${gustCross}kt > limit ${limitGust}kt`);
        } else if (steadyCross > limitSteady) {
          level = "AMBER";
          reasons.push(`Crosswind ${steadyCross}kt > limit ${limitSteady}kt`);
        }
      }

      return {
        rwy: rwy.id,
        mag: rwy.magDeg,
        steady: steadyCross,
        gust: gustCross,
        head: comp.steady.head,
        crossSide: comp.steady.crossSide,
        level,
        reason: reasons.length ? reasons.join(" / ") : "Within limits",
      };
    });
  }, [metarWindParsed, rwyList, limitSteady, limitGust]);

  const crosswindWorstLevel: WxLevel = useMemo(() => {
    let worst: WxLevel = "GREEN";
    for (const r of crosswindRows) worst = maxLevel(worst, r.level);
    return worst;
  }, [crosswindRows]);

  // --- Overall WX LEVEL ---
  const overall = useMemo(() => {
    const serverLevel: WxLevel = data?.wx_analysis?.level || "GREEN";
    let level: WxLevel = serverLevel;
    const reasons: string[] = [...(data?.wx_analysis?.reasons || [])];

    // Ceiling present only when < 3000ft
    if (ceilingFt !== null && ceilingFt < 3000) {
      level = maxLevel(level, "AMBER");
      // 「Ceiling present」は3000ft未満のときだけ出す
      reasons.push(`Ceiling present (<3000ft): ${ceilingFt}ft`);
    }

    // Crosswind affects overall
    level = maxLevel(level, crosswindWorstLevel);

    if (crosswindWorstLevel === "RED") reasons.push("Crosswind limit exceeded (RED)");
    else if (crosswindWorstLevel === "AMBER") reasons.push("Crosswind caution (AMBER)");

    // normalize duplicates
    const uniq = Array.from(new Set(reasons.filter(Boolean)));

    return { level, reasons: uniq };
  }, [data, ceilingFt, crosswindWorstLevel]);

  const updatedUtc = data?.time || "";

  /* ===========================
     Render
  =========================== */

  return (
    <div style={{ background: "#f6f7f9", minHeight: "100vh", padding: 28 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            border: "1px solid #e5e7eb",
            padding: 22,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
          }}
        >
          <div>
            <div style={{ fontSize: 36, fontWeight: 800, marginBottom: 6 }}>ARI UI Test</div>
            <div style={{ color: "#666", fontSize: 14, marginBottom: 14 }}>
              ICAO入力 → METAR/TAF取得 → WX注意喚起（UI先行）
            </div>

            <div style={levelPillStyle(overall.level)}>
              <span>WX LEVEL: {overall.level}</span>
              <span style={{ fontWeight: 600, fontSize: 13 }}>
                {overall.level === "GREEN"
                  ? "通常運航可（監視継続）"
                  : overall.level === "AMBER"
                  ? "注意（条件確認・要監視）"
                  : "危険（運航判断要）"}
              </span>
            </div>
          </div>

          <div style={{ color: "#888", fontSize: 13, marginTop: 8 }}>
            Sources: {(data?.sources && data.sources.join(", ")) || "metar, taf, aviationweather.gov"}
          </div>
        </div>

        {/* ICAO input */}
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            border: "1px solid #e5e7eb",
            padding: 18,
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: "#444", fontWeight: 700, marginBottom: 6 }}>ICAO</div>
            <input
              value={icao}
              onChange={(e) => setIcao(e.target.value)}
              placeholder="例: RJTT / RJAA / KJFK / PHNL"
              style={{
                width: "100%",
                padding: "12px 12px",
                border: "1px solid #d1d5db",
                borderRadius: 12,
                fontSize: 16,
                outline: "none",
              }}
            />
            <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>例: RJTT / RJAA / KJFK</div>
          </div>

          <button
            onClick={getWeather}
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 800,
              cursor: "pointer",
              minWidth: 130,
            }}
          >
            {loading ? "Loading..." : "Get Weather"}
          </button>

          <button
            onClick={() => setShowRaw((v) => !v)}
            style={{
              padding: "12px 18px",
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#111",
              fontWeight: 800,
              cursor: "pointer",
              minWidth: 120,
            }}
          >
            Show Raw
          </button>
        </div>

        {/* Main grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 18,
            marginTop: 18,
            alignItems: "start",
          }}
        >
          {/* Key Summary */}
          <div
            style={{
              background: "#fff",
              borderRadius: 18,
              border: "1px solid #e5e7eb",
              padding: 18,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>Key Summary</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={miniCard()}>
                <div style={miniLabel()}>Station</div>
                <div style={miniValue()}>{icaoKey || "—"}</div>
              </div>

              <div style={miniCard()}>
                <div style={miniLabel()}>Wind</div>
                <div style={miniValue()}>
                  {(() => {
                    if (!metarWindParsed) return "—";
                    const dir = metarWindParsed.dirDeg === null ? "VRB" : String(metarWindParsed.dirDeg).padStart(3, "0");
                    const spd = String(metarWindParsed.spdKt).padStart(2, "0");
                    const gst = metarWindParsed.gustKt ? `G${String(metarWindParsed.gustKt).padStart(2, "0")}` : "";
                    return `${dir}${spd}${gst}KT`;
                  })()}
                </div>
              </div>

              <div style={miniCard()}>
                <div style={miniLabel()}>Visibility</div>
                <div style={miniValue()}>{metarVis || "—"}</div>
              </div>

              <div style={miniCard()}>
                <div style={miniLabel()}>QNH</div>
                <div style={miniValue()}>{metarQnh || "—"}</div>
              </div>
            </div>

            <div style={{ ...bigCard(), marginTop: 12 }}>
              <div style={miniLabel()}>Clouds</div>
              <div style={{ ...miniValue(), fontSize: 14, lineHeight: 1.35 }}>
                {metarClouds && metarClouds.length ? metarClouds.join(", ") : "—"}
              </div>
              <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
                Ceiling:{" "}
                {ceilingFt === null ? "—" : `${ceilingFt} ft`}{" "}
                {ceilingFt !== null && ceilingFt < 3000 ? "(<3000ft)" : ""}
              </div>
            </div>

            <div style={{ ...bigCard(), marginTop: 12 }}>
              <div style={miniLabel()}>WX (METAR)</div>
              <div style={{ ...miniValue(), fontSize: 14 }}>
                {metarWx ? metarWx : "—"}
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#777", marginTop: 10 }}>
              Updated (UTC): {updatedUtc ? new Date(updatedUtc).toISOString() : "—"}
            </div>
          </div>

          {/* METAR/TAF */}
          <div
            style={{
              background: "#fff",
              borderRadius: 18,
              border: "1px solid #e5e7eb",
              padding: 18,
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>METAR / TAF</div>
            <div style={{ color: "#777", fontSize: 12, marginBottom: 12 }}>原文はカード表示（折返し対応）</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={rawBox()}>
                <div style={miniLabel()}>METAR RAW</div>
                <div style={rawText()}>{metarRaw || "—"}</div>
              </div>

              <div style={rawBox()}>
                <div style={miniLabel()}>TAF RAW</div>
                <div style={rawText()}>{tafRaw || "—"}</div>
              </div>
            </div>

            <div style={{ borderTop: "1px solid #eee", marginTop: 14, paddingTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
                判定理由（reasons） / {overall.level}
              </div>
              {overall.reasons.length ? (
                <ul style={{ margin: 0, paddingLeft: 18, color: "#333" }}>
                  {overall.reasons.map((r, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      {r}
                    </li>
                  ))}
                </ul>
              ) : (
                <div style={{ color: "#777", fontSize: 13 }}>まだ理由がありません（解析ロジックは次フェーズで追加します）。</div>
              )}
            </div>

            {data?.status === "NG" && (
              <div style={{ marginTop: 12, color: "#b00020", fontWeight: 800 }}>
                Error: {data?.error || "unknown"}
              </div>
            )}

            {showRaw && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>RAW JSON</div>
                <pre
                  style={{
                    background: "#0b1020",
                    color: "#e6edf3",
                    padding: 12,
                    borderRadius: 12,
                    overflowX: "auto",
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>

        {/* TAF Timeline */}
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            border: "1px solid #e5e7eb",
            padding: 18,
            marginTop: 18,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900 }}>TAF Timeline（時系列）</div>
          <div style={{ color: "#777", fontSize: 12, marginTop: 4 }}>
            Validity / TEMPO / BECMG を視覚化（UI確認用）
          </div>

          {tafGroups.length === 0 ? (
            <div style={{ marginTop: 14, color: "#777" }}>—</div>
          ) : (
            <>
              {/* top tags */}
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 10,
                  marginTop: 14,
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                  {tafGroups.map((g, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        minWidth: 180,
                        ...tagStyle(g.kind),
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span>{g.kind}</span>
                        {frPill(g.flightRule)}
                      </div>
                      <div style={{ fontSize: 12, marginTop: 6, opacity: 0.9 }}>{g.range}</div>
                    </div>
                  ))}
                </div>

                {/* legend */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {frPill("VFR")}
                  {frPill("MVFR")}
                  {frPill("IFR")}
                  {frPill("LIFR")}
                  {frPill("UNK")}
                </div>
              </div>

              {/* groups detail */}
              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                {tafGroups.map((g, i) => (
                  <div
                    key={i}
                    style={{
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      padding: 14,
                      background: "#fff",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                        <span style={{ ...tagStyle(g.kind), padding: "6px 10px", borderRadius: 999, fontWeight: 900, fontSize: 12 }}>
                          {g.kind}
                        </span>
                        <span style={{ color: "#555", fontSize: 12 }}>{g.range}</span>
                      </div>

                      {frPill(g.flightRule)}
                    </div>

                    <div style={{ marginTop: 10, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace", fontSize: 12, color: "#111", whiteSpace: "pre-wrap" }}>
                      {g.kind === "BASE" ? "—\n" : ""}
                      {g.kind !== "BASE" ? `${g.kind} ` : ""}
                      {g.raw}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Crosswind */}
        <div
          style={{
            background: "#fff",
            borderRadius: 18,
            border: "1px solid #e5e7eb",
            padding: 18,
            marginTop: 18,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900 }}>Crosswind（RWY別）</div>
              <div style={{ color: "#777", fontSize: 12, marginTop: 4 }}>
                ✔ Crosswind limit 超過で AMBER / RED 自動判定　✔ RWYごと 色付き表示
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={inputPill()}>
                <span style={{ fontSize: 12, color: "#444", fontWeight: 800 }}>Steady limit</span>
                <input
                  type="number"
                  value={limitSteady}
                  onChange={(e) => setLimitSteady(Number(e.target.value))}
                  style={numInput()}
                />
                <span style={{ fontSize: 12, color: "#777" }}>kt</span>
              </div>

              <div style={inputPill()}>
                <span style={{ fontSize: 12, color: "#444", fontWeight: 800 }}>Gust limit</span>
                <input
                  type="number"
                  value={limitGust}
                  onChange={(e) => setLimitGust(Number(e.target.value))}
                  style={numInput()}
                />
                <span style={{ fontSize: 12, color: "#777" }}>kt</span>
              </div>
            </div>
          </div>

          {rwyList.length === 0 ? (
            <div style={{ marginTop: 14, color: "#777" }}>
              RWY DBに未登録です（{icaoKey}）。RWY_DBに追加してください。
            </div>
          ) : !metarWindParsed ? (
            <div style={{ marginTop: 14, color: "#777" }}>
              風情報がありません（METAR未取得 or 解析不可）。
            </div>
          ) : (
            <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
              {crosswindRows.map((r) => (
                <div
                  key={r.rwy}
                  style={{
                    borderRadius: 16,
                    padding: 14,
                    ...rwyCardStyle(r.level),
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>
                      RWY {r.rwy} <span style={{ fontSize: 12, fontWeight: 700, color: "#555" }}>({r.mag}°)</span>
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 12 }}>{r.level}</div>
                  </div>

                  <div style={{ marginTop: 10, fontSize: 13, color: "#111" }}>
                    <div>
                      Crosswind: <b>{r.steady} kt</b>{" "}
                      <span style={{ color: "#555", fontSize: 12 }}>({r.crossSide})</span>
                    </div>

                    {r.gust !== null && (
                      <div style={{ marginTop: 4 }}>
                        Gust Crosswind: <b>{r.gust} kt</b>
                      </div>
                    )}

                    <div style={{ marginTop: 4, color: "#555", fontSize: 12 }}>
                      Head/Tail: {r.head} kt
                    </div>

                    <div style={{ marginTop: 8, color: "#333", fontSize: 12 }}>
                      {r.reason}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ color: "#777", fontSize: 12, marginTop: 14 }}>
          ※ 次フェーズで「Alternate minima / TS/CB即RED / Tailwind / Runway auto-sort / Company preset」など追加可能。
        </div>
      </div>
    </div>
  );
}

/* ===========================
   Small UI helpers
=========================== */

function miniCard(): React.CSSProperties {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 12,
    background: "#fafafa",
  };
}
function bigCard(): React.CSSProperties {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 12,
    background: "#fafafa",
  };
}
function miniLabel(): React.CSSProperties {
  return { fontSize: 12, color: "#666", fontWeight: 800, marginBottom: 6 };
}
function miniValue(): React.CSSProperties {
  return { fontSize: 18, fontWeight: 900, color: "#111" };
}
function rawBox(): React.CSSProperties {
  return {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 12,
    background: "#fafafa",
    minHeight: 120,
  };
}
function rawText(): React.CSSProperties {
  return {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    color: "#111",
    whiteSpace: "pre-wrap",
    lineHeight: 1.35,
    marginTop: 6,
  };
}
function inputPill(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 12px",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    background: "#fafafa",
  };
}
function numInput(): React.CSSProperties {
  return {
    width: 70,
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 10,
    fontSize: 14,
    fontWeight: 800,
    outline: "none",
    background: "#fff",
  };
}
