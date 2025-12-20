// /scripts/resultsPage.js
(function () {
  if (window.__FBL_RESULTS_INITED__) return;
  window.__FBL_RESULTS_INITED__ = true;

  // --- ensure FBL + LEAGUE_MAP exist ---
  window.FBL = window.FBL || {};
  window.FBL.LEAGUE_MAP =
    window.FBL.LEAGUE_MAP || {
      PREMIER_LEAGUE: { name: "Premier League", totalRounds: 38 },
      BUNDESLIGA:     { name: "Bundesliga",     totalRounds: 34 },
      LALIGA:         { name: "La Liga",        totalRounds: 38 },
      AFCON:          { name: "Afcon",          totalRounds: 6 },
    };

  // ---------- ROOT ----------
  let root =
    document.getElementById("results-list") ||
    document.querySelector(".results-container") ||
    document.getElementById("results-container") ||
    document.querySelector("main");

  if (!root) {
    console.warn("resultsPage: no dedicated container found, using <body>.");
    root = document.body;
  }
  const container = root;

  // ---------- LEAGUE (from global / URL / stored) ----------
  function resolveLeagueKey() {
    // 1) explicit override from page (your AFCON results.html sets this)
    const forced = (window.FBL_RESULTS_LEAGUE_KEY || "").toUpperCase();
    if (forced && window.FBL.LEAGUE_MAP[forced]) return forced;

    // 2) detect from URL path
    const path = location.pathname.toLowerCase();
    if (path.includes("bundes")) return "BUNDESLIGA";
    if (path.includes("laliga") || path.includes("la-liga")) return "LALIGA";
    if (path.includes("afcon")) return "AFCON";
    if (path.includes("premier")) return "PREMIER_LEAGUE";

    // 3) fallback to whatever was stored last
    const stored = (sessionStorage.getItem("FBL_leagueKey") || "").toUpperCase();
    if (["PREMIER_LEAGUE", "BUNDESLIGA", "LALIGA", "AFCON"].includes(stored)) {
      return stored;
    }

    // 4) default if nothing else matches
    return "PREMIER_LEAGUE";
  }

  const leagueKey  = resolveLeagueKey();
  const leagueInfo = window.FBL.LEAGUE_MAP[leagueKey] || {
    name: leagueKey,
    totalRounds: "?",
  };

  // ---------- API BASE (for your PHP endpoints, unchanged) ----------
  const apiBase = (
    window.FBL_API_BASE ||
    (window.FBL_CFG && window.FBL_CFG.API_BASE) ||
    window.location.origin
  ).replace(/\/$/, "");
  const API_USERS = apiBase + "/api/users.php"; // (kept, even if unused)

  // ---------- UTILS ----------
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );

  // We want: "2:00pm, Sat 26th"
  function formatKickoff(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";

    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "pm" : "am";
    h = h % 12;
    if (h === 0) h = 12;

    const wdNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const wd = wdNames[d.getDay()];
    const day = d.getDate();
    const suffix =
      day === 1 || day === 21 || day === 31
        ? "st"
        : day === 2 || day === 22
        ? "nd"
        : day === 3 || day === 23
        ? "rd"
        : "th";

    return `${h}:${m}${ampm}, ${wd} ${day}${suffix}`;
  }

  function computePoints(predH, predA, finH, finA) {
    if (!Number.isFinite(finH) || !Number.isFinite(finA)) return null;
    if (!Number.isFinite(predH) || !Number.isFinite(predA)) return 0;

    if (predH === finH && predA === finA) return 3;

    const po = predH === predA ? 0 : predH > predA ? 1 : -1;
    const ro = finH === finA ? 0 : finH > finA ? 1 : -1;
    const pd = predH - predA;
    const rd = finH - finA;

    if (po === ro && pd === rd) return 2;
    if (po === ro) return 1;
    return 0;
  }

  // ---------- FIRESTORE: store points with predictions ----------
  async function syncPointsToFirestore(predictionsWithPoints) {
    // we only touch Firestore, nothing PHP here
    if (!window.firebase || !firebase.auth || !firebase.firestore) return;

    const user = firebase.auth().currentUser;
    if (!user) return;

    const uid = user.uid;
    const db = firebase.firestore();
    const batch = db.batch();

    predictionsWithPoints.forEach((p) => {
      if (p.points == null || p.fixtureId == null) return;
      const fixtureId = String(p.fixtureId);
      // doc id pattern: uid_LEAGUEKEY_fixtureId
      const docId = `${uid}_${leagueKey}_${fixtureId}`;
      const ref = db.collection("predictions").doc(docId);
      batch.set(
        ref,
        {
          points: p.points,
        },
        { merge: true }
      );
    });

    try {
      await batch.commit();
      console.log(
        "[resultsPage] synced points for",
        predictionsWithPoints.length,
        "predictions"
      );
    } catch (e) {
      console.warn("[resultsPage] failed to sync points", e);
    }
  }

  // ---------- HEADER ----------
  function ensureUserHeader(userName) {
    let info = document.querySelector(".user-info");
    if (!info) {
      info = document.createElement("div");
      info.className = "user-info";
      info.innerHTML = `
        <span class="user-name"></span>
        <span class="points">Points: <span id="total-points">0</span></span>
      `;
      if (root.parentElement) {
        root.parentElement.insertBefore(info, root);
      } else {
        document.body.insertBefore(info, root);
      }
    }
    const nameSpan =
      info.querySelector(".user-name") ||
      info.querySelector("span") ||
      info.firstElementChild;
    if (nameSpan) nameSpan.textContent = userName || "Guest";

    let totalSpan = info.querySelector("#total-points");
    if (!totalSpan) {
      totalSpan = document.createElement("span");
      totalSpan.id = "total-points";
      const wrap = info.querySelector(".points") || info;
      wrap.appendChild(totalSpan);
    }
    totalSpan.textContent = "0";
    return totalSpan;
  }

  function updateMatchdayHeader(matchdayStr) {
    const headerEl = document.querySelector(".matches-header h3");
    const dayNumSpan = document.getElementById("day-number");

    const md =
      matchdayStr != null && matchdayStr !== ""
        ? String(matchdayStr)
        : "?";

    if (headerEl) {
      headerEl.textContent = `Matches - Matchday ${md} of ${esc(
        String(leagueInfo.totalRounds || "?")
      )}`;
    }

    if (dayNumSpan) {
      if (md === "?") {
        dayNumSpan.textContent = "";
      } else {
        dayNumSpan.textContent = md;
      }
    }
  }

  // ---------- FIXTURES FOR CURRENT LEAGUE ----------
  async function fetchFixturesForCurrentLeague() {
    if (!window.FBL || typeof window.FBL.fetchFixturesForLeague !== "function") {
      console.warn("resultsPage: fetchFixturesForLeague not defined.");
      return { byId: {}, list: [] };
    }
    try {
      const all = await window.FBL.fetchFixturesForLeague(leagueKey);
      const byId = {};
      (all || []).forEach((f) => {
        // Support both top-level id and nested fixture.id
        const fid =
          f.id != null
            ? f.id
            : f.fixture && f.fixture.id != null
            ? f.fixture.id
            : null;
        if (fid != null) {
          byId[String(fid)] = f;
        }
      });
      return { byId, list: all || [] };
    } catch (e) {
      console.warn("resultsPage: fetchFixturesForLeague failed", e);
      return { byId: {}, list: [] };
    }
  }function buildCardHTML(idx, pred, fixture) {
  const homeName =
    (fixture && fixture.home && fixture.home.name) ||
    (pred.home && pred.home.name) ||
    "Home";
  const awayName =
    (fixture && fixture.away && fixture.away.name) ||
    (pred.away && pred.away.name) ||
    "Away";

  // 👉 use kickoff saved with prediction FIRST, then fixture, then timestamp
  const kickoffIso =
    pred.kickoff ||
    (fixture && fixture.utcDate) ||
    pred.timestamp ||
    "";
  const niceTime = formatKickoff(kickoffIso);

  const predHomeVal =
    pred.home && pred.home.score != null ? pred.home.score : "";
  const predAwayVal =
    pred.away && pred.away.score != null ? pred.away.score : "";

  // 🔹 Try to read real final scores from fixtures ONLY (no simulation)
  let finHome =
    fixture &&
    fixture.goals &&
    fixture.goals.home !== null &&
    fixture.goals.home !== undefined
      ? fixture.goals.home
      : "";
  let finAway =
    fixture &&
    fixture.goals &&
    fixture.goals.away !== null &&
    fixture.goals.away !== undefined
      ? fixture.goals.away
      : "";

  // ✅ If no final scores yet, show placeholders (and points will be blank)
  const finHomeForCalc = finHome === "" ? NaN : Number(finHome);
  const finAwayForCalc = finAway === "" ? NaN : Number(finAway);

  const pts = computePoints(
    Number(predHomeVal),
    Number(predAwayVal),
    finHomeForCalc,
    finAwayForCalc
  );

  const html = `
    <div class="match-card" data-fixture="${esc(String(pred.fixtureId))}">
      <div class="match-header">MATCH ${idx}</div>

      <p class="match-time">${esc(niceTime)}</p>
      <hr class="hr" />
      <div class="teams">
        <div class="team home-team">
          <img class="team-logo home-logo" alt="${esc(homeName)} logo" />
          <p>${esc(homeName)}</p>
        </div>

        <div class="score-section">
          <p class="label">Your prediction</p>
          <div class="score-box">
            <span><input type="number" value="${esc(
              predHomeVal
            )}" min="0" readonly /></span>
            <span>–</span>
            <span><input type="number" value="${esc(
              predAwayVal
            )}" min="0" readonly /></span>
          </div>

          <p class="label">Final score</p>
          <div class="score-box">
            <span><input type="number" value="${esc(
              finHome === "" ? "" : String(finHome)
            )}" min="0" readonly /></span>
            <span>–</span>
            <span><input type="number" value="${esc(
              finAway === "" ? "" : String(finAway)
            )}" min="0" readonly /></span>
          </div>
        </div>

        <div class="team away-team">
          <img class="team-logo away-logo" alt="${esc(awayName)} logo" />
          <p>${esc(awayName)}</p>
        </div>
      </div>

      <p class="points-earned">${pts === null ? "" : `Points: ${pts}`}</p>
    </div>
  `;
  return { html, pts };
}




  function attachLogos(cardEl, pred, fixture) {
    const homeLogoEl = cardEl.querySelector(".home-logo");
    const awayLogoEl = cardEl.querySelector(".away-logo");

    // AFCON: prefer logos stored with prediction/fixture (from your static groups / TSDB)
    if (leagueKey === "AFCON") {
      const homeLogo =
        (fixture &&
          fixture.home &&
          fixture.home.logo) ||
        (fixture &&
          fixture.teams &&
          fixture.teams.home &&
          fixture.teams.home.logo) ||
        (pred.home && pred.home.logo);
      const awayLogo =
        (fixture &&
          fixture.away &&
          fixture.away.logo) ||
        (fixture &&
          fixture.teams &&
          fixture.teams.away &&
          fixture.teams.away.logo) ||
        (pred.away && pred.away.logo);

      if (homeLogoEl && homeLogo) homeLogoEl.src = homeLogo;
      if (awayLogoEl && awayLogo) awayLogoEl.src = awayLogo;
    }

    // Fallback / other leagues: use global ensureLogo helper
    if (!window.FBL || typeof window.FBL.ensureLogo !== "function") return;

    const homeTeam =
      (fixture && (fixture.home || (fixture.teams && fixture.teams.home))) ||
      { id: pred.home && pred.home.id, name: pred.home && pred.home.name };
    const awayTeam =
      (fixture && (fixture.away || (fixture.teams && fixture.teams.away))) ||
      { id: pred.away && pred.away.id, name: pred.away && pred.away.name };

    if (homeLogoEl) window.FBL.ensureLogo(homeTeam, homeLogoEl);
    if (awayLogoEl) window.FBL.ensureLogo(awayTeam, awayLogoEl);
  }

  // Function to normalize the names of teams (to handle variations in name formatting)
  function normalizeName(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")  // strip accents
      .replace(/[^a-z0-9]+/g, "")       // remove any non-alphanumeric characters
      .trim();
  }

  // Function to find the AFCON fixture based on teams
  function findAfconFixture(pred, fixturesList) {
    if (!fixturesList || !fixturesList.length) return null;

    const predHome = normalizeName(pred.home && pred.home.name);
    const predAway = normalizeName(pred.away && pred.away.name);
    if (!predHome || !predAway) return null;

    // 1) same home/away
    let candidates = fixturesList.filter((f) => {
      const homeName =
        (f.home && f.home.name) ||
        (f.teams && f.teams.home && f.teams.home.name);
      const awayName =
        (f.away && f.away.name) ||
        (f.teams && f.teams.away && f.teams.away.name);

      const fh = normalizeName(homeName);
      const fa = normalizeName(awayName);
      return fh === predHome && fa === predAway;
    });

    if (!candidates.length) return null;
    if (candidates.length === 1) return candidates[0];

    // 2) if more than one, pick closest by date to kickoff
    const target = Date.parse(pred.kickoff || pred.timestamp || 0);
    if (!Number.isFinite(target)) return candidates[0];

    let best = candidates[0];
    let bestDiff = Infinity;

    candidates.forEach((f) => {
      const t = Date.parse(
        f.utcDate ||
          (f.fixture && f.fixture.date) ||
          f.timestamp ||
          0
      );
      if (!Number.isFinite(t)) return;
      const diff = Math.abs(t - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = f;
      }
    });

    return best;
  }

  // ---------- MAIN ----------
  async function renderResultsPage() {
    // auth is ready here (boot calls after onAuthStateChanged)
    const user = firebase.auth().currentUser;

    const displayName =
      (user &&
        (user.displayName ||
          (user.email ? user.email.split("@")[0] : ""))) ||
      "Guest";

    const totalSpan = ensureUserHeader(displayName);

    // get fixtures for THIS league (TSDB for AFCON)
    const { byId: fixturesById, list: fixturesList } =
      await fetchFixturesForCurrentLeague();

    // load predictions for THIS league
    let preds = [];
    try {
      if (
        window.FBL_STORE &&
        typeof window.FBL_STORE.loadPredictionsForLeague === "function"
      ) {
        preds = await window.FBL_STORE.loadPredictionsForLeague(leagueKey);
      } else {
        // fallback (in case store file isn't loaded on results page)
        const uid = user && user.uid;
        if (uid && firebase.firestore) {
          const snap = await firebase
            .firestore()
            .collection("predictions")
            .where("uid", "==", uid)
            .where("league", "==", leagueKey)
            .get();

          snap.forEach((doc) => preds.push(doc.data()));
        }
      }
    } catch (e) {
      console.warn("resultsPage: failed to load predictions", e);
      preds = [];
    }

    // safety filter by league
    preds = (preds || []).filter((p) => {
      const l = String(p.league || p.leagueKey || "").toUpperCase();
      return l === leagueKey;
    });

    // ❌ Hide predictions made AFTER kickoff, but keep them in Firestore
    preds = preds.filter((p) => {
      let fixture = fixturesById[String(p.fixtureId)] || null;
      if (!fixture && leagueKey === "AFCON") {
        fixture = findAfconFixture(p, fixturesList);
      }

      const kickoffIso =
        p.kickoff ||
        (fixture && fixture.utcDate) ||
        (fixture && fixture.fixture && fixture.fixture.date) ||
        p.timestamp ||
        "";
      const ko = Date.parse(kickoffIso);
      const predTime = Date.parse(p.timestamp || "");

      // if we can't parse, keep it (don't be too aggressive)
      if (!Number.isFinite(ko) || !Number.isFinite(predTime)) return true;

      // only display predictions done ON or BEFORE kickoff
      return predTime <= ko;
    });

    // ✅ Sort newest predictions first (today's at the top)
    preds.sort(
      (a, b) =>
        new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    );

    if (!preds.length) {
      container.innerHTML = `<p style="padding:12px;">No predictions for ${esc(
        leagueInfo.name
      )} yet.</p>`;
      if (totalSpan) totalSpan.textContent = "0";
      updateMatchdayHeader("?");
      return;
    }

    // one single matchday title (use newest matchday)
    const maxMd = preds.reduce((m, p) => {
      const md = parseInt(p.matchday, 10);
      return Number.isFinite(md) ? Math.max(m, md) : m;
    }, 0);
    updateMatchdayHeader(maxMd || "?");

    // render ONLY matches you predicted
    let totalPts = 0;
    const predictionsWithPoints = [];

    const cardsHtml = preds
      .map((pred, i) => {
        // 1) normal join by fixtureId
        let fixture = fixturesById[String(pred.fixtureId)] || null;

        // 2) AFCON: if no direct match, try fuzzy by team names using TSDB data
        if (!fixture && leagueKey === "AFCON") {
          fixture = findAfconFixture(pred, fixturesList);
        }

        const { html, pts } = buildCardHTML(i + 1, pred, fixture);
        if (pts != null) {
          totalPts += pts;
          predictionsWithPoints.push({
            fixtureId: pred.fixtureId,
            points: pts,
          });
        }
        return html;
      })
      .join("");

    container.innerHTML =
      cardsHtml || `<p style="padding:12px;">No results yet.</p>`;

    // attach logos after DOM is filled
    preds.forEach((pred) => {
      const sel = `.match-card[data-fixture="${CSS.escape(
        String(pred.fixtureId)
      )}"]`;
      const cardEl = container.querySelector(sel);
      if (!cardEl) return;

      let fixture = fixturesById[String(pred.fixtureId)] || null;
      if (!fixture && leagueKey === "AFCON") {
        fixture = findAfconFixture(pred, fixturesList);
      }

      attachLogos(cardEl, pred, fixture);
    });

    // total points header
    if (totalSpan) totalSpan.textContent = String(totalPts);

    // 🔁 Store points on each prediction in Firestore for Winners page
    if (predictionsWithPoints.length) {
      syncPointsToFirestore(predictionsWithPoints);
    }
  }

  // expose for other scripts if needed
  window.renderResultsPage = renderResultsPage;

  // --- AUTH GATE BOOT ---
  (function bootResultsWithAuth() {
    if (!window.firebase || !firebase.auth) {
      console.error("[Results] firebase not found. Check script order.");
      return;
    }

    firebase.auth().onAuthStateChanged((user) => {
      if (!user) {
        console.warn("[Results] no user, redirecting to signup...");
        window.location.href =
          "../signup.html?next=" + encodeURIComponent(location.pathname);
        return;
      }
      renderResultsPage();
    });
  })();
})();
