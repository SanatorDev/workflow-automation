import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import {
  AuthenticatedRequest,
  requireAuth,
} from '../middleware/require-auth';
import { IFieldMapping, IZap, IZapStep, Zap } from '../models/zap.model';

function userIdOf(req: Request): string {
  return (req as AuthenticatedRequest).userId;
}

const router: Router = Router();

router.use(requireAuth);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const GITHUB_APP = 'GitHub';

function isGitHubApp(app: string): boolean {
  return app.toLowerCase() === GITHUB_APP.toLowerCase();
}

/** Canonicalize known apps so casing cannot bypass GitHub-only rules. */
function normalizeApp(app: string): string {
  return isGitHubApp(app) ? GITHUB_APP : app;
}

function parseStep(
  value: unknown,
  label: 'trigger' | 'action'
): { ok: true; step: IZapStep } | { ok: false; message: string } {
  if (!value || typeof value !== 'object') {
    return { ok: false, message: `${label} is required` };
  }

  const record = value as Record<string, unknown>;
  if (!isNonEmptyString(record.app) || !isNonEmptyString(record.event)) {
    return {
      ok: false,
      message: `${label} must include non-empty app and event`,
    };
  }

  const configuration = parseConfiguration(record.configuration, label);
  if (!configuration.ok) {
    return configuration;
  }

  const app = normalizeApp(record.app.trim());
  if (
    isGitHubApp(app) &&
    !isNonEmptyString(configuration.value.repository)
  ) {
    return {
      ok: false,
      message: `${label} must include a repository when using GitHub`,
    };
  }

  // Field mappings are action-only (trigger outputs → action inputs).
  let fieldMappings: IFieldMapping[] = [];
  if (label === 'action') {
    const parsed = parseFieldMappings(record.fieldMappings, label);
    if (!parsed.ok) {
      return parsed;
    }
    fieldMappings = parsed.mappings;
  }

  return {
    ok: true,
    step: {
      app,
      event: record.event.trim(),
      ...(Object.keys(configuration.value).length > 0
        ? { configuration: configuration.value }
        : {}),
      ...(fieldMappings.length > 0 ? { fieldMappings } : {}),
    },
  };
}

function parseConfiguration(
  value: unknown,
  label: string
):
  | { ok: true; value: Record<string, string> }
  | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: true, value: {} };
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    return {
      ok: false,
      message: `${label} configuration must be an object`,
    };
  }

  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry !== 'string') {
      return {
        ok: false,
        message: `${label} configuration values must be strings`,
      };
    }
    const trimmedKey = key.trim();
    // Keep body text as-authored (only strip surrounding whitespace).
    const trimmedValue =
      trimmedKey === 'body' ? entry.replace(/^\s+|\s+$/g, '') : entry.trim();
    if (trimmedKey && trimmedValue) {
      result[trimmedKey] = trimmedValue;
    }
  }

  return { ok: true, value: result };
}

function parseFieldMappings(
  value: unknown,
  label = 'action'
): { ok: true; mappings: IFieldMapping[] } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, mappings: [] };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false,
      message: `${label} fieldMappings must be an array`,
    };
  }

  const mappings: IFieldMapping[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return { ok: false, message: 'Each field mapping must be an object' };
    }

    const record = item as Record<string, unknown>;
    if (!isNonEmptyString(record.targetField)) {
      return {
        ok: false,
        message: 'Each field mapping needs a non-empty targetField',
      };
    }

    const sourceField = isNonEmptyString(record.sourceField)
      ? record.sourceField.trim()
      : undefined;
    const staticValue =
      typeof record.value === 'string' ? record.value : undefined;

    if (!sourceField && staticValue === undefined) {
      return {
        ok: false,
        message:
          'Each field mapping needs a sourceField (dynamic) or value (static)',
      };
    }

    mappings.push({
      targetField: record.targetField.trim(),
      ...(sourceField ? { sourceField } : {}),
      ...(staticValue !== undefined ? { value: staticValue } : {}),
    });
  }

  return { ok: true, mappings };
}

