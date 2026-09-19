export const PLATFORMS = ["ctrip", "meituan", "fliggy", "tongcheng"] as const;
export type Platform = (typeof PLATFORMS)[number];

export type TaskStatus = "queued" | "leased" | "retry_wait" | "completed" | "failed";
export type AttemptStatus = "created" | "active" | "accepted" | "partial" | "failed" | "expired";

export interface BatchInput {
  city: string;
  keyword: string | null;
  platforms: Platform[];
  day_offsets: number[];
  target_hotels: number;
}

export interface TaskView {
  id: string;
  batch_id: string;
  market_id: string;
  platform: Platform;
  check_in: string;
  check_out: string;
  target_hotels: number;
  priority: number;
  sequence: number;
  status: TaskStatus;
  attempt_count: number;
  next_eligible_at: string | null;
}

export interface BatchView {
  id: string;
  market_id: string;
  city: string;
  keyword: string | null;
  timezone: string;
  platforms: Platform[];
  day_offsets: number[];
  target_hotels: number;
  execution_mode: "immediate";
  status: string;
  created_at: string;
}

export interface ClaimView {
  task_id: string;
  attempt_id: string;
  attempt_number: number;
  lease_expires_at: string;
  market_id: string;
  city: string;
  keyword: string | null;
  timezone: string;
  platform: Platform;
  check_in: string;
  check_out: string;
  target_hotels: number;
}

export interface ProgressInput {
  attempt_id: string;
  stage: string;
  progress_current: number;
  progress_target: number;
}

export const FAILURE_CODES = [
  "NAVIGATION_FAILED",
  "CONTEXT_MISMATCH",
  "WRONG_PAGE_TYPE",
  "ADAPTER_ERROR",
  "TIMEOUT",
] as const;

export type FailureCode = (typeof FAILURE_CODES)[number];
