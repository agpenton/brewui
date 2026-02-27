import blessed from "blessed";
import { BrewService } from "../services/brewService.js";
import { BrewItem } from "../types.js";

interface AppOptions {
  debug?: boolean;
}

export class BrewTuiApp {
  private readonly screen = blessed.screen({
    smartCSR: true,
    fullUnicode: true,
    title: "brewui"
  });

  private readonly list = blessed.list({
    parent: this.screen,
    top: 0,
    left: 0,
    width: "45%",
    height: "92%",
    border: "line",
    label: " Packages ",
    keys: false,
    vi: false,
    mouse: true,
    scrollbar: {
      ch: " "
    },
    style: {
      selected: {
        bg: "blue",
        fg: "white"
      }
    }
  });

  private readonly localDetails = blessed.box({
    parent: this.screen,
    top: 0,
    left: "45%",
    width: "55%",
    height: "46%",
    border: "line",
    label: " Local Details ",
    tags: false,
    scrollable: true,
    alwaysScroll: true,
    keys: false,
    mouse: true,
    vi: true,
    content: "Select a package to view local details."
  });

  private readonly sourceInfo = blessed.box({
    parent: this.screen,
    top: "46%",
    left: "45%",
    width: "55%",
    height: "46%",
    border: "line",
    label: " Source Info ",
    tags: false,
    scrollable: true,
    alwaysScroll: true,
    keys: false,
    mouse: true,
    vi: true,
    content: "Press enter to load source info (brew info / mas info)."
  });

  private readonly footer = blessed.box({
    parent: this.screen,
    bottom: 0,
    left: 0,
    width: "100%",
    height: "8%",
    border: "line",
    tags: false,
    content:
      "d:dump  r:refresh  /:filter  enter:info  x:delete  c:cleanup  u:update+upgrade  q:quit"
  });

  private readonly question = blessed.question({
    parent: this.screen,
    border: "line",
    height: 8,
    width: "70%",
    top: "center",
    left: "center",
    label: " Confirm ",
    tags: false,
    keys: true,
    vi: true
  });

  private readonly prompt = blessed.prompt({
    parent: this.screen,
    border: "line",
    height: 9,
    width: "70%",
    top: "center",
    left: "center",
    label: " Input ",
    tags: false,
    keys: true,
    vi: true
  });

  private allItems: BrewItem[] = [];
  private visibleItems: BrewItem[] = [];
  private filterText = "";

  constructor(
    private readonly service: BrewService,
    private readonly options: AppOptions = {}
  ) {}

  async start(): Promise<void> {
    this.bindKeys();
    await this.safeRefresh();
    this.screen.render();
  }

  private bindKeys(): void {
    this.screen.key(["q", "C-c"], () => {
      this.screen.destroy();
      process.exit(0);
    });

    this.screen.key(["j", "down"], () => this.moveSelection(1));
    this.screen.key(["k", "up"], () => this.moveSelection(-1));

    this.screen.key(["r"], async () => {
      await this.safeRefresh();
    });

    this.screen.key(["d"], async () => {
      await this.safeDump();
    });

    this.screen.key(["enter"], async () => {
      await this.safeLoadSourceInfo();
    });

    this.screen.key(["x"], async () => {
      await this.safeDeleteSelected();
    });

    this.screen.key(["c"], async () => {
      await this.safeCleanup();
    });

    this.screen.key(["u"], async () => {
      await this.safeUpdateAndUpgrade();
    });

    this.screen.key(["/"], async () => {
      await this.askFilter();
    });

    this.list.on("select", () => {
      this.renderSelectedLocalDetails();
      void this.loadLocalDetailsForCurrent();
      this.screen.render();
    });
  }

  private moveSelection(delta: number): void {
    if (this.visibleItems.length === 0) {
      return;
    }

    const current = this.selectedIndex();
    const next = Math.max(0, Math.min(this.visibleItems.length - 1, current + delta));
    this.list.select(next);
    this.renderItems();
    this.renderSelectedLocalDetails();
    void this.loadLocalDetailsForCurrent();
    this.screen.render();
  }

