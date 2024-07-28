import {
  getUserVideo,
  getGroupVideo,
  getEntityAbout,
  TargetType,
  getVideoInfo,
  download,
} from "./facebook.js";
import { elementInViewport, promiseAllStepN } from "./utils.js";

const CACHED = {
  about: null,
  videos: [],

  fetchingNext: false,
};

const inputId = document.querySelector("input");
const searchBtn = document.getElementById("search");
const downloadBtn = document.getElementById("download");
const aboutDiv = document.getElementById("about");
const videosDiv = document.getElementById("videos");
const triggerDiv = document.getElementById("trigger");

downloadBtn.addEventListener("click", onDownload);
searchBtn.addEventListener("click", onSearch);

// auto fetch next
setInterval(async () => {
  const isInViewPort = elementInViewport(triggerDiv);
  if (CACHED.about && !CACHED.fetchingNext && isInViewPort) {
    const videos = await fetchNext();
    if (videos?.length) {
      CACHED.videos.push(...videos);
      renderVideos(videos, false);
    }
  }
}, 1000);

async function onDownload() {
  if (!CACHED.about) {
    Swal.fire({
      icon: "error",
      title: "Please search something first",
    });
    return;
  }

  if (!("showDirectoryPicker" in window)) {
    return Swal.fire({
      icon: "error",
      title: "Browser not supported",
      text: "File saver API not supported in this browser. Please use newest version of Edge or Chrome. (window.showDirectoryPicker)",
    });
  }

  const collectionName = "fb_videos_" + CACHED.about.name;

  const dirHandler = await window.showDirectoryPicker({ mode: "readwrite" });
  await dirHandler.requestPermission({ writable: true });

  const subDir = await dirHandler.getDirectoryHandle(collectionName, {
    create: true,
  });

  Swal.fire({
    title: "Downloading...",
    text: CACHED.about.name,
    didOpen: () => Swal.showLoading(),
  });
  const all = [...CACHED.videos];
  let downloaded = 0,
    failed = 0,
    downloadedByApi = 0,
    index = 0,
    hasMore = true;

  while (hasMore) {
    const chunk = await fetchNext(all[all.length - 1]?.cursor || "");

    console.log(chunk);
    if (chunk?.length) all.push(...chunk);
    else hasMore = false;

    const arr = all.slice(index);
    if (!arr.length) break;

    const { start, stop: stopQueue } = promiseAllStepN(
      10,
      arr.map((video, i) => async () => {
        try {
          let url = video.source,
            name = video.id + ".mp4";

          if (!url) {
            const videoInfo = await getVideoInfo(video.id);
            url = videoInfo.source;
            name = videoInfo.id + ".mp4";
          }

          const fileNamePrefix = index + i + "_";
          const fileName = fileNamePrefix + name;

          try {
            // try download directly, using fetch blob
            const blob = await (await fetch(url)).blob();
            const fileHandler = await subDir.getFileHandle(fileName, {
              create: true,
            });
            const writable = await fileHandler.createWritable();
            await writable.write(blob);
            await writable.close();
          } catch (e) {
            // backup download: using extension api
            await download({
              url: url,
              conflictAction: "overwrite",
              filename: collectionName + "/" + fileName,
            });
            downloadedByApi++;
          }

          downloaded++;
          Swal.update({
            title: "Downloading..." + downloaded,
            html: `
              <span>
                ${failed ? "Failed: " + failed + "<br />" : ""}
                ${collectionName}
              </span>
            `,
            // confirmButtonText: "Stop",
            showConfirmButton: false,
            showCancelButton: false,
          });
        } catch (e) {
          failed++;
          console.error(e);
        }
      })
    );
    const chunk_downloaded = await start();
    index += chunk_downloaded.length;
  }

  Swal.fire({
    icon: "success",
    title: "Downloaded",
    text: `${downloaded} files downloaded, ${failed} failed`,
    didOpen: () => {
      Swal.hideLoading();
    },
  });
}

async function onSearch() {
  Swal.fire({
    title: "Đang tải",
    text: "Đang lấy thông tin id facebook",
    didOpen: () => {
      Swal.showLoading();
    },
  });
  const id = inputId.value;
  // TODO get info and video
  const about = await getEntityAbout(id);
  console.log(about);
  CACHED.about = about;
  renderAbout(about);

  Swal.fire({
    title: "Đang tải",
    text: "Đang lấy thông tin videos của " + about.name,
    didOpen: () => {
      Swal.showLoading();
    },
  });

  CACHED.videos = await fetchNext();
  console.log(CACHED.videos);
  renderVideos(CACHED.videos, true);

  Swal.close();
}

async function fetchNext(
  cursor = CACHED.videos[CACHED.videos.length - 1]?.cursor || ""
) {
  if (CACHED.fetchingNext) return;
  CACHED.fetchingNext = true;
  const res =
    CACHED.about?.type === TargetType.Group
      ? await getGroupVideo({ id: CACHED.about?.id, cursor })
      : await getUserVideo({ id: CACHED.about?.id, cursor });
  CACHED.fetchingNext = false;
  return res.videos;
}

function renderAbout(about) {
  aboutDiv.innerHTML = /*html*/ `
        <div class="row card">
            <img src="${about.avatar}" class="avatar" />
            <div>
                <a target="_blank" href="${about.url}">
                    <p>${about.name}</p>
                </a>
                <span>${about.type}</span>
            </div>
        </div>
    `;
}

function renderVideos(videos, override = false) {
  if (override) {
    videosDiv.innerHTML = "";
  }
  videosDiv.innerHTML += /*html*/ `
    ${videos
      .map(
        (video) => /*html*/ `
            <div class="video">
                <img src="${video.picture}" data-source="${video.source}" data-id="${video.id}" />
            </div>
        `
      )
      .join("")}
    `;
}

window.addEventListener("click", async (e) => {
  // on click video
  if (e.target.matches(".video img")) {
    const source = e.target.getAttribute("data-source");
    const id = e.target.getAttribute("data-id");

    if (source) {
      window.open(source, "_blank");
    } else {
      Swal.fire({
        title: "Đang tải",
        text: "Đang lấy thông tin video",
        didOpen: () => {
          Swal.showLoading();
        },
      });
      const videoInfo = await getVideoInfo(id);
      console.log(videoInfo);

      // update back to CACHED
      const exist = CACHED.videos.find((v) => v.id === videoInfo.id);
      if (exist) {
        exist.source = videoInfo.source;
      }
      window.open(videoInfo.source, "_blank");

      Swal.close();
    }
  }
});
