import type { InvestorPreset, Stock } from './types';

export interface PresetCriterion {
  label: string;
  /** false = the underlying data isn't collected yet, so this criterion is NOT evaluated. */
  applied: boolean;
}

export interface PresetInfo {
  name: string;
  tagline: string;
  /** Who they are, track record, and the principle behind the screen. */
  description: string;
  criteria: PresetCriterion[];
  /**
   * false when none of the preset's core criteria are computable from the
   * current feed - shown as 준비 중 rather than silently screening on a
   * fragment that would misrepresent the strategy.
   */
  available: boolean;
}

export const INVESTOR_PRESETS: InvestorPreset[] = [
  'buffett',
  'lynch',
  'oneil',
  'graham',
  'minervini',
  'greenblatt',
];

export const PRESET_INFO: Record<InvestorPreset, PresetInfo> = {
  buffett: {
    name: '워렌 버핏',
    tagline: '가치투자 · 우량주',
    description:
      '버크셔 해서웨이 회장. 1960년대부터 장기간 시장을 크게 앞선 복리 수익률로 가치투자의 대명사가 됐습니다. 이해할 수 있는 사업, 경쟁사가 넘기 힘든 해자, 꾸준한 이익, 그리고 적정한 가격을 함께 봅니다.',
    available: true,
    criteria: [
      { label: '최근 5개년 연간 순이익 전부 흑자', applied: true },
      { label: 'PBR 3배 이하', applied: true },
      { label: 'ROE 3년 평균 15% 이상', applied: false },
      { label: '부채비율 100% 이하', applied: false },
      { label: '영업이익률 안정성', applied: false },
    ],
  },
  lynch: {
    name: '피터 린치',
    tagline: '성장주 · GARP',
    description:
      '피델리티 마젤란 펀드를 1977~1990년 운용하며 연평균 약 29%의 수익률을 낸 것으로 유명합니다. 생활 속에서 이해되는 기업을 고르되, 성장 속도에 비해 비싸지 않은 가격(PEG)을 고집했습니다.',
    available: true,
    criteria: [
      { label: '최근 분기 순이익 전년동기 대비 15% 이상 증가', applied: true },
      { label: '최근 분기 매출 전년동기 대비 10% 이상 증가', applied: true },
      { label: 'PEG 1.0 미만', applied: false },
      { label: '부채비율 100% 이하', applied: false },
      { label: '기관 보유 비중 30% 이하', applied: false },
    ],
  },
  oneil: {
    name: '윌리엄 오닐',
    tagline: '모멘텀 · CANSLIM',
    description:
      "Investor's Business Daily 창업자이자 CAN SLIM 투자법을 만든 인물입니다. 실적이 급격히 좋아지면서 신고가를 뚫고, 기관 수급이 붙고, 시장 자체가 상승 추세일 때만 산다는 원칙입니다.",
    available: true,
    criteria: [
      { label: 'C: 분기 순이익 전년동기 대비 25% 이상 증가', applied: true },
      { label: 'A: 연간 순이익 3개년 연속 증가 + 연평균 25% 이상', applied: true },
      { label: 'I: 최근 4주 기관 순매수 누적 플러스', applied: true },
      { label: 'N: 52주 신고가 -15%~0% 구간', applied: true },
      { label: 'S: 상장주식 수 1억 주 이하 (유통주식 수 미공시로 대체)', applied: true },
      { label: 'L: RS Rating 80 이상', applied: true },
      { label: 'M: 지수가 60일선 위', applied: true },
    ],
  },
  graham: {
    name: '벤저민 그레이엄',
    tagline: '딥밸류 · 안전마진',
    description:
      '『증권분석』과 『현명한 투자자』를 쓴 가치투자의 아버지이자 버핏의 스승입니다. 기업의 미래를 예측하기보다, 지금 가진 자산보다 싸게 사서 안전마진을 확보하는 쪽을 택했습니다.',
    available: true,
    criteria: [
      { label: 'PBR 1.0 미만', applied: true },
      { label: 'PER 10 이하', applied: true },
      { label: '유동비율 2.0 이상', applied: false },
      { label: '장기부채가 순유동자산 이하', applied: false },
      { label: '시가총액 ≤ (유동자산-총부채) × 0.67', applied: false },
      { label: '최근 5개년 연속 배당', applied: false },
    ],
  },
  minervini: {
    name: '마크 미너비니',
    tagline: 'VCP · 추세 템플릿',
    description:
      'US Investing Championship 우승자이자 SEPA·VCP(변동성 수축 패턴)를 정립한 트레이더입니다. 이동평균선이 정배열된 강한 추세 안에서, 변동성이 좁혀지다 거래량이 마르는 지점을 노립니다.',
    available: true,
    criteria: [
      { label: '현재가 > 50·150·200일선, 정배열', applied: true },
      { label: '200일선 1개월 이상 상승 추세', applied: true },
      { label: '52주 저점 +30% 이상 / 고점 -25% 이내', applied: true },
      { label: 'RS Rating 70 이상', applied: true },
      { label: '거래량 마름 (10일 평균 ≤ 50일 평균의 70%)', applied: true },
    ],
  },
  greenblatt: {
    name: '조엘 그린블라트',
    tagline: '마법공식 · 퀀트',
    description:
      '고담 캐피탈 창업자이자 『주식시장을 이기는 작은 책』의 저자입니다. 싸게 사고(이익수익률) 좋은 기업을 산다(투하자본이익률)는 두 가지 지표만 순위로 합산하는 마법공식을 제시했습니다.',
    available: false,
    criteria: [
      { label: '이익수익률 EBIT/EV 상위', applied: false },
      { label: '투하자본이익률 ROC 상위', applied: false },
      { label: '두 순위 합산 상위', applied: false },
      { label: '시가총액 1,000억 이상', applied: false },
    ],
  },
};

