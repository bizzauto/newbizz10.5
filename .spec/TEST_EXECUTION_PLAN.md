# BIZZ CRM - AUTOMATED TEST EXECUTION PLAN

**Generated**: 2026-08-27T19:36:11Z  
**Status**: EXECUTION PHASE  

---

## TEST EXECUTION STRATEGY

### Phase 1: Unit Tests (CURRENT)
- Run existing Jest test suite
- Identify failures
- Check coverage gaps
- Document broken tests

### Phase 2: Integration Tests
- API endpoint testing
- Database operation verification
- External service mocking

### Phase 3: E2E Tests
- Critical user journeys
- UI interaction tests
- Cross-component flows

### Phase 4: Security Tests
- Multi-tenant isolation verification
- Authorization checks
- Input validation
- SQL injection prevention

### Phase 5: Performance Tests
- Load testing
- Query performance
- Memory leaks

### Phase 6: Regression Tests
- After each fix
- Full suite re-run
- Impact analysis

---

## TEST SUITE OVERVIEW

### Existing Tests Found: 56 files

**Core Tests:**
- tenant-isolation.test.ts
- ai-gateway.test.ts
- condition.evaluator.test.ts
- admin-analytics.test.ts
- ai-service.test.ts
- api-key-auth.test.ts
- appointments.test.ts
- audit-middleware.test.ts
- auth-e2e.test.ts
- auth-flow.test.ts
- auth-forgot-password.test.ts
- auth-rate-limit.test.ts
- ava.test.ts
- blog.test.ts
- brevo-email.test.ts

### Test Categories

| Category | Count | Priority |
|----------|-------|----------|
| Authentication | 8 | P1 |
| CRM (Contacts/Deals) | 12 | P1 |
| WhatsApp | 10 | P1 |
| Email | 6 | P1 |
| Billing | 8 | P1 |
| AI Features | 6 | P1 |
| Security | 15 | P0 |
| Performance | 4 | P2 |
| Integration | 7 | P1 |

---

## CRITICAL TESTS TO RUN FIRST

### P0 CRITICAL (MUST PASS)

1. **Tenant Isolation** (tenant-isolation.test.ts)
   - Cross-tenant data access prevention
   - Query filtering by businessId
   - No data leakage between tenants

2. **Authentication** (auth-e2e.test.ts, auth-flow.test.ts)
   - User registration
   - Login/logout
   - Token generation
   - Session persistence

3. **Authorization** (api-key-auth.test.ts)
   - Role-based access control
   - Permission enforcement
   - Admin vs Member access

4. **API Security** (audit-middleware.test.ts)
   - CSRF protection
   - Rate limiting
   - Input sanitization

---

## TEST EXECUTION CHECKLIST

### Unit Tests
```
□ Run: npm run test:quick
□ Expected: All pass (or document known failures)
□ Coverage: Minimum 80%
□ Duration: < 5 minutes
```

### Integration Tests
```
□ Database: PostgreSQL running
□ Redis: Redis server running
□ Verify connections established
□ Run integration test suite
```

### Critical Path E2E
```
□ Signup → Login → Dashboard
□ Create Contact → Create Deal → Close Deal
□ Send WhatsApp → Receive Reply
□ Subscribe → Upgrade → Cancel
□ Create Automation → Execute → Verify
```

### Security Tests
```
□ Tenant A access Tenant B data: MUST FAIL
□ Unauthenticated access: MUST FAIL
□ Invalid JWT token: MUST FAIL
□ SQL injection attempt: MUST FAIL
□ XSS attempt: MUST FAIL
```

---

## TEST RESULT TEMPLATE

For each test, record:

```
TEST ID: [ID]
TEST NAME: [Name]
MODULE: [Module]
PRIORITY: [P0/P1/P2/P3]

SETUP:
- Prerequisites
- Test data
- Configuration

EXECUTION:
- Steps taken
- Input data
- Command run

RESULT: [PASS/FAIL/BLOCKED]

EXPECTED:
- Expected outcome
- Assertions
- Database state

ACTUAL:
- What actually happened
- Error message
- Database state

EVIDENCE:
- Screenshot/log
- Output
- Database query result

ROOT CAUSE (if FAIL):
- Why it failed
- Stack trace
- Related code

FIX (if FAIL):
- Root cause fix
- Code change
- Verification

REGRESSION TEST:
- Tests to verify fix didn't break anything
- Related features to test
- Result

NOTES:
- Any additional observations
- Performance metrics
- Security considerations
```

