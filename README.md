# My Recipe Note

Expo와 React Native로 만든 네이티브 모바일 레시피 보관 앱입니다. 웹 프런트엔드는 제공하지 않으며 Android/iOS 앱이 Supabase와 Cloudflare API를 사용합니다.

## 구성

- `apps/mobile`: Expo / React Native 앱
- `functions/api/import-recipe.ts`: Cloudflare Pages Functions URL 가져오기 API
- `supabase/config.toml`: 로컬 Supabase/Auth/Storage 설정
- `supabase/migrations`: 버전 관리되는 Database, RLS, Storage 변경 이력
- `docs`: 출시 체크리스트와 개인정보처리방침

## 모바일 앱 실행

```bash
npm --prefix apps/mobile install
npm start
```

루트의 `npm start`는 원격 개발 환경에서 Expo 터널을 사용합니다. 로컬 네트워크에서는 `cd apps/mobile && npm start`를 사용할 수 있습니다. Expo SDK 56용 Expo Go 또는 EAS 개발 빌드에서 실행합니다.

## 환경변수

`apps/mobile/.env`:

```txt
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_BASE_URL=https://myrecipe-1im.pages.dev
```

Cloudflare Pages Functions 서버 전용:

```txt
OPENAI_API_KEY=...
SUPADATA_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
R2_SIGNING_SECRET=...
RECIPE_IMPORT_ALLOWED_HOSTS=youtube.com,*.youtube.com,youtu.be,instagram.com,*.instagram.com
```

서버 전용 키에는 `EXPO_PUBLIC_`을 붙이지 않습니다.

## Supabase

Supabase 스키마는 CLI migration으로 관리합니다. 원격 SQL Editor나 Table Editor에서 직접 스키마를 변경하지 않습니다. 관리되는 테이블:

- `profiles`
- `recipes`
- `recipe_folders`
- `recipe_folder_items`
- `meal_entries`

`meal_entries`는 식단 캘린더를 계정 단위로 동기화합니다. 기존 모바일 AsyncStorage 데이터는 로그인 후 첫 로딩 때 자동 업로드되고, 성공하면 로컬 사본이 삭제됩니다. 삭제된 웹 프런트의 브라우저 localStorage는 앱이나 서버가 직접 읽을 수 없으므로 자동 이전 대상이 아닙니다.

인증 세션은 OS 보안 저장소에 분할 저장되며 기존 AsyncStorage 세션은 자동 이전됩니다. 레시피 이미지 버킷은 비공개이고 앱이 로그인 사용자용 단기 서명 URL을 생성합니다. 스키마는 기존 공개 이미지 URL을 비공개 객체 경로로 이전합니다.

Google 로그인은 Supabase OAuth와 Expo AuthSession의 PKCE flow를 사용합니다. Google Cloud의 Web OAuth client에는 Supabase callback URL을 등록하고, Supabase Auth URL Configuration에는 `myrecipenote://auth/callback`을 등록합니다. Expo Go 개발 중에는 실제 `makeRedirectUri` 결과가 `exp://.../--/auth/callback` 형태이므로 개발용으로만 `exp://**`를 추가할 수 있습니다. 운영에서는 wildcard를 제거하고 정확한 custom scheme URL만 허용합니다.

URL 가져오기는 Premium 사용자에게 24시간 기준 10회, 30일 기준 100회로 서버에서 제한됩니다. `recipe_import_usage`는 서비스 역할만 접근할 수 있습니다.

URL 가져오기 대상은 `RECIPE_IMPORT_ALLOWED_HOSTS`에 등록된 신뢰 호스트로 제한됩니다. 일반 항목은 정확히 일치하며 `*.example.com` 형태만 하위 도메인을 허용합니다. 리다이렉트 대상도 같은 allowlist 검사를 통과해야 합니다.

### CLI 준비

Node.js 20 이상과 Docker 호환 런타임이 필요합니다. CLI 버전은 루트 `devDependencies`와 lockfile에 고정되어 있습니다.

`supabase/config.toml`의 `db.major_version`은 원격 프로젝트의 PostgreSQL major version과 같아야 합니다. 현재 로컬 기본값은 `17`이며, 원격 SQL Editor에서 `show server_version;`으로 확인한 뒤 다르면 먼저 수정합니다.

```bash
npm ci
npm run supabase:start
npm run supabase:status
npm run supabase:reset
npm run supabase:lint
```

로컬 Storage에는 운영과 동일한 비공개 `recipe-images` 버킷, 10MiB 파일 제한, 이미지 MIME 제한이 적용됩니다. 로컬 데이터는 `npm run supabase:reset` 때 삭제되므로 필요한 개발 fixture만 `supabase/seed.sql`에 추가합니다. 실제 사용자 데이터나 비밀키는 seed와 Git에 포함하지 않습니다.

### 기존 원격 프로젝트 최초 연결

이 프로젝트는 CLI migration 도입 전에 원격 스키마가 생성되었습니다. 최초 1회만 아래 순서를 사용합니다. `<project-ref>`는 Supabase Dashboard URL의 프로젝트 ID입니다.

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npm run supabase:migrations

# 원격 DB에 기존 baseline 스키마가 이미 있는지 반드시 확인한 다음에만 실행
npx supabase migration repair 20260620000000 --status applied

npm run supabase:push:dry
npm run supabase:push
```

`migration repair`는 SQL을 실행하지 않고 원격 migration 이력만 수정합니다. 기존 테이블과 RLS 정책이 없는 새 프로젝트에서는 repair하지 말고 baseline migration부터 정상적으로 push합니다. Dry run 결과에는 원격에 아직 적용되지 않은 migration만 표시되어야 하며, 파일 순서와 내용을 검토한 후 push합니다.

### 이후 스키마 변경

```bash
npm run supabase:migration:new -- describe_change
# 생성된 SQL 작성 및 검토
npm run supabase:reset
npm run supabase:lint
npm run supabase:push:dry
npm run supabase:push
```

팀에서는 migration 파일을 먼저 커밋하고 한 명 또는 CI만 원격 push를 수행합니다. 원격과 로컬 이력이 어긋나면 먼저 `npm run supabase:migrations`로 확인하며, 상태를 확인하지 않고 `migration repair`를 실행하지 않습니다.

### Database 타입

로컬 DB 또는 연결된 프로젝트에서 `supabase-js` 타입을 생성할 수 있습니다.

```bash
npm run supabase:types
# Docker 없이 연결된 원격 프로젝트를 사용할 때
npm run supabase:types:linked
```

결과는 `apps/mobile/src/types/database.generated.ts`에 생성됩니다. DB migration이 바뀔 때 함께 다시 생성하고 커밋합니다.

## 검증

```bash
npm run typecheck
cd apps/mobile && npm exec expo-doctor
```

## 빌드

```bash
cd apps/mobile
npm run eas:build:android:preview
npm run eas:build:android
npm run eas:build:ios
```

## URL 가져오기 API

모바일 앱은 `POST /api/import-recipe`를 호출합니다. Cloudflare Pages 프로젝트는 루트에서 `npm run build`를 실행하고 `dist`를 출력 디렉터리, `functions`를 Functions 디렉터리로 사용합니다. 루트 정적 웹사이트는 제공하지 않습니다.

`DELETE /api/delete-account`는 로그인 사용자의 참조 이미지와 Supabase 계정을 삭제합니다. 앱 설정의 계정 영구 삭제에서 호출합니다.
