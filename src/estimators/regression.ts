/**
 * Ordinary least squares, used by the regression and speed methods.
 *
 * Written out rather than pulled from a library because the app must be able to
 * report the condition of the fit honestly — a method that returns a
 * coefficient without saying how badly determined it was is exactly the
 * failure mode the app is about.
 */

export interface OlsResult {
  /** Coefficients, one per column of X, in order. */
  coefficients: number[];
  r2: number;
  /** Number of observations used. */
  n: number;
  /**
   * True when the normal equations were near-singular and the solution was
   * obtained by a regularised fallback. The coefficients are then not
   * trustworthy and the caller must say so.
   */
  illConditioned: boolean;
}

/** Solve (XᵀX)b = Xᵀy by Gauss-Jordan with partial pivoting. */
export function ols(X: number[][], y: number[]): OlsResult | null {
  const n = X.length;
  if (n === 0 || y.length !== n) return null;
  const k = X[0].length;
  if (k === 0 || n < k) return null;

  // Normal equations.
  const xtx: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  const xty: number[] = new Array(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      xty[a] += X[i][a] * y[i];
      for (let b = 0; b < k; b++) xtx[a][b] += X[i][a] * X[i][b];
    }
  }

  const scale = Math.max(...xtx.map((row) => Math.max(...row.map(Math.abs))), 1);
  let illConditioned = false;

  const solve = (ridge: number): number[] | null => {
    const m: number[][] = xtx.map((row, i) =>
      row.map((val, j) => (i === j ? val + ridge : val)).concat([xty[i]]),
    );

    for (let col = 0; col < k; col++) {
      let pivot = col;
      for (let r = col + 1; r < k; r++) {
        if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
      }
      if (Math.abs(m[pivot][col]) < 1e-10 * scale) return null;
      [m[col], m[pivot]] = [m[pivot], m[col]];

      const p = m[col][col];
      for (let j = col; j <= k; j++) m[col][j] /= p;
      for (let r = 0; r < k; r++) {
        if (r === col) continue;
        const factor = m[r][col];
        if (factor === 0) continue;
        for (let j = col; j <= k; j++) m[r][j] -= factor * m[col][j];
      }
    }
    return m.map((row) => row[k]);
  };

  let coefficients = solve(0);
  if (!coefficients) {
    // A tiny ridge lets a rank-deficient design return something rather than
    // nothing, but the result is flagged so the caller reports it as such.
    coefficients = solve(1e-6 * scale);
    illConditioned = true;
    if (!coefficients) return null;
  }

  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    let fitted = 0;
    for (let a = 0; a < k; a++) fitted += coefficients[a] * X[i][a];
    ssRes += (y[i] - fitted) ** 2;
    ssTot += (y[i] - meanY) ** 2;
  }

  return {
    coefficients,
    r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot,
    n,
    illConditioned,
  };
}
