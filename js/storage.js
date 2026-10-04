/* ==========================================================================
   storage.js — saves progress on THIS device using localStorage.

   Everything is stored under ONE key ("ustetReviewer.v1") as a JSON object.
   The ".v1" is a version number: if the saved shape ever changes a lot,
   a new key (v2) can be used without breaking old data.

   Nothing here ever changes the files in /data. Those are read-only.
   ========================================================================== */

window.App = window.App || {};

App.storage = (function () {
  var KEY = "ustetReviewer.v1";
  var cache = null; // in-memory copy so we don't re-parse on every read

  /** The empty starting shape of saved data. */
  function defaults() {
    return {
      version: 1,
      createdAt: Date.now(),
      lessons: {},       // lessonId -> { viewedAt, completedAt }
      flashcards: {},    // cardId   -> { status: "known" | "review", updatedAt }
      questions: {},     // questionId -> { attempts, correct, lastCorrect, lastAnsweredAt }
      quizAttempts: [],  // list of finished topic-quiz attempts
      mockHistory: [],   // list of finished mock exams
      activeMock: null,  // the mock exam in progress (so a reload can resume it), or null
      settings: {}
    };
  }

  /** Is localStorage usable? (Private modes or blocked storage can throw.) */
  function isAvailable() {
    try {
      var testKey = KEY + ".test";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Read saved data (or defaults if nothing is saved / data is corrupted). */
  function load() {
    if (cache) return cache;
    var data = defaults();
    try {
      var raw = window.localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        // Merge so that any newly-added fields still get default values.
        for (var field in parsed) {
          if (Object.prototype.hasOwnProperty.call(parsed, field)) {
            data[field] = parsed[field];
          }
        }
      }
    } catch (e) {
      console.warn("Saved progress could not be read; starting fresh.", e);
    }
    cache = data;
    return cache;
  }

  /** Write the in-memory data to localStorage. Returns true on success. */
  function save() {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(load()));
      return true;
    } catch (e) {
      console.warn("Progress could not be saved on this device.", e);
      return false;
    }
  }

  /**
   * Change saved data safely:
   *   App.storage.update(function (data) { data.lessons[id] = {...}; });
   */
  function update(changeFn) {
    var data = load();
    changeFn(data);
    return save();
  }

  /** Delete ALL saved progress on this device. */
  function reset() {
    try {
      window.localStorage.removeItem(KEY);
    } catch (e) { /* ignore */ }
    cache = null;
  }

  return {
    KEY: KEY,
    isAvailable: isAvailable,
    get: load,
    save: save,
    update: update,
    reset: reset
  };
})();
