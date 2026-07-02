// ============================================================
// UBP Detailed Sizing — UI Logic
// Depends on: ubp-data.js, ubp-calc.js
// ============================================================

// ── State ──
var detUseCases      = [];   // [{ name, components:[] }]
var detEditing       = { ucIdx: -1, compIdx: -1 };
var detConnectors    = [];   // [{ name, prodEnvs, nonProdEnvs }]
var detAddons        = {     // platform add-ons (quantities)
  partnerManager:    false,
  loadBalancer:      0,
  privateSpaceExtra: 0,
  networkConnExtra:  0,
  anypointMQpacks:   0,
  objectStorePacks:  0,
  aehAccessRequests: 0
};

// ── Environment settings (with defaults) ──
function detGetEnvSettings() {
  return {
    prodEnvs:           parseInt(document.getElementById('det-prodEnvs').value,           10) || 1,
    nonProdEnvs:        parseInt(document.getElementById('det-nonProdEnvs').value,         10) || 2,
    haReplicas:         parseInt(document.getElementById('det-haReplicas').value,           10) || 2,
    haNonProdEnvs:      parseInt(document.getElementById('det-haNonProdEnvs').value,        10) || 0,
    flowsBuffer:        parseFloat(document.getElementById('det-flowsBuffer').value)       / 100 || 0.10,
    msgNonProdPct:      parseFloat(document.getElementById('det-msgNonProdPct').value)     / 100 || 0.40,
    msgBuffer:          parseFloat(document.getElementById('det-msgBuffer').value)         / 100 || 0.05,
    dataNonProdPct:     parseFloat(document.getElementById('det-dataNonProdPct').value)    / 100 || 0.40,
    dataBuffer:         parseFloat(document.getElementById('det-dataBuffer').value)        / 100 || 0.05,
    omniNonProdPct:     parseFloat(document.getElementById('det-omniNonProdPct').value)    / 100 || 0.20,
    omniBuffer:         parseFloat(document.getElementById('det-omniBuffer').value)        / 100 || 0.10,
  };
}

// ── Bucket → midpoint conversions for copy-from-simplified ──
var TASKS_BUCKET_MAP = {
  '0-10K':     5000,
  '10K-100K':  55000,
  '100K-500K': 300000,
  '500K-10M':  5000000
};

var PAYLOAD_BUCKET_MAP = {
  '0-100KB':     50,
  '101KB-500KB': 300,
  '501KB-1MB':   750,
  '1MB-10MB':    5000,
  '10MB+':       50000
};

