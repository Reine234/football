// /scripts/leaguePage.js
(function () {
  // League key is set on <body data-league="PREMIER_LEAGUE"> etc.
  const leagueKey = document.body && document.body.dataset && document.body.dataset.league;
  if (!leagueKey) { console.error("data-league missing on <body>"); return; }

  const leagueInfo = (window.FBL && window.FBL.LEAGUE_MAP && window.FBL.LEAGUE_MAP[leagueKey]) || { name: leagueKey, totalRounds: "?" };

  const matchdayTitleEl  = document.getElementById("matchday-title");
  const matchesContainer = document.getElementById("matches-container");
  const prevBtn          = document.getElementById("prev-day");
  const nextBtn          = document.getElementById("next-day");
  const betBtn           = document.getElementById("bet-button-main") || document.querySelector(".fixed-button");

  let grouped   = null; // { byRound: { [roundNum]: fixtures[] }, rounds: [roundNum...] }
  let roundIndex = 0;

  function leagueFolderFromKey(key) {
    const k = String(key || "").toUpperCase();
    if (k === "AFCON") return "afcon";
    if (k === "LALIGA") return "laliga";
    if (k === "BUNDESLIGA") return "bundesliga";
    return "premier";
  }
  const leagueFolder = leagueFolderFromKey(leagueKey);

  function formatDayLabel(isoString) {
    const d = new Date(isoString);
    if (isNaN(d)) return "Date TBD";
    const days   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  function renderRound() {
    if (!grouped || !grouped.rounds || !grouped.rounds.length) {
      if (matchdayTitleEl) matchdayTitleEl.textContent = ` Matches - Matchday ? of ${leagueInfo.totalRounds || "?"}`;
      if (matchesContainer) matchesContainer.innerHTML = `<p>No fixtures available.</p>`;
      return;
    }

    const roundNum = grouped.rounds[roundIndex];
    const fixtures = grouped.byRound[roundNum] || [];

    if (matchdayTitleEl) matchdayTitleEl.textContent = ` Matches - Matchday ${roundNum} of ${leagueInfo.totalRounds || "?"}`;

 

    // group by date label
    const byDate = {};
    fixtures.forEach(f => {
      const label = formatDayLabel(f.utcDate);
      (byDate[label] = byDate[label] || []).push(f);
    });

    const labels = Object.keys(byDate).sort((a, b) =>
      Date.parse(byDate[a][0].utcDate) - Date.parse(byDate[b][0].utcDate)
    );

    let html = "";
    labels.forEach(lbl => {
      const dayMatches = byDate[lbl].slice().sort((a, b) => Date.parse(a.utcDate) - Date.parse(b.utcDate));
      html += `<div class="day"><h4>${lbl}</h4>`;
      dayMatches.forEach((f, i) => {
        const kickoff = (window.FBL && window.FBL.formatKickoffLocal)
          ? window.FBL.formatKickoffLocal(f.utcDate)
          : new Date(f.utcDate).toLocaleTimeString();
        const colorClass = (i % 2 === 0) ? "blue" : "cyan";
        html += `
          <div class="match-card ${colorClass}" data-fixture="${f.id}" data-league="${leagueKey}">
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
      html += `</div>`;
    });

    matchesContainer.innerHTML = html;

    // Attach logos + SINGLE-match click
    fixtures.forEach(f => {
      const card = matchesContainer.querySelector(`.match-card[data-fixture="${f.id}"]`);
      if (!card) return;
      const homeLogoEl = card.querySelector(".home-logo");
      const awayLogoEl = card.querySelector(".away-logo");
      if (window.FBL && window.FBL.ensureLogo) {
        window.FBL.ensureLogo(f.home, homeLogoEl);
        window.FBL.ensureLogo(f.away, awayLogoEl);
      } else {
        if (homeLogoEl && f.home && f.home.logo) homeLogoEl.src = f.home.logo;
        if (awayLogoEl && f.away && f.away.logo) awayLogoEl.src = f.away.logo;
      }

      // Make each card open predictions in SINGLE mode
      card.style.cursor = "pointer";
      card.addEventListener("click", () => {
        // Persist current round & fixtures for predictions
        if (window.FBL && window.FBL.persistSelectedRound) {
          window.FBL.persistSelectedRound(leagueKey, roundNum, fixtures);
        } else {
          sessionStorage.setItem("FBL_selectedRound", JSON.stringify({ leagueKey, roundNum, fixtures }));
        }
        sessionStorage.setItem("FBL_leagueKey", leagueKey);
        sessionStorage.setItem("FBL_selectedFixture", String(f.id));
        sessionStorage.setItem("FBL_mode", "single");

        // ✅ FIX: always go to correct league folder
        window.location.href = `/${leagueFolder}/predictions.html`;
      });
    });

    // Persist current round for Bet+ (ALL mode)
    if (window.FBL && window.FBL.persistSelectedRound) {
      window.FBL.persistSelectedRound(leagueKey, roundNum, fixtures);
    } else {
      sessionStorage.setItem("FBL_selectedRound", JSON.stringify({ leagueKey, roundNum, fixtures }));
    }
    sessionStorage.setItem("FBL_leagueKey", leagueKey);
  }

  function goPrev() { if (!grouped) return; roundIndex = Math.max(0, roundIndex - 1); renderRound(); }
  function goNext() { if (!grouped) return; roundIndex = Math.min(grouped.rounds.length - 1, roundIndex + 1); renderRound(); }


  async function init() {
    let allFixtures = [];
    try {
      if (window.FBL && window.FBL.fetchFixturesForLeague) {
        allFixtures = await window.FBL.fetchFixturesForLeague(leagueKey);
      } else {
        allFixtures = (window.ALL_FIXTURES && window.ALL_FIXTURES[leagueKey]) ? window.ALL_FIXTURES[leagueKey] : [];
      }
    } catch (err) {
      console.warn("Error fetching fixtures", err);
      allFixtures = [];
    }

    // Group by round
    if (window.FBL && window.FBL.groupFixturesByRound) {
      grouped = window.FBL.groupFixturesByRound(allFixtures);
    } else {
      const byRound = {};
      const rounds  = [];
      allFixtures.forEach(f => {
        const r = f.roundNum || (f.round && Number(String(f.round).replace(/\D/g, ""))) || 1;
        if (!byRound[r]) { byRound[r] = []; rounds.push(r); }
        byRound[r].push(f);
      });
      rounds.sort((a,b) => a - b);
      grouped = { byRound, rounds };
    }

    // Pick first round with a future match
    let found = 0;
    const now = Date.now();
    for (let i = 0; i < grouped.rounds.length; i++) {
      const r = grouped.rounds[i];
      const arr = grouped.byRound[r] || [];
      if (arr.some(m => Date.parse(m.utcDate) > now)) { found = i; break; }
    }
    roundIndex = found;

    renderRound();
  }

  if (prevBtn) prevBtn.addEventListener("click", goPrev);
  if (nextBtn) nextBtn.addEventListener("click", goNext);

  if (betBtn) {
    betBtn.addEventListener("click", (e) => {
      e.preventDefault();
      // ALL matches
      sessionStorage.setItem("FBL_leagueKey", leagueKey);
      sessionStorage.removeItem("FBL_selectedFixture");
      sessionStorage.setItem("FBL_mode", "all");

      // ✅ FIX: always go to correct league folder
      window.location.href = `/${leagueFolder}/predictions.html`;
    });
  }

  init();
})();
// ==== Keep < day-number > in sync with "Matches - Matchday X of Y" ====
(function () {
  function syncDayNumberFromTitle() {
    const titleEl = document.getElementById('matchday-title');
    const dayEl   = document.getElementById('day-number');
    if (!titleEl || !dayEl) return;

    const text = titleEl.textContent || '';
    // look for "Matchday 14" in "Matches - Matchday 14 of 38"
    const m = text.match(/matchday\s+(\d+)/i);
    if (m && m[1]) {
      dayEl.textContent = m[1];   // <- put 14 between <   >
    }
  }

  function initMatchdayMirror() {
    const titleEl = document.getElementById('matchday-title');
    if (!titleEl) return;

    // 1) set it once at start
    syncDayNumberFromTitle();

    // 2) whenever your existing code changes the title,
    //    this observer updates the number automatically
    const observer = new MutationObserver(syncDayNumberFromTitle);
    observer.observe(titleEl, {
      characterData: true,
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMatchdayMirror);
  } else {
    initMatchdayMirror();
  }
})();
