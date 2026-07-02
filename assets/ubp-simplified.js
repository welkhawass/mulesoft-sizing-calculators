// ============================================================
// UBP Simplified Sizing — UI Logic
// Depends on: ubp-data.js, ubp-calc.js
// ============================================================

var simpUseCases  = [];
var simpEditing   = -1;

function simpGetGlobals() {
  return {
    numEnvs:        parseInt(document.getElementById('numEnvs').value, 10),
    reusabilityKey: document.getElementById('reusability').value
  };
}

function simpTypeTag(type) {
  if (!type) return '';
  if (type === 'API/Microservices') return '<span class="tag tag-api">API</span>';
  if (type === 'Event-Based')       return '<span class="tag tag-event">Event</span>';
  if (type === 'Schedule-Based')    return '<span class="tag tag-sched">Schedule</span>';
  return type;
}

function simpRenderTable() {
  var area  = document.getElementById('simpTableArea');
  var count = document.getElementById('simpUcCount');
  count.textContent = simpUseCases.length ? '(' + simpUseCases.length + ')' : '';

  if (simpUseCases.length === 0) {
    area.innerHTML = '<div class="empty-state"><p>No use cases yet. Add your first one to start sizing.</p>' +
      '<button onclick="simpOpenModal(-1)">+ Add Use Case</button></div>';
    return;
  }

  var g    = simpGetGlobals();
  var rows = '';
  simpUseCases.forEach(function(uc, i) {
    var result  = calcRow(uc, g.numEnvs, g.reusabilityKey);
    var flows   = result ? result.flows : '—';
    var msgs    = result ? fmtMRange(result.msgMin, result.msgMax) : '—';
    var data    = result ? fmtGBRange(result.dataMinGB, result.dataMaxGB) : '—';
    var bTag    = uc.bidir ? '<span class="tag tag-bidir">2-way</span>' : '';
    var name    = uc.name  || '<span style="color:#aaa">Use Case ' + (i+1) + '</span>';
    rows += '<tr>' +
      '<td class="col-num">' + (i+1) + '</td>' +
      '<td class="col-name">' + name + '</td>' +
      '<td class="col-type">' + simpTypeTag(uc.intType) + bTag + '</td>' +
      '<td>' + (uc.tasks || '—') + '</td>' +
      '<td>' + (uc.payload || '—') + '</td>' +
      '<td class="col-metric">' + flows + '</td>' +
      '<td class="col-metric">' + msgs + '</td>' +
      '<td class="col-metric">' + data + '</td>' +
      '<td class="col-actions">' +
        '<button class="btn-action" onclick="simpOpenModal(' + i + ')">Edit</button>' +
        '<button class="btn-action btn-del" onclick="simpDeleteUC(' + i + ')">Delete</button>' +
      '</td></tr>';
  });

  area.innerHTML = '<div class="uc-table-wrap"><table class="uc-table"><thead><tr>' +
    '<th class="col-num">#</th><th>Name</th><th>Type</th>' +
    '<th>Tasks/mo</th><th>Payload</th>' +
    '<th class="col-metric">Flows</th>' +
    '<th class="col-metric">Messages/mo</th>' +
    '<th class="col-metric">Data/mo</th>' +
    '<th class="col-actions"></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function simpRenderSummary() {
  var el = document.getElementById('simpSummaryBody');
  var g  = simpGetGlobals();
  var results = simpUseCases.map(function(uc) {
    return calcRow(uc, g.numEnvs, g.reusabilityKey);
  }).filter(Boolean);

  if (results.length === 0) {
    el.innerHTML = '<div class="summary-empty">Add at least one use case to see sizing results.</div>';
    return;
  }

  var totals = calcTotals(results);
  var rec    = recommendPackage(totals);
  var minM   = totals.annualMsgMin / 1e6;
  var maxM   = totals.annualMsgMax / 1e6;

  el.innerHTML =
    '<div class="summary-grid">' +
      '<div class="summary-metric"><div class="label">Total Flows</div>' +
        '<div class="value">' + totals.totalFlows + '</div>' +
        '<div class="sub">across all use cases</div></div>' +
      '<div class="summary-metric"><div class="label">Messages / Year</div>' +
        '<div class="value">' + fmtM(minM) + ' &ndash; ' + fmtM(maxM) + '</div>' +
        '<div class="sub">annualised estimate</div></div>' +
      '<div class="summary-metric"><div class="label">Data Throughput / Year</div>' +
        '<div class="value">' + fmtGB(totals.annualDataMin) + '</div>' +
        '<div class="sub">min estimate</div></div>' +
    '</div>' +
    pkgBreakdownHtml(rec, totals.totalFlows, minM, totals.annualDataMin);
}

