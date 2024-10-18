import { Golfnado, GameState, Stroke, Swing, Club, Hole, Player } from "./game";
import { Course, Ground, MAX_WIND, Point2D } from "./course";
import { BallPositionAndColor, createSwingGifBuffer } from "./gifbuffer";
import {
  gatherPlayerStats,
  gatherBestStats,
  mergeStats,
  GolfnadoStats,
} from "./stats";
import { ChatPostMessageRequest } from "slack-cloudflare-workers";

const SPECIAL_WORKSPACE_ID = "TDUQJ4MMY";
const GOLFNADO_3D_DOMAIN = "golfnado.xyz";
const GOLFNADO_3D_DOMAIN_PAGES = "golfnado3d.pages.dev";
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

    const existingStats = await fetchPlayerStats(env, context, player.id);

    if (existingStats) {
      playerStats = mergeStats(existingStats, playerStats);
    }

    allPlayerStats.push(playerStats);

    await upsertPlayerStats(env, context, player.id, playerStats);
  }

  let gameStats = gatherBestStats(allPlayerStats);
  const allTimeStats = await fetchAllTimeStats(env, context);
  if (allTimeStats) {
    const allTimeAvgStrokesPlayer = allTimeStats.averageStrokes.playerId;

    if (gameStats.averageStrokes.playerId === allTimeAvgStrokesPlayer) {
      allTimeStats.averageStrokes.value = gameStats.averageStrokes.playerId;
    }

    gameStats = gatherBestStats([allTimeStats, gameStats]);
  }
  upsertAllTimeStats(env, context, gameStats);

  const archiveKey = getArchivedKey(context);

  await env.GOLFNADO_BUCKET.put(
    archiveKey,
    JSON.stringify(currentGame.toJSON()),
    {
      httpMetadata: {
        contentType: "application/json",
      },
    }
  );

  await env.GOLFNADO_BUCKET.delete(getKey(context));
  return archiveKey;
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

async function sendAnimatedCourseGif(
  context,
  course: Course,
  stroke: Stroke,
  playerColor: string,
  otherBallPositions: BallPositionAndColor[]
) {
  if (true) {
    return;
  }

  await sendCourseGif(context, course, stroke, playerColor, otherBallPositions);
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
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "New Golfnado! :golfer: :golf:",
        },
      },
      {
        type: "section",
        text: {
          text: `<@${context.userId}> has started a new golfnado!`,
          type: "mrkdwn",
        },
      },
      {
        type: "divider",
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Join Tee Time!",
            },
            action_id: "join_game",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Start Game!",
            },
            style: "primary",
            action_id: "start_game",
          },
        ],
      },
    ],
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
    let messageText = `<@${context.userId}> You already joined the Golfnado!`;

    if (currentGame.gameState === GameState.NOT_STARTED) {
      messageText += ` Tee off by typing \`start\``;
    }

    await context.client.chat.postMessage({
      channel: context.channelId,
      text: messageText,
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

  await context.client.chat.postMessage({
    channel: context.channelId,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Game started! :golfer: :golf:",
        },
      },
      {
        type: "section",
        text: {
          text: `${currentGame.holes.length} holes. ${currentGame.maxStrokes} swing max per hole. Good luck!`,
          type: "mrkdwn",
        },
      },
      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          text: `<@${currentGame.players[0].id}><${get3dLink(
            context.teamId,
            context.channelId,
            1,
            1,
            1
          )}|  is up first!>\n ${getWindMessage(currentGame)}`,
          type: "mrkdwn",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Use Private Swing",
            },
            action_id: "request_private_swing",
          },
        ],
      },
    ],
  });
  await sendDefaultCourseGif(context, currentGame);
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
  const windVelocity = game.getCurrentHole().course.wind.velocity;

  const threshold = MAX_WIND / 4;

  let windEmojiNumber;
  let windDescription;
  if (windVelocity <= threshold) {
    windDescription = "Gentle Breeze";
    windEmojiNumber = 1;
  } else if (windVelocity <= threshold * 2) {
    windDescription = "Steady Wind";
    windEmojiNumber = 2;
  } else if (windVelocity <= threshold * 3) {
    windDescription = "Strong Gusts";
    windEmojiNumber = 3;
  } else {
    windDescription = "HURRICANE CONDITIONS";
    windEmojiNumber = 4;
  }

  return `Wind: ${":dash:".repeat(
    windEmojiNumber
  )} ${windDescription} ${":dash:".repeat(windEmojiNumber)} ${(
    windVelocity * 125
  ).toFixed(1)}MPH at ${game.getCurrentHole().course.wind.direction} degrees.`;
}

