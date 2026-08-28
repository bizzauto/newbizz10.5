# BIZZ CRM - RATE LIMIT & EXPONENTIAL BACKOFF INTEGRATION GUIDE

**Context**: 2026-08-27T20:23:06.325Z  
**Topic**: Implementing robust rate limit handling for Google APIs and external services  
**Urgency**: Critical for production (prevents service blocking)  
**Status**: Integration guide provided

---

## 🎯 PROBLEM STATEMENT

### Current Risk in BIZZ CRM

**External API Integrations**:
- ✅ Google Business Profile API
- ✅ Google Sheets API
- ✅ Google OAuth
- ✅ Meta WhatsApp API
- ✅ Razorpay API
- ✅ OpenAI / OpenRouter
- ✅ Replicate API

**Current Issue**:
- ❌ No exponential backoff implemented
- ❌ Hammer API on 429 errors
- ❌ Service blocking risk
- ❌ Cascading failures possible

**Impact if Not Fixed**:
- APIs temporarily block requests
- User operations timeout
- Webhooks fail
- Queue jobs retry infinitely
- System becomes unstable

---

## ✅ SOLUTION: EXPONENTIAL BACKOFF IMPLEMENTATION

### Your Python Snippet (Excellent Reference)

```python
import time
import random

def call_google_api_with_backoff(api_request_function, max_retries=5):
    base_delay = 2.0  # Start with 2-second pause
    
    for attempt in range(max_retries):
        try:
            return api_request_function()
        except Exception as e:
            # Check for 429 status code
            if "429" in str(e) and attempt < max_retries - 1:
                # Exponential delay with jitter
                delay = (base_delay ** attempt) + random.uniform(0.5, 1.5)
                print(f"Rate limit (429) hit. Retrying in {delay:.2f} seconds...")
                time.sleep(delay)
            else:
                raise e
```

**What This Does**:
1. ✅ Detects 429 (Too Many Requests)
2. ✅ Exponential backoff: 2s, 4s, 8s, 16s, 32s
3. ✅ Adds randomized jitter (0.5-1.5s)
4. ✅ Prevents thundering herd
5. ✅ Max 5 retries
6. ✅ Fails gracefully after retries exhausted

---

## 🔧 TYPESCRIPT IMPLEMENTATION FOR BIZZ CRM

### Location: `src/server/utils/api-retry.ts`

```typescript
import { sleep } from './helpers';
import { logger } from '../middleware/logging';

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  jitterMin?: number;
  jitterMax?: number;
  timeoutMs?: number;
}

export class RateLimitError extends Error {
  constructor(message: string, public retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Execute API request with exponential backoff and jitter
 * Handles rate limiting (429) gracefully
 */
export async function callApiWithBackoff<T>(
  apiFunction: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 5,
    baseDelay = 2.0,
    jitterMin = 0.5,
    jitterMax = 1.5,
    timeoutMs = 30000,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Execute with timeout
      return await executeWithTimeout(apiFunction, timeoutMs);
    } catch (error: any) {
      lastError = error;

      // Check if it's a rate limit error (429)
      const isRateLimitError = 
        error?.status === 429 ||
        error?.response?.status === 429 ||
        error?.message?.includes('429') ||
        error?.message?.includes('Too Many Requests') ||
        error?.code === 'RATE_LIMIT_EXCEEDED';

      const isLastAttempt = attempt === maxRetries - 1;

      if (isRateLimitError && !isLastAttempt) {
        // Calculate exponential backoff with jitter
        const exponentialDelay = Math.pow(baseDelay, attempt);
        const jitter = Math.random() * (jitterMax - jitterMin) + jitterMin;
        const totalDelay = exponentialDelay + jitter;

        // Extract retry-after header if available
        const retryAfter = extractRetryAfter(error);
        const delayMs = (retryAfter || totalDelay) * 1000;

        logger.warn({
          message: 'Rate limit hit (429)',
          attempt: attempt + 1,
          maxRetries,
          delaySeconds: delayMs / 1000,
          service: error.service || 'unknown',
        });

        // Wait before retry
        await sleep(delayMs);
      } else if (isRateLimitError && isLastAttempt) {
        // All retries exhausted for rate limit
        logger.error({
          message: 'Rate limit retries exhausted',
          attempts: maxRetries,
          service: error.service || 'unknown',
        });

        throw new RateLimitError(
          `Rate limited after ${maxRetries} attempts`,
          extractRetryAfter(error)
        );
      } else {
        // Not a rate limit error, fail immediately
        throw error;
      }
    }
  }

  throw lastError || new Error('Unknown error after retries');
}

/**
 * Execute function with timeout
 */
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Operation timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    ),
  ]);
}

/**
 * Extract Retry-After header if present
 */
function extractRetryAfter(error: any): number | undefined {
  // Check common header locations
  const headers = error?.response?.headers || error?.headers || {};
  const retryAfter = headers['retry-after'];

  if (!retryAfter) return undefined;

  // Retry-After can be in seconds or HTTP-date format
  const seconds = parseInt(retryAfter, 10);
  return isNaN(seconds) ? undefined : seconds;
}
```

