Since mac os 11.4 apple official podcasts app doesn't allow to drag and drop downloaded podcasts. This simple script tries to resolve this problem. It can export apple podcasts downloaded or cached mp3 files from "app's cache folder" to "~/Downloads/PodcastsExport/[CURRENT_DATA]" folder with readable file names - podcast titles instead of uuids like "EEFE102A-2134-4FBC-BB14-44FC18736FEE". Script tries to fetch podcast titles from podcasts app database if something went wrong it takes mp3 metadata titles and it fails too script just copies files with original filenames.


Requirements: Node.js version >= 14 https://nodejs.org/en/download/

Usage:
1. Clone/Download repository (unarchive it if it was archived)
2. Open terminal at downloaded folder (context click on folder -> services -> New Terminal at folder or just open Terminal app and execute `cd [REPOSITORY FOLDER]`)
3. Execute `bash ./export.sh`


Note: script doesn't remove any files from your computer, so if there were more podcasts exported on the same day they will be just added to a folder.
