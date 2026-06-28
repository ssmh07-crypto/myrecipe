# Mobile Release Checklist

## One-Time Setup

1. Create or log in to an Expo account.
2. From `apps/mobile`, run:

```bash
npm run eas:init
```

3. Add EAS build environment variables. These `EXPO_PUBLIC_*` values are embedded in the app and must never contain server secrets:

```bash
npx eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "..."
npx eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "..."
npx eas secret:create --scope project --name EXPO_PUBLIC_API_BASE_URL --value "https://myrecipe-1im.pages.dev"
```

4. Create an Apple Developer account and Google Play Console account.
5. Replace the privacy-policy contact placeholder with a monitored operator email address, then publish the policy at a public HTTPS URL.

## Android

1. Build an internal APK:

```bash
npm run eas:build:android:preview
```

2. Test the APK on a physical Android device.
3. Build a production AAB:

```bash
npm run eas:build:android
```

4. Create the Google Play app listing.
5. Upload the AAB to Internal testing first.
6. Fill in Data safety:
   - Account info: collected for login.
   - User-generated content: recipes, notes, images.
   - Photos/files: selected by the user for recipe images.
   - Data is used to provide sync, storage, and recipe management.
7. Promote to production after testing.

## iOS

1. Build production iOS:

```bash
npm run eas:build:ios
```

2. Let EAS manage signing credentials unless you already manage Apple certificates manually.
3. Create the App Store Connect app record with bundle ID `com.myrecipe.note`.
4. Submit the build:

```bash
npm run eas:submit:ios
```

5. Fill in App Privacy:
   - Contact info: email address.
   - User content: recipes, notes, images.
   - Identifiers: Supabase user ID.
   - Data is linked to the user account and used for app functionality.

## Store Listing Draft

App name: My Recipe Note

Short description: Save, organize, and revisit your personal recipes.

Full description:

My Recipe Note helps you keep your personal recipe book in one place. Save recipes manually, organize them into categories, mark favorites, add images, and track what you cooked on the meal calendar. Premium users can import supported web recipe URLs into editable drafts.

Keywords:

recipe, cookbook, meal planner, cooking notes, recipe organizer

## Before Public Release

- Replace the placeholder package/bundle IDs if you have a registered company or brand namespace.
- Test signup, login, recipe creation, image upload, URL import, premium activation, folder assignment, and calendar entries on a real device.
- Run `npm run supabase:migrations`, `npm run supabase:push:dry`, and `npm run supabase:push`; confirm all files under `supabase/migrations` are applied.
- Confirm `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` remain server-only in Cloudflare Pages Functions.
- Confirm `SUPADATA_API_KEY` and `R2_SIGNING_SECRET` remain server-only in Cloudflare Pages Functions.
- Set `RECIPE_IMPORT_ALLOWED_HOSTS` in Cloudflare Pages. Use comma-separated exact hosts and explicit wildcards, for example `youtube.com,*.youtube.com,youtu.be,instagram.com,*.instagram.com`.
- Configure an R2 lifecycle rule that deletes `cache/recipe-import/` objects after 30 days.
- Confirm the `RECIPE_IMAGES` R2 bucket has public access disabled.
- Enable Supabase email confirmation, leaked-password protection, secure password change, and exact production redirect URLs.
- Before enabling CAPTCHA, integrate a Turnstile or hCaptcha token flow in the React Native login/signup UI and test it on both platforms. Enabling CAPTCHA without sending `captchaToken` will block authentication.
- Remove `exp://**` from the production Supabase redirect allowlist.
- Test Google login uses a `?code=` PKCE callback and never returns tokens in the URL fragment.
- Confirm the privacy policy URL is available before review submission.
- Verify in-app account deletion on both platforms, including image removal and return to the login screen.
- Verify account deletion is rejected until the user has signed in again within the previous 10 minutes.
- Enable GitHub branch protection, Dependabot alerts/security updates, secret scanning push protection, and CodeQL.
