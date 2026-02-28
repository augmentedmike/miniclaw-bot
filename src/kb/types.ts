export type KBCategory = "personality" | "fact" | "procedure" | "general";

export type KBEntry = {
  id: string;
  category: KBCategory;
  content: string;
  metadata: Record<string, string>;
  tags: string[];
  source: string;
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
  limit?: number;
  method?: "vector" | "keyword" | "hybrid";
  threshold?: number;
};

export type KBStats = {
  total: number;
  byCategory: Record<KBCategory, number>;
  dbSizeBytes: number;
};
