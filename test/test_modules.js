import assert from 'assert';
import { detectLanguage } from '../public/js/languageDetector.js';
import { splitIntoParagraphs } from '../public/js/paragraphSplitter.js';
import { AggressivenessModel } from '../public/js/aggressivenessModel.js';
import { SignalTracker } from '../public/js/signalTracker.js';
import { computeReadabilityDelta, countMorphemeBoundaries } from '../public/js/readabilityMetrics.js';

console.log('🧪 Starting Automated Module Test Suite (v2 + Addendum)...\n');

// -------------------------------------------------------------
// Test 1: Language Detection
// -------------------------------------------------------------
console.log('1. Testing Language Detector...');

const tamilSample = 'தமிழ் மொழியானது திராவிட மொழிக் குடும்பத்தின் மிக முக்கியமான மொழிகளில் ஒன்றாகும்.';
const tamilResult = detectLanguage(tamilSample);
assert.strictEqual(tamilResult.code, 'ta', 'Tamil text should be detected as ta');
assert.strictEqual(tamilResult.name, 'Tamil', 'Tamil text should have name Tamil');

const hindiSample = 'हिंदी भारत की सबसे अधिक बोली जाने वाली भाषा है और इसकी लिपि देवनागरी है।';
const hindiResult = detectLanguage(hindiSample);
assert.strictEqual(hindiResult.code, 'hi', 'Hindi text should be detected as hi');
assert.strictEqual(hindiResult.name, 'Hindi', 'Hindi text should have name Hindi');

const teluguSample = 'తెలుగు భారతదేశంలో అత్యధికంగా మాట్లాడే భాషలలో ఒకటి.';
const teluguResult = detectLanguage(teluguSample);
assert.strictEqual(teluguResult.code, 'te', 'Telugu text should be detected as te');

const englishSample = 'Artificial intelligence enables computers to learn from data and assist readers.';
const englishResult = detectLanguage(englishSample);
assert.strictEqual(englishResult.code, 'en', 'English text should be detected as en');

console.log('✅ Language Detector tests passed!\n');

// -------------------------------------------------------------
// Test 2: Paragraph Splitting
// -------------------------------------------------------------
console.log('2. Testing Paragraph Splitter...');

const multiParaText = `Paragraph one with some introductory concepts.

Paragraph two detailing further explanations and deeper analysis.

Paragraph three providing conclusive summaries and final thoughts.`;

const splitResult = splitIntoParagraphs(multiParaText);
assert.strictEqual(splitResult.length, 3, 'Should split into 3 paragraphs on double linebreaks');
assert.strictEqual(splitResult[0], 'Paragraph one with some introductory concepts.');

const longSingleBlock = Array(15).fill('This is a complete sentence that contains important factual statements about language and readability.').join(' ');
const chunkedResult = splitIntoParagraphs(longSingleBlock);
assert.ok(chunkedResult.length >= 2, 'Giant single block should be chunked into multiple paragraphs');

console.log('✅ Paragraph Splitter tests passed!\n');

// -------------------------------------------------------------
// Test 3: Aggressiveness Model & 7 Struggle Signals
// -------------------------------------------------------------
console.log('3. Testing Aggressiveness Model with 7 Signals...');

const model = new AggressivenessModel();
const baseline = model.setBaseline(100, 500, 30);
assert.strictEqual(baseline.baselineWpm, 200, 'Baseline WPM should be 200');

// Scenario A: Smooth fast reading
const fastResult = model.computeNextLevel({
  durationSeconds: 20,
  wordTapCount: 0,
  idlePauseCount: 0,
  selectionCount: 0,
  explicitRegressions: 0,
  scrollBackEvents: 0,
  paceVarianceFlag: false,
  manualEscalations: 0
}, 100, 500);

assert.strictEqual(fastResult.level, 1, 'Fast smooth reading should keep level at 1');

