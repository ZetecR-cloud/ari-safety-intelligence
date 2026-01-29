export type TafRisk = {
  hardRed: boolean;
  softAmber: boolean;
  reasons: string[];
  blocks: { type: string; text: string }[];
};

function pickBlocks(taf: string) {
  const t = taf.replace(/\s+/g, " ").trim();

  // ざっくり分割：FM / BECMG / TEMPO / PROB30/40
  const tokens = t.split(" ");
  const blocks: { type: string; text: string }[] = [];
  let curType = "BASE";
  let cur: string[] = [];

  const flush = () => {
    if (cur.length) blocks.push({ type: curType, text: cur.join(" ") });
    cur = [];
  };

  for (const tok of tokens) {
    if (/^(FM\d{6})$/.test(tok)) { flush(); curType = "FM"; cur.push(tok); continue; }
    if (tok === "BECMG") { flush(); curType = "BECMG"; cur.push(tok); continue; }
    if (tok === "TEMPO") { flush(); curType = "TEMPO"; cur.push(tok); continue; }
    if (/^PROB(30|40)$/.test(tok)) { flush(); curType = tok; cur.push(tok); continue; }
    cur.push(tok);
  }
  flush();
  return blocks;
}

function hasTSorCB(text: string) {
  return /\bTS\b/.test(text) || /\bTSRA\b/.test(text) || /\bCB\b/.test(text);
}

export function analyzeTafRisk(taf: string): TafRisk {
  const blocks = pickBlocks(taf);
  const reasons: string[] = [];

  // HARD RED: TEMPO内のTS/CB
  const tempo = blocks.filter(b => b.type === "TEMPO").map(b => b.text).join(" ");
  if (tempo && hasTSorCB(tempo)) {
    reasons.push("TAF TEMPO includes TS/CB");
    return { hardRed: true, softAmber: false, reasons, blocks };
  }

  // PROBxx TEMPO のTS/CB → AMBER（会社によりREDに切替可）
  const probTempo = blocks
    .filter(b => /^PROB(30|40)$/.test(b.type))
    .map(b => b.text)
    .join(" ");
  if (probTempo && hasTSorCB(probTempo) && /\bTEMPO\b/.test(probTempo)) {
    reasons.push("TAF PROB TEMPO includes TS/CB (risk)");
  }

  // FM/BECMGでTS/CBが出てくるならAMBER（先悪化）
  const trend = blocks.filter(b => b.type === "FM" || b.type === "BECMG").map(b => b.text).join(" ");
  if (trend && hasTSorCB(trend)) reasons.push("TAF trend (FM/BECMG) indicates TS/CB possibility");

  return {
    hardRed: false,
    softAmber: reasons.length > 0,
    reasons: reasons.length ? reasons : ["No critical TS/CB in TEMPO"],
    blocks
  };
}
