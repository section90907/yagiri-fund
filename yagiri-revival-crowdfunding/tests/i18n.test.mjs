import assert from "node:assert/strict";
import test from "node:test";
import { ja } from "../src/content/ja.js";
import { en } from "../src/content/en.js";
import { REWARDS, HERO_SLIDES, TAPROOM_IMAGES, DAMAGE_DOC_IMAGES, FEATURED_IMAGES, CAMPAIGN_CLOSED, CAMPAIGN_END_DATE, FINAL_FUND_RESULT, calculateRemaining, finalRate } from "../src/content/data.js";

// Walks both dictionaries together and reports every path whose type or
// array length differs, so a missing English string fails loudly instead of
// rendering `undefined` on the page.
function shapeMismatches(a, b, path = "") {
  const kind = (v) => (Array.isArray(v) ? "array" : typeof v);
  if (kind(a) !== kind(b)) return [`${path}: ${kind(a)} vs ${kind(b)}`];
  if (Array.isArray(a)) {
    const own = a.length === b.length ? [] : [`${path}: length ${a.length} vs ${b.length}`];
    return own.concat(a.flatMap((item, i) => (i < b.length ? shapeMismatches(item, b[i], `${path}[${i}]`) : [])));
  }
  if (a && typeof a === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...keys].flatMap((key) =>
      key in a && key in b ? shapeMismatches(a[key], b[key], `${path}.${key}`) : [`${path}.${key}: missing in ${key in a ? "en" : "ja"}`],
    );
  }
  if (typeof a === "string" && (a.trim() === "" || b.trim() === "")) return [`${path}: empty string`];
  return [];
}

test("ja and en dictionaries have the same shape", () => {
  assert.deepEqual(shapeMismatches(ja, en), []);
});

test("per-item copy lines up with the shared page data", () => {
  for (const [name, dict] of [["ja", ja], ["en", en]]) {
    assert.equal(dict.returns.items.length, REWARDS.length, `${name}: rewards`);
    assert.equal(dict.hero.slideAlts.length, HERO_SLIDES.length, `${name}: hero slides`);
    assert.equal(dict.taproom.photos.length, TAPROOM_IMAGES.length, `${name}: taproom photos`);
    assert.equal(dict.damage.documentary.length, DAMAGE_DOC_IMAGES.length, `${name}: damage photos`);
    assert.equal(dict.join.featured.length, FEATURED_IMAGES.length, `${name}: featured`);
  }
});

test("formatters produce the expected money and date strings", () => {
  assert.deepEqual(ja.yen(1_000_000), { prefix: "", value: "1,000,000", unit: "円" });
  assert.deepEqual(en.yen(1_000_000), { prefix: "¥", value: "1,000,000", unit: "" });
  assert.equal(ja.asOf(new Date("2026-09-10T12:00:00+09:00")), "2026年9月10日時点");
  assert.equal(en.asOf(new Date("2026-09-10T12:00:00+09:00")), "As of Sep 10, 2026");
  // 日本時間の日付で書く：UTC では 11月12日 15:45 でも、表示は 11月13日
  assert.equal(ja.asOf(new Date("2026-11-12T15:45:25Z")), "2026年11月13日時点");
  assert.equal(en.asOf(new Date("2026-11-12T15:45:25Z")), "As of Nov 13, 2026");
  assert.deepEqual(ja.hero.remainingDays(43), { value: "43", unit: "日" });
  assert.deepEqual(en.hero.remainingDays(43), { value: "43", unit: " days" });
  assert.deepEqual(en.hero.remainingDays(1), { value: "1", unit: " day" });
  assert.deepEqual(ja.hero.remainingHours(12), { value: "12", unit: "時間" });
  assert.deepEqual(en.hero.remainingHours(12), { value: "12", unit: " hrs" });
  assert.deepEqual(en.hero.remainingHours(1), { value: "1", unit: " hr" });
  assert.deepEqual(ja.hero.remainingEnded(), { value: "募集終了", unit: "" });
  assert.deepEqual(en.hero.remainingEnded(), { value: "Ended", unit: "" });
  assert.equal(en.returns.items[0].alt, "¥3,000 Supporter reward: Original sticker + 1 free drink ticket for the taproom");
});

test("calculateRemaining counts down correctly to November 3, 2026 23:59:59", () => {
  const target = new Date("2026-11-03T23:59:59+09:00");
  const onSep18 = calculateRemaining(new Date("2026-09-18T19:31:32+09:00"), target);
  assert.equal(onSep18.ended, false);
  assert.equal(onSep18.days, 46);
  assert.equal(onSep18.hours, 4);

  const onFinalDay = calculateRemaining(new Date("2026-11-03T10:00:00+09:00"), target);
  assert.equal(onFinalDay.ended, false);
  assert.equal(onFinalDay.days, 0);
  assert.equal(onFinalDay.hours, 13);

  const afterEnd = calculateRemaining(new Date("2026-11-04T00:00:01+09:00"), target);
  assert.equal(afterEnd.ended, true);
});

test("the closed page shows the final figures fixed on 2026-11-13", () => {
  // ユーザーが確認した値（集計API 2026-11-12T15:45:25Z 時点）。勝手に書き換えない。
  assert.equal(FINAL_FUND_RESULT.totalAmount, 1_238_000);
  assert.equal(FINAL_FUND_RESULT.supportersCount, 109);
  // 達成率は第1目標 100万円に対する割合で、100% で頭打ちにしない
  assert.equal(finalRate(FINAL_FUND_RESULT.totalAmount), 124);
  assert.equal(finalRate(1_000_000), 100);
  assert.equal(finalRate(1_234_999), 123);
  // 最終値の時刻は締切より後なので、ページは必ず終了表示になる
  assert.equal(calculateRemaining(FINAL_FUND_RESULT.asOf, CAMPAIGN_END_DATE).ended, true);
  assert.equal(CAMPAIGN_CLOSED, true);
  assert.equal(ja.hero.statusRate(124), "達成率 124%");
  assert.equal(ja.returns.closed, "受付終了");
  assert.equal(en.returns.closed, "Closed");
});

test("the closed page no longer mentions the next goal", () => {
  // 終了後に表示される文言から「ネクストゴール」を削除した（2026-11-13、ユーザー指示）
  for (const [name, dict, pattern] of [["ja", ja, /ネクストゴール/], ["en", en, /next goal/i]]) {
    const shown = JSON.stringify([dict.hero.announcement, dict.hero.closed, dict.recovery, dict.supportBar.closed]);
    assert.doesNotMatch(shown, pattern, name);
  }
});

test("English copy keeps the flood measurements straight", () => {
  // 40cm = inside the walk-in cooler, 45cm = insurance threshold (see AGENTS.md)
  const insurance = en.damage.details[0].body;
  assert.match(insurance, /45cm of indoor flooding/);
  assert.match(insurance, /inside our walk-in cooler reached 40cm/);
  assert.doesNotMatch(JSON.stringify(en), /40cm of indoor flooding|indoor flooding (?:of|reached) 40cm/);
  assert.match(en.damage.lead, /4,500 glasses/);
});
