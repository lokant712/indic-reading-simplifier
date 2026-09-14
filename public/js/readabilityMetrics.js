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

  const isTamil = origStats.tamilStructuralDifficulty !== null && simpStats.tamilStructuralDifficulty !== null;

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
    avgMorphemeBoundariesPerWord: isTamil ? {
      before: origStats.avgMorphemeBoundariesPerWord,
      after: simpStats.avgMorphemeBoundariesPerWord,
      delta: Math.round((simpStats.avgMorphemeBoundariesPerWord - origStats.avgMorphemeBoundariesPerWord) * 10) / 10
    } : null,
    tamilStructuralDifficulty: isTamil ? {
      before: origStats.tamilStructuralDifficulty,
      after: simpStats.tamilStructuralDifficulty,
      delta: Math.round((simpStats.tamilStructuralDifficulty - origStats.tamilStructuralDifficulty) * 100) / 100
    } : null,
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
 * Standard Tamil grammatical suffix registry.
 * Covers canonical case markers, nominal inflections, clitics, and verb tense/PNG endings.
 */
export const TAMIL_SUFFIX_RULES = [
  // Verb Tense + Person-Number-Gender (PNG) & Aspect
  { suffix: 'கின்றார்கள்', type: 'verb_present_3pl' },
  { suffix: 'கின்றீர்கள்', type: 'verb_present_2pl' },
  { suffix: 'கிறார்கள்', type: 'verb_present_3pl' },
  { suffix: 'கிறீர்கள்', type: 'verb_present_2pl' },
  { suffix: 'த்தார்கள்', type: 'verb_past_3pl' },
  { suffix: 'ந்தார்கள்', type: 'verb_past_3pl' },
  { suffix: 'ட்டார்கள்', type: 'verb_past_3pl' },
  { suffix: 'ப்பார்கள்', type: 'verb_future_3pl' },
  { suffix: 'வார்கள்', type: 'verb_future_3pl' },
  { suffix: 'த்தீர்கள்', type: 'verb_past_2pl' },
  { suffix: 'ந்தீர்கள்', type: 'verb_past_2pl' },
  { suffix: 'ப்பீர்கள்', type: 'verb_future_2pl' },
  { suffix: 'வீர்கள்', type: 'verb_future_2pl' },
  { suffix: 'கின்றோம்', type: 'verb_present_1pl' },
  { suffix: 'கின்றேன்', type: 'verb_present_1sg' },
  { suffix: 'கின்றான்', type: 'verb_present_3ms' },
  { suffix: 'கின்றாள்', type: 'verb_present_3fs' },
  { suffix: 'கின்றது', type: 'verb_present_3ns' },
  { suffix: 'கின்றன', type: 'verb_present_3np' },
  { suffix: 'கின்றாய்', type: 'verb_present_2sg' },
  { suffix: 'இன்றேன்', type: 'verb_present_1sg' },
  { suffix: 'கிறோம்', type: 'verb_present_1pl' },
  { suffix: 'கிறேன்', type: 'verb_present_1sg' },
  { suffix: 'கிறான்', type: 'verb_present_3ms' },
  { suffix: 'கிறாள்', type: 'verb_present_3fs' },
  { suffix: 'கிறது', type: 'verb_present_3ns' },
  { suffix: 'கிறாய்', type: 'verb_present_2sg' },
  { suffix: 'த்தோம்', type: 'verb_past_1pl' },
  { suffix: 'ந்தோம்', type: 'verb_past_1pl' },
  { suffix: 'ட்டோம்', type: 'verb_past_1pl' },
  { suffix: 'த்தேன்', type: 'verb_past_1sg' },
  { suffix: 'ந்தேன்', type: 'verb_past_1sg' },
  { suffix: 'ட்டேன்', type: 'verb_past_1sg' },
  { suffix: 'த்தான்', type: 'verb_past_3ms' },
  { suffix: 'ந்தான்', type: 'verb_past_3ms' },
  { suffix: 'ட்டான்', type: 'verb_past_3ms' },
  { suffix: 'டான்', type: 'verb_past_3ms' },
  { suffix: 'த்தாள்', type: 'verb_past_3fs' },
  { suffix: 'ந்தாள்', type: 'verb_past_3fs' },
  { suffix: 'ட்டாள்', type: 'verb_past_3fs' },
  { suffix: 'டாள்', type: 'verb_past_3fs' },
  { suffix: 'த்தது', type: 'verb_past_3ns' },
  { suffix: 'ந்தது', type: 'verb_past_3ns' },
  { suffix: 'ட்டது', type: 'verb_past_3ns' },
  { suffix: 'த்தாய்', type: 'verb_past_2sg' },
  { suffix: 'ந்தாய்', type: 'verb_past_2sg' },
  { suffix: 'த்தன', type: 'verb_past_3np' },
  { suffix: 'ந்தன', type: 'verb_past_3np' },
  { suffix: 'ப்போம்', type: 'verb_future_1pl' },
  { suffix: 'வோம்', type: 'verb_future_1pl' },
  { suffix: 'ப்பேன்', type: 'verb_future_1sg' },
  { suffix: 'வேன்', type: 'verb_future_1sg' },
  { suffix: 'ப்பான்', type: 'verb_future_3ms' },
  { suffix: 'வான்', type: 'verb_future_3ms' },
  { suffix: 'ப்பாள்', type: 'verb_future_3fs' },
  { suffix: 'வாள்', type: 'verb_future_3fs' },
  { suffix: 'ப்பாய்', type: 'verb_future_2sg' },
  { suffix: 'வாய்', type: 'verb_future_2sg' },
  { suffix: 'பவர்கள்', type: 'participle_noun' },
  { suffix: 'வர்கள்', type: 'participle_noun' },
  { suffix: 'விட்டு', type: 'verb_completive' },
  { suffix: 'ிட்டு', type: 'verb_completive' },
  { suffix: 'ட்டு', type: 'verb_participle' },

  // Case Markers & Postpositions
  { suffix: 'ிலிருந்து', type: 'case_ablative' },
  { suffix: 'ிலிருந்த', type: 'case_ablative_base' },
  { suffix: 'இருந்து', type: 'case_ablative' },
  { suffix: 'உடைய', type: 'case_genitive' },
  { suffix: 'முடைய', type: 'case_genitive' },
  { suffix: 'னுடைய', type: 'case_genitive' },
  { suffix: 'ுடைய', type: 'case_genitive' },
  { suffix: 'உடன்', type: 'case_sociative' },
  { suffix: 'ுடன்', type: 'case_sociative' },
  { suffix: 'இடம்', type: 'case_locative' },
  { suffix: 'ிடம்', type: 'case_locative' },
  { suffix: 'ற்கு', type: 'case_dative' },
  { suffix: 'க்கு', type: 'case_dative' },
  { suffix: 'உக்கு', type: 'case_dative' },
  { suffix: 'ுக்கு', type: 'case_dative' },
  { suffix: 'ோடு', type: 'case_sociative' },
  { suffix: 'ஓடு', type: 'case_sociative' },
  { suffix: 'ால்', type: 'case_instrumental' },
  { suffix: 'ஆல்', type: 'case_instrumental' },
  { suffix: 'ான்', type: 'case_instrumental' },
  { suffix: 'ஆன்', type: 'case_instrumental' },
  { suffix: 'ில்', type: 'case_locative' },
  { suffix: 'இல்', type: 'case_locative' },
  { suffix: 'ின்', type: 'case_genitive' },
  { suffix: 'இன்', type: 'case_genitive' },
  { suffix: 'ின', type: 'case_genitive_oblique' },
  { suffix: 'ுள்', type: 'case_locative' },
  { suffix: 'உள்', type: 'case_locative' },
  { suffix: 'கண்', type: 'case_locative' },
  { suffix: 'ாது', type: 'case_genitive' },
  { suffix: 'அது', type: 'case_genitive' },
  { suffix: 'யை', type: 'case_accusative' },
  { suffix: 'வை', type: 'case_accusative' },
  { suffix: 'ை', type: 'case_accusative' },
  { suffix: 'ஐ', type: 'case_accusative' },

  // Nominal, Plural & Derivational Markers
  { suffix: 'ானது', type: 'nominalizer' },
  { suffix: 'ஆனது', type: 'nominalizer' },
  { suffix: 'ங்கள்', type: 'plural' },
  { suffix: 'ங்கள', type: 'plural_base' },
  { suffix: 'கள்', type: 'plural' },
  { suffix: 'கள', type: 'plural_base' },
  { suffix: 'மார்', type: 'plural' },
  { suffix: 'மார', type: 'plural_base' },
  { suffix: 'ாக', type: 'adverbial' },
  { suffix: 'ஆக', type: 'adverbial' },
  { suffix: 'ான', type: 'adjectival' },
  { suffix: 'ஆன', type: 'adjectival' },
  { suffix: 'மை', type: 'nominalizer' },

  // Clitics & Discourse Markers
  { suffix: 'தான்', type: 'clitic_emphatic' },
  { suffix: 'போது', type: 'temporal_marker' },
  { suffix: 'விட', type: 'comparative_marker' },
  { suffix: 'ும்', type: 'clitic_inclusive' },
  { suffix: 'உம்', type: 'clitic_inclusive' },
  { suffix: 'ே', type: 'clitic_emphatic' },
  { suffix: 'ஏ', type: 'clitic_emphatic' },
  { suffix: 'ோ', type: 'clitic_doubt' },
  { suffix: 'ஓ', type: 'clitic_doubt' }
];

