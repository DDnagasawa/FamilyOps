import { getConfig } from "../config/env.js";

function decodeXml(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}

function stripMarkup(value = "") {
  return decodeXml(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function readTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripMarkup(match[1]) : "";
}

function parseFeed(xml, feedUrl) {
  const channelTitle = readTag(xml, "title") || feedUrl;
  const items = [];
  const itemRegex = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>|<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) && items.length < 30) {
    const block = match[1] || match[2] || "";
    const atomLink = block.match(/<link[^>]+href="([^"]+)"/i)?.[1] || "";
    items.push({
      source: channelTitle,
      feedUrl,
      title: readTag(block, "title") || "Untitled",
      url: readTag(block, "link") || atomLink,
      summary: readTag(block, "description") || readTag(block, "summary") || readTag(block, "content"),
      publishedAt: readTag(block, "pubDate") || readTag(block, "updated") || readTag(block, "published"),
    });
  }

  return items;
}

export async function fetchRssNews({ feedUrls, limit = 10 } = {}) {
  const config = getConfig();
  const urls = (feedUrls?.length ? feedUrls : config.news.feedUrls).filter(Boolean);
  if (!urls.length) {
    throw new Error("No RSS feed URLs configured. Set RSS_FEED_URLS or pass feedUrls.");
  }

  const results = [];
  const warnings = [];

  for (const feedUrl of urls) {
    try {
      const response = await fetch(feedUrl, {
        headers: {
          "User-Agent": config.web.userAgent,
          Accept: "application/rss+xml,application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
        },
      });
      if (!response.ok) {
        throw new Error(`RSS request failed: ${response.status}`);
      }
      results.push(...parseFeed(await response.text(), feedUrl));
    } catch (error) {
      warnings.push({ feedUrl, message: error.message });
    }
  }

  return {
    count: results.length,
    items: results.slice(0, limit),
    warnings,
  };
}
