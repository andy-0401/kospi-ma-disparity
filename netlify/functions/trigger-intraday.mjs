// Netlify 예약 함수 — 매 거래일 12:00 KST(03:00 UTC)에 GitHub 워크플로를 'intraday'로 트리거.
// GitHub 무료 cron 지연/누락을 우회해 정시성 확보. (워크플로의 repository_dispatch 사용)
// 필요한 환경변수: GH_DISPATCH_TOKEN (이 레포 Contents: Read/write 권한의 fine-grained PAT)
const REPO = "andy-0401/kospi-ma-disparity";

export default async () => {
  const token = process.env.GH_DISPATCH_TOKEN;
  if (!token) {
    console.error("GH_DISPATCH_TOKEN 미설정");
    return new Response("GH_DISPATCH_TOKEN 미설정", { status: 500 });
  }
  const r = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "netlify-kospi-cron",
    },
    body: JSON.stringify({ event_type: "intraday" }),
  });
  const ok = r.status === 204; // GitHub dispatches 성공 = 204
  console.log(`[intraday] github dispatch -> ${r.status}`);
  return new Response(ok ? "ok" : `github ${r.status}: ${await r.text()}`, {
    status: ok ? 200 : 502,
  });
};

// 03:00 UTC = 12:00 KST, 평일(월~금)
export const config = { schedule: "0 3 * * 1-5" };
