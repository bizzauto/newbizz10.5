# BIZZ CRM - DETAILED FEATURE SPECIFICATIONS & TEST PLANS

**Generated**: 2026-08-27T19:35:01Z  
**Status**: SPECIFICATION PHASE  

---

## MODULE 1: AUTHENTICATION & AUTHORIZATION

### SPEC-AUTH-001: User Registration

**Feature ID**: AUTH-001  
**Module**: Authentication  
**Priority**: P1 CRITICAL  
**Complexity**: HIGH  

#### Preconditions
- Application running
- Database available
- SMTP configured (for email verification)

#### Input Specification
```typescript
{
  email: string (valid email format)
  password: string (min 8 chars, uppercase, lowercase, number, special char)
  name: string (2-100 chars)
  phone?: string (optional)
  businessName: string (1-100 chars)
  businessType: string (enum)
}
```

#### Expected Behavior
1. Validate input format
2. Check email uniqueness
3. Hash password (bcryptjs)
4. Create User record
5. Create Business record
6. Create Subscription record (FREE plan)
7. Send verification email
8. Return success response with auth token
9. Set session cookie

#### Failure Cases
```
InvalidEmail → 400 "Invalid email format"
DuplicateEmail → 409 "Email already registered"
WeakPassword → 400 "Password does not meet requirements"
InvalidBusinessType → 400 "Invalid business type"
DatabaseError → 500 "Internal server error"
EmailServiceDown → 500 "Email service unavailable"
```

#### Security Requirements
- NO password stored in logs
- NO sensitive data in response
- Rate limit: 5 requests/hour per IP
- CSRF token required
- Email verification token expires 24h
- Password stored with bcrypt (min 10 rounds)

#### Test Cases (8 total)

| ID | Test Case | Input | Expected | Status |
|----|-----------|-------|----------|--------|
| AUTH-001-TC01 | Valid registration | Standard valid data | 201 + User created + Email sent | PENDING |
| AUTH-001-TC02 | Duplicate email | Registered email | 409 Conflict | PENDING |
| AUTH-001-TC03 | Weak password | 'pass123' | 400 Invalid password | PENDING |
| AUTH-001-TC04 | Invalid email | 'notanemail' | 400 Invalid email | PENDING |
| AUTH-001-TC05 | Missing required field | No businessName | 400 Validation error | PENDING |
| AUTH-001-TC06 | SQL injection attempt | email: "'; DROP TABLE users;--" | 400 Invalid | PENDING |
| AUTH-001-TC07 | XSS attempt | name: "<script>alert('xss')</script>" | Sanitized/400 | PENDING |
| AUTH-001-TC08 | Rate limit exceeded | 6 requests in 1 hour | 429 Too Many Requests | PENDING |

#### Regression Tests
- Existing users unaffected
- Email uniqueness maintained
- Plan correctly assigned
- Timestamps accurate

---

### SPEC-AUTH-002: User Login

**Feature ID**: AUTH-002  
**Module**: Authentication  
**Priority**: P1 CRITICAL  

#### Input Specification
```typescript
{
  email: string
  password: string
}
```

#### Expected Behavior
1. Validate credentials
2. Check account active
3. Check email verified
4. Generate JWT access token (7d expiry)
5. Generate JWT refresh token (90d expiry)
6. Set HttpOnly secure cookie
7. Update lastLoginAt timestamp
8. Return access token
9. Log login event

#### Failure Cases
```
InvalidCredentials → 401 "Invalid email or password"
AccountInactive → 403 "Account disabled"
EmailNotVerified → 403 "Please verify your email"
TooManyAttempts → 429 "Too many login attempts"
DatabaseError → 500 "Server error"
```

#### Security Requirements
- Rate limit: 5 failed attempts → 15 min lockout
- NO password echo in response
- NO token in log files
- JWT signed with HS256
- HttpOnly, Secure, SameSite cookies
- CSRF token verification

#### Test Cases (6 total)

