import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdmin, jsonResponse } from "../lib/firebase-admin.mjs";

export default async request => {
  if (request.method !== "GET") return jsonResponse(405, { error: "Method not allowed." });
  const expectedAdminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expectedAdminEmail || !token) return jsonResponse(401, { error: "Admin authentication is required." });

  try {
    const { app, db } = getFirebaseAdmin();
    const decodedToken = await getAuth(app).verifyIdToken(token);
    if (decodedToken.email?.toLowerCase() !== expectedAdminEmail) {
      return jsonResponse(403, { error: "This account is not authorized to view bookings." });
    }

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
    return jsonResponse(401, { error: "Could not authenticate this admin request." });
  }
};
