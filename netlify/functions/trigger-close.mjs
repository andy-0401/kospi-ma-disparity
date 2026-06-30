// Netlify 예약 함수 — 매 거래일 15:40 KST(06:40 UTC)에 종가 갱신 트리거.
// GitHub 무료 cron 지연/누락을 우회해 정시성 확보. (각 워크플로의 repository_dispatch[close] 사용)
//   - 이격도(kospi-ma): 12:00 + 15:40  (장중 함수는 trigger-intraday.mjs)
//   - MDD(kr-mdd)     : 15:40 종가 1회 (← 여기서 같이 깨움)
// 필요한 환경변수: GH_DISPATCH_TOKEN — 아래 두 repo의 Contents: Read/write 권한 필요.
//   (fine-grained PAT면 kr-mdd 도 포함시켜야 함. classic repo 토큰이면 자동 포함.)
const REPOS = ["andy-0401/kospi-ma-disparity", "andy-0401/kr-mdd"];

export default async () => {
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    console.error("GH_DISPATCH_TOKEN 미설정");
    return new Response("GH_DISPATCH_TOKEN 미설정", { status: 500 });
  }
  const results = [];
  for (const repo of REPOS) {
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": "netlify-kospi-cron",
        },
        body: JSON.stringify({ event_type: "close" }),
      });
      const detail = r.status === 204 ? "204" : `${r.status}: ${await r.text()}`;
      results.push(`${repo} -> ${detail}`);
      console.log(`[close] ${repo} -> ${r.status}`);
    } catch (e) {
      results.push(`${repo} -> ERR ${e}`);
    }
  }
  return new Response(results.join("\n"), { status: 200 });
};

// 06:40 UTC = 15:40 KST, 평일(월~금)
export const config = { schedule: "40 6 * * 1-5" };
