"use client";

import React from "react";

type Props = { tafRaw: string | null | undefined };

export default function TafTimeline({ tafRaw }: Props) {
  const raw = (tafRaw ?? "").trim();
  return (
    <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 12 }}>
      <div style={{ fontWeight: 700 }}>TAF Timeline</div>
      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
        {raw ? "TAF loaded" : "TAFがありません。"}
      </div>
      {raw ? (
        <pre style={{ marginTop: 12, whiteSpace: "pre-wrap", fontSize: 12 }}>
{raw}
        </pre>
      ) : null}
    </div>
  );
}
