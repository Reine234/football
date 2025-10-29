(function () {
  //
  // 1. LOAD CONTEXT SAVED FROM THE LEAGUE PAGE
  //
  // When the user clicked Bet on the league index page, we stored:
  // - the leagueKey ("PREMIER_LEAGUE"/"LALIGA"/"BUNDESLIGA")
  // - the selected roundNum and fixtures[] in sessionStorage via FBL.persistSelectedRound()
  //
  const selected = window.FBL.loadSelectedRound(); // { leagueKey, roundNum, fixtures }
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

  const leagueInfo   = window.FBL.LEAGUE_MAP[leagueKey];
  const roundNum     = selected.roundNum || 1;
  const totalRounds  = leagueInfo.totalRounds || "?";
  const fixtures     = selected.fixtures || [];

  //
  // 2. GRAB ELEMENTS FROM predictions.html
  //
  // Top header / subtitle
  const subtitleEl      = document.querySelector(".subtitle");    // "Premier League Matches - Matchday X of Y"
  const dayNumWrapEl    = document.getElementById("day-number2"); // number in page-controls2
  const prevDayBtn      = document.getElementById("prev-day");
  const nextDayBtn      = document.getElementById("next-day");

  // Container where all .match-card blocks will be injected
  // Make sure predictions.html has ONE <div id="predictions-list"></div>
  const listEl          = document.getElementById("predictions-list");

  // "Done" controls
  const topDoneLink     = document.getElementById("done");         // link in the header row
  const bottomDoneBtn   = document.getElementById("done-button");  // big button at the bottom

  // Modal elements (the confirmation popup)
  const overlayEl       = document.getElementById("gprompt-overlay");
  const closeBtn        = document.getElementById("gprompt-close");
  const cancelBtn       = document.getElementById("gprompt-cancel");
  const confirmBtn      = document.getElementById("gprompt-confirm");

  const confirmListEl   = document.getElementById("confirmList");
  const badgeEl         = document.querySelector(".gprompt__badge");
  const matchdayTextEl  = document.getElementById("gprompt-matchday");

  //
  // 3. USER PREDICTIONS STATE
  //
  // We'll track what the user enters for each match:
  // userPredictions[fixtureId] = { homeScore, awayScore, homeTeam, awayTeam }
  //
  const userPredictions = {};

  function clamp(val) {
    if (val < 0) return 0;
    if (val > 20) return 20;
    return val;
  }

  //
  // 4. RENDER THE MATCH CARDS
  //
  // We are matching YOUR EXACT structure and classes:
  //
  // <div class="match-card">
  //   <div class="teams">
  //     <div class="team left">
  //       <img class="team-logo home-logo" />
  //       <p>Home Team</p>
  //     </div>
  //
  //     <div class="match-center">
  //       <p class="vs">VS</p>
  //       <p class="time">15:00</p>
  //     </div>
  //
  //     <div class="team right">
  //       <img class="team-logo away-logo" />
  //       <p>Away Team</p>
  //     </div>
  //   </div>
  //
  //   <hr class="hr">
  //
  //   <p class="prediction-label">Enter your prediction score</p>
  //
  //   <div class="score-inputs">
  //     <div class="score-box home-box">
  //       <button class="minus home-minus">-</button>
  //       <input class="home-val" type="number" value="0" min="0" readonly />
  //       <button class="plus home-plus">+</button>
  //     </div>
  //     <div class="score-box away-box">
  //       <button class="minus away-minus">-</button>
  //       <input class="away-val" type="number" value="0" min="0" readonly />
  //       <button class="plus away-plus">+</button>
  //     </div>
  //   </div>
  // </div>
  //
  function renderFixtures() {
    // Update heading to correct league + matchday
    if (subtitleEl) {
      subtitleEl.innerHTML = `
        <span class="bold">${leagueInfo.name} Matches</span> - Matchday ${roundNum} of ${totalRounds}
      `;
    }
    if (dayNumWrapEl) {
      dayNumWrapEl.textContent = roundNum;
    }

    // Predictions page only covers THIS one matchday, so lock arrows
    if (prevDayBtn) prevDayBtn.disabled = true;
    if (nextDayBtn) nextDayBtn.disabled = true;

    // Build all cards HTML
    const cardsHtml = fixtures.map(function (f) {
      // Init default prediction 0-0
      userPredictions[f.id] = {
        homeScore: 0,
        awayScore: 0,
        homeTeam: f.home,
        awayTeam: f.away
      };

      // Local kickoff time string, goes in .time
      const kickoffTime = window.FBL.formatKickoffLocal(f.utcDate); // e.g. "15:00"

      return `
        <div class="match-card" data-fixture="${f.id}">
          <div class="teams">
            <!-- HOME -->
            <div class="team left">
              <img class="team-logo home-logo" />
              <p>${f.home.name}</p>
            </div>

            <!-- CENTER -->
            <div class="match-center">
              <p class="vs">VS</p>
              <p class="time">${kickoffTime}</p>
            </div>

            <!-- AWAY -->
            <div class="team right">
              <img class="team-logo away-logo" />
              <p>${f.away.name}</p>
            </div>
          </div>

          <hr class="hr">

          <p class="prediction-label">Enter your prediction score</p>

          <div class="score-inputs">
            <div class="score-box home-box">
              <button class="minus home-minus">-</button>
              <input class="home-val" type="number" value="0" min="0" readonly />
              <button class="plus home-plus">+</button>
            </div>

            <div class="score-box away-box">
              <button class="minus away-minus">-</button>
              <input class="away-val" type="number" value="0" min="0" readonly />
              <button class="plus away-plus">+</button>
            </div>
          </div>
        </div>
      `;
    }).join("");

    listEl.innerHTML = cardsHtml;

    // After injecting HTML:
    // 1. Inject logos
    fixtures.forEach(function (f) {
      const row = listEl.querySelector('.match-card[data-fixture="' + f.id + '"]');
      if (!row) return;

      const homeLogoEl = row.querySelector(".home-logo");
      const awayLogoEl = row.querySelector(".away-logo");
      window.FBL.ensureLogo(f.home, homeLogoEl);
      window.FBL.ensureLogo(f.away, awayLogoEl);
    });

    // 2. Attach +/- logic for each fixture
    fixtures.forEach(function (f) {
      const row = listEl.querySelector('.match-card[data-fixture="' + f.id + '"]');
      if (!row) return;

      const homeMinus = row.querySelector(".home-minus");
      const homePlus  = row.querySelector(".home-plus");
      const awayMinus = row.querySelector(".away-minus");
      const awayPlus  = row.querySelector(".away-plus");

      const homeValEl = row.querySelector(".home-val");
      const awayValEl = row.querySelector(".away-val");

      homeMinus.addEventListener("click", function () {
        let cur = clamp(userPredictions[f.id].homeScore - 1);
        userPredictions[f.id].homeScore = cur;
        homeValEl.value = cur;
      });

      homePlus.addEventListener("click", function () {
        let cur = clamp(userPredictions[f.id].homeScore + 1);
        userPredictions[f.id].homeScore = cur;
        homeValEl.value = cur;
      });

      awayMinus.addEventListener("click", function () {
        let cur = clamp(userPredictions[f.id].awayScore - 1);
        userPredictions[f.id].awayScore = cur;
        awayValEl.value = cur;
      });

      awayPlus.addEventListener("click", function () {
        let cur = clamp(userPredictions[f.id].awayScore + 1);
        userPredictions[f.id].awayScore = cur;
        awayValEl.value = cur;
      });
    });
  }

  //
  // 5. OPEN THE CONFIRM PROMPT WHEN USER PRESSES "DONE"
  //
  // We build #confirmList rows using your .gprompt__row layout
  //
  function openConfirmPrompt() {
    // Update green badge + matchday text
    if (badgeEl) {
      badgeEl.textContent = leagueInfo.name + " Matches";
    }
    if (matchdayTextEl) {
      matchdayTextEl.textContent = roundNum + " of " + totalRounds;
    }

    // Build rows
    const rowsHtml = fixtures.map(function (f) {
      const pred = userPredictions[f.id] || { homeScore: 0, awayScore: 0 };

      return (
        '<div class="gprompt__row">' +
          '<img class="gprompt__logo gprompt__logo--home" />' +
          '<div class="gprompt__team">' + f.home.name + '</div>' +
          '<div class="gprompt__score">' +
            pred.homeScore + ' - ' + pred.awayScore +
          '</div>' +
          '<img class="gprompt__logo gprompt__logo--away" />' +
          '<div class="gprompt__team">' + f.away.name + '</div>' +
        '</div>'
      );
    }).join("");

    confirmListEl.innerHTML = rowsHtml;

    // Add logos in popup
    fixtures.forEach(function (f, idx) {
      const row = confirmListEl.querySelectorAll(".gprompt__row")[idx];
      if (!row) return;

      const homeLogoEl = row.querySelector(".gprompt__logo--home");
      const awayLogoEl = row.querySelector(".gprompt__logo--away");

      window.FBL.ensureLogo(f.home, homeLogoEl);
      window.FBL.ensureLogo(f.away, awayLogoEl);
    });

    // Show popup
    overlayEl.classList.add("is-open");
    overlayEl.setAttribute("aria-hidden", "false");
  }

  function closeConfirmPrompt() {
    overlayEl.classList.remove("is-open");
    overlayEl.setAttribute("aria-hidden", "true");
  }

  //
  // 6. AFTER USER PRESSES CONFIRM IN THE PROMPT
  //
  // NEW: we now go to the GLOBAL signin.html in the ROOT, not per-league.
  //
  


function finalizeAndContinue() {
  // 1. Save the user's predictions so results.html can read them later
  //    (this stores them in sessionStorage/localStorage via your FBL helpers)
  window.FBL.savePredictions(userPredictions);

  // 2. Run your jQuery validation hook (your "test" logic) if it exists
  if (window.jQuery) {
    jQuery("body").trigger("fblPredictionValidate", [userPredictions]);
  }

  // 3. Remember which league the user was playing in
  //    example values: "PREMIER_LEAGUE", "LALIGA", "BUNDESLIGA"
  sessionStorage.setItem("FBL_leagueKey", leagueKey);

  // 4. Close the confirmation popup visually
  closeConfirmPrompt();

  // 5. Send the user to the shared signin page in the ROOT of the project
  //    NOTE: predictions.html is inside /premier/ or /laliga/ or /bundesliga/,
  //    so "../signin.html" means "go up one level to the root"
  window.location.href = "../signin.html";
}


  //
  // 7. HOOK UP EVENTS
  //
  function onDoneClick(e) {
    e.preventDefault();
    openConfirmPrompt();
  }

  if (topDoneLink) {
    topDoneLink.addEventListener("click", onDoneClick);
  }
  if (bottomDoneBtn) {
    bottomDoneBtn.addEventListener("click", onDoneClick);
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", closeConfirmPrompt);
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", closeConfirmPrompt);
  }
  if (confirmBtn) {
    confirmBtn.addEventListener("click", finalizeAndContinue);
  }

  //
  // 8. START
  //
  renderFixtures();
})();
