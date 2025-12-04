(function () {
  if (window.__FBL_WINNERS_INITED__) return;
  window.__FBL_WINNERS_INITED__ = true;

  // ---------- Helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );
  }

  function getLeagueSlugFromPath() {
    const path = (location.pathname || "").toLowerCase();
    if (path.includes("/laliga/")) return "laliga";
    if (path.includes("/bundesliga/")) return "bundesliga";
    if (path.includes("/premier/")) return "premier";
    if (path.includes("/afcon/")) return "afcon";

    const stored = (sessionStorage.getItem("FBL_leagueSlug") || "").toLowerCase();
    if (["laliga", "bundesliga", "premier", "afcon"].includes(stored)) {
      return stored;
    }
    return "premier";
  }

  function leagueKeyFromSlug(slug) {
    if (slug === "premier") return "PREMIER_LEAGUE";
    if (slug === "bundesliga") return "BUNDESLIGA";
    if (slug === "laliga") return "LALIGA";
    if (slug === "afcon") return "AFCON";
    return "PREMIER_LEAGUE";
  }

  function resolveLeagueKey() {
    const fromBody = (document.body.dataset.league || "").toUpperCase();
    if (["PREMIER_LEAGUE", "BUNDESLIGA", "LALIGA", "AFCON"].includes(fromBody)) {
      return fromBody;
    }
    const slug = getLeagueSlugFromPath();
    return leagueKeyFromSlug(slug);
  }

  // 🔧 only fallback is plain "Player" now (no UID tail)
  function computeDisplayNameFromData(data, fallbackUid) {
    return (
      data.userName ||
      data.username ||
      data.displayName ||
      (data.email ? data.email.split("@")[0] : null) ||
      "Player"
    );
  }

  function normalizeLeagueString(str) {
    return String(str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "");
  }

  function leagueSynonyms(leagueKey) {
    const k = String(leagueKey || "").toUpperCase();
    if (k === "PREMIER_LEAGUE") {
      return ["premierleague", "premier", "epl"];
    }
    if (k === "BUNDESLIGA") {
      return ["bundesliga"];
    }
    if (k === "LALIGA") {
      return ["laliga", "laligasantander", "laligaes", "laligaea", "laligas"];
    }
    if (k === "AFCON") {
      return ["afcon", "can", "coupeafriquedesnations"];
    }
    return [normalizeLeagueString(k)];
  }

  // ---------- Points computation (same logic as resultsPage) ----------
  function computePoints(predH, predA, finH, finA) {
    if (!Number.isFinite(finH) || !Number.isFinite(finA)) return null;
    if (!Number.isFinite(predH) || !Number.isFinite(predA)) return 0;

    if (predH === finH && predA === finA) return 3;

    const po = predH === predA ? 0 : predH > predA ? 1 : -1;
    const ro = finH === finA ? 0 : finH > finA ? 1 : -1;
    const pd = predH - predA;
    const rd = finH - finA;

    if (po === ro && pd === rd) return 2;
    if (po === ro) return 1;
    return 0;
  }

  // ---------- Fixtures for this league ----------
  async function fetchFixturesForCurrentLeague(leagueKey) {
    if (!window.FBL || typeof window.FBL.fetchFixturesForLeague !== "function") {
      return { list: [], byId: {} };
    }
    try {
      const list = await window.FBL.fetchFixturesForLeague(leagueKey);
      const byId = {};
      (list || []).forEach((f) => {
        byId[String(f.id)] = f;
      });
      return { list: list || [], byId };
    } catch (err) {
      console.warn("[Winners] fetchFixturesForLeague failed", err);
      return { list: [], byId: {} };
    }
  }

  // ---------- Bottom nav + league tabs ----------
  function initBottomNavAndTabs(leagueSlug) {
    const nav = document.querySelector("nav.nav");
    const path = (location.pathname || "").toLowerCase();

    if (nav) {
      const items = nav.querySelectorAll(".nav-item");
      items.forEach((item) => {
        const labelEl = item.querySelector("span");
        if (!labelEl) return;
        const label = (labelEl.textContent || "").trim().toLowerCase();

        // set active state based on current path
        if (label === "home" && path.includes("/index")) {
          item.classList.add("nav-active");
        } else if (label === "results" && path.includes("/results")) {
          item.classList.add("nav-active");
        } else if (label === "winners" && path.includes("/winners")) {
          item.classList.add("nav-active");
        } else if (label === "rules" && path.includes("/rules")) {
          item.classList.add("nav-active");
        }

        item.addEventListener("click", (e) => {
          e.preventDefault();
          if (label === "home") {
            window.location.href = `../${leagueSlug}/index.html`;
          } else if (label === "results") {
            window.location.href = `../${leagueSlug}/results.html`;
          } else if (label === "winners") {
            window.location.href = `../${leagueSlug}/winners.html`;
          } else if (label === "rules") {
            window.location.href = `../${leagueSlug}/rules.html`;
          }
        });
      });
    }

    const tabs = document.querySelectorAll(".league-tabs .tab");
    if (tabs.length) {
      tabs.forEach((tab) => {
        const href = (tab.getAttribute("data-href") || "").toLowerCase();
        // mark active if this href matches the end of the current path
        if (href && path.endsWith(href.split("../").pop())) {
          tab.classList.add("active");
        }
        tab.addEventListener("click", () => {
          const target = tab.getAttribute("data-href");
          if (target) window.location.href = target;
        });
      });
    }
  }

  // 🎯 Only include users who exist in the database (filter out deleted users)
  async function enrichUsernamesFromUsersCollection(db, scoresByUid) {
    if (!db) return;
    const uids = Object.keys(scoresByUid);
    if (!uids.length) return;

    try {
      await Promise.all(
        uids.map(async (uid) => {
          try {
            const snap = await db.collection("users").doc(uid).get();
            if (!snap.exists) {
              // If the user does not exist, skip
              return;
            }
            const data = snap.data() || {};
            const email = data.email || data.userEmail || null;
            const bestName =
              data.userName ||
              data.username ||
              data.displayName ||
              (email ? email.split("@")[0] : null);

            if (bestName && bestName !== "Player") {
              scoresByUid[uid].username = bestName;  // Only assign if the name is valid
            }
          } catch (e) {
            console.warn("[Winners] user lookup failed for", uid, e);
            // Skip user if lookup fails
          }
        })
      );
    } catch (err) {
      console.warn("[Winners] enrichUsernamesFromUsersCollection failed:", err);
    }
  }

  // ---------- Daily Rankings from Firestore ----------
  async function loadDailyRankings(db, leagueKey, currentUser, tbody, userPointsEl) {
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="3">Loading rankings…</td></tr>';

    try {
      // 1) fixtures for this league (for final scores)
      const { byId: fixturesById } = await fetchFixturesForCurrentLeague(leagueKey);

      // 2) all predictions; we'll filter by league
      const snap = await db.collection("predictions").get();

      const wantedLeagues = leagueSynonyms(leagueKey);
      const scoresByUid = {};

      snap.forEach((doc) => {
        const data = doc.data() || {};
        const uid = data.uid;
        if (!uid) return;

        // filter by league
        const rawLeague =
          data.league || data.leagueKey || data.leagueSlug || data.leagueName;
        const normLeague = normalizeLeagueString(rawLeague);
        if (!wantedLeagues.includes(normLeague)) return;

        const fixtureId = String(data.fixtureId || "");
        if (!fixtureId) return;

        const fixture = fixturesById[fixtureId];

        // predicted scores
        const predHome = Number(
          data.home && data.home.score != null ? data.home.score : NaN
        );
        const predAway = Number(
          data.away && data.away.score != null ? data.away.score : NaN
        );

        // final scores (from fixtures)
        let finHome = NaN;
        let finAway = NaN;
        if (fixture && fixture.goals) {
          if (fixture.goals.home !== null && fixture.goals.home !== undefined) {
            finHome = Number(fixture.goals.home);
          }
          if (fixture.goals.away !== null && fixture.goals.away !== undefined) {
            finAway = Number(fixture.goals.away);
          }
        }

        let pts = null;

        // if you later store points per prediction, we can reuse them:
        if (typeof data.points === "number" && Number.isFinite(data.points)) {
          pts = data.points;
        } else {
          pts = computePoints(predHome, predAway, finHome, finAway);
        }

        // no final score yet -> pts === null -> ignore for ranking
        if (pts == null) return;

        if (!scoresByUid[uid]) {
          scoresByUid[uid] = {
            uid,
            username: computeDisplayNameFromData(data, uid), // temp name
            points: 0,
          };
        }
        scoresByUid[uid].points += pts;
      });

      // 🔥 Try to replace generic names with email prefixes from users collection
      await enrichUsernamesFromUsersCollection(db, scoresByUid);

      const rows = Object.values(scoresByUid);
      rows.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        return String(a.username).localeCompare(String(b.username));
      });

      if (!rows.length) {
        tbody.innerHTML = '<tr><td colspan="3">No rankings yet.</td></tr>';
      } else {
        tbody.innerHTML = rows
          .map(
            (row, idx) => ` 
              <tr>
                <td>${idx + 1}</td>
                <td>${esc(row.username)}</td>
                <td>${row.points}</td>
              </tr>
            `
          )
          .join("");
      }

      // update current user's points in the top strip
      if (currentUser && userPointsEl) {
        const myRow = scoresByUid[currentUser.uid];
        const myPoints = myRow ? myRow.points : 0;
        userPointsEl.textContent = String(myPoints);
      }
    } catch (err) {
      console.error("[Winners] Failed to load rankings", err);
      tbody.innerHTML =
        '<tr><td colspan="3">Unable to load rankings.</td></tr>';
    }
  }

  // ---------- Classification tabs ----------
  function initClassificationTabs(db, leagueKey, currentUser) {
    const tabs = document.querySelectorAll(".tab-row .tab");
    const tbody = document.querySelector(".card .table tbody");
    const userPointsEl = document.querySelector(
      ".user-strip .user-points .value"
    );

    if (!tabs.length || !tbody) return;

    function setActive(tab) {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
    }

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const label = (tab.textContent || "").trim().toLowerCase();
        setActive(tab);

        if (label.includes("daily")) {
          loadDailyRankings(db, leagueKey, currentUser, tbody, userPointsEl);
        } else if (label.includes("first round")) {
          tbody.innerHTML =
            '<tr><td colspan="3">First round standings coming soon.</td></tr>';
        } else if (label.includes("overall")) {
          tbody.innerHTML =
            '<tr><td colspan="3">Overall standings coming soon.</td></tr>';
        }
      });
    });

    // initial tab = Daily Rankings (or first tab)
    const initial =
      Array.from(tabs).find((t) =>
        (t.textContent || "").toLowerCase().includes("daily")
      ) || tabs[0];

    if (initial) {
      setActive(initial);
      loadDailyRankings(db, leagueKey, currentUser, tbody, userPointsEl);
    }
  }

  // ---------- User strip ----------
  function initUserStrip(user) {
    const userNameEl = document.querySelector(".user-strip .user-pill span");
    const userPointsEl = document.querySelector(
      ".user-strip .user-points .value"
    );

    if (user) {
      const name =
        user.displayName ||
        (user.email ? user.email.split("@")[0] : "Player");
      if (userNameEl) userNameEl.textContent = name;
      if (userPointsEl) userPointsEl.textContent = "--";
    } else {
      if (userNameEl) userNameEl.textContent = "Guest";
      if (userPointsEl) userPointsEl.textContent = "--";
    }
  }

  // ---------- Boot ----------
  function boot() {
    const leagueSlug = getLeagueSlugFromPath();
    const leagueKey = resolveLeagueKey();

    initBottomNavAndTabs(leagueSlug);

    if (!window.firebase || !firebase.auth || !firebase.firestore) {
      console.error("[Winners] Firebase not found.");
      return;
    }

    const db = firebase.firestore();

    // Guests can see rankings; logged-in users see their total in the pill
    firebase.auth().onAuthStateChanged((user) => {
      initUserStrip(user);
      initClassificationTabs(db, leagueKey, user);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
