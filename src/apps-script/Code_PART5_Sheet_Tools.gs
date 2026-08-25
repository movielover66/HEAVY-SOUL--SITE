/**
 *  * HEAVY SOUL — Checkout Backend
  * PART 5 of 5 — Sheet UI/UX (color-coded status, frozen columns, filters,
   * the "🐺 Heavy Soul" custom menu), invoice PDF generation + customer
    * email, the Dashboard tab, order archiving, and the Color Legend tab.
     *
      * Admin password check + product/image management live in their own file
       * (Code_PART6_Products.gs, already built separately) — not duplicated here.
        */

/* ========================================================= CUSTOM MENU ========================================================= */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🐺 Heavy Soul')
    .addItem('🔄 Refresh all tracking now', 'refreshAllTracking_')
    .addItem('🎨 Apply color coding', 'applyColorCoding_')
    .addSeparator()
    .addItem('📊 Rebuild Dashboard tab', 'createDashboardTab_')
    .addItem('💰 Update COD Pending tab', 'updateCodReconciliationTab_')
    .addItem('📦 Create Inventory tab (first time only)', 'createInventoryTab_')
    .addItem('🗂️ Archive delivered orders (30+ days old)', 'archiveDeliveredOrders_')
    .addItem('🎨 Rebuild Color Legend tab', 'createColorLegendTab_')
    .addSeparator()
    .addItem('📱 Backfill WhatsApp links (Orders)', 'installWhatsappColumnForExistingOrders_')
    .addItem('📱 Backfill WhatsApp links (Abandoned Carts)', 'installWhatsappColumnForAbandonedCarts_')
    .addSeparator()
    .addItem('⚙️ One-time setup: install all triggers', 'installAllTriggers_')
    .addToUi();
}

// Convenience: installs the 30-min tracking refresh, daily summary email,
// and weekly summary email triggers in one go, and locks the Status
// column to a dropdown. Run once after first deploying.
function installAllTriggers_() {
  installTrackingRefreshTrigger_(); // PART 2
  installDailyEmailTrigger_(); // PART 4
  installWeeklySummaryTrigger_(); // PART 4
  installStatusDropdown_();
  SpreadsheetApp.getUi().alert('Done — tracking refresh, daily/weekly emails, and the status dropdown are all set up.');
}

/* ========================================================= COLOR CODING ========================================================= */

function applyColorCoding_() {
  var sheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var maxRows = Math.max(sheet.getMaxRows(), 2000);
  var range = sheet.getRange('A2:AC' + maxRows);

  var rules = [];

  // Status-based row colors (column B).
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B2="' + STATUS_CONFIRMED + '"').setBackground('#FFF6D6').setRanges([range]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B2="' + STATUS_PACKED + '"').setBackground('#DCEBFC').setRanges([range]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B2="' + STATUS_SHIPPED + '"').setBackground('#FDE6CC').setRanges([range]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B2="' + STATUS_OUT_FOR_DELIVERY + '"').setBackground('#EAD9FA').setRanges([range]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B2="' + STATUS_DELIVERED + '"').setBackground('#D9F2DC').setRanges([range]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$B2="' + STATUS_CANCELLED + '"').setBackground('#EDEDED').setFontColor('#999999').setRanges([range]).build());

  // Overdue: EDD passed and not yet Delivered -> red (highest priority, listed last so it wins ties).
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($G2<>"",$G2<TODAY(),$B2<>"' + STATUS_DELIVERED + '")')
    .setBackground('#FADBD8').setRanges([range]).build());

  // Stuck: 4+ days since order date with no delivery yet -> orange.
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($H2<>"",TODAY()-$H2>=4,$B2<>"' + STATUS_DELIVERED + '",$B2<>"' + STATUS_CANCELLED + '")')
    .setBackground('#FCE4CE').setRanges([range]).build());

  sheet.setConditionalFormatRules(rules);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(2);

  var filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.getRange(1, 1, sheet.getLastRow() || 1, ORDERS_HEADERS.length).createFilter();

  Logger.log('Color coding, frozen rows/columns, and filters applied to Orders sheet.');
}

/* ========================================================= STATUS DROPDOWN LOCK ========================================================= */

