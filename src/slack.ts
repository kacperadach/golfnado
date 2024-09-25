import { Golfnado, GameState, Stroke, Swing, Club, Hole, Player } from "./game";
import { Course, Ground, Point2D } from "./course";
import { BallPositionAndColor, createSwingGifBuffer } from "./gifbuffer";
import {
  gatherPlayerStats,
  gatherBestStats,
  mergeStats,
  GolfnadoStats,
} from "./stats";

const KEY_BASE = "golfnado-prod";

function getKey(context) {
  return `${KEY_BASE}/${context.teamId}/${context.channelId}`;
}

function getArchivedKey(context) {
  return `${KEY_BASE}/${context.teamId}/${
    context.channelId
  }/archived/${Date.now()}`;
}

function getPlayerStatsKey(context, playerId) {
  return `${KEY_BASE}/${context.teamId}/${context.channelId}/stats/${playerId}`;
}

function getAllTimeStatsKey(context) {
  return `${KEY_BASE}/${context.teamId}/${context.channelId}/stats/all-time`;
}

async function getCurrentGame(env, context) {
  const game = await env.GOLFNADO_BUCKET.get(getKey(context));

  if (!game) {
    return null;
  }

  const json = await game.text();

  return Golfnado.fromJSON(JSON.parse(json));
}

async function upsertGame(env, context, game: Golfnado) {
  await env.GOLFNADO_BUCKET.put(
    getKey(context),
    JSON.stringify(game.toJSON()),
    {
      httpMetadata: {
        contentType: "application/json",
      },
    }
  );
}

async function fetchPlayerStats(env, context, playerId: string) {
  const playerStats = await env.GOLFNADO_BUCKET.get(
    getPlayerStatsKey(context, playerId)
  );

  if (!playerStats) {
    return null;
  }

  const json = await playerStats.text();
  return JSON.parse(json);
}

async function upsertPlayerStats(
  env,
  context,
  playerId: string,
  stats: GolfnadoStats
) {
  await env.GOLFNADO_BUCKET.put(
    getPlayerStatsKey(context, playerId),
    JSON.stringify(stats),
    {
      httpMetadata: {
        contentType: "application/json",
      },
    }
  );
}

async function fetchAllTimeStats(env, context) {
  const allTimeStats = await env.GOLFNADO_BUCKET.get(
    getAllTimeStatsKey(context)
  );

  if (!allTimeStats) {
    return null;
  }

  const json = await allTimeStats.text();
  return JSON.parse(json);
}

async function upsertAllTimeStats(env, context, stats: GolfnadoStats) {
  await env.GOLFNADO_BUCKET.put(
    getAllTimeStatsKey(context),
    JSON.stringify(stats),
    {
      httpMetadata: {
        contentType: "application/json",
      },
    }
  );
}

async function archiveFinishedGame(env, context) {
  const currentGame = await getCurrentGame(env, context);

  if (!currentGame) {
    throw new Error("No game found");
  }

  const allPlayerStats = [];

  for (let i = 0; i < currentGame.players.length; i++) {
    const player = currentGame.players[i];

    let playerStats = gatherPlayerStats(currentGame, i);
    allPlayerStats.push(playerStats);

    const existingStats = await fetchPlayerStats(env, context, player.id);

    if (existingStats) {
      playerStats = mergeStats(existingStats, playerStats);
    }

    await upsertPlayerStats(env, context, player.id, playerStats);
  }

  let gameStats = gatherBestStats(allPlayerStats);
  const allTimeStats = await fetchAllTimeStats(env, context);
  if (allTimeStats) {
    gameStats = gatherBestStats([allTimeStats, gameStats]);
  }
  upsertAllTimeStats(env, context, gameStats);

  await env.GOLFNADO_BUCKET.put(
    getArchivedKey(context),
    JSON.stringify(currentGame.toJSON()),
    {
      httpMetadata: {
        contentType: "application/json",
      },
    }
  );

  await env.GOLFNADO_BUCKET.delete(getKey(context));
}

