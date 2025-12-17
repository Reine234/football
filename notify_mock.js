/**
 * notify_mock.js
 * Mock match reminder engine (no KlickTipp needed)
 *
 * Run:
 *   node notify_mock.js
 *
 * It will:
 *  - read users from Firestore "users"
 *  - fetch upcoming fixtures (AFCON via SportsDB, others via football-data.org)
 *  - "mock send" by writing to notification_outbox + console.log
 *  - dedupe via notification_logs
 */

import admin from "firebase-admin";
import fetch from "node-fetch";

// ------------------------------
// 1) Firebase Admin init
// ------------------------------
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}
const db = admin.firestore();

// ------------------------------
// 2) Config
// ------------------------------
const LEAGUES = [
  { key: "AFCON", slug: "afcon" },
  { key: "PREMIER_LEAGUE", slug: "premier" },
  { key: "LALIGA", slug: "laliga" },
  { key: "BUNDESLIGA", slug: "bundesliga" },
];

// Time windows (hours)
const WINDOWS = [
  { name: "48H", minHours: 36, maxHours: 60 },
  { name: "24H", minHours: 12, maxHours: 36 },
];

// If true, write “outbox” docs you can inspect in Firebase console
const WRITE_OUTBOX = true;

// ------------------------------
// 3) Helpers
// ------------------------------
function nowMs() {
  return Date.now();
}
function hoursToMs(h) {
  return h * 60 * 60 * 1000;
}
function parseKickoffMs(f) {
  const iso =
    f.utcDate ||
    (f.fixture && f.fixture.date) ||
    f.date ||
    f.kickoff ||
    null;

  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
}

function fixtureTitle(f) {
  const home =
    (f.home && (f.home.name || f.home)) ||
    (f.teams && f.teams.home && f.teams.home.name) ||
    "Home";
  const away =
    (f.away && (f.away.name || f.away)) ||
    (f.teams && f.teams.away && f.teams.away.name) ||
    "Away";
  return `${home} vs ${away}`;
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      ...(opts.headers || {}),
    },
  });

  const text = await res.text();

  if (!res.ok) {
    throw new Error(
      `HTTP ${res.status} ${res.statusText} for ${url}. Body: ${text.slice(0, 200)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Not JSON from ${url}. Body: ${text.slice(0, 200)}`);
  }
}

// ------------------------------
// 4) Fixtures (REAL fetch) — FIXED
// ------------------------------

// A) football-data.org mapping (used for PL/BL1/PD)
function fdCompetitionCode(leagueKey) {
  if (leagueKey === "PREMIER_LEAGUE") return "PL";
  if (leagueKey === "BUNDESLIGA") return "BL1";
  if (leagueKey === "LALIGA") return "PD";
  return null;
}

async function fetchFixturesFootballData(leagueKey) {
  const token = process.env.FOOTBALL_DATA_TOKEN || "";
  const season = Number(process.env.FBL_SEASON || "2025");

  const code = fdCompetitionCode(leagueKey);
  if (!code) return [];
  if (!token) {
    console.warn(
      `[NotifyMock] FOOTBALL_DATA_TOKEN is missing. ${leagueKey} will return [].`
    );
    return [];
  }

  const url = `https://api.football-data.org/v4/competitions/${encodeURIComponent(
    code
  )}/matches?season=${encodeURIComponent(String(season))}&limit=500`;

  const data = await fetchJson(url, {
    headers: { "X-Auth-Token": token },
  });

  const matches = Array.isArray(data?.matches) ? data.matches : [];

  // Normalize into the shape your notifier already understands
  return matches.map((m) => ({
    id: String(m?.id ?? ""),
    utcDate: m?.utcDate ?? null,
    teams: {
      home: { name: m?.homeTeam?.name ?? "Home" },
      away: { name: m?.awayTeam?.name ?? "Away" },
    },
    // keep original in case you need it later
    _raw: m,
  }));
}

// B) TheSportsDB for AFCON (your log shows leagueId=4495&season=2025)
async function fetchFixturesSportsDB_Afcon() {
  const season = String(process.env.FBL_SEASON || "2025");

  // From your logs: /fixtures?leagueId=4495&season=2025
  const leagueId = process.env.AFCON_SDB_LEAGUE_ID || "4495";

  // Public key "3" is commonly used in SportsDB docs/examples.
  // If you have your own key, set SDB_KEY in env.
  const key = process.env.SDB_KEY || "3";

  const url = `https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(
    key
  )}/eventsseason.php?id=${encodeURIComponent(
    leagueId
  )}&s=${encodeURIComponent(season)}`;

  const data = await fetchJson(url);
  const events = Array.isArray(data?.events) ? data.events : [];

  // Convert SportsDB events to same shape
  return events.map((e) => {
    // SportsDB often uses dateEvent + strTime
    const date = e?.dateEvent || null; // "2025-12-21"
    const time = (e?.strTime || "00:00:00").replace(/\s+/g, "");
    const iso = date ? `${date}T${time}Z` : null;

    return {
      id: String(e?.idEvent ?? ""),
      utcDate: iso,
      teams: {
        home: { name: e?.strHomeTeam ?? "Home" },
        away: { name: e?.strAwayTeam ?? "Away" },
      },
      group: e?.strGroup ?? null,
      _raw: e,
    };
  });
}