function installStatusDropdown_() {
  var sheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList([STATUS_CONFIRMED, STATUS_PACKED, STATUS_SHIPPED, STATUS_OUT_FOR_DELIVERY, STATUS_DELIVERED, STATUS_CANCELLED], true)
    .setAllowInvalid(false).build();
  sheet.getRange('B2:B2000').setDataValidation(rule);

  var returnRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['', 'Requested', 'Approved', 'Refunded', 'Rejected'], true)
    .setAllowInvalid(false).build();
  sheet.getRange('S2:S2000').setDataValidation(returnRule);

  Logger.log('Status column (B) and Return/Refund Status column (S) locked to dropdowns.');
}

/* ========================================================= DASHBOARD TAB ========================================================= */

function createDashboardTab_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName('Dashboard');
  if (existing) ss.deleteSheet(existing);
  var dash = ss.insertSheet('Dashboard', 0);

  dash.getRange('A1').setValue('HEAVY SOUL — ORDER SUMMARY').setFontWeight('bold').setFontSize(14);
  dash.getRange('A3').setValue('Status').setFontWeight('bold');
  dash.getRange('B3').setValue('Count').setFontWeight('bold');

  var rows = [
    ['Confirmed', '=COUNTIF(Orders!B2:B, "Confirmed")'],
    ['Packed', '=COUNTIF(Orders!B2:B, "Packed")'],
    ['Shipped', '=COUNTIF(Orders!B2:B, "Shipped")'],
    ['Out for Delivery', '=COUNTIF(Orders!B2:B, "Out for Delivery")'],
    ['Delivered', '=COUNTIF(Orders!B2:B, "Delivered")'],
    ['Cancelled', '=COUNTIF(Orders!B2:B, "Cancelled")'],
    ['— Cancellation Rate', '=IFERROR(COUNTIF(Orders!B2:B,"Cancelled")/COUNTA(Orders!A2:A),0)'],
    ['— Overdue (EDD passed, not delivered)', '=COUNTIFS(Orders!G2:G, "<>", Orders!G2:G, "<"&TODAY(), Orders!B2:B, "<>Delivered")'],
    ['— RTO / Undelivered', '=COUNTIF(Orders!M2:M, "⚠️ RTO/Undelivered")'],
    ['— COD not yet collected', '=COUNTIF(Orders!I2:I, FALSE)'],
    ['— Repeat customers', '=COUNTIF(Orders!N2:N, "Yes")'],
    ['— High value orders', '=COUNTIF(Orders!O2:O, "Yes")'],
    ['— VIP customers (orders)', '=COUNTIF(Orders!W2:W, "VIP 👑")'],
    ['— Fraud flags raised', '=COUNTIF(Orders!V2:V, "<>")'],
    ['Total Orders', '=COUNTA(Orders!A2:A)'],
    ['', ''],
    ['Total Revenue (₹)', '=SUM(Orders!J2:J)'],
    ['— COD Revenue (₹)', '=SUMIF(Orders!K2:K, "COD", Orders!J2:J)'],
    ['— Prepaid Revenue (₹)', '=SUMIF(Orders!K2:K, "Prepaid", Orders!J2:J)'],
    ['— Total Advance Received (₹)', '=SUM(Orders!P2:P)'],
    ['— Total Balance Due (₹)', '=SUM(Orders!Q2:Q)'],
    ['', ''],
    ['This Week Orders', '=COUNTIFS(Orders!H2:H,">="&(TODAY()-WEEKDAY(TODAY(),2)+1))'],
    ['Last Week Orders', '=COUNTIFS(Orders!H2:H,">="&(TODAY()-WEEKDAY(TODAY(),2)+1-7),Orders!H2:H,"<"&(TODAY()-WEEKDAY(TODAY(),2)+1))'],
    ['', ''],
    ['Size: S ordered', '=SUMPRODUCT(--ISNUMBER(SEARCH(",S,",","&Orders!X2:X2000&",")))'],
    ['Size: M ordered', '=SUMPRODUCT(--ISNUMBER(SEARCH(",M,",","&Orders!X2:X2000&",")))'],
    ['Size: L ordered', '=SUMPRODUCT(--ISNUMBER(SEARCH(",L,",","&Orders!X2:X2000&",")))'],
    ['Size: XL ordered', '=SUMPRODUCT(--ISNUMBER(SEARCH(",XL,",","&Orders!X2:X2000&",")))'],
    ['Size: XXL ordered', '=SUMPRODUCT(--ISNUMBER(SEARCH(",XXL,",","&Orders!X2:X2000&",")))']
  ];

  dash.getRange(4, 1, rows.length, 2).setValues(rows);
  dash.autoResizeColumns(1, 2);

  dash.getRange('D3').setValue('Top Cities').setFontWeight('bold');
  dash.getRange('D4').setFormula('=QUERY(Orders!T2:T,"select T, count(T) where T is not null and T <> \'\' group by T order by count(T) desc limit 5 label count(T) \'\'")');

  Logger.log('Dashboard tab created.');
}

