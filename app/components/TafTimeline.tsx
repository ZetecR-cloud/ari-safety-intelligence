// app/components/TafTimeline.tsx
"use client";

type TafBlock = {
  type: string;
  from?: string;
  to?: string;
  risk?: "GREEN" | "AMBER" | "RED";
  text?: string;
};

function riskColor(r?: string) {
  if (r === "RED") return "#ef4444";
  if (r === "AMBER") return "#f59e0b";
  return "#16a34a";
}

function zToHour(z?: string) {
  if (!z) return null;
  return z.slice(8, 10) + "Z";
}

export default function TafTimeline({
  blocks,
  nowZ,
}: {
  blocks: TafBlock[];
  nowZ: string;
}) {
  if (!blocks?.length) return null;

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 900, marginBottom: 6 }}>
        TAF TIMELINE (UTC)
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${blocks.length}, 1fr)`,
          gap: 6,
        }}
      >
        {blocks.map((b, i) => (
          <div
            key={i}
            style={{
              border: `2px solid ${riskColor(b.risk)}`,
              borderRadius: 14,
              padding: 10,
              background: "rgba(2,6,23,0.45)",
            }}
          >
            <div
              style={{
                fontWeight: 900,
                color: riskColor(b.risk),
                fontSize: 13,
              }}
            >
              {b.type}
            </div>

            <div style={{ fontSize: 11, opacity: 0.7 }}>
              {zToHour(b.from)} – {zToHour(b.to)}
            </div>

            <div style={{ marginTop: 6, fontSize: 12 }}>
              {b.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
