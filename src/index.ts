import {
  SlackApp,
  SlackEdgeAppEnv,
  isPostedMessageEvent,
} from "slack-cloudflare-workers";
import { Course } from "./course";
import { handleMessage, postSwingMessage } from "./slack";
import { Golfnado } from "./game";

export default {
  async fetch(
    request: Request,
    env: SlackEdgeAppEnv,
    ctx: ExecutionContext
  ): Promise<Response> {
    const app = new SlackApp({ env })
      .event("message", async ({ payload, context }) => {
        if (!isPostedMessageEvent(payload)) {
          return;
        }

        await handleMessage(env, context, payload.text);
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
            await postSwingMessage(env, context, context.userId);
            await context.respond({
              text: "Invalid Swing",
            });
            return;
          }

          await context.respond({
            text: `Swing valid: ${swingInput}`,
          });

          await handleMessage(env, context, swingMessage);
        }
      );
    return await app.run(request, ctx);
  },
};
