// Try to load .env automatically if it exists
try {
  await import("dotenv/config");
} catch (err) {
  // ignore if dotenv isn't installed
}

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

// Allow requests from your local browser
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
// That means /premier/index.html, /scripts/config.js, etc will all be reachable.
app.use(express.static(__dirname));

// Default route: if someone hits http://localhost:5000/ with no file,
// send them to the Premier League page by default.
app.get("/", (_req, res) => {
  res.sendFile(join(__dirname, "premier", "index.html"));
});

// ------------------------
// Upstream API config
// ------------------------

const SD_BASE = "https://www.thesportsdb.com/api/v1/json";
const SD_KEY  = process.env.TSD_API_KEY || "3"; // public key

// API-Football config
const AF_KEY       = process.env.AF_KEY || "";        // <-- you'll set this before running
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "";  // optional
const USE_RAPID    = !!RAPIDAPI_KEY;

const AF_BASE = USE_RAPID
  ? "https://api-football-v1.p.rapidapi.com/v3"
  : "https://v3.football.api-sports.io";

const AF_HEADERS = USE_RAPID
  ? {
      "x-rapidapi-key": RAPIDAPI_KEY,
      "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
    }
  : {
      "x-apisports-key": AF_KEY,
    };

console.log(
  `[AF] mode=${USE_RAPID ? "RapidAPI" : "api-sports.io"} key=${
    (USE_RAPID ? RAPIDAPI_KEY : AF_KEY).slice(0, 4)
  }***`
);

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
  cache.set(key, {
    data: value,
    expires: Date.now() + ttl,
  });
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
  const cacheKey   = url + "::" + JSON.stringify(opts.headers || {});
  const fromCache  = getCache(cacheKey);
  if (fromCache) return fromCache;

  if (inflight.has(cacheKey)) {
    return inflight.get(cacheKey);
  }

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
// API ROUTES
// ------------------------

// 1) Fixtures from API-Football
// example: /af/fixtures?league=39&season=2025&from=2025-07-01&to=2026-05-25
app.get("/af/fixtures", async (req, res) => {
  try {
    if (!AF_KEY && !RAPIDAPI_KEY) {
      return res
        .status(500)
        .json({ error: "No AF key set (AF_KEY or RAPIDAPI_KEY)" });
    }

    const { league, season, from, to } = req.query;
    if (!league) {
      return res.status(400).json({ error: "Missing ?league=" });
    }

    // if frontend didn't pass a season param, guess
    const now = new Date();
    const y   = now.getFullYear();
    const m   = now.getMonth(); // 0=Jan
    const seasonSafe = season ? Number(season) : (m >= 6 ? y : y - 1);

    let url = `${AF_BASE}/fixtures?league=${encodeURIComponent(
      league
    )}&season=${encodeURIComponent(seasonSafe)}`;

    if (from) url += `&from=${encodeURIComponent(from)}`;
    if (to)   url += `&to=${encodeURIComponent(to)}`;

    console.log("[GET] /af/fixtures ->", url);

    const json = await fetchDeduped(url, { headers: AF_HEADERS });
    res.set("Cache-Control", "public, max-age=600");
    res.json(json);
  } catch (e) {
    console.error("❌ /af/fixtures failed:", e.message);
    const status = /403/.test(e.message) ? 403 : 502;
    res.status(status).json({ error: e.message });
  }
});

// 2) Rounds from API-Football (not strictly required but nice to have)
app.get("/af/rounds", async (req, res) => {
  try {
    if (!AF_KEY && !RAPIDAPI_KEY) {
      return res
        .status(500)
        .json({ error: "No AF key set (AF_KEY or RAPIDAPI_KEY)" });
    }

    const { league, season } = req.query;
    if (!league) {
      return res.status(400).json({ error: "Missing ?league=" });
    }

    const now = new Date();
    const y   = now.getFullYear();
    const m   = now.getMonth();
    const seasonSafe = season ? Number(season) : (m >= 6 ? y : y - 1);

    const url = `${AF_BASE}/fixtures/rounds?league=${encodeURIComponent(
      league
    )}&season=${encodeURIComponent(seasonSafe)}`;

    console.log("[GET] /af/rounds ->", url);

    const json = await fetchDeduped(url, { headers: AF_HEADERS }, CACHE_TTL_DAY);
    res.set("Cache-Control", "public, max-age=86400");
    res.json(json);
  } catch (e) {
    console.error("❌ /af/rounds failed:", e.message);
    const status = /403/.test(e.message) ? 403 : 502;
    res.status(status).json({ error: e.message });
  }
});

// 3) Team logo via API-Football
app.get("/af/teamLogo", async (req, res) => {
  try {
    if (!AF_KEY && !RAPIDAPI_KEY) {
      return res
        .status(500)
        .json({ error: "No AF key set (AF_KEY or RAPIDAPI_KEY)" });
    }

    const { id, search } = req.query;
    if (!id && !search) {
      return res
        .status(400)
        .json({ error: "Missing ?id= or ?search=" });
    }

    const base = `${AF_BASE}/teams`;
    const url = id
      ? `${base}?id=${encodeURIComponent(id)}`
      : `${base}?search=${encodeURIComponent(search)}`;

    console.log("[GET] /af/teamLogo ->", url);

    const json = await fetchDeduped(url, { headers: AF_HEADERS }, CACHE_TTL_DAY);
    const logo = json?.response?.[0]?.team?.logo || "";

    res.set("Cache-Control", "public, max-age=86400");
    res.json({ logo });
  } catch (e) {
    console.error("❌ /af/teamLogo failed:", e.message);
    const status = /403/.test(e.message) ? 403 : 502;
    res.status(status).json({ error: e.message });
  }
});

// 4) TheSportsDB fallback fixtures
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
  if (!t) {
    return res.status(400).json({ error: "Missing ?t=" });
  }

  const url = `https://www.thesportsdb.com/api/v1/json/${SD_KEY}/searchteams.php?t=${encodeURIComponent(
    t
  )}`;

  console.log("[GET] /team ->", url);

  try {
    const data = await fetchDeduped(url, {}, CACHE_TTL_DAY);

    // Even if TheSportsDB returns null or empty, respond 200 with a safe shape
    res.set("Cache-Control", "public, max-age=86400");
    res.json(data || { teams: [] });
  } catch (e) {
    console.warn("logo /team lookup failed:", e.message);
    // no more scary 502, we just return empty
    res.json({ teams: [] });
  }
});

app.get("/teamById", async (req, res) => {
  const id = req.query.id;
  if (!id) {
    return res.status(400).json({ error: "Missing ?id=" });
  }

  const url = `https://www.thesportsdb.com/api/v1/json/${SD_KEY}/lookupteam.php?id=${encodeURIComponent(
    id
  )}`;

  console.log("[GET] /teamById ->", url);

  try {
    const data = await fetchDeduped(url, {}, CACHE_TTL_DAY);

    res.set("Cache-Control", "public, max-age=86400");
    res.json(data || { teams: [] });
  } catch (e) {
    console.warn("logo /teamById lookup failed:", e.message);
    // return empty success, not 502
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
