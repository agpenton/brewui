import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseBrewfile } from "../parser/brewfileParser.js";
import { BrewItem, CommandExecutor, ParsedBrewfile } from "../types.js";

const DEFAULT_BREWFILE = "Brewfile";

export class BrewService {
  constructor(
    private readonly runner: CommandExecutor,
    private readonly brewfilePath = resolve(process.cwd(), DEFAULT_BREWFILE)
  ) {}

  getBrewfilePath(): string {
    return this.brewfilePath;
  }

  async dumpBrewfile(): Promise<{ path: string; output: string }> {
    const result = await this.runner.run("brew", [
      "bundle",
      "dump",
      "--force",
      "--file",
      this.brewfilePath
    ]);
    if (result.code !== 0) {
      throw new Error(result.stderr || "brew bundle dump failed");
    }

    return {
      path: this.brewfilePath,
      output: result.stdout || "Brewfile dumped"
    };
  }

  async readAndParseBrewfile(): Promise<ParsedBrewfile> {
    let content: string;
    try {
      content = await readFile(this.brewfilePath, "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to read Brewfile";
      throw new Error(`Brewfile not found at ${this.brewfilePath}: ${message}`);
    }

    return parseBrewfile(content);
  }

  async fetchDetails(item: BrewItem): Promise<unknown> {
    const [cmd, args] = detailsCommand(item);
    const result = await this.runner.run(cmd, args);
    if (result.code !== 0) {
      throw new Error(result.stderr || `Failed to fetch details for ${item.id}`);
    }

    return parseDetails(item, result.stdout);
  }

  async fetchSourceInfo(item: BrewItem): Promise<string> {
    const [cmd, args] = sourceInfoCommand(item);
    const result = await this.runner.run(cmd, args);
    if (result.code !== 0) {
      throw new Error(result.stderr || `Failed to fetch source info for ${item.id}`);
    }

    return result.stdout;
  }

  async deleteItem(item: BrewItem): Promise<string> {
    const command = deleteCommand(item);
    if (!command) {
      throw new Error(`Delete is not supported for ${item.type}`);
    }

    const [cmd, args] = command;
    const result = await this.runner.run(cmd, args);
    if (result.code !== 0) {
      throw new Error(result.stderr || `Delete failed for ${item.id}`);
    }

    return result.stdout || `${item.name} deleted`;
  }

  async cleanup(): Promise<string> {
    const result = await this.runner.run("brew", ["cleanup"]);
    if (result.code !== 0) {
      throw new Error(result.stderr || "brew cleanup failed");
    }

    return result.stdout || "brew cleanup complete";
  }
}

function detailsCommand(item: BrewItem): [string, string[]] {
  if (item.type === "brew") {
    return ["brew", ["info", "--json=v2", item.name]];
  }

  if (item.type === "cask") {
    return ["brew", ["info", "--cask", "--json=v2", item.name]];
  }

  if (item.type === "mas") {
    const masId = (item.meta.masId as number | undefined) ?? extractMasId(item.id);
    if (!masId) {
      throw new Error(`Missing MAS id for ${item.name}`);
    }
    return ["mas", ["info", String(masId)]];
  }

  if (item.type === "tap") {
    return ["brew", ["tap-info", "--json", item.name]];
  }

  throw new Error(`Details are not supported for ${item.type}`);
}

function parseDetails(item: BrewItem, output: string): unknown {
  if (item.type === "brew" || item.type === "cask" || item.type === "tap") {
    try {
      return JSON.parse(output);
    } catch {
      return { raw: output };
    }
  }

  return { raw: output };
}

function sourceInfoCommand(item: BrewItem): [string, string[]] {
  if (item.type === "brew") {
    return ["brew", ["info", item.name]];
  }

  if (item.type === "cask") {
    return ["brew", ["info", "--cask", item.name]];
  }

  if (item.type === "mas") {
    const masId = (item.meta.masId as number | undefined) ?? extractMasId(item.id);
    if (!masId) {
      throw new Error(`Missing MAS id for ${item.name}`);
    }
    return ["mas", ["info", String(masId)]];
  }

  if (item.type === "tap") {
    return ["brew", ["tap-info", item.name]];
  }

  throw new Error(`Source info is not supported for ${item.type}`);
}

function deleteCommand(item: BrewItem): [string, string[]] | null {
  if (item.type === "brew") {
    return ["brew", ["uninstall", item.name]];
  }

  if (item.type === "cask") {
    return ["brew", ["uninstall", "--cask", item.name]];
  }

  if (item.type === "mas") {
    const masId = (item.meta.masId as number | undefined) ?? extractMasId(item.id);
    if (!masId) {
      return null;
    }
    return ["mas", ["uninstall", String(masId)]];
  }

  return null;
}

function extractMasId(id: string): number | undefined {
  if (!id.startsWith("mas:")) {
    return undefined;
  }

  const maybeId = Number(id.slice(4));
  return Number.isFinite(maybeId) ? maybeId : undefined;
}
