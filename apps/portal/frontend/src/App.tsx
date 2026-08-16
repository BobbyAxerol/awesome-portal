/**
 * Application root.
 *
 * The Portal shell owns every route now; QuantBT Research is one module inside
 * it rather than the application itself (U03). Feature-level routing lives in
 * `app/PortalRoutes.tsx` and is generated from the Feature Registry.
 */
import { PortalShell } from "./app/PortalShell";
import { PreferencesProvider } from "./app/preferences";

export function App() {
  return (
    <PreferencesProvider>
      <PortalShell />
    </PreferencesProvider>
  );
}
