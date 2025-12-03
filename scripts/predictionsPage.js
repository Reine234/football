// /scripts/predictionsPage.js
(function () {
  // --- SAFETY: ensure FBL + LEAGUE_MAP exist ---
  window.FBL = window.FBL || {};
  window.FBL.LEAGUE_MAP = window.FBL.LEAGUE_MAP || {
    PREMIER_LEAGUE: { name: "Premier League", totalRounds: 38 },
    BUNDESLIGA:     { name: "Bundesliga",     totalRounds: 34 },
    LALIGA:         { name: "La Liga",        totalRounds: 38 },
    AFCON:          { name: "Afcon",          totalRounds: 6 },
  };

  // ------------------------------------------------------------
  // Firestore store (save + load)
  // ------------------------------------------------------------
  (function () {
    const auth =
      (window.FBL_FIREBASE && window.FBL_FIREBASE.auth) ||
      (window.firebase && firebase.auth && firebase.auth());

    const db =
      (window.FBL_FIREBASE && window.FBL_FIREBASE.db) ||
      (window.firebase && firebase.firestore && firebase.firestore());

    function getUidNow() {
      try {
        return auth && auth.currentUser ? auth.currentUser.uid : null;
      } catch (_) {
        return null;
      }
    }

    function waitForUid() {
      const uid = getUidNow();
      if (uid) return Promise.resolve(uid);

      return new Promise((resolve, reject) => {
        if (!auth || !auth.onAuthStateChanged) {
          resolve(null);
          return;
        }
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

    async function savePredictionsForRound(leagueKey, roundNum, pending) {
      const uid = await waitForUid();
      if (!uid) throw new Error("Not logged in");
      if (!db || !db.batch) throw new Error("Firestore not available");

      console.log("[STORE] saving", pending.length, "for", leagueKey, "round", roundNum);

      const batch = db.batch();

      pending.forEach((p) => {
        const fixtureId = String(p.fixtureId);
        const docId = `${uid}_${leagueKey}_${fixtureId}`;
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

    async function loadPredictionsForLeague(leagueKey) {
      const uid = await waitForUid();
      if (!uid || !db) return [];

      const snap = await db
        .collection("predictions")
        .where("uid", "==", uid)
        .where("league", "==", leagueKey)
        .get();

      const out = [];
      snap.forEach((doc) => out.push(doc.data()));
      out.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      return out;
    }

    window.FBL_STORE = window.FBL_STORE || {};
    window.FBL_STORE.savePredictionsForRound = savePredictionsForRound;
    window.FBL_STORE.loadPredictionsForLeague = loadPredictionsForLeague;
  })();

  // ------------------------------------------------------------
  // League context (supports AFCON static flow + existing flow)
  // ------------------------------------------------------------
  function detectLeagueKeyFromPath() {
    const path = (window.location.pathname || "").toLowerCase();
    if (path.includes("/afcon/"))      return "AFCON";
    if (path.includes("/laliga/"))     return "LALIGA";
    if (path.includes("/bundesliga/")) return "BUNDESLIGA";
    return "PREMIER_LEAGUE";
  }

  function loadSelectedRoundUniversal() {
    // 1) Existing helper if available (Premier / BL / LaLiga flow)
    try {
      if (window.FBL && typeof window.FBL.loadSelectedRound === "function") {
        const sel = window.FBL.loadSelectedRound();
        if (sel && Array.isArray(sel.fixtures) && sel.fixtures.length) {
          console.log("[PredictionsPage] using FBL.loadSelectedRound", sel);
          return sel;
        }
      }
    } catch (e) {
      console.warn("[PredictionsPage] FBL.loadSelectedRound failed:", e);
    }

    // 2) Fallback: AFCON / custom static pages write here
    try {
      const raw = sessionStorage.getItem("FBL_selectedRound");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.fixtures)) {
          console.log("[PredictionsPage] using FBL_selectedRound from sessionStorage", parsed);
          return parsed;
        }
      }
    } catch (e) {
      console.warn("[PredictionsPage] FBL_selectedRound parse error:", e);
    }

    return null;
  }

  let selected  = loadSelectedRoundUniversal();
  let leagueKey = sessionStorage.getItem("FBL_leagueKey");

  if (!leagueKey && selected && selected.leagueKey) {
    leagueKey = selected.leagueKey;
    sessionStorage.setItem("FBL_leagueKey", leagueKey);
  }

  if (!leagueKey) {
    leagueKey = detectLeagueKeyFromPath();
    sessionStorage.setItem("FBL_leagueKey", leagueKey);
  }

  if (!selected || !leagueKey || !window.FBL.LEAGUE_MAP[leagueKey]) {
    console.error("[PredictionsPage] No selected round / league.", {
      leagueKey,
      selected,
    });

    const folderKey = detectLeagueKeyFromPath();
    let base = "../premier/";
    if (folderKey === "AFCON")          base = "../afcon/";
    else if (folderKey === "LALIGA")    base = "../laliga/";
    else if (folderKey === "BUNDESLIGA") base = "../bundesliga/";

    window.location.href = base + "index.html";
    return;
  }
const leagueInfo  = window.FBL.LEAGUE_MAP[leagueKey];
const roundNum    = selected.roundNum || 1;
const totalRounds = leagueInfo.totalRounds || "?";
const allFixtures = selected.fixtures || [];

// Mode + selected fixture from sessionStorage (set by match-card / Bet+)
const mode         = sessionStorage.getItem("FBL_mode") || "all";
const selFixtureId = sessionStorage.getItem("FBL_selectedFixture");

let pageFixtures;

// 👉 For AFCON we ALWAYS show all fixtures for the selected matchday
if (leagueKey === "AFCON") {
  pageFixtures = allFixtures.slice();
} else if (mode === "single" && selFixtureId) {
  // Normal leagues: try single-match mode
  pageFixtures = allFixtures.filter(
    (f) => String(f.id) === String(selFixtureId)
  );

  // If nothing matches (bad id / stale storage), fall back to all fixtures
  if (!pageFixtures.length) {
    console.warn(
      "[PredictionsPage] single-mode id not found, falling back to all fixtures"
    );
    pageFixtures = allFixtures.slice();
  }
} else {
  // Normal ALL mode
  pageFixtures = allFixtures.slice();
}

console.log(
  "[PredictionsPage] leagueKey=",
  leagueKey,
  "roundNum=",
  roundNum,
  "fixtures=",
  allFixtures.length,
  "pageFixtures=",
  pageFixtures.length
);

  // ------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------
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

  // ------------------------------------------------------------
  // Prediction state + helpers
  // ------------------------------------------------------------
  // userPred[fixtureId] = { homeScore, awayScore, homeTeam, awayTeam }
  const userPred = {};
  const clamp    = (v) => (v < 0 ? 0 : v > 20 ? 20 : v);
  const display  = (el, val) => {
    if (!el) return;
    el.value = val === null || typeof val === "undefined" ? "" : String(val);
  };
  const isSet = (p) => p && p.homeScore !== null && p.awayScore !== null;

  // helper for long team names
  function breakTeamName(name) {
    if (!name) return "";
    const words = String(name).trim().split(/\s+/);

    if (words.length <= 2) return words.join(" ");

    if (words.length === 3) {
      return `${words[0]} ${words[1]}<br>${words[2]}`;
    }
    if (words.length === 4) {
      return `${words[0]} ${words[1]}<br>${words[2]} ${words[3]}`;
    }
    const firstLine = `${words[0]} ${words[1]}`;
    const secondLine = words.slice(2).join(" ");
    return `${firstLine}<br>${secondLine}`;
  }

  function ensurePredictionSlot(f) {
    const id = String(f.id);
    if (!userPred[id]) {
      userPred[id] = {
        homeScore: null,
        awayScore: null,
        homeTeam: f.home,
        awayTeam: f.away,
      };
    } else {
      userPred[id].homeTeam = f.home;
      userPred[id].awayTeam = f.away;
    }
  }

  // ------------------------------------------------------------
  // Render fixtures (no button listeners here)
  // ------------------------------------------------------------
  function renderFixtures() {
    if (!listEl) return;

    if (subtitleEl) {
      subtitleEl.innerHTML =
        `<span class="bold">${leagueInfo.name} Matches</span> - ` +
        `Matchday ${roundNum} of ${totalRounds}`;
    }
    if (dayNumWrapEl) {
      dayNumWrapEl.textContent = roundNum;
    }
    if (prevDayBtn) prevDayBtn.disabled = true;
    if (nextDayBtn) nextDayBtn.disabled = true;

    pageFixtures.forEach((f) => ensurePredictionSlot(f));

    const html = pageFixtures
      .map((f) => {
        const ko = window.FBL.formatKickoffLocal
          ? window.FBL.formatKickoffLocal(f.utcDate)
          : "";
        return `
        <div class="match-card" data-fixture="${f.id}">
          <div class="teams">
            <div class="team left">
              <img class="team-logo home-logo" />
              <p>${breakTeamName(f.home.name)}</p>
            </div>
            <div class="match-center">
              <p class="vs">VS</p>
              <p class="time">${ko}</p>
            </div>
            <div class="team right">
              <img class="team-logo away-logo" />
              <p>${breakTeamName(f.away.name)}</p>
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

    // logos + initial values
    pageFixtures.forEach((f) => {
      const row = listEl.querySelector(
        `.match-card[data-fixture="${f.id}"]`
      );
      if (!row) return;
      const id = String(f.id);
      const pred = userPred[id];

      if (window.FBL.ensureLogo) {
        window.FBL.ensureLogo(f.home, row.querySelector(".home-logo"));
        window.FBL.ensureLogo(f.away, row.querySelector(".away-logo"));
      }

      const hVal = row.querySelector(".home-val");
      const aVal = row.querySelector(".away-val");
      display(hVal, pred.homeScore);
      display(aVal, pred.awayScore);
    });
  }

  // ------------------------------------------------------------
  // Global +/- handler on window (capture phase)
  // ------------------------------------------------------------
  let plusMinusWired = false;
  function wirePlusMinus() {
    if (plusMinusWired) return;
    plusMinusWired = true;

    window.addEventListener(
      "click",
      function (e) {
        const btn = e.target.closest("button.plus, button.minus");
        if (!btn) return;
        const card = btn.closest(".match-card");
        if (!card) return;

        // Block other click handlers
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const fixtureId = String(card.dataset.fixture || "");
        const pred = userPred[fixtureId];
        if (!pred) return;

        const isHome =
          btn.classList.contains("home-plus") ||
          btn.classList.contains("home-minus");
        const isPlus = btn.classList.contains("plus");

        if (isHome) {
          let cur = pred.homeScore;
          if (cur === null || Number.isNaN(cur)) cur = 0;
          cur = clamp(cur + (isPlus ? 1 : -1));
          pred.homeScore = cur;
          const hVal = card.querySelector(".home-val");
          display(hVal, cur);
        } else {
          let cur = pred.awayScore;
          if (cur === null || Number.isNaN(cur)) cur = 0;
          cur = clamp(cur + (isPlus ? 1 : -1));
          pred.awayScore = cur;
          const aVal = card.querySelector(".away-val");
          display(aVal, cur);
        }

        if (topDoneLink && !topDoneLink.classList.contains("done-active")) {
          topDoneLink.classList.add("done-active");
        }
      },
      true
    );
  }

  // ------------------------------------------------------------
  // Helpers, finalize & popup logic
  // ------------------------------------------------------------
  function leagueFolderFromKey(key) {
    if (key === "AFCON")      return "afcon";
    if (key === "LALIGA")     return "laliga";
    if (key === "BUNDESLIGA") return "bundesliga";
    return "premier";
  }

  function waitForFirebaseUser() {
    try {
      if (window.FBL_FIREBASE && window.FBL_FIREBASE.auth) {
        const auth = window.FBL_FIREBASE.auth;
        const u = auth.currentUser;
        if (u) return Promise.resolve(u);
        return new Promise((resolve) => {
          const unsub = auth.onAuthStateChanged((user) => {
            unsub();
            resolve(user || null);
          });
        });
      }
      if (window.firebase && firebase.auth) {
        const auth = firebase.auth();
        const u = auth.currentUser;
        if (u) return Promise.resolve(u);
        return new Promise((resolve) => {
          const unsub = auth.onAuthStateChanged((user) => {
            unsub();
            resolve(user || null);
          });
        });
      }
    } catch (_) {}
    return Promise.resolve(null);
  }

  async function finalizeAndContinue() {
    const touched = pageFixtures.filter((f) =>
      isSet(userPred[String(f.id)])
    );
    if (!touched.length) {
      alert(".");
      return;
    }

   pending = touched.map((f) => {
  const p = userPred[String(f.id)];
  return {
    league:    leagueKey,
    fixtureId: String(f.id),
    matchday:  roundNum,

    // we now also keep logos (for AFCON) and kickoff time
    home: {
      id:    f.home.id,
      name:  f.home.name,
      logo:  f.home.logo || null,
      score: p.homeScore,
    },
    away: {
      id:    f.away.id,
      name:  f.away.name,
      logo:  f.away.logo || null,
      score: p.awayScore,
    },

    // real kickoff from the fixture (used on results page)
    kickoff:   f.utcDate || null,

    // when the prediction was submitted
    timestamp: new Date().toISOString(),
  };
});

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

  function openConfirmPrompt() {
    if (!overlayEl || !confirmListEl) return;

    if (badgeEl) badgeEl.textContent = leagueInfo.name + " Matches";
    if (matchdayTextEl)
      matchdayTextEl.textContent = `${roundNum} of ${totalRounds}`;

    const touched = pageFixtures.filter((f) =>
      isSet(userPred[String(f.id)])
    );
    if (!touched.length) {
      alert(".");
      return;
    }

    const rows = touched
      .map((f) => {
        const p = userPred[String(f.id)];
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
      if (!r || !window.FBL.ensureLogo) return;
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

  function closeConfirmPrompt() {
    if (!overlayEl) return;
    overlayEl.classList.remove("is-open");
    overlayEl.setAttribute("aria-hidden", "true");
  }

  function onDone(e) {
    e.preventDefault();
    openConfirmPrompt();
  }

  if (topDoneLink)   topDoneLink.addEventListener("click", onDone);
  if (bottomDoneBtn) bottomDoneBtn.addEventListener("click", onDone);
  if (closeBtn)      closeBtn.addEventListener("click", closeConfirmPrompt);
  if (cancelBtn)     cancelBtn.addEventListener("click", closeConfirmPrompt);
  if (confirmBtn)
    confirmBtn.addEventListener("click", (e) => {
      e.preventDefault();
      finalizeAndContinue();
    });

  // ------------------------------------------------------------
  // Initial render + wire clicks
  // ------------------------------------------------------------
  renderFixtures();
  wirePlusMinus();
})();
