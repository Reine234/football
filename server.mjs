// server.mjs

// Try to load .env automatically if it exists
try {
  await import("dotenv/config");
} catch (err) {
  /* ignore if dotenv isn't installed */
}

// ------------------------
// Imports
// ------------------------
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

import cookieParser from "cookie-parser";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import crypto from "crypto";
import fs from "fs/promises";
import { v4 as uuidv4 } from "uuid";

// ------------------------
// __dirname in ES module land
// ------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ------------------------
// App setup
// ------------------------
const app = express();
const PORT = process.env.PORT || 5000;

app.set("trust proxy", 1); // important for cookies behind proxies (Render, etc.)

// Allow requests from your browser/app and send cookies
app.use(
  cors({
    origin: (origin, cb) => cb(null, true), // reflect any origin during dev
    credentials: true, // allow cookies
  })
);
app.use(express.json()); // parse JSON
app.use(cookieParser()); // read/set cookies

// Serve ALL your frontend files (HTML, CSS, JS, images...) from the project folder
app.use(express.static(__dirname, { extensions: ["html", "js", "css"] })); // Added extensions for proper handling
// server.mjs

// Prevent accidental access to server-side data
app.use("/data", (_req, res) => res.sendStatus(404));

// Default route → REDIRECT to /afcon/ so relative links work
app.get("/", (_req, res) => {
  res.redirect(302, "/afcon/land.html");
});

// Optional safety: if any old root links are hit, forward them too
app.get("/predictions.html", (_req, res) =>
  res.redirect(302, "/afcon/predictions.html")
);
app.get("/results.html", (_req, res) => res.redirect(302, "/afcon/results.html"));
app.get("/index.html", (_req, res) => res.redirect(302, "/afcon/index.html"));
app.get("/winners.html", (_req, res) =>
  res.redirect(302, "/afcon/winners.html")
);

// Add this route to your server.mjs

// Fetch matchdays for a specific league (simplified for now)
app.get("/api/getMatchdays", async (req, res) => {
  const league = req.query.league; // Extract league from the query string

  // Check if the league is valid
  if (!league || !["PREMIER_LEAGUE", "BUNDESLIGA", "LALIGA", "AFCON"].includes(league)) {
    return res.status(400).json({ error: "Invalid league" });
  }

  // Dummy matchdays for each league, in a real-world scenario you'd query a database or an external API.
  const matchdays = {
    PREMIER_LEAGUE: Array.from({ length: 38 }, (_, i) => `Matchday ${i + 1}`),
    BUNDESLIGA: Array.from({ length: 34 }, (_, i) => `Matchday ${i + 1}`),
    LALIGA: Array.from({ length: 38 }, (_, i) => `Matchday ${i + 1}`),
    AFCON: ["Matchday 1", "Matchday 2", "Matchday 3", "Matchday 4", "Matchday 5", "Matchday 6"],
  };

  // Send back the matchdays for the requested league
  const leagueMatchdays = matchdays[league] || [];
  res.json({ matchdays: leagueMatchdays });
});

// ------------------------
// Upstream APIs
// ------------------------
const SD_BASE = "https://www.thesportsdb.com/api/v1/json";
const SD_KEY = process.env.TSD_API_KEY || "3"; // public key

const FD_BASE = "https://api.football-data.org/v4";
const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN || ""; // <-- set this in .env or Render

const FD_HEADERS = FD_TOKEN ? { "X-Auth-Token": FD_TOKEN } : {};

console.log(`[FD] token set: ${FD_TOKEN ? "yes" : "NO (set FOOTBALL_DATA_TOKEN)"}`);

// ------------------------
// Tiny cache so we don't spam the APIs
// ------------------------
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_TTL_DAY = 24 * 60 * 60 * 1000; // 1 day

const cache = new Map(); // key -> { data, expires }
const inflight = new Map(); // key -> Promise

function getCache(key) {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  if (hit) cache.delete(key);
  return null;
}

function setCache(key, value, ttl = CACHE_TTL_MS) {
  cache.set(key, { data: value, expires: Date.now() + ttl });
}

async function fetchJSON(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`${r.status} ${r.statusText} :: ${txt}`);
  }
  return r.json();
}

