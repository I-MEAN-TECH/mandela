import { requireSession, requireBootstrap, getUsersRoles, getPermMatrix, getDuties, getStaffDirectory, getTeamOverview } from "@/lib/api";
import { SerifHeader } from "@mandela/ui";
import { redirect } from "next/navigation";
import { AppLiveBar } from "../../LiveBar";
import { DutiesBoard, JoinCodeCard, PermMatrixTable, UsersTable } from "./UsersClient";

/**
 * Users & Roles 33 + Permissions Matrix 34 + Duties & Appointments 35
 * (docs/BUILD-PHASES.md Phase 2) — one governance screen, three cards.
 * Admin-only for edits; principal reads duties. better-auth/OTP invites
 * land later — the register and lattice are ready for them.
 */
export default async function UsersPage() {
  const me = await requireSession();
  const boot = await requireBootstrap();
  if (me.principal.kind !== "staff") redirect("/app");
  if (!["admin", "principal"].includes(me.principal.role ?? "")) redirect("/app");
  const isAdmin = me.principal.role === "admin";

  const [users, matrix, duties, dir, team] = await Promise.all([
    getUsersRoles(),
    getPermMatrix(),
    getDuties(),
    getStaffDirectory(),
    isAdmin ? getTeamOverview() : Promise.resolve({ error: "admin-only" } as const),
  ]);
  if ("error" in users) redirect("/app/settings");
  if ("error" in duties) redirect("/app/settings");

  const staff = ("error" in dir ? [] : (dir.staff ?? []))
    .filter((s) => s.active)
    .map((s) => ({ id: s.id, name: s.full_name }));

  return (
    <div>
      <SerifHeader
        crumb={`${boot.school.name} / Settings`}
        title={<>Users, roles & hats.</>}
        sub="Who signs in, what they own on the nav, and the hats they wear beyond their role — deputy, discipline master, HOD, patron. Every change audited."
        actions={<AppLiveBar />}
      />

      <div className="mt-s7 grid gap-s3h">
        {isAdmin ? (
          <>
            {!("error" in team) ? <JoinCodeCard team={team} /> : null}
            <UsersTable users={users.users} />
            {!("error" in matrix) ? <PermMatrixTable rows={matrix.rows} /> : null}
          </>
        ) : null}
        <DutiesBoard rows={duties.rows} staff={staff} />
      </div>
    </div>
  );
}
