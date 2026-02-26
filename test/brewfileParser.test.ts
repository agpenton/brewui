import { describe, expect, it } from "vitest";
import { parseBrewfile } from "../src/parser/brewfileParser.js";

describe("parseBrewfile", () => {
  it("parses brew/cask/tap/mas lines", () => {
    const brewfile = [
      "# comment",
      "brew \"wget\"",
      "cask \"visual-studio-code\"",
      "tap \"homebrew/cask\"",
      "mas \"Xcode\", id: 497799835"
    ].join("\n");

    const result = parseBrewfile(brewfile);

    expect(result.errors).toHaveLength(0);
    expect(result.items).toHaveLength(4);
    expect(result.items[0]).toMatchObject({ id: "brew:wget", type: "brew", name: "wget" });
    expect(result.items[1]).toMatchObject({ type: "cask", name: "visual-studio-code" });
    expect(result.items[2]).toMatchObject({ type: "tap", name: "homebrew/cask" });
    expect(result.items[3]).toMatchObject({ id: "mas:497799835", type: "mas", name: "Xcode" });
  });

  it("returns unknown items for malformed lines without crashing", () => {
    const brewfile = ["brew invalid", "something random"].join("\n");
    const result = parseBrewfile(brewfile);

    expect(result.items).toHaveLength(2);
    expect(result.items[0].type).toBe("unknown");
    expect(result.items[1].type).toBe("unknown");
    expect(result.errors).toHaveLength(2);
  });
});
