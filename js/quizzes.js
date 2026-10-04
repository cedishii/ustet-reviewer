/* ==========================================================================
   quizzes.js — topic quizzes with instant feedback.

   Addresses:
     #/quiz                               choose a subject
     #/quiz/<subjectId>                   choose a topic (or all topics)
     #/quiz/<subjectId>/<topicId|all>     take the quiz

   Saved data (see storage.js):
     questions[questionId] = { attempts, correct, lastCorrect, lastAnsweredAt }
     quizAttempts = [ { subjectId, topicId, mode, total, correct, percent,
                        wrongQuestionIds, startedAt, finishedAt }, ... ]
   ========================================================================== */

window.App = window.App || {};

App.quizzes = (function () {
  var esc = App.utils.escapeHtml;
  var LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];

  // The quiz currently in progress (kept in memory only).
  var quiz = null;

  /* ---------- Shared helper (also used by the mock exam) ---------- */

  /**
   * Prepare a question for display with its choices in a random order.
   * The JSON question is NOT changed. Each choice keeps its original id,
   * so checking against correctOptionId always works after shuffling.
   * The on-screen letters (A, B, C...) are given by display position.
   */
  function prepareQuestion(question) {
    var options = App.utils.shuffle(question.options).map(function (option, i) {
      return { id: option.id, text: option.text, label: LABELS[i] || String(i + 1) };
    });
    return { source: question, options: options };
  }

  /** On-screen label + text of the correct choice, e.g. "C. 720°". */
  function correctAnswerText(prepared) {
    var correct = prepared.options.filter(function (o) { return o.id === prepared.source.correctOptionId; })[0];
    return correct.label + ". " + correct.text;
  }

  /* ---------- Helpers ---------- */

  function questionsFor(subjectId, topicId) {
    return App.data.questions.filter(function (q) {
      return q.subjectId === subjectId && (topicId === "all" || q.topicId === topicId);
    });
  }

  function quizHref(subjectId, topicId) {
    return "#/quiz/" + encodeURIComponent(subjectId) + "/" + encodeURIComponent(topicId);
  }

  function breadcrumb(crumbs) {
    return '<nav class="breadcrumb" aria-label="Breadcrumb"><ol>' +
      crumbs.map(function (c) {
        return "<li>" + (c[1] ? '<a href="' + c[1] + '">' + esc(c[0]) + "</a>" :
          '<span aria-current="page">' + esc(c[0]) + "</span>") + "</li>";
      }).join("") + "</ol></nav>";
  }

  function notFound(message) {
    App.mainEl().innerHTML = breadcrumb([["Practice Quiz", "#/quiz"]]) +
      App.pageTitle("Quiz not found", { href: "#/quiz", label: "Practice Quiz" }) +
      '<div class="card"><p>' + esc(message) + "</p>" +
      '<a class="btn btn-secondary" href="#/quiz">Back to Practice Quiz</a></div>';
  }

  /** "Best: 80% · 3 attempts" text for a topic (or "all"). */
  function attemptSummary(subjectId, topicId) {
    var stats = App.progress.quizStats(subjectId, topicId);
    if (!stats.attempts) return '<span class="muted">Not attempted yet</span>';
    return "Best: <strong>" + stats.bestPercent + "%</strong> · " +
      stats.attempts + (stats.attempts === 1 ? " attempt" : " attempts");
  }

  /* ---------- Choose screens ---------- */

  function renderSubjects() {
    var cards = App.data.subjects.map(function (subject) {
      var count = questionsFor(subject.id, "all").length;
      return '<a class="card subject-card" href="#/quiz/' + encodeURIComponent(subject.id) + '">' +
        "<h2>" + esc(subject.name) + "</h2>" +
        '<p class="small">' + count + " questions</p>" +
        '<p class="small">' + attemptSummary(subject.id, "all") + "</p>" +
        "</a>";
    }).join("");

    App.mainEl().innerHTML =
      "<h1>Practice Quiz</h1>" +
      '<p class="muted">Answer one question at a time and get instant feedback with an explanation.</p>' +
      '<div class="grid grid-2">' + cards + "</div>";
  }

  function renderSubject(subject) {
    function row(title, topicId) {
      var count = questionsFor(subject.id, topicId).length;
      if (!count) {
        return '<li class="deck-row"><strong>' + esc(title) + "</strong>" +
          '<p class="muted small">No questions yet. Add some in <code>data/questions.json</code>.</p></li>';
      }
      return '<li class="deck-row">' +
        "<strong>" + esc(title) + "</strong>" +
        '<p class="small">' + count + " questions · " + attemptSummary(subject.id, topicId) + "</p>" +
        '<div class="button-row"><a class="btn" href="' + quizHref(subject.id, topicId) + '">Start quiz</a></div>' +
        "</li>";
    }

    App.mainEl().innerHTML =
      breadcrumb([["Practice Quiz", "#/quiz"], [subject.name, null]]) +
      App.pageTitle(subject.name + " quizzes", { href: "#/quiz", label: "Practice Quiz" }) +
      '<div class="card"><ul class="list-plain deck-list">' +
        row("All " + subject.name + " topics (mixed)", "all") +
        subject.topics.map(function (t) { return row(t.name, t.id); }).join("") +
      "</ul></div>";
  }

  /* ---------- Taking a quiz ---------- */

  /**
   * Start a quiz.
   * mode "full"  = all questions for the topic
   * mode "retry" = only the questions missed in the previous round
   */
  function startQuiz(subject, topic, questions, mode) {
    quiz = {
      subject: subject,
      topic: topic,     // null = all topics
      mode: mode,
      questions: App.utils.shuffle(questions).map(prepareQuestion),
      index: 0,
      answers: {},      // questionId -> chosen option id
      correctCount: 0,
      startedAt: Date.now(),
      saved: false
    };
  }

  function quizTitle() {
    var name = quiz.topic ? quiz.topic.name : "All " + quiz.subject.name + " topics";
    return quiz.mode === "retry" ? "Retry missed: " + name : name;
  }

  /** Heading for quiz screens; Back returns to this subject's list of topics. */
  function quizHeading(title) {
    return App.pageTitle(title, {
      href: "#/quiz/" + encodeURIComponent(quiz.subject.id),
      label: quiz.subject.name + " quizzes"
    });
  }

  function crumbs() {
    return breadcrumb([["Practice Quiz", "#/quiz"],
      [quiz.subject.name, "#/quiz/" + encodeURIComponent(quiz.subject.id)],
      [quiz.topic ? quiz.topic.name : "All topics", null]]);
  }

  function renderQuestion() {
    var total = quiz.questions.length;
    if (quiz.index >= total) return renderResults();

    var prepared = quiz.questions[quiz.index];
    var q = prepared.source;
    var chosen = quiz.answers[q.id];
    var answered = chosen !== undefined;
    var isLast = quiz.index === total - 1;

    var optionsHtml = prepared.options.map(function (option) {
      var cls = "option";
      var tag = "";
      if (answered) {
        // Text tags ("Correct answer", "Your answer") so meaning is not color-only.
        if (option.id === q.correctOptionId) {
          cls += " option-correct";
          tag = '<span class="option-tag">✓ Correct answer</span>';
        } else if (option.id === chosen) {
          cls += " option-wrong";
          tag = '<span class="option-tag">✗ Your answer</span>';
        }
      }
      return '<li><button type="button" class="' + cls + '" data-option="' + esc(option.id) + '"' +
        (answered ? " disabled" : "") + ">" +
        '<span class="option-label">' + option.label + "</span>" +
        '<span class="option-text">' + esc(option.text) + tag + "</span>" +
        "</button></li>";
    }).join("");

    var feedbackHtml = "";
    if (answered) {
      var right = chosen === q.correctOptionId;
      feedbackHtml =
        '<div class="feedback ' + (right ? "feedback-correct" : "feedback-wrong") + '" id="quiz-feedback" tabindex="-1">' +
          "<p><strong>" + (right ? "✓ Correct!" : "✗ Not quite.") + "</strong>" +
          (right ? "" : " The correct answer is <strong>" + esc(correctAnswerText(prepared)) + "</strong>.") + "</p>" +
          '<p class="explanation"><strong>Why:</strong> ' + esc(q.explanation) + "</p>" +
        "</div>" +
        '<button type="button" class="btn btn-block" id="quiz-next">' + (isLast ? "See results" : "Next question →") + "</button>";
    }

    App.mainEl().innerHTML =
      crumbs() +
      quizHeading(quizTitle()) +
      '<div class="study-toolbar">' +
        '<p class="small">Question <strong>' + (quiz.index + 1) + "</strong> of " + total + "</p>" +
        '<p class="small">Score: <strong>' + quiz.correctCount + "</strong></p>" +
      "</div>" +
      App.utils.progressBar(App.utils.percent(quiz.index + (answered ? 1 : 0), total), "Quiz progress") +
      '<div class="card question-card">' +
        '<p class="question-meta small muted">' + "Question difficulty: " + esc(App.utils.difficultyLabel(q.difficulty)) + "</p>" +
        '<p class="question-text">' + esc(q.question) + "</p>" +
        '<ul class="option-list">' + optionsHtml + "</ul>" +
        feedbackHtml +
      "</div>";

    // Choosing an option
    var buttons = App.mainEl().querySelectorAll("button[data-option]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener("click", function (event) {
        answer(event.currentTarget.getAttribute("data-option"));
      });
    }
    var next = document.getElementById("quiz-next");
    if (next) {
      next.addEventListener("click", function () {
        quiz.index++;
        renderQuestion();
        var first = App.mainEl().querySelector("button[data-option]") || document.getElementById("quiz-retry") ||
          document.getElementById("quiz-again");
        if (first) first.focus();
      });
    }
  }

  function answer(optionId) {
    var q = quiz.questions[quiz.index].source;
    if (quiz.answers[q.id] !== undefined) return; // already answered
    quiz.answers[q.id] = optionId;
    var right = optionId === q.correctOptionId;
    if (right) quiz.correctCount++;
    App.progress.recordAnswer(q.id, right);

    renderQuestion();
    // Move focus to the feedback so keyboard/screen-reader users hear it.
    var feedback = document.getElementById("quiz-feedback");
    if (feedback) feedback.focus();
  }

  function wrongQuestions() {
    return quiz.questions.filter(function (p) {
      return quiz.answers[p.source.id] !== p.source.correctOptionId;
    });
  }

  /** Save the finished attempt once. */
  function saveAttempt() {
    if (quiz.saved) return;
    quiz.saved = true;
    var total = quiz.questions.length;
    var finishedAt = Date.now();
    App.storage.update(function (data) {
      data.quizAttempts.push({
        id: "quiz-" + finishedAt,
        subjectId: quiz.subject.id,
        topicId: quiz.topic ? quiz.topic.id : "all",
        mode: quiz.mode,
        total: total,
        correct: quiz.correctCount,
        percent: App.utils.percent(quiz.correctCount, total),
        wrongQuestionIds: wrongQuestions().map(function (p) { return p.source.id; }),
        startedAt: quiz.startedAt,
        finishedAt: finishedAt
      });
    });
  }

  function renderResults() {
    saveAttempt();
    var total = quiz.questions.length;
    var pct = App.utils.percent(quiz.correctCount, total);
    var wrong = wrongQuestions();

    var missedHtml = wrong.length ?
      '<h2 class="section-title">Questions you missed</h2>' +
      wrong.map(function (p) {
        var chosen = p.options.filter(function (o) { return o.id === quiz.answers[p.source.id]; })[0];
        return '<div class="card review-item">' +
          '<p class="question-text">' + esc(p.source.question) + "</p>" +
          '<p class="small">✗ Your answer: ' + esc(chosen ? chosen.label + ". " + chosen.text : "—") + "</p>" +
          '<p class="small">✓ Correct answer: <strong>' + esc(correctAnswerText(p)) + "</strong></p>" +
          '<p class="small explanation"><strong>Why:</strong> ' + esc(p.source.explanation) + "</p>" +
          "</div>";
      }).join("") : "";

    App.mainEl().innerHTML =
      crumbs() +
      quizHeading("Quiz results") +
      '<div class="card score-card">' +
        '<p class="score-big">' + quiz.correctCount + " / " + total + "</p>" +
        "<p><strong>" + pct + "%</strong> · " + esc(quizTitle()) + "</p>" +
        '<p class="small muted">Practice score only. This is not a UST admission rating.</p>' +
      "</div>" +
      '<div class="button-row">' +
        (wrong.length ? '<button type="button" class="btn" id="quiz-retry">Retry missed questions (' + wrong.length + ")</button>" : "") +
        '<button type="button" class="btn ' + (wrong.length ? "btn-secondary" : "") + '" id="quiz-again">Retake full quiz</button>' +
        '<a class="btn btn-secondary" href="#/quiz/' + encodeURIComponent(quiz.subject.id) + '">Choose another topic</a>' +
      "</div>" +
      missedHtml;

    var retry = document.getElementById("quiz-retry");
    if (retry) {
      retry.addEventListener("click", function () {
        startQuiz(quiz.subject, quiz.topic, wrong.map(function (p) { return p.source; }), "retry");
        renderQuestion();
        App.mainEl().querySelector("button[data-option]").focus();
      });
    }
    document.getElementById("quiz-again").addEventListener("click", function () {
      startQuiz(quiz.subject, quiz.topic, questionsFor(quiz.subject.id, quiz.topic ? quiz.topic.id : "all"), "full");
      renderQuestion();
      App.mainEl().querySelector("button[data-option]").focus();
    });
  }

  /* ---------- Route entry point ---------- */

  function render(params) {
    var subjectId = params[0];
    var topicId = params[1];

    if (!subjectId) return renderSubjects();
    var subject = App.getSubject(subjectId);
    if (!subject) return notFound('There is no subject with id "' + subjectId + '".');
    if (!topicId) return renderSubject(subject);

    var topic = null;
    if (topicId !== "all") {
      topic = App.getTopic(subject, topicId);
      if (!topic) return notFound('"' + subject.name + '" has no topic with id "' + topicId + '".');
    }
    var questions = questionsFor(subject.id, topicId);
    if (!questions.length) return notFound("There are no questions for this topic yet. Add some in data/questions.json.");

    startQuiz(subject, topic, questions, "full");
    renderQuestion();
  }

  return {
    render: render,
    prepareQuestion: prepareQuestion,
    correctAnswerText: correctAnswerText
  };
})();
