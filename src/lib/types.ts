export type VelocityFlag = "breaking" | "accelerating" | "fading" | "stable";

export interface Article {
  id:            string;
  title:         string;
  source:        string;
  url:           string;
  published_at:  string | null;
  x:             number;
  y:             number;
  thread_id:     number;
  velocity_flag: VelocityFlag;
}

export interface Thread {
  id:               number;
  label:            string;
  article_count:    number;
  velocity_flag:    VelocityFlag;
  divergence_score: number;
  n_outlets:        number;
  outlets:          string[];
  outlet_distances: Record<string, number>;
  article_ids:      string[];
}

export interface Snapshot {
  ts:       string;
  articles: Article[];
  threads:  Thread[];
}

export interface SnapshotIndex {
  model_version: number;
  latest:        string;
  snapshots:     string[];
}