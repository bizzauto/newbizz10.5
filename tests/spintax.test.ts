/**
 * Spintax engine tests — pure functions, no DB/mocks needed.
 */
import { spin, personalize, spinAndPersonalize, hasVariation } from '../src/server/utils/spintax';

describe('spintax engine', () => {
  describe('spin()', () => {
    it('returns plain text unchanged', () => {
      expect(spin('Hello world')).toBe('Hello world');
    });

    it('picks one option from a group', () => {
      const out = spin('{Hi|Hello}');
      expect(['Hi', 'Hello']).toContain(out);
    });

    it('expands every group in one pass', () => {
      for (let i = 0; i < 20; i++) {
        const out = spin('{Hi|Hello} {Rahul|Priya}');
        expect(out).toMatch(/^(Hi|Hello) (Rahul|Priya)$/);
      }
    });

    it('handles nested groups', () => {
      const out = spin('{A|B {C|D}}');
      expect(['A', 'B C', 'B D']).toContain(out);
    });

    it('produces variation across many runs', () => {
      const outs = new Set<string>();
      for (let i = 0; i < 50; i++) outs.add(spin('{a|b|c}'));
      expect(outs.size).toBeGreaterThan(1);
    });

    it('handles single-option group as identity', () => {
      expect(spin('{only}')).toBe('only');
    });

    it('does not loop infinitely on pathological input', () => {
      const out = spin('{{a|b}|{c|d}}');
      expect(['a', 'b', 'c', 'd']).toContain(out);
    });
  });

  describe('personalize()', () => {
    it('replaces {name} with first name', () => {
      expect(personalize('Hi {name}!', { name: 'Rahul Sharma' })).toBe('Hi Rahul!');
    });

    it('replaces {phone} and {business}', () => {
      const out = personalize('{business} team: {phone}', { phone: '919876543210', business: 'Bizzauto' });
      expect(out).toBe('Bizzauto team: 919876543210');
    });

    it('falls back to "there" when name missing', () => {
      expect(personalize('Hi {name}!', {})).toBe('Hi there!');
    });

    it('strips unknown placeholders instead of leaking raw braces', () => {
      const out = personalize('Hi {name}, your {marks} is ready', { name: 'Amit' });
      expect(out).toBe('Hi Amit, your  is ready');
      expect(out).not.toContain('{marks}');
    });
  });

  describe('spinAndPersonalize()', () => {
    it('personalizes then spins', () => {
      for (let i = 0; i < 10; i++) {
        const out = spinAndPersonalize('{Namaste|Hello} {name}!', { name: 'Sita' });
        expect(out).toMatch(/^(Namaste|Hello) Sita!$/);
      }
    });

    it('safe on empty input', () => {
      expect(spinAndPersonalize('', {})).toBe('');
    });
  });

  describe('hasVariation()', () => {
    it('true for spintax template', () => {
      expect(hasVariation('{a|b}')).toBe(true);
    });
    it('false for plain template', () => {
      expect(hasVariation('plain message')).toBe(false);
    });
  });
});