// ── Copy from Simplified ──
function detCopyFromSimplified() {
  if (simpUseCases.length === 0) return;
  detUseCases = simpUseCases.map(function(uc) {
    var compName  = (uc.name || 'Use Case') + ' - Process API';
    var baseTasks = TASKS_BUCKET_MAP[uc.tasks]    || 5000;
    var payloadKB = PAYLOAD_BUCKET_MAP[uc.payload] || 50;
    var tasks     = uc.bidir ? baseTasks * 2 : baseTasks;
    var comp = {
      name:         compName,
      intType:      uc.intType,
      impl:         'MuleSoft',
      tasks:        tasks,
      taskPeriod:   'Month',
      bizHours:     8,
      bizDays:      220,
      payloadKB:    payloadKB,
      ha:           false,
      operations:   4,
      apiConsole:   1,
      httpListener: 1,
      queues:       1,
      entities:     1,
      schedBidir:   (uc.intType === 'Schedule-Based' && uc.bidir) ? true : false
    };
    return { name: uc.name || '', components: [comp] };
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

// ── Calculate one component's messages & data ──
function detCalcComponent(comp) {
  if (!comp.tasks || isNaN(parseFloat(comp.tasks))) return null;
  var tasks       = parseFloat(comp.tasks);
  var annualTasks = tasks * detAnnualMultiplier(comp.taskPeriod, comp.bizHours, comp.bizDays);
  var msgs        = annualTasks;
  var dataGB      = (msgs * comp.payloadKB * 2) / 1048576;
  return { msgs: msgs, dataGB: dataGB, isMuleSoft: comp.impl === 'MuleSoft', ha: comp.ha };
}

// ── Calculate flows for a single component ──
function detCompFlows(comp) {
  if (comp.impl !== 'MuleSoft') return 0;
  if (comp.intType === 'API/Microservices') {
    return (comp.operations  !== undefined ? comp.operations  : 4) +
           (comp.apiConsole  !== undefined ? comp.apiConsole  : 1) +
           (comp.httpListener !== undefined ? comp.httpListener : 1);
  }
  if (comp.intType === 'Event-Based') {
    return comp.queues !== undefined ? comp.queues : 1;
  }
  if (comp.intType === 'Schedule-Based') {
    return (comp.entities !== undefined ? comp.entities : 1) * (comp.schedBidir ? 2 : 1);
  }
  return 0;
}

// ── Calculate flows for a use case (sum of components) ──
function detCalcFlows(uc, haReplicas) {
  var total = 0, haFlows = 0;
  uc.components.forEach(function(comp) {
    var f = detCompFlows(comp);
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
  var apiMSCount = 0, anyHA = false;

  detUseCases.forEach(function(uc) {
    var f = detCalcFlows(uc, env.haReplicas);
    // Prod: all HA-replicated flows × prod env count
    flowsProd    += f.withHA * env.prodEnvs;
    // Non-prod: HA only applied to the subset of non-prod envs configured for HA
    var npHAFlows   = f.base + (f.withHA - f.base) * (env.haNonProdEnvs > 0 ? 1 : 0);
    flowsNonProd += npHAFlows * env.nonProdEnvs;

    uc.components.forEach(function(comp) {
      if (comp.ha) anyHA = true;
      var r = detCalcComponent(comp);
      if (!r) return;
      if (comp.impl === 'MuleSoft') {
        baseMsgs   += r.msgs;
        baseDataGB += r.dataGB;
        if (comp.intType === 'API/Microservices') apiMSCount++;
      } else {
        baseOmniMsgs += r.msgs;
      }
    });
  });

  var flowsBuf  = 1 + env.flowsBuffer;
  var prodFlows = Math.ceil(flowsProd    * flowsBuf);
  var npFlows   = Math.ceil(flowsNonProd * flowsBuf);

  var msgProd   = Math.ceil(baseMsgs   * env.prodEnvs   * (1 + env.msgBuffer));
  var msgNP     = Math.ceil(baseMsgs   * env.nonProdEnvs * env.msgNonProdPct * (1 + env.msgBuffer));

  var dataProd  = baseDataGB * env.prodEnvs   * (1 + env.dataBuffer);
  var dataNP    = baseDataGB * env.nonProdEnvs * env.dataNonProdPct * (1 + env.dataBuffer);

  var omniProd  = Math.ceil(baseOmniMsgs * env.prodEnvs   * (1 + env.omniBuffer));
  var omniNP    = Math.ceil(baseOmniMsgs * env.nonProdEnvs * env.omniNonProdPct * (1 + env.omniBuffer));

  var apiMgmtProd    = apiMSCount * env.prodEnvs;
  var apiMgmtNonProd = apiMSCount * env.nonProdEnvs;

  return {
    flows:   { prod: prodFlows, np: npFlows,   total: prodFlows + npFlows },
    msgs:    { prod: msgProd,   np: msgNP,      total: msgProd   + msgNP   },
    data:    { prod: dataProd,  np: dataNP,     total: dataProd  + dataNP  },
    omni:    { prod: omniProd,  np: omniNP,     total: omniProd  + omniNP  },
    apiMgmt: { manageProd: apiMgmtProd, manageNonProd: apiMgmtNonProd, govern: apiMgmtProd },
    needsHA: anyHA
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
    rows += '<tr class="det-uc-row">' +
      '<td class="col-num">' + (ucIdx + 1) + '</td>' +
      '<td colspan="6" style="font-weight:700;color:#0070ad;">' +
        (uc.name || 'Use Case ' + (ucIdx + 1)) + '</td>' +
      '<td class="col-actions">' +
        '<button class="btn-action" onclick="detOpenUCModal(' + ucIdx + ')">Edit</button>' +
        '<button class="btn-action" onclick="detAddComponent(' + ucIdx + ')">+ Component</button>' +
        '<button class="btn-action btn-del" onclick="detDeleteUC(' + ucIdx + ')">Delete</button>' +
      '</td></tr>';

    uc.components.forEach(function(comp, cIdx) {
      var implTag  = comp.impl === 'MuleSoft'
        ? '<span class="tag tag-api">MuleSoft</span>'
        : '<span class="tag tag-event">Omni GW</span>';
      var haTag    = comp.ha ? '<span class="tag tag-bidir">HA</span>' : '';
      var taskStr  = comp.tasks ? comp.tasks + ' / ' + comp.taskPeriod : '—';
      var flowsVal = detCompFlows(comp);
      var flowsStr = (comp.impl === 'MuleSoft' && comp.intType) ? String(flowsVal) : '—';
      rows += '<tr class="det-comp-row">' +
        '<td class="col-num" style="color:#ddd;">&#8627;</td>' +
        '<td class="col-name" style="padding-left:24px;">' + (comp.name || 'Component') + '</td>' +
        '<td>' + detTypeTag(comp.intType) + haTag + '</td>' +
        '<td>' + implTag + '</td>' +
        '<td style="text-align:right;font-weight:600;color:#0070ad;">' + flowsStr + '</td>' +
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
    '<th style="text-align:right;min-width:60px;">Flows</th>' +
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
    annualDataMax: t.data.total,
    needsHA:       t.needsHA,
    apiMgmt:       t.apiMgmt
  });

  var omniRow = t.omni.total > 0
    ? '<tr><td>Omni Gateway API Calls / yr</td>' +
        '<td class="col-metric">' + fmtM(t.omni.prod  / 1e6) + '</td>' +
        '<td class="col-metric">' + fmtM(t.omni.np    / 1e6) + '</td>' +
        '<td class="col-metric">' + fmtM(t.omni.total / 1e6) + '</td></tr>'
    : '';

  var apiMgmtSection = '';
  if (t.apiMgmt.manageProd > 0) {
    apiMgmtSection =
      '<div style="font-weight:700;font-size:0.82rem;color:#0070ad;text-transform:uppercase;' +
        'letter-spacing:0.04em;margin:16px 0 8px;">API Management Totals</div>' +
      '<div style="overflow-x:auto;margin-bottom:20px;">' +
      '<table class="uc-table">' +
        '<thead><tr><th>Metric</th><th class="col-metric">Production</th>' +
          '<th class="col-metric">Non-Prod</th><th class="col-metric">Total</th></tr></thead>' +
        '<tbody>' +
          '<tr><td>APIs to Manage</td>' +
            '<td class="col-metric">' + t.apiMgmt.manageProd    + '</td>' +
            '<td class="col-metric">' + t.apiMgmt.manageNonProd + '</td>' +
            '<td class="col-metric">' + (t.apiMgmt.manageProd + t.apiMgmt.manageNonProd) + '</td></tr>' +
          '<tr><td>APIs to Govern</td>' +
            '<td class="col-metric">' + t.apiMgmt.govern + '</td>' +
            '<td class="col-metric" style="color:#bbb;">—</td>' +
            '<td class="col-metric">' + t.apiMgmt.govern + '</td></tr>' +
        '</tbody>' +
      '</table></div>';
  }

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
    apiMgmtSection +
    pkgBreakdownHtml(rec, t.flows.total, t.msgs.total / 1e6, t.data.total) +
    detAddonSummaryHtml(rec.name) +
    (detAddonTotal(rec.name) > 0
      ? '<div style="background:#e8f4fb;border-radius:6px;padding:14px 16px;display:flex;' +
          'justify-content:space-between;align-items:center;margin-top:8px;border:1px solid #b3d9f0;">' +
          '<span style="font-weight:700;font-size:1rem;color:#0070ad;">Grand Total (list price)</span>' +
          '<span style="font-weight:700;font-size:1.2rem;color:#0070ad;">' +
            fmtUSD(rec.totalListPrice + detAddonTotal(rec.name)) + ' / year</span>' +
        '</div>'
      : '');
}

// ── Premium Connectors — render section ──
function detRenderConnectors() {
  var el = document.getElementById('detConnectorArea');
  if (!el) return;

  if (detConnectors.length === 0) {
    el.innerHTML = '<div style="color:#bbb;font-size:0.85rem;padding:8px 0;">No premium connectors added.</div>';
    return;
  }

  var rows = detConnectors.map(function(c, i) {
    var cost = (c.prodEnvs + c.nonProdEnvs) * PREMIUM_CONNECTOR_PRICE;
    // find connector note
    var match = PREMIUM_CONNECTORS.filter(function(p) { return p.name === c.name; })[0];
    var noteBtn = (match && match.note)
      ? ' <button class="btn-conn-note" onclick="detShowConnNote(' + i + ')" title="' +
          match.note.replace(/"/g, '&quot;') + '">&#9432;</button>'
      : '';
    return '<tr>' +
      '<td>' + c.name + noteBtn + '</td>' +
      '<td><input type="number" class="conn-env-input" value="' + c.prodEnvs + '" min="0" max="20" ' +
        'onchange="detConnectors[' + i + '].prodEnvs=parseInt(this.value)||0;detRefresh();" /></td>' +
      '<td><input type="number" class="conn-env-input" value="' + c.nonProdEnvs + '" min="0" max="20" ' +
        'onchange="detConnectors[' + i + '].nonProdEnvs=parseInt(this.value)||0;detRefresh();" /></td>' +
      '<td style="text-align:right;font-weight:600;color:#0070ad;">' + fmtUSD(cost) + '</td>' +
      '<td style="text-align:right;">' +
        '<button class="btn-action btn-del" onclick="detDeleteConnector(' + i + ')">Remove</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  var total = detConnectors.reduce(function(s, c) {
    return s + (c.prodEnvs + c.nonProdEnvs) * PREMIUM_CONNECTOR_PRICE;
  }, 0);

  el.innerHTML =
    '<table class="uc-table" style="font-size:0.83rem;">' +
      '<thead><tr>' +
        '<th>Connector</th>' +
        '<th style="min-width:90px;">Prod Envs</th>' +
        '<th style="min-width:90px;">Non-Prod Envs</th>' +
        '<th style="text-align:right;min-width:100px;">Cost / yr</th>' +
        '<th></th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
      '<tfoot><tr>' +
        '<td colspan="3" style="font-weight:700;text-align:right;padding:10px 14px;">Total add-on cost</td>' +
        '<td style="text-align:right;font-weight:700;color:#0070ad;padding:10px 14px;">' + fmtUSD(total) + '</td>' +
        '<td></td>' +
      '</tr></tfoot>' +
    '</table>';
}

// ── Calculate total add-on cost (connectors + platform) ──
function detAddonTotal(pkgName) {
  var connTotal = detConnectors.reduce(function(s, c) {
    return s + (c.prodEnvs + c.nonProdEnvs) * PREMIUM_CONNECTOR_PRICE;
  }, 0);
  var pkg = PACKAGES[pkgName];
  var a   = detAddons;
  var platformTotal =
    (a.partnerManager    ? ADDON_PRICES.partnerManager                              : 0) +
    (a.loadBalancer      > 0 ? a.loadBalancer      * ADDON_PRICES.loadBalancer      : 0) +
    (a.privateSpaceExtra > 0 ? a.privateSpaceExtra * ADDON_PRICES.privateSpace      : 0) +
    (a.networkConnExtra  > 0 ? a.networkConnExtra  * ADDON_PRICES.networkConnection : 0) +
    (a.anypointMQpacks   > 0 ? a.anypointMQpacks   * ADDON_PRICES.anypointMQ500M   : 0) +
    (a.objectStorePacks  > 0 ? a.objectStorePacks  * ADDON_PRICES.objectStore100M  : 0) +
    (a.aehAccessRequests > 0 ? a.aehAccessRequests * ADDON_PRICES.aehAccessRequests : 0);
  return connTotal + platformTotal;
}

// ── Render add-on summary in output ──
function detAddonSummaryHtml(pkgName) {
  var pkg  = PACKAGES[pkgName];
  var a    = detAddons;
  var rows = [];

  // Premium connectors
  detConnectors.forEach(function(c) {
    var cost = (c.prodEnvs + c.nonProdEnvs) * PREMIUM_CONNECTOR_PRICE;
    rows.push({ label: c.name, detail: c.prodEnvs + ' Prod + ' + c.nonProdEnvs + ' Non-Prod envs', cost: cost });
  });

  // Platform add-ons
  if (a.partnerManager)
    rows.push({ label: 'Partner Manager', detail: 'flat', cost: ADDON_PRICES.partnerManager });
  if (a.loadBalancer > 0)
    rows.push({ label: 'Load Balancer', detail: a.loadBalancer + ' unit(s)', cost: a.loadBalancer * ADDON_PRICES.loadBalancer });
  if (a.privateSpaceExtra > 0)
    rows.push({ label: 'Private Space (additional)', detail: a.privateSpaceExtra + ' beyond ' + pkg.privateSpaces + ' included', cost: a.privateSpaceExtra * ADDON_PRICES.privateSpace });
  if (a.networkConnExtra > 0)
    rows.push({ label: 'Network Connection (additional)', detail: a.networkConnExtra + ' beyond ' + pkg.networkConnections + ' included', cost: a.networkConnExtra * ADDON_PRICES.networkConnection });
  if (a.anypointMQpacks > 0)
    rows.push({ label: 'Anypoint MQ', detail: a.anypointMQpacks + ' × 500M pack(s)', cost: a.anypointMQpacks * ADDON_PRICES.anypointMQ500M });
  if (a.objectStorePacks > 0)
    rows.push({ label: 'Object Store', detail: a.objectStorePacks + ' × 100M/month pack(s)', cost: a.objectStorePacks * ADDON_PRICES.objectStore100M });
  if (a.aehAccessRequests > 0)
    rows.push({ label: 'API Experience Hub', detail: a.aehAccessRequests + ' access request(s)', cost: a.aehAccessRequests * ADDON_PRICES.aehAccessRequests });

  if (rows.length === 0) return '';

  var rowsHtml = rows.map(function(r) {
    return '<tr><td>' + r.label + '</td>' +
      '<td class="col-metric" style="color:#666;">' + r.detail + '</td>' +
      '<td class="col-metric">' + fmtUSD(r.cost) + '</td></tr>';
  }).join('');

  var subtotal = rows.reduce(function(s, r) { return s + r.cost; }, 0);

  return '<div style="font-weight:700;font-size:0.82rem;color:#0070ad;text-transform:uppercase;' +
    'letter-spacing:0.04em;margin:16px 0 8px;">Add-on Products</div>' +
    '<div style="overflow-x:auto;margin-bottom:16px;">' +
    '<table class="uc-table" style="font-size:0.83rem;">' +
      '<thead><tr><th>Add-on</th><th class="col-metric">Quantity</th>' +
        '<th class="col-metric">List Price / yr</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody>' +
      '<tfoot><tr>' +
        '<td colspan="2" style="font-weight:700;text-align:right;padding:10px 14px;">Add-on subtotal</td>' +
        '<td class="col-metric" style="font-weight:700;">' + fmtUSD(subtotal) + '</td>' +
      '</tr></tfoot>' +
    '</table></div>';
}

function detShowConnNote(idx) {
  var match = PREMIUM_CONNECTORS.filter(function(p) { return p.name === detConnectors[idx].name; })[0];
  if (match && match.note) alert(match.note);
}

function detAddConnector() {
  var sel = document.getElementById('det-conn-select');
  var name = sel.value;
  if (!name) return;
  // prevent duplicates
  var exists = detConnectors.some(function(c) { return c.name === name; });
  if (exists) { alert('This connector is already added.'); return; }
  detConnectors.push({ name: name, prodEnvs: 1, nonProdEnvs: 1 });
  sel.value = '';
  detRefresh();
}

function detDeleteConnector(idx) {
  detConnectors.splice(idx, 1);
  detRefresh();
}

function detRefresh() {
  detRenderTable();
  detRenderConnectors();
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
  detFillCompModal({
    name: compName, intType: '', impl: 'MuleSoft',
    tasks: '', taskPeriod: 'Month', bizHours: 8, bizDays: 220, payloadKB: 50, ha: false,
    operations: 4, apiConsole: 1, httpListener: 1, queues: 1, entities: 1, schedBidir: false
  });
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
  document.getElementById('dc-name').value         = comp.name         || '';
  document.getElementById('dc-intType').value      = comp.intType      || '';
  document.getElementById('dc-impl').value         = comp.impl         || 'MuleSoft';
  document.getElementById('dc-tasks').value        = comp.tasks        || '';
  document.getElementById('dc-taskPeriod').value   = comp.taskPeriod   || 'Month';
  document.getElementById('dc-bizHours').value     = comp.bizHours     !== undefined ? comp.bizHours     : 8;
  document.getElementById('dc-bizDays').value      = comp.bizDays      !== undefined ? comp.bizDays      : 220;
  document.getElementById('dc-payloadKB').value    = comp.payloadKB    !== undefined ? comp.payloadKB    : 50;
  document.getElementById('dc-ha').checked         = comp.ha || false;
  document.getElementById('dc-operations').value   = comp.operations   !== undefined ? comp.operations   : 4;
  document.getElementById('dc-apiConsole').value   = comp.apiConsole   !== undefined ? comp.apiConsole   : 1;
  document.getElementById('dc-httpListener').value = comp.httpListener  !== undefined ? comp.httpListener  : 1;
  document.getElementById('dc-queues').value       = comp.queues       !== undefined ? comp.queues       : 1;
  document.getElementById('dc-entities').value     = comp.entities     !== undefined ? comp.entities     : 1;
  document.getElementById('dc-schedBidir').checked = comp.schedBidir || false;
  detUpdateCompFlowDetail();
  detUpdateCompPreview();
}

function detReadCompModal() {
  return {
    name:         document.getElementById('dc-name').value.trim(),
    intType:      document.getElementById('dc-intType').value,
    impl:         document.getElementById('dc-impl').value,
    tasks:        document.getElementById('dc-tasks').value,
    taskPeriod:   document.getElementById('dc-taskPeriod').value,
    bizHours:     parseFloat(document.getElementById('dc-bizHours').value)    || 8,
    bizDays:      parseFloat(document.getElementById('dc-bizDays').value)     || 220,
    payloadKB:    parseFloat(document.getElementById('dc-payloadKB').value)   || 50,
    ha:           document.getElementById('dc-ha').checked,
    operations:   parseInt(document.getElementById('dc-operations').value,   10) || 4,
    apiConsole:   parseInt(document.getElementById('dc-apiConsole').value,   10) || 1,
    httpListener: parseInt(document.getElementById('dc-httpListener').value,  10) || 1,
    queues:       parseInt(document.getElementById('dc-queues').value,       10) || 1,
    entities:     parseInt(document.getElementById('dc-entities').value,     10) || 1,
    schedBidir:   document.getElementById('dc-schedBidir').checked
  };
}

// ── Show / hide conditional flow-detail fields ──
function detUpdateCompFlowDetail() {
  var type = document.getElementById('dc-intType').value;
  document.getElementById('dc-flow-api').style.display   = (type === 'API/Microservices') ? '' : 'none';
  document.getElementById('dc-flow-event').style.display = (type === 'Event-Based')        ? '' : 'none';
  document.getElementById('dc-flow-sched').style.display = (type === 'Schedule-Based')     ? '' : 'none';
  detUpdateCompPreview();
}

// ── Live preview in component modal ──
function detUpdateCompPreview() {
  var el = document.getElementById('detCompPreview');
  if (!el) return;
  var intType = document.getElementById('dc-intType').value;
  var impl    = document.getElementById('dc-impl').value;
  var html    = '';

  if (impl === 'MuleSoft' && intType) {
    var f = 0;
    if (intType === 'API/Microservices') {
      f = (parseInt(document.getElementById('dc-operations').value,   10) || 4) +
          (parseInt(document.getElementById('dc-apiConsole').value,   10) || 1) +
          (parseInt(document.getElementById('dc-httpListener').value, 10) || 1);
    } else if (intType === 'Event-Based') {
      f = parseInt(document.getElementById('dc-queues').value, 10) || 1;
    } else if (intType === 'Schedule-Based') {
      f = (parseInt(document.getElementById('dc-entities').value, 10) || 1) *
          (document.getElementById('dc-schedBidir').checked ? 2 : 1);
    }
    html += '<div class="prev-row"><span>Flows (this component)</span><span>' + f + '</span></div>';
  }

  var tasks   = parseFloat(document.getElementById('dc-tasks').value);
  var period  = document.getElementById('dc-taskPeriod').value;
  var bh      = parseFloat(document.getElementById('dc-bizHours').value)  || 8;
  var bd      = parseFloat(document.getElementById('dc-bizDays').value)   || 220;
  var payload = parseFloat(document.getElementById('dc-payloadKB').value) || 50;

  if (tasks && !isNaN(tasks)) {
    var comp = { tasks: tasks, taskPeriod: period, bizHours: bh, bizDays: bd,
                 payloadKB: payload, impl: impl, ha: false };
    var r = detCalcComponent(comp);
    if (r) {
      html += '<div class="prev-row"><span>Messages / year</span><span>' + fmtM(r.msgs / 1e6) + '</span></div>';
      html += '<div class="prev-row"><span>Data / year</span><span>' + fmtGB(r.dataGB) + '</span></div>';
    }
  }

  if (!html) html = '<div class="prev-placeholder">Complete the inputs to see the estimate</div>';
  el.innerHTML = html;
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

  // Component modal — close / save
  document.getElementById('detCompBtnClose').addEventListener('click',  detCloseCompModal);
  document.getElementById('detCompBtnCancel').addEventListener('click', detCloseCompModal);
  document.getElementById('detCompModal').addEventListener('click', function(e) {
    if (e.target === document.getElementById('detCompModal')) detCloseCompModal();
  });
  document.getElementById('detCompBtnSave').addEventListener('click', function() {
    var comp  = detReadCompModal();
    var ucIdx = detEditing.ucIdx;
    var cIdx  = detEditing.compIdx;
    if (cIdx === -1) detUseCases[ucIdx].components.push(comp);
    else detUseCases[ucIdx].components[cIdx] = comp;
    detCloseCompModal();
    detRefresh();
  });

  // Flow-detail visibility driven by type selection
  document.getElementById('dc-intType').addEventListener('change', detUpdateCompFlowDetail);

  // Live preview — all inputs that affect the estimate
  ['dc-intType','dc-impl',
   'dc-operations','dc-apiConsole','dc-httpListener',
   'dc-queues',
   'dc-entities','dc-schedBidir',
   'dc-tasks','dc-taskPeriod','dc-bizHours','dc-bizDays','dc-payloadKB'].forEach(function(id) {
    document.getElementById(id).addEventListener('change', detUpdateCompPreview);
    document.getElementById(id).addEventListener('input',  detUpdateCompPreview);
  });

  // Env settings — refresh on any change
  ['det-prodEnvs','det-nonProdEnvs','det-haReplicas','det-haNonProdEnvs','det-flowsBuffer',
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

  // Premium connector add button
  document.getElementById('detBtnAddConn').addEventListener('click', detAddConnector);

  // Premium connector info modal
  document.getElementById('detBtnConnInfo').addEventListener('click', function() {
    document.getElementById('connInfoModal').classList.add('open');
  });
  document.getElementById('connInfoClose').addEventListener('click', function() {
    document.getElementById('connInfoModal').classList.remove('open');
  });
  document.getElementById('connInfoDone').addEventListener('click', function() {
    document.getElementById('connInfoModal').classList.remove('open');
  });
  document.getElementById('connInfoModal').addEventListener('click', function(e) {
    if (e.target === document.getElementById('connInfoModal'))
      document.getElementById('connInfoModal').classList.remove('open');
  });
}
