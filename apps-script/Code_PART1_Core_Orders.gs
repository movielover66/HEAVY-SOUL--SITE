/**
 *  * HEAVY SOUL — Checkout Backend
  * PART 1 of 5 — Core constants, request router (doPost/doGet), order
   * handling, fraud/repeat/VIP detection, admin password check, sheet
    * helpers, and MSG91 mobile OTP (send + verify).
     *
      * Paste this as its own file in Apps Script, e.g. "PART1_Core_Orders.gs".
       * All 5 parts share one Apps Script project, so functions/vars here are
        * visible to the other 4 files automatically — no imports needed.
         */

/* ========================================================= CONSTANTS ========================================================= */

var ORDERS_SHEET_NAME = 'Orders';
var ORDERS_HEADERS = ['Order ID', 'Status', 'AWB', 'Customer Name', 'Phone', 'Address', 'EDD', 'Order Date',
  'COD Collected', 'Amount', 'Payment Type', 'Items', 'RTO/Undelivered', 'Repeat Customer', 'High Value',
  'Advance Received', 'Balance Due', 'NDR Reason', 'Return/Refund Status', 'City', 'State', 'Fraud Flag',
  'VIP Tier', 'Sizes Ordered', 'Label URL', 'Follow-up Date', 'Follow-up Note', 'WhatsApp', 'Invoice URL'];

var INVENTORY_SHEET_NAME = 'Inventory';
var INVENTORY_HEADERS = ['SKU', 'Product Name', 'Size', 'Stock Qty', 'Low Stock Threshold', 'Status'];

var ABANDONED_SHEET_NAME = 'AbandonedCarts';
var ABANDONED_HEADERS = ['Date', 'Customer', 'Phone', 'Cart Summary', 'WhatsApp'];

var RETURN_REQUESTS_SHEET_NAME = 'ReturnRequests';
var RETURN_REQUESTS_HEADERS = ['Date', 'Order ID', 'Customer Name', 'Phone', 'Reason', 'Status', 'WhatsApp'];

var PENDING_ORDERS_SHEET_NAME = 'PendingOrders';
var PENDING_ORDERS_HEADERS = ['Order ID', 'Razorpay Order ID', 'Created At', 'Payload JSON'];

var HIGH_VALUE_THRESHOLD = 1500;
var VIP_ORDER_THRESHOLD = 3; // orders (including current) to be tagged VIP
var FRAUD_CANCEL_THRESHOLD = 2; // past cancellations from same phone to flag as repeat-cancel risk
var SUMMARY_EMAIL_TO = 'heavysoulclothing@gmail.com';

var STATUS_CONFIRMED = 'Confirmed';
var STATUS_PACKED = 'Packed';
var STATUS_SHIPPED = 'Shipped';
var STATUS_OUT_FOR_DELIVERY = 'Out for Delivery';
var STATUS_DELIVERED = 'Delivered';
var STATUS_CANCELLED = 'Cancelled';

