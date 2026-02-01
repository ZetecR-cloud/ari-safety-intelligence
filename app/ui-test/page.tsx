"use client";

import React, { useMemo, useState } from "react";
import TafTimeline from "../components/TafTimeline";

type WxAnalysis = {
  level?: string;
  reasons?: string[];
};

type MetarObj = {
  raw?: string;
  wind?: string;
  visibility?: string;
  qnh?: string;
  clouds?: string[];
};

type ApiResponse = {
  status?: string;
  icao?: string;
  sources?: string[];
  metar?: MetarObj;
  taf?: string;
  wx_analysis?: WxAnalysis;
  time?: string;
};

function safeUpper(s: any) {
  return String(s ?? "").toUpperCase().trim();
}

function joinClouds(clouds?: string[]) {
  if (!clouds || !Array.isArray(clouds) || clouds.length === 0) return "—";
  return clouds.join(", ");
}

/**
 * METARから「現象コード」だけ抽出（RA / SN / -SNRA / TS / SHRA など）
 */
function parseMetarWxTokens(metarRaw: string): string[] {
  const raw = (metarRaw ?? "").trim().toUpperCase().replace(/\s+/g, " ");
  if (!raw || raw === "—") return [];

  const tokens = raw.split(" ");

  // intensity/proximity: -, +, VC
  // descriptor: MI PR BC DR BL SH TS FZ
  // phenomena: DZ RA SN SG IC PL GR GS UP BR FG FU VA DU SA HZ PO SQ FC SS DS
  const wxRe =
    /^(?:\+|-|VC)?(?:MI|PR|BC|DR|BL|SH|TS|FZ)?(?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS){1,3}$/;

  const result: string[] = [];
  for (const t of tokens) {
    if (t === "RMK") break;

    // よくある非現象グループを除外
    if (t === "METAR" || t === "SPECI") continue;
    if (/^[A-Z]{4}$/.test(t)) continue; // ICAO
    if (/^\d{6}Z$/.test(t)) continue; // time
    if (/^\d{3}(?:\d{2,3})G?\d{2,3}KT$/.test(t)) continue; // wind
    if (/^(?:CAVOK|\d{4}|9999)$/.test(t)) continue; // vis
    if (/^(?:M?\d{2})\/(?:M?\d{2})$/.test(t)) continue; // temp/dew
    if (/^(?:Q|A)\d{4}$/.test(t)) continue; // QNH/Alt
    if (/^(?:FEW|SCT|BKN|OVC|VV)\d{3}/.test(t)) continue; // clouds

    if (wxRe.test(t)) result.push(t);
  }

  return Array.from(new Set(result)); // 重複除去（順序保持）
}

function levelUi(levelRaw?: string) {
  const lv = safeUpp
