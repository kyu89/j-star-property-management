import { FieldValue } from "firebase-admin/firestore";
import { getAdminEmails } from "../lib/admin-emails.mjs";
import { getFirebaseAdmin, jsonResponse } from "../lib/firebase-admin.mjs";

const maxBodyLength = 12_000;
const rateLimitWindow = 10 * 60 * 1000;
const rateLimitCount = 5;
const recentSubmissions = new Map();

function isAllowedOrigin(origin) {
  if (!origin) return false;
  const configuredOrigins = [
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.SITE_ORIGIN,
    "https://jstarpm.com"
  ].filter(Boolean).map(value => new URL(value).origin);
  if (process.env.CONTEXT === "dev") {
    configuredOrigins.push("http://localhost:8888", "http://127.0.0.1:8888");
  }
  return configuredOrigins.includes(origin);
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isRateLimited(ipAddress) {
  const now = Date.now();
  const attempt = recentSubmissions.get(ipAddress);
  if (!attempt || now - attempt.startedAt >= rateLimitWindow) {
    recentSubmissions.set(ipAddress, { startedAt: now, count: 1 });
    return false;
  }
  if (attempt.count >= rateLimitCount) return true;
  attempt.count += 1;
  if (recentSubmissions.size > 1000) {
    for (const [key, value] of recentSubmissions) {
      if (now - value.startedAt >= rateLimitWindow) recentSubmissions.delete(key);
    }
  }
  return false;
}

export default async request => {
  if (request.method !== "POST") return jsonResponse(405, { error: "Method not allowed." });
  if (!isAllowedOrigin(request.headers.get("origin"))) return jsonResponse(403, { error: "Request origin is not allowed." });
  const adminEmails = getAdminEmails();
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim();
  if (!adminEmails.length || !process.env.RESEND_API_KEY || !fromEmail) {
    console.error("Booking email configuration is incomplete.");
    return jsonResponse(503, { error: "Booking is temporarily unavailable. Please contact J Star directly." });
  }

  let body;
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > maxBodyLength) return jsonResponse(413, { error: "Booking form is too large." });
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: "Invalid booking form data." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(400, { error: "Invalid booking form data." });
  }
  if (cleanText(body.website, 200)) return jsonResponse(200, { ok: true });
  const ipAddress = request.headers.get("x-nf-client-connection-ip") || "unknown";
  if (isRateLimited(ipAddress)) return jsonResponse(429, { error: "Too many booking requests. Please wait a few minutes and try again." });

  const propertyId = cleanText(body.propertyId, 150);
  const name = cleanText(body.name, 100);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = cleanText(body.phone, 30);
  const moveInDate = cleanText(body.moveInDate, 10);
  const occupants = Number(body.occupants);
  const message = cleanText(body.message, 2000);
  const moveInTimestamp = moveInDate ? Date.parse(`${moveInDate}T00:00:00Z`) : NaN;
  if (!/^[A-Za-z0-9_-]{1,150}$/.test(propertyId) ||
      name.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      phone.replace(/\D/g, "").length < 7 ||
      !Number.isInteger(occupants) || occupants < 1 || occupants > 20 ||
      (moveInDate && (!/^\d{4}-\d{2}-\d{2}$/.test(moveInDate) ||
        Number.isNaN(moveInTimestamp) ||
        new Date(moveInTimestamp).toISOString().slice(0, 10) !== moveInDate ||
        moveInTimestamp < Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)))) {
    return jsonResponse(400, { error: "Please enter a valid name, email, phone number, move-in date, and occupant count." });
  }

  try {
    const { db } = getFirebaseAdmin();
    const propertyRef = db.collection("properties").doc(propertyId);
    const bookingRef = db.collection("bookings").doc();
    let property;
    await db.runTransaction(async transaction => {
      const snapshot = await transaction.get(propertyRef);
      if (!snapshot.exists || snapshot.data().status !== "available" || snapshot.data().published === false) {
        const unavailable = new Error("This property is no longer available.");
        unavailable.code = "PROPERTY_UNAVAILABLE";
        throw unavailable;
      }
      property = snapshot.data();
      transaction.set(bookingRef, {
        propertyId,
        address: property.address || "",
        city: property.city || "",
        state: property.state || "PA",
        zip: property.zip || "",
        name,
        email,
        phone,
        moveInDate,
        occupants,
        message,
        status: "pending",
        createdAt: FieldValue.serverTimestamp()
      });
    });

    let emailSent = false;
    try {
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: fromEmail,
          to: adminEmails,
          reply_to: email,
          subject: `New property booking: ${String(property.address || "Property").replace(/[\r\n]/g, " ").slice(0, 120)}`,
          text: [
            "A new property booking request was submitted on the J Star website. It is pending admin approval.",
            "",
            `Property: ${property.address || ""}, ${property.city || ""}, ${property.state || "PA"} ${property.zip || ""}`,
            `Rent: $${Number(property.rentMin ?? property.rent ?? 0).toLocaleString("en-US")}${Number(property.rentMax ?? property.rent ?? property.rentMin ?? 0) !== Number(property.rentMin ?? property.rent ?? 0) ? `–$${Number(property.rentMax).toLocaleString("en-US")}` : ""}/month`,
            `Applicant: ${name}`,
            `Email: ${email}`,
            `Phone: ${phone}`,
            `Desired move-in date: ${moveInDate || "Not provided"}`,
            `Number of occupants: ${occupants}`,
            "",
            "Message:",
            message || "No message provided."
          ].join("\n")
        })
      });
      if (!emailResponse.ok) {
        const details = await emailResponse.text();
        throw new Error(`Resend returned ${emailResponse.status}: ${details}`);
      }
      emailSent = true;
    } catch (error) {
      console.error("Booking saved, but the admin email could not be sent:", error);
    }
    return jsonResponse(201, { ok: true, emailSent });
  } catch (error) {
    if (error.code === "PROPERTY_UNAVAILABLE") return jsonResponse(409, { error: error.message });
    console.error("Could not save property booking:", error);
    return jsonResponse(500, { error: "Could not complete the booking. Please try again or contact J Star." });
  }
};
