export interface Messager {
  sendMessage(channelId: string, text: string);
  sendRichMessage(channelId: string, blocks: any[]);
  sendFile(env, channelId: string, buffer: Buffer);
  sendPrivateMessage(channelId: string, userId: string, text: string);
  sendPrivateRichMessage(channelId: string, userId: string, blocks: any[]);

  getTeamId();
  getChannelId();
  getUserId();
}