/* ========================================================= ARCHIVE OLD DELIVERED ORDERS ========================================================= */

function archiveDeliveredOrders_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ordersSheet = getOrCreateSheet_(ORDERS_SHEET_NAME, ORDERS_HEADERS);
  var archiveSheet = ss.getSheetByName('Archive');
  if (!archiveSheet) {
    archiveSheet = ss.insertSheet('Archive');
    archiveSheet.getRange(1, 1, 1, ORDERS_HEADERS.length).setValues([ORDERS_HEADERS]);
    archiveSheet.setFrozenRows(1);
  }
  var lastRow = ordersSheet.getLastRow();
  if (lastRow < 2) return;
  var data = ordersSheet.getRange(2, 1, lastRow - 1, ORDERS_HEADERS.length).getValues();
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  var toArchive = [];
  var rowsToDelete = [];
  for (var i = 0; i < data.length; i++) {
    var status = data[i][1];
    var orderDate = data[i][7];
    if (status === STATUS_DELIVERED && orderDate instanceof Date && orderDate < cutoff) {
      toArchive.push(data[i]);
      rowsToDelete.push(i + 2);
    }
  }
  if (toArchive.length === 0) {
    Logger.log('No orders old enough to archive.');
    return;
  }
  archiveSheet.getRange(archiveSheet.getLastRow() + 1, 1, toArchive.length, ORDERS_HEADERS.length).setValues(toArchive);
  for (var j = rowsToDelete.length - 1; j >= 0; j--) ordersSheet.deleteRow(rowsToDelete[j]);
  Logger.log('Archived ' + toArchive.length + ' delivered order(s) older than 30 days.');
}

/* ========================================================= COLOR LEGEND TAB ========================================================= */

function createColorLegendTab_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName('Legend');
  if (existing) ss.deleteSheet(existing);
  var legend = ss.insertSheet('Legend');
  legend.getRange('A1').setValue('COLOR LEGEND').setFontWeight('bold').setFontSize(14);
  var rows = [
    ['🔴 Red row', 'EDD has passed and order is not yet Delivered'],
    ['🟠 Orange row', 'Stuck: 4+ days with no status change'],
    ['🟡 Yellow', 'Status: Confirmed'], ['🔵 Light blue', 'Status: Packed'],
    ['🟧 Light orange', 'Status: Shipped'], ['🟣 Purple', 'Status: Out for Delivery'],
    ['🟢 Green', 'Status: Delivered'], ['⬜ Grey', 'Status: Cancelled'],
    ['⚠️ RTO/Undelivered (col M)', 'Courier reported return-to-origin or failed delivery'],
    ['Column R', 'NDR Reason — why delivery failed'],
    ['Column S', 'Return/Refund Status — update manually'],
    ['Yes (col N)', 'Repeat customer'],
    ['Yes (col O)', 'High value order — amount ≥ ' + HIGH_VALUE_THRESHOLD],
    ['Column P/Q', 'Advance Received / Balance Due'],
    ['Column T/U', 'City / State — for regional analysis'],
    ['Column V', 'Fraud Flag — same address diff. name, or repeat RTO risk'],
    ['Column W', 'VIP Tier — ' + VIP_ORDER_THRESHOLD + '+ orders from this phone number'],
    ['Column X', 'Sizes Ordered (internal format, used by Dashboard formulas)'],
    ['Column Y', 'Label URL — tap to open/print the shipping label, if iThink Logistics provided one'],
    ['Column Z/AA', 'Follow-up Date / Note — fill in manually for callbacks'],
    ['Column AB', 'WhatsApp — tap to open chat with a pre-filled message (order confirmation, review request, delay/NDR notice, or generic status), you still tap Send yourself'],
    ['Column AC', 'Invoice URL — auto-generated PDF invoice, tap to view'],
    ['ReturnRequests tab', 'Return/exchange requests submitted by customers, with a one-click WhatsApp reply'],
    ['AbandonedCarts tab', 'One-click WhatsApp reminder column'],
    ['COD Pending tab', 'Run "Update COD Pending tab" from the 🐺 Heavy Soul menu — lists COD orders not yet collected'],
    ['Use the 🐺 Heavy Soul menu', 'for tracking refresh, color coding, dashboard rebuild, archiving, and trigger setup']
  ];
  legend.getRange(3, 1, rows.length, 2).setValues(rows);
  legend.autoResizeColumns(1, 2);
  Logger.log('Legend tab created.');
}

