export interface ParityRow { lens: "schema" | "state" | "decimal" | "completeness" | "value"; path: string; left: string; right: string }
export function compare(x: unknown, y: unknown, path?: string, out?: ParityRow[]): ParityRow[];
