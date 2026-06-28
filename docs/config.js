/*
 * 사이트 설정 — 여기 값만 채우면 자동 반영됩니다. (코드 수정 불필요)
 *
 * 1) telegramUrl    : 텔레그램 채널 공개 링크. 채우면 헤더에 채널 버튼이 켜짐.
 * 2) gaMeasurementId: Google Analytics 4 측정 ID. (비우면 추적 비활성)
 * 3) mddUrl         : MDD 페이지(시즌2) 주소. 상단 탭에서 이동.
 * 4) mddBase        : MDD 페이지의 데이터 베이스 경로(끝에 /data/*.json 을 붙여 읽음).
 *                     ※ 본 이격도 페이지는 코스피·코스닥 MDD+이격도 수치를
 *                       MDD 페이지가 만든 '단일 공용 데이터(canonical)'에서 읽습니다.
 *                       (두 페이지 수치 100% 일치 보장 · MDD쪽 CORS 허용 필요)
 */
window.SITE_CONFIG = {
  telegramUrl: "https://t.me/andyc14note",
  gaMeasurementId: "G-B8M3849G0G",
  mddUrl: "https://kr-mdd.netlify.app/",
  mddBase: "https://kr-mdd.netlify.app",
};
