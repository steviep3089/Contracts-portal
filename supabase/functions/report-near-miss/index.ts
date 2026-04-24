import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") || "";
const NEAR_MISS_SPREADSHEET_ID =
  Deno.env.get("NEAR_MISS_SPREADSHEET_ID") || "1Ov0k1pa-l7X24c2y-CRSMjwKnVEUgIxpyMOejleVZvA";
const NEAR_MISS_SHEET_ID = Number(Deno.env.get("NEAR_MISS_SHEET_ID") || "854852343");

type NearMissPayload = {
  reportedAt?: string;
  reporterName?: string;
  site?: string;
  nearMissDetails?: string;
  actionsTaken?: string;
  source?: string;
};

function base64UrlEncode(data: Uint8Array | string) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\n/g, "")
    .replace(/\r/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getGoogleAccessToken() {
  if (!GOOGLE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  const serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
  const clientEmail = serviceAccount.client_email;
  const privateKey = serviceAccount.private_key;

  if (!clientEmail || !privateKey) {
    throw new Error("Invalid service account JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT",
  };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  const keyData = pemToArrayBuffer(privateKey);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const assertion = `${unsignedToken}.${base64UrlEncode(new Uint8Array(signature))}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(tokenData.error_description || "Failed to obtain Google access token");
  }

  return tokenData.access_token as string;
}

function cellValue(value: string) {
  return { userEnteredValue: { stringValue: value } };
}

async function appendNearMissToSheet(values: {
  submittedAt: string;
  reportedAt: string;
  reporterName: string;
  site: string;
  nearMissDetails: string;
  actionsTaken: string;
  reportedByEmail: string;
  source: string;
}) {
  if (!Number.isFinite(NEAR_MISS_SHEET_ID)) {
    throw new Error("Invalid NEAR_MISS_SHEET_ID");
  }

  const accessToken = await getGoogleAccessToken();

  const rowValues = [
    values.submittedAt,
    values.reportedAt,
    values.reporterName,
    values.site,
    values.nearMissDetails,
    values.actionsTaken,
    values.reportedByEmail,
    values.source,
  ].map((value) => cellValue(value));

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${NEAR_MISS_SPREADSHEET_ID}:batchUpdate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            appendCells: {
              sheetId: NEAR_MISS_SHEET_ID,
              rows: [{ values: rowValues }],
              fields: "userEnteredValue",
            },
          },
        ],
      }),
    }
  );

  const responseJson = await response.json();
  if (!response.ok) {
    throw new Error(responseJson?.error?.message || "Failed to append near miss to Google Sheet");
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
      return new Response(JSON.stringify({ success: false, error: "Missing SUPABASE env vars." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

    const body = (await req.json().catch(() => ({}))) as NearMissPayload;

    const reportedAtIso = String(body.reportedAt || "").trim();
    const reporterName = String(body.reporterName || "").trim();
    const site = String(body.site || "").trim();
    const nearMissDetails = String(body.nearMissDetails || "").trim();
    const actionsTaken = String(body.actionsTaken || "").trim();
    const source = String(body.source || "contracts-app").trim();

    if (!reportedAtIso || !reporterName || !site || !nearMissDetails || !actionsTaken) {
      return new Response(JSON.stringify({ success: false, error: "Missing required fields." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsedReportedAt = new Date(reportedAtIso);
    if (Number.isNaN(parsedReportedAt.getTime())) {
      return new Response(JSON.stringify({ success: false, error: "Invalid reportedAt value." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const client = createClient(supabaseUrl, serviceRole);

    let userId: string | null = null;
    let userEmail = "";
    if (token) {
      const {
        data: { user },
        error: authError,
      } = await client.auth.getUser(token);

      if (authError) {
        console.warn("report-near-miss auth warning:", authError.message);
      } else if (user?.id) {
        userId = user.id;
        userEmail = String(user.email || "");
      }
    }

    const submittedAt = new Date();
    const reportedByEmail = userEmail;

    const { data: inserted, error: insertError } = await client
      .from("near_miss_reports")
      .insert({
        reported_at: parsedReportedAt.toISOString(),
        reporter_name: reporterName,
        site,
        near_miss_details: nearMissDetails,
        actions_taken: actionsTaken,
        source,
        reported_by_user_id: userId,
        reported_by_email: reportedByEmail,
      })
      .select("id")
      .maybeSingle();

    if (insertError) {
      return new Response(JSON.stringify({ success: false, error: `Database insert failed: ${insertError.message}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await appendNearMissToSheet({
      submittedAt: submittedAt.toISOString(),
      reportedAt: parsedReportedAt.toISOString(),
      reporterName,
      site,
      nearMissDetails,
      actionsTaken,
      reportedByEmail,
      source,
    });

    return new Response(
      JSON.stringify({
        success: true,
        id: inserted?.id || null,
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
