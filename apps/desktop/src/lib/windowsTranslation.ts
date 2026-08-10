import type { TranslationResult } from "../domain/ai";
import { targetLanguageCode } from "../domain/translation";
import { detectLanguage } from "./languageDetector";

type ModelAvailability = "available" | "downloadable" | "downloading" | "unavailable";

interface LanguageDetectionResult {
  detectedLanguage: string;
  confidence: number;
}

interface LanguageDetectorSession {
  detect(text: string): Promise<LanguageDetectionResult[]>;
  destroy(): void;
}

interface LanguageDetectorFactory {
  availability(): Promise<ModelAvailability>;
  create(options?: { expectedInputLanguages?: string[] }): Promise<LanguageDetectorSession>;
}

interface TranslatorSession {
  translate(text: string): Promise<string>;
  destroy(): void;
}

interface TranslatorFactory {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<ModelAvailability>;
  create(options: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorSession>;
}

export interface WindowsTranslationRuntime {
  LanguageDetector?: LanguageDetectorFactory;
  Translator?: TranslatorFactory;
}

function browserRuntime(): WindowsTranslationRuntime {
  return globalThis as WindowsTranslationRuntime;
}

export async function windowsOnDeviceTranslationAvailable(
  runtime: WindowsTranslationRuntime = browserRuntime(),
): Promise<boolean> {
  const factory = runtime.Translator;
  if (typeof factory?.availability !== "function" || typeof factory.create !== "function") {
    return false;
  }

  try {
    // WebView2 can expose the Translator API even when its model runtime cannot
    // be used. Probe the required English-to-Japanese pair instead of treating
    // the presence of the global object as proof that translation will work.
    return await factory.availability({ sourceLanguage: "en", targetLanguage: "ja" }) !== "unavailable";
  } catch {
    return false;
  }
}

async function detectSourceLanguage(
  text: string,
  runtime: WindowsTranslationRuntime,
): Promise<string> {
  const heuristic = detectLanguage(text);
  if (heuristic) return heuristic;

  const factory = runtime.LanguageDetector;
  if (!factory || await factory.availability() === "unavailable") {
    throw new Error("engine_unavailable: Could not detect the source language on this device.");
  }

  const session = await factory.create();
  try {
    const detected = (await session.detect(text)).find((result) => result.detectedLanguage !== "und");
    if (!detected) {
      throw new Error("engine_unavailable: Could not detect the source language on this device.");
    }
    return detected.detectedLanguage;
  } finally {
    session.destroy();
  }
}

export async function translateWithWindowsOnDevice(
  text: string,
  targetLanguage: string,
  runtime: WindowsTranslationRuntime = browserRuntime(),
): Promise<TranslationResult> {
  const input = text.trim();
  if (!input) throw new Error("malformed_response: Text to translate cannot be empty.");

  const factory = runtime.Translator;
  if (!factory) {
    throw new Error("engine_unavailable: Windows on-device translation is not available in this WebView2 runtime.");
  }

  const target = targetLanguageCode(targetLanguage);
  if (!target) {
    throw new Error(`unsupported_language_pair: Unsupported target language: ${targetLanguage}`);
  }

  const source = await detectSourceLanguage(input, runtime);
  if (source.toLowerCase() === target.toLowerCase()) return { translation: input };

  const availability = await factory.availability({ sourceLanguage: source, targetLanguage: target });
  if (availability === "unavailable") {
    throw new Error(`unsupported_language_pair: On-device translation does not support ${source} to ${target}.`);
  }

  const session = await factory.create({ sourceLanguage: source, targetLanguage: target });
  try {
    const translation = (await session.translate(input)).trim();
    if (!translation) throw new Error("malformed_response: Windows on-device translation returned empty text.");
    return { translation };
  } finally {
    session.destroy();
  }
}
