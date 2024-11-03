import { SlackAppContext } from "slack-cloudflare-workers";
import { Messager } from "../core/messager";

export class SlackAdapter implements Messager {
  private context: SlackAppContext;

  constructor(context: SlackAppContext) {
    this.context = context;
  }

  getTeamId() {
    return this.context.teamId;
  }

  getChannelId() {
    return this.context.channelId;
  }

  getUserId() {
    return this.context.userId;
  }

  async sendMessage(channelId: string, text: string) {
    await this.context.client.chat.postMessage({
      channel: channelId,
      text,
    });
  }

  async sendRichMessage(channelId: string, blocks: any[]) {
    await this.context.client.chat.postMessage({
      channel: channelId,
      text: "",
      blocks,
    });
  }

  async sendPrivateMessage(channelId: string, userId: string, text: string) {
    await this.context.client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text,
    });
  }

  async sendPrivateRichMessage(
    channelId: string,
    userId: string,
    blocks: any[]
  ) {
    await this.context.client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: "",
      blocks,
    });
  }

  async sendFile(env, channelId: string, buffer: Buffer) {
    const uploadUrl = await this.context.client.files.getUploadURLExternal({
      // channel: channelId,
      filename: "image.gif",
      length: buffer.byteLength,
    });

    const { upload_url, file_id } = uploadUrl;

    const formData = new FormData();
    formData.append(
      "file",
      new Blob([buffer], { type: "image/gif" }),
      "image.gif"
    );

    await fetch(upload_url, {
      method: "POST",
      body: formData,
    });

    await this.context.client.files.completeUploadExternal({
      channel_id: channelId,
      files: [{ id: file_id, title: "image.gif" }],
    });
  }
}
