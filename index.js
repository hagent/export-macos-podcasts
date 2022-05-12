const { promises: fs, existsSync, mkdirSync } = require("fs");
const { promisify } = require("util");
const sqlite3 = require("sqlite3").verbose();
const mm = require("music-metadata");
const { exec } = require("child_process");
const sanitize = require("sanitize-filename");

// Added the Podcast name to the query
// Looks like the date stored in the SQLite has an offset of +31 years, so we adjust the query
const podcastSelectSQL = `
  SELECT PC.ztitle as zpodcast, EP.zcleanedtitle as zcleanedtitle, EP.zuuid as zuuid,
    datetime(EP.zpubdate,'unixepoch','+31 years') date
    FROM ZMTPODCAST PC LEFT OUTER JOIN ZMTEPISODE EP
    ON PC.Z_PK = EP.ZPODCAST
`;
const fileNameMaxLength = 50;

function getOutputDirPath() {
  const d = new Date();
  const pad = (s) => s.toString().padStart(2, "0");
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const currentDateFolder = `${d.getFullYear()}.${month}.${day}`;
  return `${process.env.HOME}/Downloads/PodcastsExport/${currentDateFolder}`;
}

async function getPodcastsBasePath() {
  const groupContainersFolder = `${process.env.HOME}/Library/Group Containers`;
  try {
    const libraryGroupContainersDirList = await fs.readdir(
      groupContainersFolder
    );
    const podcastsAppFolder = libraryGroupContainersDirList.find((d) => d.includes("groups.com.apple.podcasts"));
    if (!podcastsAppFolder) {
      throw new Error(
        `Could not find podcasts app folder in ${groupContainersFolder}`
      );
    }
    return `${process.env.HOME}/Library/Group Containers/${podcastsAppFolder}`;
  } catch (e) {
    throw new Error(
      `Could not find podcasis app folder in ${groupContainersFolder}, original error: ${e}`
    );
  }
}

async function getPodcastsDBPath() {
  return `${await getPodcastsBasePath()}/Documents/MTLibrary.sqlite`;
}

async function getPodcastsCacheFilesPath() {
  return `${await getPodcastsBasePath()}/Library/Cache`;
}

async function getDBPodcastsData() {
  const dbOrigin = new sqlite3.Database(await getPodcastsDBPath());
  const db = {
    serialize: promisify(dbOrigin.serialize).bind(dbOrigin),
    all: promisify(dbOrigin.all).bind(dbOrigin),
    close: promisify(dbOrigin.close).bind(dbOrigin)
  };

  try {
    await db.serialize();
    return await db.all(podcastSelectSQL);
  } finally {
    try {
      db.close();
    } catch (e) {
      console.error(e);
    }
  }
}

async function tryGetDBPodcastsData() {
  try {
    return await getDBPodcastsData();
  } catch (error) {
    console.error("Could not fetch data from podcasts database:", error);
    return [];
  }
}

async function getMP3MetaTitle(path) {
  const mp3Metadata = await mm.parseFile(path);
  return mp3Metadata?.common?.title;
}

async function getPodcastsCacheMP3Files(cacheFilesPath) {
  try {
    const podcastFiles = await fs.readdir(cacheFilesPath);
    return podcastFiles.filter((f) => f.includes(".mp3"));
  } catch (e) {
    throw new Error(`Could not find mp3 files in podcasts cache folder either there are no downloaded podcasts or something changed in podcasts app
original error: ${e}`);
  }
}

async function exportPodcasts(podcastsDBData) {
  const cacheFilesPath = await getPodcastsCacheFilesPath();
  const podcastMP3Files = await getPodcastsCacheMP3Files(cacheFilesPath);
  const filesWithDBData = podcastMP3Files.map((fileName) => {
    const uuid = fileName.replace(".mp3", "");
    const dbMeta = podcastsDBData.find((m) => m.zuuid === uuid);
    return {
      fileName,
      uuid,
      path: `${cacheFilesPath}/${fileName}`,
      dbMeta
    };
  });
  const outputDir = getOutputDirPath();
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all(
    filesWithDBData.map(async (podcast) => {
      // Create an export subdir
      let exportDirPath = outputDir;
      const exportDir = podcast.dbMeta?.zpodcast.replaceAll('/', '_');
      if (exportDir) {
        exportDirPath = `${outputDir}/${exportDir}`;
        // Needs to be sync else the same dir can be created multiple times
        if (!existsSync(exportDirPath)) {
          mkdirSync(exportDirPath);
        }
      }
      const date = podcast.dbMeta?.date;
      const exportFileName = podcast.dbMeta?.zcleanedtitle // 1. from apple podcast database
        ?? (await getMP3MetaTitle(podcast.path)) // 2. from mp3 meta data
        ?? podcast.uuid; // 3. fallback to unreadable uuid
      const sanitizedExportFileName = sanitize(exportFileName.substr(0, fileNameMaxLength));
      const newPath = `${exportDirPath}/${sanitizedExportFileName}.mp3`;
      await fs.copyFile(podcast.path, newPath);
      console.log(`${podcast.path} -> ${newPath}`);
      if (date) {
        const d = new Date(date);
        await fs.utimes(newPath, d, d);
      }
    })
  );
  console.log(`\n\nSuccessful Export to '${outputDir}' folder!`);
  exec(`open ${outputDir}`);
}

async function main() {
  const dbPodcastData = await tryGetDBPodcastsData();
  await exportPodcasts(dbPodcastData);
}

main();
