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

// Placeholder for user-specific configuration
const twitchClientId = "jblxly7aztet49984hjw4lyhjc7526";
const twitchClientSecret = "f41xchnlez64nv18o6rllysrma0dc1";
const tokenFilePath = "./tokens.json"; // Path to store Twitch tokens

const oscServerAddress = "127.0.0.1"; // OSC server IP address
const oscServerPort = 9000; // OSC server port

// Main async function to run the example
async function main() {
  try {
    console.log("Getting auth");
    // Initialize Twitch authentication provider
    const authProvider = await getAuthProvider(
      twitchClientId,
      twitchClientSecret,
      tokenFilePath
    );

    console.log("Getting api");
    // Initialize Twitch API client
    const apiClient = getApiClient(authProvider);

    // Initialize OSC client
    const oscClient = new OscClient(oscServerAddress, oscServerPort);

    console.log("Getting channel id");
    // get a twitch channel id
    const twitchChannelId = (await getUserIdByUsername(
      apiClient,
      "bh_lithium"
    ))!;

    // osc params
    const params = await discoverAvatarParameters();
    console.log(params.length);

    // rewards:
    console.log("Getting channel rewards");
    const rewards = await getChannelPointRewards(apiClient, twitchChannelId);

    const rewardMap: RewardMapEntry[] = params
      .filter((p) => p.path === "/avatar/parameters/Phone")
      .map((p) => {
        return {
          osc: {
            address: p.path,
            type: "b",
            value: 1,
          },
          reward: rewards.filter((r) => r.title.includes("Text-to-Speech"))[0],
        };
      });

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
