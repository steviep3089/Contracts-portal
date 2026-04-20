import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SourceConfig = {
  label: string;
  urlEnv: string;
  keyEnv: string;
};

const SOURCE_CONFIGS: Record<string, SourceConfig> = {
  "maintenance-admin": {
    label: "maintenance-admin",
    urlEnv: "MAINTENANCE_ADMIN_URL",
    keyEnv: "MAINTENANCE_ADMIN_SERVICE_ROLE_KEY",
  },
  "sitebatch-inspections": {
    label: "sitebatch-inspections",
    urlEnv: "SITEBATCH_INSPECTIONS_URL",
    keyEnv: "SITEBATCH_INSPECTIONS_SERVICE_ROLE_KEY",
  },
};

function mapAuthority(role: string | null | undefined) {
  return String(role || "").toLowerCase() === "admin" ? "admin" : "user";
}

function normalizePhoneForMatch(input: string | null | undefined) {
  return String(input || "").trim().replace(/[\s()\-]/g, "").toLowerCase();
}

function buildPersonKey(email: string | null | undefined, phone: string | null | undefined, sourceProject: string, sourceUserId: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (normalizedEmail) return `email:${normalizedEmail}`;

  const normalizedPhone = normalizePhoneForMatch(phone);
  if (normalizedPhone) return `phone:${normalizedPhone}`;

  return `source:${sourceProject}:${sourceUserId}`;
}