function parseZapBody(body: unknown):
  | {
      ok: true;
      data: {
        name: string;
        isOn: boolean;
        trigger: IZapStep;
        action: IZapStep;
      };
    }
  | { ok: false; message: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, message: 'Request body is required' };
  }

  const record = body as Record<string, unknown>;

  if (!isNonEmptyString(record.name)) {
    return { ok: false, message: 'name is required' };
  }

  if (typeof record.isOn !== 'boolean') {
    return { ok: false, message: 'isOn must be a boolean' };
  }

  const trigger = parseStep(record.trigger, 'trigger');
  if (!trigger.ok) {
    return trigger;
  }

  const action = parseStep(record.action, 'action');
  if (!action.ok) {
    return action;
  }

  return {
    ok: true,
    data: {
      name: record.name.trim(),
      isOn: record.isOn,
      trigger: trigger.step,
      action: action.step,
    },
  };
}

function stepToJson(step: IZapStep) {
  const configuration =
    step.configuration instanceof Map
      ? Object.fromEntries(step.configuration.entries())
      : (step.configuration ?? {});

  return {
    app: step.app,
    event: step.event,
    configuration,
    ...(step.fieldMappings && step.fieldMappings.length > 0
      ? { fieldMappings: step.fieldMappings }
      : {}),
  };
}

function toZapJson(zap: IZap) {
  return {
    id: zap.id,
    name: zap.name,
    isOn: zap.isOn,
    trigger: stepToJson(zap.trigger),
    action: stepToJson(zap.action),
    createdAt: zap.createdAt,
    updatedAt: zap.updatedAt,
  };
}

/** List Zaps for the current user. */
router.get('/', async (req: Request, res: Response) => {
  try {
    const zaps = await Zap.find({ userId: userIdOf(req) }).sort({
      updatedAt: -1,
    });
    res.json(zaps.map(toZapJson));
  } catch (err) {
    console.error('Failed to list zaps:', err);
    res.status(500).json({ message: 'Failed to list zaps' });
  }
});

/** Get one Zap owned by the current user. */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: 'Invalid Zap id' });
    return;
  }

  try {
    const zap = await Zap.findOne({ _id: id, userId: userIdOf(req) });
    if (!zap) {
      res.status(404).json({ message: 'Zap not found' });
      return;
    }
    res.json(toZapJson(zap));
  } catch (err) {
    console.error('Failed to load zap:', err);
    res.status(500).json({ message: 'Failed to load zap' });
  }
});

/** Create a Zap for the current user. */
router.post('/', async (req: Request, res: Response) => {
  const parsed = parseZapBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message });
    return;
  }

  try {
    const zap = await Zap.create({
      userId: userIdOf(req),
      ...parsed.data,
    });
    res.status(201).json(toZapJson(zap));
  } catch (err) {
    console.error('Failed to create zap:', err);
    res.status(500).json({ message: 'Failed to create zap' });
  }
});

/** Update a Zap owned by the current user. */
router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: 'Invalid Zap id' });
    return;
  }

  const parsed = parseZapBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ message: parsed.message });
    return;
  }

  try {
    const zap = await Zap.findOneAndUpdate(
      { _id: id, userId: userIdOf(req) },
      { $set: parsed.data },
      { new: true, runValidators: true }
    );

    if (!zap) {
      res.status(404).json({ message: 'Zap not found' });
      return;
    }

    res.json(toZapJson(zap));
  } catch (err) {
    console.error('Failed to update zap:', err);
    res.status(500).json({ message: 'Failed to update zap' });
  }
});

/** Delete a Zap owned by the current user. */
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: 'Invalid Zap id' });
    return;
  }

  try {
    const result = await Zap.findOneAndDelete({
      _id: id,
      userId: userIdOf(req),
    });
    if (!result) {
      res.status(404).json({ message: 'Zap not found' });
      return;
    }
    res.status(204).end();
  } catch (err) {
    console.error('Failed to delete zap:', err);
    res.status(500).json({ message: 'Failed to delete zap' });
  }
});

export default router;
