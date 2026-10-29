import { describe, expect, it } from 'vitest';
import { TurnGeneration } from './turn-generation';
describe('TurnGeneration', () => {
  it('rejects old generations after a new turn', () => {
    const gate = new TurnGeneration();
    const old = gate.next(); const current = gate.next();
    expect(gate.current(old)).toBe(false);
    expect(gate.current(current)).toBe(true);
  });
  it('invalidates pending results on cancel', () => {
    const gate = new TurnGeneration(); const pending = gate.next();
    gate.cancel(); expect(gate.current(pending)).toBe(false);
  });
});
