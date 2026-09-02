/** Every estimator returns a value plus the diagnostics needed to judge it. */
export interface EmpEstimate {
  method: string;
  /** The motorcycle passenger car equivalent. Negative values are real results. */
  value: number;
  /** Coefficient of determination, where a regression is involved. */
  r2: number | null;
  sampleCount: number;
  /** Aggregation interval, s. */
  interval: number;
  /** Specific warnings — never 'invalid result' (DESIGN.md §7). */
  warnings: string[];
}

/** Colours are assigned in the view layer; the id keys them (DESIGN.md §2.4). */
export type MethodId = 'headway' | 'regression' | 'speed' | 'occupancy' | 'truth';
