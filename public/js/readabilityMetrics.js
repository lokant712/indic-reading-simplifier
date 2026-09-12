/**
 * Automated Readability & Content Preservation Metrics
 * Computes structural deltas, Indic conjunct density, and factual preservation ratios.
 */

/**
 * Compute comprehensive readability delta between original and simplified text.
 * @param {object} params - { originalText, simplifiedText, languageCode }
 * @returns {object} Readability delta and retention metrics
 */
export function computeReadabilityDelta({ originalText = '', simplifiedText = '', languageCode = 'auto' }) {
  const origStats = analyzeTextStructure(originalText, languageCode);
  const simpStats = analyzeTextStructure(simplifiedText, languageCode);

  // Content-Preservation Checks
  const numberPreservation = checkNumberRetention(originalText, simplifiedText);
  const properNounPreservation = checkProperNounRetention(originalText, simplifiedText);
  const wordCountRatio = origStats.wordCount > 0
    ? Math.round((simpStats.wordCount / origStats.wordCount) * 100) / 100
    : 1.0;

  return {
    avgSentenceLength: {
      before: origStats.avgSentenceLength,
      after: simpStats.avgSentenceLength,
      delta: Math.round((simpStats.avgSentenceLength - origStats.avgSentenceLength) * 10) / 10
    },
    avgWordLength: {
      before: origStats.avgWordLength,
      after: simpStats.avgWordLength,
      delta: Math.round((simpStats.avgWordLength - origStats.avgWordLength) * 10) / 10
    },
    typeTokenRatio: {
      before: origStats.typeTokenRatio,
      after: simpStats.typeTokenRatio,
      delta: Math.round((simpStats.typeTokenRatio - origStats.typeTokenRatio) * 100) / 100
    },
    avgStructuralDifficulty: {
      before: origStats.avgStructuralDifficulty,
      after: simpStats.avgStructuralDifficulty,
      delta: Math.round((simpStats.avgStructuralDifficulty - origStats.avgStructuralDifficulty) * 100) / 100
    },
    conjunctDensity: {
      before: origStats.conjunctDensity,
      after: simpStats.conjunctDensity,
      delta: Math.round((simpStats.conjunctDensity - origStats.conjunctDensity) * 10) / 10
    },
    numberRetentionPct: numberPreservation.retentionPct,
    numbersFound: {
      original: numberPreservation.originalNumbers,
      retained: numberPreservation.retainedNumbers
    },
    properNounRetentionPct: properNounPreservation.retentionPct,
    properNounsFound: {
      original: properNounPreservation.originalNouns,
      retained: properNounPreservation.retainedNouns
    },
    wordCountRatio,
    sentenceCount: {
      before: origStats.sentenceCount,
      after: simpStats.sentenceCount
    },
    wordCount: {
      before: origStats.wordCount,
      after: simpStats.wordCount
    }
  };
}

/**
 * Structural analysis helper for Indic and Latin text
 */
