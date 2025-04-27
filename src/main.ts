// Example integration of OSC and Twitch modules

import { OscClient } from "./osc/OscClient.js";
import { getAuthProvider } from "./twitch/TwitchAuth.js";
import { getApiClient } from "./twitch/TwitchApi.js";
import {
  RewardMapEntry,
  TwitchEventSubListener,
} from "./twitch/TwitchEventSub.js";
import { getUserIdByUsername } from "./twitch/UserLookup.js";
// Removed unused imports related to dynamic reward mapping
import { ConfigManager } from "./config/ConfigManager.js";
import { discoverAvatarParameters, FlatEntry } from "./osc/OscQuery.js";
import { getChannelPointRewards } from "./twitch/ChannelRewards.js";
import { writeFileSync } from "fs";

// Main async function to run the example
async function main() {
  try {
    // Instantiate ConfigManager and get configs
    const configManager = new ConfigManager();
    const twitchConfig = configManager.getTwitchConfig();
    const oscConfig = configManager.getOscConfig();

    console.log("Getting auth");
    // Initialize Twitch authentication provider
    const authProvider = await getAuthProvider(
      twitchConfig.clientId,
      twitchConfig.clientSecret,
      twitchConfig.tokenFilePath
    );

    console.log("Getting api");
    // Initialize Twitch API client
    const apiClient = getApiClient(authProvider);

    // Initialize OSC client
    const oscClient = new OscClient(
      oscConfig.serverAddress,
      oscConfig.serverPort
    );

    console.log("Getting channel id");
    // get a twitch channel id
    const twitchChannelId = (await getUserIdByUsername(
      apiClient,
      twitchConfig.channelName
    ))!;

    // osc params
    const params: FlatEntry[] = await discoverAvatarParameters();
    console.log(`Found ${params.length} avatar params`);

    // rewards:
    // Function to update reward mapping dynamically
    async function updateRewardMapping(params: FlatEntry[]) {
      if (
        !apiClient ||
        !twitchChannelId ||
        !configManager ||
        !eventSubListener
      ) {
        console.error(
          "Cannot update reward mapping: dependencies not initialized"
        );
        return;
      }
      console.log("Getting channel rewards");
      const rewards = await getChannelPointRewards(apiClient, twitchChannelId);

      const newRewardMap: RewardMapEntry[] =
        configManager.getRewardMappingConfig(params, rewards);

      eventSubListener.updateMapping(newRewardMap);

      newRewardMap.forEach((p) => {
        console.log(
          `Reward ${p.reward.title} will set ${p.osc.address} as ${
            p.osc.type == "set" ? "set parameter to" + p.osc.value : "toggle"
          }`
        );
      });
    }

    // Initialize Twitch EventSub listener
    console.log("Listening to events");
    const eventSubListener = new TwitchEventSubListener(
      apiClient,
      oscClient,
      twitchChannelId
    );

    // Start listening for events
    await eventSubListener.start();

    // Initial reward mapping after eventSubListener is ready
    await updateRewardMapping(params);

    // Listen for avatar changes and update reward mapping dynamically
    // @ts-ignore: OscClient is EventEmitter-compatible at runtime
    oscClient.onAvatarChange(async (newParams: FlatEntry[]) => {
      console.log("Avatar change detected, updating reward mapping...");
      await updateRewardMapping(newParams);
    });

    console.log("Twitch EventSub listener started. Waiting for events...");
  } catch (error) {
    console.error("Error in main:", error);
  }
}

// Run the main function
main();
