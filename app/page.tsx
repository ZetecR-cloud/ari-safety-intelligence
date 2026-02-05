@'
"use client";

import React, { useState } from "react";
import TafTimeline from "../components/TafTimeline";

type ApiWeatherResp = {
  ok?: boolean;
  status?: "OK" | "NG";
  icao?: string;
  message?: string;

  metar?: { raw?: string };
  taf?: { raw?: string };

  tafRisk?: {
    hardRed?: boolean;
    softAmber?: boolean;
    reasons?: string[];
    blocks?: { type: string; text: string }[];
  };
};

export default function Page() {
  const [icao, setIcao] = useState("RJTT");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiWeatherResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onGetWeather() {
    const q = icao.trim().toUpperCase();
    if (!q) return;

    setLoading(true);
    setErr(null);
    setData(null);

    try {
      const r = await fetch(`/api/weather?icao=${encodeURIComponent(q)}`, { cache: "no-store" });

      if (!r.ok) {
        const t = await r.text().catch(() => "");
        throw new Error(`HTTP ${r.status} ${r.statusText} ${t}`.trim());
      }

      const j = (await r.json()) as ApiWeatherResp;
      setData(j);

      // API側が ok
