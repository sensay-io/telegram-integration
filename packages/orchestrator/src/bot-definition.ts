export type BotID = string;
export type BotToken = string;

// Must be serializable to path through env vars
export type BotDefinition = {
  id: BotID;
  token: BotToken;
  replicaUUID: string;
};
