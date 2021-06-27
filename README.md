Since mac os 11.4 apple official podcasts app doesn't allow to drag and drop downloaded podcasts. This simple script tries to resolve this problem. It can export apple podcasts downloaded or cached mp3 files from "app's cache folder" to "~/Downloads/PodcastsExport/[CURRENT_DATA]" folder with readable file names - podcast titles instead of uuids like "EEFE102A-2134-4FBC-BB14-44FC18736FEE". Script tries to fetch podcast titles from podcasts app database if something went wrong it takes mp3 metadata titles and it fails too script just copies files with original filenames.


Requirements: Node.js version >= 14

Usage:
1. Clone/Download repository
2. Open terminal
3. Go to project folder `cd [REPOSITORY FOLDER]`
4. Execute `bash ./export.sh`
5. Next time it's possible just to run `npm start` command
