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

  // --- TEAM I18N HELPERS (AFCON) ---
  function fblTeamI18nKey(name) {
    const n = String(name || "").trim().toLowerCase();
    const norm = n.replace(/’/g, "'").replace(/\s+/g, " ");

    const map = {
      "morocco": "team.afcon.morocco",
      "comoros": "team.afcon.comoros",
      "mali": "team.afcon.mali",
      "zambia": "team.afcon.zambia",

      "egypt": "team.afcon.egypt",
      "zimbabwe": "team.afcon.zimbabwe",
      "south africa": "team.afcon.southafrica",
      "angola": "team.afcon.angola",

      "nigeria": "team.afcon.nigeria",
      "tanzania": "team.afcon.tanzania",
      "tunisia": "team.afcon.tunisia",
      "uganda": "team.afcon.uganda",

      "senegal": "team.afcon.senegal",
      "botswana": "team.afcon.botswana",
      "dr congo": "team.afcon.drcongo",
      "d.r. congo": "team.afcon.drcongo",
      "congo dr": "team.afcon.drcongo",
      "benin": "team.afcon.benin",

      "algeria": "team.afcon.algeria",
      "sudan": "team.afcon.sudan",
      "burkina faso": "team.afcon.burkinafaso",
      "equatorial guinea": "team.afcon.equatorialguinea",

      "cameroon": "team.afcon.cameroon",
      "gabon": "team.afcon.gabon",
      "mozambique": "team.afcon.mozambique",
      "côte d’ivoire": "team.afcon.cotedivoire",
      "côte d'ivoire": "team.afcon.cotedivoire",
      "cote d'ivoire": "team.afcon.cotedivoire",
      "cote d’ivoire": "team.afcon.cotedivoire",
    };

    return map[norm] || map[norm.replace(/[^\w\s']/g, "")] || null;
  }

  function makeTeamNameNode(name) {
    const span = document.createElement("span");
    const key = fblTeamI18nKey(name);
    if (key) span.setAttribute("data-i18n", key);
    span.textContent = name || "";
    return span;
  }

  function reapplyI18n() {
    if (window.FBL_I18N && typeof window.FBL_I18N.applyLang === "function") {
      window.FBL_I18N.applyLang(window.FBL_I18N.getLang());
    }
  }

  // ---------- I18N HELPERS ----------
  function getLangSafe() {
    try {
      return (window.FBL_I18N && window.FBL_I18N.getLang && window.FBL_I18N.getLang()) || "en";
    } catch (_) {
      return "en";
    }
  }

  // ✅ ONLY CHANGE: robust fallback for matchdayTitle + header strings
  function tr(key, vars) {
    try {
      const i18n = window.FBL_I18N;
      const lang = getLangSafe();
      if (i18n && typeof i18n.t === "function") {
        const out = i18n.t(lang, key, vars);
        if (out && out !== key) return out;
      }
    } catch (_) {}

    const lang = String(getLangSafe() || "en").toLowerCase();
    const isFr = lang.startsWith("fr");

    const FALLBACK = {
      "results.matchdayTitle": isFr ? "Journée" : "Matchday",

      "common.matches": isFr ? "Matchs" : "Matches",
      "predictions.matchdayOf": isFr ? "Journée {n} sur {total}" : "Matchday {n} of {total}",
      "results.guest": isFr ? "Invité" : "Guest",
      "results.pointsLabel": "Points",
      "results.match": isFr ? "Match" : "Match",
      "results.yourPrediction": isFr ? "Votre pronostic" : "Your prediction",
      "results.finalScore": isFr ? "Score final" : "Final score",
      "results.noResultsYet": isFr ? "Aucun résultat pour le moment." : "No results yet.",
      "results.noPredictions": isFr ? "Aucun pronostic pour {league}." : "No predictions for {league}.",
    };

    let s = FALLBACK[key] || key;

    if (vars && typeof vars === "object") {
      Object.keys(vars).forEach((k) => {
        s = String(s).replaceAll(`{${k}}`, String(vars[k]));
      });
    }

    return s;
  }

  function fixMatchdayTitleNode() {
    const el =
      document.querySelector('[data-i18n="results.matchdayTitle"]') ||
      document.getElementById("matchday-title") ||
      document.querySelector(".matchday-title");

    if (!el) return false;

    const cur = String(el.textContent || "").trim();
    if (cur === "results.matchdayTitle" || cur === "") {
      el.textContent = tr("results.matchdayTitle");
      return true;
    }

    return false;
  }

  function retryFixMatchdayTitle() {
    let tries = 0;
    const max = 12;
    const timer = setInterval(() => {
      tries += 1;
      try { reapplyI18n(); } catch (_) {}
      fixMatchdayTitleNode();
      if (tries >= max) clearInterval(timer);
    }, 250);
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
  const API_USERS = apiBase + "/api/users.php";

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
      headerEl.textContent =
        `${tr("common.matches")} - ` +
        tr("predictions.matchdayOf", { n: md, total: total });
    }

    if (dayNumSpan) dayNumSpan.textContent = md === "?" ? "" : md;
    fixMatchdayTitleNode();
  }

  function getFixtureIdCandidates(f) {
    const ids = [];
    if (f == null) return ids;

    if (f.id != null) ids.push(String(f.id));
    if (f.fixtureId != null) ids.push(String(f.fixtureId));
    if (f.fixture && f.fixture.id != null) ids.push(String(f.fixture.id));
    if (f.fixture && f.fixture.fixture_id != null) ids.push(String(f.fixture.fixture_id));

    return Array.from(new Set(ids.filter(Boolean)));
  }

  function getKickoffIsoFromFixture(f) {
    return (
      (f && (f.utcDate || f.date)) ||
      (f && f.fixture && f.fixture.date) ||
      (f && f.kickoff) ||
      (f && f.timestamp) ||
      ""
    );
  }

  function getTeamNameFromFixture(f, side) {
    if (!f) return "";
    return (
      (f[side] && f[side].name) ||
      (f.teams && f.teams[side] && f.teams[side].name) ||
      (f.team && f.team[side] && f.team[side].name) ||
      ""
    );
  }

  function getTeamLogoFromFixture(f, side) {
    if (!f) return "";
    return (
      (f[side] && f[side].logo) ||
      (f.teams && f.teams[side] && f.teams[side].logo) ||
      ""
    );
  }

  function isFixtureFinished(f) {
    const short =
      (f && f.fixture && f.fixture.status && f.fixture.status.short) ||
      (f && f.status && f.status.short) ||
      "";

    const long =
      (f && f.fixture && f.fixture.status && f.fixture.status.long) ||
      (f && f.status && f.status.long) ||
      "";

    const s = String(short || "").toUpperCase().trim();
    const l = String(long || "").toUpperCase().trim();

    if (s === "FT" || s === "AET" || s === "PEN") return true;
    if (s === "NS" || s === "TBD" || s === "PST" || s === "CANC" || s === "SUSP" || s === "INT") return false;

    if (l.includes("FINISHED") || l.includes("MATCH FINISHED")) return true;

    return false;
  }

  function getFinalGoalsFromFixture(f) {
    if (!f) return { home: "", away: "" };

    if (!isFixtureFinished(f)) {
      return { home: "", away: "" };
    }

    if (f.goals && f.goals.home != null && f.goals.away != null) {
      return { home: f.goals.home, away: f.goals.away };
    }

    if (
      f.score &&
      f.score.fulltime &&
      f.score.fulltime.home != null &&
      f.score.fulltime.away != null
    ) {
      return { home: f.score.fulltime.home, away: f.score.fulltime.away };
    }

    if (
      f.fixture &&
      f.fixture.goals &&
      f.fixture.goals.home != null &&
      f.fixture.goals.away != null
    ) {
      return { home: f.fixture.goals.home, away: f.fixture.goals.away };
    }

    return { home: "", away: "" };
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
        getFixtureIdCandidates(f).forEach((id) => {
          byId[String(id)] = f;
        });
      });
      return { byId, list: all || [] };
    } catch (e) {
      console.warn("resultsPage: fetchFixturesForLeague failed", e);
      return { byId: {}, list: [] };
    }
  }

  function buildCardHTML(idx, pred, fixture) {
    const homeName =
      getTeamNameFromFixture(fixture, "home") ||
      (pred.home && pred.home.name) ||
      "Home";
    const awayName =
      getTeamNameFromFixture(fixture, "away") ||
      (pred.away && pred.away.name) ||
      "Away";

    const kickoffIso =
      pred.kickoff ||
      getKickoffIsoFromFixture(fixture) ||
      pred.timestamp ||
      "";

    const niceTime = formatKickoff(kickoffIso);

    const predHomeVal = pred.home && pred.home.score != null ? pred.home.score : "";
    const predAwayVal = pred.away && pred.away.score != null ? pred.away.score : "";

    const finalGoals = getFinalGoalsFromFixture(fixture);
    let finHome = finalGoals.home !== "" && finalGoals.home != null ? finalGoals.home : "";
    let finAway = finalGoals.away !== "" && finalGoals.away != null ? finalGoals.away : "";

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

    if (leagueKey === "AFCON") {
      const homeLogo =
        getTeamLogoFromFixture(fixture, "home") ||
        (pred.home && pred.home.logo);
      const awayLogo =
        getTeamLogoFromFixture(fixture, "away") ||
        (pred.away && pred.away.logo);

      if (homeLogoEl && homeLogo) homeLogoEl.src = homeLogo;
      if (awayLogoEl && awayLogo) awayLogoEl.src = awayLogo;
    }

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
      const homeName = getTeamNameFromFixture(f, "home");
      const awayName = getTeamNameFromFixture(f, "away");
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
      const t = Date.parse(getKickoffIsoFromFixture(f) || 0);
      if (!Number.isFinite(t)) return;
      const diff = Math.abs(t - target);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = f;
      }
    });

    return best;
  }

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

  // ✅ MINIMAL FIX: only treat /afcon/finalScore response as FINAL if status says finished
  function isAfconScoreFinal(score) {
    if (!score) return false;

    // be conservative: if no status, do NOT inject goals
    const raw = String(score.status || score.statusText || score.state || "").trim();
    if (!raw) return false;

    const s = raw.toUpperCase();

    // finished markers
    if (s === "FT" || s === "AET" || s === "PEN") return true;
    if (s.includes("FINISHED") || s.includes("MATCH FINISHED") || s.includes("FULL TIME")) return true;

    // clearly not finished markers
    if (s.includes("NOT STARTED") || s === "NS" || s.includes("SCHEDULED") || s.includes("TIMED") || s.includes("POSTPON")) return false;

    // default conservative
    return false;
  }

  async function hydrateAfconFinalScores(preds, fixturesById, fixturesList) {
    if (leagueKey !== "AFCON") return;

    const seen = new Set();

    for (const p of preds || []) {
      let fx = fixturesById[String(p.fixtureId)] || null;
      if (!fx && p.fixture && p.fixture.id != null) fx = fixturesById[String(p.fixture.id)] || null;
      if (!fx && p.apiFixtureId != null) fx = fixturesById[String(p.apiFixtureId)] || null;

      if (!fx) fx = findAfconFixture(p, fixturesList);
      if (!fx) continue;

      const homeName = getTeamNameFromFixture(fx, "home") || (p.home && p.home.name) || "";
      const awayName = getTeamNameFromFixture(fx, "away") || (p.away && p.away.name) || "";

      const kickoffIso =
        p.kickoff ||
        getKickoffIsoFromFixture(fx) ||
        p.timestamp ||
        "";
      const dateYMD = kickoffIso ? String(kickoffIso).slice(0, 10) : "";

      if (!homeName || !awayName || !dateYMD) continue;

      const key = normalizeName(homeName) + "|" + normalizeName(awayName) + "|" + dateYMD;
      if (seen.has(key)) continue;
      seen.add(key);

      const finalGoals = getFinalGoalsFromFixture(fx);
      if (finalGoals.home !== "" && finalGoals.away !== "") continue;

      const score = await fetchAfconFinalScore(homeName, awayName, dateYMD);
      if (!score) continue;

      // ✅ MINIMAL FIX: do NOT inject 0-0 unless it is truly final
      if (!isAfconScoreFinal(score)) continue;

      fx.goals = { home: Number(score.homeScore), away: Number(score.awayScore) };
      fx.status = { short: "FT", long: score.status || "Match Finished" };
    }
  }

  function dedupeFirstPredictionPerFixture(preds) {
    const byFixture = new Map();
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

  function filterPredictionsAfterKickoff(preds, fixturesById, fixturesList) {
    return (preds || []).filter((p) => {
      let fixture = fixturesById[String(p.fixtureId)] || null;
      if (!fixture && leagueKey === "AFCON") {
        fixture = findAfconFixture(p, fixturesList);
      }

      const kickoffIso =
        p.kickoff ||
        getKickoffIsoFromFixture(fixture) ||
        p.timestamp ||
        "";

      const ko = Date.parse(kickoffIso);
      const predTime = Date.parse(p.timestamp || "");

      if (!Number.isFinite(ko) || !Number.isFinite(predTime)) return true;
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

    preds = (preds || []).filter((p) => {
      const l = String(p.league || p.leagueKey || "").toUpperCase();
      return l === leagueKey;
    });

    preds = filterPredictionsAfterKickoff(preds, fixturesById, fixturesList);
    preds = dedupeFirstPredictionPerFixture(preds);

    preds.sort(
      (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
    );

    if (!preds.length) {
      container.innerHTML = `<p style="padding:12px;">${esc(
        tr("results.noPredictions", { league: leagueInfo.name })
      )}</p>`;
      if (totalSpan) totalSpan.textContent = "0";
      updateMatchdayHeader("?");
      retryFixMatchdayTitle();
      return;
    }

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

        if (!fixture && pred.fixture && pred.fixture.id != null) {
          fixture = fixturesById[String(pred.fixture.id)] || null;
        }
        if (!fixture && pred.apiFixtureId != null) {
          fixture = fixturesById[String(pred.apiFixtureId)] || null;
        }

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

    container.innerHTML =
      cardsHtml || `<p style="padding:12px;">${esc(tr("results.noResultsYet"))}</p>`;

    preds.forEach((pred) => {
      const sel = `.match-card[data-fixture="${CSS.escape(String(pred.fixtureId))}"]`;
      const cardEl = container.querySelector(sel);
      if (!cardEl) return;

      let fixture = fixturesById[String(pred.fixtureId)] || null;

      if (!fixture && pred.fixture && pred.fixture.id != null) {
        fixture = fixturesById[String(pred.fixture.id)] || null;
      }
      if (!fixture && pred.apiFixtureId != null) {
        fixture = fixturesById[String(pred.apiFixtureId)] || null;
      }

      if (!fixture && leagueKey === "AFCON") {
        fixture = findAfconFixture(pred, fixturesList);
      }

      attachLogos(cardEl, pred, fixture);
    });

    if (totalSpan) totalSpan.textContent = String(totalPts);

    if (predictionsWithPoints.length) {
      syncPointsToFirestore(predictionsWithPoints);
    }

    retryFixMatchdayTitle();
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