// Scenario B: Explicit Regression + Scroll-back + Pace Variance
const struggleResult = model.computeNextLevel({
  durationSeconds: 60,
  wordTapCount: 1,
  idlePauseCount: 1,
  selectionCount: 0,
  explicitRegressions: 1, // Signal 5
  scrollBackEvents: 1,    // Signal 6
  paceVarianceFlag: true, // Signal 7
  manualEscalations: 0
}, 100, 500);

assert.ok(struggleResult.strugglePoints >= 3.0, `Struggle points should be >= 3.0 (got ${struggleResult.strugglePoints})`);
assert.ok(struggleResult.level >= 2, `Struggle should increase level to at least 2 (got ${struggleResult.level})`);

console.log('✅ Aggressiveness Model & 7 Signals tests passed!\n');

// -------------------------------------------------------------
// Test 4: Signal 7 Pace Variance Computation
// -------------------------------------------------------------
console.log('4. Testing Signal 7 Pace Variance (Erratic Rhythm)...');

// Consistent pacing: 0.30, 0.31, 0.29 seconds per word
const consistentTimings = [0.30, 0.31, 0.29];
const consistentResult = SignalTracker.computePaceVariance(consistentTimings);
assert.strictEqual(consistentResult.flagged, false, 'Consistent pacing should not be flagged');
assert.ok(consistentResult.variance < 0.001, 'Variance should be tiny for consistent pacing');

// Erratic pacing: 0.10, 0.85, 0.12, 0.90 seconds per word (alternating fast and slow)
const erraticTimings = [0.10, 0.85, 0.12, 0.90];
const erraticResult = SignalTracker.computePaceVariance(erraticTimings);
assert.strictEqual(erraticResult.flagged, true, 'Erratic pacing should be flagged as true');
assert.ok(erraticResult.variance > consistentResult.variance, 'Erratic variance should be much higher than consistent');

console.log('✅ Pace Variance tests passed!\n');

// -------------------------------------------------------------
// Test 5: Part B Readability Metrics & Content Preservation
// -------------------------------------------------------------
console.log('5. Testing Automated Readability Metrics & Content Preservation...');

const origText = 'In 2026, Dr. Ramanathan conducted an extensive experimental study on 45 participants to evaluate neural processing speed across complex multilingual syntactic structures.';
const simpText = 'In 2026, Dr. Ramanathan conducted a study. He tested 45 participants. He evaluated neural processing speed across multilingual language structures.';

const deltaResult = computeReadabilityDelta({
  originalText: origText,
  simplifiedText: simpText,
  languageCode: 'en'
});

// 1. Average sentence length should decrease after simplification
assert.ok(deltaResult.avgSentenceLength.after < deltaResult.avgSentenceLength.before, 'Simplified sentence length should be shorter than original');
assert.strictEqual(deltaResult.sentenceCount.before, 1, 'Original should have 1 long sentence');
assert.strictEqual(deltaResult.sentenceCount.after, 3, 'Simplified should have 3 shorter sentences');

// 2. Factual preservation: numbers 2026 and 45 must be 100% preserved
assert.strictEqual(deltaResult.numberRetentionPct, 100, 'Numbers 2026 and 45 must have 100% retention');
assert.deepStrictEqual(deltaResult.numbersFound.original, ['2026', '45'], 'Should find numbers 2026 and 45');

// 3. Proper noun preservation: Ramanathan must be 100% retained
assert.strictEqual(deltaResult.properNounRetentionPct, 100, 'Proper noun Ramanathan must be 100% retained');

// 4. Word count ratio should be >= 0.85 (confirming no factual cutting)
assert.ok(deltaResult.wordCountRatio >= 0.85, 'Word count ratio should reflect full content preservation');

// Indic Conjunct Density test (Tamil)
const tamilOrig = 'சங்க இலக்கியங்கள் தொல்காப்பியம் போன்ற இலக்கண நூல்களைக் கொண்டுள்ளன.';
const tamilSimp = 'சங்க இலக்கியங்கள் தொல்காப்பிய நூல்களைக் கொண்டுள்ளன.';
const tamilDelta = computeReadabilityDelta({
  originalText: tamilOrig,
  simplifiedText: tamilSimp,
  languageCode: 'ta'
});
assert.ok(tamilDelta.conjunctDensity.before > 0, 'Indic text should have measurable conjunct density');

