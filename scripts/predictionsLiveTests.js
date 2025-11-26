// /scripts/predictionsLiveTests.js
(function () {
  const MAX_SCORE = 20;
  const MIN_SCORE = 0;

  // ---------- logging only, NO UI / NO PANEL ----------
  function renderRun(results, label) {
    const ts = new Date().toISOString();
    // Only log to console so normal users see nothing
    console.log(`[LiveTests ${ts}] ${label}`, results);
  }

  // ---------- helpers ----------
  function readVal(input) {
    const v = (input?.value || "").trim();
    if (v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function asNum(v) {
    return v == null ? 0 : v;
  }

  function clamp(n) {
    n = Math.trunc(n);
    if (n < MIN_SCORE) n = MIN_SCORE;
    if (n > MAX_SCORE) n = MAX_SCORE;
    return n;
  }

  function collectCards() {
    return Array.from(document.querySelectorAll(".match-card"))
      .map((card) => ({
        card,
        home: {
          minus: card.querySelector(".home-minus"),
          plus: card.querySelector(".home-plus"),
          input: card.querySelector(".home-val"),
        },
        away: {
          minus: card.querySelector(".away-minus"),
          plus: card.querySelector(".away-plus"),
          input: card.querySelector(".away-val"),
        },
      }))
      .filter(
        (c) =>
          c.home.minus &&
          c.home.plus &&
          c.home.input &&
          c.away.minus &&
          c.away.plus &&
          c.away.input
      );
  }

  // snapshot BEFORE click logic runs
  const preSnap = new WeakMap();

  function takeSnapshot(btn) {
    const cards = collectCards();
    const card = btn.closest(".match-card");
    const snap = {
      clickedCard: card,
      all: cards.map((c) => ({
        card: c.card,
        h: readVal(c.home.input),
        a: readVal(c.away.input),
      })),
    };
    preSnap.set(btn, snap);
  }

  function findInSnap(snap, cardEl) {
    return snap.all.find((x) => x.card === cardEl);
  }

  // ---------- live tests per click ----------
  function runTestsAfterClick(btn) {
    const snap = preSnap.get(btn);
    if (!snap) return;

    const cards = collectCards();
    const clickedCard = btn.closest(".match-card");
    const clicked = cards.find((c) => c.card === clickedCard);
    if (!clicked) return;

    const beforeClicked = findInSnap(snap, clickedCard) || {
      h: null,
      a: null,
    };

    const hBefore = beforeClicked.h;
    const aBefore = beforeClicked.a;

    const hAfter = readVal(clicked.home.input);
    const aAfter = readVal(clicked.away.input);

    const isHomeBtn =
      btn.classList.contains("home-plus") ||
      btn.classList.contains("home-minus");
    const isAwayBtn =
      btn.classList.contains("away-plus") ||
      btn.classList.contains("away-minus");
    const isPlus = btn.classList.contains("plus");
    const isMinus = btn.classList.contains("minus");

    const results = [];

    // 1) values must be integer or blank (blank only allowed BEFORE any click, after click we expect integer)
    const hIntOk = hAfter == null || Number.isInteger(hAfter);
    const aIntOk = aAfter == null || Number.isInteger(aAfter);

    results.push({
      ok: hIntOk,
      msg: `Home is integer/blank (after=${hAfter})`,
    });
    results.push({
      ok: aIntOk,
      msg: `Away is integer/blank (after=${aAfter})`,
    });

    // 2) clamp range
    results.push({
      ok: asNum(hAfter) >= MIN_SCORE && asNum(hAfter) <= MAX_SCORE,
      msg: `Home within ${MIN_SCORE}-${MAX_SCORE} (after=${hAfter})`,
    });
    results.push({
      ok: asNum(aAfter) >= MIN_SCORE && asNum(aAfter) <= MAX_SCORE,
      msg: `Away within ${MIN_SCORE}-${MAX_SCORE} (after=${aAfter})`,
    });

    // 3) delta correctness for clicked side
    if (isHomeBtn) {
      const hb = asNum(hBefore);
      const ha = asNum(hAfter);
      const expected = isPlus ? clamp(hb + 1) : clamp(hb - 1);
      results.push({
        ok: ha === expected,
        msg: `Home ${isPlus ? "+" : "-"} changes by 1 (before=${hBefore}, after=${hAfter}, expected=${expected})`,
      });

      // away must not change when home clicked
      results.push({
        ok: aAfter === aBefore,
        msg: `Away unchanged when Home clicked (before=${aBefore}, after=${aAfter})`,
      });
    }

    if (isAwayBtn) {
      const ab = asNum(aBefore);
      const aa = asNum(aAfter);
      const expected = isPlus ? clamp(ab + 1) : clamp(ab - 1);
      results.push({
        ok: aa === expected,
        msg: `Away ${isPlus ? "+" : "-"} changes by 1 (before=${aBefore}, after=${aAfter}, expected=${expected})`,
      });

      // home must not change when away clicked
      results.push({
        ok: hAfter === hBefore,
        msg: `Home unchanged when Away clicked (before=${hBefore}, after=${hAfter})`,
      });
    }

    // 4) other cards must not change
    const othersOk = snap.all.every((s) => {
      if (s.card === clickedCard) return true;
      const curCard = cards.find((c) => c.card === s.card);
      if (!curCard) return true;
      const hCur = readVal(curCard.home.input);
      const aCur = readVal(curCard.away.input);
      return hCur === s.h && aCur === s.a;
    });

    results.push({
      ok: othersOk,
      msg: `Other match cards unchanged by this click`,
    });

    const label =
      (isHomeBtn ? "Home" : "Away") +
      (isPlus ? " +" : " -") +
      ` on fixture ${clickedCard?.dataset?.fixture || "?"}`;

    renderRun(results, label);
  }

  // ---------- hook into the real UI without interfering ----------
  // capture phase => snapshot BEFORE your button logic modifies input
  document.addEventListener(
    "click",
    (e) => {
      const btn = e.target.closest("button.plus, button.minus");
      if (!btn) return;
      const card = btn.closest(".match-card");
      if (!card) return;
      takeSnapshot(btn);
    },
    true
  );

  // bubble phase => read AFTER your logic runs
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button.plus, button.minus");
    if (!btn) return;
    const card = btn.closest(".match-card");
    if (!card) return;
    runTestsAfterClick(btn);
  });

  // also validate manual input attempts (even though readonly)
  document.addEventListener("input", (e) => {
    const inp = e.target;
    if (!(inp instanceof HTMLInputElement)) return;
    if (
      !inp.classList.contains("home-val") &&
      !inp.classList.contains("away-val")
    )
      return;

    const v = readVal(inp);
    const ok =
      v == null || (Number.isInteger(v) && v >= MIN_SCORE && v <= MAX_SCORE);

    renderRun(
      [
        {
          ok,
          msg: `Manual edit valid integer ${MIN_SCORE}-${MAX_SCORE} (after=${v})`,
        },
      ],
      `Manual input on fixture ${
        inp.closest(".match-card")?.dataset?.fixture || "?"
      }`
    );
  });

  console.log("[LiveTests] Predictions live tests armed ✅ (no UI, console only)");
})();
