import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_MINIMUM_SYSTEM_VERSION = "12.0";
const EXPECTED_ARCHS = ["x86_64", "arm64"];
const EXPECTED_MINOS = "12.0";
const CANONICAL_TRANSLATION_FRAMEWORKS = [
  "/System/Library/Frameworks/Translation.framework/Versions/A/Translation",
  "/System/Library/Frameworks/_Translation_SwiftUI.framework/Versions/A/_Translation_SwiftUI",
];

export function parseLoadCommands(otoolOutput) {
  const blocks = [];
  let current = null;
  for (const line of String(otoolOutput).split("\n")) {
    const trimmed = line.trim();
    if (/^Load command \d+$/.test(trimmed)) {
      current = { command: null, name: null, fields: {} };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    const cmdMatch = /^cmd (LC_[A-Z_]+)$/.exec(trimmed);
    if (cmdMatch) {
      current.command = cmdMatch[1];
      continue;
    }
    const nameMatch = /^name (.+?) \(offset \d+\)$/.exec(trimmed);
    if (nameMatch) {
      current.name = nameMatch[1];
      continue;
    }
    const fieldMatch = /^([a-z_]+) ([^ ]+)$/.exec(trimmed);
    if (fieldMatch) current.fields[fieldMatch[1]] = fieldMatch[2];
  }
  return blocks;
}

export function translationDependencyKind(name) {
  if (!name?.toLowerCase().includes("translation")) return null;
  const normalized = name.trim();
  if (CANONICAL_TRANSLATION_FRAMEWORKS.includes(normalized)) return normalized;
  return "invalid";
}

export function verifyOtoolWeakLinkage(otoolOutput) {
  const problems = [];
  const blocks = parseLoadCommands(otoolOutput);
  const deps = blocks
    .filter((block) => block.command && block.name && translationDependencyKind(block.name))
    .map((block) => ({ command: block.command, name: block.name }));

  for (const dep of deps) {
    const kind = translationDependencyKind(dep.name);
    if (kind === "invalid") {
      problems.push(`unknown Translation-like dependency ${dep.name} is not allowed`);
      continue;
    }
    if (dep.command !== "LC_LOAD_WEAK_DYLIB") {
      problems.push(
        `${dep.name} must be LC_LOAD_WEAK_DYLIB, got ${dep.command}`,
      );
    }
  }

  const weakNames = deps
    .filter((dep) => dep.command === "LC_LOAD_WEAK_DYLIB")
    .map((dep) => translationDependencyKind(dep.name))
    .filter((kind) => kind !== "invalid")
    .sort();
  const expected = [...CANONICAL_TRANSLATION_FRAMEWORKS].sort();
  if (
    weakNames.length !== expected.length
    || weakNames.some((name, index) => name !== expected[index])
  ) {
    problems.push(
      `expected exactly the weak frameworks [${expected.join(", ")}], got [${weakNames.join(", ")}]`,
    );
  }
  return problems;
}

function run(command, args) {
  return spawnSync(command, args, { encoding: "utf8" });
}

export function verifyApp(appPath, runCommand = run) {
  const problems = [];
  const plist = path.join(appPath, "Contents", "Info.plist");
  const binary = path.join(appPath, "Contents", "MacOS", "library_desktop");

  const plistResult = runCommand("plutil", ["-extract", "LSMinimumSystemVersion", "raw", plist]);
  if (plistResult.status !== 0 || plistResult.stdout.trim() !== EXPECTED_MINIMUM_SYSTEM_VERSION) {
    problems.push(`LSMinimumSystemVersion must be ${EXPECTED_MINIMUM_SYSTEM_VERSION}`);
  }

  const lipoResult = runCommand("lipo", ["-archs", binary]);
  const archs = lipoResult.status === 0 ? lipoResult.stdout.trim().split(/\s+/) : [];
  const archsMatch = archs.length === EXPECTED_ARCHS.length
    && archs.every((arch, index) => arch === EXPECTED_ARCHS[index]);
  if (!archsMatch) {
    problems.push(`lipo architectures must be ${EXPECTED_ARCHS.join(" ")}`);
  }

  for (const arch of EXPECTED_ARCHS) {
    const otoolResult = runCommand("otool", ["-arch", arch, "-l", binary]);
    if (otoolResult.status !== 0) {
      problems.push(`otool failed for ${arch}`);
      continue;
    }
    const blocks = parseLoadCommands(otoolResult.stdout);
    const buildVersion = blocks.find((block) => block.command === "LC_BUILD_VERSION");
    if (buildVersion?.fields?.minos !== EXPECTED_MINOS) {
      problems.push(`${arch} LC_BUILD_VERSION minos must be ${EXPECTED_MINOS}`);
    }
    problems.push(...verifyOtoolWeakLinkage(otoolResult.stdout));
  }
  return problems;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const appPath = process.argv[2];
  if (!appPath) {
    console.error("usage: node scripts/verify-macos-universal.mjs <path-to-Corelib.app>");
    process.exit(2);
  }
  const problems = verifyApp(appPath);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`verify-macos-universal: ${problem}`);
    }
    process.exit(1);
  }
  console.log("verify-macos-universal: OK");
}
