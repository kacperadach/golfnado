import { Golfnado, GameState, Stroke, Club, Hole, Player } from "./game";
import { Course, Ground, MAX_WIND } from "./course";
import {
  BallPositionAndColor,
  createSwingGifBuffer,
  createCoursePngBuffer,
} from "./gifbuffer";
import { GolfnadoStats } from "./stats";
import {
  archiveFinishedGame,
  deleteGame,
  fetchAllTimeStats,
  fetchPlayerStats,
  getCurrentGame,
  upsertGame,
} from "./r2";
import { Messager } from "./messager";
import {
  getDomain,
  GOLFNADO_3D_DOMAIN,
  GOLFNADO_3D_DOMAIN_PAGES,
  KEY_BASE,
  SPECIAL_WORKSPACE_ID,
} from "./constants";

async function sendDefaultCourseGif(
  env,
  messager: Messager,
  currentGame: Golfnado
) {
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

  const currentHole = currentGame.getCurrentHole();

  await sendCourseGif(
    env,
    messager,
    currentHole.course,
    null,
    "",
    getBallPositionsAndColors(currentHole, currentGame.players, null)
  );
}

async function sendCourseGif(
  env,
  messager: Messager,
  course: Course,
  stroke: Stroke,
  playerColor: string,
  otherBallPositions: BallPositionAndColor[]
) {
  const gifBuffer = await createCoursePngBuffer(
    course,
    playerColor,
    otherBallPositions
  );

  await messager.sendFile(env, messager.getChannelId(), gifBuffer);
}

async function newGame(env, messager: Messager) {
  const currentGame = await getCurrentGame(
    env,
    messager.getTeamId(),
    messager.getChannelId()
  );
  if (currentGame) {
    if (currentGame.gameState === GameState.NOT_STARTED) {
      await messager.sendMessage(
        messager.getChannelId(),
        `<@${messager.getUserId()}> There's already a golfnado going on! Join the tee time by typing \`join\``
      );
      return;
    } else {
      const currentPlayer = currentGame.getCurrentPlayer();
      await messager.sendMessage(
        messager.getChannelId(),
        `<@${messager.getUserId()}> There's already a golfnado going on! <@${
          currentPlayer.id
        }> has to swing!`
      );
      return;
    }
  }

  const game = Golfnado.newGame(messager.getUserId());
  await upsertGame(env, messager.getTeamId(), messager.getChannelId(), game);

  await messager.sendRichMessage(messager.getChannelId(), [
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
        text: `<@${messager.getUserId()}> has started a new golfnado!`,
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
  ]);
}

async function join(env, messager: Messager) {
  const currentGame = await getCurrentGame(
    env,
    messager.getTeamId(),
    messager.getChannelId()
  );
  if (!currentGame) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> Tee time has not been booked! Start by typing \`new golfnado\``
    );
    return;
  }

  if (currentGame.gameState !== GameState.NOT_STARTED) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> the Golfnado has already started!`
    );
    return;
  }

  if (currentGame.players.find((p) => p.id === messager.getUserId())) {
    let messageText = `<@${messager.getUserId()}> You already joined the Golfnado!`;

    if (currentGame.gameState === GameState.NOT_STARTED) {
      messageText += ` Tee off by typing \`start\``;
    }

    await messager.sendMessage(messager.getChannelId(), messageText);
    return;
  }

  currentGame.addPlayer(messager.getUserId());
  await upsertGame(
    env,
    messager.getTeamId(),
    messager.getChannelId(),
    currentGame
  );

  await messager.sendMessage(
    messager.getChannelId(),
    `<@${messager.getUserId()}> has joined the golfnado! Tee off by typing \`start\``
  );
}

async function startGame(env, messager: Messager) {
  const currentGame = await getCurrentGame(
    env,
    messager.getTeamId(),
    messager.getChannelId()
  );
  if (!currentGame) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> There's no golfnado, book a tee time by typing \`new golfnado\`!`
    );
    return;
  }

  if (currentGame.gameState === GameState.STARTED) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> Golfnado already started! <@${
        currentGame.getCurrentPlayer().id
      }> has to swing!`
    );
    return;
  }

  if (!currentGame.players.find((p) => p.id === messager.getUserId())) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> have not joined the game! Join the tee time by typing \`join\``
    );
    return;
  }

  currentGame.startGame();
  await upsertGame(
    env,
    messager.getTeamId(),
    messager.getChannelId(),
    currentGame
  );

  await messager.sendRichMessage(messager.getChannelId(), [
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
          messager.getTeamId(),
          messager.getChannelId(),
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
  ]);

  await sendDefaultCourseGif(env, messager, currentGame);
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

