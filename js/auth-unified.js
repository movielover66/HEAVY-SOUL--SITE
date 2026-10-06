// ============================================================
// HEAVY SOUL — UNIFIED LOGIN / SIGNUP
// One Firebase identity for everyone: Google, Phone (verified once
// via MSG91 OTP at signup only), or Email. Include this ONE script
// (after config.js, auth.js, msg91-otp.js, and the Firebase
// app/auth/firestore compat SDKs) on account.html, where the step
// markup lives directly in the page HTML.
//
// EXISTENCE CHECK — why this uses our own Firestore index, not
// Firebase's fetchSignInMethodsForEmail():
// Firebase Auth's "Email Enumeration Protection" (on by default for
// newer projects, Firebase Console -> Authentication -> Settings ->
// User actions) makes fetchSignInMethodsForEmail() always return []
// regardless of whether the account exists, specifically so outsiders
// can't probe which emails are registered. That makes it useless here.
// So we keep our own `accountIndex` collection as the source of truth
// for "does this account exist" — but unlike an earlier version of
// this file, the accountIndex doc and the users/{uid} profile doc are
// now written together in a single Firestore .batch(), so they can
// never go out of sync with each other: either both are saved or
// neither is (a batch is all-or-nothing). Firebase Auth account
// creation itself is a separate system and can't be included in that
// same atomic batch, so uHandleSignup() also self-heals on the rare
// case where Auth account creation succeeded but the Firestore batch
// didn't reach the server (e.g. tab closed mid-request): it catches
// 'auth/email-already-in-use' on a later retry and routes straight to
// login instead of leaving the person stuck.
//
// Firestore rules needed for this to work (the existence check runs
// BEFORE the person is signed in, so it must be a public, unauthenticated
// read — but keep the accountIndex documents free of any personal data,
// just a marker, so a public read never leaks anything):
//   match /accountIndex/{id} {
//     allow get: if true;
//     allow create: if request.auth != null && request.auth.uid == request.resource.data.uid;
//     allow update, delete: if false;
//   }
//   match /users/{uid} {
//     allow get: if request.auth != null && request.auth.uid == uid;
//     allow create, update: if request.auth != null && request.auth.uid == uid;
//   }
//
// Usage: the step markup lives directly on account.html — there is
// no popup. requireAuthThenGo(url) redirects to
// account.html?redirect=url when a login is needed first.
// ============================================================

const AUTH_RESEND_LIMIT = 3;
const AUTH_RESEND_SECONDS = 30;

let _authIdentifierType = null; // 'email' | 'phone'
let _authIdentifierKey = null;  // normalized: lowercased email, or 'phone_<10digits>'
let _authSyntheticEmail = null; // for phone accounts — internal only, never shown to the user
let _authPhoneVerified = false;
let _authResendCount = 0;
let _authResendTimer = null;
let _authFlowContext = "signup"; // 'signup' | 'reset' — which OTP flow is currently active
let _authResetPhone = null;
let _authOtpAccessToken = null; // raw MSG91 access-token, needed server-side for reset

function normalizeIdentifier_(raw) {
  const value = String(raw || "").trim();
  const digits = value.replace(/\D/g, "");
  const last10 = digits.slice(-10);
  if (/^[6-9]\d{9}$/.test(last10) && digits.length <= 12) {
    return { type: "phone", key: "phone_" + last10, phone: last10 };
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { type: "email", key: value.toLowerCase() };
  }
  return null;
}

// NOTE: This is an INLINE PAGE auth form, not a popup modal. The step
// markup (#uAuthStep-entry / -login / -signup / -reset, plus
// #uAuthMsg) lives directly in account.html's HTML. This file only
// wires up the behaviour. On DOMContentLoaded, if that markup is
// present on the page, we reset it to the "entry" step.
document.addEventListener("DOMContentLoaded", function () {
  if (document.getElementById("uAuthStep-entry")) {
    uBackToEntry();
  }
});

