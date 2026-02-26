import { describe, expect, it } from "vitest";
import { BrewService } from "../src/services/brewService.js";
import { BrewItem, CommandExecutor, CommandResult } from "../src/types.js";

class FakeRunner implements CommandExecutor {
  public calls: Array<{ cmd: string; args: string[] }> = [];

  constructor(private readonly responder: (cmd: string, args: string[]) => CommandResult) {}

  async run(cmd: string, args: string[]): Promise<CommandResult> {
    this.calls.push({ cmd, args });
    return this.responder(cmd, args);
  }
}

function item(type: BrewItem["type"], name: string, meta: Record<string, unknown> = {}): BrewItem {
  return {
    id: `${type}:${name}`,
    type,
    name,
    raw: `${type} \"${name}\"`,
    meta,
    status: "idle",
    lineNumber: 1
  };
}

describe("BrewService commands", () => {
  it("maps brew details to brew info --json=v2", async () => {
    const runner = new FakeRunner(() => ({ code: 0, stdout: "{}", stderr: "" }));
    const service = new BrewService(runner);

    await service.fetchDetails(item("brew", "wget"));

    expect(runner.calls[0]).toEqual({
      cmd: "brew",
      args: ["info", "--json=v2", "wget"]
    });
  });

  it("maps cask delete to brew uninstall --cask", async () => {
    const runner = new FakeRunner(() => ({ code: 0, stdout: "ok", stderr: "" }));
    const service = new BrewService(runner);

    await service.deleteItem(item("cask", "iterm2"));

    expect(runner.calls[0]).toEqual({
      cmd: "brew",
      args: ["uninstall", "--cask", "iterm2"]
    });
  });

  it("maps cleanup to brew cleanup", async () => {
    const runner = new FakeRunner(() => ({ code: 0, stdout: "done", stderr: "" }));
    const service = new BrewService(runner);

    await service.cleanup();

    expect(runner.calls[0]).toEqual({
      cmd: "brew",
      args: ["cleanup"]
    });
  });

  it("maps source info to brew info", async () => {
    const runner = new FakeRunner(() => ({ code: 0, stdout: "info", stderr: "" }));
    const service = new BrewService(runner);

    await service.fetchSourceInfo(item("brew", "wget"));

    expect(runner.calls[0]).toEqual({
      cmd: "brew",
      args: ["info", "wget"]
    });
  });

  it("rejects delete for unsupported type", async () => {
    const runner = new FakeRunner(() => ({ code: 0, stdout: "", stderr: "" }));
    const service = new BrewService(runner);

    await expect(service.deleteItem(item("tap", "homebrew/cask"))).rejects.toThrow(
      "Delete is not supported"
    );
  });
});
