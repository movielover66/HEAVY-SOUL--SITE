/**
 *  * HEAVY SOUL — Checkout Backend
  * PART 4 of 5 — WhatsApp click-to-chat links (order confirmation, tracking
   * with a step-by-step guide, delivered/review request, delay/NDR notice,
    * abandoned cart reminder, return request reply), daily/weekly summary
     * emails, and Telegram order alerts.
      *
       * IMPORTANT: Apps Script cannot send WhatsApp messages automatically —
        * there's no free API for that. Every "WhatsApp" feature here builds a
         * https://wa.me/... link with the message pre-filled; a human still taps
          * Send. Links are placed in the Orders/AbandonedCarts/ReturnRequests
           * sheets as clickable cells.
            *
             * SETUP (one-time, optional), Apps Script editor -> Project Settings -> Script Properties:
              *   TELEGRAM_BOT_TOKEN   your Telegram bot token (from @BotFather)
               *   TELEGRAM_CHAT_ID     the chat ID new-order alerts get sent to
                */

/* ========================================================= ABANDONED CART HANDLING ========================================================= */

function handleAbandonedCart_(body) {
  var sheet = getOrCreateSheet_(ABANDONED_SHEET_NAME, ABANDONED_HEADERS);
  sheet.appendRow([new Date(), body.customerName || '', body.phone || '', body.cartSummary || '']);
  var rowIndex = sheet.getLastRow();
  var waFormula = '=HYPERLINK(HEAVYSOUL_ABANDONED_WA_URL(C' + rowIndex + ',B' + rowIndex + ',D' + rowIndex + '),"📱 Send Reminder")';
  sheet.getRange(rowIndex, 5).setFormula(waFormula);
  SpreadsheetApp.flush();
  return jsonResponse_({ success: true });
}

/* ========================================================= RETURN / EXCHANGE REQUESTS ========================================================= */

function handleReturnRequest_(body) {
  var sheet = getOrCreateSheet_(RETURN_REQUESTS_SHEET_NAME, RETURN_REQUESTS_HEADERS);
  sheet.appendRow([new Date(), body.orderId || '', body.customerName || '', body.phone || '', body.reason || '', 'Requested']);
  var rowIndex = sheet.getLastRow();
  var waFormula = '=HYPERLINK(HEAVYSOUL_RETURN_WA_URL(D' + rowIndex + ',C' + rowIndex + ',B' + rowIndex + '),"📱 Reply")';
  sheet.getRange(rowIndex, 7).setFormula(waFormula);
  SpreadsheetApp.flush();

  try {
    if (body.orderId) {
      var ordersSheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
      var orderRow = findOrderRow_(ordersSheet, String(body.orderId).trim());
      if (orderRow > 0) ordersSheet.getRange(orderRow, 19).setValue('Requested');
    }
  } catch (syncErr) {
    logError_('Return request sync to Orders sheet failed: ' + syncErr);
  }

  return jsonResponse_({ success: true });
}

/* ========================================================= WHATSAPP MESSAGE BUILDERS ========================================================= */

function normalizePhoneForWhatsapp_(phone) {
  if (!phone) return '';
  var digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) digits = '91' + digits;
  else if (digits.length === 11 && digits.charAt(0) === '0') digits = '91' + digits.substring(1);
  return digits;
}

// Generic status-update message (used by the Orders sheet WhatsApp column formula).
function HEAVYSOUL_WA_URL(phone, status, customerName, orderId) {
  var normalizedPhone = normalizePhoneForWhatsapp_(phone);
  if (!normalizedPhone) return '';
  var name = customerName || 'there';
  var order = orderId || '';
  var message;

  if (status === STATUS_DELIVERED) {
    message = buildDeliveredReviewMessage_(name, order);
  } else if (status === STATUS_CANCELLED) {
    message = 'Hi ' + name + ', your Heavy Soul order #' + order + ' has been cancelled. Let us know if you have any questions!';
  } else if (status) {
    message = 'Hi ' + name + ', your Heavy Soul order #' + order + ' status update: ' + status + '. Thank you for your patience!';
  } else {
    message = 'Hi ' + name + ', this is Heavy Soul regarding your order #' + order + '.';
  }
  return 'https://wa.me/' + normalizedPhone + '?text=' + encodeURIComponent(message);
}

