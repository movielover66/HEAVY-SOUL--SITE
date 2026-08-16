// ============================================================
// HEAVY SOUL — AUTH MODAL (Email-first + Google)
// Bottom-sheet login/signup, shown only when the user tries to
// go to checkout. Requires js/auth.js + Firebase SDK loaded first.
//
// FLOW (matches thesouledstore.com):
//  1. User types email, hits Continue.
//  2. We check whether that email already has an account.
//     - Exists      -> show password field only (Login).
//     - Doesn't      -> show Name + Password fields (Signup).
//  3. Brand-new accounts (email signup OR first-time Google) are
//     asked for a phone number before continuing to checkout,
//     since we need it for shipping anyway.
//
// NOTE: Firebase's fetchSignInMethodsForEmail() can return an
// empty list even for an existing account on projects with email
// enumeration protection turned on — so as a safety net, if a
// "signup" attempt hits auth/email-already-in-use, we pivot the
// user to the login step automatically instead of showing an error.
// ============================================================

let _authModalOnSuccess = null;
let _authModalEmail = "";

// Call this from a "Checkout" button instead of navigating directly.
function requireAuthThenGo(destinationUrl) {
  if (!authReady()) {
    window.location.href = destinationUrl;
    return;
  }
  const user = firebase.auth().currentUser;
  if (user) {
    window.location.href = destinationUrl;
    return;
  }
  _authModalOnSuccess = () => { window.location.href = destinationUrl; };
  openAuthModal();
}

function openAuthModal() {
  document.getElementById("authModalOverlay").classList.add("open");
  document.getElementById("authEmailInput").value = "";
  showAuthStep("start");
}

function closeAuthModal() {
  document.getElementById("authModalOverlay").classList.remove("open");
}

function showAuthStep(step) {
  document.querySelectorAll(".auth-modal-step").forEach(el => el.classList.remove("active"));
  document.getElementById("authStep-" + step).classList.add("active");
  const msg = document.getElementById("authModalMsg");
  msg.classList.remove("show");
  msg.style.color = "";
}

function authModalError(text) {
  const msg = document.getElementById("authModalMsg");
  msg.style.color = "";
  msg.textContent = text;
  msg.classList.add("show");
}

function finishAuthSuccess() {
  closeAuthModal();
  if (_authModalOnSuccess) _authModalOnSuccess();
}

function backToEmailStep() {
  showAuthStep("start");
}

// ---- step 1: email -> decide login vs signup ----
async function handleEmailContinue() {
  const email = document.getElementById("authEmailInput").value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    authModalError("সঠিক ইমেইল দিন।");
    return;
  }
  _authModalEmail = email;
  const btn = document.getElementById("authEmailBtn");
  btn.disabled = true; btn.textContent = "Checking…";

  try {
    const methods = await firebase.auth().fetchSignInMethodsForEmail(email);
    if (methods && methods.length > 0) {
      goToLoginStep();
    } else {
      goToSignupStep();
    }
  } catch (err) {
    // If the check itself fails for any reason, default to signup —
    // the email-already-in-use safety net below will catch existing users.
    goToSignupStep();
  }
  btn.disabled = false; btn.textContent = "Continue";
}

function goToLoginStep() {
  document.getElementById("loginEmailDisplay").textContent = _authModalEmail;
  document.getElementById("authLoginPassword").value = "";
  showAuthStep("login");
}

function goToSignupStep() {
  document.getElementById("signupEmailDisplay").textContent = _authModalEmail;
  document.getElementById("authSignupName").value = "";
  document.getElementById("authSignupPassword").value = "";
  showAuthStep("signup");
}

// ---- step 2a: login ----
async function handleModalForgotPassword() {
  const msg = document.getElementById("authModalMsg");
  msg.classList.remove("show");
  try {
    await authSendPasswordReset(_authModalEmail);
    msg.style.color = "#2e9e4c";
    msg.textContent = "পাসওয়ার্ড রিসেট লিংক " + _authModalEmail + "-এ পাঠানো হয়েছে।";
    msg.classList.add("show");
  } catch (err) {
    msg.style.color = "";
    authModalError(authErrorMessage(err));
  }
}

async function handleModalLogin() {
  const password = document.getElementById("authLoginPassword").value;
  const btn = document.getElementById("modalLoginBtn");
  btn.disabled = true; btn.textContent = "Logging in…";
  try {
    await authLogIn(_authModalEmail, password);
    finishAuthSuccess();
  } catch (err) {
    if (err.code === "auth/user-not-found") {
      goToSignupStep();
    } else {
      authModalError(authErrorMessage(err));
    }
  }
  btn.disabled = false; btn.textContent = "Log in";
}

// ---- step 2b: signup ----
async function handleModalSignup() {
  const name = document.getElementById("authSignupName").value.trim();
  const password = document.getElementById("authSignupPassword").value;
  if (!name) { authModalError("নাম দিন।"); return; }
  const btn = document.getElementById("modalSignupBtn");
  btn.disabled = true; btn.textContent = "Creating account…";
  try {
    await authSignUp(name, _authModalEmail, password);
    goToDetailsStep(name);
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      // Safety net: enumeration protection said "new" but it isn't.
      goToLoginStep();
      document.getElementById("authLoginPassword").value = password; // save them a retype
      authModalError("এই ইমেইলে আগেই অ্যাকাউন্ট আছে — পাসওয়ার্ড দিয়ে লগ-ইন করুন।");
    } else {
      authModalError(authErrorMessage(err));
    }
  }
  btn.disabled = false; btn.textContent = "Sign up";
}