async function sendDefaultCourseGif(context, currentGame: Golfnado) {
  const currentHole = currentGame.getCurrentHole();

  await sendCourseGif(
    context,
    currentHole.course,
    null,
    "",
    getBallPositionsAndColors(currentHole, currentGame.players, null)
  );
}

async function sendCourseGif(
  context,
  course: Course,
  stroke: Stroke,
  playerColor: string,
  otherBallPositions: BallPositionAndColor[]
) {
  const gifBuffer = await createSwingGifBuffer(
    course,
    stroke,
    playerColor,
    otherBallPositions
  );

  const uploadUrl = await context.client.files.getUploadURLExternal({
    channel: context.channelId,
    filename: "image.gif",
    length: gifBuffer.byteLength,
  });

  const { upload_url, file_id } = uploadUrl;

  const formData = new FormData();
  formData.append(
    "file",
    new Blob([gifBuffer], { type: "image/gif" }),
    "image.gif"
  );

  await fetch(upload_url, {
    method: "POST",
    body: formData,
  });

  await context.client.files.completeUploadExternal({
    channel_id: context.channelId,
    files: [{ id: file_id, title: "image.gif" }],
  });
}

async function newGame(env, context) {
  const currentGame = await getCurrentGame(env, context);
  if (currentGame) {
    if (currentGame.gameState === GameState.NOT_STARTED) {
      await context.client.chat.postMessage({
        channel: context.channelId,
        text: `<@${context.userId}> There's already a golfnado going on! Join the tee time by typing \`join\``,
      });
      return;
    } else {
      const currentPlayer = currentGame.getCurrentPlayer();

      await context.client.chat.postMessage({
        channel: context.channelId,
        text: `<@${context.userId}> There's already a golfnado going on! <@${currentPlayer.id}> has to swing!`,
      });
      return;
    }
  }

  const game = Golfnado.newGame(context.userId);
  await upsertGame(env, context, game);

  await context.client.chat.postMessage({
    channel: context.channelId,
    text: `<@${context.userId}> has started a new golfnado! Join the tee time by typing \`join\`! Start round by typing \`start\`!`,
  });
}

async function join(env, context) {
  const currentGame = await getCurrentGame(env, context);
  if (!currentGame) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Tee time has not been booked! Start by typing \`new golfnado\``,
    });
    return;
  }

  if (currentGame.players.find((p) => p.id === context.userId)) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> You already joined the Golfnado! Tee off by typing \`start\``,
    });
    return;
  }

  currentGame.addPlayer(context.userId);
  await upsertGame(env, context, currentGame);

  await context.client.chat.postMessage({
    channel: context.channelId,
    text: `<@${context.userId}> has joined the golfnado! Tee off by typing \`start\``,
  });
}

async function startGame(env, context) {
  const currentGame = await getCurrentGame(env, context);
  if (!currentGame) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> There's no golfnado, book a tee time by typing \`new golfnado\`!`,
    });
    return;
  }

  if (currentGame.gameState === GameState.STARTED) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Golfnado already started! <@${
        currentGame.getCurrentPlayer().id
      }> has to swing!`,
    });
    return;
  }

  if (!currentGame.players.find((p) => p.id === context.userId)) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> have not joined the game! Join the tee time by typing \`join\``,
    });
    return;
  }

  currentGame.startGame();
  await upsertGame(env, context, currentGame);

  await sendDefaultCourseGif(context, currentGame);
  await context.client.chat.postMessage({
    channel: context.channelId,
    text: `Game started! ${currentGame.holes.length} holes. ${
      currentGame.maxStrokes
    } swing max per hole. Good luck! <@${
      currentGame.players[0].id
    }> is up first! ${getWindMessage(currentGame)}`,
  });
  await postSwingMessage(env, context, currentGame.players[0].id);
}

