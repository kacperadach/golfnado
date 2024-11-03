import { KVNamespace } from "@cloudflare/workers-types";
import {
  SlackOAuthApp,
  KVInstallationStore,
  KVStateStore,
  SlackOAuthAndOIDCEnv,
  isPostedMessageEvent,
} from "slack-cloudflare-workers";
import {
  handleMessage,
  postHelpMessage,
  postSwingMessage,
} from "../core/requestHandler";
import { Golfnado } from "../core/game";
import { SlackAdapter } from "./slack";

type Env = SlackOAuthAndOIDCEnv & {
  SLACK_INSTALLATIONS: KVNamespace;
  SLACK_OAUTH_STATES: KVNamespace;
};

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const app = new SlackOAuthApp({
      env,
      installationStore: new KVInstallationStore(env, env.SLACK_INSTALLATIONS),
      stateStore: new KVStateStore(env.SLACK_OAUTH_STATES),
    })
      .event("app_mention", async ({ context }) => {
        await postHelpMessage(new SlackAdapter(context));
      })
      .event("app_home_opened", async ({ payload, context }) => {
        await postHelpMessage(new SlackAdapter(context));
      })
      .event("message", async ({ payload, context }) => {
        if (!isPostedMessageEvent(payload)) {
          return;
        }

        await handleMessage(env, new SlackAdapter(context), payload.text);
      })
      .action(
        "submit_swing",
        async () => {}, // Acknowledge the action within 3 seconds
        async ({ context, payload }) => {
          // Get the user input from the state
          const swingInput =
            payload.state.values["swing_input_block"]["swing_input_action"]
              .value;

          const swingMessage = "swing " + swingInput;

          const swing = Golfnado.parseSwing(swingMessage);

          if (!swing) {
            // invalid input
            await postSwingMessage(new SlackAdapter(context), context.userId);
            await context.respond({
              text: "Invalid Swing",
            });
            return;
          }

          await context.respond({
            text: `Swing valid: ${swingInput}`,
          });

          await handleMessage(env, new SlackAdapter(context), swingMessage);
        }
      )
      .action(
        "join_game",
        async () => {},
        async ({ context, payload }) => {
          await handleMessage(env, new SlackAdapter(context), "join");
        }
      )
      .action(
        "start_game",
        async () => {},
        async ({ context, payload }) => {
          await handleMessage(env, new SlackAdapter(context), "start");
        }
      )
      .action(
        "new_game",
        async () => {},
        async ({ context, payload }) => {
          await handleMessage(env, new SlackAdapter(context), "new golfnado");
        }
      )
      .action(
        "request_private_swing",
        async () => {},
        async ({ context, payload }) => {
          await postSwingMessage(new SlackAdapter(context), context.userId);
        }
      )
      .action(
        "show_all_commands",
        async () => {},
        async ({ context, payload }) => {
          await handleMessage(env, new SlackAdapter(context), "help");
        }
      );
    return await app.run(request, ctx);
  },
};
