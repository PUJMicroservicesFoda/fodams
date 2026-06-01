/**
 * estimate-valid-combinations.ts
 *
 * Monte Carlo estimator for the number of valid assignments of N elements
 * into M buckets, where:
 *   - forbidden_pairs: pairs (a, b) such that a X b (cannot share a bucket)
 *   - The LAST bucket (m_buckets - 1) is FREE: any pair can coexist there.
 *
 * Usage (Node.js):
 *   npx ts-node estimate-valid-combinations.ts
 *   OR compile: tsc estimate-valid-combinations.ts && node estimate-valid-combinations.js
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface EstimateDetails {
  samples: number;
  validCount: number;
  validFraction: number;
  confidence95Lower: number;
  confidence95Upper: number;
  totalSpace: number;
  relativeError: number;
}

export interface EstimateResult {
  estimate: number;
  stderr: number;
  details: EstimateDetails;
}

// ────────────────────────────────────────────────────────────────────────────
// Seeded PRNG (Mulberry32) — avoids Math.random() for reproducibility
// ────────────────────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0xffffffff;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Core: check if a random assignment is valid
// ────────────────────────────────────────────────────────────────────────────

function buildForbiddenSet(forbiddenPairs: [number, number][]): Set<string> {
  const set = new Set<string>();
  for (const [a, b] of forbiddenPairs) {
    const key = `${Math.min(a, b)},${Math.max(a, b)}`;
    set.add(key);
  }
  return set;
}

function isValid(
  assignment: number[],
  forbiddenSet: Set<string>,
  freeBucket: number
): boolean {
  for (const key of forbiddenSet) {
    const [a, b] = key.split(",").map(Number);
    if (assignment[a] === assignment[b] && assignment[a] !== freeBucket) {
      return false;
    }
  }
  return true;
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: compute statistics from (valid, total samples, M^N)
// ────────────────────────────────────────────────────────────────────────────

function computeStats(
  valid: number,
  s: number,
  totalSpace: number
): { estimate: number; stderr: number; details: Omit<EstimateDetails, "samples" | "validCount"> } {
  const fraction = valid / s;
  const estimate = fraction * totalSpace;
  const varianceFraction = s > 1 ? (fraction * (1 - fraction)) / (s - 1) : fraction * (1 - fraction);
  const stderr = Math.sqrt(varianceFraction) * totalSpace;
  const Z = 1.96;
  const ci_lower = Math.max(0, estimate - Z * stderr);
  const ci_upper = estimate + Z * stderr;
  const relativeError = estimate > 0 ? stderr / estimate : Infinity;

  return {
    estimate,
    stderr,
    details: {
      validFraction: fraction,
      confidence95Lower: ci_lower,
      confidence95Upper: ci_upper,
      totalSpace,
      relativeError,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Main function: estimateWithEarlyStopping
// ────────────────────────────────────────────────────────────────────────────

/**
 * Monte Carlo estimator with early stopping.
 *
 * Stops sampling once the relative error (stderr / estimate) falls below
 * `targetRelativeError`, or once `maxSamples` is reached.
 *
 * @param nElements           - Number of elements (labeled 0 to N-1)
 * @param mBuckets            - Total buckets; last bucket (mBuckets-1) is free
 * @param forbiddenPairs      - Pairs [a, b] where a X b (cannot share restricted bucket)
 * @param minSamples          - Minimum samples before early stopping is checked (default 1000)
 * @param maxSamples          - Maximum samples before stopping regardless (default 1_000_000)
 * @param targetRelativeError - Target stderr/estimate ratio, e.g. 0.05 for 5% (default 0.05)
 * @param seed                - Optional seed for reproducibility (undefined = random)
 *
 * @returns EstimateResult with estimate, stderr, and detailed statistics
 */