function buildOrderConfirmationWhatsappLink_(phone, customerName, orderId, amount, isCod) {
  var normalizedPhone = normalizePhoneForWhatsapp_(phone);
  if (!normalizedPhone) return null;
  var name = customerName || 'there';
  var message = 'Hi ' + name + '! ✅ Your Heavy Soul order #' + orderId + ' (₹' + amount + ', ' +
    (isCod ? 'COD' : 'Prepaid') + ') is confirmed. We will let you know the moment it ships. Thank you for shopping with Heavy Soul!';
  return 'https://wa.me/' + normalizedPhone + '?text=' + encodeURIComponent(message);
}

// Step-by-step tracking guide, sent once a shipment has an AWB/tracking link.
function buildTrackingWhatsappLink_(phone, customerName, orderId, trackingLink) {
  var normalizedPhone = normalizePhoneForWhatsapp_(phone);
  if (!normalizedPhone) return null;
  var name = customerName || 'there';
  var message = 'Hi ' + name + '! 📦 Your Heavy Soul order #' + orderId + ' is on its way.\n\n' +
    'Track it here: ' + (trackingLink || '(tracking link coming soon)') + '\n\n' +
    'How to track:\n' +
    '1. Tap the link above\n' +
    '2. See the live courier status and expected delivery date\n' +
    '3. We will message you again once it is out for delivery\n\n' +
    'Thanks for your patience!';
  return 'https://wa.me/' + normalizedPhone + '?text=' + encodeURIComponent(message);
}

function buildDeliveredReviewMessage_(name, orderId) {
  return 'Hi ' + name + '! 🙏 Your Heavy Soul order #' + orderId + ' has been delivered — hope you love it!\n\n' +
    'Would you mind sharing a quick review or a photo? It takes 30 seconds and means a lot to a small brand like ours. ❤️\n\n' +
    'If anything is off with your order, just reply here and we will sort it out right away.';
}

function buildDeliveredReviewWhatsappLink_(phone, customerName, orderId) {
  var normalizedPhone = normalizePhoneForWhatsapp_(phone);
  if (!normalizedPhone) return null;
  return 'https://wa.me/' + normalizedPhone + '?text=' + encodeURIComponent(buildDeliveredReviewMessage_(customerName || 'there', orderId));
}

function buildDelayNdrWhatsappLink_(phone, customerName, orderId, reason) {
  var normalizedPhone = normalizePhoneForWhatsapp_(phone);
  if (!normalizedPhone) return null;
  var name = customerName || 'there';
  var message = 'Hi ' + name + ', there was a delivery attempt on your Heavy Soul order #' + orderId +
    ' that could not be completed' + (reason ? ' (' + reason + ')' : '') + '.\n\n' +
    'No worries — we will attempt delivery again, or you can reply here with a better time/address and we will update it right away.';
  return 'https://wa.me/' + normalizedPhone + '?text=' + encodeURIComponent(message);
}

function HEAVYSOUL_ABANDONED_WA_URL(phone, customerName, cartSummary) {
  var normalizedPhone = normalizePhoneForWhatsapp_(phone);
  if (!normalizedPhone) return '';
  var name = customerName || 'there';
  var message = 'Hi ' + name + '! 👋 Noticed you left some items in your Heavy Soul cart (' +
    (cartSummary || 'your items') + '). Still interested? Let us know if you need any help completing your order!';
  return 'https://wa.me/' + normalizedPhone + '?text=' + encodeURIComponent(message);
}

function HEAVYSOUL_RETURN_WA_URL(phone, customerName, orderId) {
  var normalizedPhone = normalizePhoneForWhatsapp_(phone);
  if (!normalizedPhone) return '';
  var name = customerName || 'there';
  var message = 'Hi ' + name + ', we have received your return/exchange request for order #' +
    (orderId || '') + '. We will get back to you shortly with the next steps.';
  return 'https://wa.me/' + normalizedPhone + '?text=' + encodeURIComponent(message);
}

/* ========================================================= AUTO-QUEUEING WHATSAPP LINKS ONTO THE ORDERS SHEET ========================================================= */
// Called from refreshTrackingForRow_ (PART 2) when a status change is
// detected — overwrites that row's WhatsApp column with a ready-to-send
// link for the specific event, so whoever runs the sheet just has to tap it.

