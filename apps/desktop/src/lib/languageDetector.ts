/**
 * Detect the language of a text string for YouGlish lookup.
 * Returns a BCP-47 language code supported by YouGlish, or null.
 */
export function detectLanguage(text: string): string | null {
  if (!text || !text.trim()) return null;
  const cleaned = text.trim();

  // 1. Script-based detection (Regex matching script Unicode blocks)
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(cleaned)) {
    return "ja"; // Hiragana/Katakana -> Japanese
  }
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(cleaned)) {
    return "ko"; // Hangul -> Korean
  }
  if (/[\u0E00-\u0E7F]/.test(cleaned)) {
    return "th"; // Thai -> Thai
  }
  if (/[\u0600-\u06FF]/.test(cleaned)) {
    return "ar"; // Arabic -> Arabic
  }
  if (/[\u0590-\u05FF]/.test(cleaned)) {
    return "he"; // Hebrew -> Hebrew
  }
  if (/[\u0370-\u03FF]/.test(cleaned)) {
    return "el"; // Greek -> Greek
  }
  if (/[\u4E00-\u9FFF]/.test(cleaned)) {
    return "zh"; // Han characters -> Chinese (no kana since ja is checked first)
  }
  
  // Cyrillic script
  if (/[\u0400-\u04FF]/.test(cleaned)) {
    // Ukrainian unique letters: і, ї, є, ґ
    if (/[іїєґІЇЄҐ]/.test(cleaned)) {
      return "uk";
    }
    // Russian unique/common letters: ы, э, ъ, ё
    if (/[ыэъёЫЭЪЁ]/.test(cleaned)) {
      return "ru";
    }
    return "ru";
  }

  // Vietnamese-specific diacritics
  if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệđìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]/i.test(cleaned)) {
    return "vi";
  }

  // 2. Latin-based scripts: count matches for common stop words
  const words = cleaned.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-zà-ÿđışğ]/g, ""));

  const stopWords: Record<string, Set<string>> = {
    en: new Set(["the", "and", "of", "to", "a", "is", "in", "that", "it", "for", "you", "was", "with", "on", "as"]),
    fr: new Set(["le", "la", "les", "des", "un", "une", "et", "est", "dans", "pour", "en", "du", "qui", "que", "sur"]),
    de: new Set(["der", "die", "das", "ein", "eine", "und", "ist", "in", "zu", "den", "von", "mit", "dem", "des", "nicht"]),
    es: new Set(["el", "la", "los", "las", "un", "una", "y", "es", "en", "que", "de", "con", "para", "por", "do"]),
    it: new Set(["il", "la", "i", "gli", "le", "un", "una", "e", "di", "in", "che", "per", "con", "del", "al"]),
    nl: new Set(["de", "het", "een", "en", "van", "in", "op", "met", "voor", "is", "dat", "die", "te", "zijn"]),
    pl: new Set(["i", "w", "z", "na", "do", "jak", "że", "to", "nie", "jest", "dla", "o", "po", "ze", "ale"]),
    pt: new Set(["o", "a", "os", "as", "um", "uma", "e", "é", "em", "que", "de", "com", "para", "por", "do"]),
    tr: new Set(["ve", "bir", "bu", "da", "de", "için", "ne", "o", "gibi", "ile", "daha", "çok", "olarak"]),
    sv: new Set(["och", "i", "att", "en", "ett", "är", "av", "på", "med", "som", "om", "för", "den", "det", "till"])
  };

  const scores: Record<string, number> = {
    en: 0, fr: 0, de: 0, es: 0, it: 0, nl: 0, pl: 0, pt: 0, tr: 0, sv: 0
  };

  for (const word of words) {
    for (const lang of Object.keys(stopWords)) {
      if (stopWords[lang].has(word)) {
        scores[lang] += 1;
      }
    }
  }

  // Character-specific cues for Latin scripts
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(cleaned)) {
    scores.pl += 2;
  }
  if (/[ışğİŞĞ]/.test(cleaned)) {
    scores.tr += 2;
  }
  if (/[äöüßÄÖÜ]/.test(cleaned)) {
    scores.de += 1;
  }

  let maxLang: string | null = null;
  let maxScore = 0;
  for (const lang of Object.keys(scores)) {
    if (scores[lang] > maxScore) {
      maxScore = scores[lang];
      maxLang = lang;
    }
  }

  if (maxScore > 0) {
    return maxLang;
  }

  // Fallbacks based on character characteristics if no stop words matched
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(cleaned)) return "pl";
  if (/[ışğİŞĞ]/.test(cleaned)) return "tr";
  if (/[äöüßÄÖÜ]/.test(cleaned)) return "de";
  if (/[éèàùçâêîôûëïüÿœæ]/.test(cleaned)) return "fr"; // Default romance language guess

  // Default to English if it's strictly simple Latin text
  if (/^[a-zA-Z\s.,;:!?()'"-]+$/.test(cleaned)) {
    return "en";
  }

  return null;
}
