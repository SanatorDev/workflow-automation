import cors from 'cors';
import express, { Application, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { env } from './config/env';
import apiRoutes from './routes';

const app: Application = express();

app.use(
  cors({
    origin: env.clientOrigin,
    credentials: true,
  })
);
app.use(express.json());
app.use('/api', apiRoutes);

/** Serves the Angular build. Call only from bootstrap; no-ops outside production. */
export function configureProductionClient(): void {
  if (env.nodeEnv !== 'production') {
    return;
  }

  const clientDist = path.resolve(__dirname, '../../client/dist/client/browser');

  if (!fs.existsSync(clientDist)) {
    throw new Error(
      `Client build not found at ${clientDist}. Run "pnpm build" before "pnpm start:server".`
    );
  }

  app.use(express.static(clientDist));

  app.get('*', (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }

    // Avoid masking missing hashed assets (JS/CSS/images) with index.html
    if (path.extname(req.path)) {
      res.status(404).end();
      return;
    }

    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

export default app;