| ID | Test Case | Expected |
|----|-----------|----------|
| AUTH-002-TC01 | Valid credentials | 200 + token + refresh token |
| AUTH-002-TC02 | Invalid password | 401 Unauthorized |
| AUTH-002-TC03 | Invalid email | 401 Unauthorized |
| AUTH-002-TC04 | Account inactive | 403 Forbidden |
| AUTH-002-TC05 | Email not verified | 403 Forbidden |
| AUTH-002-TC06 | Rate limit (5 failures) | 429 after 5th attempt |

---

### SPEC-AUTH-003: Token Refresh

**Feature ID**: AUTH-003  
**Module**: Authentication  
**Priority**: P1 CRITICAL  

#### Expected Behavior
1. Validate refresh token
2. Check token not revoked
3. Generate new access token
4. Return new token
5. NO new refresh token (reuse existing)

#### Test Cases (4 total)
- Valid refresh token → 200 + new access token
- Expired refresh token → 401 Unauthorized
- Invalid token format → 401 Unauthorized
- Token revoked → 401 Unauthorized

---

### SPEC-AUTH-004: Multi-Tenant Isolation

**Feature ID**: AUTH-004  
**Module**: Authorization  
**Priority**: P1 CRITICAL  
**Risk**: HIGH SECURITY  

#### Test Scenario
1. Create Tenant A with User A
2. Create Tenant B with User B
3. User A logs in
4. User A attempts to access Tenant B resources
5. Verify Tenant B data NOT accessible

#### Expected Behavior
- ALL queries filtered by businessId
- NO cross-tenant data leakage
- API returns 403 Forbidden for unauthorized tenant access
- Audit log records unauthorized attempt

#### Test Cases (8 total)

| ID | Resource | User A Access | User B Access | Expected |
|----|----------|---------------|---------------|----------|
| AUTH-004-TC01 | Contact List | Tenant A | Tenant B | 403 Forbidden |
| AUTH-004-TC02 | Deal | Tenant A | Tenant B | 403 Forbidden |
| AUTH-004-TC03 | Message | Tenant A | Tenant B | 403 Forbidden |
| AUTH-004-TC04 | Settings | Tenant A | Tenant B | 403 Forbidden |
| AUTH-004-TC05 | Analytics | Tenant A | Tenant B | 403 Forbidden |
| AUTH-004-TC06 | Webhook | Tenant A | Tenant B | 403 Forbidden |
| AUTH-004-TC07 | API Key | Tenant A | Tenant B | 403 Forbidden |
| AUTH-004-TC08 | Reports | Tenant A | Tenant B | 403 Forbidden |

---

## MODULE 2: CRM CORE - CONTACTS

### SPEC-CRM-CONTACT-001: Create Contact

**Feature ID**: CRM-CONTACT-001  
**Module**: CRM  
**Priority**: P1 CRITICAL  

#### Input Specification
```typescript
{
  name: string (1-100 chars, required)
  phone: string (optional, unique per business)
  email: string (optional, valid format)
  company: string (optional)
  title: string (optional)
  designation: string (optional)
  city: string (optional)
  state: string (optional)
  tags: string[] (optional)
  customFields: Record<string, any> (optional)
  source: string (default: "manual")
}
```

#### Expected Behavior
1. Validate input
2. Check phone/email uniqueness per business
3. Create Contact record
4. Assign to default pipeline/stage
5. Log activity
6. Return created contact
7. Update totalContacts counter

#### Database Verification
```sql
SELECT * FROM "Contact" 
WHERE id = '{contactId}' 
AND "businessId" = '{businessId}'
```

Should return:
- Correct businessId
- Correct name
- Correct phone (unique check)
- Correct email (unique check)
- Timestamps accurate
- status = "active"
- createdAt matches response time

#### Test Cases (8 total)

