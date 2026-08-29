// ============================================================
// HEAVY SOUL — AUTH (Firebase Auth, free Spark plan)
// Loaded on every page after config.js + the Firebase SDK
// <script> tags. Handles signup, login, logout, and keeps the
// header account icon in sync with the logged-in state.
// ============================================================

if (window.firebase && SITE_CONFIG.FIREBASE_CONFIG.apiKey !== "PASTE_API_KEY_HERE") {
  firebase.initializeApp(SITE_CONFIG.FIREBASE_CONFIG);
}

function authReady() {
  return window.firebase && firebase.apps.length > 0;
}

// ---- signup ----
async function authSignUp(name, email, password) {
  if (!authReady()) throw new Error("Auth not configured yet.");
  const cred = await firebase.auth().createUserWithEmailAndPassword(email, password);
  if (name) await cred.user.updateProfile({ displayName: name });
  return cred.user;
}

// ---- login ----
async function authLogIn(email, password) {
  if (!authReady()) throw new Error("Auth not configured yet.");
  const cred = await firebase.auth().signInWithEmailAndPassword(email, password);
  return cred.user;
}

// ---- google sign-in (popup) ----
async function authGoogleSignIn() {
  if (!authReady()) throw new Error("Auth not configured yet.");
  const provider = new firebase.auth.GoogleAuthProvider();
  const cred = await firebase.auth().signInWithPopup(provider);
  return cred.user;
}

// ---- logout ----
async function authLogOut() {
  if (!authReady()) return;
  await firebase.auth().signOut();
  window.location.href = "index.html";
}

// ---- forgot password ----
async function authSendPasswordReset(email) {
  if (!authReady()) throw new Error("Auth not configured yet.");
  // Send users to our own branded reset page instead of Firebase's
  // generic firebaseapp.com page.
  const actionCodeSettings = {
    url: window.location.origin + "/reset-password.html"
  };
  await firebase.auth().sendPasswordResetEmail(email, actionCodeSettings);
}

// ---- friendly error text ----
function authErrorMessage(err) {
  const map = {
    "auth/email-already-in-use": "এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে। Log in করুন।",
    "auth/invalid-email": "সঠিক ইমেইল দিন।",
    "auth/weak-password": "পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।",
    "auth/user-not-found": "এই ইমেইলে কোনো অ্যাকাউন্ট নেই।",
    "auth/wrong-password": "পাসওয়ার্ড ভুল হয়েছে।",
    "auth/invalid-credential": "ইমেইল বা পাসওয়ার্ড ভুল।",
    "auth/too-many-requests": "অনেকবার ভুল হয়েছে, একটু পরে চেষ্টা করুন।"
  };
  return map[err.code] || (err.message || "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন।");
}

// ---- keep header account icon + menu link in sync ----
function renderAccountState(user) {
  const el = document.getElementById("accountBtn");
  if (el) {
    if (user) {
      el.title = user.displayName || user.email;
      el.classList.add("logged-in");
    } else {
      el.title = "Login / Signup";
      el.classList.remove("logged-in");
    }
  }
  ["navLoginLink", "navLoginLinkMobile"].forEach(function (id) {
    const link = document.getElementById(id);
    if (!link) return;
    link.textContent = user ? "My Account" : "Login / Signup";
  });
}

document.addEventListener("DOMContentLoaded", function () {
  if (!authReady()) return;
  firebase.auth().onAuthStateChanged(renderAccountState);
});
