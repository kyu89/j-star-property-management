export function getAdminEmails() {
  const configuredEmails = process.env.ADMIN_EMAILS?.trim() || process.env.ADMIN_EMAIL?.trim() || "invoicejstarpm@gmail.com";
  return [...new Set(configuredEmails.split(",").map(email => email.trim().toLowerCase()).filter(Boolean))];
}