function sendDeliveredReviewWhatsappNotice_(orderId, phone, customerName) {
  var sheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var rowIndex = findOrderRow_(sheet, String(orderId).trim());
  if (rowIndex < 0) return;
  var link = buildDeliveredReviewWhatsappLink_(phone, customerName, orderId);
  if (!link) return;
  sheet.getRange(rowIndex, 28).setFormula('=HYPERLINK("' + link.replace(/"/g, '') + '","📱 Send Review Request")');
}

function sendDelayNdrWhatsappNotice_(orderId, phone, customerName, reason) {
  var sheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var rowIndex = findOrderRow_(sheet, String(orderId).trim());
  if (rowIndex < 0) return;
  var link = buildDelayNdrWhatsappLink_(phone, customerName, orderId, reason);
  if (!link) return;
  sheet.getRange(rowIndex, 28).setFormula('=HYPERLINK("' + link.replace(/"/g, '') + '","📱 Send Delay Notice")');
}

/* ========================================================= BACKFILL HELPERS ========================================================= */

function installWhatsappColumnForExistingOrders_() {
  var sheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('No orders yet — nothing to backfill.');
    return;
  }
  var waColumn = ORDERS_HEADERS.indexOf('WhatsApp') + 1;
  var formulas = [];
  for (var row = 2; row <= lastRow; row++) {
    formulas.push(['=HYPERLINK(HEAVYSOUL_WA_URL(E' + row + ',B' + row + ',D' + row + ',A' + row + '),"📱 Send WhatsApp")']);
  }
  sheet.getRange(2, waColumn, formulas.length, 1).setFormulas(formulas);
  Logger.log('WhatsApp column backfilled for ' + formulas.length + ' existing order(s).');
}

function installWhatsappColumnForAbandonedCarts_() {
  var sheet = getOrCreateSheet_(ABANDONED_SHEET_NAME, ABANDONED_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    Logger.log('No abandoned carts yet — nothing to backfill.');
    return;
  }
  var waColumn = ABANDONED_HEADERS.indexOf('WhatsApp') + 1;
  var formulas = [];
  for (var row = 2; row <= lastRow; row++) {
    formulas.push(['=HYPERLINK(HEAVYSOUL_ABANDONED_WA_URL(C' + row + ',B' + row + ',D' + row + '),"📱 Send Reminder")']);
  }
  sheet.getRange(2, waColumn, formulas.length, 1).setFormulas(formulas);
  Logger.log('AbandonedCarts WhatsApp column backfilled for ' + formulas.length + ' row(s).');
}

/* ========================================================= DAILY EMAIL SUMMARY ========================================================= */

function sendDailySummaryEmail_() {
  if (!SUMMARY_EMAIL_TO) {
    Logger.log('SUMMARY_EMAIL_TO is blank.');
    return;
  }
  var sheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var data = sheet.getRange(2, 1, lastRow - 1, ORDERS_HEADERS.length).getValues();
  var counts = { Confirmed: 0, Packed: 0, Shipped: 0, 'Out for Delivery': 0, Delivered: 0, Cancelled: 0 };
  var overdue = 0, rto = 0, codPending = 0, totalAdvance = 0, totalBalance = 0, fraudCount = 0;
  var followUpsToday = [];
  var today = new Date();
  var todayStr = Utilities.formatDate(today, Session.getScriptTimeZone(), 'yyyy-MM-dd');

  for (var i = 0; i < data.length; i++) {
    var status = data[i][1];
    var edd = data[i][6];
    var codCollected = data[i][8];
    var rtoFlag = data[i][12];
    var advance = Number(data[i][15]) || 0;
    var balance = Number(data[i][16]) || 0;
    var fraudFlag = data[i][21];
    var followUpDate = data[i][25];
    var followUpNote = data[i][26];
    var customerName = data[i][3];

    if (counts.hasOwnProperty(status)) counts[status]++;
    if (edd instanceof Date && edd < today && status !== STATUS_DELIVERED) overdue++;
    if (rtoFlag) rto++;
    if (codCollected === false) codPending++;
    if (fraudFlag) fraudCount++;
    totalAdvance += advance;
    totalBalance += balance;

    if (followUpDate instanceof Date) {
      var fuStr = Utilities.formatDate(followUpDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      if (fuStr === todayStr) {
        followUpsToday.push(customerName + ' (' + data[i][0] + '): ' + (followUpNote || 'No note'));
      }
    }
  }

  var body =
    'Heavy Soul — Daily Order Summary (' + Utilities.formatDate(today, Session.getScriptTimeZone(), 'dd MMM yyyy') + ')\n\n' +
    'Confirmed: ' + counts.Confirmed + '\n' +
    'Packed: ' + counts.Packed + '\n' +
    'Shipped: ' + counts.Shipped + '\n' +
    'Out for Delivery: ' + counts['Out for Delivery'] + '\n' +
    'Delivered: ' + counts.Delivered + '\n' +
    'Cancelled: ' + counts.Cancelled + '\n\n' +
    '⚠️ Overdue (EDD passed, not delivered): ' + overdue + '\n' +
    '⚠️ RTO/Undelivered: ' + rto + '\n' +
    '⚠️ Fraud flags: ' + fraudCount + '\n' +
    '💰 COD not yet collected: ' + codPending + '\n\n' +
    '💵 Total Advance Received: ₹' + totalAdvance + '\n' +
    '💵 Total Balance Due: ₹' + totalBalance + '\n\n' +
    '📅 Follow-ups due today: ' + (followUpsToday.length ? '\n- ' + followUpsToday.join('\n- ') : 'None');

  MailApp.sendEmail(SUMMARY_EMAIL_TO, 'Heavy Soul — Daily Order Summary', body);
  Logger.log('Daily summary email sent to ' + SUMMARY_EMAIL_TO);
}

function installDailyEmailTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendDailySummaryEmail_') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('sendDailySummaryEmail_').timeBased().atHour(9).everyDays(1).create();
  Logger.log('Installed: sendDailySummaryEmail_ will now run automatically every day around 9am.');
}

/* ========================================================= WEEKLY EMAIL SUMMARY ========================================================= */

function sendWeeklySummaryEmail_() {
  if (!SUMMARY_EMAIL_TO) return;
  var sheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  var data = sheet.getRange(2, 1, lastRow - 1, ORDERS_HEADERS.length).getValues();
  var weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  var count = 0, revenue = 0, delivered = 0, cancelled = 0, rtoCount = 0;
  for (var i = 0; i < data.length; i++) {
    var orderDate = data[i][7];
    if (orderDate instanceof Date && orderDate >= weekAgo) {
      count++;
      revenue += Number(data[i][9]) || 0;
      if (data[i][1] === STATUS_DELIVERED) delivered++;
      if (data[i][1] === STATUS_CANCELLED) cancelled++;
      if (data[i][12]) rtoCount++;
    }
  }

  var body =
    'Heavy Soul — Weekly Summary (last 7 days)\n\n' +
    'Total Orders: ' + count + '\n' +
    'Revenue: ₹' + revenue + '\n' +
    'Delivered: ' + delivered + '\n' +
    'Cancelled: ' + cancelled + '\n' +
    'RTO/Undelivered: ' + rtoCount;

  MailApp.sendEmail(SUMMARY_EMAIL_TO, 'Heavy Soul — Weekly Summary', body);
  Logger.log('Weekly summary email sent to ' + SUMMARY_EMAIL_TO);
}

function installWeeklySummaryTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'sendWeeklySummaryEmail_') ScriptApp.deleteTrigger(triggers[i]);
  }
  ScriptApp.newTrigger('sendWeeklySummaryEmail_').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  Logger.log('Installed: sendWeeklySummaryEmail_ will now run every Monday around 9am.');
}

/* ========================================================= TELEGRAM ORDER ALERT ========================================================= */

function sendTelegramAlert_(orderId, customerName, phone, amount, paymentType, fullAddress) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TELEGRAM_BOT_TOKEN');
  var chatId = props.getProperty('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return; // Telegram alerts are optional — skip quietly if not configured.

  var msg = '🛍️ NEW ORDER — HEAVY SOUL\n\n' +
    'Order ID: ' + orderId + '\n' +
    'Name: ' + customerName + '\n' +
    'Phone: ' + phone + '\n' +
    'Amount: ₹' + amount + '\n' +
    'Payment: ' + paymentType + '\n' +
    'Address: ' + fullAddress;

  var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
  UrlFetchApp.fetch(url, {
    method: 'post',
    payload: { chat_id: chatId, text: msg },
    muteHttpExceptions: true
  });
}
