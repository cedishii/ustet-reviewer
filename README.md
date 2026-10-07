# USTET Reviewer

A simple, free, offline-capable study app for the **University of Santo Tomas (UST) college entrance test (USTET)**, targeting the **A.Y. 2027–2028** admissions cycle. It runs on a phone or laptop and needs no account, internet connection, or payment.

**Use it now:** <https://cedishii.github.io/ustet-reviewer/>. Open it on your phone, then install it (Android: Chrome → **Install app**; iPhone: Safari → Share → **Add to Home Screen**).

> **Unofficial study tool.** This app is not affiliated with, endorsed by, or connected to the University of Santo Tomas. Practice scores are **not** UST admission ratings, and the app does **not** predict admission.

> **Double-check the content.** The lessons, flashcards, questions and explanations were written with AI assistance. A student or teacher should review them before relying on them. If you find a mistake, fix it in the JSON file (see below).

## Features

| Feature | Status |
|---|---|
| Home screen with subjects and progress | Done |
| Lessons (Subject → Topic → Lesson), mark complete | Done |
| Flashcards with flip, Known / Review Again, shuffle, "not yet known" decks | Done |
| Topic quizzes with instant feedback, explanations, retry missed questions | Done |
| Timed mock exam (Standard, Even practice, Custom) with time-pressure meter | Done |
| Progress screen: per-subject stats, topics to review, quiz and mock history, reset | Done |
| Install as an app / works offline (PWA) | Done |

**Content:** 4 subjects, 19 topics, 24 lessons (including quick-review formula sheets and a test-day strategy lesson), 60 flashcards, and 382 practice questions (91–98 per subject) across five difficulty levels.

## How to run

The app is plain HTML, CSS and JavaScript. There is no build step and no backend.

### Option A: Run a tiny local server (recommended)

All study content lives in JSON files in `data/`. Most browsers **block** a page from reading local files when you double-click `index.html` (a `file://` address). A local server avoids this.

1. Open a terminal in this folder (the one containing `index.html`).
   On Windows: open the folder in File Explorer, click the address bar, type `powershell`, press Enter.
2. Run:

   ```
   python -m http.server 8000
   ```

3. Open <http://localhost:8000> in your browser.
4. Press `Ctrl+C` in the terminal to stop the server when you are done.

**Important:** the server shares whatever folder the terminal is in. If you see a "Directory listing" of your personal files instead of the app, the terminal was in the wrong folder: press `Ctrl+C` immediately. A safer one-liner that works from any folder:

```
python -m http.server 8000 --directory "C:\Users\cedri\OneDrive\Documents\Github Projects\ustet-reviewer"
```

**No Python?** On Windows, typing `python` may only open the Microsoft Store page. Install Python for free from <https://www.python.org/downloads/> (tick "Add python.exe to PATH") or from the Microsoft Store, close and reopen the terminal, then try again. If you use VS Code, the optional "Live Server" extension works too.

### Option B: Open `index.html` directly

You can try double-clicking `index.html`. If your browser blocks the JSON files, the app shows a message explaining Option A instead of breaking silently.

## Install as an app and use offline (PWA)

After you open the app **once** through `http://localhost:8000` or an `https://` address, it saves its own files so it keeps working **with no internet and no server running**. It can also be installed so it opens in its own window with its own icon.

> Offline/install only works on **localhost** or **https://**. It does not work when `index.html` is opened directly as a file, or over a plain `http://192.168...` Wi-Fi address (browser security rule).

### On your laptop (Edge or Chrome)

1. Start the local server and open <http://localhost:8000>.
2. Click the **Install** icon at the right end of the address bar (or menu **⋯** → *Apps* → *Install this site as an app*).
3. The app now opens from the Start menu. It works offline, even when the Python server is not running.

### On your phone

A phone needs an **https://** address. The simplest free option is **GitHub Pages**:

