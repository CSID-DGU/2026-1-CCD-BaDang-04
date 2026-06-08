# BaDang

40~60대 중장년 자영업자를 위한 리뷰 기반 가게 분석 및 AI 뉴스레터 생성 서비스입니다. 카카오맵 장소 링크에서 가게 정보, 메뉴, 리뷰를 수집하고, Supabase에 저장한 뒤 벡터 RAG와 미니 Graph RAG를 활용해 가게 운영에 필요한 분석 결과와 마케팅 뉴스레터를 생성합니다.

## 주요 기능

- 이메일/비밀번호 기반 로그인 및 회원가입
- 로그인 이후 상단 탭 기반 페이지 이동
- 카카오맵 장소 링크 기반 가게 정보 수집
  - 가게명
  - 평점
  - 메뉴
  - 리뷰 작성자, 별점, 작성일, 본문
- 사용자당 가게 1개 유지
  - 새 가게를 불러오면 기존 가게, 메뉴, 리뷰 데이터 교체
- 리뷰 분석 대시보드
  - 기간 선택
  - 장점 요약
  - 단점 요약
  - 긍정/중립/부정 비중
  - 대표 키워드
  - 문제점 및 해결 방향
- AI 뉴스레터 생성
  - 사용자가 입력한 키워드 반영
  - 저장된 리뷰, 메뉴, 가게 정보를 근거로 생성
  - 40~60대 자영업자가 이해하기 쉬운 말투로 작성
  - 생성된 뉴스레터 목록 저장 및 상세 펼침
- RAG 파이프라인
  - `knowledge_chunks`: 벡터 검색용 텍스트 청크
  - `knowledge_nodes`: 반복되는 의미 항목
  - `knowledge_edges`: 의미 항목 간 연결 관계

## 기술 스택

- Frontend: Next.js 16, React 19, TypeScript
- Styling: Tailwind CSS 4
- Auth / Database: Supabase Auth, Supabase Database
- Vector Search: Supabase pgvector
- AI: OpenAI Responses API, OpenAI Embeddings API
- Scraping: Playwright, Browserless for Vercel deployment
- Deployment: Vercel

## 프로젝트 구조

```txt
.
├── README.md
└── my-app/
    ├── app/
    │   ├── page.tsx
    │   ├── analysis/
    │   ├── archive/
    │   ├── mypage/
    │   └── api/
    ├── components/
    ├── lib/
    ├── public/
    └── supabase/
```

앱 루트는 `my-app/`입니다. 로컬 실행과 Vercel 배포 모두 `my-app`을 기준으로 설정해야 합니다.

## 페이지 구성

- `/`: 로그인 / 회원가입
- `/analysis`: 리뷰 분석 대시보드
- `/archive`: 뉴스레터 생성 및 목록
- `/mypage`: 계정 정보, 가게 정보 수집, 저장된 가게 요약

## RAG 구조

### Vector RAG

수집한 가게, 메뉴, 리뷰 데이터를 텍스트 청크로 만들고 OpenAI 임베딩 모델로 벡터화합니다. 벡터는 Supabase `knowledge_chunks` 테이블의 `pgvector` 컬럼에 저장됩니다.

현재 기본 임베딩 모델:

```txt
text-embedding-3-small
```

### Mini Graph RAG

리뷰와 메뉴 데이터에서 반복되는 의미를 룰 기반으로 추출해 노드와 관계로 저장합니다. 무료 플랜 비용을 줄이기 위해 리뷰마다 AI 엔티티 추출을 수행하지 않고, 제한된 룰 기반 그래프를 보조 근거로 사용합니다.

예시:

```txt
가게 -> 혼잡
가게 -> 대기
가게 -> 외국인 고객
가게 -> 가성비
가게 -> 메뉴
```

Graph RAG는 사용자에게 직접 노출되는 기능이 아니라 대시보드와 뉴스레터 생성을 돕는 내부 보조 데이터입니다.

## AI 생성 모델

분석 대시보드와 뉴스레터 생성은 OpenAI Responses API를 사용합니다.

현재 기본 생성 모델:

```txt
gpt-5.4
```

환경변수 `OPENAI_ANALYSIS_MODEL`이 설정되어 있으면 해당 값이 우선됩니다.

## 서비스 품질 평가 프레임

AI 프롬프트는 리뷰와 메뉴 데이터를 1차 근거로 사용합니다. Kano, SERVPERF, Grönroos 서비스 품질 모델은 결과를 제한하는 기준이 아니라 누락된 관점을 확인하는 내부 보조 체크리스트로만 사용합니다.

최종 출력에는 다음과 같은 이론명과 내부 기술 용어를 직접 노출하지 않도록 제한합니다.

```txt
Kano
SERVPERF
Grönroos
Graph RAG
그래프
노드
엣지
컨텍스트
```

## 로컬 실행

```bash
cd my-app
npm install
npm run dev
```

개발 서버:

```txt
http://localhost:3000
```

빌드 확인:

```bash
cd my-app
npm run build
```

## 환경변수

`my-app/.env.local`에 필요한 값을 설정합니다.

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
OPENAI_API_KEY=
OPENAI_ANALYSIS_MODEL=gpt-5.4
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
PLAYWRIGHT_WS_ENDPOINT=
```

### Browserless

Vercel 서버리스 함수에는 Chromium을 직접 포함하기 어렵기 때문에 배포 환경에서는 Browserless 같은 원격 브라우저 연결을 사용합니다.

예시:

```txt
PLAYWRIGHT_WS_ENDPOINT=wss://production-sfo.browserless.io/chromium/playwright?token=YOUR_TOKEN&timeout=60000
```

주의:

- `NEXT_PUBLIC_`이 붙지 않은 값은 클라이언트에 노출하지 않아야 합니다.
- OpenAI API Key와 Browserless Token은 GitHub에 올리면 안 됩니다.
- Vercel 환경변수에 이미 `OPENAI_ANALYSIS_MODEL`이 있으면 코드 기본값보다 우선됩니다.

## Supabase 설정

Supabase SQL Editor에서 필요한 테이블과 함수 SQL을 실행해야 합니다.

로컬 참고 파일:

```txt
my-app/supabase/local-dev.sql
```

포함된 주요 설정:

- `vector` extension
- `knowledge_chunks`
- `match_knowledge_chunks`
- `knowledge_nodes`
- `knowledge_edges`
- RLS policy

기본 앱 테이블도 필요합니다.

```txt
stores
menus
reviews
newsletters
knowledge_chunks
knowledge_nodes
knowledge_edges
```

## 배포 설정

Vercel 배포 시 Root Directory를 반드시 `my-app`으로 설정합니다.

```txt
Root Directory: my-app
Framework Preset: Next.js
Build Command: npm run build
Output Directory: 비워두기
Install Command: npm install 또는 비워두기
```

배포 후 환경변수 변경 시에는 재배포가 필요합니다.

```txt
Redeploy -> Use existing Build Cache 끄기
```

## 현재 제한사항

- 카카오맵 수집은 화면 기반 Playwright PoC이므로 DOM 구조 변경에 취약합니다.
- Browserless 무료 플랜에서는 실행 시간 제한 때문에 모든 메뉴와 리뷰를 완전히 수집하지 못할 수 있습니다.
- 사용자당 하나의 가게만 유지합니다.
- Mini Graph RAG는 룰 기반이므로 복잡한 의미 추론에는 한계가 있습니다.
- 여러 가게 비교, 수집 이력 보존, 리뷰 검토 후 저장 기능은 아직 구현되어 있지 않습니다.
