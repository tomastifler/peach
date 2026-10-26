# Resource Search Configuration

Peach queries resources through the Torznab interface provided by Prowlarr or Jackett. First configure sites in the indexer manager, then enter the interface address and API key in Peach.

## Preparing the Indexer

1. Start Prowlarr or Jackett on the machine running Peach or on a server it can reach.
2. Add the sites you need in the manager and complete the login or connection setup that site requires.
3. Use the manager's test and manual search features to confirm the site can return results.
4. Copy the site's Torznab address and get the manager's API key. In Jackett the entry is named **Copy Torznab Feed**; use the interface of the selected site.

For UI and installation instructions, follow the [Prowlarr official documentation](https://wiki.servarr.com/prowlarr) and the [Jackett official notes](https://github.com/Jackett/Jackett#configuration).

## Entering It in Peach

Open **Settings → Sources and Subscriptions → Resource Search** and add an indexer:

| Field | What to enter |
| --- | --- |
| Name | A manager and site name that is easy to recognize |
| Torznab URL | The site's HTTP or HTTPS API address |
| API key | The key provided by the manager, entered separately |
| Enabled | Turn this on for indexers that take part in resource search |

If the copied address contains query parameters such as `?apikey=…` or `&t=…`, remove the query part and keep only the protocol, host, port, and path. Enter the API key in its own field. The address must not contain a username, password, query parameters, or a fragment.

The address is accessed by the Peach service. `127.0.0.1` refers to the machine running Peach; when Peach runs in a container, it refers to the container itself. When the indexer is on another machine, enter a hostname or LAN address Peach can reach.

Up to 4 indexers can be configured. After filling in, click **Save indexers**. Reading the configuration only shows whether the API key is saved; to keep the original key for the same interface, leave the key field empty.

## Verifying Search

1. Find a work known to be searchable in the indexer and run a resource search in Peach's cloud download interface.
2. Check the candidate's code, size, seeders, and quality information.
3. Select the candidate you want and submit the download.

Having candidates means the search path works; submitting a download also needs 115 or PikPak configured separately. For CloudDrive2 settings see the [full configuration and tuning notes](CLOUDDRIVE.md).

## FAQ

| Symptom | Where to check |
| --- | --- |
| Connection failed | The indexer process, address, and port; confirm the machine or container running Peach can reach it |
| Authentication failed | Whether the API key is correct and still marked as configured after saving |
| Address rejected | Remove query parameters, username, password, and fragment from the address |
| The manager can't find it either | First fix the site login, source connection, and search capability |
| The manager has results but Peach has no candidates | Check that it is the same code, and the candidate's size, seeders, and version information |

When troubleshooting, do not expose the API key in screenshots or issue reports.