/* ========================================================= ENTRY POINTS ========================================================= */

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (lockErr) {
    return jsonResponse_({ success: false, error: 'Server busy, please retry.' });
  }
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse_({ success: false, error: 'Empty request body.' });
    }

    // ---- RAZORPAY WEBHOOK ----
    // Apps Script can't read the X-Razorpay-Signature header, so the
    // webhook URL carries a secret query param instead. In Razorpay
    // Dashboard, set the webhook URL to:
    //   <APPS_SCRIPT_URL>?webhookSecret=<RAZORPAY_WEBHOOK_SECRET value>
    var expectedWebhookSecret = PropertiesService.getScriptProperties().getProperty('RAZORPAY_WEBHOOK_SECRET');
    if (expectedWebhookSecret && e.parameter && e.parameter.webhookSecret === expectedWebhookSecret) {
      return handleRazorpayWebhook_(e.postData.contents); // PART 3
    }

    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      logError_('doPost JSON parse failed: ' + parseErr + ' | raw: ' + e.postData.contents);
      return jsonResponse_({ success: false, error: 'Invalid JSON body.' });
    }

    // ---- RAZORPAY ORDER CREATION (site calls this when payment starts) ----
    if (body.type === 'create_rzp_order') {
      storePendingOrder_(body); // PART 3
      return jsonResponse_(createRazorpayOrder_(body.amount, body.orderId)); // PART 3
    }
    if (body.type === 'store_pending_order') {
      storePendingOrder_(body); // PART 3
      return jsonResponse_({ success: true });
    }

    // ---- MOBILE OTP (MSG91) — login/signup verification ----
    if (body.type === 'verify_phone_otp') {
      return jsonResponse_(verifyMsg91Otp_(body));
    }

    // ---- PRODUCT ADMIN PANEL ----
    // All admin_* actions are password-gated by verifyAdminPassword_.
    // See Code_PART6_Products.gs for the product/image handlers.
    if (body.type === 'admin_verify') {
      return jsonResponse_({ success: verifyAdminPassword_(body) });
    }
    if (body.type === 'admin_list_products') {
      if (!verifyAdminPassword_(body)) return jsonResponse_({ success: false, error: 'Wrong password.' });
      return jsonResponse_({ success: true, products: readAllProducts_(true) });
    }
    if (body.type === 'admin_save_product') {
      if (!verifyAdminPassword_(body)) return jsonResponse_({ success: false, error: 'Wrong password.' });
      return jsonResponse_(saveProduct_(body.product));
    }
    if (body.type === 'admin_delete_product') {
      if (!verifyAdminPassword_(body)) return jsonResponse_({ success: false, error: 'Wrong password.' });
      return jsonResponse_(deleteProduct_(body.id));
    }
    if (body.type === 'admin_upload_image') {
      if (!verifyAdminPassword_(body)) return jsonResponse_({ success: false, error: 'Wrong password.' });
      return jsonResponse_(uploadProductImage_(body));
    }

    var authError = verifyApiToken_(body);
    if (authError) {
      logError_('doPost rejected: ' + authError);
      return jsonResponse_({ success: false, error: 'Unauthorized.' });
    }
    if (body.type === 'abandoned_cart') {
      return handleAbandonedCart_(body); // PART 4
    }
    if (body.type === 'return_request') {
      return handleReturnRequest_(body); // PART 4
    }
    return handleOrder_(body);
  } catch (fatalErr) {
    logError_('doPost fatal error: ' + fatalErr + (fatalErr.stack ? ' | ' + fatalErr.stack : ''));
    return jsonResponse_({ success: false, error: 'Internal server error.' });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};

    // ---- PUBLIC PRODUCT CATALOG ----
    if (params.type === 'products') {
      return jsonResponse_({ success: true, products: readAllProducts_(false) });
    }

    var orderId = params.orderId;
    if (!orderId) {
      return jsonResponse_({ found: false, error: 'orderId query parameter required.' });
    }
    return jsonResponse_(lookupOrderStatus_(String(orderId).trim())); // PART 2
  } catch (fatalErr) {
    logError_('doGet fatal error: ' + fatalErr + (fatalErr.stack ? ' | ' + fatalErr.stack : ''));
    return jsonResponse_({ found: false, error: 'Internal server error.' });
  }
}

/* ========================================================= API TOKEN CHECK ========================================================= */

function verifyApiToken_(body) {
  var expected = PropertiesService.getScriptProperties().getProperty('API_SHARED_SECRET');
  if (!expected) return null;
  if (!body || body.apiToken !== expected) return 'Missing or invalid apiToken.';
  return null;
}

/* ========================================================= MSG91 MOBILE OTP ========================================================= */

