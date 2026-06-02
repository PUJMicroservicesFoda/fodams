import { describe, expect, test } from "vitest";
import { bucketSizes, findNumberOfGaps } from "foda-ms-language";

describe("Bucket helper functions", () => {
  test("bucketSizes counts feature assignments per bucket", () => {
    expect(bucketSizes([0, 2, 2, 1, 2], 4)).toEqual([1, 1, 3, 0]);
  });

  test("bucketSizes returns zeros for empty assignment", () => {
    expect(bucketSizes([], 3)).toEqual([0, 0, 0]);
  });

  test("findNumberOfGaps counts empty buckets before the last non-empty bucket", () => {
    expect(findNumberOfGaps([1, 0, 2, 0], 3)).toBe(1);
    expect(findNumberOfGaps([0, 1, 0, 1], 3)).toBe(2);
  });

  test("findNumberOfGaps ignores trailing empty buckets", () => {
    expect(findNumberOfGaps([1, 0, 0, 0], 3)).toBe(0);
  });

  test("findNumberOfGaps returns zero for all-empty bucket list", () => {
    expect(findNumberOfGaps([0, 0, 0], 3)).toBe(0);
  });
});