| ID | Scenario | Input | Expected | Verify |
|----|----------|-------|----------|--------|
| CRM-CONTACT-001-TC01 | Valid minimal | {name, businessId} | 201 Created | DB record exists |
| CRM-CONTACT-001-TC02 | Valid complete | All fields | 201 Created | All fields saved |
| CRM-CONTACT-001-TC03 | Duplicate phone | Same phone | 409 Conflict | No duplicate created |
| CRM-CONTACT-001-TC04 | Duplicate email | Same email | 409 Conflict | No duplicate created |
| CRM-CONTACT-001-TC05 | Invalid email | 'notanemail' | 400 Invalid | Contact not created |
| CRM-CONTACT-001-TC06 | Missing name | {phone} | 400 Invalid | Contact not created |
| CRM-CONTACT-001-TC07 | Long name | 200+ chars | 400 Invalid | Contact not created |
| CRM-CONTACT-001-TC08 | XSS in name | "<script>alert('xss')</script>" | Sanitized | Contact created, name safe |

#### UI Test Cases (3 total)
- Form renders correctly
- Submit button disabled while loading
- Success notification shown
- Form resets after submit

---

### SPEC-CRM-CONTACT-002: View Contacts List

**Feature ID**: CRM-CONTACT-002  
**Module**: CRM  
**Priority**: P1 CRITICAL  

#### Expected Behavior
1. Fetch contacts for business
2. Apply filters (if provided)
3. Apply search (if provided)
4. Apply sort (if provided)
5. Apply pagination
6. Return contacts with count

#### Pagination Specification
```typescript
{
  limit: number (default: 20, max: 100)
  offset: number (default: 0)
  total: number
}
```

#### Search Specification
- Search by: name, email, phone, company
- Case-insensitive
- Partial match supported
- SQL: ILIKE %query%

#### Filter Specification
```typescript
{
  status?: "active" | "archived" | "all"
  source?: string
  tags?: string[]
  source?: string
}
```

#### Sort Specification
```typescript
{
  sortBy: "name" | "createdAt" | "lastMessageAt"
  order: "asc" | "desc"
}
```

#### Test Cases (7 total)

| ID | Test Case | Expected |
|----|-----------|----------|
| CRM-CONTACT-002-TC01 | List all contacts | 200 + array of contacts |
| CRM-CONTACT-002-TC02 | Search by name | 200 + filtered results |
| CRM-CONTACT-002-TC03 | Search by email | 200 + filtered results |
| CRM-CONTACT-002-TC04 | Filter by status | 200 + status-filtered |
| CRM-CONTACT-002-TC05 | Pagination (limit 10) | 200 + 10 items max |
| CRM-CONTACT-002-TC06 | Sort by name ASC | 200 + sorted results |
| CRM-CONTACT-002-TC07 | Combine search+filter+sort | 200 + correct combo |

#### Database Performance Test
- Test with 100,000 contacts
- Measure query time < 500ms
- Verify indexes used
- Check N+1 queries

---

### SPEC-CRM-CONTACT-003: Edit Contact

**Feature ID**: CRM-CONTACT-003  
**Module**: CRM  
**Priority**: P1 CRITICAL  

#### Input Specification
```typescript
{
  id: string (required)
  name?: string
  phone?: string
  email?: string
  company?: string
  tags?: string[]
  customFields?: Record<string, any>
  status?: "active" | "archived"
}
```

#### Expected Behavior
1. Validate contact exists
2. Verify tenant ownership
3. Check new phone/email not duplicate (excluding self)
4. Update contact fields
5. Update updatedAt timestamp
6. Log activity
7. Return updated contact

#### Database Verification
```sql
SELECT * FROM "Contact" WHERE id = '{id}'
```
- updatedAt should be current time
- No fields should be NULL unless allowed
- Version/timestamp fields correct

#### Test Cases (6 total)

| ID | Test Case | Expected |
|----|-----------|----------|
| CRM-CONTACT-003-TC01 | Update name | 200 + name updated |
| CRM-CONTACT-003-TC02 | Update phone (valid) | 200 + phone updated |
| CRM-CONTACT-003-TC03 | Update phone (duplicate) | 409 Conflict |
| CRM-CONTACT-003-TC04 | Update tags | 200 + tags updated |
| CRM-CONTACT-003-TC05 | Update status to archived | 200 + status archived |
| CRM-CONTACT-003-TC06 | Update non-existent contact | 404 Not Found |

