# Lead attribution

Both forms receive hidden inputs from assets/lead-attribution.js. The main page
sends these values through assets/lead-submit.js to the Worker. The legacy preview
has the same hidden inputs but retains its existing submission implementation.

## Fields

URL keys: gclid, gbraid, wbraid, utm_camp, utm_campaign, utm_ville, utm_ga,
utm_ann, utm_term, utm_kw. utm_camp and utm_campaign are independent.

Each has first_visit_ and last_visit_ versions. Bare names are aliases for last
visit, not last non-direct campaign. Missing values are empty strings. The other
hidden inputs are first_visit_time, last_visit_time, visit_count and time.

The browser reads query parameters, not cookies from Google tags. No identifier
is generated when a URL parameter is absent. Values are bounded to 160 characters
and stripped of control characters. Attribution is user-controlled reporting
data, never proof of identity, eligibility, consent or a genuine advertising click.

## Visit definition

- A new visit begins after at least 30 minutes without tracked activity.
- Page load, pointer interaction, keyboard/input, scrolling and tab return count
  as activity. Merely leaving a page open does not extend the visit.
- Reloading within 30 minutes retains the same visit and its original attribution.
- A new visit on a new page load captures the URL as a complete snapshot. A direct
  visit clears every last_visit campaign/click field; first_visit is unchanged.
- A new visit after inactivity within an already-open page has empty campaign
  fields: an old URL is not evidence of a new advertising click.
- localStorage key: 3r_lead_attribution_v1. Records expire after 90 days without
  activity. Storage is shared by tabs on the same origin. Near-simultaneous tab
  writes are not transactional. This is not the GA4 session counter.
- Clearing storage, using another browser or private browsing can restart counts.
  When storage is blocked, the current page works with memory-only attribution.
- Consent integration is pending at the owner's request. Connect persistent
  advertising storage to the consent mechanism before the public launch; hiding
  a field does not exempt its contents from consent or privacy requirements.

## Submission and persistence

LeadSubmission takes one attribution snapshot per request and reuses it for
retries. The Worker only retains allowlisted fields in lead.attribution. Existing
clients without attribution are still accepted. The old estimate_attribution
sessionStorage value is no longer read or written.

time in the hidden form is provisional. The Worker sets lead.time when recording
the accepted request and returns it to the browser. Retry responses reuse that
original time. It is excluded from the request fingerprint. D1's existing JSON
payload column stores everything; no schema migration is required. Existing D1
retention is still 30 days, independently of browser storage retention.

All dates use UTC: YYYY-MM-DD HH:mm:ss+0000. In a Google Ads file import, map
lead.time to Conversion Time for the form lead, and use the appropriate click ID
column/template. For a later qualified lead or sale, use that later event's actual
time, not first_visit_time, last_visit_time or the original form submission time.

The two internal notification emails contain attribution and the server time.
The prospect email does not. No attribution fields are added to GA4 by this change.

## Deployment

Publish the updated standalone worker/index.mjs to the existing Cloudflare Worker
first, preserving its secrets, DB binding, runtime settings and cron trigger.
Then publish the page and assets to GitHub main. A GitHub push alone does not
update the manually deployed Worker. No paid services or new bindings are added.

No functional tests were run for this change, as requested. Before launch, check
first/direct/repeat visits, inactivity timeout, storage restrictions and both forms.
