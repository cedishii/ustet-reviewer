/* ==========================================================================
   lessons.js — Subject -> Topic -> Lesson screens.

   Addresses:
     #/lessons                              list of subjects
     #/lessons/<subjectId>                  topics (with their lessons) in a subject
     #/lessons/<subjectId>/<topicId>        lessons in one topic
     #/lessons/<subjectId>/<topicId>/<id>   one lesson

   Saved data (see storage.js):
     lessons[lessonId] = { viewedAt, completedAt }   completedAt is null if not complete
   ========================================================================== */

window.App = window.App || {};

App.lessons = (function () {
  var esc = App.utils.escapeHtml;

  /* ---------- Small helpers ---------- */

  /** Lessons for a subject (and optionally one topic), in topic order then file order. */
  function lessonsFor(subjectId, topicId) {
    var subject = App.getSubject(subjectId);
    if (!subject) return [];
    var result = [];
    subject.topics.forEach(function (topic) {
      if (topicId && topic.id !== topicId) return;
      App.data.lessons.forEach(function (lesson) {
        if (lesson.subjectId === subjectId && lesson.topicId === topic.id) result.push(lesson);
      });
    });
    return result;
  }

  function savedState(lessonId) {
    return App.storage.get().lessons[lessonId] || null;
  }

  function isComplete(lessonId) {
    var state = savedState(lessonId);
    return !!(state && state.completedAt);
  }

  /** Text status (not color only). */
  function statusLabel(lessonId) {
    var state = savedState(lessonId);
    if (state && state.completedAt) return '<span class="status status-done">✓ Completed</span>';
    if (state && state.viewedAt) return '<span class="status status-viewed">Viewed</span>';
    return '<span class="status">Not started</span>';
  }

  function countComplete(lessons) {
    return lessons.filter(function (l) { return isComplete(l.id); }).length;
  }

  function lessonLink(lesson) {
    return "#/lessons/" + [lesson.subjectId, lesson.topicId, lesson.id].map(encodeURIComponent).join("/");
  }

  /** "Lessons › English › Grammar" navigation trail. Each crumb is [label, href or null]. */
  function breadcrumb(crumbs) {
    return '<nav class="breadcrumb" aria-label="Breadcrumb"><ol>' +
      crumbs.map(function (c) {
        return "<li>" + (c[1] ? '<a href="' + c[1] + '">' + esc(c[0]) + "</a>" :
          '<span aria-current="page">' + esc(c[0]) + "</span>") + "</li>";
      }).join("") +
      "</ol></nav>";
  }

  /** List of lesson links with their status. */
  function lessonList(lessons) {
    return '<ul class="list-plain lesson-list">' + lessons.map(function (lesson) {
      return '<li><a class="lesson-link" href="' + lessonLink(lesson) + '">' +
        '<span class="lesson-link-title">' + esc(lesson.title) + "</span>" +
        statusLabel(lesson.id) + "</a></li>";
    }).join("") + "</ul>";
  }

  function emptyTopicMessage() {
    return '<p class="muted small">No lessons for this topic yet. Add one in <code>data/lessons.json</code>.</p>';
  }

  function notFound(message) {
    App.mainEl().innerHTML = breadcrumb([["Lessons", "#/lessons"]]) +
      App.pageTitle("Lesson not found", { href: "#/lessons", label: "Lessons" }) +
      '<div class="card"><p>' + esc(message) + "</p>" +
      '<a class="btn btn-secondary" href="#/lessons">Back to Lessons</a></div>';
  }

  /* ---------- Screens ---------- */

  /** #/lessons — one card per subject. */
  function renderSubjects() {
    var cards = App.data.subjects.map(function (subject) {
      var lessons = lessonsFor(subject.id);
      var done = countComplete(lessons);
      return '<a class="card subject-card" href="#/lessons/' + encodeURIComponent(subject.id) + '">' +
        "<h2>" + esc(subject.name) + "</h2>" +
        '<p class="small">' + done + " of " + lessons.length + " lessons completed</p>" +
        App.utils.progressBar(App.utils.percent(done, lessons.length), subject.name + " lessons completed") +
        "</a>";
    }).join("");

    App.mainEl().innerHTML =
      "<h1>Lessons</h1>" +
      '<p class="muted">Short notes for each USTET area. Pick a subject.</p>' +
      '<div class="grid grid-2">' + cards + "</div>";
  }

  /** #/lessons/<subjectId> — topics, each with its lessons listed. */
  function renderSubject(subject) {
    var topicsHtml = subject.topics.map(function (topic) {
      var lessons = lessonsFor(subject.id, topic.id);
      var topicHref = "#/lessons/" + encodeURIComponent(subject.id) + "/" + encodeURIComponent(topic.id);
      return '<section class="card">' +
        '<h2><a href="' + topicHref + '">' + esc(topic.name) + "</a></h2>" +
        (lessons.length ? lessonList(lessons) : emptyTopicMessage()) +
        "</section>";
    }).join("");

    var all = lessonsFor(subject.id);
    App.mainEl().innerHTML =
      breadcrumb([["Lessons", "#/lessons"], [subject.name, null]]) +
      App.pageTitle(subject.name, { href: "#/lessons", label: "Lessons" }) +
      '<p class="muted">' + esc(subject.description) + "</p>" +
      '<div class="card">' +
        '<p class="small">' + countComplete(all) + " of " + all.length + " lessons completed</p>" +
        App.utils.progressBar(App.utils.percent(countComplete(all), all.length), subject.name + " lessons completed") +
      "</div>" +
      topicsHtml;
  }

  /** #/lessons/<subjectId>/<topicId> — lessons in one topic. */
  function renderTopic(subject, topic) {
    var lessons = lessonsFor(subject.id, topic.id);
    App.mainEl().innerHTML =
      breadcrumb([["Lessons", "#/lessons"],
        [subject.name, "#/lessons/" + encodeURIComponent(subject.id)],
        [topic.name, null]]) +
      App.pageTitle(topic.name, { href: "#/lessons/" + encodeURIComponent(subject.id), label: subject.name + " lessons" }) +
      '<div class="card">' + (lessons.length ? lessonList(lessons) : emptyTopicMessage()) + "</div>";
  }

  /** #/lessons/<subjectId>/<topicId>/<lessonId> — one lesson. */
  function renderLesson(subject, topic, lesson) {
    // Opening a lesson marks it "viewed" (but not complete).
    App.storage.update(function (data) {
      var state = data.lessons[lesson.id] || { viewedAt: null, completedAt: null };
      state.viewedAt = Date.now();
      data.lessons[lesson.id] = state;
    });

    var sectionsHtml = lesson.sections.map(function (section) {
      return "<section>" +
        "<h2>" + esc(section.heading) + "</h2>" +
        "<ul>" + section.bullets.map(function (b) { return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>" +
        "</section>";
    }).join("");

    var keyTerms = lesson.keyTerms || [];
    var keyTermsHtml = keyTerms.length ?
      '<section class="highlight-box"><h2>Key terms</h2><dl class="key-terms">' +
        keyTerms.map(function (k) {
          return "<dt>" + esc(k.term) + "</dt><dd>" + esc(k.definition) + "</dd>";
        }).join("") +
      "</dl></section>" : "";

    var formulas = lesson.formulas || [];
    var formulasHtml = formulas.length ?
      '<section class="highlight-box formula-box"><h2>Formulas</h2><dl class="formulas">' +
        formulas.map(function (f) {
          return "<dt>" + esc(f.name) + '</dt><dd><code class="formula">' + esc(f.value) + "</code></dd>";
        }).join("") +
      "</dl></section>" : "";

    // Previous / next lesson within the same subject.
    var siblings = lessonsFor(subject.id);
    var index = siblings.indexOf(lesson);
    var prev = siblings[index - 1];
    var next = siblings[index + 1];
    var pagerHtml = '<nav class="pager" aria-label="Lesson navigation">' +
      (prev ? '<a class="btn btn-secondary" href="' + lessonLink(prev) + '">← Previous</a>' : "<span></span>") +
      (next ? '<a class="btn btn-secondary" href="' + lessonLink(next) + '">Next →</a>' :
        '<a class="btn btn-secondary" href="#/lessons/' + encodeURIComponent(subject.id) + '">All ' + esc(subject.shortName) + " lessons</a>") +
      "</nav>";

    App.mainEl().innerHTML =
      breadcrumb([["Lessons", "#/lessons"],
        [subject.name, "#/lessons/" + encodeURIComponent(subject.id)],
        [topic.name, "#/lessons/" + encodeURIComponent(subject.id) + "/" + encodeURIComponent(topic.id)]]) +
      App.pageTitle(lesson.title, {
        href: "#/lessons/" + encodeURIComponent(subject.id) + "/" + encodeURIComponent(topic.id),
        label: topic.name
      }) +
      '<article class="lesson">' +
        '<p class="lesson-summary">' + esc(lesson.summary) + "</p>" +
        sectionsHtml +
        keyTermsHtml +
        formulasHtml +
      "</article>" +
      '<div class="card complete-row">' +
        '<p id="complete-status" class="complete-status" aria-live="polite"></p>' +
        '<button type="button" id="complete-btn" class="btn"></button>' +
      "</div>" +
      '<div class="button-row practice-links">' +
        '<a class="btn btn-secondary" href="#/quiz/' + encodeURIComponent(subject.id) + "/" + encodeURIComponent(topic.id) + '">Practice quiz: ' + esc(topic.name) + "</a>" +
        '<a class="btn btn-secondary" href="#/flashcards/' + encodeURIComponent(subject.id) + "/" + encodeURIComponent(topic.id) + '">Flashcards: ' + esc(topic.name) + "</a>" +
      "</div>" +
      pagerHtml;

    var button = document.getElementById("complete-btn");
    updateCompleteUi(lesson.id);
    button.addEventListener("click", function () {
      var nowComplete = !isComplete(lesson.id);
      App.storage.update(function (data) {
        var state = data.lessons[lesson.id] || { viewedAt: Date.now(), completedAt: null };
        state.completedAt = nowComplete ? Date.now() : null;
        data.lessons[lesson.id] = state;
      });
      updateCompleteUi(lesson.id);
    });
  }

  /** Update the button and text without redrawing the page (keeps keyboard focus). */
  function updateCompleteUi(lessonId) {
    var button = document.getElementById("complete-btn");
    var status = document.getElementById("complete-status");
    var done = isComplete(lessonId);
    button.textContent = done ? "Mark as not complete" : "Mark lesson as complete";
    button.className = done ? "btn btn-secondary" : "btn";
    button.setAttribute("aria-pressed", done ? "true" : "false");
    status.innerHTML = done ? '<span class="status status-done">✓ Completed</span>' :
      '<span class="muted">Finished reading? Mark it complete to track your progress.</span>';
  }

  /* ---------- Route entry point ---------- */

  function render(params) {
    var subjectId = params[0];
    var topicId = params[1];
    var lessonId = params[2];

    if (!subjectId) return renderSubjects();

    var subject = App.getSubject(subjectId);
    if (!subject) return notFound('There is no subject with id "' + subjectId + '".');
    if (!topicId) return renderSubject(subject);

    var topic = App.getTopic(subject, topicId);
    if (!topic) return notFound('"' + subject.name + '" has no topic with id "' + topicId + '".');
    if (!lessonId) return renderTopic(subject, topic);

    var lesson = App.utils.findById(App.data.lessons, lessonId);
    if (!lesson || lesson.subjectId !== subject.id || lesson.topicId !== topic.id) {
      return notFound('There is no lesson with id "' + lessonId + '" in this topic.');
    }
    renderLesson(subject, topic, lesson);
  }

  return {
    render: render,
    lessonsFor: lessonsFor
  };
})();