---

## BUG TRACKING FORMAT

```
BUG-ID: [BUG-XXX-###]
SEVERITY: [P0/P1/P2/P3]
MODULE: [Module name]
FEATURE: [Feature affected]
STATUS: [OPEN/IN_PROGRESS/FIXED/VERIFIED]

TITLE: [One-line description]

DESCRIPTION:
[Detailed description]

REPRODUCTION STEPS:
1. Step 1
2. Step 2
3. Step 3

EXPECTED RESULT:
[What should happen]

ACTUAL RESULT:
[What actually happened]

ROOT CAUSE:
[Root cause analysis]

AFFECTED FILES:
- /path/to/file.ts
- /path/to/file.ts

STEPS TO FIX:
1. Change X in file Y
2. Change A in file B
3. Verify with test Z

VERIFICATION:
- Test case that reproduces issue
- Test that verifies fix
- Regression tests run

---

## STATUS REPORTING

### Test Summary
- Total Tests: [number]
- Passed: [number]
- Failed: [number]
- Blocked: [number]
- Skipped: [number]

### By Category
- Authentication: P/F/B
- CRM: P/F/B
- WhatsApp: P/F/B
- Email: P/F/B
- Billing: P/F/B
- AI: P/F/B
- Security: P/F/B
- Performance: P/F/B

### Bugs Found
- P0: [count]
- P1: [count]
- P2: [count]
- P3: [count]

### Quality Score
```
Functionality:  [score]/20
Security:       [score]/20
Reliability:    [score]/15
Performance:    [score]/10
Automation:     [score]/10
AI Features:    [score]/10
UX:             [score]/5
Testing:        [score]/10
─────────────────────────────
TOTAL:          [score]/100
```

### Production Readiness
```
P0 Bugs Fixed: YES/NO
P1 Bugs Fixed: YES/NO
Security PASS: YES/NO
Critical E2E PASS: YES/NO
Regression PASS: YES/NO

VERDICT: READY / NOT READY
```

---

## DETAILED TEST CASES TO EXECUTE

### TEST SET 1: AUTHENTICATION FLOW

**TEST-AUTH-001: User Registration**
```
Inputs:
  - email: unique@test.com
  - password: SecurePass123!
  - name: Test User
  - businessName: Test Business
  - businessType: SERVICE

Execute: POST /api/auth/register

Verify:
  - Status: 201 Created
  - Response contains: user, business, token
  - Database: User record created
  - Database: Business record created
  - Email: Verification email sent
  - No password in response
```

**TEST-AUTH-002: User Login**
```
Prerequisites: Registered user exists

Inputs:
  - email: registered@test.com
  - password: CorrectPassword123!

Execute: POST /api/auth/login

Verify:
  - Status: 200 OK
  - Response: accessToken, refreshToken
  - Cookie: HttpOnly, Secure, SameSite
  - Database: lastLoginAt updated
  - No password in response
```

**TEST-AUTH-003: Token Refresh**
```
Prerequisites: Valid refresh token exists

Inputs:
  - refreshToken: valid_refresh_token

Execute: POST /api/auth/refresh

Verify:
  - Status: 200 OK
  - Response: new accessToken
  - Old token still valid
```

**TEST-AUTH-004: Logout**
```
Prerequisites: Authenticated user

Execute: POST /api/auth/logout

Verify:
  - Status: 200 OK
  - Cookie cleared
  - Token revoked
  - Next API call with token: 401 Unauthorized
```

---

### TEST SET 2: MULTI-TENANT ISOLATION

**TEST-TENANT-001: Contact Isolation**
```
Setup:
  - Tenant A created (biz_A)
  - Tenant B created (biz_B)
  - User A token
  - User B token
  - Contact created in Tenant A (contact_A)

Test 1: User B GET /api/contacts/{contact_A}
  - Headers: Authorization: Bearer user_B_token
  - Expected: 403 Forbidden

Test 2: User B GET /api/contacts (list)
  - Headers: Authorization: Bearer user_B_token
  - Expected: 200 OK, empty array or only B's contacts

Test 3: User B PUT /api/contacts/{contact_A}
  - Headers: Authorization: Bearer user_B_token
  - Expected: 403 Forbidden

Database Verification:
  - Query: SELECT * FROM "Contact" WHERE "businessId" = 'biz_B'
  - contact_A should NOT appear
