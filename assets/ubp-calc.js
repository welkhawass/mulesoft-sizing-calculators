// ============================================================
// UBP Simplified Sizing — Calculation Engine
// Depends on: ubp-data.js
// ============================================================

function calcRow(row, numEnvs, reusabilityKey) {
  var intType    = row.intType;
  var systems    = row.systems;
  var bidir      = row.bidir;
  var bizObjects = row.bizObjects;
  var tasks      = row.tasks;
  var payload    = row.payload;

  if (!intType || !systems || !bizObjects || !tasks || !payload) return null;

  var reductionFactor  = REUSABILITY_TABLE[reusabilityKey] || 0;
  var biDirMultiplier  = bidir ? 2 : 1;

  // --- Flows ---
  var tshirt = TSHIRT_MATRIX[systems] && TSHIRT_MATRIX[systems][bizObjects];
  if (!tshirt) return null;
  var flows = (FLOW_COUNTS[intType] && FLOW_COUNTS[intType][tshirt]) || 0;

  // --- Messages (use non-linear env multiplier) ---
  var taskRange = TASK_RANGES[tasks];
  if (!taskRange) return null;
  var envMult = ENV_MULTIPLIERS[numEnvs] || numEnvs; // fallback to raw count if out of range
  var msgMin = Math.round(taskRange.min * biDirMultiplier * (1 - reductionFactor) * envMult);
  var msgMax = Math.round(taskRange.max * biDirMultiplier * (1 - reductionFactor) * envMult);

  // --- Data throughput (GB) ---
  // factor: bidir=4 (2 directions × 2 transforms), unidir=2
  var dataMult     = bidir ? 4 : 2;
  var payloadRange = PAYLOAD_RANGES[payload];
  if (!payloadRange) return null;
  var dataMinGB = (msgMin * payloadRange.min) / 1048576 * dataMult;
  var dataMaxGB = (msgMax * payloadRange.max) / 1048576 * dataMult;

  return { flows: flows, msgMin: msgMin, msgMax: msgMax, dataMinGB: dataMinGB, dataMaxGB: dataMaxGB };
}

function calcTotals(rowResults) {
  var totalFlows = 0, totalMsgMin = 0, totalMsgMax = 0;
  var totalDataMin = 0, totalDataMax = 0;

  for (var i = 0; i < rowResults.length; i++) {
    var r = rowResults[i];
    if (!r) continue;
    totalFlows   += r.flows;
    totalMsgMin  += r.msgMin;
    totalMsgMax  += r.msgMax;
    totalDataMin += r.dataMinGB;
    totalDataMax += r.dataMaxGB;
  }

  // Annualise (row calc returns monthly)
  var annualMsgMin  = totalMsgMin  * 12;
  var annualMsgMax  = totalMsgMax  * 12;
  var annualDataMin = totalDataMin * 12;
  var annualDataMax = totalDataMax * 12;

  return { totalFlows: totalFlows, annualMsgMin: annualMsgMin, annualMsgMax: annualMsgMax,
           annualDataMin: annualDataMin, annualDataMax: annualDataMax };
}

