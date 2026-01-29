"use client";

import React, { useEffect, useMemo, useState } from "react";
import TafTimeline from "./components/TafTimeline";

/* ===============================
   型定義
================================ */

type TafBlock = {
  type: string;
  from: string;
  to: string;
  text: string;
};

/* ===============================
   page.tsx
================================ */

export default function Home() {
  const [icao, setIcao] = useState("RJTT");

  /* UTC now（Z time） */
  const utcNow = useMemo(() => {
    return new Date().toISOString();
  }, []);

  /* =========================================
     🔧 UI確認用ダミー TAF blocks
     （必ずTimelineが表示される）
  ========================================= */

  const tafBlocks: TafBlock[] = [
    {
      type: "FM",
      from: "2026-01-29T12:00:00Z",
      to: "2026-01-29T18:00:00Z",
      text: "FM291200 34010KT 9999 FEW030",
    },
    {
      type: "TEMPO",
      from: "2026-01-29T15:00:00Z",
      to: "2026-01-29T17:00:00Z",
      text: "TEMPO 2915/2917 4000 -RA BKN020",
    },
    {
      type: "PROB30",
      from: "2026-01-29T18:00:00Z",
      to: "2026-01-29T22:00:00Z",
      text: "PROB30 2918/2922 TSRA",
    },
  ];

  /* ===============================
     UI
================================ */

  return (
    <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ fontSize: 32, fontWeight: 700 }}>
        ARI Safety Intelligence
      </h1>

      <p style={{ marginTop: 6, color: "#888" }}>
        ICAO入力 → METAR / TAF → WX解析（注意喚起レベル）
      </p>

      {/* ===============================
          ICAO INPUT
      ============================== */}

      <div style={{ marginTop: 24 }}>
        <label style={{ fontSize: 14, color: "#aaa" }}>
          ICAO
        </label>
        <br />
        <input
          value={icao}
          onChange={(e) => setIcao(e.target.value.toUpperCase())}
          style={{
            marginTop: 6,
            padding: "10px 14px",
            fontSize: 18,
            borderRadius: 8,
            border: "1px solid #444",
            width: 220,
            background: "#000",
            color: "#fff",
          }}
        />
      </div>

      {/* ===============================
          TAF TIMELINE
      ============================== */}

      <div style={{ marginTop: 40 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>
          TAF Timeline（UTC）
        </h2>

        <TafTimeline
          blocks={tafBlocks}
          nowZ={utcNow}
        />
      </div>

      {/* ===============================
          UTC INFO
      ============================== */}

      <div
        style={{
          marginTop: 30,
          fontSize: 13,
          color: "#888",
        }}
      >
        UTC now: {utcNow}
      </div>
    </main>
  );
}
