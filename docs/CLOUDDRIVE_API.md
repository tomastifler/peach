# CloudDrive Official API Integration

The protocol is based on the [official gRPC guide](https://www.clouddrive2.com/api/CloudDrive2_gRPC_API_Guide.html)
and the [official proto](https://www.clouddrive2.com/api/clouddrive.proto), version 1.1.2.
The SHA-256 of the protocol file checked is `A00B4620CBCE0A9BD6009F8E771BA68EA7375080CA7F15F4C7C206310BA2EC9D`.
The recommendations below are integration judgments made from field and method definitions; interfaces not yet integrated have no performance conclusions.

## Integrated Scope

Cloud download uses the directory query, target directory creation, offline submission, offline list, cancel and quota interfaces.
Proxy settings use `GetAllCloudApis`, `GetCloudAPIConfig`, `SetCloudAPIConfig` and `GetMountPoints`.
Account matching reuses the path prefixes discovered by push and the CloudDrive mount points, and shows only the accounts corresponding to added media libraries.
`GetApiTokenInfo` is used to check permissions; credentials reuse the local CredentialStore.

Enter the CloudDrive2 address as the service entry, for example `http://127.0.0.1:19798`; the media directory and the API token are entered separately.
The port must be an integer from 1 to 65535, and IPv6 uses square brackets, for example `http://[::1]:19798`.
When left empty, only ports 19798 and 29798 on this machine are probed; the check result is filled back into the form, for the user to save.
When the saved address is invalid, the download section keeps the original value and other valid preferences, shows a check prompt, and lets you fix and save directly.
When an optional area fails while the configuration is being read, that area shows "Not obtained" and "Read again", and the other areas stay usable;
on persistent failure, export a diagnostic report, where the configuration area name and diagnostic number in the report help locate the fault.

Proxy reads and writes are verified through an in-process gRPC service for serialization, auth metadata, configuration field retention, no password echo,
revision conflicts, account ownership and the local HTTP routes. Production writes are triggered by the user saving settings; tests do not modify real accounts.
The original protocol has unused fields; generated protobuf messages still retain unknown fields, and the whole message is sent back after the proxy is modified.
The official interface has no conditional-write parameter; a compare after reading can only detect changes that have already happened, and cannot eliminate the cross-client concurrency window.

## Interfaces Worth Integrating Next

| Priority | Official interface | Where Peach can use it | Boundary |
| --- | --- | --- | --- |
| High | `GetSubFiles`, `FindFileByPath` | When a cloud drive is first added, get directories, file names and sizes directly, and identify videos and product codes | `GetSubFiles` is a streaming list of a single directory, so a full inventory still needs traversal; speed is affected by the drive and the CD cache |
| High | `GetOpenFileHandles`, `GetOpenFileTable`, `GetDownloadFileList` | Investigate which file is still being read after a task ends and which process has the video open | Includes the activity of other apps, so not all reads can be attributed to Peach |
| High | `GetFileBufferDiskCacheStats`, `ListDiskCacheFolders`, `GetActivePrefetchHints` | Show cache usage, directory cache rules and prefetch activity, and explain differences in read volume | Cache statistics are not Peach's hit rate; the cache-hit count in prefetch diagnostics corresponds only to the prefetch system |
| Medium | `GetSpaceInfo`, `GetCloudMemberships`, `GetAllCloudApis` | Media library capacity, membership expiry, read-only or account-locked status | Drives support these to different degrees; items that cannot be obtained must not be treated as zero or normal |
| Medium | `GetUploadFileList`, `GetCopyTasks` | Show the cloud transfer progress of organizing, NFO write-back and copying | A finished local write does not mean the cloud upload finished; association by task and path is needed |
| Later evaluation | `PrefetchFileRanges`, `CancelFilePrefetch` | Playback and the nine-grid request only the byte ranges they need, coordinating prefetch by priority | Actively consumes traffic; verify cache and Range behavior first, and cancel only the hints created this time |

For first-time directory identification, verify the directory API first: compare the time, request count and file completeness of mount traversal and the API list on the same directory.
`GetFileDetailProperties` has fields such as the total file count of a directory, but no per-extension video count or JAV count;
whether `GetSearchResults` can cover a complete directory also depends on the source, so it cannot be used to promise an instant exact count on first add.

Cache cleanup, global transfer cancellation, forcibly closing file readers and mount modifications have global effects, and must not be side actions of an ordinary refresh or task cancellation.
Specific integration checks the version and token permissions per method, and when an old version rejects an optional interface, the existing mount flow is kept.