async function fetchDeduped(url, opts = {}, ttl = CACHE_TTL_MS) {
  const cacheKey = url + "::" + JSON.stringify(opts.headers || {});
  const fromCache = getCache(cacheKey);
  if (fromCache) return fromCache;

  if (inflight.has(cacheKey)) return inflight.get(cacheKey);

  const p = fetchJSON(url, opts)
    .then((data) => {
      setCache(cacheKey, data, ttl);
      inflight.delete(cacheKey);
      return data;
    })
    .catch((err) => {
      inflight.delete(cacheKey);
      throw err;
    });

  inflight.set(cacheKey, p);
  return p;
}

// ------------------------
// Helpers (FD mapping -> AF-like response)
// ------------------------
function mapLeagueToFDCode(input) {
  const s = String(input || "").toLowerCase().trim();

  // numeric ids → FD codes
  if (s === "39") return "PL"; // Premier League
  if (s === "78") return "BL1"; // Bundesliga
  if (s === "140") return "PD"; // LaLiga
  // ⛔ AFCON has no FD code → don't map here

  // text → FD codes
  if (["premier", "epl", "premierleague", "england", "pl"].includes(s)) return "PL";
  if (["bundesliga", "germany", "de", "bl1"].includes(s)) return "BL1";
  if (["laliga", "la liga", "spain", "pd"].includes(s)) return "PD";

  // AFCON will be handled via SportMonks, not FD
  if (["pl", "bl1", "pd"].includes(s)) return s.toUpperCase();

  return "PL"; // default
}

function mapFDStatusToAF(status) {
  switch (status) {
    case "SCHEDULED":
    case "TIMED":
      return "NS";
    case "IN_PLAY":
    case "PAUSED":
      return "1H";
    case "FINISHED":
      return "FT";
    case "POSTPONED":
      return "PST";
    case "CANCELLED":
      return "CANC";
    case "SUSPENDED":
      return "SUSP";
    default:
      return status || "NS";
  }
}

function fdMatchToAfNode(m) {
  const dateISO = m.utcDate;
  const ts = Date.parse(dateISO);
  const matchday = m.matchday ?? null;
  const roundName = matchday ? `Regular Season - ${matchday}` : m.stage || "Regular Season";

  return {
    fixture: {
      id: m.id,
      date: dateISO,
      timestamp: isNaN(ts) ? undefined : Math.floor(ts / 1000),
      timezone: "UTC",
      status: {
        short: mapFDStatusToAF(m.status),
        long: m.status,
        elapsed: null,
      },
      venue: m.venue || null,
      referee: m.referees?.[0]?.name || null,
    },
    league: {
      id: m.competition?.id ?? null,
      name: m.competition?.name ?? null,
      country: m.area?.name ?? null,
      logo: m.competition?.emblem ?? null,
      season: m.season?.startDate ? new Date(m.season.startDate).getFullYear() : null,
      round: roundName,
    },
    teams: {
      home: {
        id: m.homeTeam?.id ?? null,
        name: m.homeTeam?.name ?? "",
        logo: m.homeTeam?.crest ?? "",
        winner:
          m.score?.winner === "HOME_TEAM"
            ? true
            : m.score?.winner === "AWAY_TEAM"
            ? false
            : null,
      },
      away: {
        id: m.awayTeam?.id ?? null,
        name: m.awayTeam?.name ?? "",
        logo: m.awayTeam?.crest ?? "",
        winner:
          m.score?.winner === "AWAY_TEAM"
            ? true
            : m.score?.winner === "HOME_TEAM"
            ? false
            : null,
      },
    },
    goals: {
      home: m.score?.fullTime?.home ?? null,
      away: m.score?.fullTime?.away ?? null,
    },
    score: {
      halftime: m.score?.halfTime ?? {},
      fulltime: m.score?.fullTime ?? {},
      extratime: m.score?.extraTime ?? {},
      penalty: m.score?.penalties ?? {},
    },
  };
}

