import { BrewItem, ParsedBrewfile } from "../types.js";

const BREW_RE = /^brew\s+"([^"]+)"(?:\s*,\s*(.+))?$/;
const CASK_RE = /^cask\s+"([^"]+)"(?:\s*,\s*(.+))?$/;
const TAP_RE = /^tap\s+"([^"]+)"(?:\s*,\s*(.+))?$/;
const MAS_RE = /^mas\s+"([^"]+)"\s*,\s*id:\s*(\d+)(?:\s*,\s*(.+))?$/;

export function parseBrewfile(content: string): ParsedBrewfile {
  const lines = content.split(/\r?\n/);
  const items: BrewItem[] = [];
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i] ?? "";
    const line = raw.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const brew = line.match(BREW_RE);
    if (brew) {
      const name = brew[1];
      items.push(baseItem("brew", name, raw, i + 1, parseAttributes(brew[2])));
      continue;
    }

    const cask = line.match(CASK_RE);
    if (cask) {
      const name = cask[1];
      items.push(baseItem("cask", name, raw, i + 1, parseAttributes(cask[2])));
      continue;
    }

    const tap = line.match(TAP_RE);
    if (tap) {
      const name = tap[1];
      items.push(baseItem("tap", name, raw, i + 1, parseAttributes(tap[2])));
      continue;
    }

    const mas = line.match(MAS_RE);
    if (mas) {
      const app = mas[1];
      const appId = Number(mas[2]);
      const meta = { ...parseAttributes(mas[3]), masId: appId };
      items.push({
        id: `mas:${appId}`,
        type: "mas",
        name: app,
        raw,
        meta,
        status: "idle",
        lineNumber: i + 1
      });
      continue;
    }

    items.push({
      id: `unknown:${i + 1}`,
      type: "unknown",
      name: line,
      raw,
      meta: {},
      status: "error",
      error: "Unsupported or malformed Brewfile line",
      lineNumber: i + 1
    });
    errors.push(`Line ${i + 1}: Unsupported or malformed line`);
  }

  return { items, errors };
}

function baseItem(
  type: "brew" | "cask" | "tap",
  name: string,
  raw: string,
  lineNumber: number,
  meta: Record<string, unknown>
): BrewItem {
  return {
    id: `${type}:${name}`,
    type,
    name,
    raw,
    meta,
    status: "idle",
    lineNumber
  };
}

function parseAttributes(attributes?: string): Record<string, unknown> {
  if (!attributes) {
    return {};
  }

  const out: Record<string, unknown> = {};
  const segments = attributes.split(",").map((s) => s.trim()).filter(Boolean);

  for (const segment of segments) {
    const [keyPart, ...valueParts] = segment.split(":");
    const key = keyPart?.trim();
    if (!key) {
      continue;
    }
    const value = valueParts.join(":").trim();
    if (!value) {
      out[key] = true;
      continue;
    }
    out[key] = unquote(value);
  }

  return out;
}

function unquote(input: string): string {
  const trimmed = input.trim();
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
