/* ==========================================================================
   data-loader.js — reads the JSON content files in /data.

   The JSON files are the ONLY source of content. This file:
     1. downloads each file,
     2. checks that required fields exist and that IDs/links make sense,
     3. reports clear, friendly errors when something is wrong.

   Loaded content ends up in App.data:
     App.data.subjects    (from subjects.json   -> "subjects")
     App.data.lessons     (from lessons.json    -> "lessons")
     App.data.flashcards  (from flashcards.json -> "flashcards")
     App.data.questions   (from questions.json  -> "questions")
     App.data.mockExam    (from mock-exam.json  -> "exam")

   Note on opening index.html directly (file://):
   Many browsers block JavaScript from reading local files. When that happens
   we show instructions for running a tiny local server instead.
   ========================================================================== */

window.App = window.App || {};

App.dataLoader = (function () {
  // name in App.data -> { path of the file, top-level key inside the file }
  var FILES = {
    subjects:   { path: "data/subjects.json",   key: "subjects" },
    lessons:    { path: "data/lessons.json",    key: "lessons" },
    flashcards: { path: "data/flashcards.json", key: "flashcards" },
    questions:  { path: "data/questions.json",  key: "questions" },
    mockExam:   { path: "data/mock-exam.json",  key: "exam" }
  };

  // Allowed difficulty values come from utils.js (one place to edit).
  var DIFFICULTIES = Object.keys(App.utils.DIFFICULTIES);

  /**
   * Create an error object with a "kind" so the app can show the right message.
   * kinds: "blocked" (browser refused local file), "missing", "invalid-json", "invalid-content"
   */
  function loadError(kind, file, details) {
    var err = new Error(details || kind);
    err.kind = kind;
    err.file = file;
    err.details = details || "";
    return err;
  }

  /** Turn raw text into JSON, with a friendly error if the file has a typo. */
  function parseJson(text, path) {
    try {
      return JSON.parse(text);
    } catch (e) {
      throw loadError("invalid-json", path,
        "This file is not valid JSON (check for a missing comma, quote or bracket). " + e.message);
    }
  }

  /**
   * Fallback reader using the older XMLHttpRequest.
   * A few browsers allow this for local files even when fetch() is blocked.
   */
  function readWithXhr(path) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", path, true);
      xhr.onload = function () {
        // For file:// a successful read reports status 0 with some text.
        if ((xhr.status === 200 || xhr.status === 0) && xhr.responseText) {
          resolve(xhr.responseText);
        } else if (xhr.status === 404) {
          reject(loadError("missing", path, "File not found."));
        } else {
          reject(loadError("blocked", path, "The browser did not allow reading this file."));
        }
      };
      xhr.onerror = function () {
        reject(loadError("blocked", path, "The browser did not allow reading this file."));
      };
      xhr.send();
    });
  }

  /** Read one JSON file. Tries fetch() first, then XMLHttpRequest. */
  function loadJson(path) {
    return fetch(path, { cache: "no-cache" })
      .then(function (response) {
        if (response.status === 404) {
          throw loadError("missing", path, "File not found.");
        }
        if (!response.ok) {
          throw loadError("missing", path, "Server answered with status " + response.status + ".");
        }
        return response.text();
      })
      .catch(function (err) {
        // A real "missing" error is final; anything else may be a file:// block.
        if (err.kind === "missing") throw err;
        return readWithXhr(path);
      })
      .then(function (text) {
        return parseJson(text, path);
      });
  }

  /* ---------------- Validation helpers ----------------
     Each validator returns a list of human-readable problems (empty = OK). */

  function isEmpty(value) {
    return value === undefined || value === null || value === "";
  }

  /** Check that an object has non-empty values for the listed fields. */
  function requireFields(item, fields, label, problems) {
    fields.forEach(function (field) {
      if (!item || isEmpty(item[field])) {
        problems.push(label + ' is missing "' + field + '".');
      }
    });
  }

  /** Report any id that appears more than once in a list. */
  function checkUniqueIds(list, label, problems) {
    var seen = {};
    list.forEach(function (item) {
      if (!item || isEmpty(item.id)) return;
      if (seen[item.id]) problems.push(label + ' id "' + item.id + '" is used more than once.');
      seen[item.id] = true;
    });
  }

  /** A readable name for item #i, including its id when it has one. */
  function itemLabel(kind, item, i) {
    return kind + " #" + (i + 1) + (item && item.id ? ' ("' + item.id + '")' : "");
  }

  /**
   * Check that subjectId/topicId point to a real subject and topic.
   * subjectIndex looks like: { "english": { "grammar": true, ... }, ... }
   */
  function checkSubjectTopic(item, label, subjectIndex, problems) {
    if (!item || isEmpty(item.subjectId)) return; // already reported as missing
    var topics = subjectIndex[item.subjectId];
    if (!topics) {
      problems.push(label + ' uses subjectId "' + item.subjectId + '", which is not in subjects.json.');
      return;
    }
    if (!isEmpty(item.topicId) && !topics[item.topicId]) {
      problems.push(label + ' uses topicId "' + item.topicId + '", which is not a topic of "' + item.subjectId + '".');
    }
  }

  /** Check an optional field is a list when present. */
  function checkOptionalList(item, field, label, problems) {
    if (item && item[field] !== undefined && !Array.isArray(item[field])) {
      problems.push(label + ' "' + field + '" must be a list [ ... ].');
      return false;
    }
    return !!(item && Array.isArray(item[field]));
  }

  /** Make sure the top-level key holds a list. */
  function requireTopList(json, key) {
    if (!json || !Array.isArray(json[key])) {
      return ['Expected a top-level "' + key + '" list, like { "' + key + '": [ ... ] }.'];
    }
    return null;
  }

  /* ---------------- One validator per file ---------------- */

  function validateSubjects(json) {
    var problems = [];
    if (!json || !Array.isArray(json.subjects) || json.subjects.length === 0) {
      return ['Expected a top-level "subjects" list with at least one subject.'];
    }
    json.subjects.forEach(function (subject, i) {
      var label = itemLabel("Subject", subject, i);
      requireFields(subject, ["id", "name", "shortName", "description"], label, problems);
      if (!subject || !Array.isArray(subject.topics) || subject.topics.length === 0) {
        problems.push(label + ' needs a "topics" list with at least one topic.');
        return;
      }
      subject.topics.forEach(function (topic, t) {
        requireFields(topic, ["id", "name"], label + " topic #" + (t + 1), problems);
      });
      checkUniqueIds(subject.topics, label + " topic", problems);
    });
    checkUniqueIds(json.subjects, "Subject", problems);
    return problems;
  }

  function validateLessons(json, subjectIndex) {
    var problems = requireTopList(json, "lessons");
    if (problems) return problems;
    problems = [];
    json.lessons.forEach(function (lesson, i) {
      var label = itemLabel("Lesson", lesson, i);
      requireFields(lesson, ["id", "subjectId", "topicId", "title", "summary"], label, problems);
      checkSubjectTopic(lesson, label, subjectIndex, problems);

      if (!lesson || !Array.isArray(lesson.sections) || lesson.sections.length === 0) {
        problems.push(label + ' needs a "sections" list with at least one section.');
      } else {
        lesson.sections.forEach(function (section, s) {
          var sLabel = label + " section #" + (s + 1);
          requireFields(section, ["heading"], sLabel, problems);
          if (!section || !Array.isArray(section.bullets) || section.bullets.length === 0) {
            problems.push(sLabel + ' needs a "bullets" list with at least one bullet.');
          }
        });
      }
      // keyTerms and formulas are optional, but must be well-formed if present.
      if (checkOptionalList(lesson, "keyTerms", label, problems)) {
        lesson.keyTerms.forEach(function (term, k) {
          requireFields(term, ["term", "definition"], label + " key term #" + (k + 1), problems);
        });
      }
      if (checkOptionalList(lesson, "formulas", label, problems)) {
        lesson.formulas.forEach(function (formula, f) {
          requireFields(formula, ["name", "value"], label + " formula #" + (f + 1), problems);
        });
      }
    });
    checkUniqueIds(json.lessons, "Lesson", problems);
    return problems;
  }

  function validateFlashcards(json, subjectIndex) {
    var problems = requireTopList(json, "flashcards");
    if (problems) return problems;
    problems = [];
    json.flashcards.forEach(function (card, i) {
      var label = itemLabel("Flashcard", card, i);
      requireFields(card, ["id", "subjectId", "topicId", "front", "back"], label, problems);
      checkSubjectTopic(card, label, subjectIndex, problems);
      checkOptionalList(card, "tags", label, problems);
    });
    checkUniqueIds(json.flashcards, "Flashcard", problems);
    return problems;
  }

  function validateQuestions(json, subjectIndex) {
    var problems = requireTopList(json, "questions");
    if (problems) return problems;
    problems = [];
    json.questions.forEach(function (q, i) {
      var label = itemLabel("Question", q, i);
      requireFields(q, ["id", "subjectId", "topicId", "difficulty", "type", "question",
        "correctOptionId", "explanation"], label, problems);
      checkSubjectTopic(q, label, subjectIndex, problems);

      if (q && !isEmpty(q.difficulty) && DIFFICULTIES.indexOf(q.difficulty) === -1) {
        problems.push(label + ' "difficulty" must be one of: "' + DIFFICULTIES.join('", "') + '".');
      }
      if (q && !isEmpty(q.type) && q.type !== "mcq") {
        problems.push(label + ' "type" must be "mcq" (the only type supported).');
      }

      if (!q || !Array.isArray(q.options) || q.options.length < 2) {
        problems.push(label + ' needs an "options" list with at least 2 choices.');
        return;
      }
      q.options.forEach(function (option, o) {
        requireFields(option, ["id", "text"], label + " option #" + (o + 1), problems);
      });
      checkUniqueIds(q.options, label + " option", problems);

      // Exactly one correct answer: correctOptionId must match one option id.
      var matches = q.options.filter(function (option) {
        return option && option.id === q.correctOptionId;
      });
      if (!isEmpty(q.correctOptionId) && matches.length !== 1) {
        problems.push(label + ' "correctOptionId" ("' + q.correctOptionId + '") must match exactly one option id.');
      }
    });
    checkUniqueIds(json.questions, "Question", problems);
    return problems;
  }

  /** Check a list of exam sections (used for the main blueprint and for presets). */
  function validateSections(sections, labelPrefix, subjectIndex, problems) {
    if (!Array.isArray(sections) || sections.length === 0) {
      problems.push(labelPrefix + ' needs a "sections" list with at least one section.');
      return;
    }
    sections.forEach(function (section, i) {
      var label = labelPrefix + " section #" + (i + 1);
      requireFields(section, ["subjectId", "verification"], label, problems);
      if (section && !isEmpty(section.subjectId) && !subjectIndex[section.subjectId]) {
        problems.push(label + ' uses subjectId "' + section.subjectId + '", which is not in subjects.json.');
      }
      // 0 or null is allowed (means "not configured yet"); otherwise must be a number >= 0.
      ["itemCount", "timeMinutes"].forEach(function (field) {
        var value = section ? section[field] : undefined;
        if (value !== null && (typeof value !== "number" || value < 0)) {
          problems.push(label + ' "' + field + '" must be a number (0 or more) or null.');
        }
      });
    });
  }

  /** Check a list of positive numbers, like [10, 20, 30]. */
  function checkNumberList(list, label, problems) {
    if (!Array.isArray(list) || list.length === 0 ||
        list.some(function (n) { return typeof n !== "number" || n <= 0; })) {
      problems.push(label + " must be a list of numbers greater than 0, like [10, 20, 30].");
    }
  }

  function validateMockExam(json, subjectIndex) {
    var problems = [];
    var exam = json && json.exam;
    if (!exam || typeof exam !== "object") {
      return ['Expected a top-level "exam" object, like { "exam": { ... } }.'];
    }
    requireFields(exam, ["id", "title", "status"], "Exam", problems);
    validateSections(exam.sections, "Exam", subjectIndex, problems);

    // Optional extra modes with their own sections.
    if (checkOptionalList(exam, "presets", "Exam", problems)) {
      exam.presets.forEach(function (preset, p) {
        var label = itemLabel("Exam preset", preset, p);
        requireFields(preset, ["id", "name"], label, problems);
        validateSections(preset && preset.sections, label, subjectIndex, problems);
      });
      checkUniqueIds(exam.presets, "Exam preset", problems);
    }

    // Optional custom practice choices.
    if (exam.customPractice !== undefined) {
      var custom = exam.customPractice || {};
      checkNumberList(custom.questionCountOptions, 'customPractice "questionCountOptions"', problems);
      checkNumberList(custom.timeMinuteOptions, 'customPractice "timeMinuteOptions"', problems);
    }

    // Optional time-pressure meter levels: most relaxed first, last one must start at 0.
    if (checkOptionalList(exam, "timePressureLevels", "Exam", problems) && exam.timePressureLevels.length) {
      var levels = exam.timePressureLevels;
      levels.forEach(function (level, i) {
        var label = "Time-pressure level #" + (i + 1);
        requireFields(level, ["label"], label, problems);
        if (!level || typeof level.minSecondsPerQuestion !== "number" || level.minSecondsPerQuestion < 0) {
          problems.push(label + ' needs "minSecondsPerQuestion" (a number, 0 or more).');
        } else if (i > 0 && levels[i - 1] && level.minSecondsPerQuestion >= levels[i - 1].minSecondsPerQuestion) {
          problems.push(label + ' "minSecondsPerQuestion" must be smaller than the level before it (list them from most relaxed to most extreme).');
        }
      });
      var last = levels[levels.length - 1];
      if (last && last.minSecondsPerQuestion !== 0) {
        problems.push('The last time-pressure level must have "minSecondsPerQuestion": 0 so every pace gets a label.');
      }
    }
    return problems;
  }

  var VALIDATORS = {
    subjects: validateSubjects,
    lessons: validateLessons,
    flashcards: validateFlashcards,
    questions: validateQuestions,
    mockExam: validateMockExam
  };

  /** Build { subjectId: { topicId: true } } for quick lookups. */
  function buildSubjectIndex(subjects) {
    var index = {};
    subjects.forEach(function (subject) {
      index[subject.id] = {};
      subject.topics.forEach(function (topic) { index[subject.id][topic.id] = true; });
    });
    return index;
  }

  /**
   * Load every file in FILES, validate it, and resolve with App.data's shape.
   * Rejects with the FIRST problem file found (error has .kind, .file, .details).
   */
  function loadAll() {
    var names = Object.keys(FILES);
    return Promise.all(names.map(function (name) {
      return loadJson(FILES[name].path);
    })).then(function (results) {
      var raw = {};
      names.forEach(function (name, i) { raw[name] = results[i]; });

      // Subjects first: every other file is checked against them.
      var subjectProblems = validateSubjects(raw.subjects);
      if (subjectProblems.length) {
        throw loadError("invalid-content", FILES.subjects.path, subjectProblems.join("\n"));
      }
      var subjectIndex = buildSubjectIndex(raw.subjects.subjects);

      var data = {};
      names.forEach(function (name) {
        var problems = VALIDATORS[name](raw[name], subjectIndex);
        if (problems.length) {
          throw loadError("invalid-content", FILES[name].path, problems.join("\n"));
        }
        data[name] = raw[name][FILES[name].key];
      });
      return data;
    });
  }

  return {
    FILES: FILES,
    loadAll: loadAll
  };
})();
