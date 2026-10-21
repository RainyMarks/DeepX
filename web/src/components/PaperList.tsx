import { memo, useState } from "react";
import { loadPaperDetail } from "../data";
import { CONTRIBUTIONS } from "../task";
import type { CatalogPaper, Institution, Manifest, PaperDetail } from "../types";
import { formatNumber, Icon, RankingBadges, TaskTag, useIncremental } from "./ui";

type Shards = Pick<Manifest, "detail_shards">;
type RowDetail = { status: "loading" } | { status: "error" } | { status: "ready"; detail: PaperDetail };

const BYLINE_AUTHORS = 6;

export function PaperList({ papers, manifest, institutions, onPaper, onAuthor, onInstitution, selectedId }: {
  papers: CatalogPaper[];
  manifest: Shards;
  institutions: Map<string, Institution>;
  onPaper: (id: string) => void;
  onAuthor: (id: string) => void;
  onInstitution: (name: string) => void;
  selectedId: string;
}) {
  const { visible, sentinel, hasMore, more } = useIncremental(papers, 40);
  if (!papers.length) return <EmptyState />;
  return <>
    <ol className="paper-list">
      {visible.map((paper) => <PaperRow
        key={paper.id}
        paper={paper}
        manifest={manifest}
        institutions={institutions}
        onPaper={onPaper}
        onAuthor={onAuthor}
        onInstitution={onInstitution}
        selected={paper.id === selectedId}
      />)}
    </ol>
    {hasMore && <div ref={sentinel} className="list-more">
      <button className="button" type="button" onClick={more}>显示更多（已显示 {formatNumber(visible.length)} / {formatNumber(papers.length)}）</button>
    </div>}
  </>;
}

const PaperRow = memo(function PaperRow({ paper, manifest, institutions, onPaper, onAuthor, onInstitution, selected }: {
  paper: CatalogPaper;
  manifest: Shards;
  institutions: Map<string, Institution>;
  onPaper: (id: string) => void;
  onAuthor: (id: string) => void;
  onInstitution: (name: string) => void;
  selected: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<RowDetail | null>(null);
  const venue = paper.venue?.short_name || paper.venue?.name;
  const authors = expanded ? paper.authors : paper.authors.slice(0, BYLINE_AUTHORS);
  const moreId = `paper-more-${paper.id}`;

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    // The full record lives in a detail shard; load it the first time the row opens.
    if (next && (!detail || detail.status === "error")) {
      setDetail({ status: "loading" });
      loadPaperDetail(paper.id, manifest)
        .then((record) => setDetail(record ? { status: "ready", detail: record } : { status: "error" }))
        .catch(() => setDetail({ status: "error" }));
    }
  }

  return <li className={`paper-row${selected ? " is-selected" : ""}${expanded ? " is-expanded" : ""}`}>
    <div className="paper-row-main">
      <h3><button type="button" className="paper-title" onClick={() => onPaper(paper.id)}>{paper.title}</button></h3>
      <p className="paper-byline">
        {authors.map((author, index) => <span key={`${author.id}-${index}`}>
          {index > 0 && "，"}
          <button type="button" className="author-link" onClick={() => onAuthor(author.id)}>{author.name}</button>
        </span>)}
        {!expanded && paper.authors.length > BYLINE_AUTHORS && <span> 等 {paper.authors.length} 人</span>}
      </p>
      <p className="paper-venue">
        <span className="paper-year">{paper.year ?? "年份待补"}</span>
        {venue && <span className="paper-venue-name" title={paper.venue?.name}>{venue}</span>}
        <RankingBadges venue={paper.venue} />
        <span className="paper-cites" title="引用快照">{formatNumber(paper.citation_count)} 引用</span>
      </p>
      {!expanded && paper.abstract_excerpt && <p className="paper-abstract">{paper.abstract_excerpt}</p>}
      {expanded && <PaperMore id={moreId} paper={paper} detail={detail} institutions={institutions} onPaper={onPaper} onInstitution={onInstitution} />}
      <p className="paper-tags">
        {paper.task_tags.map((task) => <TaskTag key={task} task={task} />)}
        <span className="contribution">{CONTRIBUTIONS[paper.contribution_type]}</span>
        <button type="button" className="row-toggle" aria-expanded={expanded} aria-controls={expanded ? moreId : undefined} onClick={toggle}>
          {expanded ? "收起" : "展开"}<Icon name="chevron" size={16} />
        </button>
      </p>
    </div>
    <div className="paper-row-side">
      <span className="citations" title="引用快照"><strong>{formatNumber(paper.citation_count)}</strong><small>引用</small></span>
    </div>
  </li>;
});

function PaperMore({ id, paper, detail, institutions, onPaper, onInstitution }: {
  id: string;
  paper: CatalogPaper;
  detail: RowDetail | null;
  institutions: Map<string, Institution>;
  onPaper: (id: string) => void;
  onInstitution: (name: string) => void;
}) {
  const record = detail?.status === "ready" ? detail.detail : null;
  const affiliations = paper.institution_ids.map((item) => institutions.get(item)).filter((item): item is Institution => Boolean(item));
  const doi = record?.doi ?? "";
  const arxiv = record?.arxiv_id ?? "";
  return <div id={id} className="paper-more" role="region" aria-label="摘要、机构与链接">
    {detail?.status === "loading" && <p className="paper-more-status" role="status"><span className="spinner" />正在载入完整摘要…</p>}
    {detail?.status === "error" && <p className="paper-more-status" role="alert">完整摘要加载失败，以下为摘要片段。</p>}
    {detail?.status !== "loading" && <p className="paper-abstract-full">
      {record ? record.abstract || "当前来源未提供摘要。" : paper.abstract_excerpt || "当前来源未提供摘要。"}
    </p>}
    {affiliations.length > 0 && <div className="paper-more-line">
      <span className="paper-more-label">机构</span>
      <span className="paper-affiliations">
        {affiliations.map((item) => <button key={item.id} type="button" className="text-button" onClick={() => onInstitution(item.name)} title="在论文库中只看该机构">{item.name}</button>)}
      </span>
    </div>}
    <div className="paper-more-line">
      <span className="paper-more-label">链接</span>
      <span className="paper-links">
        {paper.primary_url && <a href={paper.primary_url} target="_blank" rel="noreferrer">原始页面<Icon name="external" size={13} /></a>}
        {doi && <a href={`https://doi.org/${doi}`} target="_blank" rel="noreferrer">DOI {doi}</a>}
        {arxiv && <a href={`https://arxiv.org/abs/${arxiv}`} target="_blank" rel="noreferrer">arXiv {arxiv}</a>}
        <button type="button" className="text-button" onClick={() => onPaper(paper.id)}>完整记录</button>
      </span>
    </div>
  </div>;
}

export function EmptyState() {
  return <div className="empty-state">
    <h3>没有符合条件的论文</h3>
    <p>尝试移除部分筛选条件，或换用更宽泛的关键词。发表渠道支持常见缩写，例如 TIFS、TPAMI、CVPR。</p>
  </div>;
}