async function swing(env, messager: Messager, message: string) {
  const currentGame = await getCurrentGame(
    env,
    messager.getTeamId(),
    messager.getChannelId()
  );
  if (!currentGame) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> There's no golfnado, book a tee time by typing \`new golfnado\`!`
    );
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> Golfnado not started, to tee off type \`start\``
    );
    return;
  } else if (currentGame.gameState === GameState.GAME_OVER) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> Golfnado is over, to play agin type \`new golfnado\``
    );
    return;
  }

  const currentHoleIndex = currentGame.getCurrentHoleIndex();
  const currentHole = currentGame.getCurrentHole();
  const currentPlayer = currentGame.getCurrentPlayer();

  if (!currentPlayer || currentPlayer.id !== messager.getUserId()) {
    await messager.sendRichMessage(messager.getChannelId(), [
      {
        type: "section",
        text: {
          text: `<@${messager.getUserId()}> not your turn, it's <@${
            currentPlayer?.id
          }>'s turn!`,
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
    ]);
    return;
  }

  const swing = Golfnado.parseSwing(message);
  if (!swing) {
    await messager.sendRichMessage(messager.getChannelId(), [
      {
        type: "section",
        text: {
          text: `<@${messager.getUserId()}> Invalid swing, format:\n \`swing {driver|iron|wedge|putter} {power (1-100)} {direction (in degrees)}\``,
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
    ]);
    return;
  }

  const strokeResult = currentGame.swing(messager.getUserId(), swing);
  if (strokeResult === undefined) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> Swing failed, ya boi sucks at coding"`
    );
    return;
  }

  await upsertGame(
    env,
    messager.getTeamId(),
    messager.getChannelId(),
    currentGame
  );

  let archiveKey;
  if (strokeResult.gameState === GameState.GAME_OVER) {
    archiveKey = await archiveFinishedGame(
      env,
      messager.getTeamId(),
      messager.getChannelId()
    );
  }

  const currentPlayerIndex = currentGame.players.findIndex(
    (p) => p.id === currentPlayer.id
  );

  const strokeNum = strokeResult.hole.strokes[currentPlayerIndex].length;

  const golfnado3dLink = get3dLink(
    messager.getTeamId(),
    messager.getChannelId(),
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
        messager.getTeamId(),
        messager.getChannelId(),
        holeIndex + 1,
        nextPlayerIndex + 1,
        nextPlayerStrokes
      )}|Previous Swing.> `;
    }

    nextPlayerMessage += `\n\n${getWindMessage(currentGame)}`;

    await sendDefaultCourseGif(env, messager, currentGame);
  }

  const blocks: any[] = [
    {
      type: "section",
      text: {
        text: `<@${messager.getUserId()}> <${golfnado3dLink}|Ball landed in ${
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

  await messager.sendRichMessage(messager.getChannelId(), blocks);

  if (currentGame.getCurrentHoleIndex() === null) {
    await messager.sendRichMessage(messager.getChannelId(), [
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
            getDomain(messager.getTeamId()) + archiveKey.replace(KEY_BASE, "")
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
    ]);
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
    playerRow += `${playerTotal} ` + "`" + `<@${game.players[playerNum].id}>`;
    message += playerRow + "\n";
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

async function scorecard(env, messager: Messager) {
  const currentGame = await getCurrentGame(
    env,
    messager.getTeamId(),
    messager.getChannelId()
  );
  if (!currentGame) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> There's no golfnado, book a tee time by typing \`new golfnado\`!`
    );
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> Golfnado not started, to tee off type \`start\``
    );
    return;
  }

  if (!currentGame.players.find((p) => p.id === messager.getUserId())) {
    return;
  }

  await messager.sendPrivateMessage(
    messager.getChannelId(),
    messager.getUserId(),
    getScorecardText(currentGame)
  );
}

async function showCourse(env, messager: Messager) {
  const currentGame = await getCurrentGame(
    env,
    messager.getTeamId(),
    messager.getChannelId()
  );
  if (!currentGame) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> There's no golfnado, book a tee time by typing \`new golfnado\`!`
    );
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> Golfnado not started, to tee off type \`start\``
    );
    return;
  }

  await sendDefaultCourseGif(env, messager, currentGame);
}

async function abortGolfnado(env, messager: Messager) {
  const currentGame = await getCurrentGame(
    env,
    messager.getTeamId(),
    messager.getChannelId()
  );
  if (!currentGame) {
    await messager.sendRichMessage(messager.getChannelId(), [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `<@${messager.getUserId()}> There's no golfnado being played!`,
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
    ]);

    return;
  }

  await deleteGame(env, messager.getTeamId(), messager.getChannelId());

  await messager.sendRichMessage(messager.getChannelId(), [
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
  ]);
}

function formatStats(stats: GolfnadoStats) {
  let message = "";

  Object.entries(stats).forEach((entry) => {
    message += `\`${entry[0]}: ${entry[1].value} <@${entry[1].playerId}>\`\n`;
  });

  return message;
}

