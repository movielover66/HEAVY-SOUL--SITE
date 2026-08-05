// ============================================================
// HEAVY SOUL — SITE CONFIG
// Fill in the four placeholders below before going live.
// Nothing else in the codebase needs to change.
// ============================================================
const SITE_CONFIG = {
  // Your UPI ID (e.g. yourname@okicici) — shown on the payment page
  // and used to build the "Pay via UPI App" button.
  UPI_ID: "BHARATPE.9R0B0D0O8X316101@unitype",

  // Name shown to the customer's UPI app as the payee.
  UPI_PAYEE_NAME: "HEAVY SOUL",

  // WhatsApp number that receives new orders, in country code + number,
  // no spaces or plus sign (e.g. 91XXXXXXXXXX).
  WHATSAPP_NUMBER: "919339909978",

  // Optional: a deployed Google Apps Script Web App URL (ends in /exec)
  // used to log orders/abandoned carts to a Sheet and power track.html.
  // Leave as-is to skip this — everything else still works.

  // COD terms
  COD_FLAT_ADVANCE: 150,        // flat advance per unit for ready stock items
  CUSTOM_ADVANCE_PERCENT: 0.5,  // 50% advance for made-to-order / custom items
  COD_HANDLING_PER_ITEM: 50,    // handling fee per item, added on top for COD

  PAYMENT_WINDOW_MINUTES: 10,

  // Rough shipping weight per item, in grams. Used only for NimbusPost
  // shipment creation — doesn't need to be exact, just close enough
  // to avoid weight-discrepancy charges from the courier.
  WEIGHT_PER_ITEM_G: 300
};
