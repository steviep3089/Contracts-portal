import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GMAIL_USER = Deno.env.get("GMAIL_USER") || "";
const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD") || "";
const CONTRACTS_PORTAL_LOGIN_URL =
  Deno.env.get("CONTRACTS_PORTAL_LOGIN_URL") ||
  Deno.env.get("PORTAL_LOGIN_URL") ||
  "https://contract-portal-tau.vercel.app/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SubmitPayload = {
  name?: string;
  department?: string;
  employeeNumber?: string;
  firstDayOfAbsence?: string;
  workingDaysLost?: number;
  notificationOfAbsenceMadeTo?: string;
  reasonAndSymptoms?: string;
  injuryOccurred?: boolean;
  injuryDetails?: string;
  soughtMedicalAdvice?: boolean;
  consultedDoctorAgain?: boolean;
  visitedHospitalOrClinic?: boolean;
  employeeSignature?: string;
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

    const body = (await req.json().catch(() => ({}))) as SubmitPayload;

    const firstDayOfAbsence = String(body.firstDayOfAbsence || "").trim();
    const reasonAndSymptoms = String(body.reasonAndSymptoms || "").trim();
    const employeeSignature = String(body.employeeSignature || "").trim();
    const workingDaysLost = Number(body.workingDaysLost || 0);

    if (!firstDayOfAbsence || !reasonAndSymptoms || !employeeSignature) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields." }), {
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

    const { data: profile } = await client
      .from("user_profiles")
      .select("full_name, regions, employee_number, line_manager_user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: person } = await client
      .from("people_directory")
      .select("full_name")
      .eq("portal_user_id", user.id)
      .maybeSingle();

    const lineManagerId = profile?.line_manager_user_id || null;
    if (!lineManagerId) {
      return new Response(JSON.stringify({ success: false, error: "No line manager set for your user profile." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: managerProfile }, { data: managerDirectory }, managerAuth] = await Promise.all([
      client.from("user_profiles").select("full_name").eq("user_id", lineManagerId).maybeSingle(),
      client.from("people_directory").select("full_name").eq("portal_user_id", lineManagerId).maybeSingle(),
      client.auth.admin.getUserById(lineManagerId),
    ]);

    const managerName =
      String(managerProfile?.full_name || "").trim() ||
      String(managerDirectory?.full_name || "").trim() ||
      "Line Manager";
    const managerEmail = String(managerAuth.data?.user?.email || "").trim();

    const employeeName =
      String(body.name || "").trim() ||
      String(profile?.full_name || "").trim() ||
      String(person?.full_name || "").trim() ||
      String(user.email || "").split("@")[0];

    const department =
      String(body.department || "").trim() ||
      (Array.isArray(profile?.regions) ? String(profile.regions[0] || "") : "");

    const employeeNumber = String(body.employeeNumber || "").trim() || String(profile?.employee_number || "").trim();

    const injuryOccurred = !!body.injuryOccurred;
    const injuryDetails = injuryOccurred ? String(body.injuryDetails || "").trim() : "";

    const { data: inserted, error: insertError } = await client
      .from("self_cert_forms")
      .insert({
        user_id: user.id,
        employee_name: employeeName,
        department,
        employee_number: employeeNumber,
        first_day_absence: firstDayOfAbsence,
        working_days_lost: Number.isFinite(workingDaysLost) ? Math.max(0, Math.round(workingDaysLost)) : 0,
        notification_made_to: String(body.notificationOfAbsenceMadeTo || managerName || "").trim(),
        reason_and_symptoms: reasonAndSymptoms,
        injury_occurred: injuryOccurred,
        injury_details: injuryDetails,
        sought_medical_advice: body.soughtMedicalAdvice === true,
        consulted_doctor_again: body.consultedDoctorAgain === true,
        visited_hospital_or_clinic: body.visitedHospitalOrClinic === true,
        employee_signature: employeeSignature,
        employee_signed_at: new Date().toISOString(),
        status: "pending_manager_approval",
        line_manager_user_id: lineManagerId,
        line_manager_name: managerName,
        line_manager_email: managerEmail,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      throw new Error(`Database insert failed: ${insertError.message}`);
    }

    if (managerEmail) {
      const subject = `Self Cert Approval Needed: ${employeeName}`;
      const portalLinkHtml = CONTRACTS_PORTAL_LOGIN_URL
        ? `<p>Portal login: <a href="${CONTRACTS_PORTAL_LOGIN_URL}">${CONTRACTS_PORTAL_LOGIN_URL}</a></p>`
        : "";

      const html = [
        `<p>Hello ${managerName},</p>`,
        `<p>${employeeName} has submitted a self-cert form and it is awaiting your review and approval in the Contracts App or Portal.</p>`,
        `<p>Please open the app or portal and use the bell icon to review, sign, and approve.</p>`,
        portalLinkHtml,
      ].join("");
      await sendViaGmail(managerEmail, subject, html);
    }

    return new Response(JSON.stringify({ success: true, id: inserted?.id || null }), {
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
