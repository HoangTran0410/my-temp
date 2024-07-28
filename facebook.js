const CACHED = {
  fb_dtsg: null,
};

export const TargetType = {
  User: "user",
  Page: "page",
  Group: "group",
};

export async function getEntityAbout(entityID, context = "DEFAULT") {
  let res = await fetchGraphQl({
    fb_api_req_friendly_name: "CometHovercardQueryRendererQuery",
    variables: {
      actionBarRenderLocation: "WWW_COMET_HOVERCARD",
      context: context,
      entityID: entityID,
      includeTdaInfo: true,
      scale: 1,
    },
    doc_id: "7257793420991802",
  });
  const json = JSON.parse(res);
  const node = json.data.node;
  if (!node) throw new Error("Wrong ID / Entity not found");
  const typeText = node.__typename.toLowerCase();
  if (!Object.values(TargetType).includes(typeText))
    throw new Error("Not supported type: " + typeText);
  const card = node.comet_hovercard_renderer[typeText];
  const type =
    typeText === "user"
      ? card.profile_plus_transition_path?.startsWith("PAGE")
        ? TargetType.Page
        : TargetType.User
      : TargetType.Group;

  return {
    type,
    id: node.id || card.id,
    name: card.name,
    avatar: card.profile_picture.uri,
    url: card.profile_url || card.url,
    raw: json,
  };
}

export async function getUserVideo({ id = "", cursor = "" }) {
  const videos = [];
  const res = await fetchGraphQl({
    variables: {
      cursor,
      count: 8,
      scale: 1,
      id: btoa(`app_collection:${id}:1560653304174514:133`),
    },
    doc_id: "3975496529227403",
  });
  const json = JSON.parse(res);
  const { edges = [], page_info = {} } = json?.data?.node?.pageItems || {};
  for (const edge of edges) {
    const id = edge?.node?.node?.id || "";
    // const videoInfo = await getVideoInfo(id);
    videos.push({
      id,
      recent: videos.length,
      created_time: "", // videoInfo.created_time,
      description: edge?.node?.title?.text,
      length: edge?.node?.node?.playable_duration,
      url: edge?.node?.url,
      source: "", // videoInfo.source,
      picture: edge?.node?.image?.uri, //videoInfo.thumbnail
      cursor: edge?.cursor || "",
    });
  }

  return { videos, nextCursor: page_info?.end_cursor };
}

// `https://graph.facebook.com/v14.0/${id}?fields=videos.limit(100)${after ? `.after(${after})` : ''}{created_time,description,id,length,post_id,source,picture}&access_token=${accessToken}`
export async function getGroupVideo({ id = "", cursor = "" }) {
  const videos = [];
  const res = await fetchGraphQl({
    fb_api_req_friendly_name: "GroupsCometVideosRootQueryContainerQuery",
    variables: {
      cursor,
      count: 8,
      scale: 2,
      groupID: id,
    },
    doc_id: "6553573504724585",
  });
  const json = JSON.parse(res);
  const { edges = [], page_info = {} } =
    json?.data?.group?.group_mediaset?.media || {};
  for (const edge of edges) {
    const id = edge?.node?.id || "";
    // const videoInfo = await getVideoInfo(id);
    videos.push({
      id,
      recent: videos.length,
      created_time: "", // videoInfo.created_time,
      description: edge?.node?.title?.text,
      length: edge?.node?.node?.playable_duration,
      url: edge?.node?.url,
      source: "", // videoInfo.source,
      picture: edge?.node?.image?.uri, //videoInfo.thumbnail
      cursor: edge?.cursor || "",
    });
  }

  return { videos, nextCursor: page_info?.end_cursor };
}

