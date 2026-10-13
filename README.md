# j-star-property-management

Static website for J Star Property Management.

## Project structure

- `index.html` — public homepage
- `pages/` — public information, properties, and application pages
- `admin/` — listing-management page, styles, and admin-only script
- `assets/css/` — shared public-site styles
- `assets/js/` — shared site logic and Firebase client setup
- `assets/images/` — site imagery and logo
- `netlify.toml` — Netlify publish configuration

Legacy `/sub-pages-html/` URLs redirect to their new locations.

Run the static site from the repository root with VS Code Live Server. Booking
submissions use Netlify Functions, so test those through `netlify dev` or a
Netlify deploy rather than Live Server alone.

## Property bookings

Visitors can submit a booking request from a property card. The Netlify
`submit-booking` function atomically marks an available property as booked in
Firestore, records the applicant details in the `bookings` collection, and
sends an email notification through Resend. Signed-in admins can review recent
bookings in the admin dashboard; only the email configured as `ADMIN_EMAIL`
can retrieve those records through the admin function.

Configure these environment variables in Netlify before enabling bookings:

- `FIREBASE_SERVICE_ACCOUNT_JSON` — the JSON contents of a Firebase service
  account with access to the project's Firestore database. Store it only in
  Netlify environment variables; never commit it to the repository.
- `ADMIN_EMAIL` — the administrator's Firebase Authentication email and the
  destination for booking notifications.
- `RESEND_API_KEY` — the Resend API key used to send booking notifications.
- `RESEND_FROM_EMAIL` — a sender address verified with Resend, such as
  `Bookings <bookings@your-verified-domain.com>`.
- `SITE_ORIGIN` (optional) — an additional allowed site origin. Netlify's
  deployed site and deploy-preview origins are allowed automatically.

The Firebase service account JSON and Resend API key are private credentials.
Do not put them in client-side JavaScript, commit them, or share them in chat.