// Programmatically derive per-rule minimum remaining-root length based on suffix character length tiers:
// - Tier 1: length === 1 (e.g. ே, ஏ, ோ, ஓ, ை, ஐ) -> minRoot = 4
// - Tier 2: length === 2 (e.g. யை, வை, ாக, ஆக, ான, ஆன, ின, கள, மை) -> minRoot = 3
// - Tier 3: length >= 3 (e.g. case markers, tense, PNG suffixes) -> minRoot = 2
export const SORTED_TAMIL_SUFFIXES = TAMIL_SUFFIX_RULES.map(rule => {
  const length = rule.suffix.length;
  const tier = length === 1 ? 1 : (length === 2 ? 2 : 3);
  const minRoot = length === 1 ? 4 : (length === 2 ? 3 : 2);
  return {
    ...rule,
    length,
    tier,
    minRoot
  };
}).sort((a, b) => b.suffix.length - a.suffix.length);

/**
 * Count recognized suffix/morpheme boundaries for a single Tamil word via iterative stripping.
 * Employs per-rule tiered minimum remaining-root thresholds to prevent false positive stripping on short roots.
 * @param {string} word - Tamil word string
 * @returns {number} Count of recognized morpheme boundaries
 */
export function countMorphemeBoundaries(word) {
  if (!word || typeof word !== 'string') return 0;

  // Clean word: remove surrounding punctuation
  let current = word.trim().replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
  if (current.length < 2) return 0;

  let boundaries = 0;
  const maxPasses = 10;

  for (let pass = 0; pass < maxPasses; pass++) {
    let matched = false;
    for (const rule of SORTED_TAMIL_SUFFIXES) {
      if (current.endsWith(rule.suffix)) {
        const remainingLength = current.length - rule.suffix.length;
        if (remainingLength >= rule.minRoot) {
          current = current.slice(0, remainingLength);
          boundaries++;
          matched = true;
          break; // restart search from longest suffix on the shortened stem
        }
      }
    }
    if (!matched) break;
  }

  return boundaries;
}