```

**TEST-TENANT-002: Deal Isolation**
```
Similar to contact isolation
```

**TEST-TENANT-003: Message Isolation**
```
Similar to contact isolation
```

---

### TEST SET 3: CONTACT MANAGEMENT

**TEST-CONTACT-001: Create Contact**
```
Prerequisites: Authenticated user

Inputs:
  POST /api/contacts
  {
    "name": "John Doe",
    "phone": "+919876543210",
    "email": "john@example.com",
    "company": "ACME Corp"
  }

Verify:
  - Status: 201 Created
  - Response: Contact object with ID
  - Database: Contact record exists
  - Database: businessId matches user's business
  - Database: Unique constraint on phone per business
```

**TEST-CONTACT-002: Duplicate Phone Prevention**
```
Prerequisites: Contact with phone +919876543210 exists

Inputs:
  POST /api/contacts
  {
    "name": "Jane Doe",
    "phone": "+919876543210"
  }

Expected:
  - Status: 409 Conflict
  - Message: "Phone already exists for this business"
  - Database: No new contact created
```

**TEST-CONTACT-003: Edit Contact**
```
Prerequisites: Contact exists

Inputs:
  PUT /api/contacts/{contactId}
  {
    "name": "Updated Name",
    "tags": ["vip", "priority"]
  }

Verify:
  - Status: 200 OK
  - Response: Updated contact
  - Database: Fields updated
  - Database: updatedAt timestamp current
  - Activity: Log entry created
```

**TEST-CONTACT-004: Delete Contact (Soft Delete)**
```
Prerequisites: Contact exists

Inputs:
  DELETE /api/contacts/{contactId}

Verify:
  - Status: 200 OK
  - GET same contact: 404 Not Found
  - Database: status = "archived"
  - Database: Record still exists
```

**TEST-CONTACT-005: List Contacts with Pagination**
```
Prerequisites: 100+ contacts exist

Inputs:
  GET /api/contacts?limit=20&offset=0

Verify:
  - Status: 200 OK
  - Response: Array of 20 contacts
  - Response: total: 100+
  - Response: hasMore: true
```

**TEST-CONTACT-006: Search Contacts**
```
Inputs:
  GET /api/contacts?search=john

Verify:
  - Status: 200 OK
  - Results: Only contacts with 'john' in name/email/phone
```

**TEST-CONTACT-007: Filter Contacts**
```
Inputs:
  GET /api/contacts?status=active&source=manual

Verify:
  - Status: 200 OK
  - Results: Only active contacts from manual source
```

**TEST-CONTACT-008: Sort Contacts**
```
Inputs:
  GET /api/contacts?sortBy=createdAt&order=desc

Verify:
  - Status: 200 OK
  - Results: Sorted by creation date, newest first
```

**TEST-CONTACT-009: Bulk Import CSV**
```
Inputs:
  POST /api/contacts/import
  File: CSV with 100 contacts

Verify:
  - Status: 201 Created
  - Response: jobId
  - Database: Import job created
  - Email: Completion email sent
  - Contacts: All 100 in database
```

**TEST-CONTACT-010: Bulk Export CSV**
```
Prerequisites: 50 contacts exist

Inputs:
  GET /api/contacts/export

Verify:
  - Status: 200 OK
  - Response: CSV file
  - CSV: Contains all 50 contacts
  - CSV: Headers correct
  - CSV: Data integrity
```

---

### TEST SET 4: WHATSAPP INTEGRATION

**TEST-WA-001: Connect WhatsApp**
```
Inputs:
  POST /api/whatsapp/connect
  {
    "wabaId": "111111111",
    "phoneNumberId": "222222222",
    "accessToken": "valid_token"
  }

Verify:
  - Status: 200 OK
  - Database: WABA credentials stored
  - Database: Credentials encrypted
  - Connection: Verified against Meta API
```

**TEST-WA-002: Send Text Message**
```
Prerequisites: WhatsApp connected, Contact exists

Inputs:
  POST /api/whatsapp/send
  {
    "contactId": "contact_1",
    "message": "Hello, this is a test",
    "type": "text"
  }

Verify:
  - Status: 201 Created
  - Response: messageId
  - Database: Message created
  - Database: status = "sent"
  - Meta API: Message delivered
```

**TEST-WA-003: Send Media Message**
```
Inputs:
  POST /api/whatsapp/send
  {
    "contactId": "contact_1",
    "type": "media",
    "media": {
      "type": "image",
      "url": "https://example.com/image.jpg"
    }
  }

