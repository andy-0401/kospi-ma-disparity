# 코스피 50일 이격도 트래커 (이그전 기반)

코스피 **50일 이동평균선 이격도**를 매 거래일 자동 계산해서

- 📨 **텔레그램 채널로 broadcast** (장중 12:00 속보 + 종가 15:40 확정, 하루 2회)
- 🌐 **웹(GitHub Pages)** 에서 현재 상황 · 게이지 · 히스토리 차트 · 기록 테이블 제공

하는 시스템입니다. **이그전(이은택의 그림전략)** 의 50일 이격도 해석법에 기반합니다.

> **이격도 = 현재가 ÷ 50일 이동평균 × 100**
> - **≥ 130%** 과열권 진입 (Panic Buying 자제)
> - **120–130%** 과열 경계 (관심)
> - **105–120%** 정상 범위
> - **≤ 105%** 과열 해소 (Panic Selling 자제)

---

## 구조

```
scripts/
  disparity.py        # 데이터 수집 + 50일 이격도 계산 핵심 로직
  run_update.py       # 갱신 엔트리포인트 (history.json / latest.json 저장 + 텔레그램)
  telegram_notify.py  # 텔레그램 채널 broadcast
  requirements.txt
docs/                 # GitHub Pages 루트 (정적 웹)
  index.html  app.js  styles.css
  data/
    history.json      # 일봉 이격도 히스토리 (Actions가 자동 갱신)
    latest.json       # 최신 스냅샷 (장중/종가)
.github/workflows/
  update.yml          # 하루 2회 cron + 수동 실행
```

데이터 소스(무료 공개): 과거 일봉은 **pykrx**(KRX) → 실패 시 **Yahoo Finance** 폴백,
장중 실시간 값은 **Naver 금융** → 실패 시 **Yahoo** 폴백.

---

## 설정 (최초 1회)

### 1) 텔레그램 봇 만들기
1. 텔레그램에서 **@BotFather** → `/newbot` 으로 봇 생성 → **봇 토큰** 발급
2. 만든 봇을 **본인 채널의 관리자(Administrator)** 로 추가 (메시지 게시 권한)
3. 채널 chat id 확인:
   - 공개 채널이면 `@채널핸들` 을 그대로 사용 가능
   - 비공개/숫자 id 가 필요하면 채널에 아무 글이나 올린 뒤
     `https://api.telegram.org/bot<토큰>/getUpdates` 응답의 `chat.id`(예: `-100xxxxxxxxxx`) 사용

### 2) GitHub Secrets / Variables 등록
저장소 **Settings → Secrets and variables → Actions**

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `TELEGRAM_BOT_TOKEN` | BotFather 봇 토큰 |
| Secret | `TELEGRAM_CHAT_ID` | `@채널핸들` 또는 `-100...` |
| Variable | `WEB_URL` | (선택) Pages 주소 — 알림 하단에 링크로 첨부 |

### 3) GitHub Pages 켜기
**Settings → Pages → Build and deployment**
- Source: **Deploy from a branch**
- Branch: `main` (또는 운영 브랜치) / 폴더 **`/docs`**

→ 게시되면 `https://<사용자>.github.io/<저장소>/` 에서 접속.
`docs/app.js` 상단 `TELEGRAM_URL` 에 채널 주소를 넣으면 헤더에 채널 버튼이 노출됩니다.

### 4) 첫 데이터 채우기
**Actions → "코스피 50일 이격도 갱신" → Run workflow** (type=close) 수동 실행.
약 2.5년치 일봉으로 차트가 채워지고, 텔레그램에 첫 알림이 전송됩니다.

---

## 동작 일정 (자동)

`update.yml` 의 cron (UTC 기준, KST=UTC+9):

| 시각(KST) | cron(UTC) | 유형 | 내용 |
|---|---|---|---|
| 12:00 | `0 3 * * 1-5` | `intraday` | 장중 실시간 현재가 기준 **속보** (당일 대응·시장 파악용) |
| 15:40 | `40 6 * * 1-5` | `close` | 장 마감 **종가 확정**값 |

- 비거래일(주말·공휴일)은 데이터가 갱신되지 않으면 자동으로 알림을 **생략**합니다.
- `git push` 는 네트워크 오류 시 지수 백오프(2·4·8·16s)로 최대 4회 재시도합니다.

> 참고: GitHub Actions 의 스케줄은 러너 혼잡 시 수 분~수십 분 지연될 수 있습니다.
> 정밀한 정각 실행이 필요하면 별도 상시 서버 방식으로 전환하면 됩니다.

---

## 로컬 테스트

```bash
pip install -r scripts/requirements.txt
cd scripts
python run_update.py --type close --no-telegram   # 데이터만 생성
python run_update.py --type intraday               # 텔레그램 미설정 시 메시지 미리보기 출력
```

웹 미리보기:
```bash
cd docs && python -m http.server 8000   # http://localhost:8000
```

---

## 면책

본 프로젝트는 정보 제공 목적의 트래킹 도구이며 **투자 권유가 아닙니다**.
이격도 임계값(130/120/105%)은 이그전 이론을 참고한 가이드로, 시장 상황에 따라
미세조정해 해석해야 합니다. 투자 판단과 책임은 본인에게 있습니다.