async function showPlayerStats(env, messager: Messager) {
  const playerStats = await fetchPlayerStats(
    env,
    messager.getTeamId(),
    messager.getChannelId(),
    messager.getUserId()
  );
  if (!playerStats) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> You have not finished any Golfnados!`
    );
    return;
  }

  await messager.sendMessage(
    messager.getChannelId(),
    `<@${messager.getUserId()}>'s stats:\n${formatStats(playerStats)}`
  );
}

async function showAllTimeStats(env, messager: Messager) {
  const allTimeStats = await fetchAllTimeStats(
    env,
    messager.getTeamId(),
    messager.getChannelId()
  );
  if (!allTimeStats) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> No Golfnado's have been completed in this channel!`
    );
    return;
  }

  await messager.sendMessage(
    messager.getChannelId(),
    `All time stats:\n${formatStats(allTimeStats)}`
  );
}

async function crank(env, messager: Messager) {
  const currentGame = await getCurrentGame(
    env,
    messager.getTeamId(),
    messager.getChannelId()
  );
  if (!currentGame) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> There's no golfnado, book a tee time by typing \`new golfnado\`!`
    );
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> Golfnado not started, to tee off type \`start\``
    );
    return;
  }

  await messager.sendPrivateMessage(
    messager.getChannelId(),
    messager.getUserId(),
    getTotalScores(currentGame)
  );
}

async function reportWind(env, messager: Messager) {
  const currentGame = await getCurrentGame(
    env,
    messager.getTeamId(),
    messager.getChannelId()
  );
  if (!currentGame) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> There's no golfnado, book a tee time by typing \`new golfnado\`!`
    );
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> Golfnado not started, to tee off type \`start\``
    );
    return;
  }

  const hole = currentGame.getCurrentHole();
  if (!hole) {
    return;
  }

  await messager.sendMessage(
    messager.getChannelId(),
    `<@${messager.getUserId()}> ${getWindMessage(currentGame)}`
  );
}

export async function postSwingMessage(messager: Messager, playerId: string) {
  await messager.sendPrivateRichMessage(messager.getChannelId(), playerId, [
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
  ]);
}

async function showHoleSwings(env, messager: Messager) {
  const currentGame = await getCurrentGame(
    env,
    messager.getTeamId(),
    messager.getChannelId()
  );
  if (!currentGame) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> There's no golfnado, book a tee time by typing \`new golfnado\`!`
    );
    return;
  }

  if (currentGame.gameState === GameState.NOT_STARTED) {
    await messager.sendMessage(
      messager.getChannelId(),
      `<@${messager.getUserId()}> Golfnado not started, to tee off type \`start\``
    );
    return;
  }

  const playerIndex = currentGame.players.findIndex(
    (p) => p.id === messager.getUserId()
  );

  if (playerIndex == -1) {
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

  await messager.sendPrivateMessage(
    messager.getChannelId(),
    messager.getUserId(),
    strokeMessage
  );
}

export async function postHelpMessage(messager: Messager) {
  await messager.sendRichMessage(messager.getChannelId(), [
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
  ]);
}

async function showCommands(messager: Messager) {
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

  await messager.sendRichMessage(messager.getChannelId(), [
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
  ]);
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

export async function handleMessage(env, messager: Messager, message: string) {
  try {
    if (message.toLowerCase().startsWith("new golfnado")) {
      await newGame(env, messager);
    } else if (message.toLowerCase().startsWith("join")) {
      await join(env, messager);
    } else if (message.toLowerCase().startsWith("start")) {
      await startGame(env, messager);
    } else if (message.toLowerCase().startsWith("swing")) {
      await swing(env, messager, message);
    } else if (message.toLowerCase().startsWith("rank")) {
      await scorecard(env, messager);
    } else if (message.toLowerCase().startsWith("course")) {
      await showCourse(env, messager);
    } else if (message.toLowerCase().startsWith("abort golfnado")) {
      await abortGolfnado(env, messager);
    } else if (message.toLowerCase().startsWith("my stats")) {
      await showPlayerStats(env, messager);
    } else if (message.toLowerCase().startsWith("stats")) {
      await showAllTimeStats(env, messager);
    } else if (message.toLowerCase().startsWith("crank")) {
      await crank(env, messager);
    } else if (message.toLowerCase().startsWith("wind")) {
      await reportWind(env, messager);
    } else if (message.toLowerCase().startsWith("my swings")) {
      await showHoleSwings(env, messager);
    } else if (message.toLocaleLowerCase().startsWith("help")) {
      await showCommands(messager);
    }
  } catch (error) {
    await messager.sendMessage(
      messager.getChannelId(),
      `Unexpected error ${error}`
    );
    // throw error;
  }
}