/** 'yoy' comparison against the same quarter one year ago (index 4, most-recent-first). */
const YOY_QUARTER_OFFSET = 4;

function yoyGrowthPct(series: (number | null)[] | undefined): number | null {
  if (!series) return null;
  const latest = series[0];
  const prior = series[YOY_QUARTER_OFFSET];
  // A loss-making base makes percentage growth meaningless, so treat it as unknown.
  if (latest == null || prior == null || prior <= 0) return null;
  return (latest / prior - 1) * 100;
}

function allPositive(series: (number | null)[] | undefined, count: number): boolean {
  if (!series || series.length < count) return false;
  return series.slice(0, count).every((value) => value != null && value > 0);
}

function matchesBuffett(stock: Stock): boolean {
  return allPositive(stock.annualNetIncome, 5) && stock.pbr != null && stock.pbr <= 3;
}

function matchesLynch(stock: Stock): boolean {
  const profitGrowth = yoyGrowthPct(stock.quarterlyNetIncome);
  const revenueGrowth = yoyGrowthPct(stock.quarterlyRevenue);
  return profitGrowth != null && profitGrowth >= 15 && revenueGrowth != null && revenueGrowth >= 10;
}

const ONEIL_MAX_LISTED_SHARES = 100_000_000;

function matchesOneil(stock: Stock): boolean {
  // N: within 15% of the 52-week high.
  if (stock.high52Pct == null || stock.high52Pct < 85) return false;
  // S: small enough share count to move on institutional demand.
  if (stock.listedShares == null || stock.listedShares > ONEIL_MAX_LISTED_SHARES) return false;
  // L: top fifth of the market on relative strength.
  if (stock.rsRating == null || stock.rsRating < 80) return false;
  // M: only buy while the stock's own index is in an uptrend. A measured
  // downtrend vetoes every name - that is the point of the M leg - but an
  // undetermined market (null) doesn't, since vetoing the whole preset on
  // missing data would look like a broken screen rather than a bearish one.
  if (stock.marketUptrend === false) return false;

  const quarterGrowth = yoyGrowthPct(stock.quarterlyNetIncome);
  if (quarterGrowth == null || quarterGrowth < 25) return false;

  // A: "3개년 모두 전년대비 증가" means three year-over-year increases, which
  // needs four fiscal years - comparing three years only tests two of them.
  const annual = stock.annualNetIncome;
  if (!annual || annual.length < 4) return false;
  const years = annual.slice(0, 4);
  if (years.some((value) => value == null)) return false;
  const [year0, year1, year2, year3] = years as number[];
  if (!(year0 > year1 && year1 > year2 && year2 > year3)) return false;
  if (year1 <= 0 || year2 <= 0 || year3 <= 0) return false;
  const averageGrowth =
    ((year0 / year1 - 1) * 100 + (year1 / year2 - 1) * 100 + (year2 / year3 - 1) * 100) / 3;
  if (averageGrowth < 25) return false;

  const flow = stock.institutionalNetBuy;
  if (!flow || flow.length === 0) return false;
  const recent = flow.slice(0, 20).filter((value): value is number => value != null);
  if (recent.length === 0) return false;
  return recent.reduce((sum, value) => sum + value, 0) > 0;
}

/** All eight trend-template checks - including RS >= 70 - must pass. */
const MINERVINI_TREND_SCORE = 8;

function matchesMinervini(stock: Stock): boolean {
  return stock.trendScore === MINERVINI_TREND_SCORE && stock.volumeDryUp === true;
}

function matchesGraham(stock: Stock): boolean {
  return (
    stock.pbr != null && stock.pbr < 1 && stock.per != null && stock.per > 0 && stock.per <= 10
  );
}

const MATCHERS: Record<InvestorPreset, (stock: Stock) => boolean> = {
  buffett: matchesBuffett,
  lynch: matchesLynch,
  oneil: matchesOneil,
  graham: matchesGraham,
  minervini: matchesMinervini,
  // Needs EBIT/EV and ROC, which the feed doesn't carry yet. Never selectable
  // in the UI, and a no-match here would be misleading.
  greenblatt: () => false,
};

export function matchesPreset(stock: Stock, preset: InvestorPreset): boolean {
  return MATCHERS[preset](stock);
}
