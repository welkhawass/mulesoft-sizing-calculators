// ============================================================
// UBP Simplified Sizing — Calculation Engine
// Depends on: ubp-data.js
// ============================================================

function calcRow(row, numEnvs, reusabilityKey) {
  const { intType, systems, bidir, bizObjects, tasks, payload } = row;

  // Require all dropdowns to be selected
  if (!intType || !systems || !bizObjects || !tasks || !payload) {
    return null;
  }

  const reductionFactor = REUSABILITY_TABLE[reusabilityKey] || 0;
  const biDirMultiplier = bidir ? 2 : 1;

  // --- Flows ---
  const tshirt = TSHIRT_MATRIX[systems]?.[bizObjects];
  if (!tshirt) return null;
  const flows = FLOW_COUNTS[intType]?.[tshirt] || 0;

  // --- Messages ---
  const taskRange    = TASK_RANGES[tasks];
  if (!taskRange) return null;
  const msgMin = Math.round(taskRange.min * biDirMultiplier * (1 - reductionFactor) * numEnvs);
  const msgMax = Math.round(taskRange.max * biDirMultiplier * (1 - reductionFactor) * numEnvs);

  // --- Data throughput (GB) ---
  // factor: bidir=4 (2 directions × 2 transforms), unidir=2
  const dataMult      = bidir ? 4 : 2;
  const payloadRange  = PAYLOAD_RANGES[payload];
  if (!payloadRange) return null;
  const dataMinGB = (msgMin * payloadRange.min) / 1048576 * dataMult;
  const dataMaxGB = (msgMax * payloadRange.max) / 1048576 * dataMult;

  return { flows, msgMin, msgMax, dataMinGB, dataMaxGB };
}

function calcTotals(rowResults) {
  let totalFlows = 0, totalMsgMin = 0, totalMsgMax = 0;
  let totalDataMin = 0, totalDataMax = 0;

  for (const r of rowResults) {
    if (!r) continue;
    totalFlows    += r.flows;
    totalMsgMin   += r.msgMin;
    totalMsgMax   += r.msgMax;
    totalDataMin  += r.dataMinGB;
    totalDataMax  += r.dataMaxGB;
  }

  // Annualise messages (row calc returns monthly)
  const annualMsgMin = totalMsgMin * 12;
  const annualMsgMax = totalMsgMax * 12;

  // Annualise data
  const annualDataMin = totalDataMin * 12;
  const annualDataMax = totalDataMax * 12;

  return { totalFlows, annualMsgMin, annualMsgMax, annualDataMin, annualDataMax };
}

function recommendPackage(totals) {
  const { totalFlows, annualMsgMin, annualDataMin } = totals;
  const annualMsgMinM = annualMsgMin / 1e6;

  const needsAdvanced =
    totalFlows    > PACKAGES.Starter.flows      ||
    annualMsgMinM > PACKAGES.Starter.messagesM  ||
    annualDataMin > PACKAGES.Starter.dataGB;

  const pkg = needsAdvanced ? PACKAGES.Advanced : PACKAGES.Starter;
  const name = needsAdvanced ? 'Advanced' : 'Starter';

  // Reason
  const reasons = [];
  if (needsAdvanced) {
    if (totalFlows    > PACKAGES.Starter.flows)     reasons.push(`${totalFlows} flows > ${PACKAGES.Starter.flows} included`);
    if (annualMsgMinM > PACKAGES.Starter.messagesM) reasons.push(`${fmtM(annualMsgMinM)} msgs > ${PACKAGES.Starter.messagesM}M included`);
    if (annualDataMin > PACKAGES.Starter.dataGB)    reasons.push(`${fmtGB(annualDataMin)} data > ${PACKAGES.Starter.dataGB}GB included`);
  } else {
    reasons.push('within Starter limits');
  }

  // Additional capacity costs
  const extraFlows    = Math.max(0, totalFlows - pkg.flows);
  const extraMsgM     = Math.max(0, annualMsgMinM - pkg.messagesM);
  const extraDataGB   = Math.max(0, annualDataMin - pkg.dataGB);

  const extraFlowCost  = extraFlows  > 0
    ? extraFlows * pkg.extraFlowRate * Math.pow(extraFlows, FLOW_POWER_LAW.B)
    : 0;
  const extraMsgCost   = Math.ceil(extraMsgM)  * pkg.extraMsgRatePerM;
  const extraDataCost  = extraDataGB * DATA_PRICE_PER_GB;

  const totalListPrice = pkg.listPrice + extraFlowCost + extraMsgCost + extraDataCost;

  return { name, pkg, reasons, extraFlows, extraMsgM, extraDataGB, totalListPrice };
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
  if (val >= 1000) return (val / 1000).toFixed(1) + ' TB';
  return val.toFixed(1) + ' GB';
}

function fmtGBRange(min, max) {
  return fmtGB(min) + ' – ' + fmtGB(max);
}

function fmtUSD(val) {
  return '$' + Math.round(val).toLocaleString('en-US');
}