/**
 * Structural analysis helper for Indic and Latin text
 */
function analyzeTextStructure(text, languageCode) {
  const isTamil = languageCode === 'ta' || (languageCode === 'auto' && /[\u0B80-\u0BFF]/.test(text || ''));

  if (!text || typeof text !== 'string') {
    return {
      sentenceCount: 0,
      wordCount: 0,
      avgSentenceLength: 0,
      avgWordLength: 0,
      typeTokenRatio: 0,
      avgStructuralDifficulty: 0,
      conjunctDensity: 0,
      avgMorphemeBoundariesPerWord: isTamil ? 0 : null,
      tamilStructuralDifficulty: isTamil ? 0 : null
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

  // Tamil-specific morphological structural difficulty
  let avgMorphemeBoundariesPerWord = null;
  let tamilStructuralDifficulty = null;

  if (isTamil) {
    const totalMorphemes = words.reduce((sum, w) => sum + countMorphemeBoundaries(w), 0);
    avgMorphemeBoundariesPerWord = Math.round((totalMorphemes / wordCount) * 10) / 10;
    // Combined score: equal weighting (0.5) of morpheme-chain complexity and conjunct density
    tamilStructuralDifficulty = Math.round(((avgMorphemeBoundariesPerWord * 0.5) + ((conjunctDensity / 100) * 0.5)) * 100) / 100;
  }

  return {
    sentenceCount,
    wordCount,
    avgSentenceLength,
    avgWordLength,
    typeTokenRatio,
    avgStructuralDifficulty,
    conjunctDensity,
    avgMorphemeBoundariesPerWord,
    tamilStructuralDifficulty
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