// After a successful login/signup, if the user arrived via
// account.html?redirect=checkout.html (e.g. from the cart's
// "Checkout" button), send them straight there. Otherwise, do
// nothing further here — account.html's own onAuthStateChanged
// listener swaps the login form out for the account view.
function uAuthSuccess_() {
  const redirect = new URLSearchParams(window.location.search).get("redirect");
  if (redirect) window.location.href = redirect;
}

function uShowMsg_(text, isError) {
  const el = document.getElementById("uAuthMsg");
  el.textContent = text || "";
  el.className = "u-auth-msg" + (text ? " show" : "") + (isError ? " error" : "");
}

function uShowStep_(step) {
  ["entry", "login", "signup", "reset"].forEach(function (s) {
    document.getElementById("uAuthStep-" + s).style.display = (s === step) ? "block" : "none";
  });
  uShowMsg_("");
}

function uBackToEntry() {
  _authIdentifierType = null;
  _authIdentifierKey = null;
  _authSyntheticEmail = null;
  _authPhoneVerified = false;
  _authResendCount = 0;
  _authFlowContext = "signup";
  _authOtpAccessToken = null;
  _authResetPhone = null;
  clearInterval(_authResendTimer);
  const idEl = document.getElementById("uAuthIdentifier");
  if (idEl) idEl.value = "";
  uShowStep_("entry");
}

async function uHandleGoogle() {
  try {
    uShowMsg_("Opening Google sign-in…");
    const user = await authGoogleSignIn();
    const googleKey = String(user.email || "").toLowerCase();
    await uCreateAccountRecords_(user.uid, googleKey, {
      name: user.displayName || "",
      email: user.email || "",
      provider: "google"
    });
    uShowMsg_("");
    if (typeof renderAccountState === "function") renderAccountState(user);
    uAuthSuccess_();
  } catch (err) {
    uShowMsg_(authErrorMessage ? authErrorMessage(err) : String(err), true);
  }
}

async function uHandleContinue() {
  const raw = document.getElementById("uAuthIdentifier").value;
  const parsed = normalizeIdentifier_(raw);
  if (!parsed) {
    uShowMsg_("Please enter a valid email or 10-digit mobile number.", true);
    return;
  }
  _authIdentifierType = parsed.type;
  _authIdentifierKey = parsed.key;
  if (parsed.type === "phone") {
    _authSyntheticEmail = parsed.phone + "@phone.heavysoul.in";
  }

  uShowMsg_("Checking…");
  try {
    const doc = await firebase.firestore().collection("accountIndex").doc(_authIdentifierKey).get();

    if (doc.exists) {
      // Existing account — show the login step.
      document.getElementById("uAuthLoginLabel").textContent =
        parsed.type === "phone" ? "+91 " + parsed.phone : raw.trim();
      document.getElementById("uAuthForgotWrap").style.display =
        (doc.data() && doc.data().provider === "google") ? "none" : "block";
      if (doc.data() && doc.data().provider === "google") {
        uShowMsg_("This account uses Google Sign-in. Please use \u201cContinue with Google\u201d above instead.", true);
        return;
      }
      uShowStep_("login");

    } else {
      // No account yet — show the signup step.
      document.getElementById("uAuthSignupLabel").textContent =
        parsed.type === "phone" ? "+91 " + parsed.phone + " — new account" : raw.trim() + " — new account";
      document.getElementById("uAuthOtpBlock").style.display = (parsed.type === "phone") ? "block" : "none";
      document.getElementById("uAuthCreateBtn").disabled = (parsed.type === "phone");
      document.getElementById("uAuthSendOtpBtn").textContent = "Send OTP";
      document.getElementById("uAuthOtpField").style.display = "none";
      document.getElementById("uAuthVerifyOtpBtn").style.display = "none";
      uShowStep_("signup");
    }
  } catch (err) {
    uShowMsg_("Something went wrong. Please try again.", true);
  }
}

