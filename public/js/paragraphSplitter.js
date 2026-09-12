/**
 * Robust Paragraph Splitter
 * Splits on double line breaks if present; otherwise groups sentences into ~40-60 word chunks.
 */

export function splitIntoParagraphs(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (normalized.length === 0) return [];

  // 1. Check for natural double linebreaks or multiple newlines
  const rawParagraphs = normalized.split(/\n\s*\n+/).map(p => p.trim()).filter(p => p.length > 0);

  // If there are multiple natural paragraphs, use them directly
  if (rawParagraphs.length > 1) {
    return rawParagraphs;
  }

  // 2. If it's a single block, check if it's already short (<= 75 words)
  const singleBlock = rawParagraphs[0] || normalized;
  const wordCount = singleBlock.split(/\s+/).filter(Boolean).length;
  if (wordCount <= 75) {
    return [singleBlock];
  }

  // 3. Fallback: Group sentences into ~40-60 word chunks
  // Sentence delimiters include Latin . ? ! and Indic danda ।, ॥
  const sentences = splitIntoSentences(singleBlock);
  if (sentences.length <= 1) {
    return [singleBlock];
  }

  const chunks = [];
  let currentChunk = [];
  let currentWords = 0;

  for (const sentence of sentences) {
    const sWords = sentence.split(/\s+/).filter(Boolean).length;

    // If adding this sentence pushes currentChunk beyond 60 words and we already have at least 35 words
    if (currentWords >= 35 && (currentWords + sWords > 60)) {
      chunks.push(currentChunk.join(' '));
      currentChunk = [sentence];
      currentWords = sWords;
    } else {
      currentChunk.push(sentence);
      currentWords += sWords;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join(' '));
  }

  return chunks.length > 0 ? chunks : [singleBlock];
}

/**
 * Helper to split text into sentences across Indic & Latin scripts
 */
function splitIntoSentences(text) {
  // Matches sentence ends followed by space, newline, or end of string
  const regex = /([^.।॥?!;]+[.।॥?!;]+(?:\s+|$)|[^.।॥?!;]+$)/g;
  const matches = text.match(regex);
  if (!matches) return [text];
  return matches.map(s => s.trim()).filter(s => s.length > 0);
}
