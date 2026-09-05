/**
 * Sanitizes the nested ProfileRead diagnostic object when a richer product BFF
 * includes it as `current_source`.  The source read itself remains useful to
 * panels, but its raw checkpoint and relation labels are server-only drain
 * details.  Keep the local epoch/sequence/digest and capability state so the
 * product can still explain freshness and typed availability.
 */
export function browserSafeProfileRead(source: Record<string, unknown>): Record<string, unknown> {
  const projection = record(source.projection);
  const capabilities = Array.isArray(source.capabilities)
    ? source.capabilities.map((capability) => {
      if (!record(capability)) return capability;
      const { relations: _relations, ...safeCapability } = capability;
      return safeCapability;
    })
    : source.capabilities;
  return {
    ...source,
    ...(projection ? {
      projection: {
        ...projection,
        // Preserve the response shape for existing clients while withholding
        // raw Manager checkpoints. Portal-signed continuations are the only
        // browser paging tokens.
        sourceCursor: null,
        source_cursor: null,
      },
    } : {}),
    ...(capabilities !== undefined ? { capabilities } : {}),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
