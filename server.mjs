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
app.use(express.static(__dirname, { extensions: ['html', 'js', 'css'] }));  // Added extensions for proper handling
// server.mjs

// Prevent accidental access to server-side data
app.use("/data", (_req, res) => res.sendStatus(404));



// Default route → REDIRECT to /afcon/ so relative links work
app.get("/", (_req, res) => {
  res.redirect(302, "/afcon/");
});

// Optional safety: if any old root links are hit, forward them too
app.get("/predictions.html", (_req, res) =>
  res.redirect(302, "/afcon/predictions.html")
);
app.get("/results.html", (_req, res) =>
  res.redirect(302, "/afcon/results.html")
);
app.get("/index.html", (_req, res) =>
  res.redirect(302, "/afcon/index.html")
);
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

console.log(
  `[FD] token set: ${FD_TOKEN ? "yes" : "NO (set FOOTBALL_DATA_TOKEN)"}`
);

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
  if (["premier", "epl", "premierleague", "england", "pl"].includes(s))
    return "PL";
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
  const roundName = matchday
    ? `Regular Season - ${matchday}`
    : m.stage || "Regular Season";

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
      season: m.season?.startDate
        ? new Date(m.season.startDate).getFullYear()
        : null,
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
// Local persistence (users.xml + predictions)
// ------------------------
const DATA_DIR = join(__dirname, "data");
const USERS_XML = join(DATA_DIR, "users.xml");
const PRED_DIR = join(DATA_DIR, "predictions");

await fs.mkdir(DATA_DIR, { recursive: true });
await fs.mkdir(PRED_DIR, { recursive: true });

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});
const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  format: true,
});

async function readUsers() {
  try {
    const xml = (await fs.readFile(USERS_XML, "utf8")).trim();
    if (!xml) return [];
    const json = xmlParser.parse(xml);
    const arr = json?.users?.user ?? [];
    return Array.isArray(arr) ? arr : [arr];
  } catch {
    return [];
  }
}

async function writeUsers(users) {
  const xml = xmlBuilder.build({ users: { user: users } });
  await fs.writeFile(USERS_XML, xml, "utf8");
}

function hashPassword(pw, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(pw, salt, 64).toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(hash, "hex"),
    Buffer.from(test, "hex")
  );
}

// Simple in-memory sessions (test phase)
const sessions = new Map();

function setSession(res, userId) {
  const sid = uuidv4();
  sessions.set(sid, { userId, createdAt: Date.now() });

  const prod = process.env.NODE_ENV === "production";
  res.cookie("sid", sid, {
    httpOnly: true,
    sameSite: prod ? "lax" : "lax",
    secure: prod ? true : false,
    maxAge: 365 * 24 * 3600 * 1000, // 1 year
  });
}

function getSession(req) {
  const sid = req.cookies?.sid;
  return sid ? sessions.get(sid) : null;
}

function requireAuth(req, res, next) {
  const s = getSession(req);
  if (!s) return res.status(401).json({ error: "auth_required" });
  req.userId = s.userId;
  next();
}

// ------------------------
// Auth routes
// ------------------------
app.post("/api/signup", async (req, res) => {
  const { name = "", email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "missing_fields" });

  const users = await readUsers();
  if (users.find((u) => u.email === email))
    return res.status(409).json({ error: "email_exists" });

  const user = { id: uuidv4(), name, email, password: hashPassword(password) };
  users.push(user);
  await writeUsers(users);

  setSession(res, user.id);
  res.json({ id: user.id, name: user.name, email: user.email });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body || {};
  const users = await readUsers();
  const user = users.find((u) => u.email === email);

  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  setSession(res, user.id);
  res.json({ id: user.id, name: user.name, email: user.email });
});

app.post("/api/logout", (req, res) => {
  const sid = req.cookies?.sid;
  if (sid) sessions.delete(sid);
  res.clearCookie("sid");
  res.json({ ok: true });
});

app.get("/api/me", async (req, res) => {
  const s = getSession(req);
  if (!s) return res.json(null);
  const users = await readUsers();
  const me = users.find((u) => u.id === s.userId);
  res.json(me ? { id: me.id, name: me.name, email: me.email } : null);
});

// ------------------------
// Predictions (per league, per user)
// ------------------------
app.post("/api/predictions/:league", requireAuth, async (req, res) => {
  const league = String(req.params.league || "").trim();
  if (!league) return res.status(400).json({ error: "invalid_league" });

  const dir = join(PRED_DIR, league);
  await fs.mkdir(dir, { recursive: true });

  const file = join(dir, `${req.userId}.json`);
  await fs.writeFile(file, JSON.stringify(req.body ?? {}, null, 2), "utf8");
  res.json({ ok: true });
});

app.get("/api/predictions/:league", requireAuth, async (req, res) => {
  try {
    const league = String(req.params.league || "").trim();
    if (!league) return res.status(400).json({ error: "invalid_league" });

    const file = join(PRED_DIR, league, `${req.userId}.json`);
    const json = await fs.readFile(file, "utf8");
    res.type("json").send(json);
  } catch {
    res.json(null);
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

    const url = `${FD_BASE}/competitions/${encodeURIComponent(
      code
    )}/matches?${params.toString()}`;
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
    const seasonId =
      process.env.SPORTMONKS_AFCON_SEASON_ID || "25138"; // your AFCON season id

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

    const url = `${FD_BASE}/competitions/${encodeURIComponent(
      code
    )}/matches?season=${seasonSafe}&limit=500`;
    console.log("[GET] /af/rounds ->", url);

    const fd = await fetchDeduped(url, { headers: FD_HEADERS }, CACHE_TTL_DAY);
    const matches = Array.isArray(fd?.matches) ? fd.matches : [];

    const rounds = Array.from(
      new Set(
        matches.map((m) => m.matchday).filter((n) => Number.isInteger(n))
      )
    )
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
      const url = `https://www.thesportsdb.com/api/v1/json/${SD_KEY}/searchteams.php?t=${encodeURIComponent(
        search
      )}`;
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

  const url = `https://www.thesportsdb.com/api/v1/json/${SD_KEY}/searchteams.php?t=${encodeURIComponent(
    t
  )}`;
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
  const fixed = req.url.replace(
    /\/(premier|bundesliga|laliga|afcon)\/\1\//,
    "/$1/"
  );
  if (fixed !== req.url) return res.redirect(302, fixed);
  next();
});

app.use('/scripts', express.static(join(__dirname, 'scripts')));

const leagues = ["premier", "bundesliga", "laliga", "afcon"];
for (const L of leagues) {
  app.get(`/${L}/`, (_req, res) =>
    res.sendFile(join(__dirname, L, "index.html"))
  );
  app.get(`/${L}/index.html`, (_req, res) =>
    res.sendFile(join(__dirname, L, "index.html"))
  );
  app.get(`/${L}/predictions.html`, (_req, res) =>
    res.sendFile(join(__dirname, L, "predictions.html"))
  );
  app.get(`/${L}/results.html`, (_req, res) =>
    res.sendFile(join(__dirname, L, "results.html"))
  );
   app.get(`/${L}/predictions.html`, (_req, res) =>
    res.sendFile(join(__dirname, L, "winners.html"))
 
  );
}

app.listen(PORT, () => {
  console.log(`✅ Football proxy running at http://localhost:${PORT}`);
});
