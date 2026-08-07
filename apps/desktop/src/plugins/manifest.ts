import type { ErrorObject } from "ajv";
import type { FromSchema } from "json-schema-to-ts";
import { valid, validRange } from "semver";

import type { PLUGIN_MANIFEST_SCHEMA } from "./manifest.schema";
import validateStructure from "./validatePluginManifest.generated";

export const CORELIB_PLUGIN_API_VERSION = "1.0.0";

export type PluginManifest = FromSchema<typeof PLUGIN_MANIFEST_SCHEMA>;

const validateManifestStructure = validateStructure as unknown as {
  (candidate: unknown): candidate is PluginManifest;
  errors?: ErrorObject[] | null;
};

export type PluginManifestValidationIssueCode =
  | "invalid_manifest"
  | "unsupported_manifest_version"
  | "invalid_plugin_version"
  | "invalid_plugin_api_range"
  | "invalid_dependency_range";

export interface PluginManifestValidationIssue {
  code: PluginManifestValidationIssueCode;
  path: string;
  message: string;
}

export type PluginManifestValidationResult =
  | { ok: true; manifest: PluginManifest }
  | { ok: false; issues: readonly PluginManifestValidationIssue[] };

const schemaIssue = (error: ErrorObject): PluginManifestValidationIssue => ({
  code:
    error.keyword === "const" && error.instancePath === "/manifestVersion"
      ? "unsupported_manifest_version"
      : "invalid_manifest",
  path: error.instancePath || "/",
  message: error.message ?? "Manifest does not match the schema.",
});

export function validatePluginManifest(candidate: unknown): PluginManifestValidationResult {
  if (!validateManifestStructure(candidate)) {
    return {
      ok: false,
      issues: (validateManifestStructure.errors ?? []).map(schemaIssue),
    };
  }

  const issues: PluginManifestValidationIssue[] = [];
  if (!valid(candidate.version)) {
    issues.push({
      code: "invalid_plugin_version",
      path: "/version",
      message: `Plugin version is not valid semver: ${candidate.version}`,
    });
  }
  if (!validRange(candidate.compatibility.pluginApi)) {
    issues.push({
      code: "invalid_plugin_api_range",
      path: "/compatibility/pluginApi",
      message: `Plugin API compatibility is not a valid semver range: ${candidate.compatibility.pluginApi}`,
    });
  }
  candidate.dependencies.forEach((dependency, index) => {
    if (!validRange(dependency.version)) {
      issues.push({
        code: "invalid_dependency_range",
        path: `/dependencies/${index}/version`,
        message: `Dependency range is not valid semver: ${dependency.version}`,
      });
    }
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true, manifest: candidate };
}
