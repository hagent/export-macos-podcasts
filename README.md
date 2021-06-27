Since mac os 11.4 apple official podcasts app doesn't allow to drag and drop downloaded podcasts. This simple script tries to resolve this problem. It can export apple podcasts downloaded or cached mp3 files from "app's cache folder" to "~/Downloads/PodcastsExport/[CURRENT_DATE]" folder with readable file names - podcast titles instead of uuids like "EEFE102A-2134-4FBC-BB14-44FC18736FEE". Script tries to fetch podcast titles from podcasts app database if something went wrong it takes mp3 file metadata titles and if it fails too script just copies files with original filenames (last option is more for transparency than for any practical benefit).


Requirements: Node.js 14 or higher https://nodejs.org/en/download/

Usage:
1. Open terminal app
2. Execute `npx github:hagent/export-macos-podcasts` command

Alternatively you can clone repository:
1. Clone/Download repository (unarchive it if it was archived)
2. Open terminal at downloaded folder (context click on folder -> services -> New Terminal at folder or just open Terminal app and execute `cd [REPOSITORY FOLDER]`)
3. Execute `npm run install-export`


Note: script doesn't remove any files from your computer, so if there were already exported podcasts in the same date folder script will just rewrite/add files.
