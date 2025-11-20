// /scripts/predictionsPage.js
(function () {
  // --- SAFETY: ensure FBL + LEAGUE_MAP exist ---
  window.FBL = window.FBL || {};
  window.FBL.LEAGUE_MAP = window.FBL.LEAGUE_MAP || {
    PREMIER_LEAGUE: { name: "Premier League", totalRounds: 38 },
    BUNDESLIGA:     { name: "Bundesliga",     totalRounds: 34 },
    LALIGA:         { name: "La Liga",        totalRounds: 38 },
    LIGUE1:         { name: "Ligue 1",        totalRounds: 34 },
  };


  // /scripts/predictionsStore.js
(function () {
  // compat-safe handles
  const auth = (window.FBL_FIREBASE && window.FBL_FIREBASE.auth) || (window.firebase && firebase.auth());
  const db   = (window.FBL_FIREBASE && window.FBL_FIREBASE.db)   || (window.firebase && firebase.firestore());

  function getUidNow() {
    try {
      return auth.currentUser ? auth.currentUser.uid : null;
    } catch (_) {
      return null;
    }
  }

  function waitForUid() {
    const uid = getUidNow();
    if (uid) return Promise.resolve(uid);

    return new Promise((resolve, reject) => {
      const unsub = auth.onAuthStateChanged(
        (user) => {
          unsub();
          resolve(user ? user.uid : null);
        },
        (err) => {
          unsub();
          reject(err);
        }
      );
    });
  }

 // ✅ SAVE (keeps your structure, just ensures uid is present and stable doc ids)
async function savePredictionsForRound(leagueKey, roundNum, pending) {
  const uid = await waitForUid();
  if (!uid) throw new Error("Not logged in");

  console.log("[STORE] saving", pending.length, "for", leagueKey, "round", roundNum);

  const batch = db.batch();

  pending.forEach((p) => {
    const fixtureId = String(p.fixtureId);
    const docId = `${uid}_${leagueKey}_${fixtureId}`; // stable per user+league+fixture
    const ref = db.collection("predictions").doc(docId);

    batch.set(
      ref,
      {
        ...p,
        uid,
        league: leagueKey,
        matchday: String(roundNum),
        fixtureId,
        timestamp: p.timestamp || new Date().toISOString(),
      },
      { merge: true }
    );
  });

  await batch.commit();
  console.log("[STORE] saved OK");
  return true;
}

  // ✅ READ (THIS is what fixes your permissions error)
  async function loadPredictionsForLeague(leagueKey) {
    const uid = await waitForUid();
    if (!uid) return [];

    const snap = await db
      .collection("predictions")
      .where("uid", "==", uid)          // <-- REQUIRED for rules
      .where("league", "==", leagueKey)
      .get();

    const out = [];
    snap.forEach((doc) => out.push(doc.data()));

    // keep them in saved-time order
    out.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return out;
  }

  window.FBL_STORE = window.FBL_STORE || {};
  window.FBL_STORE.savePredictionsForRound = savePredictionsForRound;
  window.FBL_STORE.loadPredictionsForLeague = loadPredictionsForLeague;
})();

  // ---- 1) Pull league context first (so leagueKey exists) ----
  const selected  = window.FBL.loadSelectedRound(); // { leagueKey, roundNum, fixtures }
  const leagueKey = sessionStorage.getItem("FBL_leagueKey");

  if (!selected || !leagueKey) {
    console.error("No selected round / league in sessionStorage");
    if (leagueKey && window.FBL.LEAGUE_MAP[leagueKey]) {
      window.location.href = "./index.html";
    } else {
      window.location.href = "../premier/index.html";
    }
    return;
  }

  const leagueInfo  = window.FBL.LEAGUE_MAP[leagueKey];
  const roundNum    = selected.roundNum || 1;
  const totalRounds = leagueInfo.totalRounds || "?";
  const allFixtures = selected.fixtures || [];

  // ---- 2) Single vs all mode (clickable cards) ----
  const mode         = sessionStorage.getItem("FBL_mode") || "all";
  const selFixtureId = sessionStorage.getItem("FBL_selectedFixture");
  const pageFixtures =
    mode === "single" && selFixtureId
      ? allFixtures.filter((f) => String(f.id) === String(selFixtureId))
      : allFixtures.slice();

  // ---- 3) DOM refs (unchanged) ----
  const subtitleEl     = document.querySelector(".subtitle");
  const dayNumWrapEl   = document.getElementById("day-number2");
  const prevDayBtn     = document.getElementById("prev-day");
  const nextDayBtn     = document.getElementById("next-day");
  const listEl         = document.getElementById("predictions-list");
  const topDoneLink    = document.getElementById("done");
  const bottomDoneBtn  = document.getElementById("done-button");
  const overlayEl      = document.getElementById("gprompt-overlay");
  const closeBtn       = document.getElementById("gprompt-close");
  const cancelBtn      = document.getElementById("gprompt-cancel");
  const confirmBtn     = document.getElementById("gprompt-confirm");
  const confirmListEl  = document.getElementById("confirmList");
  const badgeEl        = document.querySelector(".gprompt__badge");
  const matchdayTextEl = document.getElementById("gprompt-matchday");

  // ---- 4) Blank-by-default predictions (no “0-0” showing) ----
  // { [fixtureId]: { homeScore:null|number, awayScore:null|number, homeTeam, awayTeam } }
  const userPred = {};
  const clamp    = (v) => (v < 0 ? 0 : v > 20 ? 20 : v);
  const display  = (el, val) => {
    el.value = val === null ? "" : String(val);
  };
  const isSet = (p) => p && p.homeScore !== null && p.awayScore !== null;

  function renderFixtures() {
    if (subtitleEl) {
      subtitleEl.innerHTML = `<span class="bold">${leagueInfo.name} Matches</span> - Matchday ${roundNum} of ${totalRounds}`;
    }
    if (dayNumWrapEl) dayNumWrapEl.textContent = roundNum;
    if (prevDayBtn) prevDayBtn.disabled = true;
    if (nextDayBtn) nextDayBtn.disabled = true;

    const html = pageFixtures
      .map((f) => {
        userPred[f.id] = {
          homeScore: null,
          awayScore: null,
          homeTeam: f.home,
          awayTeam: f.away,
        };
        const ko = window.FBL.formatKickoffLocal(f.utcDate);
        return `
        <div class="match-card" data-fixture="${f.id}">
          <div class="teams">
            <div class="team left">
              <img class="team-logo home-logo" />
              <p>${f.home.name}</p>
            </div>
            <div class="match-center">
              <p class="vs">VS</p>
              <p class="time">${ko}</p>
            </div>
            <div class="team right">
              <img class="team-logo away-logo" />
              <p>${f.away.name}</p>
            </div>
          </div>

          <hr class="hr">

          <p class="prediction-label">Enter your prediction score</p>

          <div class="score-inputs">
            <div class="score-box home-box">
              <button class="minus home-minus" type="button">-</button>
              <input class="home-val" type="number" min="0" readonly />
              <button class="plus home-plus" type="button">+</button>
            </div>

            <div class="score-box away-box">
              <button class="minus away-minus" type="button">-</button>
              <input class="away-val" type="number" min="0" readonly />
              <button class="plus away-plus" type="button">+</button>
            </div>
          </div>
        </div>
      `;
      })
      .join("");
    listEl.innerHTML = html;

    // logos
    pageFixtures.forEach((f) => {
      const row = listEl.querySelector(
        `.match-card[data-fixture="${f.id}"]`
      );
      if (!row) return;
      window.FBL.ensureLogo(f.home, row.querySelector(".home-logo"));
      window.FBL.ensureLogo(f.away, row.querySelector(".away-logo"));
    });

    // +/- handlers (null-aware)
    pageFixtures.forEach((f) => {
      const row = listEl.querySelector(
        `.match-card[data-fixture="${f.id}"]`
      );
      if (!row) return;

      const hMinus = row.querySelector(".home-minus");
      const hPlus  = row.querySelector(".home-plus");
      const aMinus = row.querySelector(".away-minus");
      const aPlus  = row.querySelector(".away-plus");
      const hVal   = row.querySelector(".home-val");
      const aVal   = row.querySelector(".away-val");

      display(hVal, null);
      display(aVal, null);

      hMinus.addEventListener("click", () => {
        let cur = userPred[f.id].homeScore;
        if (cur === null || Number.isNaN(cur)) cur = 0;
        cur = clamp(cur - 1);
        userPred[f.id].homeScore = cur;
        display(hVal, cur);
      });
      hPlus.addEventListener("click", () => {
        let cur = userPred[f.id].homeScore;
        if (cur === null || Number.isNaN(cur)) cur = 0;
        cur = clamp(cur + 1);
        userPred[f.id].homeScore = cur;
        display(hVal, cur);
      });
      aMinus.addEventListener("click", () => {
        let cur = userPred[f.id].awayScore;
        if (cur === null || Number.isNaN(cur)) cur = 0;
        cur = clamp(cur - 1);
        userPred[f.id].awayScore = cur;
        display(aVal, cur);
      });
      aPlus.addEventListener("click", () => {
        let cur = userPred[f.id].awayScore;
        if (cur === null || Number.isNaN(cur)) cur = 0;
        cur = clamp(cur + 1);
        userPred[f.id].awayScore = cur;
        display(aVal, cur);
      });
    });
  }

  // ---- helpers for API + redirects ----
  function getApiBase() {
    const b =
      window.FBL_API_BASE ||
      (window.FBL_CFG && window.FBL_CFG.API_BASE) ||
      "";
    return b.replace(/\/$/, "");
  }

  function leagueFolderFromKey(key) {
    if (key === "LIGUE1") return "ligue1";
    if (key === "LALIGA") return "laliga";
    if (key === "BUNDESLIGA") return "bundesliga";
    return "premier";
  }

  function redirectToSignup() {
    const folder = leagueFolderFromKey(leagueKey);
    const nextPath = `/${folder}/results.html`;
    window.location.href =
      "../signup.html?next=" + encodeURIComponent(nextPath);
  }

  // Build the exact structure PHP expects for save_prediction
  function buildServerPayloads(touchedFixtures) {
    return touchedFixtures.map((f) => {
      const p = userPred[f.id];
      return {
        league:    leagueKey,
        fixtureId: String(f.id),
        matchday:  roundNum,
        home: {
          id:   f.home.id,
          name: f.home.name,
          score: p.homeScore,
        },
        away: {
          id:   f.away.id,
          name: f.away.name,
          score: p.awayScore,
        },
        timestamp: new Date().toISOString(),
      };
    });
  }

  // helper used when user is already logged in
  function flushPendingPredictionsToServer() {
    return new Promise(async (resolve, reject) => {
      try {
        const pending = JSON.parse(
          sessionStorage.getItem("pending_predictions") || "[]"
        );
        if (!pending.length) return resolve();

        const url = getApiBase() + "/api/users.php";

        for (const p of pending) {
          const res = await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "save_prediction",
              prediction: p,
            }),
          });

          const text = await res.text();
          let j;
          try {
            j = JSON.parse(text);
          } catch {
            throw new Error(
              "Save failed (" +
                res.status +
                "): " +
                text.slice(0, 200)
            );
          }
          if (!j.success) {
            throw new Error(j.message || "Save failed");
          }
        }

        sessionStorage.removeItem("pending_predictions");
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  // Stop multiple redirects from causing loops (safe no-op; we never read this)
  sessionStorage.setItem("redirectLock", "true");
  setTimeout(() => sessionStorage.removeItem("redirectLock"), 5000);

  // ✅ ADDED: tiny helper to get current Firebase uid (compat-safe)
  function getFirebaseUid() {
    try {
      if (
        window.FBL_FIREBASE &&
        window.FBL_FIREBASE.auth &&
        window.FBL_FIREBASE.auth.currentUser
      ) {
        return window.FBL_FIREBASE.auth.currentUser.uid || null;
      }
      if (window.firebase && firebase.auth && firebase.auth().currentUser) {
        return firebase.auth().currentUser.uid || null;
      }
    } catch (_) {}
    return null;
  }

// ✅ ADDED: wait for firebase user (compat-safe)
function waitForFirebaseUser() {
  try {
    if (window.FBL_FIREBASE && window.FBL_FIREBASE.auth) {
      const u = window.FBL_FIREBASE.auth.currentUser;
      if (u) return Promise.resolve(u);

      return new Promise((resolve) => {
        const unsub = window.FBL_FIREBASE.auth.onAuthStateChanged((user) => {
          unsub();
          resolve(user || null);
        });
      });
    }

    if (window.firebase && firebase.auth) {
      const u = firebase.auth().currentUser;
      if (u) return Promise.resolve(u);

      return new Promise((resolve) => {
        const unsub = firebase.auth().onAuthStateChanged((user) => {
          unsub();
          resolve(user || null);
        });
      });
    }
  } catch (_) {}

  return Promise.resolve(null);
}


async function finalizeAndContinue() {
  const touched = pageFixtures.filter((f) => isSet(userPred[f.id]));
  if (!touched.length) {
    alert(".");
    return;
  }

  let pending = buildServerPayloads(touched);

  // still keep as safety
  sessionStorage.setItem("pending_predictions", JSON.stringify(pending));
  sessionStorage.setItem("FBL_leagueKey", leagueKey);

  closeConfirmPrompt();

  const folder = leagueFolderFromKey(leagueKey);
  const resultsPath = `../${folder}/results.html`;

  console.log("[PredictionsPage] confirm clicked. waiting for auth...");

  const user = await waitForFirebaseUser();
  if (!user) {
    console.warn("[PredictionsPage] No firebase user -> redirect signup");
    window.location.href =
      "../signup.html?next=" + encodeURIComponent(resultsPath);
    return;
  }

  // attach uid for Firestore rules
  pending = pending.map((p) => (p.uid ? p : { ...p, uid: user.uid }));

  if (
    !window.FBL_STORE ||
    typeof window.FBL_STORE.savePredictionsForRound !== "function"
  ) {
    console.error("[PredictionsPage] FBL_STORE.savePredictionsForRound missing");
    alert("Storage not ready. Please refresh.");
    return;
  }

  try {
    console.log(
      "[PredictionsPage] saving",
      pending.length,
      "predictions to Firestore..."
    );

    await window.FBL_STORE.savePredictionsForRound(
      leagueKey,
      roundNum,
      pending
    );

    console.log("[PredictionsPage] saved OK. going to results:", resultsPath);
    window.location.href = resultsPath;
  } catch (err) {
    console.error("[PredictionsPage] save failed:", err);
    alert("Unable to save predictions right now. Please try again.");
  }
}









  // ---- popup wiring (UI unchanged) ----
  function openConfirmPrompt() {
    if (badgeEl) badgeEl.textContent = leagueInfo.name + " Matches";
    if (matchdayTextEl)
      matchdayTextEl.textContent = `${roundNum} of ${totalRounds}`;

    const touched = pageFixtures.filter((f) => isSet(userPred[f.id]));
    if (!touched.length) {
      alert(".");
      return;
    }

    const rows = touched
      .map((f) => {
        const p = userPred[f.id];
        return `
        <div class="gprompt__row">
          <img class="gprompt__logo gprompt__logo--home" />
          <div class="gprompt__team">${f.home.name}</div>
          <div class="gprompt__score">${p.homeScore} - ${p.awayScore}</div>
          <img class="gprompt__logo gprompt__logo--away" />
          <div class="gprompt__team">${f.away.name}</div>
        </div>`;
      })
      .join("");
    confirmListEl.innerHTML = rows;

    touched.forEach((f, i) => {
      const r = confirmListEl.querySelectorAll(".gprompt__row")[i];
      if (!r) return;
      window.FBL.ensureLogo(
        f.home,
        r.querySelector(".gprompt__logo--home")
      );
      window.FBL.ensureLogo(
        f.away,
        r.querySelector(".gprompt__logo--away")
      );
    });

    overlayEl.classList.add("is-open");
    overlayEl.setAttribute("aria-hidden", "false");
  }

  const closeConfirmPrompt = () => {
    overlayEl.classList.remove("is-open");
    overlayEl.setAttribute("aria-hidden", "true");
  };

  const onDone = (e) => {
    e.preventDefault();
    openConfirmPrompt();
  };
  if (topDoneLink)   topDoneLink.addEventListener("click", onDone);
  if (bottomDoneBtn) bottomDoneBtn.addEventListener("click", onDone);
  if (closeBtn)      closeBtn.addEventListener("click", closeConfirmPrompt);
  if (cancelBtn)     cancelBtn.addEventListener("click", closeConfirmPrompt);
  if (confirmBtn)
    confirmBtn.addEventListener("click", (e) => {
      e.preventDefault();
      finalizeAndContinue();
    });

  // ---- render ----
  renderFixtures();
})();

