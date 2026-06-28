# Privacy Policy

Effective date: June 18, 2026

My Recipe Note provides a personal recipe notebook app. This policy explains what data the app collects and how it is used.

## Data We Collect

- Account information: email address and authentication identifiers.
- Recipe content: recipe titles, ingredients, seasonings, cooking steps, notes, source URLs, favorites, folders, and meal calendar entries.
- Images: recipe or category images selected by the user.
- Subscription status: plan, premium start date, and premium expiration date.

## How We Use Data

We use this data to provide account login, recipe storage, image upload, syncing, organization, premium access, and URL import features.

## Third-Party Services

The app uses:

- Supabase for authentication, database storage, row-level access control, and image storage.
- Cloudflare Pages Functions for backend API endpoints and Cloudflare R2 for private image storage and recipe-import caching.
- OpenAI API for structuring recipe text extracted from supported public URLs.
- Supadata API for extracting recipe information from supported YouTube and Instagram URLs.
- Expo and EAS Build for app development and distribution.

## User-Provided Content

Users are responsible for the recipes, notes, source URLs, and images they save. URL import is intended only for allow-listed public recipe pages and supported public YouTube or Instagram content that the user is authorized to access. Private, login-required, paywalled, and copyright-infringing imports are not supported.

When URL import is used, the source URL and publicly available page or transcript content may be sent to Cloudflare, OpenAI, and, for supported social URLs, Supadata. Imported recipe drafts may be cached in Cloudflare R2 to prevent duplicate paid API requests. Users should not include private access tokens or personal information in source URLs.

## Data Sharing

We do not sell user data. Data is shared only with the service providers required to operate the app.

## Data Retention and Deletion

Recipe data remains stored while the account is active. Users can delete recipes and folders inside the app. Users can also delete their account from the app settings after a recent sign-in; this removes recipes, folders, meal calendar entries, referenced recipe images, subscription metadata, and authentication data. Shared recipe-import cache objects do not contain account identifiers and are removed according to the operator's Cloudflare R2 lifecycle policy.

## Security

The app uses Supabase Row Level Security so users can access only their own recipes, folders, and related data. Recipe images are stored privately and served with signed URLs that expire after 15 minutes. Authentication sessions use the device operating system's secure storage and OAuth uses PKCE. Server-only keys are not included in the mobile app.

## Contact

Before public release, the operator must publish a monitored support email address here and in the app-store listing. Do not publish this policy while this contact item remains incomplete.