// ------------------------
// ✅ AFCON FINAL SCORE PROXY (TheSportsDB)
// Minimal addition: lets your frontend ask for final score by (home, away, date)
// ------------------------
function _normTeam(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function _sameDay(dateEvent, dateQuery) {
  // both expected like "YYYY-MM-DD"
  return String(dateEvent || "").slice(0, 10) === String(dateQuery || "").slice(0, 10);
}

// GET /afcon/finalScore?home=Morocco&away=Comoros&date=2025-12-21
// GET /afcon/finalScore?home=Morocco&away=Comoros&date=2025-12-21
app.get("/afcon/finalScore", async (req, res) => {
  try {
    const home = String(req.query.home || "").trim();
    const away = String(req.query.away || "").trim();
    const date = String(req.query.date || "").trim(); // YYYY-MM-DD (recommended)

    if (!home || !away) {
      return res.status(400).json({ error: "Missing ?home= and/or ?away=" });
    }

    const H = _normTeam(home);
    const A = _normTeam(away);

    function hasScore(e) {
      const hs = e?.intHomeScore;
      const as = e?.intAwayScore;
      return hs !== null && hs !== undefined && hs !== "" && as !== null && as !== undefined && as !== "";
    }

    function dayMs(yyyy_mm_dd) {
      const ms = Date.parse(String(yyyy_mm_dd || "") + "T00:00:00Z");
      return Number.isFinite(ms) ? ms : NaN;
    }

    function eventDayMs(e) {
      const d = String(e?.dateEvent || "").slice(0, 10);
      return dayMs(d);
    }

    function pickBest(cands) {
      if (!Array.isArray(cands) || !cands.length) return null;

      // soccer only
      let list = cands.filter((e) => String(e?.strSport || "").toLowerCase() === "soccer");
      if (!list.length) list = cands.slice();

      // prefer same day if date provided
      const qDay = date ? dayMs(date) : NaN;

      // Team match (strict first, then fuzzy)
      const strict = list.filter(
        (e) => _normTeam(e?.strHomeTeam) === H && _normTeam(e?.strAwayTeam) === A
      );
      const fuzzy = list.filter(
        (e) =>
          _normTeam(e?.strHomeTeam).includes(H) &&
          _normTeam(e?.strAwayTeam).includes(A)
      );

      const pool = strict.length ? strict : fuzzy.length ? fuzzy : list;

      // If date is provided: prefer same-day results, else closest day
      if (date && Number.isFinite(qDay)) {
        const sameDay = pool.filter((e) => _sameDay(e?.dateEvent, date));
        if (sameDay.length) {
          // among same day, prefer those with scores
          const withScore = sameDay.filter(hasScore);
          return withScore[0] || sameDay[0];
        }

        // otherwise pick closest date, preferring events with score
        const scored = pool.filter(hasScore);
        const base = scored.length ? scored : pool;

        base.sort((x, y) => {
          const dx = Math.abs(eventDayMs(x) - qDay);
          const dy = Math.abs(eventDayMs(y) - qDay);
          return dx - dy;
        });

        return base[0] || null;
      }

      // No date: just prefer score first
      const withScore = pool.filter(hasScore);
      return withScore[0] || pool[0] || null;
    }

    // 1) searchevents "Home vs Away"
    const q1 = `${home} vs ${away}`;
    const url1 = `${SD_BASE}/${SD_KEY}/searchevents.php?e=${encodeURIComponent(q1)}`;
    console.log("[GET] /afcon/finalScore (searchevents) ->", url1);

    let data1 = await fetchDeduped(url1, {}, CACHE_TTL_MS);
    let events1 = Array.isArray(data1?.event) ? data1.event : [];
    let best = pickBest(events1);

    if (!best) {
  // -----------------------------------------
  // ✅ FALLBACK: SportMonks (AFCON) if TSDB missing
  // -----------------------------------------
  try {
    const token =
      process.env.SPORTMONKS_TOKEN ||
      "lDfEJAPMuQJQLqRfxhbvQuDMgMfJDrfxiVGi6uwrDVNq4alQQ1ApO3eKWEzt";
    const seasonId = process.env.SPORTMONKS_AFCON_SEASON_ID || "25138";

    // fetch cached season fixtures (same endpoint you already have)
    const filters = `season_id:${seasonId}`;
    const smUrl =
      "https://api.sportmonks.com/v3/football/fixtures" +
      "?filters=" +
      encodeURIComponent(filters) +
      "&include=localTeam,visitorTeam,scores,round" +
      "&api_token=" +
      encodeURIComponent(token);

    const sm = await fetchDeduped(smUrl, {}, CACHE_TTL_MS);
    const list = Array.isArray(sm?.data) ? sm.data : [];

    const H = _normTeam(home);
    const A = _normTeam(away);

    // Match by teams + (optional) date tolerance
    const dateQuery = date ? String(date).slice(0, 10) : "";
    const isSameOrNearDay = (fixtureDate) => {
      if (!dateQuery) return true;
      const d0 = new Date(dateQuery + "T00:00:00Z").getTime();
      const d1 = new Date(String(fixtureDate).slice(0, 10) + "T00:00:00Z").getTime();
      if (!Number.isFinite(d0) || !Number.isFinite(d1)) return false;
      const diffDays = Math.round(Math.abs(d1 - d0) / (24 * 60 * 60 * 1000));
      return diffDays <= 1; // tolerate +/- 1 day
    };

    const hit = list.find((fx) => {
      const homeName = fx?.localTeam?.data?.name || fx?.localTeam?.name || "";
      const awayName = fx?.visitorTeam?.data?.name || fx?.visitorTeam?.name || "";
      const fh = _normTeam(homeName);
      const fa = _normTeam(awayName);

      const teamsMatch =
        (fh === H && fa === A) ||
        (fh === A && fa === H) ||
        (fh.includes(H) && fa.includes(A)) ||
        (fh.includes(A) && fa.includes(H));

      const fxDate = fx?.starting_at || fx?.starting_at_timestamp || fx?.time?.starting_at || "";
      const dateOk = fxDate ? isSameOrNearDay(fxDate) : true;

      return teamsMatch && dateOk;
    });

    if (hit) {
      // Try to extract full-time goals from SportMonks scores array (structure can vary)
      const scores = Array.isArray(hit?.scores?.data) ? hit.scores.data : (Array.isArray(hit?.scores) ? hit.scores : []);
      let homeGoals = null;
      let awayGoals = null;
      let statusText = String(hit?.result_info || hit?.state || "").trim();

      // Scan for anything that looks like FT goals
      for (const s of scores) {
        const desc = String(s?.description || s?.type?.name || "").toLowerCase();
        const isFT =
          desc.includes("full") ||
          desc.includes("ft") ||
          desc.includes("final") ||
          (s?.type_id === 2); // common FT type_id in some SportMonks setups (safe extra hint)

        // Common patterns:
        // 1) s.score.goals + s.score.participant ("home"/"away")
        // 2) s.home / s.away
        // 3) s.score.home / s.score.away
        if (s?.score && typeof s.score === "object") {
          if (s.score.participant && s.score.goals != null) {
            const part = String(s.score.participant).toLowerCase();
            if (part.includes("home") || part.includes("local")) homeGoals = Number(s.score.goals);
            if (part.includes("away") || part.includes("visitor")) awayGoals = Number(s.score.goals);
          }
          if (s.score.home != null && s.score.away != null) {
            homeGoals = Number(s.score.home);
            awayGoals = Number(s.score.away);
          }
        }
        if (s?.home != null && s?.away != null) {
          homeGoals = Number(s.home);
          awayGoals = Number(s.away);
        }

        // Prefer FT-like rows, but if we already got both goals, we can stop
        if (homeGoals != null && awayGoals != null && (isFT || !statusText)) break;
      }

      if (Number.isFinite(homeGoals) && Number.isFinite(awayGoals)) {
        res.set("Cache-Control", "public, max-age=120");
        return res.json({
          found: true,
          source: "sportmonks",
          eventId: hit?.id || null,
          league: "AFCON",
          season: String(seasonId),
          dateEvent: String(hit?.starting_at || "").slice(0, 10) || dateQuery || null,
          time: hit?.starting_at ? String(hit.starting_at).slice(11, 19) : null,
          status: statusText || "Match Finished",
          homeTeam: home,
          awayTeam: away,
          homeScore: Number(homeGoals),
          awayScore: Number(awayGoals),
          homeScoreRaw: String(homeGoals),
          awayScoreRaw: String(awayGoals),
          raw: hit,
        });
      }
    }
  } catch (e) {
    console.warn("[AFCON] SportMonks fallback failed:", e.message);
  }

  // If still not found after fallback
  return res.json({
    found: false,
    home,
    away,
    date: date || null,
    message: "No matching event found (TheSportsDB + SportMonks fallback).",
  });
}


    // 3) eve// 3) If still not found and date was provided, try eventsday.php on date, date-1, date+1
if (!best && date) {
  const base = new Date(date + "T00:00:00Z");
  const datesToTry = [
    date, // exact
    new Date(base.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // -1 day
    new Date(base.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // +1 day
  ];

  for (const dTry of datesToTry) {
    const url3 = `${SD_BASE}/${SD_KEY}/eventsday.php?d=${encodeURIComponent(dTry)}&s=Soccer`;
    console.log("[GET] /afcon/finalScore (eventsday) ->", url3);

    const day = await fetchDeduped(url3, {}, CACHE_TTL_MS);
    const dayEvents = Array.isArray(day?.events) ? day.events : [];

    const cand = dayEvents.filter((e) => {
      const eh = _normTeam(e?.strHomeTeam);
      const ea = _normTeam(e?.strAwayTeam);
      return (
        (eh === H && ea === A) ||
        (eh === A && ea === H) ||
        (eh.includes(H) && ea.includes(A)) ||
        (eh.includes(A) && ea.includes(H))
      );
    });

    best =
      cand.find((e) => String(e?.strStatus || "").toLowerCase().includes("finished")) ||
      cand.find((e) => e?.intHomeScore != null || e?.intAwayScore != null) ||
      cand[0] ||
      null;

    if (best) break;
  }


      for (const dTry of datesToTry) {
        const url3 = `${SD_BASE}/${SD_KEY}/eventsday.php?d=${encodeURIComponent(dTry)}&s=Soccer`;
        console.log("[GET] /afcon/finalScore (eventsday) ->", url3);

        const day = await fetchDeduped(url3, {}, CACHE_TTL_MS);
        const dayEvents = Array.isArray(day?.events) ? day.events : [];

        const cand = dayEvents.filter((e) => {
          const eh = _normTeam(e?.strHomeTeam);
          const ea = _normTeam(e?.strAwayTeam);
          return (
            (eh === H && ea === A) ||
            (eh.includes(H) && ea.includes(A)) ||
            (eh === A && ea === H) ||
            (eh.includes(A) && ea.includes(H))
          );
        });

        best = pickBest(cand);
        if (best) break;
      }
    }

    if (!best) {
      return res.json({
        found: false,
        home,
        away,
        date: date || null,
        message: "No matching event found from TheSportsDB yet (may be delayed).",
      });
    }

    const homeScoreRaw = best?.intHomeScore ?? null;
    const awayScoreRaw = best?.intAwayScore ?? null;

    const homeScore =
      homeScoreRaw === null || homeScoreRaw === undefined || homeScoreRaw === ""
        ? null
        : Number(homeScoreRaw);
    const awayScore =
      awayScoreRaw === null || awayScoreRaw === undefined || awayScoreRaw === ""
        ? null
        : Number(awayScoreRaw);

    res.set("Cache-Control", "public, max-age=120");
    return res.json({
      found: true,
      eventId: best?.idEvent || null,
      league: best?.strLeague || null,
      season: best?.strSeason || null,
      dateEvent: best?.dateEvent || null,
      time: best?.strTime || null,
      status: best?.strStatus || null,
      homeTeam: best?.strHomeTeam || home,
      awayTeam: best?.strAwayTeam || away,
      homeScore,
      awayScore,
      homeScoreRaw,
      awayScoreRaw,
      raw: best,
    });
  } catch (e) {
    console.error("❌ /afcon/finalScore failed:", e.message);
    res.status(502).json({ error: e.message });
  }
});

// ------------------------
// FD-backed API-Football-shaped routes
// ------------------------
app.get("/af/fixtures", async (req, res) => {
  try {
    if (!FD_TOKEN) {
      return res.status(500).json({ error: "No FOOTBALL_DATA_TOKEN set" });
    }

    const { league, season, from, to } = req.query;
    const code = mapLeagueToFDCode(league || "PL");
    const seasonSafe = season ? Number(season) : 2025;

    const params = new URLSearchParams({
      season: String(seasonSafe),
      limit: "500",
    });
    if (from) params.set("dateFrom", from);
    if (to) params.set("dateTo", to);

    const url = `${FD_BASE}/competitions/${encodeURIComponent(code)}/matches?${params.toString()}`;
    console.log("[GET] /af/fixtures ->", url);

    const fd = await fetchDeduped(url, { headers: FD_HEADERS });
    const matches = Array.isArray(fd?.matches) ? fd.matches : [];
    const response = matches.map(fdMatchToAfNode);

    res.set("Cache-Control", "public, max-age=600");
    res.json({ response });
  } catch (e) {
    console.error("❌ /af/fixtures failed:", e.message);
    const status = /403/.test(e.message) ? 403 : 502;
    res.status(status).json({ error: e.message });
  }
});

// ------------------------
// SportMonks AFCON proxy (fixtures with correct filters=)
// ------------------------
app.get("/sportmonks/afcon-fixtures", async (_req, res) => {
  try {
    const token =
      process.env.SPORTMONKS_TOKEN ||
      "lDfEJAPMuQJQLqRfxhbvQuDMgMfJDrfxiVGi6uwrDVNq4alQQ1ApO3eKWEzt"; // move to .env in production
    const seasonId = process.env.SPORTMONKS_AFCON_SEASON_ID || "25138"; // your AFCON season id

    const filters = `season_id:${seasonId}`;

    const url =
      "https://api.sportmonks.com/v3/football/fixtures" +
      "?filters=" +
      encodeURIComponent(filters) +
      "&include=localTeam,visitorTeam,scores,round" +
      "&api_token=" +
      encodeURIComponent(token);

    console.log("[GET] /sportmonks/afcon-fixtures ->", url);

    // reuse your deduped fetch + cache
    const data = await fetchDeduped(url, {}, CACHE_TTL_MS);

    res.set("Cache-Control", "public, max-age=600");
    res.json(data); // send raw SportMonks JSON to the frontend (with .data array)
  } catch (e) {
    console.error("❌ /sportmonks/afcon-fixtures failed:", e.message);
    res.status(502).json({ error: e.message });
  }
});

app.get("/af/rounds", async (req, res) => {
  try {
    if (!FD_TOKEN) {
      return res.status(500).json({ error: "No FOOTBALL_DATA_TOKEN set" });
    }

    const { league, season } = req.query;
    const code = mapLeagueToFDCode(league || "PL");
    const seasonSafe = season ? Number(season) : 2025;

    const url = `${FD_BASE}/competitions/${encodeURIComponent(code)}/matches?season=${seasonSafe}&limit=500`;
    console.log("[GET] /af/rounds ->", url);

    const fd = await fetchDeduped(url, { headers: FD_HEADERS }, CACHE_TTL_DAY);
    const matches = Array.isArray(fd?.matches) ? fd.matches : [];

    const rounds = Array.from(new Set(matches.map((m) => m.matchday).filter((n) => Number.isInteger(n))))
      .sort((a, b) => a - b)
      .map((n) => `Regular Season - ${n}`);

    res.set("Cache-Control", "public, max-age=86400");
    res.json({ response: rounds });
  } catch (e) {
    console.error("❌ /af/rounds failed:", e.message);
    const status = /403/.test(e.message) ? 403 : 502;
    res.status(status).json({ error: e.message });
  }
});

// Team logo via FD (id) or TSDB (search)
app.get("/af/teamLogo", async (req, res) => {
  try {
    if (!FD_TOKEN && !req.query.search) {
      return res.status(500).json({ error: "No FOOTBALL_DATA_TOKEN set" });
    }

    const { id, search } = req.query;
    let logo = "";

    if (id && FD_TOKEN) {
      const url = `${FD_BASE}/teams/${encodeURIComponent(id)}`;
      console.log("[GET] /af/teamLogo (by id) ->", url);
      const fd = await fetchDeduped(url, { headers: FD_HEADERS }, CACHE_TTL_DAY);
      logo = fd?.crest || "";
    } else if (search) {
      const url = `https://www.thesportsdb.com/api/v1/json/${SD_KEY}/searchteams.php?t=${encodeURIComponent(search)}`;
      console.log("[GET] /af/teamLogo (fallback search) ->", url);
      const td = await fetchDeduped(url, {}, CACHE_TTL_DAY);
      logo = td?.teams?.[0]?.strTeamBadge || "";
    } else {
      return res.status(400).json({ error: "Missing ?id= or ?search=" });
    }

    res.set("Cache-Control", "public, max-age=86400");
    res.json({ logo });
  } catch (e) {
    console.error("❌ /af/teamLogo failed:", e.message);
    const status = /403/.test(e.message) ? 403 : 502;
    res.status(status).json({ logo: "" });
  }
});

// ------------------------
// TheSportsDB fallbacks (kept as-is)
// ------------------------
app.get("/fixtures", async (req, res) => {
  const leagueId = req.query.leagueId || "4328"; // PL default
  const season = req.query.season || "2025-2026"; // match your config

  const url = `${SD_BASE}/${SD_KEY}/eventsseason.php?id=${encodeURIComponent(leagueId)}&s=${encodeURIComponent(season)}`;

  console.log("[GET] /fixtures ->", url);

  try {
    const data = await fetchDeduped(url);
    res.set("Cache-Control", "public, max-age=600");
    res.json(data);
  } catch (e) {
    console.error("❌ /fixtures failed:", e.message);
    res.status(502).json({ error: e.message });
  }
});

app.get("/team", async (req, res) => {
  const t = req.query.t;
  if (!t) return res.status(400).json({ error: "Missing ?t=" });

  const url = `https://www.thesportsdb.com/api/v1/json/${SD_KEY}/searchteams.php?t=${encodeURIComponent(t)}`;
  console.log("[GET] /team ->", url);

  try {
    const data = await fetchDeduped(url, {}, CACHE_TTL_DAY);
    res.set("Cache-Control", "public, max-age=86400");
    res.json(data || { teams: [] });
  } catch (e) {
    console.warn("logo /team lookup failed:", e.message);
    res.json({ teams: [] });
  }
});

app.get("/teamById", async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing ?id=" });

  const url = `https://www.thesportsdb.com/api/v1/json/${SD_KEY}/lookupteam.php?id=${encodeURIComponent(id)}`;
  console.log("[GET] /teamById ->", url);

  try {
    const data = await fetchDeduped(url, {}, CACHE_TTL_DAY);
    res.set("Cache-Control", "public, max-age=86400");
    res.json(data || { teams: [] });
  } catch (e) {
    console.warn("logo /teamById lookup failed:", e.message);
    res.json({ teams: [] });
  }
});

// health
app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// ------------------------
// Start server
// ------------------------
// Normalize accidental double segments like /bundesliga/bundesliga/...
app.use((req, res, next) => {
  const fixed = req.url.replace(/\/(premier|bundesliga|laliga|afcon)\/\1\//, "/$1/");
  if (fixed !== req.url) return res.redirect(302, fixed);
  next();
});

app.use("/scripts", express.static(join(__dirname, "scripts")));

const leagues = ["premier", "bundesliga", "laliga", "afcon"];
for (const L of leagues) {
  app.get(`/${L}/`, (_req, res) => res.sendFile(join(__dirname, L, "index.html")));
  app.get(`/${L}/index.html`, (_req, res) => res.sendFile(join(__dirname, L, "index.html")));
  app.get(`/${L}/predictions.html`, (_req, res) =>
    res.sendFile(join(__dirname, L, "predictions.html"))
  );
  app.get(`/${L}/results.html`, (_req, res) => res.sendFile(join(__dirname, L, "results.html")));
  app.get(`/${L}/predictions.html`, (_req, res) => res.sendFile(join(__dirname, L, "winners.html"))

  );
}

app.listen(PORT, () => {
  console.log(`✅ Football proxy running at http://localhost:${PORT}`);
});
