import { Tracer, type LunaUnload } from "@luna/core";

// Kept in its own module so queue/statusPill can use the tracer & unloads
// without importing index.ts (which imports them back).
export const { errSignal, trace } = Tracer("[QueuedDownloader]");
export const unloads = new Set<LunaUnload>();