/* ==== FBL Prediction Number Tests (non-invasive) ==== */
(function () {
  // Config
  const MAX_SCORE = 20; // same ceiling your UI clamp uses
  const MIN_SCORE = 0;

  // Inject tiny styles for inline feedback (once)
  (function injectStylesOnce() {
    if (document.getElementById("fbl-tests-style")) return;
    const css = `
      .fbl-input-error { outline: ; border-radius: 6px; }
      .fbl-err-msg { margin-top:6px; font-size:12px; color:#C4FFF4; }
      .match-card .fbl-err-msg { margin-left: 4px; }
    `;
    const el = document.createElement("style");
    el.id = "fbl-tests-style";
    el.textContent = css;
    document.head.appendChild(el);
  })();

  // Helpers
  function parseVal(v) {
    if (v === "" || v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  function clamp(n) {
    if (n == null) return null;
    n = Math.trunc(n);
    if (n < MIN_SCORE) n = MIN_SCORE;
    if (n > MAX_SCORE) n = MAX_SCORE;
    return n;
  }
  function setErr(input, msg) {
    clearErr(input);
    input.classList.add("fbl-input-error");
    const p = input.closest(".match-card") || input.parentElement;
    if (!p) return;
    const m = document.createElement("div");
    m.className = "fbl-err-msg";
    m.textContent = msg;
    const scoreSection = p.querySelector(".score-section") || p;
    scoreSection.appendChild(m);
  }
  function clearErr(node) {
    const card = node.closest
      ? node.closest(".match-card") || document
      : document;
    card
      .querySelectorAll(".fbl-input-error")
      .forEach((el) => el.classList.remove("fbl-input-error"));
    card
      .querySelectorAll(".fbl-err-msg")
      .forEach((el) => el.remove());
  }

  function validatePair(homeInput, awayInput, { allowEmpty = true } = {}) {
    const rawH = homeInput.value.trim();
    const rawA = awayInput.value.trim();

    const hv0 = parseVal(rawH);
    const av0 = parseVal(rawA);

    if (allowEmpty && hv0 === null && av0 === null) {
      return { ok: true, hv: null, av: null };
    }

    if ((hv0 === null) !== (av0 === null)) {
      return {
        ok: false,
        hv: hv0,
        av: av0,
        msg: "Enter both scores or leave both blank.",
      };
    }

    const hv = clamp(hv0);
    const av = clamp(av0);
    if (!Number.isInteger(hv0) || hv0 !== hv) {
      return {
        ok: false,
        hv,
        av,
        msg: `Home score must be an integer between ${MIN_SCORE} and ${MAX_SCORE}.`,
      };
    }
    if (!Number.isInteger(av0) || av0 !== av) {
      return {
        ok: false,
        hv,
        av,
        msg: `Away score must be an integer between ${MIN_SCORE} and ${MAX_SCORE}.`,
      };
    }

    return { ok: true, hv, av };
  }

  function attachInputSanitizers(root) {
    root.addEventListener(
      "input",
      (e) => {
        const inp = e.target;
        if (!(inp instanceof HTMLInputElement)) return;
        if (
          !inp.classList.contains("home-val") &&
          !inp.classList.contains("away-val")
        )
          return;

        const digits = (inp.value.match(/\d+/g) || []).join("");
        const n = clamp(digits === "" ? null : Number(digits));
        inp.value = n == null ? "" : String(n);
        clearErr(inp);
      },
      true
    );
  }

  function attachButtonWatchers(root) {
    root.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        if (
          !btn.classList.contains("plus") &&
          !btn.classList.contains("minus")
        )
          return;
        const card = btn.closest(".match-card");
        if (!card) return;

        requestAnimationFrame(() => {
          const h = card.querySelector(".home-val");
          const a = card.querySelector(".away-val");
          if (!h || !a) return;

          clearErr(h);
          const res = validatePair(h, a, { allowEmpty: true });
          if (!res.ok) {
            setErr(h, res.msg || "Invalid score.");
            if (res.hv != null) h.value = String(res.hv);
            if (res.av != null) a.value = String(res.av);
          }
        });
      },
      true
    );
  }

  function attachConfirmGate() {
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest("#gprompt-confirm");
        if (!btn) return;

        const cards = document.querySelectorAll(".match-card");
        let firstErr = null;

        cards.forEach((card) => {
          const h = card.querySelector(".home-val");
          const a = card.querySelector(".away-val");
          if (!h || !a) return;

          const res = validatePair(h, a, { allowEmpty: true });
          clearErr(h);
          if (!res.ok) {
            if (!firstErr) firstErr = { card, h, msg: res.msg };
            setErr(h, res.msg || "Invalid score.");
          } else {
            if (res.hv != null) h.value = String(res.hv);
            if (res.av != null) a.value = String(res.av);
          }
        });

        if (firstErr) {
          e.preventDefault();
          e.stopImmediatePropagation();
          firstErr.h.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }
      },
      true
    );
  }

  function bootIfPresent() {
    const list = document.getElementById("predictions-list");
    if (!list) return;
    attachInputSanitizers(document);
    attachButtonWatchers(document);
    attachConfirmGate();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootIfPresent);
  } else {
    bootIfPresent();
  }

  window.FBL_TESTS = {
    validateCard(cardEl) {
      const h = cardEl.querySelector(".home-val");
      const a = cardEl.querySelector(".away-val");
      if (!h || !a) return { ok: true };
      clearErr(h);
      const r = validatePair(h, a, { allowEmpty: true });
      if (!r.ok) setErr(h, r.msg || "Invalid score.");
      return r;
    },
  };
})();




