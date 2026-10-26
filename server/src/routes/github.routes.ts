import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import {
  AuthenticatedRequest,
  requireAuth,
} from '../middleware/require-auth';
import { User } from '../models/user.model';
import { fetchGitHubRepos } from '../services/github-oauth.service';
import { decryptSecret } from '../utils/secret-crypto';

const router: Router = Router();

router.use(requireAuth);

function userIdOf(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

/** List GitHub repositories for the current session user. */
router.get('/repos', async (req: Request, res: Response) => {
  try {
    const user = await User.findById(userIdOf(req)).select('+accessToken');

    if (!user?.accessToken) {
      res.status(403).json({
        message: 'GitHub access token missing; sign out and sign in again',
      });
      return;
    }

    const accessToken = decryptSecret(user.accessToken, env.tokenEncryptionKey);
    const repos = await fetchGitHubRepos(accessToken);

    res.json(
      repos.map((repo) => ({
        id: repo.id,
        fullName: repo.full_name,
        private: repo.private,
      }))
    );
  } catch (err) {
    console.error('Failed to list GitHub repos:', err);
    res.status(502).json({ message: 'Failed to list GitHub repositories' });
  }
});

export default router;