---

## 🔗 INTEGRATION WITH EXTERNAL APIs

### Google APIs Integration: `src/server/services/google-api-wrapper.ts`

```typescript
import { callApiWithBackoff } from '../utils/api-retry';
import { google } from 'googleapis';

export class GoogleApiWrapper {
  private auth: any;

  async getBusinessProfile(accountId: string, locationId: string) {
    return callApiWithBackoff(
      async () => {
        const mybusinessaccountmanagement = google.mybusinessaccountmanagement(
          {
            version: 'v1',
            auth: this.auth,
          }
        );

        const response = await mybusinessaccountmanagement.locations.get({
          name: `accounts/${accountId}/locations/${locationId}`,
        });

        return response.data;
      },
      {
        maxRetries: 5,
        baseDelay: 2.0,
        timeoutMs: 15000,
      }
    );
  }

  async publishPost(accountId: string, locationId: string, content: any) {
    return callApiWithBackoff(
      async () => {
        const mybusiness = google.mybusiness({
          version: 'v4',
          auth: this.auth,
        });

        const response = await mybusiness.accounts.locations.posts.create({
          parent: `accounts/${accountId}/locations/${locationId}`,
          requestBody: {
            summary: content.text,
            media: content.media,
          },
        });

        return response.data;
      },
      {
        maxRetries: 5,
        baseDelay: 2.0,
        timeoutMs: 20000,
      }
    );
  }
}
```

### OpenAI API Integration: `src/server/services/ai-gateway.ts`

```typescript
import { callApiWithBackoff } from '../utils/api-retry';
import { Configuration, OpenAIApi } from 'openai';

export class AIGateway {
  private openai: OpenAIApi;

  async generateContent(prompt: string, model: string = 'gpt-3.5-turbo') {
    return callApiWithBackoff(
      async () => {
        const response = await this.openai.createChatCompletion({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 500,
        });

        return response.data.choices[0].message;
      },
      {
        maxRetries: 3,
        baseDelay: 1.0,
        timeoutMs: 30000,
      }
    );
  }

  async generateImage(prompt: string) {
    return callApiWithBackoff(
      async () => {
        const response = await this.openai.createImage({
          prompt,
          n: 1,
          size: '1024x1024',
        });

        return response.data.data[0];
      },
      {
        maxRetries: 3,
        baseDelay: 2.0,
        timeoutMs: 60000,
      }
    );
  }
}
```

### WhatsApp/Meta API Integration: `src/server/services/whatsapp-api.ts`

