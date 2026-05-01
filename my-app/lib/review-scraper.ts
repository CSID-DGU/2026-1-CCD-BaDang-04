import { chromium, type Page } from "playwright";

export type ScrapedReview = {
  author: string | null;
  rating: number | null;
  date: string | null;
  content: string;
};

export type ScrapedMenu = {
  name: string;
  price: string | null;
};

export type ScrapedPlaceInfo = {
  placeName: string | null;
  averageRating: number | null;
  menus: ScrapedMenu[];
};

type ScrapeResult = {
  source: string;
  place: ScrapedPlaceInfo;
  reviews: ScrapedReview[];
  note?: string;
};

function isKakaoPlaceUrl(url: URL) {
  return url.hostname === "place.map.kakao.com";
}

function getPlaceId(url: URL) {
  const match = url.pathname.match(/\/(\d+)/);
  return match ? match[1] : null;
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function stripTrailingUiText(text: string) {
  return text.replace(/\s*(더보기|접기)\s*$/g, "").trim();
}

function isTagOnlyContent(text: string) {
  const normalized = normalizeWhitespace(text).replace(/\+\d+/g, "").trim();

  if (!normalized) {
    return true;
  }

  const tokens = normalized.split(" ").filter(Boolean);
  const allowedTags = new Set(["맛", "가성비", "분위기", "친절"]);

  return tokens.every((token) => allowedTags.has(token));
}

function parseRating(text: string) {
  const matches = Array.from(text.matchAll(/별점\s*([0-5](?:\.\d)?)/g));
  const lastMatch = matches.at(-1);
  return lastMatch ? Number(lastMatch[1]) : null;
}

function parseDate(text: string) {
  const match = text.match(
    /신고별점\s*[0-5](?:\.\d)?\s*(\d{4}\.\d{2}\.\d{2}\.)/,
  );
  if (match) {
    return match[1];
  }

  const fallbackMatch = text.match(/\b\d{4}\.\d{2}\.\d{2}\./);
  return fallbackMatch ? fallbackMatch[0] : null;
}

function extractAuthor(text: string) {
  const match = text.match(
    /리뷰어 이름,\s*([\s\S]*?)\s*(브론즈|실버|골드|블루)\s+레벨/,
  );
  if (match) {
    return normalizeWhitespace(match[1]);
  }

  return null;
}

function extractContent(text: string) {
  const coreMatch = text.match(
    /신고별점\s*[0-5](?:\.\d)?\s*(\d{4}\.\d{2}\.\d{2}\.)\s*([\s\S]*?)(사진 목록|좋아요 개수,|리뷰어 이름,|$)/,
  );
  if (coreMatch) {
    const candidate = stripTrailingUiText(normalizeWhitespace(coreMatch[2]))
      .replace(/^(월요일|화요일|수요일|목요일|금요일|토요일|일요일)\s*/, "")
      .replace(/^(맛|가성비|분위기|친절)(\s+(맛|가성비|분위기|친절))*\s*/, "")
      .trim();

    return candidate;
  }

  const parts = text
    .split(
      /신고별점\s*[0-5](?:\.\d)?|\d{4}\.\d{2}\.\d{2}\.|좋아요 개수,|사진 목록|메뉴 더보기|공유|신고|리뷰어 이름,/,
    )
    .map((part) => normalizeWhitespace(part))
    .filter(Boolean);

  return (
    parts.find(
      (part) =>
        part.length >= 2 &&
        !part.includes("레벨") &&
        !part.includes("팔로워") &&
        !part.includes("별점평균") &&
        !part.includes("후기 ") &&
        part !== "더보기" &&
        part !== "접기",
    ) ?? ""
  );
}

async function clickFirstAvailable(page: Page, selectors: string[]) {
  for (const selector of selectors) {
    const trigger = page.locator(selector).first();
    if (await trigger.count()) {
      await trigger.click({ timeout: 3000 }).catch(() => undefined);
      await page.waitForTimeout(1000);
      return true;
    }
  }

  return false;
}

async function scrollScrollableAreas(page: Page) {
  await page.evaluate(() => {
    const scrollTargets = Array.from(document.querySelectorAll("*")).filter(
      (element) => {
        const htmlElement = element as HTMLElement;
        return htmlElement.scrollHeight > htmlElement.clientHeight + 40;
      },
    );

    scrollTargets.forEach((element) => {
      const htmlElement = element as HTMLElement;
      htmlElement.scrollTop = htmlElement.scrollHeight;
    });

    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" });
  });
}

async function scrapePlaceInfo(page: Page): Promise<Omit<ScrapedPlaceInfo, "menus">> {
  return page.evaluate(() => {
    const fullText = (document.body.textContent ?? "").replace(/\s+/g, " ").trim();

    const nameSelectors = [
      'h2[class*="tit"]',
      'h2[class*="title"]',
      'strong[class*="tit"]',
      'strong[class*="name"]',
    ];

    let placeName: string | null = null;
    for (const selector of nameSelectors) {
      const text = document.querySelector(selector)?.textContent?.trim();
      if (text && text.length > 1) {
        placeName = text;
        break;
      }
    }

    const ratingMatch =
      fullText.match(/평점\s*([0-5](?:\.\d)?)/) ??
      fullText.match(/별점\s*([0-5](?:\.\d)?)/);

    const averageRating = ratingMatch ? Number(ratingMatch[1]) : null;

    return {
      placeName,
      averageRating:
        averageRating !== null && averageRating >= 0 && averageRating <= 5
          ? averageRating
          : null,
    };
  });
}

async function scrapeMenus(page: Page, menuUrl: string | null): Promise<ScrapedMenu[]> {
  if (!menuUrl) {
    return [];
  }

  await page.goto(menuUrl, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(1200);

  for (let index = 0; index < 8; index += 1) {
    await scrollScrollableAreas(page);
    await page.waitForTimeout(300);
  }

  return page.evaluate(() => {
    const selectors = [
      '.section_product .info_goods',
      '.wrap_goods .info_goods',
      'ul.list_menu > li .info_goods',
    ];

    const results: Array<{ name: string; price: string | null }> = [];
    const seen = new Set<string>();

    const pricePattern = /(\d{1,3}(?:,\d{3})*)(원)/;

    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        const text = (element.textContent ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        if (!text || seen.has(text) || !pricePattern.test(text)) {
          return;
        }

        const priceMatch = text.match(pricePattern);
        const price = priceMatch ? `${priceMatch[1]}${priceMatch[2]}` : null;
        const name = text
          .replace(pricePattern, "")
          .replace(/메뉴 더보기|공유|주문|대표|추천|AI 추천/g, "")
          .trim();

        if (
          !name ||
          name.length < 2 ||
          name.length > 40 ||
          name.includes("전체") ||
          name.includes("접기") ||
          name.includes("카테고리") ||
          name === "메뉴 목록"
        ) {
          return;
        }

        seen.add(text);
        results.push({ name, price });
      });
    });

    return results.slice(0, 20);
  });
}