---

### SPEC-CRM-CONTACT-004: Delete Contact

**Feature ID**: CRM-CONTACT-004  
**Module**: CRM  
**Priority**: P1 CRITICAL  

#### Expected Behavior (Soft Delete)
1. Set status = "archived"
2. Update deletedAt timestamp
3. Contact hidden from listings by default
4. Contact still in database (for compliance)
5. Relationships maintained (no cascading delete)

#### Test Cases (5 total)

| ID | Test Case | Expected |
|----|-----------|----------|
| CRM-CONTACT-004-TC01 | Delete contact | 200 + soft delete |
| CRM-CONTACT-004-TC02 | List excludes deleted | 200 + no deleted contact |
| CRM-CONTACT-004-TC03 | Direct access (deleted) | 404 Not Found |
| CRM-CONTACT-004-TC04 | Data in DB preserved | Database query finds contact |
| CRM-CONTACT-004-TC05 | Delete non-existent | 404 Not Found |

---

### SPEC-CRM-CONTACT-005: Bulk Contact Operations

**Feature ID**: CRM-CONTACT-005  
**Module**: CRM  
**Priority**: P1 CRITICAL  

#### Operations
1. Bulk Create (CSV import)
2. Bulk Update (Status, Tags)
3. Bulk Delete (Archive)
4. Bulk Export (CSV)

#### CSV Import Specification
```
name,phone,email,company,source
John Doe,919876543210,john@example.com,ACME,CSV
Jane Smith,919876543211,jane@example.com,XYZ,CSV
```

#### Expected Behavior
1. Validate CSV format
2. Validate rows (email, phone format)
3. Skip duplicates (log skipped count)
4. Create bulk job
5. Process asynchronously (queue)
6. Return job ID
7. Send email when complete

#### Test Cases (6 total)

| ID | Test Case | Data | Expected |
|----|-----------|------|----------|
| CRM-CONTACT-005-TC01 | Import valid CSV | 100 rows | 201 + job created |
| CRM-CONTACT-005-TC02 | Import with duplicates | 50 rows, 10 dupes | 201 + 40 created, 10 skipped |
| CRM-CONTACT-005-TC03 | Import with invalid emails | 20 rows, 5 invalid | 201 + 15 created, 5 skipped |
| CRM-CONTACT-005-TC04 | Export contacts | 100 contacts | 200 + CSV file |
| CRM-CONTACT-005-TC05 | Bulk update tags | 50 contacts | 200 + all updated |
| CRM-CONTACT-005-TC06 | Bulk delete | 30 contacts | 200 + all archived |

#### Queue Verification
- Job created in BullMQ
- Status tracking in database
- Email notification sent
- Audit log updated
- File stored correctly

---

## MODULE 3: WHATSAPP INTEGRATION

### SPEC-WA-CONN-001: WhatsApp Connection

**Feature ID**: WA-CONN-001  
**Module**: WhatsApp  
**Priority**: P1 CRITICAL  
**Risk**: HIGH - External API dependency  

#### Connection Flow
1. Generate QR code
2. User scans QR with phone
3. Meta verifies phone number
4. Receive WABA ID
5. Receive access token
6. Store encrypted in database
7. Verify connection active
8. Enable messaging

#### Expected Behavior
1. GET /api/whatsapp/qr → Generate QR code
2. Webhook receives connection data
3. POST /api/whatsapp/connect → Store credentials
4. Verify access token valid
5. Fetch phone numbers
6. Return success

#### Database Verification
```sql
SELECT "wabaId", "waAccessToken", "waPhoneNumber", "waPhoneNumberId"
FROM "Business" WHERE id = '{businessId}'
```

All should be populated and encrypted.

#### Test Cases (8 total)

