/* ==========================================================================
   app.js — starts the app: loads the JSON data, sets up routes,
   and draws the Home screen. This file loads LAST.
   ========================================================================== */

window.App = window.App || {};

/** Loaded content from /data (filled in by init). */
App.data = null;

/** Shortcut: the <main> element every screen draws into. */
App.mainEl = function () {
  return document.getElementById("app");
};

/** Find a subject by id (or null). */
App.getSubject = function (subjectId) {
  return App.utils.findById(App.data.subjects, subjectId);
};

/** Find a topic inside a subject by id (or null). */
App.getTopic = function (subject, topicId) {
  return subject ? App.utils.findById(subject.topics, topicId) : null;
};

/**
 * Page heading with an optional "← Back" button beside it.
 * The button goes ONE LEVEL UP (same as the breadcrumb), not "browser back",
 * so it never leaves the app even if this page was opened from a bookmark.
 *   App.pageTitle("English quizzes", { href: "#/quiz", label: "Practice Quiz" })
 */
App.pageTitle = function (title, back) {
  var esc = App.utils.escapeHtml;
  return '<div class="page-title">' +
    (back ? '<a class="btn btn-secondary back-btn" href="' + back.href + '" aria-label="Back to ' + esc(back.label) + '">' +
      '<span aria-hidden="true">←</span> Back</a>' : "") +
    "<h1>" + esc(title) + "</h1>" +
    "</div>";
};

/** Simple screen used for features that are not built yet. */
App.renderPlaceholder = function (title, message) {
  var esc = App.utils.escapeHtml;
  App.mainEl().innerHTML =
    "<h1>" + esc(title) + "</h1>" +
    '<div class="card"><p class="muted">' + esc(message) + "</p>" +
    '<a class="btn btn-secondary" href="#/home">Back to Home</a></div>';
};

/* ---------------- Home screen ---------------- */

App.renderHome = function () {
  var esc = App.utils.escapeHtml;
  var subjects = App.data.subjects;

  // One card per subject (comes from data/subjects.json).
  var subjectCards = subjects.map(function (subject) {
    var pct = App.progress.subjectPercent(subject.id);
    return (
      '<a class="card subject-card" href="#/lessons/' + encodeURIComponent(subject.id) + '">' +
        "<h3>" + esc(subject.name) + "</h3>" +
        '<p class="muted small">' + esc(subject.description) + "</p>" +
        '<p class="small">' + subject.topics.length + " topics</p>" +
        App.utils.progressBar(pct, subject.name + " progress") +
      "</a>"
    );
  }).join("");

  // Recent quiz / mock results.
  var history = App.progress.recentHistory(5);
  var historyHtml = history.length
    ? '<ul class="list-plain">' + history.map(function (item) {
        return "<li>" + esc(item.label) + " — <strong>" + item.percent + "%</strong> " +
          '<span class="muted small">' + esc(App.utils.formatDate(item.finishedAt)) + "</span></li>";
      }).join("") + "</ul>"
    : '<p class="muted">No quiz or mock exam attempts yet. Your recent scores will appear here.</p>';

  var storageWarning = App.storage.isAvailable() ? "" :
    '<div class="notice"><strong>Progress cannot be saved.</strong> ' +
    "This browser is blocking local storage (for example, in a private window). " +
    "You can still study, but progress will be lost when you close the page.</div>";

  App.mainEl().innerHTML =
    storageWarning +
    "<h1>USTET College Reviewer</h1>" +
    '<p class="muted">General USTET preparation (program to be decided). ' +
      "Four test areas: " + subjects.map(function (s) { return esc(s.shortName); }).join(", ") + ".</p>" +

    '<div class="card">' +
      "<h2>Overall progress</h2>" +
      App.utils.progressBar(App.progress.overallPercent(), "Overall progress") +
    "</div>" +

    '<h2 class="section-title">Study</h2>' +
    '<div class="quick-actions">' +
      '<a class="btn" href="#/lessons">Lessons</a>' +
      '<a class="btn" href="#/flashcards">Flashcards</a>' +
      '<a class="btn" href="#/quiz">Practice Quiz</a>' +
      '<a class="btn" href="#/mock">Mock Exam</a>' +
    "</div>" +

    '<h2 class="section-title">Subjects</h2>' +
    '<div class="grid grid-2">' + subjectCards + "</div>" +

    '<h2 class="section-title">Recent scores</h2>' +
    '<div class="card">' + historyHtml + "</div>" +
    '<div id="install-card"></div>';

  App.renderInstallCard();
};

/* ---------------- "Install this app" help (Home screen) ---------------- */

// Chrome/Edge on Android and laptops fire this event when the app can be installed.
// We keep it so our own "Install app" button can open the install prompt later.
App.installPrompt = null;
window.addEventListener("beforeinstallprompt", function (event) {
  event.preventDefault();
  App.installPrompt = event;
  App.renderInstallCard();
});
window.addEventListener("appinstalled", function () {
  App.installPrompt = null;
  App.renderInstallCard();
});

/** True when the app is already running as an installed app. */
App.isInstalled = function () {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
};

/** Which install instructions fit this device: "ios", "android", "desktop" or null (hide). */
App.installPlatform = function () {
  var protocol = window.location.protocol;
  if (protocol !== "https:" && protocol !== "http:") return null;   // file:// cannot install
  if (App.isInstalled()) return null;
  var ua = navigator.userAgent;
  var isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
};

