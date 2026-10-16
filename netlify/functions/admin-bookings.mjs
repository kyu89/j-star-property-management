import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminEmails } from "../lib/admin-emails.mjs";
import { getFirebaseAdmin, jsonResponse } from "../lib/firebase-admin.mjs";

export default async request => {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }
  const expectedAdminEmails = getAdminEmails();
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expectedAdminEmails.length || !token) return jsonResponse(401, { error: "Admin authentication is required." });

  let app;
  let db;
  try {
    ({ app, db } = getFirebaseAdmin());
  } catch (error) {
    console.error("Could not initialize Firebase for admin bookings:", error);
    return jsonResponse(500, { error: "Could not initialize admin booking access." });
  }

  let decodedToken;
  try {
    decodedToken = await getAuth(app).verifyIdToken(token);
  } catch (error) {
    console.error("Could not authenticate admin booking request:", error);
    return jsonResponse(401, { error: "Could not authenticate this admin request." });
  }
  if (!expectedAdminEmails.includes(decodedToken.email?.toLowerCase())) {
    return jsonResponse(403, { error: "This account is not authorized to view bookings." });
  }

  if (request.method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(400, { error: "Invalid booking action." });
    }
    if (!body || !["approve", "deny"].includes(body.action) ||
        typeof body.bookingId !== "string" ||
        !/^[A-Za-z0-9_-]{1,150}$/.test(body.bookingId)) {
      return jsonResponse(400, { error: "Invalid booking action." });
    }

    const bookingRef = db.collection("bookings").doc(body.bookingId);
    let actionError = "";
    try {
      await db.runTransaction(async transaction => {
        actionError = "";
        const bookingSnapshot = await transaction.get(bookingRef);
        if (!bookingSnapshot.exists || bookingSnapshot.data().status !== "pending") {
          actionError = "This booking is no longer pending approval.";
          return;
        }
        const booking = bookingSnapshot.data();
        const hasPropertyId = typeof booking.propertyId === "string" &&
          /^[A-Za-z0-9_-]{1,150}$/.test(booking.propertyId);
        const propertyRef = hasPropertyId ? db.collection("properties").doc(booking.propertyId) : null;
        const propertySnapshot = propertyRef ? await transaction.get(propertyRef) : null;

        if (body.action === "approve") {
          if (!propertySnapshot?.exists ||
              propertySnapshot.data().status !== "available" ||
              propertySnapshot.data().published === false) {
            actionError = "This property is no longer available to approve.";
            return;
          }
          transaction.update(propertyRef, {
            status: "booked",
            published: false,
            bookingId: bookingRef.id,
            bookedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          });
          transaction.update(bookingRef, {
            status: "approved",
            approvedAt: FieldValue.serverTimestamp()
          });
          return;
        }

        if (propertySnapshot?.exists) {
          const property = propertySnapshot.data();
          const linkedToBooking = property.bookingId === bookingRef.id;
          if (linkedToBooking || property.status === "available") {
            transaction.update(propertyRef, {
              status: "available",
              published: true,
              bookingId: FieldValue.delete(),
              bookedAt: FieldValue.delete(),
              updatedAt: FieldValue.serverTimestamp()
            });
          }
        }
        transaction.update(bookingRef, {
          status: "denied",
          deniedAt: FieldValue.serverTimestamp()
        });
      });
    } catch (error) {
      console.error(`Could not ${body.action} property booking:`, error);
      return jsonResponse(500, { error: `Could not ${body.action} this booking. Please try again.` });
    }
    if (actionError) return jsonResponse(409, { error: actionError });
    return jsonResponse(200, { ok: true });
  }

  try {
    const snapshot = await db.collection("bookings").orderBy("createdAt", "desc").limit(100).get();
    const bookings = snapshot.docs.map(document => {
      const booking = document.data();
      return {
        id: document.id,
        ...booking,
        createdAt: booking.createdAt?.toDate().toISOString() || ""
      };
    });
    return jsonResponse(200, { bookings });
  } catch (error) {
    console.error("Could not load bookings for admin:", error);
    return jsonResponse(500, { error: "Could not load bookings. Please try again." });
  }
};
