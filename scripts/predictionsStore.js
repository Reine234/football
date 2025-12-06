(function () {
  const auth = firebase.auth();
  const db = firebase.firestore();

  async function savePredictionsForRound(leagueKey, roundNum, pending) {
    async function waitForUid() {
  const user = firebase.auth().currentUser;
  if (user) {
    return user.uid;
  }
  throw new Error('User not logged in');
}

    const uid = await waitForUid();
    if (!uid) throw new Error("Not logged in");

    const batch = db.batch();

    pending.forEach((p) => {
      const fixtureId = String(p.fixtureId);
      const docId = `${uid}_${leagueKey}_${fixtureId}`;
      const ref = db.collection("predictions").doc(docId);

      batch.set(ref, {
        ...p,
        uid,
        league: leagueKey,
        matchday: String(roundNum),
        fixtureId,
        timestamp: p.timestamp || new Date().toISOString(),
      }, { merge: true });
    });

    await batch.commit();
    console.log("[STORE] saved", pending.length, "to", leagueKey, "round", roundNum);
    return true;
  }

  window.FBL_STORE = window.FBL_STORE || {};
  window.FBL_STORE.savePredictionsForRound = savePredictionsForRound;
})();