function getDomain(teamId) {
  return teamId === SPECIAL_WORKSPACE_ID
    ? GOLFNADO_3D_DOMAIN_PAGES
    : GOLFNADO_3D_DOMAIN;
}

function get3dLink(
  teamId: string,
  channelId: string,
  hole: number,
  player: number,
  stroke: number
) {
  return `https://${getDomain(
    teamId
  )}/${teamId}/${channelId}?hole=${hole}&player=${player}&stroke=${stroke}`;
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

  const currentHoleIndex = currentGame.getCurrentHoleIndex();
  const currentHole = currentGame.getCurrentHole();
  const currentPlayer = currentGame.getCurrentPlayer();

  if (!currentPlayer || currentPlayer.id !== context.userId) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      // text: `<@${context.userId}> not your turn, it's <@${currentPlayer?.id}>'s turn!`,
      blocks: [
        {
          type: "section",
          text: {
            text: `<@${context.userId}> not your turn, it's <@${currentPlayer?.id}>'s turn!`,
            type: "mrkdwn",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Use Private Swing",
              },
              action_id: "request_private_swing",
            },
          ],
        },
      ],
    });
    return;
  }

  const swing = Golfnado.parseSwing(message);
  if (!swing) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      // text: `<@${context.userId}> Invalid swing, format:\n \`swing {driver|iron|wedge|putter} {power (1-100)} {direction (in degrees)}\``,
      blocks: [
        {
          type: "section",
          text: {
            text: `<@${context.userId}> Invalid swing, format:\n \`swing {driver|iron|wedge|putter} {power (1-100)} {direction (in degrees)}\``,
            type: "mrkdwn",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Use Private Swing",
              },
              action_id: "request_private_swing",
            },
          ],
        },
      ],
    });
    // await postSwingMessage(env, context, context.userId);
    return;
  }

  const strokeResult = currentGame.swing(context.userId, swing);
  if (strokeResult === undefined) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      text: `<@${context.userId}> Swing failed, Kacper sucks at coding"`,
    });
    return;
  }

  await upsertGame(env, context, currentGame);

  let archiveKey;
  if (strokeResult.gameState === GameState.GAME_OVER) {
    archiveKey = await archiveFinishedGame(env, context);
  }

  const currentPlayerIndex = currentGame.players.findIndex(
    (p) => p.id === currentPlayer.id
  );

  const strokeNum = strokeResult.hole.strokes[currentPlayerIndex].length;

  const golfnado3dLink = get3dLink(
    context.teamId,
    context.channelId,
    currentHoleIndex + 1,
    currentPlayerIndex + 1,
    strokeNum
  );

  let nextPlayerId = null;
  let nextPlayerMessage = "";
  if (currentGame.getCurrentPlayer()) {
    const holeIndex = currentGame.getCurrentHoleIndex();

    nextPlayerId = currentGame.getCurrentPlayer().id;

    const nextPlayerIndex = currentGame.getCurrentPlayerIndex(
      currentGame.getCurrentHole(),
      currentGame.holePlayerOrder[holeIndex]
    );

    const nextPlayerStrokes =
      currentGame.getCurrentHole().strokes[nextPlayerIndex].length;

    nextPlayerMessage += `<@${nextPlayerId}> is up next at ${nextPlayerStrokes} strokes! `;

    if (nextPlayerStrokes > 0) {
      nextPlayerMessage += `<${get3dLink(
        context.teamId,
        context.channelId,
        holeIndex + 1,
        nextPlayerIndex + 1,
        nextPlayerStrokes
      )}|Previous Swing.> `;
    }

    nextPlayerMessage += `\n\n${getWindMessage(currentGame)}`;

    await sendDefaultCourseGif(context, currentGame);
    // await sendCourseGif(
    //   context,
    //   strokeResult.hole.course,
    //   null,
    //   "",
    //   getBallPositionsAndColors(strokeResult.hole, currentGame.players, null)
    // );
  }

  const blocks: any[] = [
    {
      type: "section",
      text: {
        text: `<@${context.userId}> <${golfnado3dLink}|Ball landed in ${
          Ground[strokeResult.endGround]
        }.>`,
        type: "mrkdwn",
      },
    },
  ];

  if (nextPlayerMessage) {
    blocks.push({
      type: "section",
      text: {
        text: `${nextPlayerMessage}`,
        type: "mrkdwn",
      },
    });
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Use Private Swing",
          },
          action_id: "request_private_swing",
        },
      ],
    });
  }

  await context.client.chat.postMessage({
    channel: context.channelId,
    blocks,
  });

  // if (nextPlayerId) {
  //   await postSwingMessage(env, context, nextPlayerId);
  // }

  // const ballPositionsAndColors: BallPositionAndColor[] =
  //   getBallPositionsAndColors(
  //     currentHole,
  //     currentGame.players,
  //     currentPlayer.id
  //   );

  // await sendAnimatedCourseGif(
  //   context,
  //   strokeResult.hole.course,
  //   strokeResult.stroke,
  //   currentPlayer.color,
  //   ballPositionsAndColors
  // );

  if (currentGame.getCurrentHoleIndex() === null) {
    await context.client.chat.postMessage({
      channel: context.channelId,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "Game over :trophy:",
          },
        },
        {
          type: "section",
          text: {
            text: getScorecardText(currentGame),
            type: "mrkdwn",
          },
        },
        {
          type: "section",
          text: {
            text: `<https://${
              getDomain(context.teamId) + archiveKey.replace(KEY_BASE, "")
            }|View finished game here.>`,
            type: "mrkdwn",
          },
        },
        {
          type: "divider",
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Golfnado is free. If you’ve enjoyed it, please consider supporting development and hosting. :green_heart: Thank you! :green_heart:",
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Donate to support Golfnado",
            },
            url: "https://buymeacoffee.com/kacperadach",
            style: "primary",
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "New Game!",
              },
              style: "primary",
              action_id: "new_game",
            },
          ],
        },
      ],
    });
  } else if (currentGame.getCurrentHoleIndex() !== currentHoleIndex) {
    // const currentHole = currentGame.holes[currentGame.getCurrentHoleIndex()];
    // await sendDefaultCourseGif(context, currentGame);
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
      const hole = game.holes[holeNum];

      const strokes = game.holes[holeNum].strokes[playerNum];

      const holeStared = hole.strokes.find((s) => s.length > 0);

      let holeFinished = !holeStared;
      if (strokes.length > 0) {
        holeFinished =
          hole.course.isPointInHole(strokes[strokes.length - 1].end) ||
          strokes.length >= game.maxStrokes;
      }

      playerRow += `${strokes.length}${holeFinished ? " " : "*"}  `;
      playerTotal += strokes.length;
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
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<@${context.userId}> There's no golfnado being played!`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "New Game!",
              },
              style: "primary",
              action_id: "new_game",
            },
          ],
        },
      ],
    });
    return;
  }

  await env.GOLFNADO_BUCKET.delete(getKey(context));

  await context.client.chat.postMessage({
    channel: context.channelId,
    // text: `<@${context.userId}> aborted the golfnado! To book a new tee time type \`new golfnado\``,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Golfnado Aborted! :x:",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "New Game!",
            },
            style: "primary",
            action_id: "new_game",
          },
        ],
      },
    ],
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

