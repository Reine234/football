(function () {
  // 1. Identify which league page we're on.
  // Your <body> in each league's index.html MUST look like:
  // <body data-league="PREMIER_LEAGUE">  OR  LALIGA  OR  BUNDESLIGA
  const leagueKey = document.body.dataset.league;
  if (!leagueKey) {
    console.error("data-league missing on <body>");
    return;
  }

  const leagueInfo = window.FBL.LEAGUE_MAP[leagueKey];

  // 2. Grab important DOM elements from your league index page.
  // You should have these in your HTML:
  //
  // <div class="matches-header">
  //   <h2 id="matchday-title">Premier League - Matchday 1 of 38</h2>
  //   <div class="page-controls">
  //     <button id="prev-day" class="arrow">&lt;</button>
  //     <span id="day-number"></span>  <-- optional, if you have it
  //     <button id="next-day" class="arrow">&gt;</button>
  //   </div>
  // </div>
  //
  // <section class="matches">
  //   <div id="matches-container"></div>
  // </section>
  //
  // <a class="fixed-button" id="bet-button-main">Bet</a>
  //
  const matchdayTitleEl = document.getElementById("matchday-title");
  const matchesContainer = document.getElementById("matches-container");
  const prevBtn = document.getElementById("prev-day");
  const nextBtn = document.getElementById("next-day");

  // Prefer id="bet-button-main". If you only have class="fixed-button", that's fine too.
  const betBtn =
    document.getElementById("bet-button-main") ||
    document.querySelector(".fixed-button");

  // 3. Internal state:
  // We'll fetch all fixtures, group them by round ("Matchday 1", "Matchday 2", ...)
  // Then we keep track which round index we’re displaying.
  let grouped = null; // { byRound: {roundNum:[fixtures...]}, rounds:[roundNum,...sorted] }
  let roundIndex = 0;

  // 4. Helper: readable day header text.
  // We want the <h4> to look like: "Sat 25 Oct 2025"
  function formatDayLabel(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return "Date TBD";
    }

    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    const dayName = days[d.getDay()];
    const dateNum = d.getDate(); // 1-31
    const monthName = months[d.getMonth()];
    const year = d.getFullYear();

    return `${dayName} ${dateNum} ${monthName} ${year}`;
  }

  // 5. Render one round / matchday into your exact card layout.
  //
  // For the currently selected round:
  //   - Update the header text "Premier League - Matchday X of Y"
  //   - Group fixtures in that round by calendar date
  //   - For each date, create:
  //        <div class="day">
  //          <h4>Sat 25 Oct 2025</h4>
  //          <div class="match-card cyan"> ... </div>
  //          <div class="match-card blue"> ... </div>
  //        </div>
  //
  //   - Each .match-card uses your structure:
  //
  //      <div class="match-card cyan">
  //        <div class="match-info">
  //          <p class="time">12:30</p>
  //          <div class="teams">
  //            <div class="team">
  //              <img />
  //              <p>Home Team</p>
  //            </div>
  //            <div class="team">
  //              <img />
  //              <p>Away Team</p>
  //            </div>
  //          </div>
  //        </div>
  //      </div>
  //
  function renderRound() {
    // no data yet?
    if (!grouped || !grouped.rounds.length) {
      if (matchdayTitleEl) {
        matchdayTitleEl.textContent =
          `${leagueInfo.name} - Matchday ? of ${leagueInfo.totalRounds || "?"}`;
      }
      matchesContainer.innerHTML = "<p>No fixtures available.</p>";
      return;
    }

    // Find which round number we're on (example: 12)
    const roundNum = grouped.rounds[roundIndex];
    const fixtures = grouped.byRound[roundNum] || [];

    // Update the header line: "Premier League - Matchday 12 of 38"
    if (matchdayTitleEl) {
      matchdayTitleEl.textContent =
        `${leagueInfo.name} - Matchday ${roundNum} of ${leagueInfo.totalRounds || "?"}`;
    }

    // Group fixtures for this round by calendar day
    // byDate[dateLabel] = [fixtures that day...]
    const byDate = {};
    fixtures.forEach((f) => {
      const label = formatDayLabel(f.utcDate);
      if (!byDate[label]) byDate[label] = [];
      byDate[label].push(f);
    });

    // Sort days chronologically by first match kickoff timestamp
    const dateLabels = Object.keys(byDate).sort((a, b) => {
      const fa = byDate[a][0];
      const fb = byDate[b][0];
      return Date.parse(fa.utcDate) - Date.parse(fb.utcDate);
    });

    // Build HTML
    let html = "";

    dateLabels.forEach((dateLabel) => {
      const matchesThatDay = byDate[dateLabel].slice().sort((x, y) => {
        return Date.parse(x.utcDate) - Date.parse(y.utcDate);
      });

      // day wrapper start
      html += `<div class="day"><h4>${dateLabel}</h4>`;

      // each individual fixture
      matchesThatDay.forEach((f, idxInDay) => {
        const kickoff = window.FBL.formatKickoffLocal(f.utcDate); // "12:30"
        const colorClass = idxInDay % 2 === 0 ? "cyan" : "blue";

        html += `
          <div class="match-card ${colorClass}" data-fixture="${f.id}">
            <div class="match-info">
              <p class="time">${kickoff}</p>
              <div class="teams">
                <div class="team home-team">
                  <img class="team-logo home-logo" />
                  <p>${f.home.name}</p>
                </div>
                <div class="team away-team">
                  <img class="team-logo away-logo" />
                  <p>${f.away.name}</p>
                </div>
              </div>
            </div>
          </div>
        `;
      });

      // close .day
      html += `</div>`;
    });

    // Write all that into the page
    matchesContainer.innerHTML = html || "<p>No matches this round.</p>";

    // Now: attach logos for each rendered match-card
    fixtures.forEach((f) => {
      const card = matchesContainer.querySelector(
        '.match-card[data-fixture="' + f.id + '"]'
      );
      if (!card) return;

      const homeLogoEl = card.querySelector(".home-logo");
      const awayLogoEl = card.querySelector(".away-logo");

      window.FBL.ensureLogo(f.home, homeLogoEl);
      window.FBL.ensureLogo(f.away, awayLogoEl);
    });

    // VERY IMPORTANT:
    // Save this exact round's fixtures so predictions page can rebuild the prediction cards.
    // This is what predictionsPage.js reads later.
    window.FBL.persistSelectedRound(leagueKey, roundNum, fixtures);
  }

  // 6. Navigation handlers for < and >
  function goPrev() {
    if (!grouped) return;
    roundIndex = Math.max(0, roundIndex - 1);
    renderRound();
  }

  function goNext() {
    if (!grouped) return;
    roundIndex = Math.min(grouped.rounds.length - 1, roundIndex + 1);
    renderRound();
  }

  // 7. Bet button handler.
  // When user clicks your floating blue Bet button:
  // - we already saved the current round's fixtures in persistSelectedRound()
  // - we store leagueKey (so predictions knows which league to load)
  // - we go to that league's ./predictions.html
  function onBetClick(e) {
    e.preventDefault();

    // remember which league this came from
    sessionStorage.setItem("FBL_leagueKey", leagueKey);

    // go to this league's predictions page
    window.location.href = "./predictions.html";
  }

  // 8. Initialize page:
  //    - fetch fixtures for THIS league from our API layer
  //    - group by round
  //    - pick the "current" round (closest to today / upcoming)
  //    - render that round using your CSS layout
  async function init() {
    // fetchFixturesForLeague() is in api.js and already handles:
    // - API-Football primary
    // - TheSportsDB fallback
    // - returning fixtures in normalized format:
    //    {
    //      id,
    //      utcDate,
    //      roundNum,
    //      home:{name,logo,...},
    //      away:{name,logo,...}
    //    }
    const allFixtures = await window.FBL.fetchFixturesForLeague(leagueKey);

    // Organize fixtures by round number
    grouped = window.FBL.groupFixturesByRound(allFixtures);

    if (!grouped.rounds.length) {
      renderRound();
      return;
    }

    // Choose which round to start on:
    // getCurrentRoundIndex() picks the first round that still has a future match,
    // otherwise it shows the last round (season finished).
    roundIndex = window.FBL.getCurrentRoundIndex(
      grouped.rounds,
      grouped.byRound
    );

    renderRound();
  }

  // 9. Hook up button events
  if (prevBtn) prevBtn.addEventListener("click", goPrev);
  if (nextBtn) nextBtn.addEventListener("click", goNext);
  if (betBtn)  betBtn.addEventListener("click", onBetClick);

  // 10. Start everything
  init();
})();