1. Create a free account at <https://github.com>, then create a **new public repository** (e.g., `ustet-reviewer`).
2. On the repository page, click **Add file → Upload files**, and drag in **everything inside** this project folder (`index.html`, `manifest.json`, `sw.js`, and the `css`, `js`, `data`, `assets` folders). Click **Commit changes**.
3. Go to **Settings → Pages**. Under *Branch*, choose `main` and `/ (root)`, then **Save**.
4. After a minute, the site is live at `https://<your-username>.github.io/ustet-reviewer/`.
5. Open that link on your phone:
   - **Android (Chrome):** menu **⋮** → *Install app* / *Add to Home screen*.
   - **iPhone (Safari):** **Share** → *Add to Home Screen*.
6. Open it once while online; after that it works offline.

Notes: a public repository means anyone with the link can see the app and its questions (all original content, nothing private). Progress stays on each device and is never uploaded. To publish edits, upload the changed files again.

### Using it on your phone without publishing

While the server runs on your laptop, a phone on the **same Wi-Fi** can open `http://<your-laptop-IP>:8000` (find the IP with `ipconfig`). This works for studying, but it **cannot** be installed or used offline (not https).

### How offline mode works (sw.js)

- `sw.js` (the *service worker*) saves every file listed in `APP_FILES` the first time the app is opened.
- When online, it always fetches the newest files first, so your edits to `data/*.json` show up after a normal reload. When offline, it uses the saved copies.
- **If you add a brand-new file** (a new `.js`, `.css`, icon, or data file), add its path to `APP_FILES` in `sw.js` and change `CACHE_VERSION` (e.g., `"v1"` → `"v2"`). Editing existing files needs no change.
- To remove the offline copy: browser **Settings → Site settings / Cookies and site data**, delete data for the site (this also erases progress), or uninstall the app.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Directory listing for /" instead of the app | The server is running in the wrong folder. Press `Ctrl+C` and use the `--directory` one-liner above. |
| "Your browser blocked the study content" | You opened `index.html` by double-clicking. Use the local server (Option A). |
| "A content file has a typing error / is missing required information" | The message names the file and the item. Fix it, save, and reload. |
| You edited a file but nothing changed | Press `Ctrl+F5` (hard reload) so the browser fetches the new files. |
| Progress disappeared | Progress is per browser and device. Private/incognito windows do not keep it. |
| No "Install" option appears | Use `http://localhost:8000` or an `https://` address, not a file or a `192.168...` address. |
| The installed app shows old content | Open it while online and reload once; it fetches the newest files when it can. |
| A mock exam "continued" after you left | That is intended: the timer keeps running. Return to **Mock** to finish, or use **Quit exam**. |

## Folder structure

```
index.html          The single page; loads all CSS/JS
README.md           This file
manifest.json       App name, icons and colors for installing (PWA)
sw.js               Service worker: offline support (PWA)
css/style.css       All styles (mobile-first)
js/
  utils.js          Small helpers (escaping text, shuffling, percentages)
  storage.js        Saves progress in localStorage
  data-loader.js    Loads and checks the JSON files in /data
  router.js         Switches screens based on the #/address
  progress.js       Progress calculations and the Progress screen
  lessons.js        Lessons screens
  flashcards.js     Flashcards screens
  quizzes.js        Topic quiz screens
  mock-exam.js      Mock exam screens
  app.js            Starts the app; Home screen; error screens
data/               ALL study content (JSON). Edit these to add content.
  subjects.json     Subjects and their topics
  lessons.json      Lesson notes
  flashcards.json   Flashcards
  questions.json    Multiple-choice questions (used by quizzes and the mock exam)
  mock-exam.json    Mock exam blueprint (sections, item counts, time limits)
assets/icons/       App icons (192, 512, Apple touch icon, favicon)
```

## Editing content (no code changes needed)

All content is in `data/*.json`. To add or change content, edit those files only, save, and reload the page.

**Rules for every file:**

- JSON is strict: use double quotes `"`, put commas **between** items (not after the last one), and no comments.
- Every item needs a **unique `id`**. Never change an existing `id`: saved progress is linked to it.
- `subjectId` and `topicId` must match ids in `subjects.json`.
- If you make a mistake, the app shows which file and which item is wrong. Tip: paste the file into <https://jsonlint.com> to find typos.
- The app only **reads** these files. It never changes them.

