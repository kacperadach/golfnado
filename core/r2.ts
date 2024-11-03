import { Golfnado, GameState, Stroke, Club, Hole, Player } from "../core/game";
import {
  gatherPlayerStats,
  gatherBestStats,
  mergeStats,
  GolfnadoStats,
} from "../core/stats";
import { getDomain, KEY_BASE } from "./constants";

function getKey(teamId: string, channelId: string) {
  return `${KEY_BASE}/${teamId}/${channelId}`;
}

function getArchivedKey(teamId: string, channelId: string) {
  return `${KEY_BASE}/${teamId}/${channelId}/archived/${Date.now()}`;
}

function getPlayerStatsKey(
  teamId: string,
  channelId: string,
  playerId: string
) {
  return `${KEY_BASE}/${teamId}/${channelId}/stats/${playerId}`;
}

function getAllTimeStatsKey(teamId: string, channelId: string) {
  return `${KEY_BASE}/${teamId}/${channelId}/stats/all-time`;
}

function getImageKey(teamId: string, channelId: string, imageName: string) {
  return `${KEY_BASE}/${teamId}/${channelId}/images/${imageName}`;
}

export async function getCurrentGame(env, teamId: string, channelId: string) {
  const game = await env.GOLFNADO_BUCKET.get(getKey(teamId, channelId));

  if (!game) {
    return null;
  }

  const json = await game.text();

  return Golfnado.fromJSON(JSON.parse(json));
}

export async function upsertGame(
  env,
  teamId: string,
  channelId: string,
  game: Golfnado
) {
  await env.GOLFNADO_BUCKET.put(
    getKey(teamId, channelId),
    JSON.stringify(game.toJSON()),
    {
      httpMetadata: {
        contentType: "application/json",
      },
    }
  );
}

export async function fetchPlayerStats(
  env,
  teamId: string,
  channelId: string,
  playerId: string
) {
  const playerStats = await env.GOLFNADO_BUCKET.get(
    getPlayerStatsKey(teamId, channelId, playerId)
  );

  if (!playerStats) {
    return null;
  }

  const json = await playerStats.text();
  return JSON.parse(json);
}

async function upsertPlayerStats(
  env,
  teamId: string,
  channelId: string,
  playerId: string,
  stats: GolfnadoStats
) {
  await env.GOLFNADO_BUCKET.put(
    getPlayerStatsKey(teamId, channelId, playerId),
    JSON.stringify(stats),
    {
      httpMetadata: {
        contentType: "application/json",
      },
    }
  );
}

export async function fetchAllTimeStats(
  env,
  teamId: string,
  channelId: string
) {
  const allTimeStats = await env.GOLFNADO_BUCKET.get(
    getAllTimeStatsKey(teamId, channelId)
  );

  if (!allTimeStats) {
    return null;
  }

  const json = await allTimeStats.text();
  return JSON.parse(json);
}

async function upsertAllTimeStats(
  env,
  teamId: string,
  channelId: string,
  stats: GolfnadoStats
) {
  await env.GOLFNADO_BUCKET.put(
    getAllTimeStatsKey(teamId, channelId),
    JSON.stringify(stats),
    {
      httpMetadata: {
        contentType: "application/json",
      },
    }
  );
}

export async function archiveFinishedGame(
  env,
  teamId: string,
  channelId: string
) {
  const currentGame = await getCurrentGame(env, teamId, channelId);

  if (!currentGame) {
    throw new Error("No game found");
  }

  const allPlayerStats = [];

  for (let i = 0; i < currentGame.players.length; i++) {
    const player = currentGame.players[i];

    let playerStats = gatherPlayerStats(currentGame, i);

    const existingStats = await fetchPlayerStats(
      env,
      teamId,
      channelId,
      player.id
    );

    if (existingStats) {
      playerStats = mergeStats(existingStats, playerStats);
    }

    allPlayerStats.push(playerStats);

    await upsertPlayerStats(env, teamId, channelId, player.id, playerStats);
  }

  let gameStats = gatherBestStats(allPlayerStats);
  const allTimeStats = await fetchAllTimeStats(env, teamId, channelId);
  if (allTimeStats) {
    const allTimeAvgStrokesPlayer = allTimeStats.averageStrokes.playerId;

    if (gameStats.averageStrokes.playerId === allTimeAvgStrokesPlayer) {
      allTimeStats.averageStrokes.value = gameStats.averageStrokes.playerId;
    }

    gameStats = gatherBestStats([allTimeStats, gameStats]);
  }
  upsertAllTimeStats(env, teamId, channelId, gameStats);

  const archiveKey = getArchivedKey(teamId, channelId);

  await env.GOLFNADO_BUCKET.put(
    archiveKey,
    JSON.stringify(currentGame.toJSON()),
    {
      httpMetadata: {
        contentType: "application/json",
      },
    }
  );

  await env.GOLFNADO_BUCKET.delete(getKey(teamId, channelId));
  return archiveKey;
}

export async function deleteGame(env, teamId, channelId) {
  await env.GOLFNADO_BUCKET.delete(getKey(teamId, channelId));
}

export async function uploadCourseImage(
  env,
  teamId,
  channelId,
  imageName,
  imageBuffer
) {
  // const readableStream = new ReadableStream({
  //   start(controller) {
  //     controller.enqueue(imageBuffer);
  //     controller.close();
  //   },
  // });
  const imageKey = getImageKey(teamId, channelId, imageName);
  await env.GOLFNADO_BUCKET.put(imageKey, imageBuffer, {
    httpMetadata: {
      contentType: "image/png",
      contentLength: imageBuffer.byteLength,
    },
    customMetadata: {
      contentLength: imageBuffer.byteLength,
    },
  });
  console.log("uploaded image");
  return `https://${getDomain(teamId) + imageKey.replace(KEY_BASE, "/media")}`;
}