// SETUP (one-time), Apps Script editor -> Project Settings -> Script Properties:
//   MSG91_WIDGET_ID   the widget ID shown on your MSG91 OTP Widget page
//   MSG91_AUTH_KEY    the server-side Auth Key (Owner/Admin rule)
//
// FRONTEND FLOW: the MSG91 widget script runs entirely in the browser —
// it shows its own phone-number + OTP entry UI and, on success, hands you
// a short-lived access-token in its `success` callback. The frontend then
// POSTs that token here as { type: "otp_verify", accessToken: "..." } so
// the server can confirm it's real before treating the person as logged in.
//
// body = { type: 'otp_verify', accessToken: '<token from widget success callback>' }
function verifyMsg91Otp_(body) {
  var authKey = PropertiesService.getScriptProperties().getProperty('MSG91_AUTH_KEY');
  if (!authKey) return { success: false, error: 'MSG91_AUTH_KEY is not set in Script Properties.' };
  if (!body || !body.accessToken) return { success: false, error: 'accessToken is required.' };

  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ authkey: authKey, 'access-token': body.accessToken }),
    muteHttpExceptions: true
  };

  try {
    var response = UrlFetchApp.fetch('https://control.msg91.com/api/v5/widget/verifyAccessToken', options);
    var parsed = JSON.parse(response.getContentText());
    // MSG91 returns {type: "success", message: "<verified phone/email>"} on success,
    // or {type: "error", message: "..."} on failure.
    if (parsed.type === 'success') {
      return { success: true, identifier: parsed.message };
    }
    return { success: false, error: parsed.message || 'OTP verification failed.' };
  } catch (err) {
    logError_('verifyMsg91Otp_ failed: ' + err);
    return { success: false, error: 'OTP verification request failed.' };
  }
}

/* ========================================================= ORDER HANDLING ========================================================= */

