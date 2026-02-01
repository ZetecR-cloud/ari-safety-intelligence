"use client";

import { useState } from "react";

export default function UiTest() {
  const [icao, setIcao] = useState("RJTT");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    try {
      const res = await fetch(`/api/weather?icao=${encodeURIComponent(icao)}`, { cache: "no-store" });
      const json = await res.json();
      setData(json);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <div className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-semibold">ARI UI Test</h1>

        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <label className="text-xs font-medium text-zinc-600">ICAO</label>
          <div className="mt-2 flex gap-2">
            <input
              className="w-40 rounded-xl border border-zinc-300 px-3 py-2"
              value={icao}
              onChange={(e) => setIcao(e.target.value.toUpperCase())}
            />
            <button
              className="rounded-xl bg-zinc-900 px-4 py-2 text-white"
              onClick={go}
              disabled={loading}
            >
              {loading ? "Loading..." : "Get Weather"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
            <div className="text-xs font-semibold text-zinc-600">METAR</div>
            <div className="mt-2 rounded-xl bg-zinc-50 p-3 text-sm">
              {data?.metar?.raw ?? "—"}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
            <div className="text-xs font-semibold text-zinc-600">TAF</div>
            <div className="mt-2 rounded-xl bg-zinc-50 p-3 text-sm whitespace-pre-wrap break-words">
              {data?.taf ?? "—"}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <div className="text-xs font-semibold text-zinc-600">RAW JSON</div>
          <pre className="mt-2 max-h-[420px] overflow-auto rounded-xl bg-zinc-950 p-3 text-xs text-green-300">
            {JSON.stringify(data ?? {}, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