function getBallPositionsAndColors(
  hole: Hole,
  players: Player[],
  excludePlayerId: string
): BallPositionAndColor[] {
  const ballPositionsAndColors: BallPositionAndColor[] = [];

  for (let i = 0; i < hole.strokes.length; i++) {
    if (players[i].id === excludePlayerId) {
      continue;
    }
    const position = hole.getCurrentBallLocation(i);
    if (hole.course.isPointInHole(position)) {
      continue;
    }

    ballPositionsAndColors.push({
      color: players[i].color,
      position,
    });
  }
  return ballPositionsAndColors;
}

function getWindMessage(game: Golfnado) {
  return `Wind ${(game.getCurrentHole().course.wind.velocity * 12).toFixed(
    1
  )}MPH at ${game.getCurrentHole().course.wind.direction} degrees.`;
}

async function swing(env, context, message: string) {
  const currentGame = await getCurrentGame(env, context);
  if (!currentGame) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> There's no golfnado, book a tee time by typing \`new golfnado\`!`,
    });
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Golfnado not started, to tee off type \`start\``,
    });
    return;
  } else if (currentGame.gameState === GameState.GAME_OVER) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Golfnado is over, to play agin type \`new golfnado\``,
    });
    return;
  }

  const currentPlayer = currentGame.getCurrentPlayer();

  if (!currentPlayer || currentPlayer.id !== context.userId) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> not your turn, it's <@${currentPlayer?.id}>'s turn!`,
    });
    return;
  }

  const swing = Golfnado.parseSwing(message);
  if (!swing) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Invalid swing, format:\n \`swing {driver|iron|wedge|putter} {power (1-100)} {direction (in degrees)}\``,
    });
    await postSwingMessage(env, context, context.userId);
    return;
  }

  const currentHoleIndex = currentGame.getCurrentHoleIndex();
  const currentHole = currentGame.getCurrentHole();

  const strokeResult = currentGame.swing(context.userId, swing);
  if (strokeResult === undefined) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Swing failed, Kacper sucks at coding"`,
    });
    return;
  }

  await upsertGame(env, context, currentGame);

  if (strokeResult.gameState === GameState.GAME_OVER) {
    await archiveFinishedGame(env, context);
  }

  let nextPlayerId = null;
  let nextPlayerMessage = "";
  if (currentGame.getCurrentPlayer()) {
    const holeIndex = currentGame.getCurrentHoleIndex();

    nextPlayerId = currentGame.getCurrentPlayer().id;

    nextPlayerMessage += `<@${nextPlayerId}> is up next at ${
      currentGame.getCurrentHole().strokes[
        currentGame.getCurrentPlayerIndex(
          currentGame.getCurrentHole(),
          currentGame.holePlayerOrder[holeIndex]
        )
      ].length
    } strokes! ${getWindMessage(currentGame)}`;
  }

  await context.client.chat.postMessage({
    channel: context.channelId,
    text: `<@${context.userId}> Ball landed in ${
      Ground[strokeResult.endGround]
    }. ${nextPlayerMessage}`,
  });

  if (nextPlayerId) {
    await postSwingMessage(env, context, nextPlayerId);
  }

  const ballPositionsAndColors: BallPositionAndColor[] =
    getBallPositionsAndColors(
      currentHole,
      currentGame.players,
      currentPlayer.id
    );

  await sendCourseGif(
    context,
    strokeResult.hole.course,
    strokeResult.stroke,
    currentPlayer.color,
    ballPositionsAndColors
  );

  if (currentGame.getCurrentHoleIndex() === null) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `Game over\n${getScorecardText(currentGame)}`,
    });
  } else if (currentGame.getCurrentHoleIndex() !== currentHoleIndex) {
    // const currentHole = currentGame.holes[currentGame.getCurrentHoleIndex()];
    await sendDefaultCourseGif(context, currentGame);
  }
}

