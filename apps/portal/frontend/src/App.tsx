/**
 * Application root.
 *
 * The Portal shell owns every route now; QuantBT Backtest is one module inside
 * it rather than the application itself (U03). Feature-level routing lives in
 * `app/PortalRoutes.tsx` and is generated from the Feature Registry.
 */
import { PortalShell } from "./app/PortalShell";
import { PreferencesProvider } from "./app/preferences";
import { AuthGate } from "./auth/AuthGate";

export function App() {
  return (
    <PreferencesProvider>
      {/* U07: the identity BFF decides whether the shell mounts at all. The
        * router lives inside the shell, so the requested deep link survives the
        * login detour without being stored anywhere. */}
      <AuthGate>
        <PortalShell />
      </AuthGate>
    </PreferencesProvider>
  );
}
