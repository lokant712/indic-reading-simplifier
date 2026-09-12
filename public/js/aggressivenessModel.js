/**
 * Adaptive Aggressiveness Scoring Engine (v2 + Addendum)
 * Computes simplification aggressiveness (Level 1–5) based on reading signals,
 * explicit regressions, scroll-back events, pace variance, and manual escalation.
 */

export class AggressivenessModel {
  constructor() {
    this.baselineWpm = null;
    this.baselineCps = null;
    this.currentLevel = 1; // Default starting level
    this.timingHistory = []; // Array of { wordCount, durationSeconds, timePerWord }
  }

  /**
   * Set baseline pace from Paragraph 1 (unmodified)
   */
  setBaseline(wordCount, charCount, durationSeconds) {
    const minutes = Math.max(0.05, durationSeconds / 60);
    this.baselineWpm = Math.max(30, Math.round(wordCount / minutes));
    this.baselineCps = Math.max(2, Math.round((charCount / durationSeconds) * 10) / 10);
    this.currentLevel = 1;

    const timePerWord = durationSeconds / Math.max(1, wordCount);
    this.timingHistory = [{ wordCount, durationSeconds, timePerWord }];

    return {
      baselineWpm: this.baselineWpm,
      baselineCps: this.baselineCps
    };
  }

  /**
   * Calculate aggressiveness for next paragraph based on latest paragraph's signals
   * @param {object} signals - { durationSeconds, wordTapCount, idlePauseCount, selectionCount, manualEscalations, explicitRegressions, scrollBackEvents, paceVarianceFlag }
   * @param {number} wordCount - Word count of the paragraph just read
   * @param {number} charCount - Character count of the paragraph just read
   * @returns {object} { level, strugglePoints, paceRatio, currentWpm, paceVarianceFlag }
   */
  computeNextLevel(signals, wordCount, charCount) {
    if (!this.baselineWpm) {
      return { level: 1, strugglePoints: 0, paceRatio: 1.0, currentWpm: 120, paceVarianceFlag: false };
    }

    const duration = Math.max(0.5, signals.durationSeconds || 1);
    const minutes = duration / 60;
    const currentWpm = Math.round(wordCount / minutes);
    const paceRatio = this.baselineWpm > 0 ? (currentWpm / this.baselineWpm) : 1.0;

    // Track time-per-word for Signal 7 (Pace Variance)
    const timePerWord = duration / Math.max(1, wordCount);
    this.timingHistory.push({ wordCount, durationSeconds: duration, timePerWord });

    let strugglePoints = 0;

    // 1. Pace Signal
    if (paceRatio < 0.60) {
      strugglePoints += 2.0; // Reading at under 60% of baseline pace
    } else if (paceRatio < 0.80) {
      strugglePoints += 1.0; // Reading at 60-80% of baseline pace
    } else if (paceRatio > 1.25 && (signals.wordTapCount || 0) === 0 && (signals.idlePauseCount || 0) === 0 && (signals.explicitRegressions || 0) === 0) {
      strugglePoints -= 1.0; // Reading smoothly/fast -> relax simplification
    }

    // 2. Word Taps Signal (Deliberate struggle)
    const taps = signals.wordTapCount || 0;
    if (taps >= 3) {
      strugglePoints += 2.0;
    } else if (taps >= 1) {
      strugglePoints += 1.0;
    }

    // 3. Idle Pauses (4s+ inactive)
    const pauses = signals.idlePauseCount || 0;
    if (pauses >= 2) {
      strugglePoints += 1.5;
    } else if (pauses >= 1) {
      strugglePoints += 0.8;
    }

    // 4. Text Selection
    const selections = signals.selectionCount || 0;
    if (selections >= 2) {
      strugglePoints += 1.5;
    } else if (selections >= 1) {
      strugglePoints += 0.8;
    }

    // 5. Signal 5: Explicit Regression (Re-reading previous paragraph)
    // Deliberate action: weighted equally to word-level taps (+1.0 per back-nav)
    const regressions = signals.explicitRegressions || 0;
    if (regressions >= 2) {
      strugglePoints += 2.0;
    } else if (regressions >= 1) {
      strugglePoints += 1.0;
    }

    // 6. Signal 6: Passive Scroll-Back (Re-reading within paragraph)
    // Passive behavior: weighted equally to text selection (+0.8 for 1st, +1.2 for 2+)
    const scrollBacks = signals.scrollBackEvents || 0;
    if (scrollBacks >= 2) {
      strugglePoints += 1.2;
    } else if (scrollBacks >= 1) {
      strugglePoints += 0.8;
    }

    // 7. Signal 7: Pace Variance (Erratic reading rhythm across last 3 paragraphs)
    const paceVarianceFlag = Boolean(signals.paceVarianceFlag);
    if (paceVarianceFlag) {
      strugglePoints += 0.5; // Corroborating penalty for erratic pacing
    }

    // 8. Manual "I don't understand" Escalations (Direct action: heavily weighted)
    const manualCount = signals.manualEscalations || 0;
    if (manualCount > 0) {
      strugglePoints += manualCount * 2.5;
    }

    // Adapt current level
    let newLevel = this.currentLevel;

    if (strugglePoints >= 3.0) {
      newLevel = Math.min(5, newLevel + 2);
    } else if (strugglePoints >= 1.0) {
      newLevel = Math.min(5, newLevel + 1);
    } else if (strugglePoints < 0) {
      // Gentle relaxation towards original
      newLevel = Math.max(1, newLevel - 1);
    }

    this.currentLevel = newLevel;

    return {
      level: this.currentLevel,
      strugglePoints: Math.round(strugglePoints * 10) / 10,
      paceRatio: Math.round(paceRatio * 100) / 100,
      currentWpm,
      paceVarianceFlag
    };
  }

  /**
   * Get recent per-word timings for calculating pace variance
   */
  getRecentTimingsPerWord(limit = 3) {
    const recent = this.timingHistory.slice(-limit);
    return recent.map(r => r.timePerWord);
  }

  /**
   * Handle immediate "I don't understand" button click for CURRENT paragraph
   * Escalates level immediately for re-simplification.
   */
  escalateCurrentLevel() {
    this.currentLevel = Math.min(5, this.currentLevel + 1);
    return this.currentLevel;
  }

  getCurrentLevel() {
    return this.currentLevel;
  }
}