```typescript
import { callApiWithBackoff } from '../utils/api-retry';
import axios from 'axios';

export class WhatsAppAPI {
  async sendMessage(
    phoneNumberId: string,
    accessToken: string,
    recipient: string,
    message: string
  ) {
    return callApiWithBackoff(
      async () => {
        const response = await axios.post(
          `https://graph.instagram.com/v18.0/${phoneNumberId}/messages`,
          {
            messaging_product: 'whatsapp',
            to: recipient,
            type: 'text',
            text: { body: message },
          },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          }
        );

        return response.data;
      },
      {
        maxRetries: 5,
        baseDelay: 1.0,
        timeoutMs: 10000,
      }
    );
  }

  async sendBulkMessages(
    phoneNumberId: string,
    accessToken: string,
    recipients: Array<{ phone: string; message: string }>
  ) {
    const results = [];

    for (const { phone, message } of recipients) {
      try {
        const result = await this.sendMessage(
          phoneNumberId,
          accessToken,
          phone,
          message
        );
        results.push({ phone, status: 'sent', id: result.messages[0].id });
      } catch (error: any) {
        if (error instanceof RateLimitError) {
          // Queue remaining messages for later
          logger.warn(`Rate limited. Queueing ${recipients.length} messages`);
          return {
            sent: results,
            queued: recipients.slice(results.length),
            error: 'RATE_LIMIT',
          };
        }
        results.push({ phone, status: 'failed', error: error.message });
      }
    }

    return { sent: results, queued: [], error: null };
  }
}
```

---

## 🧠 QUEUE JOB INTEGRATION

### BullMQ Job Handler: `src/server/workers/send-message.worker.ts`

```typescript
import { Queue, Worker } from 'bullmq';
import { callApiWithBackoff } from '../utils/api-retry';
import { RateLimitError } from '../utils/api-retry';

const messageQueue = new Queue('send-message', {
  connection: redis,
});

const worker = new Worker('send-message', async (job) => {
  const { contactId, phone, message } = job.data;

  try {
    // Use exponential backoff for API call
    const result = await callApiWithBackoff(
      async () => {
        return whatsappApi.sendMessage(
          business.waPhoneNumberId,
          business.waAccessToken,
          phone,
          message
        );
      },
      {
        maxRetries: 5,
        baseDelay: 2.0,
        timeoutMs: 15000,
      }
    );

    return {
      success: true,
      messageId: result.messages[0].id,
    };
  } catch (error: any) {
    if (error instanceof RateLimitError) {
      // Re-queue job for later with exponential backoff
      const delay = (error.retryAfter || 60) * 1000;
      
      throw new Error(
        `Rate limited. Will retry in ${delay}ms. ${error.message}`
      );
      // BullMQ will automatically re-queue with exponential backoff
    }

    throw error;
  }
});

// Configure retry strategy
worker.on('failed', (job, err) => {
  if (job?.attemptsMade! < 5) {
    logger.warn(`Job ${job?.id} failed. Retrying...`, {
      attempt: job?.attemptsMade,
      error: err.message,
    });
  } else {
    logger.error(`Job ${job?.id} failed after 5 attempts`, {
      error: err.message,
    });
  }
});
```

---

## 📊 MONITORING & METRICS

### Metrics Collection: `src/server/middleware/api-metrics.ts`

```typescript
import { promClient } from './prometheus';

export const rateLimitCounter = new promClient.Counter({
  name: 'api_rate_limit_errors_total',
  help: 'Total rate limit (429) errors by service',
  labelNames: ['service', 'endpoint'],
});

export const retryCounter = new promClient.Counter({
  name: 'api_retries_total',
  help: 'Total API retries by service',
  labelNames: ['service', 'attempt'],
});

export const retryDurationHistogram = new promClient.Histogram({
  name: 'api_retry_duration_seconds',
  help: 'Duration of API retries by service',
  labelNames: ['service'],
  buckets: [1, 2, 4, 8, 16, 32, 60],
});

export function trackRateLimitError(service: string, endpoint: string) {
  rateLimitCounter.inc({ service, endpoint });
}

