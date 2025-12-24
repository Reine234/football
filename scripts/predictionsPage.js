// /scripts/predictionsPage.js
(function () {
  // --- SAFETY: ensure FBL + LEAGUE_MAP exist ---
  window.FBL = window.FBL || {};
  window.FBL.LEAGUE_MAP = window.FBL.LEAGUE_MAP || {
    PREMIER_LEAGUE: { name: "Premier League", totalRounds: 38 },
    BUNDESLIGA:     { name: "Bundesliga",     totalRounds: 34 },
    LALIGA:         { name: "La Liga",        totalRounds: 38 },
    AFCON:          { name: "Afcon",          totalRounds: 6 },
  };

  // --- TEAM I18N HELPERS (AFCON) ---
  // Map displayed names -> i18n keys (use the same keys you used in HTML pages)
  function fblTeamI18nKey(name) {
    const n = String(name || "").trim().toLowerCase();

    // normalize common accents/apostrophes
    const norm = n
      .replace(/’/g, "'")
      .replace(/\s+/g, " ");

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

  // After you inject results HTML, call this once to translate the page
  function reapplyI18n() {
    try {
      if (window.FBL_I18N && typeof window.FBL_I18N.apply === "function") {
        window.FBL_I18N.apply();
        return;
      }
      if (window.FBL_I18N && typeof window.FBL_I18N.applyLang === "function") {
        const lang = (window.FBL_I18N.getLang && window.FBL_I18N.getLang()) || "en";
        window.FBL_I18N.applyLang(lang);
      }
    } catch (_) {}
  }

  // If key exists -> render <span data-i18n="...">Name</span>
  // Else -> keep your original line-break formatting
  function teamNameHTML(name) {
    const key = fblTeamI18nKey(name);
    if (key) return `<span data-i18n="${key}">${name || ""}</span>`;
    return breakTeamName(name);
  }

  // For popup: no <br>, just a span (clean)
  function teamNameHTMLPlain(name) {
    const key = fblTeamI18nKey(name);
    if (key) return `<span data-i18n="${key}">${name || ""}</span>`;
    return (name || "");
  }

  // ------------------------------------------------------------
  // i18n helpers (SAFE: falls back to English text)
  // ------------------------------------------------------------
  function getLangSafe() {
    try {
      return window.FBL_I18N?.getLang ? window.FBL_I18N.getLang() : "en";
    } catch (_) {
      return "en";
    }
  }
  function tSafe(key, fallback) {
    try {
      const lang = getLangSafe();
      if (window.FBL_I18N?.t) {
        const out = window.FBL_I18N.t(lang, key);
        if (out && out !== key) return out;
      }
    } catch (_) {}
    return fallback;
  }
  function formatTemplate(template, vars) {
    let s = String(template || "");
    Object.keys(vars || {}).forEach((k) => {
      s = s.replace(new RegExp("\\{" + k + "\\}", "g"), String(vars[k]));
    });
    return s;
  }

  // ------------------------------------------------------------
  // Firestore store (save + load)
  // ------------------------------------------------------------
  (function () {
    const auth =
      (window.FBL_FIREBASE && window.FBL_FIREBASE.auth) ||
      (window.firebase && firebase.auth && firebase.auth());

    const db =
      (window.FBL_FIREBASE && window.FBL_FIREBASE.db) ||
      (window.firebase && firebase.firestore && firebase.firestore());

    function getUidNow() {
      try {
        return auth && auth.currentUser ? auth.currentUser.uid : null;
      } catch (_) {
        return null;
      }
    }

    function waitForUid() {
      const uid = getUidNow();
      if (uid) return Promise.resolve(uid);

      return new Promise((resolve, reject) => {
        if (!auth || !auth.onAuthStateChanged) {
          resolve(null);
          return;
        }
        const unsub = auth.onAuthStateChanged(
          (user) => {
            unsub();
            resolve(user ? user.uid : null);
          },
          (err) => {
            unsub();
            reject(err);
          }
        );
      });
    }

    async function savePredictionsForRound(leagueKey, roundNum, pending) {
      const uid = await waitForUid();
      if (!uid) throw new Error("Not logged in");

      const batch = db.batch();

      pending.forEach((p) => {
        const fixtureId = String(p.fixtureId);
        const docId = `${uid}_${leagueKey}_${roundNum}_${fixtureId}`;
        const ref = db.collection("predictions").doc(docId);

        // ✅ This overwrites/updates the SAME doc (so edits before kickoff persist)
        batch.set(
          ref,
          {
            ...p,
            uid,
            league: leagueKey,
            matchday: String(roundNum),
            fixtureId,
            timestamp: p.timestamp || new Date().toISOString(),
          },
          { merge: true }
        );
      });

      await batch.commit();
      console.log("[STORE] saved", pending.length, "to", leagueKey, "round", roundNum);
      return true;
    }

    async function loadPredictionsForLeague(leagueKey) {
      const uid = await waitForUid();
      if (!uid || !db) return [];

      const snap = await db
        .collection("predictions")
        .where("uid", "==", uid)
        .where("league", "==", leagueKey)
        .get();

      const out = [];
      snap.forEach((doc) => out.push(doc.data()));
      out.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      return out;
    }

    window.FBL_STORE = window.FBL_STORE || {};
    window.FBL_STORE.savePredictionsForRound = savePredictionsForRound;
    window.FBL_STORE.loadPredictionsForLeague = loadPredictionsForLeague;
  })();

  // ------------------------------------------------------------
  // League detection + selection
  // ------------------------------------------------------------
  function detectLeagueKeyFromPath() {
    const path = (window.location.pathname || "").toLowerCase();
    if (path.includes("/afcon/"))      return "AFCON";
    if (path.includes("/laliga/"))     return "LALIGA";
    if (path.includes("/bundesliga/")) return "BUNDESLIGA";
    return "PREMIER_LEAGUE";
  }

  const folderLeagueKey = detectLeagueKeyFromPath();

  // Universal loader, but:
  //  - AFCON: DO NOT use FBL.loadSelectedRound (we only use sessionStorage)
  //  - others: first FBL.loadSelectedRound, then sessionStorage as fallback
  function loadSelectedRoundUniversal(folderLeagueKey) {
    // AFCON -> only sessionStorage (set by AFCON index/matchcard pages)
    if (folderLeagueKey === "AFCON") {
      try {
        const raw = sessionStorage.getItem("FBL_selectedRound");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && Array.isArray(parsed.fixtures) && parsed.fixtures.length) {
            console.log("[PredictionsPage] (AFCON) using FBL_selectedRound from sessionStorage", parsed);
            return parsed;
          }
        }
      } catch (e) {
        console.warn("[PredictionsPage] (AFCON) FBL_selectedRound parse error:", e);
      }
      console.error("[PredictionsPage] (AFCON) No FBL_selectedRound in sessionStorage.");
      return null;
    }

    // Non-AFCON leagues: original behaviour
    try {
      if (window.FBL && typeof window.FBL.loadSelectedRound === "function") {
        const sel = window.FBL.loadSelectedRound();
        if (sel && Array.isArray(sel.fixtures) && sel.fixtures.length) {
          console.log("[PredictionsPage] using FBL.loadSelectedRound", sel);
          return sel;
        }
      }
    } catch (e) {
      console.warn("[PredictionsPage] FBL.loadSelectedRound failed:", e);
    }

    try {
      const raw = sessionStorage.getItem("FBL_selectedRound");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.fixtures) && parsed.fixtures.length) {
          console.log("[PredictionsPage] using FBL_selectedRound from sessionStorage", parsed);
          return parsed;
        }
      }
    } catch (e) {
      console.warn("[PredictionsPage] FBL_selectedRound parse error:", e);
    }

    return null;
  }

  let selected = loadSelectedRoundUniversal(folderLeagueKey);

  // 🔹 AFCON fallback for production / direct-links:
  if (folderLeagueKey === "AFCON" && !selected) {
    let master = null;

    if (
      window.ALL_LEAGUES_FIXTURES &&
      Array.isArray(window.ALL_LEAGUES_FIXTURES.AFCON)
    ) {
      master = window.ALL_LEAGUES_FIXTURES.AFCON;
    } else if (Array.isArray(window.AFCON_FIXTURES)) {
      master = window.AFCON_FIXTURES;
    } else if (Array.isArray(window.FBL_AFCON_FIXTURES)) {
      master = window.FBL_AFCON_FIXTURES;
    }

    if (master && master.length) {
      selected = {
        leagueKey: "AFCON",
        roundNum: 1,
        fixtures: master,
      };
      console.log(
        "[PredictionsPage] (AFCON) built default selection from master fixtures",
        selected
      );
    }
  }

  // ------------------------------------------------------------
  // Decide leagueKey safely
  // ------------------------------------------------------------
  let leagueKey = sessionStorage.getItem("FBL_leagueKey") || folderLeagueKey;

  if (folderLeagueKey !== "AFCON" && selected && selected.leagueKey) {
    leagueKey = selected.leagueKey;
    sessionStorage.setItem("FBL_leagueKey", leagueKey);
  }

  if (folderLeagueKey === "AFCON") {
    leagueKey = "AFCON";
    sessionStorage.setItem("FBL_leagueKey", leagueKey);
  }

  if (!selected || !leagueKey || !window.FBL.LEAGUE_MAP[leagueKey]) {
    console.error("[PredictionsPage] No selected round / league.", {
      folderLeagueKey,
      leagueKey,
      selected,
    });

    let base = "../premier/";
    if (folderLeagueKey === "AFCON")           base = "../afcon/";
    else if (folderLeagueKey === "LALIGA")     base = "../laliga/";
    else if (folderLeagueKey === "BUNDESLIGA") base = "../bundesliga/";

    window.location.href = base + "index.html";
    return;
  }

  const leagueInfo  = window.FBL.LEAGUE_MAP[leagueKey];
  const roundNum    = selected.roundNum || 1;
  const totalRounds = leagueInfo.totalRounds || "?";
  const allFixtures = selected.fixtures || [];

  // ------------------------------------------------------------
  // AFCON helpers: matchday + group
  // ------------------------------------------------------------
  function getFixtureMatchday(f) {
    if (typeof f.matchday === "number") return f.matchday;
    if (typeof f.matchDay === "number") return f.matchDay;
    if (typeof f.roundNum === "number") return f.roundNum;
    if (typeof f.round === "number") return f.round;

    const candidates = [];
    if (f.matchday)  candidates.push(f.matchday);
    if (f.matchDay)  candidates.push(f.matchDay);
    if (f.roundNum)  candidates.push(f.roundNum);
    if (f.round)     candidates.push(f.round);
    if (f.roundName) candidates.push(f.roundName);
    if (f.stage)     candidates.push(f.stage);
    if (f.league && f.league.round) candidates.push(f.league.round);

    for (const c of candidates) {
      if (c == null) continue;
      const m = String(c).match(/(\d+)/);
      if (m) {
        const n = parseInt(m[1] || m[0], 10);
        if (!Number.isNaN(n)) return n;
      }
    }
    return null;
  }

  function getAfconGroupLabel(f) {
    const raw =
      f.group ||
      f.groupName ||
      f.group_label ||
      (f.league && (f.league.group || f.league.round)) ||
      f.stage ||
      f.pool ||
      "";

    if (!raw) return "";

    const str = String(raw).trim();

    const mLetter = str.match(/^[A-F]$/i);
    if (mLetter) return "Group " + mLetter[0].toUpperCase();

    const mGroup = str.match(/group\s*([A-F])/i);
    if (mGroup) return "Group " + mGroup[1].toUpperCase();

    const mStartLetter = str.match(/^([A-F])\b/i);
    if (mStartLetter) return "Group " + mStartLetter[1].toUpperCase();

    return "Group " + str;
  }

  function getAfconGroupCode(f) {
    const label = getAfconGroupLabel(f);
    if (!label) return null;
    const m = label.match(/Group\s+([A-F])/i);
    return m ? m[1].toUpperCase() : null;
  }

  // ------------------------------------------------------------
  // AFCON: expand to ALL groups for this matchday (using master fixtures)
  // ------------------------------------------------------------
  let effectiveAllFixtures = allFixtures;
  if (leagueKey === "AFCON") {
    let master = null;
    if (
      window.ALL_LEAGUES_FIXTURES &&
      Array.isArray(window.ALL_LEAGUES_FIXTURES.AFCON)
    ) {
      master = window.ALL_LEAGUES_FIXTURES.AFCON;
    } else if (Array.isArray(window.AFCON_FIXTURES)) {
      master = window.AFCON_FIXTURES;
    } else if (Array.isArray(window.FBL_AFCON_FIXTURES)) {
      master = window.FBL_AFCON_FIXTURES;
    }

    if (master && master.length) {
      const byRound = master.filter((f) => getFixtureMatchday(f) === roundNum);

      if (byRound.length) {
        effectiveAllFixtures = byRound;
        console.log("[AFCON] Using master fixtures by matchday", roundNum, "count=", effectiveAllFixtures.length);
      } else {
        console.warn("[AFCON] No fixtures matched matchday", roundNum, "– falling back to full master AFCON list");
        effectiveAllFixtures = master;
      }
    } else {
      console.warn("[AFCON] Master AFCON fixtures not found. Falling back to selected.fixtures only.");
      effectiveAllFixtures = allFixtures;
    }
  }

  const mode         = sessionStorage.getItem("FBL_mode") || "all";
  const selFixtureId = sessionStorage.getItem("FBL_selectedFixture");

  let pageFixtures;

  if (leagueKey === "AFCON") {
    pageFixtures = effectiveAllFixtures.slice();
  } else if (mode === "single" && selFixtureId) {
    pageFixtures = allFixtures.filter((f) => String(f.id) === String(selFixtureId));
    if (!pageFixtures.length) {
      console.warn("[PredictionsPage] single-mode id not found, falling back to all fixtures");
      pageFixtures = allFixtures.slice();
    }
  } else {
    pageFixtures = allFixtures.slice();
  }

  console.log(
    "[PredictionsPage] leagueKey=",
    leagueKey,
    "roundNum=",
    roundNum,
    "fixtures=",
    leagueKey === "AFCON" ? effectiveAllFixtures.length : allFixtures.length,
    "pageFixtures=",
    pageFixtures.length
  );

  // ------------------------------------------------------------
  // DOM refs
  // ------------------------------------------------------------
  const subtitleEl     = document.querySelector(".subtitle");
  const dayNumWrapEl   = document.getElementById("day-number2");
  const prevDayBtn     = document.getElementById("prev-day");
  const nextDayBtn     = document.getElementById("next-day");
  const listEl         = document.getElementById("predictions-list");
  const topDoneLink    = document.getElementById("done");
  const bottomDoneBtn  = document.getElementById("done-button");
  const overlayEl      = document.getElementById("gprompt-overlay");
  const closeBtn       = document.getElementById("gprompt-close");
  const cancelBtn      = document.getElementById("gprompt-cancel");
  const confirmBtn     = document.getElementById("gprompt-confirm");
  const confirmListEl  = document.getElementById("confirmList");
  const badgeEl        = document.querySelector(".gprompt__badge");
  const matchdayTextEl = document.getElementById("gprompt-matchday");
  const promptTitleEl  = document.getElementById("gprompt-title");

  // ------------------------------------------------------------
  // Prediction state + helpers
  // ------------------------------------------------------------
  const userPred = {};
  const clamp    = (v) => (v < 0 ? 0 : v > 20 ? 20 : v);
  const display  = (el, val) => {
    if (!el) return;
    el.value = val === null || typeof val === "undefined" ? "" : String(val);
  };
  const isSet = (p) => p && p.homeScore !== null && p.awayScore !== null;

  function breakTeamName(name) {
    if (!name) return "";
    const words = String(name).trim().split(/\s+/);
    if (words.length <= 2) return words.join(" ");
    if (words.length === 3) return `${words[0]} ${words[1]}<br>${words[2]}`;
    if (words.length === 4) return `${words[0]} ${words[1]}<br>${words[2]} ${words[3]}`;
    const firstLine = `${words[0]} ${words[1]}`;
    const secondLine = words.slice(2).join(" ");
    return `${firstLine}<br>${secondLine}`;
  }

  function getHomeTeam(f) {
    return f.home || (f.teams && f.teams.home) || f.homeTeam || { id: null, name: "", logo: null };
  }

  function getAwayTeam(f) {
    return f.away || (f.teams && f.teams.away) || f.awayTeam || { id: null, name: "", logo: null };
  }

  function ensurePredictionSlot(f) {
    const id = String(f.id);
    const homeTeam = getHomeTeam(f);
    const awayTeam = getAwayTeam(f);

    if (!userPred[id]) {
      userPred[id] = { homeScore: null, awayScore: null, homeTeam, awayTeam };
    } else {
      userPred[id].homeTeam = homeTeam;
      userPred[id].awayTeam = awayTeam;
    }
  }

 function normalizeIsoToUTC(raw) {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/[zZ]$/.test(s) || /[+\-]\d{2}:\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return s + "Z";
  return s;
}

