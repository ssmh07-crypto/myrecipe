# My Recipe Note

인터넷 레시피를 내 레시피북으로 저장하는 모바일 레시피 아카이브 MVP입니다. 직접 작성한 레시피는 무료 저장 흐름으로 운영하고, AI는 권한이 있는 웹 레시피 URL을 개인 레시피 초안으로 정리할 때만 사용합니다.

## 기술스택

- React + Vite + TypeScript
- Tailwind CSS
- React Router
- Supabase Auth / Database / RLS / Storage
- OpenAI API
- Cloudflare Pages
- Cloudflare Pages Functions

## 설치

```bash
npm install
```

## 로컬 실행

```bash
npm run dev
```

## 환경변수

클라이언트 노출 가능:

```txt
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Cloudflare Pages Functions 전용:

```txt
OPENAI_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`OPENAI_API_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`에는 절대 `VITE_`를 붙이지 않습니다.

## Supabase SQL

Supabase SQL Editor에서 [supabase/schema.sql](supabase/schema.sql)을 실행합니다.

생성/관리되는 테이블:

- `profiles`
- `recipes`
- `recipe_folders`
- `recipe_folder_items`

`ai_suggestions`는 이번 MVP에서 제거되었습니다.

## Storage 설정

SQL 실행 시 `recipe-images` bucket을 생성하고 public read, 사용자별 경로 write/delete 정책을 설정합니다.

업로드 경로:

```txt
user_id/recipe_id/filename
```

프론트에서 허용하는 이미지:

- jpg
- jpeg
- png
- webp
- 최대 5MB

## RLS

모든 앱 테이블에 Row Level Security를 활성화합니다. `auth.uid() = user_id` 기준으로 사용자는 자신의 레시피, 폴더, 폴더 항목만 접근할 수 있습니다.

## Pages Functions

- `POST /api/import-recipe`

서버가 권한이 있는 블로그와 일반 웹사이트 레시피 URL의 텍스트를 추출하고 OpenAI API로 수정 가능한 레시피 초안을 생성합니다.

영상/SNS 자동 추출, 유료 콘텐츠 우회, 제3자 콘텐츠 다운로드, 원본 저장은 지원하지 않습니다. 출처 URL만 저장합니다.

## Cloudflare Pages 배포

배포 명령:

```bash
npm run deploy
```

이 명령은 로컬에서 `npm run build`를 먼저 실행하고, 성공하면 `main` 브랜치를 GitHub에 push합니다. GitHub 저장소와 연결된 Cloudflare Pages가 push를 감지해 자동 배포합니다.

배포 링크:

```txt
https://myrecipe-1im.pages.dev
```

배포 후 확인:

```bash
npm run deploy:check
```

빌드 설정:

- Build command: `npm run build`
- Build output directory: `dist`
- Functions directory: `functions`

GitHub 저장소와 Cloudflare Pages 프로젝트를 연결한 뒤 `main` 브랜치에 푸시하면 자동 배포됩니다.

## MVP 제외 기능

AI 수정 기능, AI 제안 기능, 장보기 리스트 생성, 댓글, SNS 피드, 공개 커뮤니티, 결제, 광고, 영양성분 계산, 쇼핑몰 연동, 영상/SNS 자동 추출, 영상 저장, 영상 다운로드는 제외합니다.
