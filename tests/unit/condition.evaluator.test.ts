import { evaluateCondition } from '../../src/server/services/workflow/condition.evaluator';

describe('workflow condition evaluator', () => {
  const base = { field: 'source', value: 'indiamart', operator: 'equals', fieldValue: 'indiamart' };
  it('equals / not_equals / contains / gt / lt + fallback', () => {
    expect(evaluateCondition(base).result).toBe(true);
    expect(evaluateCondition({ ...base, fieldValue: 'justdial' }).result).toBe(false);
    expect(evaluateCondition({ ...base, operator: 'not_equals', fieldValue: 'x' }).result).toBe(true);
    expect(evaluateCondition({ ...base, operator: 'contains', value: 'MART', fieldValue: 'IndiaMart' }).result).toBe(true);
    expect(evaluateCondition({ ...base, operator: 'gt', value: '50', fieldValue: '80' }).result).toBe(true);
    expect(evaluateCondition({ ...base, operator: 'lt', value: '50', fieldValue: '80' }).result).toBe(false);
    expect(evaluateCondition({ ...base, operator: 'weird' }).result).toBe(true);
    const r = evaluateCondition({ field: 'a', value: '', operator: 'equals', fieldValue: null });
    expect(r.path).toBe('true');
  });
});
