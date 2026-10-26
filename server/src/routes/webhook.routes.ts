import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { executeZapFromGitHubEvent } from '../services/zap-runner.service';
import {
  findZapWithWebhookSecret,
  isWebhookForwardMode,
} from '../services/zap-webhook.service';
import { decryptSecret } from '../utils/secret-crypto';
import { IZap } from '../models/zap.model';

const router: Router = Router();

type RequestWithRawBody = Request & { rawBody?: Buffer };

/** Bounded set of recent GitHub delivery IDs to skip duplicate executions. */
const MAX_SEEN_DELIVERIES = 2000;
const seenDeliveryIds = new Set<string>();
const seenDeliveryOrder: string[] = [];

/** Claim a delivery id. Returns false if it was already claimed/completed. */
export function rememberDeliveryId(deliveryId: string): boolean {
  if (seenDeliveryIds.has(deliveryId)) {
    return false;
  }
  seenDeliveryIds.add(deliveryId);
  seenDeliveryOrder.push(deliveryId);
  while (seenDeliveryOrder.length > MAX_SEEN_DELIVERIES) {
    const oldest = seenDeliveryOrder.shift();
    if (oldest) {
      seenDeliveryIds.delete(oldest);
    }
  }
  return true;
}

/** Drop a claimed id so a failed execution can be redelivered. */
export function forgetDeliveryId(deliveryId: string): void {
  if (!seenDeliveryIds.delete(deliveryId)) {
    return;
  }
  const index = seenDeliveryOrder.indexOf(deliveryId);
  if (index >= 0) {
    seenDeliveryOrder.splice(index, 1);
  }
}

/** Test helper: clear the delivery-id cache. */
export function clearSeenDeliveryIds(): void {
  seenDeliveryIds.clear();
  seenDeliveryOrder.length = 0;
}

function timingSafeEqualHex(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');
    if (bufA.length !== bufB.length) {
      return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Verify GitHub webhook HMAC (`X-Hub-Signature-256`).
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export function verifyGitHubSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  plaintextSecret: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', plaintextSecret).update(rawBody).digest('hex');

  return timingSafeEqualHex(expected, signatureHeader);
}

/**
 * In `github` mode, require and verify the Zap's webhook secret.
 * In `forward` mode (`gh webhook forward`), skip HMAC — the CLI uses its own secret.
 */
function assertWebhookAuthenticity(
  zap: IZap,
  req: RequestWithRawBody
): { ok: true } | { ok: false; status: number; message: string } {
  if (isWebhookForwardMode()) {
    return { ok: true };
  }

  if (!zap.githubWebhookSecret) {
    return { ok: false, status: 404, message: 'Webhook not found' };
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    return { ok: false, status: 400, message: 'Missing raw body' };
  }

  const plaintextSecret = decryptSecret(
    zap.githubWebhookSecret,
    env.tokenEncryptionKey
  );
  const signature = req.get('X-Hub-Signature-256') ?? undefined;

  if (!verifyGitHubSignature(rawBody, signature, plaintextSecret)) {
    return { ok: false, status: 401, message: 'Invalid signature' };
  }

  return { ok: true };
}

/** Receive GitHub webhook deliveries for a specific Zap. */
router.post('/github/:zapId', async (req: Request, res: Response) => {
  const zapId = String(req.params.zapId ?? '');

  if (!mongoose.isValidObjectId(zapId)) {
    res.status(400).json({ message: 'Invalid Zap id' });
    return;
  }

  const eventName = req.get('X-GitHub-Event');

  try {
    const zap = await findZapWithWebhookSecret(zapId);
    if (!zap) {
      res.status(404).json({ message: 'Webhook not found' });
      return;
    }

    const auth = assertWebhookAuthenticity(zap, req as RequestWithRawBody);
    if (!auth.ok) {
      res.status(auth.status).json({ message: auth.message });
      return;
    }

    // GitHub ping on webhook create — acknowledge without running the Zap.
    if (eventName === 'ping') {
      res.status(200).json({ ok: true });
      return;
    }

    // Ack after verify so action failures do not cause GitHub retries.
    res.status(200).json({ ok: true });

    if (!zap.isOn) {
      return;
    }

    if (eventName !== 'pull_request') {
      return;
    }

    const deliveryId = req.get('X-GitHub-Delivery');
    // Claim up front so concurrent duplicates do not double-execute; release on failure
    // so a later redelivery can retry.
    if (deliveryId && !rememberDeliveryId(deliveryId)) {
      return;
    }

    try {
      await executeZapFromGitHubEvent(zap, req.body);
    } catch (err) {
      if (deliveryId) {
        forgetDeliveryId(deliveryId);
      }
      console.error(`Zap ${zapId} execution failed:`, err);
    }
  } catch (err) {
    console.error('Webhook handling failed:', err);
    if (!res.headersSent) {
      res.status(500).json({ message: 'Webhook handling failed' });
    }
  }
});

export default router;
