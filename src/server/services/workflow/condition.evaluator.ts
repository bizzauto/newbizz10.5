/**
 * Pure condition evaluator — extracted from workflow-execution.service.ts
 * (Master Prompt §44 refactor, slice 1). No I/O, fully unit-testable.
 */

export interface ConditionInput {
  field: string;
  value: string;
  operator: string;
  fieldValue: unknown;
}

export interface ConditionResult {
  evaluated: true;
  result: boolean;
  path: 'true' | 'false';
  field: string;
  operator: string;
  value: unknown;
}

export function evaluateCondition(input: ConditionInput): ConditionResult {
  const { field, operator } = input;
  const expected = input.value ?? '';
  const actual = input.fieldValue ?? '';

  let result = false;
  switch (operator) {
    case 'equals': result = String(actual) === String(expected); break;
    case 'not_equals': result = String(actual) !== String(expected); break;
    case 'contains': result = String(actual).toLowerCase().includes(String(expected).toLowerCase()); break;
    case 'gt': result = Number(actual) > Number(expected); break;
    case 'lt': result = Number(actual) < Number(expected); break;
    default: result = String(actual) === String(expected);
  }

  return { evaluated: true, result, path: result ? 'true' : 'false', field, operator, value: actual };
}
