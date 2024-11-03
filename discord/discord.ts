import { Messager } from "../core/messager";
import { uploadCourseImage } from "../core/r2";

export class DiscordAdapter implements Messager {
  private guildId: string;
  private channelId: string;
  private userId: string;

  public message: string = "";
  public blocks: any[] = [];
  public imageUrl: string;

  constructor(guildId: string, channelId: string, userId: string) {
    this.guildId = guildId;
    this.channelId = channelId;
    this.userId = userId;
  }

  getTeamId() {
    return this.guildId;
  }

  getChannelId() {
    return this.channelId;
  }

  getUserId() {
    return this.userId;
  }

  async sendMessage(channelId: string, text: string) {
    this.message += text.replaceAll(/`([^`]+)`/g, "`/$1`");
  }

  async sendRichMessage(channelId: string, blocks: any[]) {
    this.blocks.push(...blocks);
  }

  async sendPrivateMessage(channelId: string, userId: string, text: string) {
    this.message += text.replaceAll(/`([^`]+)`/g, "`/$1`");
  }

  async sendPrivateRichMessage(
    channelId: string,
    userId: string,
    blocks: any[]
  ) {
    this.blocks.push(...blocks);
  }

  async sendFile(env, channelId: string, buffer: Buffer) {
    this.imageUrl = await uploadCourseImage(
      env,
      this.getTeamId(),
      this.getChannelId(),
      `${Date.now()}.png`,
      buffer
    );
  }
}

export function convertBlocksToDiscordEmbeds(slackBlocks) {
  let discordEmbed = {
    title: "",
    description: "",
    color: 0x00ff00,
  };

  const discordComponents: any[] = [];

  slackBlocks.forEach((block) => {
    if (block.type === "section") {
      // Append section text to the embed description
      discordEmbed.description +=
        convertSlackToDiscordLink(block.text.text) + "\n";

      if (block.accessory) {
        discordComponents.push({
          type: 1, // Action Row
          components: [
            {
              type: 2,
              label: block.accessory.text.text,
              style: 5,
              url: block.accessory.url,
            },
          ],
        });
      }
    } else if (block.type === "rich_text") {
      block.elements.forEach((element) => {
        if (element.type === "rich_text_section") {
          element.elements.forEach((el) => {
            discordEmbed.description += el.text + "\n";
          });
        } else if (element.type === "rich_text_list") {
          element.elements.forEach((el) => {
            el.elements.forEach((e) => {
              if (e.style?.bold) {
                discordEmbed.description += "**/    " + e.text + "**";
              } else {
                discordEmbed.description += e.text;
              }
            });
          });
        }
      });
    } else if (block.type === "actions") {
      const buttons = block.elements
        .filter(
          (element) =>
            element.text &&
            element.text.text &&
            element.text.text.toLowerCase() !== "use private swing"
        )
        .map((element) => {
          return {
            type: 2, // Button type
            label: element.text.text,
            style: element.style === "primary" ? 3 : 2,
            custom_id: element.action_id,
          };
        });

      if (buttons && buttons.length > 0) {
        discordComponents.push({
          type: 1, // Action Row
          components: buttons,
        });
      }

      if (
        block.elements.find(
          (element) =>
            element.text &&
            element.text.text &&
            element.text.text.toLowerCase() === "use private swing"
        )
      ) {
        discordEmbed.description +=
          "\n" + "Use slash command `/swing` to input your stroke." + "\n";
      }
    }
  });

  return {
    embeds: discordEmbed.description ? [discordEmbed] : [],
    components: discordComponents,
  };
}

function convertSlackToDiscordLink(message) {
  // Use a more specific regular expression to match Slack-style links <URL|text>
  const regex = /<((?:https?|ftp):\/\/[^\|>]+)\|([^>]+)>/g;

  // Replace Slack-style links with Discord-style markdown links
  return message.replace(regex, (match, url, text) => {
    return `[${text}](${url})`;
  });
}
