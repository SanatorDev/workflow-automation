import { env } from './config/env';
import app, { configureProductionClient } from './app';
import { connectDB } from './config/db';

function sanitizeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return message.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, '[redacted-uri]');
}

async function start(): Promise<void> {
  const uri = env.mongodbUri;

  if (!uri) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  configureProductionClient();

  try {
    await connectDB(uri);
    console.log('Connected to MongoDB');
  } catch {
    console.error('MongoDB connection failed');
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`Server listening on http://localhost:${env.port}`);
  });
}

start().catch((error) => {
  console.error('Server failed to start:', sanitizeErrorMessage(error));
  process.exit(1);
});
