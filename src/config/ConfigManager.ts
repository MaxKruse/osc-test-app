import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve } from "path";
import { RewardMapEntry } from "../twitch/TwitchEventSub.js";
import { FlatEntry } from "../osc/OscQuery.js";

export interface ITwitchConfig {
  clientId: string;
  clientSecret: string;
  tokenFilePath: string;
  channelName: string;
}

export interface IOscConfig {
  serverAddress: string;
  serverPort: number;
}

export interface IRewardMappingConfigEntry {
  reward: {
    title: string;
    // id?: string; // Keep id optional for now, title is primary
  };
  osc: {
    address: string;
    value: number | boolean | string;
  };
  timeout?: {
    delayMs: number;
    value: number | boolean | string;
  };
}

export interface IAppConfig {
  twitch: ITwitchConfig;
  osc: IOscConfig;
  rewardMapping: IRewardMappingConfigEntry[];
}

export class ConfigManager {
  private config: IAppConfig;

  constructor() {
    const configPath = resolve("./config/config.json");
    if (!existsSync(configPath)) {
      const defaultConfig: IAppConfig = {
        twitch: {
          clientId: "YOUR_TWITCH_CLIENT_ID",
          clientSecret: "YOUR_TWITCH_CLIENT_SECRET",
          tokenFilePath: "./tokens.json",
          channelName: "YOUR_TWITCH_CHANNEL_NAME",
        },
        osc: {
          serverAddress: "127.0.0.1",
          serverPort: 9000,
        },
        rewardMapping: [
          {
            reward: {
              title: "*Hydrate*",
            },
            osc: {
              address: "/avatar/parameters/BlackHair",
              value: 0,
            },
            timeout: {
              delayMs: 5000,
              value: 1,
            },
          },
        ],
      };
      writeFileSync(
        configPath,
        JSON.stringify(defaultConfig, null, 2),
        "utf-8"
      );
      console.warn(
        "WARN: Configuration file not found at ./config/config.json. An example configuration file has been created. Please edit it with your details and restart the application."
      );
      process.exit(1);
    }
    try {
      const rawData = readFileSync(configPath, "utf-8");
      const parsedConfig = JSON.parse(rawData);
      this.config = parsedConfig as IAppConfig;
    } catch (error) {
      console.error(
        "Failed to read or parse config file at ./config/config.json:",
        error
      );
      process.exit(1);
    }
  }

  public getTwitchConfig(): ITwitchConfig {
    return this.config.twitch;
  }

  public getOscConfig(): IOscConfig {
    return this.config.osc;
  }

  public getRewardMappingConfig(
    params: FlatEntry[],
    rewards: {
      title: string;
      id: string;
    }[]
  ): RewardMapEntry[] {
    const configuredMappings = this.config.rewardMapping;

    const mappedEntries: RewardMapEntry[] = [];

    for (const mapping of configuredMappings) {
      const matchedReward = rewards.find((r) =>
        r.title.includes(mapping.reward.title)
      );
      if (!matchedReward) {
        console.warn(
          `Reward title '${mapping.reward.title}' not found in available rewards.`
        );
        continue;
      }

      const matchedParam = params.find((p) => p.path === mapping.osc.address);
      if (!matchedParam) {
        console.warn(
          `OSC address '${mapping.osc.address}' not found in available params.`
        );
        continue;
      }

      const entry: RewardMapEntry = {
        reward: matchedReward,
        osc: {
          address: mapping.osc.address,
          value: mapping.osc.value,
        },
      };

      if (mapping.timeout) {
        entry.timeout = {
          delayMs: mapping.timeout.delayMs,
          value: mapping.timeout.value,
        };
      }

      mappedEntries.push(entry);
    }

    return mappedEntries;
  }

  public getFullConfig(): IAppConfig {
    return this.config;
  }
}
