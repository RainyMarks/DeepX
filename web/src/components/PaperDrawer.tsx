import { useState } from "react";
import { toBibtex } from "../exports";
import { CONTRIBUTIONS, countryName, SOURCES, VENUE_TYPES } from "../task";
import type { Institution, PaperDetail } from "../types";
import { Drawer, Icon, RankingBadges, TaskTag } from "./ui";

export function PaperDrawer({ state, institutions, onClose, onAuthor, onInstitution }: {
  state: { status: "loading" } | { status: "error"; message: string } | { status: "ready"; detail: PaperDetail };
  institutions: Map<string, Institution>;
  onClose: () => void;
  onAuthor: (id: string) => void;
  onInstitution: (name: string) => void;
}) {
  return <Drawer label="论文详情" onClose={onClose}>
    {state.status === "loading" && <div className="drawer-status" role="status"><span className="spinner" />正在载入论文记录…</div>}
    {state.status === "error" && <div className="drawer-status" role="alert">论文记录加载失败：{state.message}</div>}
    {state.status === "ready" && <PaperRecord detail={state.detail} institutions={institutions} onAuthor={onAuthor} onInstitution={onInstitution} />}
  </Drawer>;
}

function PaperRecord({ detail, institutions, onAuthor, onInstitution }: {
  detail: PaperDetail;
  institutions: Map<string, Institution>;
  onAuthor: (id: string) => void;
  onInstitution: (name: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const affiliations = detail.institution_ids.map((id) => institutions.get(id)).filter((item): item is Institution => Boolean(item));
  const doiUrl = detail.doi ? `https://doi.org/${detail.doi}` : "";
  const arxivUrl = detail.arxiv_id ? `https://arxiv.org/abs/${detail.arxiv_id}` : "";

  async function copyBibtex() {
    try {
      await navigator.clipboard.writeText(toBibtex([detail]));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return <div className="drawer-body">
    <p className="eyebrow">{[detail.year ?? "年份待补", detail.venue ? VENUE_TYPES[detail.venue.type] ?? "" : "", CONTRIBUTIONS[detail.contribution_type]].filter(Boolean).join(" · ")}</p>
    <h2 className="record-title">{detail.title}</h2>
    {detail.title_zh && <p className="record-subtitle">{detail.title_zh}</p>}
    <p className="record-authors">
      {detail.authors.map((author, index) => <span key={`${author.id}-${index}`}>
        {index > 0 && "，"}
        <button type="button" className="author-link" onClick={() => onAuthor(author.id)}>{author.name}</button>
      </span>)}
    </p>

    <div className="record-actions">
      <a className="button primary" href={detail.primary_url} target="_blank" rel="noreferrer">原始页面 <Icon name="external" size={15} /></a>
      {arxivUrl && arxivUrl !== detail.primary_url && <a className="button" href={arxivUrl} target="_blank" rel="noreferrer">arXiv</a>}
      <button className="button" type="button" onClick={copyBibtex}><Icon name="copy" size={15} />{copied ? "已复制" : "BibTeX"}</button>
    </div>

    <section className="record-section">
      <h3>发表渠道</h3>
      <p className="record-venue">{detail.venue?.name || "来源待补"}</p>
      <p className="badge-row"><RankingBadges venue={detail.venue} linked /></p>
    </section>

    <section className="record-section">
      <h3>摘要</h3>
      <p className="record-abstract">{detail.abstract || "当前来源未提供摘要。"}</p>
    </section>

    <section className="record-section">
      <h3>研究方向</h3>
      <p className="badge-row">{detail.task_tags.map((task) => <TaskTag key={task} task={task} long />)}</p>
    </section>

    {affiliations.length > 0 && <section className="record-section">
      <h3>署名机构</h3>
      <ul className="affiliations">
        {affiliations.map((item) => <li key={item.id}>
          <button type="button" className="text-button" onClick={() => onInstitution(item.name)}>{item.name}</button>
          <small>{[item.city, countryName(item.country_code, item.country)].filter(Boolean).join(" · ")}</small>
        </li>)}
      </ul>
    </section>}

    <section className="record-section">
      <h3>书目信息</h3>
      <dl className="record-meta">
        <div><dt>DOI</dt><dd>{doiUrl ? <a href={doiUrl} target="_blank" rel="noreferrer">{detail.doi}</a> : "—"}</dd></div>
        <div><dt>arXiv</dt><dd>{arxivUrl ? <a href={arxivUrl} target="_blank" rel="noreferrer">{detail.arxiv_id}</a> : "—"}</dd></div>
        <div><dt>发表日期</dt><dd>{detail.publication_date || detail.year || "—"}</dd></div>
        <div><dt>引用快照</dt><dd>{detail.citation_count}</dd></div>
        <div><dt>审核状态</dt><dd>{detail.review_status === "verified" ? "人工核验" : "自动收录待复核"}</dd></div>
      </dl>
    </section>

    <section className="record-section">
      <h3>数据来源</h3>
      <ul className="provenance">
        {detail.provenance.map((item, index) => <li key={`${item.source}-${index}`}>
          <strong>{SOURCES[item.source] ?? item.source}</strong>
          {item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.source_id || item.url}</a> : <span>{item.source_id}</span>}
          <small>{item.retrieved_at.slice(0, 10)}</small>
        </li>)}
      </ul>
    </section>
  </div>;
}
