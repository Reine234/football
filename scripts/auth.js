

(function (global) {
  // We expose two globals:
  //   window.FBL_AUTH  -> signup/signin + redirect
  //   (we do NOT touch window.FBL here, that's your match/fixture logic)

  //
  // -- "XML database" helpers (stored in localStorage) --
  //
  function loadUsersXMLDoc() {
    let xmlStr = localStorage.getItem("FBL_usersXML");
    if (!xmlStr) {
      // first time ever: create empty root
      xmlStr = "<users></users>";
      localStorage.setItem("FBL_usersXML", xmlStr);
    }
    return new DOMParser().parseFromString(xmlStr, "text/xml");
  }

  function saveUsersXMLDoc(doc) {
    const xmlStr = new XMLSerializer().serializeToString(doc);
    localStorage.setItem("FBL_usersXML", xmlStr);
  }

  function findUserNode(doc, usernameOrEmail) {
    const users = doc.getElementsByTagName("user");
    for (let i = 0; i < users.length; i++) {
      const u = users[i];
      const uname = u.getAttribute("username") || "";
      const email = u.getAttribute("email") || "";
      if (
        uname.toLowerCase() === usernameOrEmail.toLowerCase() ||
        email.toLowerCase() === usernameOrEmail.toLowerCase()
      ) {
        return u;
      }
    }
    return null;
  }

  //
  // -- SIGN UP --
  //
  function signUp(username, email, password) {
    if (!username || !email || !password) {
      return { ok: false, error: "All fields are required." };
    }

    const doc = loadUsersXMLDoc();

    // check duplicate via username or email
    if (findUserNode(doc, username) || findUserNode(doc, email)) {
      return { ok: false, error: "User already exists." };
    }

    // <user username="..." email="..." password="..."/>
    const newUser = doc.createElement("user");
    newUser.setAttribute("username", username);
    newUser.setAttribute("email", email);
    newUser.setAttribute("password", password);

    doc.documentElement.appendChild(newUser);
    saveUsersXMLDoc(doc);

    // mark them logged in for this session
    sessionStorage.setItem("FBL_loggedInUser", username);

    return { ok: true };
  }

  //
  // -- SIGN IN --
  //
  function signIn(usernameOrEmail, password) {
    if (!usernameOrEmail || !password) {
      return { ok: false, error: "All fields are required." };
    }

    const doc  = loadUsersXMLDoc();
    const node = findUserNode(doc, usernameOrEmail);
    if (!node) {
      return { ok: false, error: "User not found." };
    }

    if (node.getAttribute("password") !== password) {
      return { ok: false, error: "Wrong password." };
    }

    // mark active session user
    sessionStorage.setItem(
      "FBL_loggedInUser",
      node.getAttribute("username") || usernameOrEmail
    );

    return { ok: true };
  }

  //
  // -- REDIRECT AFTER AUTH (THIS WAS MISSING) --
  //
  function redirectToResultsForCurrentLeague() {
    // predictionsPage.js sets this before sending user to signin.html:
    // sessionStorage.setItem("FBL_leagueKey", leagueKey);
    //
    // Expected values:
    //   "PREMIER_LEAGUE"
    //   "LALIGA"
    //   "BUNDESLIGA"
    //
    const leagueKey = sessionStorage.getItem("FBL_leagueKey") || "PREMIER_LEAGUE";

    let folder = "premier";
    if (leagueKey === "LALIGA") {
      folder = "laliga";
    } else if (leagueKey === "BUNDESLIGA") {
      folder = "bundesliga";
    }

    // Send them to that league's results page
    window.location.href = "./" + folder + "/results.html";
  }

  //
  // -- EXPOSE PUBLIC API --
  //
  global.FBL_AUTH = {
    signUp,
    signIn,
    redirectToResultsForCurrentLeague,
  };
})(window);