function analyzeTextStructure(text, languageCode) {
  if (!text || typeof text !== 'string') {
    return {
      sentenceCount: 0,
      wordCount: 0,
      avgSentenceLength: 0,
      avgWordLength: 0,
      typeTokenRatio: 0,
      avgStructuralDifficulty: 0,
      conjunctDensity: 0
    };
  }

  // Protect common abbreviations from premature sentence splitting: Dr., Mr., Mrs., Prof., vs., etc.
  const sanitizedForSentenceSplit = text.replace(/\b(Dr|Mr|Mrs|Ms|Prof|Sr|Jr|vs|e\.g|i\.e)\./gi, '$1_DOT_');

  // Sentences split on Indic dandas (।, ॥) and Latin sentence marks (. ? ! ;)
  const rawSentences = sanitizedForSentenceSplit
    .split(/([.।॥?!;]+[\s\n]+|[.।॥?!;]+$)/g)
    .filter(s => s.trim().length > 0 && !/^[.।॥?!;]+$/.test(s.trim()));

  const sentenceCount = Math.max(1, rawSentences.length);

  // Words split on whitespace and punctuation
  const words = text.split(/[\s,.;:।॥?!()[\]{}"'“”‘’/\\-]+/).filter(w => w.trim().length > 0);
  const wordCount = Math.max(1, words.length);

  // Average sentence length (words per sentence)
  const avgSentenceLength = Math.round((wordCount / sentenceCount) * 10) / 10;

  // Average word length (characters per word)
  const totalChars = words.reduce((acc, w) => acc + w.length, 0);
  const avgWordLength = Math.round((totalChars / wordCount) * 10) / 10;

  // Type-Token Ratio (unique words / total words)
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const typeTokenRatio = Math.round((uniqueWords.size / wordCount) * 100) / 100;

  // Indic conjunct detection (Virama / Pulli code points):
  // Tamil pulli: U+0BCD
  // Devanagari virama: U+094D
  // Telugu: U+0C4D, Kannada: U+0CCD, Malayalam: U+0D4D, Bengali: U+09CD, Gujarati: U+0ACD, Gurmukhi: U+0A4D, Odia: U+0B4D
  const viramaRegex = /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D4D]/g;
  const viramaMatches = text.match(viramaRegex);
  const totalConjuncts = viramaMatches ? viramaMatches.length : 0;

  // Conjunct density: conjuncts per 100 words
  const conjunctDensity = Math.round(((totalConjuncts / wordCount) * 100) * 10) / 10;

  // Structural difficulty: combination of conjunct density and long word ratio (> 8 chars)
  const longWords = words.filter(w => w.length >= 8).length;
  const longWordRatio = longWords / wordCount;
  const avgStructuralDifficulty = Math.round(((totalConjuncts / wordCount) * 0.6 + longWordRatio * 0.4) * 100) / 100;

  return {
    sentenceCount,
    wordCount,
    avgSentenceLength,
    avgWordLength,
    typeTokenRatio,
    avgStructuralDifficulty,
    conjunctDensity
  };
}

/**
 * Check retention of digits, numbers, and Indic numerals
 */
function checkNumberRetention(original, simplified) {
  const numRegex = /[\d\u0966-\u096F\u0BE6-\u0BEF\u0C66-\u0C6F\u0CE6-\u0CEF\u0D66-\u0D6F\u09E6-\u09EF]+/g;
  const origMatches = original.match(numRegex) || [];
  const uniqueOrig = Array.from(new Set(origMatches));

  if (uniqueOrig.length === 0) {
    return { retentionPct: 100, originalNumbers: [], retainedNumbers: [] };
  }

  const retained = uniqueOrig.filter(num => simplified.includes(num));
  const retentionPct = Math.round((retained.length / uniqueOrig.length) * 100);

  return {
    retentionPct,
    originalNumbers: uniqueOrig,
    retainedNumbers: retained
  };
}

/**
 * Check retention of proper nouns, title words, or specific named entities
 */
function checkProperNounRetention(original, simplified) {
  const entityRegex = /(?:[“"'][^"”']+["”']|\b[A-Z][a-z]{2,}\b)/g;
  const origMatches = original.match(entityRegex) || [];
  // Exclude common sentence starters / articles
  const ignoreList = new Set(['The', 'This', 'That', 'These', 'Those', 'And', 'But', 'When', 'While', 'After', 'Before', 'For', 'With', 'From', 'Into']);
  const uniqueEntities = Array.from(new Set(origMatches)).filter(e => !ignoreList.has(e));

  if (uniqueEntities.length === 0) {
    return { retentionPct: 100, originalNouns: [], retainedNouns: [] };
  }

  const retained = uniqueEntities.filter(entity => {
    const clean = entity.replace(/^[“"']|["”']$/g, '');
    return simplified.includes(clean);
  });

  const retentionPct = Math.round((retained.length / uniqueEntities.length) * 100);

  return {
    retentionPct,
    originalNouns: uniqueEntities,
    retainedNouns: retained
  };
}
