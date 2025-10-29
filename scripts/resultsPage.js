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

  if (!listEl) {
    console.error("results-list container is missing in this results.html");
    return;
  }

  // Safety redirect if we're missing required info
  if (!leagueKey || !selected || !selected.fixtures) {
    console.error("Missing leagueKey/fixtures for results page");
    if (leagueKey && window.FBL.LEAGUE_MAP && window.FBL.LEAGUE_MAP[leagueKey]) {
      // We know what league folder we're in, just go back to its index
      window.location.href = "./index.html";
    } else {
      // Fallback to premier home page
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
    // if we don't have a final/ongoing score yet -> 0 for now
    if (
      realHome === null ||
      realHome === undefined ||
      realAway === null ||
      realAway === undefined
    ) {
      return 0;
    }

    // exact match?
    if (predHome === realHome && predAway === realAway) {
      return 3;
    }

    // compare outcome direction (home win / draw / away win)
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
  // We’ll convert the fixture's UTC date to the user's local time.
  function formatMatchDateTime(utcISO) {
    if (!utcISO) return "";

    const d = new Date(utcISO); // browser will interpret it as UTC if it's an ISO with Z
    // time, 12h with am/pm
    let hours   = d.getHours();
    const mins  = d.getMinutes().toString().padStart(2, "0");
    const ampm  = hours >= 12 ? "pm" : "am";
    hours       = hours % 12;
    if (hours === 0) hours = 12;

    // weekday short
    const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const weekday = weekdayNames[d.getDay()];

    // month short
    const monthNamesShort = [
      "Jan","Feb","Mar","Apr","May","Jun",
      "Jul","Aug","Sep","Oct","Nov","Dec"
    ];
    const month = monthNamesShort[d.getMonth()];

    // day with "st/nd/rd/th"
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
    // We'll loop all fixtures from that round and build a card for each.
    // Your layout looks like this:
    //
    // <div class="match-card">
    //   <div class="match-header">MATCH 1</div>
    //   <p class="match-time">12:30pm, Sat 18th Oct</p>
    //
    //   <div class="teams">
    //     <div class="team">
    //       <img src="..." alt="">
    //       <p>Home Team</p>
    //     </div>
    //
    //     <div class="score-section">
    //       <p class="label">Your prediction</p>
    //       <div class="score-box">
    //         <span><input type="number" value="0" min="0" readonly /></span>
    //         <span>–</span>
    //         <span><input type="number" value="0" min="0" readonly /></span>
    //       </div>
    //       <p class="label">Final score</p>
    //       <div class="score-box">
    //         <span><input type="number" value="1" min="0" readonly /></span>
    //         <span>–</span>
    //         <span><input type="number" value="2" min="0" readonly /></span>
    //       </div>
    //     </div>
    //
    //     <div class="team">
    //       <img src="..." alt="">
    //       <p>Away Team</p>
    //     </div>
    //   </div>
    //
    //   <p class="points-earned">Points: 1</p>
    // </div>
    //

    const cardsHtml = selected.fixtures
      .map(function (fixture, idx) {
        // user prediction for this fixture:
        // predictions[fixture.id] = { homeScore, awayScore, homeTeam, awayTeam }
        const guess = predictions[fixture.id] || {
          homeScore: 0,
          awayScore: 0,
          homeTeam: fixture.home,
          awayTeam: fixture.away
        };

        const predHomeVal = guess.homeScore ?? 0;
        const predAwayVal = guess.awayScore ?? 0;

        // Final / live score from API data
        // We expect fixture.goals = { home: number|null, away: number|null }
        // If match not started yet, these may be null
        const realHome =
          fixture.goals && fixture.goals.home !== null && fixture.goals.home !== undefined
            ? fixture.goals.home
            : "";
        const realAway =
          fixture.goals && fixture.goals.away !== null && fixture.goals.away !== undefined
            ? fixture.goals.away
            : "";

        // Points so far
        const pts = calcPoints(
          Number(predHomeVal),
          Number(predAwayVal),
          realHome === "" ? null : Number(realHome),
          realAway === "" ? null : Number(realAway)
        );

        // kickoff display
        const niceDateTime = formatMatchDateTime(fixture.utcDate);

        // Build card HTML for this fixture
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

            <p class="points-earned">Points: ${pts}</p>
          </div>
        `;
      })
      .join("");

    listEl.innerHTML = cardsHtml || "<p>No results yet.</p>";

    // After injecting HTML, fill the logos using the same helper we used before
    selected.fixtures.forEach(function (fixture) {
      const row = listEl.querySelector('.match-card[data-fixture="' + fixture.id + '"]');
      if (!row) return;

      const homeLogoEl = row.querySelector(".home-logo");
      const awayLogoEl = row.querySelector(".away-logo");

      // fixture.home and fixture.away are objects like { id, name, logo? }
      // ensureLogo(teamObj, imgElement) tries API-Football / SportsDB and assigns img.src
      window.FBL.ensureLogo(fixture.home, homeLogoEl);
      window.FBL.ensureLogo(fixture.away, awayLogoEl);
    });
  }

  // Do it
  renderResults();
})();