function formatMatchDate(f) {
  const raw = f.utcDate || f.utc_date || f.date;
  if (!raw) return "";

  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";

  // ✅ force UTC so the calendar day never shifts by user timezone
  try {
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  } catch (_) {
    // fallback if browser doesn't support timeZone option
    return d.toUTCString().slice(0, 16);
  }
}




  // ------------------------------------------------------------
  // ✅ NEW: match time state + lock messaging (STARTED vs PASSED)
  // ------------------------------------------------------------
  function kickoffMsFromFixture(f) {
    const raw = f && (f.utcDate || f.utc_date || f.date || f.kickoff);
    const ms = Date.parse(raw || "");
    return Number.isFinite(ms) ? ms : NaN;
  }

  // Try to detect finished state if provider adds it
  function isFixtureFinished(f) {
    const s =
      (f && f.status && (f.status.short || f.status)) ||
      (f && f.fixture && f.fixture.status && (f.fixture.status.short || f.fixture.status)) ||
      "";
    const short = String(s || "").toUpperCase().trim();
    return short === "FT" || short === "AET" || short === "PEN" || short.includes("FINISHED");
  }

  // Returns: "not_started" | "started" | "passed"
  function getMatchState(f) {
    const ko = kickoffMsFromFixture(f);
    if (!Number.isFinite(ko)) return "not_started";

    const now = Date.now();
    if (now < ko) return "not_started";

    // If we know it's finished -> passed
    if (isFixtureFinished(f)) return "passed";

    // If kickoff was long ago -> passed (fallback)
    const FOUR_HOURS = 4 * 60 * 60 * 1000;
    if (now - ko >= FOUR_HOURS) return "passed";

    // Otherwise it has started but not necessarily finished
    return "started";
  }

  function showMatchLockMsg(card, state) {
    if (!card) return;
    const msgEl = card.querySelector(".match-locked-msg");
    if (!msgEl) return;

    const key =
      state === "passed"
        ? "predictions.matchPassedMsg"
        : "predictions.matchStartedMsg";

    // ✅ add i18n key so i18n.js can translate
    msgEl.setAttribute("data-i18n", key);

    // ✅ fallback text (EN) if i18n missing
    msgEl.textContent =
      state === "passed"
        ? tSafe("predictions.matchPassedMsg", "Match has already passed.")
        : tSafe("predictions.matchStartedMsg", "Match has already started.");

    msgEl.style.display = "block";

    // ✅ translate immediately if i18n is available
    reapplyI18n();

    clearTimeout(msgEl.__hideT);
    msgEl.__hideT = setTimeout(() => {
      msgEl.style.display = "none";
    }, 2500);
  }


  function setMatchLockMsgStatic(card, state) {
  if (!card) return;
  const msgEl = card.querySelector(".match-locked-msg");
  if (!msgEl) return;

  const key =
    state === "passed"
      ? "predictions.matchPassedMsg"
      : "predictions.matchStartedMsg";

  msgEl.setAttribute("data-i18n", key);

  msgEl.textContent =
    state === "passed"
      ? tSafe("predictions.matchPassedMsg", "Match has already passed.")
      : tSafe("predictions.matchStartedMsg", "Match has already started.");

  msgEl.style.display = "block";
  reapplyI18n();
}

  // ------------------------------------------------------------
  // ✅ NEW: preload saved predictions for THIS league + matchday
  // (so edits overwrite the same Firestore doc later)
  // ------------------------------------------------------------
  async function preloadSavedPredictionsForThisRound() {
    try {
      if (!window.FBL_STORE || typeof window.FBL_STORE.loadPredictionsForLeague !== "function") return;

      const saved = await window.FBL_STORE.loadPredictionsForLeague(leagueKey);
      if (!saved || !saved.length) return;

      const relevant = saved.filter((p) => {
        const md = String(p.matchday || "");
        return md === String(roundNum);
      });

      relevant.forEach((p) => {
        const fid = String(p.fixtureId);
        const fx = pageFixtures.find((f) => String(f.id) === fid);
        if (fx) ensurePredictionSlot(fx);

        if (!userPred[fid]) {
          // if fixture isn't found in pageFixtures, still create slot
          userPred[fid] = {
            homeScore: null,
            awayScore: null,
            homeTeam: (p.home || {}).id ? { id: p.home.id, name: p.home.name, logo: p.home.logo || null } : { id: null, name: "", logo: null },
            awayTeam: (p.away || {}).id ? { id: p.away.id, name: p.away.name, logo: p.away.logo || null } : { id: null, name: "", logo: null },
          };
        }

        // ✅ load previously saved scores so user can edit BEFORE kickoff
        if (p.home && p.home.score != null) userPred[fid].homeScore = Number(p.home.score);
        if (p.away && p.away.score != null) userPred[fid].awayScore = Number(p.away.score);
      });
    } catch (e) {
      console.warn("[PredictionsPage] preloadSavedPredictions failed:", e);
    }
  }

  // ------------------------------------------------------------
  // Render fixtures (with AFCON grouping & strict A→F ordering)
  // ------------------------------------------------------------
  function renderFixtures() {
    if (!listEl) return;

    // Subtitle (bilingual)
    if (subtitleEl) {
      const leagueMatches = tSafe("predictions.leagueMatches", "{league} Matches");
      const matchdayOf = tSafe("predictions.matchdayOf", "Matchday {n} of {total}");
      const left = `<span class="bold">${formatTemplate(leagueMatches, { league: leagueInfo.name })}</span>`;
      const right = formatTemplate(matchdayOf, { n: roundNum, total: totalRounds });
      subtitleEl.innerHTML = `${left} - ${right}`;
    }

    if (dayNumWrapEl) dayNumWrapEl.textContent = roundNum;
    if (prevDayBtn) prevDayBtn.disabled = true;
    if (nextDayBtn) nextDayBtn.disabled = true;

    // Make modal title bilingual even if HTML wasn't translated
    if (promptTitleEl) {
      promptTitleEl.textContent = tSafe(
        "predictions.confirmTitle",
        "Are you sure you want to submit these scores? Please confirm that all the information is correct."
      );
    }

    pageFixtures.forEach((f) => ensurePredictionSlot(f));

    let fixturesForRender = pageFixtures.slice();

    if (leagueKey === "AFCON") {
      fixturesForRender.sort((a, b) => {
        const la = getAfconGroupLabel(a);
        const lb = getAfconGroupLabel(b);

        const ma = la.match(/Group\s+([A-F])/i);
        const mb = lb.match(/Group\s+([A-F])/i);

        if (ma && mb) {
          const ga = ma[1].toUpperCase().charCodeAt(0);
          const gb = mb[1].toUpperCase().charCodeAt(0);
          if (ga !== gb) return ga - gb;
        } else if (ma && !mb) return -1;
        else if (!ma && mb) return 1;
        else if (la !== lb) return la.localeCompare(lb);

        const tA = new Date(a.utcDate || a.utc_date || a.date || 0).getTime();
        const tB = new Date(b.utcDate || b.utc_date || b.date || 0).getTime();
        return tA - tB;
      });
    }

    let lastGroupLabel = null;

    const predictionLabelText = tSafe("predictions.enterPredictionScore", "Enter your prediction score");
    const groupHeaderTpl = tSafe("predictions.groupHeader", "{group} - Matchday {n}");

    // ✅ both messages exist via i18n keys (we set the right one dynamically on click)
    const lockedStartedFallback = tSafe("predictions.matchStartedMsg", "Match has already started.");
    const lockedPassedFallback  = tSafe("predictions.matchPassedMsg", "Match has already passed.");

    const html = fixturesForRender
      .map((f) => {
        const ko = window.FBL.formatKickoffLocal
          ? window.FBL.formatKickoffLocal(f.utcDate || f.utc_date || f.date)
          : "";

        const homeTeam = getHomeTeam(f);
        const awayTeam = getAwayTeam(f);
        const dateStr  = formatMatchDate(f);

        let groupHeader = "";
        if (leagueKey === "AFCON") {
          const label = getAfconGroupLabel(f);
          if (label && label !== lastGroupLabel) {
            lastGroupLabel = label;
            groupHeader = `<h4 class="afcon-group-title">${formatTemplate(groupHeaderTpl, { group: label, n: roundNum })}</h4>`;
          }
        }

        // Default hidden message area (we set key/text when needed)
        // Keep a default fallback so it never shows "undefined"
        const defaultLocked = lockedStartedFallback || lockedPassedFallback || "Match has already started.";

        return `
          ${groupHeader}
          ${dateStr ? `<p class="match-date">${dateStr}</p>` : ""}
          <div class="match-card" data-fixture="${f.id}">
            <div class="teams">
              <div class="team left">
                <img class="team-logo home-logo" />
                <p>${teamNameHTML(homeTeam.name)}</p>
              </div>
              <div class="match-center">
                <p class="vs">VS</p>
                <p class="time">${ko}</p>
              </div>
              <div class="team right">
                <img class="team-logo away-logo" />
                <p>${teamNameHTML(awayTeam.name)}</p>
              </div>
            </div>

            <hr class="hr">

            <p class="prediction-label">${predictionLabelText}</p>

            <div class="score-inputs">
              <div class="score-box home-box">
                <button class="minus home-minus" type="button">-</button>
                <input class="home-val" type="number" min="0" readonly />
                <button class="plus home-plus" type="button">+</button>
              </div>

              <div class="score-box away-box">
                <button class="minus away-minus" type="button">-</button>
                <input class="away-val" type="number" min="0" readonly />
                <button class="plus away-plus" type="button">+</button>
              </div>
            </div>

            <p class="match-locked-msg" style="display:none;">${defaultLocked}</p>
          </div>
        `;
      })
      .join("");

    listEl.innerHTML = html;

    // ✅ apply i18n on injected team-name spans
    reapplyI18n();

    fixturesForRender.forEach((f) => {
      const row = listEl.querySelector(`.match-card[data-fixture="${f.id}"]`);
      if (!row) return;
      const id = String(f.id);
      const pred = userPred[id];

      if (window.FBL.ensureLogo) {
        const homeTeam = getHomeTeam(f);
        const awayTeam = getAwayTeam(f);
        window.FBL.ensureLogo(homeTeam, row.querySelector(".home-logo"));
        window.FBL.ensureLogo(awayTeam, row.querySelector(".away-logo"));
      }

     display(row.querySelector(".home-val"), "");
     display(row.querySelector(".away-val"), "");
    });
  }

  // ------------------------------------------------------------
  // Global +/- handler on window (capture phase)
  // ------------------------------------------------------------
  let plusMinusWired = false;
  function wirePlusMinus() {
    if (plusMinusWired) return;
    plusMinusWired = true;

    window.addEventListener(
      "click",
      function (e) {
        const btn = e.target.closest("button.plus, button.minus");
        if (!btn) return;
        const card = btn.closest(".match-card");
        if (!card) return;

        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const fixtureId = String(card.dataset.fixture || "");
        const pred = userPred[fixtureId];
        if (!pred) return;

        // ✅ LOCK editing after match starts/passes
        const fx = pageFixtures.find((x) => String(x.id) === fixtureId);
        if (fx) {
          const state = getMatchState(fx);
          if (state === "started" || state === "passed") {
            showMatchLockMsg(card, state);
            return;
          }
        }

        const isHome =
          btn.classList.contains("home-plus") ||
          btn.classList.contains("home-minus");
        const isPlus = btn.classList.contains("plus");

        if (isHome) {
          let cur = pred.homeScore;
          if (cur === null || Number.isNaN(cur)) cur = 0;
          cur = clamp(cur + (isPlus ? 1 : -1));
          pred.homeScore = cur;
          display(card.querySelector(".home-val"), cur);
        } else {
          let cur = pred.awayScore;
          if (cur === null || Number.isNaN(cur)) cur = 0;
          cur = clamp(cur + (isPlus ? 1 : -1));
          pred.awayScore = cur;
          display(card.querySelector(".away-val"), cur);
        }

        if (topDoneLink && !topDoneLink.classList.contains("done-active")) {
          topDoneLink.classList.add("done-active");
        }
      },
      true
    );
  }

  // ------------------------------------------------------------
  // Helpers, finalize & popup logic
  // ------------------------------------------------------------
  function leagueFolderFromKey(key) {
    if (key === "AFCON")      return "afcon";
    if (key === "LALIGA")     return "laliga";
    if (key === "BUNDESLIGA") return "bundesliga";
    return "premier";
  }

  function waitForFirebaseUser() {
    try {
      if (window.FBL_FIREBASE && window.FBL_FIREBASE.auth) {
        const auth = window.FBL_FIREBASE.auth;
        const u = auth.currentUser;
        if (u) return Promise.resolve(u);
        return new Promise((resolve) => {
          const unsub = auth.onAuthStateChanged((user) => {
            unsub();
            resolve(user || null);
          });
        });
      }
      if (window.firebase && firebase.auth) {
        const auth = firebase.auth();
        const u = auth.currentUser;
        if (u) return Promise.resolve(u);
        return new Promise((resolve) => {
          const unsub = auth.onAuthStateChanged((user) => {
            unsub();
            resolve(user || null);
          });
        });
      }
    } catch (_) {}
    return Promise.resolve(null);
  }

  let pending = [];

  async function finalizeAndContinue() {
    // ✅ Only allow saving edits for matches that have NOT started yet
    const touched = pageFixtures.filter((f) => {
      const p = userPred[String(f.id)];
      if (!isSet(p)) return false;
      const state = getMatchState(f);
      return state === "not_started";
    });

    if (!touched.length) {
      // optional: bilingual message
      alert(tSafe("predictions.matchLockedSaveMsg", "."));
      return;
    }

    pending = touched.map((f) => {
      const p = userPred[String(f.id)];
      const homeTeam = getHomeTeam(f);
      const awayTeam = getAwayTeam(f);

      let groupCode  = null;
      let groupLabel = null;
      if (leagueKey === "AFCON") {
        groupLabel = getAfconGroupLabel(f);
        groupCode  = getAfconGroupCode(f);
      }

      return {
        league:    leagueKey,
        fixtureId: String(f.id),
        matchday:  roundNum,

        group:      groupCode,
        groupLabel: groupLabel,

        home: { id: homeTeam.id, name: homeTeam.name, logo: homeTeam.logo || null, score: p.homeScore },
        away: { id: awayTeam.id, name: awayTeam.name, logo: awayTeam.logo || null, score: p.awayScore },

        kickoff:   f.utcDate || f.utc_date || f.date || null,
        timestamp: new Date().toISOString(), // ✅ latest modification wins
      };
    });

    sessionStorage.setItem("pending_predictions", JSON.stringify(pending));
    sessionStorage.setItem("FBL_leagueKey", leagueKey);

    closeConfirmPrompt();

    const folder = leagueFolderFromKey(leagueKey);
    const resultsPath = `../${folder}/results.html`;

    console.log("[PredictionsPage] confirm clicked. waiting for auth...");

    const user = await waitForFirebaseUser();
    if (!user) {
      console.warn("[PredictionsPage] No firebase user -> redirect signup");
      window.location.href = "../signup.html?next=" + encodeURIComponent(resultsPath);
      return;
    }

    pending = pending.map((p) => (p.uid ? p : { ...p, uid: user.uid }));

    if (!window.FBL_STORE || typeof window.FBL_STORE.savePredictionsForRound !== "function") {
      console.error("[PredictionsPage] FBL_STORE.savePredictionsForRound missing");
      alert("Storage not ready. Please refresh.");
      return;
    }

    try {
      console.log("[PredictionsPage] saving", pending.length, "predictions to Firestore...");
      await window.FBL_STORE.savePredictionsForRound(leagueKey, roundNum, pending);
      console.log("[PredictionsPage] saved OK. going to results:", resultsPath);
      window.location.href = resultsPath;
    } catch (err) {
      console.error("[PredictionsPage] save failed:", err);
      alert("Unable to save predictions right now. Please try again.");
    }
  }

  function openConfirmPrompt() {
    if (!overlayEl || !confirmListEl) return;

    // Badge text bilingual
    if (badgeEl) {
      badgeEl.textContent = formatTemplate(
        tSafe("predictions.leagueMatches", "{league} Matches"),
        { league: leagueInfo.name }
      );
    }

    // Matchday "n of total" bilingual
    if (matchdayTextEl) {
      matchdayTextEl.textContent = formatTemplate(
        tSafe("predictions.ofTotalShort", "{n} of {total}"),
        { n: roundNum, total: totalRounds }
      );
    }

    // ✅ Only confirm matches not started yet
    const touched = pageFixtures.filter((f) => {
      const p = userPred[String(f.id)];
      if (!isSet(p)) return false;
      const state = getMatchState(f);
      return state === "not_started";
    });

    if (!touched.length) {
      alert(tSafe("predictions.matchLockedSaveMsg", "."));
      return;
    }

    const rows = touched
      .map((f) => {
        const p = userPred[String(f.id)];
        const homeTeam = getHomeTeam(f);
        const awayTeam = getAwayTeam(f);
        return `
        <div class="gprompt__row">
          <img class="gprompt__logo gprompt__logo--home" />
          <div class="gprompt__team">${teamNameHTMLPlain(homeTeam.name)}</div>
          <div class="gprompt__score">${p.homeScore} - ${p.awayScore}</div>
          <img class="gprompt__logo gprompt__logo--away" />
          <div class="gprompt__team">${teamNameHTMLPlain(awayTeam.name)}</div>
        </div>`;
      })
      .join("");

    confirmListEl.innerHTML = rows;

    // ✅ apply i18n on injected popup team-name spans
    reapplyI18n();

    touched.forEach((f, i) => {
      const r = confirmListEl.querySelectorAll(".gprompt__row")[i];
      if (!r || !window.FBL.ensureLogo) return;
      window.FBL.ensureLogo(getHomeTeam(f), r.querySelector(".gprompt__logo--home"));
      window.FBL.ensureLogo(getAwayTeam(f), r.querySelector(".gprompt__logo--away"));
    });

    overlayEl.classList.add("is-open");
    overlayEl.setAttribute("aria-hidden", "false");
  }

  function closeConfirmPrompt() {
    if (!overlayEl) return;
    overlayEl.classList.remove("is-open");
    overlayEl.setAttribute("aria-hidden", "true");
  }

  function onDone(e) {
    e.preventDefault();
    openConfirmPrompt();
  }

  if (topDoneLink)   topDoneLink.addEventListener("click", onDone);
  if (bottomDoneBtn) bottomDoneBtn.addEventListener("click", onDone);
  if (closeBtn)      closeBtn.addEventListener("click", closeConfirmPrompt);
  if (cancelBtn)     cancelBtn.addEventListener("click", closeConfirmPrompt);
  if (confirmBtn)
    confirmBtn.addEventListener("click", (e) => {
      e.preventDefault();
      finalizeAndContinue();
    });

  // ------------------------------------------------------------
  // Initial render + wire clicks
  // ------------------------------------------------------------
  // ✅ minimal change: preload saved predictions (so edits overwrite same doc), then render
  (async function boot() {
    await preloadSavedPredictionsForThisRound();
    renderFixtures();
    wirePlusMinus();
  })();
})();
