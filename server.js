import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Construct system & user prompts enforcing Section 3 rules strictly.
 */
function buildPrompts(text, languageName, aggressiveness, isManualEscalation, targetWords = []) {
  const aggressivenessDescriptions = {
    1: 'Mild simplification: Break any overly long complex sentences into 2 shorter sentences. Keep vocabulary mostly intact but replace rare archaic words.',
    2: 'Moderate simplification: Split compound sentences into simpler clauses. Replace complex or formal literary words with standard everyday terms.',
    3: 'Standard simplification: Use straightforward sentence structures and accessible everyday vocabulary. Maintain active voice and clear clause connections.',
    4: 'Strong simplification: Break all complex thoughts into short, direct sentences (around 8-12 words each). Use only high-frequency, universally understood vocabulary.',
    5: 'Maximum simplification: Break every sentence into the shortest, simplest possible grammatical structures. Use the simplest everyday words available while strictly preserving 100% of the information.'
  };

  const levelGuide = aggressivenessDescriptions[aggressiveness] || aggressivenessDescriptions[3];
  
  const escalationNote = isManualEscalation
    ? '\nCRITICAL: The reader explicitly tapped "I don\'t understand" on this text. You must make the sentence structures significantly more direct, clearer, and simpler than usual.'
    : '';

  const targetWordsNote = (Array.isArray(targetWords) && targetWords.length > 0)
    ? `\n\n🎯 TARGETED VOCABULARY REPLACEMENT:\nThe reader specifically struggled with or selected these difficult word(s)/phrase(s):\n👉 [${targetWords.join(', ')}]\nYou MUST explicitly replace these specific words with simpler, natural, everyday synonyms or a clearer explanatory sub-phrase in ${languageName || 'the same language'}, while strictly maintaining 100% of the original meaning.`
    : '';

  const systemPrompt = `You are an expert assistive reading engine specializing in Indic languages and multilingual readability.
Your task is to simplify the provided text so that it is easier and faster to read, while strictly adhering to these NON-NEGOTIABLE rules:

1. MEANING PRESERVATION: 100% of the original meaning must be preserved. Nothing communicated in the original text may be lost, changed, or added.
2. NO SUMMARIZATION: Every single fact, detail, and idea in the original paragraph MUST be present in the output. Do NOT cut, condense, or omit anything.
3. HOW TO SIMPLIFY:
   - Break long, nested, or convoluted sentences into multiple shorter, clear sentences.
   - Replace rare, archaic, academic, or difficult vocabulary with simple, natural, everyday words in the SAME language.
   - Use straightforward grammatical phrasing.
4. LANGUAGE & SCRIPT: The simplified output MUST be in the exact same language and script (${languageName || 'same language as input'}). NEVER translate to English or any other language.
5. TARGET AGGRESSIVENESS: Level ${aggressiveness}/5.
   Guideline: ${levelGuide}${escalationNote}${targetWordsNote}
6. OUTPUT FORMAT: Return ONLY the plain simplified text. Do NOT add preamble, quotes, markdown formatting, explanations, or labels like "Simplified:".`;

  const userPrompt = (Array.isArray(targetWords) && targetWords.length > 0)
    ? `Please simplify this ${languageName || 'text'} paragraph and specifically replace the flagged word(s) [${targetWords.join(', ')}] with simpler everyday equivalents in ${languageName || 'the same language'}:\n\n${text}`
    : `Please simplify this ${languageName || 'text'} paragraph according to the rules above:\n\n${text}`;

  return { systemPrompt, userPrompt };
}

/**
 * Primary Provider: Groq API with openai/gpt-oss-120b (fallback: openai/gpt-oss-20b)
 */
async function callGroq(text, languageName, aggressiveness, isManualEscalation, targetWords) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not configured in environment');
  }

  const { systemPrompt, userPrompt } = buildPrompts(text, languageName, aggressiveness, isManualEscalation, targetWords);

  const modelsToTry = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 14000);

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.25,
          max_completion_tokens: 2048
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq HTTP ${response.status} (${model}): ${errText}`);
      }

      const data = await response.json();
      const rawText = data?.choices?.[0]?.message?.content?.trim();

      if (rawText && rawText.length > 0) {
        const cleanedText = rawText.replace(/^```[a-z]*\n?|\n?```$/gi, '').trim();
        return {
          text: cleanedText,
          provider: 'groq',
          model: model
        };
      }
    } catch (err) {
      lastError = err;
      console.warn(`[Groq Failover Attempt] Model ${model} failed:`, err.message);
    }
  }

  throw lastError || new Error('Groq calls exhausted');
}

/**
 * Secondary Provider (Failover): Google Gemini API with gemini-3.5-flash
 */
async function callGemini(text, languageName, aggressiveness, isManualEscalation, targetWords) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment');
  }

  const { systemPrompt, userPrompt } = buildPrompts(text, languageName, aggressiveness, isManualEscalation, targetWords);
  const fullPrompt = `${systemPrompt}\n\n---\n\n${userPrompt}`;

  const modelsToTry = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-1.5-flash'];
  let lastError = null;

  for (const model of modelsToTry) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 14000);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: fullPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 2048
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Gemini HTTP ${response.status} (${model}): ${errText}`);
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (rawText && rawText.length > 0) {
        const cleanedText = rawText.replace(/^```[a-z]*\n?|\n?```$/gi, '').trim();
        return {
          text: cleanedText,
          provider: 'gemini',
          model: model
        };
      }
    } catch (err) {
      lastError = err;
      console.warn(`[Gemini Failover Attempt] Model ${model} failed:`, err.message);
    }
  }

  throw lastError || new Error('Gemini calls exhausted');
}

