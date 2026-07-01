// ============================================================
// UBP Detailed Sizing — UI Logic
// Depends on: ubp-data.js, ubp-calc.js
// ============================================================

// ── State ──
var detUseCases  = [];   // [{ name, components:[] }]
var detEditing   = { ucIdx: -1, compIdx: -1 };

// ── Environment settings (with defaults) ──
function detGetEnvSettings() {
  return {
    prodEnvs:        parseInt(document.getElementById('det-prodEnvs').value,   10) || 1,
    nonProdEnvs:     parseInt(document.getElementById('det-nonProdEnvs').value, 10) || 2,
    haReplicas:      parseInt(document.getElementById('det-haReplicas').value,  10) || 2,
    flowsBuffer:     parseFloat(document.getElementById('det-flowsBuffer').value)  / 100 || 0.10,
    msgNonProdPct:   parseFloat(document.getElementById('det-msgNonProdPct').value) / 100 || 0.40,
    msgBuffer:       parseFloat(document.getElementById('det-msgBuffer').value)    / 100 || 0.05,
    dataNonProdPct:  parseFloat(document.getElementById('det-dataNonProdPct').value)/ 100 || 0.40,
    dataBuffer:      parseFloat(document.getElementById('det-dataBuffer').value)   / 100 || 0.05,
    omniNonProdPct:  parseFloat(document.getElementById('det-omniNonProdPct').value)/ 100 || 0.20,
    omniBuffer:      parseFloat(document.getElementById('det-omniBuffer').value)   / 100 || 0.10
  };
}

// ── Copy from Simplified ──
function detCopyFromSimplified() {
  if (simpUseCases.length === 0) return;
  detUseCases = simpUseCases.map(function(uc) {
    var compName = (uc.name || 'Use Case') + ' - Process API';
    return {
      name: uc.name || '',
      components: [{
        name:        compName,
        intType:     uc.intType,
        impl:        'MuleSoft',
        tasks:       '',
        taskPeriod:  'Month',
        bizHours:    8,
        bizDays:     220,
        payloadKB:   50,
        ha:          false
      }]
    };
  });
  detRefresh();
}

// ── Time period → annual multiplier ──
function detAnnualMultiplier(period, bizHours, bizDays) {
  switch (period) {
    case 'Second': return 3600 * bizHours * bizDays;
    case 'Minute': return 60   * bizHours * bizDays;
    case 'Hour':   return       bizHours * bizDays;
    case 'Day':    return                  bizDays;
    case 'Month':  return 12;
    case 'Year':   return 1;
    default:       return 12;
  }
}

// ── Calculate one component ──
function detCalcComponent(comp) {
  if (!comp.tasks || isNaN(parseFloat(comp.tasks))) return null;
  var tasks       = parseFloat(comp.tasks);
  var annualTasks = tasks * detAnnualMultiplier(comp.taskPeriod, comp.bizHours, comp.bizDays);
  var msgs        = annualTasks;
  var dataGB      = (msgs * comp.payloadKB * 2) / 1048576;
  return { msgs: msgs, dataGB: dataGB, isMuleSoft: comp.impl === 'MuleSoft', ha: comp.ha };
}

// ── Calculate flows for a use case (1:1 mapping = 1 component) ──
function detCalcFlows(uc, haReplicas) {
  var total = 0, haFlows = 0;
  uc.components.forEach(function(comp) {
    if (comp.impl !== 'MuleSoft') return;
    var f = 0;
    if (comp.intType === 'API/Microservices') f = 6;   // 4 ops + 1 console + 1 listener default
    else if (comp.intType === 'Event-Based')  f = 3;
    else if (comp.intType === 'Schedule-Based') f = 4;
    total += f;
    if (comp.ha) haFlows += f;
  });
  var withHA = total + haFlows * (haReplicas - 1);
  return { base: total, withHA: withHA };
}

