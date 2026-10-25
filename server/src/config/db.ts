import mongoose from 'mongoose';

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connected = 'connected',
  Connecting = 'connecting',
  Disconnecting = 'disconnecting',
}

const CONNECTION_STATES: Record<number, ConnectionState> = {
  0: ConnectionState.Disconnected,
  1: ConnectionState.Connected,
  2: ConnectionState.Connecting,
  3: ConnectionState.Disconnecting,
};

export async function connectDB(uri: string): Promise<void> {
  await mongoose.connect(uri);
}

export function getMongoStatus(): string {
  return CONNECTION_STATES[mongoose.connection.readyState] ?? 'unknown';
}

export function getMongoHealthMessage(): string {
  const status = getMongoStatus();
  return status === ConnectionState.Connected
    ? 'MongoDB connection is established'
    : `MongoDB connection state: ${status}`;
}
