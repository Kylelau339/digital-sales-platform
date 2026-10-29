# 디지털 상품 마켓플레이스

**언어:** [English](README.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md)

모든 디지털 상품을 판매할 수 있는 오픈소스 마켓플레이스입니다. 디자인 템플릿, 모션·애니메이션 팩, 프리셋, LUT, 플러그인, 3D 에셋, 폰트, 오디오, 전자책, 강의, 소프트웨어 라이선스 등에 적용할 수 있습니다.

React, Fastify, SQLite, TypeScript로 구축되었습니다. 포함된 `.motion` 애니메이션 템플릿은 동작하는 참고 데모일 뿐 제약이 아닙니다. 공개, 심사, 결제, 구매 권한, 비공개 다운로드의 동일한 파이프라인이 모든 다운로드 가능한 디지털 상품에 적용됩니다.

![Marketplace](docs/images/market.png)
![Seller Dashboard](docs/images/seller.png)
![Admin Review](docs/images/admin.png)

## 판매할 수 있는 상품

등록, 라이선스, 심사, 결제, 구매 권한, 다운로드 계층은 상품 유형에 종속되지 않습니다. 다음과 같은 용도로 사용할 수 있습니다.

- 모션 그래픽, 애니메이션 프리셋, 영상 템플릿
- 디자인 시스템, UI 키트, 프레젠테이션 템플릿
- 플러그인, 스크립트, 개발자 도구
- 3D 모델, 텍스처, 게임 에셋
- 폰트, 효과음, 음악 팩, 스톡 미디어
- 전자책, 강의 및 기타 다운로드 가능한 지식 상품

각 상품은 버전이 지정된 패키지로 공개되며, 고유한 라이선스 조건, 미리보기 에셋, 심사 기록, 비공개 전달 파일을 가집니다.

## 주요 기능

### 상품 등록과 심사

- 패키지화된 모든 디지털 상품(`.motion` 및 ZIP) 업로드 워크플로.
- ZIP 중앙 디렉터리 안전성 검사.
- 경로 탐색, 절대 경로, 별칭, 중복 항목, 심볼릭 링크, 특수 파일, 실행 파일, 스크립트 탐지.
- 크기와 시간 제한이 있는 Worker 스캔.
- 패키지 라이선스 파싱과 충돌 탐지.
- 판매자 라이선스 증명과 URL 증거 워크플로.
- 미리보기 에셋 심사.
- 스캔, 라이선스, 증명, 미리보기, 버전, 전달 상태에 따른 관리자 승인 게이트.

### 비밀값 제거

- 텍스트 전용 비밀값 스캔.
- 스캔 크기와 시간 제한.
- 고위험 자격 증명 차단.
- JSON 구조를 보존하는 비밀값 치환.
- 격리된 원본 업로드와 별도로 생성되는 정제된 전달 ZIP.
- 비밀값은 `[REDACTED_BY_PLATFORM]`으로 치환됩니다.

### Stripe Connect

- Stripe Accounts v2 판매자 온보딩.
- Express Dashboard 온보딩 흐름.
- Connect 계정 멱등성.
- Connect Webhook 서명 검증.
- 판매자 온보딩 상태 동기화.

### 체크아웃과 결제 이행

- 서버 측 라이선스 가격 책정.
- Stripe Checkout Sessions 일회성 결제.
- Stripe 동적 결제 수단.
- Stripe Tax `automatic_tax`.
- Checkout과 Connect용 별도 Webhook 서명 비밀값.
- Raw body Stripe Webhook 서명 검증.
- 멱등 결제 이벤트 수신함.
- 중복 이벤트 보호.
- 결제 금액, 통화, metadata, PaymentIntent 검증.
- 원자적 주문 이행과 구매 권한 생성.

### 구매 권한과 비공개 다운로드

- 구매자별 구매 권한 라이브러리.
- 구매 권한당 10회 다운로드.
- 구매 권한 365일 유효.
- 5분간 유효한 HMAC 서명 다운로드 예약.
- 멱등 다운로드 예약 키.
- 단일 사용 다운로드 토큰.
- 원자적 다운로드 횟수 갱신.
- 동시 사용 보호.
- 비공개 스토리지 키를 클라이언트에 노출하지 않음.
- 전달 파일 크기와 SHA-256 검증.
- 다운로드 응답은 정제된 ZIP만 반환.

## 인터페이스 언어

| 코드 | 언어 |
| --- | --- |
| `zh-TW` | 繁體中文 |
| `en` | English |
| `ja` | 日本語 |
| `ko` | 한국어 |

언어를 추가하려면 `apps/web/src/lib/i18n/strings.ts`를 확장하고 `apps/web/src/lib/i18n/i18n.ts`에 로케일 코드를 등록하세요. 판매자가 입력한 상품 내용과 라이선스 조건은 원문 그대로 표시되며 기계 번역되지 않습니다.

## 프로젝트 상태

### 완료

- **M0**: SQLite 스키마, 저장소, 인증, 세션, CSRF 보호, 환불 정책 스냅샷, 애플리케이션 가드.
- **M1**: 판매자 업로드, ZIP 스캔, 비밀값 제거, 라이선스 파싱, 증명·미리보기 심사, 관리자 승인, 정제된 전달 파일 생성, 공개 카탈로그.
- **M2**: 이메일 인증 기반, Stripe Connect 온보딩, Stripe Checkout, Webhook 이행, 결제 이벤트 중복 제거, 구매 권한, HMAC 다운로드 예약, 동시성 안전 다운로드 소비, 실제 정제된 ZIP 전달.

