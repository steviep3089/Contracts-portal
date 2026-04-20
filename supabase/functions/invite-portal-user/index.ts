import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GMAIL_USER = Deno.env.get("GMAIL_USER") || "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendViaGmail(to: string, subject: string, html: string) {
  const conn = await Deno.connectTls({
    hostname: "smtp.gmail.com",
    port: 465,
  });

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function readLine(conn: Deno.TlsConn): Promise<string> {
    const buf = new Uint8Array(1024);
    const n = await conn.read(buf);
    if (!n) return "";
    return decoder.decode(buf.subarray(0, n)).trim();
  }

  async function writeLine(conn: Deno.TlsConn, line: string) {
    await conn.write(encoder.encode(line + "\r\n"));
  }

  try {
    await readLine(conn);
    await writeLine(conn, "EHLO contracts-portal");
    await readLine(conn);

    await writeLine(conn, "AUTH LOGIN");
    await readLine(conn);

    await writeLine(conn, btoa(GMAIL_USER));
    await readLine(conn);

    await writeLine(conn, btoa(GMAIL_APP_PASSWORD));
    await readLine(conn);

    await writeLine(conn, `MAIL FROM:<${GMAIL_USER}>`);
    await readLine(conn);

    await writeLine(conn, `RCPT TO:<${to}>`);
    await readLine(conn);

    await writeLine(conn, "DATA");
    await readLine(conn);

    const emailContent = [
      `From: Contracts Portal <${GMAIL_USER}>`,
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: text/html; charset=utf-8",
      "",
      html,
      ".",
    ].join("\r\n");

    await conn.write(encoder.encode(emailContent + "\r\n"));
    await readLine(conn);

    await writeLine(conn, "QUIT");
    await readLine(conn);

    conn.close();
  } catch (error) {
    conn.close();
    throw error;
  }
}

function mapAuthorityToRole(authority: string | null | undefined) {
  return String(authority || "").toLowerCase() === "admin" ? "admin" : "viewer";
}

function buildPersonKey(email: string | null, phone: string | null, fallback: string) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (normalizedEmail) return `email:${normalizedEmail}`;

  const normalizedPhone = String(phone || "").trim();
  if (normalizedPhone) return `phone:${normalizedPhone}`;

  return fallback;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const portalUrl = Deno.env.get("SUPABASE_URL");
    const portalServiceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const redirectTo = Deno.env.get("CONTRACTS_PORTAL_INVITE_REDIRECT") || undefined;

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
    const personKeyInput = String(body?.personKey || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const displayName = String(body?.displayName || "").trim();
    const phone = body?.phone ? String(body.phone).trim() : null;
    const jobRole = body?.jobRole ? String(body.jobRole).trim() : null;
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
    if (!["admin", "manager", "viewer"].includes(callerRoleValue)) {
      return new Response(
        JSON.stringify({ error: `Forbidden: admin, manager, or viewer required. Current role: ${callerRoleValue || "none"}.` }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const portalUsersRes = await fetch(`${portalUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
      method: "GET",
      headers: {
        apikey: portalServiceRole,
        Authorization: `Bearer ${portalServiceRole}`,
      },
    });

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

    const usersJson = await portalUsersRes.json();
    const portalUsers = Array.isArray(usersJson?.users) ? usersJson.users : [];
    const existingUser = portalUsers.find((u: any) => String(u?.email || "").trim().toLowerCase() === email);

    let linkedUserId = String(existingUser?.id || "");
    let invited = false;

    if (!linkedUserId) {
      const canSendCustomEmail = !!(GMAIL_USER && GMAIL_APP_PASSWORD);

      if (canSendCustomEmail) {
        const inviteSentAt = new Date().toISOString();

        const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
          type: "invite",
          email,
          options: {
            redirectTo,
            data: {
              display_name: displayName || email,
              job_role: jobRole || null,
              invited: true,
              password_set: false,
              invite_sent_at: inviteSentAt,
            },
          },
        });

        if (linkError) {
          return new Response(JSON.stringify({ error: `Invite link generation failed: ${linkError.message}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        linkedUserId = String(linkData?.user?.id || "");

        const actionLinkRaw = linkData?.properties?.action_link;
        if (!actionLinkRaw) {
          return new Response(JSON.stringify({ error: "Invite link was not returned by auth." }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const actionLinkUrl = new URL(actionLinkRaw);
        if (redirectTo) {
          actionLinkUrl.searchParams.set("redirect_to", redirectTo);
        }
        const actionLink = actionLinkUrl.toString();

        const subject = "You have been invited to join the Contracts Portal";
        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2>You have been invited to join the Contracts Portal</h2>
            <p>Please create a password by accepting the invite below.</p>
            <p>
              <a href="${actionLink}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
                Accept the invite
              </a>
            </p>
            <p><strong>This link expires after 24 hours.</strong></p>
            <p>If the button does not work, copy and paste this link into your browser:</p>
            <p>${actionLink}</p>
          </div>
        `;

        await sendViaGmail(email, subject, html);
      } else {
        const { data: invitedData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
          email,
          {
            data: {
              display_name: displayName || email,
              job_role: jobRole || null,
            },
            redirectTo,
          }
        );

        if (inviteError) {
          return new Response(JSON.stringify({ error: `Invite failed: ${inviteError.message}` }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        linkedUserId = String(invitedData?.user?.id || "");
      }

      invited = true;
    }

    if (!linkedUserId) {
      return new Response(JSON.stringify({ error: "Could not resolve invited user id." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const personKey = personKeyInput || buildPersonKey(email, phone, `portal:${linkedUserId}`);

    const [roleRes, profileRes, directoryRes] = await Promise.all([
      adminClient.from("app_user_roles").upsert(
        {
          user_id: linkedUserId,
          role: mapAuthorityToRole(authority),
        },
        { onConflict: "user_id" }
      ),
      adminClient.from("user_profiles").upsert(
        {
          user_id: linkedUserId,
          full_name: displayName || null,
          email,
          phone,
          job_role: jobRole,
          authority,
          regions,
          source_project: "portal",
        },
        { onConflict: "user_id" }
      ),
      adminClient.from("people_directory").upsert(
        {
          person_key: personKey,
          portal_user_id: linkedUserId,
          full_name: displayName || null,
          email,
          phone,
          job_role: jobRole,
          authority,
          regions,
          source_projects: ["portal"],
          source_user_refs: [{ source_project: "portal", source_user_id: linkedUserId }],
        },
        { onConflict: "person_key" }
      ),
    ]);

    if (roleRes.error || profileRes.error || directoryRes.error) {
      return new Response(
        JSON.stringify({ error: roleRes.error?.message || profileRes.error?.message || directoryRes.error?.message || "Unknown upsert error" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        user_id: linkedUserId,
        email,
        invited,
        alreadyLinked: !invited,
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
