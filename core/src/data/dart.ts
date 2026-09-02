import type { Disclosure, DisclosureQuery, DisclosureSearchResult } from './types';

const DART_BASE_URL = 'https://opendart.fss.or.kr/api';

interface DartListResponseRow {
  corp_cls: string;
  corp_name: string;
  corp_code: string;
  stock_code: string;
  report_nm: string;
  rcept_no: string;
  flr_nm: string;
  rcept_dt: string;
  rm: string;
}

interface DartListResponse {
  status: string;
  message: string;
  page_no?: number;
  page_count?: number;
  total_count?: number;
  total_page?: number;
  list?: DartListResponseRow[];
}

export class DartApiError extends Error {
  constructor(
    public readonly status: string,
    message: string,
  ) {
    super(message);
    this.name = 'DartApiError';
  }
}

export interface DartClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

/**
 * Client for OpenDART's 공시검색 (disclosure search) API.
 * https://opendart.fss.or.kr/api/list.json
 */
export class DartClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: DartClientOptions) {
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async searchDisclosures(query: DisclosureQuery = {}): Promise<DisclosureSearchResult> {
    const params = new URLSearchParams({ crtfc_key: this.apiKey });
    if (query.corpCode) params.set('corp_code', query.corpCode);
    if (query.beginDate) params.set('bgn_de', query.beginDate);
    if (query.endDate) params.set('end_de', query.endDate);
    if (query.finalReportOnly) params.set('last_reprt_at', 'Y');
    params.set('page_no', String(query.pageNo ?? 1));
    params.set('page_count', String(query.pageCount ?? 20));

    const response = await this.fetchImpl(`${DART_BASE_URL}/list.json?${params.toString()}`);
    if (!response.ok) {
      throw new DartApiError('HTTP_ERROR', `OpenDART 요청 실패: ${response.status}`);
    }

    const payload = (await response.json()) as DartListResponse;

    // status 013: 해당 조건에 맞는 공시가 없음 (에러 아님)
    if (payload.status === '013') {
      return { items: [], totalCount: 0, totalPages: 0 };
    }
    if (payload.status !== '000') {
      throw new DartApiError(payload.status, payload.message);
    }

    const items = (payload.list ?? []).map(toDisclosure);
    return {
      items,
      totalCount: payload.total_count ?? items.length,
      totalPages: payload.total_page ?? 1,
    };
  }
}

function toDisclosure(row: DartListResponseRow): Disclosure {
  return {
    corpClass: row.corp_cls as Disclosure['corpClass'],
    corpCode: row.corp_code,
    corpName: row.corp_name,
    stockCode: row.stock_code?.trim() || null,
    reportName: row.report_nm,
    receiptNo: row.rcept_no,
    filerName: row.flr_nm,
    receivedDate: row.rcept_dt,
    remarks: row.rm,
  };
}