function getScorecardText(game: Golfnado) {
  let message = "`";

  let headerRow = "";
  for (let holeNum = 0; holeNum < game.holes.length; holeNum++) {
    headerRow += `${holeNum + 1}   `;
  }
  message += headerRow + "Total   `\n";

  for (let playerNum = 0; playerNum < game.players.length; playerNum++) {
    let playerRow = "`";
    let playerTotal = 0;
    for (let holeNum = 0; holeNum < game.holes.length; holeNum++) {
      playerRow += `${game.holes[holeNum].strokes[playerNum].length}   `;
      playerTotal += game.holes[holeNum].strokes[playerNum].length;
    }
    playerRow += `${playerTotal}   <@${game.players[playerNum].id}>`;
    message += playerRow + "`\n";
  }

  return message;
}

function getTotalScores(game: Golfnado) {
  let message = "`";

  message += "Total   `\n";

  for (let playerNum = 0; playerNum < game.players.length; playerNum++) {
    let playerRow = "`";
    let playerTotal = 0;
    for (let holeNum = 0; holeNum < game.holes.length; holeNum++) {
      playerTotal += game.holes[holeNum].strokes[playerNum].length;
    }
    playerRow += `${playerTotal}   <@${game.players[playerNum].id}>`;
    message += playerRow + "`\n";
  }

  return message;
}

async function scorecard(env, context) {
  const currentGame = await getCurrentGame(env, context);
  if (!currentGame) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> There's no golfnado, book a tee time by typing \`new golfnado\`!`,
    });
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Golfnado not started, to tee off type \`start\``,
    });
    return;
  }

  await context.client.chat.postEphemeral({
    channel: context.channelId,
    user: context.userId,
    text: getScorecardText(currentGame),
  });
}

async function showCourse(env, context) {
  const currentGame = await getCurrentGame(env, context);
  if (!currentGame) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> There's no golfnado, book a tee time by typing \`new golfnado\`!`,
    });
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Golfnado not started, to tee off type \`start\``,
    });
    return;
  }

  await sendDefaultCourseGif(context, currentGame);
}

async function abortGolfnado(env, context) {
  const currentGame = await getCurrentGame(env, context);
  if (!currentGame) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> There's no golfnado, book a tee time by typing \`new golfnado\`!`,
    });
    return;
  }

  await env.GOLFNADO_BUCKET.delete(getKey(context));

  await context.client.chat.postMessage({
    channel: context.channelId,
    text: `<@${context.userId}> aborted the golfnado! To book a new tee time type \`new golfnado\``,
  });
}

function formatStats(stats: GolfnadoStats) {
  let message = "";

  Object.entries(stats).forEach((entry) => {
    message += `\`${entry[0]}: ${entry[1].value} <@${entry[1].playerId}>\`\n`;
  });

  return message;
}

async function showPlayerStats(env, context) {
  const playerStats = await fetchPlayerStats(env, context, context.userId);
  if (!playerStats) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> You have not finished any Golfnados!`,
    });
    return;
  }

  await context.client.chat.postMessage({
    channel: context.channelId,
    text: `<@${context.userId}>'s stats:\n${formatStats(playerStats)}`,
  });
}

async function showAllTimeStats(env, context) {
  const allTimeStats = await fetchAllTimeStats(env, context);
  if (!allTimeStats) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> No Golfnados have been completed in this channel!`,
    });
    return;
  }

  await context.client.chat.postMessage({
    channel: context.channelId,
    text: `All time stats:\n${formatStats(allTimeStats)}`,
  });
}

async function crank(env, context) {
  const currentGame = await getCurrentGame(env, context);
  if (!currentGame) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> There's no golfnado, book a tee time by typing \`new golfnado\`!`,
    });
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Golfnado not started, to tee off type \`start\``,
    });
    return;
  }

  await context.client.chat.postEphemeral({
    channel: context.channelId,
    user: context.userId,
    text: getTotalScores(currentGame),
  });
}

// async function concede(env, context) {
//   const currentGame = await getCurrentGame(env, context);
//   if (!currentGame) {
//     await context.client.chat.postMessage({
//       channel: context.channelId,
//       text: `<@${context.userId}> There's no golfnado, book a tee time by typing \`new golfnado\`!`,
//     });
//     return;
//   }

