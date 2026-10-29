import { Schema, model, Document, Types } from 'mongoose';

/**
 * Maps data into an action field.
 * - Dynamic: `sourceField` from the trigger (field mapping)
 * - Static: `value` typed directly (same every run)
 */
export interface IFieldMapping {
  targetField: string;
  sourceField?: string;
  value?: string;
}

/** App + event for a Zap trigger or action step. */
export interface IZapStep {
  app: string;
  event: string;
  /** Step setup fields (e.g. repository) configured in the Zap editor. */
  configuration?: Record<string, string>;
  /**
   * Action-only: trigger fields referenced in the message body (e.g. `{{author}}`).
   */
  fieldMappings?: IFieldMapping[];
}

export interface IZap extends Document {
  userId: Types.ObjectId;
  name: string;
  /** When true the Zap is on (published); only new data after publish is processed. */
  isOn: boolean;
  trigger: IZapStep;
  action: IZapStep;
  /** GitHub webhook id for this Zap (set while on). */
  githubWebhookId?: number;
  /** AES-GCM ciphertext of the webhook secret used for HMAC verification. */
  githubWebhookSecret?: string;
  createdAt: Date;
  updatedAt: Date;
}

const fieldMappingSchema = new Schema<IFieldMapping>(
  {
    targetField: { type: String, required: true, trim: true },
    sourceField: { type: String, trim: true },
    value: { type: String, trim: true },
  },
  { _id: false }
);

const zapStepSchema = new Schema<IZapStep>(
  {
    app: { type: String, required: true, trim: true },
    event: { type: String, required: true, trim: true },
    configuration: {
      type: Map,
      of: String,
      default: undefined,
    },
    fieldMappings: { type: [fieldMappingSchema], default: undefined },
  },
  { _id: false }
);

const zapSchema = new Schema<IZap>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    isOn: { type: Boolean, default: false },
    trigger: { type: zapStepSchema, required: true },
    action: { type: zapStepSchema, required: true },
    githubWebhookId: { type: Number },
    githubWebhookSecret: { type: String, select: false },
  },
  { timestamps: true }
);

export const Zap = model<IZap>('Zap', zapSchema);