Verify:
  - Status: 201 Created
  - Database: Media URL stored
  - Meta API: Media sent
```

**TEST-WA-004: Message Status Update**
```
Prerequisites: Message sent (status: sent)

Simulate Webhook:
  POST /api/whatsapp/webhook
  {
    "entry": [{
      "changes": [{
        "value": {
          "statuses": [{
            "id": "message_1",
            "status": "delivered"
          }]
        }
      }]
    }]
  }

Verify:
  - Status: 200 OK
  - Database: Message.status = "delivered"
  - Socket.io: Real-time update sent
```

**TEST-WA-005: Incoming Message**
```
Simulate Webhook:
  POST /api/whatsapp/webhook
  {
    "entry": [{
      "changes": [{
        "value": {
          "messages": [{
            "from": "919876543210",
            "id": "msg_123",
            "type": "text",
            "text": { "body": "Hi there" }
          }]
        }
      }]
    }]
  }

Verify:
  - Status: 200 OK (immediate)
  - Database: Message created
  - Database: Contact found/created
  - Contact conversation updated
  - Socket.io: Real-time notification
```

**TEST-WA-006: Auto-Reply**
```
Prerequisites: Auto-reply enabled

Simulate incoming message

Verify:
  - Auto-reply message queued
  - Reply sent to contact
  - Reply status tracked
```

**TEST-WA-007: Rate Limit**
```
Send 100 messages in 1 minute

Verify:
  - After 50: Messages queued
  - Status: 429 Rate Limited
  - Messages: Processed gradually
```

---

### TEST SET 5: BILLING & SUBSCRIPTION

**TEST-BILL-001: Create Free Subscription**
```
Prerequisites: New business

Inputs:
  POST /api/subscriptions
  {
    "plan": "FREE"
  }

Verify:
  - Status: 201 Created
  - Database: Subscription created
  - Database: plan = "FREE"
  - Business: Limits applied (500 contacts, 1000 messages)
```

**TEST-BILL-002: Upgrade to Paid Plan**
```
Prerequisites: Free subscription exists

Inputs:
  POST /api/subscriptions/upgrade
  {
    "plan": "STARTER",
    "paymentMethodId": "pm_xxx"
  }

Verify:
  - Redirect: Razorpay checkout
  - Order: Created with correct amount
```

**TEST-BILL-003: Payment Webhook - Success**
```
Simulate Razorpay webhook:
  POST /api/billing/webhook
  {
    "event": "payment.authorized",
    "payload": {
      "payment": {
        "id": "pay_xxx",
        "order_id": "order_xxx",
        "amount": 99900,
        "status": "authorized"
      }
    }
  }

Verify:
  - Status: 200 OK
  - Signature: Verified
  - Database: Subscription.status = "active"
  - Database: Business.plan = "STARTER"
  - Database: Business.planExpiresAt updated
  - Email: Confirmation sent
```

**TEST-BILL-004: Usage Limit - Contacts**
```
Prerequisites: FREE plan (500 contact limit), 500 contacts exist

Inputs:
  POST /api/contacts
  {
    "name": "Test Contact"
  }

Verify:
  - Status: 400 Limit Exceeded
  - Message: "Contact limit reached"
  - Database: No contact created
```

**TEST-BILL-005: Usage Limit - Messages**
```
Prerequisites: FREE plan (1000 message limit), 1000 messages sent

Inputs:
  POST /api/whatsapp/send
  {
    "contactId": "contact_1",
    "message": "Test"
  }

Verify:
  - Status: 202 Accepted (queued)
  - Message: Queued for later
```

---

## NEXT TEST SETS

- [ ] AI Features (Generation, Fallback, Credits)
- [ ] Email Integration
- [ ] Social Media (Facebook, Instagram, LinkedIn, Twitter)
- [ ] Automations & Workflows
- [ ] n8n Integration
- [ ] Performance Baseline
- [ ] Security (XSS, SQL Injection, CSRF)
- [ ] Error Handling
- [ ] Accessibility

---

## EXECUTION NOTES

- Tests must be run in order for authentication tests
- Each test must clean up its data (or use transactions)
- Database must be reset between test sets
- External services must be mocked where possible
- Real API calls used only for critical integration tests
- All results logged with timestamps
- Screenshots taken for UI tests
- Performance metrics collected

