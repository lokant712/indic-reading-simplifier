/**
 * Unicode-based Indic & Multilingual Language Detector
 * Extensible script lookup table mapping Unicode blocks to language metadata.
 */

export const SCRIPT_REGISTRY = [
  {
    code: 'ta',
    name: 'Tamil',
    script: 'Tamil',
    ranges: [[0x0B80, 0x0BFF]],
    sampleFont: "'Noto Sans Tamil', 'Mukta Malar', sans-serif"
  },
  {
    code: 'hi',
    name: 'Hindi',
    script: 'Devanagari',
    ranges: [[0x0900, 0x097F], [0xA8E0, 0xA8FF]],
    sampleFont: "'Noto Sans Devanagari', 'Mukta', sans-serif"
  },
  {
    code: 'te',
    name: 'Telugu',
    script: 'Telugu',
    ranges: [[0x0C00, 0x0C7F]],
    sampleFont: "'Noto Sans Telugu', sans-serif"
  },
  {
    code: 'kn',
    name: 'Kannada',
    script: 'Kannada',
    ranges: [[0x0C80, 0x0CFF]],
    sampleFont: "'Noto Sans Kannada', sans-serif"
  },
  {
    code: 'ml',
    name: 'Malayalam',
    script: 'Malayalam',
    ranges: [[0x0D00, 0x0D7F]],
    sampleFont: "'Noto Sans Malayalam', sans-serif"
  },
  {
    code: 'bn',
    name: 'Bengali',
    script: 'Bengali',
    ranges: [[0x0980, 0x09FF]],
    sampleFont: "'Noto Sans Bengali', sans-serif"
  },
  {
    code: 'gu',
    name: 'Gujarati',
    script: 'Gujarati',
    ranges: [[0x0A80, 0x0AFF]],
    sampleFont: "'Noto Sans Gujarati', sans-serif"
  },
  {
    code: 'pa',
    name: 'Punjabi',
    script: 'Gurmukhi',
    ranges: [[0x0A00, 0x0A7F]],
    sampleFont: "'Noto Sans Gurmukhi', sans-serif"
  },
  {
    code: 'or',
    name: 'Odia',
    script: 'Odia',
    ranges: [[0x0B00, 0x0B7F]],
    sampleFont: "'Noto Sans Oriya', sans-serif"
  },
  {
    code: 'en',
    name: 'English',
    script: 'Latin',
    ranges: [
      [0x0041, 0x005A], // A-Z
      [0x0061, 0x007A], // a-z
      [0x00C0, 0x024F]  // Latin Extended
    ],
    sampleFont: "'Outfit', 'Inter', -apple-system, sans-serif"
  }
];

/**
 * Detect language from text via Unicode character frequency.
 * @param {string} text - Input text
 * @returns {object} Detection result with code, name, script, font, confidence
 */
export function detectLanguage(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      code: 'auto',
      name: 'Unknown',
      script: 'Generic',
      font: "'Outfit', 'Inter', sans-serif",
      confidence: 0,
      charCounts: {}
    };
  }

  const counts = {};
  for (const scriptDef of SCRIPT_REGISTRY) {
    counts[scriptDef.code] = 0;
  }

  let totalLetters = 0;

  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (!codePoint) continue;

    for (const scriptDef of SCRIPT_REGISTRY) {
      let matched = false;
      for (const [start, end] of scriptDef.ranges) {
        if (codePoint >= start && codePoint <= end) {
          counts[scriptDef.code]++;
          totalLetters++;
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
  }

  // Find dominant script
  let dominantCode = 'en';
  let maxCount = 0;

  for (const [code, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantCode = code;
    }
  }

  const detectedDef = SCRIPT_REGISTRY.find(s => s.code === dominantCode) || SCRIPT_REGISTRY[SCRIPT_REGISTRY.length - 1];
  const confidence = totalLetters > 0 ? (maxCount / totalLetters) : 0;

  return {
    code: detectedDef.code,
    name: detectedDef.name,
    script: detectedDef.script,
    font: detectedDef.sampleFont,
    confidence: Math.round(confidence * 100) / 100,
    dominantCount: maxCount,
    totalLetters
  };
}
