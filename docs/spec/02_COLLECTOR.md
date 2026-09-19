# LIVV OTA V2 Collector Specification

## 1. Role

The Chrome Collector is an execution terminal for cloud-issued Tasks. It MUST
not own business history or provide a second local collection workflow.

The runtime MUST continue executing when the Popup closes. The Popup is a
status/control view only.

## 2. Persistent and transient data

The Collector MAY persist:

- `device_id`;
- `device_credential`;
- minimal technical settings required to operate the extension.

It MUST NOT persist Market, Batch, Schedule, Task history, `lastResults`,
historical prices or payloads, business logs, Hotel Mapping, competitors, or
analytics. A current Task and collection are runtime Session state and SHOULD
be cleared after a terminal outcome or restart.

## 3. Required runtime lifecycle

```text
idle
  -> registering -> pending/ready
  -> heartbeating -> claiming
  -> leased -> navigating -> reading_context
  -> context_verified -> collecting -> quality_check
  -> uploading -> upload_accepted -> done
```

Failure exits are:

```text
any active state -> attempt_failed
leased/active without accepted upload at lease deadline -> lease_expired
```

`done` means only that Cloudflare accepted the upload. It does not mean the
observed count equals the target.

The Collector MUST treat server responses as authoritative for transitions.
It MUST NOT locally mark a Task completed after a timeout or ambiguous upload
response.

## 4. Device protocol responsibilities

At startup and during normal operation the Collector MUST:

1. register once when it has no usable identity/credential;
2. retain the credential only in the permitted local store;
3. heartbeat while online and while a Task is active;
4. claim at most one Task;
5. report progress and failures;
6. upload through the Task/Attempt endpoint.

The persistent authorization state is one of `pending`, `authorized`, or
`revoked`. `online` and `offline` are derived presence states from the most
recent heartbeat and MUST NOT be stored as authorization states. Registration,
authorization, revocation, credential rotation, and exact error codes are
API/Security specification concerns. The Collector MUST stop claiming and
uploading when the cloud marks the device pending or revoked; revoked devices
MUST be rejected even if their credential is otherwise well formed.

## 5. Navigation Adapter

For its assigned platform, Navigation MUST open the requested OTA, set the
city, set the keyword (including an explicit empty keyword), set absolute
check-in/check-out dates, submit the search, and wait for a stable result
page.

Navigation MUST use Task dates as absolute dates. It MUST NOT reinterpret a
relative D+n label. It MUST preserve the intended keyword through all steps.

Navigation MAY retry its own transient UI operation within the Attempt, but it
MUST NOT hide a final context mismatch.

## 6. Page Context Reader and Context Gate

The Reader MUST obtain the OTA's real search state and return:

- `platform`;
- `page_type`;
- `city`;
- `keyword` value and state (`verified`, `empty`, or `unknown`);
- `check_in` and `check_out` as absolute dates;
- `source_url`.

`page_type` belongs to Page Context and identifies the business page. Collection
readiness is a separate platform concern; M06 does not implement a
`result_surface` decision. A future Collection Gate MUST evaluate whether the
platform result surface is ready before invoking collection.

Each platform MUST publish a separate Context Contract and tests MUST prove
the source of every field. Authority is ordered: explicit OTA search controls
or search state, OTA structured state, then a clearly validated URL parameter.
It MUST NOT guess city or keyword from hotel正文, a location dictionary, or
arbitrary page text. If the platform provides no reliable signal, the value is
`unknown` and the context cannot pass formal collection validation.

Ctrip's contract MUST include real regressions for Shanghai +
`迪士尼度假区` and Xianning + `中心花坛`.

The Context Gate MUST compare Task and Page Context for platform,
`page_type = hotel_list`, city, keyword state/value, check-in, and check-out.
On the first mismatch the runtime MAY perform exactly one complete
re-navigation and re-read. A second mismatch MUST fail the Attempt. No
collection or upload is allowed before the gate passes.

## 7. Collection and Quality Gate invocation

The runtime MUST invoke only the adapter for the assigned platform. It MUST
pass the verified context and target. The adapter MUST return a normalized
collection envelope; it MUST NOT upload it.

The Quality Gate MUST reject fatal integrity problems such as missing official
IDs where required, invalid identity, duplicate official IDs after
deduplication, unverifiable non-sold-out price, or context contamination.
Recoverable short lists are classified using the Collection specification,
not silently promoted to success.

## 8. Manual collection

Manual collection MUST start by reading the current Page Context. The Collector
MUST request Cloudflare to create a `manual` Batch/Task and then enter the same
lease, Attempt, Context Gate, Collection, Quality Gate, and upload flow as an
automated task. It MUST NOT restore a collect-to-`lastResults`-then-manual-
upload workflow.

## 9. Local diagnostics

The Collector MAY expose current-session diagnostics for troubleshooting. Such
diagnostics MUST be clearly transient and MUST NOT become a durable business
log. Sensitive credentials and full historical payloads MUST NOT be exposed in
diagnostic output.
