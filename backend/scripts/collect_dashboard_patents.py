"""ダッシュボード用の実データ(特許)を収集するスクリプト (SOT-960)。

論文の `collect_dashboard_papers.py` と同型で、各テーマについて USPTO Patent Public
Search (PPUBS, ppubs.uspto.gov) から **実在する米国特許/公開公報** を取得し、
`backend/data/collected-patents.json` に書き出す。`seed.py` はこのJSONが存在すれば
実データを、無ければ合成データ(オフライン/テスト用フォールバック)を使う。

データ源に PPUBS を使う理由: 論文で使っていた PatentsView API は 2026-03-20 に停止
されたため。PPUBS は認証不要の公開エンドポイントで、`patent_mcp_server` も同じ API を
利用している(本スクリプトはそのセッション確立フローを最小再実装したもの)。

収集物:
  - patents: テーマごとの代表特許(直近 PER_THEME 件、公開日 >= MIN_YEAR)。
  - theme_yearly_counts: テーマ×年の **実マッチ件数(numFound)**。年次トレンド用。

実行:
    cd backend && ./.venv/bin/python -m scripts.collect_dashboard_patents
    # もしくは
    ./.venv/bin/python backend/scripts/collect_dashboard_patents.py

外部APIキーは不要。投資助言ではなく、調査・仮説検証用の公開特許データとして扱う。
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timezone

import httpx

_TAG_RE = re.compile(r"<[^>]+>")


def _field_restrict(base: str) -> str:
    """全文検索の base クエリを、タイトル/要約に限定した式へ変換する。

    PPUBS BRS のフィールド修飾子 `.ti.` / `.ab.` は括弧グループ全体に分配されるため、
    `(((base)).ti. OR ((base)).ab.)` とすることで base 内の AND/OR 構造を保ったまま
    タイトル・要約への限定検索になる(本文ヒットの誤マッチを大幅に削減)。
    """
    return f"((({base})).ti. OR (({base})).ab.)"

# テーマ名 -> PPUBS BRS 検索クエリ。テーマ名(=_DASHBOARD_THEMESのname)は保存時に
# そのまま theme として使い、SQLite/Firestore 両seederが theme_id へ解決する。
# BRS 構文: 複数語はデフォルト AND、フレーズは引用符で囲む。フィールド限定なしの
# 全文検索だが、関連語の AND/OR で関連特許に絞っている(論文クエリと同方針)。
THEME_QUERIES: dict[str, str] = {
    "SSD / NVMe": '"NVMe" AND ("solid state drive" OR "SSD")',
    "GPU memory bottleneck": '"GPU memory" AND ("bandwidth" OR "capacity" OR "offload")',
    "HBM": '"high bandwidth memory"',
    "KV cache offloading": '"key-value cache" OR ("KV cache" AND "offload")',
    "I/O bottleneck": '("I/O bottleneck" OR "input output bottleneck") AND "memory"',
    "data center power": '"data center" AND ("power" OR "energy efficiency")',
    "robotics foundation model": '"foundation model" AND "robot"',
    "CXL memory pooling": '("compute express link" OR "CXL") AND ("memory pooling" OR "memory expansion")',
    "optical interconnect": '"optical interconnect"',
    "liquid cooling": '"liquid cooling" AND ("server" OR "data center" OR "processor")',
    "chiplet packaging": '"chiplet"',
    "advanced packaging CoWoS": '"advanced packaging" OR "CoWoS" OR "2.5D" AND "interposer"',
    "EUV lithography": '("extreme ultraviolet" OR "EUV") AND "lithography"',
    "silicon photonics": '"silicon photonics"',
    "LLM inference optimization": '("large language model" OR "LLM") AND "inference"',
    "quantization": '"quantization" AND ("neural network" OR "deep learning")',
    "mixture of experts": '"mixture of experts"',
    "retrieval augmented generation": '"retrieval augmented generation" OR "retrieval-augmented generation"',
    "vector database": '"vector database" OR "approximate nearest neighbor search"',
    "AI accelerator ASIC": '("AI accelerator" OR "neural network accelerator") AND "circuit"',
    "neuromorphic computing": '"neuromorphic"',
    "edge AI inference": '"edge" AND ("neural network inference" OR "on-device inference")',
    "power semiconductor GaN SiC": '("gallium nitride" OR "silicon carbide") AND "power" AND "semiconductor"',
    "solid-state battery": '"solid-state battery" OR "solid state electrolyte"',
    "grid storage": '"grid" AND ("energy storage" OR "battery storage")',
    "humanoid robotics": '"humanoid robot"',
    "autonomous driving perception": '"autonomous driving" AND ("perception" OR "object detection")',
    "SmartNIC DPU": '"SmartNIC" OR "data processing unit" OR "infrastructure processing unit"',
    "NVMe-oF disaggregation": '"NVMe over fabrics" OR "NVMe-oF" OR ("disaggregated" AND "storage")',
    "flash controller": '("flash memory" AND "controller") OR "flash translation layer"',
}

# SOT-1119: 論文側 (_DASHBOARD_THEMES) は100テーマだが特許は上記30テーマのみだった。
# `sot994_universe.json` の70テーマを merge して特許も100テーマ化する。
# universe の `query` は arXiv 向けのキーワード列(例: "digital payment processing fintech
# transaction")で PPUBS BRS 構文ではない。そのまま _field_restrict に渡すと既定AND結合で
# 過剰に絞られ false な「該当なし」が増えるため、`_to_ppubs_brs()` で **再現率を優先した
# OR-of-phrases** な BRS クエリへ機械変換する(決定的=テスト可能)。
_BRS_STOPWORDS = {
    "a", "an", "and", "or", "the", "of", "for", "to", "in", "on", "with",
    "based", "using", "via", "system", "systems", "method", "methods",
}


def _to_ppubs_brs(name: str, query: str) -> str:
    """arXiv 風キーワード列 `query` を、再現率重視の PPUBS BRS クエリへ変換する。

    生成方針(決定的):
      - 多語のテーマ名はフレーズとして 1 つ採用("digital payments infrastructure")。
      - `query` の意味語(ストップワード除外)から隣接バイグラムをフレーズ化して列挙。
      - 大文字略語(CRISPR/CBDC/API 等)は単独フレーズとして追加。
    これらを OR 連結する。OR 主体にすることで既定AND結合による過剰絞り込みを避ける。
    """
    terms: list[str] = []
    if len([w for w in name.split() if w]) >= 2:
        terms.append(f'"{name.strip()}"')

    tokens = [w for w in re.split(r"\s+", query.strip()) if w]
    meaningful = [w for w in tokens if w.lower() not in _BRS_STOPWORDS]
    for a, b in zip(meaningful, meaningful[1:]):
        terms.append(f'"{a} {b}"')
    for w in meaningful:
        if len(w) >= 2 and w.isupper():  # acronyms: CRISPR, CBDC, API, LiDAR(部分大文字は除外)
            terms.append(f'"{w}"')

    # de-dup(順序保持・大小無視)
    seen: set[str] = set()
    uniq: list[str] = []
    for term in terms:
        key = term.lower()
        if key not in seen:
            seen.add(key)
            uniq.append(term)
    if not uniq:  # query が空/全てストップワード等の保険
        uniq = [f'"{name.strip()}"']
    return " OR ".join(uniq)


def _merge_sot994_queries() -> None:
    """SOT-1119: sot994_universe.json の70テーマ分の PPUBS クエリを THEME_QUERIES に追加する。
    既存30テーマは温存(setdefault)。これにより1回の実行で合計100テーマの特許を収集できる。"""
    path = os.path.join(os.path.dirname(__file__), "..", "data", "sot994_universe.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return
    for t in data.get("themes", []):
        name = t.get("name")
        query = t.get("query")
        if name and query:
            THEME_QUERIES.setdefault(name, _to_ppubs_brs(name, query))


_merge_sot994_queries()

PPUBS_BASE = os.getenv("PPUBS_BASE_URL", "https://ppubs.uspto.gov")
USER_AGENT = "stock-signal-research/SOT-960 (research; contact via repo)"

MIN_YEAR = 2000          # これより前の特許は除外(論文と同じ 2000年から)
MAX_YEAR = datetime.now(timezone.utc).year
PER_THEME = 80           # 1テーマあたり保存する代表特許数(公開日降順)
SOURCES = ["US-PGPUB", "USPAT"]   # 公開公報 + 登録特許(OCRは除外)
REQUEST_SLEEP = 0.25     # 各リクエスト後の礼儀的な間隔(秒)
SESSION_RETRY = 3


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _base_query_payload(case_id: int, query: str, *, page_count: int, sort: str) -> dict:
    """searchWithBeFamily / counts に渡すクエリペイロードを組み立てる。"""
    inner = {
        "caseId": case_id,
        "hl_snippets": "2",
        "op": "AND",
        "q": query,
        "queryName": query,
        "highlights": "0",
        "qt": "brs",
        "spellCheck": False,
        "viewName": "tile",
        "plurals": True,
        "britishEquivalents": True,
        "databaseFilters": [{"databaseName": s, "countryCodes": []} for s in SOURCES],
        "searchType": 1,
        "ignorePersist": True,
        "userEnteredQuery": query,
    }
    full = {
        "start": 0,
        "pageCount": page_count,
        "sort": sort,
        "docFamilyFiltering": "familyIdFiltering",
        "searchType": 1,
        "familyIdEnglishOnly": True,
        "familyIdFirstPreferred": "US-PGPUB",
        "familyIdSecondPreferred": "USPAT",
        "familyIdThirdPreferred": "FPRS",
        "showDocPerFamilyPref": "showEnglish",
        "queryId": 0,
        "tagDocSearch": False,
        "query": inner,
    }
    return full


class Ppubs:
    """PPUBS 公開検索 API への最小クライアント(patent_mcp_server のセッション流儀を踏襲)。"""

    def __init__(self) -> None:
        self.client = httpx.Client(
            headers={
                "X-Requested-With": "XMLHttpRequest",
                "User-Agent": USER_AGENT,
                "Origin": PPUBS_BASE,
                "Referer": f"{PPUBS_BASE}/pubwebapp/",
                "Accept": "application/json",
            },
            follow_redirects=True,
            timeout=40.0,
        )
        self.case_id: int | None = None

    def session(self) -> None:
        last_err = None
        for attempt in range(SESSION_RETRY):
            try:
                self.client.get(f"{PPUBS_BASE}/pubwebapp/")
                resp = self.client.post(
                    f"{PPUBS_BASE}/api/users/me/session",
                    json=-1,
                    headers={"X-Access-Token": "null", "Referer": f"{PPUBS_BASE}/pubwebapp/"},
                )
                resp.raise_for_status()
                data = resp.json()
                self.case_id = data["userCase"]["caseId"]
                token = resp.headers.get("X-Access-Token")
                if token:
                    self.client.headers["X-Access-Token"] = token
                return
            except Exception as e:  # noqa: BLE001
                last_err = e
                time.sleep(2 * (attempt + 1))
        raise RuntimeError(f"PPUBS session failed: {last_err}")

    def _post(self, path: str, payload: dict) -> dict:
        if self.case_id is None:
            self.session()
        for attempt in range(3):
            resp = self.client.post(f"{PPUBS_BASE}{path}", json=payload)
            if resp.status_code == 403:  # session expired
                self.session()
                payload = {**payload}
                continue
            if resp.status_code == 429:
                wait = int(resp.headers.get("x-rate-limit-retry-after-seconds", "5")) + 1
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        resp.raise_for_status()
        return resp.json()

    def count(self, query: str) -> int:
        """マッチ件数だけを返す。counts エンドポイントは `numResults` に総数を返す。"""
        payload = _base_query_payload(self.case_id, query, page_count=0, sort="date_publ desc")
        data = self._post("/api/searches/counts", payload["query"])
        if isinstance(data, dict):
            for key in ("numResults", "numFound", "totalResults", "count"):
                if isinstance(data.get(key), int):
                    return data[key]
        return 0

    def search(self, query: str, page_count: int) -> tuple[list[dict], int]:
        payload = _base_query_payload(self.case_id, query, page_count=page_count, sort="date_publ desc")
        data = self._post("/api/searches/searchWithBeFamily", payload)
        patents = data.get("patents") or data.get("docs") or []
        num_found = data.get("numFound", len(patents))
        return patents, num_found

    def close(self) -> None:
        self.client.close()


def _year_of(raw: dict) -> int | None:
    val = raw.get("datePublished") or ""
    if len(val) >= 4 and val[:4].isdigit():
        return int(val[:4])
    return None


def _normalize(raw: dict, theme: str) -> dict | None:
    number = (raw.get("publicationReferenceDocumentNumber")
              or raw.get("publicationReferenceDocumentNumber1") or "").strip()
    title = _TAG_RE.sub("", (raw.get("inventionTitle") or "")).strip()
    year = _year_of(raw)
    if not number or not title or year is None or year < MIN_YEAR:
        return None
    published = (raw.get("datePublished") or "")[:10]
    assignees = raw.get("assigneeName") or raw.get("applicantName") or []
    if isinstance(assignees, str):
        assignees = [assignees]
    assignee = assignees[0] if assignees else None
    cpc = (raw.get("cpcInventiveFlattened") or raw.get("ipcCodeFlattened") or "") or None
    if cpc:
        cpc = str(cpc).split(";")[0]
    guid = raw.get("guid") or f"US-{number}"
    return {
        "patent_id": f"ppubs-{guid}",
        "patent_number": number,
        "title": title,
        "published_at": published,            # YYYY-MM-DD
        "theme": theme,
        "assignee": assignee,
        "inventors": raw.get("inventorsShort"),
        "cpc": cpc,
        "kind": (raw.get("type") or None),    # USPAT / US-PGPUB
        "url": f"https://patents.google.com/patent/US{number}",
        "source": "ppubs",
    }


def _write_payload(out_path: str, all_patents: list[dict], theme_yearly: dict[str, dict[str, int]]) -> None:
    """現時点の収集結果を JSON に書き出す(チェックポイント兼最終出力)。"""
    payload = {
        "generated_at": _now_iso(),
        "source": "ppubs",
        "min_year": MIN_YEAR,
        "patents": all_patents,
        "theme_yearly_counts": theme_yearly,
    }
    tmp_path = f"{out_path}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, out_path)  # 原子的に置換(途中切断でも壊れない)


def main() -> int:
    out_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "data", "collected-patents.json")
    )
    # SOT-1119: 100テーマ収集は ~2800 リクエスト(70新規テーマでも ~2000)になり外部APIの
    # レート制限/切断に晒される。途中再開できるよう、既存JSONを起点に **未収集テーマだけ**を
    # 収集し、各テーマ完了ごとにチェックポイント保存する。`--force`(または PATENT_COLLECT_FORCE)
    # で全テーマ再収集。
    force = ("--force" in sys.argv) or os.getenv("PATENT_COLLECT_FORCE", "").lower() in ("1", "true", "yes", "on")

    all_patents: list[dict] = []
    seen: set[str] = set()
    theme_yearly: dict[str, dict[str, int]] = {}
    done_themes: set[str] = set()
    if not force and os.path.exists(out_path):
        try:
            with open(out_path, encoding="utf-8") as f:
                prev = json.load(f)
            theme_yearly = dict(prev.get("theme_yearly_counts") or {})
            done_themes = set(theme_yearly.keys())
            for rec in prev.get("patents") or []:
                pid = rec.get("patent_id")
                if pid and pid not in seen:
                    seen.add(pid)
                    all_patents.append(rec)
            print(f"[resume] carried over {len(all_patents)} patents / {len(done_themes)} themes "
                  f"from existing JSON", file=sys.stderr)
        except (OSError, ValueError):
            pass

    pending = [(t, q) for t, q in THEME_QUERIES.items() if force or t not in done_themes]
    print(f"[ppubs] {len(THEME_QUERIES)} total themes, {len(pending)} to collect "
          f"({len(done_themes)} already done)", file=sys.stderr)
    if not pending:
        _write_payload(out_path, all_patents, theme_yearly)
        print(f"All {len(THEME_QUERIES)} themes already collected; nothing to do.")
        return 0

    ppubs = Ppubs()
    ppubs.session()
    print(f"[ppubs] session caseId={ppubs.case_id}", file=sys.stderr)

    for theme, base_q in pending:
        field_q = _field_restrict(base_q)
        ranged = f'{field_q} AND @pd>="{MIN_YEAR}0101"<="{MAX_YEAR}1231"'
        # 1) 代表特許(直近 PER_THEME 件)
        try:
            raw_list, num_found = ppubs.search(ranged, PER_THEME)
        except Exception as e:  # noqa: BLE001
            print(f"[WARN] search failed for '{theme}': {e}", file=sys.stderr)
            raw_list, num_found = [], 0
        kept = 0
        for raw in raw_list:
            rec = _normalize(raw, theme)
            if not rec or rec["patent_id"] in seen:
                continue
            seen.add(rec["patent_id"])
            all_patents.append(rec)
            kept += 1
        time.sleep(REQUEST_SLEEP)

        # 2) テーマ×年の実マッチ件数(numFound)で年次トレンドを作る
        yearly: dict[str, int] = {}
        for year in range(MIN_YEAR, MAX_YEAR + 1):
            yq = f'{field_q} AND @pd>="{year}0101"<="{year}1231"'
            try:
                yearly[str(year)] = ppubs.count(yq)
            except Exception:  # noqa: BLE001
                yearly[str(year)] = 0
            time.sleep(REQUEST_SLEEP)
        theme_yearly[theme] = yearly
        # 各テーマ完了ごとにチェックポイント保存(途中切断でも進捗を失わない)。
        _write_payload(out_path, all_patents, theme_yearly)
        print(f"[ppubs] {theme}: kept {kept} patents, total numFound={num_found} "
              f"(checkpoint: {len(theme_yearly)} themes)", file=sys.stderr)

    ppubs.close()

    _write_payload(out_path, all_patents, theme_yearly)
    print(f"Wrote {len(all_patents)} patents across {len(theme_yearly)} themes to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
