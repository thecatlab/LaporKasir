var SPREADSHEET_NAME = 'LaporKasir SKMK Data';
var REPORT_SHEET_NAME = 'Laporan';
var EXPENSE_SHEET_NAME = 'Pengeluaran';
var SPREADSHEET_ID_PROPERTY = 'LAPORKASIR_SPREADSHEET_ID';
var DEFAULT_DRIVE_FOLDER_ID = '1wBzVkBvLXEPn5pO87oYmJXo7wiG5H2LR';
var DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];

var REPORT_HEADERS = [
  'submitted_at_server',
  'submitted_at_client',
  'report_date',
  'submission_id',
  'revision',
  'fingerprint',
  'request_id',
  'spreadsheet_url',
  'screenshot_url',
  'screenshot_file_id',
  'screenshot_filename',
  'status',
  'kas_awal',
  'kas_akhir',
  'selisih_kas',
  'total_pengeluaran',
  'setor_tunai',
  'pendapatan_cash',
  'pendapatan_qris',
  'pendapatan_lain_lain',
  'total_pendapatan',
  'total_qasir',
  'selisih_akhir',
  'notes',
  'report_text'
].concat(
  DENOMINATIONS.map(function(value) { return 'awal_' + value; }),
  DENOMINATIONS.map(function(value) { return 'akhir_' + value; })
);

var EXPENSE_HEADERS = [
  'submitted_at_server',
  'report_date',
  'submission_id',
  'revision',
  'expense_index',
  'name',
  'qty',
  'unit',
  'amount'
];

function doGet() {
  return HtmlService
    .createHtmlOutput('LaporKasir Apps Script endpoint is active.')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var payloadText = getPayloadText_(e);
  var requestId = extractRequestId_(payloadText);
  var response;

  try {
    var payload = JSON.parse(payloadText);
    requestId = payload.requestId || requestId;
    response = saveReport_(payload);
  } catch (err) {
    response = {
      ok: false,
      status: 'error',
      message: err && err.message ? err.message : String(err)
    };
  }

  return renderResponse_(requestId, response);
}

function saveReport_(payload) {
  if (!payload || !payload.reportDate) throw new Error('Tanggal laporan tidak ditemukan.');

  var spreadsheet = getOrCreateSpreadsheet_();
  var reportSheet = ensureSheet_(spreadsheet, REPORT_SHEET_NAME, REPORT_HEADERS);
  var expenseSheet = ensureSheet_(spreadsheet, EXPENSE_SHEET_NAME, EXPENSE_HEADERS);
  var fingerprint = buildFingerprint_(payload);
  var duplicate = findDuplicate_(reportSheet, fingerprint);

  if (duplicate) {
    return {
      ok: true,
      status: 'duplicate',
      existingSubmissionId: duplicate.submissionId,
      message: 'Laporan sudah terekam di database.'
    };
  }

  var submittedAtServer = new Date();
  var revision = getNextRevision_(reportSheet, payload.reportDate);
  var submissionId = Utilities.getUuid();
  var screenshot = saveScreenshot_(payload.image);
  var reportRow = buildReportRow_(payload, {
    submittedAtServer: submittedAtServer,
    spreadsheet: spreadsheet,
    submissionId: submissionId,
    revision: revision,
    fingerprint: fingerprint,
    screenshot: screenshot
  });
  var expenseRows = buildExpenseRows_(payload, submittedAtServer, submissionId, revision);

  reportSheet.appendRow(reportRow);
  if (expenseRows.length > 0) {
    expenseSheet.getRange(expenseSheet.getLastRow() + 1, 1, expenseRows.length, EXPENSE_HEADERS.length).setValues(expenseRows);
  }

  return {
    ok: true,
    status: 'saved',
    submissionId: submissionId,
    revision: revision,
    spreadsheetUrl: spreadsheet.getUrl(),
    screenshotUrl: screenshot.url
  };
}

function getOrCreateSpreadsheet_() {
  var properties = PropertiesService.getScriptProperties();
  var storedId = properties.getProperty(SPREADSHEET_ID_PROPERTY);

  if (storedId) {
    try {
      return SpreadsheetApp.openById(storedId);
    } catch (err) {
      properties.deleteProperty(SPREADSHEET_ID_PROPERTY);
    }
  }

  var files = DriveApp.getFilesByName(SPREADSHEET_NAME);
  if (files.hasNext()) {
    var existing = SpreadsheetApp.openById(files.next().getId());
    properties.setProperty(SPREADSHEET_ID_PROPERTY, existing.getId());
    return existing;
  }

  var spreadsheet = SpreadsheetApp.create(SPREADSHEET_NAME);
  spreadsheet.getSheets()[0].setName(REPORT_SHEET_NAME);
  properties.setProperty(SPREADSHEET_ID_PROPERTY, spreadsheet.getId());
  return spreadsheet;
}