// ── Master calculation ──
function detCalcTotals() {
  var env = detGetEnvSettings();
  var baseMsgs = 0, baseDataGB = 0, baseOmniMsgs = 0;
  var flowsProd = 0, flowsNonProd = 0;

  detUseCases.forEach(function(uc) {
    var f = detCalcFlows(uc, env.haReplicas);
    flowsProd    += f.withHA * env.prodEnvs;
    flowsNonProd += f.withHA * env.nonProdEnvs;

    uc.components.forEach(function(comp) {
      var r = detCalcComponent(comp);
      if (!r) return;
      if (comp.impl === 'MuleSoft') {
        baseMsgs   += r.msgs;
        baseDataGB += r.dataGB;
      } else {
        baseOmniMsgs += r.msgs;
      }
    });
  });

  var flowsBuf   = 1 + env.flowsBuffer;
  var prodFlows  = Math.ceil(flowsProd  * flowsBuf);
  var npFlows    = Math.ceil(flowsNonProd * flowsBuf);

  var msgProd    = Math.ceil(baseMsgs   * env.prodEnvs   * (1 + env.msgBuffer));
  var msgNP      = Math.ceil(baseMsgs   * env.nonProdEnvs * env.msgNonProdPct * (1 + env.msgBuffer));

  var dataProd   = baseDataGB * env.prodEnvs   * (1 + env.dataBuffer);
  var dataNP     = baseDataGB * env.nonProdEnvs * env.dataNonProdPct * (1 + env.dataBuffer);

  var omniProd   = Math.ceil(baseOmniMsgs * env.prodEnvs   * (1 + env.omniBuffer));
  var omniNP     = Math.ceil(baseOmniMsgs * env.nonProdEnvs * env.omniNonProdPct * (1 + env.omniBuffer));

  return {
    flows:    { prod: prodFlows, np: npFlows,  total: prodFlows + npFlows },
    msgs:     { prod: msgProd,   np: msgNP,    total: msgProd + msgNP },
    data:     { prod: dataProd,  np: dataNP,   total: dataProd + dataNP },
    omni:     { prod: omniProd,  np: omniNP,   total: omniProd + omniNP }
  };
}

// ── Render use cases table ──
function detRenderTable() {
  var area  = document.getElementById('detTableArea');
  var count = document.getElementById('detUcCount');
  count.textContent = detUseCases.length ? '(' + detUseCases.length + ')' : '';

  if (detUseCases.length === 0) {
    area.innerHTML = '<div class="empty-state">' +
      '<p>No use cases yet. Add one or copy from Simplified.</p>' +
      '<button onclick="detOpenUCModal(-1)">+ Add Use Case</button>' +
      '</div>';
    return;
  }

  var rows = '';
  detUseCases.forEach(function(uc, ucIdx) {
    // Use case header row
    rows += '<tr class="det-uc-row">' +
      '<td class="col-num">' + (ucIdx + 1) + '</td>' +
      '<td colspan="5" style="font-weight:700;color:#0070ad;">' +
        (uc.name || 'Use Case ' + (ucIdx + 1)) + '</td>' +
      '<td class="col-actions">' +
        '<button class="btn-action" onclick="detOpenUCModal(' + ucIdx + ')">Edit</button>' +
        '<button class="btn-action" onclick="detAddComponent(' + ucIdx + ')">+ Component</button>' +
        '<button class="btn-action btn-del" onclick="detDeleteUC(' + ucIdx + ')">Delete</button>' +
      '</td></tr>';

    // Component rows
    uc.components.forEach(function(comp, cIdx) {
      var implTag = comp.impl === 'MuleSoft'
        ? '<span class="tag tag-api">MuleSoft</span>'
        : '<span class="tag tag-event">Omni GW</span>';
      var haTag = comp.ha ? '<span class="tag tag-bidir">HA</span>' : '';
      var taskStr = comp.tasks ? comp.tasks + ' / ' + comp.taskPeriod : '—';
      rows += '<tr class="det-comp-row">' +
        '<td class="col-num" style="color:#ddd;">↳</td>' +
        '<td class="col-name" style="padding-left:24px;">' + (comp.name || 'Component') + '</td>' +
        '<td>' + detTypeTag(comp.intType) + haTag + '</td>' +
        '<td>' + implTag + '</td>' +
        '<td>' + taskStr + '</td>' +
        '<td>' + (comp.payloadKB ? comp.payloadKB + ' KB' : '—') + '</td>' +
        '<td class="col-actions">' +
          '<button class="btn-action" onclick="detOpenCompModal(' + ucIdx + ',' + cIdx + ')">Edit</button>' +
          '<button class="btn-action btn-del" onclick="detDeleteComp(' + ucIdx + ',' + cIdx + ')">Delete</button>' +
        '</td></tr>';
    });
  });

  area.innerHTML = '<div class="uc-table-wrap"><table class="uc-table"><thead><tr>' +
    '<th class="col-num">#</th><th>Name</th><th>Type</th><th>Impl.</th>' +
    '<th>Tasks</th><th>Payload</th><th class="col-actions"></th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function detTypeTag(type) {
  if (!type) return '';
  if (type === 'API/Microservices') return '<span class="tag tag-api">API</span>';
  if (type === 'Event-Based')       return '<span class="tag tag-event">Event</span>';
  if (type === 'Schedule-Based')    return '<span class="tag tag-sched">Schedule</span>';
  return type;
}

