import { getProviderStatus } from '../../src/server/services/ai-gateway.service';

/**
 * Pure-logic unit tests for the AI Gateway (Master Prompt §31).
 * No network calls — provider chain derives from env only.
 */
describe('AI Gateway routing', () => {
  const ORIGINAL = { ...process.env };

  afterEach(() => {
    // env is read at module load; these tests assert status-shape behaviour only
    process.env = { ...ORIGINAL };
  });

  it('getProviderStatus reports circuit state fields for configured chain', () => {
    const status = getProviderStatus();
    expect(Array.isArray(status)).toBe(true);
    for (const p of status) {
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('circuitOpen');
      expect(typeof p.circuitOpen).toBe('boolean');
    }
  });

  it('task->model mapping covers all supported task kinds', () => {
    const status = getProviderStatus();
    for (const p of status) {
      expect(Object.keys(p.models).sort()).toEqual(['classification', 'reasoning', 'short_text']);
      // cost routing: reasoning model differs from cheap tasks on cloud providers
      if (p.name !== 'ollama') {
        expect(p.models.reasoning).not.toBe(p.models.classification);
      }
    }
  });
});