/* ========================================================= INVOICE PDF GENERATION ========================================================= */

function generateInvoicePdf_(body, orderId, amount, isCod) {
  var html = buildInvoiceHtml_(body, orderId, amount, isCod);
  var pdfBlob = Utilities.newBlob(html, 'text/html', orderId + '-invoice.html').getAs('application/pdf');
  pdfBlob.setName('Invoice-' + orderId + '.pdf');
  var folder = getOrCreateInvoiceFolder_();
  var file = folder.createFile(pdfBlob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: file.getUrl(), blob: pdfBlob };
}

function getOrCreateInvoiceFolder_() {
  var folders = DriveApp.getFoldersByName('Heavy Soul Invoices');
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder('Heavy Soul Invoices');
}

// Sends the invoice PDF + order confirmation to the customer's own email
// (heavysoulclothing@gmail.com sends it, via MailApp under the script owner's
// Gmail — only fires if body.email came through from checkout).
function sendInvoiceEmailToCustomer_(body, orderId, amount, isCod, pdfBlob) {
  var customerEmail = String(body.email || '').trim();
  if (!customerEmail) return;

  var subject = 'Heavy Soul — Order Confirmed (#' + orderId + ')';
  var htmlBody =
    '<div style="font-family:Georgia,\'Times New Roman\',serif;color:#1a1814;">' +
    '<p>Hi ' + (body.customerName || 'there') + ',</p>' +
    '<p>Thank you for shopping with Heavy Soul! Your order <strong>#' + orderId + '</strong> (₹' + amount + ', ' +
    (isCod ? 'Cash on Delivery' : 'Prepaid') + ') has been confirmed.</p>' +
    '<p>Your invoice is attached to this email as a PDF.</p>' +
    '<p>We will let you know as soon as your order ships. For any questions about this order, just reply to this email or reach us on WhatsApp.</p>' +
    '<p>Thank you,<br>Heavy Soul</p>' +
    '</div>';

  MailApp.sendEmail({
    to: customerEmail,
    subject: subject,
    htmlBody: htmlBody,
    name: 'Heavy Soul',
    attachments: [pdfBlob]
  });

  Logger.log('Invoice email sent to ' + customerEmail + ' for order ' + orderId);
}

