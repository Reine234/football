// /scripts/predictionsStore.js
(function () {
  // compat-safe handles
  const auth =
    (window.FBL_FIREBASE && window.FBL_FIREBASE.auth) ||
    (window.firebase && firebase.auth());

  const db =
    (window.FBL_FIREBASE && window.FBL_FIREBASE.db) ||
    (window.firebase && firebase.firestore());

  function getUidNow() {
    try {
      return auth.currentUser ? auth.currentUser.uid : null;
    } catch (_) {
      return null;
    }
  }

  function waitForUid() {
    const uid = getUidNow();
    if (uid) return Promise.resolve(uid);

    return new Promise((resolve, reject) => {
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
      const docId = `${uid}_${leagueKey}_${fixtureId}`;
      const ref = db.collection("predictions").doc(docId);

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
    if (!uid) return [];

    const snap = await db
      .collection("predictions")
      .where("uid", "==", uid)
      .where("league", "==", leagueKey)
      .get();

    const out = [];
    snap.forEach((doc) => out.push(doc.data()));

    out.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log("[STORE] loaded", out.length, "for", leagueKey);
    return out;
  }

  window.FBL_STORE = window.FBL_STORE || {};
  window.FBL_STORE.savePredictionsForRound = savePredictionsForRound;
  window.FBL_STORE.loadPredictionsForLeague = loadPredictionsForLeague;
})();
