/*
 * 사이트 설정 — 여기 값만 채우면 자동 반영됩니다. (코드 수정 불필요)
 *
 * 1) telegramUrl    : 텔레그램 채널 공개 링크. 채우면 헤더에 채널 버튼이 켜짐.
 * 2) gaMeasurementId: Google Analytics 4 측정 ID. (비우면 추적 비활성)
 * 3) mddUrl         : MDD 페이지(시즌2) 주소. 상단 탭에서 이동(독립 페이지).
 *
 * ※ 본 페이지는 자체 파이프라인(scripts/)이 코스피·코스닥 이격도를 계산해
 *   docs/data/*.json 으로 저장한 자기 데이터를 읽습니다. (MDD 페이지와 완전 독립)
 */
window.SITE_CONFIG = {
  telegramUrl: "https://t.me/andyc14note",
  gaMeasurementId: "G-B8M3849G0G",
  mddUrl: "https://kr-mdd.netlify.app/",
};