async function fetchFixturesForLeagueBackend(leagueKey) {
  try {
    if (leagueKey === "AFCON") {
      const list = await fetchFixturesSportsDB_Afcon();
      if (list.length) {
        console.log(
          `[NotifyMock] fixtures OK league=AFCON sample id=${list[0].id} kickoff=${list[0].utcDate}`
        );
      }
      return list;
    }

    const list = await fetchFixturesFootballData(leagueKey);
    if (list.length) {
      console.log(
        `[NotifyMock] fixtures OK league=${leagueKey} sample id=${list[0].id} kickoff=${list[0].utcDate}`
      );
    }
    return list;
  } catch (err) {
    console.warn(
      `[NotifyMock] fixtures fetch error for ${leagueKey}:`,
      err && err.message ? err.message : err
    );
    return [];
  }
}

// ------------------------------
// 5) User selection
// ------------------------------
async function fetchUsersToNotify_AllUsers() {
  const snap = await db.collection("users").get();
  const out = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    const email = data.email || data.userEmail || null;
    if (!email) return;
    out.push({
      uid: d.id,
      email,
      displayName: data.userName || data.username || data.displayName || null,
    });
  });
  return out;
}

// ------------------------------
// 6) Dedupe log
// ------------------------------
function logDocId(uid, leagueKey, windowName, fixtureId) {
  return `${uid}_${leagueKey}_${windowName}_${String(fixtureId)}`;
}

async function alreadyNotified(uid, leagueKey, windowName, fixtureId) {
  const id = logDocId(uid, leagueKey, windowName, fixtureId);
  const ref = db.collection("notification_logs").doc(id);
  const snap = await ref.get();
  return snap.exists;
}

async function writeNotified(uid, leagueKey, windowName, fixture) {
  const fixtureId =
    fixture.id || (fixture.fixture && fixture.fixture.id) || fixture.fixtureId;
  const id = logDocId(uid, leagueKey, windowName, fixtureId);

  await db.collection("notification_logs").doc(id).set(
    {
      uid,
      league: leagueKey,
      window: windowName,
      fixtureId: String(fixtureId),
      kickoff: fixture.utcDate || (fixture.fixture && fixture.fixture.date) || null,
      title: fixtureTitle(fixture),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

// ------------------------------
// 7) Mock notifier
// ------------------------------
async function notifyUserMock(user, leagueKey, windowName, fixtures) {
  const lines = fixtures.map((f) => {
    const ko = f.utcDate || (f.fixture && f.fixture.date) || "";
    const id = f.id || (f.fixture && f.fixture.id);
    return `- ${fixtureTitle(f)} | ${ko} | id=${id}`;
  });

  const msg =
    `\n[MOCK NOTIFY]\n` +
    `To: ${user.email} (uid=${user.uid})\n` +
    `League: ${leagueKey}\n` +
    `Window: ${windowName}\n` +
    `Matches:\n${lines.join("\n")}\n`;

  console.log(msg);

  if (WRITE_OUTBOX) {
    await db.collection("notification_outbox").add({
      uid: user.uid,
      email: user.email,
      league: leagueKey,
      window: windowName,
      fixtures: fixtures.map((f) => ({
        fixtureId: String(f.id || (f.fixture && f.fixture.id) || ""),
        kickoff: f.utcDate || (f.fixture && f.fixture.date) || null,
        title: fixtureTitle(f),
      })),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "MOCK_ONLY",
    });
  }
}

// ------------------------------
// 8) Main runner
// ------------------------------
async function run() {
  const users = await fetchUsersToNotify_AllUsers();
  console.log(`[NotifyMock] users=${users.length}`);

  const now = nowMs();

  for (const league of LEAGUES) {
    const fixtures = await fetchFixturesForLeagueBackend(league.key);
    console.log(`[NotifyMock] league=${league.key} fixtures=${fixtures.length}`);

    for (const w of WINDOWS) {
      const minT = now + hoursToMs(w.minHours);
      const maxT = now + hoursToMs(w.maxHours);

      const upcoming = (fixtures || []).filter((f) => {
        const ko = parseKickoffMs(f);
        if (!ko) return false;
        return ko >= minT && ko < maxT;
      });

      if (!upcoming.length) continue;

      for (const user of users) {
        const sendThese = [];
        for (const fx of upcoming) {
          const fixtureId =
            fx.id || (fx.fixture && fx.fixture.id) || fx.fixtureId;
          if (!fixtureId) continue;

          const sent = await alreadyNotified(
            user.uid,
            league.key,
            w.name,
            fixtureId
          );
          if (!sent) sendThese.push(fx);
        }

        if (!sendThese.length) continue;

        await notifyUserMock(user, league.key, w.name, sendThese);

        for (const fx of sendThese) {
          await writeNotified(user.uid, league.key, w.name, fx);
        }
      }
    }
  }

  console.log("[NotifyMock] done.");
}

run().catch((e) => {
  console.error("[NotifyMock] failed:", e);
  process.exit(1);
});
