import { detectLanguage } from './languageDetector.js';
import { splitIntoParagraphs } from './paragraphSplitter.js';
import { SignalTracker } from './signalTracker.js';
import { AggressivenessModel } from './aggressivenessModel.js';
import { SessionManager } from './sessionManager.js';
import { computeReadabilityDelta } from './readabilityMetrics.js';

class ReadingSimplifierApp {
  constructor() {
    this.paragraphs = [];
    this.currentIndex = 0;
    this.currentDisplayedText = '';
    this.currentOriginalText = '';
    this.currentProvider = 'original';
    this.currentModel = 'none';
    this.currentLatency = 0;
    this.detectedLanguage = null;
    this.manualEscalationsForCurrentPara = 0;
    this.explicitRegressionsForCurrentPara = 0;
    this.targetWordsForCurrentPara = [];
    this.isSimplifying = false;

    // Cache of simplified texts so navigating back/forth is instantaneous
    this.paragraphHistoryCache = new Map();

    this.signalTracker = new SignalTracker({
      onSignalUpdate: this.handleLiveSignalUpdate.bind(this)
    });
    this.aggressivenessModel = new AggressivenessModel();
    this.sessionManager = new SessionManager();

    this.initDOMElements();
    this.bindEvents();
    this.checkServerStatus();
  }

  initDOMElements() {
    // Views
    this.viewInput = document.getElementById('view-input');
    this.viewReading = document.getElementById('view-reading');
    this.viewSummary = document.getElementById('view-summary');

    // Input Screen
    this.inputText = document.getElementById('input-text');
    this.fileInput = document.getElementById('file-input');
    this.btnStart = document.getElementById('btn-start');
    this.inputLangBadge = document.getElementById('input-lang-badge');
    this.inputStats = document.getElementById('input-stats');

    // Reading Screen
    this.readingViewport = document.getElementById('reading-viewport');
    this.readingContainer = document.getElementById('reading-container');
    this.progressIndicator = document.getElementById('progress-indicator');
    this.readingLangBadge = document.getElementById('reading-lang-badge');
    this.providerBadge = document.getElementById('provider-badge');
    this.aggressivenessBadge = document.getElementById('aggressiveness-badge');
    this.liveTimerBadge = document.getElementById('live-timer-badge');
    this.liveTapsBadge = document.getElementById('live-taps-badge');
    this.liveRegrBadge = document.getElementById('live-regr-badge');
    this.btnPrev = document.getElementById('btn-prev');
    this.btnSimplifyCurrent = document.getElementById('btn-simplify-current');
    this.btnNext = document.getElementById('btn-next');
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadingMessage = document.getElementById('loading-message');

    // Summary Screen
    this.summaryMetrics = document.getElementById('summary-metrics');
    this.summaryParagraphs = document.getElementById('summary-paragraphs');
    this.btnExportJson = document.getElementById('btn-export-json');
    this.btnRestart = document.getElementById('btn-restart');

    // Timer Interval
    this.timerInterval = null;
  }

