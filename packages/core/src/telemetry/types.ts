import { z } from 'zod';

export const TelemetryRecordSchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  modelId: z.string(),
  latencyMs: z.number(),
  audioDurationMs: z.number(),
  success: z.boolean(),
  errorCode: z.string().optional(),
});
export type TelemetryRecord = z.infer<typeof TelemetryRecordSchema>;

export interface TelemetryStore {
  list(): Promise<TelemetryRecord[]>;
  add(record: TelemetryRecord): Promise<void>;
  clear(): Promise<void>;
}

export interface BenchmarkRunner {
  run(modelId: string, audio: Uint8Array): Promise<TelemetryRecord>;
}
