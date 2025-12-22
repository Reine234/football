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

  // ---------- I18N HELPERS ----------
  function getLangSafe() {
    try {
      return (window.FBL_I18N && window.FBL_I18N.getLang && window.FBL_I18N.getLang()) || "en";
    } catch (_) {
      return "en";
    }
  }

  function tr(key, vars) {
    try {
      const i18n = window.FBL_I18N;
      const lang = getLangSafe();
      if (i18n && typeof i18n.t === "function") return i18n.t(lang, key, vars);
    } catch (_) {}
    // fallback: show the key if missing (so you SEE missing keys)
    if (vars && typeof vars === "object") {
      let s = key;
      Object.keys(vars).forEach((k) => (s = s.replaceAll(`{${k}}`, String(vars[k]))));
      return s;
    }
    return key;
  }

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
    const forced = (window.FBL_RESULTS_LEAGUE_KEY || "").toUpperCase();
    if (forced && window.FBL.LEAGUE_MAP[forced]) return forced;

    const path = location.pathname.toLowerCase();
    if (path.includes("bundes")) return "BUNDESLIGA";
    if (path.includes("laliga") || path.includes("la-liga")) return "LALIGA";
    if (path.includes("afcon")) return "AFCON";
    if (path.includes("premier")) return "PREMIER_LEAGUE";

    const stored = (sessionStorage.getItem("FBL_leagueKey") || "").toUpperCase();
    if (["PREMIER_LEAGUE", "BUNDESLIGA", "LALIGA", "AFCON"].includes(stored)) {
      return stored;
    }
    return "PREMIER_LEAGUE";
  }

  const leagueKey  = resolveLeagueKey();
  const leagueInfo = window.FBL.LEAGUE_MAP[leagueKey] || {
    name: leagueKey,
    totalRounds: "?",
  };

  // ---------- API BASE ----------
  const apiBase = (
    window.FBL_API_BASE ||
    (window.FBL_CFG && window.FBL_CFG.API_BASE) ||
    window.location.origin
  ).replace(/\/$/, "");
  const API_USERS = apiBase + "/api/users.php"; // kept (even if unused)

  // ---------- UTILS ----------
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );

  function formatKickoff(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";

    const lang = getLangSafe();
    try {
      // short + readable, localized
      return new Intl.DateTimeFormat(lang, {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    } catch (_) {
      return d.toLocaleString();
    }
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

  async function syncPointsToFirestore(predictionsWithPoints) {
    if (!window.firebase || !firebase.auth || !firebase.firestore) return;

    const user = firebase.auth().currentUser;
    if (!user) return;

    const uid = user.uid;
    const db = firebase.firestore();
    const batch = db.batch();

    predictionsWithPoints.forEach((p) => {
      if (p.points == null || p.fixtureId == null) return;
      const fixtureId = String(p.fixtureId);
      // NOTE: keep your original docId logic, don't change storage scheme here
      const docId = `${uid}_${leagueKey}_${fixtureId}`;
      const ref = db.collection("predictions").doc(docId);
      batch.set(ref, { points: p.points }, { merge: true });
    });

    try {
      await batch.commit();
      console.log("[resultsPage] synced points for", predictionsWithPoints.length, "predictions");
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
        <span class="points"><span class="points-label"></span> <span id="total-points">0</span></span>
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

    if (nameSpan) nameSpan.textContent = userName || tr("results.guest");

    const labelEl = info.querySelector(".points-label");
    if (labelEl) labelEl.textContent = tr("results.pointsLabel");

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

    const md = matchdayStr != null && matchdayStr !== "" ? String(matchdayStr) : "?";
    const total = String(leagueInfo.totalRounds || "?");

    if (headerEl) {
      // "Matches - Matchday {n} of {total}"
      headerEl.textContent =
        `${tr("common.matches")} - ` +
        tr("predictions.matchdayOf", { n: md, total: total });
    }

    if (dayNumSpan) dayNumSpan.textContent = md === "?" ? "" : md;
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
        const fid =
          f.id != null
            ? f.id
            : f.fixture && f.fixture.id != null
            ? f.fixture.id
            : null;
        if (fid != null) byId[String(fid)] = f;
      });
      return { byId, list: all || [] };
    } catch (e) {
      console.warn("resultsPage: fetchFixturesForLeague failed", e);
      return { byId: {}, list: [] };
    }
  }

  function buildCardHTML(idx, pred, fixture) {
    const homeName =
      (fixture && fixture.home && fixture.home.name) ||
      (pred.home && pred.home.name) ||
      "Home";
    const awayName =
      (fixture && fixture.away && fixture.away.name) ||
      (pred.away && pred.away.name) ||
      "Away";

    const kickoffIso =
      pred.kickoff ||
      (fixture && fixture.utcDate) ||
      (fixture && fixture.fixture && fixture.fixture.date) ||
      pred.timestamp ||
      "";

    const niceTime = formatKickoff(kickoffIso);

    const predHomeVal = pred.home && pred.home.score != null ? pred.home.score : "";
    const predAwayVal = pred.away && pred.away.score != null ? pred.away.score : "";

    let finHome =
      fixture && fixture.goals && fixture.goals.home !== null && fixture.goals.home !== undefined
        ? fixture.goals.home
        : "";
    let finAway =
      fixture && fixture.goals && fixture.goals.away !== null && fixture.goals.away !== undefined
        ? fixture.goals.away
        : "";

    const finHomeForCalc = finHome === "" ? NaN : Number(finHome);
    const finAwayForCalc = finAway === "" ? NaN : Number(finAway);

    const pts = computePoints(
      Number(predHomeVal),
      Number(predAwayVal),
      finHomeForCalc,
      finAwayForCalc
    );

    const html = `
      <h4 class="match-card-kickoff" style="margin:10px 12px 6px; font-size:14px; font-weight:700;">
        ${esc(niceTime || "")}
      </h4>

      <div class="match-card" data-fixture="${esc(String(pred.fixtureId))}">
        <div class="match-header">${esc(tr("results.match"))} ${idx}</div>

        <hr class="hr" />
        <div class="teams">
          <div class="team home-team">
            <img class="team-logo home-logo" alt="${esc(homeName)} logo" />
            <p>${esc(homeName)}</p>
          </div>

          <div class="score-section">
            <p class="label">${esc(tr("results.yourPrediction"))}</p>
            <div class="score-box">
              <span><input type="number" value="${esc(predHomeVal)}" min="0" readonly /></span>
              <span>–</span>
              <span><input type="number" value="${esc(predAwayVal)}" min="0" readonly /></span>
            </div>

            <p class="label">${esc(tr("results.finalScore"))}</p>
            <div class="score-box">
              <span><input type="number" value="${esc(finHome === "" ? "" : String(finHome))}" min="0" readonly /></span>
              <span>–</span>
              <span><input type="number" value="${esc(finAway === "" ? "" : String(finAway))}" min="0" readonly /></span>
            </div>
          </div>

          <div class="team away-team">
            <img class="team-logo away-logo" alt="${esc(awayName)} logo" />
            <p>${esc(awayName)}</p>
          </div>
        </div>

        <p class="points-earned">${pts === null ? "" : `${esc(tr("results.pointsLabel"))} ${pts}`}</p>
      </div>
    `;
    return { html, pts };
  }

  function attachLogos(cardEl, pred, fixture) {
    const homeLogoEl = cardEl.querySelector(".home-logo");
    const awayLogoEl = cardEl.querySelector(".away-logo");

    // AFCON: prefer logos stored with prediction/fixture
    if (leagueKey === "AFCON") {
      const homeLogo =
        (fixture && fixture.home && fixture.home.logo) ||
        (fixture && fixture.teams && fixture.teams.home && fixture.teams.home.logo) ||
        (pred.home && pred.home.logo);
      const awayLogo =
        (fixture && fixture.away && fixture.away.logo) ||
        (fixture && fixture.teams && fixture.teams.away && fixture.teams.away.logo) ||
        (pred.away && pred.away.logo);

      if (homeLogoEl && homeLogo) homeLogoEl.src = homeLogo;
      if (awayLogoEl && awayLogo) awayLogoEl.src = awayLogo;
    }

    // fallback for other leagues (and also helps if AFCON missing logos)
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

  function normalizeName(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  function findAfconFixture(pred, fixturesList) {
    if (!fixturesList || !fixturesList.length) return null;

    const predHome = normalizeName(pred.home && pred.home.name);
    const predAway = normalizeName(pred.away && pred.away.name);
    if (!predHome || !predAway) return null;

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

    const target = Date.parse(pred.kickoff || pred.timestamp || 0);
    if (!Number.isFinite(target)) return candidates[0];

    let best = candidates[0];
    let bestDiff = Infinity;

    candidates.forEach((f) => {
      const t = Date.parse(f.utcDate || (f.fixture && f.fixture.date) || f.timestamp || 0);
      if (!Number.isFinite(t)) return;
      const diff = Math.abs(t - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = f;
      }
    });

    return best;
  }

  // ✅ AFCON final score fetcher
  async function fetchAfconFinalScore(home, away, dateYMD) {
    try {
      if (!home || !away || !dateYMD) return null;
      const url =
        `/afcon/finalScore?home=${encodeURIComponent(home)}` +
        `&away=${encodeURIComponent(away)}` +
        `&date=${encodeURIComponent(dateYMD)}`;

      const r = await fetch(url, { credentials: "same-origin" });
      if (!r.ok) return null;

      const data = await r.json();
      if (!data || !data.found) return null;
      return data;
    } catch (_e) {
      return null;
    }
  }

  async function hydrateAfconFinalScores(preds, fixturesById, fixturesList) {
    if (leagueKey !== "AFCON") return;

    const seen = new Set();

    for (const p of preds || []) {
      let fx = fixturesById[String(p.fixtureId)] || null;
      if (!fx) fx = findAfconFixture(p, fixturesList);
      if (!fx) continue;

      const homeName =
        (fx.home && fx.home.name) ||
        (fx.teams && fx.teams.home && fx.teams.home.name) ||
        (p.home && p.home.name) ||
        "";
      const awayName =
        (fx.away && fx.away.name) ||
        (fx.teams && fx.teams.away && fx.teams.away.name) ||
        (p.away && p.away.name) ||
        "";

      const kickoffIso =
        p.kickoff ||
        fx.utcDate ||
        (fx.fixture && fx.fixture.date) ||
        p.timestamp ||
        "";
      const dateYMD = kickoffIso ? String(kickoffIso).slice(0, 10) : "";

      if (!homeName || !awayName || !dateYMD) continue;

      const key = normalizeName(homeName) + "|" + normalizeName(awayName) + "|" + dateYMD;
      if (seen.has(key)) continue;
      seen.add(key);

      if (
        fx.goals &&
        fx.goals.home !== null &&
        fx.goals.home !== undefined &&
        fx.goals.away !== null &&
        fx.goals.away !== undefined
      ) {
        continue;
      }

      const score = await fetchAfconFinalScore(homeName, awayName, dateYMD);
      if (!score) continue;

      fx.goals = { home: Number(score.homeScore), away: Number(score.awayScore) };
      fx.status = { short: "FT", long: score.status || "Match Finished" };
    }
  }

  // keep ONLY the FIRST (earliest) prediction per fixture
  function dedupeFirstPredictionPerFixture(preds) {
    const byFixture = new Map(); // fixtureId -> pred
    (preds || []).forEach((p) => {
      const fid = p && p.fixtureId != null ? String(p.fixtureId) : "";
      if (!fid) return;

      const ts = Date.parse(p.timestamp || "");
      const cur = byFixture.get(fid);

      if (!cur) {
        byFixture.set(fid, p);
        return;
      }

      const curTs = Date.parse(cur.timestamp || "");
      if (Number.isFinite(ts) && Number.isFinite(curTs)) {
        if (ts < curTs) byFixture.set(fid, p);
      } else if (Number.isFinite(ts) && !Number.isFinite(curTs)) {
        byFixture.set(fid, p);
      }
    });

    return Array.from(byFixture.values());
  }

  // ✅ hide predictions made after kickoff
  function filterPredictionsAfterKickoff(preds, fixturesById, fixturesList) {
    return (preds || []).filter((p) => {
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

      // if we can't parse, keep it (avoid deleting legit stuff)
      if (!Number.isFinite(ko) || !Number.isFinite(predTime)) return true;

      // keep only predictions ON or BEFORE kickoff
      return predTime <= ko;
    });
  }

  // ---------- MAIN ----------
  async function renderResultsPage() {
    const user = firebase.auth().currentUser;

    const displayName =
      (user &&
        (user.displayName ||
          (user.email ? user.email.split("@")[0] : ""))) ||
      tr("results.guest");

    const totalSpan = ensureUserHeader(displayName);

    const { byId: fixturesById, list: fixturesList } =
      await fetchFixturesForCurrentLeague();

    let preds = [];
    try {
      if (
        window.FBL_STORE &&
        typeof window.FBL_STORE.loadPredictionsForLeague === "function"
      ) {
        preds = await window.FBL_STORE.loadPredictionsForLeague(leagueKey);
      } else {
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

    // ✅ DO NOT DISPLAY late predictions
    preds = filterPredictionsAfterKickoff(preds, fixturesById, fixturesList);

    // ✅ Deduplicate: only first prediction per match (fixtureId)
    preds = dedupeFirstPredictionPerFixture(preds);

    // ✅ Sort newest → oldest
    preds.sort(
      (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    );

    if (!preds.length) {
      container.innerHTML = `<p style="padding:12px;">${esc(
        tr("results.noPredictions", { league: leagueInfo.name })
      )}</p>`;
      if (totalSpan) totalSpan.textContent = "0";
      updateMatchdayHeader("?");
      return;
    }

    // AFCON: hydrate final scores before rendering
    await hydrateAfconFinalScores(preds, fixturesById, fixturesList);

    const maxMd = preds.reduce((m, p) => {
      const md = parseInt(p.matchday, 10);
      return Number.isFinite(md) ? Math.max(m, md) : m;
    }, 0);
    updateMatchdayHeader(maxMd || "?");

    let totalPts = 0;
    const predictionsWithPoints = [];

    const cardsHtml = preds
      .map((pred, i) => {
        let fixture = fixturesById[String(pred.fixtureId)] || null;
        if (!fixture && leagueKey === "AFCON") {
          fixture = findAfconFixture(pred, fixturesList);
        }

        const { html, pts } = buildCardHTML(i + 1, pred, fixture);
        if (pts != null) {
          totalPts += pts;
          predictionsWithPoints.push({ fixtureId: pred.fixtureId, points: pts });
        }
        return html;
      })
      .join("");

    container.innerHTML = cardsHtml || `<p style="padding:12px;">${esc(tr("results.noResultsYet"))}</p>`;

    // attach logos AFTER DOM is filled
    preds.forEach((pred) => {
      const sel = `.match-card[data-fixture="${CSS.escape(String(pred.fixtureId))}"]`;
      const cardEl = container.querySelector(sel);
      if (!cardEl) return;

      let fixture = fixturesById[String(pred.fixtureId)] || null;
      if (!fixture && leagueKey === "AFCON") {
        fixture = findAfconFixture(pred, fixturesList);
      }

      attachLogos(cardEl, pred, fixture);
    });

    if (totalSpan) totalSpan.textContent = String(totalPts);

    if (predictionsWithPoints.length) {
      syncPointsToFirestore(predictionsWithPoints);
    }
  }

  window.renderResultsPage = renderResultsPage;

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
