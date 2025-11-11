// /scripts/predictionsPage.js
(function () {
  // 1) Load context provided by league page
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

  // 2) Single vs all mode
  const mode = sessionStorage.getItem("FBL_mode") || "all";
  const selFixtureId = sessionStorage.getItem("FBL_selectedFixture");
  const pageFixtures = (mode === "single" && selFixtureId)
    ? allFixtures.filter(f => String(f.id) === String(selFixtureId))
    : allFixtures.slice();

  // 3) DOM
  const subtitleEl   = document.querySelector(".subtitle");
  const dayNumWrapEl = document.getElementById("day-number2");
  const prevDayBtn   = document.getElementById("prev-day");
  const nextDayBtn   = document.getElementById("next-day");
  const listEl       = document.getElementById("predictions-list");

  const topDoneLink  = document.getElementById("done");
  const bottomDoneBtn= document.getElementById("done-button");

  const overlayEl    = document.getElementById("gprompt-overlay");
  const closeBtn     = document.getElementById("gprompt-close");
  const cancelBtn    = document.getElementById("gprompt-cancel");
  const confirmBtn   = document.getElementById("gprompt-confirm");

  const confirmListEl  = document.getElementById("confirmList");
  const badgeEl        = document.querySelector(".gprompt__badge");
  const matchdayTextEl = document.getElementById("gprompt-matchday");

  // 4) Predictions state (start BLANK = null, not 0)
  // userPred[fixtureId] = { homeScore: null|number, awayScore: null|number, homeTeam, awayTeam }
  const userPred = {};

  const clamp = v => (v < 0 ? 0 : v > 20 ? 20 : v);
  const display = (el, val) => { el.value = (val === null ? "" : String(val)); };
  const isSet = p => p && p.homeScore !== null && p.awayScore !== null;

  function renderFixtures() {
    if (subtitleEl) {
      subtitleEl.innerHTML = `<span class="bold">${leagueInfo.name} Matches</span> - Matchday ${roundNum} of ${totalRounds}`;
    }
    if (dayNumWrapEl) dayNumWrapEl.textContent = roundNum;
    if (prevDayBtn) prevDayBtn.disabled = true;
    if (nextDayBtn) nextDayBtn.disabled = true;

    const html = pageFixtures.map(f => {
      userPred[f.id] = { homeScore: null, awayScore: null, homeTeam: f.home, awayTeam: f.away };
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
    }).join("");
    listEl.innerHTML = html;

    // logos
    pageFixtures.forEach(f => {
      const row = listEl.querySelector(`.match-card[data-fixture="${f.id}"]`);
      if (!row) return;
      window.FBL.ensureLogo(f.home, row.querySelector(".home-logo"));
      window.FBL.ensureLogo(f.away, row.querySelector(".away-logo"));
    });

    // +/- handlers (null-aware; blanks by default)
    pageFixtures.forEach(f => {
      const row = listEl.querySelector(`.match-card[data-fixture="${f.id}"]`);
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

  function openConfirmPrompt() {
    if (badgeEl)        badgeEl.textContent = leagueInfo.name + " Matches";
    if (matchdayTextEl) matchdayTextEl.textContent = `${roundNum} of ${totalRounds}`;

    const touched = pageFixtures.filter(f => isSet(userPred[f.id]));
    if (!touched.length) { alert("Please enter at least one prediction."); return; }

    const rows = touched.map(f => {
      const p = userPred[f.id];
      return `
        <div class="gprompt__row">
          <img class="gprompt__logo gprompt__logo--home" />
          <div class="gprompt__team">${f.home.name}</div>
          <div class="gprompt__score">${p.homeScore} - ${p.awayScore}</div>
          <img class="gprompt__logo gprompt__logo--away" />
          <div class="gprompt__team">${f.away.name}</div>
        </div>`;
    }).join("");
    confirmListEl.innerHTML = rows;

    touched.forEach((f, i) => {
      const r = confirmListEl.querySelectorAll(".gprompt__row")[i];
      if (!r) return;
      window.FBL.ensureLogo(f.home, r.querySelector(".gprompt__logo--home"));
      window.FBL.ensureLogo(f.away, r.querySelector(".gprompt__logo--away"));
    });

    overlayEl.classList.add("is-open");
    overlayEl.setAttribute("aria-hidden", "false");
  }

  function closeConfirmPrompt() {
    overlayEl.classList.remove("is-open");
    overlayEl.setAttribute("aria-hidden", "true");
  }


async function hasSession() {
  try {
    const r = await fetch((window.FBL_API_BASE||"") + "/api/users.php?action=session", { credentials: "include" });
    const j = await r.json();
    return !!(j && j.success);
  } catch { return false; }
}





  function buildServerPayloads(touchedFixtures) {
    // server wants: { league, fixtureId, matchday, home:{id,name,score}, away:{id,name,score}, timestamp }
    return touchedFixtures.map(f => ({
      league: leagueKey,
      fixtureId: f.id,
      matchday: roundNum,
      home: { id: f.home.id, name: f.home.name, score: userPred[f.id].homeScore },
      away: { id: f.away.id, name: f.away.name, score: userPred[f.id].awayScore },
      timestamp: new Date().toISOString()
    }));
  }

 const API_USERS = (window.FBL_API_BASE || "") + "/api/users.php";

async function saveToServer(predArray) {
  for (const p of predArray) {
    const res = await fetch(API_USERS, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ action: "save_prediction", prediction: p }),
    });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("application/json")) {
      const text = await res.text();
      throw new Error("Save failed (not JSON). " + res.status + " " + text.slice(0,200));
    }
    const j = await res.json();
    if (!j.success) throw new Error(j.message || "Save failed");
  }
}


  async function finalizeAndContinue() {
    const touched = pageFixtures.filter(f => isSet(userPred[f.id]));
    if (!touched.length) { alert("Please enter at least one prediction."); return; }

    // Save locally so your client-side results also work
    const filtered = {};
    touched.forEach(f => { filtered[f.id] = userPred[f.id]; });
    window.FBL.savePredictions(filtered);

    // Try cookie session
    if (await hasSession()) {
      try {
        await saveToServer(buildServerPayloads(touched));
        closeConfirmPrompt();
        // Go to results in the same league folder
        window.location.href = 'results.html';
        return;
      } catch (e) {
        console.warn('Server save failed, falling back to signup...', e);
      }
    }

    // No session → stash and send to signup once
    sessionStorage.setItem('pending_predictions', JSON.stringify(buildServerPayloads(touched)));
    closeConfirmPrompt();

    // Redirect to signup (user can switch to Sign In); return to this league's results
    const nextUrl = location.pathname.replace(/predictions\.html$/i, 'results.html');
    window.location.href = '../signup.html?next=' + encodeURIComponent(nextUrl);
  }

  // Events
  const onDone = e => { e.preventDefault(); openConfirmPrompt(); };
  if (topDoneLink)   topDoneLink.addEventListener('click', onDone);
  if (bottomDoneBtn) bottomDoneBtn.addEventListener('click', onDone);
  if (closeBtn)      closeBtn.addEventListener('click', closeConfirmPrompt);
  if (cancelBtn)     cancelBtn.addEventListener('click', closeConfirmPrompt);
  if (confirmBtn)    confirmBtn.addEventListener('click', (e) => { e.preventDefault(); finalizeAndContinue(); });

  // Start
  renderFixtures();
})();

















