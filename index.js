const { promises: fs } = require("fs");
const { promisify } = require("util");
const sqlite3 = require("sqlite3").verbose();
const mm = require("music-metadata");
const path = require("path");
const { exec } = require("child_process");

const d = new Date();
const pad = (s) => s.toString().padStart(2, "0");
const month = pad(d.getMonth() + 1);
const day = pad(d.getDate());
const currentDateFolder = `${d.getFullYear()}.${month}.${day}`;
const outputDir = `${process.env.HOME}/Downloads/PodcastsExport/${currentDateFolder}`;
const podcastSelectSQL = `
  SELECT zcleanedtitle as zcleanedtitle, zuuid as zuuid
    FROM ZMTEPISODE;
`;
const fileNameMaxLength = 50;

async function getPodcastsBasePath() {
  const groupContainersFolder = `${process.env.HOME}/Library/Group Containers`;
  try {
    const libraryGroupContainersDirList = await fs.readdir(
      groupContainersFolder
    );
    const podcastsAppFolder = libraryGroupContainersDirList.find((d) =>
      d.includes("groups.com.apple.podcasts")
    );
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
    close: promisify(dbOrigin.close).bind(dbOrigin),
  };

  try {
    await db.serialize();
    return await db.all(podcastSelectSQL);
  } finally {
    try {
      db.close();
    } catch {}
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

async function getMP3Title(path) {
  const metadata = await mm.parseFile(path);
  return metadata?.common?.title;
}

async function exportPodcasts(podcastsDBData) {
  const cacheFilesPath = await getPodcastsCacheFilesPath();
  const podcastFiles = await fs.readdir(cacheFilesPath);
  const podcastMP3Files = podcastFiles.filter((f) => f.includes(".mp3"));
  const filesWithDBData = podcastMP3Files.map((fileName) => {
    const uuid = fileName.replace(".mp3", "");
    const meta = podcastsDBData.find((m) => m.zuuid === uuid);
    return {
      fileName,
      uuid,
      path: `${cacheFilesPath}/${fileName}`,
      meta,
    };
  });

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all(
    filesWithDBData.map(async (podcast) => {
      const newFileName =
        podcast.meta?.zcleanedtitle ??
        (await getMP3Title(podcast.path)) ??
        podcast.uuid;
      const newFileNameLength = newFileName.substr(0, fileNameMaxLength);
      const newPath = `${outputDir}/${newFileNameLength}.mp3`;
      console.log(`${podcast.path} -> ${newPath}`);
      await fs.copyFile(podcast.path, newPath);
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
