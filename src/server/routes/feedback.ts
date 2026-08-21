import { Router } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const router = Router();

/**
 * Public negative-feedback page + API.
 * Customers land here from the review-QR interstitial when they rate 1-3 stars.
 * The form saves feedback to the Review table (resolving the business via the
 * QR slug) and shows a thank-you. Falls back gracefully if the DB is unavailable.
 */
router.get("/", async (req, res) => {
  const rating = req.query.rating || "";
  const qrSlug = (req.query.qr as string) || "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>We value your feedback</title>
<style>
  *{box-sizing:border-box}
  body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}
  .card{background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.08);max-width:440px;width:100%;padding:28px;text-align:center}
  h1{font-size:20px;color:#0f172a;margin:0 0 6px}
  p{color:#64748b;font-size:14px;margin:0 0 16px}
  textarea{width:100%;min-height:120px;padding:12px;border:1px solid #e2e8f0;border-radius:10px;font-family:inherit;font-size:14px;resize:vertical;margin-bottom:12px}
  textarea:focus{outline:none;border-color:#f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.2)}
  .btn{display:inline-block;width:100%;padding:12px 20px;border:none;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none;transition:transform .1s,background .1s}
  .btn-primary{background:#f59e0b;color:#fff}
  .btn-primary:hover{background:#d97706}
  .btn:active{transform:scale(.98)}
  .note{color:#94a3b8;font-size:12px;margin-top:12px}
  #done{display:none}
  .check{font-size:42px;margin:8px 0}
</style>
</head>
<body>
  <div class="card">
    <div id="formWrap">
      <h1>We value your feedback</h1>
      <p>Sorry your experience wasn't perfect. Tell us what we can improve — we read every response.</p>
      <form id="feedbackForm">
        <textarea id="feedback" name="feedback" placeholder="What could we improve?" required></textarea>
        <button type="submit" class="btn btn-primary">Send feedback</button>
      </form>
      <p class="note">${rating ? `You rated ${escapeHtml(String(rating))} star${String(rating) === "1" ? "" : "s"}` : ""}</p>
    </div>
    <div id="done" style="display:none">
      <div class="check">🙏</div>
      <h1>Thank you!</h1>
      <p>Your feedback has been received. We're always working to improve.</p>
    </div>
  </div>
  <script>
    document.getElementById('feedbackForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var text = document.getElementById('feedback').value.trim();
      if (!text) return;
      try {
        await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, rating: ${JSON.stringify(String(rating))}, qrSlug: ${JSON.stringify(qrSlug)} })
        });
      } catch (err) {}
      document.getElementById('formWrap').style.display = 'none';
      document.getElementById('done').style.display = 'block';
    });
  </script>
</body>
</html>`;

  res.type("html").send(html);
});

router.post("/", async (req, res) => {
  try {
    const { message, rating, qrSlug } = req.body || {};
    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    const text = message.trim().slice(0, 2000);
    let saved = false;
    let businessId: string | null = null;

    // Resolve business via QR slug if provided
    if (qrSlug) {
      try {
        const qr = await prisma.reviewQRCode.findUnique({
          where: { slug: String(qrSlug) },
          select: { businessId: true, url: true },
        });
        if (qr) businessId = qr.businessId;
      } catch (e) {
        console.warn("[Feedback] QR lookup failed:", e);
      }
    }

    // Save to Review table (only if we have a business)
    if (businessId) {
      try {
        await prisma.review.create({
          data: {
            businessId,
            platform: "feedback-form",
            reviewerName: "Anonymous",
            rating: rating ? Math.min(Math.max(parseInt(String(rating), 10) || 3, 1), 5) : 3,
            text,
            isPublished: false,
          },
        });
        saved = true;
      } catch (e) {
        console.warn("[Feedback] DB save failed:", e);
      }
    }

    // Always log server-side as a fallback
    console.log(`[Feedback] ${businessId ? `business=${businessId}` : "no-business"} rating=${rating} qr=${qrSlug}: ${text.slice(0, 200)}`);

    res.json({ success: true, saved });
  } catch (error: any) {
    console.error("[Feedback] API error:", error.message);
    res.status(500).json({ success: false, error: "Something went wrong" });
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export default router;
