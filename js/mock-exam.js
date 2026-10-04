/* ==========================================================================
   mock-exam.js — timed, mixed-subject mock exam driven by data/mock-exam.json.

   NOTHING about the exam's length is written in this file. Section order,
   item counts, time limits, presets, custom-practice choices and the
   time-pressure meter levels all come from data/mock-exam.json.

   Addresses:
     #/mock                 setup screen (or resumes an exam in progress)
     #/mock/result/<id>     results of a finished mock exam

   How the exam works:
     - Sections are taken one after another, each with its own timer.
     - The timer uses a fixed END TIME (deadline), not a counter, so it stays
       correct even if the browser slows down background tabs.
     - No right/wrong feedback appears until the whole exam is finished.
     - Answers can be changed until a section is finished or its time runs out.
     - The exam in progress is saved (activeMock), so a reload resumes it.

   Saved data (see storage.js):
     activeMock   = the exam in progress, or null
     mockHistory  = list of finished exams (with every answer, for review)
   ========================================================================== */

window.App = window.App || {};

App.mockExam = (function () {
  var esc = App.utils.escapeHtml;
  var LABELS = ["A", "B", "C", "D", "E", "F", "G", "H"];
  var timerId = null;
  var lastAnnouncedMinute = null;

  // Choices on the setup screen (remembered while the app stays open).
  var setup = { modeId: null, count: null, minutes: null, subjects: null };

  function cfg() { return App.data.mockExam; }

  /* ======================================================================
     Small helpers
     ====================================================================== */

  function questionById(id) { return App.utils.findById(App.data.questions, id); }

  function poolFor(subjectId) {
    return App.data.questions.filter(function (q) { return q.subjectId === subjectId; });
  }

  function subjectName(subjectId) {
    var s = App.getSubject(subjectId);
    return s ? s.name : subjectId;
  }

  /** Readable text for a section's "verification" value. */
  function verificationLabel(value) {
    return {
      "verified": "Verified (official)",
      "community-reported": "Community-reported, unverified",
      "unverified": "Unverified",
      "practice-default": "Practice setting, not real exam numbers"
    }[value] || value;
  }

  function isOfficial() { return cfg().status === "official"; }

  function isConfigured(section) {
    return typeof section.itemCount === "number" && section.itemCount > 0 &&
      typeof section.timeMinutes === "number" && section.timeMinutes > 0;
  }

  /* ======================================================================
     Modes: Standard (main blueprint), presets, and Custom practice
     ====================================================================== */

  function getModes() {
    var exam = cfg();
    var modes = [{
      id: "standard",
      name: "Standard",
      description: "Four timed sections using the main blueprint" +
        (isOfficial() ? "." : " (community-reported numbers, not official)."),
      kind: "sections",
      isStandard: true,
      sections: exam.sections
    }];
    (exam.presets || []).forEach(function (preset) {
      modes.push({
        id: preset.id,
        name: preset.name,
        description: preset.description || "",
        kind: "sections",
        isStandard: false,
        sections: preset.sections
      });
    });
    if (exam.customPractice) {
      modes.push({
        id: "custom",
        name: "Custom practice",
        description: "Pick the number of questions, the time limit, and which subjects to include. Good for relaxed review or speed drills.",
        kind: "custom",
        isStandard: false
      });
    }
    return modes;
  }

  function findMode(id) {
    return getModes().filter(function (m) { return m.id === id; })[0] || null;
  }

  /** A mode is usable when every section has an item count and time limit. */
  function modeIsReady(mode) {
    return mode.kind === "custom" || mode.sections.every(isConfigured);
  }

  /* ======================================================================
     Time-pressure meter (time per question -> Very Easy ... Extreme)
     This rates TIME PRESSURE only, not how hard the questions are.
     ====================================================================== */

  function pressureLevels() { return cfg().timePressureLevels || []; }

  /** Find the level for a pace, e.g. 34 seconds per question -> "Hard". */
  function pressureFor(secondsPerQuestion) {
    var levels = pressureLevels();
    for (var i = 0; i < levels.length; i++) {
      if (secondsPerQuestion >= levels[i].minSecondsPerQuestion) {
        return { label: levels[i].label, index: i, count: levels.length };
      }
    }
    return null;
  }

  /** "30 seconds" or "1.5 minutes" (time available per question). */
  function paceText(secondsPerQuestion) {
    if (secondsPerQuestion < 120) return Math.round(secondsPerQuestion) + " seconds";
    return (Math.round(secondsPerQuestion / 6) / 10) + " minutes";
  }

  /** The visual meter: a row of segments from green (relaxed) to red (extreme), plus text. */
  function meterHtml(secondsPerQuestion) {
    var level = pressureFor(secondsPerQuestion);
    if (!level) return "";
    var levels = pressureLevels();
    var segments = levels.map(function (l, i) {
      var hue = levels.length > 1 ? Math.round(130 - (130 * i) / (levels.length - 1)) : 0;
      var on = i <= level.index;
      return '<span class="meter-seg' + (on ? " is-on" : "") + '"' +
        (on ? ' style="background:hsl(' + hue + ',62%,42%)"' : "") +
        ' title="' + esc(l.label) + '"></span>';
    }).join("");

    return '<div class="pressure">' +
      '<p class="pressure-head">Time pressure: <strong>' + esc(level.label) + "</strong>" +
        ' <span class="muted small">(' + (level.index + 1) + " of " + level.count + ")</span></p>" +
      '<div class="meter" aria-hidden="true">' + segments + "</div>" +
      '<div class="meter-scale" aria-hidden="true"><span>' + esc(levels[0].label) + "</span><span>" +
        esc(levels[levels.length - 1].label) + "</span></div>" +
      '<p class="pressure-pace">About <strong>' + paceText(secondsPerQuestion) + "</strong> per question</p>" +
      '<p class="small muted">This rates time pressure only, not how hard the questions are.</p>' +
    "</div>";
  }

  /* ======================================================================
     Planning: how many questions and how much time each section gets.
     If the question bank is smaller than the blueprint, the exam uses every
     available question and shortens the time to keep the SAME pace.
     ====================================================================== */

  function planSections(mode) {
    return mode.sections.filter(isConfigured).map(function (s) {
      var available = poolFor(s.subjectId).length;
      var used = Math.min(s.itemCount, available);
      var configuredSeconds = s.timeMinutes * 60;
      return {
        title: subjectName(s.subjectId),
        subjectIds: [s.subjectId],
        perSubject: null,
        requested: s.itemCount,
        available: available,
        used: used,
        configuredSeconds: configuredSeconds,
        timeSeconds: Math.round(configuredSeconds * used / s.itemCount),
        verification: s.verification
      };
    });
  }

  /** Custom practice: one mixed section, questions split evenly across the chosen subjects. */
  function planCustom(count, minutes, subjectIds) {
    var available = {};
    var take = {};
    subjectIds.forEach(function (id) { available[id] = poolFor(id).length; });

    // Even split; the first subjects get any remainder.
    var base = Math.floor(count / subjectIds.length);
    var remainder = count % subjectIds.length;
    var shortfall = 0;
    subjectIds.forEach(function (id, i) {
      var wanted = base + (i < remainder ? 1 : 0);
      take[id] = Math.min(wanted, available[id]);
      shortfall += wanted - take[id];
    });
    // Give any shortfall to subjects that still have unused questions.
    var moved = true;
    while (shortfall > 0 && moved) {
      moved = false;
      subjectIds.forEach(function (id) {
        if (shortfall > 0 && take[id] < available[id]) { take[id]++; shortfall--; moved = true; }
      });
    }

    var used = 0, totalAvailable = 0;
    subjectIds.forEach(function (id) { used += take[id]; totalAvailable += available[id]; });
    var configuredSeconds = minutes * 60;
    return [{
      title: "Custom practice",
      subjectIds: subjectIds.slice(),
      perSubject: take,
      requested: count,
      available: totalAvailable,
      used: used,
      configuredSeconds: configuredSeconds,
      timeSeconds: count ? Math.round(configuredSeconds * used / count) : 0,
      verification: "practice-default"
    }];
  }

  function currentPlan(mode) {
    if (mode.kind === "custom") return planCustom(setup.count, setup.minutes, setup.subjects);
    return planSections(mode);
  }

  /** Notice text when some sections have fewer questions than requested. */
  function shortfallHtml(plan) {
    var short = plan.filter(function (p) { return p.used < p.requested; });
    if (!short.length) return "";
    return '<div class="notice">' +
      "<strong>Not enough questions in the question bank yet.</strong> " +
      "The exam will use every available question and shorten the time to keep the same pace:" +
      '<ul class="small">' + short.map(function (p) {
        return "<li>" + esc(p.title) + ": " + p.used + " of " + p.requested + " questions, " +
          App.utils.formatDuration(p.timeSeconds) + " instead of " + App.utils.formatDuration(p.configuredSeconds) + "</li>";
      }).join("") + "</ul>" +
      '<p class="small">Add more questions to <code>data/questions.json</code> for a full-length mock.</p>' +
    "</div>";
  }

  /* ======================================================================
     Setup screen
     ====================================================================== */

  function initSetupDefaults() {
    var custom = cfg().customPractice || {};
    var modes = getModes();
    if (!setup.modeId || !findMode(setup.modeId)) {
      var ready = modes.filter(modeIsReady)[0];
      setup.modeId = ready ? ready.id : modes[0].id;
    }
    if (setup.count === null) {
      setup.count = custom.defaultQuestionCount || (custom.questionCountOptions || [10])[0];
    }
    if (setup.minutes === null) {
      setup.minutes = custom.defaultTimeMinutes || (custom.timeMinuteOptions || [10])[0];
    }
    if (!setup.subjects) {
      setup.subjects = App.data.subjects.map(function (s) { return s.id; });
    }
  }

  function provisionalNoticeHtml() {
    if (isOfficial()) return "";
    var exam = cfg();
    return '<div class="notice" role="note">' +
      "<strong>⚠ PROVISIONAL / UNVERIFIED blueprint.</strong> " + esc(exam.statusNote || "") +
      (exam.sourceNote ? '<p class="small">' + esc(exam.sourceNote) + "</p>" : "") +
    "</div>";
  }

  /** Short summary line for a mode, e.g. "265 questions · 2 h 45 min". */
  function modeSummary(mode) {
    if (mode.kind === "custom") return "You choose";
    if (!modeIsReady(mode)) return "Not configured yet";
    var items = 0, seconds = 0;
    mode.sections.forEach(function (s) { items += s.itemCount; seconds += s.timeMinutes * 60; });
    return items + " questions · " + App.utils.formatDuration(seconds);
  }

  function renderSetup() {
    initSetupDefaults();
    var modes = getModes();

    var modeOptions = modes.map(function (mode) {
      var ready = modeIsReady(mode);
      return '<label class="mode-option' + (ready ? "" : " is-disabled") + '">' +
        '<input type="radio" name="mock-mode" value="' + esc(mode.id) + '"' +
          (mode.id === setup.modeId ? " checked" : "") + (ready ? "" : " disabled") + ">" +
        '<span class="mode-text"><strong>' + esc(mode.name) + "</strong>" +
          '<span class="small">' + esc(modeSummary(mode)) + "</span>" +
          '<span class="small muted">' + esc(mode.description) + "</span></span>" +
      "</label>";
    }).join("");

    App.mainEl().innerHTML =
      "<h1>" + esc(cfg().title) + "</h1>" +
      '<p class="muted">A timed practice exam with all four USTET areas. You see your score and explanations only at the end.</p>' +
      provisionalNoticeHtml() +
      '<fieldset class="card mode-list"><legend>Choose a mode</legend>' + modeOptions + "</fieldset>" +
      '<div id="mock-details"></div>' +
      '<div class="card">' +
        "<h2>Before you start</h2>" +
        '<ul class="rules">' +
          "<li>No right/wrong feedback until the end.</li>" +
          "<li>You can change answers until you finish a section.</li>" +
          "<li>Each section ends automatically when its time runs out.</li>" +
          "<li>The timer keeps running even if you leave the page. Return to Mock to continue.</li>" +
        "</ul>" +
        '<p id="mock-start-msg" class="small" aria-live="polite"></p>' +
        '<button type="button" class="btn btn-block" id="mock-start">Start mock exam</button>' +
      "</div>" +
      historyHtml();

    var radios = App.mainEl().querySelectorAll('input[name="mock-mode"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].addEventListener("change", function (event) {
        setup.modeId = event.currentTarget.value;
        renderDetails();
      });
    }
    document.getElementById("mock-start").addEventListener("click", startExam);
    renderDetails();
  }

  /** The part of the setup screen that changes with the chosen mode. */
  function renderDetails() {
    var mode = findMode(setup.modeId);
    var box = document.getElementById("mock-details");
    if (!mode) { box.innerHTML = ""; return; }

    if (!modeIsReady(mode)) {
      box.innerHTML = '<div class="notice notice-error"><strong>This mode is not configured yet.</strong> ' +
        "Set <code>itemCount</code> and <code>timeMinutes</code> (greater than 0) for every section in " +
        "<code>data/mock-exam.json</code>. The app does not guess official numbers.</div>";
      updateStartButton();
      return;
    }

    if (mode.kind === "custom") return renderCustomDetails(box);

    var plan = planSections(mode);
    var totalItems = 0, totalSeconds = 0;
    var rows = plan.map(function (p) {
      totalItems += p.requested;
      totalSeconds += p.configuredSeconds;
      var pace = p.configuredSeconds / p.requested;
      var level = pressureFor(pace);
      return "<tr><td>" + esc(p.title) + "</td><td>" + p.requested + "</td><td>" +
        App.utils.formatDuration(p.configuredSeconds) + "</td><td>" + paceText(pace) +
        (level ? "<br><span class=\"small\">" + esc(level.label) + "</span>" : "") + "</td>" +
        '<td class="small">' + esc(verificationLabel(p.verification)) + "</td></tr>";
    }).join("");

    box.innerHTML =
      '<div class="card">' +
        "<h2>" + esc(mode.name) + " sections</h2>" +
        '<div class="table-wrap"><table class="data-table">' +
          "<thead><tr><th>Section</th><th>Questions</th><th>Time</th><th>Pace</th><th>Source</th></tr></thead>" +
          "<tbody>" + rows + "</tbody>" +
          "<tfoot><tr><th>Total</th><th>" + totalItems + "</th><th>" + App.utils.formatDuration(totalSeconds) +
            "</th><th></th><th></th></tr></tfoot>" +
        "</table></div>" +
        meterHtml(totalSeconds / totalItems) +
      "</div>" +
      shortfallHtml(plan);
    updateStartButton();
  }

  /** Custom practice: subjects, question count and time chips, plus the live meter. */
  function renderCustomDetails(box) {
    var custom = cfg().customPractice;

    function chips(name, values, selected, suffix) {
      return values.map(function (v) {
        return '<label class="chip"><input type="radio" name="' + name + '" value="' + v + '"' +
          (v === selected ? " checked" : "") + "><span>" + v + suffix + "</span></label>";
      }).join("");
    }

    var subjectChecks = App.data.subjects.map(function (s) {
      return '<label class="chip"><input type="checkbox" name="mock-subject" value="' + esc(s.id) + '"' +
        (setup.subjects.indexOf(s.id) >= 0 ? " checked" : "") + "><span>" + esc(s.shortName) + "</span></label>";
    }).join("");

    box.innerHTML =
      '<div class="card">' +
        "<h2>Custom practice</h2>" +
        '<fieldset class="chip-group"><legend>Subjects</legend>' + subjectChecks + "</fieldset>" +
        '<fieldset class="chip-group"><legend>Number of questions</legend>' +
          chips("mock-count", custom.questionCountOptions, setup.count, "") + "</fieldset>" +
        '<fieldset class="chip-group"><legend>Time limit</legend>' +
          chips("mock-minutes", custom.timeMinuteOptions, setup.minutes, " min") + "</fieldset>" +
        '<div id="custom-summary" aria-live="polite"></div>' +
      "</div>" +
      '<div id="custom-shortfall"></div>';

    var inputs = box.querySelectorAll("input");
    for (var i = 0; i < inputs.length; i++) {
      inputs[i].addEventListener("change", function () {
        readCustomInputs();
        updateCustomSummary();
      });
    }
    updateCustomSummary();
  }

  function readCustomInputs() {
    var box = document.getElementById("mock-details");
    var count = box.querySelector('input[name="mock-count"]:checked');
    var minutes = box.querySelector('input[name="mock-minutes"]:checked');
    if (count) setup.count = Number(count.value);
    if (minutes) setup.minutes = Number(minutes.value);
    setup.subjects = Array.prototype.slice.call(box.querySelectorAll('input[name="mock-subject"]:checked'))
      .map(function (el) { return el.value; });
  }

  /** Recalculate the meter and summary whenever a choice changes. */
  function updateCustomSummary() {
    var summary = document.getElementById("custom-summary");
    var shortBox = document.getElementById("custom-shortfall");
    if (!setup.subjects.length) {
      summary.innerHTML = '<p class="notice notice-error">Choose at least one subject.</p>';
      shortBox.innerHTML = "";
      updateStartButton();
      return;
    }
    var plan = planCustom(setup.count, setup.minutes, setup.subjects)[0];
    var split = setup.subjects.map(function (id) {
      return esc(App.getSubject(id).shortName) + " " + plan.perSubject[id];
    }).join(", ");

    summary.innerHTML =
      '<p class="custom-total"><strong>' + setup.count + " questions in " + setup.minutes + " minutes</strong></p>" +
      meterHtml((setup.minutes * 60) / setup.count) +
      '<p class="small muted">Questions per subject: ' + split + "</p>";
    shortBox.innerHTML = shortfallHtml([plan]);
    updateStartButton();
  }

  function updateStartButton() {
    var button = document.getElementById("mock-start");
    var msg = document.getElementById("mock-start-msg");
    if (!button) return;
    var mode = findMode(setup.modeId);
    var problem = "";
    if (!mode || !modeIsReady(mode)) problem = "This mode is not configured yet.";
    else if (mode.kind === "custom" && !setup.subjects.length) problem = "Choose at least one subject.";
    else {
      var used = currentPlan(mode).reduce(function (sum, p) { return sum + p.used; }, 0);
      if (!used) problem = "There are no questions for this mode yet. Add some to data/questions.json.";
    }
    button.disabled = !!problem;
    msg.textContent = problem;
  }

  /** Past attempts on the setup screen. */
  function historyHtml() {
    var history = App.storage.get().mockHistory.slice().reverse().slice(0, 10);
    if (!history.length) return "";
    return '<h2 class="section-title">Past mock exams</h2><div class="card"><ul class="list-plain">' +
      history.map(function (h) {
        return '<li><a href="#/mock/result/' + encodeURIComponent(h.id) + '">' +
          esc(App.utils.formatDate(h.finishedAt)) + "</a> · " + esc(h.modeName) +
          " · <strong>" + h.correct + "/" + h.total + " (" + h.percent + "%)</strong></li>";
      }).join("") + "</ul></div>";
  }

  /* ======================================================================
     Starting and running the exam
     ====================================================================== */

  function active() { return App.storage.get().activeMock; }
  function saveActive() { App.storage.save(); }

  function startExam() {
    var mode = findMode(setup.modeId);
    if (!mode || !modeIsReady(mode)) return;
    var plan = currentPlan(mode).filter(function (p) { return p.used > 0; });
    if (!plan.length) return;

    var sections = plan.map(function (p) {
      var ids = [];
      if (p.perSubject) {
        p.subjectIds.forEach(function (sid) {
          ids = ids.concat(App.utils.shuffle(poolFor(sid)).slice(0, p.perSubject[sid])
            .map(function (q) { return q.id; }));
        });
        ids = App.utils.shuffle(ids); // mix the subjects together
      } else {
        ids = App.utils.shuffle(poolFor(p.subjectIds[0])).slice(0, p.used).map(function (q) { return q.id; });
      }
      return {
        title: p.title,
        subjectIds: p.subjectIds,
        verification: p.verification,
        requested: p.requested,
        configuredSeconds: p.configuredSeconds,
        timeSeconds: p.timeSeconds,
        // Store the shuffled choice order so a reload shows the same letters.
        items: ids.map(function (id) {
          return {
            questionId: id,
            optionOrder: App.utils.shuffle(questionById(id).options).map(function (o) { return o.id; })
          };
        }),
        startedAt: null,
        endedAt: null,
        endedBy: null
      };
    });

    App.storage.update(function (data) {
      data.activeMock = {
        modeId: mode.id,
        modeName: mode.name,
        blueprintStatus: mode.isStandard ? cfg().status : "practice",
        createdAt: Date.now(),
        phase: "section-intro",   // "section-intro" (waiting to start a section) or "running"
        sectionIndex: 0,
        questionIndex: 0,
        lastEndedBy: null,
        answers: {},              // questionId -> chosen option id
        sections: sections
      };
    });
    renderSectionIntro();
  }

  /** Hide the main navigation during the exam for a focused layout. */
  function enterExamMode() {
    document.body.classList.add("exam-mode");
    App.router.onLeave(leaveExamScreen);
  }

  function leaveExamScreen() {
    stopTimer();
    document.body.classList.remove("exam-mode");
  }

  function deadlineOf(section) {
    return section.startedAt + section.timeSeconds * 1000;
  }

  /** Inline confirm box (the app avoids pop-up dialogs). */
  function quitConfirmHtml() {
    return '<div id="mock-quit-box" class="notice notice-error" hidden>' +
      "<p><strong>Quit this mock exam?</strong> Your answers will be discarded and no score will be saved.</p>" +
      '<div class="button-row">' +
        '<button type="button" class="btn btn-secondary" id="mock-quit-cancel">Keep going</button>' +
        '<button type="button" class="btn btn-danger" id="mock-quit-yes">Quit exam</button>' +
      "</div></div>";
  }

  function wireQuit() {
    var box = document.getElementById("mock-quit-box");
    document.getElementById("mock-quit").addEventListener("click", function () {
      box.hidden = false;
      document.getElementById("mock-quit-cancel").focus();
    });
    document.getElementById("mock-quit-cancel").addEventListener("click", function () {
      box.hidden = true;
      document.getElementById("mock-quit").focus();
    });
    document.getElementById("mock-quit-yes").addEventListener("click", function () {
      App.storage.update(function (data) { data.activeMock = null; });
      leaveExamScreen();
      renderSetup();
    });
  }

  /** Screen shown before each section starts. */
  function renderSectionIntro() {
    stopTimer();
    enterExamMode();
    var exam = active();
    var section = exam.sections[exam.sectionIndex];
    var count = section.items.length;
    var pace = section.timeSeconds / count;

    var subjectsText = section.subjectIds.length > 1 ?
      '<p class="small muted">Subjects mixed together: ' + section.subjectIds.map(subjectName).map(esc).join(", ") + "</p>" : "";

    App.mainEl().innerHTML =
      (exam.lastEndedBy === "time" ?
        '<div class="notice" role="status"><strong>⏰ Time is up for the previous section.</strong> Your answers were saved.</div>' : "") +
      '<p class="small muted">' + esc(exam.modeName) + " mock exam · Section " + (exam.sectionIndex + 1) +
        " of " + exam.sections.length + "</p>" +
      "<h1>" + esc(section.title) + "</h1>" +
      '<div class="card">' +
        '<p class="custom-total"><strong>' + count + " questions · " + App.utils.formatDuration(section.timeSeconds) + "</strong></p>" +
        subjectsText +
        (count < section.requested ?
          '<p class="small">Shortened from ' + section.requested + " questions / " +
          App.utils.formatDuration(section.configuredSeconds) + " because the question bank is smaller. Same pace.</p>" : "") +
        meterHtml(pace) +
        '<p class="small">The timer starts when you press Start. No feedback is shown until the end of the exam.</p>' +
        '<button type="button" class="btn btn-block" id="mock-begin">Start section ' + (exam.sectionIndex + 1) + "</button>" +
      "</div>" +
      '<button type="button" class="btn btn-secondary" id="mock-quit">Quit exam</button>' +
      quitConfirmHtml();

    document.getElementById("mock-begin").addEventListener("click", function () {
      section.startedAt = Date.now();
      exam.phase = "running";
      exam.questionIndex = 0;
      exam.lastEndedBy = null;
      saveActive();
      renderRunning();
      startTimer();
      focusQuestion();
    });
    wireQuit();
  }

  /** The exam question screen. */
  function renderRunning() {
    enterExamMode();
    var exam = active();
    var section = exam.sections[exam.sectionIndex];
    var total = section.items.length;
    var item = section.items[exam.questionIndex];
    var q = questionById(item.questionId);
    var chosen = exam.answers[item.questionId];
    var answeredCount = section.items.filter(function (it) { return exam.answers[it.questionId] !== undefined; }).length;
    var isLast = exam.questionIndex === total - 1;

    var optionsHtml = item.optionOrder.map(function (optionId, i) {
      var option = App.utils.findById(q.options, optionId);
      var selected = optionId === chosen;
      return '<li><button type="button" class="option' + (selected ? " is-selected" : "") + '" data-option="' +
        esc(optionId) + '" aria-pressed="' + (selected ? "true" : "false") + '">' +
        '<span class="option-label">' + LABELS[i] + "</span>" +
        '<span class="option-text">' + esc(option ? option.text : "") +
          (selected ? '<span class="option-tag">● Selected</span>' : "") + "</span>" +
        "</button></li>";
    }).join("");

    // Question number grid: shows which questions are answered (with a dot, not color only).
    var gridHtml = section.items.map(function (it, i) {
      var answered = exam.answers[it.questionId] !== undefined;
      var current = i === exam.questionIndex;
      return '<button type="button" class="qnum' + (answered ? " is-answered" : "") + (current ? " is-current" : "") +
        '" data-jump="' + i + '" aria-label="Question ' + (i + 1) + (answered ? ", answered" : ", not answered") + '"' +
        (current ? ' aria-current="step"' : "") + ">" + (i + 1) + (answered ? "<span aria-hidden=\"true\">•</span>" : "") + "</button>";
    }).join("");

    var unanswered = total - answeredCount;

    App.mainEl().innerHTML =
      '<div class="exam-bar">' +
        '<div><p class="small exam-bar-title">' + esc(section.title) + " · Section " + (exam.sectionIndex + 1) + " of " + exam.sections.length + "</p>" +
        '<p class="small">Question <strong>' + (exam.questionIndex + 1) + "</strong> of " + total +
          " · " + answeredCount + " answered</p></div>" +
        '<p class="timer" role="timer" aria-label="Time left in this section"><span id="mock-timer">--:--</span></p>' +
      "</div>" +
      '<p id="mock-announce" class="visually-hidden" aria-live="assertive"></p>' +
      '<div class="card question-card">' +
        (section.subjectIds.length > 1 ? '<p class="question-meta small muted">' + esc(subjectName(q.subjectId)) + "</p>" : "") +
        '<p class="question-text" id="mock-question" tabindex="-1">' + esc(q.question) + "</p>" +
        '<ul class="option-list">' + optionsHtml + "</ul>" +
      "</div>" +
      '<nav class="pager" aria-label="Question navigation">' +
        '<button type="button" class="btn btn-secondary" id="mock-prev"' + (exam.questionIndex === 0 ? " disabled" : "") + ">← Previous</button>" +
        (isLast ? '<button type="button" class="btn" id="mock-finish-2">Finish section</button>' :
          '<button type="button" class="btn" id="mock-next">Next →</button>') +
      "</nav>" +
      '<details class="card qgrid-box"' + (total <= 30 ? " open" : "") + "><summary>All questions in this section</summary>" +
        '<div class="qgrid">' + gridHtml + "</div></details>" +
      '<div class="card">' +
        '<button type="button" class="btn btn-block btn-secondary" id="mock-finish">Finish section</button>' +
        '<div id="mock-finish-box" class="notice" hidden>' +
          "<p><strong>Finish this section?</strong> " +
            (unanswered ? "You have <strong>" + unanswered + " unanswered</strong> question" + (unanswered === 1 ? "" : "s") + ". " : "All questions are answered. ") +
            "You cannot come back to this section.</p>" +
          '<div class="button-row">' +
            '<button type="button" class="btn btn-secondary" id="mock-finish-cancel">Go back</button>' +
            '<button type="button" class="btn" id="mock-finish-yes">Yes, finish section</button>' +
          "</div></div>" +
      "</div>" +
      '<button type="button" class="btn btn-secondary" id="mock-quit">Quit exam</button>' +
      quitConfirmHtml();

    // Choose / change an answer (no feedback is given).
    var options = App.mainEl().querySelectorAll("button[data-option]");
    for (var i = 0; i < options.length; i++) {
      options[i].addEventListener("click", function (event) {
        var optionId = event.currentTarget.getAttribute("data-option");
        exam.answers[item.questionId] = optionId;
        saveActive();
        renderRunning();
        tick();
        var again = App.mainEl().querySelector('button[data-option="' + optionId + '"]');
        if (again) again.focus();
      });
    }

    function goTo(index) {
      exam.questionIndex = Math.max(0, Math.min(total - 1, index));
      saveActive();
      renderRunning();
      tick();
      focusQuestion();
    }
    document.getElementById("mock-prev").addEventListener("click", function () { goTo(exam.questionIndex - 1); });
    var next = document.getElementById("mock-next");
    if (next) next.addEventListener("click", function () { goTo(exam.questionIndex + 1); });

    var jumps = App.mainEl().querySelectorAll("button[data-jump]");
    for (var j = 0; j < jumps.length; j++) {
      jumps[j].addEventListener("click", function (event) {
        goTo(Number(event.currentTarget.getAttribute("data-jump")));
      });
    }

    // Finish section (with an inline "are you sure?" box).
    var finishBox = document.getElementById("mock-finish-box");
    function askFinish() {
      finishBox.hidden = false;
      document.getElementById("mock-finish-cancel").focus();
    }
    document.getElementById("mock-finish").addEventListener("click", askFinish);
    var finish2 = document.getElementById("mock-finish-2");
    if (finish2) finish2.addEventListener("click", askFinish);
    document.getElementById("mock-finish-cancel").addEventListener("click", function () {
      finishBox.hidden = true;
      document.getElementById("mock-finish").focus();
    });
    document.getElementById("mock-finish-yes").addEventListener("click", function () { endSection("submitted"); });

    wireQuit();
  }

  function focusQuestion() {
    var el = document.getElementById("mock-question");
    if (el) el.focus();
  }

  /* ---------- Timer ---------- */

  function startTimer() {
    stopTimer();
    lastAnnouncedMinute = null;
    tick();
    timerId = setInterval(tick, 500);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  /** Update the clock from the deadline; end the section when time is up. */
  function tick() {
    var exam = active();
    if (!exam || exam.phase !== "running") { stopTimer(); return; }
    var section = exam.sections[exam.sectionIndex];
    var left = deadlineOf(section) - Date.now();

    var clock = document.getElementById("mock-timer");
    if (clock) {
      clock.textContent = App.utils.formatClock(left);
      clock.parentNode.classList.toggle("timer-low", left <= 60000);
    }
    // Screen-reader warnings at 5 minutes and 1 minute left.
    var minutesLeft = Math.ceil(left / 60000);
    var announce = document.getElementById("mock-announce");
    if (announce && (minutesLeft === 5 || minutesLeft === 1) && lastAnnouncedMinute !== minutesLeft) {
      lastAnnouncedMinute = minutesLeft;
      announce.textContent = minutesLeft + (minutesLeft === 1 ? " minute" : " minutes") + " left in this section.";
    }

    if (left <= 0) endSection("time");
  }

  // When a hidden tab becomes visible again, update immediately.
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && timerId) tick();
  });

  /** End the current section, then show the next one or the results. */
  function endSection(reason) {
    stopTimer();
    var exam = active();
    if (!exam) return;
    var section = exam.sections[exam.sectionIndex];
    section.endedAt = Math.min(Date.now(), deadlineOf(section));
    section.endedBy = reason; // "time" or "submitted"

    if (exam.sectionIndex < exam.sections.length - 1) {
      exam.sectionIndex++;
      exam.questionIndex = 0;
      exam.phase = "section-intro";
      exam.lastEndedBy = reason;
      saveActive();
      renderSectionIntro();
      var heading = App.mainEl().querySelector("h1");
      if (heading) { heading.setAttribute("tabindex", "-1"); heading.focus(); }
    } else {
      finishExam();
    }
  }

  /* ======================================================================
     Finishing and results
     ====================================================================== */

  function finishExam() {
    var exam = active();
    var finishedAt = Date.now();
    var items = [];
    var bySubject = {};

    exam.sections.forEach(function (section) {
      section.items.forEach(function (it) {
        var q = questionById(it.questionId);
        var chosen = exam.answers[it.questionId];
        var subjectId = q ? q.subjectId : "unknown";
        var correct = !!q && chosen === q.correctOptionId;
        items.push({ questionId: it.questionId, subjectId: subjectId, chosen: chosen === undefined ? null : chosen,
          optionOrder: it.optionOrder, correct: correct });

        var s = bySubject[subjectId] || (bySubject[subjectId] = { correct: 0, total: 0, unanswered: 0 });
        s.total++;
        if (correct) s.correct++;
        if (chosen === undefined) s.unanswered++;
      });
    });

    var correctCount = items.filter(function (i) { return i.correct; }).length;
    var entry = {
      id: "mock-" + finishedAt,
      examId: cfg().id,
      modeId: exam.modeId,
      modeName: exam.modeName,
      blueprintStatus: exam.blueprintStatus,
      total: items.length,
      correct: correctCount,
      percent: App.utils.percent(correctCount, items.length),
      unanswered: items.filter(function (i) { return i.chosen === null; }).length,
      bySubject: bySubject,
      sections: exam.sections.map(function (s) {
        return {
          title: s.title,
          questionCount: s.items.length,
          requested: s.requested,
          timeSeconds: s.timeSeconds,
          usedSeconds: Math.round((s.endedAt - s.startedAt) / 1000),
          endedBy: s.endedBy
        };
      }),
      items: items,
      startedAt: exam.createdAt,
      finishedAt: finishedAt
    };

    App.storage.update(function (data) {
      data.mockHistory.push(entry);
      data.activeMock = null;
    });
    // Answered mock questions also count toward per-question progress.
    items.forEach(function (i) {
      if (i.chosen !== null) App.progress.recordAnswer(i.questionId, i.correct);
    });

    leaveExamScreen();
    App.router.go("mock/result/" + entry.id);
  }

  /** "C. 720°" for an option, using the letter the student saw. */
  function optionText(q, optionOrder, optionId) {
    var index = optionOrder.indexOf(optionId);
    var option = App.utils.findById(q.options, optionId);
    if (!option) return "—";
    return (index >= 0 ? LABELS[index] + ". " : "") + option.text;
  }

  function renderResult(entry) {
    var subjectRows = App.data.subjects.filter(function (s) { return entry.bySubject[s.id]; }).map(function (s) {
      var r = entry.bySubject[s.id];
      var pct = App.utils.percent(r.correct, r.total);
      return "<tr><td>" + esc(s.name) + "</td><td>" + r.correct + " / " + r.total +
        (r.unanswered ? '<br><span class="small muted">' + r.unanswered + " unanswered</span>" : "") +
        '</td><td class="bar-cell">' + App.utils.progressBar(pct, s.name + " score") + "</td></tr>";
    }).join("");

    var sectionRows = entry.sections.map(function (s) {
      return "<tr><td>" + esc(s.title) + "</td><td>" + s.questionCount + "</td><td>" +
        App.utils.formatDuration(s.usedSeconds) + " of " + App.utils.formatDuration(s.timeSeconds) + "</td><td>" +
        (s.endedBy === "time" ? "⏰ Time ran out" : "✓ Finished early") + "</td></tr>";
    }).join("");

    var mistakes = entry.items.filter(function (i) { return !i.correct; });
    var mistakesHtml = mistakes.length ? mistakes.map(function (i, n) {
      var q = questionById(i.questionId);
      if (!q) {
        return '<div class="card review-item"><p class="muted">This question (' + esc(i.questionId) +
          ") was removed from questions.json.</p></div>";
      }
      return '<div class="card review-item">' +
        '<p class="question-meta small muted">' + (n + 1) + " · " + esc(subjectName(q.subjectId)) + " · " +
          esc(App.utils.difficultyLabel(q.difficulty)) + "</p>" +
        '<p class="question-text">' + esc(q.question) + "</p>" +
        '<p class="small">✗ Your answer: ' + (i.chosen ? esc(optionText(q, i.optionOrder, i.chosen)) : "<em>Not answered</em>") + "</p>" +
        '<p class="small">✓ Correct answer: <strong>' + esc(optionText(q, i.optionOrder, q.correctOptionId)) + "</strong></p>" +
        '<p class="small explanation"><strong>Why:</strong> ' + esc(q.explanation) + "</p>" +
      "</div>";
    }).join("") : '<div class="card"><p>No mistakes. Every question was answered correctly!</p></div>';

    var blueprintNote = entry.blueprintStatus === "official" ? "" :
      '<div class="notice" role="note"><strong>' +
        (entry.blueprintStatus === "practice" ? "Practice mode." : "⚠ Provisional / unverified blueprint.") +
      "</strong> This mock used " + (entry.blueprintStatus === "practice" ?
        "your own practice settings" : "community-reported item counts and times that are not confirmed by UST") +
      ". The real USTET may be different.</div>";

    App.mainEl().innerHTML =
      '<nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><a href="#/mock">Mock Exam</a></li>' +
        '<li><span aria-current="page">Results</span></li></ol></nav>' +
      "<h1>Mock exam results</h1>" +
      '<div class="card score-card">' +
        '<p class="score-big">' + entry.correct + " / " + entry.total + "</p>" +
        "<p><strong>" + entry.percent + "%</strong> · " + esc(entry.modeName) + " · " +
          esc(App.utils.formatDate(entry.finishedAt)) + "</p>" +
        (entry.unanswered ? '<p class="small">' + entry.unanswered + " unanswered (counted as wrong)</p>" : "") +
        '<p class="small muted"><strong>Practice score only.</strong> This is not a UST admission rating, and the app does not estimate admission results.</p>' +
      "</div>" +
      blueprintNote +
      '<h2 class="section-title">Score by subject</h2>' +
      '<div class="card table-wrap"><table class="data-table">' +
        "<thead><tr><th>Subject</th><th>Score</th><th>Percent</th></tr></thead><tbody>" + subjectRows + "</tbody>" +
      "</table></div>" +
      '<h2 class="section-title">Time per section</h2>' +
      '<div class="card table-wrap"><table class="data-table">' +
        "<thead><tr><th>Section</th><th>Questions</th><th>Time used</th><th>Ended</th></tr></thead><tbody>" + sectionRows + "</tbody>" +
      "</table></div>" +
      '<h2 class="section-title">Review mistakes (' + mistakes.length + ")</h2>" +
      mistakesHtml +
      '<div class="button-row">' +
        '<a class="btn" href="#/mock">Take another mock exam</a>' +
        '<a class="btn btn-secondary" href="#/home">Home</a>' +
      "</div>";
  }

  /* ======================================================================
     Route entry point
     ====================================================================== */

  function render(params) {
    if (params[0] === "result") {
      var entry = App.utils.findById(App.storage.get().mockHistory, params[1]);
      if (!entry) {
        App.mainEl().innerHTML = "<h1>Result not found</h1>" +
          '<div class="card"><p>That mock exam result is not saved on this device.</p>' +
          '<a class="btn btn-secondary" href="#/mock">Back to Mock Exam</a></div>';
        return;
      }
      return renderResult(entry);
    }

    // An exam in progress? Resume it.
    var exam = active();
    if (exam) {
      // Drop an exam whose questions were removed from questions.json since it started.
      var broken = exam.sections.some(function (s) {
        return s.items.some(function (it) { return !questionById(it.questionId); });
      });
      if (broken) {
        App.storage.update(function (data) { data.activeMock = null; });
      } else if (exam.phase === "running") {
        if (deadlineOf(exam.sections[exam.sectionIndex]) <= Date.now()) {
          endSection("time");   // time ran out while away
        } else {
          renderRunning();
          startTimer();
        }
        return;
      } else {
        renderSectionIntro();
        return;
      }
    }
    renderSetup();
  }

  return {
    render: render,
    // Exposed for testing and for the README examples.
    pressureFor: pressureFor
  };
})();