| ID | Test Case | Expected | Verify |
|----|-----------|----------|--------|
| WA-CONN-001-TC01 | Generate QR code | 200 + QR image | QR valid format |
| WA-CONN-001-TC02 | Store connection data | 200 + connected | DB fields populated |
| WA-CONN-001-TC03 | Access token valid | 200 + verified | Token working |
| WA-CONN-001-TC04 | Invalid token | 400 Error | Connection not stored |
| WA-CONN-001-TC05 | Expired token | 401 Expired | Requires re-auth |
| WA-CONN-001-TC06 | WABA already connected | 409 Conflict | Cannot double-connect |
| WA-CONN-001-TC07 | Verify connection active | 200 + "connected" | Status endpoint works |
| WA-CONN-001-TC08 | Disconnect WhatsApp | 200 + disconnected | Token revoked |

#### Security Test Cases
- Token not logged
- Token encrypted at rest
- HTTPS required
- Webhook signature verified

---

### SPEC-WA-MSG-001: Send WhatsApp Message

**Feature ID**: WA-MSG-001  
**Module**: WhatsApp  
**Priority**: P1 CRITICAL  

#### Input Specification
```typescript
{
  contactId: string (required)
  phone: string (E.164 format: +919876543210)
  type: "text" | "template" | "media" (required)
  message?: string (for text)
  templateId?: string (for template)
  media?: {
    type: "image" | "video" | "document"
    url: string
  }
}
```

#### Expected Behavior
1. Validate contact exists
2. Validate phone format (E.164)
3. Check WhatsApp connection active
4. Check message rate limit
5. Create Message record (pending)
6. Send to Meta API
7. Receive message ID
8. Update Message status to "sent"
9. Queue webhook listener
10. Return message ID

#### Message Status Flow
```
pending → sent → delivered → read / failed
```

#### Database Verification
```sql
SELECT * FROM "Message" WHERE id = '{messageId}'
```

Should have:
- contactId
- businessId
- type: "whatsapp"
- status: "sent"
- externalId (Meta message ID)
- createdAt timestamp
- deliveredAt nullable

#### Test Cases (10 total)

| ID | Test Case | Phone | Expected | Verify |
|----|-----------|-------|----------|--------|
| WA-MSG-001-TC01 | Send valid text | +919876543210 | 201 Message created | Message ID returned |
| WA-MSG-001-TC02 | Send template | +919876543210 | 201 Message created | Template used |
| WA-MSG-001-TC03 | Send image | +919876543210 | 201 Message created | Media URL stored |
| WA-MSG-001-TC04 | Invalid phone format | '919876543210' | 400 Invalid | Message not sent |
| WA-MSG-001-TC05 | Contact not found | Unknown ID | 404 Not Found | No message created |
| WA-MSG-001-TC06 | WhatsApp not connected | No WABA ID | 400 Not connected | Message queued/fails |
| WA-MSG-001-TC07 | Rate limit exceeded | 100 msgs/min | 429 Rate limited | Message rejected |
| WA-MSG-001-TC08 | Meta API error | API down | 500 API error | Message stored as "failed" |
| WA-MSG-001-TC09 | Bulk send (100 messages) | Multiple contacts | 201 All queued | All in database |
| WA-MSG-001-TC10 | Send with media URL invalid | Bad URL | 400 Invalid | Message not sent |

#### UI Test Cases (3 total)
- Message form renders
- Send button functional
- Success notification shown
- Message appears in conversation
- Typing indicator shows

---

### SPEC-WA-MSG-002: Receive WhatsApp Message

**Feature ID**: WA-MSG-002  
**Module**: WhatsApp  
**Priority**: P1 CRITICAL  