export async function getVideoInfo(videoId) {
  const res = await fetchGraphQl({
    fb_api_req_friendly_name: "CometTahoeRootQuery",
    variables: {
      caller: "TAHOE",
      chainingCursor: null,
      chainingSeedVideoId: null,
      channelEntryPoint: "TAHOE",
      channelID: "",
      feedbackSource: 41,
      feedLocation: "TAHOE",
      focusCommentID: null,
      isCrawler: false,
      privacySelectorRenderLocation: "COMET_STREAM",
      renderLocation: "video_channel",
      scale: 1,
      streamChainingSection: false,
      useDefaultActor: false,
      videoChainingContext: null,
      videoID: videoId,
      __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
      __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
      __relay_internal__pv__StoriesLWRVariantrelayprovider: "www_new_reactions",
    },
    doc_id: "26374037368876407",
  });
  const json = JSON.parse(res.split("\n")[0]);
  const videoInfo = json?.data?.video || {};
  return {
    id: videoInfo.videoId || videoInfo.id,
    owner: videoInfo.owner.id,
    length: videoInfo.playable_duration_in_ms / 1000,
    url: videoInfo.url || videoInfo.permalink_url,
    width: videoInfo.original_width || videoInfo.width,
    height: videoInfo.original_height || videoInfo.height,
    source:
      videoInfo.browser_native_hd_url ||
      videoInfo.playable_url_quality_hd ||
      videoInfo.browser_native_sd_url ||
      videoInfo.playable_url,
    created_time: (videoInfo.publish_time * 1000).toString(),
    thumbnail: videoInfo.preferred_thumbnail?.image?.uri,
  };
}

export async function getFbDtsg() {
  if (CACHED.fb_dtsg) return CACHED.fb_dtsg;
  let text = await fetchExtension("https://mbasic.facebook.com/photos/upload/");
  let dtsg = RegExp(/name="fb_dtsg" value="(.*?)"/).exec(text)?.[1];
  if (!dtsg) {
    text = await fetchExtension("https://m.facebook.com/home.php", {
      headers: {
        Accept: "text/html",
      },
    });
    dtsg =
      RegExp(/"dtsg":{"token":"([^"]+)"/).exec(text)?.[1] ||
      RegExp(/"name":"fb_dtsg","value":"([^"]+)/).exec(text)?.[1];
  }
  CACHED.fb_dtsg = dtsg || null;
  return CACHED.fb_dtsg;
}

export async function fetchGraphQl(params = {}, url = "") {
  let query = "";
  if (typeof params === "string") query = "&q=" + encodeURIComponent(params);
  else
    query = wrapGraphQlParams({
      dpr: 1,
      __a: 1,
      __aaid: 0,
      __ccg: "GOOD",
      server_timestamps: true,
      ...params,
    });

  const res = await fetchExtension(
    url || "https://www.facebook.com/api/graphql/",
    {
      body: query + "&fb_dtsg=" + (await getFbDtsg()),
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      credentials: "include",
    }
  );

  // check error response
  try {
    const json = JSON.parse(res);
    if (json.errors) {
      const { summary, message, description_raw } = json.errors[0];
      if (summary) {
        console.log(json);

        const div = document.createElement("div");
        div.innerHTML = description_raw?.__html;
        const description = div.innerText;

        alert(
          "Facebook response Error: " +
            summary +
            ". " +
            message +
            ". " +
            description
        );
      }
    }
  } catch (e) {}

  return res;
}

function wrapGraphQlParams(params = {}) {
  const formBody = [];
  for (const property in params) {
    const encodedKey = encodeURIComponent(property);
    const value =
      typeof params[property] === "string"
        ? params[property]
        : JSON.stringify(params[property]);
    const encodedValue = encodeURIComponent(value);
    formBody.push(encodedKey + "=" + encodedValue);
  }
  return formBody.join("&");
}

export function download(options) {
  return runExtFunc("chrome.downloads.download", [options]);
}

export function fetchExtension(url, options) {
  return runExtFunc("fetch", [url, options]);
}

export function runExtFunc(fnPath, params) {
  return sendMessage({ action: "fb_allInOne_runFunc", fnPath, params });
}

const ExtensionID = "heoejcamgchindphgghdhmjpgmldnepl";
function sendMessage(data) {
  return new Promise((resolve, reject) => {
    if (!window || !window?.chrome?.runtime)
      return reject(new Error("Cannot connect to extension Useful Scripts"));

    try {
      window.chrome.runtime.sendMessage(ExtensionID, data, function (res) {
        res && !res.error
          ? resolve(res)
          : reject(res ? res.error : new Error("Extension return empty"));
      });
    } catch (err) {
      return reject(err);
    }
  });
}
