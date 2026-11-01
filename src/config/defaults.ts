/**
 * Download used by Test speed: a 5 MB file through the profile. Cloudflare's speed endpoint serves
 * random bytes with `Access-Control-Allow-Origin: *`; users can replace it in General.
 */
export const DEFAULT_SPEED_TEST_ENDPOINT = 'https://speed.cloudflare.com/__down?bytes=5000000'

/** Bounds of one speed sample; the download stops at whichever comes first. */
export const SPEED_TEST_MAX_BYTES = 5_000_000
export const SPEED_TEST_MAX_MS = 15_000