#### Webhook Payload (Meta)
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "field": "messages",
      "value": {
        "messaging_product": "whatsapp",
        "from": "919876543210",
        "id": "MESSAGE_ID",
        "timestamp": "1234567890",
        "type": "text",
        "text": { "body": "Hello" }
      }
    }]
  }]
}
```

#### Expected Behavior
1. Receive webhook POST
2. Verify webhook signature
3. Parse message data
4. Find/create Contact
5. Find/create Conversation
6. Create Message record
7. Trigger automations
8. Send reply if auto-reply enabled
9. Return 200 OK immediately (no processing delay)
10. Queue AI processing async

#### Database Verification
```sql
SELECT * FROM "Message" WHERE "externalId" = '{metaMessageId}'
```

Should have:
- contactId correctly linked
- direction: "incoming"
- type: "whatsapp"
- status: "received"
- content parsed correctly
- timestamp accurate

#### Test Cases (8 total)

| ID | Test Case | Payload | Expected |
|----|-----------|---------|----------|
| WA-MSG-002-TC01 | Valid text message | Standard payload | 200 OK + Message created |
| WA-MSG-002-TC02 | Invalid signature | Wrong signature | 403 Forbidden |
| WA-MSG-002-TC03 | Duplicate webhook | Same message ID twice | 200 OK + One message only |
| WA-MSG-002-TC04 | Unknown contact | New phone | 200 OK + Contact created |
| WA-MSG-002-TC05 | Auto-reply enabled | Setup auto-reply | 200 OK + Reply queued |
| WA-MSG-002-TC06 | AI processing triggered | Setup AI reply | 200 OK + AI queued |
| WA-MSG-002-TC07 | Message with media | Image attachment | 200 OK + Media saved |
| WA-MSG-002-TC08 | Message with location | Location coordinates | 200 OK + Location stored |

---

### SPEC-WA-MSG-003: Message Status Updates

**Feature ID**: WA-MSG-003  
**Module**: WhatsApp  
**Priority**: P1 CRITICAL  

#### Webhook Status Payload
```json
{
  "entry": [{
    "changes": [{
      "value": {
        "statuses": [{
          "id": "MESSAGE_ID",
          "status": "sent|delivered|read|failed",
          "timestamp": "1234567890"
        }]
      }
    }]
  }]
}
```

#### Status Mapping
```
sent → Message reached Meta servers
delivered → Message reached user's phone
read → User opened/read message
failed → Message could not be delivered
```

#### Expected Behavior
1. Receive status webhook
2. Verify signature
3. Find Message record
4. Update status
5. Update timestamp
6. Trigger notifications
7. Update UI in real-time (Socket.io)

#### Test Cases (5 total)

| ID | Status | Expected |
|----|--------|----------|
| WA-MSG-003-TC01 | sent → delivered | Status updated + timestamp |
| WA-MSG-003-TC02 | delivered → read | Status updated + timestamp |
| WA-MSG-003-TC03 | sent → failed | Status updated + error logged |
| WA-MSG-003-TC04 | Duplicate status | No double update |
| WA-MSG-003-TC05 | Status for unknown message | Error logged, no crash |

---

## MODULE 4: BILLING & SUBSCRIPTION

### SPEC-BILL-SUB-001: Subscription Creation

**Feature ID**: BILL-SUB-001  
**Module**: Billing  
**Priority**: P1 CRITICAL  

#### Plan Tiers
```
FREE:    0 INR/month, 500 contacts, 1000 messages
STARTER: 999 INR/month, 5000 contacts, 10000 messages
GROWTH:  2999 INR/month, 20000 contacts, 50000 messages
PRO:     4999 INR/month, unlimited contacts, unlimited messages
AGENCY:  9999 INR/month, multi-team, white-label
```

#### Expected Behavior
1. User selects plan
2. Redirect to Razorpay
3. Razorpay returns order ID
4. Store Subscription record (pending)
5. User completes payment
6. Razorpay sends webhook
7. Verify payment signature
8. Update Subscription status to "active"
9. Update Business plan field
10. Send confirmation email
11. Redirect to dashboard

#### Database Verification
```sql
SELECT * FROM "Subscription" WHERE "businessId" = '{businessId}'
```

Should have:
- plan: selected plan
- status: "active"
- startDate: current date
- endDate: one month later
- razorpaySubscriptionId: valid ID

Also check Business table:
- plan: updated to new plan
- contactsLimit: updated
- messagesLimit: updated
- planExpiresAt: updated

#### Test Cases (10 total)

| ID | Plan | Payment | Expected | Verify |
|----|------|---------|----------|--------|
| BILL-SUB-001-TC01 | FREE (no payment) | None | 200 + Subscription | DB record created |
| BILL-SUB-001-TC02 | STARTER | Success | 200 + Subscription | Payment ID saved |
| BILL-SUB-001-TC03 | GROWTH | Success | 200 + Subscription | Limits updated |
| BILL-SUB-001-TC04 | PRO | Success | 200 + Subscription | Plan limits applied |
| BILL-SUB-001-TC05 | STARTER | Failed | 400 Payment failed | Subscription not created |
| BILL-SUB-001-TC06 | Trial active | Attempt upgrade | 400 Cannot upgrade | Trial active |
| BILL-SUB-001-TC07 | Invalid plan | Unknown plan | 400 Invalid plan | Subscription not created |
| BILL-SUB-001-TC08 | Duplicate order | Same order twice | 200 Idempotent | One subscription |
| BILL-SUB-001-TC09 | Webhook delayed | Payment processed before webhook | 200 OK | Status updated when webhook arrives |
| BILL-SUB-001-TC10 | Invalid signature | Fake webhook | 403 Forbidden | Subscription not updated |

#### Security Test Cases
- Webhook signature verified (HMAC SHA256)
- NO sensitive data in logs
- Amount verified matches plan price
- Signature replay prevention

---

### SPEC-BILL-PAY-001: Razorpay Webhook Processing

**Feature ID**: BILL-PAY-001  
**Module**: Billing  
**Priority**: P1 CRITICAL  

#### Webhook Event: payment.authorized
```json
{
  "event": "payment.authorized",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_XXXXX",
        "order_id": "order_XXXXX",
        "amount": 99900,
        "currency": "INR",
        "status": "authorized"
      }
    }
  }
}
```

#### Expected Behavior
1. Receive webhook
2. Verify signature with RAZORPAY_WEBHOOK_SECRET
3. Extract payment data
4. Find Subscription record by order_id
5. Verify amount matches
6. Update Subscription status to "active"
7. Update Business.planExpiresAt
8. Send confirmation email
9. Log audit entry
10. Return 200 OK

#### Test Cases (7 total)

| ID | Event | Signature | Expected |
|----|-------|-----------|----------|
| BILL-PAY-001-TC01 | payment.authorized | Valid | 200 OK + Subscription updated |
| BILL-PAY-001-TC02 | payment.failed | Valid | 200 OK + Subscription remains pending |
| BILL-PAY-001-TC03 | Invalid signature | Wrong | 403 Forbidden |
| BILL-PAY-001-TC04 | Amount mismatch | 99900 vs 100000 | 400 Amount mismatch |
| BILL-PAY-001-TC05 | Order not found | Unknown order | 404 Not found |
| BILL-PAY-001-TC06 | Duplicate event | Same payment ID | Idempotent, no double charge |
| BILL-PAY-001-TC07 | Webhook timeout | > 60 seconds | Process anyway, async |

---

### SPEC-BILL-USAGE-001: Usage Tracking & Limits

**Feature ID**: BILL-USAGE-001  
**Module**: Billing  
**Priority**: P1 CRITICAL  

#### Usage Metrics
```
Contacts created → Check against contactsLimit
Messages sent → Check against messagesLimit
AI credits used → Check against aiCreditsLimit
```

#### Expected Behavior
1. On contact create: Increment totalContacts
2. Check against contactsLimit
3. If exceeded: Prevent creation, return error
4. On message send: Increment totalMessages
5. Check against messagesLimit
6. If exceeded: Queue message, notify user
7. On AI call: Decrement aiCreditsUsed
8. Check against aiCreditsLimit
9. If exceeded: Deny request, suggest upgrade

#### Test Cases (8 total)

| ID | Action | Limit | Status | Expected |
|----|--------|-------|--------|----------|
| BILL-USAGE-001-TC01 | Create contact | 500 limit, 499 used | OK | 200 Created, counter incremented |
| BILL-USAGE-001-TC02 | Create contact | 500 limit, 500 used | EXCEEDED | 400 Limit exceeded |
| BILL-USAGE-001-TC03 | Send message | 1000 limit, 999 used | OK | 200 Sent |
| BILL-USAGE-001-TC04 | Send message | 1000 limit, 1000 used | EXCEEDED | Message queued |
| BILL-USAGE-001-TC05 | AI call | 100 credits, 99 used | OK | AI call proceeds |
| BILL-USAGE-001-TC06 | AI call | 100 credits, 100 used | EXCEEDED | 400 Credits exhausted |
| BILL-USAGE-001-TC07 | Upgrade plan | Increase limits | OK | Limits updated immediately |
| BILL-USAGE-001-TC08 | Usage counter | Multiple operations | Accurate | Counters in sync with DB |

#### Database Verification
```sql
SELECT "totalContacts", "totalMessages", "aiCreditsUsed"
FROM "Business" WHERE id = '{businessId}'
```

Should match actual counts in Message and Contact tables.

---

## CRITICAL CROSS-TENANT TEST MATRIX

### SPEC-SEC-TENANT-001: Cross-Tenant Data Isolation

**Feature ID**: SEC-TENANT-001  
**Module**: Security  
**Priority**: P0 CRITICAL - SHOWSTOPPER  

#### Test Setup
```
Tenant A: Business ID = biz_AAAA
User A: email = user.a@test.com

