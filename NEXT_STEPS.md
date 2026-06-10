# NEXT STEPS — 코스피 50일 이격도 트래커

이어서 작업할 항목 모음. 각 항목은 **무엇을 / 어디를 / 어떻게** 순으로 정리.

## ✅ 현재까지 완료 (2026-06-10)
- 50일 이격도 계산 엔진 (`scripts/disparity.py`) — pykrx/Naver/Yahoo 무료 데이터 + 폴백
- 갱신 파이프라인 (`scripts/run_update.py`) → `docs/data/history.json`, `docs/data/latest.json`
- 텔레그램 알림 모듈 (`scripts/telegram_notify.py`) — **코드 완성, 시크릿만 넣으면 작동**
- 웹 (`docs/`) — 현재 상황 카드·게이지·코스피/50일선 차트·이격도 차트·기록 테이블·이론
- 자동화 (`.github/workflows/update.yml`) — 매 거래일 12:00 장중속보 / 15:40 종가확정
- **저장소 public 전환 + GitHub Pages 배포 완료**
  - 라이브: https://andy-0401.github.io/kospi-ma-disparity/
- 실데이터 1회 적재 완료 (이격도 ~112.7%, 정상 범위)

> ⚠️ 운영 메모: **라이브 브랜치는 `main`**. 워크플로가 매 실행마다 `main`에 데이터를 커밋한다.
> 로컬 작업 시 `git fetch origin main` 후 **main 기준**으로 브랜치를 따서 작업할 것
> (과거 feature 브랜치는 데이터가 빈 상태라 그대로 머지하면 실데이터를 덮어쓸 위험).

---

## 1) 텔레그램 자동 알림 켜기  ⏱️ 가장 쉬움 / 효과 큼
**무엇:** 코드(`telegram_notify.py`)는 이미 완성. GitHub Secrets만 넣으면 다음 실행부터 채널 broadcast.

**어디:** Settings → Secrets and variables → Actions
- `TELEGRAM_BOT_TOKEN` (Secret) — @BotFather `/newbot` 토큰
- `TELEGRAM_CHAT_ID` (Secret) — 공개 채널 `@핸들` 또는 `-100…`
- `WEB_URL` (Variable, 선택) — `https://andy-0401.github.io/kospi-ma-disparity/` (알림 하단 링크)

**어떻게(순서):**
1. @BotFather로 봇 생성 → 토큰 확보
2. 봇을 **채널 관리자(Administrator)** 로 추가 (게시 권한 필수)
3. chat_id 확인: 채널에 글 1개 올린 뒤 `https://api.telegram.org/bot<토큰>/getUpdates` 의 `chat.id`
4. 위 Secrets 등록 → Actions에서 워크플로 수동 실행(type=close)으로 1회 테스트
5. 정상 수신 확인 후 종료 (이후 12:00/15:40 자동 발송)

**개선 아이디어(선택):**
- 임계값 **돌파 시점에만** 별도 강조 알림(예: 130% 첫 돌파, 105% 첫 진입) — `run_update.py`에서
  직전 `latest.json`의 zone과 비교해 zone 변화 시 헤더에 🚨 추가.
- 메시지 parse 오류 대비: 현재 `Markdown` 사용. 종목/숫자에 `_ * [ ]` 들어가면 `MarkdownV2` 또는
  `HTML` parse_mode로 전환 고려.

---

## 2) 페이지 헤더에 텔레그램 채널 링크 버튼 노출  ⏱️ 5분
**무엇:** 헤더 우측 "📨 텔레그램 채널" 버튼. 지금은 URL이 비어 있어 숨김(`hidden`) 상태.

**어디:** `docs/app.js` 상단 상수
```js
const TELEGRAM_URL = ""; // → "https://t.me/<채널핸들>" 로 교체
```
값을 채우면 `load()`에서 자동으로 버튼 표시(`#tgLink`).

