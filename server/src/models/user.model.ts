import { Schema, model, Document } from 'mongoose';

export interface IUser extends Document {
  githubId: number;
  login: string;
  name?: string;
  email?: string;
  /** AES-GCM ciphertext of the GitHub OAuth access token (never store plaintext). */
  accessToken: string;
}

const userSchema = new Schema<IUser>({
  githubId: { type: Number, required: true, unique: true },
  login: { type: String, required: true },
  name: String,
  email: String,
  accessToken: { type: String, required: true, select: false },
});

export const User = model<IUser>('User', userSchema);
