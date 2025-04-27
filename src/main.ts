// src/main.ts
// Example integration of OSC and Twitch modules

import { OscClient } from "./osc/OscClient.js";
import { getAuthProvider } from "./twitch/TwitchAuth.js";
import { getApiClient } from "./twitch/TwitchApi.js";
import {
  RewardMapEntry,
  TwitchEventSubListener,
} from "./twitch/TwitchEventSub.js";
import { getUserIdByUsername } from "./twitch/UserLookup.js";
import { getChannelPointRewards } from "./twitch/ChannelRewards.js";
import { discoverAvatarParameters } from "./osc/OscQuery.js";
import { writeFileSync } from "fs";

import { ConfigManager } from "./config/ConfigManager.js";

// Main async function to run the example
async function main() {
  try {
    // Instantiate ConfigManager and get configs
    const configManager = new ConfigManager();
    const twitchConfig = configManager.getTwitchConfig();
    const oscConfig = configManager.getOscConfig();
    const rewardMappingConfig = configManager.getRewardMappingConfig();

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
    const params = await discoverAvatarParameters();
    console.log(`Found ${params.length} avatar params`);

    // rewards:
    console.log("Getting channel rewards");
    const rewards = await getChannelPointRewards(apiClient, twitchChannelId);

    const rewardMap: RewardMapEntry[] = params
      .filter((p) => {
        // Dynamic filter based on config property and value
        const prop = rewardMappingConfig.oscParameterFilter.property;
        const val = rewardMappingConfig.oscParameterFilter.value;
        return (p as any)[prop] === val;
      })
      .map((p) => {
        // Find reward whose title includes configured string
        const titleIncludes = rewardMappingConfig.rewardFilter.titleIncludes;
        const matchedReward = rewards.find((r) =>
          r.title.includes(titleIncludes)
        );
        if (!matchedReward) {
          console.warn(
            `No reward found with title including '${titleIncludes}' for OSC param ${p.path}`
          );
          return null;
        }
        const mappingTemplate = rewardMappingConfig.mappingTemplate;
        const oscEntry: any = {
          address: p.path,
          type: mappingTemplate.oscType,
          value: mappingTemplate.oscValue,
        };
        if (mappingTemplate.timeoutMs !== null) {
          oscEntry.timeoutMs = mappingTemplate.timeoutMs;
          oscEntry.timeoutOscValue = mappingTemplate.timeoutOscValue;
        }
        return {
          osc: oscEntry,
          reward: matchedReward,
        };
      })
      .filter((entry): entry is RewardMapEntry => entry !== null);

    rewardMap.forEach((p) => {
      console.log(
        `Reward ${p.reward.title} will set ${p.osc.address} to ${p.osc.value}`
      );
    });

    // Initialize Twitch EventSub listener
    console.log("Listening to events");
    const eventSubListener = new TwitchEventSubListener(
      apiClient,
      oscClient,
      twitchChannelId,
      rewardMap
    );

    // Start listening for events
    await eventSubListener.start();

    console.log("Twitch EventSub listener started. Waiting for events...");
  } catch (error) {
    console.error("Error in main:", error);
  }
}

// Run the main function
main();