// ── Render summary ──
function detRenderSummary() {
  var el = document.getElementById('detSummaryBody');
  if (detUseCases.length === 0) {
    el.innerHTML = '<div class="summary-empty">Add use cases and components to see sizing results.</div>';
    return;
  }

  var t   = detCalcTotals();
  var rec = recommendPackage({
    totalFlows:    t.flows.total,
    annualMsgMin:  t.msgs.total,
    annualMsgMax:  t.msgs.total,
    annualDataMin: t.data.total,
    annualDataMax: t.data.total
  });

  var omniRow = t.omni.total > 0
    ? '<tr><td>Omni Gateway API Calls</td>' +
        '<td class="col-metric">' + fmtM(t.omni.prod  / 1e6) + '</td>' +
        '<td class="col-metric">' + fmtM(t.omni.np    / 1e6) + '</td>' +
        '<td class="col-metric">' + fmtM(t.omni.total / 1e6) + '</td></tr>'
    : '';

  el.innerHTML =
    '<div style="overflow-x:auto;margin-bottom:20px;">' +
    '<table class="uc-table">' +
      '<thead><tr><th>Metric</th><th class="col-metric">Production</th>' +
        '<th class="col-metric">Non-Prod</th><th class="col-metric">Total</th></tr></thead>' +
      '<tbody>' +
        '<tr><td>Flows</td>' +
          '<td class="col-metric">' + t.flows.prod  + '</td>' +
          '<td class="col-metric">' + t.flows.np    + '</td>' +
          '<td class="col-metric">' + t.flows.total + '</td></tr>' +
        '<tr><td>Messages / Year</td>' +
          '<td class="col-metric">' + fmtM(t.msgs.prod  / 1e6) + '</td>' +
          '<td class="col-metric">' + fmtM(t.msgs.np    / 1e6) + '</td>' +
          '<td class="col-metric">' + fmtM(t.msgs.total / 1e6) + '</td></tr>' +
        '<tr><td>Data Throughput / Year</td>' +
          '<td class="col-metric">' + fmtGB(t.data.prod)  + '</td>' +
          '<td class="col-metric">' + fmtGB(t.data.np)    + '</td>' +
          '<td class="col-metric">' + fmtGB(t.data.total) + '</td></tr>' +
        omniRow +
      '</tbody>' +
    '</table></div>' +
    '<div class="pkg-row">' +
      '<div class="pkg-badge ' + (rec.name === 'Advanced' ? 'advanced' : '') + '">' + rec.name + '</div>' +
      '<div class="pkg-details">' +
        '<div class="pkg-name">Integration ' + rec.name + ' Package</div>' +
        '<div class="pkg-price">' + fmtUSD(rec.totalListPrice) +
          ' <span style="font-size:0.85rem;font-weight:400;color:#888;">/ year (list price, USD)</span></div>' +
        '<div class="pkg-reason">' + rec.reasons.join(' &bull; ') + '</div>' +
      '</div>' +
    '</div>';
}

function detRefresh() {
  detRenderTable();
  detRenderSummary();
}

// ── Use case CRUD ──
function detOpenUCModal(idx) {
  detEditing.ucIdx = idx;
  var isNew = idx === -1;
  document.getElementById('detUCModalTitle').textContent = isNew ? 'Add Use Case' : 'Edit Use Case';
  document.getElementById('det-uc-name').value = isNew ? '' : (detUseCases[idx].name || '');
  document.getElementById('detUCModal').classList.add('open');
  document.getElementById('det-uc-name').focus();
}

function detCloseUCModal() {
  document.getElementById('detUCModal').classList.remove('open');
}

function detDeleteUC(idx) {
  detUseCases.splice(idx, 1);
  detRefresh();
}

// ── Component CRUD ──
function detAddComponent(ucIdx) {
  var uc       = detUseCases[ucIdx];
  var compName = (uc.name || 'Use Case ' + (ucIdx + 1)) + ' - Process API';
  detEditing   = { ucIdx: ucIdx, compIdx: -1 };
  detFillCompModal({ name: compName, intType: '', impl: 'MuleSoft', tasks: '', taskPeriod: 'Month',
                     bizHours: 8, bizDays: 220, payloadKB: 50, ha: false });
  document.getElementById('detCompModalTitle').textContent = 'Add Component';
  document.getElementById('detCompModal').classList.add('open');
}

