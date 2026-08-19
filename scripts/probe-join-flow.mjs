#!/usr/bin/env node
/**
 * Live checks for the diver join path. Does not complete Google consent.
 *
 *   node scripts/probe-join-flow.mjs
 *   node scripts/probe-join-flow.mjs https://doneunder.ai
 */

const origin = (process.argv[2] || "https://doneunder.ai").replace(/\/$/, "");

async function fetchStatus(path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "manual",
    ...options,
  });
  return {
    path,
    status: response.status,
    location: response.headers.get("location"),
    setCookie: response.headers.getSetCookie?.() ?? [],
    text: response.headers.get("content-type")?.includes("text/html") ? await response.text() : "",
  };
}

function fail(message) {
  console.error(`FAIL  ${message}`);
  process.exitCode = 1;
}

function ok(message) {
  console.log(`OK    ${message}`);
}

const login = await fetchStatus("/login");
const register = await fetchStatus("/register");
const cancelled = await fetchStatus("/auth/callback");
const google = await fetchStatus("/auth/google");

if (login.status === 200 && login.text.includes("Continue with Google")) ok("/login shows Continue with Google");
else fail(`/login status=${login.status} missing Google button`);

if (login.text.includes("/auth/google")) ok("/login Google button points at /auth/google");
else fail("/login Google button is not a link to /auth/google");

if (register.status === 200 && register.text.includes("Continue with Google")) {
  ok("/register shows Continue with Google");
} else {
  fail(`/register status=${register.status} missing Google button`);
}

if (cancelled.status === 307 && cancelled.location?.includes("Google%20sign-in%20was%20cancelled")) {
  ok("/auth/callback without code returns to login");
} else {
  fail(`/auth/callback status=${cancelled.status} location=${cancelled.location}`);
}

if (google.status === 307 || google.status === 302) {
  const location = google.location || "";
  const toGoogle = /accounts\.google\.com|googleapis\.com/.test(location);
  const toSupabase = /supabase\.co\/auth\/v1/.test(location);
  const toLogin = location.includes("/login?");
  if (toGoogle) {
    ok(`/auth/google starts Google consent → ${location.split("?")[0]}`);
  } else if (toSupabase) {
    const auth = await fetch(location, { redirect: "manual" });
    const next = auth.headers.get("location") || "";
    if (/accounts\.google\.com|googleapis\.com/.test(next)) {
      ok(`/auth/google starts Google consent via Supabase → ${next.split("?")[0]}`);
    } else {
      const detail = (await auth.text()).slice(0, 240);
      fail(`/auth/google reached Supabase but Google is not enabled (${auth.status}): ${detail}`);
    }
  } else if (toLogin) {
    const message = decodeURIComponent(location.split("message=")[1] || location);
    fail(`/auth/google bounced to login: ${message}`);
  } else {
    fail(`/auth/google unexpected redirect ${location}`);
  }
} else {
  fail(`/auth/google status=${google.status} location=${google.location}`);
}

if (process.exitCode) {
  console.error(`\nJoin-flow probe failed against ${origin}`);
  process.exit(process.exitCode);
}

console.log(`\nJoin-flow probe passed against ${origin}`);
