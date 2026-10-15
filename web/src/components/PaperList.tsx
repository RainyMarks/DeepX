import { memo } from "react";
import { CONTRIBUTIONS } from "../task";
import type { CatalogPaper } from "../types";
import { formatNumber, RankingBadges, TaskTag, useIncremental } from "./ui";

export function PaperList({ papers, onPaper, onAuthor, selectedId }: {
  papers: CatalogPaper[];
  onPaper: (id: string) => void;
  onAuthor: (id: string) => void;
  selectedId: string;
}) {
  const { visible, sentinel, hasMore, more } = useIncremental(papers, 40);
  if (!papers.length) return <EmptyState />;
  return <>
    <ol className="paper-list">
      {visible.map((paper) => <PaperRow key={paper.id} paper={paper} onPaper={onPaper} onAuthor={onAuthor} selected={paper.id === selectedId} />)}
    </ol>
    {hasMore && <div ref={sentinel} className="list-more">
      <button className="button" type="button" onClick={more}>显示更多（已显示 {formatNumber(visible.length)} / {formatNumber(papers.length)}）</button>
    </div>}
  </>;
}

const PaperRow = memo(function PaperRow({ paper, onPaper, onAuthor, selected }: {
  paper: CatalogPaper;
  onPaper: (id: string) => void;
  onAuthor: (id: string) => void;
  selected: boolean;
}) {
  const venue = paper.venue?.short_name || paper.venue?.name;
  return <li className={`paper-row${selected ? " is-selected" : ""}`}>
    <div className="paper-row-main">
      <h3><button type="button" className="paper-title" onClick={() => onPaper(paper.id)}>{paper.title}</button></h3>
      <p className="paper-byline">
        {paper.authors.slice(0, 6).map((author, index) => <span key={`${author.id}-${index}`}>
          {index > 0 && "，"}
          <button type="button" className="author-link" onClick={() => onAuthor(author.id)}>{author.name}</button>
        </span>)}
        {paper.authors.length > 6 && <span> 等 {paper.authors.length} 人</span>}
      </p>
      <p className="paper-venue">
        <span className="paper-year">{paper.year ?? "年份待补"}</span>
        {venue && <span title={paper.venue?.name}>{venue}</span>}
        <RankingBadges venue={paper.venue} />
      </p>
      {paper.abstract_excerpt && <p className="paper-abstract">{paper.abstract_excerpt}</p>}
      <p className="paper-tags">
        {paper.task_tags.map((task) => <TaskTag key={task} task={task} />)}
        <span className="contribution">{CONTRIBUTIONS[paper.contribution_type]}</span>
      </p>
    </div>
    <div className="paper-row-side">
      <span className="citations" title="引用快照"><strong>{formatNumber(paper.citation_count)}</strong><small>引用</small></span>
    </div>
  </li>;
});

export function EmptyState() {
  return <div className="empty-state">
    <h3>没有符合条件的论文</h3>
    <p>尝试移除部分筛选条件，或换用更宽泛的关键词。发表渠道支持常见缩写，例如 TIFS、TPAMI、CVPR。</p>
  </div>;
}
