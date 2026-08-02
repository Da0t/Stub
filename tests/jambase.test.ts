import assert from "node:assert/strict";
import test from "node:test";
import {
  enrichArtist,
  fetchGrid,
  findFestival,
  nextTourDate,
} from "../lib/grid/jambase";

const originalFetch = globalThis.fetch;
const originalKey = process.env.JAMBASE_API_KEY;

test.beforeEach(() => {
  process.env.JAMBASE_API_KEY = "jbd_test";
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.JAMBASE_API_KEY;
  else process.env.JAMBASE_API_KEY = originalKey;
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

test("uses the API host, Bearer auth, and festivalSeries bare id", async () => {
  let requestUrl = "";
  let authorization: string | null = null;
  globalThis.fetch = async (input, init) => {
    requestUrl = String(input);
    authorization = new Headers(init?.headers).get("authorization");
    return json({
      festivalSeries: [
        { identifier: "jambase:13969984", name: "Outside Lands" },
      ],
    });
  };

  assert.deepEqual(await findFestival("Outside Lands", 2026), {
    festivalId: "13969984",
    name: "Outside Lands",
  });
  const url = new URL(requestUrl);
  assert.equal(url.origin, "https://api.data.jambase.com");
  assert.equal(url.pathname, "/v3/festivals");
  assert.equal(url.searchParams.get("name"), "Outside Lands");
  assert.equal(url.searchParams.has("apikey"), false);
  assert.equal(url.searchParams.has("year"), false);
  assert.equal(authorization, "Bearer jbd_test");
});

test("rejects the wrong-host HTML trap even when HTTP status is 200", async () => {
  globalThis.fetch = async () =>
    new Response("<!doctype html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  await assert.rejects(
    findFestival("Outside Lands", 2026),
    /non-JSON \(text\/html\).*Wrong host.*api\.data\.jambase\.com/s
  );
});

test("reports HTTP failures before parsing", async () => {
  globalThis.fetch = async () =>
    new Response("nope", { status: 401, statusText: "Unauthorized" });
  await assert.rejects(
    findFestival("Outside Lands", 2026),
    /HTTP 401 Unauthorized/
  );
});

test("requires the server-side API key", async () => {
  delete process.env.JAMBASE_API_KEY;
  await assert.rejects(findFestival("Outside Lands", 2026), /JAMBASE_API_KEY/);
});

test("fails clearly when no festival series matches", async () => {
  globalThis.fetch = async () => json({ festivalSeries: [] });
  await assert.rejects(
    findFestival("Not Real", 2026),
    /No festival found for "Not Real"/
  );
});

test("selects the requested edition and flattens performers with provenance", async () => {
  let requestUrl = "";
  globalThis.fetch = async (input) => {
    requestUrl = String(input);
    return json({
      events: [
        { name: "Outside Lands 2025", startDate: "2025-08-08", performer: [] },
        {
          identifier: "jambase:15738826",
          name: "Outside Lands 2026",
          startDate: "2026-08-07",
          eventStatus: "scheduled",
          performer: [
            {
              name: "Charli XCX",
              identifier: "jambase:49881",
              genre: ["pop", "indie"],
              "x-performanceDate": "2026-08-07",
              "x-performanceRank": 1,
              "x-isHeadliner": true,
            },
            { name: "Mystery Artist", "x-performanceDate": "2026-08-08" },
          ],
        },
      ],
    });
  };

  const rows = await fetchGrid("jambase:13969984", 2026);
  const url = new URL(requestUrl);
  assert.equal(url.pathname, "/v3/festivals/13969984/events");
  assert.equal(url.searchParams.get("perPage"), "100");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    id: "jambase:15738826:jambase:49881",
    artistName: "Charli XCX",
    jambaseArtistId: "jambase:49881",
    stageName: "",
    startDate: "2026-08-07",
    endDate: "",
    status: "scheduled",
    estimatedAudience: null,
    isHeadliner: true,
    performanceRank: 1,
    genreTags: ["pop", "indie"],
    festival: {
      id: "13969984",
      name: "Outside Lands 2026",
      timezone: "America/Los_Angeles",
    },
    _provenance: "source:day-only",
  });
  assert.equal(rows[1].id, "jambase:15738826:performer-1");
  assert.equal(rows[1].isHeadliner, false);
  assert.equal(rows[1].performanceRank, null);
});

