import { describe, it, expect } from 'vitest';
import { calculateQualityScore } from '../utils/qualityMath';

describe('Vitest Setup - Smoke Test', () => {
  it('should run basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should import calculateQualityScore without error', () => {
    expect(typeof calculateQualityScore).toBe('function');
  });
});
