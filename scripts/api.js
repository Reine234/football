


(function (global) {
  // ============================
  // GLOBAL FBL + LEAGUE MAP
  // ============================
  window.FBL = window.FBL || {};

  // Ensure API_CONFIG exists so FBL.API_CONFIG.SEASON is always safe
  // (You can change 2025 to 2024 etc. if your proxy expects another season)
  window.FBL.API_CONFIG = window.FBL.API_CONFIG || {
    SEASON: 2025,
  };

  // SAFETY: make sure league map exists for all pages using api.js
  window.FBL.LEAGUE_MAP = window.FBL.LEAGUE_MAP || {
    PREMIER_LEAGUE: { name: "Premier League", totalRounds: 38 },
    BUNDESLIGA:     { name: "Bundesliga",     totalRounds: 34 },
    LALIGA:         { name: "La Liga",        totalRounds: 38 },
    LIGUE1:         { name: "Ligue 1",        totalRounds: 34 },
  };

  const FBL = window.FBL;

  // We'll call your own server at http://localhost:5000
  // "" means "same origin" from the browser point of view.
  const API_PROXY_BASE = "";

  // cache of logos we've already looked up so we don't spam
  const logoCache = {};

  // ---------------------------
  // Small helpers
  // ---------------------------

  function extractRoundNumber(roundText) {
    if (!roundText) return null;
    const m = roundText.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function toSafeHHMM(timeRaw) {
    // timeRaw might look like "20:00:00+00:00" or "18:30:00" or null
    if (!timeRaw) return "00:00";
    const m = timeRaw.match(/^(\d{2}:\d{2})/);
    if (m) return m[1]; // "20:00"
    return "00:00";
  }

  function makeIsoGuess(datePart, hhmm) {
    // "2025-09-14", "20:00" -> "2025-09-14T20:00:00Z"
    return datePart + "T" + hhmm + ":00Z";
  }

  function formatKickoffLocal(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) {
      return "TBD"; // fallback instead of NaN:NaN
    }
    let hh = d.getHours();
    let mm = d.getMinutes();
    hh = (hh < 10 ? "0" : "") + hh;
    mm = (mm < 10 ? "0" : "") + mm;
    return hh + ":" + mm;
  }

  // We'll wire this later for per-fixture live refresh if you want
  async function fetchFixtureById(fixtureId) {
    console.warn(
      "fetchFixtureById() not implemented yet for fixtureId:",
      fixtureId
    );
    return null;
  }

  // ---------------------------
  // NORMALIZERS
  // ---------------------------

  // API-Football ➜ internal
  function normalizeFromAF(fixturesAF) {
    return fixturesAF.map((f) => {
      return {
        id: f.fixture.id,
        utcDate: f.fixture.date, // ISO datetime string
        roundNum: extractRoundNumber(f.league.round),
        roundText: f.league.round || "",
        leagueId: f.league.id,
        home: {
          id:   f.teams.home.id,
          name: f.teams.home.name,
          logo: f.teams.home.logo,
        },
        away: {
          id:   f.teams.away.id,
          name: f.teams.away.name,
          logo: f.teams.away.logo,
        },
        goals: {
          home: f.goals.home,
          away: f.goals.away,
        },
        status: f.fixture.status, // { long:'Match Finished', short:'FT', ... }
      };
    });
  }

  // TheSportsDB ➜ internal
  // SportsDB gives dateEvent, strTime, intRound, scores, etc.
  function normalizeFromSDB(events) {
    if (!Array.isArray(events)) return [];
    return events.map((ev) => {
      const roundNum = ev.intRound ? parseInt(ev.intRound, 10) : null;

      const datePart = ev.dateEvent || "2025-07-01";
      const hhmm = toSafeHHMM(ev.strTime); // <- cleans "HH:MM"
      const isoGuess = makeIsoGuess(datePart, hhmm);

      const finished =
        ev.intHomeScore !== null &&
        ev.intHomeScore !== undefined &&
        ev.intAwayScore !== null &&
        ev.intAwayScore !== undefined;

      const status = finished
        ? { short: "FT", long: "Match Finished" }
        : { short: "NS", long: "Not Started" };

      return {
        id:
          ev.idEvent ||
          (ev.idHomeTeam + "_" + ev.idAwayTeam + "_" + datePart),
        utcDate: isoGuess, // can now be parsed/dated
        roundNum: roundNum,
        roundText: "Round " + (roundNum !== null ? roundNum : ""),
        leagueId: null, // SportsDB doesn't map cleanly to AF league IDs
        home: {
          id:   ev.idHomeTeam || null,
          name: ev.strHomeTeam || "Home",
          logo: null, // we fill later
        },
        away: {
          id:   ev.idAwayTeam || null,
          name: ev.strAwayTeam || "Away",
          logo: null,
        },
        goals: {
          home:
            ev.intHomeScore !== null &&
            ev.intHomeScore !== undefined
              ? parseInt(ev.intHomeScore, 10)
              : null,
          away:
            ev.intAwayScore !== null &&
            ev.intAwayScore !== undefined
              ? parseInt(ev.intAwayScore, 10)
              : null,
        },
        status: status,
      };
    });
  }

  // ---------------------------
  // FETCH HELPERS
  // ---------------------------

  // 1. API-Football via your Express proxy (/af/fixtures)
  async function tryFetchAF(lg) {
    // NOW we use per-league startDate/endDate from config.js,
    // and the SEASON from API_CONFIG.
    if (!lg) {
      console.warn("[AF] missing league config");
      return [];
    }

    const fromDate = lg.startDate || "";   // e.g. "2025-07-01"
    const toDate   = lg.endDate   || "";   // e.g. "2026-05-25"
    const leagueId = lg.id;

    const season =
      (FBL.API_CONFIG && FBL.API_CONFIG.SEASON) ||
      2025; // safe default

    if (!leagueId) {
      console.warn("[AF] league config has no id – cannot call /af/fixtures properly:", lg);
    }

    const params = new URLSearchParams({
      league: leagueId || "",
      season: season,
      from:   fromDate,
      to:     toDate,
    });

    const url = API_PROXY_BASE + "/af/fixtures?" + params.toString();
    console.log("[AF] GET", url);

    let data;
    try {
      const res = await fetch(url);
      data = await res.json();
    } catch (err) {
      console.warn("[AF] network error", err);
      return [];
    }

    if (!data || !Array.isArray(data.response)) {
      console.warn("[AF] bad or empty", data);
      return [];
    }

    const norm = normalizeFromAF(data.response);
    console.log("[AF] fixtures =", norm.length);
    return norm;
  }

  // 2. Fallback: TheSportsDB via your proxy (/fixtures)
  async function tryFetchSDB(lg) {
    if (!lg || !lg.sdb) {
      console.warn("[SDB] no .sdb config for league, skipping SportsDB fallback:", lg);
      return [];
    }

    // /fixtures?leagueId=...&season=...
    const url =
      API_PROXY_BASE +
      "/fixtures?leagueId=" +
      encodeURIComponent(lg.sdb.leagueId) +
      "&season=" +
      encodeURIComponent(lg.sdb.seasonStr);

    console.log("[SDB] GET", url);

    let data;
    try {
      const res = await fetch(url);
      data = await res.json();
    } catch (err) {
      console.warn("[SDB] network error", err);
      return [];
    }

    if (!data || !Array.isArray(data.events)) {
      console.warn("[SDB] bad or empty", data);
      return [];
    }

    const norm = normalizeFromSDB(data.events);
    console.log("[SDB] fixtures =", norm.length);
    return norm;
  }

  // Public fetch: get all fixtures for a league
  async function fetchFixturesForLeague(leagueKey) {
    const lg = FBL.LEAGUE_MAP[leagueKey];
    if (!lg) {
      throw new Error("Unknown leagueKey " + leagueKey);
    }

    // 1. Try API-Football first
    let allFixtures = await tryFetchAF(lg);

    // 2. If API-Football is blocked (403, no sub, etc.), fallback
    if (!allFixtures || allFixtures.length === 0) {
      console.log("[fetchFixturesForLeague] falling back to SportsDB…");
      allFixtures = await tryFetchSDB(lg);
    }

    return allFixtures;
  }

  // ---------------------------
  // ROUND GROUPING / STATE SAVE
  // ---------------------------

  function groupFixturesByRound(fixtures) {
    const byRound = {};
    fixtures.forEach((f) => {
      const r = f.roundNum || 0;
      if (!byRound[r]) byRound[r] = [];
      byRound[r].push(f);
    });

    const rounds = Object.keys(byRound)
      .map((n) => parseInt(n, 10))
      .sort((a, b) => a - b);

    return { byRound, rounds };
  }

  function getCurrentRoundIndex(rounds, byRound) {
    const nowTs = Date.now();

    // first round that still has a FUTURE match
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      const list = byRound[r] || [];
      const upcoming = list.find((f) => {
        const ts = Date.parse(f.utcDate);
        return !isNaN(ts) && ts >= nowTs;
      });
      if (upcoming) {
        return i;
      }
    }

    // otherwise if the whole season is in the past, show last round
    return rounds.length - 1;
  }

  function persistSelectedRound(leagueKey, roundNum, fixtures) {
    const payload = { leagueKey, roundNum, fixtures };
    sessionStorage.setItem("FBL_selected", JSON.stringify(payload));
  }

  function loadSelectedRound() {
    try {
      return JSON.parse(sessionStorage.getItem("FBL_selected") || "null");
    } catch (e) {
      console.warn("cannot parse FBL_selected", e);
      return null;
    }
  }

  function savePredictions(predictionsMap) {
    sessionStorage.setItem("FBL_predictions", JSON.stringify(predictionsMap));
  }

  function loadPredictions() {
    try {
      return JSON.parse(sessionStorage.getItem("FBL_predictions") || "{}");
    } catch (e) {
      return {};
    }
  }

  // ---------------------------
  // Logo lookup helper
  // ---------------------------

  async function ensureLogo(teamObj, imgEl) {
    if (!imgEl) return;

    // already set?
    if (imgEl.dataset.loaded === "1") return;

    // If API-Football already gave us a logo, done.
    if (teamObj.logo) {
      imgEl.src = teamObj.logo;
      imgEl.dataset.loaded = "1";
      return;
    }

    // browser cache for this session
    const cacheKey = teamObj.id || teamObj.name;
    if (logoCache[cacheKey]) {
      imgEl.src = logoCache[cacheKey];
      imgEl.dataset.loaded = "1";
      return;
    }

    // fallback lookup via SportsDB proxies
    let badgeUrl = null;
    try {
      if (teamObj.id) {
        const r1 = await fetch("/teamById?id=" + encodeURIComponent(teamObj.id));
        const j1 = await r1.json();
        badgeUrl =
          (j1 && j1.teams && j1.teams[0] && (j1.teams[0].strTeamBadge || j1.teams[0].strTeamLogo)) ||
          null;
      }

      if (!badgeUrl && teamObj.name) {
        const r2 = await fetch("/team?t=" + encodeURIComponent(teamObj.name));
        const j2 = await r2.json();
        badgeUrl =
          (j2 && j2.teams && j2.teams[0] && (j2.teams[0].strTeamBadge || j2.teams[0].strTeamLogo)) ||
          null;
      }
    } catch (e) {
      console.warn("logo lookup failed", e);
    }

    if (badgeUrl) {
      logoCache[cacheKey] = badgeUrl;
      teamObj.logo = badgeUrl;
      imgEl.src = badgeUrl;
      imgEl.dataset.loaded = "1";
    }
  }

  // ---------------------------
  // Expose the public API to the rest of the app
  // ---------------------------

  FBL.fetchFixturesForLeague   = fetchFixturesForLeague;
  FBL.fetchFixtureById         = fetchFixtureById;
  FBL.groupFixturesByRound     = groupFixturesByRound;
  FBL.getCurrentRoundIndex     = getCurrentRoundIndex;
  FBL.formatKickoffLocal       = formatKickoffLocal;
  FBL.persistSelectedRound     = persistSelectedRound;
  FBL.loadSelectedRound        = loadSelectedRound;
  FBL.savePredictions          = savePredictions;
  FBL.loadPredictions          = loadPredictions;
  FBL.ensureLogo               = ensureLogo;

  global.FBL = FBL;
})(window);





























