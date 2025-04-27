import { EventSubWsListener } from "@twurple/eventsub-ws";
import { ApiClient } from "@twurple/api";
import { OscClient } from "../osc/OscClient.js";

export interface RewardMapEntry {
  reward: any; // TODO: Replace with actual Twitch Reward type
  osc: {
    address: string;
    value: number | boolean | string;
  };
  timeout?: {
    delayMs: number;
    value: number | boolean | string;
  };
}

export class TwitchEventSubListener {
  private apiClient: ApiClient;
  private oscClient: OscClient;
  private broadcasterUserId: string;
  private rewardMap: RewardMapEntry[];
  private listener: EventSubWsListener | null = null;

  constructor(
    apiClient: ApiClient,
    oscClient: OscClient,
    broadcasterUserId: string,
    rewardMap: RewardMapEntry[]
  ) {
    this.apiClient = apiClient;
    this.oscClient = oscClient;
    this.broadcasterUserId = broadcasterUserId;
    this.rewardMap = rewardMap;
  }

  public async start(): Promise<void> {
    if (this.listener) {
      console.warn("TwitchEventSubListener is already started.");
      return;
    }

    try {
      this.listener = new EventSubWsListener({ apiClient: this.apiClient });
      await this.listener.start();

      this.listener.onChannelRedemptionAdd(
        this.broadcasterUserId,
        async (event: any) => {
          try {
            const rewardId = event.rewardId;
            const match = this.rewardMap.find(
              (entry) => entry.reward.id === rewardId
            );

            if (match) {
              const { address, value } = match.osc;
              await this.oscClient.send(address, value);
              console.info(
                `OSC message sent for reward redemption: reward=${
                  match.reward.title
                }, address=${address}, value=${JSON.stringify(value)}`
              );

              console.log("Has timeout? ", JSON.stringify(match.timeout));

              if (match.timeout !== undefined) {
                setTimeout(async () => {
                  await this.oscClient.send(address, match.timeout!.value);
                  console.info(
                    `OSC message sent for reward redemption: reward=${
                      match.reward.title
                    }, address=${address}, value=${JSON.stringify(
                      match.timeout!.value
                    )}`
                  );
                }, match.timeout.delayMs);
              }
            } else {
              console.debug(
                `Reward redemption received with unconfigured rewardId: ${rewardId}`
              );
            }
          } catch (err) {
            console.error("Error handling reward redemption event:", err);
          }
        }
      );

      console.info(
        "TwitchEventSubListener started and listening for reward redemptions."
      );
    } catch (err) {
      console.error("Failed to start TwitchEventSubListener:", err);
      throw err;
    }
  }

  public async stop(): Promise<void> {
    if (this.listener) {
      try {
        await this.listener.stop();
        this.listener = null;
        console.info("TwitchEventSubListener stopped.");
      } catch (err) {
        console.error("Error stopping TwitchEventSubListener:", err);
      }
    }
  }
}