//   if (currentGame.gameState === GameState.NOT_STARTED) {
//     await context.client.chat.postMessage({
//       channel: context.channelId,
//       text: `<@${context.userId}> Golfnado not started, to tee off type \`start\``,
//     });
//     return;
//   }

//   if (!currentGame.players.find((p) => p.id === context.userId)) {
//     return;
//   }

//   currentGame.concedeHole(context.userId);

//   await upsertGame(env, context, currentGame);
// }

async function reportWind(env, context) {
  const currentGame = await getCurrentGame(env, context);
  if (!currentGame) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> There's no golfnado, book a tee time by typing \`new golfnado\`!`,
    });
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Golfnado not started, to tee off type \`start\``,
    });
    return;
  }

  const hole = currentGame.getCurrentHole();
  if (!hole) {
    return;
  }

  await context.client.chat.postMessage({
    channel: context.channelId,
    text: `<@${context.userId}> ${getWindMessage(currentGame)}`,
  });
}

export async function postSwingMessage(env, context, playerId: string) {
  await context.client.chat.postEphemeral({
    channel: context.channelId,
    user: playerId,
    blocks: [
      {
        type: "input",
        block_id: "swing_input_block",
        element: {
          type: "plain_text_input",
          action_id: "swing_input_action",
          placeholder: {
            type: "plain_text",
            text: "{club} {power} {direction}",
          },
        },
        label: {
          type: "plain_text",
          text: "Swing",
          emoji: false,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Submit",
            },
            action_id: "submit_swing",
          },
        ],
      },
    ],
  });
}

async function showHoleSwings(env, context) {
  const currentGame = await getCurrentGame(env, context);
  if (!currentGame) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> There's no golfnado, book a tee time by typing \`new golfnado\`!`,
    });
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Golfnado not started, to tee off type \`start\``,
    });
    return;
  }

  const playerIndex = currentGame.players.findIndex(
    (p) => p.id === context.userId
  );

  if (playerIndex === -1) {
    return;
  }

  const currentHole = currentGame.getCurrentHole();
  if (currentHole === null) {
    return;
  }

  let strokeMessage = "";

  for (let stroke of currentHole.strokes[playerIndex]) {
    strokeMessage += `\`${Club[stroke.swing.club]} ${stroke.swing.power} ${
      stroke.swing.direction
    }\`\n`;
  }

  await context.client.chat.postEphemeral({
    channel: context.channelId,
    user: context.userId,
    text: strokeMessage,
  });
}

export async function handleMessage(env, context, message: string) {
  try {
    if (message.toLowerCase().startsWith("new golfnado")) {
      await newGame(env, context);
    } else if (message.toLowerCase().startsWith("join")) {
      await join(env, context);
    } else if (message.toLowerCase().startsWith("start")) {
      await startGame(env, context);
    } else if (message.toLowerCase().startsWith("swing")) {
      await swing(env, context, message);
    } else if (message.toLowerCase().startsWith("rank")) {
      await scorecard(env, context);
    } else if (message.toLowerCase().startsWith("course")) {
      await showCourse(env, context);
    } else if (message.toLowerCase().startsWith("abort golfnado")) {
      await abortGolfnado(env, context);
    } else if (message.toLowerCase().startsWith("my stats")) {
      await showPlayerStats(env, context);
    } else if (message.toLowerCase().startsWith("stats")) {
      await showAllTimeStats(env, context);
    } else if (message.toLowerCase().startsWith("crank")) {
      await crank(env, context);
    } else if (message.toLowerCase().startsWith("wind")) {
      await reportWind(env, context);
    } else if (message.toLowerCase().startsWith("my swings")) {
      await showHoleSwings(env, context);
    }
    // else if (message.toLowerCase().startsWith("concede")) {
    //   await concede(env, context);
    // }
  } catch (error) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `Unexpected error ${error}`,
    });
    throw error;
  }
}