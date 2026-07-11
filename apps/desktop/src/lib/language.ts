export function detectLanguage(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;

  const sample = trimmed.replace(/\s+/g, "").slice(0, 100);
  if (sample.length === 0) return undefined;

  let hiragana = 0, katakana = 0, hangul = 0, cjk = 0, cyrillic = 0, arabic = 0;

  for (const char of sample) {
    const cp = char.codePointAt(0)!;
    if (cp >= 0x3040 && cp <= 0x309f) hiragana++;
    else if (cp >= 0x30a0 && cp <= 0x30ff) katakana++;
    else if (cp >= 0xac00 && cp <= 0xd7af) hangul++;
    else if (cp >= 0x4e00 && cp <= 0x9fff) cjk++;
    else if (cp >= 0x0400 && cp <= 0x04ff) cyrillic++;
    else if (cp >= 0x0600 && cp <= 0x06ff) arabic++;
  }

  const threshold = sample.length * 0.3;
  if (hiragana > sample.length * 0.15 || katakana > sample.length * 0.1) return "ja-JP";
  if (hangul > threshold) return "ko-KR";
  if (cjk > threshold) return "zh-CN";
  if (cyrillic > threshold) return "ru-RU";
  if (arabic > threshold) return "ar-SA";

  return undefined;
}