  private async safeDump(): Promise<void> {
    try {
      this.setStatus("Dumping Brewfile...");
      const result = await this.service.dumpBrewfile();
      this.setStatus(`Dump complete: ${result.path}`);
      await this.safeRefresh();
    } catch (error) {
      this.onError(error);
    }
  }

  private async safeRefresh(preferredIndex?: number): Promise<void> {
    try {
      this.setStatus("Refreshing Brewfile list...");
      const parsed = await this.service.readAndParseBrewfile();
      this.allItems = parsed.items;
      this.applyFilter(this.filterText);

      if (parsed.errors.length > 0) {
        this.setStatus(`Refreshed with ${parsed.errors.length} parse warning(s).`);
      } else {
        this.setStatus(`Loaded ${parsed.items.length} items from Brewfile.`);
      }

      if (this.visibleItems.length > 0) {
        const nextIndex = clampIndex(preferredIndex ?? 0, this.visibleItems.length);
        this.list.select(nextIndex);
        this.renderSelectedLocalDetails();
        void this.loadLocalDetailsForCurrent();
        this.sourceInfo.setContent("Press enter to load source info.");
      } else {
        this.localDetails.setContent("No items to display. Press d to dump Brewfile.");
        this.sourceInfo.setContent("No source info available.");
      }

      this.screen.render();
    } catch (error) {
      this.onError(error);
    }
  }

  private async safeLoadSourceInfo(): Promise<void> {
    const item = this.currentItem();
    if (!item) {
      return;
    }

    try {
      this.setStatus(`Loading source info for ${item.name}...`);
      const info = await this.service.fetchSourceInfo(item);
      item.sourceInfo = info;
      item.sourceInfoError = undefined;
      item.status = "ready";
      this.sourceInfo.setContent(info || "(no output)");
      this.renderSelectedLocalDetails();
      this.setStatus(`Loaded source info for ${item.name}.`);
      this.screen.render();
    } catch (error) {
      item.status = "error";
      item.sourceInfoError = messageOf(error);
      this.sourceInfo.setContent(`Error loading source info:\n${item.sourceInfoError}`);
      this.renderSelectedLocalDetails();
      this.onError(error);
    }
  }

  private async safeDeleteSelected(): Promise<void> {
    const item = this.currentItem();
    if (!item) {
      return;
    }

    if (!["brew", "cask", "mas"].includes(item.type)) {
      this.setStatus(`Delete not supported for type ${item.type}.`);
      this.screen.render();
      return;
    }

    const commandPreview = deletePreview(item);
    const first = await this.confirm(`Run delete command?\n${commandPreview}`);
    if (!first) {
      this.setStatus("Delete canceled.");
      this.screen.render();
      return;
    }

    const second = await this.confirm(`Confirm delete ${item.name}? (y/N)`);
    if (!second) {
      this.setStatus("Delete canceled.");
      this.screen.render();
      return;
    }

    try {
      const previousIndex = this.selectedIndex();
      this.setStatus(`Deleting ${item.name}...`);
      const output = await this.service.deleteItem(item);
      this.removeItemOptimistically(item.id, previousIndex);
      this.setStatus(`${output}. Syncing Brewfile in background...`);
      void this.syncAfterDelete(previousIndex);
    } catch (error) {
      this.onError(error);
    }
  }

  private async safeCleanup(): Promise<void> {
    const confirmed = await this.confirm("Run brew cleanup?");
    if (!confirmed) {
      this.setStatus("Cleanup canceled.");
      this.screen.render();
      return;
    }

    try {
      this.setStatus("Running brew cleanup...");
      const output = await this.service.cleanup();
      this.setStatus(output);
      await this.safeRefresh();
    } catch (error) {
      this.onError(error);
    }
  }