### 미구현

M3의 관리·재무 운영 기능은 이 템플릿에 의도적으로 포함되지 않습니다.

- 프로덕션 이메일 제공자 통합.
- 환불 승인 워크플로와 Stripe Refund API 통합.
- 관리자 원클릭 판매 중지.
- 판매자 수익·정산 대시보드.
- 기타 프로덕션 운영, 보고, 회계 통제.

이 기능들은 각 프로젝트의 비즈니스, 법률, 세무, 회계 요구사항에 맞게 설계하고 구현하세요.

## 요구 사항

- Node.js 24 LTS.
- npm.
- `better-sqlite3`와 `argon2` 네이티브 빌드 지원.
- 로컬 Webhook 테스트용 Stripe CLI.
- Checkout과 Connect를 사용할 수 있는 Stripe 테스트 모드 계정.

## 설치

```bash
npm ci
```

로컬 환경 파일을 생성합니다.

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

`.env`를 커밋하지 마세요.

## 데이터베이스 마이그레이션

```bash
npm run db:migrate
```

기본 데이터베이스 경로는 `./var/motion-market.db`입니다. SQLite WAL 보조 파일은 데이터베이스 옆에 생성되며 Git에서 무시됩니다.

## 로컬 개발

API와 프런트엔드를 함께 시작합니다.

```bash
npm run dev
```

서비스:

- 프런트엔드: <http://localhost:5173>
- API 상태 확인: <http://127.0.0.1:3000/health>

Vite 개발 서버는 `/api` 요청을 로컬 Fastify API로 프록시합니다.

개별 실행:

```bash
npm run dev:api
npm run dev:web
```

기본 설정은 실제 API를 사용합니다(`USE_FIXTURES=false`). Fixtures는 로컬 시연과 테스트 전용입니다.

```bash
USE_FIXTURES=true npm run dev:web
```

PowerShell:

```powershell
$env:USE_FIXTURES='true'
npm run dev:web
```

## Stripe CLI Webhook 테스트

`.env`에 Stripe 테스트 비밀값을 설정합니다.

```dotenv
STRIPE_SECRET_KEY=sk_test_...
```

API를 시작한 후 실행합니다.

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe
```

CLI가 출력하는 `whsec_...` 서명 비밀값을 `STRIPE_WEBHOOK_SECRET`에 넣고 API를 재시작합니다. Connect 온보딩 Webhook은 별도의 `STRIPE_CONNECT_WEBHOOK_SECRET`과 경로를 사용합니다.

```bash
stripe listen --forward-to localhost:3000/api/v1/webhooks/stripe/connect
```

로컬 개발에서는 Stripe 테스트 카드만 사용하세요. Checkout에서 Stripe Tax가 활성화되어 있지만 실제 세액은 Stripe 계정의 세무 설정, 상품 세무 구성, 고객 위치, 유효한 세무 등록에 따라 달라집니다. 세액이 0이라고 해서 세무 설정이 완료된 것은 아닙니다.

자세한 내용은 [REAL_STRIPE_TESTING.md](REAL_STRIPE_TESTING.md)를 참조하세요.

## 검증

```bash
npm run typecheck
npm test
npm run build
```

빌드된 API 시작:

```bash
npm start
```

빌드된 API는 백엔드만 제공합니다. `dist/web`은 정적 서버나 리버스 프록시로 제공하세요.

## 보안 경고

이 저장소는 애플리케이션 템플릿이며 완전한 프로덕션 배포가 아닙니다. 프로덕션 배포 전에 반드시:

- 실제 트랜잭션 이메일 제공자를 설정하세요.
- 비즈니스, 세무, Webhook 설정을 완료한 후에만 Stripe Live 모드를 사용하세요.
- 모든 구간에서 HTTPS를 사용하세요.
- 개발용 session/CSRF 비밀값을 독립적으로 생성한 비밀값으로 교체하세요.
- 비공개 스토리지를 공개 웹 루트 밖에 두세요.
- 데이터베이스와 비공개 스토리지의 파일 시스템 권한을 제한하세요.
- 백업, 모니터링, 속도 제한, 사고 대응을 구성하세요.
- 세무, 환불, 저작권, 라이선스, 마켓플레이스 의무를 전문가와 검토하세요.
- 업로드된 패키지 코드를 실행하지 말고 영구 비공개 스토리지 URL을 노출하지 마세요.
- `.env`, 데이터베이스, 업로드, 증명 파일, ZIP 패키지, 로그, 빌드 산출물을 커밋하지 마세요.

## 아키텍처

- `apps/api`: Fastify API, SQLite 마이그레이션, 저장소, 스캔, 결제, 구매 권한, 비공개 스토리지.
- `apps/web`: React 프런트엔드와 프레젠테이션 계층.
- `packages/shared`: 공유 도메인 계약, 스키마, enum, 시간/금액 유틸리티.
- `tests`: M0, M1, M2, 저장소, 프런트엔드 계약 테스트.
- `docs`: 아키텍처와 API 노트.
- `fixtures`: 비프로덕션 시연용 fixtures만 포함.

## 라이선스

이 프로젝트는 MIT License로 공개됩니다. [LICENSE](LICENSE)를 참조하세요.
