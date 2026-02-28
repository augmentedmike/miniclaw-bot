export type KBCategory = "personality" | "fact" | "procedure" | "general";

export type KBOrigin = "scholastic" | "human" | "observed" | "read" | "inferred" | "imported";

export type KBVolatility = "stable" | "temporal" | "versioned";

export type KBEntry = {
  id: string;
  category: KBCategory;
  content: string;
  metadata: Record<string, string>;
  tags: string[];
  source: string;
  origin: KBOrigin;
  confidence: number;
  volatility: KBVolatility;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type KBSearchResult = {
  entry: KBEntry;
  score: number;
  method: "vector" | "keyword" | "hybrid";
};

export type KBSearchOptions = {
  category?: KBCategory;
  origin?: KBOrigin;
  limit?: number;
  method?: "vector" | "keyword" | "hybrid";
  threshold?: number;
  /** When true, apply origin/confidence/freshness weighting to final scores (default: true). */
  ranked?: boolean;
};

export type KBStats = {
  total: number;
  byCategory: Record<KBCategory, number>;
  byOrigin: Record<KBOrigin, number>;
  dbSizeBytes: number;
};

/**
 * Origin trust weights — higher means more trusted.
 * Used as a multiplier on search scores.
 */
export const ORIGIN_WEIGHTS: Record<KBOrigin, number> = {
  scholastic: 1.0,
  human: 0.9,
  observed: 0.7,
  read: 0.6,
  inferred: 0.5,
  imported: 0.4,
};
