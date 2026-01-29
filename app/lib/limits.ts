export type RwySurface = "DRY" | "WET" | "CONTAM";
export type ApproachCat = "CATI" | "CATII" | "CATIII";

export type WindLimits = {
  maxTailwind: number;
  maxCrosswind: number;
  maxCrosswindGust?: number;
};

export const LIMITS = {
  normal: {
    DRY: { maxTailwind: 10, maxCrosswind: 35 },
    WET: { maxTailwind: 5, maxCrosswind: 25 },
    CONTAM: { maxTailwind: 0, maxCrosswind: 15 },
  },
  autoland: {
    CATII: {
      DRY: { maxTailwind: 10, maxCrosswind: 25 },
      WET: { maxTailwind: 5, maxCrosswind: 20 },
      CONTAM: { maxTailwind: 0, maxCrosswind: 15 },
    },
    CATIII: {
      DRY: { maxTailwind: 5, maxCrosswind: 20 },
      WET: { maxTailwind: 0, maxCrosswind: 15 },
      CONTAM: { maxTailwind: 0, maxCrosswind: 10 },
    },
  },
} as const;
