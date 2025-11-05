


// server.mjs

// Try to load .env automatically if it exists
try {
  await import("dotenv/config");
} catch (err) { /* ignore if dotenv isn't installed */ }

// ------------------------
// Imports
// ------------------------
import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ------------------------
// __dirname in ES module land
// ------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ------------------------
// App setup
// ------------------------
const app  = express();
const PORT = process.env.PORT || 5000;

// Allow requests from your local browser (add your domain here if needed)
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5000",
      "http://127.0.0.1:5000",
    ],
  })
);

// Serve ALL your frontend files (HTML, CSS, JS, images...) from the project folder
app.use(express.static(__dirname));

// Default route → Premier League page
app.get("/", (_req, res) => {
  res.sendFile(join(__dirname, "premier", "index.html"));
});

// ------------------------
// Upstream APIs
// ------------------------

// TheSportsDB fallback
const SD_BASE = "https://www.thesportsdb.com/api/v1/json";
const SD_KEY  = process.env.TSD_API_KEY || "3"; // public key

// football-data.org (v4)
const FD_BASE  = "https://api.football-data.org/v4";
const FD_TOKEN = process.env.FOOTBALL_DATA_TOKEN || ""; // <-- set this

const FD_HEADERS = FD_TOKEN
  ? { "X-Auth-Token": FD_TOKEN }
  : {};

console.log(`[FD] token set: ${FD_TOKEN ? "yes" : "NO (set FOOTBALL_DATA_TOKEN)"}`);

// ------------------------
// Tiny cache so we don't spam the APIs
// ------------------------
const CACHE_TTL_MS  = 10 * 60 * 1000;      // 10 minutes
const CACHE_TTL_DAY = 24 * 60 * 60 * 1000; // 1 day

const cache    = new Map(); // key -> { data, expires }
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
  const cacheKey  = url + "::" + JSON.stringify(opts.headers || {});
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

// Map incoming "league" to FD competition code
function mapLeagueToFDCode(input) {
  const s = String(input || "").toLowerCase().trim();
  // accept API-Football numeric ids
  if (s === "39")  return "PL";   // Premier League
  if (s === "78")  return "BL1";  // Bundesliga
  if (s === "140") return "PD";   // LaLiga

  // accept names/aliases
  if (["premier","epl","premierleague","england","pl"].includes(s)) return "PL";
  if (["bundesliga","germany","de","bl1"].includes(s))               return "BL1";
  if (["laliga","la liga","spain","pd"].includes(s))                  return "PD";

  // already FD code?
  if (["pl","bl1","pd"].includes(s)) return s.toUpperCase();

  // default to PL
  return "PL";
}