async function uHandleLogin() {
  const password = document.getElementById("uAuthLoginPassword").value;
  if (!password) { uShowMsg_("Please enter your password.", true); return; }
  const email = (_authIdentifierType === "phone") ? _authSyntheticEmail : _authIdentifierKey;
  try {
    uShowMsg_("Logging in…");
    const user = await authLogIn(email, password);
    uShowMsg_("");
    if (typeof renderAccountState === "function") renderAccountState(user);
    uAuthSuccess_();
  } catch (err) {
    uShowMsg_(authErrorMessage ? authErrorMessage(err) : String(err), true);
  }
}

async function uHandleForgot() {
  if (_authIdentifierType === "phone") {
    _authResetPhone = _authIdentifierKey.replace("phone_", "");
    document.getElementById("uResetSendOtpBtn").style.display = "block";
    document.getElementById("uResetSendOtpBtn").textContent = "Send OTP";
    document.getElementById("uResetSendOtpBtn").disabled = false;
    document.getElementById("uResetOtpField").style.display = "none";
    document.getElementById("uResetVerifyOtpBtn").style.display = "none";
    document.getElementById("uResetPasswordField").style.display = "none";
    document.getElementById("uResetSubmitBtn").style.display = "none";
    // Clear stale values/state left over from a previous reset attempt
    document.getElementById("uResetOtpInput").value = "";
    document.getElementById("uResetOtpInput").disabled = false;
    document.getElementById("uResetVerifyOtpBtn").disabled = false;
    document.getElementById("uResetVerifyOtpBtn").textContent = "Verify OTP";
    document.getElementById("uResetNewPassword").value = "";
    document.getElementById("uResetSubmitBtn").disabled = false;
    document.getElementById("uResetSubmitBtn").textContent = "Set new password";
    clearInterval(_authResendTimer);
    _authOtpAccessToken = null;
    _authFlowContext = "reset";
    _authResendCount = 0;
    uShowStep_("reset");
    return;
  }
  try {
    await authSendPasswordReset(_authIdentifierKey);
    uShowMsg_("A password reset link has been sent to your email.");
  } catch (err) {
    uShowMsg_(authErrorMessage ? authErrorMessage(err) : String(err), true);
  }
}

async function uHandleResetSendOtp() {
  if (_authResendCount >= AUTH_RESEND_LIMIT) return;
  try {
    await hsSendOtp("91" + _authResetPhone);
    _authResendCount++;
    document.getElementById("uResetOtpField").style.display = "block";
    document.getElementById("uResetVerifyOtpBtn").style.display = "block";
    document.getElementById("uResetOtpInput").disabled = false;
    document.getElementById("uResetVerifyOtpBtn").disabled = false;
    document.getElementById("uResetVerifyOtpBtn").textContent = "Verify OTP";
    uShowMsg_("OTP sent.");
    uStartResetResendTimer_();
  } catch (err) {
    uShowMsg_("Could not send OTP. Please try again.", true);
  }
}

function uStartResetResendTimer_() {
  const btn = document.getElementById("uResetSendOtpBtn");
  let seconds = AUTH_RESEND_SECONDS;
  btn.disabled = true;
  clearInterval(_authResendTimer);
  _authResendTimer = setInterval(function () {
    seconds--;
    btn.textContent = "Resend OTP (" + seconds + "s)";
    if (seconds <= 0) {
      clearInterval(_authResendTimer);
      btn.disabled = _authResendCount >= AUTH_RESEND_LIMIT;
      btn.textContent = btn.disabled ? "Resend limit reached" : "Resend OTP";
    }
  }, 1000);
}

async function uHandleResetVerifyOtp() {
  const otp = document.getElementById("uResetOtpInput").value.trim();
  if (!otp) { uShowMsg_("Please enter the OTP.", true); return; }
  const btn = document.getElementById("uResetVerifyOtpBtn");
  btn.disabled = true;
  btn.textContent = "Verifying…";
  try {
    await hsVerifyOtp(otp);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Verify OTP";
    uShowMsg_("Could not verify. Please try again.", true);
  }
}