function simpRefresh() {
  simpRenderTable();
  simpRenderSummary();
}

function simpDeleteUC(i) {
  simpUseCases.splice(i, 1);
  simpRefresh();
}

function simpOpenModal(index) {
  simpEditing = index;
  var isNew   = index === -1;
  document.getElementById('simpModalTitle').textContent = isNew ? 'Add Use Case' : 'Edit Use Case';

  var banner = document.getElementById('simpCopyBanner');
  if (isNew && simpUseCases.length > 0) banner.classList.add('visible');
  else banner.classList.remove('visible');

  var fields = ['m-name','m-intType','m-systems','m-bizObjects','m-tasks','m-payload'];
  if (isNew) {
    fields.forEach(function(id) { document.getElementById(id).value = ''; });
    document.getElementById('m-bidir').checked = false;
  } else {
    var uc = simpUseCases[index];
    document.getElementById('m-name').value       = uc.name || '';
    document.getElementById('m-intType').value    = uc.intType;
    document.getElementById('m-systems').value    = uc.systems;
    document.getElementById('m-bizObjects').value = uc.bizObjects;
    document.getElementById('m-tasks').value      = uc.tasks;
    document.getElementById('m-payload').value    = uc.payload;
    document.getElementById('m-bidir').checked    = uc.bidir;
  }

  simpUpdatePreview();
  document.getElementById('simpModal').classList.add('open');
  document.getElementById('m-name').focus();
}

function simpReadModal() {
  return {
    name:       document.getElementById('m-name').value.trim(),
    intType:    document.getElementById('m-intType').value,
    systems:    document.getElementById('m-systems').value,
    bizObjects: document.getElementById('m-bizObjects').value,
    tasks:      document.getElementById('m-tasks').value,
    payload:    document.getElementById('m-payload').value,
    bidir:      document.getElementById('m-bidir').checked
  };
}

function simpUpdatePreview() {
  var g      = simpGetGlobals();
  var result = calcRow(simpReadModal(), g.numEnvs, g.reusabilityKey);
  var el     = document.getElementById('simpModalPreview');
  if (!result) {
    el.innerHTML = '<div class="prev-placeholder">Complete the inputs to see the estimate</div>';
    return;
  }
  el.innerHTML =
    '<div class="prev-row"><span>Flows</span><span>' + result.flows + '</span></div>' +
    '<div class="prev-row"><span>Messages / month</span><span>' + fmtMRange(result.msgMin, result.msgMax) + '</span></div>' +
    '<div class="prev-row"><span>Data / month</span><span>' + fmtGBRange(result.dataMinGB, result.dataMaxGB) + '</span></div>';
}

function simpCloseModal() {
  document.getElementById('simpModal').classList.remove('open');
}

// ── CSV Import ──

var SIMP_CSV_INTTYPE_MAP = {
  'api/microservices': 'API/Microservices',
  'apimicroservices':  'API/Microservices',
  'api':               'API/Microservices',
  'microservices':     'API/Microservices',
  'event-based':       'Event-Based',
  'eventbased':        'Event-Based',
  'event':             'Event-Based',
  'schedule-based':    'Schedule-Based',
  'schedulebased':     'Schedule-Based',
  'schedule':          'Schedule-Based',
  'scheduled':         'Schedule-Based'
};

var SIMP_CSV_TASKS_MAP = {
  '0-10k':     '0-10K',
  '10k-100k':  '10K-100K',
  '100k-500k': '100K-500K',
  '500k-10m':  '500K-10M'
};

