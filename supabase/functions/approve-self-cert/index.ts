import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GMAIL_USER = Deno.env.get("GMAIL_USER") || "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") || "";
const SELF_CERT_HR_EMAIL = Deno.env.get("SELF_CERT_HR_EMAIL") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ApprovePayload = {
  formId?: string;
  managerSignature?: string;
};

async function readLine(conn: Deno.Conn) {
  const buf = new Uint8Array(4096);
  const n = await conn.read(buf);
  return new TextDecoder().decode(buf.subarray(0, n || 0));
}

async function writeLine(conn: Deno.Conn, text: string) {
  await conn.write(new TextEncoder().encode(text + "\r\n"));
}

async function sendViaGmail(to: string, subject: string, html: string) {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD || !to) return;

  const conn = await Deno.connectTls({ hostname: "smtp.gmail.com", port: 465 });
  try {
    await readLine(conn);
    await writeLine(conn, "EHLO localhost");
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
      `To: <${to}>`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      'Content-Type: text/html; charset="UTF-8"',
      "",
      html,
      ".",
    ].join("\r\n");

    await conn.write(new TextEncoder().encode(emailContent + "\r\n"));
    await readLine(conn);
    await writeLine(conn, "QUIT");
  } finally {
    conn.close();
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRole) {
      throw new Error("Missing SUPABASE env vars.");
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "Missing bearer token." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json().catch(() => ({}))) as ApprovePayload;
    const formId = String(body.formId || "").trim();
    const managerSignature = String(body.managerSignature || "").trim();

    if (!formId || !managerSignature) {
      return new Response(JSON.stringify({ success: false, error: "formId and managerSignature are required." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = createClient(supabaseUrl, serviceRole);

    const {
      data: { user },
      error: authError,
    } = await client.auth.getUser(token);

    if (authError || !user?.id) {
      return new Response(JSON.stringify({ success: false, error: `Unauthorized: ${authError?.message || "invalid token"}` }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: form, error: formErr } = await client
      .from("self_cert_forms")
      .select("id, employee_name, user_id, line_manager_user_id, line_manager_name, line_manager_email, status")
      .eq("id", formId)
      .maybeSingle();

    if (formErr || !form) {
      return new Response(JSON.stringify({ success: false, error: "Form not found." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (form.line_manager_user_id !== user.id) {
      return new Response(JSON.stringify({ success: false, error: "You are not the assigned line manager for this form." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (form.status !== "pending_manager_approval") {
      return new Response(JSON.stringify({ success: false, error: "Form is not pending manager approval." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const now = new Date().toISOString();

    const { error: updateError } = await client
      .from("self_cert_forms")
      .update({
        manager_signature: managerSignature,
        manager_signed_at: now,
        submitted_to_hr_at: now,
        status: "manager_approved",
      })
      .eq("id", formId);

    if (updateError) {
      throw new Error(`Approval update failed: ${updateError.message}`);
    }

    const employeeAuth = await client.auth.admin.getUserById(form.user_id);
    const employeeEmail = String(employeeAuth.data?.user?.email || "").trim();

    if (employeeEmail) {
      await sendViaGmail(
        employeeEmail,
        `Self Cert Approved: ${form.employee_name || "Employee"}`,
        `<p>Your self-cert form has been approved by ${form.line_manager_name || "your line manager"}.</p>`
      );
    }

    if (SELF_CERT_HR_EMAIL) {
      await sendViaGmail(
        SELF_CERT_HR_EMAIL,
        `Self Cert Approved and Submitted: ${form.employee_name || "Employee"}`,
        `<p>A self-cert form has been manager-approved and is ready for HR processing.</p><p>Employee: ${form.employee_name || "-"}<br/>Manager: ${form.line_manager_name || managerSignature}</p>`
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