/**
 * Offline Mechanical Fallback: Rule-based sentence segmentation & punctuation structure cleaner
 */
function offlineMechanicalSimplifier(text, languageName, aggressiveness, targetWords) {
  if (!text || typeof text !== 'string') return { text: '', provider: 'offline-fallback', model: 'rule-based' };

  const sentenceDelimiterRegex = /([.।॥?!;]+[\s\n]+|[.।॥?!;]+$)/g;
  const rawParts = text.split(sentenceDelimiterRegex).filter(Boolean);

  let reconstructedSentences = [];
  let currentSentence = '';

  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i];
    if (/[.।॥?!;]/.test(part)) {
      currentSentence += part.trim();
      if (currentSentence.trim().length > 0) {
        reconstructedSentences.push(currentSentence.trim());
      }
      currentSentence = '';
    } else {
      currentSentence += part;
    }
  }

  if (currentSentence.trim().length > 0) {
    reconstructedSentences.push(currentSentence.trim());
  }

  if (aggressiveness >= 3) {
    const furtherSplit = [];
    for (const sent of reconstructedSentences) {
      if (sent.length > 80 && sent.includes(',')) {
        const subParts = sent.split(/,\s*/);
        const joined = subParts.join('. ');
        furtherSplit.push(joined);
      } else {
        furtherSplit.push(sent);
      }
    }
    reconstructedSentences = furtherSplit;
  }

  const simplifiedOutput = reconstructedSentences.join(' ');

  return {
    text: simplifiedOutput || text,
    provider: 'offline-fallback',
    model: 'rule-based-segmenter'
  };
}

/**
 * API Route: /api/simplify
 * Automatically executes the failover chain: Groq -> Gemini -> Offline Fallback
 */
app.post('/api/simplify', async (req, res) => {
  const {
    text,
    languageName = 'Indic',
    aggressiveness = 3,
    paragraphIndex = 1,
    isManualEscalation = false,
    targetWords = []
  } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({ error: 'Text is required for simplification' });
  }

  const startTime = Date.now();
  const targetWordsStr = (Array.isArray(targetWords) && targetWords.length > 0) ? ` | Targets: [${targetWords.join(', ')}]` : '';
  console.log(`[Simplify Request] Para #${paragraphIndex} | Lang: ${languageName} | Level: ${aggressiveness} | Manual: ${isManualEscalation}${targetWordsStr}`);

  // 1. Try Groq
  try {
    const groqResult = await callGroq(text, languageName, aggressiveness, isManualEscalation, targetWords);
    console.log(`[Success] Served via Groq (${groqResult.model}) in ${Date.now() - startTime}ms`);
    return res.json({
      ...groqResult,
      latencyMs: Date.now() - startTime
    });
  } catch (groqErr) {
    console.warn(`[Failover] Groq failed (${groqErr.message}). Failing over to Gemini...`);
  }

  // 2. Try Gemini
  try {
    const geminiResult = await callGemini(text, languageName, aggressiveness, isManualEscalation, targetWords);
    console.log(`[Success] Served via Gemini (${geminiResult.model}) in ${Date.now() - startTime}ms`);
    return res.json({
      ...geminiResult,
      latencyMs: Date.now() - startTime
    });
  } catch (geminiErr) {
    console.warn(`[Failover] Gemini failed (${geminiErr.message}). Falling back to Offline Simplifier...`);
  }

  // 3. Fallback to Offline Mechanical Simplifier
  const fallbackResult = offlineMechanicalSimplifier(text, languageName, aggressiveness, targetWords);
  console.log(`[Fallback] Served via Offline Mechanical Simplifier in ${Date.now() - startTime}ms`);
  return res.json({
    ...fallbackResult,
    latencyMs: Date.now() - startTime
  });
});

/**
 * Health check / Status route
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    groqConfigured: Boolean(process.env.GROQ_API_KEY?.trim()),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim())
  });
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Adaptive Reading Simplifier v2 running at http://localhost:${PORT}`);
  console.log(`   Groq Key:   ${process.env.GROQ_API_KEY ? 'Configured ✅' : 'Missing ⚠️'}`);
  console.log(`   Gemini Key: ${process.env.GEMINI_API_KEY ? 'Configured ✅' : 'Missing ⚠️'}`);
  console.log(`=======================================================`);
});
