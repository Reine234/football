(function () {
  //
  // We need:
  // - leagueKey (so we know which league the user came from)
  // - selected fixtures for that round (saved earlier by predictions flow)
  // - the user's predictions for each fixture
  //
  const leagueKey   = sessionStorage.getItem("FBL_leagueKey");
  const selected    = window.FBL.loadSelectedRound();   // { leagueKey, roundNum, fixtures }
  const predictions = window.FBL.loadPredictions();     // { [fixtureId]: { homeScore, awayScore, homeTeam, awayTeam } }

  const listEl = document.getElementById("results-list"); // <-- must exist in results.html

  // 1) set the "Matches - Matchday X of Y" header from what was selected earlier
  const headerEl = document.querySelector(".matches-header h3");
  if (selected && headerEl) {
    const leagueInfo =
      window.FBL.LEAGUE_MAP[selected.leagueKey] ||
      window.FBL.LEAGUE_MAP[leagueKey] ||
      null;
    const totalRounds = leagueInfo ? leagueInfo.totalRounds : "?";
    headerEl.textContent = `Matches - Matchday ${selected.roundNum} of ${totalRounds}`;
  }

  // 2) fill logged in user
  const userInfoEl   = document.querySelector(".user-info span");
  const userPointsEl = document.querySelector(".user-info .points");
  const loggedInUser = sessionStorage.getItem("FBL_loggedInUser");
  if (loggedInUser && userInfoEl) {
    userInfoEl.textContent = loggedInUser;
  }

  if (!listEl) {
    console.error("results-list container is missing in this results.html");
    return;
  }

  // Safety redirect if we're missing required info
  if (!leagueKey || !selected || !selected.fixtures) {
    console.error("Missing leagueKey/fixtures for results page");
    if (leagueKey && window.FBL.LEAGUE_MAP && window.FBL.LEAGUE_MAP[leagueKey]) {
      window.location.href = "./index.html";
    } else {
      window.location.href = "../premier/index.html";
    }
    return;
  }

  // --------------------------
  // Helpers
  // --------------------------

  // Score points:
  // 3 pts = exact score
  // 1 pt  = correct outcome (win/draw/loss) but not exact
  // 0     = wrong outcome OR match not finished
  function calcPoints(predHome, predAway, realHome, realAway) {
    if (
      realHome === null || realHome === undefined ||
      realAway === null || realAway === undefined
    ) {
      return 0;
    }

    // exact match?
    if (predHome === realHome && predAway === realAway) {
      return 3;
    }

    const predDiff = predHome - predAway;
    const realDiff = realHome - realAway;

    const predOutcome =
      predDiff === 0 ? "draw" : predDiff > 0 ? "home" : "away";
    const realOutcome =
      realDiff === 0 ? "draw" : realDiff > 0 ? "home" : "away";

    if (predOutcome === realOutcome) {
      return 1;
    }
    return 0;
  }

  // Format kickoff time like "12:30pm, Sat 18th Oct"
  function formatMatchDateTime(utcISO) {
    if (!utcISO) return "";

    const d = new Date(utcISO);
    let hours   = d.getHours();
    const mins  = d.getMinutes().toString().padStart(2, "0");
    const ampm  = hours >= 12 ? "pm" : "am";
    hours       = hours % 12;
    if (hours === 0) hours = 12;

    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekday = weekdayNames[d.getDay()];

    const monthNamesShort = [
      "Jan","Feb","Mar","Apr","May","Jun",
      "Jul","Aug","Sep","Oct","Nov","Dec"
    ];
    const month = monthNamesShort[d.getMonth()];

    const dayNum = d.getDate();
    const suffix =
      dayNum === 1 || dayNum === 21 || dayNum === 31
        ? "st"
        : dayNum === 2 || dayNum === 22
        ? "nd"
        : dayNum === 3 || dayNum === 23
        ? "rd"
        : "th";

    return `${hours}:${mins}${ampm}, ${weekday} ${dayNum}${suffix} ${month}`;
  }

  // --------------------------
  // RENDER
  // --------------------------

  function renderResults() {
    if (!selected.fixtures || !selected.fixtures.length) {
      listEl.innerHTML = "<p>No results yet.</p>";
      return;
    }

    let totalPointsThisRound = 0;

    const cardsHtml = selected.fixtures
      .map(function (fixture, idx) {
        const hasPrediction = !!predictions[fixture.id];

        // only show prediction values if user actually predicted
        const predHomeVal = hasPrediction ? (predictions[fixture.id].homeScore ?? "") : "";
        const predAwayVal = hasPrediction ? (predictions[fixture.id].awayScore ?? "") : "";

        // Final / live score from API data
        const realHome =
          fixture.goals && fixture.goals.home !== null && fixture.goals.home !== undefined
            ? fixture.goals.home
            : "";
        const realAway =
          fixture.goals && fixture.goals.away !== null && fixture.goals.away !== undefined
            ? fixture.goals.away
            : "";

        // Points only if user predicted AND we have a real score
        let pts = 0;
        if (hasPrediction && realHome !== "" && realAway !== "") {
          pts = calcPoints(
            Number(predHomeVal),
            Number(predAwayVal),
            Number(realHome),
            Number(realAway)
          );
          totalPointsThisRound += pts;
        }

        const niceDateTime = formatMatchDateTime(fixture.utcDate);

        return `
          <div class="match-card" data-fixture="${fixture.id}">
            <div class="match-header">MATCH ${idx + 1}</div>
            <p class="match-time">${niceDateTime}</p>

            <div class="teams">
              <!-- HOME TEAM -->
              <div class="team home-team">
                <img class="team-logo home-logo" alt="${fixture.home.name} logo" />
                <p>${fixture.home.name}</p>
              </div>

              <!-- MIDDLE SCORE SECTION -->
              <div class="score-section">
                <p class="label">Your prediction</p>
                <div class="score-box">
                  <span><input type="number" value="${predHomeVal}" min="0" readonly /></span>
                  <span>–</span>
                  <span><input type="number" value="${predAwayVal}" min="0" readonly /></span>
                </div>

                <p class="label">Final score</p>
                <div class="score-box">
                  <span><input type="number" value="${realHome}" min="0" readonly /></span>
                  <span>–</span>
                  <span><input type="number" value="${realAway}" min="0" readonly /></span>
                </div>
              </div>

              <!-- AWAY TEAM -->
              <div class="team away-team">
                <img class="team-logo away-logo" alt="${fixture.away.name} logo" />
                <p>${fixture.away.name}</p>
              </div>
            </div>

            ${hasPrediction ? `<p class="points-earned">Points: ${pts}</p>` : `<p class="points-earned"></p>`}
          </div>
        `;
      })
      .join("");

    listEl.innerHTML = cardsHtml || "<p>No results yet.</p>";

    // fill logos after rendering
    selected.fixtures.forEach(function (fixture) {
      const row = listEl.querySelector('.match-card[data-fixture="' + fixture.id + '"]');
      if (!row) return;

      const homeLogoEl = row.querySelector(".home-logo");
      const awayLogoEl = row.querySelector(".away-logo");

      window.FBL.ensureLogo(fixture.home, homeLogoEl);
      window.FBL.ensureLogo(fixture.away, awayLogoEl);
    });

    // 4) put total points into the user header
    if (userPointsEl) {
      userPointsEl.textContent = "Points: " + totalPointsThisRound;
    }
  }

  // Do it
  renderResults();
})();