async function uHandleResetSubmit() {
  const newPassword = document.getElementById("uResetNewPassword").value;
  if (newPassword.length < 6) { uShowMsg_("Password must be at least 6 characters.", true); return; }
  if (!_authOtpAccessToken) { uShowMsg_("Please verify the OTP first.", true); return; }

  const btn = document.getElementById("uResetSubmitBtn");
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    const res = await fetch("/api/phone-forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: _authOtpAccessToken, phone: _authResetPhone, newPassword: newPassword })
    });
    const data = await res.json();
    if (data.success) {
      uShowMsg_("Password changed. Please log in now.");
      setTimeout(uBackToEntry, 1500);
    } else {
      uShowMsg_(data.error || "Something went wrong. Please try again.", true);
      btn.disabled = false;
      btn.textContent = "Set new password";
    }
  } catch (err) {
    uShowMsg_("Something went wrong. Please try again.", true);
    btn.disabled = false;
    btn.textContent = "Set new password";
  }
}

// ---- signup: OTP (phone only) ----
function uStartResendTimer_() {
  const btn = document.getElementById("uAuthSendOtpBtn");
  let seconds = AUTH_RESEND_SECONDS;
  btn.disabled = true;
  clearInterval(_authResendTimer);
  _authResendTimer = setInterval(function () {
    seconds--;
    btn.textContent = "Resend OTP (" + seconds + "s)";
    if (seconds <= 0) {
      clearInterval(_authResendTimer);
      btn.disabled = _authResendCount >= AUTH_RESEND_LIMIT;
      btn.textContent = btn.disabled ? "Resend limit reached" : "Resend OTP";
    }
  }, 1000);
}

async function uHandleSendOtp() {
  if (_authResendCount >= AUTH_RESEND_LIMIT) return;
  const parsed = normalizeIdentifier_(document.getElementById("uAuthIdentifier") ? document.getElementById("uAuthIdentifier").value : "");
  const phone = parsed ? parsed.phone : null;
  if (!phone) { uShowMsg_("Please enter a valid mobile number.", true); return; }

  _authFlowContext = "signup";
  try {
    await hsSendOtp("91" + phone);
    _authResendCount++;
    document.getElementById("uAuthOtpField").style.display = "block";
    document.getElementById("uAuthVerifyOtpBtn").style.display = "block";
    document.getElementById("uAuthOtpInput").disabled = false;
    document.getElementById("uAuthVerifyOtpBtn").disabled = false;
    document.getElementById("uAuthVerifyOtpBtn").textContent = "Verify OTP";
    uShowMsg_("OTP sent.");
    uStartResendTimer_();
  } catch (err) {
    uShowMsg_("Could not send OTP. Please try again.", true);
  }
}

async function uHandleVerifyOtp() {
  const otp = document.getElementById("uAuthOtpInput").value.trim();
  if (!otp) { uShowMsg_("Please enter the OTP.", true); return; }
  const btn = document.getElementById("uAuthVerifyOtpBtn");
  btn.disabled = true;
  btn.textContent = "Verifying…";
  try {
    await hsVerifyOtp(otp);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Verify OTP";
    uShowMsg_("Could not verify. Please try again.", true);
  }
}

window.addEventListener("hs:otpVerified", function (e) {
  _authOtpAccessToken = (e.detail && e.detail.message) || null;
  if (_authFlowContext === "reset") {
    document.getElementById("uResetVerifyOtpBtn").textContent = "✓ Verified";
    document.getElementById("uResetOtpInput").disabled = true;
    document.getElementById("uResetSendOtpBtn").style.display = "none";
    document.getElementById("uResetPasswordField").style.display = "block";
    document.getElementById("uResetSubmitBtn").style.display = "block";
    uShowMsg_("Phone verified ✓ — now set a new password.");
    return;
  }
  _authPhoneVerified = true;
  document.getElementById("uAuthVerifyOtpBtn").textContent = "✓ Verified";
  document.getElementById("uAuthOtpInput").disabled = true;
  document.getElementById("uAuthSendOtpBtn").style.display = "none";
  document.getElementById("uAuthCreateBtn").disabled = false;
  uShowMsg_("Phone verified ✓");
});

