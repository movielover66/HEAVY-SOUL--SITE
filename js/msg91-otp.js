// MSG91 OTP verification helper — Heavy Soul
// Loads the widget script once, then exposes hsSendOtp / hsVerifyOtp / hsRetryOtp
// so any form on the site (signup, login, checkout) can trigger phone
// verification on a button click instead of auto-firing on page load.

const HS_OTP_CONFIG = {
  widgetId: "36686f6a6c4a353434333739",
  tokenAuth: "557778T3SArOkpa1fj6a803ce9P1",
  exposeMethods: true, // gives us hsSendOtp/hsVerifyOtp/hsRetryOtp instead of the default popup
  success: (data) => {
    // data.message is the verified access token — send this to your
    // backend (Apps Script) for final server-side verification before
    // trusting the phone number.
    window.dispatchEvent(new CustomEvent("hs:otpVerified", { detail: data }));
  },
  failure: (error) => {
    window.dispatchEvent(new CustomEvent("hs:otpFailed", { detail: error }));
  }
};

let hsOtpScriptLoaded = false;
let hsOtpScriptLoading = null;

// MSG91's widget sets window.sendOtp/verifyOtp/retryOtp up asynchronously
// AFTER initSendOTP() runs (it does its own internal setup/network calls) —
// calling resolve() immediately after initSendOTP() was the bug: the first
// "Send OTP" tap could fire before those methods existed yet, while a
// resend (moments later) worked because the async setup had finished by
// then. This polls for window.sendOtp to actually exist before resolving.
function hsWaitForOtpMethods(timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function check() {
      if (typeof window.sendOtp === "function") {
        resolve();
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("OTP widget did not become ready in time"));
        return;
      }
      setTimeout(check, 100);
    })();
  });
}

function hsLoadOtpScript() {
  if (hsOtpScriptLoaded) return Promise.resolve();
  if (hsOtpScriptLoading) return hsOtpScriptLoading;

  hsOtpScriptLoading = new Promise((resolve, reject) => {
    const urls = [
      "https://verify.msg91.com/otp-provider.js",
      "https://verify.phone91.com/otp-provider.js"
    ];
    let i = 0;
    function attempt() {
      const s = document.createElement("script");
      s.src = urls[i];
      s.async = true;
      s.onload = () => {
        if (typeof window.initSendOTP === "function") {
          window.initSendOTP(HS_OTP_CONFIG);
          hsWaitForOtpMethods(15000)
            .then(() => {
              hsOtpScriptLoaded = true;
              resolve();
            })
            .catch(reject);
        } else {
          reject(new Error("initSendOTP not available after script load"));
        }
      };
      s.onerror = () => {
        i++;
        if (i < urls.length) attempt();
        else reject(new Error("Could not load MSG91 OTP script"));
      };
      document.head.appendChild(s);
    }
    attempt();
  });

  return hsOtpScriptLoading;
}

// Call this when the user taps "Send OTP" after typing their phone number.
// identifier should be in the format the widget expects, e.g. "91XXXXXXXXXX".
async function hsSendOtp(identifier) {
  await hsLoadOtpScript();
  if (typeof window.sendOtp !== "function") {
    // Belt-and-suspenders: shouldn't happen now that hsLoadOtpScript waits
    // for window.sendOtp, but give it one more short chance before failing.
    try {
      await hsWaitForOtpMethods(3000);
    } catch (e) {
      console.error("MSG91 widget loaded but window.sendOtp is not available — check widgetId/tokenAuth/exposeMethods in HS_OTP_CONFIG.");
      throw new Error("OTP widget not ready (sendOtp unavailable)");
    }
  }
  return new Promise((resolve, reject) => {
    window.sendOtp(
      identifier,
      () => { console.log("OTP sent to", identifier); resolve(); },
      (err) => { console.warn("Failed to send OTP", err); reject(err); }
    );
  });
}

// Call this when the user submits the 4/6-digit code they received.
async function hsVerifyOtp(otp) {
  await hsLoadOtpScript();
  if (typeof window.verifyOtp !== "function") {
    console.error("MSG91 widget loaded but window.verifyOtp is not available.");
    throw new Error("OTP widget not ready (verifyOtp unavailable)");
  }
  window.verifyOtp(otp);
  // result comes back via the success/failure callbacks in
  // HS_OTP_CONFIG, which dispatch hs:otpVerified / hs:otpFailed —
  // listen for those events wherever you call this from.
}

// Call this if the user taps "Resend OTP".
async function hsRetryOtp(channel) {
  await hsLoadOtpScript();
  if (typeof window.retryOtp === "function") {
    window.retryOtp(channel); // e.g. "text" or "voice", optional
  }
}