  bindEvents() {
    // Input Screen Live Stats & Lang Detection
    this.inputText.addEventListener('input', () => {
      this.updateInputLiveStats();
    });

    // File Upload
    this.fileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        this.inputText.value = event.target?.result || '';
        this.updateInputLiveStats();
      };
      reader.readAsText(file);
    });

    // Start Reading
    this.btnStart.addEventListener('click', () => {
      this.startReadingFlow();
    });

    // Signal 5: "◀ Re-read previous paragraph" (Explicit Regression)
    this.btnPrev.addEventListener('click', () => {
      this.handlePrevParagraphClick();
    });

    // "I don't understand — simplify this"
    this.btnSimplifyCurrent.addEventListener('click', () => {
      this.handleManualSimplifyClick();
    });

    // "Next Paragraph"
    this.btnNext.addEventListener('click', () => {
      this.handleNextParagraphClick();
    });

    // Export JSON
    this.btnExportJson.addEventListener('click', () => {
      this.sessionManager.exportJson();
    });

    // Restart
    this.btnRestart.addEventListener('click', () => {
      this.resetToInputView();
    });
  }

  async checkServerStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      console.log('Server status:', data);
    } catch (e) {
      console.warn('Could not contact server status endpoint', e);
    }
  }

  updateInputLiveStats() {
    const text = this.inputText.value.trim();
    if (text.length === 0) {
      this.inputLangBadge.textContent = 'Auto-Detect';
      this.inputLangBadge.className = 'badge badge-muted';
      this.inputStats.textContent = '0 paragraphs | 0 words';
      this.btnStart.disabled = true;
      return;
    }

    const lang = detectLanguage(text);
    this.inputLangBadge.textContent = `${lang.name} (${lang.script})`;
    this.inputLangBadge.className = 'badge badge-primary';

    const rawParas = splitIntoParagraphs(text);
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    this.inputStats.textContent = `${rawParas.length} paragraph${rawParas.length > 1 ? 's' : ''} | ~${wordCount} words`;
    this.btnStart.disabled = rawParas.length === 0;
  }

  startReadingFlow() {
    const text = this.inputText.value.trim();
    if (!text) return;

    this.paragraphs = splitIntoParagraphs(text);
    if (this.paragraphs.length === 0) return;

    this.detectedLanguage = detectLanguage(text);
    this.currentIndex = 0;
    this.paragraphHistoryCache.clear();
    this.sessionManager.init(this.detectedLanguage);

    if (this.detectedLanguage.font) {
      this.readingContainer.style.fontFamily = this.detectedLanguage.font;
    }

    this.viewInput.classList.add('hidden');
    this.viewSummary.classList.add('hidden');
    this.viewReading.classList.remove('hidden');

    this.displayParagraph(0);
  }

  /**
   * Display paragraph at index
   */
  async displayParagraph(index) {
    this.currentIndex = index;
    this.manualEscalationsForCurrentPara = 0;
    this.explicitRegressionsForCurrentPara = 0;
    this.targetWordsForCurrentPara = [];
    this.currentOriginalText = this.paragraphs[index];

    // Update Progress Indicator & Prev button visibility
    this.progressIndicator.textContent = `Paragraph ${index + 1} of ${this.paragraphs.length}`;
    this.readingLangBadge.textContent = this.detectedLanguage.name;
    this.btnNext.textContent = (index === this.paragraphs.length - 1) ? 'Finish & View Summary' : 'Next Paragraph →';
    this.btnSimplifyCurrent.textContent = `⚠️ I don't understand — simplify this`;
    this.btnSimplifyCurrent.classList.remove('btn-highlight-action');

    if (index > 0) {
      this.btnPrev.classList.remove('hidden');
    } else {
      this.btnPrev.classList.add('hidden');
    }

    // Check if we have a cached version for this paragraph
    const cached = this.paragraphHistoryCache.get(index);

    if (index === 0) {
      // Paragraph 1: 100% UNMODIFIED baseline
      this.currentDisplayedText = this.currentOriginalText;
      this.currentProvider = 'original';
      this.currentModel = 'baseline';
      this.currentLatency = 0;
      this.renderTextTokens(this.currentDisplayedText);
      this.updateProviderBadge('original', 'Baseline (Unmodified)');
      this.updateAggressivenessBadge(1, 'Baseline Calibration');
      this.startSignalTracking();
    } else if (cached) {
      // Use cached simplification
      this.currentDisplayedText = cached.text;
      this.currentProvider = cached.provider;
      this.currentModel = cached.model;
      this.currentLatency = cached.latencyMs;
      this.renderTextTokens(this.currentDisplayedText);
      this.updateProviderBadge(this.currentProvider, this.getProviderLabel(this.currentProvider, this.currentModel));
      this.updateAggressivenessBadge(cached.level);
      this.startSignalTracking();
    } else {
      // Paragraph 2..N: Simplify adaptively
      const targetLevel = this.aggressivenessModel.getCurrentLevel();
      this.showLoading(true, `Simplifying Paragraph ${index + 1} for optimal reading...`);

      try {
        const response = await this.fetchSimplification(this.currentOriginalText, targetLevel, false);
        this.currentDisplayedText = response.text || this.currentOriginalText;
        this.currentProvider = response.provider || 'offline-fallback';
        this.currentModel = response.model || 'fallback';
        this.currentLatency = response.latencyMs || 0;

        // Cache result
        this.paragraphHistoryCache.set(index, {
          text: this.currentDisplayedText,
          provider: this.currentProvider,
          model: this.currentModel,
          latencyMs: this.currentLatency,
          level: targetLevel
        });

        this.renderTextTokens(this.currentDisplayedText);
        this.updateProviderBadge(this.currentProvider, this.getProviderLabel(this.currentProvider, this.currentModel));
        this.updateAggressivenessBadge(targetLevel);
      } catch (err) {
        console.error('Simplification error:', err);
        this.currentDisplayedText = this.currentOriginalText;
        this.currentProvider = 'offline-fallback';
        this.renderTextTokens(this.currentDisplayedText);
        this.updateProviderBadge('offline-fallback', 'Offline Fallback Used');
      } finally {
        this.showLoading(false);
        this.startSignalTracking();
      }
    }
  }

  /**
   * Render word tokens so each word can be clicked/tapped
   */
  renderTextTokens(text) {
    this.readingContainer.innerHTML = '';
    const tokens = text.split(/(\s+|[.,;।॥?!]+)/);
    const fragment = document.createDocumentFragment();

    for (const token of tokens) {
      if (!token) continue;
      if (/^\s+$/.test(token)) {
        fragment.appendChild(document.createTextNode(token));
      } else if (/^[.,;।॥?!]+$/.test(token)) {
        const punctSpan = document.createElement('span');
        punctSpan.className = 'punct-token';
        punctSpan.textContent = token;
        fragment.appendChild(punctSpan);
      } else {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word-token';
        wordSpan.setAttribute('data-word', token);
        wordSpan.textContent = token;
        wordSpan.title = 'Tap if this word is confusing';
        fragment.appendChild(wordSpan);
      }
    }

    this.readingContainer.appendChild(fragment);
    if (this.readingViewport) {
      this.readingViewport.scrollTop = 0;
    }
  }

  startSignalTracking() {
    this.signalTracker.start(this.readingContainer, this.readingViewport);
    if (this.timerInterval) clearInterval(this.timerInterval);

    this.liveTimerBadge.textContent = '⏱️ 0.0s';
    this.liveTapsBadge.textContent = '👆 0 taps';

    this.timerInterval = setInterval(() => {
      const snap = this.signalTracker.getSignalsSnapshot();
      if (snap) {
        this.liveTimerBadge.textContent = `⏱️ ${snap.durationSeconds.toFixed(1)}s`;
      }
    }, 200);
  }

  handleLiveSignalUpdate(signals) {
    this.liveTapsBadge.textContent = `👆 ${signals.wordTapCount} tap${signals.wordTapCount === 1 ? '' : 's'}`;
    if (signals.scrollBackEvents > 0) {
      this.liveTimerBadge.title = `${signals.scrollBackEvents} scroll-back(s) detected`;
    }

    // Dynamically update button label if words are specifically flagged
    if (signals.wordTapCount > 0) {
      this.btnSimplifyCurrent.textContent = `⚠️ Replace ${signals.wordTapCount} flagged word${signals.wordTapCount > 1 ? 's' : ''} & simplify`;
      this.btnSimplifyCurrent.classList.add('btn-highlight-action');
    } else {
      this.btnSimplifyCurrent.textContent = `⚠️ I don't understand — simplify this`;
      this.btnSimplifyCurrent.classList.remove('btn-highlight-action');
    }
  }

  /**
   * Signal 5: Handle "◀ Re-read previous paragraph" (Explicit Regression)
   */
  handlePrevParagraphClick() {
    if (this.currentIndex <= 0 || this.isSimplifying) return;

    // Log explicit regression against the paragraph the user just left
    this.explicitRegressionsForCurrentPara++;
    this.signalTracker.recordExplicitRegression(this.currentIndex + 1);

    // Collect current signals and log this paragraph before navigating back
    const finalSignals = this.collectCurrentSignals();
    this.saveParagraphLog(finalSignals);

    // Navigate to previous paragraph
    this.displayParagraph(this.currentIndex - 1);
  }

  /**
   * Manual "I don't understand — simplify this" handler with TARGETED WORD REPLACEMENT
   */
  async handleManualSimplifyClick() {
    if (this.isSimplifying) return;
    this.isSimplifying = true;
    this.manualEscalationsForCurrentPara++;

    // Collect flagged words and any active text selection
    const activeSelection = window.getSelection()?.toString()?.trim();
    const tappedWords = Array.from(this.signalTracker.tappedWordsSet || []);
    const targetWords = [...tappedWords];
    if (activeSelection && activeSelection.length > 1 && !targetWords.includes(activeSelection)) {
      targetWords.push(activeSelection);
    }

    if (targetWords.length > 0) {
      this.targetWordsForCurrentPara = [...new Set([...this.targetWordsForCurrentPara, ...targetWords])];
    }

    const escalatedLevel = this.aggressivenessModel.escalateCurrentLevel();
    this.updateAggressivenessBadge(escalatedLevel, 'Escalated Level');

    const loadingMsg = targetWords.length > 0
      ? `Replacing "${targetWords.slice(0, 2).join(', ')}${targetWords.length > 2 ? '...' : ''}" with simpler words (Level ${escalatedLevel})...`
      : `Re-simplifying current paragraph (Level ${escalatedLevel})...`;

    this.showLoading(true, loadingMsg);

    try {
      const response = await this.fetchSimplification(this.currentOriginalText, escalatedLevel, true, targetWords);
      this.currentDisplayedText = response.text || this.currentDisplayedText;
      this.currentProvider = response.provider || 'offline-fallback';
      this.currentModel = response.model || 'fallback';
      this.currentLatency = response.latencyMs || 0;

      // Update cache
      this.paragraphHistoryCache.set(this.currentIndex, {
        text: this.currentDisplayedText,
        provider: this.currentProvider,
        model: this.currentModel,
        latencyMs: this.currentLatency,
        level: escalatedLevel
      });

      this.renderTextTokens(this.currentDisplayedText);
      this.updateProviderBadge(this.currentProvider, this.getProviderLabel(this.currentProvider, this.currentModel));
    } catch (err) {
      console.error('Escalation simplification error:', err);
    } finally {
      this.showLoading(false);
      this.isSimplifying = false;
    }
  }

  /**
   * "Next Paragraph" click handler
   */
  async handleNextParagraphClick() {
    if (this.isSimplifying) return;

    const finalSignals = this.collectCurrentSignals();
    this.saveParagraphLog(finalSignals);

    if (this.currentIndex + 1 < this.paragraphs.length) {
      this.displayParagraph(this.currentIndex + 1);
    } else {
      this.showSummaryView();
    }
  }

  collectCurrentSignals() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    const finalSignals = this.signalTracker.stop() || {
      durationSeconds: 1,
      wordTapCount: 0,
      tappedWords: [],
      idlePauseCount: 0,
      selectionCount: 0,
      selections: [],
      explicitRegressions: 0,
      scrollBackEvents: 0
    };

    finalSignals.manualEscalations = this.manualEscalationsForCurrentPara;
    finalSignals.explicitRegressions = Math.max(finalSignals.explicitRegressions, this.explicitRegressionsForCurrentPara);

    // Compute Signal 7 (Pace Variance) across last 3 paragraph per-word timings
    const recentTimings = this.aggressivenessModel.getRecentTimingsPerWord(3);
    const wordCount = this.currentOriginalText.split(/\s+/).filter(Boolean).length;
    const currentDuration = finalSignals.durationSeconds || 1;
    const currentTimingPerWord = currentDuration / Math.max(1, wordCount);
    const allTimings = [...recentTimings, currentTimingPerWord];

    const paceVarianceResult = SignalTracker.computePaceVariance(allTimings);
    finalSignals.paceVarianceFlag = paceVarianceResult.flagged;
    finalSignals.paceVarianceValue = paceVarianceResult.variance;

    return finalSignals;
  }

  saveParagraphLog(finalSignals) {
    const wordCount = this.currentOriginalText.split(/\s+/).filter(Boolean).length;
    const charCount = this.currentOriginalText.length;

    let computedPaceRatio = null;
    let computedWpm = null;

    if (this.currentIndex === 0) {
      const baseline = this.aggressivenessModel.setBaseline(wordCount, charCount, finalSignals.durationSeconds);
      this.sessionManager.setBaseline(baseline);
      computedWpm = baseline.baselineWpm;
      computedPaceRatio = 1.0;
    } else {
      const nextResult = this.aggressivenessModel.computeNextLevel(finalSignals, wordCount, charCount);
      computedWpm = nextResult.currentWpm;
      computedPaceRatio = nextResult.paceRatio;
    }

    finalSignals.wpm = computedWpm;
    finalSignals.paceRatio = computedPaceRatio;

    // Compute Part B Readability Delta
    const readabilityMetrics = computeReadabilityDelta({
      originalText: this.currentOriginalText,
      simplifiedText: this.currentDisplayedText,
      languageCode: this.detectedLanguage?.code || 'auto'
    });

    this.sessionManager.logParagraph({
      paragraphIndex: this.currentIndex + 1,
      originalText: this.currentOriginalText,
      simplifiedText: this.currentDisplayedText,
      provider: this.currentProvider,
      model: this.currentModel,
      latencyMs: this.currentLatency,
      signals: finalSignals,
      readabilityMetrics,
      manualEscalationCount: this.manualEscalationsForCurrentPara,
      targetWords: this.targetWordsForCurrentPara,
      aggressivenessLevel: this.aggressivenessModel.getCurrentLevel()
    });
  }

  async fetchSimplification(text, aggressiveness, isManualEscalation, targetWords = []) {
    const payload = {
      text,
      languageName: this.detectedLanguage.name,
      aggressiveness,
      paragraphIndex: this.currentIndex + 1,
      totalParagraphs: this.paragraphs.length,
      isManualEscalation,
      targetWords
    };

    const response = await fetch('/api/simplify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    return await response.json();
  }

  updateProviderBadge(provider, label) {
    this.providerBadge.textContent = label;
    this.providerBadge.className = 'badge';

    if (provider === 'groq') {
      this.providerBadge.classList.add('badge-groq');
    } else if (provider === 'gemini') {
      this.providerBadge.classList.add('badge-gemini');
    } else if (provider === 'offline-fallback') {
      this.providerBadge.classList.add('badge-fallback');
    } else {
      this.providerBadge.classList.add('badge-baseline');
    }
  }

  getProviderLabel(provider, model) {
    if (provider === 'groq') {
      return `Simplified via Groq (${model || 'openai/gpt-oss-120b'})`;
    }
    if (provider === 'gemini') {
      return `Simplified via Gemini (${model || 'gemini-3.5-flash'})`;
    }
    if (provider === 'offline-fallback') {
      return 'Offline fallback used';
    }
    return 'Original Text (Baseline)';
  }

  updateAggressivenessBadge(level, customLabel) {
    const labels = {
      1: 'Level 1: Mild',
      2: 'Level 2: Moderate',
      3: 'Level 3: Standard',
      4: 'Level 4: Strong',
      5: 'Level 5: Maximum'
    };
    this.aggressivenessBadge.textContent = customLabel ? `${customLabel} (${level}/5)` : `Aggressiveness: ${labels[level] || `Level ${level}`}`;
  }

  showLoading(show, message = 'Simplifying text...') {
    if (show) {
      this.loadingMessage.textContent = message;
      this.loadingOverlay.classList.remove('hidden');
    } else {
      this.loadingOverlay.classList.add('hidden');
    }
  }

  showSummaryView() {
    this.viewReading.classList.add('hidden');
    this.viewSummary.classList.remove('hidden');

    const summary = this.sessionManager.getSummary();
    this.renderSummaryMetrics(summary);
    this.renderSummaryParagraphs(summary.paragraphs);
  }

  renderSummaryMetrics(summary) {
    const baselineWpm = summary.baselineMetrics?.baselineWpm || 'N/A';
    const totalTimeMin = (summary.totalDurationSeconds / 60).toFixed(1);

    this.summaryMetrics.innerHTML = `
      <div class="metric-card">
        <div class="metric-title">Language</div>
        <div class="metric-value">${summary.detectedLanguage?.name || 'Indic'}</div>
        <div class="metric-sub">${summary.detectedLanguage?.script || ''}</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Paragraphs Read</div>
        <div class="metric-value">${summary.totalParagraphs}</div>
        <div class="metric-sub">${summary.totalDurationSeconds}s total (${totalTimeMin}m)</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Baseline Pace</div>
        <div class="metric-value">${baselineWpm} <span class="metric-unit">WPM</span></div>
        <div class="metric-sub">Calibrated on Para 1</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Struggle Signals (7)</div>
        <div class="metric-value">${summary.totalWordTaps + summary.totalIdlePauses + summary.totalRegressions + summary.totalScrollBacks + summary.totalEscalations}</div>
        <div class="metric-sub">${summary.totalWordTaps} taps | ${summary.escalationBreakdown?.totalTargetedReplacements || 0} targeted | ${summary.escalationBreakdown?.totalWholeParagraphEscalations || 0} full-para</div>
      </div>
      <div class="metric-card">
        <div class="metric-title">Provider Distribution</div>
        <div class="metric-value">
          <span class="prov-tag prov-groq">${summary.providerCounts.groq || 0} Groq</span>
          <span class="prov-tag prov-gemini">${summary.providerCounts.gemini || 0} Gemini</span>
          <span class="prov-tag prov-fall">${summary.providerCounts['offline-fallback'] || 0} Fallback</span>
        </div>
        <div class="metric-sub">Silent Failover Chain</div>
      </div>
    `;
  }

  renderSummaryParagraphs(paragraphs) {
    this.summaryParagraphs.innerHTML = '';

    paragraphs.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'summary-para-card';

      const providerBadgeClass = p.provider === 'groq' ? 'badge-groq' : (p.provider === 'gemini' ? 'badge-gemini' : (p.provider === 'offline-fallback' ? 'badge-fallback' : 'badge-baseline'));
      const read = p.readabilityMetrics;

      card.innerHTML = `
        <div class="summary-para-header">
          <div class="summary-para-title">Paragraph ${p.paragraphIndex} ${p.paragraphIndex === 1 ? '(Baseline Pace Reference)' : ''}</div>
          <div class="summary-para-meta">
            <span class="badge ${providerBadgeClass}">${p.provider} (${p.model})</span>
            <span class="badge badge-muted">Level ${p.aggressivenessLevel}/5</span>
            <span class="badge badge-muted">⏱️ ${p.signals.durationSeconds}s</span>
          </div>
        </div>
        <div class="summary-para-body">
          <div class="summary-text-box">
            <div class="summary-box-label">Original Text:</div>
            <div class="summary-text-content">${p.originalText}</div>
          </div>
          ${(p.paragraphIndex > 1 || (p.simplifiedText && p.simplifiedText !== p.originalText) || p.manualEscalationCount > 0) ? `
            <div class="summary-text-box">
              <div class="summary-box-label">Simplified Output ${p.paragraphIndex === 1 ? '(Simplified on Reader Request)' : ''}:</div>
              <div class="summary-text-content highlight-simplified">${p.simplifiedText}</div>
            </div>
          ` : ''}
        </div>
        <div class="summary-signals-footer">
          <span class="signal-tag">👆 ${p.signals.wordTapCount} Word Taps${p.signals.tappedWords?.length ? ` (${p.signals.tappedWords.join(', ')})` : ''}</span>
          <span class="signal-tag">⏳ ${p.signals.idlePauseCount} Idle Pauses (4s+)</span>
          <span class="signal-tag">📝 ${p.signals.selectionCount} Selections</span>
          <span class="signal-tag ${p.signals.explicitRegressions > 0 ? 'signal-highlight' : ''}">◀ ${p.signals.explicitRegressions} Explicit Regressions</span>
          <span class="signal-tag ${p.signals.scrollBackEvents > 0 ? 'signal-highlight' : ''}">📜 ${p.signals.scrollBackEvents} Scroll-Backs</span>
          ${p.signals.paceVarianceFlag ? '<span class="signal-tag signal-highlight">⚡ Erratic Rhythm (High Variance)</span>' : ''}
          ${p.manualEscalationCount > 0 ? (
            p.escalationType === 'targeted_word_replacement' && p.targetWords?.length > 0
              ? `<span class="signal-tag signal-highlight">🎯 Targeted Word Replacement (${p.targetWords.join(', ')})</span>`
              : `<span class="signal-tag signal-highlight">⚠️ Whole-Paragraph Escalation (${p.manualEscalationCount}x)</span>`
          ) : ''}
        </div>

        ${((p.paragraphIndex > 1 || p.simplifiedText !== p.originalText) && read) ? `
          <div class="readability-details">
            <div class="readability-toggle" onclick="this.nextElementSibling.classList.toggle('hidden')">
              <span>📊 Readability & Content Preservation Metrics (Click to inspect)</span>
              <span>▼</span>
            </div>
            <div class="readability-content hidden">
              <div class="readability-metric-item">
                <span class="readability-metric-label">Avg Sentence Length (words/sentence):</span>
                <span class="readability-metric-values">
                  ${read.avgSentenceLength.before} ➔ ${read.avgSentenceLength.after} 
                  <span class="${read.avgSentenceLength.delta < 0 ? 'delta-good' : 'delta-neutral'}">(${read.avgSentenceLength.delta < 0 ? '' : '+'}${read.avgSentenceLength.delta})</span>
                </span>
              </div>
              <div class="readability-metric-item">
                <span class="readability-metric-label">Avg Word Length (chars/word):</span>
                <span class="readability-metric-values">${read.avgWordLength.before} ➔ ${read.avgWordLength.after}</span>
              </div>
              <div class="readability-metric-item">
                <span class="readability-metric-label">Type-Token Ratio (Diversity):</span>
                <span class="readability-metric-values">${read.typeTokenRatio.before} ➔ ${read.typeTokenRatio.after}</span>
              </div>
              <div class="readability-metric-item">
                <span class="readability-metric-label">Conjunct Density (per 100 words):</span>
                <span class="readability-metric-values">${read.conjunctDensity.before} ➔ ${read.conjunctDensity.after}</span>
              </div>
              <div class="readability-metric-item">
                <span class="readability-metric-label">Number Retention:</span>
                <span class="readability-metric-values"><span class="retention-badge">${read.numberRetentionPct}%</span></span>
              </div>
              <div class="readability-metric-item">
                <span class="readability-metric-label">Proper Noun Retention:</span>
                <span class="readability-metric-values"><span class="retention-badge">${read.properNounRetentionPct}%</span></span>
              </div>
              <div class="readability-metric-item">
                <span class="readability-metric-label">Word Count Ratio (Post ÷ Pre):</span>
                <span class="readability-metric-values">${read.wordCountRatio} <span style="font-size:0.7rem; color:var(--text-muted);">( $\ge 1.0$ expected for simpler sentences)</span></span>
              </div>
            </div>
          </div>
        ` : ''}
      `;

      this.summaryParagraphs.appendChild(card);
    });
  }

  resetToInputView() {
    this.viewSummary.classList.add('hidden');
    this.viewReading.classList.add('hidden');
    this.viewInput.classList.remove('hidden');
    this.inputText.value = '';
    this.fileInput.value = '';
    this.paragraphHistoryCache.clear();
    this.updateInputLiveStats();
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.readingApp = new ReadingSimplifierApp();
});
