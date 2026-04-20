import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const portalUrl = Deno.env.get("SUPABASE_URL");
    const portalServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const sourceUrl = Deno.env.get("MAINTENANCE_ADMIN_URL");
    const sourceServiceRole = Deno.env.get("MAINTENANCE_ADMIN_SERVICE_ROLE_KEY");

    if (!portalUrl || !portalServiceRole) {
      return new Response(JSON.stringify({ error: "Missing portal function env vars." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!sourceUrl || !sourceServiceRole) {
      return new Response(
        JSON.stringify({
          error: "Missing source env vars: MAINTENANCE_ADMIN_URL / MAINTENANCE_ADMIN_SERVICE_ROLE_KEY",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
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

    const portalClient = createClient(portalUrl, portalServiceRole);
    const sourceClient = createClient(sourceUrl, sourceServiceRole);

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

    const callerRole = String(roleRow?.role || "viewer").toLowerCase();
    if (![
      "admin",
      "manager",
      "viewer",
    ].includes(callerRole)) {
      return new Response(
        JSON.stringify({ error: `Forbidden: admin, manager, or viewer required. Current role: ${callerRole || "none"}.` }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data, error } = await sourceClient
      .from("plant_assets")
      .select("asset_code, serial_number, machine_reg, is_active")
      .eq("is_active", true)
      .order("asset_code", { ascending: true });

    if (error) {
      return new Response(
        JSON.stringify({ error: `Failed to load maintenance assets: ${error.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const assets = (data || []).map((row: any) => ({
      asset_no: String(row?.asset_code || "").trim(),
      serial_no: String(row?.serial_number || "").trim(),
      machine_reg: String(row?.machine_reg || "").trim(),
    }));

    return new Response(JSON.stringify({ success: true, assets }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