function recommendPackage(totals) {
  var totalFlows    = totals.totalFlows;
  var annualMsgMinM = totals.annualMsgMin / 1e6;
  var annualDataMin = totals.annualDataMin;
  var needsHA       = totals.needsHA || false;

  var needsAdvanced =
    needsHA                                        ||
    totalFlows    > PACKAGES.Starter.flows         ||
    annualMsgMinM > PACKAGES.Starter.messagesM     ||
    annualDataMin > PACKAGES.Starter.dataGB;

  var pkg  = needsAdvanced ? PACKAGES.Advanced : PACKAGES.Starter;
  var name = needsAdvanced ? 'Advanced' : 'Starter';

  var reasons = [];
  if (needsAdvanced) {
    if (needsHA)                                       reasons.push('HA required (Advanced only)');
    if (totalFlows    > PACKAGES.Starter.flows)        reasons.push(totalFlows + ' flows > ' + PACKAGES.Starter.flows + ' included');
    if (annualMsgMinM > PACKAGES.Starter.messagesM)    reasons.push(fmtM(annualMsgMinM) + ' msgs > ' + PACKAGES.Starter.messagesM + 'M included');
    if (annualDataMin > PACKAGES.Starter.dataGB)       reasons.push(fmtGB(annualDataMin) + ' data > ' + fmtGB(PACKAGES.Starter.dataGB) + ' included');
  } else {
    reasons.push('within Starter limits');
  }

  // Extra flows — flat rate per unit
  var extraFlows    = Math.max(0, totalFlows - pkg.flows);
  var extraFlowCost = extraFlows * pkg.extraFlowRate;

  // Extra messages — flat rate per 1M pack
  var extraMsgM    = Math.max(0, annualMsgMinM - pkg.messagesM);
  var extraMsgCost = extraMsgM * pkg.extraMsgRatePerM;

  // Extra data
  var extraDataGB   = Math.max(0, annualDataMin - pkg.dataGB);
  var extraDataCost = extraDataGB * DATA_PRICE_PER_GB;

  // API Management overages (only when caller provides apiMgmt counts)
  var apiMgmt = totals.apiMgmt || null;
  var extraManagedProd    = apiMgmt ? Math.max(0, apiMgmt.manageProd    - pkg.managedApisProd)    : 0;
  var extraManagedNonProd = apiMgmt ? Math.max(0, apiMgmt.manageNonProd - pkg.managedApisNonProd) : 0;
  var extraGoverned       = apiMgmt ? Math.max(0, apiMgmt.govern        - pkg.governedApis)       : 0;
  var apiMgmtCost = (extraManagedProd + extraManagedNonProd) * API_MGMT_PRICES.managedApiPerEnv
                  + extraGoverned * API_MGMT_PRICES.governedApi;

  var totalListPrice = pkg.listPrice + extraFlowCost + extraMsgCost + extraDataCost + apiMgmtCost;

  return { name: name, pkg: pkg, reasons: reasons,
           extraFlows: extraFlows, extraMsgM: extraMsgM, extraDataGB: extraDataGB,
           extraManagedProd: extraManagedProd, extraManagedNonProd: extraManagedNonProd,
           extraGoverned: extraGoverned, apiMgmtCost: apiMgmtCost,
           totalListPrice: totalListPrice };
}

