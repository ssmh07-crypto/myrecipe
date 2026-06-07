# My Recipe Note

인터넷 레시피를 내 입맛에 맞는 나만의 레시피로 바꿔주는 AI 레시피북 MVP입니다. 직접 작성, 웹 URL 가져오기, 유튜브 설명/자막 기반 변환, AI 수정 제안, 즐겨찾기, 개인 메모 저장을 지원합니다.

## 기술스택

- React + Vite + TypeScript
- Tailwind CSS
- React Router
- Supabase Auth / Database / RLS
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

Cloudflare Pages Functions까지 로컬에서 테스트하려면 Wrangler로 Pages 개발 서버를 사용합니다.

```bash
npx wrangler pages dev dist
```

## 환경변수

클라이언트에 노출 가능한 값만 `VITE_` 접두사를 사용합니다.

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Cloudflare Pages Functions 전용 환경변수:

```bash
OPENAI_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
VITE_SUPABASE_URL=...
```

`OPENAI_API_KEY`와 `SUPABASE_SERVICE_ROLE_KEY`는 클라이언트 코드에서 절대 읽지 않습니다.

## Supabase SQL 적용

Supabase SQL Editor에서 [supabase/schema.sql](supabase/schema.sql)을 실행합니다. 생성되는 테이블은 다음과 같습니다.

- `profiles`
- `recipes`
- `ai_suggestions`

## RLS

모든 테이블에 Row Level Security를 활성화합니다. 사용자는 `auth.uid()` 기준으로 자신의 `profiles`, `recipes`, `ai_suggestions`만 조회, 생성, 수정, 삭제할 수 있습니다. `recipe-help` 함수는 서버에서 Service Role Key로 레시피를 조회하지만, 먼저 Supabase Auth JWT로 사용자 ID를 확인하고 `user_id` 조건을 함께 적용합니다.

## Pages Functions

`functions/api` 아래에 Cloudflare Pages Functions가 있습니다.

- `POST /api/import-recipe`: 외부 URL HTML을 가져와 sanitize 후 OpenAI Structured Outputs로 레시피 JSON을 생성합니다.
- `POST /api/import-youtube`: 유튜브 영상 ID를 추출하고 제목/수동 자막 텍스트를 레시피 JSON으로 변환합니다. 영상 다운로드와 원본 저장은 하지 않습니다.
- `POST /api/recipe-help`: 로그인 사용자의 레시피를 조회하고 AI 제안을 `ai_suggestions`에 저장합니다.

모든 함수는 `OPTIONS` 처리, POST 제한, JSON body validation, 표준화된 에러 응답을 포함합니다.

## Cloudflare Pages 배포

빌드 설정:

- Build command: `npm run build`
- Build output directory: `dist`
- Functions directory: `functions`

GitHub 저장소와 Cloudflare Pages 프로젝트를 연결한 뒤 `main` 브랜치에 푸시하면 자동 배포됩니다.

## MVP 제외 기능

SNS 피드, 댓글, 공개 커뮤니티, 팔로우, 결제, 광고, 쇼핑몰 연동, 복잡한 이미지 편집, 영양성분 계산, 영상 다운로드, 영상 저장, 틱톡 자동 스크래핑, 인스타 릴스 자동 스크래핑은 이번 MVP에서 제외합니다.
