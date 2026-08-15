import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  parseLoadCommands,
  verifyApp,
  verifyOtoolWeakLinkage,
} from "./verify-macos-universal.mjs";

const WEAK = "LC_LOAD_WEAK_DYLIB";
const DYLIB = "LC_LOAD_DYLIB";
const REEXPORT = "LC_REEXPORT_DYLIB";
const TRANSLATION = "/System/Library/Frameworks/Translation.framework/Versions/A/Translation";
const TRANSLATION_SWIFTUI = "/System/Library/Frameworks/_Translation_SwiftUI.framework/Versions/A/_Translation_SwiftUI";
const WEBKIT = "/System/Library/Frameworks/WebKit.framework/Versions/A/WebKit";

it("keeps the verifier importable by cross-platform test loaders", () => {
  const source = readFileSync(
    path.join(process.cwd(), "scripts", "verify-macos-universal.mjs"),
    "utf8",
  );

  expect(source.startsWith("#!")).toBe(false);
});

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

function buildVersionBlock(index, minos) {
  return [
    `Load command ${index}`,
    "      cmd LC_BUILD_VERSION",
    "  cmdsize 32",
    " platform 1",
    `    minos ${minos}`,
    "      sdk 15.5",
    "   ntools 1",
    "     tool 3",
  ].join("\n");
}

function validOtoolText(minos = "12.0") {
  return [
    buildVersionBlock(0, minos),
    block(1, WEAK, TRANSLATION),
    block(2, WEAK, TRANSLATION_SWIFTUI),
  ].join("\n");
}

function fakeRunner(overrides = {}) {
  return (command, args) => {
    if (command === "plutil") {
      if (overrides.plutilFailed) return { status: 1, stdout: "" };
      return { status: 0, stdout: overrides.plist ?? "12.0" };
    }
    if (command === "lipo") {
      if (overrides.lipoFailed) return { status: 1, stdout: "" };
      return { status: 0, stdout: overrides.archs ?? "x86_64 arm64" };
    }
    if (command === "otool") {
      const arch = args[1];
      if (overrides.otoolFailed) return { status: 1, stdout: "" };
      return { status: 0, stdout: overrides[`otool_${arch}`] ?? validOtoolText() };
    }
    return { status: 1, stdout: "" };
  };
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

  it("rejects a lowercase Translation-like non-framework dependency", () => {
    expect(problemsFor([
      [WEAK, TRANSLATION],
      [WEAK, TRANSLATION_SWIFTUI],
      [DYLIB, "@rpath/libtranslation.dylib"],
    ])).not.toEqual([]);
  });

  it("rejects an @rpath Translation framework path", () => {
    expect(problemsFor([
      [WEAK, "@rpath/Translation.framework/Versions/A/Translation"],
      [WEAK, TRANSLATION_SWIFTUI],
    ])).not.toEqual([]);
  });

  it("rejects a Translation-like executable suffix", () => {
    expect(problemsFor([
      [WEAK, TRANSLATION],
      [WEAK, TRANSLATION_SWIFTUI],
      [DYLIB, "@rpath/TranslationEvil"],
    ])).not.toEqual([]);
  });

  it("rejects a wrong-case Translation framework path", () => {
    expect(problemsFor([
      [WEAK, TRANSLATION],
      [WEAK, "/System/Library/Frameworks/translation.framework/Versions/A/translation"],
      [WEAK, TRANSLATION_SWIFTUI],
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

describe("verifyApp", () => {
  it("accepts a conforming artifact", () => {
    expect(verifyApp("/fake/Corelib.app", fakeRunner())).toEqual([]);
  });

  it("reports a wrong LSMinimumSystemVersion", () => {
    expect(
      verifyApp("/fake/Corelib.app", fakeRunner({ plist: "11.0" })),
    ).toEqual(["LSMinimumSystemVersion must be 12.0"]);
  });

  it("reports a wrong architecture set", () => {
    expect(
      verifyApp("/fake/Corelib.app", fakeRunner({ archs: "x86_64" })),
    ).toEqual(["lipo architectures must be x86_64 arm64"]);
  });

  it("reports a wrong per-arch minos", () => {
    expect(
      verifyApp("/fake/Corelib.app", fakeRunner({ otool_x86_64: validOtoolText("11.0") })),
    ).toEqual(["x86_64 LC_BUILD_VERSION minos must be 12.0"]);
  });

  it("reports failed plutil, lipo, and otool tools", () => {
    expect(
      verifyApp("/fake/Corelib.app", fakeRunner({ plutilFailed: true })),
    ).toEqual(["LSMinimumSystemVersion must be 12.0"]);
    expect(
      verifyApp("/fake/Corelib.app", fakeRunner({ lipoFailed: true })),
    ).toEqual(["lipo architectures must be x86_64 arm64"]);
    expect(
      verifyApp("/fake/Corelib.app", fakeRunner({ otoolFailed: true })),
    ).toEqual(["otool failed for x86_64", "otool failed for arm64"]);
  });
});
