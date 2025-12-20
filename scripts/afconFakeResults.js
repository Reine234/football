// /scripts/afconFakeResults.js
// DISABLED: AFCON simulation is off (real API only)
console.log("[AFCON FAKE] disabled");

(function () {
  // Only run this if we explicitly ask for simulation in the URL:
  // e.g. results.html?simulateAfcon=1
  const params = new URLSearchParams(window.location.search || "");
  const simulate = params.has("simulateAfcon") || params.get("simulateAfcon") === "1";
  if (!simulate) {
    console.log("[AFCON FAKE] Simulation not enabled (no simulateAfcon=1 in URL).");
    return;
  }

  if (!window.FBL || typeof window.FBL.fetchFixturesForLeague !== "function") {
    console.warn("[AFCON FAKE] window.FBL.fetchFixturesForLeague not found.");
    return;
  }

  console.log("[AFCON FAKE] Simulation mode ON – fake final scores will be used for AFCON.");

  const originalFetch = window.FBL.fetchFixturesForLeague;
  const fakeScoreCache = {};

  function ensureFakeScoreForFixture(id) {
    id = String(id);
    if (fakeScoreCache[id]) return fakeScoreCache[id];

    // Simple pseudo-random but stable per page-load:
    const home = Math.floor(Math.random() * 5); // 0–4
    const away = Math.floor(Math.random() * 5); // 0–4
    fakeScoreCache[id] = { home, away };
    return fakeScoreCache[id];
  }

  window.FBL.fetchFixturesForLeague = async function patchedFetchFixtures(leagueKey) {
    const list = await originalFetch(leagueKey);

    if (leagueKey !== "AFCON") {
      // For other leagues, do nothing.
      return list;
    }

    console.log("[AFCON FAKE] Patching AFCON fixtures with fake final scores…");

    return (list || []).map((f) => {
      const id = f.id != null ? f.id : f.fixture?.id;
      if (!id) return f;

      const fake = ensureFakeScoreForFixture(id);

      // Merge in fake final scores in the same shape as your real API
      const patched = {
        ...f,
        goals: {
          home: fake.home,
          away: fake.away,
        },
      };

      console.log("[AFCON FAKE] Fixture", id, "=>", fake.home, ":", fake.away);
      return patched;
    });
  };
})();