function handleOrder_(body) {
  var validationError = validateOrderPayload_(body);
  if (validationError) {
    logError_('Order validation failed: ' + validationError + ' | payload: ' + JSON.stringify(body));
    return jsonResponse_({ success: false, error: validationError });
  }

  var sheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var orderId = String(body.orderId).trim();

  var existingRow = findOrderRow_(sheet, orderId);
  if (existingRow > 0) {
    logError_('Duplicate order received, skipping re-creation: ' + orderId);
    return jsonResponse_({ success: true, order_id: orderId, note: 'Order already exists, skipped duplicate.' });
  }

  var fullAddress = body.fullAddress || buildAddressString_(body);
  var isCodOrder = String(body.paymentType).toLowerCase() === 'cod';

  var orderAmountValue = (typeof body.grandTotal === 'number') ? body.grandTotal :
    (typeof body.amount === 'number') ? body.amount :
      (typeof body.codAmount === 'number') ? body.codAmount : 0;

  var itemsSummary = buildItemsSummary_(body);
  var isRepeatCustomer = isRepeatCustomer_(sheet, body.phone);
  var isHighValue = orderAmountValue >= HIGH_VALUE_THRESHOLD;
  var fraudFlag = detectFraudFlags_(sheet, body, fullAddress);
  var vipTier = computeVipTier_(sheet, body.phone);
  var sizesOrdered = buildSizesOrdered_(body);

  var newRowIndex = sheet.getLastRow() + 1;
  var balanceDueFormula = '=J' + newRowIndex + '-P' + newRowIndex;
  var whatsappFormula = '=HYPERLINK(HEAVYSOUL_WA_URL(E' + newRowIndex + ',B' + newRowIndex + ',D' + newRowIndex + ',A' + newRowIndex + '),"📱 Send WhatsApp")';

  sheet.getRange(newRowIndex, 1, 1, ORDERS_HEADERS.length).setValues([[
    orderId, STATUS_CONFIRMED, '', body.customerName, body.phone, fullAddress, '', new Date(),
    isCodOrder ? false : 'N/A', orderAmountValue, isCodOrder ? 'COD' : 'Prepaid', itemsSummary, '',
    isRepeatCustomer ? 'Yes' : '', isHighValue ? 'Yes' : '', body.amount || 0, balanceDueFormula, '', '',
    body.city || '', body.state || '', fraudFlag, vipTier, sizesOrdered, '', '', '', whatsappFormula, ''
  ]]);
  SpreadsheetApp.flush();

  try {
    sendTelegramAlert_(orderId, body.customerName, body.phone, orderAmountValue, isCodOrder ? 'COD' : 'Prepaid', fullAddress); // PART 4
  } catch (tgErr) {
    logError_('Telegram alert failed for order ' + orderId + ': ' + tgErr);
  }

  try {
    decrementInventory_(body.items); // PART 3
  } catch (invErr) {
    logError_('Inventory decrement failed for order ' + orderId + ': ' + invErr);
  }

  var awb = null;
  var bookingError = null;
  try {
    var shipmentResult = createIthinkShipment_(body); // PART 2
    awb = extractAwb_(shipmentResult); // PART 2
    if (awb) {
      sheet.getRange(newRowIndex, 3).setValue(awb);
      var labelUrl = extractLabelUrl_(shipmentResult); // PART 2
      if (labelUrl) {
        sheet.getRange(newRowIndex, 25).setFormula('=HYPERLINK("' + labelUrl.replace(/"/g, '') + '","🖨️ Print Label")');
      }
      SpreadsheetApp.flush();
    } else {
      bookingError = 'iThink Logistics booking returned no AWB: ' + JSON.stringify(shipmentResult);
      logError_('Order ' + orderId + ' booked but no AWB found in response: ' + JSON.stringify(shipmentResult));
    }
  } catch (bookingErr) {
    bookingError = String(bookingErr);
    logError_('iThink Logistics auto-booking failed for order ' + orderId + ': ' + bookingErr + (bookingErr.stack ? ' | ' + bookingErr.stack : ''));
  }

  // ---- INVOICE PDF (Drive) + CUSTOMER EMAIL ----
  var invoiceUrl = null;
  var invoicePdfBlob = null;
  try {
    var invoiceResult = generateInvoicePdf_(body, orderId, orderAmountValue, isCodOrder); // PART 5
    invoiceUrl = invoiceResult.url;
    invoicePdfBlob = invoiceResult.blob;
    if (invoiceUrl) sheet.getRange(newRowIndex, 29).setFormula('=HYPERLINK("' + invoiceUrl.replace(/"/g, '') + '","📄 Invoice")');
  } catch (invoiceErr) {
    logError_('Invoice generation failed for order ' + orderId + ': ' + invoiceErr + (invoiceErr.stack ? ' | ' + invoiceErr.stack : ''));
  }

  var invoiceEmailSent = false;
  if (invoicePdfBlob && body.email) {
    try {
      sendInvoiceEmailToCustomer_(body, orderId, orderAmountValue, isCodOrder, invoicePdfBlob); // PART 5
      invoiceEmailSent = true;
    } catch (emailErr) {
      logError_('Invoice email failed for order ' + orderId + ': ' + emailErr + (emailErr.stack ? ' | ' + emailErr.stack : ''));
    }
  } else if (!body.email) {
    logError_('No customer email on order ' + orderId + ' — invoice email skipped.');
  }

  var confirmationWhatsappLink = buildOrderConfirmationWhatsappLink_(body.phone, body.customerName, orderId, orderAmountValue, isCodOrder); // PART 4

  return jsonResponse_({
    success: true, order_id: orderId, status: STATUS_CONFIRMED, awb: awb, booking_error: bookingError,
    invoice_url: invoiceUrl, invoice_email_sent: invoiceEmailSent, confirmation_whatsapp_link: confirmationWhatsappLink
  });
}

function validateOrderPayload_(body) {
  if (!body || typeof body !== 'object') return 'Request body must be a JSON object.';
  var requiredFields = ['orderId', 'customerName', 'phone', 'address', 'state', 'pincode', 'paymentType'];
  for (var i = 0; i < requiredFields.length; i++) {
    if (!body[requiredFields[i]] && body[requiredFields[i]] !== 0) return requiredFields[i] + ' is required.';
  }
  var hasAmount = (typeof body.amount === 'number' && body.amount >= 0) ||
    (typeof body.codAmount === 'number' && body.codAmount >= 0);
  if (!hasAmount) return 'amount (or codAmount) is required and must be a number.';
  return null;
}

function buildItemsSummary_(body) {
  if (body.items && Array.isArray(body.items) && body.items.length > 0) {
    return body.items.map(function (item) {
      var sizeLabel = item.size && item.size !== '-' ? ' (' + item.size + ')' : '';
      return item.name + sizeLabel + ' x' + (item.qty || 1);
    }).join(', ');
  }
  return 'N/A';
}

function isRepeatCustomer_(sheet, phone) {
  if (!phone) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var phones = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
  var normalizedPhone = String(phone).trim();
  for (var i = 0; i < phones.length; i++) {
    if (String(phones[i][0]).trim() === normalizedPhone) return true;
  }
  return false;
}

function detectFraudFlags_(sheet, body, fullAddress) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '';

  var data = sheet.getRange(2, 1, lastRow - 1, ORDERS_HEADERS.length).getValues();
  var normalizedAddress = String(fullAddress || '').trim().toLowerCase();
  var normalizedName = String(body.customerName || '').trim().toLowerCase();
  var normalizedPhone = String(body.phone || '').trim();
  var flags = [];
  var rtoCountForPhone = 0;
  var cancelCountForPhone = 0;
  var sameAddressDiffName = false;

  for (var i = 0; i < data.length; i++) {
    var rowAddress = String(data[i][5] || '').trim().toLowerCase();
    var rowName = String(data[i][3] || '').trim().toLowerCase();
    var rowPhone = String(data[i][4] || '').trim();
    var rowRto = data[i][12];
    var rowStatus = data[i][1];

    if (normalizedAddress && rowAddress === normalizedAddress && rowName !== normalizedName) {
      sameAddressDiffName = true;
    }
    if (rowPhone === normalizedPhone && rowRto) rtoCountForPhone++;
    if (rowPhone === normalizedPhone && rowStatus === STATUS_CANCELLED) cancelCountForPhone++;
  }

  if (sameAddressDiffName) flags.push('⚠️ Same address, different name');
  if (rtoCountForPhone >= 2) flags.push('⚠️ Repeat RTO risk (' + rtoCountForPhone + ' past)');
  if (cancelCountForPhone >= FRAUD_CANCEL_THRESHOLD) flags.push('⚠️ Repeat cancellations (' + cancelCountForPhone + ' past)');

  return flags.join('; ');
}

function computeVipTier_(sheet, phone) {
  if (!phone) return '';
  var lastRow = sheet.getLastRow();
  var count = 1; // this order
  if (lastRow >= 2) {
    var phones = sheet.getRange(2, 5, lastRow - 1, 1).getValues();
    var normalizedPhone = String(phone).trim();
    for (var i = 0; i < phones.length; i++) {
      if (String(phones[i][0]).trim() === normalizedPhone) count++;
    }
  }
  return count >= VIP_ORDER_THRESHOLD ? 'VIP 👑' : '';
}

function buildSizesOrdered_(body) {
  if (!body.items || !Array.isArray(body.items)) return '';
  var sizes = [];
  body.items.forEach(function (item) {
    var s = String(item.size || '').trim().toUpperCase();
    if (s && s !== '-' && sizes.indexOf(s) === -1) sizes.push(s);
  });
  if (sizes.length === 0) return '';
  return ',' + sizes.join(',') + ',';
}

function buildAddressString_(body) {
  var parts = [body.address, body.city, body.state, body.pincode];
  var filtered = [];
  for (var i = 0; i < parts.length; i++) if (parts[i]) filtered.push(parts[i]);
  return filtered.join(', ');
}

function findOrderRow_(sheet, orderId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]).trim() === orderId) return i + 2;
  }
  return -1;
}

/* ========================================================= SHEET HELPERS ========================================================= */

function getOrCreateSheet_(name, headers) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* ========================================================= RESPONSE / LOGGING HELPERS ========================================================= */

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function logError_(message) {
  Logger.log(message);
  console.error(message);
}