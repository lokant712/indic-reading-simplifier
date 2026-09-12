/**
 * Session Manager (v2 + Addendum)
 * Records paragraph telemetry logs, accumulates 7 reading signals,
 * distinguishes targeted word replacements from whole-paragraph escalations,
 * computes readability deltas, and exports clean session JSON.
 */

export class SessionManager {
  constructor() {
    this.sessionId = 'session_' + Date.now().toString(36);
    this.startTime = Date.now();
    this.detectedLanguage = null;
    this.paragraphs = []; // Array of paragraph log entries
    this.baselineMetrics = null;
  }

  init(detectedLanguage) {
    this.sessionId = 'session_' + Date.now().toString(36);
    this.startTime = Date.now();
    this.detectedLanguage = detectedLanguage;
    this.paragraphs = [];
    this.baselineMetrics = null;
  }

  setBaseline(baselineMetrics) {
    this.baselineMetrics = baselineMetrics;
  }

  logParagraph(entry) {
    const targetWords = Array.isArray(entry.targetWords) ? entry.targetWords : [];
    const manualEscalations = entry.manualEscalationCount || 0;

    let escalationType = 'none';
    if (manualEscalations > 0) {
      escalationType = targetWords.length > 0 ? 'targeted_word_replacement' : 'whole_paragraph';
    }

    this.paragraphs.push({
      paragraphIndex: entry.paragraphIndex,
      originalText: entry.originalText,
      simplifiedText: entry.simplifiedText,
      wasSimplified: entry.paragraphIndex > 1 || Boolean(entry.wasSimplified),
      provider: entry.provider || (entry.paragraphIndex === 1 ? 'original' : 'offline-fallback'),
      model: entry.model || (entry.paragraphIndex === 1 ? 'none' : 'fallback'),
      latencyMs: entry.latencyMs || 0,
      signals: {
        durationSeconds: entry.signals.durationSeconds,
        wordTapCount: entry.signals.wordTapCount,
        tappedWords: entry.signals.tappedWords || [],
        idlePauseCount: entry.signals.idlePauseCount,
        selectionCount: entry.signals.selectionCount,
        selections: entry.signals.selections || [],
        explicitRegressions: entry.signals.explicitRegressions || 0,
        scrollBackEvents: entry.signals.scrollBackEvents || 0,
        paceVarianceFlag: Boolean(entry.signals.paceVarianceFlag),
        wpm: entry.signals.wpm || null,
        paceRatio: entry.signals.paceRatio || null
      },
      // Distinct escalation provenance:
      manualEscalationCount: manualEscalations,
      escalationType,
      targetWords, // Empty array [] if whole-paragraph, or specific words like ["தொன்மையான"]
      readabilityMetrics: entry.readabilityMetrics || null,
      aggressivenessLevel: entry.aggressivenessLevel,
      timestamp: new Date().toISOString()
    });
  }

  getSummary() {
    const totalParas = this.paragraphs.length;
    const totalDuration = this.paragraphs.reduce((acc, p) => acc + (p.signals.durationSeconds || 0), 0);
    const totalWordTaps = this.paragraphs.reduce((acc, p) => acc + (p.signals.wordTapCount || 0), 0);
    const totalIdlePauses = this.paragraphs.reduce((acc, p) => acc + (p.signals.idlePauseCount || 0), 0);
    const totalSelections = this.paragraphs.reduce((acc, p) => acc + (p.signals.selectionCount || 0), 0);
    const totalRegressions = this.paragraphs.reduce((acc, p) => acc + (p.signals.explicitRegressions || 0), 0);
    const totalScrollBacks = this.paragraphs.reduce((acc, p) => acc + (p.signals.scrollBackEvents || 0), 0);
    const totalEscalations = this.paragraphs.reduce((acc, p) => acc + (p.manualEscalationCount || 0), 0);
    const flaggedPaceCount = this.paragraphs.filter(p => p.signals.paceVarianceFlag).length;

    // Differentiate targeted word replacements vs whole-paragraph escalations
    const targetedReplacementParas = this.paragraphs.filter(p => p.escalationType === 'targeted_word_replacement');
    const wholeParagraphEscalationParas = this.paragraphs.filter(p => p.escalationType === 'whole_paragraph');

    const allTargetedWords = Array.from(new Set(
      this.paragraphs.flatMap(p => p.targetWords || [])
    ));

    const providerCounts = { groq: 0, gemini: 0, 'offline-fallback': 0, original: 0 };
    for (const p of this.paragraphs) {
      if (providerCounts[p.provider] !== undefined) {
        providerCounts[p.provider]++;
      } else {
        providerCounts[p.provider] = 1;
      }
    }

    return {
      sessionId: this.sessionId,
      startedAt: new Date(this.startTime).toISOString(),
      completedAt: new Date().toISOString(),
      detectedLanguage: this.detectedLanguage,
      baselineMetrics: this.baselineMetrics,
      totalParagraphs: totalParas,
      totalDurationSeconds: Math.round(totalDuration * 10) / 10,
      totalWordTaps,
      totalIdlePauses,
      totalSelections,
      totalRegressions,
      totalScrollBacks,
      totalEscalations,
      escalationBreakdown: {
        totalTargetedReplacements: targetedReplacementParas.length,
        totalWholeParagraphEscalations: wholeParagraphEscalationParas.length,
        allTargetedWords
      },
      flaggedPaceCount,
      providerCounts,
      paragraphs: this.paragraphs
    };
  }

  exportJson() {
    const summary = this.getSummary();
    const jsonString = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(summary, null, 2));
    const downloadAnchor = document.createElement('a');
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', `reading-session-${summary.detectedLanguage?.code || 'log'}-${timestampStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
}
