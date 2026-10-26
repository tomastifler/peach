# Custom Metadata Sources

The "Custom metadata sources" section on the collection page connects public JSON metadata endpoints. Each source stores a name, a fixed HTTPS
endpoint URL, a code format, field paths, applicable content types, and a connection method. After saving, it can be edited, test-queried, enabled, disabled, or deleted.

The endpoint URL must contain exactly one `{code}`. Field paths join object keys or array indexes with dots, for example `data.title` and
`items.0.title`. The code field is required; title, studio, series, and release date are text, while performers and tags are text arrays.
The code format can be as-is, lowercase, hyphens removed, or hyphens converted to underscores. Enter a code to test and press Enter; the result is shown in the current form.

This configuration only applies to JSON returned by a single GET. It does not parse HTML, CSS selectors, JSON-LD, or YAML rules,
and does not run scripts. Sources that need cookies, site API keys, multiple queries, or browser verification use the existing dedicated adapters.

## Endpoint Example

Configuration for the 1Pondo public endpoint:

| Field | Value |
| --- | --- |
| Endpoint URL | `https://www.1pondo.tv/dyn/phpauto/movie_details/movie_id/{code}.json` |
| Code format | Hyphen to underscore |
| Code field | `MovieID` |
| Title field | `Title` |
| Performer field | `ActressesJa` |
| Applicable type | Uncensored |

Peach already ships a built-in 1Pondo adapter; this example only illustrates endpoint configuration and does not need to be added again. The applicable content types of a custom source
are chosen by the user; for codes that share the same release scheme, choose an endpoint that actually covers the target work.

## Collection and Review

Enabled sources are appended to the end of the built-in source chain for the applicable type; when earlier sources already provide enough data, querying stops under the existing rules.
The code field in the response must match the queried code; the query URL cannot stand in for identity evidence from the response.

Results enter the existing source snapshot, candidate, and review flow, with confidence `0.5`, classified as an unregistered source, and do not take part in auto-approval.
When the source endpoint, field mapping, code format, or route changes, the new query rule gets an independent evidence key; enabling, disabling, or renaming keeps the evidence key.
Deleting a configuration does not delete saved source snapshots or review artifacts.

## Network and Storage

The endpoint uses an HTTPS public domain on the default port 443, and rejects user info, fragments, private-network resolution results, and redirects.
A query uses a time budget of at most 15 seconds and a response of at most 1 MiB; proxy configuration, DNS resolution, and session preparation share this budget.
System DNS resolution is a synchronous call and cannot be forcibly cancelled when the budget expires; if the budget is already exhausted when resolution returns, no
HTTP request is made, so the actual return time may exceed the budget. Both direct connections and the Peach proxy pin the verified public IP through cURL `CONNECT_TO`,
while TLS SNI and certificate verification still use the endpoint's original domain. The Peach proxy reuses the saved connection settings and does not store credentials separately.

The configuration lives in the local `secrets/custom-metadata.json`, saved with a file lock and atomic replacement; nothing is written to the ledger.

## Reuse and Evidence

- Follows OpenAver `502278a3e09c7520838ffb00b2ff080323a4cdcb` for declarative configuration, public-target checks, and
  code identity verification. Upstream supports YAML, CSS/meta/JSON-LD, and one- to two-step page scraping; Peach deliberately narrows this to a single-step JSON.
  The upstream implementation was not copied.
- Uses the project-pinned `curl_cffi 0.16.3` and `filelock 4.0.12`, plus the existing `SiteRecord`,
  `identifies_code`, source chain, and review flow, with no new dependencies. For the cURL connection boundary see the
  [CONNECT_TO official documentation](https://curl.se/libcurl/c/CURLOPT_CONNECT_TO.html).
- 2026-10-13 no-write POC: the official adapter queried `112312_478` through the Peach proxy with a pinned public IP and strict TLS,
  returning a matching code, a non-empty title, 1 performer, and confidence `0.5`. Direct connections to r18.dev and 1Pondo
  returned `curl (35) Recv failure: Connection was reset`; TLS verification was not lowered.
