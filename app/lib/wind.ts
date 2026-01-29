export type Wind = { dir: number; spd: number; gust?: number | null };

function normDeg(x: number) {
  const v = x % 360;
  return v < 0 ? v + 360 : v;
}

function smallestAngle(a: number, b: number) {
  const d = Math.abs(normDeg(a) - normDeg(b));
  return d > 180 ? 360 - d : d;
}

function compAlongRunway(windDir: number, windSpd: number, rwyMag: number) {
  // + = headwind, - = tailwind
  const angle = smallestAngle(windDir, rwyMag) * Math.PI / 180;
  const along = Math.cos(angle) * windSpd;
  return Math.round(along);
}

function compCross(windDir: number, windSpd: number, rwyMag: number) {
  const angle = smallestAngle(windDir, rwyMag) * Math.PI / 180;
  const cross = Math.sin(angle) * windSpd;
  return Math.round(Math.abs(cross));
}

export function windComponents(w: Wind, rwyMag: number) {
  const headSteady = compAlongRunway(w.dir, w.spd, rwyMag);
  const tailSteady = headSteady < 0 ? Math.abs(headSteady) : 0;
  const crossSteady = compCross(w.dir, w.spd, rwyMag);

  const gust = w.gust ?? null;
  const headPeak = gust ? compAlongRunway(w.dir, gust, rwyMag) : null;
  const tailPeak = headPeak !== null && headPeak < 0 ? Math.abs(headPeak) : null;
  const crossPeak = gust ? compCross(w.dir, gust, rwyMag) : null;

  return {
    headSteady, tailSteady, crossSteady,
    headPeak, tailPeak, crossPeak,
  };
}
