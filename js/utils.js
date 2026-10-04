/* ==========================================================================
   utils.js — small helper functions shared by every screen.
   ========================================================================== */

// Every script adds its part to this one shared object.
window.App = window.App || {};

App.utils = {
  /**
   * Allowed question "difficulty" values in questions.json -> label shown on screen.
   * "medium" is still accepted (shown as Neutral) so older content keeps working.
   */
  DIFFICULTIES: {
    "easy": "Easy",
    "moderately-easy": "Moderately Easy",
    "neutral": "Neutral",
    "medium": "Neutral",
    "moderately-hard": "Moderately Hard",
    "hard": "Hard"
  },

  /** Screen label for a question difficulty value. */
  difficultyLabel: function (value) {
    return App.utils.DIFFICULTIES[value] || String(value);
  },

  /** "45 seconds", "1 min 30 s", "1 h 5 min" — for durations given in seconds. */
  formatDuration: function (totalSeconds) {
    var s = Math.max(0, Math.round(totalSeconds));
    if (s < 60) return s + (s === 1 ? " second" : " seconds");
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var rest = s % 60;
    if (h) return h + " h" + (m ? " " + m + " min" : "");
    return m + " min" + (rest ? " " + rest + " s" : "");
  },

  /** Countdown clock text from milliseconds: "4:05" or "1:02:09". */
  formatClock: function (ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var pad = function (n) { return (n < 10 ? "0" : "") + n; };
    return h ? h + ":" + pad(m) + ":" + pad(sec) : m + ":" + pad(sec);
  },

  /**
   * Make text safe to put inside HTML.
   * Always use this for text that comes from JSON files, so a stray "<"
   * in a question can never break the page.
   */
  escapeHtml: function (value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  /**
   * Return a NEW shuffled copy of a list (Fisher–Yates shuffle).
   * The original list is never changed.
   */
  shuffle: function (list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  },

  /** Whole-number percentage. Returns 0 when total is 0 (no divide-by-zero). */
  percent: function (part, total) {
    if (!total) return 0;
    return Math.round((part / total) * 100);
  },

  /** Readable local date/time from a timestamp (milliseconds). */
  formatDate: function (timestamp) {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  },

  /** "medium" -> "Medium" */
  capitalize: function (text) {
    text = String(text || "");
    return text.charAt(0).toUpperCase() + text.slice(1);
  },

  /** Find the first item in a list whose "id" matches. */
  findById: function (list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  },

  /**
   * HTML for a progress bar plus its text label.
   * The number is always shown as text so meaning does not rely on color.
   */
  progressBar: function (percentValue, label) {
    var p = Math.max(0, Math.min(100, percentValue));
    var name = App.utils.escapeHtml(label || "Progress");
    return (
      '<div class="progress-row">' +
        '<div class="progress-bar" role="progressbar" aria-label="' + name + '"' +
        ' aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + p + '">' +
          '<div class="progress-fill" style="width:' + p + '%"></div>' +
        "</div>" +
        '<span class="progress-label">' + p + "%</span>" +
      "</div>"
    );
  }
};
