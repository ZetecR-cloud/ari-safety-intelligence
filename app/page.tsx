"use client";

import React, { useEffect, useState } from "react";
import TafTimeline from "@/components/TafTimeline";

type WxResp = {
  status: "OK" | "NG";
  icao?: string;
  metar?: { raw?: string };
  taf?: { raw?: string };
  message?: string;
};

export default function Page() {
  const [icao, setIcao] = useState("RJTT");
  const [data, setData] = useState<WxResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setErr(null);
    setData(null);

    fetch(`/api/wx?icao=${encodeURIComponent(icao)}`)
      .then(async (r) => {
        const j = (await r.json()) as WxResp;
        if (!alive) return;
        setData(j);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e?.message ?? e));
      });

    return () => {
      alive = false;
    };
  }, [icao]);

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="rounded-2xl border p-4 shadow-sm">
        <div className="text-lg font-semibold">ARI Safety Intelligence</div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="w-28 rounded-xl border px-3 py-2 text-sm"
            value={icao}
            onChange={(e) => setIcao(e.target.value.toUpperCase())}
            placeholder="RJTT"
          />
          <div className="text-xs opacity-70">/api/wx?icao=XXXX を叩いて TAF Timeline を描画</div>
        </div>

        {err ? <div className="mt-3 text-sm">Error: {err}</div> : null}

        <div className="mt-4 space-y-3">
          <div className="rounded-xl border p-3">
            <div className="text-sm font-semibold">METAR</div>
            <div className="mt-2 text-sm opacity-80">{data?.metar?.raw ?? "—"}</div>
          </div>

          <TafTimeline tafRaw={data?.taf?.raw ?? ""} />
        </div>

        <div className="mt-4 rounded-xl bg-black/5 p-3 text-xs">
          status: {data?.status ?? "—"} / message: {data?.message ?? "—"}
        </div>
      </div>
    </main>
  );
}