// ---- Google (separate, always available from step 1) ----
async function signInWithGoogle() {
  try {
    const result = await firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider());
    const isNewUser = result.additionalUserInfo && result.additionalUserInfo.isNewUser;
    if (isNewUser) {
      goToDetailsStep(result.user.displayName);
    } else {
      finishAuthSuccess();
    }
  } catch (err) {
    authModalError(err.message || "Google login-এ সমস্যা হয়েছে।");
  }
}

// ---- shared "phone number" step for any brand-new account ----
let _phoneVerified = false;

function goToDetailsStep(prefillName) {
  document.getElementById("authDetailsName").value = prefillName || "";
  document.getElementById("authDetailsPhone").value = "";
  document.getElementById("authOtpInput").value = "";
  document.getElementById("authOtpField").style.display = "none";
  document.getElementById("authVerifyOtpBtn").style.display = "none";
  document.getElementById("authVerifyOtpBtn").disabled = false;
  document.getElementById("authVerifyOtpBtn").textContent = "Verify OTP";
  document.getElementById("authSendOtpBtn").textContent = "Send OTP";
  document.getElementById("authOtpInput").disabled = false;
  _phoneVerified = false;
  showAuthStep("details");
}

// ---- phone OTP: send + verify (MSG91) ----
async function sendPhoneOtp() {
  const phone = document.getElementById("authDetailsPhone").value.trim();
  if (!/^[6-9]\d{9}$/.test(phone)) { authModalError("সঠিক ১০ ডিজিটের মোবাইল নম্বর দিন।"); return; }

  const msg = document.getElementById("authModalMsg");
  msg.classList.remove("show");
  _phoneVerified = false;
  const btn = document.getElementById("authSendOtpBtn");
  btn.disabled = true; btn.textContent = "Sending…";
  try {
    await hsSendOtp("91" + phone);
    document.getElementById("authOtpField").style.display = "block";
    document.getElementById("authVerifyOtpBtn").style.display = "block";
    btn.textContent = "Resend OTP";
  } catch (err) {
    authModalError("OTP পাঠাতে সমস্যা হয়েছে: " + (err && err.message ? err.message : "unknown error"));
    btn.textContent = "Send OTP";
  }
  btn.disabled = false;
}

async function verifyPhoneOtp() {
  const otp = document.getElementById("authOtpInput").value.trim();
  if (!/^\d{4,6}$/.test(otp)) { authModalError("সঠিক OTP দিন।"); return; }

  const btn = document.getElementById("authVerifyOtpBtn");
  btn.disabled = true; btn.textContent = "Verifying…";
  await hsVerifyOtp(otp);
  // result arrives async via the hs:otpVerified / hs:otpFailed events below
}

window.addEventListener("hs:otpVerified", async (e) => {
  const accessToken = e.detail && e.detail.message;
  const btn = document.getElementById("authVerifyOtpBtn");
  btn.textContent = "Confirming…";

  try {
    const res = await fetch(SITE_CONFIG.APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ type: "verify_phone_otp", accessToken: accessToken })
    });
    const data = await res.json();

    if (data && data.success) {
      _phoneVerified = true;
      const msg = document.getElementById("authModalMsg");
      msg.classList.remove("show");
      btn.textContent = "✓ Verified";
      btn.disabled = true;
      document.getElementById("authOtpInput").disabled = true;
    } else {
      _phoneVerified = false;
      authModalError("OTP verify করা যায়নি, আবার চেষ্টা করুন।");
      btn.disabled = false; btn.textContent = "Verify OTP";
    }
  } catch (err) {
    _phoneVerified = false;
    authModalError("সার্ভার সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    btn.disabled = false; btn.textContent = "Verify OTP";
  }
});

window.addEventListener("hs:otpFailed", () => {
  _phoneVerified = false;
  authModalError("OTP ভুল হয়েছে, আবার চেষ্টা করুন।");
  const btn = document.getElementById("authVerifyOtpBtn");
  btn.disabled = false; btn.textContent = "Verify OTP";
});

async function completeSignupDetails() {
  const name = document.getElementById("authDetailsName").value.trim();
  const phone = document.getElementById("authDetailsPhone").value.trim();
  if (!name) { authModalError("নাম দিন।"); return; }
  if (!/^[6-9]\d{9}$/.test(phone)) { authModalError("সঠিক ১০ ডিজিটের মোবাইল নম্বর দিন।"); return; }
  if (!_phoneVerified) { authModalError("আগে মোবাইল নম্বর OTP দিয়ে verify করুন।"); return; }

  const btn = document.getElementById("authDetailsBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    const user = firebase.auth().currentUser;
    if (user.displayName !== name) await user.updateProfile({ displayName: name });

    const existing = JSON.parse(localStorage.getItem("shippingInfo") || "{}");
    localStorage.setItem("shippingInfo", JSON.stringify({
      ...existing,
      name: name,
      phone: phone,
      email: user.email || existing.email || ""
    }));

    finishAuthSuccess();
  } catch (err) {
    authModalError(err.message || "সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    btn.disabled = false; btn.textContent = "Continue";
  }
}
