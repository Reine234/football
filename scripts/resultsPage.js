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

  // ✅ matchday navigation state (kept in this script only)
  let __FBL_SELECTED_MATCHDAY__ = null;

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
  // Points rules:
  // 3 = exact score
  // 2 = correct winner AND exact goal difference (including draw predictions)
  // 1 = correct winner only
  // 0 = everything else
  if (!Number.isFinite(finH) || !Number.isFinite(finA)) return null;
  if (!Number.isFinite(predH) || !Number.isFinite(predA)) return 0;

  // exact score
  if (predH === finH && predA === finA) return 3;

  const finDiff = finH - finA;
  const predDiff = predH - predA;

  // NEW: if both predicted result and final result are draws, award 2 points
  if (predH === predA && finH === finA) return 2;

  // if the real match is a draw, only exact score earns points
  if (finDiff === 0) return 0;

  // predicted draw but match had a winner
  if (predDiff === 0) return 0;

  // correct winner?
  const sameWinner = (finDiff > 0 && predDiff > 0) || (finDiff < 0 && predDiff < 0);
  if (!sameWinner) return 0;

  // exact goal difference?
  if (predDiff === finDiff) return 2;

  return 1;
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


  // ✅ Matchday navigation (< >) + current label

// ✅ Matchday navigation: DO NOT create new buttons.
// We only "activate" the arrows/buttons that already exist in your HTML (the green ones).
function ensureMatchdayNav(matchdays, currentKey, onChange) {
  if (!matchdays || !matchdays.length) return;

  const idx = matchdays.indexOf(String(currentKey));
  const prevKey = idx > 0 ? matchdays[idx - 1] : null;
  const nextKey = idx >= 0 && idx < matchdays.length - 1 ? matchdays[idx + 1] : null;

  // Try explicit selectors first (if you already gave them ids/classes)
  function pickFirst(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // Fallback: look near the day number for arrow elements like "<" ">" "‹" "›"
  // ✅ Updated: walk up the DOM a few levels so we can find your existing green arrows
  // even if they are not direct siblings of #day-number.
  function findArrowNearDayNumber(dir) {
    const dayNum = document.getElementById("day-number");
    if (!dayNum) return null;

    const ARROWS_PREV = new Set(["<", "‹", "❮", "«"]);
    const ARROWS_NEXT = new Set([">", "›", "❯", "»"]);

    function looksLikePrev(el) {
      const t = String(el.textContent || "").trim();
      if (ARROWS_PREV.has(t)) return true;

      const cls = String(el.className || "").toLowerCase();
      const aria = String(el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title")) || "").toLowerCase();
      const data = String(el.getAttribute && (el.getAttribute("data-md-nav") || el.getAttribute("data-nav") || "") || "").toLowerCase();

      if (data === "prev" || data === "previous" || data === "back") return true;
      if (cls.includes("prev") || cls.includes("previous") || cls.includes("back") || cls.includes("left")) return true;
      if (aria.includes("prev") || aria.includes("previous") || aria.includes("back") || aria.includes("left")) return true;

      return false;
    }

    function looksLikeNext(el) {
      const t = String(el.textContent || "").trim();
      if (ARROWS_NEXT.has(t)) return true;

      const cls = String(el.className || "").toLowerCase();
      const aria = String(el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title")) || "").toLowerCase();
      const data = String(el.getAttribute && (el.getAttribute("data-md-nav") || el.getAttribute("data-nav") || "") || "").toLowerCase();

      if (data === "next" || data === "forward") return true;
      if (cls.includes("next") || cls.includes("forward") || cls.includes("right")) return true;
      if (aria.includes("next") || aria.includes("forward") || aria.includes("right")) return true;

      return false;
    }

    function findInHost(host) {
      if (!host) return null;

      // Prefer actual buttons/links (often contain SVG icons)
      const btns = Array.from(host.querySelectorAll("button,a,[role='button']"));

      if (dir === "prev") {
        // first: explicit arrows
        for (const el of btns) if (looksLikePrev(el)) return el;
        // then: any element that contains an svg and looks left-ish by class/aria
        for (const el of btns) {
          if (el.querySelector && el.querySelector("svg") && looksLikePrev(el)) return el;
        }
      } else {
        for (const el of btns) if (looksLikeNext(el)) return el;
        for (const el of btns) {
          if (el.querySelector && el.querySelector("svg") && looksLikeNext(el)) return el;
        }
      }

      // Then: fallback to any element with arrow glyph text
      const all = Array.from(host.querySelectorAll("*"));
      if (dir === "prev") {
        for (const el of all) if (looksLikePrev(el)) return el;
      } else {
        for (const el of all) if (looksLikeNext(el)) return el;
      }

      return null;
    }

    // Walk up a few ancestors until we find the arrow controls.
    let host = dayNum;
    for (let i = 0; i < 6 && host; i++) {
      const found = findInHost(host.parentElement || host);
      if (found) return found;
      host = host.parentElement;
    }
    return null;
  }

  const prevBtn =
    pickFirst([
      "#matchday-prev",
      "#md-prev",
      ".matchday-prev",
      ".md-prev",
      '[data-md-nav="prev"]',
      '[data-action="prev"]',
    ]) || findArrowNearDayNumber("prev");

  const nextBtn =
    pickFirst([
      "#matchday-next",
      "#md-next",
      ".matchday-next",
      ".md-next",
      '[data-md-nav="next"]',
      '[data-action="next"]',
    ]) || findArrowNearDayNumber("next");

  function setDisabled(el, disabled) {
    if (!el) return;
    if ("disabled" in el) el.disabled = !!disabled;
    el.style.opacity = disabled ? "0.35" : "";
    el.style.pointerEvents = disabled ? "none" : "";
    if (disabled) el.setAttribute("aria-disabled", "true");
    else el.removeAttribute("aria-disabled");
  }

  function bind(el, key) {
    if (!el) return;
    // prevent double-binding
    if (el.dataset && el.dataset.fblBound === "1") return;
    if (el.dataset) el.dataset.fblBound = "1";

    el.addEventListener("click", (e) => {
      // don't break links if you used <a>
      e.preventDefault();
      if (!key || key === currentKey) return;
      if (typeof onChange === "function") onChange(key);
    });
  }

  setDisabled(prevBtn, !prevKey);
  setDisabled(nextBtn, !nextKey);

  // Re-bind each time because currentKey changes
  // (we overwrite by disabling pointer-events + using currentKey check)
  bind(prevBtn, prevKey);
  bind(nextBtn, nextKey);
}


  function kickoffMsForPred(pred, fixturesById, fixturesList) {
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
    const kickoffIso =
      pred.kickoff ||
      getKickoffIsoFromFixture(fixture) ||
      pred.timestamp ||
      "";
    const ms = Date.parse(kickoffIso || "");
    return Number.isFinite(ms) ? ms : 0;
  }

  function formatKickoffDateOnly(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const lang = getLangSafe();
    try {
      return new Intl.DateTimeFormat(lang, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(d);
    } catch (_) {
      return d.toDateString();
    }
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

  function normalizeName(name) {
    return String(name || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  // ✅ NEW helper: always compute YYYY-MM-DD in UTC safely
  function toYMD_UTC(input) {
    if (input == null || input === "") return "";
    const s = String(input);

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    const n = Number(input);
    if (Number.isFinite(n)) {
      const ms = n < 1e12 ? n * 1000 : n;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        const y = d.getUTCFullYear();
        const m = String(d.getUTCMonth() + 1).padStart(2, "0");
        const day = String(d.getUTCDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
    }

    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
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

    // ✅ AFCON name aliases (minimal fix for Côte d’Ivoire / Ivory Coast variants)
    const alias = (name) => {
      const raw = String(name || "").trim();

      // normalize apostrophes for matching
      const n = raw.replace(/’/g, "'");

      // Côte d’Ivoire variants
      if (/^c(ô|o)te d'?ivoire$/i.test(n.replace(/\s+/g, " "))) return "Cote d'Ivoire";
      if (/^ivory coast$/i.test(n)) return "Cote d'Ivoire";

      return raw;
    };

    const H = alias(home);
    const A = alias(away);

    // try primary
    const makeUrl = (h, a) =>
      `/afcon/finalScore?home=${encodeURIComponent(h)}&away=${encodeURIComponent(a)}&date=${encodeURIComponent(dateYMD)}`;

    let r = await fetch(makeUrl(H, A), { credentials: "same-origin" });
    if (r.ok) {
      const data = await r.json();
      if (data && data.found) return data;
    }

    // ✅ fallback: try swapping home/away (some APIs store reversed)
    r = await fetch(makeUrl(A, H), { credentials: "same-origin" });
    if (!r.ok) return null;

    const data2 = await r.json();
    if (!data2 || !data2.found) return null;
    return data2;
  } catch (_e) {
    return null;
  }
}

async function getFirestoreFixtureById(fixtureId) {
  try {
    if (!window.firebase || !firebase.firestore) return null;
    const doc = await firebase.firestore().collection("fixtures").doc(String(fixtureId)).get();
    return doc.exists ? doc.data() : null;
  } catch (e) {
    console.warn("[resultsPage] Firestore fixture lookup failed:", e);
    return null;
  }
}

  function isAfconScoreFinal(score) {
    if (!score) return false;
    const raw = String(score.status || score.statusText || score.state || "").trim();
    if (!raw) return false;

    const s = raw.toUpperCase();
    if (s === "FT" || s === "AET" || s === "PEN") return true;
    if (s.includes("FINISHED") || s.includes("MATCH FINISHED") || s.includes("FULL TIME")) return true;
    if (s.includes("NOT STARTED") || s === "NS" || s.includes("SCHEDULED") || s.includes("TIMED") || s.includes("POSTPON")) return false;
    return false;
  }

  // ✅ CHANGE: return a cache so rendering can use it even if fixture match fails
  async function hydrateAfconFinalScores(preds, fixturesById, fixturesList) {
    const finalScoreCache = {};
    // ✅ Firestore hard-override for AFCON final scores (authoritative)
if (leagueKey === "AFCON") {
  for (const p of preds) {
    const fid = String(p.fixtureId || "");
    if (!fid) continue;

    const fsFx = await getFirestoreFixtureById(fid);
    if (!fsFx) continue;

    // Merge Firestore fixture as authoritative
    fixturesById[fid] = { ...(fixturesById[fid] || {}), ...fsFx };

    // Also keep fixturesList consistent (optional but helps findAfconFixture)
    const idx = (fixturesList || []).findIndex(x => String(x?.id) === fid);
    if (idx >= 0) fixturesList[idx] = { ...(fixturesList[idx] || {}), ...fsFx };
    else (fixturesList || []).push(fsFx);
  }
}
    const seen = new Set();
    for (const p of preds) {
      const homeFromPred = p.home && p.home.name ? p.home.name : "";
      const awayFromPred = p.away && p.away.name ? p.away.name : "";

      let fx = fixturesById[String(p.fixtureId)] || null;
      if (!fx && p.fixture && p.fixture.id != null) fx = fixturesById[String(p.fixture.id)] || null;
      if (!fx && p.apiFixtureId != null) fx = fixturesById[String(p.apiFixtureId)] || null;
      if (!fx) fx = findAfconFixture(p, fixturesList);

      const homeName = getTeamNameFromFixture(fx, "home") || homeFromPred;
      const awayName = getTeamNameFromFixture(fx, "away") || awayFromPred;

      const kickoffIso =
        p.kickoff ||
        getKickoffIsoFromFixture(fx) ||
        p.timestamp ||
        "";

      const dateYMD = toYMD_UTC(kickoffIso);

      if (!homeName || !awayName || !dateYMD) continue;

      const key = normalizeName(homeName) + "|" + normalizeName(awayName) + "|" + dateYMD;
      if (seen.has(key)) continue;
      seen.add(key);

      // If fixture already has final goals, also store them in cache
      if (fx) {
        const g = getFinalGoalsFromFixture(fx);
        if (g.home !== "" && g.away !== "") {
          finalScoreCache[key] = { home: Number(g.home), away: Number(g.away) };
          continue;
        }
      }

      const score = await fetchAfconFinalScore(homeName, awayName, dateYMD);
      if (!score) continue;
      if (!isAfconScoreFinal(score)) continue;

      // store cache (always)
      finalScoreCache[key] = { home: Number(score.homeScore), away: Number(score.awayScore) };

      // inject into fixture if we have one
      if (fx) {
        fx.goals = { home: Number(score.homeScore), away: Number(score.awayScore) };
        fx.status = { short: "FT", long: score.status || "Match Finished" };
      }
    }

    return finalScoreCache;
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

  // ✅ CHANGE: buildCardHTML now can use finalScoreCache when fixture missing/not finished
  function buildCardHTML(idx, pred, fixture, finalScoreCache) {
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

    // ✅ Late prediction (submitted after kickoff) => always 0 points (but still displayed)
    const isLatePrediction = (() => {
      const ko = Date.parse(kickoffIso || "");
      const pt = Date.parse(pred.timestamp || "");
      return Number.isFinite(ko) && Number.isFinite(pt) && pt > ko;
    })();

    const predHomeVal = pred.home && pred.home.score != null ? pred.home.score : "";
    const predAwayVal = pred.away && pred.away.score != null ? pred.away.score : "";

    const finalGoals = getFinalGoalsFromFixture(fixture);
    let finHome = finalGoals.home !== "" && finalGoals.home != null ? finalGoals.home : "";
    let finAway = finalGoals.away !== "" && finalGoals.away != null ? finalGoals.away : "";

    // ✅ fallback: use cache for AFCON if fixture did not yield goals
    if (leagueKey === "AFCON" && (finHome === "" || finAway === "")) {
      const dateYMD = toYMD_UTC(kickoffIso);
      const cacheKey = normalizeName(homeName) + "|" + normalizeName(awayName) + "|" + dateYMD;
      const cached = finalScoreCache && finalScoreCache[cacheKey];
      if (cached && Number.isFinite(cached.home) && Number.isFinite(cached.away)) {
        finHome = cached.home;
        finAway = cached.away;
      }
    }

    const finHomeForCalc = finHome === "" ? NaN : Number(finHome);
    const finAwayForCalc = finAway === "" ? NaN : Number(finAway);

    const ptsRaw = computePoints(
      Number(predHomeVal),
      Number(predAwayVal),
      finHomeForCalc,
      finAwayForCalc
    );

    // ✅ enforce 0 points for late predictions (only when a final score exists)
    const pts = isLatePrediction && ptsRaw !== null ? 0 : ptsRaw;

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
    return { html, pts, isLatePrediction };
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

    // ✅ CHANGE: do NOT remove late predictions; we keep them but award 0 points.
    // preds = filterPredictionsAfterKickoff(preds, fixturesById, fixturesList);
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

    // ✅ get final score cache here
    const finalScoreCache = await hydrateAfconFinalScores(preds, fixturesById, fixturesList);


    // ✅ Matchday navigation: show one matchday at a time (with < >)
    const matchdays = Array.from(
      new Set(
        preds
          .map((p) => String(p.matchday || "").trim())
          .filter((x) => x && x !== "undefined" && x !== "null")
      )
    ).sort((a, b) => {
      const nA = parseInt(a, 10);
      const nB = parseInt(b, 10);
      if (Number.isFinite(nA) && Number.isFinite(nB)) return nA - nB;
      return String(a).localeCompare(String(b));
    });

    const maxMd = matchdays.length ? matchdays[matchdays.length - 1] : "?";
    if (!__FBL_SELECTED_MATCHDAY__ || !matchdays.includes(String(__FBL_SELECTED_MATCHDAY__))) {
      __FBL_SELECTED_MATCHDAY__ = maxMd || "?";
    }

    ensureMatchdayNav(matchdays, String(__FBL_SELECTED_MATCHDAY__), (newKey) => {
      __FBL_SELECTED_MATCHDAY__ = String(newKey);
      renderResultsPage();
    });

    updateMatchdayHeader(__FBL_SELECTED_MATCHDAY__ || "?");

    // ✅ Render only the selected matchday (still displaying late predictions)
    let predsForMd = preds.filter(
      (p) => String(p.matchday || "").trim() === String(__FBL_SELECTED_MATCHDAY__ || "").trim()
    );

    // order by kickoff time so the date order is clear
    predsForMd.sort(
      (a, b) => kickoffMsForPred(a, fixturesById, fixturesList) - kickoffMsForPred(b, fixturesById, fixturesList)
    );

    let totalPts = 0;
    const predictionsWithPoints = [];


    // ✅ If the selected matchday has no predictions, show a simple message
    if (!predsForMd.length) {
      container.innerHTML = `<p style="padding:12px;">${esc(
        tr("results.noPredictions", { league: leagueInfo.name })
      )}</p>`;
      if (totalSpan) totalSpan.textContent = "0";
      retryFixMatchdayTitle();
      return;
    }

    let lastDateLabel = "";
    const cardsHtml = predsForMd
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

        const kickoffIso =
          pred.kickoff ||
          getKickoffIsoFromFixture(fixture) ||
          pred.timestamp ||
          "";

        const dateLabel = formatKickoffDateOnly(kickoffIso);
        const dateHeader =
          dateLabel && dateLabel !== lastDateLabel
            ? (() => {
                lastDateLabel = dateLabel;
                return `<h3 class="match-date" style="margin:14px 12px 6px; font-size:15px; opacity:0.9;">${esc(dateLabel)}</h3>`;
              })()
            : "";

        const { html, pts } = buildCardHTML(i + 1, pred, fixture, finalScoreCache);
        if (pts != null) {
          totalPts += pts;
          predictionsWithPoints.push({ fixtureId: pred.fixtureId, points: pts });
        }
        return dateHeader + html;
      })
      .join("");


    container.innerHTML =
      cardsHtml || `<p style="padding:12px;">${esc(tr("results.noResultsYet"))}</p>`;

    predsForMd.forEach((pred) => {
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

    fixDailyRankingTabs();

    retryFixMatchdayTitle();
  }

  window.renderResultsPage = renderResultsPage;

  // ✅ DAILY RANKING TABS FIX (AFCON): force exactly 3 tabs for Matchdays 1-3
  function fixDailyRankingTabs() {
    const lang = String(getLangSafe() || "en").toLowerCase();
    const isFr = lang.startsWith("fr");
    const label = (n) => (isFr ? `Journée ${n}` : `Matchday ${n}`);

    // try to find the tabs container (keep selectors broad & safe)
    const tabRoots = [
      document.querySelector("#daily-ranking"),
      document.querySelector(".daily-ranking"),
      document.querySelector(".daily-ranking-tabs"),
      document.querySelector(".ranking-tabs"),
      document.querySelector(".dailyRanking"),
    ].filter(Boolean);

    const scope = tabRoots[0] || document;

    // collect likely tab elements
    let tabs = Array.from(
      scope.querySelectorAll('[role="tab"], .tab, .tabs button, .tabs li, .tabs a, button')
    );

    // keep only elements that look like the ranking tabs (avoid page buttons etc.)
    tabs = tabs.filter((el) => {
      if (!el || !el.textContent) return false;
      const t = String(el.textContent).toLowerCase();
      return t.includes("group") || t.includes("matchday") || t.includes("journee") || t.includes("journée") || t.includes("?") || el.getAttribute("role") === "tab";
    });

    if (!tabs.length) return;

    // Keep first 3, hide the rest
    const first3 = tabs.slice(0, 3);
    first3.forEach((el, i) => {
      el.textContent = label(i + 1);
      el.style.display = "";
    });
    tabs.slice(3).forEach((el) => {
      el.style.display = "none";
    });
  }


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
