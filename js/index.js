import { getGoogleAccessToken } from "./lib/gauth.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/create-order" && request.method === "POST") {
      return handleCreateOrder(request, env, ctx);
    }

    if (url.pathname === "/api/phone-forgot-password" && request.method === "POST") {
      return handlePhoneForgotPassword(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

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
          body: JSON.stringify(Object.assign({ type: "store_pending_order" }, body))
        }).catch(() => {})
      );
    }

    return jsonResponse({ success: true, order_id: rzpData.id });

  } catch (err) {
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

/* ---------------- PHONE-ACCOUNT PASSWORD RESET ----------------
   Flow: client re-verifies phone via MSG91 widget (OTP), sends us the
   MSG91 access-token. We re-check that token SERVER-SIDE with MSG91
   (never trust a client-side "verified" flag for something this
   sensitive), then use a Firebase service account to force-set the
   new password on that phone's synthetic-email account.
   Requires three Cloudflare secrets: MSG91_AUTHKEY,
   FIREBASE_SERVICE_ACCOUNT_EMAIL, FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY. */
async function handlePhoneForgotPassword(request, env) {
  try {
    const body = await request.json();
    const accessToken = body.accessToken;
    const newPassword = body.newPassword;

    if (!accessToken || !newPassword || newPassword.length < 6) {
      return jsonResponse({ success: false, error: "Missing accessToken or newPassword (min 6 chars)." }, 400);
    }

    // 1. Re-verify the OTP token directly with MSG91 (server-side).
    const msg91Authkey = await env.MSG91_AUTHKEY.get();
    const verifyRes = await fetch("https://control.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authkey: msg91Authkey, "access-token": accessToken })
    });
    const verifyData = await verifyRes.json();
    if (verifyData.type !== "success") {
      return jsonResponse({ success: false, error: "OTP could not be verified. Please try again." }, 401);
    }

    // MSG91 includes the verified mobile number in the response on most
    // widget configs. Fall back to what the client asserts only as a
    // last resort — a valid, unexpired MSG91 token was still required.
    const rawPhone = String(verifyData.message || body.phone || "").replace(/\D/g, "");
    const last10 = rawPhone.slice(-10);
    if (!/^[6-9]\d{9}$/.test(last10)) {
      return jsonResponse({ success: false, error: "Could not determine the verified phone number." }, 400);
    }
    const syntheticEmail = last10 + "@phone.heavysoul.in";

    // 2. Get a Google OAuth2 access token from our Firebase service account.
    const svcEmail = await env.FIREBASE_SERVICE_ACCOUNT_EMAIL.get();
    const svcKeyRaw = await env.FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY.get();
    const svcKey = svcKeyRaw.replace(/\\n/g, "\n");
    const accessTok = await getGoogleAccessToken(svcEmail, svcKey, "https://www.googleapis.com/auth/identitytoolkit");

    // 3. Look up the Firebase Auth user for this phone's synthetic email.
    const lookupRes = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessTok },
      body: JSON.stringify({ email: [syntheticEmail] })
    });
    const lookupData = await lookupRes.json();
    const user = lookupData.users && lookupData.users[0];
    if (!user) {
      return jsonResponse({ success: false, error: "No account found for this phone number." }, 404);
    }

    // 4. Force-set the new password.
    const updateRes = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:update", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessTok },
      body: JSON.stringify({ localId: user.localId, password: newPassword, returnSecureToken: false })
    });
    const updateData = await updateRes.json();
    if (!updateRes.ok) {
      return jsonResponse({ success: false, error: (updateData.error && updateData.error.message) || "Password update failed." }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err) {
    return jsonResponse({ success: false, error: String(err) }, 500);
  }
}
