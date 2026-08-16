/**
 * Vietnamese labels for summary metric keys.
 *
 * Presentation only: the set of metrics a section actually carries is decided
 * by the backend contract, not here. An unknown key is humanised rather than
 * dropped, so a new metric shows up as data instead of disappearing.
 */
const METRIC_LABELS: Record<string, string> = {
  active_runs: "Đang chạy",
  cancelled_runs: "Đã huỷ",
  completed_runs: "Hoàn tất",
  failed_runs: "Thất bại",
  historical_data_state: "Historical data",
  historical_dataset_count: "Dataset lịch sử",
  latest_run_id: "Run gần nhất",
  latest_run_observed_at: "Quan sát lúc",
  latest_run_protocol: "Protocol",
  latest_run_status: "Trạng thái run",
  latest_run_strategy: "Strategy",
  queued_runs: "Hàng đợi",
  total_runs: "Tổng số run",
  current_phase_id: "Phase hiện tại (ID)",
  current_phase_name: "Phase hiện tại",
  roadmap_phase_count: "Số phase roadmap",
  tasks_backlog: "Backlog",
  tasks_done: "Done",
  tasks_in_progress: "In Progress",
  tasks_ready: "Ready",
  tasks_validating: "Validating",
  total_tasks: "Tổng task",
};

export function metricLabel(key: string): string {
  return METRIC_LABELS[key] ?? key.replace(/_/g, " ");
}

/**
 * Headline metrics per section, in reading order.
 *
 * A section whose feature id is not listed falls back to every scalar metric
 * it publishes, so the Command Center keeps working when the backend adds a
 * source without a frontend release.
 */
export const SECTION_HEADLINE_METRICS: Record<string, string[]> = {
  QUANTBT_RESEARCH: ["total_runs", "active_runs", "queued_runs", "completed_runs", "failed_runs"],
  PLANNING: [
    "total_tasks",
    "tasks_backlog",
    "tasks_ready",
    "tasks_in_progress",
    "tasks_validating",
    "tasks_done",
  ],
};

/**
 * Distribution rows per section: a labelled breakdown rendered as a bar.
 *
 * QuantBT deliberately uses the four terminal/queue counts rather than the 16
 * `runs_state_*` keys — a 16-segment bar of mostly zeros is noise, and the
 * per-stage counts belong to Run Progress where a run is actually in flight.
 */
export const SECTION_DISTRIBUTION_METRICS: Record<string, string[]> = {
  QUANTBT_RESEARCH: ["queued_runs", "active_runs", "completed_runs", "failed_runs", "cancelled_runs"],
  PLANNING: ["tasks_backlog", "tasks_ready", "tasks_in_progress", "tasks_validating", "tasks_done"],
};

/** Detail rows shown as a definition list under the distribution. */
export const SECTION_DETAIL_METRICS: Record<string, string[]> = {
  QUANTBT_RESEARCH: [
    "latest_run_id",
    "latest_run_status",
    "latest_run_protocol",
    "latest_run_strategy",
    "latest_run_observed_at",
    "historical_data_state",
    "historical_dataset_count",
  ],
  PLANNING: ["current_phase_name", "roadmap_phase_count"],
};

/** Priority item type -> Vietnamese label (FRONTEND_HANDOFF §5). */
export function priorityTypeLabel(type: string): string {
  switch (type) {
    case "RUN_FAILED":
      return "Run thất bại";
    case "HISTORICAL_DATA_UNAVAILABLE":
      return "Historical data không khả dụng";
    case "REGISTRY_BLOCKING_CONCERN":
      return "Blocking concern";
    default:
      return type;
  }
}