function detOpenCompModal(ucIdx, cIdx) {
  detEditing = { ucIdx: ucIdx, compIdx: cIdx };
  var comp   = detUseCases[ucIdx].components[cIdx];
  detFillCompModal(comp);
  document.getElementById('detCompModalTitle').textContent = 'Edit Component';
  document.getElementById('detCompModal').classList.add('open');
}

function detFillCompModal(comp) {
  document.getElementById('dc-name').value      = comp.name       || '';
  document.getElementById('dc-intType').value   = comp.intType    || '';
  document.getElementById('dc-impl').value      = comp.impl       || 'MuleSoft';
  document.getElementById('dc-tasks').value     = comp.tasks      || '';
  document.getElementById('dc-taskPeriod').value= comp.taskPeriod || 'Month';
  document.getElementById('dc-bizHours').value  = comp.bizHours   !== undefined ? comp.bizHours  : 8;
  document.getElementById('dc-bizDays').value   = comp.bizDays    !== undefined ? comp.bizDays   : 220;
  document.getElementById('dc-payloadKB').value = comp.payloadKB  !== undefined ? comp.payloadKB : 50;
  document.getElementById('dc-ha').checked      = comp.ha || false;
}

function detReadCompModal() {
  return {
    name:       document.getElementById('dc-name').value.trim(),
    intType:    document.getElementById('dc-intType').value,
    impl:       document.getElementById('dc-impl').value,
    tasks:      document.getElementById('dc-tasks').value,
    taskPeriod: document.getElementById('dc-taskPeriod').value,
    bizHours:   parseFloat(document.getElementById('dc-bizHours').value)  || 8,
    bizDays:    parseFloat(document.getElementById('dc-bizDays').value)   || 220,
    payloadKB:  parseFloat(document.getElementById('dc-payloadKB').value) || 50,
    ha:         document.getElementById('dc-ha').checked
  };
}

function detCloseCompModal() {
  document.getElementById('detCompModal').classList.remove('open');
}

function detDeleteComp(ucIdx, cIdx) {
  detUseCases[ucIdx].components.splice(cIdx, 1);
  detRefresh();
}

// ── Init events ──
function detInitEvents() {
  // UC modal
  document.getElementById('detBtnAddUC').addEventListener('click', function() { detOpenUCModal(-1); });
  document.getElementById('detUCBtnClose').addEventListener('click',  detCloseUCModal);
  document.getElementById('detUCBtnCancel').addEventListener('click', detCloseUCModal);
  document.getElementById('detUCModal').addEventListener('click', function(e) {
    if (e.target === document.getElementById('detUCModal')) detCloseUCModal();
  });
  document.getElementById('detUCBtnSave').addEventListener('click', function() {
    var name = document.getElementById('det-uc-name').value.trim();
    var idx  = detEditing.ucIdx;
    if (idx === -1) {
      detUseCases.push({ name: name, components: [] });
    } else {
      detUseCases[idx].name = name;
    }
    detCloseUCModal();
    detRefresh();
  });

  // Component modal
  document.getElementById('detCompBtnClose').addEventListener('click',  detCloseCompModal);
  document.getElementById('detCompBtnCancel').addEventListener('click', detCloseCompModal);
  document.getElementById('detCompModal').addEventListener('click', function(e) {
    if (e.target === document.getElementById('detCompModal')) detCloseCompModal();
  });
  document.getElementById('detCompBtnSave').addEventListener('click', function() {
    var comp   = detReadCompModal();
    var ucIdx  = detEditing.ucIdx;
    var cIdx   = detEditing.compIdx;
    if (cIdx === -1) detUseCases[ucIdx].components.push(comp);
    else detUseCases[ucIdx].components[cIdx] = comp;
    detCloseCompModal();
    detRefresh();
  });

  // Env settings — refresh on any change
  ['det-prodEnvs','det-nonProdEnvs','det-haReplicas','det-flowsBuffer',
   'det-msgNonProdPct','det-msgBuffer','det-dataNonProdPct','det-dataBuffer',
   'det-omniNonProdPct','det-omniBuffer'].forEach(function(id) {
    document.getElementById(id).addEventListener('change', detRefresh);
  });

  // Copy from simplified button
  document.getElementById('detBtnCopySimp').addEventListener('click', function() {
    if (simpUseCases.length === 0) {
      alert('No use cases in Simplified to copy.');
      return;
    }
    if (detUseCases.length > 0) {
      var confirmed = confirm('This will replace your current Detailed use cases. Continue?');
      if (!confirmed) return;
    }
    detCopyFromSimplified();
  });
}
