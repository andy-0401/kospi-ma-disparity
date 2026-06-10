"""
코스피 50일 이동평균선 이격도 계산 핵심 라이브러리 (이그전 - 이은택의 그림전략 이론 기반)

이격도 = 현재가 / 50일 이동평균 × 100

이그전 응용법:
  - 130% 이상 : 과열권 진입 (Panic Buying 자제)
  - 105% 이하 : 과열 해소 진행 (Panic Selling 자제)
  - 그 사이   : 정상 범위 (130 근접 시 경계)

데이터 소스(무료 공개):
  - 과거 일봉 종가 : pykrx (KRX 공식) → 실패 시 Yahoo Finance 폴백
  - 장중 실시간 값 : Naver 금융 폴링 API → 실패 시 Yahoo Finance 폴백
"""
from __future__ import annotations

import datetime as dt
import json
from dataclasses import dataclass, asdict
from typing import Optional
from zoneinfo import ZoneInfo

import requests

KST = ZoneInfo("Asia/Seoul")

# 이그전 임계값
OVERHEAT = 130.0   # 과열권 진입
COOLDOWN = 105.0   # 과열 해소
CAUTION = 120.0    # 과열 경계(관심) 구간 하단

MA_WINDOW = 50     # 50일 이동평균

KOSPI_PYKRX_CODE = "1001"      # pykrx 코스피 종합지수 코드
YAHOO_SYMBOL = "%5EKS11"       # ^KS11
NAVER_INDEX = "KOSPI"


@dataclass
class DailyPoint:
    date: str       # YYYY-MM-DD
    close: float    # 코스피 종가
    ma50: Optional[float] = None
    disparity: Optional[float] = None  # %
    zone: Optional[str] = None
    zone_label: Optional[str] = None


@dataclass
class Snapshot:
    """최신 상태(장중 속보 또는 종가 확정)."""
    date: str            # YYYY-MM-DD (KST)
    time: str            # HH:MM (KST)
    type: str            # "intraday" | "close"
    type_label: str      # "장중 속보" | "종가 확정"
    kospi: float
    ma50: float
    disparity: float
    change: Optional[float]        # 전 거래일 종가 대비 포인트
    change_pct: Optional[float]    # 전 거래일 종가 대비 %
    prev_disparity: Optional[float]
    zone: str
    zone_label: str
    note: str
    updated_at: str      # ISO8601 (KST)


# --------------------------------------------------------------------------
# 구간 판정
# --------------------------------------------------------------------------
def classify(disparity: float) -> tuple[str, str]:
    """이격도 → (zone key, 한글 라벨)."""
    if disparity >= OVERHEAT:
        return "overheat", "과열권 (Panic Buying 자제)"
    if disparity >= CAUTION:
        return "caution", "과열 경계 (관심)"
    if disparity <= COOLDOWN:
        return "cooldown", "과열 해소 (Panic Selling 자제)"
    return "normal", "정상 범위"


def zone_emoji(zone: str) -> str:
    return {
        "overheat": "🔴",
        "caution": "🟠",
        "normal": "🟢",
        "cooldown": "🔵",
    }.get(zone, "⚪")


# --------------------------------------------------------------------------
# 데이터 수집 - 과거 일봉
# --------------------------------------------------------------------------
def fetch_history_pykrx(days: int = 900) -> list[DailyPoint]:
    """pykrx로 코스피 일봉 종가 수집."""
    from pykrx import stock  # 지연 임포트(폴백 시 미설치여도 동작)

    today = dt.datetime.now(KST).date()
    start = (today - dt.timedelta(days=days)).strftime("%Y%m%d")
    end = today.strftime("%Y%m%d")
    df = stock.get_index_ohlcv_by_date(start, end, KOSPI_PYKRX_CODE)
    if df is None or df.empty:
        raise RuntimeError("pykrx 응답이 비어 있음")
    points: list[DailyPoint] = []
    for idx, row in df.iterrows():
        d = idx.date() if hasattr(idx, "date") else idx
        close = float(row["종가"])
        if close <= 0:
            continue
        points.append(DailyPoint(date=d.strftime("%Y-%m-%d"), close=close))
    return points


def fetch_history_yahoo(rng: str = "2y") -> list[DailyPoint]:
    """Yahoo Finance 차트 API로 코스피 일봉 종가 수집(폴백)."""
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{YAHOO_SYMBOL}"
        f"?range={rng}&interval=1d"
    )
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
    r.raise_for_status()
    res = r.json()["chart"]["result"][0]
    ts = res["timestamp"]
    closes = res["indicators"]["quote"][0]["close"]
    points: list[DailyPoint] = []
    for t, c in zip(ts, closes):
        if c is None:
            continue
        d = dt.datetime.fromtimestamp(t, KST).date()
        points.append(DailyPoint(date=d.strftime("%Y-%m-%d"), close=float(c)))
    return points


def fetch_history(days: int = 900) -> list[DailyPoint]:
    """과거 일봉 수집: pykrx 우선, 실패 시 Yahoo 폴백."""
    errors = []
    try:
        pts = fetch_history_pykrx(days=days)
        if len(pts) >= MA_WINDOW:
            return pts
        errors.append(f"pykrx 데이터 부족({len(pts)}개)")
    except Exception as e:  # noqa: BLE001
        errors.append(f"pykrx 실패: {e}")
    try:
        rng = "2y" if days <= 740 else "5y"
        return fetch_history_yahoo(rng=rng)
    except Exception as e:  # noqa: BLE001
        errors.append(f"yahoo 실패: {e}")
    raise RuntimeError("과거 데이터 수집 실패: " + " | ".join(errors))