function mapFDStatusToAF(status) {
  // FD statuses like SCHEDULED, TIMED, IN_PLAY, PAUSED, FINISHED, POSTPONED, etc.
  switch (status) {
    case "SCHEDULED":
    case "TIMED":
      return "NS"; // not started
    case "IN_PLAY":
    case "PAUSED":
      return "1H"; // approx
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

// Convert FD match to API-Football-ish node your frontend expects
function fdMatchToAfNode(m) {
  const dateISO   = m.utcDate; // ISO
  const ts        = Date.parse(dateISO);
  const matchday  = m.matchday ?? null;
  const roundName = matchday ? `Regular Season - ${matchday}` : (m.stage || "Regular Season");

  return {
    fixture: {
      id: m.id,
      date: dateISO,
      timestamp: isNaN(ts) ? undefined : Math.floor(ts / 1000),
      timezone: "UTC",
      status: { short: mapFDStatusToAF(m.status), long: m.status, elapsed: null },
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
        winner: m.score?.winner === "HOME_TEAM" ? true : (m.score?.winner === "AWAY_TEAM" ? false : null),
      },
      away: {
        id: m.awayTeam?.id ?? null,
        name: m.awayTeam?.name ?? "",
        logo: m.awayTeam?.crest ?? "",
        winner: m.score?.winner === "AWAY_TEAM" ? true : (m.score?.winner === "HOME_TEAM" ? false : null),
      },
    },
    goals: {
      home: m.score?.fullTime?.home ?? null,
      away: m.score?.fullTime?.away ?? null,
    },
    score: {
      halftime:    m.score?.halfTime ?? {},
      fulltime:    m.score?.fullTime ?? {},
      extratime:   m.score?.extraTime ?? {},
      penalty:     m.score?.penalties ?? {},
    },
  };
}

// ------------------------
// API ROUTES (FD-backed)
// ------------------------

// 1) Fixtures (FD) → AF-shaped
// example: /af/fixtures?league=39&season=2025&from=2025-07-01&to=2026-05-25
app.get("/af/fixtures", async (req, res) => {
  try {
    if (!FD_TOKEN) {
      return res.status(500).json({ error: "No FOOTBALL_DATA_TOKEN set" });
    }

    const { league, season, from, to } = req.query;
    const code = mapLeagueToFDCode(league || "PL");

    // default to 2025 season (2025/26)
    const seasonSafe = season ? Number(season) : 2025;

    const params = new URLSearchParams({ season: String(seasonSafe), limit: "500" });
    if (from) params.set("dateFrom", from);
    if (to)   params.set("dateTo", to);

    const url = `${FD_BASE}/competitions/${encodeURIComponent(code)}/matches?${params.toString()}`;
    console.log("[GET] /af/fixtures ->", url);

    const fd = await fetchDeduped(url, { headers: FD_HEADERS });
    const matches = Array.isArray(fd?.matches) ? fd.matches : [];

    // Package like API-Football
    const response = matches.map(fdMatchToAfNode);
    res.set("Cache-Control", "public, max-age=600");
    res.json({ response });
  } catch (e) {
    console.error("❌ /af/fixtures failed:", e.message);
    const status = /403/.test(e.message) ? 403 : 502;
    res.status(status).json({ error: e.message });
  }
});

// 2) Rounds (FD) → derive from matchdays; shape: ["Regular Season - 1", ...]
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

    const rounds = Array.from(
      new Set(matches.map(m => m.matchday).filter(n => Number.isInteger(n)))
    ).sort((a,b) => a - b).map(n => `Regular Season - ${n}`);

    res.set("Cache-Control", "public, max-age=86400");
    res.json({ response: rounds });
  } catch (e) {
    console.error("❌ /af/rounds failed:", e.message);
    const status = /403/.test(e.message) ? 403 : 502;
    res.status(status).json({ error: e.message });
  }
});

// 3) Team logo (FD) — prefer id; optional name fallback via TheSportsDB
//   /af/teamLogo?id=64
//   /af/teamLogo?search=arsenal
app.get("/af/teamLogo", async (req, res) => {
  try {
    if (!FD_TOKEN) {
      return res.status(500).json({ error: "No FOOTBALL_DATA_TOKEN set" });
    }

    const { id, search } = req.query;
    let logo = "";

    if (id) {
      const url = `${FD_BASE}/teams/${encodeURIComponent(id)}`;
      console.log("[GET] /af/teamLogo (by id) ->", url);
      const fd = await fetchDeduped(url, { headers: FD_HEADERS }, CACHE_TTL_DAY);
      logo = fd?.crest || "";
    } else if (search) {
      // FD doesn't offer a public "search teams by name" endpoint in v4 docs
      // Fallback to TheSportsDB search to at least try a logo by name
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
    res.status(status).json({ logo: "" }); // respond safely with empty logo
  }
});

// ------------------------
// TheSportsDB fallbacks (kept as-is)
// ------------------------
app.get("/fixtures", async (req, res) => {
  const leagueId = req.query.leagueId || "4328";       // PL default
  const season   = req.query.season   || "2025-2026";  // match config.js

  const url = `${SD_BASE}/${SD_KEY}/eventsseason.php?id=${encodeURIComponent(
    leagueId
  )}&s=${encodeURIComponent(season)}`;

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
app.listen(PORT, () => {
  console.log(`✅ Football proxy running at http://localhost:${PORT}`);
});