var SIMP_CSV_PAYLOAD_MAP = {
  '0-100kb':     '0-100KB',
  '101kb-500kb': '101KB-500KB',
  '501kb-1mb':   '501KB-1MB',
  '1mb-10mb':    '1MB-10MB',
  '10mb+':       '10MB+'
};

var SIMP_CSV_ENUM_MAP = { '1-2': '1-2', '3-5': '3-5', '6-10': '6-10', '10+': '10+' };

function simpParseCSVLine(line) {
  var fields = [], field = '', inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function simpNormalizeCSVRow(obj, lineNum, errors) {
  var name = (obj['name'] || obj['usecase'] || obj['usecasename'] || '').trim();

  var rawType = (obj['inttype'] || obj['integrationtype'] || obj['type'] || '').toLowerCase().replace(/[\s_]/g, '');
  var intType = SIMP_CSV_INTTYPE_MAP[rawType];
  if (!intType) { errors.push('Row ' + lineNum + ': unrecognised intType “' + (obj['inttype'] || rawType) + '”'); return null; }

  var rawSys = (obj['systems'] || obj['systemstointegrate'] || obj['howmanysystems'] || '').trim().toLowerCase();
  var systems = SIMP_CSV_ENUM_MAP[rawSys];
  if (!systems) { errors.push('Row ' + lineNum + ': invalid systems “' + rawSys + '”'); return null; }

  var rawBO = (obj['bizobjects'] || obj['businessobjects'] || obj['howmanybizobjects'] || '').trim().toLowerCase();
  var bizObjects = SIMP_CSV_ENUM_MAP[rawBO];
  if (!bizObjects) { errors.push('Row ' + lineNum + ': invalid bizObjects “' + rawBO + '”'); return null; }

  var rawTasks = (obj['tasks'] || obj['taskspermonth'] || '').toLowerCase().replace(/\s/g, '');
  var tasks = SIMP_CSV_TASKS_MAP[rawTasks];
  if (!tasks) { errors.push('Row ' + lineNum + ': invalid tasks “' + rawTasks + '”'); return null; }

  var rawPayload = (obj['payload'] || obj['payloadsize'] || obj['avgpayload'] || '').toLowerCase().replace(/\s/g, '');
  var payload = SIMP_CSV_PAYLOAD_MAP[rawPayload];
  if (!payload) { errors.push('Row ' + lineNum + ': invalid payload “' + rawPayload + '”'); return null; }

  var rawBidir = (obj['bidir'] || obj['bidirectional'] || '').toLowerCase().trim();
  var bidir = (rawBidir === 'true' || rawBidir === 'yes' || rawBidir === '1' || rawBidir === 'y');

  return { name: name, intType: intType, systems: systems, bizObjects: bizObjects,
           tasks: tasks, payload: payload, bidir: bidir };
}

function simpParseCSVText(text) {
  text = text.replace(/^﻿/, '');  // strip BOM
  var lines = text.split(/\r?\n/);
  var headers = null, rows = [], errors = [], dataLine = 0;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line || line.charAt(0) === '#') continue;  // blank or comment
    var fields = simpParseCSVLine(line);

    if (!headers) {
      headers = fields.map(function(h) { return h.toLowerCase().trim().replace(/[^a-z0-9]/g, ''); });
      continue;
    }

    dataLine++;
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = (fields[j] || '').trim();
    var uc = simpNormalizeCSVRow(obj, dataLine, errors);
    if (uc) rows.push(uc);
  }

  return { rows: rows, errors: errors };
}

function simpShowImportResult(imported, errors) {
  var el = document.getElementById('simpImportResult');
  if (!el) return;
  if (imported === 0 && errors.length === 0) {
    el.innerHTML = ''; el.style.display = 'none'; return;
  }
  var isWarn = errors.length > 0;
  var msg = '';
  if (imported > 0) msg += '✓ ' + imported + ' use case' + (imported === 1 ? '' : 's') + ' imported.';
  if (errors.length > 0) {
    msg += (imported > 0 ? '  ' : '') + '⚠ ' + errors.length + ' row' + (errors.length === 1 ? '' : 's') + ' skipped: ' +
      errors.join('; ');
  }
  el.className = 'import-result ' + (isWarn ? 'import-result-warn' : 'import-result-ok');
  el.innerHTML = msg +
    '<button onclick="this.parentElement.style.display=\'none\'" ' +
      'style="float:right;background:none;border:none;font-size:1rem;cursor:pointer;color:inherit;">' +
      '×</button>';
  el.style.display = 'block';
}

