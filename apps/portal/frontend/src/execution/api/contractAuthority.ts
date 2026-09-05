import { readContractAuthority, type ContractAuthorityResponse } from "../screenDataContract";

/** Same-origin metadata consumer; it cannot reach Edge/Trading System directly. */
export async function fetchContractAuthority(
  workspaceId?: string,
  signal?: AbortSignal,
): Promise<ContractAuthorityResponse | null> {
  const query = workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : "";
  let response: Response;
  try {
    response = await fetch(`/api/v1/execution/contract-authority${query}`, {
      signal,
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;
  try {
    return readContractAuthority(await response.json());
  } catch {
    return null;
  }
}
