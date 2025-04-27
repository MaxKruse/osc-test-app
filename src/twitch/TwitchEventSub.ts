import { EventSubWsListener } from "@twurple/eventsub-ws";
import { ApiClient } from "@twurple/api";
import { OscClient } from "../osc/OscClient.js";

export type RewardMapEntry = {
  rewardId: string;
  osc: {
    address: string;
    type: string;
    value: any;
  };
};

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
              (entry) => entry.rewardId === rewardId
            );

            if (match) {
              const { address, type, value } = match.osc;
              await this.oscClient.send(address, type, value);
              console.info(
                `OSC message sent for reward redemption: rewardId=${rewardId}, address=${address}, type=${type}, value=${JSON.stringify(
                  value
                )}`
              );
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
