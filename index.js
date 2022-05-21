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


async function mergeFilesWithDBMetaData(fileName, cacheFilesPath, podcastsDBData) {
  const uuid = fileName.replace(".mp3", "");
  const dbMeta = podcastsDBData.find((m) => m.zuuid === uuid);
  const path = `${cacheFilesPath}/${fileName}`;
  const exportBase = dbMeta?.zcleanedtitle // 1. from apple podcast database
        ?? (await getMP3MetaTitle(path)) // 2. from mp3 meta data
        ?? uuid; // 3. fallback to unreadable uuid
  const podcastName = sanitize(dbMeta?.zpodcast);
  const exportFileName = sanitize(exportBase.substr(0, fileNameMaxLength));
  const date = dbMeta?.date

  const ret = {
    podcastName,
    date,
    fileName,
    path,
    uuid,
    exportFileName: `${exportFileName}.mp3`
  };
  return ret;
}


function filterPodcasts(podcasts, filepatterns = []) {
  if (filepatterns.length == 0) {
    return podcasts;
  }

  function matchesAny(fileOrDir) {
    return filepatterns
      .map(pattern => pattern.toLowerCase())
      .some(pattern => fileOrDir.toLowerCase().includes(pattern) )
  }

  return podcasts.filter((p) => {
    return matchesAny(p.exportFileName) || matchesAny(p.podcastName);
  });
}


async function exportPodcasts(podcastsDBData, filepatterns = []) {
  const cacheFilesPath = await getPodcastsCacheFilesPath();
  const podcastMP3Files = await getPodcastsCacheMP3Files(cacheFilesPath);
  const podcasts = await Promise.all(podcastMP3Files.map((fileName) => {
    return mergeFilesWithDBMetaData(fileName, cacheFilesPath, podcastsDBData);
  }));
  const filteredPodcasts = filterPodcasts(podcasts, filepatterns);
  if (filepatterns.length > 0) {
    console.log(`Exporting ${filteredPodcasts.length} of ${podcasts.length}`);
  }

  const outputDir = getOutputDirPath();
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all(
    filteredPodcasts.map(async (podcast) => {
      // Create an export subdir
      let exportDirPath = outputDir;
      if (podcast.podcastName) {
        exportDirPath = `${outputDir}/${podcast.podcastName}`;
      }
      // Needs to be sync else the same dir can be created multiple times
      if (!existsSync(exportDirPath)) {
        mkdirSync(exportDirPath);
      }

      const newPath = `${exportDirPath}/${podcast.exportFileName}`;
      await fs.copyFile(podcast.path, newPath);

      const logName = [ podcast.podcastName, podcast.exportFileName ].
            filter((s) => s).
            join('/');
      console.log(`${podcast.fileName} -> ${logName}`);
      if (podcast.date) {
        const d = new Date(podcast.date);
        await fs.utimes(newPath, d, d);
      }
    })
  );
  console.log(`\n\nSuccessful Export to '${outputDir}' folder!`);
  exec(`open ${outputDir}`);
}

async function main(filepatterns = []) {
  const dbPodcastData = await tryGetDBPodcastsData();
  await exportPodcasts(dbPodcastData, filepatterns);
}

var args = process.argv.slice(2);
main(args);
