/* ==========================================================================
   flashcards.js — flip cards with Known / Review Again tracking.

   Addresses:
     #/flashcards                                choose a subject
     #/flashcards/<subjectId>                    choose a topic (or all topics)
     #/flashcards/<subjectId>/<topicId|all>          study every card in the deck
     #/flashcards/<subjectId>/<topicId|all>/review   study only cards NOT marked Known

   Saved data (see storage.js):
     flashcards[cardId] = { status: "known" | "review", updatedAt }
   ========================================================================== */

window.App = window.App || {};

App.flashcards = (function () {
  var esc = App.utils.escapeHtml;

  // The deck currently being studied (kept in memory only).
  var deck = null;

  /* ---------- Helpers ---------- */

  function cardStatus(cardId) {
    var saved = App.storage.get().flashcards[cardId];
    return saved ? saved.status : null;
  }

  /** Cards for a subject, optionally one topic ("all" = every topic). */
  function cardsFor(subjectId, topicId) {
    return App.data.flashcards.filter(function (card) {
      return card.subjectId === subjectId && (topicId === "all" || !topicId || card.topicId === topicId);
    });
  }

  function countKnown(cards) {
    return cards.filter(function (c) { return cardStatus(c.id) === "known"; }).length;
  }

  function deckHref(subjectId, topicId, reviewOnly) {
    return "#/flashcards/" + encodeURIComponent(subjectId) + "/" + encodeURIComponent(topicId) +
      (reviewOnly ? "/review" : "");
  }

  function breadcrumb(crumbs) {
    return '<nav class="breadcrumb" aria-label="Breadcrumb"><ol>' +
      crumbs.map(function (c) {
        return "<li>" + (c[1] ? '<a href="' + c[1] + '">' + esc(c[0]) + "</a>" :
          '<span aria-current="page">' + esc(c[0]) + "</span>") + "</li>";
      }).join("") + "</ol></nav>";
  }

  function notFound(message) {
    App.mainEl().innerHTML = breadcrumb([["Flashcards", "#/flashcards"]]) +
      App.pageTitle("Deck not found", { href: "#/flashcards", label: "Flashcards" }) +
      '<div class="card"><p>' + esc(message) + "</p>" +
      '<a class="btn btn-secondary" href="#/flashcards">Back to Flashcards</a></div>';
  }

  /** One row: deck name, "x of y known", progress bar, and study buttons. */
  function deckRow(title, subjectId, topicId, cards) {
    var known = countKnown(cards);
    var toReview = cards.length - known;
    if (!cards.length) {
      return '<li class="deck-row"><strong>' + esc(title) + '</strong>' +
        '<p class="muted small">No flashcards yet. Add some in <code>data/flashcards.json</code>.</p></li>';
    }
    return '<li class="deck-row">' +
      "<strong>" + esc(title) + "</strong>" +
      '<p class="small">' + known + " of " + cards.length + " known</p>" +
      App.utils.progressBar(App.utils.percent(known, cards.length), title + " cards known") +
      '<div class="button-row">' +
        '<a class="btn" href="' + deckHref(subjectId, topicId, false) + '">Study all (' + cards.length + ")</a>" +
        (toReview && known ?
          '<a class="btn btn-secondary" href="' + deckHref(subjectId, topicId, true) + '">Not yet known (' + toReview + ")</a>" : "") +
      "</div></li>";
  }

  /* ---------- Choose screens ---------- */

  function renderSubjects() {
    var cards = App.data.subjects.map(function (subject) {
      var deckCards = cardsFor(subject.id, "all");
      var known = countKnown(deckCards);
      return '<a class="card subject-card" href="#/flashcards/' + encodeURIComponent(subject.id) + '">' +
        "<h2>" + esc(subject.name) + "</h2>" +
        '<p class="small">' + known + " of " + deckCards.length + " cards known</p>" +
        App.utils.progressBar(App.utils.percent(known, deckCards.length), subject.name + " cards known") +
        "</a>";
    }).join("");

    App.mainEl().innerHTML =
      "<h1>Flashcards</h1>" +
      '<p class="muted">Tap a card to flip it, then mark it Known or Review Again. Your ratings are saved on this device.</p>' +
      '<div class="grid grid-2">' + cards + "</div>";
  }

  function renderSubject(subject) {
    var rows = deckRow("All " + subject.name + " cards", subject.id, "all", cardsFor(subject.id, "all")) +
      subject.topics.map(function (topic) {
        return deckRow(topic.name, subject.id, topic.id, cardsFor(subject.id, topic.id));
      }).join("");

    App.mainEl().innerHTML =
      breadcrumb([["Flashcards", "#/flashcards"], [subject.name, null]]) +
      App.pageTitle(subject.name + " flashcards", { href: "#/flashcards", label: "Flashcards" }) +
      '<div class="card"><ul class="list-plain deck-list">' + rows + "</ul></div>";
  }

  /* ---------- Study session ---------- */

  /** Create a new deck session. Cards keep file order until "Shuffle" is pressed. */
  function startDeck(subject, topic, reviewOnly) {
    var cards = cardsFor(subject.id, topic ? topic.id : "all");
    if (reviewOnly) {
      cards = cards.filter(function (c) { return cardStatus(c.id) !== "known"; });
    }
    deck = {
      subject: subject,
      topic: topic,          // null means "all topics"
      reviewOnly: reviewOnly,
      cards: cards,
      index: 0,
      flipped: false,
      ratedThisSession: {}   // cardId -> "known" | "review"
    };
  }

  /** Heading for deck screens; Back returns to this subject's list of decks. */
  function deckHeading(title) {
    return App.pageTitle(title, {
      href: "#/flashcards/" + encodeURIComponent(deck.subject.id),
      label: deck.subject.name + " decks"
    });
  }

  function deckTitle() {
    return (deck.topic ? deck.topic.name : "All " + deck.subject.name + " cards") +
      (deck.reviewOnly ? " (not yet known)" : "");
  }

  function renderStudy() {
    var crumbs = breadcrumb([["Flashcards", "#/flashcards"],
      [deck.subject.name, "#/flashcards/" + encodeURIComponent(deck.subject.id)],
      [deck.topic ? deck.topic.name : "All topics", null]]);

    if (!deck.cards.length) {
      App.mainEl().innerHTML = crumbs + deckHeading(deckTitle()) +
        '<div class="card"><p>' + (deck.reviewOnly ?
          "Every card in this deck is marked Known. Nice work!" :
          "This deck has no cards yet. Add some in <code>data/flashcards.json</code>.") + "</p>" +
        '<a class="btn btn-secondary" href="#/flashcards/' + encodeURIComponent(deck.subject.id) + '">Back to decks</a></div>';
      return;
    }

    if (deck.index >= deck.cards.length) return renderDeckEnd(crumbs);

    var card = deck.cards[deck.index];
    var status = cardStatus(card.id);
    var statusText = status === "known" ? "✓ Known" : status === "review" ? "↻ Review again" : "Not rated yet";
    var total = deck.cards.length;

    App.mainEl().innerHTML =
      crumbs +
      deckHeading(deckTitle()) +
      '<div class="study-toolbar">' +
        '<p class="small" aria-live="polite">Card <strong>' + (deck.index + 1) + "</strong> of " + total + "</p>" +
        '<button type="button" class="btn btn-secondary btn-small" id="fc-shuffle">Shuffle</button>' +
      "</div>" +
      App.utils.progressBar(App.utils.percent(deck.index, total), "Deck progress") +

      // The card itself is a real <button>, so Enter/Space flip it with a keyboard.
      '<button type="button" class="flashcard' + (deck.flipped ? " is-flipped" : "") + '" id="fc-card" ' +
        'aria-label="Flashcard. ' + (deck.flipped ? "Showing answer" : "Showing question") + '. Press to flip.">' +
        '<span class="flashcard-side">' + (deck.flipped ? "Answer" : "Question") + "</span>" +
        '<span class="flashcard-text">' + esc(deck.flipped ? card.back : card.front) + "</span>" +
        '<span class="flashcard-hint">' + (deck.flipped ? "Tap to see the question" : "Tap to see the answer") + "</span>" +
      "</button>" +

      '<p class="small muted center">Your rating: <strong>' + statusText + "</strong></p>" +

      '<div class="grade-row">' +
        '<button type="button" class="btn btn-review" id="fc-review">↻ Review Again</button>' +
        '<button type="button" class="btn btn-known" id="fc-known">✓ Known</button>' +
      "</div>" +

      '<nav class="pager" aria-label="Card navigation">' +
        '<button type="button" class="btn btn-secondary" id="fc-prev"' + (deck.index === 0 ? " disabled" : "") + ">← Previous</button>" +
        '<button type="button" class="btn btn-secondary" id="fc-next">Skip →</button>' +
      "</nav>";

    document.getElementById("fc-card").addEventListener("click", function () {
      deck.flipped = !deck.flipped;
      renderStudy();
      document.getElementById("fc-card").focus();
    });
    document.getElementById("fc-known").addEventListener("click", function () { rate(card, "known"); });
    document.getElementById("fc-review").addEventListener("click", function () { rate(card, "review"); });
    document.getElementById("fc-prev").addEventListener("click", function () { move(-1); });
    document.getElementById("fc-next").addEventListener("click", function () { move(1); });
    document.getElementById("fc-shuffle").addEventListener("click", function () {
      deck.cards = App.utils.shuffle(deck.cards);
      deck.index = 0;
      deck.flipped = false;
      renderStudy();
      document.getElementById("fc-card").focus();
    });
  }

  /** Save a rating and go to the next card. */
  function rate(card, status) {
    App.storage.update(function (data) {
      data.flashcards[card.id] = { status: status, updatedAt: Date.now() };
    });
    deck.ratedThisSession[card.id] = status;
    move(1);
  }

  function move(step) {
    deck.index = Math.max(0, deck.index + step);
    deck.flipped = false;
    renderStudy();
    var focusTarget = document.getElementById("fc-card") || document.getElementById("fc-again");
    if (focusTarget) focusTarget.focus();
  }

  /** Summary after the last card. */
  function renderDeckEnd(crumbs) {
    var ratings = deck.ratedThisSession;
    var known = 0, review = 0;
    Object.keys(ratings).forEach(function (id) {
      if (ratings[id] === "known") known++; else review++;
    });
    var skipped = deck.cards.length - known - review;
    var allCards = cardsFor(deck.subject.id, deck.topic ? deck.topic.id : "all");
    var notKnownNow = allCards.length - countKnown(allCards);
    var topicKey = deck.topic ? deck.topic.id : "all";

    App.mainEl().innerHTML =
      crumbs +
      deckHeading("Deck finished") +
      '<div class="card">' +
        '<ul class="list-plain">' +
          "<li>✓ Known: <strong>" + known + "</strong></li>" +
          "<li>↻ Review again: <strong>" + review + "</strong></li>" +
          (skipped ? "<li>Skipped: <strong>" + skipped + "</strong></li>" : "") +
        "</ul>" +
      "</div>" +
      '<div class="button-row">' +
        '<button type="button" class="btn" id="fc-again">Study this deck again (shuffled)</button>' +
        (notKnownNow ? '<a class="btn btn-secondary" href="' + deckHref(deck.subject.id, topicKey, true) +
          '">Study cards not yet known (' + notKnownNow + ")</a>" : "") +
        '<a class="btn btn-secondary" href="#/flashcards/' + encodeURIComponent(deck.subject.id) + '">Back to decks</a>' +
      "</div>";

    document.getElementById("fc-again").addEventListener("click", function () {
      startDeck(deck.subject, deck.topic, deck.reviewOnly);
      deck.cards = App.utils.shuffle(deck.cards);
      renderStudy();
    });
  }

  /* ---------- Route entry point ---------- */

  function render(params) {
    var subjectId = params[0];
    var topicId = params[1];
    var reviewOnly = params[2] === "review";

    if (!subjectId) return renderSubjects();
    var subject = App.getSubject(subjectId);
    if (!subject) return notFound('There is no subject with id "' + subjectId + '".');
    if (!topicId) return renderSubject(subject);

    var topic = null;
    if (topicId !== "all") {
      topic = App.getTopic(subject, topicId);
      if (!topic) return notFound('"' + subject.name + '" has no topic with id "' + topicId + '".');
    }
    startDeck(subject, topic, reviewOnly);
    renderStudy();
  }

  return { render: render };
})();
