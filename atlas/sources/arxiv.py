from __future__ import annotations

import xml.etree.ElementTree as ET

import httpx


class ArxivSource:
    name = "arxiv"
    ns = {"a": "http://www.w3.org/2005/Atom"}

    def __init__(self, timeout: float = 30.0):
        self.client = httpx.Client(timeout=timeout, headers={"User-Agent": "SyntheticImageForensicsAtlas/2.0"})

    def search(self, query: str, limit: int = 100) -> list[dict]:
        response = self.client.get("https://export.arxiv.org/api/query", params={"search_query": f'all:"{query}"', "start": 0, "max_results": min(limit, 300), "sortBy": "relevance"})
        response.raise_for_status()
        root = ET.fromstring(response.text)
        output = []
        for entry in root.findall("a:entry", self.ns):
            output.append({
                "id": entry.findtext("a:id", default="", namespaces=self.ns),
                "title": " ".join(entry.findtext("a:title", default="", namespaces=self.ns).split()),
                "summary": " ".join(entry.findtext("a:summary", default="", namespaces=self.ns).split()),
                "published": entry.findtext("a:published", default="", namespaces=self.ns),
                "authors": [node.findtext("a:name", default="", namespaces=self.ns) for node in entry.findall("a:author", self.ns)],
            })
        return output
