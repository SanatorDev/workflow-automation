import { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import {
  clearSessionCookie,
  getSessionUserId,
} from '../auth/session';

export interface AuthenticatedRequest extends Request {
  userId: string;
}

/** Require a valid session cookie; sets `req.userId`. */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const userId = getSessionUserId(req);

  if (!userId || !mongoose.isValidObjectId(userId)) {
    if (userId) {
      clearSessionCookie(res);
    }
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }

  (req as AuthenticatedRequest).userId = userId;
  next();
}