function buildInvoiceHtml_(body, orderId, amount, isCod) {
  var itemsHtml = '';
  var subtotal = 0;
  if (body.items && Array.isArray(body.items)) {
    body.items.forEach(function (item) {
      var lineTotal = (item.price || 0) * (item.qty || 1);
      subtotal += lineTotal;
      itemsHtml += '<tr>' +
        '<td style="padding:12px 8px;border-bottom:1px solid #e5e0d8;">' + (item.name || '') + '</td>' +
        '<td style="padding:12px 8px;border-bottom:1px solid #e5e0d8;text-align:center;">' + (item.size || '-') + '</td>' +
        '<td style="padding:12px 8px;border-bottom:1px solid #e5e0d8;text-align:center;">' + (item.qty || 1) + '</td>' +
        '<td style="padding:12px 8px;border-bottom:1px solid #e5e0d8;text-align:right;">Rs ' + (item.price || 0) + '</td>' +
        '<td style="padding:12px 8px;border-bottom:1px solid #e5e0d8;text-align:right;">Rs ' + lineTotal + '</td>' +
        '</tr>';
    });
  }

  var invoiceDate = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy');
  var handling = amount - subtotal;
  var handlingRow = (handling > 0) ?
    '<tr><td colspan="4" style="padding:6px 8px;text-align:right;color:#6b6558;">COD Handling</td>' +
    '<td style="padding:6px 8px;text-align:right;color:#6b6558;">Rs ' + handling + '</td></tr>' : '';

  return '<html><head><meta charset="utf-8"></head>' +
    '<body style="font-family:Georgia,\'Times New Roman\',serif;color:#1a1814;padding:40px;background:#fdfaf5;">' +

    '<table width="100%" style="border-bottom:3px solid #14120F;padding-bottom:20px;margin-bottom:30px;">' +
    '<tr>' +
    '<td>' +
    '<div style="font-size:28px;font-weight:bold;letter-spacing:1px;">HEAVY SOUL</div>' +
    '<div style="font-size:11px;letter-spacing:2px;color:#6b6558;margin-top:2px;">EST. 2026</div>' +
    '</td>' +
    '<td style="text-align:right;">' +
    '<div style="font-size:20px;font-weight:bold;letter-spacing:2px;color:#6b1f2a;">INVOICE</div>' +
    '<div style="font-size:12px;color:#6b6558;margin-top:4px;">Order #' + orderId + '</div>' +
    '<div style="font-size:12px;color:#6b6558;">' + invoiceDate + '</div>' +
    '</td>' +
    '</tr>' +
    '</table>' +

    '<table width="100%" style="margin-bottom:30px;">' +
    '<tr>' +
    '<td width="50%" style="vertical-align:top;">' +
    '<div style="font-size:11px;letter-spacing:1px;color:#6b6558;margin-bottom:6px;">BILL TO</div>' +
    '<div style="font-size:14px;font-weight:bold;">' + (body.customerName || '') + '</div>' +
    '<div style="font-size:13px;color:#3a362e;line-height:1.5;margin-top:4px;">' +
    (body.fullAddress || buildAddressString_(body)) + '<br>' +
    'Phone: ' + (body.phone || '') +
    '</div>' +
    '</td>' +
    '<td width="50%" style="vertical-align:top;text-align:right;">' +
    '<div style="font-size:11px;letter-spacing:1px;color:#6b6558;margin-bottom:6px;">PAYMENT</div>' +
    '<div style="font-size:13px;">' + (isCod ? 'Cash on Delivery' : 'Prepaid (Online)') + '</div>' +
    '</td>' +
    '</tr>' +
    '</table>' +

    '<table width="100%" style="border-collapse:collapse;margin-bottom:20px;">' +
    '<tr style="background:#14120F;color:#fdfaf5;">' +
    '<td style="padding:10px 8px;font-size:11px;letter-spacing:1px;">ITEM</td>' +
    '<td style="padding:10px 8px;font-size:11px;letter-spacing:1px;text-align:center;">SIZE</td>' +
    '<td style="padding:10px 8px;font-size:11px;letter-spacing:1px;text-align:center;">QTY</td>' +
    '<td style="padding:10px 8px;font-size:11px;letter-spacing:1px;text-align:right;">PRICE</td>' +
    '<td style="padding:10px 8px;font-size:11px;letter-spacing:1px;text-align:right;">TOTAL</td>' +
    '</tr>' +
    itemsHtml +
    '</table>' +

    '<table width="100%" style="margin-bottom:40px;">' +
    handlingRow +
    '<tr>' +
    '<td colspan="4" style="padding:12px 8px 0 8px;text-align:right;font-size:16px;font-weight:bold;border-top:2px solid #14120F;">Total</td>' +
    '<td style="padding:12px 8px 0 8px;text-align:right;font-size:16px;font-weight:bold;border-top:2px solid #14120F;color:#6b1f2a;">Rs ' + amount + '</td>' +
    '</tr>' +
    '</table>' +

    '<div style="border-top:1px solid #e5e0d8;padding-top:20px;text-align:center;color:#6b6558;font-size:12px;">' +
    'Thank you for shopping with Heavy Soul.<br>' +
    'For questions about this order, reply on WhatsApp or contact us at ' + (SUMMARY_EMAIL_TO || '') +
    '</div>' +

    '</body></html>';
}

/* ========================================================= MANUAL TEST HELPER ========================================================= */

function testInvoiceGenerationAndEmail() {
  var sampleOrder = {
    orderId: 'TEST-INVOICE-' + new Date().getTime(),
    customerName: 'Test Customer',
    phone: '9999999999',
    email: 'heavysoulclothing@gmail.com', // replace with your own email before running
    address: 'Test Address Line 1', city: 'Kolkata', state: 'West Bengal', pincode: '700001',
    paymentType: 'prepaid', amount: 1499,
    items: [{ name: 'Test Hoodie', size: 'L', qty: 1, price: 1499 }]
  };
  try {
    var result = generateInvoicePdf_(sampleOrder, sampleOrder.orderId, sampleOrder.amount, false);
    Logger.log('INVOICE PDF CREATED: ' + result.url);
    sendInvoiceEmailToCustomer_(sampleOrder, sampleOrder.orderId, sampleOrder.amount, false, result.blob);
    Logger.log('TEST INVOICE EMAIL SENT to ' + sampleOrder.email);
  } catch (err) {
    Logger.log('TEST FAILED: ' + err + (err.stack ? ' | ' + err.stack : ''));
  }
}