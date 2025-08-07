import { describe, it, expect } from 'vitest';

describe('Example Test Suite', () => {
  it('should pass a trivial test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should handle string concatenation', () => {
    const greeting = 'Hello' + ' ' + 'World';
    expect(greeting).toBe('Hello World');
  });

  it('should verify array operations', () => {
    const numbers = [1, 2, 3];
    expect(numbers.length).toBe(3);
    expect(numbers.includes(2)).toBe(true);
  });
});