**어떻게:** 채널 주소 한 줄 교체 → 커밋 → Pages 자동 재배포.
(원하면 `WEB_URL`처럼 repo Variable로 빼서 빌드시 주입하도록 바꿔도 됨.)

---

## 3) 디자인 / 임계값 미세조정
**무엇:** 색상·레이아웃·이격도 임계값(130/120/105) 조정.

**⚠️ 임계값은 두 곳을 반드시 동일하게 유지** (현재 중복 정의):
- 백엔드: `scripts/disparity.py` → `OVERHEAT=130 / CAUTION=120 / COOLDOWN=105`
- 프런트: `docs/app.js` → `OVERHEAT, COOLDOWN, CAUTION` 동일 값
- (텔레그램 문구도 `telegram_notify.py`의 코멘트 분기)

**개선 아이디어:** 임계값을 `docs/data/config.json` 한 곳에서 읽도록 단일화
(파이썬이 생성, JS가 fetch) → 한 군데만 고치면 전부 반영.

**디자인 위치:**
- 색/테마: `docs/styles.css` `:root` 변수 (`--overheat/--caution/--normal/--cooldown` 등)
- 게이지 구간 폭: `docs/index.html` `.gauge-track .seg` 의 `flex` 비율
- 차트 옵션: `docs/app.js` `baseOpts()/scales()/tip()`

**참고:** 이그전 이론상 130/110/105를 칼같이 자르지 않고 상황 맞춰 미세조정. 현재 120(경계)은
임의 추가한 보조선이므로 운영하며 조정 권장.

---

## 4) 유저 트래킹 (PV/UV/유입경로) → 추후 광고
**무엇:** 방문자수(PV/UV), 유입경로(referrer/UTM) 수집. 추후 광고 수익화 대비.

**어디:** `docs/index.html` `<head>` 에 분석 스니펫 1개 삽입 (정적 사이트라 클라이언트 태그 방식).

**옵션 비교:**
| 도구 | 비용 | 특징 | 광고 연계 |
|---|---|---|---|
| **GA4 (gtag.js)** | 무료 | PV/UV/유입/이벤트 풍부, AdSense 연동 좋음 | ◎ |
| Cloudflare Web Analytics | 무료 | 쿠키리스·프라이버시, 가벼움 | △ |
| Plausible/GoatCounter | 유료/무료 | 초경량, 깔끔 | △ |

**추천 경로:** 우선 **GA4** 도입(유입경로·전환 추적이 광고에 유리).
1. analytics.google.com에서 속성 생성 → 측정 ID `G-XXXX`
2. `docs/index.html` `<head>`에 gtag 스니펫 추가
3. 유입경로는 채널 공유 링크에 **UTM** 부여: 예)
   `…/kospi-ma-disparity/?utm_source=telegram&utm_medium=channel&utm_campaign=daily`
4. GA4 '획득' 리포트에서 source/medium 확인

**광고(추후):**
- Google AdSense는 **공개 사이트 + 심사 통과** 필요(콘텐츠·트래픽 기준 있음). 이미 public이라 가능.
- 위치 후보: 이론 설명 섹션 하단, 기록 테이블 위/아래.
- ⚠️ **개인정보·동의 고지** 필요(한국 PIPA + GDPR/AdSense 정책): 추적/광고 쿠키 배너 + 개인정보처리방침
  페이지 추가 권장. 면책 문구는 이미 푸터에 있음 → 별도 `privacy.html` 신설 고려.

---

## 빠른 명령 메모
```bash
# 로컬에서 데이터 생성(텔레그램 미전송)
cd scripts && python run_update.py --type close --no-telegram

# 웹 미리보기
cd docs && python -m http.server 8000   # http://localhost:8000

# 워크플로 수동 실행: GitHub → Actions → "코스피 50일 이격도 갱신" → Run workflow
```

## 우선순위 제안
1 (텔레그램) → 2 (링크버튼) → 4 (GA4 트래킹, 광고 전 데이터 축적 시작) → 3 (디자인/임계값)
