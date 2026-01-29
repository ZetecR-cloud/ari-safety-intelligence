// app/airports.ts
export type Airport = {
  icao: string;
  iata?: string;
  name: string;
  city: string;
};

export const AIRPORTS: Airport[] = [
  { icao: "RJTT", iata: "HND", name: "Tokyo Haneda", city: "Tokyo" },
  { icao: "RJAA", iata: "NRT", name: "Narita International", city: "Narita" },
  { icao: "RJBB", iata: "KIX", name: "Kansai International", city: "Osaka" },
  { icao: "RJOO", iata: "ITM", name: "Osaka Itami", city: "Osaka" },
  { icao: "RJCC", iata: "CTS", name: "New Chitose", city: "Sapporo" },
  { icao: "RJSS", iata: "SDJ", name: "Sendai", city: "Sendai" },
  { icao: "RJGG", iata: "NGO", name: "Chubu Centrair", city: "Nagoya" },
  { icao: "RJFF", iata: "FUK", name: "Fukuoka", city: "Fukuoka" },
  { icao: "ROAH", iata: "OKA", name: "Naha", city: "Okinawa" },
  { icao: "RJFM", iata: "KMI", name: "Miyazaki", city: "Miyazaki" },
  { icao: "RJFO", iata: "OIT", name: "Oita", city: "Oita" },
  { icao: "RJFK", iata: "KOJ", name: "Kagoshima", city: "Kagoshima" },
  { icao: "RJOM", iata: "MYJ", name: "Matsuyama", city: "Matsuyama" },
  { icao: "RJNS", iata: "FSZ", name: "Shizuoka", city: "Shizuoka" },
  { icao: "RJNK", iata: "KMQ", name: "Komatsu", city: "Ishikawa" },
  { icao: "RJNT", iata: "TOY", name: "Toyama", city: "Toyama" },
  // 台湾も少し
  { icao: "RCTP", iata: "TPE", name: "Taoyuan International", city: "Taoyuan" },
  { icao: "RCSS", iata: "TSA", name: "Taipei Songshan", city: "Taipei" },
  { icao: "RCKH", iata: "KHH", name: "Kaohsiung", city: "Kaohsiung" },
];
