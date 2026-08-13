/* Auto-generated seed data from legacy/portal.html — DO NOT EDIT. */
export interface SeedTask {
  id: string;
  title: string;
  workstream: string;
  phase: string;
  weeks: string;
  priority: string;
  owner: string;
  status: string;
  [key: string]: unknown;
}
export interface SeedPhase {
  id: string;
  name: string;
  start: number;
  end: number;
  owner: string;
  tone: string;
  outcome: string;
  [key: string]: unknown;
}
export const BASE_TASKS_SEED: SeedTask[] = [
  {
    "id": "ACQ-001",
    "title": "Freeze repository SHAs, image digests and deployment manifests",
    "workstream": "Acquisition",
    "phase": "P0",
    "weeks": "W1",
    "priority": "P0",
    "owner": "Acquisition Lead",
    "status": "Ready",
    "depends": []
  },
  {
    "id": "SEC-001",
    "title": "Inventory and rotate exposed or inherited credentials",
    "workstream": "Security",
    "phase": "P0",
    "weeks": "W1",
    "priority": "P0",
    "owner": "Security",
    "status": "Ready",
    "depends": [
      "ACQ-001"
    ]
  },
  {
    "id": "DATA-001",
    "title": "Mirror historical storage and collector state read-only",
    "workstream": "Historical Data",
    "phase": "P0",
    "weeks": "W1",
    "priority": "P0",
    "owner": "Data Lead",
    "status": "Ready",
    "depends": [
      "ACQ-001"
    ]
  },
  {
    "id": "QBT-001",
    "title": "Reproduce QuantBT golden runs across vectorized, intrabar, event, portfolio and WFO",
    "workstream": "QuantBT",
    "phase": "P0",
    "weeks": "W1",
    "priority": "P0",
    "owner": "Quant Platform",
    "status": "Ready",
    "depends": [
      "DATA-001"
    ]
  },
  {
    "id": "ALPHA-001",
    "title": "Restore representative alpha runtime and model artifacts",
    "workstream": "Alpha Runtime",
    "phase": "P0",
    "weeks": "W1",
    "priority": "P0",
    "owner": "Research Lead",
    "status": "Backlog",
    "depends": [
      "DATA-001",
      "QBT-001"
    ]
  },
  {
    "id": "STREAM-001",
    "title": "Deploy real-time data layer in shadow and compare payload/freshness/reconnect",
    "workstream": "Streaming Data",
    "phase": "P0",
    "weeks": "W1",
    "priority": "P0",
    "owner": "Data Platform",
    "status": "Backlog",
    "depends": [
      "ACQ-001"
    ]
  },
  {
    "id": "TRD-001",
    "title": "Restore trading system non-production with live endpoints network-blocked",
    "workstream": "Trading System",
    "phase": "P0",
    "weeks": "W1",
    "priority": "P0",
    "owner": "Trading Lead",
    "status": "Backlog",
    "depends": [
      "SEC-001",
      "STREAM-001"
    ]
  },
  {
    "id": "MON-001",
    "title": "Restore heartbeat, lag, dead-letter and reconciliation visibility",
    "workstream": "Monitoring",
    "phase": "P0",
    "weeks": "W1",
    "priority": "P0",
    "owner": "SRE",
    "status": "Backlog",
    "depends": [
      "TRD-001"
    ]
  },
  {
    "id": "DATA-010",
    "title": "Cut over historical collectors one workload at a time",
    "workstream": "Historical Data",
    "phase": "P1",
    "weeks": "W2–W3",
    "priority": "P0",
    "owner": "Data Lead",
    "status": "Backlog",
    "depends": [
      "DATA-001"
    ]
  },
  {
    "id": "QBT-010",
    "title": "Cut over quant/research environment and dependency locks",
    "workstream": "QuantBT",
    "phase": "P1",
    "weeks": "W2–W3",
    "priority": "P0",
    "owner": "Quant Platform",
    "status": "Backlog",
    "depends": [
      "QBT-001"
    ]
  },
  {
    "id": "STREAM-010",
    "title": "Cut over streaming gateway and existing consumers",
    "workstream": "Streaming Data",
    "phase": "P1",
    "weeks": "W3–W4",
    "priority": "P0",
    "owner": "Data Platform",
    "status": "Backlog",
    "depends": [
      "STREAM-001"
    ]
  },
  {
    "id": "TRD-010",
    "title": "Cut over paper execution before sandbox/live",
    "workstream": "Trading System",
    "phase": "P1",
    "weeks": "W3–W4",
    "priority": "P0",
    "owner": "Trading Lead",
    "status": "Backlog",
    "depends": [
      "TRD-001",
      "MON-001"
    ]
  },
  {
    "id": "OPS-010",
    "title": "Publish current-state runbooks, owner map and rollback commands",
    "workstream": "Operations",
    "phase": "P1",
    "weeks": "W2–W4",
    "priority": "P1",
    "owner": "SRE",
    "status": "Backlog",
    "depends": [
      "MON-001"
    ]
  },
  {
    "id": "DATA-020",
    "title": "Introduce HistoricalDatasetClient compatibility boundary",
    "workstream": "Historical Data",
    "phase": "P2",
    "weeks": "W5–W6",
    "priority": "P0",
    "owner": "Data Platform",
    "status": "Backlog",
    "depends": [
      "DATA-010"
    ]
  },
  {
    "id": "DATA-021",
    "title": "Build dataset catalog and immutable snapshot registry",
    "workstream": "Historical Data",
    "phase": "P2",
    "weeks": "W6–W9",
    "priority": "P0",
    "owner": "Data Platform",
    "status": "Backlog",
    "depends": [
      "DATA-020"
    ]
  },
  {
    "id": "DATA-022",
    "title": "Unify instrument master and versioned calendars",
    "workstream": "Historical Data",
    "phase": "P2",
    "weeks": "W6–W9",
    "priority": "P0",
    "owner": "Data + Trading",
    "status": "Backlog",
    "depends": [
      "DATA-020"
    ]
  },
  {
    "id": "ALPHA-020",
    "title": "Define alpha manifest, output contracts and registry",
    "workstream": "Alpha Runtime",
    "phase": "P2",
    "weeks": "W5–W8",
    "priority": "P0",
    "owner": "Research Platform",
    "status": "Backlog",
    "depends": [
      "ALPHA-001"
    ]
  },
  {
    "id": "QBT-020",
    "title": "Complete quantbt-engine 1.0.7 release gate and downstream pinning",
    "workstream": "QuantBT",
    "phase": "P2",
    "weeks": "W5–W7",
    "priority": "P0",
    "owner": "QuantBT Maintainer",
    "status": "Backlog",
    "depends": [
      "QBT-010"
    ]
  },
  {
    "id": "QBT-021",
    "title": "Define QuantBT worker API and immutable run manifest",
    "workstream": "QuantBT",
    "phase": "P2",
    "weeks": "W7–W9",
    "priority": "P0",
    "owner": "Quant Platform",
    "status": "Backlog",
    "depends": [
      "QBT-020",
      "DATA-021",
      "ALPHA-020"
    ]
  },
  {
    "id": "REPORT-020",
    "title": "Reproduce awesome-quant-interpretation golden report and hash artifacts",
    "workstream": "Stakeholder Reporting",
    "phase": "P2",
    "weeks": "W5–W7",
    "priority": "P1",
    "owner": "Reporting",
    "status": "Backlog",
    "depends": [
      "QBT-001"
    ]
  },
  {
    "id": "PORTAL-030",
    "title": "Build job queue, isolated QuantBT workers and run registry",
    "workstream": "Manager Platform",
    "phase": "P3",
    "weeks": "W8–W11",
    "priority": "P0",
    "owner": "Platform Backend",
    "status": "Backlog",
    "depends": [
      "QBT-021"
    ]
  },
  {
    "id": "PORTAL-031",
    "title": "Build Alpha Catalog and Backtest Wizard",
    "workstream": "Manager Platform",
    "phase": "P3",
    "weeks": "W10–W13",
    "priority": "P0",
    "owner": "Product + Frontend",
    "status": "Backlog",
    "depends": [
      "PORTAL-030",
      "ALPHA-020",
      "DATA-021"
    ]
  },
  {
    "id": "REPORT-030",
    "title": "Package interpretation engine as report-generation worker",
    "workstream": "Stakeholder Reporting",
    "phase": "P3",
    "weeks": "W9–W12",
    "priority": "P1",
    "owner": "Reporting",
    "status": "Backlog",
    "depends": [
      "REPORT-020",
      "PORTAL-030"
    ]
  },
  {
    "id": "PORTAL-032",
    "title": "Implement run comparison, WFO views and approval inbox",
    "workstream": "Manager Platform",
    "phase": "P3",
    "weeks": "W12–W14",
    "priority": "P0",
    "owner": "Product + Quant",
    "status": "Backlog",
    "depends": [
      "PORTAL-031",
      "REPORT-030"
    ]
  },
  {
    "id": "REPORT-031",
    "title": "Add backtest vs paper vs live divergence reports",
    "workstream": "Stakeholder Reporting",
    "phase": "P4",
    "weeks": "W13–W17",
    "priority": "P1",
    "owner": "Reporting + Trading",
    "status": "Backlog",
    "depends": [
      "REPORT-030",
      "TRD-010"
    ]
  },
  {
    "id": "MON-040",
    "title": "Build central health-state builder and rule engine",
    "workstream": "Monitoring",
    "phase": "P4",
    "weeks": "W12–W15",
    "priority": "P0",
    "owner": "SRE",
    "status": "Backlog",
    "depends": [
      "MON-001"
    ]
  },
  {
    "id": "MON-041",
    "title": "Implement incident lifecycle and policy-gated action executor",
    "workstream": "Monitoring",
    "phase": "P4",
    "weeks": "W14–W17",
    "priority": "P0",
    "owner": "SRE + Risk",
    "status": "Backlog",
    "depends": [
      "MON-040"
    ]
  },
  {
    "id": "PAPER-040",
    "title": "Upgrade paper fill model with depth/volume and latency scenarios",
    "workstream": "Trading System",
    "phase": "P4",
    "weeks": "W13–W18",
    "priority": "P1",
    "owner": "Trading Platform",
    "status": "Backlog",
    "depends": [
      "TRD-010"
    ]
  },
  {
    "id": "MON-042",
    "title": "Run game-day matrix: data stale, Redis/DB outage, crash, mismatch, portal outage",
    "workstream": "Monitoring",
    "phase": "P4",
    "weeks": "W16–W18",
    "priority": "P0",
    "owner": "SRE + Trading",
    "status": "Backlog",
    "depends": [
      "MON-041",
      "PAPER-040"
    ]
  },
  {
    "id": "LIVE-050",
    "title": "Create live adapter service catalog and evidence registry",
    "workstream": "Live Certification",
    "phase": "P5",
    "weeks": "W16–W18",
    "priority": "P0",
    "owner": "Trading Lead",
    "status": "Backlog",
    "depends": [
      "TRD-010"
    ]
  },
  {
    "id": "LIVE-051",
    "title": "Import Binance live account/canary/DR evidence",
    "workstream": "Live Certification",
    "phase": "P5",
    "weeks": "W17–W20",
    "priority": "P0",
    "owner": "Trading + Risk",
    "status": "Backlog",
    "depends": [
      "LIVE-050",
      "MON-042"
    ]
  },
  {
    "id": "LIVE-052",
    "title": "Import Bybit live adapter capability and reconciliation evidence",
    "workstream": "Live Certification",
    "phase": "P5",
    "weeks": "W17–W20",
    "priority": "P0",
    "owner": "Trading + Risk",
    "status": "Backlog",
    "depends": [
      "LIVE-050",
      "MON-042"
    ]
  },
  {
    "id": "LIVE-053",
    "title": "Document selected US broker live matrix: assets, sessions, margin, corporate actions, settlement",
    "workstream": "Live Certification",
    "phase": "P5",
    "weeks": "W17–W21",
    "priority": "P0",
    "owner": "Trading + Operations",
    "status": "Backlog",
    "depends": [
      "LIVE-050"
    ]
  },
  {
    "id": "LIVE-054",
    "title": "Document selected India broker live matrix: exchanges, RMS, lot/tick, margin, settlement",
    "workstream": "Live Certification",
    "phase": "P5",
    "weeks": "W17–W21",
    "priority": "P0",
    "owner": "Trading + Operations",
    "status": "Backlog",
    "depends": [
      "LIVE-050"
    ]
  },
  {
    "id": "LIVE-055",
    "title": "Run shadow-live and tiny canary per adapter/account",
    "workstream": "Live Certification",
    "phase": "P5",
    "weeks": "W20–W23",
    "priority": "P0",
    "owner": "Trading + Risk",
    "status": "Backlog",
    "depends": [
      "LIVE-051",
      "LIVE-052",
      "LIVE-053",
      "LIVE-054"
    ]
  },
  {
    "id": "LIVE-056",
    "title": "Approve staged capital scaling, rollback and post-deployment review",
    "workstream": "Live Certification",
    "phase": "P5",
    "weeks": "W22–W24",
    "priority": "P0",
    "owner": "Investment Committee",
    "status": "Backlog",
    "depends": [
      "LIVE-055"
    ]
  }
];
export const ROADMAP_PHASES_SEED: SeedPhase[] = [
  {
    "id": "P0",
    "name": "Acquire & Reproduce",
    "start": 1,
    "end": 1,
    "owner": "Acquisition Lead",
    "tone": "blue",
    "outcome": "Current system reproduced without redesign"
  },
  {
    "id": "P1",
    "name": "Current-Service Cutover",
    "start": 2,
    "end": 4,
    "owner": "Platform + Ops",
    "tone": "teal",
    "outcome": "New team owns stable current services"
  },
  {
    "id": "P2",
    "name": "Contracts & Reproducibility",
    "start": 5,
    "end": 9,
    "owner": "Data + Quant Platform",
    "tone": "purple",
    "outcome": "Dataset, alpha and run identities frozen"
  },
  {
    "id": "P3",
    "name": "Manager Backtest Platform",
    "start": 8,
    "end": 14,
    "owner": "Product + Quant Platform",
    "tone": "indigo",
    "outcome": "Non-tech backtest and approval workflow"
  },
  {
    "id": "P4",
    "name": "Monitoring & Paper Hardening",
    "start": 12,
    "end": 18,
    "owner": "Trading + SRE",
    "tone": "orange",
    "outcome": "Incident/action plane and robust paper observation"
  },
  {
    "id": "P5",
    "name": "Multi-Venue Live Certification",
    "start": 16,
    "end": 24,
    "owner": "Trading + Risk",
    "tone": "red",
    "outcome": "Venue evidence, shadow, canary and staged capital"
  }
];
