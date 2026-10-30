# SMB Media Sources

Peach reads and writes network shares directly over SMB 2/3 with the account's permissions. The connection is made by the machine running Peach; browsers and external players use Peach's media address and never receive the NAS account and password.

## Adding a Directory

In "Settings → Media Library and Ingest", add a folder, choose "SMB share" as the source, and enter the path as `smb://nas.example/Movies` or a subdirectory inside the share. The address contains no account, password or query parameters. The account can be a NAS username or `DOMAIN\username`.

After entering the account and password, click "Test connection". On success you can choose to enter a subdirectory and test that directory. "Require SMB encryption" rejects servers that do not support encryption. After saving the configuration, the app's management entry reloads it; a directory used for the first time can be scanned and have its metadata completed.

The password is not echoed; leave it empty to keep the saved password, and enter the matching password when changing the account. "Remove saved SMB account" deletes the local credentials on save. Credentials live in the data directory at `secrets/follow/smb-<root_id>.json`, and do not enter the ledger or configuration responses. The file is not an encrypted vault, so restrict access to the data directory.

## Scope and Limits

The source reads and writes with the permissions granted to the share account. Scanning, NFO, companion images, subtitles and video are read from the share; metadata, previews and transcoding results are stored in the Peach data directory. Organizing and renaming support moves within the same declared root, directory creation and whole-batch undo; permanent deletion first quarantines the file in the same directory, restores it if the ledger transaction fails, and cleans up only after commit. An existing target is never overwritten. When the account has no write permission, these operations report a permission error, and reading works as usual.

Media tools read randomly through a loopback HTTP Range address; this address, meant for tools to read, serves only GET/HEAD and cannot be used to write back to the share. Original-file repair still requires a locally mounted path and does not automatically download a whole remote video to a temporary directory; moves across shares or across declared roots are not supported.

When the share is offline or unreadable, the library records are kept, and no claim can be made from that that files were deleted. Direct SMB sources use scanning and are not added to the local file watcher. DFS and reparse points are out of scope; only explicitly entered shares are connected. Each read handle has its own connection and file position, a request timeout closes the connection it belongs to, and the operation is reissued after the network recovers.

## Configuration File

For deployments managed through a configuration file, fill in `transport = 'smb'` and `mount = 'smb://nas.example/Movies'` under `[media.storage_roots.<root_id>]`, keeping a stable Windows-style `root` and the `library_id`. The account file uses the structure `{"username":"reader","password":"<password>","encrypt":"true"}`, with restricted access, and does not go into the public repository. When an existing library changes its share address, keep the directory identity and explicitly choose relocation.

## Verification Scope

Isolated regressions cover path boundaries, deadlines and cancellation, directory metadata, separation of configuration and credentials, scan subtitle pairing, HTTP byte ranges, organizing and transaction-failure recovery, and actual FFmpeg tail indexes and frame extraction. A loopback temporary share additionally verifies the real SMB protocol for create, write, flush, rename without overwrite, read and delete. A real NAS's authentication policy, throughput, long playback and recovery from network loss must be verified in the target environment.
