// routes/afcon.js
import express from "express";
import fetch from "node-fetch"; // or global fetch if you’re on Node 18+

const router = express.Router();

const SPORTMONKS_TOKEN      = process.env.SPORTMONKS_API_TOKEN;
const AFCON_LEAGUE_ID       = process.env.SPORTMONKS_AFCON_LEAGUE_ID;
const AFCON_SEASON_ID       = process.env.SPORTMONKS_AFCON_SEASON_ID;

// GET /api/afcon/fixtures
router.get("/fixtures", async (req, res) => {
  try {
    // SportMonks v3 style endpoint:
    const url = new URL("https://api.sportmonks.com/v3/football/fixtures");
    url.searchParams.set("api_token", SPORTMONKS_TOKEN);
    url.searchParams.set("leagues", AFCON_LEAGUE_ID);
    url.searchParams.set("seasons", AFCON_SEASON_ID);
    url.searchParams.set("include", "participants;scores");

    const r = await fetch(url.toString());
    if (!r.ok) {
      const text = await r.text();
      return res.status(500).json({ success: false, error: text });
    }

    const json = await r.json();
    const rawFixtures = json.data || [];

    const fixtures = rawFixtures.map((fix) => {
      const participants = fix.participants || [];
      const home = participants.find(p => p.meta?.location === "home");
      const away = participants.find(p => p.meta?.location === "away");

      const scores = fix.scores || [];
      const ft = scores.find(s => s.description === "FT") || {};

      return {
        id: fix.id,
        utcDate: fix.starting_at, // ISO datetime
        home: {
          id:   home?.id || null,
          name: home?.name || "Home",
        },
        away: {
          id:   away?.id || null,
          name: away?.name || "Away",
        },
        goals: {
          home: ft.score?.home ?? null,
          away: ft.score?.away ?? null,
        },
      };
    });

    res.json({ success: true, fixtures });
  } catch (err) {
    console.error("AFCON fixtures error:", err);
    res.status(500).json({ success: false, error: "AFCON fixtures fetch failed" });
  }
});

export default router;
