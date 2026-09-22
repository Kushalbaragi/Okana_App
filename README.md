# Okana

## Releasing

After a build is approved and live in the App Store / Play Store, the in-app
"update available" popup (`hooks/useAppUpdate.js`) does **not** turn on by
itself — it's driven by the `app_config` table in Supabase, which has to be
bumped by hand:

1. Supabase dashboard → **Okana_Expense_Tracker** project → **Table Editor** → `app_config`.
2. Two rows: `id = ios` and `id = android`.
3. Set `latest_version` on each row you released to the version you just
   shipped (must match `expo.version` in `app.json` exactly, e.g. `2.0.1`).
4. Save.

No rebuild or redeploy needed — the app reads this table live on every cold
launch, so anyone still on an older install sees the update prompt next time
they open the app.
