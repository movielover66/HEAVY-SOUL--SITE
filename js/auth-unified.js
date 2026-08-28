// ============================================================
// HEAVY SOUL — UNIFIED LOGIN / SIGNUP
// One Firebase identity for everyone: Google, or Phone (verified
// once via MSG91 OTP at signup only), or Email. All three land in
// the same Firestore `users` collection. Include this ONE script
// (after config.js, auth.js, msg91-otp.js, and the Firebase
// app/auth/firestore compat SDKs) on any page that needs login —
// it injects its own modal markup, no HTML needed on the page.
//
// Usage: call openAuthModal() from an account icon's onclick.
// ============================================================

const AUTH_RESEND_LIMIT = 3;
const AUTH_RESEND_SECONDS = 30;

let _authIdentifierType = null; // 'email' | 'phone'
let _authIdentifierKey = null;  // normalized: lowercased email, or 'phone_<10digits>'
let _authSyntheticEmail = null; // for phone accounts
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

function injectAuthModal_() {
  if (document.getElementById("uAuthOverlay")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <div id="uAuthOverlay" class="u-auth-overlay" style="display:none;">
    <div class="u-auth-box">
      <button type="button" class="u-auth-close" onclick="closeAuthModal()">&times;</button>

      <div id="uAuthMsg" class="u-auth-msg"></div>

      <!-- STEP: entry -->
      <div id="uAuthStep-entry" class="u-auth-step">
        <h2>Login / Signup</h2>
        <button type="button" class="btn block u-auth-google" onclick="uHandleGoogle()">
          <svg width="18" height="18" viewBox="0 0 18 18" style="vertical-align:-3px;margin-right:8px;">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"/>
          </svg>
          Continue with Google
        </button>
        <div class="u-auth-divider"><span>or</span></div>
        <div class="field">
          <input id="uAuthIdentifier" type="text" placeholder="Email or mobile number">
        </div>
        <button type="button" class="btn accent block" onclick="uHandleContinue()">Continue</button>
      </div>

      <!-- STEP: login (password only) -->
      <div id="uAuthStep-login" class="u-auth-step" style="display:none;">
        <h2>Welcome back</h2>
        <p class="u-auth-sub" id="uAuthLoginLabel"></p>
        <div class="field">
          <input id="uAuthLoginPassword" type="password" placeholder="Password">
        </div>
        <button type="button" class="btn accent block" onclick="uHandleLogin()">Log in</button>
        <p class="u-auth-link" id="uAuthForgotWrap"><a href="#" onclick="uHandleForgot();return false;">Forgot password?</a></p>
        <p class="u-auth-link"><a href="#" onclick="uBackToEntry();return false;">&larr; Back</a></p>
      </div>

      <!-- STEP: signup -->
      <div id="uAuthStep-signup" class="u-auth-step" style="display:none;">
        <h2>Create your account</h2>
        <p class="u-auth-sub" id="uAuthSignupLabel"></p>
        <div class="field">
          <input id="uAuthSignupName" type="text" placeholder="Full name">
        </div>
        <div class="field">
          <input id="uAuthSignupPassword" type="password" placeholder="Create a password (min 6 characters)">
        </div>

        <div id="uAuthOtpBlock" style="display:none;">
          <button type="button" class="btn ghost block" id="uAuthSendOtpBtn" onclick="uHandleSendOtp()">Send OTP</button>
          <div class="field" id="uAuthOtpField" style="display:none;">
            <input id="uAuthOtpInput" type="tel" inputmode="numeric" maxlength="6" placeholder="Enter OTP">
          </div>
          <button type="button" class="btn ghost block" id="uAuthVerifyOtpBtn" style="display:none;" onclick="uHandleVerifyOtp()">Verify OTP</button>
        </div>

        <button type="button" class="btn accent block" id="uAuthCreateBtn" onclick="uHandleSignup()">Create account</button>
        <p class="u-auth-link"><a href="#" onclick="uBackToEntry();return false;">&larr; Back</a></p>
      </div>
      <!-- STEP: phone password reset -->
      <div id="uAuthStep-reset" class="u-auth-step" style="display:none;">
        <h2>Password reset করুন</h2>
        <p class="u-auth-sub">আপনার নম্বর যাচাই করে নতুন পাসওয়ার্ড সেট করুন।</p>
        <button type="button" class="btn ghost block" id="uResetSendOtpBtn" onclick="uHandleResetSendOtp()">Send OTP</button>
        <div class="field" id="uResetOtpField" style="display:none;">
          <input id="uResetOtpInput" type="tel" inputmode="numeric" maxlength="6" placeholder="Enter OTP">
        </div>
        <button type="button" class="btn ghost block" id="uResetVerifyOtpBtn" style="display:none;" onclick="uHandleResetVerifyOtp()">Verify OTP</button>
        <div class="field" id="uResetPasswordField" style="display:none;">
          <input id="uResetNewPassword" type="password" placeholder="নতুন পাসওয়ার্ড (min 6 characters)">
        </div>
        <button type="button" class="btn accent block" id="uResetSubmitBtn" style="display:none;" onclick="uHandleResetSubmit()">Set new password</button>
        <p class="u-auth-link"><a href="#" onclick="uBackToEntry();return false;">&larr; Back</a></p>
      </div>
    </div>
  </div>`;
  document.body.appendChild(wrap.firstElementChild);
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

function openAuthModal() {
  injectAuthModal_();
  uBackToEntry();
  document.getElementById("uAuthOverlay").style.display = "flex";
}

function closeAuthModal() {
  const el = document.getElementById("uAuthOverlay");
  if (el) el.style.display = "none";
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
    await uUpsertUserDoc_(user.uid, {
      name: user.displayName || "",
      email: user.email || "",
      provider: "google"
    });
    uShowMsg_("");
    closeAuthModal();
    if (typeof renderAccountState === "function") renderAccountState(user);
  } catch (err) {
    uShowMsg_(authErrorMessage ? authErrorMessage(err) : String(err), true);
  }
}

async function uHandleContinue() {
  const raw = document.getElementById("uAuthIdentifier").value;
  const parsed = normalizeIdentifier_(raw);
  if (!parsed) {
    uShowMsg_("সঠিক email অথবা ১০ ডিজিটের mobile number দিন।", true);
    return;
  }
  _authIdentifierType = parsed.type;
  _authIdentifierKey = parsed.key;
  if (parsed.type === "phone") {
    _authSyntheticEmail = parsed.phone + "@phone.heavysoul.in";
  }

  uShowMsg_("চেক করা হচ্ছে…");
  try {
    const doc = await firebase.firestore().collection("accountIndex").doc(_authIdentifierKey).get();
    if (doc.exists) {
      document.getElementById("uAuthLoginLabel").textContent =
        parsed.type === "phone" ? "+91 " + parsed.phone : raw.trim();
      document.getElementById("uAuthForgotWrap").style.display = "block";
      uShowStep_("login");
    } else {
      document.getElementById("uAuthSignupLabel").textContent =
        parsed.type === "phone" ? "+91 " + parsed.phone + " — নতুন account" : raw.trim() + " — নতুন account";
      document.getElementById("uAuthOtpBlock").style.display = (parsed.type === "phone") ? "block" : "none";
      document.getElementById("uAuthCreateBtn").disabled = (parsed.type === "phone");
      document.getElementById("uAuthSendOtpBtn").textContent = "Send OTP";
      document.getElementById("uAuthOtpField").style.display = "none";
      document.getElementById("uAuthVerifyOtpBtn").style.display = "none";
      uShowStep_("signup");
    }
  } catch (err) {
    uShowMsg_("সমস্যা হয়েছে, আবার চেষ্টা করুন।", true);
  }
}

async function uHandleLogin() {
  const password = document.getElementById("uAuthLoginPassword").value;
  if (!password) { uShowMsg_("Password দিন।", true); return; }
  const email = (_authIdentifierType === "phone") ? _authSyntheticEmail : _authIdentifierKey;
  try {
    uShowMsg_("Logging in…");
    const user = await authLogIn(email, password);
    uShowMsg_("");
    closeAuthModal();
    if (typeof renderAccountState === "function") renderAccountState(user);
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
    _authOtpAccessToken = null;
    _authFlowContext = "reset";
    _authResendCount = 0;
    uShowStep_("reset");
    return;
  }
  try {
    await authSendPasswordReset(_authIdentifierKey);
    uShowMsg_("Password reset link email-এ পাঠানো হয়েছে।");
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
    uShowMsg_("OTP পাঠানো হয়েছে।");
    uStartResetResendTimer_();
  } catch (err) {
    uShowMsg_("OTP পাঠাতে সমস্যা হয়েছে, আবার চেষ্টা করুন।", true);
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
  if (!otp) { uShowMsg_("OTP দিন।", true); return; }
  const btn = document.getElementById("uResetVerifyOtpBtn");
  btn.disabled = true;
  btn.textContent = "Verifying…";
  try {
    await hsVerifyOtp(otp);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Verify OTP";
    uShowMsg_("Verify করা যায়নি, আবার চেষ্টা করুন।", true);
  }
}

async function uHandleResetSubmit() {
  const newPassword = document.getElementById("uResetNewPassword").value;
  if (newPassword.length < 6) { uShowMsg_("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।", true); return; }
  if (!_authOtpAccessToken) { uShowMsg_("আগে OTP verify করুন।", true); return; }

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
      uShowMsg_("পাসওয়ার্ড পরিবর্তন হয়েছে। এখন Login করুন।");
      setTimeout(uBackToEntry, 1500);
    } else {
      uShowMsg_(data.error || "সমস্যা হয়েছে, আবার চেষ্টা করুন।", true);
      btn.disabled = false;
      btn.textContent = "Set new password";
    }
  } catch (err) {
    uShowMsg_("সমস্যা হয়েছে, আবার চেষ্টা করুন।", true);
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
  if (!phone) { uShowMsg_("সঠিক mobile number দিন।", true); return; }

  _authFlowContext = "signup";
  try {
    await hsSendOtp("91" + phone);
    _authResendCount++;
    document.getElementById("uAuthOtpField").style.display = "block";
    document.getElementById("uAuthVerifyOtpBtn").style.display = "block";
    document.getElementById("uAuthOtpInput").disabled = false;
    document.getElementById("uAuthVerifyOtpBtn").disabled = false;
    document.getElementById("uAuthVerifyOtpBtn").textContent = "Verify OTP";
    uShowMsg_("OTP পাঠানো হয়েছে।");
    uStartResendTimer_();
  } catch (err) {
    uShowMsg_("OTP পাঠাতে সমস্যা হয়েছে, আবার চেষ্টা করুন।", true);
  }
}

async function uHandleVerifyOtp() {
  const otp = document.getElementById("uAuthOtpInput").value.trim();
  if (!otp) { uShowMsg_("OTP দিন।", true); return; }
  const btn = document.getElementById("uAuthVerifyOtpBtn");
  btn.disabled = true;
  btn.textContent = "Verifying…";
  try {
    await hsVerifyOtp(otp);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Verify OTP";
    uShowMsg_("Verify করা যায়নি, আবার চেষ্টা করুন।", true);
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
    uShowMsg_("Phone verified ✓ — এখন নতুন পাসওয়ার্ড দিন।");
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
    uShowMsg_("OTP ভুল হয়েছে, আবার চেষ্টা করুন।", true);
    return;
  }
  const btn = document.getElementById("uAuthVerifyOtpBtn");
  btn.disabled = false;
  btn.textContent = "Verify OTP";
  uShowMsg_("OTP ভুল হয়েছে, আবার চেষ্টা করুন।", true);
});

async function uHandleSignup() {
  const name = document.getElementById("uAuthSignupName").value.trim();
  const password = document.getElementById("uAuthSignupPassword").value;
  if (name.length < 2) { uShowMsg_("নাম দিন।", true); return; }
  if (password.length < 6) { uShowMsg_("পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।", true); return; }
  if (_authIdentifierType === "phone" && !_authPhoneVerified) {
    uShowMsg_("আগে OTP verify করুন।", true);
    return;
  }

  const email = (_authIdentifierType === "phone") ? _authSyntheticEmail : _authIdentifierKey;
  try {
    uShowMsg_("Account তৈরি হচ্ছে…");
    const user = await authSignUp(name, email, password);
    await uUpsertUserDoc_(user.uid, {
      name: name,
      email: _authIdentifierType === "email" ? _authIdentifierKey : "",
      phone: _authIdentifierType === "phone" ? _authIdentifierKey.replace("phone_", "") : "",
      phoneVerified: _authIdentifierType === "phone",
      provider: _authIdentifierType
    });
    await firebase.firestore().collection("accountIndex").doc(_authIdentifierKey).set({ uid: user.uid });
    
    uShowMsg_("Account সফলভাবে তৈরি হয়েছে!");
    setTimeout(function() {
      closeAuthModal();
      if (typeof renderAccountState === "function") {
        renderAccountState(user);
      } else {
        window.location.reload();
      }
    }, 1000);

  } catch (err) {
    // যদি এই ইমেইল বা অ্যাকাউন্ট আগে থেকেই থাকে, তবে ইউজারকে সরাসরি Login পেজে নিয়ে যাবে
    if (err && (err.code === 'auth/email-already-in-use' || err.message?.includes('already in use') || err.code === 'auth/account-exists-with-different-credential')) {
      uShowMsg_("এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট আছে। Log in করুন।", true);
      document.getElementById("uAuthLoginLabel").textContent = _authIdentifierKey;
      document.getElementById("uAuthForgotWrap").style.display = "block";
      uShowStep_("login");
      return;
    }
    uShowMsg_(authErrorMessage ? authErrorMessage(err) : String(err), true);
  }
}

async function uUpsertUserDoc_(uid, data) {
  try {
    await firebase.firestore().collection("users").doc(uid).set(
      Object.assign({ updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, data),
      { merge: true }
    );
  } catch (err) {
    console.warn("Could not save user profile:", err);
  }
}

// ============================================================
// CHECKOUT AUTH PROTECTION HELPER
// ============================================================
window.requireAuthThenGo = function(destinationUrl) {
  const currentUser = firebase && firebase.auth && firebase.auth().currentUser;

  if (currentUser) {
    window.location.href = destinationUrl;
  } else {
    if (typeof openAuthModal === "function") {
      openAuthModal();
      if (typeof uShowMsg_ === "function") {
        uShowMsg_("চেকআউট করার আগে অনুগ্রহ করে লগইন বা সাইন-আপ করুন।");
      }
    } else {
      window.location.href = '/login?redirect=' + encodeURIComponent(destinationUrl);
    }
  }
};