export function estimateWithEarlyStopping(
  nElements: number,
  mBuckets: number,
  forbiddenPairs: [number, number][],
  minSamples = 1_000,
  maxSamples = 1_000_000,
  targetRelativeError = 0.05,
  seed?: number
): EstimateResult {
  const rng = seed !== undefined ? mulberry32(seed) : Math.random.bind(Math);
  const forbiddenSet = buildForbiddenSet(forbiddenPairs);
  const freeBucket = mBuckets - 1;
  const totalSpace = Math.pow(mBuckets, nElements);
  const assignment = new Array<number>(nElements);

  let valid = 0;
  let s = 0;

  while (s < maxSamples) {
    // Generate random assignment
    for (let i = 0; i < nElements; i++) {
      assignment[i] = Math.floor(rng() * mBuckets);
    }
    if (isValid(assignment, forbiddenSet, freeBucket)) {
      valid++;
    }
    s++;

    // Check early stopping condition
    if (s >= minSamples) {
      const fraction = valid / s;
      const estimate = fraction * totalSpace;
      if (estimate > 0) {
        const varianceFraction = s > 1 ? (fraction * (1 - fraction)) / (s - 1) : fraction * (1 - fraction);
        const stderr = Math.sqrt(varianceFraction) * totalSpace;
        const relErr = stderr / estimate;
        if (relErr <= targetRelativeError) {
          break;
        }
      }
    }
  }

  const { estimate, stderr, details } = computeStats(valid, s, totalSpace);

  return {
    estimate,
    stderr,
    details: {
      samples: s,
      validCount: valid,
      ...details,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Optional fixed-sample variant
// ────────────────────────────────────────────────────────────────────────────

/**
 * Monte Carlo estimator with a fixed number of samples (no early stopping).
 *
 * @param nElements      - Number of elements (labeled 0 to N-1)
 * @param mBuckets       - Total buckets; last bucket is free
 * @param forbiddenPairs - Pairs [a, b] where a X b
 * @param samples        - Number of random assignments to draw (default 100_000)
 * @param seed           - Optional seed for reproducibility
 *
 * @returns EstimateResult
 */
export function estimateFixedSamples(
  nElements: number,
  mBuckets: number,
  forbiddenPairs: [number, number][],
  samples = 100_000,
  seed?: number
): EstimateResult {
  const rng = seed !== undefined ? mulberry32(seed) : Math.random.bind(Math);
  const forbiddenSet = buildForbiddenSet(forbiddenPairs);
  const freeBucket = mBuckets - 1;
  const totalSpace = Math.pow(mBuckets, nElements);
  const assignment = new Array<number>(nElements);

  let valid = 0;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < nElements; j++) {
      assignment[j] = Math.floor(rng() * mBuckets);
    }
    if (isValid(assignment, forbiddenSet, freeBucket)) {
      valid++;
    }
  }

  const { estimate, stderr, details } = computeStats(valid, samples, totalSpace);

  return {
    estimate,
    stderr,
    details: {
      samples,
      validCount: valid,
      ...details,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Demo / self-test (runs when executed directly)
// ────────────────────────────────────────────────────────────────────────────

function demo(): void {
  const EXACT_KNOWN = 51; // from brute-force / chromatic polynomial
  const N = 4;
  const M = 3;
  const pairs: [number, number][] = [[0, 1], [1, 2]];

  console.log("=".repeat(60));
  console.log("Early-stopping Monte Carlo (target 2% relative error)");
  const r1 = estimateWithEarlyStopping(N, M, pairs, 500, 200_000, 0.02, 42);
  console.log(`  Samples used:      ${r1.details.samples}`);
  console.log(`  Valid fraction:    ${r1.details.validFraction.toFixed(5)}`);
  console.log(`  Estimate:          ${r1.estimate.toFixed(2)}`);
  console.log(`  Std error:         ${r1.stderr.toFixed(2)}`);
  console.log(`  Relative error:    ${(r1.details.relativeError * 100).toFixed(2)}%`);
  console.log(`  95% CI:            [${r1.details.confidence95Lower.toFixed(2)}, ${r1.details.confidence95Upper.toFixed(2)}]`);
  console.log(`  Exact value:       ${EXACT_KNOWN}`);
  console.log(`  Actual rel. error: ${(Math.abs(r1.estimate - EXACT_KNOWN) / EXACT_KNOWN * 100).toFixed(2)}%`);

  console.log("\n" + "=".repeat(60));
  console.log("Fixed-sample Monte Carlo (50,000 samples)");
  const r2 = estimateFixedSamples(N, M, pairs, 50_000, 42);
  console.log(`  Samples used:      ${r2.details.samples}`);
  console.log(`  Valid fraction:    ${r2.details.validFraction.toFixed(5)}`);
  console.log(`  Estimate:          ${r2.estimate.toFixed(2)}`);
  console.log(`  Std error:         ${r2.stderr.toFixed(2)}`);
  console.log(`  95% CI:            [${r2.details.confidence95Lower.toFixed(2)}, ${r2.details.confidence95Upper.toFixed(2)}]`);
  console.log(`  Exact value:       ${EXACT_KNOWN}`);
  console.log(`  Actual rel. error: ${(Math.abs(r2.estimate - EXACT_KNOWN) / EXACT_KNOWN * 100).toFixed(2)}%`);

  console.log("\n" + "=".repeat(60));
  console.log("Large problem: N=20, M=4, path graph (exact unknown)");
  const bigPairs: [number, number][] = Array.from({ length: 19 }, (_, i) => [i, i + 1]);
  const r3 = estimateWithEarlyStopping(20, 4, bigPairs, 1_000, 500_000, 0.05, 123);
  console.log(`  Samples used:      ${r3.details.samples}`);
  console.log(`  Valid fraction:    ${r3.details.validFraction.toFixed(6)}`);
  console.log(`  Estimate:          ${r3.estimate.toExponential(3)}`);
  console.log(`  Std error:         ${r3.stderr.toExponential(3)}`);
  console.log(`  Relative error:    ${(r3.details.relativeError * 100).toFixed(2)}%`);
  console.log(`  95% CI:            [${r3.details.confidence95Lower.toExponential(3)}, ${r3.details.confidence95Upper.toExponential(3)}]`);
  console.log(`  Total space M^N:   ${(4 ** 20).toExponential(3)}`);
}

demo();