export function trackRetry(service: string, attempt: number) {
  retryCounter.inc({ service, attempt: attempt.toString() });
}

export function trackRetryDuration(service: string, durationMs: number) {
  retryDurationHistogram.observe({ service }, durationMs / 1000);
}
```

---

## ✅ TESTING THE IMPLEMENTATION

### Test: `tests/api-retry.test.ts`

```typescript
import { callApiWithBackoff, RateLimitError } from '../src/server/utils/api-retry';

describe('API Retry with Exponential Backoff', () => {
  it('should retry on 429 error', async () => {
    let attempts = 0;

    const mockApi = async () => {
      attempts++;
      if (attempts < 3) {
        const error: any = new Error('Too Many Requests');
        error.status = 429;
        throw error;
      }
      return { success: true };
    };

    const result = await callApiWithBackoff(mockApi, {
      maxRetries: 5,
      baseDelay: 0.1, // Short delay for testing
    });

    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
  });

  it('should fail after max retries', async () => {
    const mockApi = async () => {
      const error: any = new Error('Too Many Requests');
      error.status = 429;
      throw error;
    };

    await expect(
      callApiWithBackoff(mockApi, { maxRetries: 2, baseDelay: 0.1 })
    ).rejects.toThrow(RateLimitError);
  });

  it('should fail immediately on non-429 errors', async () => {
    const mockApi = async () => {
      throw new Error('Invalid request');
    };

    await expect(callApiWithBackoff(mockApi)).rejects.toThrow('Invalid request');
  });

  it('should respect Retry-After header', async () => {
    let attempts = 0;

    const mockApi = async () => {
      attempts++;
      if (attempts === 1) {
        const error: any = new Error('Too Many Requests');
        error.status = 429;
        error.response = {
          headers: { 'retry-after': '5' },
        };
        throw error;
      }
      return { success: true };
    };

    const startTime = Date.now();
    const result = await callApiWithBackoff(mockApi, { maxRetries: 5 });
    const duration = Date.now() - startTime;

    expect(result.success).toBe(true);
    expect(duration).toBeGreaterThanOrEqual(5000);
  });
});
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Before Production:

- [ ] Import `callApiWithBackoff` utility
- [ ] Wrap all external API calls with retry logic
- [ ] Configure appropriate `maxRetries` per API
- [ ] Configure `baseDelay` per API SLA
- [ ] Setup Prometheus metrics collection
- [ ] Setup alerts for rate limit errors
- [ ] Test retry logic with mock 429 responses
- [ ] Verify queue jobs re-queue on rate limit
- [ ] Monitor real-world rate limit events
- [ ] Document retry policies per API
- [ ] Train team on rate limit handling

### APIs to Update:

- [ ] Google Business Profile API
- [ ] Google Sheets API
- [ ] Google OAuth
- [ ] Meta WhatsApp API
- [ ] Razorpay API
- [ ] OpenAI API
- [ ] Replicate API
- [ ] Any other external APIs

---

## 📈 EXPECTED IMPACT

### Before Implementation:
```
❌ 429 errors crash requests
❌ Users see timeouts
❌ Queue jobs retry infinitely
❌ Service blocking occurs
❌ Cascading failures possible
```

### After Implementation:
```
✅ 429 errors handled gracefully
✅ Automatic exponential backoff
✅ Users experience brief delays
✅ Queue jobs re-queue properly
✅ Service recovers automatically
✅ No cascading failures
```

---

## 📋 INTEGRATION PRIORITY

### By Thursday (2026-08-30) - Load Testing Day:

**High Priority** (MUST include):
- Google APIs (Business Profile, Sheets)
- WhatsApp/Meta API
- OpenAI/AI Gateway

**Medium Priority** (SHOULD include):
- Razorpay API
- Replicate API

**Can be Added Later**:
- Other non-critical APIs

---

**Status**: Ready to implement before production launch 🚀

