# Free Website Greeter

## Member flow

`/claim` → approved-context intake → tenant claim in Supabase → preview email → private preview → member approval → copy-and-paste embed → weekly question report.

The member owns the final installation. The service never asks for their website password and never changes a website on its own.

## Deploy

1. Create a Supabase project and run `supabase.sql` in its SQL editor.
2. Create a Resend API key and verify `FROM_EMAIL`.
3. Create a Render Web Service from this repository using `render.yaml` with root directory `greeter-service`.
4. Set all environment variables shown in `render.yaml`, including the public URL of the web service as `PUBLIC_BASE_URL`.
5. Add the final `https://<service>/claim` URL to the Skool Bonus Class.

## Security defaults

- The browser never receives OpenAI, Supabase service-role, Resend, or signing credentials.
- Private previews and public widgets use separate, random tokens.
- The widget accepts browser requests only from the website URL approved in the claim.
- The preview is read-only: it answers from only the member-approved context.
- The service has no endpoint for site installation, payments, bookings, access control, or customer-record lookup.
- A weekly Render cron emails the member a question report so repeated questions can become approved improvements.
