# Section time tracking

The main page emits `cro_section_time` to `window.dataLayer`. GTM must forward
this event to GA4; this repository change does not configure or publish GTM.

## Measurement rules

- Qualification uses the existing reading line: 40% of viewport height on
  mobile, 50% at widths of 64rem and above, after the section text anchor.
- A passage is confirmed after 800ms of continuous qualification. Timing begins
  at confirmation, excluding this initial delay and unconfirmed passages.
- Leaving a section flushes its measured duration. An absence shorter than
  2000ms resumes the same passage. After 2000ms outside, a new passage requires
  another 800ms confirmation.
- Hiding the browser tab or receiving `pagehide` flushes and pauses timing.
  Returning to the same section resumes the same passage. Hidden time is excluded.
- Each flush sends only previously unsent milliseconds. Multiple events for
  one passage are expected; SUM is the correct aggregation, not event count.
- Passage numbering is per section and page load, not a persistent user visit
  counter. Reload resets it; back-forward cache restoration preserves it.
- Time measures qualified on-screen presence, not verified attention. Delivery
  to GA4 still depends on GTM, consent, network and browser lifecycle constraints.

## GTM and GA4 mapping

For this event, configure Data Layer Variables (Version 2) reading these exact
keys. Variable display names are arbitrary; the underlying key is not.

| Data layer key / GA4 parameter | Values | GA4 definition |
| --- | --- | --- |
| `section_id` | `hero`, `risks`, etc. | Event-scoped dimension |
| `section_index` | Section position | Event-scoped dimension if needed |
| `section_visit_index` | `1`, `2`, `3`, `4_plus` | Event-scoped dimension |
| `section_visit_type` | `first`, `return` | Event-scoped dimension |
| `section_engagement_time` | Positive integer milliseconds, incremental | Custom metric, milliseconds |

The payload also includes `lp_name`, `lp_variant`, and `page_type` with the
page's existing values.

Legacy `cro_section_revisit` and `cro_section_reengaged` events still use
`visit_index` as their data layer key. Keep the DLV reading `visit_index` for
those events; use a separate DLV reading `section_visit_index` for the new time
event. Do not silently repoint the old DLV and break the existing tags.

Trigger on the exact custom event `cro_section_time`. Configure one GA4 sending
path only: either extend a matching shared tag or add a dedicated tag and ensure
the shared tag excludes this event. Remove `section_engagement_time_bucket`
from the GTM tag parameters; `engagement_time_bucket` is no longer emitted by
the main page's reengagement event.

## Reporting

Filter to `cro_section_time`, use section as rows and passage index as columns,
and SUM of the custom duration metric as the value. The `return` filter includes
passages 2, 3 and 4_plus. Total includes first and returns once each; do not add
the return subtotal again. Individual-user inspection requires a user-level
exploration; a normal section table aggregates all selected users.

## Verification

Run `node --test tests/section-time.test.cjs`. Tests execute the production script
with controlled browser time, visibility and section geometry. A separate local
Chrome smoke check verified real scroll events and numeric duration payloads
without JavaScript errors, blocking external requests to avoid test analytics.

After deployment, verify the GTM mapping in Tag Assistant and actual receipt in
GA4 DebugView. Local dataLayer checks do not establish GA4 receipt.

## CTA rankings

`cro_cta_click` now includes two rankings computed at click time, including the
current passage. Only passages reaching 4000ms of measured visible engagement
contribute. Once that threshold is reached, their entire measured duration is
credited retroactively and continues accumulating; the first 4000ms are not
subtracted. The initial 800ms visit confirmation delay remains excluded, as in
the existing section timer. Hidden time is excluded.

| Data layer key / suggested GA4 parameter | Meaning |
| --- | --- |
| `cta_most_time_section_id` | Section with the largest eligible duration |
| `cta_most_time_section_time` | That section's eligible duration in milliseconds |
| `cta_most_visited_section_id` | Section with the largest qualified passage count |
| `cta_most_visited_count` | That section's qualified passage count |

Each passage counts once. Ties favor the section whose most recent qualified
passage started later. Without a qualifying passage, ranking keys are absent.
Counters reset on page reload. A brief exit or a hidden tab resumes the same
passage according to the existing section rules.

Example: 6000ms + 2000ms + 5000ms on a section yields 11000ms and two qualifying
passages for CTA rankings. The raw `cro_section_time` duration still totals
13000ms; that event's measurement rules have not changed.

For CTA payloads, these four parameters replace `most_engaged_section`,
`most_engaged_section_count`, `most_reengaged_section`, and
`most_reengaged_section_count`. Update the CTA GA4 tag to use DLVs reading the
new exact keys; old values may remain in GTM's data model from other events.
`last_engaged_section`, `last_reengaged_section`, `time_to_action_bucket`, and
the existing CTA identity parameters are preserved. Other event types retain
their existing context. This code change does not update GTM itself.
