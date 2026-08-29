// ============================================================
// HEAVY SOUL — CLOUDFLARE WORKER (backend API)
// Routes:
//   POST /api/create-order            → creates a Razorpay order
//   POST /api/phone-forgot-password   → verifies an MSG91 OTP access
//                                        token, then resets the
//                                        Firebase password for the
//                                        matching phone account
//   *                                  → falls through to static assets
// ============================================================

import { getGoogleAccessToken } from "./lib/gauth.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/create-order" && request.method === "POST") {
      return handleCreateOrder(request, env, ctx);
    }

    if (url.pathname === "/api/phone-forgot-password" && request.method === "POST") {
      return handlePhoneForgotPassword(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  }
};

/* ========================================================= CREATE ORDER (Razorpay) ========================================================= */

async function handleCreateOrder(request, env, ctx) {
  try {
    const body = await request.json();
    const amount = Number(body.amount);

    if (!amount || amount <= 0) {
      return jsonResponse({ success: false, error: "Invalid amount" }, 400);
    }

    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      return jsonResponse({ success: false, error: "Razorpay keys not configured on server" }, 500);
    }

    const keyId = await env.RAZORPAY_KEY_ID.get();
    const keySecret = await env.RAZORPAY_KEY_SECRET.get();
    const auth = btoa(`${keyId}:${keySecret}`);

    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${auth}`
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100),
        currency: "INR",
        receipt: body.orderId || undefined,
        notes: { heavySoulOrderId: body.orderId || "" }
      })
    });

    const rzpData = await rzpRes.json();

    if (!rzpRes.ok) {
      return jsonResponse({ success: false, error: rzpData?.error?.description || "Razorpay order creation failed" }, 500);
    }

    if (env.APPS_SCRIPT_URL) {
      ctx.waitUntil(
        fetch(env.APPS_SCRIPT_URL, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(Object.assign({ type: "store_pending_order", apiToken: env.APPS_SCRIPT_API_TOKEN || "" }, body))
        }).catch(() => {})
      );
    }

    return jsonResponse({ success: true, order_id: rzpData.id });

  } catch (err) {
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}

/* ========================================================= PHONE FORGOT-PASSWORD ========================================================= */
// Flow: the browser already ran the MSG91 OTP widget and got an
// "access token" proving the user owns this phone number. We re-verify
// that token server-side with MSG91 (never trust the client alone for
// something as sensitive as a password reset), then use a Firebase
// service-account OAuth2 token (see lib/gauth.js) to call the Identity
// Toolkit REST API directly — no firebase-admin, since that package
// isn't Workers-compatible.

async function handlePhoneForgotPassword(request, env, ctx) {
  try {
    const body = await request.json();
    const accessToken = String(body.accessToken || "").trim();
    const phone = String(body.phone || "").replace(/\D/g, "").slice(-10);
    const newPassword = String(body.newPassword || "");

    if (!accessToken) {
      return jsonResponse({ success: false, error: "Missing OTP access token" }, 400);
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      return jsonResponse({ success: false, error: "Invalid phone number" }, 400);
    }
    if (newPassword.length < 6) {
      return jsonResponse({ success: false, error: "Password must be at least 6 characters" }, 400);
    }

    if (!env.MSG91_AUTHKEY || !env.FIREBASE_SERVICE_ACCOUNT_EMAIL || !env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      return jsonResponse({ success: false, error: "Server is not fully configured" }, 500);
    }

    // ---- 1. Re-verify the OTP access token with MSG91 ----
    const msg91Authkey = await env.MSG91_AUTHKEY.get();
    const verifyRes = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authkey: msg91Authkey, "access-token": accessToken })
    });
    const verifyData = await verifyRes.json().catch(() => null);

    if (!verifyRes.ok || !verifyData || verifyData.type !== "success") {
      return jsonResponse({ success: false, error: "OTP could not be verified — please try again" }, 401);
    }

    // ---- 2. Get a Google OAuth2 access token for the Identity Toolkit API ----
    // FIREBASE_SERVICE_ACCOUNT_EMAIL lives in the Cloudflare Secrets Store (needs .get()).
    // FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY is a classic Worker secret (too long for the
    // Secrets Store's 1024-char limit) — it's already a plain string, no .get() needed.
    const clientEmail = await env.FIREBASE_SERVICE_ACCOUNT_EMAIL.get();
    const privateKeyPem = env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const googleToken = await getGoogleAccessToken(
      clientEmail,
      privateKeyPem,
      "https://www.googleapis.com/auth/identitytoolkit"
    );

    // ---- 3. Find the Firebase user for this phone (synthetic email) ----
    const syntheticEmail = phone + "@phone.heavysoul.in";
    const lookupRes = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${googleToken}`
      },
      body: JSON.stringify({ email: [syntheticEmail] })
    });
    const lookupData = await lookupRes.json();

    if (!lookupRes.ok) {
      return jsonResponse({ success: false, error: lookupData?.error?.message || "Account lookup failed" }, 500);
    }
    const account = lookupData.users && lookupData.users[0];
    if (!account) {
      return jsonResponse({ success: false, error: "No account found for this phone number" }, 404);
    }

    // ---- 4. Set the new password ----
    const updateRes = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:update", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${googleToken}`
      },
      body: JSON.stringify({ localId: account.localId, password: newPassword })
    });
    const updateData = await updateRes.json();

    if (!updateRes.ok) {
      return jsonResponse({ success: false, error: updateData?.error?.message || "Password update failed" }, 500);
    }

    return jsonResponse({ success: true });

  } catch (err) {
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}

/* ========================================================= HELPERS ========================================================= */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
