import { describe, expect, it } from "vitest";

import {
  parseLoadCommands,
  verifyOtoolWeakLinkage,
} from "./verify-macos-universal.mjs";

const WEAK = "LC_LOAD_WEAK_DYLIB";
const DYLIB = "LC_LOAD_DYLIB";
const REEXPORT = "LC_REEXPORT_DYLIB";
const TRANSLATION = "/System/Library/Frameworks/Translation.framework/Versions/A/Translation";
const TRANSLATION_SWIFTUI = "/System/Library/Frameworks/_Translation_SwiftUI.framework/Versions/A/_Translation_SwiftUI";
const WEBKIT = "/System/Library/Frameworks/WebKit.framework/Versions/A/WebKit";

function block(index, command, name = null) {
  const lines = [`Load command ${index}`, `          cmd ${command}`, "      cmdsize 48"];
  if (name) lines.push(`         name ${name} (offset 24)`);
  lines.push("   time stamp 2 Thu Jan  1 09:00:02 1970", "compatibility version 0.0.0");
  return lines.join("\n");
}

function otoolText(commands) {
  return commands.map(([command, name], index) => block(index, command, name)).join("\n");
}

function problemsFor(commands) {
  return verifyOtoolWeakLinkage(otoolText(commands));
}

describe("verifyOtoolWeakLinkage", () => {
  it("accepts exactly the two Apple Translation frameworks weak-linked", () => {
    expect(problemsFor([
      [WEAK, TRANSLATION],
      [WEAK, TRANSLATION_SWIFTUI],
      [DYLIB, WEBKIT],
    ])).toEqual([]);
  });

  it("rejects a strong LC_LOAD_DYLIB Translation load", () => {
    expect(problemsFor([
      [DYLIB, TRANSLATION],
      [WEAK, TRANSLATION_SWIFTUI],
    ])).not.toEqual([]);
  });

  it("rejects a Translation dependency under LC_REEXPORT_DYLIB after a weak load", () => {
    expect(problemsFor([
      [WEAK, TRANSLATION],
      [REEXPORT, TRANSLATION_SWIFTUI],
    ])).not.toEqual([]);
  });

  it("rejects a missing Apple Translation framework", () => {
    expect(problemsFor([
      [WEAK, TRANSLATION],
    ])).not.toEqual([]);
  });

  it("rejects a duplicated Apple Translation framework", () => {
    expect(problemsFor([
      [WEAK, TRANSLATION],
      [WEAK, TRANSLATION],
    ])).not.toEqual([]);
  });

  it("rejects an extra Translation-like framework", () => {
    expect(problemsFor([
      [WEAK, TRANSLATION],
      [WEAK, TRANSLATION_SWIFTUI],
      [WEAK, "/System/Library/Frameworks/TranslationKit.framework/Versions/A/TranslationKit"],
    ])).not.toEqual([]);
  });

  it("rejects a wrong-name Translation-like framework that only matches a substring", () => {
    expect(problemsFor([
      [WEAK, TRANSLATION],
      [WEAK, "/System/Library/Frameworks/Translation.framework/Versions/A/_Translation_SwiftUI.framework"],
    ])).not.toEqual([]);
  });

  it("rejects a Translation framework whose complete component is not exact", () => {
    expect(problemsFor([
      [WEAK, "/System/Library/Frameworks/Foo-Translation.framework/Versions/A/Foo-Translation"],
      [WEAK, TRANSLATION_SWIFTUI],
    ])).not.toEqual([]);
  });

  it("rejects a strong Translation-like non-framework dependency", () => {
    expect(problemsFor([
      [WEAK, TRANSLATION],
      [WEAK, TRANSLATION_SWIFTUI],
      [DYLIB, "@rpath/libTranslation.dylib"],
    ])).not.toEqual([]);
  });
});

describe("parseLoadCommands", () => {
  it("parses each load command into an independent block", () => {
    const blocks = parseLoadCommands(otoolText([
      [WEAK, TRANSLATION],
      [REEXPORT, TRANSLATION_SWIFTUI],
      [DYLIB, WEBKIT],
    ]));

    expect(blocks).toEqual([
      { command: WEAK, name: TRANSLATION, fields: { cmdsize: "48" } },
      { command: REEXPORT, name: TRANSLATION_SWIFTUI, fields: { cmdsize: "48" } },
      { command: DYLIB, name: WEBKIT, fields: { cmdsize: "48" } },
    ]);
  });
});