window.addEventListener("hs:otpFailed", function () {
  if (_authFlowContext === "reset") {
    const rbtn = document.getElementById("uResetVerifyOtpBtn");
    rbtn.disabled = false;
    rbtn.textContent = "Verify OTP";
    uShowMsg_("Incorrect OTP. Please try again.", true);
    return;
  }
  const btn = document.getElementById("uAuthVerifyOtpBtn");
  btn.disabled = false;
  btn.textContent = "Verify OTP";
  uShowMsg_("Incorrect OTP. Please try again.", true);
});

async function uHandleSignup() {
  const name = document.getElementById("uAuthSignupName").value.trim();
  const password = document.getElementById("uAuthSignupPassword").value;
  if (name.length < 2) { uShowMsg_("Please enter your name.", true); return; }
  if (password.length < 6) { uShowMsg_("Password must be at least 6 characters.", true); return; }
  if (_authIdentifierType === "phone" && !_authPhoneVerified) {
    uShowMsg_("Please verify the OTP first.", true);
    return;
  }

  const email = (_authIdentifierType === "phone") ? _authSyntheticEmail : _authIdentifierKey;
  try {
    uShowMsg_("Creating your account…");
    const user = await authSignUp(name, email, password);
    await uCreateAccountRecords_(user.uid, _authIdentifierKey, {
      name: name,
      email: _authIdentifierType === "email" ? _authIdentifierKey : "",
      phone: _authIdentifierType === "phone" ? _authIdentifierKey.replace("phone_", "") : "",
      phoneVerified: _authIdentifierType === "phone",
      provider: _authIdentifierType
    });

    uShowMsg_("Account created successfully!");
    setTimeout(function () {
      if (typeof renderAccountState === "function") renderAccountState(user);
      uAuthSuccess_();
    }, 1000);

  } catch (err) {
    // If this account turns out to already exist (e.g. a signup was
    // retried after a partial failure), send the user straight to
    // the login step instead of showing a dead end.
    if (err && (err.code === 'auth/email-already-in-use' || err.code === 'auth/account-exists-with-different-credential')) {
      uShowMsg_("An account already exists. Please log in instead.", true);
      document.getElementById("uAuthLoginLabel").textContent =
        _authIdentifierType === "phone" ? "+91 " + _authIdentifierKey.replace("phone_", "") : _authIdentifierKey;
      document.getElementById("uAuthForgotWrap").style.display = "block";
      uShowStep_("login");
      return;
    }
    uShowMsg_(authErrorMessage ? authErrorMessage(err) : String(err), true);
  }
}

// Writes the full profile (users/{uid}) and the lightweight existence
// marker (accountIndex/{identifierKey}) in ONE Firestore batch, so the
// two can never go out of sync with each other — either both are saved
// or neither is. The accountIndex doc intentionally carries almost no
// data (just enough to route "Continue" correctly and show the right
// provider message) since it must be publicly readable, unauthenticated,
// for the existence check on account.html to work before sign-in.
async function uCreateAccountRecords_(uid, identifierKey, data) {
  const db = firebase.firestore();
  const batch = db.batch();

  batch.set(
    db.collection("users").doc(uid),
    Object.assign({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, data),
    { merge: true }
  );

  batch.set(
    db.collection("accountIndex").doc(identifierKey),
    { uid: uid, provider: data.provider || "" }
  );

  await batch.commit();
}

// ============================================================
// CHECKOUT AUTH PROTECTION HELPER
// ============================================================
window.requireAuthThenGo = function (destinationUrl) {
  const currentUser = firebase && firebase.auth && firebase.auth().currentUser;

  if (currentUser) {
    window.location.href = destinationUrl;
  } else {
    window.location.href = 'account.html?redirect=' + encodeURIComponent(destinationUrl);
  }
};
