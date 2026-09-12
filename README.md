# Adaptive Multi-Paragraph Reading Simplifier (v2 + Addendum)

A clean, modular web application for adaptive paragraph-by-paragraph reading and simplification in Indic languages (Tamil, Hindi, etc.) and English.

---

## 🌟 Core Features in v2

1. **Zero Client-Side Credentials**:
   - Keys are loaded exclusively server-side via `.env` (`GROQ_API_KEY` and `GEMINI_API_KEY`).
   - No API key inputs, no settings modal, and no `localStorage` credential storage.

2. **Updated Production Models (2026)**:
   - **Groq**: `openai/gpt-oss-120b` (fallback: `openai/gpt-oss-20b`).
   - **Gemini**: `gemini-3.5-flash` (GA / stable).

3. **Silent Multi-Provider Failover**:
   - `Groq` ➔ `Gemini` ➔ `Offline Mechanical Segmenter`.
   - Real-time transparent provider provenance badge on every paragraph.

4. **Indic Language Auto-Detection**:
   - Unicode character frequency detection across Tamil, Hindi/Devanagari, Telugu, Kannada, Malayalam, Bengali, Gujarati, Gurmukhi, Odia, and English.

5. **7-Signal Reading Struggle Engine**:
   - **Signal 1 (Reading Pace)**: Current reading speed compared against Paragraph 1 baseline.
   - **Signal 2 (Word-Level Taps)**: Interactive clickable tokens to flag unfamiliar words with visual highlight.
   - **Signal 3 (Idle Pauses)**: Detection of $\ge 4\text{s}$ inactivity.
   - **Signal 4 (Text Selection)**: Highlighted text span tracking.
   - **Signal 5 (Explicit Regression)**: "◀ Re-read previous paragraph" navigation control logging deliberate back-tracking.
   - **Signal 6 (Passive Scroll-Back)**: Detection of upward scrolling after downward reading progress in long paragraphs.
   - **Signal 7 (Pace Variance)**: Variance of per-word reading time across the last 3 paragraphs detecting erratic rhythm.
   - **Manual Escalation**: Persistent "⚠️ I don't understand — simplify this" button for in-place re-simplification.

6. **Automated Readability & Content Preservation Metrics (`readabilityMetrics.js`)**:
   - **Structural Deltas**: Average sentence length reduction, average word length, type-token vocabulary diversity.
   - **Indic-Specific Metrics**: Virama/pulli conjunct cluster density (per 100 words) and structural difficulty score.
   - **Content-Preservation Checks**: Percentage retention of numbers/dates ($\ge 99\%$) and proper nouns/entities, plus word-count ratio ($\ge 1.0$).
   - **Collapsible Readability Accordion**: Detailed per-paragraph inspection panel on summary screen.
   - **JSON Telemetry Export**: Complete session log with all 7 signals, provider attribution, and readability deltas.

---

## 📁 Project Structure

```
nlp/
├── .env.example              # Environment variables template
├── .gitignore                # Ignores node_modules and .env
├── package.json              # Node.js project configuration
├── server.js                 # Express backend with silent Groq -> Gemini -> Fallback chain
├── README.md                 # Project documentation (v2 + Addendum)
├── test/
│   └── test_modules.js       # Automated unit tests for all 7 signals & readability
└── public/
    ├── index.html            # Modern HTML5 reading interface with navigation controls
    ├── styles.css            # Responsive dark glassmorphism design system
    └── js/
        ├── app.js                 # Frontend application coordinator
        ├── languageDetector.js    # Unicode Indic language detector
        ├── paragraphSplitter.js   # Natural paragraph segmenter & chunker
        ├── signalTracker.js       # 7-signal reading struggle & scroll tracker
        ├── aggressivenessModel.js # Adaptive scoring & escalation model
        ├── readabilityMetrics.js  # Automated pre/post readability & retention engine
        └── sessionManager.js      # Telemetry logging & JSON export
```

---

## 🚀 Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Create a `.env` file based on `.env.example`:
```env
GROQ_API_KEY=your_groq_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```

### 3. Run Automated Tests
```bash
npm test
```

### 4. Start the Application
```bash
npm start
```
Open **http://localhost:3000** in your browser.