Tenant B: Business ID = biz_BBBB
User B: email = user.b@test.com

Data:
- Contact in A: contact_1111
- Deal in A: deal_1111
- Message in A: msg_1111
```

#### Test Matrix (16 critical tests)

| ID | Data Type | User A Create | User B Access | Expected | Status |
|----|-----------|---------------|---------------|----------|--------|
| SEC-TENANT-001-TC01 | Contact | ✓ In A | ✓ From B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC02 | Contact | ✓ In A | ✓ List from B | No A data | PENDING |
| SEC-TENANT-001-TC03 | Contact | ✓ In A | ✓ Edit from B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC04 | Contact | ✓ In A | ✓ Delete from B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC05 | Deal | ✓ In A | ✓ From B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC06 | Deal | ✓ In A | ✓ Edit from B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC07 | Message | ✓ In A | ✓ From B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC08 | Message | ✓ In A | ✓ List from B | No A data | PENDING |
| SEC-TENANT-001-TC09 | API Key | ✓ In A | ✓ From B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC10 | Webhook | ✓ In A | ✓ From B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC11 | Settings | ✓ In A | ✓ From B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC12 | Analytics | ✓ In A | ✓ From B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC13 | Report | ✓ In A | ✓ Download from B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC14 | WhatsApp Cred | ✓ In A | ✓ From B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC15 | AI Memory | ✓ In A | ✓ From B | 403 Forbidden | PENDING |
| SEC-TENANT-001-TC16 | Custom Fields | ✓ In A | ✓ From B | 403 Forbidden | PENDING |

#### Pass Criteria
- **ALL 16 tests MUST PASS**
- **ANY failure = P0 BUG - PRODUCTION HALT**

---

## NEXT SECTIONS TO COMPLETE

- [ ] AI Feature Specifications (AI-GEN-001, AI-CAP-001, etc.)
- [ ] Social Media Specifications
- [ ] Email Integration Specifications
- [ ] n8n Workflow Specifications
- [ ] Performance Baseline Tests
- [ ] Error Handling Tests
- [ ] Security Tests
- [ ] Accessibility Tests

---

**Total Feature Specifications**: 40+  
**Total Test Cases**: 200+  
**Status**: IN PROGRESS  

