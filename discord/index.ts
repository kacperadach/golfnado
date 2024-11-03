/**
 * The core server that runs on a Cloudflare worker.
 */

import { AutoRouter } from "itty-router";
import {
  InteractionResponseType,
  InteractionType,
  verifyKey,
} from "discord-interactions";
import {
  ABORT_GOLFNADO_COMMAND,
  COURSE_COMMAND,
  HELP_COMMAND,
  JOIN_GOLFNADO_COMMAND,
  MY_STATS_COMMAND,
  MY_SWINGS_COMMAND,
  NEW_GOLFNADO_COMMAND,
  RANK_COMMAND,
  START_GOLFNADO_COMMAND,
  STATS_COMMAND,
  SWING_COMMAND,
  WIND_COMMAND,
} from "./commands";
import { DiscordAdapter, convertBlocksToDiscordEmbeds } from "./discord";
import { handleMessage } from "../core/requestHandler";

class JsonResponse extends Response {
  constructor(body, init?) {
    const jsonBody = JSON.stringify(body);
    init = init || {
      headers: {
        "content-type": "application/json;charset=UTF-8",
      },
    };
    super(jsonBody, init);
  }
}

const router = AutoRouter();

/**
 * A simple :wave: hello page to verify the worker is working.
 */
router.get("/", (request, env) => {
  return new Response(`👋 ${env.DISCORD_APPLICATION_ID}`);
});

/**
 * Main route for all requests sent from Discord.  All incoming messages will
 * include a JSON payload described here:
 * https://discord.com/developers/docs/interactions/receiving-and-responding#interaction-object
 */
router.post("/", async (request, env) => {
  const { isValid, interaction } = await server.verifyDiscordRequest(
    request,
    env
  );
  if (!isValid || !interaction) {
    return new Response("Bad request signature.", { status: 401 });
  }

  if (interaction.type === InteractionType.PING) {
    // The `PING` message is used during the initial webhook handshake, and is
    // required to configure the webhook in the developer portal.
    return new JsonResponse({
      type: InteractionResponseType.PONG,
    });
  }

  const guildId = interaction.guild_id;
  const channelId = interaction.channel_id;
  const userId = interaction.member
    ? interaction.member.user.id
    : interaction.user?.id;

  const discordAdapter = new DiscordAdapter(guildId, channelId, userId);

  let matched = true;
  if (interaction.type === InteractionType.APPLICATION_COMMAND) {
    const options = interaction.data.options || [];
    switch (interaction.data.name.toLowerCase()) {
      case NEW_GOLFNADO_COMMAND.name.toLowerCase():
        await handleMessage(env, discordAdapter, "new golfnado");
        break;
      case JOIN_GOLFNADO_COMMAND.name.toLowerCase():
        await handleMessage(env, discordAdapter, "join");
        break;
      case START_GOLFNADO_COMMAND.name.toLowerCase():
        await handleMessage(env, discordAdapter, "start");
        break;
      case ABORT_GOLFNADO_COMMAND.name.toLowerCase():
        await handleMessage(env, discordAdapter, "abort golfnado");
        break;
      case SWING_COMMAND.name.toLowerCase():
        await handleMessage(
          env,
          discordAdapter,
          `swing ${options[0].value} ${options[1].value} ${options[2].value}`
        );
        break;
      case MY_SWINGS_COMMAND.name.toLowerCase():
        await handleMessage(env, discordAdapter, "my swings");
        break;
      case RANK_COMMAND.name.toLowerCase():
        await handleMessage(env, discordAdapter, "rank");
        break;
      case WIND_COMMAND.name.toLowerCase():
        await handleMessage(env, discordAdapter, "wind");
        break;
      case HELP_COMMAND.name.toLowerCase():
        await handleMessage(env, discordAdapter, "help");
        break;
      case MY_STATS_COMMAND.name.toLowerCase():
        await handleMessage(env, discordAdapter, "my stats");
        break;
      case STATS_COMMAND.name.toLowerCase():
        await handleMessage(env, discordAdapter, "stats");
        break;
      case COURSE_COMMAND.name.toLowerCase():
        await handleMessage(env, discordAdapter, "course");
        break;
      default:
        matched = false;
        break;
    }
  } else if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
    const customId = interaction.data.custom_id;
    switch (customId) {
      case "new_game":
        await handleMessage(env, discordAdapter, "new golfnado");
        break;
      case "join_game":
        await handleMessage(env, discordAdapter, "join");
        break;
      case "start_game":
        await handleMessage(env, discordAdapter, "start");
        break;
      default:
        matched = false;
    }
  }

  if (!matched) {
    return new JsonResponse({ error: "Unknown Type" }, { status: 400 });
  }

  let embeds, components;

  if (discordAdapter.blocks && discordAdapter.blocks.length > 0) {
    const discordConvertedBlocks = convertBlocksToDiscordEmbeds(
      discordAdapter.blocks
    );
    embeds = discordConvertedBlocks.embeds;
    components = discordConvertedBlocks.components;
  }

  if (discordAdapter.imageUrl) {
    if (!embeds) {
      embeds = [
        {
          title: "",
          description: "",
          color: 0x00ff00,
          image: {
            url: discordAdapter.imageUrl,
          },
        },
      ];
    } else {
      embeds[0].image = {
        url: discordAdapter.imageUrl,
      };
    }
  }

  const data: any = {};
  if (discordAdapter.message.length > 0) {
    data.content = discordAdapter.message;
  }

  if (embeds && embeds.length > 0) {
    data.embeds = embeds;
  }

  if (components && components.length > 0) {
    data.components = components;
  }

  console.log(data);

  return new JsonResponse({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data,
  });
});
router.all("*", () => new Response("Not Found.", { status: 404 }));

async function verifyDiscordRequest(request, env) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = await request.clone().text();

  const verifiedKey = await verifyKey(
    body,
    signature,
    timestamp,
    env.DISCORD_PUBLIC_KEY
  );
  const isValidRequest = signature && timestamp && verifiedKey;
  if (!isValidRequest) {
    console.log("invalid");
    return { isValid: false };
  }

  console.log("valid");

  return { interaction: JSON.parse(body), isValid: true };
}

const server = {
  verifyDiscordRequest,
  fetch: router.fetch,
};

export default server;
