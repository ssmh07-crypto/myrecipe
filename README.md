# My Recipe Note

Expo와 React Native로 만든 네이티브 모바일 레시피 보관 앱입니다. 웹 프런트엔드는 제공하지 않으며 Android/iOS 앱이 Supabase와 Cloudflare API를 사용합니다.

## 구성

- `apps/mobile`: Expo / React Native 앱
- `functions/api/import-recipe.ts`: Cloudflare Pages Functions URL 가져오기 API
- `supabase/schema.sql`: Auth, Database, RLS, Storage 스키마
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
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

서버 전용 키에는 `EXPO_PUBLIC_`을 붙이지 않습니다.

## Supabase

Supabase SQL Editor에서 `supabase/schema.sql`을 실행합니다. 관리되는 테이블:

- `profiles`
- `recipes`
- `recipe_folders`
- `recipe_folder_items`
- `meal_entries`

`meal_entries`는 식단 캘린더를 계정 단위로 동기화합니다. 기존 모바일 AsyncStorage 데이터는 로그인 후 첫 로딩 때 자동 업로드되고, 성공하면 로컬 사본이 삭제됩니다. 삭제된 웹 프런트의 브라우저 localStorage는 앱이나 서버가 직접 읽을 수 없으므로 자동 이전 대상이 아닙니다.

인증 세션은 OS 보안 저장소에 분할 저장되며 기존 AsyncStorage 세션은 자동 이전됩니다. 레시피 이미지 버킷은 비공개이고 앱이 로그인 사용자용 단기 서명 URL을 생성합니다. 스키마는 기존 공개 이미지 URL을 비공개 객체 경로로 이전합니다.

URL 가져오기는 Premium 사용자에게 24시간 기준 10회, 30일 기준 100회로 서버에서 제한됩니다. `recipe_import_usage`는 서비스 역할만 접근할 수 있습니다.

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
