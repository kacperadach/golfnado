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
      // When the pattern matches, the framework automatically acknowledges the request
      // .event("app_mention", async ({ context }) => {
      //   // You can do any time-consuming tasks here!
      //   await context.client.chat.postMessage({
      //     channel: context.channelId,
      //     text: `:wave: <@${context.userId}> what's up?`,
      //     blocks: [
      //       {
      //         type: "section",
      //         text: {
      //           type: "mrkdwn",
      //           text: `:wave: <@${context.userId}> what's up?`,
      //         },
      //         accessory: {
      //           type: "button",
      //           text: { type: "plain_text", text: "Click Me" },
      //           value: "click_me_123",
      //           action_id: "button-action",
      //         },
      //       },
      //       {
      //         type: "context",
      //         elements: [
      //           {
      //             type: "plain_text",
      //             text: "This message is posted by an app running on Cloudflare Workers",
      //           },
      //         ],
      //       },
      //     ],
      //   });
      // })
      // .message("Hello", async ({ context }) => {
      //   await context.say({ text: "Hey!" });
      // })
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
    // .action(
    //   "button-action",
    //   async () => {}, // Mus complete this within 3 seconds
    //   async ({ context }) => {
    //     // You can do any time-consuming tasks here!
    //     const { respond } = context;
    //     if (respond) {
    //       await respond({ text: "Now working on it ..." });
    //       await respond({ text: "It's done :white_check_mark:" });
    //     }
    //   }
    // )
    // .command(
    //   "/hello-cf-workers",
    //   async () => "Thanks!", // Must complete this within 3 seconds
    //   async ({ context }) => {
    //     // You can do any time-consuming tasks here!
    //     await context.respond({ text: "What's up?" });
    //   }
    // )
    // .shortcut(
    //   "hey-cf-workers",
    //   async () => {}, // Must complete this within 3 seconds
    //   async ({ context, payload }) => {
    //     // You can do any time-consuming tasks here!
    //     await context.client.views.open({
    //       // The trigger_id needs to be used within 3 seconds
    //       trigger_id: payload.trigger_id,
    //       view: {
    //         type: "modal",
    //         callback_id: "modal",
    //         title: { type: "plain_text", text: "My App" },
    //         submit: { type: "plain_text", text: "Submit" },
    //         close: { type: "plain_text", text: "Cancel" },
    //         blocks: [],
    //       },
    //     });
    //   }
    // )
    // .viewSubmission(
    //   "modal",
    //   // Must respond within 3 seconds to update/close the opening modal
    //   async () => {
    //     return { response_action: "clear" };
    //   },
    //   async (req) => {
    //     // Except updating the modal view using response_action,
    //     // you can asynchronously do any tasks here!
    //   }
    // );
    return await app.run(request, ctx);
  },
};
