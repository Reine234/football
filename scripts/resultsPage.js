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
  const API_USERS = apiBase + "/api/users.php";

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

  // ---------- NORMALIZE / MATCH FOR AFCON (to join TSDB fixtures) ----------
  function normalizeName(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip accents
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  function findAfconFixture(pred, fixturesList) {
    if (!fixturesList || !fixturesList.length) return null;

    const predHome = normalizeName(pred.home && pred.home.name);
    const predAway = normalizeName(pred.away && pred.away.name);
    if (!predHome || !predAway) return null;

    // 1) same home/away
    let candidates = fixturesList.filter((f) => {
      const fh = normalizeName(f.home && f.home.name);
      const fa = normalizeName(f.away && f.away.name);
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
      const t = Date.parse(f.utcDate || f.timestamp || 0);
      if (!Number.isFinite(t)) return;
      const diff = Math.abs(t - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = f;
      }
    });

    return best;
  }

  // ---------- BACKEND HELPERS ----------
  async function getSessionUser() {
    try {
      const r = await fetch(API_USERS + "?action=session", {
        credentials: "include",
      });
      const j = await r.json();
      if (j && j.success && j.user) {
        sessionStorage.setItem("fbl_current_user", JSON.stringify(j.user));
        return j.user;
      }
    } catch (e) {
      console.warn("resultsPage: session lookup failed:", e);
    }
    return null;
  }

  async function loadAllMyPredictions() {
    try {
      const res = await fetch(API_USERS + "?action=get_my_predictions", {
        credentials: "include",
      });
      const j = await res.json();
      if (!j || !j.success) return [];
      return j.predictions || [];
    } catch (e) {
      console.warn("resultsPage: get_my_predictions failed", e);
      return [];
    }
  }

  // 👉 now returns both: { byId, list } so AFCON can fuzzy-join
  async function fetchFixturesForCurrentLeague() {
    if (!window.FBL || typeof window.FBL.fetchFixturesForLeague !== "function") {
      return { byId: {}, list: [] };
    }
    try {
      const all = await window.FBL.fetchFixturesForLeague(leagueKey); // TSDB for AFCON
      const byId = {};
      (all || []).forEach((f) => {
        byId[String(f.id)] = f;
      });
      return { byId, list: all || [] };
    } catch (e) {
      console.warn("resultsPage: fetchFixturesForLeague failed", e);
      return { byId: {}, list: [] };
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

  // ---------- CARD RENDER ----------
  function buildCardHTML(idx, pred, fixture) {
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

    const finHome =
      fixture &&
      fixture.goals &&
      fixture.goals.home !== null &&
      fixture.goals.home !== undefined
        ? fixture.goals.home
        : "";
    const finAway =
      fixture &&
      fixture.goals &&
      fixture.goals.away !== null &&
      fixture.goals.away !== undefined
        ? fixture.goals.away
        : "";

    const pts = computePoints(
      Number(predHomeVal),
      Number(predAwayVal),
      finHome === "" ? NaN : Number(finHome),
      finAway === "" ? NaN : Number(finAway)
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

    // AFCON: prefer logos stored with prediction/fixture (from your static groups)
    if (leagueKey === "AFCON") {
      const homeLogo =
        (fixture && fixture.home && fixture.home.logo) ||
        (pred.home && pred.home.logo);
      const awayLogo =
        (fixture && fixture.away && fixture.away.logo) ||
        (pred.away && pred.away.logo);

      if (homeLogoEl && homeLogo) homeLogoEl.src = homeLogo;
      if (awayLogoEl && awayLogo) awayLogoEl.src = awayLogo;
    }

    // Fallback / other leagues: use global ensureLogo helper
    if (!window.FBL || typeof window.FBL.ensureLogo !== "function") return;

    const homeTeam =
      (fixture && fixture.home) ||
      { id: pred.home && pred.home.id, name: pred.home && pred.home.name };
    const awayTeam =
      (fixture && fixture.away) ||
      { id: pred.away && pred.away.id, name: pred.away && pred.away.name };

    if (homeLogoEl) window.FBL.ensureLogo(homeTeam, homeLogoEl);
    if (awayLogoEl) window.FBL.ensureLogo(awayTeam, awayLogoEl);
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
          preds.sort(
            (a, b) =>
              new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
          );
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
    const cardsHtml = preds
      .map((pred, i) => {
        // 1) normal join by fixtureId
        let fixture = fixturesById[String(pred.fixtureId)] || null;

        // 2) AFCON: if no direct match, try fuzzy by team names using TSDB data
        if (!fixture && leagueKey === "AFCON") {
          fixture = findAfconFixture(pred, fixturesList);
        }

        const { html, pts } = buildCardHTML(i + 1, pred, fixture);
        if (pts != null) totalPts += pts;
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
