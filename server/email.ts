const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "onboarding@resend.dev";

interface ShowNotificationData {
  showTitle: string;
  showDate: string;
  city: string;
  showType: string;
  location?: string | null;
  numberOfDrums?: number | null;
  memberName: string;
}

export async function sendShowAssignmentEmail(
  toEmail: string,
  data: ShowNotificationData
): Promise<{ success: boolean; error?: string }> {
  if (!RESEND_API_KEY) {
    console.log("[Email] RESEND_API_KEY not set, skipping email to", toEmail);
    return { success: false, error: "Email not configured" };
  }

  const dateStr = new Date(data.showDate).toLocaleDateString("en-PK", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = new Date(data.showDate).toLocaleTimeString("en-PK", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const locationLine = data.location ? `<tr><td style="padding:8px 12px;color:#666;font-size:14px;">Location</td><td style="padding:8px 12px;font-size:14px;font-weight:600;">${data.location}</td></tr>` : "";
  const drumsLine = data.numberOfDrums ? `<tr><td style="padding:8px 12px;color:#666;font-size:14px;">Drums Required</td><td style="padding:8px 12px;font-size:14px;font-weight:600;">${data.numberOfDrums}</td></tr>` : "";

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:500px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:#1a1a2e;padding:24px;text-align:center;">
        <h1 style="color:#fff;margin:0;font-size:20px;">Drum Circle Pakistan</h1>
      </div>
      <div style="padding:24px;">
        <p style="font-size:16px;color:#333;margin:0 0 8px;">Hi ${data.memberName},</p>
        <p style="font-size:15px;color:#555;margin:0 0 20px;">You've been added to an upcoming show:</p>
        <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:6px;overflow:hidden;">
          <tr><td style="padding:8px 12px;color:#666;font-size:14px;">Show</td><td style="padding:8px 12px;font-size:14px;font-weight:600;">${data.showTitle}</td></tr>
          <tr style="background:#fff;"><td style="padding:8px 12px;color:#666;font-size:14px;">Date</td><td style="padding:8px 12px;font-size:14px;font-weight:600;">${dateStr}</td></tr>
          <tr><td style="padding:8px 12px;color:#666;font-size:14px;">Time</td><td style="padding:8px 12px;font-size:14px;font-weight:600;">${timeStr}</td></tr>
          <tr style="background:#fff;"><td style="padding:8px 12px;color:#666;font-size:14px;">City</td><td style="padding:8px 12px;font-size:14px;font-weight:600;">${data.city}</td></tr>
          <tr><td style="padding:8px 12px;color:#666;font-size:14px;">Type</td><td style="padding:8px 12px;font-size:14px;font-weight:600;">${data.showType}</td></tr>
          ${locationLine}
          ${drumsLine}
        </table>
        <p style="font-size:13px;color:#888;margin:20px 0 0;text-align:center;">Log in to the app for full details.</p>
      </div>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [toEmail],
        subject: `Show Assignment: ${data.showTitle} — ${dateStr}`,
        html,
      }),
    });

    const result = await res.json();
    if (!res.ok) {
      console.error("[Email] Failed to send to", toEmail, result);
      return { success: false, error: result?.message || "Send failed" };
    }
    console.log("[Email] Sent show notification to", toEmail, "id:", result.id);
    return { success: true };
  } catch (err: any) {
    console.error("[Email] Error sending to", toEmail, err.message);
    return { success: false, error: err.message };
  }
}

export async function sendBulkShowAssignment(
  members: { email: string; name: string }[],
  showData: Omit<ShowNotificationData, "memberName">
): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log("[Email] RESEND_API_KEY not set, skipping bulk notification");
    return;
  }

  const validMembers = members.filter(m => m.email && m.email.includes("@"));
  if (validMembers.length === 0) return;

  const results = await Promise.allSettled(
    validMembers.map(m =>
      sendShowAssignmentEmail(m.email, { ...showData, memberName: m.name })
    )
  );

  const sent = results.filter(r => r.status === "fulfilled" && (r.value as any).success).length;
  const failed = results.length - sent;
  console.log(`[Email] Bulk send complete: ${sent} sent, ${failed} failed out of ${validMembers.length}`);
}

export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY;
}