// ---- Package breakdown card (shared by Simplified + Detailed) ----
// rec        = result of recommendPackage()
// totalFlows = number
// msgM       = annual messages in millions
// dataGB     = annual data in GB
function pkgBreakdownHtml(rec, totalFlows, msgM, dataGB) {
  var pkg = rec.pkg;

  function statusIcon(used, included) {
    return used <= included
      ? '<span style="color:#2e7d32;font-weight:700;">&#10003;</span>'
      : '<span style="color:#c62828;font-weight:700;">&#43;</span>';
  }

  function extraCell(extra, fmt) {
    if (extra <= 0) return '<td class="col-metric" style="color:#bbb;">—</td>';
    return '<td class="col-metric" style="color:#c62828;font-weight:700;">' + fmt + '</td>';
  }

  var omniIncluded = fmtM(pkg.omniCallsM);

  var apiMgmtRows = '';
  if (rec.extraManagedProd > 0 || rec.extraManagedNonProd > 0 || rec.extraGoverned > 0) {
    if (rec.extraManagedProd > 0 || rec.extraManagedNonProd > 0) {
      var totalManagedRequired = (rec.extraManagedProd > 0 ? pkg.managedApisProd + rec.extraManagedProd : pkg.managedApisProd);
      var totalManagedNPRequired = (rec.extraManagedNonProd > 0 ? pkg.managedApisNonProd + rec.extraManagedNonProd : pkg.managedApisNonProd);
      apiMgmtRows +=
        '<tr>' +
          '<td>APIs to Manage (prod)</td>' +
          '<td class="col-metric">' + statusIcon(totalManagedRequired, pkg.managedApisProd) + ' ' + totalManagedRequired + '</td>' +
          '<td class="col-metric">' + pkg.managedApisProd + '</td>' +
          extraCell(rec.extraManagedProd, rec.extraManagedProd + ' APIs') +
        '</tr>' +
        '<tr>' +
          '<td>APIs to Manage (non-prod)</td>' +
          '<td class="col-metric">' + statusIcon(totalManagedNPRequired, pkg.managedApisNonProd) + ' ' + totalManagedNPRequired + '</td>' +
          '<td class="col-metric">' + pkg.managedApisNonProd + '</td>' +
          extraCell(rec.extraManagedNonProd, rec.extraManagedNonProd + ' APIs') +
        '</tr>';
    }
    if (rec.extraGoverned > 0) {
      var totalGoverned = pkg.governedApis + rec.extraGoverned;
      apiMgmtRows +=
        '<tr>' +
          '<td>APIs to Govern (prod)</td>' +
          '<td class="col-metric">' + statusIcon(totalGoverned, pkg.governedApis) + ' ' + totalGoverned + '</td>' +
          '<td class="col-metric">' + pkg.governedApis + '</td>' +
          extraCell(rec.extraGoverned, rec.extraGoverned + ' APIs') +
        '</tr>';
    }
  }

  return '<div class="pkg-row" style="overflow-x:auto;">' +
    '<div class="pkg-badge ' + (rec.name === 'Advanced' ? 'advanced' : '') + '">' + rec.name + '</div>' +
    '<div class="pkg-details" style="flex:1;min-width:0;">' +
      '<div class="pkg-name">Integration ' + rec.name + ' Package</div>' +
      '<div class="pkg-price">' + fmtUSD(rec.totalListPrice) +
        ' <span style="font-size:0.85rem;font-weight:400;color:#888;">/ year (list price, USD)</span></div>' +
      '<div class="pkg-reason" style="margin-bottom:12px;">' + rec.reasons.join(' &bull; ') + '</div>' +
      '<div style="overflow-x:auto;">' +
      '<table class="uc-table" style="font-size:0.82rem;">' +
        '<thead><tr>' +
          '<th>Metric</th>' +
          '<th class="col-metric">Required</th>' +
          '<th class="col-metric">Included</th>' +
          '<th class="col-metric">Additional needed</th>' +
        '</tr></thead>' +
        '<tbody>' +
          '<tr>' +
            '<td>Flows</td>' +
            '<td class="col-metric">' + statusIcon(totalFlows, pkg.flows) + ' ' + totalFlows + '</td>' +
            '<td class="col-metric">' + pkg.flows + '</td>' +
            extraCell(rec.extraFlows, rec.extraFlows + ' flows') +
          '</tr>' +
          '<tr>' +
            '<td>Messages / year</td>' +
            '<td class="col-metric">' + statusIcon(msgM, pkg.messagesM) + ' ' + fmtM(msgM) + '</td>' +
            '<td class="col-metric">' + pkg.messagesM + 'M</td>' +
            extraCell(rec.extraMsgM, fmtM(rec.extraMsgM) + ' msgs') +
          '</tr>' +
          '<tr>' +
            '<td>Data throughput / year</td>' +
            '<td class="col-metric">' + statusIcon(dataGB, pkg.dataGB) + ' ' + fmtGB(dataGB) + '</td>' +
            '<td class="col-metric">' + fmtGB(pkg.dataGB) + '</td>' +
            extraCell(rec.extraDataGB, fmtGB(rec.extraDataGB)) +
          '</tr>' +
          '<tr>' +
            '<td>Omni / Flex GW calls / year</td>' +
            '<td class="col-metric" style="color:#888;">—</td>' +
            '<td class="col-metric">' + omniIncluded + '</td>' +
            '<td class="col-metric" style="color:#bbb;">—</td>' +
          '</tr>' +
          apiMgmtRows +
        '</tbody>' +
      '</table></div>' +
    '</div>' +
  '</div>';
}

// ---- Formatting helpers ----
function fmtM(val) {
  if (val >= 1000) return (val / 1000).toFixed(1) + 'B';
  if (val >= 1)    return val.toFixed(1) + 'M';
  return (val * 1000).toFixed(0) + 'K';
}

function fmtMRange(min, max) {
  return fmtM(min / 1e6) + ' – ' + fmtM(max / 1e6);
}

function fmtGB(val) {
  if (val >= 1000000) return (val / 1000000).toFixed(1) + ' PB';
  if (val >= 1000)    return (val / 1000).toFixed(1) + ' TB';
  return val.toFixed(1) + ' GB';
}

function fmtGBRange(min, max) {
  return fmtGB(min) + ' – ' + fmtGB(max);
}

function fmtUSD(val) {
  return '$' + Math.round(val).toLocaleString('en-US');
}
