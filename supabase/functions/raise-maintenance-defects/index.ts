import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type IncomingDefect = {
  asset?: string;
  title?: string;
  description?: string;
  category?: string;
  priority?: number | string;
  submitted_by?: string;
  status?: string;
  contract_id?: string | null;
  contract_name?: string | null;
  contract_number?: string | null;
  checklist_item?: string | null;
  machine_reg?: string | null;
  asset_no?: string | null;
  serial_no?: string | null;
  check_date?: string | null;
  photos?: IncomingPhoto[];
};

type IncomingPhoto = {
  name?: string;
  type?: string;
  dataUrl?: string;
};

function toPriority(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 3;
  return Math.min(6, Math.max(1, Math.round(numeric)));
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "photo.jpg";
}

function dataUrlToBytes(dataUrl: string) {
  const parts = String(dataUrl || "").split(",");
  if (parts.length < 2) throw new Error("Invalid image data.");
  const base64 = parts[1];
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

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
      return new Response(JSON.stringify({ success: false, error: "Missing portal function env vars." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!sourceUrl || !sourceServiceRole) {
      return new Response(
        JSON.stringify({
          success: false,
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
      return new Response(JSON.stringify({ success: false, error: "Missing bearer token." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const defects = Array.isArray(body?.defects) ? (body.defects as IncomingDefect[]) : [];

    if (defects.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No defects provided." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const portalClient = createClient(portalUrl, portalServiceRole);
    const maintenanceClient = createClient(sourceUrl, sourceServiceRole);

    const {
      data: { user },
      error: authError,
    } = await portalClient.auth.getUser(token);

    if (authError || !user?.id) {
      return new Response(
        JSON.stringify({ success: false, error: `Unauthorized: ${authError?.message || "invalid token"}` }),
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
      return new Response(JSON.stringify({ success: false, error: `Role lookup failed: ${roleError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerRole = String(roleRow?.role || "viewer").toLowerCase();
    if (!["admin", "manager", "viewer"].includes(callerRole)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `Forbidden: admin, manager, or viewer required. Current role: ${callerRole || "none"}.`,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const rows = defects.map((d) => {
      const title = String(d.title || "").trim();
      const checklistItem = String(d.checklist_item || "").trim();
      const baseTitle = title || checklistItem || "Checklist Defect";
      const description = String(d.description || "").trim();
      const submittedBy = String(d.submitted_by || "").trim() || String(user.email || "Contracts Portal");
      const category = String(d.category || "Checklist Defect").trim() || "Checklist Defect";
      const asset = String(d.asset || d.asset_no || d.machine_reg || "").trim() || "Unknown";

      return {
        asset,
        title: baseTitle,
        description: description || `Defect reported from contracts checklist item: ${baseTitle}`,
        priority: toPriority(d.priority),
        category,
        submitted_by: submittedBy,
        created_by: null,
        status: String(d.status || "Reported").trim() || "Reported",
      };
    });

    const { data: inserted, error: insertError } = await maintenanceClient
      .from("defects")
      .insert(rows)
      .select("id, title, asset, status, photo_urls");

    if (insertError) {
      return new Response(
        JSON.stringify({ success: false, error: `Failed to insert defects: ${insertError.message}` }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const photoWarnings: string[] = [];

    if (Array.isArray(inserted) && inserted.length > 0) {
      for (let defectIndex = 0; defectIndex < inserted.length; defectIndex += 1) {
        const insertedDefect = inserted[defectIndex];
        const incoming = defects[defectIndex];
        const incomingPhotos = Array.isArray(incoming?.photos) ? incoming.photos : [];

        if (!insertedDefect?.id || incomingPhotos.length === 0) continue;

        const uploadedUrls: string[] = [];

        for (let photoIndex = 0; photoIndex < incomingPhotos.length; photoIndex += 1) {
          const photo = incomingPhotos[photoIndex];
          const dataUrl = String(photo?.dataUrl || "");
          if (!dataUrl) continue;

          try {
            const safeName = sanitizeFileName(String(photo?.name || `photo_${photoIndex + 1}.jpg`));
            const filePath = `${insertedDefect.id}_${Date.now()}_${photoIndex}_${safeName}`;
            const contentType = String(photo?.type || "image/jpeg");
            const bytes = dataUrlToBytes(dataUrl);

            const { error: uploadError } = await maintenanceClient.storage
              .from("defect-photos")
              .upload(filePath, bytes, { contentType, upsert: false });

            if (uploadError) {
              photoWarnings.push(`Upload failed for defect ${insertedDefect.id}: ${uploadError.message}`);
              continue;
            }

            const { data: signedData, error: signedError } = await maintenanceClient.storage
              .from("defect-photos")
              .createSignedUrl(filePath, 60 * 60 * 24 * 365);

            if (signedError || !signedData?.signedUrl) {
              photoWarnings.push(
                `Signed URL failed for defect ${insertedDefect.id}: ${signedError?.message || "no url"}`
              );
              continue;
            }

            uploadedUrls.push(signedData.signedUrl);
          } catch (photoError) {
            photoWarnings.push(
              `Photo processing failed for defect ${insertedDefect.id}: ${photoError instanceof Error ? photoError.message : "unknown error"}`
            );
          }
        }

        if (uploadedUrls.length > 0) {
          const { error: updateError } = await maintenanceClient
            .from("defects")
            .update({ photo_urls: uploadedUrls })
            .eq("id", insertedDefect.id);

          if (updateError) {
            photoWarnings.push(`Could not save photo URLs for defect ${insertedDefect.id}: ${updateError.message}`);
          } else {
            insertedDefect.photo_urls = uploadedUrls;
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        createdCount: Array.isArray(inserted) ? inserted.length : 0,
        defects: inserted || [],
        photoWarnings,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
