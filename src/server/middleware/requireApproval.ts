import { requestApproval, ApprovalLevel } from '../services/approval.service.js';

/**
 * Wrapper used by other services to enqueue an action for approval.
 * Thin alias over `requestApproval` for consistent naming at call sites.
 */
export async function enqueueApproval(opts: {
  businessId: string;
  level?: ApprovalLevel;
  action: string;
  resourceType?: string;
  resourceId?: string;
  requestedBy?: string;
  payload?: any;
  reason?: string;
  expiresInMinutes?: number;
}) {
  return requestApproval(opts);
}

/**
 * Map an action string to its required approval level.
 *
 * - Risky-but-routine operations → APPROVAL (a manager can clear them).
 * - Destructive / high-impact operations → HUMAN (explicit human sign-off).
 * - Safe internal operations → AUTO (recorded as auto-approved, never blocks).
 *
 * Unknown / unmapped actions default to APPROVAL so they are reviewed rather
 * than silently auto-approved.
 */
export function approvalLevelFor(action: string): ApprovalLevel {
  switch (action) {
    case 'PUBLISH_SOCIAL_POST':
    case 'SEND_BULK_WHATSAPP':
    case 'MODIFY_CAMPAIGN':
    case 'REPLY_NEGATIVE_REVIEW':
      return 'APPROVAL';

    case 'REFUND':
    case 'DELETE_ACCOUNT':
    case 'MASS_DELETE':
    case 'MAJOR_BILLING':
      return 'HUMAN';

    case 'CREATE_TASK':
    case 'ADD_TAG':
    case 'GENERATE_SUMMARY':
    case 'LEAD_SCORE':
    case 'INTERNAL_NOTIFY':
    case 'SCHEDULE_FOLLOWUP':
      return 'AUTO';

    default:
      return 'APPROVAL';
  }
}