// Tamil Morpheme Boundary & Morphological-Structural Difficulty Tests
// 1. Chained suffixes (case-marked + further inflected/chained form) -> count > 1
const multiSuffixWord = 'மரத்தினால்'; // மரம் + இன் + ஆல்
assert.ok(countMorphemeBoundaries(multiSuffixWord) > 1, `Chained suffix word ${multiSuffixWord} should have > 1 morpheme boundaries`);
const multiSuffixWord2 = 'அவர்களுடைய'; // அவர் + கள் + உடைய
assert.ok(countMorphemeBoundaries(multiSuffixWord2) > 1, `Chained suffix word ${multiSuffixWord2} should have > 1 morpheme boundaries`);

// 2. Bare Tamil root with no suffix -> count === 0
const bareRoot1 = 'மரம்';
const bareRoot2 = 'தமிழ்';
const bareRoot3 = 'நூல்';
assert.strictEqual(countMorphemeBoundaries(bareRoot1), 0, `Bare root ${bareRoot1} should have 0 morpheme boundaries`);
assert.strictEqual(countMorphemeBoundaries(bareRoot2), 0, `Bare root ${bareRoot2} should have 0 morpheme boundaries`);
assert.strictEqual(countMorphemeBoundaries(bareRoot3), 0, `Bare root ${bareRoot3} should have 0 morpheme boundaries`);

// 3. False-Positive Resistance: real dictionary root words ending in short vowel/clitic characters (e.g. -ை, -மை) inherently
const fpRoot1 = 'மலை'; // 'mountain' (length 3, ends in ை; remaining root 'மல' < 4 chars required by Tier 1)
const fpRoot2 = 'தலை'; // 'head' (length 3, ends in ை; remaining root 'தல' < 4 chars required by Tier 1)
const fpRoot3 = 'விலை'; // 'price' (length 4, ends in ை; remaining root 'வில' < 4 chars required by Tier 1)
const fpRoot4 = 'ஆமை'; // 'turtle' (length 3, ends in மை; remaining root 'ஆ' < 3 chars required by Tier 2)
assert.strictEqual(countMorphemeBoundaries(fpRoot1), 0, `Dictionary root word ${fpRoot1} ending in ை should return 0 morphemes`);
assert.strictEqual(countMorphemeBoundaries(fpRoot2), 0, `Dictionary root word ${fpRoot2} ending in ை should return 0 morphemes`);
assert.strictEqual(countMorphemeBoundaries(fpRoot3), 0, `Dictionary root word ${fpRoot3} ending in ை should return 0 morphemes`);
assert.strictEqual(countMorphemeBoundaries(fpRoot4), 0, `Dictionary root word ${fpRoot4} ending in மை should return 0 morphemes`);

// 4. computeReadabilityDelta() on Tamil pair should populate tamilStructuralDifficulty as a number (not null)
assert.ok(tamilDelta.tamilStructuralDifficulty !== null, 'Tamil delta should populate tamilStructuralDifficulty');
assert.strictEqual(typeof tamilDelta.tamilStructuralDifficulty.before, 'number', 'tamilStructuralDifficulty.before must be a number');
assert.strictEqual(typeof tamilDelta.tamilStructuralDifficulty.after, 'number', 'tamilStructuralDifficulty.after must be a number');
assert.strictEqual(typeof tamilDelta.tamilStructuralDifficulty.delta, 'number', 'tamilStructuralDifficulty.delta must be a number');
assert.ok(tamilDelta.avgMorphemeBoundariesPerWord !== null, 'Tamil delta should populate avgMorphemeBoundariesPerWord');
assert.strictEqual(typeof tamilDelta.avgMorphemeBoundariesPerWord.before, 'number', 'avgMorphemeBoundariesPerWord.before must be a number');