async function scrapeReviews(page: Page): Promise<ScrapedReview[]> {
  await clickFirstAvailable(page, [
    'a[href*="#review"]',
    'button:has-text("리뷰")',
    '[role="tab"]:has-text("리뷰")',
    'a:has-text("리뷰")',
  ]);

  let previousReviewCount = 0;

  for (let index = 0; index < 20; index += 1) {
    await scrollScrollableAreas(page);
    await page.waitForTimeout(800);

    const currentReviewCount = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("li, div"))
        .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(
          (text) =>
            text.includes("리뷰어 이름,") &&
            text.includes("별점") &&
            text.length > 20,
        ).length;
    });

    if (currentReviewCount > 0 && currentReviewCount === previousReviewCount) {
      break;
    }

    previousReviewCount = currentReviewCount;
  }

  const expandSelectors = [
    'button:has-text("더보기")',
    'a:has-text("더보기")',
    '[role="button"]:has-text("더보기")',
  ];

  for (const selector of expandSelectors) {
    const expandButtons = page.locator(selector);
    const count = await expandButtons.count();

    for (let index = 0; index < count; index += 1) {
      await expandButtons
        .nth(index)
        .click({ timeout: 1500 })
        .catch(() => undefined);
      await page.waitForTimeout(120);
    }
  }

  await page.waitForTimeout(500);

  const rawCards = await page.evaluate(() => {
    const cardSelectors = [
      'li[class*="review"]',
      'ul.list_review > li',
      'div.evaluation_review',
    ];

    const cards: string[] = [];
    const seen = new Set<string>();

    cardSelectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        const text = (element.textContent ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim();

        if (
          !text ||
          text.length < 20 ||
          !text.includes("리뷰어 이름,") ||
          !text.includes("별점")
        ) {
          return;
        }

        if (seen.has(text)) {
          return;
        }

        seen.add(text);
        cards.push(text);
      });
    });

    return cards.slice(0, 120);
  });

  return rawCards
    .map((card) => {
      const author = extractAuthor(card);
      const rating = parseRating(card);
      const date = parseDate(card);
      const content = extractContent(card);

      if (!content || content.length < 2 || isTagOnlyContent(content)) {
        return null;
      }

      return {
        author,
        rating,
        date,
        content: stripTrailingUiText(normalizeWhitespace(content)),
      };
    })
    .filter((review): review is ScrapedReview => Boolean(review));
}

async function scrapePlaceData(pageUrl: string): Promise<ScrapeResult> {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(1500);

    const parsedUrl = new URL(pageUrl);
    const placeId = getPlaceId(parsedUrl);
    const menuUrl = placeId
      ? `https://place.map.kakao.com/${placeId}#menuInfo`
      : null;

    const baseInfo = await scrapePlaceInfo(page);
    const menus = await scrapeMenus(page, menuUrl);
    await page.goto(pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(1200);
    const reviews = await scrapeReviews(page);

    return {
      source: pageUrl,
      place: { ...baseInfo, menus },
      reviews,
      note: "가게 기본 정보, 메뉴, 리뷰를 Playwright로 수집하는 실험 기능입니다.",
    };
  } finally {
    await browser.close();
  }
}

export async function scrapeReviewsFromPlace(rawUrl: string): Promise<ScrapeResult> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("유효한 URL을 입력하세요.");
  }

  if (!/^https?:$/.test(parsedUrl.protocol)) {
    throw new Error("http 또는 https 링크만 지원합니다.");
  }

  if (!isKakaoPlaceUrl(parsedUrl)) {
    throw new Error("현재는 카카오맵 장소 링크만 지원합니다.");
  }

  const result = await scrapePlaceData(parsedUrl.toString());

  if (!result.reviews.length && !result.place.menus.length) {
    throw new Error(
      "가게 정보를 찾지 못했습니다. 페이지 구조가 바뀌었거나 접근이 제한되었을 수 있습니다.",
    );
  }

  return result;
}