test("carries cancelled and rescheduled edition status", async () => {
  for (const [source, expected] of [
    ["EventCancelled", "cancelled"],
    ["EventRescheduled", "rescheduled"],
  ] as const) {
    globalThis.fetch = async () =>
      json({
        events: [{
          name: "Outside Lands 2026",
          eventStatus: source,
          performer: [{ name: "Artist", identifier: "jambase:1" }],
        }],
      });
    assert.equal((await fetchGrid("13969984"))[0].status, expected);
  }
});

test("fails clearly when the requested yearly edition is absent", async () => {
  globalThis.fetch = async () =>
    json({ events: [{ name: "Outside Lands 2025", performer: [] }] });
  await assert.rejects(fetchGrid("13969984", 2026), /No 2026 edition/);
});

test("artist enrichment keeps qualified id and matches provider identifier", async () => {
  let requestUrl = "";
  globalThis.fetch = async (input) => {
    requestUrl = String(input);
    return json({
      artist: {
        genre: ["pop"],
        sameAs: [
          // Host alone must not be enough: provider identifier decides.
          { identifier: "website", url: "https://open.spotify.com/artist/Wrong" },
          { identifier: "spotify", url: "https://example.test/artist/Right123" },
          { identifier: "musicbrainz", url: "https://musicbrainz.org/artist/abc-def" },
        ],
      },
    });
  };

  const meta = await enrichArtist("jambase:49881");
  assert.equal(new URL(requestUrl).pathname, "/v3/artists/id/jambase:49881");
  assert.equal(meta.spotifyId, "Right123");
  assert.equal(meta.musicbrainzId, "abc-def");
  assert.deepEqual(meta.genreTags, ["pop"]);
  assert.equal(meta.estimatedAudience, null);
  assert.equal(meta.nextTourDate, null);
});

test("nextTourDate prefers a later Bay Area show over an earlier remote show", async () => {
  const realNow = Date.now;
  Date.now = () => Date.parse("2026-08-10T00:00:00Z");
  let requestUrl = "";
  globalThis.fetch = async (input) => {
    requestUrl = String(input);
    return json({ events: [
      { startDate: "bad", location: {} },
      { startDate: "2026-08-09", location: { name: "Past", address: { addressLocality: "Oakland" } } },
      { name: "Outside Lands 2026", startDate: "2026-08-27", location: { name: "Golden Gate Park", address: { addressLocality: "San Francisco" } } },
      { startDate: "2026-08-27", location: { name: "Reading", address: { addressLocality: "Reading" } } },
      { startDate: "2026-11-01", location: { name: "Fox Theater", address: { addressLocality: "Oakland" } } },
    ] });
  };
  try {
    assert.deepEqual(await nextTourDate("jambase:49881"), {
      date: Date.parse("2026-11-01"),
      venue: "Fox Theater",
      city: "Oakland",
    });
    const url = new URL(requestUrl);
    assert.equal(url.pathname, "/v3/events");
    assert.equal(url.searchParams.get("artistId"), "jambase:49881");
    assert.equal(url.searchParams.get("perPage"), "20");
  } finally {
    Date.now = realNow;
  }
});

test("nextTourDate falls back to soonest anywhere and returns null if none", async () => {
  const realNow = Date.now;
  Date.now = () => 0;
  try {
    globalThis.fetch = async () => json({ events: [
      { startDate: "2027-02-01", location: { name: "Later", address: { addressLocality: "London" } } },
      { startDate: "2027-01-01", location: { name: "Sooner", address: { addressLocality: "Paris" } } },
    ] });
    assert.equal((await nextTourDate("jambase:1"))?.venue, "Sooner");
    globalThis.fetch = async () => json({ events: [] });
    assert.equal(await nextTourDate("jambase:1"), null);
  } finally {
    Date.now = realNow;
  }
});
