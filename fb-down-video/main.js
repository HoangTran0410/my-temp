import {
  getUserVideo,
  getGroupVideo,
  getEntityAbout,
  TargetType,
  getVideoInfo,
  download,
  getUserPhotos,
  getGroupPhotos,
  getLargestPhoto,
  getUserReels,
} from "./facebook.js";
import { elementInViewport, promiseAllStepN } from "./utils.js";

const Tabs = {
  Photos: "Photos",
  Videos: "Videos",
  Reels: "Reels",
};

const CACHED = {
  about: null,
  tab: Tabs.Photos,
  data: [],

  fetchingNext: false,
  hasMore: true,
};

const inputId = document.querySelector("input");
const searchBtn = document.getElementById("search");
const downloadBtn = document.getElementById("download");
const aboutDiv = document.getElementById("about");
const containerDiv = document.getElementById("container");
const triggerDiv = document.getElementById("trigger");
const tabsSelect = document.getElementById("tabs");
const noDataDiv = document.getElementById("no-data");

downloadBtn.addEventListener("click", onDownload);
searchBtn.addEventListener("click", onSearch);

// set value for select tabs
Object.values(Tabs).forEach((value) => {
  tabsSelect.innerHTML += `<option value="${value}">${value}</option>`;
});
tabsSelect.value = CACHED.tab;
tabsSelect.addEventListener("change", (e) => {
  CACHED.tab = e.target.value;
  // clear old data
  CACHED.data = [];
  renderData([], true);
});

// auto fetch next
setInterval(async () => {
  const isInViewPort = elementInViewport(triggerDiv);
  if (CACHED.about && !CACHED.fetchingNext && isInViewPort) {
    const data = await fetchNext();
    if (data?.length) {
      CACHED.data.push(...data);
      renderData(data, false);
    }
    let hasMore = data?.length > 0;
    if (!hasMore) noDataDiv.innerHTML = "No more data";
  }
}, 1000);

async function onSearch() {
  Swal.fire({
    title: "Đang tải",
    text: "Đang lấy thông tin id facebook",
    didOpen: () => {
      Swal.showLoading();
    },
  });
  const id = inputId.value;
  const about = await getEntityAbout(id);
  console.log(about);
  CACHED.about = about;
  renderAbout(about);
  renderData([], true); // clear old data
  Swal.close();
}

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

  const collectionName = "fb_" + CACHED.tab + "_" + CACHED.about.name;
  const getDownloadInfo =
    CACHED.tab === Tabs.Photos
      ? // Photos
        async (item) => {
          if (!item.image) {
            const photo = await getLargestPhoto(item.id);
            item.image = photo?.image;
          }
          return { url: item.image, name: item.id + ".jpg" };
        }
      : // Videos
      CACHED.tab === Tabs.Videos
      ? async (item) => {
          if (!item.source) {
            const video = await getVideoInfo(item.id);
            item.source = video?.source;
          }
          return { url: item.source, name: item.id + ".mp4" };
        }
      : // Reels
        async (item) => {
          return {
            url: item.source,
            name: item.id + ".mp4",
          };
        };

  const dirHandler = await window.showDirectoryPicker({ mode: "readwrite" });
  await dirHandler.requestPermission({ writable: true });

  const subDir = await dirHandler.getDirectoryHandle(collectionName, {
    create: true,
  });

  Swal.fire({
    title: "Downloading...",
    text: CACHED.about.name,
    didOpen: () => Swal.showLoading(),
    allowOutsideClick: false,
  });
  const all = [...CACHED.data];
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

    const { start, stop } = promiseAllStepN(
      10,
      arr.map((item, i) => async () => {
        try {
          const { url, name } = await getDownloadInfo(item);
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

async function fetchNext(cursor) {
  if (CACHED.fetchingNext) return;
  CACHED.fetchingNext = true;

  noDataDiv.innerHTML = "Fetching..";

  let data, res;
  try {
    cursor = cursor || CACHED.data[CACHED.data.length - 1]?.cursor || "";

    // fetch photos
    if (CACHED.tab === Tabs.Photos) {
      res =
        CACHED.about?.type === TargetType.Group
          ? await getGroupPhotos({ id: CACHED.about?.id, cursor })
          : await getUserPhotos({ id: CACHED.about?.id, cursor });
      data = res.photos;
    }

    // fetch videos
    if (CACHED.tab === Tabs.Videos) {
      res =
        CACHED.about?.type === TargetType.Group
          ? await getGroupVideo({ id: CACHED.about?.id, cursor })
          : await getUserVideo({ id: CACHED.about?.id, cursor });
      data = res.videos;
    }

    // fetch reels
    if (CACHED.tab === Tabs.Reels) {
      res = await getUserReels({ id: CACHED.about?.id, cursor });
      data = res;
    }
  } catch (e) {
    Swal.fire({
      icon: "error",
      title: "Error fetchNext",
      text: e.message,
    });
  } finally {
    CACHED.fetchingNext = false;
  }

  return data;
}

function renderData(data, override = false) {
  if (override) {
    containerDiv.innerHTML = "";
  }

  if (CACHED.tab === Tabs.Photos) {
    containerDiv.innerHTML += data
      .map(
        (img) => /*html*/ `
      <div class="photo">
        <img
          src="${img.image || img.thumbnail}"
          data-source="${img.image || ""}"
          data-id="${img.id}" />
      </div>`
      )
      .join("");
  }
  if (CACHED.tab === Tabs.Videos) {
    containerDiv.innerHTML += data
      .map(
        (video) => /*html*/ `
      <div class="video">
        <img
          src="${video.picture}"
          data-source="${video.source || ""}"
          data-id="${video.id}" />
      </div>`
      )
      .join("");
  }
  if (CACHED.tab === Tabs.Reels) {
    containerDiv.innerHTML += data
      .map(
        (reel) => /*html*/ `
      <div class="video">
        <img
          src="${reel.thumbnail}"
          data-source="${reel.source || ""}"
          data-id="${reel.id}" />
      </div>`
      )
      .join("");
  }
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

window.addEventListener("click", async (e) => {
  // on click photo
  if (e.target.matches(".photo img")) {
    const source = e.target.getAttribute("data-source");
    const id = e.target.getAttribute("data-id");

    if (source) {
      window.open(source, "_blank");
    } else {
      Swal.fire({
        title: "Đang tải",
        text: "Đang lấy thông tin ảnh",
        didOpen: () => {
          Swal.showLoading();
        },
      });
      const img = await getLargestPhoto(id);
      console.log(img);
      window.open(img.image, "_blank");
      Swal.close();
    }
  }

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
      window.open(videoInfo.source, "_blank");

      Swal.close();
    }
  }
});