  private async safeUpdateAndUpgrade(): Promise<void> {
    const confirmed = await this.confirm("Run brew update and brew upgrade for all packages?");
    if (!confirmed) {
      this.setStatus("Update/upgrade canceled.");
      this.screen.render();
      return;
    }

    try {
      this.setStatus("Running brew update...");
      const output = await this.service.updateAndUpgradeAll();
      this.sourceInfo.setContent(output || "(no output)");
      this.setStatus("Update/upgrade complete. Refreshing list...");
      await this.safeRefresh(this.selectedIndex());
    } catch (error) {
      this.onError(error);
    }
  }

  private async askFilter(): Promise<void> {
    const input = await this.promptInput("Filter by name", this.filterText);
    if (input === null) {
      this.setStatus("Filter canceled.");
      this.screen.render();
      return;
    }

    this.filterText = input.trim();
    this.applyFilter(this.filterText);
    if (this.visibleItems.length > 0) {
      this.list.select(0);
      this.renderSelectedLocalDetails();
      this.sourceInfo.setContent("Press enter to load source info.");
    } else {
      this.localDetails.setContent(`No items match filter: ${this.filterText}`);
      this.sourceInfo.setContent("No source info available.");
      this.setStatus("No results.");
    }

    this.screen.render();
  }

  private applyFilter(filter: string): void {
    if (!filter) {
      this.visibleItems = [...this.allItems];
    } else {
      const needle = filter.toLowerCase();
      this.visibleItems = this.allItems.filter((item) => item.name.toLowerCase().includes(needle));
    }

    this.renderItems();
  }

  private renderItems(): void {
    if (this.visibleItems.length === 0) {
      this.list.setItems(["(empty)"]);
      this.list.select(0);
      return;
    }

    this.list.setItems(
      this.visibleItems.map((item) => `[${item.type}] ${item.name}${item.status === "error" ? " !" : ""}`)
    );
  }

  private currentItem(): BrewItem | undefined {
    if (this.visibleItems.length === 0) {
      return undefined;
    }

    const index = this.selectedIndex();
    return this.visibleItems[index];
  }

  private selectedIndex(): number {
    const list = this.list as unknown as { selected?: number };
    return list.selected ?? 0;
  }

  private setStatus(message: string): void {
    const debugHint = this.options.debug ? "  [debug]" : "";
    this.footer.setContent(
      `d:dump  r:refresh  /:filter  enter:info  x:delete  c:cleanup  u:update+upgrade  q:quit\n${message}${debugHint}`
    );
  }

  private onError(error: unknown): void {
    this.setStatus(`Error: ${messageOf(error)}`);
    this.screen.render();
  }

  private renderSelectedLocalDetails(): void {
    const item = this.currentItem();
    if (!item) {
      this.localDetails.setContent("No selection.");
      return;
    }
    this.localDetails.setContent(this.formatLocalDetails(item));
  }

  private removeItemOptimistically(itemId: string, preferredIndex: number): void {
    this.allItems = this.allItems.filter((candidate) => candidate.id !== itemId);
    this.applyFilter(this.filterText);

    if (this.visibleItems.length > 0) {
      this.list.select(clampIndex(preferredIndex, this.visibleItems.length));
      this.renderSelectedLocalDetails();
      this.sourceInfo.setContent("Press enter to load source info.");
    } else {
      this.localDetails.setContent("No items to display.");
      this.sourceInfo.setContent("No source info available.");
    }

    this.screen.render();
  }

  private async syncAfterDelete(preferredIndex: number): Promise<void> {
    try {
      await this.service.dumpBrewfile();
      await this.safeRefresh(preferredIndex);
      this.setStatus("Delete synced with Brewfile.");
      this.screen.render();
    } catch (error) {
      this.onError(error);
    }
  }

  private async loadLocalDetailsForCurrent(): Promise<void> {
    const item = this.currentItem();
    if (!item) {
      return;
    }

    if (item.details !== undefined) {
      return;
    }

    if (!["brew", "cask", "mas", "tap"].includes(item.type)) {
      return;
    }

    try {
      const details = await this.service.fetchDetails(item);
      item.details = details;
      if (this.currentItem()?.id === item.id) {
        this.renderSelectedLocalDetails();
        this.screen.render();
      }
    } catch (error) {
      item.error = messageOf(error);
      if (this.currentItem()?.id === item.id) {
        this.renderSelectedLocalDetails();
        this.screen.render();
      }
    }
  }

