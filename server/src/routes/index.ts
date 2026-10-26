import { Router } from 'express';
import authRoutes from './auth.routes';
import githubRoutes from './github.routes';
import healthRoutes from './health.routes';
import webhookRoutes from './webhook.routes';
import zapRoutes from './zap.routes';

const router: Router = Router();

router.use('/auth', authRoutes);
router.use('/github', githubRoutes);
router.use('/health', healthRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/zaps', zapRoutes);

export default router;
