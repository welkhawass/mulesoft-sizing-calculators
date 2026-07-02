// ============================================================
// UBP Calculator Reference Data
// Version : 6.10
// Source  : [UBP] Simplified & Detailed Sizing_Pricing Calculators_v6.10.xlsx
// ============================================================
// To upgrade: download the new sheet, compare changed tables,
// update values below, and bump UBP_VERSION.
// ============================================================

var UBP_ACCESS_CODE = "mulesoftse";

var UBP_VERSION = "6.10";
var UBP_SOURCE  = "[UBP] Simplified & Detailed Sizing_Pricing Calculators_v6.10.xlsx";

// T-shirt size matrix: [systemsCount][businessObjects] → size
// Source: Data - Do not touch, A18:E38 (all 3 integration types share same matrix)
var TSHIRT_MATRIX = {
  '1-2':  { '1-2': 'S',  '3-5': 'M',  '6-10': 'L',   '10+': 'XL'  },
  '3-5':  { '1-2': 'M',  '3-5': 'L',  '6-10': 'XL',  '10+': 'XL'  },
  '6-10': { '1-2': 'L',  '3-5': 'XL', '6-10': 'XXL', '10+': 'XXL' },
  '10+':  { '1-2': 'XL', '3-5': 'XXL','6-10': 'XXL', '10+': 'XXL' }
};

// Flow count per integration type × T-shirt size
// Source: Data - Do not touch, B4:G7
var FLOW_COUNTS = {
  'API/Microservices': { S: 5,  M: 10, L: 15, XL: 20, XXL: 40 },
  'Event-Based':       { S: 2,  M: 5,  L: 10, XL: 20, XXL: 40 },
  'Schedule-Based':    { S: 2,  M: 5,  L: 7,  XL: 10, XXL: 20 }
};

// Environments → message/data volume multiplier (non-linear lookup)
// Source: Data - Do not touch, A10:B14
var ENV_MULTIPLIERS = {
  2: 2.0,
  3: 2.5,
  4: 3.0,
  5: 3.5
};

// Tasks/month range → min/max base transactions
// Source: Data - Do not touch, O5:Q8
var TASK_RANGES = {
  '0-10K':     { min: 1000,    max: 10000    },
  '10K-100K':  { min: 10000,   max: 100000   },
  '100K-500K': { min: 100000,  max: 500000   },
  '500K-10M':  { min: 500000,  max: 10000000 }
};

// Avg payload size → min/max KB per message
// Source: Data - Do not touch, O12:Q16
var PAYLOAD_RANGES = {
  '0-100KB':     { min: 10,    max: 100    },
  '101KB-500KB': { min: 101,   max: 500    },
  '501KB-1MB':   { min: 501,   max: 1024   },
  '1MB-10MB':    { min: 1025,  max: 10024  },
  '10MB+':       { min: 10025, max: 100024 }
};

// Reusability index → message/data volume reduction factor
// Source: Data - Do not touch, L4:M8
var REUSABILITY_TABLE = {
  '0%':     0.00,
  '1-15%':  0.10,
  '16-30%': 0.25,
  '31-45%': 0.40,
  '46-60%': 0.50
};

// Package entitlements and list prices (USD)
// Source: Integration Composite SKUs slide + Data - Do not touch, K42:Q52
var PACKAGES = {
  Starter: {
    flows:              50,
    messagesM:          5,        // 5 Million messages / year
    dataGB:             10000,    // 10,000 GB data throughput / year
    managedApisProd:    2,
    managedApisNonProd: 2,
    governedApis:       2,
    omniCallsM:         4,        // 4 Million Flex/Omni GW calls
    privateSpaces:      1,
    networkConnections: 2,
    hasHA:              false,    // HA not included in Starter
    listPrice:          42000,
    extraFlowRate:      360,
    extraMsgRatePerM:   660
  },
  Advanced: {
    flows:              200,
    messagesM:          20,       // 20 Million messages / year
    dataGB:             40000,    // 40,000 GB data throughput / year
    managedApisProd:    10,
    managedApisNonProd: 10,
    governedApis:       10,
    omniCallsM:         20,       // 20 Million Flex/Omni GW calls
    privateSpaces:      2,
    networkConnections: 4,
    hasHA:              true,
    listPrice:          120000,
    extraFlowRate:      420,
    extraMsgRatePerM:   750
  }
};

// Premium Connectors — list and pricing
// Source: Integration Composite SKUs / Pricing sheet
var PREMIUM_CONNECTORS = [
  { name: 'SAP Connector',
    note: 'Covers SAP ECC, S/4HANA, SAP S/4HANA OData Connector, and SAP S/4HANA SOAP Connector — all under one license.' },
  { name: 'HL7 Connector',                              note: '' },
  { name: 'Oracle EBS Connector',                       note: '' },
  { name: 'Oracle PeopleSoft Connector',                note: '' },
  { name: 'IBM CTG (CICS Transaction Gateway) Connector', note: '' },
  { name: 'Siebel (On-Premise) Connector',              note: '' },
  { name: 'X12 Connector (EDI Standard)',
    note: 'B2B/EDI connector — typically sold as part of B2B Message Packs.' },
  { name: 'EDIFACT Connector (EDI Standard)',
    note: 'B2B/EDI connector — typically sold as part of B2B Message Packs.' },
  { name: 'RosettaNet Connector',
    note: 'B2B/EDI connector — typically sold as part of B2B Message Packs.' }
];

// Per connector per environment (Production and Non-Production billed at the same rate)
var PREMIUM_CONNECTOR_PRICE = 33600;

// Power-law constants — used in Methodology modal explanation only, NOT in pricing
// (Actual SKU pricing is flat rate per unit: extraFlowRate × qty, extraMsgRatePerM × qty)
// Source: Data - Do not touch, B91:B98
var FLOW_POWER_LAW = { A: 420, B: -0.1076851047 };
var MSG_POWER_LAW  = { B: -0.1912344768 };

// API Management overage prices (per additional API beyond package entitlement, per year)
// Source: List Prices tab
var API_MGMT_PRICES = {
  managedApiPerEnv: 3240,   // $3,240 / extra API managed (prod or non-prod, billed equally)
  governedApi:      1140    // $1,140 / extra API governed (production only)
};

// Additional data throughput: $48 per TB = $0.048 / GB
// Source: List Prices tab, row 10
var DATA_PRICE_PER_GB = 48 / 1000;

// Platform add-on SKU prices (USD / year)
// Source: List Prices tab (Meta Data V2)
var ADDON_PRICES = {
  partnerManager:              189000,  // flat per year
  loadBalancer:                  7680,  // per unit
  privateSpace:                 12000,  // per additional unit beyond package
  networkConnection:             1200,  // per additional unit beyond package
  anypointMQ500M:               39600,  // per 500M message pack
  objectStore100M:              15000,  // per 100M operations/month pack
  aehAccessRequests:               45   // per API Experience Hub access request
};