function mergeUniqueStrings(existing: string[] | null | undefined, incoming: string[] | null | undefined) {
  const values = [...(existing || []), ...(incoming || [])]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function mergeSourceRefs(existing: any[] | null | undefined, sourceProject: string, sourceUserId: string) {
  const refs = Array.isArray(existing) ? [...existing] : [];
  const key = `${sourceProject}:${sourceUserId}`;
  if (!refs.some((r: any) => `${r?.source_project || ""}:${r?.source_user_id || ""}` === key)) {
    refs.push({ source_project: sourceProject, source_user_id: sourceUserId });
  }
  return refs;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const sourceProject = String(body?.sourceProject || "maintenance-admin");
    const sourceCfg = SOURCE_CONFIGS[sourceProject];

    if (!sourceCfg) {
      return new Response(
        JSON.stringify({ error: `Unsupported source project: ${sourceProject}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const portalUrl = Deno.env.get("SUPABASE_URL");
    const portalServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const sourceUrl = Deno.env.get(sourceCfg.urlEnv);
    const sourceServiceRole = Deno.env.get(sourceCfg.keyEnv);

    if (!portalUrl || !portalServiceRole) {
      return new Response(JSON.stringify({ error: "Missing portal function env vars." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return new Response(JSON.stringify({ error: "Missing bearer token." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!sourceUrl || !sourceServiceRole) {
      return new Response(
        JSON.stringify({ error: `Missing source env vars: ${sourceCfg.urlEnv} / ${sourceCfg.keyEnv}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const sourceClient = createClient(sourceUrl, sourceServiceRole);
    const portalClient = createClient(portalUrl, portalServiceRole);

    const {
      data: { user },
      error: authError,
    } = await portalClient.auth.getUser(token);

    if (authError || !user?.id) {
      return new Response(
        JSON.stringify({ error: `Unauthorized: ${authError?.message || "invalid token"}` }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: roleRow, error: roleError } = await portalClient
      .from("app_user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleError) {
      return new Response(JSON.stringify({ error: `Role lookup failed: ${roleError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerRole = String(roleRow?.role || "").toLowerCase();
    if (!["admin", "manager", "viewer"].includes(callerRole)) {
      return new Response(
        JSON.stringify({ error: `Forbidden: admin, manager, or viewer required. Current role: ${callerRole || "none"}.` }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const [rolesRes, divisionsRes, usersRes, portalUsersRes] = await Promise.all([
      sourceClient.from("user_roles").select("user_id, role"),
      sourceClient.from("user_divisions").select("user_id, divisions(name)"),
      fetch(`${sourceUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
        method: "GET",
        headers: {
          apikey: sourceServiceRole,
          Authorization: `Bearer ${sourceServiceRole}`,
        },
      }),
      fetch(`${portalUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
        method: "GET",
        headers: {
          apikey: portalServiceRole,
          Authorization: `Bearer ${portalServiceRole}`,
        },
      }),
    ]);

    const warnings: string[] = [];
    if (rolesRes.error) warnings.push(`user_roles unavailable: ${rolesRes.error.message}`);
    if (divisionsRes.error) warnings.push(`user_divisions unavailable: ${divisionsRes.error.message}`);

    if (!usersRes.ok) {
      const errText = await usersRes.text();
      return new Response(
        JSON.stringify({ error: `Failed reading source auth users: ${usersRes.status} ${errText}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!portalUsersRes.ok) {
      const errText = await portalUsersRes.text();
      return new Response(
        JSON.stringify({ error: `Failed reading portal auth users: ${portalUsersRes.status} ${errText}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const usersJson = await usersRes.json();
    const usersData = Array.isArray(usersJson?.users) ? usersJson.users : [];
    const portalUsersJson = await portalUsersRes.json();
    const portalUsers = Array.isArray(portalUsersJson?.users) ? portalUsersJson.users : [];

    const portalUserIdByEmail = new Map<string, string>();
    const portalUserIdByPhone = new Map<string, string>();
    portalUsers.forEach((u: any) => {
      const id = String(u?.id || "").trim();
      const email = String(u?.email || "").trim().toLowerCase();
      const phone = normalizePhoneForMatch(u?.phone);
      if (!id) return;
      if (email) portalUserIdByEmail.set(email, id);
      if (phone) portalUserIdByPhone.set(phone, id);
    });

    const divisionsByUser = new Map<string, string[]>();
    ((divisionsRes.data as any[]) || []).forEach((row: any) => {
      const userId = String(row?.user_id || "");
      if (!userId) return;
      const existing = divisionsByUser.get(userId) || [];
      const divisionName = String(row?.divisions?.name || "").trim();
      if (divisionName && !existing.includes(divisionName)) existing.push(divisionName);
      divisionsByUser.set(userId, existing);
    });

    const rolesByUser = new Map<string, string>();
    ((rolesRes.data as any[]) || []).forEach((r: any) => {
      const userId = String(r?.user_id || "");
      if (!userId) return;
      rolesByUser.set(userId, String(r.role || "user"));
    });

    const incomingDirectoryRows = usersData
      .filter((u: any) => !!u?.id)
      .map((u: any) => {
        const sourceUserId = String(u.id);
        const sourceRole = rolesByUser.get(sourceUserId) || "user";
        const authority = mapAuthority(sourceRole);
        const email = String(u?.email || "").trim().toLowerCase() || null;
        const phone = String(u?.phone || "").trim() || null;
        const phoneKey = normalizePhoneForMatch(phone);
        const portalUserId =
          (email ? portalUserIdByEmail.get(email) : "") ||
          (phoneKey ? portalUserIdByPhone.get(phoneKey) : "") ||
          null;
        const regions = divisionsByUser.get(sourceUserId) || [];

        return {
          person_key: buildPersonKey(email, phone, sourceCfg.label, sourceUserId),
          portal_user_id: portalUserId,
          full_name: u?.user_metadata?.display_name || u?.user_metadata?.full_name || null,
          email,
          phone,
          job_role: u?.user_metadata?.job_role || null,
          authority,
          regions,
          source_projects: [sourceCfg.label],
          source_user_refs: [{ source_project: sourceCfg.label, source_user_id: sourceUserId }],
          source_role: String(sourceRole || ""),
        };
      });

    if (incomingDirectoryRows.length === 0) {
      return new Response(
        JSON.stringify({ sourceProject: sourceCfg.label, importedCount: 0, linkedCount: 0, message: "No users found", warnings }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const personKeys = incomingDirectoryRows.map((r: any) => r.person_key);
    const { data: existingDirectoryRows, error: existingDirectoryError } = await portalClient
      .from("people_directory")
      .select("person_key, portal_user_id, full_name, email, phone, job_role, authority, regions, source_projects, source_user_refs")
      .in("person_key", personKeys);

    if (existingDirectoryError) {
      return new Response(
        JSON.stringify({ error: `Failed reading people_directory: ${existingDirectoryError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const existingByKey = new Map<string, any>();
    (existingDirectoryRows || []).forEach((row: any) => {
      existingByKey.set(String(row.person_key), row);
    });

    const directoryRows = incomingDirectoryRows.map((incoming: any) => {
      const existing = existingByKey.get(incoming.person_key);
      const sourceRef = incoming.source_user_refs?.[0] || {};
      return {
        person_key: incoming.person_key,
        portal_user_id: existing?.portal_user_id || incoming.portal_user_id || null,
        full_name: existing?.full_name || incoming.full_name || null,
        email: existing?.email || incoming.email || null,
        phone: existing?.phone || incoming.phone || null,
        job_role: existing?.job_role || incoming.job_role || null,
        authority: existing?.authority === "admin" || incoming.authority === "admin" ? "admin" : "user",
        regions: mergeUniqueStrings(existing?.regions, incoming.regions),
        source_projects: mergeUniqueStrings(existing?.source_projects, incoming.source_projects),
        source_user_refs: mergeSourceRefs(existing?.source_user_refs, String(sourceRef.source_project || ""), String(sourceRef.source_user_id || "")),
      };
    });

    const { error: directoryUpsertError } = await portalClient
      .from("people_directory")
      .upsert(directoryRows, { onConflict: "person_key" });

    if (directoryUpsertError) {
      return new Response(
        JSON.stringify({ error: `Failed upserting people_directory: ${directoryUpsertError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const linkedDirectoryRows = directoryRows.filter((r: any) => !!r.portal_user_id);
    const roleRows = linkedDirectoryRows.map((r: any) => ({
      user_id: r.portal_user_id,
      role: r.authority === "admin" ? "admin" : "viewer",
    }));

    const profileRows = linkedDirectoryRows.map((r: any) => ({
      user_id: r.portal_user_id,
      full_name: r.full_name,
      email: r.email,
      phone: r.phone,
      job_role: r.job_role,
      authority: r.authority,
      regions: r.regions || [],
      source_project: sourceCfg.label,
      source_role: "imported",
      divisions: r.regions || [],
    }));

    const skippedNotLinked = directoryRows.length - linkedDirectoryRows.length;
    if (skippedNotLinked > 0) {
      warnings.push(`${skippedNotLinked} contacts are not linked to contracts auth yet.`);
    }

    if (roleRows.length > 0) {
      const { error: upsertRolesError } = await portalClient
        .from("app_user_roles")
        .upsert(roleRows, { onConflict: "user_id" });

      if (upsertRolesError) {
        return new Response(
          JSON.stringify({ error: `Failed upserting app_user_roles: ${upsertRolesError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { error: upsertProfilesError } = await portalClient
        .from("user_profiles")
        .upsert(profileRows, { onConflict: "user_id" });

      if (upsertProfilesError) {
        return new Response(
          JSON.stringify({ error: `Failed upserting user_profiles: ${upsertProfilesError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        sourceProject: sourceCfg.label,
        importedCount: directoryRows.length,
        linkedCount: roleRows.length,
        warnings,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