// 4. computeReadabilityDelta() on English or Hindi pair should return tamilStructuralDifficulty: null
const hindiDelta = computeReadabilityDelta({
  originalText: 'कृत्रिम बुद्धिमत्ता के विकास ने आधुनिक समाज में परिवर्तन किया है।',
  simplifiedText: 'एआई तकनीक ने नए समाज में बदलाव लाया है।',
  languageCode: 'hi'
});
assert.strictEqual(hindiDelta.tamilStructuralDifficulty, null, 'Hindi delta must return tamilStructuralDifficulty as null');
assert.strictEqual(hindiDelta.avgMorphemeBoundariesPerWord, null, 'Hindi delta must return avgMorphemeBoundariesPerWord as null');

const englishDelta = computeReadabilityDelta({
  originalText: 'Artificial intelligence enables computers to assist readers efficiently.',
  simplifiedText: 'AI helps people read easily.',
  languageCode: 'en'
});
assert.strictEqual(englishDelta.tamilStructuralDifficulty, null, 'English delta must return tamilStructuralDifficulty as null');
assert.strictEqual(englishDelta.avgMorphemeBoundariesPerWord, null, 'English delta must return avgMorphemeBoundariesPerWord as null');

console.log('✅ Automated Readability Metrics & Tamil Morphological Difficulty tests passed!\n');

// -------------------------------------------------------------
// Test 6: Distinct Targeted Word Replacement Logging
// -------------------------------------------------------------
console.log('6. Testing Distinct Targeted vs Whole-Paragraph Escalation Logging...');

import { SessionManager } from '../public/js/sessionManager.js';

const session = new SessionManager();
session.init({ code: 'ta', name: 'Tamil' });

// Para 1: Whole paragraph escalation
session.logParagraph({
  paragraphIndex: 1,
  originalText: 'Original para 1',
  simplifiedText: 'Simplified para 1',
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  signals: { durationSeconds: 20, wordTapCount: 0, idlePauseCount: 0, selectionCount: 0 },
  manualEscalationCount: 1,
  targetWords: [], // Whole paragraph
  aggressivenessLevel: 2
});

// Para 2: Targeted word replacement
session.logParagraph({
  paragraphIndex: 2,
  originalText: 'Original para 2 with difficult word',
  simplifiedText: 'Simplified para 2 with simple word',
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  signals: { durationSeconds: 25, wordTapCount: 2, tappedWords: ['difficult'], idlePauseCount: 0, selectionCount: 0 },
  manualEscalationCount: 1,
  targetWords: ['difficult'], // Distinct targeted word
  aggressivenessLevel: 3
});

const sessionSummary = session.getSummary();

// Verify paragraph 1 is logged as whole_paragraph
assert.strictEqual(sessionSummary.paragraphs[0].escalationType, 'whole_paragraph', 'Para 1 should be whole_paragraph escalation');
assert.deepStrictEqual(sessionSummary.paragraphs[0].targetWords, [], 'Para 1 targetWords should be empty');

// Verify paragraph 2 is logged as targeted_word_replacement
assert.strictEqual(sessionSummary.paragraphs[1].escalationType, 'targeted_word_replacement', 'Para 2 should be targeted_word_replacement');
assert.deepStrictEqual(sessionSummary.paragraphs[1].targetWords, ['difficult'], 'Para 2 targetWords should contain "difficult"');

// Verify summary breakdown
assert.strictEqual(sessionSummary.escalationBreakdown.totalTargetedReplacements, 1, 'Should count 1 targeted replacement');
assert.strictEqual(sessionSummary.escalationBreakdown.totalWholeParagraphEscalations, 1, 'Should count 1 whole paragraph escalation');
assert.deepStrictEqual(sessionSummary.escalationBreakdown.allTargetedWords, ['difficult'], 'Should list all targeted words');

console.log('✅ Distinct Targeted Escalation Logging tests passed!\n');

console.log('🎉 ALL TESTS (v2 + Addendum + Targeted Telemetry) PASSED SUCCESSFULLY!');
