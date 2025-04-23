import 'dotenv/config';
import { DateTime } from 'luxon';
import Parser from 'rss-parser';
import type { IngestContent } from '../util/ingestContent/types';
import assert from 'node:assert';
import { ingestContent } from '../util/ingestContent';
import { fromHtml } from 'hast-util-from-html';
import { toMdast } from 'hast-util-to-mdast';
import { toMarkdown } from 'mdast-util-to-markdown';
import { gfmToMarkdown } from 'mdast-util-gfm';
import { isTextRailRelated } from '../util/isTextRailRelated';

const TWITTER_MASTODON_RSS_FEEDS: string[] = [
  'https://mastodon.social/@ltatrainservicealerts.rss',
];

interface RedditFeed {
  subreddit: string;
  feedUrl: string;
}

const REDDIT_RSS_FEEDS: RedditFeed[] = [];

const NEWS_RSS_FEEDS: string[] = [
  'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=10416',
  'https://www.straitstimes.com/news/singapore/rss.xml',
];

const parser = new Parser({
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  },
  requestOptions: {
    secureProtocol: 'TLSv1_2_method', // Somehow needed for Straits Times RSS
  },
});
const dateTimeCutoff = DateTime.now().minus({ hour: 1 });

for (const feedUrl of TWITTER_MASTODON_RSS_FEEDS) {
  console.log(`[checkRssFeeds] feedUrl=${feedUrl}`);
  try {
    const { title = '', items } = await parser.parseURL(feedUrl);
    console.log(`[checkRssFeeds] itemCount=${items.length}`);

    for (const item of items.reverse()) {
      const { contentSnippet, link, isoDate } = item;
      assert(contentSnippet != null);

      console.log(
        `[checkRssFeeds] account=${title} text=${contentSnippet} isoDate=${isoDate}`,
      );

      if (!isTextRailRelated(contentSnippet)) {
        continue;
      }

      if (isoDate == null) {
        continue;
      }

      const dateTime = DateTime.fromISO(isoDate);
      if (!dateTime.isValid) {
        console.log(`Could not parse date using ISO8601 ${isoDate}`);
        continue;
      }

      if (dateTime < dateTimeCutoff) {
        continue;
      }

      const createdAt = dateTime.setZone('Asia/Singapore').toISO();
      assert(createdAt != null);

      assert(link != null);

      const content: IngestContent = {
        source: 'mastodon',
        accountName: title,
        createdAt,
        text: contentSnippet,
        url: link,
      };

      await ingestContent(content);
    }
  } catch (e) {
    console.error(e);
  }
}

for (const { subreddit, feedUrl } of REDDIT_RSS_FEEDS) {
  console.log(`[checkRssFeeds] feedUrl=${feedUrl}`);
  try {
    const { items } = await parser.parseURL(feedUrl);
    console.log(`[checkRssFeeds] itemCount=${items.length}`);

    for (const item of items.reverse()) {
      const { title, content: contentHtml, link, isoDate, thumbnail } = item;
      assert(title != null);
      assert(contentHtml != null);

      console.log(`[checkRssFeeds] title=${title} isoDate=${isoDate}`);

      if (!isTextRailRelated(title) && !isTextRailRelated(contentHtml)) {
        continue;
      }

      if (isoDate == null) {
        continue;
      }

      const dateTime = DateTime.fromISO(isoDate);
      if (!dateTime.isValid) {
        console.log(`Could not parse date using ISO8601 ${isoDate}`);
        continue;
      }

      if (dateTime < dateTimeCutoff) {
        continue;
      }

      const createdAt = dateTime.setZone('Asia/Singapore').toISO();
      assert(createdAt != null);

      assert(link != null);

      const hast = fromHtml(contentHtml);
      const mdast = toMdast(hast);
      const markdown = toMarkdown(mdast, {
        extensions: [gfmToMarkdown()],
      });

      const content: IngestContent = {
        source: 'reddit',
        createdAt,
        subreddit,
        title,
        selftext: markdown,
        url: link,
        thumbnailUrl: thumbnail?.[0]?.$?.url ?? null,
      };

      await ingestContent(content);
    }
  } catch (e) {
    console.error(e);
  }
}

for (const feedUrl of NEWS_RSS_FEEDS) {
  console.log(`[checkRssFeeds] feedUrl=${feedUrl}`);
  try {
    const { items } = await parser.parseURL(feedUrl);
    console.log(`[checkRssFeeds] itemCount=${items.length}`);

    for (const item of items.reverse()) {
      const { title, contentSnippet, link, isoDate } = item;
      assert(title != null);
      assert(contentSnippet != null);

      console.log(`[checkRssFeeds] title=${title} isoDate=${isoDate}`);

      if (!isTextRailRelated(title) && !isTextRailRelated(contentSnippet)) {
        continue;
      }

      if (isoDate == null) {
        continue;
      }

      const dateTime = DateTime.fromISO(isoDate);
      if (!dateTime.isValid) {
        console.log(`Could not parse date using ISO8601 ${isoDate}`);
        continue;
      }

      if (dateTime < dateTimeCutoff) {
        continue;
      }

      const createdAt = dateTime.setZone('Asia/Singapore').toISO();
      assert(createdAt != null);
      assert(link != null);

      const content: IngestContent = {
        source: 'news-website',
        createdAt,
        title,
        summary: contentSnippet,
        url: link,
      };

      await ingestContent(content);
    }
  } catch (e) {
    console.error(e);
  }
}