/** Fill the install card on the Home screen (if it is showing). */
App.renderInstallCard = function () {
  var box = document.getElementById("install-card");
  if (!box) return;
  var platform = App.installPlatform();
  var dismissed = App.storage.get().settings.installHintDismissed;
  if (!platform || dismissed) { box.innerHTML = ""; return; }

  var body;
  if (App.installPrompt && platform !== "ios") {
    body = "<p>Add this reviewer to your device. It gets its own icon and works offline.</p>" +
      '<button type="button" class="btn" id="install-btn">Install app</button>';
  } else if (platform === "ios") {
    body = "<p>Add it to your Home Screen to use it like an app, even offline:</p>" +
      "<ol class=\"small\"><li>Open this page in <strong>Safari</strong>.</li>" +
      "<li>Tap the <strong>Share</strong> button (square with an arrow ↑).</li>" +
      "<li>Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li></ol>";
  } else if (platform === "android") {
    body = "<p>Install it to use it like an app, even offline:</p>" +
      "<ol class=\"small\"><li>Open this page in <strong>Chrome</strong>.</li>" +
      "<li>Tap the menu <strong>⋮</strong> (top right).</li>" +
      "<li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li></ol>";
  } else {
    body = "<p>Install it on this computer: in Chrome or Edge, click the <strong>Install</strong> icon at the right end of the address bar " +
      "(or menu → <em>Install</em>).</p>";
  }

  box.innerHTML = '<div class="card install-card">' +
    "<h2>📲 Install this app</h2>" + body +
    '<button type="button" class="btn btn-secondary btn-small" id="install-hide">Hide this</button>' +
    "</div>";

  var installBtn = document.getElementById("install-btn");
  if (installBtn && App.installPrompt) {
    installBtn.addEventListener("click", function () {
      var prompt = App.installPrompt;
      if (!prompt) return;
      App.installPrompt = null;
      prompt.prompt();   // shows the browser's own install dialog
      prompt.userChoice.then(function () { App.renderInstallCard(); });
    });
  }
  document.getElementById("install-hide").addEventListener("click", function () {
    App.storage.update(function (data) { data.settings.installHintDismissed = true; });
    App.renderInstallCard();
  });
};

/* ---------------- Error screens ---------------- */

/** Friendly message when /data could not be loaded. */
App.renderLoadError = function (err) {
  var esc = App.utils.escapeHtml;
  var openedAsFile = window.location.protocol === "file:";
  var html;

  if (err.kind === "blocked" || (openedAsFile && err.kind !== "invalid-json" && err.kind !== "invalid-content")) {
    html =
      '<div class="notice notice-error">' +
        "<h2>Your browser blocked the study content</h2>" +
        "<p>The reviewer's lessons and questions are stored in JSON files in the <code>data</code> folder. " +
        "Most browsers do not let a page read local files when <code>index.html</code> is opened by double-clicking.</p>" +
        "<p><strong>Simple fix (no installs besides Python):</strong></p>" +
        "<ol>" +
          "<li>Open a terminal in the reviewer folder (the one containing <code>index.html</code>).</li>" +
          "<li>Run:<pre>python -m http.server 8000</pre></li>" +
          '<li>Open <a href="http://localhost:8000">http://localhost:8000</a> in your browser.</li>' +
        "</ol>" +
        '<p class="small muted">No Python? Install it free from python.org or the Microsoft Store. ' +
        "See README.md for other options.</p>" +
        '<p class="small muted">Technical detail: ' + esc(err.file) + " — " + esc(err.details) + "</p>" +
      "</div>";
  } else {
    var title = {
      "missing": "A content file is missing",
      "invalid-json": "A content file has a typing error",
      "invalid-content": "A content file is missing required information"
    }[err.kind] || "The study content could not be loaded";

    html =
      '<div class="notice notice-error">' +
        "<h2>" + esc(title) + "</h2>" +
        "<p>File: <code>" + esc(err.file || "unknown") + "</code></p>" +
        "<pre>" + esc(err.details || err.message) + "</pre>" +
        "<p>Fix the file, save it, then reload this page. README.md describes the required fields.</p>" +
      "</div>";
  }

  App.mainEl().innerHTML = "<h1>Something needs fixing</h1>" + html;
};

/** Shown for unknown addresses like #/does-not-exist. */
App.renderNotFound = function () {
  App.renderPlaceholder("Page not found", "That page does not exist.");
};

/* ---------------- Start-up ---------------- */

/**
 * Turn on offline support (see sw.js).
 * Browsers only allow this on http://localhost or https://, so it is skipped
 * when index.html is opened directly as a file.
 */
App.registerServiceWorker = function () {
  var isWebPage = window.location.protocol === "http:" || window.location.protocol === "https:";
  if (!("serviceWorker" in navigator) || !isWebPage) return;
  navigator.serviceWorker.register("sw.js").catch(function (err) {
    console.warn("Offline support could not be turned on:", err);
  });
};

App.init = function () {
  App.registerServiceWorker();
  App.dataLoader.loadAll()
    .then(function (data) {
      App.data = data;

      // Route name (first part of #/...) -> function that draws the screen.
      App.router.register("home", App.renderHome);
      App.router.register("lessons", App.lessons.render);
      App.router.register("flashcards", App.flashcards.render);
      App.router.register("quiz", App.quizzes.render);
      App.router.register("mock", App.mockExam.render);
      App.router.register("progress", App.progress.render);
      App.router.register("notFound", App.renderNotFound);

      App.router.start();
    })
    .catch(function (err) {
      console.error("Could not load study content:", err);
      App.renderLoadError(err);
    });
};

document.addEventListener("DOMContentLoaded", App.init);