function ensureSheet_(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  else sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

function saveScreenshot_(image) {
  if (!image || !image.base64) return { id: '', url: '', filename: '' };

  var folderId = image.folderId || DEFAULT_DRIVE_FOLDER_ID;
  var folder = DriveApp.getFolderById(folderId);
  var filename = image.filename || 'Laporan_Harian_SKMK.png';
  var bytes = Utilities.base64Decode(image.base64);
  var blob = Utilities.newBlob(bytes, 'image/png', filename);
  var file = folder.createFile(blob);

  return {
    id: file.getId(),
    url: file.getUrl(),
    filename: file.getName()
  };
}

function buildReportRow_(payload, context) {
  var row = [
    context.submittedAtServer,
    payload.submittedClientAt || '',
    payload.reportDate || '',
    context.submissionId,
    context.revision,
    context.fingerprint,
    payload.requestId || '',
    context.spreadsheet.getUrl(),
    context.screenshot.url || '',
    context.screenshot.id || '',
    context.screenshot.filename || '',
    payload.discrepancyStatus || '',
    calculationValue_(payload, 'startTotal'),
    calculationValue_(payload, 'endTotal'),
    calculationValue_(payload, 'netCashFlow'),
    calculationValue_(payload, 'expensesTotal'),
    calculationValue_(payload, 'setorTunai'),
    calculationValue_(payload, 'cashIncome'),
    calculationValue_(payload, 'qris'),
    calculationValue_(payload, 'lainLain'),
    calculationValue_(payload, 'totalIncome'),
    calculationValue_(payload, 'qasir'),
    calculationValue_(payload, 'discrepancy'),
    payload.notes || '',
    payload.reportText || ''
  ];

  DENOMINATIONS.forEach(function(value) {
    row.push(denominationValue_(payload, 'start', value));
  });
  DENOMINATIONS.forEach(function(value) {
    row.push(denominationValue_(payload, 'end', value));
  });

  return row;
}

function buildExpenseRows_(payload, submittedAtServer, submissionId, revision) {
  var expenses = Array.isArray(payload.expenses) ? payload.expenses : [];
  return expenses.map(function(expense, index) {
    return [
      submittedAtServer,
      payload.reportDate || '',
      submissionId,
      revision,
      expense.index || index + 1,
      expense.name || '',
      expense.qty === undefined || expense.qty === null ? '' : expense.qty,
      expense.unit || '',
      numberValue_(expense.amount)
    ];
  });
}

function buildFingerprint_(payload) {
  var normalized = {
    reportDate: String(payload.reportDate || ''),
    notes: String(payload.notes || ''),
    calculations: {},
    denominations: { start: {}, end: {} },
    expenses: []
  };

  [
    'startTotal',
    'endTotal',
    'expensesTotal',
    'netCashFlow',
    'cashIncome',
    'qris',
    'lainLain',
    'setorTunai',
    'totalIncome',
    'qasir',
    'discrepancy'
  ].forEach(function(key) {
    normalized.calculations[key] = calculationValue_(payload, key);
  });

  DENOMINATIONS.forEach(function(value) {
    normalized.denominations.start[value] = denominationValue_(payload, 'start', value);
    normalized.denominations.end[value] = denominationValue_(payload, 'end', value);
  });

  (Array.isArray(payload.expenses) ? payload.expenses : []).forEach(function(expense) {
    normalized.expenses.push({
      name: String(expense.name || '').trim(),
      qty: normalizeQty_(expense.qty),
      unit: String(expense.unit || '').trim(),
      amount: numberValue_(expense.amount)
    });
  });

  return sha256_(JSON.stringify(normalized));
}

function findDuplicate_(sheet, fingerprint) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  var headers = values[0];
  var fingerprintIndex = headers.indexOf('fingerprint');
  var submissionIndex = headers.indexOf('submission_id');
  if (fingerprintIndex < 0) return null;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][fingerprintIndex]) === fingerprint) {
      return {
        row: i + 1,
        submissionId: submissionIndex >= 0 ? String(values[i][submissionIndex]) : ''
      };
    }
  }
  return null;
}

function getNextRevision_(sheet, reportDate) {
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return 1;

  var headers = values[0];
  var dateIndex = headers.indexOf('report_date');
  var revisionIndex = headers.indexOf('revision');
  var maxRevision = 0;

  for (var i = 1; i < values.length; i++) {
    if (String(values[i][dateIndex]) === String(reportDate)) {
      maxRevision = Math.max(maxRevision, numberValue_(values[i][revisionIndex]));
    }
  }

  return maxRevision + 1;
}

function getPayloadText_(e) {
  if (e && e.parameter && e.parameter.payload) return e.parameter.payload;
  if (e && e.postData && e.postData.contents) return e.postData.contents;
  throw new Error('Payload kosong.');
}

function extractRequestId_(payloadText) {
  if (!payloadText) return '';
  var match = String(payloadText).match(/"requestId"\s*:\s*"([^"]+)"/);
  return match ? match[1] : '';
}

function renderResponse_(requestId, response) {
  var envelope = {
    source: 'laporkasir-apps-script',
    requestId: requestId || '',
    response: response
  };
  var json = JSON.stringify(envelope).replace(/</g, '\\u003c');
  var html = '<!doctype html><html><body><script>parent.postMessage(' + json + ', "*");</script></body></html>';

  return HtmlService
    .createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function calculationValue_(payload, key) {
  return numberValue_(payload && payload.calculations ? payload.calculations[key] : 0);
}

function denominationValue_(payload, side, value) {
  var denominations = payload && payload.denominations && payload.denominations[side] ? payload.denominations[side] : {};
  return numberValue_(denominations[value]);
}

function normalizeQty_(value) {
  if (value === '' || value === null || value === undefined) return '';
  var numeric = Number(value);
  return isFinite(numeric) ? numeric : String(value).trim();
}

function numberValue_(value) {
  var numeric = Number(value);
  return isFinite(numeric) ? numeric : 0;
}

function sha256_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map(function(byte) {
    var value = byte < 0 ? byte + 256 : byte;
    var hex = value.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}