(function (global) {
  
// SAFETY: make sure league map exists for all pages using api.js
window.FBL = window.FBL || {};
window.FBL.LEAGUE_MAP = window.FBL.LEAGUE_MAP || {
  PREMIER_LEAGUE: { name: "Premier League", totalRounds: 38 },
  BUNDESLIGA:     { name: "Bundesliga",     totalRounds: 34 },
  LALIGA:         { name: "La Liga",        totalRounds: 38 },
  LIGUE1:         { name: "Ligue 1",        totalRounds: 34 },
};

  // We'll call your own server at http://localhost:5000
  // "" means "same origin" from the browser point of view.
  const API_PROXY_BASE = "";

  // cache of logos we've already looked up so we don't spam
  const logoCache = {};

  // ---------------------------
  // Small helpers
  // ---------------------------

  function extractRoundNumber(roundText) {
    if (!roundText) return null;
    const m = roundText.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function toSafeHHMM(timeRaw) {
    // timeRaw might look like "20:00:00+00:00" or "18:30:00" or null
    if (!timeRaw) return "00:00";
    const m = timeRaw.match(/^(\d{2}:\d{2})/);
    if (m) return m[1]; // "20:00"
    return "00:00";
  }

  function makeIsoGuess(datePart, hhmm) {
    // "2025-09-14", "20:00" -> "2025-09-14T20:00:00Z"
    return datePart + "T" + hhmm + ":00Z";
  }

  function formatKickoffLocal(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) {
      return "TBD"; // fallback instead of NaN:NaN
    }
    let hh = d.getHours();
    let mm = d.getMinutes();
    hh = (hh < 10 ? "0" : "") + hh;
    mm = (mm < 10 ? "0" : "") + mm;
    return hh + ":" + mm;
  }

  // We'll wire this later for per-fixture live refresh if you want
  async function fetchFixtureById(fixtureId) {
    console.warn(
      "fetchFixtureById() not implemented yet for fixtureId:",
      fixtureId
    );
    return null;
  }

  // ---------------------------
  // NORMALIZERS
  // ---------------------------

  // API-Football ➜ internal
  function normalizeFromAF(fixturesAF) {
    return fixturesAF.map((f) => {
      return {
        id: f.fixture.id,
        utcDate: f.fixture.date, // ISO datetime string
        roundNum: extractRoundNumber(f.league.round),
        roundText: f.league.round || "",
        leagueId: f.league.id,
        home: {
          id:   f.teams.home.id,
          name: f.teams.home.name,
          logo: f.teams.home.logo,
        },
        away: {
          id:   f.teams.away.id,
          name: f.teams.away.name,
          logo: f.teams.away.logo,
        },
        goals: {
          home: f.goals.home,
          away: f.goals.away,
        },
        status: f.fixture.status, // { long:'Match Finished', short:'FT', ... }
      };
    });
  }

  // TheSportsDB ➜ internal
  // SportsDB gives dateEvent, strTime, intRound, scores, etc.
  function normalizeFromSDB(events) {
    if (!Array.isArray(events)) return [];
    return events.map((ev) => {
      const roundNum = ev.intRound ? parseInt(ev.intRound, 10) : null;

      const datePart = ev.dateEvent || "2025-07-01";
      const hhmm = toSafeHHMM(ev.strTime); // <- cleans "HH:MM"
      const isoGuess = makeIsoGuess(datePart, hhmm);

      const finished =
        ev.intHomeScore !== null &&
        ev.intHomeScore !== undefined &&
        ev.intAwayScore !== null &&
        ev.intAwayScore !== undefined;

      const status = finished
        ? { short: "FT", long: "Match Finished" }
        : { short: "NS", long: "Not Started" };

      return {
        id:
          ev.idEvent ||
          (ev.idHomeTeam + "_" + ev.idAwayTeam + "_" + datePart),
        utcDate: isoGuess, // can now be parsed/dated
        roundNum: roundNum,
        roundText: "Round " + (roundNum !== null ? roundNum : ""),
        leagueId: null, // SportsDB doesn't map cleanly to AF league IDs
        home: {
          id:   ev.idHomeTeam || null,
          name: ev.strHomeTeam || "Home",
          logo: null, // we fill later
        },
        away: {
          id:   ev.idAwayTeam || null,
          name: ev.strAwayTeam || "Away",
          logo: null,
        },
        goals: {
          home:
            ev.intHomeScore !== null &&
            ev.intHomeScore !== undefined
              ? parseInt(ev.intHomeScore, 10)
              : null,
          away:
            ev.intAwayScore !== null &&
            ev.intAwayScore !== undefined
              ? parseInt(ev.intAwayScore, 10)
              : null,
        },
        status: status,
      };
    });
  }

  // ---------------------------
  // FETCH HELPERS
  // ---------------------------

  // 1. API-Football via your Express proxy (/af/fixtures)
  // 1. API-Football via your Express proxy (/af/fixtures)
async function tryFetchAF(leagueKey) {
  // Read league IDs + seasons from config.js
  const cfgRoot = (window.FBL_CFG && window.FBL_CFG.API_FOOTBALL) || {};
  const cfg     = cfgRoot[leagueKey] || null;

  if (!cfg || !cfg.LEAGUE_ID) {
    console.warn("[AF] missing API_FOOTBALL config for", leagueKey, cfg);
    return [];
  }

  const leagueId = cfg.LEAGUE_ID;                    // 39, 78, 140, 61, ...
  const season   =
    cfg.SEASON ||
    (window.FBL && window.FBL.API_CONFIG && window.FBL.API_CONFIG.SEASON) ||
    2024;

  // Optional date range from LEAGUE_MAP (safe if missing)
  let fromDate = "";
  let toDate   = "";
  if (window.FBL && window.FBL.LEAGUE_MAP && window.FBL.LEAGUE_MAP[leagueKey]) {
    const lg = window.FBL.LEAGUE_MAP[leagueKey];
    if (lg.startDate) fromDate = lg.startDate;
    if (lg.endDate)   toDate   = lg.endDate;
  }

  const params = new URLSearchParams({
    league: String(leagueId),
    season: String(season),
  });
  if (fromDate) params.set("from", fromDate);
  if (toDate)   params.set("to",   toDate);

  const url = API_PROXY_BASE + "/af/fixtures?" + params.toString();
  console.log("[AF] GET", url);

  let data;
  try {
    const res = await fetch(url);
    data = await res.json();
  } catch (err) {
    console.warn("[AF] network error", err);
    return [];
  }

  if (!data || !Array.isArray(data.response)) {
    console.warn("[AF] bad or empty", data);
    return [];
  }

  const norm = normalizeFromAF(data.response);
  console.log("[AF] fixtures =", norm.length);
  return norm;
}

  async function fetchFixturesForLeague(leagueKey) {
  const lg = FBL.LEAGUE_MAP[leagueKey];
  if (!lg) {
    throw new Error("Unknown leagueKey " + leagueKey);
  }

  // 1. Try API-Football first (now using leagueKey, not lg.id)
  let allFixtures = await tryFetchAF(leagueKey);

  // 2. If API-Football is blocked (403, no sub, etc.), fallback
  if (!allFixtures || allFixtures.length === 0) {
    console.log("[fetchFixturesForLeague] falling back to SportsDB…");
    allFixtures = await tryFetchSDB(lg);
  }

  return allFixtures;
}

  // ---------------------------
  // ROUND GROUPING / STATE SAVE
  // ---------------------------

  function groupFixturesByRound(fixtures) {
    const byRound = {};
    fixtures.forEach((f) => {
      const r = f.roundNum || 0;
      if (!byRound[r]) byRound[r] = [];
      byRound[r].push(f);
    });

    const rounds = Object.keys(byRound)
      .map((n) => parseInt(n, 10))
      .sort((a, b) => a - b);

    return { byRound, rounds };
  }

  function getCurrentRoundIndex(rounds, byRound) {
    const nowTs = Date.now();

    // first round that still has a FUTURE match
    for (let i = 0; i < rounds.length; i++) {
      const r = rounds[i];
      const list = byRound[r] || [];
      const upcoming = list.find((f) => {
        const ts = Date.parse(f.utcDate);
        return !isNaN(ts) && ts >= nowTs;
      });
      if (upcoming) {
        return i;
      }
    }

    // otherwise if the whole season is in the past, show last round
    return rounds.length - 1;
  }

  function persistSelectedRound(leagueKey, roundNum, fixtures) {
    const payload = { leagueKey, roundNum, fixtures };
    sessionStorage.setItem("FBL_selected", JSON.stringify(payload));
  }

  function loadSelectedRound() {
    try {
      return JSON.parse(sessionStorage.getItem("FBL_selected") || "null");
    } catch (e) {
      console.warn("cannot parse FBL_selected", e);
      return null;
    }
  }

  function savePredictions(predictionsMap) {
    sessionStorage.setItem("FBL_predictions", JSON.stringify(predictionsMap));
  }

  function loadPredictions() {
    try {
      return JSON.parse(sessionStorage.getItem("FBL_predictions") || "{}");
    } catch (e) {
      return {};
    }
  }

  // ---------------------------
  // Logo lookup helper
  // ---------------------------

  async function ensureLogo(teamObj, imgEl) {
    if (!imgEl) return;

    // already set?
    if (imgEl.dataset.loaded === "1") return;

    // If API-Football already gave us a logo, done.
    if (teamObj.logo) {
      imgEl.src = teamObj.logo;
      imgEl.dataset.loaded = "1";
      return;
    }

    // browser cache for this session
    const cacheKey = teamObj.id || teamObj.name;
    if (logoCache[cacheKey]) {
      imgEl.src = logoCache[cacheKey];
      imgEl.dataset.loaded = "1";
      return;
    }

    // fallback lookup via SportsDB proxies
    let badgeUrl = null;
    try {
      if (teamObj.id) {
        const r1 = await fetch("/teamById?id=" + encodeURIComponent(teamObj.id));
        const j1 = await r1.json();
        badgeUrl =
          j1?.teams?.[0]?.strTeamBadge ||
          j1?.teams?.[0]?.strTeamLogo ||
          null;
      }

      if (!badgeUrl && teamObj.name) {
        const r2 = await fetch("/team?t=" + encodeURIComponent(teamObj.name));
        const j2 = await r2.json();
        badgeUrl =
          j2?.teams?.[0]?.strTeamBadge ||
          j2?.teams?.[0]?.strTeamLogo ||
          null;
      }
    } catch (e) {
      console.warn("logo lookup failed", e);
    }

    if (badgeUrl) {
      logoCache[cacheKey] = badgeUrl;
      teamObj.logo = badgeUrl;
      imgEl.src = badgeUrl;
      imgEl.dataset.loaded = "1";
    }
  }

  // ---------------------------
  // Expose the public API to the rest of the app
  // ---------------------------

  FBL.fetchFixturesForLeague   = fetchFixturesForLeague;
  FBL.fetchFixtureById         = fetchFixtureById;
  FBL.groupFixturesByRound     = groupFixturesByRound;
  FBL.getCurrentRoundIndex     = getCurrentRoundIndex;
  FBL.formatKickoffLocal       = formatKickoffLocal;
  FBL.persistSelectedRound     = persistSelectedRound;
  FBL.loadSelectedRound        = loadSelectedRound;
  FBL.savePredictions          = savePredictions;
  FBL.loadPredictions          = loadPredictions;
  FBL.ensureLogo               = ensureLogo;

  global.FBL = FBL;
})(window);
