// app/airports.ts
export type Runway = {
  id: string;        // "34L"
  magHdg: number;    // 340 (MAG)
};

export type Airport = {
  icao: string;
  iata: string;
  name: string;
  city: string;
  runways?: Runway[];
};

export const AIRPORTS: Airport[] = [
  {
    icao: "RJTT",
    iata: "HND",
    name: "Tokyo Haneda",
    city: "Tokyo",
    runways: [
      { id: "04", magHdg: 040 },
      { id: "22", magHdg: 220 },
      { id: "05", magHdg: 050 },
      { id: "23", magHdg: 230 },
      { id: "16L", magHdg: 160 },
      { id: "34R", magHdg: 340 },
      { id: "16R", magHdg: 160 },
      { id: "34L", magHdg: 340 },
    ],
  },
  {
    icao: "RJAA",
    iata: "NRT",
    name: "Narita International",
    city: "Narita",
    runways: [
      { id: "16R", magHdg: 160 },
      { id: "34L", magHdg: 340 },
      { id: "16L", magHdg: 160 },
      { id: "34R", magHdg: 340 },
    ],
  },
  // 既存の空港も必要に応じて runways を追加
];