# --------------------------------------------------------------------------
# 데이터 수집 - 실시간(장중) 현재가
# --------------------------------------------------------------------------
def fetch_live_naver() -> float:
    """Naver 금융 폴링 API로 코스피 실시간 현재가."""
    url = f"https://polling.finance.naver.com/api/realtime/domestic/index/{NAVER_INDEX}"
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/"}, timeout=15)
    r.raise_for_status()
    data = r.json()
    datas = data.get("datas") or data.get("result", {}).get("datas") or []
    if not datas:
        raise RuntimeError("naver 응답에 datas 없음")
    nv = datas[0].get("nv")
    if nv is None:
        raise RuntimeError("naver 응답에 nv 없음")
    val = float(nv)
    # Naver 지수는 종종 ×100 정수로 옴 (예: 273436 → 2734.36)
    if val > 20000:
        val = val / 100.0
    return val


def fetch_live_yahoo() -> float:
    """Yahoo Finance 실시간(지연) 현재가."""
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{YAHOO_SYMBOL}"
        f"?range=1d&interval=1m"
    )
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    r.raise_for_status()
    meta = r.json()["chart"]["result"][0]["meta"]
    return float(meta["regularMarketPrice"])


def fetch_live(reference_close: Optional[float] = None) -> float:
    """실시간 현재가: Naver 우선, 이상치/실패 시 Yahoo 폴백."""
    candidates = []
    for fn in (fetch_live_naver, fetch_live_yahoo):
        try:
            v = fn()
            if v > 0:
                candidates.append(v)
                # 참조 종가 대비 ±30% 이내면 신뢰
                if reference_close and abs(v - reference_close) / reference_close > 0.3:
                    continue
                return v
        except Exception:  # noqa: BLE001
            continue
    if candidates:
        return candidates[0]
    raise RuntimeError("실시간 현재가 수집 실패")


# --------------------------------------------------------------------------
# 이격도 계산
# --------------------------------------------------------------------------
def compute_history(points: list[DailyPoint]) -> list[DailyPoint]:
    """일봉 리스트에 50일 이동평균/이격도/구간 채우기 (날짜 오름차순 입력 가정)."""
    pts = sorted(points, key=lambda p: p.date)
    closes = [p.close for p in pts]
    for i, p in enumerate(pts):
        if i + 1 >= MA_WINDOW:
            window = closes[i + 1 - MA_WINDOW: i + 1]
            ma = sum(window) / MA_WINDOW
            disp = p.close / ma * 100.0
            zone, label = classify(disp)
            p.ma50 = round(ma, 2)
            p.disparity = round(disp, 2)
            p.zone = zone
            p.zone_label = label
    return pts


def build_snapshot(history: list[DailyPoint], run_type: str) -> Snapshot:
    """
    history: 50일 이평/이격도까지 계산된 일봉(오름차순).
    run_type: "intraday"(장중 12시) | "close"(종가 15:40)

    - intraday: 마지막 '확정 종가'들로 MA50 산출, 분자는 실시간 현재가.
    - close   : history 마지막 점(오늘 확정 종가)을 그대로 사용.
    """
    now = dt.datetime.now(KST)
    hist = [p for p in history if p.ma50 is not None]
    if len(hist) < 1:
        raise RuntimeError("이격도 계산에 충분한 데이터가 없습니다(50거래일 필요).")

    last = hist[-1]
    prev = hist[-2] if len(hist) >= 2 else None

    if run_type == "close":
        kospi = last.close
        ma50 = last.ma50
        disparity = last.disparity
        prev_close = prev.close if prev else None
        prev_disp = prev.disparity if prev else None
        type_label = "종가 확정"
        date_str = last.date
        note = "장 마감 종가 기준 확정값입니다."
    else:  # intraday
        # 마지막 확정 종가들로 MA50 (오늘 미포함)
        closes = [p.close for p in sorted(history, key=lambda p: p.date)]
        ma50 = round(sum(closes[-MA_WINDOW:]) / MA_WINDOW, 2)
        live = fetch_live(reference_close=last.close)
        kospi = round(live, 2)
        disparity = round(kospi / ma50 * 100.0, 2)
        prev_close = last.close          # 직전 거래일 종가
        prev_disp = last.disparity
        type_label = "장중 속보"
        date_str = now.strftime("%Y-%m-%d")
        note = "정규장 중 실시간 현재가 기준 추정치입니다(종가 확정 시 갱신)."

    zone, zone_label = classify(disparity)
    change = round(kospi - prev_close, 2) if prev_close else None
    change_pct = round((kospi - prev_close) / prev_close * 100.0, 2) if prev_close else None

    return Snapshot(
        date=date_str,
        time=now.strftime("%H:%M"),
        type=run_type,
        type_label=type_label,
        kospi=round(kospi, 2),
        ma50=round(ma50, 2),
        disparity=round(disparity, 2),
        change=change,
        change_pct=change_pct,
        prev_disparity=prev_disp,
        zone=zone,
        zone_label=zone_label,
        note=note,
        updated_at=now.isoformat(timespec="seconds"),
    )


# --------------------------------------------------------------------------
# 직렬화 헬퍼
# --------------------------------------------------------------------------
def history_to_records(history: list[DailyPoint]) -> list[dict]:
    out = []
    for p in history:
        if p.ma50 is None:
            continue
        out.append({
            "date": p.date,
            "close": round(p.close, 2),
            "ma50": p.ma50,
            "disparity": p.disparity,
            "zone": p.zone,
        })
    return out


def is_trading_today(history: list[DailyPoint]) -> bool:
    """history의 마지막 종가 날짜가 오늘(KST)인지."""
    today = dt.datetime.now(KST).strftime("%Y-%m-%d")
    return bool(history) and history[-1].date == today
