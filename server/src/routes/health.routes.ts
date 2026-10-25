import { Router, Request, Response } from 'express';
import {
  ConnectionState,
  getMongoHealthMessage,
  getMongoStatus,
} from '../config/db';

const router: Router = Router();

router.get('/', (_req: Request, res: Response) => {
  const status = getMongoStatus();
  const connected = status === ConnectionState.Connected;

  res.status(connected ? 200 : 503).json({
    mongo: status,
    message: getMongoHealthMessage(),
  });
});

export default router;
