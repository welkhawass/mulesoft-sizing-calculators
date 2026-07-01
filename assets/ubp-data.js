// ============================================================
// UBP Calculator Reference Data
// Version : 6.10
// Source  : [UBP] Simplified & Detailed Sizing_Pricing Calculators_v6.10.xlsx
// ============================================================
// To upgrade: download the new sheet, compare changed tables,
// update values below, and bump UBP_VERSION.
// ============================================================

const UBP_ACCESS_CODE = "mulesoftse";

const UBP_VERSION = "6.10";
const UBP_SOURCE  = "[UBP] Simplified & Detailed Sizing_Pricing Calculators_v6.10.xlsx";

// T-shirt size matrix: [systemsCount][businessObjects] → size
// Source: Data - Do not touch, A18:E24
const TSHIRT_MATRIX = {
  '1-2':  { '1-2': 'S',  '3-5': 'M',   '6-10': 'L',   '10+': 'XL'  },
  '3-5':  { '1-2': 'M',  '3-5': 'L',   '6-10': 'XL',  '10+': 'XXL' },
  '6-10': { '1-2': 'L',  '3-5': 'XL',  '6-10': 'XXL', '10+': 'XXL' },
  '10+':  { '1-2': 'XL', '3-5': 'XXL', '6-10': 'XXL', '10+': 'XXL' }
};

// Flow count per integration type × T-shirt size
// Source: Data - Do not touch, B4:G7
// Note: Schedule-Based S/M values inferred from progression (L=7, XL=10, XXL=20)
const FLOW_COUNTS = {
  'API/Microservices': { S: 5,  M: 10, L: 15, XL: 20, XXL: 40 },
  'Event-Based':       { S: 2,  M: 5,  L: 10, XL: 15, XXL: 20 },
  'Schedule-Based':    { S: 3,  M: 5,  L: 7,  XL: 10, XXL: 20 }
};

// Tasks/month range → min/max base messages per env (unidirectional, before reuse/bidir)
// Source: Data - Do not touch, O5:Q8
const TASK_RANGES = {
  '0-10K':     { min: 1000,    max: 10000    },
  '10K-100K':  { min: 10000,   max: 100000   },
  '100K-500K': { min: 100000,  max: 500000   },
  '500K-10M':  { min: 500000,  max: 10000000 }
};

// Avg payload size → min/max KB per message
// Source: Data - Do not touch, O12:Q16
const PAYLOAD_RANGES = {
  '0-100KB':     { min: 10,    max: 100    },
  '101KB-500KB': { min: 101,   max: 500    },
  '501KB-1MB':   { min: 501,   max: 1024   },
  '1MB-10MB':    { min: 1025,  max: 10024  },
  '10MB+':       { min: 10025, max: 100024 }
};

// Reusability index → message/data volume reduction factor
// Source: Data - Do not touch, L4:M8
const REUSABILITY_TABLE = {
  '0%':     0.00,
  '1-15%':  0.10,
  '16-30%': 0.25,
  '31-45%': 0.40,
  '46-60%': 0.50
};

// Package entitlements and list prices (USD)
// Source: List Prices sheet, Meta Data V2
const PACKAGES = {
  Starter: {
    flows:            50,
    messagesM:        5,      // millions / year included
    dataGB:           10,     // GB / year included
    listPrice:        42000,
    extraFlowRate:    360,    // USD / additional flow
    extraMsgRatePerM: 660     // USD / additional million messages
  },
  Advanced: {
    flows:            200,
    messagesM:        20,
    dataGB:           40,
    listPrice:        120000,
    extraFlowRate:    420,
    extraMsgRatePerM: 750
  }
};

// Power law for additional flows: total_cost = A × qty^(1+B)
// Source: Data - Do not touch, G92:H92
const FLOW_POWER_LAW = { A: 420, B: -0.128011 };

// Additional data throughput: $48 / TB = $0.048 / GB
// Source: List Prices sheet
const DATA_PRICE_PER_GB = 48 / 1000;
