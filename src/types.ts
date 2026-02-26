export type BrewItemType = "brew" | "cask" | "mas" | "tap" | "unknown";

export type ItemStatus = "idle" | "loading" | "ready" | "error";

export interface BrewItem {
  id: string;
  type: BrewItemType;
  name: string;
  raw: string;
  meta: Record<string, unknown>;
  details?: unknown;
  sourceInfo?: string;
  sourceInfoError?: string;
  status: ItemStatus;
  error?: string;
  lineNumber: number;
}

export interface ParsedBrewfile {
  items: BrewItem[];
  errors: string[];
}

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface CommandExecutor {
  run(cmd: string, args: string[]): Promise<CommandResult>;
}
