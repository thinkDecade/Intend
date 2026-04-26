export interface Signal {
  kind:  'alarm' | 'opp';
  tag:   string;
  time:  string;
  body:  string;
  spark: number[];
}

export interface Metric {
  k:    string;
  v:    string;
  hot?: boolean;
  good?: boolean;
  sub:  string;
}

export const METRICS: Metric[] = [
  { k: 'Avg inflation', v: '3.42%', hot: true,  sub: '12-mo' },
  { k: 'Aegide score',  v: '0.72',              sub: '0–1 healthy' },
  { k: 'Real yield',    v: '+1.8%', good: true, sub: 'annualised' },
  { k: 'FX trend',      v: 'STABLE',            sub: 'DXY basket' },
];

export const SIGNALS: Signal[] = [
  { kind: 'alarm', tag: 'RISK',        time: '02:14', body: 'Forward Signal: Economic trajectory reflects gradual deterioration.',        spark: [4,5,6,5,7,8,7,9,10,11] },
  { kind: 'opp',   tag: 'OPPORTUNITY', time: '02:07', body: 'Gold parity eyes $3,425, providing superior inflation hedge.',               spark: [2,3,2,4,4,5,6,7,7,8]   },
  { kind: 'opp',   tag: 'OPPORTUNITY', time: '01:58', body: 'Idle USDC yield opportunity: Aerodrome V3 at 7.2% APR.',                     spark: [5,5,6,7,6,7,8,8,9,9]   },
  { kind: 'alarm', tag: 'RISK',        time: '01:41', body: 'Global debt-to-GDP alert: Portfolio de-risking initiated.',                  spark: [9,8,8,7,7,6,5,5,4,3]   },
  { kind: 'opp',   tag: 'OPPORTUNITY', time: '01:22', body: 'CPI data: inflation sticky at 3.4%. Purchasing power decaying.',              spark: [3,4,4,5,6,6,7,7,8,9]   },
];

export const CPI_SERIES  = [2.1, 2.3, 2.6, 2.9, 3.1, 3.0, 3.3, 3.4, 3.5, 3.4, 3.4, 3.42];
export const CPI_LABELS  = ['May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr'];
