const { promises: fs, existsSync, mkdirSync } = require("fs");
const { promisify } = require("util");
const sqlite3 = require("sqlite3").verbose();
const mm = require("music-metadata");
const { exec } = require("child_process");
const sanitize = require("sanitize-filename");

const yargs = require('yargs');

const argv = yargs
      .option('outputdir', {
        alias: 'o',
        description: 'Base output directory',
        type: 'string',
        default: `${process.env.HOME}/Downloads/PodcastsExport`
      })
      .option('datesubdir', {
        alias: 'd',
        description: 'Add YYYY.MM.DD subdirectory to output dir',
        type: 'boolean',
        default: true
      })
      .option('pattern', {
        alias: 'p',
        description: 'File substring patterns to match',
        type: 'string'
      })
      .option('nospaces', {
        description: 'Replace filename spaces with underscores',
        type: 'boolean',
        default: false
      })
      .help()
      .alias('help', 'h').argv;


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
  let ret = argv.outputdir;
  if (argv.datesubdir) {
    const d = new Date();
    const pad = (s) => s.toString().padStart(2, "0");
    const month = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const currentDateFolder = `${d.getFullYear()}.${month}.${day}`;
    ret = `${ret}/${currentDateFolder}`;
  }
  return ret;
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

function handleSpaces(s) {
  ret = s;
  if (argv.nospaces) {
    ret = s.replaceAll(' ', '_');
  }
  return ret;
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

  return {
    podcastName: handleSpaces(podcastName),
    date: dbMeta?.date,
    fileName,
    path,
    uuid,
    exportFileName: handleSpaces(`${exportFileName}.mp3`)
  };
}

function filterPodcasts(podcasts, filepatterns = []) {
  if (filepatterns.length === 0) {
    return podcasts;
  }

  function matchesAny(fileOrDir) {
    return filepatterns
      .map((pattern) => pattern.toLowerCase())
      .some((pattern) => fileOrDir.toLowerCase().includes(pattern));
  }

  return podcasts.filter((p) => matchesAny(p.exportFileName) || matchesAny(p.podcastName));
}

async function exportSingle(podcast, newPath) {
  await fs.copyFile(podcast.path, newPath);
  if (podcast.date) {
    const d = new Date(podcast.date);
    await fs.utimes(newPath, d, d);
  }
}

async function exportPodcasts(podcastsDBData, filepatterns = []) {
  const cacheFilesPath = await getPodcastsCacheFilesPath();
  const podcastMP3Files = await getPodcastsCacheMP3Files(cacheFilesPath);
  const podcastPromises = podcastMP3Files.map(
    (fileName) => mergeFilesWithDBMetaData(fileName, cacheFilesPath, podcastsDBData)
  );
  const podcasts = await Promise.all(podcastPromises);
  const filteredPodcasts = filterPodcasts(podcasts, filepatterns);
  if (filepatterns.length > 0) {
    console.log(`Exporting ${filteredPodcasts.length} of ${podcasts.length}`);
  }

  function joinPath(parts) {
    return parts.filter((s) => s).join('/');
  }

  // Make all necessary directories.  Each podcast is in its own
  // subdir.
  const outputDir = getOutputDirPath();
  const allDirs = filteredPodcasts.map(p => {
    return joinPath([outputDir, p.podcastName]);
  });
  const uniqueDirs = Array.from(new Set(allDirs));
  uniqueDirs.forEach(d => mkdirSync(d, { recursive: true }));

  // Actual file export.
  await Promise.all(
    filteredPodcasts.map(async (p) => {
      const parts = [outputDir, p.podcastName, p.exportFileName];
      const newPath = joinPath(parts);
      const logDestFilePath = joinPath([p.podcastName, p.exportFileName]);
      if (!existsSync(newPath)) {
        await exportSingle(p, newPath);
        console.log(`${p.fileName} -> ${logDestFilePath}`);
      }
      else {
        console.log(`Already have ${logDestFilePath}, skipping`);
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

// User might specify one pattern, in which case argv.pattern is a
// string, or multiple, in which case it's an array.
patterns = [ argv.pattern ].flat()

main(patterns);
