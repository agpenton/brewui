import { resolve } from "node:path";
import { BrewService } from "./services/brewService.js";
import { ShellCommandRunner } from "./services/commandRunner.js";
import { BrewTuiApp } from "./tui/app.js";

async function main(): Promise<void> {
  normalizeTerminalEnv();
  const { brewfilePath, debug } = parseArgs(process.argv.slice(2));
  const runner = new ShellCommandRunner();
  const service = new BrewService(runner, brewfilePath);
  const app = new BrewTuiApp(service, { debug });
  await app.start();
}

function normalizeTerminalEnv(): void {
  const term = process.env.TERM ?? "";
  const termProgram = process.env.TERM_PROGRAM ?? "";
  const isGhostty = term.toLowerCase().includes("ghostty") || termProgram.toLowerCase().includes("ghostty");

  // blessed has known incompatibilities with some extended terminfo entries from ghostty.
  if (isGhostty) {
    process.env.TERM = "xterm-256color";
  }
}

function parseArgs(args: string[]): { brewfilePath: string; debug: boolean } {
  let brewfilePath = resolve(process.cwd(), "Brewfile");
  let debug = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--debug") {
      debug = true;
      continue;
    }

    if (arg === "--brewfile") {
      brewfilePath = resolve(process.cwd(), args[i + 1] ?? "Brewfile");
      i += 1;
    }
  }

  return { brewfilePath, debug };
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // eslint-disable-next-line no-console
  console.error(`brewui failed: ${message}`);
  process.exit(1);
});
