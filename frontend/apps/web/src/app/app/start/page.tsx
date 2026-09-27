import { requireSession, requireBootstrap, getStartState, getPrincipalHat } from "@/lib/api";
import { redirect } from "next/navigation";
import { StartClient } from "./StartClient";

/**
 * /app/start — the post-login interstitial (spec §4.2). Un-landed staff
 * confirm their role ("You're joining as Teacher — wrong? undo") and land on
 * their perm_matrix.landing route. Landed visitors are redirected straight
 * there; guardians get the family link-code card instead (they have no role).
 */
export default async function StartPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  const state = await getStartState();

  if (!state || state.error) {
    // The school DB didn't answer — never trap the user here.
    redirect("/app");
  }

  if (state.landed) {
    // Landed staff go straight to their landing route; guardians see the
    // link-code card (state.landing is "/app" for them).
    if (me.principal.kind === "staff") redirect(state.landing ?? "/app");
    return (
      <StartClient
        kind="guardian"
        schoolName={boot.school.name}
        roleName=""
        landing="/app"
        hasHat={false}
      />
    );
  }

  const isStaff = me.principal.kind === "staff";
  const hasHat = isStaff ? await getPrincipalHat().catch(() => false) : false;

  return (
    <StartClient
      kind={me.principal.kind}
      schoolName={state.schoolName ?? boot.school.name}
      roleName={state.roleName ?? state.role ?? ""}
      landing={state.landing ?? "/app"}
      hasHat={hasHat}
    />
  );
}