  private formatLocalDetails(item: BrewItem): string {
    const lines: string[] = [];
    lines.push(`Type: ${item.type}`);
    lines.push(`Name: ${item.name}`);
    lines.push(`ID: ${item.id}`);
    lines.push(`Line: ${item.lineNumber}`);
    lines.push(`Raw: ${item.raw}`);
    lines.push("");

    if (item.error) {
      lines.push(`Error: ${item.error}`);
    }

    lines.push("Meta:");
    lines.push(stringify(item.meta));

    const local = extractLocalSummary(item);
    lines.push("");
    lines.push(`Location: ${local.location}`);
    lines.push(`Dependencies: ${local.dependencies.join(", ")}`);

    if (item.sourceInfoError) {
      lines.push("");
      lines.push(`Last source info error: ${item.sourceInfoError}`);
    }

    return lines.join("\n");
  }

  private confirm(message: string): Promise<boolean> {
    return new Promise((resolve) => {
      (this.question as unknown as { ask: (msg: string, cb: (...args: unknown[]) => void) => void }).ask(
        message,
        (...args: unknown[]) => {
          const answer = args[args.length - 1];
          resolve(Boolean(answer));
        }
      );
    });
  }

  private promptInput(label: string, initialValue: string): Promise<string | null> {
    return new Promise((resolve) => {
      (
        this.prompt as unknown as {
          input: (msg: string, value: string, cb: (result: string | null) => void) => void;
        }
      ).input(`${label}:`, initialValue, (value: string | null) => {
        resolve(value);
      });
    });
  }
}

function stringify(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function deletePreview(item: BrewItem): string {
  if (item.type === "brew") {
    return `brew uninstall ${item.name}`;
  }

  if (item.type === "cask") {
    return `brew uninstall --cask ${item.name}`;
  }

  if (item.type === "mas") {
    const masId = item.meta.masId ? String(item.meta.masId) : item.id.slice(4);
    return `mas uninstall ${masId}`;
  }

  return `unsupported delete for ${item.type}`;
}

function extractLocalSummary(item: BrewItem): { location: string; dependencies: string[] } {
  const fallback = { location: "Unknown", dependencies: [] as string[] };
  const details = item.details as Record<string, unknown> | undefined;

  if (!details || typeof details !== "object") {
    return fallback;
  }

  if (item.type === "brew") {
    const formula = firstRecord((details.formulae as unknown[]) ?? []);
    const installed = firstRecord((formula?.installed as unknown[]) ?? []);
    const location =
      stringValue(installed?.prefix) ??
      stringValue(formula?.linked_keg) ??
      stringValue(formula?.rack) ??
      "Unknown";
    const dependencies = stringArray(formula?.dependencies);
    return {
      location,
      dependencies: dependencies.length > 0 ? dependencies : ["None"]
    };
  }

  if (item.type === "cask") {
    const cask = firstRecord((details.casks as unknown[]) ?? []);
    const location =
      firstString(cask?.installed) ??
      firstString(cask?.name) ??
      "Unknown";
    const dependsOn = toRecord(cask?.depends_on);
    const dependencies = [
      ...stringArray(dependsOn?.formula),
      ...stringArray(dependsOn?.cask)
    ];
    return {
      location,
      dependencies: dependencies.length > 0 ? dependencies : ["None"]
    };
  }

  if (item.type === "mas") {
    return { location: "Managed by App Store", dependencies: ["None"] };
  }

  return fallback;
}

function firstRecord(input: unknown[]): Record<string, unknown> | undefined {
  const first = input[0];
  return toRecord(first);
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function firstString(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const first = value[0];
  return typeof first === "string" && first.length > 0 ? first : undefined;
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(length - 1, index));
}
