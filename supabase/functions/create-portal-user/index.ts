import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function mapAuthorityToRole(authority: string | null | undefined) {
  return String(authority || "").toLowerCase() === "admin" ? "admin" : "viewer";
}

function normalizePhoneToE164(input: string | null) {
  if (!input) return null;

  const raw = String(input).trim();
  if (!raw) return null;

  // Keep leading + while removing common separators.
  const cleaned = raw.replace(/[\s()\-]/g, "");

  // Already E.164 style.
  if (/^\+[1-9]\d{6,14}$/.test(cleaned)) {
    return cleaned;
  }

  // Convert international prefix 00XXXXXXXX -> +XXXXXXXX.
  if (/^00\d{7,15}$/.test(cleaned)) {
    const converted = `+${cleaned.slice(2)}`;
    if (/^\+[1-9]\d{6,14}$/.test(converted)) return converted;
  }

  // Convert common UK local mobile/landline 0XXXXXXXXXX -> +44XXXXXXXXXX.
  if (/^0\d{9,10}$/.test(cleaned)) {
    const ukConverted = `+44${cleaned.slice(1)}`;
    if (/^\+[1-9]\d{6,14}$/.test(ukConverted)) return ukConverted;
  }

  return null;
}

function buildPersonKey(email: string | null, phone: string | null, fallbackUserId: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (normalizedEmail) return `email:${normalizedEmail}`;

  const normalizedPhone = String(phone || "").trim();
  if (normalizedPhone) return `phone:${normalizedPhone}`;

  return `portal:${fallbackUserId}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const portalUrl = Deno.env.get("SUPABASE_URL");
    const portalServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

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

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim().toLowerCase();
    const displayName = String(body?.displayName || "").trim();
    const phoneInput = body?.phone ? String(body.phone).trim() : null;
    const phone = normalizePhoneToE164(phoneInput);
    const jobRole = body?.jobRole ? String(body.jobRole).trim() : null;
    const employeeNumber = body?.employeeNumber ? String(body.employeeNumber).trim() : null;
    const lineManagerUserId = body?.lineManagerUserId ? String(body.lineManagerUserId).trim() : null;
    const hasDirectReports = body?.hasDirectReports === true;
    const regions = Array.isArray(body?.regions)
      ? body.regions.map((r: unknown) => String(r).trim()).filter(Boolean)
      : [];
    const authority = String(body?.authority || "user").toLowerCase() === "admin" ? "admin" : "user";

    if (!email) {
      return new Response(JSON.stringify({ error: "Email is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!displayName) {
      return new Response(JSON.stringify({ error: "Display name is required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (phoneInput && !phone) {
      return new Response(
        JSON.stringify({ error: "Invalid phone number format. Use +44... (E.164), or UK local format like 07..." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const adminClient = createClient(portalUrl, portalServiceRole);

    const {
      data: { user: caller },
      error: authError,
    } = await adminClient.auth.getUser(token);

    if (authError || !caller?.id) {
      return new Response(
        JSON.stringify({ error: `Unauthorized: ${authError?.message || "invalid token"}` }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: callerRole, error: callerRoleError } = await adminClient
      .from("app_user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (callerRoleError) {
      return new Response(JSON.stringify({ error: `Role lookup failed: ${callerRoleError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerRoleValue = String(callerRole?.role || "").toLowerCase();
    if (!["admin", "manager"].includes(callerRoleValue)) {
      // Bootstrap path: if no privileged users exist yet, allow first authenticated caller
      // and grant them admin so the portal can be initialized.
      const { count: privilegedCount, error: countError } = await adminClient
        .from("app_user_roles")
        .select("user_id", { count: "exact", head: true })
        .in("role", ["admin", "manager"]);

      if (countError) {
        return new Response(JSON.stringify({ error: `Role bootstrap check failed: ${countError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if ((privilegedCount || 0) === 0) {
        const { error: bootstrapError } = await adminClient.from("app_user_roles").upsert(
          {
            user_id: caller.id,
            role: "admin",
          },
          { onConflict: "user_id" }
        );

        if (bootstrapError) {
          return new Response(JSON.stringify({ error: `Bootstrap admin grant failed: ${bootstrapError.message}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        return new Response(
          JSON.stringify({ error: `Forbidden: admin or manager required. Current role: ${callerRoleValue || "none"}.` }),
          {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    const { data: createdUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      phone: phone || undefined,
      email_confirm: true,
      user_metadata: {
        display_name: displayName,
      },
    });

    if (createError || !createdUser?.user?.id) {
      return new Response(JSON.stringify({ error: `Create user failed: ${createError?.message || "unknown"}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const newUserId = createdUser.user.id;

    const { error: roleUpsertError } = await adminClient.from("app_user_roles").upsert(
      {
        user_id: newUserId,
        role: mapAuthorityToRole(authority),
      },
      { onConflict: "user_id" }
    );

    if (roleUpsertError) {
      return new Response(JSON.stringify({ error: `Role upsert failed: ${roleUpsertError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: profileUpsertError } = await adminClient.from("user_profiles").upsert(
      {
        user_id: newUserId,
        full_name: displayName,
        email,
        phone,
        job_role: jobRole,
        authority,
        regions,
        employee_number: employeeNumber,
        line_manager_user_id: lineManagerUserId,
        has_direct_reports: hasDirectReports,
        source_project: "portal",
      },
      { onConflict: "user_id" }
    );

    if (profileUpsertError) {
      return new Response(JSON.stringify({ error: `Profile upsert failed: ${profileUpsertError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const personKey = buildPersonKey(email, phone, newUserId);
    const { error: directoryUpsertError } = await adminClient.from("people_directory").upsert(
      {
        person_key: personKey,
        portal_user_id: newUserId,
        full_name: displayName,
        email,
        phone,
        job_role: jobRole,
        authority,
        regions,
        source_projects: ["portal"],
        source_user_refs: [{ source_project: "portal", source_user_id: newUserId }],
      },
      { onConflict: "person_key" }
    );

    if (directoryUpsertError) {
      return new Response(JSON.stringify({ error: `People directory upsert failed: ${directoryUpsertError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ user_id: newUserId, email }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
