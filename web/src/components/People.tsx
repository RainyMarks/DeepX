import { useMemo, useState } from "react";
import { coauthors, type AuthorSummary } from "../insights";
import { countryName, TASKS } from "../task";
import type { Institution } from "../types";
import { Drawer, formatNumber, Icon, TaskTag, taskStyle, useIncremental } from "./ui";

export function AuthorsView({ authors, onAuthor }: { authors: AuthorSummary[]; onAuthor: (id: string) => void }) {
  const { visible, sentinel, hasMore, more } = useIncremental(authors, 60);
  if (!authors.length) return <p className="empty">当前筛选范围内没有学者。</p>;
  return <>
    <table className="data-table">
      <thead><tr><th className="num">#</th><th>学者</th><th className="num">论文</th><th className="num hide-sm">引用</th><th className="hide-sm">活跃年份</th><th>主要方向</th></tr></thead>
      <tbody>
        {visible.map((author, index) => <tr key={author.id}>
          <td className="num muted">{index + 1}</td>
          <td><button type="button" className="row-link" onClick={() => onAuthor(author.id)}>{author.name}</button></td>
          <td className="num"><strong>{author.papers.length}</strong></td>
          <td className="num hide-sm">{formatNumber(author.citations)}</td>
          <td className="hide-sm muted">{author.firstYear === author.lastYear ? author.firstYear ?? "—" : `${author.firstYear}–${author.lastYear}`}</td>
          <td><span className="tag-row">{author.tasks.slice(0, 2).map(([task]) => <TaskTag key={task} task={task} />)}</span></td>
        </tr>)}
      </tbody>
    </table>
    {hasMore && <div ref={sentinel} className="list-more"><button className="button" type="button" onClick={more}>显示更多学者</button></div>}
  </>;
}

export function InstitutionsView({ rows, onInstitution }: {
  rows: { institution: Institution; count: number }[];
  onInstitution: (name: string) => void;
}) {
  const { visible, sentinel, hasMore, more } = useIncremental(rows, 80);
  if (!rows.length) return <p className="empty">当前筛选范围内没有机构。</p>;
  return <>
    <table className="data-table">
      <thead><tr><th className="num">#</th><th>机构</th><th className="hide-sm">所在地</th><th className="num">论文</th></tr></thead>
      <tbody>
        {visible.map(({ institution, count }, index) => <tr key={institution.id}>
          <td className="num muted">{index + 1}</td>
          <td>
            <button type="button" className="row-link" onClick={() => onInstitution(institution.name)}>{institution.name}</button>
            <span className="show-sm muted">{countryName(institution.country_code, institution.country)}</span>
          </td>
          <td className="hide-sm muted">{[institution.city, countryName(institution.country_code, institution.country)].filter(Boolean).join(" · ") || "—"}</td>
          <td className="num"><strong>{count}</strong></td>
        </tr>)}
      </tbody>
    </table>
    {hasMore && <div ref={sentinel} className="list-more"><button className="button" type="button" onClick={more}>显示更多机构</button></div>}
  </>;
}

const AUTHOR_PAPER_PREVIEW = 12;

export function AuthorDrawer({ author, institutions, onClose, onPaper, onAuthor, onAllPapers }: {
  author: AuthorSummary | null;
  institutions: Map<string, Institution>;
  onClose: () => void;
  onPaper: (id: string) => void;
  onAuthor: (id: string) => void;
  onAllPapers: (name: string) => void;
}) {
  const [allPapers, setAllPapers] = useState(false);
  const profile = useMemo(() => {
    if (!author) return null;
    const years = new Map<number, number>();
    const affiliations = new Map<string, number>();
    for (const paper of author.papers) {
      if (paper.year) years.set(paper.year, (years.get(paper.year) ?? 0) + 1);
      for (const id of paper.institution_ids) affiliations.set(id, (affiliations.get(id) ?? 0) + 1);
    }
    return {
      timeline: [...years.entries()].sort((a, b) => a[0] - b[0]),
      affiliations: [...affiliations.entries()]
        .map(([id, count]) => [institutions.get(id), count] as const)
        .filter((entry): entry is readonly [Institution, number] => Boolean(entry[0]))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8),
      coauthors: coauthors(author, 12),
      papers: [...author.papers].sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || b.citation_count - a.citation_count),
    };
  }, [author, institutions]);

  return <Drawer label="学者档案" onClose={onClose}>
    {!author || !profile ? <div className="drawer-status">未在图谱中找到该学者。</div> : <div className="drawer-body">
      <p className="eyebrow">学者档案 · 仅统计图谱收录论文</p>
      <h2 className="record-title">{author.name}</h2>
      <dl className="mini-metrics">
        <div><dt>论文</dt><dd>{author.papers.length}</dd></div>
        <div><dt>引用</dt><dd>{formatNumber(author.citations)}</dd></div>
        <div><dt>活跃</dt><dd>{author.firstYear === author.lastYear ? author.firstYear ?? "—" : `${author.firstYear}–${author.lastYear}`}</dd></div>
      </dl>

      <section className="record-section">
        <h3>研究方向</h3>
        <ul className="share-bars">
          {author.tasks.map(([task, count]) => <li key={task} style={taskStyle(task)}>
            <span>{TASKS[task].label}</span>
            <i><b style={{ width: `${(count / author.papers.length) * 100}%` }} /></i>
            <strong>{count}</strong>
          </li>)}
        </ul>
      </section>

      <section className="record-section">
        <h3>年度产出</h3>
        <div className="timeline" role="img" aria-label="逐年论文数">
          {profile.timeline.map(([year, count]) => <span key={year} title={`${year} 年：${count} 篇`}>
            <i style={{ height: `${(count / Math.max(...profile.timeline.map((item) => item[1]))) * 100}%` }} />
            <small>{String(year).slice(2)}</small>
          </span>)}
        </div>
      </section>

      {profile.affiliations.length > 0 && <section className="record-section">
        <h3>署名机构</h3>
        <p className="section-note">来自其论文的署名机构，可能包含合作者所在单位。</p>
        <ul className="affiliations">
          {profile.affiliations.map(([item, count]) => <li key={item.id}>
            <span>{item.name}</span>
            <small>{countryName(item.country_code, item.country)} · {count} 篇</small>
          </li>)}
        </ul>
      </section>}

      {profile.coauthors.length > 0 && <section className="record-section">
        <h3>主要合作者</h3>
        <p className="chip-row">
          {profile.coauthors.map((item) => <button key={item.id} type="button" className="chip" onClick={() => onAuthor(item.id)}>{item.name}<small>{item.count}</small></button>)}
        </p>
      </section>}

      <section className="record-section">
        <h3>论文（{author.papers.length}）</h3>
        <ul className="compact-papers" id="author-papers">
          {(allPapers ? profile.papers : profile.papers.slice(0, AUTHOR_PAPER_PREVIEW)).map((paper) => <li key={paper.id}>
            <button type="button" onClick={() => onPaper(paper.id)}>
              <span>{paper.year ?? "—"}</span>
              <span>{paper.title}</span>
            </button>
          </li>)}
        </ul>
        {profile.papers.length > AUTHOR_PAPER_PREVIEW && <button
          className="link-button list-toggle"
          type="button"
          aria-expanded={allPapers}
          aria-controls="author-papers"
          onClick={() => setAllPapers((value) => !value)}
        >{allPapers ? "收起" : `展开全部 ${profile.papers.length} 篇`}</button>}
        <button className="button block" type="button" onClick={() => onAllPapers(author.name)}>在论文库中查看全部 <Icon name="arrow" size={16} /></button>
      </section>
    </div>}
  </Drawer>;
}
