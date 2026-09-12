/**
 * Reading Signal Tracker (v2 + Addendum)
 * Captures reading pace, word taps, 4s+ idle pauses, text selection,
 * explicit regressions (Signal 5), passive scroll-backs (Signal 6), and pace variance (Signal 7).
 */

export class SignalTracker {
  constructor(options = {}) {
    this.containerElement = options.containerElement || null;
    this.viewportElement = options.viewportElement || null;
    this.onSignalUpdate = options.onSignalUpdate || (() => {});
    
    this.startTime = 0;
    this.wordTaps = [];
    this.tappedWordsSet = new Set();
    this.selectionEvents = [];
    this.idlePauses = 0;
    this.idleTimer = null;
    this.lastActivityTime = Date.now();
    this.isTracking = false;

    // Addendum Signals:
    this.explicitRegressions = 0; // Signal 5
    this.scrollBackEvents = 0;    // Signal 6
    this.lastScrollTop = 0;
    this.hasScrolledDown = false;
    this.scrollDebounceTimer = null;

    this.boundHandleWordClick = this.handleWordClick.bind(this);
    this.boundHandleActivity = this.recordActivity.bind(this);
    this.boundHandleSelection = this.handleSelection.bind(this);
    this.boundHandleScroll = this.handleScroll.bind(this);
  }

  /**
   * Start tracking a new paragraph
   */
  start(containerElement, viewportElement = null) {
    this.stop();
    this.containerElement = containerElement;
    this.viewportElement = viewportElement || containerElement?.parentElement;
    this.startTime = Date.now();
    this.lastActivityTime = Date.now();
    this.wordTaps = [];
    this.tappedWordsSet.clear();
    this.selectionEvents = [];
    this.idlePauses = 0;
    this.explicitRegressions = 0;
    this.scrollBackEvents = 0;
    this.lastScrollTop = 0;
    this.hasScrolledDown = false;
    this.isTracking = true;

    this.attachListeners();
    this.resetIdleTimer();
  }

  /**
   * Reset the 4-second idle pause timer
   */
  resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (!this.isTracking) return;

