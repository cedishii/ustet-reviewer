/* ==========================================================================
   progress.js — calculates progress numbers from saved data.

   A subject's progress is the average of three parts (each 0–100%):
     1. Lessons marked complete
     2. Flashcards marked "Known"
     3. Practice questions answered correctly at least once
   A part with no content in the JSON files is skipped.
   ========================================================================== */

window.App = window.App || {};

App.progress = {
  /** Raw counts for one subject. */
  subjectStats: function (subjectId) {
    var saved = App.storage.get();
    var bySubject = function (item) { return item.subjectId === subjectId; };

    var lessons = App.data.lessons.filter(bySubject);
    var cards = App.data.flashcards.filter(bySubject);
    var questions = App.data.questions.filter(bySubject);

    return {
      lessonsTotal: lessons.length,
      lessonsDone: lessons.filter(function (l) {
        return saved.lessons[l.id] && saved.lessons[l.id].completedAt;
      }).length,
      cardsTotal: cards.length,
      cardsKnown: cards.filter(function (c) {
        return saved.flashcards[c.id] && saved.flashcards[c.id].status === "known";
      }).length,
      questionsTotal: questions.length,
      questionsMastered: questions.filter(function (q) {
        return saved.questions[q.id] && saved.questions[q.id].correct > 0;
      }).length
    };
  },

  /** Percent of a subject's study material completed (0–100). */
  subjectPercent: function (subjectId) {
    var s = App.progress.subjectStats(subjectId);
    var parts = [];
    if (s.lessonsTotal) parts.push(s.lessonsDone / s.lessonsTotal);
    if (s.cardsTotal) parts.push(s.cardsKnown / s.cardsTotal);
    if (s.questionsTotal) parts.push(s.questionsMastered / s.questionsTotal);
    if (!parts.length) return 0;

    var sum = parts.reduce(function (a, b) { return a + b; }, 0);
    return Math.round((sum / parts.length) * 100);
  },

  /** Average of all subject percentages (0–100). */
  overallPercent: function () {
    var subjects = App.data.subjects;
    if (!subjects.length) return 0;
    var total = 0;
    subjects.forEach(function (s) { total += App.progress.subjectPercent(s.id); });
    return Math.round(total / subjects.length);
  },

  /** Save the result of answering one practice question. */
  recordAnswer: function (questionId, isCorrect) {
    App.storage.update(function (data) {
      var stat = data.questions[questionId] || { attempts: 0, correct: 0 };
      stat.attempts += 1;
      if (isCorrect) stat.correct += 1;
      stat.lastCorrect = isCorrect;
      stat.lastAnsweredAt = Date.now();
      data.questions[questionId] = stat;
    });
  },

  /**
   * Quiz attempts and best score for one subject + topic ("all" = mixed quiz).
   * Best score counts only full quizzes, not "retry missed" rounds.
   */
  quizStats: function (subjectId, topicId) {
    var attempts = App.storage.get().quizAttempts.filter(function (a) {
      return a.subjectId === subjectId && a.topicId === topicId;
    });
    var best = 0;
    attempts.forEach(function (a) {
      if (a.mode === "full" && a.percent > best) best = a.percent;
    });
    return { attempts: attempts.length, bestPercent: best };
  },

  /** Most recent quiz / mock results, newest first: [{ label, percent, finishedAt }]. */
  recentHistory: function (limit) {
    var saved = App.storage.get();
    var items = [];

    saved.quizAttempts.forEach(function (a) {
      var subject = App.getSubject(a.subjectId);
      var topic = App.getTopic(subject, a.topicId);
      var name = (subject ? subject.shortName : a.subjectId) + " · " + (topic ? topic.name : "All topics");
      items.push({
        label: (a.mode === "retry" ? "Retry missed: " : "Quiz: ") + name + " (" + a.correct + "/" + a.total + ")",
        percent: a.percent,
        finishedAt: a.finishedAt
      });
    });

    saved.mockHistory.forEach(function (m) {
      items.push({
        label: "Mock exam · " + m.modeName + " (" + m.correct + "/" + m.total + ")",
        percent: m.percent,
        finishedAt: m.finishedAt
      });
    });

    items.sort(function (a, b) { return b.finishedAt - a.finishedAt; });
    return items.slice(0, limit || items.length);
  },

  /**
   * Accuracy per topic from every answered practice/mock question.
   * Returns [{ subject, topic, attempts, correct, percent }] for topics with at least one answer.
   */
  topicAccuracy: function () {
    var saved = App.storage.get().questions;
    var byTopic = {};
    App.data.questions.forEach(function (q) {
      var stat = saved[q.id];
      if (!stat) return;
      var key = q.subjectId + "/" + q.topicId;
      var t = byTopic[key] || (byTopic[key] = { subjectId: q.subjectId, topicId: q.topicId, attempts: 0, correct: 0 });
      t.attempts += stat.attempts;
      t.correct += stat.correct;
    });
    return Object.keys(byTopic).map(function (key) {
      var t = byTopic[key];
      var subject = App.getSubject(t.subjectId);
      return {
        subject: subject,
        topic: App.getTopic(subject, t.topicId),
        attempts: t.attempts,
        correct: t.correct,
        percent: App.utils.percent(t.correct, t.attempts)
      };
    }).filter(function (t) { return t.subject && t.topic; });
  },

  /** Progress screen: per-subject breakdown, weak topics, history, reset. */
  render: function () {
    var esc = App.utils.escapeHtml;
    var saved = App.storage.get();

    // Per-subject cards
    var subjectCards = App.data.subjects.map(function (subject) {
      var s = App.progress.subjectStats(subject.id);
      var quiz = App.progress.quizStats(subject.id, "all");
      return '<div class="card">' +
        "<h3>" + esc(subject.name) + "</h3>" +
        App.utils.progressBar(App.progress.subjectPercent(subject.id), subject.name + " overall progress") +
        '<ul class="list-plain small stat-list">' +
          "<li>Lessons completed: <strong>" + s.lessonsDone + " / " + s.lessonsTotal + "</strong></li>" +
          "<li>Flashcards known: <strong>" + s.cardsKnown + " / " + s.cardsTotal + "</strong></li>" +
          "<li>Questions answered correctly at least once: <strong>" + s.questionsMastered + " / " + s.questionsTotal + "</strong></li>" +
          (quiz.attempts ? "<li>Best mixed-topic quiz: <strong>" + quiz.bestPercent + "%</strong></li>" : "") +
        "</ul></div>";
    }).join("");

    // Topics to review: lowest accuracy first (only topics with answers)
    var topics = App.progress.topicAccuracy().sort(function (a, b) { return a.percent - b.percent; });
    var weakHtml = topics.length ?
      '<div class="card table-wrap"><table class="data-table">' +
        "<thead><tr><th>Topic (tap to practice)</th><th>Correct</th><th>Accuracy</th></tr></thead><tbody>" +
        topics.slice(0, 8).map(function (t) {
          return '<tr><td><a href="#/quiz/' + encodeURIComponent(t.subject.id) + "/" + encodeURIComponent(t.topic.id) + '">' +
              esc(t.topic.name) + '</a><br><span class="small muted">' + esc(t.subject.shortName) + "</span></td>" +
            "<td>" + t.correct + " / " + t.attempts + "</td>" +
            '<td class="bar-cell">' + App.utils.progressBar(t.percent, t.topic.name + " accuracy") + "</td></tr>";
        }).join("") +
      "</tbody></table></div>" :
      '<div class="card"><p class="muted">Answer some quiz or mock exam questions to see which topics need more practice.</p></div>';

    // Quiz history (newest first)
    var quizzes = saved.quizAttempts.slice().reverse().slice(0, 15);
    var quizHtml = quizzes.length ?
      '<div class="card"><ul class="list-plain small">' + quizzes.map(function (a) {
        var subject = App.getSubject(a.subjectId);
        var topic = App.getTopic(subject, a.topicId);
        return "<li>" + esc(App.utils.formatDate(a.finishedAt)) + " · " +
          (a.mode === "retry" ? "Retry missed · " : "") +
          esc(subject ? subject.shortName : a.subjectId) + " · " + esc(topic ? topic.name : "All topics") +
          " · <strong>" + a.correct + "/" + a.total + " (" + a.percent + "%)</strong></li>";
      }).join("") + "</ul></div>" :
      '<div class="card"><p class="muted">No quizzes taken yet. <a href="#/quiz">Start a practice quiz</a>.</p></div>';

    // Mock history (newest first), each linking to its full review
    var mocks = saved.mockHistory.slice().reverse();
    var mockHtml = mocks.length ?
      '<div class="card"><ul class="list-plain small">' + mocks.map(function (m) {
        return '<li><a href="#/mock/result/' + encodeURIComponent(m.id) + '">' + esc(App.utils.formatDate(m.finishedAt)) +
          "</a> · " + esc(m.modeName) + " · <strong>" + m.correct + "/" + m.total + " (" + m.percent + "%)</strong></li>";
      }).join("") + "</ul></div>" :
      '<div class="card"><p class="muted">No mock exams taken yet. <a href="#/mock">Try one</a>.</p></div>';

    var totalAnswers = 0;
    Object.keys(saved.questions).forEach(function (id) { totalAnswers += saved.questions[id].attempts; });

    App.mainEl().innerHTML =
      "<h1>Progress</h1>" +
      '<p class="muted">Saved only on this device and browser. Practice scores are not UST admission ratings.</p>' +
      '<div class="card">' +
        "<h2>Overall</h2>" +
        App.utils.progressBar(App.progress.overallPercent(), "Overall progress") +
        '<p class="small muted">Each subject\'s progress = average of lessons completed, flashcards known, and questions answered correctly at least once.</p>' +
        '<ul class="list-plain small stat-list">' +
          "<li>Questions answered (all time): <strong>" + totalAnswers + "</strong></li>" +
          "<li>Quizzes taken: <strong>" + saved.quizAttempts.length + "</strong></li>" +
          "<li>Mock exams taken: <strong>" + saved.mockHistory.length + "</strong></li>" +
        "</ul>" +
      "</div>" +
      '<h2 class="section-title">By subject</h2>' +
      '<div class="grid grid-2">' + subjectCards + "</div>" +
      '<h2 class="section-title">Topics to review</h2>' + weakHtml +
      '<h2 class="section-title">Quiz history</h2>' + quizHtml +
      '<h2 class="section-title">Mock exam history</h2>' + mockHtml +
      '<h2 class="section-title">Reset</h2>' +
      '<div class="card">' +
        "<p>Erase all progress, scores and history saved on this device. Study content is not affected.</p>" +
        '<button type="button" class="btn btn-secondary" id="reset-ask">Reset all progress…</button>' +
        '<div id="reset-box" class="notice notice-error" hidden>' +
          "<p><strong>Erase everything?</strong> This cannot be undone.</p>" +
          '<div class="button-row">' +
            '<button type="button" class="btn btn-secondary" id="reset-cancel">Cancel</button>' +
            '<button type="button" class="btn btn-danger" id="reset-yes">Yes, erase all progress</button>' +
          "</div></div>" +
        '<p id="reset-msg" class="small" role="status"></p>' +
      "</div>";

    var box = document.getElementById("reset-box");
    document.getElementById("reset-ask").addEventListener("click", function () {
      box.hidden = false;
      document.getElementById("reset-cancel").focus();
    });
    document.getElementById("reset-cancel").addEventListener("click", function () {
      box.hidden = true;
      document.getElementById("reset-ask").focus();
    });
    document.getElementById("reset-yes").addEventListener("click", function () {
      App.storage.reset();
      App.progress.render();
      document.getElementById("reset-msg").textContent = "All progress was erased.";
      document.getElementById("reset-ask").focus();
    });
  }
};