### `data/subjects.json`

```json
{
  "subjects": [
    {
      "id": "mental-ability",
      "name": "Mental Ability",
      "shortName": "Mental Ability",
      "description": "Short description",
      "topics": [
        { "id": "patterns", "name": "Patterns and Sequences" }
      ]
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `id` | yes | Unique id used by all other files |
| `name` | yes | Full name shown on screens |
| `shortName` | yes | Shorter name for tight spaces |
| `description` | yes | One-line description |
| `topics` | yes | At least one `{ "id", "name" }`; topic ids must be unique within the subject |

### `data/lessons.json`

```json
{
  "lessons": [
    {
      "id": "mental-patterns-01",
      "subjectId": "mental-ability",
      "topicId": "patterns",
      "title": "Recognizing Number Patterns",
      "summary": "2–4 sentence concise explanation.",
      "sections": [
        { "heading": "Key Idea", "bullets": ["Short point", "Short point"] }
      ],
      "keyTerms": [
        { "term": "Arithmetic sequence", "definition": "..." }
      ],
      "formulas": [
        { "name": "Example formula", "value": "..." }
      ]
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `id`, `subjectId`, `topicId`, `title`, `summary` | yes | |
| `sections` | yes | At least one; each needs a `heading` and at least one `bullets` entry |
| `keyTerms` | optional | List of `{ "term", "definition" }`; may be `[]` |
| `formulas` | optional | List of `{ "name", "value" }`; may be `[]` |

### `data/flashcards.json`

```json
{
  "flashcards": [
    {
      "id": "fc-001",
      "subjectId": "mathematics",
      "topicId": "algebra",
      "front": "Question or term",
      "back": "Answer/explanation",
      "tags": ["algebra"]
    }
  ]
}
```

`id`, `subjectId`, `topicId`, `front`, `back` are required. `tags` is an optional list of words.

### `data/questions.json`

```json
{
  "questions": [
    {
      "id": "q-001",
      "subjectId": "science",
      "topicId": "biology",
      "difficulty": "easy",
      "type": "mcq",
      "question": "Original question text.",
      "options": [
        { "id": "A", "text": "Choice A" },
        { "id": "B", "text": "Choice B" },
        { "id": "C", "text": "Choice C" },
        { "id": "D", "text": "Choice D" }
      ],
      "correctOptionId": "B",
      "explanation": "Short explanation of why B is correct."
    }
  ]
}
```

| Field | Required | Meaning |
|---|---|---|
| `id`, `subjectId`, `topicId`, `question`, `explanation` | yes | |
| `difficulty` | yes | `"easy"`, `"moderately-easy"`, `"neutral"`, `"moderately-hard"` or `"hard"` (`"medium"` also works and shows as Neutral) |
| `type` | yes | Always `"mcq"` (multiple choice) |
| `options` | yes | At least 2; each `{ "id", "text" }` with unique ids |
| `correctOptionId` | yes | Must match **exactly one** option `id` |

Answer choices are shuffled on screen, but the app always checks against `correctOptionId`, so shuffling never changes the right answer.

**Because choices are shuffled, never refer to letters in an `explanation`** (e.g., "B is correct" or "Choice D..."). The on-screen letters change every time. Describe the answer by its content instead.

### `data/mock-exam.json`

```json
{
  "exam": {
    "id": "ustet-college-2027-2028",
    "title": "USTET College Mock Exam",
    "status": "provisional",
    "statusNote": "Why the values are provisional...",
    "sourceNote": "Where the numbers came from...",
    "sections": [
      { "subjectId": "mental-ability", "itemCount": 80, "timeMinutes": 30, "verification": "community-reported" }
    ],
    "presets": [
      {
        "id": "even-practice",
        "name": "Even practice",
        "description": "70 questions in 40 minutes for each subject.",
        "sections": [
          { "subjectId": "mental-ability", "itemCount": 70, "timeMinutes": 40, "verification": "practice-default" }
        ]
      }
    ],
    "customPractice": {
      "questionCountOptions": [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
      "timeMinuteOptions": [10, 20, 30, 40, 50, 60],
      "defaultQuestionCount": 20,
      "defaultTimeMinutes": 20
    },
    "timePressureLevels": [
      { "label": "Very Easy", "minSecondsPerQuestion": 180 },
      { "label": "Extreme", "minSecondsPerQuestion": 0 }
    ]
  }
}
```

| Field | Meaning |
|---|---|
| `status` | Anything other than `"official"` shows a visible PROVISIONAL / UNVERIFIED warning |
| `statusNote`, `sourceNote` | Explanations shown with the warning |
| `sections` | The **Standard** mode, in exam order. Each section is timed separately |
| `itemCount` | Questions in that section. `0` or `null` = not configured (the mode is disabled, never guessed) |
| `timeMinutes` | Time limit for that section. `0` or `null` = not configured |
| `verification` | `"verified"`, `"community-reported"`, `"unverified"` or `"practice-default"`: shown next to each section |
| `presets` | Optional extra modes, each with its own `sections` (same fields) |
| `customPractice` | Optional. The choices offered in **Custom practice** (questions spread evenly over the chosen subjects, one timer) |
| `timePressureLevels` | Optional. Labels for the time-pressure meter, **most relaxed first**. A pace gets the first level whose `minSecondsPerQuestion` it reaches. The last level must be `0` |

**Time-pressure meter.** Seconds per question = time ÷ questions. With the default levels:

| Seconds per question | Label |
|---|---|
| 180 or more | Very Easy |
| 120–179 | Easy |
| 80–119 | Moderately Easy |
| 50–79 | Neutral (e.g., 10 questions in 10 min = 60 s) |
| 35–49 | Moderately Hard |
| 25–34 | Hard |
| 15–24 | Very Hard |
| under 15 | Extreme (e.g., 60 questions in 10 min = 10 s) |

The meter rates **time pressure only**, not how hard the questions are. Each question keeps its own `difficulty`.

**Small question bank.** If a section asks for more questions than exist in `questions.json`, the mock uses all available questions and shortens the time to keep the same pace, and says so on screen.

## How to add a lesson

1. Open `data/lessons.json`.
2. Copy an existing lesson block (from `{` to its matching `}`).
3. Paste it after the last lesson, and add a comma between the two blocks.
4. Give it a new unique `id` (e.g., `math-algebra-02`), set `subjectId`/`topicId`, and write the content.
5. Save and reload. The lesson appears under its topic.

## How to add a flashcard

1. Open `data/flashcards.json`.
2. Copy one card line, paste it after the last card, and put a comma between them.
3. Give it a new `id` (e.g., `fc-041`), set `subjectId`, `topicId`, `front`, `back`.

## How to add a question

1. Open `data/questions.json`.
2. Copy an existing question block and paste it after the last one (comma between blocks).
3. Give it a new unique `id` (e.g., `q-math-021`).
4. Write the question, four options, set `correctOptionId`, and write a short `explanation`.
5. Write your **own** questions. Do not copy from UST, reviewer books, Quizlet, Scribd, Reddit, YouTube or any other source.

## How to change the mock exam blueprint

Edit only `data/mock-exam.json`; the app never hard-codes item counts or times.

1. Set each section's `itemCount` and `timeMinutes`.
2. Set `verification` to describe where the numbers came from (`"community-reported"` or `"verified"`), and update `sourceNote`.
3. Only when the numbers come from an **official UST source**, set `status` to `"official"` and update `statusNote`. Otherwise keep `"provisional"` so the warning stays visible.
4. You can reorder sections to change their order in the exam.
5. To add another ready-made mode, add an entry to `presets`. To change the custom choices or meter labels, edit `customPractice` or `timePressureLevels`.

The Standard values currently use EdgePrep's reported numbers (see Research notes). They are labeled community-reported because they could not be confirmed on an official UST page.

## How progress is saved

- Progress is stored **only on this device and browser**, in `localStorage`, under the key `ustetReviewer.v1`. Nothing is sent anywhere.
- Laptop and phone keep separate progress. Different browsers on the same device also keep separate progress.
- Saved (with dates):
  - `lessons`: viewed / completed time for each lesson
  - `flashcards`: "known" or "review" for each card
  - `questions`: attempts and correct answers for each question (from quizzes **and** mock exams)
  - `quizAttempts`: every finished quiz, including "retry missed" rounds and which questions were wrong
  - `mockHistory`: every finished mock exam with each answer, so its mistake review can be reopened later
  - `activeMock`: a mock exam in progress, so a reload or accidental tab close can resume it
- **Subject progress %** = average of (lessons completed %, flashcards known %, questions answered correctly at least once %).
- **Best score** on a quiz topic counts full quizzes only, not "retry missed" rounds.
- The **Progress** screen shows per-subject numbers, your weakest topics (lowest accuracy first), and all quiz and mock history.
- If saved data is ever damaged, the app starts fresh instead of breaking.
- Clearing your browser's site data erases progress.

### How to reset progress

Open **Progress** → **Reset all progress…** → **Yes, erase all progress**. This erases only your saved progress; the study content in `data/` is not touched.

(Alternative: press F12 → Console, run `localStorage.removeItem("ustetReviewer.v1")`, then reload.)

## Research and source notes

- UST's official admissions information identifies four college USTET areas: **Mental Ability, English, Mathematics, Science**.
- UST states the overall admission rating is **80% entrance test + 20% computed grades** in English, Mathematics and Science. This app does **not** compute or estimate that rating.
- Some programs add screening such as an interview, talent test, audition or drawing test. Check your chosen program's requirements.
- UST's public official sources (as checked) do **not** publish exact item counts or time limits. Community reports disagree, so the mock blueprint is editable and labeled provisional.

### Third-party summary: EdgePrep USTET guide

Source: <https://edgeprep.ph/ustet-exam-guide> (page says "Updated July 2026"; it credits UST's Office for Admissions, but this was **not** confirmed on an official UST page). The points below are paraphrased facts, not copied text:

- **Format:** four multiple-choice sections, about 265 items in one sitting, each section timed separately, around 4 hours including breaks, no essay.
- **Reported items and time:** Mathematics 60 items / 45 min; Science 80 / 45 min; English 45 / 45 min; Mental Ability 80 / 30 min. These are the app's Standard mock values.
- **Pace that implies:** about 45 s per Math item, about 34 s per Science item, 60 s per English item, and only about 22 s per Mental Ability item.
- **Topics listed:** Math: algebra, geometry, trigonometry, basic statistics, quantitative reasoning. Science: biology, chemistry, physics, earth science. English: vocabulary in context, grammar and usage, reading passages, verbal reasoning. Mental Ability: patterns and sequences, logical relationships, spatial reasoning, quick problem solving. All already covered by this app's topics.
- **Scoring:** EdgePrep says the exam result is combined with the senior high school record but the exact weighting is unpublished. UST's own admissions information states **80% test / 20% grades**, so this app follows UST. It says the test is taken once per cycle (no retakes).
- **Study suggestions (summarized):** start with a diagnostic mock; spend several weeks rotating Math and Science; add daily *timed* Mental Ability drills (speed matters most there); cover all four sciences broadly rather than one deeply; work carefully in English since it has the fewest items; finish with full-length timed mocks. The app's Custom practice and time-pressure meter support this kind of timed drilling.
- **Logistics (verify on UST's portal):** applications usually open mid-year; testing runs roughly October to February in batches; UST assigns the date and test center (España campus, provincial and some overseas sites); fee waivers exist for some groups (e.g., public-school honor students, beneficiaries of the Free College Entrance Examination Act, RA 12006).
- Topic coverage was based on recurring topics in public review material. **All questions in this app are original.** No leaked, unauthorized, or copied USTET materials are included, and none should be added.
- Always confirm dates, requirements and procedures on UST's official admissions website.
