import { getConfig } from "../config/env.js";

function decodeHtml(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function stripHtml(html = "") {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function extractTitle(html = "") {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripHtml(match[1]) : "";
}

function normalizeDuckDuckGoUrl(url) {
  try {
    const parsed = new URL(decodeHtml(url), "https://duckduckgo.com");
    const target = parsed.searchParams.get("uddg");
    return target || parsed.href;
  } catch {
    return decodeHtml(url);
  }
}

function parseDuckDuckGoResults(html) {
  const results = [];
  const regex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html)) && results.length < 10) {
    results.push({
      title: stripHtml(match[2]),
      url: normalizeDuckDuckGoUrl(match[1]),
      snippet: stripHtml(match[3]),
      source: "duckduckgo_html",
    });
  }

  if (results.length) return results;

  const fallbackRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  while ((match = fallbackRegex.exec(html)) && results.length < 10) {
    results.push({
      title: stripHtml(match[2]),
      url: normalizeDuckDuckGoUrl(match[1]),
      snippet: "",
      source: "duckduckgo_html",
    });
  }
  return results;
}

export async function searchWeb({ query, limit = 5 } = {}) {
  if (!query || typeof query !== "string") {
    throw new Error("Web search query is required.");
  }

  const config = getConfig().web;
  if (config.searchProvider !== "duckduckgo_html") {
    throw new Error(`Unsupported WEB_SEARCH_PROVIDER: ${config.searchProvider}`);
  }

  const url = new URL("https://html.duckduckgo.com/html/");
  url.searchParams.set("q", query);

  const response = await fetch(url, {
    headers: {
      "User-Agent": config.userAgent,
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Web search failed: ${response.status} ${await response.text()}`);
  }

  const html = await response.text();
  return parseDuckDuckGoResults(html).slice(0, limit);
}

export async function openWebPage({ url } = {}) {
  if (!url || typeof url !== "string") {
    throw new Error("URL is required.");
  }

  const config = getConfig().web;
  const response = await fetch(url, {
    headers: {
      "User-Agent": config.userAgent,
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Open web page failed: ${response.status} ${await response.text()}`);
  }

  const html = await response.text();
  const text = stripHtml(html).slice(0, config.maxPageChars);
  return {
    url: response.url || url,
    status: response.status,
    title: extractTitle(html),
    text,
    textLength: text.length,
  };
}