function simpHandleCSVFile(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var result = simpParseCSVText(e.target.result);
    result.rows.forEach(function(uc) { simpUseCases.push(uc); });
    simpRefresh();
    simpShowImportResult(result.rows.length, result.errors);
  };
  reader.readAsText(file);
}

function simpDownloadTemplate() {
  var lines = [
    '# MuleSoft UBP — Use Cases CSV Template',
    '# intType    : API/Microservices | Event-Based | Schedule-Based',
    '# systems    : 1-2 | 3-5 | 6-10 | 10+',
    '# bizObjects : 1-2 | 3-5 | 6-10 | 10+',
    '# tasks      : 0-10K | 10K-100K | 100K-500K | 500K-10M  (per month)',
    '# payload    : 0-100KB | 101KB-500KB | 501KB-1MB | 1MB-10MB | 10MB+',
    '# bidir      : true | false',
    'name,intType,systems,bizObjects,tasks,payload,bidir',
    'Order Management API,API/Microservices,3-5,3-5,0-10K,0-100KB,false',
    'Customer Portal API,API/Microservices,1-2,3-5,10K-100K,0-100KB,false',
    'Inventory Event,Event-Based,1-2,1-2,0-10K,0-100KB,false',
    'Nightly Sync,Schedule-Based,1-2,1-2,0-10K,0-100KB,false'
  ];
  var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href = url; a.download = 'ubp-use-cases-template.csv'; a.click();
  URL.revokeObjectURL(url);
}

function simpInitEvents() {
  document.getElementById('simpBtnAddUC').addEventListener('click', function() { simpOpenModal(-1); });
  document.getElementById('numEnvs').addEventListener('change',    simpRefresh);
  document.getElementById('reusability').addEventListener('change', simpRefresh);

  document.getElementById('simpBtnImportCSV').addEventListener('click', function() {
    document.getElementById('simpCSVInput').click();
  });
  document.getElementById('simpCSVInput').addEventListener('change', function(e) {
    simpHandleCSVFile(e.target.files[0]);
    this.value = '';  // allow re-importing the same file
  });
  document.getElementById('simpBtnCSVTemplate').addEventListener('click', simpDownloadTemplate);

  document.getElementById('simpCopyBanner').querySelector('.btn-copy-prev')
    .addEventListener('click', function() {
      var prev = simpUseCases[simpUseCases.length - 1];
      if (!prev) return;
      document.getElementById('m-intType').value    = prev.intType;
      document.getElementById('m-systems').value    = prev.systems;
      document.getElementById('m-bizObjects').value = prev.bizObjects;
      document.getElementById('m-tasks').value      = prev.tasks;
      document.getElementById('m-payload').value    = prev.payload;
      document.getElementById('m-bidir').checked    = prev.bidir;
      simpUpdatePreview();
    });

  ['m-intType','m-systems','m-bizObjects','m-tasks','m-payload','m-bidir'].forEach(function(id) {
    document.getElementById(id).addEventListener('change', simpUpdatePreview);
  });

  document.getElementById('simpBtnModalSave').addEventListener('click', function() {
    var uc = simpReadModal();
    if (simpEditing === -1) simpUseCases.push(uc);
    else simpUseCases[simpEditing] = uc;
    simpCloseModal();
    simpRefresh();
  });

  document.getElementById('simpBtnModalClose').addEventListener('click',  simpCloseModal);
  document.getElementById('simpBtnModalCancel').addEventListener('click', simpCloseModal);
  document.getElementById('simpModal').addEventListener('click', function(e) {
    if (e.target === document.getElementById('simpModal')) simpCloseModal();
  });
}
