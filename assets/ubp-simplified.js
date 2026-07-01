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

  var extrasHtml = '';
  if (rec.extraFlows > 0 || rec.extraMsgM > 0 || rec.extraDataGB > 0) {
    extrasHtml = '<div class="pkg-extras">Additional capacity beyond package: ' +
      (rec.extraFlows  > 0 ? rec.extraFlows + ' extra flows &nbsp;&bull;&nbsp;' : '') +
      (rec.extraMsgM   > 0 ? rec.extraMsgM.toFixed(1) + 'M extra messages &nbsp;&bull;&nbsp;' : '') +
      (rec.extraDataGB > 0 ? fmtGB(rec.extraDataGB) + ' extra data' : '') +
      '</div>';
  }

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
    '<div class="pkg-row">' +
      '<div class="pkg-badge ' + (rec.name === 'Advanced' ? 'advanced' : '') + '">' + rec.name + '</div>' +
      '<div class="pkg-details">' +
        '<div class="pkg-name">Integration ' + rec.name + ' Package</div>' +
        '<div class="pkg-price">' + fmtUSD(rec.totalListPrice) +
          ' <span style="font-size:0.85rem;font-weight:400;color:#888;">/ year (list price, USD)</span></div>' +
        '<div class="pkg-reason">' + rec.reasons.join(' &bull; ') + '</div>' +
        extrasHtml +
      '</div>' +
    '</div>';
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

function simpInitEvents() {
  document.getElementById('simpBtnAddUC').addEventListener('click', function() { simpOpenModal(-1); });
  document.getElementById('numEnvs').addEventListener('change',    simpRefresh);
  document.getElementById('reusability').addEventListener('change', simpRefresh);

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
