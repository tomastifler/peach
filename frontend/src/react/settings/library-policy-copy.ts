/* Copy for processing modes and library groups. The settings page and its first-screen skeleton use the same text, so line wraps in the skeleton match the real page. */

/** The line always shown above the groups: how the three processing modes differ, with details in the comparison table. */
export const POLICY_SUMMARY = 'Every library first reads local NFO files and images in the same folder; the processing mode only decides whether to complete details online.';

/** Comparison table of the three modes: one step per row, and the three columns are Auto-complete, Local details only and Custom. */
export const POLICY_COLUMNS = ['Auto-complete', 'Local details only', 'Custom'] as const;
export const POLICY_MATRIX: readonly (readonly [step: string, auto: string, local: string, custom: string])[] = [
  ['Read local NFO files and images', '✓', '✓', '✓'],
  ['Read video info and generate contact sheets', '✓', '✓', 'Optional'],
  ['Fill in details online', '✓', '—', 'Optional'],
  ['Fill in covers online', '✓', '—', 'Optional'],
  ['Fill in person images online', '✓', '—', 'Optional'],
];
export const POLICY_COVER_NOTE = 'When only a portrait poster exists locally: Auto-complete goes online to find the full cover (except FC2 product images), while Local details only uses the portrait one directly.';

/** The line under the two add buttons: folders belong to libraries, and when to add a folder versus a library. */
export const LIBRARY_FOLDER_HELP = 'A library can have several folders; their works are shown together and share a name, color and processing mode. Add another library when you want them shown or configured separately.';
