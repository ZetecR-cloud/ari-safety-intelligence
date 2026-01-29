// app/airports.ts

export type Runway = {
  id: string;   // "34R" etc
  mag: number;  // magnetic heading
};

export type Airport = {
  icao: string;
  tz: string;       // IANA time zone, e.g. "Asia/Tokyo"
  runways: Runway[];
};

export const airports: Airport[] = [
  {
    icao: "RJTT",
    tz: "Asia/Tokyo",
    runways: [
      { id: "04", mag: 44 },
      { id: "16L", mag: 164 },
      { id: "16R", mag: 164 },
      { id: "22", mag: 224 },
      { id: "34L", mag: 344 },
      { id: "34R", mag: 344 },
    ],
  },

  // 例：いくつか追加（必要な分だけ増やしてOK）
  { icao: "ROAH", tz: "Asia/Tokyo", runways: [] },         // OKA
  { icao: "RCTP", tz: "Asia/Taipei", runways: [] },        // TPE
  { icao: "RJAA", tz: "Asia/Tokyo", runways: [] },         // NRT
  { icao: "VHHH", tz: "Asia/Hong_Kong", runways: [] },     // HKG
  { icao: "KJFK", tz: "America/New_York", runways: [] },   // DSTあり
  { icao: "KLAX", tz: "America/Los_Angeles", runways: [] },// DSTあり
];