export async function postHelpMessage(context) {
  await context.client.chat.postMessage({
    channel: context.channelId,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Welcome to Golfnado :golfer: :golf:",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: "A Free Slack-based 3D golf game",
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Play golf with your friends in slack. Start a new game and type to swing. Watch your swing on the official <${GOLFNADO_3D_DOMAIN}|golfnado website.>`,
        },
      },
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [
              {
                type: "text",
                text: "Swing by choosing a club, power and direction. Available clubs are:",
              },
            ],
          },
          {
            type: "rich_text_list",
            elements: [
              {
                type: "rich_text_section",
                elements: [
                  {
                    type: "text",
                    text: "Driver",
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: "text",
                    text: " - highest power but low accuracy, best to use from the Tee Box.",
                  },
                ],
              },
              {
                type: "rich_text_section",
                elements: [
                  {
                    type: "text",
                    text: "Iron",
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: "text",
                    text: " - medium power and accuracy, best to use from Fairway or Rough.",
                  },
                ],
              },
              {
                type: "rich_text_section",
                elements: [
                  {
                    type: "text",
                    text: "Wedge",
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: "text",
                    text: " - low power, high accuracy and high loft, best to use from Sand or short distances.",
                  },
                ],
              },
              {
                type: "rich_text_section",
                elements: [
                  {
                    type: "text",
                    text: "Putter",
                    style: {
                      bold: true,
                    },
                  },
                  {
                    type: "text",
                    text: " - low power, high accuracy and no loft, best to use on the Green.",
                  },
                ],
              },
            ],
            style: "bullet",
            indent: 0,
            border: 1,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `\nPower is a number between 1-100 and direction is in degrees with 0 being straight ahead.`,
        },
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `Try to stay on the course and out of water, sand or rough. Just like in real golf, lowest score wins!`,
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "New Game!",
            },
            style: "primary",
            action_id: "new_game",
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Show all commands",
            },
            action_id: "show_all_commands",
          },
        ],
      },
    ],
  } as ChatPostMessageRequest);
}

const COMMANDS = [
  ["new golfnado", "Create a new game."],
  ["join", "Join a newly created game."],
  ["start", "Start the newly created game."],
  ["swing", "When it's your turn, swing at the ball."],
  ["my swings", "Show all of your swings for the current hole"],
  ["wind", "Show the wind on the current hole."],
  ["rank", "Show current scorecard by hole."],
  ["my stats", "Show your stats in this channel."],
  ["stats", "Show all players best stats in this channel"],
  ["abort golfnado", "End the current game"],
];

async function showCommands(env, context) {
  const allCommands = [];
  COMMANDS.forEach((command) => {
    allCommands.push({
      type: "rich_text_section",
      elements: [
        {
          type: "text",
          text: `${command[0]}`,
          style: {
            bold: true,
          },
        },
        {
          type: "text",
          text: ` - ${command[1]}\n`,
        },
      ],
    });
  });

  await context.client.chat.postMessage({
    channel: context.channelId,
    blocks: [
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [
              {
                type: "text",
                text: "Available Golfnado Commands:",
              },
            ],
          },
          {
            type: "rich_text_list",
            elements: allCommands,
            style: "bullet",
            indent: 0,
            border: 1,
          },
          {
            type: "rich_text_section",
            elements: [
              {
                type: "text",
                text: "\nSimply type any of the commands into the channel chat.",
              },
            ],
          },
        ],
      },
    ],
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
    } else if (message.toLocaleLowerCase().startsWith("help")) {
      await showCommands(env, context);
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