    this.idleTimer = setTimeout(() => {
      if (this.isTracking) {
        this.idlePauses++;
        this.onSignalUpdate(this.getSignalsSnapshot());
        this.resetIdleTimer();
      }
    }, 4000);
  }

  recordActivity() {
    this.lastActivityTime = Date.now();
    this.resetIdleTimer();
  }

  /**
   * Signal 5: Record an explicit regression (navigating back to previous paragraph)
   */
  recordExplicitRegression(fromParagraphIndex) {
    this.explicitRegressions++;
    this.recordActivity();
    this.onSignalUpdate(this.getSignalsSnapshot());
  }

  /**
   * Signal 6: Record a scroll-back event (scrolling upward after downward progress)
   */
  recordScrollBack() {
    this.scrollBackEvents++;
    this.recordActivity();
    this.onSignalUpdate(this.getSignalsSnapshot());
  }

  /**
   * Passive scroll listener for Signal 6 inside the reading viewport or window
   */
  handleScroll() {
    this.recordActivity();
    if (!this.isTracking) return;

    const scrollTarget = this.viewportElement || window;
    const currentScroll = this.viewportElement
      ? this.viewportElement.scrollTop
      : (window.pageYOffset || document.documentElement.scrollTop);

    const scrollHeight = this.viewportElement
      ? this.viewportElement.scrollHeight
      : document.documentElement.scrollHeight;
    const clientHeight = this.viewportElement
      ? this.viewportElement.clientHeight
      : window.innerHeight;

    // Only track scroll-backs if the paragraph container actually requires scrolling
    if (scrollHeight <= clientHeight + 30) {
      return;
    }

    const delta = currentScroll - this.lastScrollTop;

    if (delta > 25) {
      // User is scrolling downward
      this.hasScrolledDown = true;
    } else if (delta < -25 && this.hasScrolledDown) {
      // User scrolled back upward after having made downward progress
      if (!this.scrollDebounceTimer) {
        this.recordScrollBack();
        this.scrollDebounceTimer = setTimeout(() => {
          this.scrollDebounceTimer = null;
        }, 1200);
      }
    }

    this.lastScrollTop = currentScroll;
  }

  /**
   * Signal 7: Compute variance and standard deviation of time-per-word across recent paragraphs
   * @param {Array<number>} recentTimingsPerWord - Array of (seconds / wordCount) for last 3 paragraphs
   * @param {number} threshold - Threshold variance (default 0.035 s^2/word^2)
   */
  static computePaceVariance(recentTimingsPerWord, threshold = 0.035) {
    if (!recentTimingsPerWord || recentTimingsPerWord.length < 2) {
      return { variance: 0, stdDev: 0, flagged: false };
    }

    const n = recentTimingsPerWord.length;
    const mean = recentTimingsPerWord.reduce((a, b) => a + b, 0) / n;
    const variance = recentTimingsPerWord.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance);

    const formattedVariance = Math.round(variance * 10000) / 10000;
    const formattedStdDev = Math.round(stdDev * 1000) / 1000;

    return {
      variance: formattedVariance,
      stdDev: formattedStdDev,
      mean: Math.round(mean * 1000) / 1000,
      flagged: formattedVariance >= threshold
    };
  }

  attachListeners() {
    if (!this.containerElement) return;

    this.containerElement.addEventListener('click', this.boundHandleWordClick);
    window.addEventListener('mousemove', this.boundHandleActivity, { passive: true });
    window.addEventListener('keydown', this.boundHandleActivity, { passive: true });
    window.addEventListener('touchstart', this.boundHandleActivity, { passive: true });
    document.addEventListener('selectionchange', this.boundHandleSelection);

    if (this.viewportElement) {
      this.viewportElement.addEventListener('scroll', this.boundHandleScroll, { passive: true });
    }
    window.addEventListener('scroll', this.boundHandleScroll, { passive: true });
  }

  detachListeners() {
    if (this.containerElement) {
      this.containerElement.removeEventListener('click', this.boundHandleWordClick);
    }
    window.removeEventListener('mousemove', this.boundHandleActivity);
    window.removeEventListener('keydown', this.boundHandleActivity);
    window.removeEventListener('touchstart', this.boundHandleActivity);
    document.removeEventListener('selectionchange', this.boundHandleSelection);

    if (this.viewportElement) {
      this.viewportElement.removeEventListener('scroll', this.boundHandleScroll);
    }
    window.removeEventListener('scroll', this.boundHandleScroll);
  }

  handleWordClick(event) {
    this.recordActivity();
    const tokenSpan = event.target.closest('.word-token');
    if (!tokenSpan) return;

    const word = tokenSpan.getAttribute('data-word') || tokenSpan.innerText.trim();
    if (!word) return;

    const isTapped = tokenSpan.classList.toggle('flagged-word');
    if (isTapped) {
      this.wordTaps.push({
        word,
        timestamp: Date.now() - this.startTime
      });
      this.tappedWordsSet.add(word);
    } else {
      this.tappedWordsSet.delete(word);
    }

    this.onSignalUpdate(this.getSignalsSnapshot());
  }

  handleSelection() {
    this.recordActivity();
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selectedText = selection.toString().trim();
    if (selectedText.length > 2 && this.containerElement && this.containerElement.contains(selection.anchorNode)) {
      const last = this.selectionEvents[this.selectionEvents.length - 1];
      if (!last || last.text !== selectedText || (Date.now() - last.time > 1500)) {
        this.selectionEvents.push({
          text: selectedText,
          time: Date.now(),
          relativeMs: Date.now() - this.startTime
        });
        this.onSignalUpdate(this.getSignalsSnapshot());
      }
    }
  }

  getSignalsSnapshot() {
    const elapsedSeconds = Math.max(0.5, (Date.now() - this.startTime) / 1000);
    return {
      durationSeconds: Math.round(elapsedSeconds * 10) / 10,
      wordTapCount: this.tappedWordsSet.size,
      tappedWords: Array.from(this.tappedWordsSet),
      idlePauseCount: this.idlePauses,
      selectionCount: this.selectionEvents.length,
      selections: this.selectionEvents.map(s => s.text),
      explicitRegressions: this.explicitRegressions,
      scrollBackEvents: this.scrollBackEvents
    };
  }

  /**
   * Stop tracking and return final paragraph signals
   */
  stop() {
    if (!this.isTracking) return null;
    this.isTracking = false;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.scrollDebounceTimer) clearTimeout(this.scrollDebounceTimer);
    this.detachListeners();
    return this.getSignalsSnapshot();
  }
}
