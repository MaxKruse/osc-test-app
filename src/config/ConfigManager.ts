import {
  readFileSync,
  existsSync,
  writeFileSync,
  promises as fsPromises,
} from "fs";
import { resolve } from "path";
import { EventEmitter } from "events";
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
  osc:
    | {
        type?: "set";
        address: string;
        value: number | boolean | string;
      }
    | {
        type: "toggle";
        address: string;
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

export class ConfigManager extends EventEmitter {
  private config: IAppConfig;
  private configPath: string;

  constructor() {
    super();
    this.configPath = resolve("./config/config.json");
    if (!existsSync(this.configPath)) {
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
              type: "set",
              address: "/avatar/parameters/BlackHair",
              value: 0,
            },
            timeout: {
              delayMs: 5000,
              value: 1,
            },
          },
          {
            reward: {
              title: "*Toggle Example*",
            },
            osc: {
              type: "toggle",
              address: "/avatar/parameters/ToggleExample",
            },
          },
        ],
      };
      writeFileSync(
        this.configPath,
        JSON.stringify(defaultConfig, null, 2),
        "utf-8"
      );
      console.warn(
        "WARN: Configuration file not found at ./config/config.json. An example configuration file has been created. Please edit it with your details and restart the application."
      );
      process.exit(1);
    }
    try {
      const rawData = readFileSync(this.configPath, "utf-8");
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

      // Determine osc type, default to "set"
      const oscType = mapping.osc.type ?? "set";

      if (oscType === "toggle") {
        // Validate timer presence with type assertion
        const oscToggle = mapping.osc as {
          type: "toggle";
          address: string;
        };

        const entry: RewardMapEntry = {
          reward: matchedReward,
          osc: {
            type: "toggle",
            address: oscToggle.address,
          },
        };

        // No timeout for toggle type
        mappedEntries.push(entry);
      } else {
        // Default to "set" type with type assertion
        const oscSet = mapping.osc as {
          type?: "set";
          address: string;
          value?: string | number | boolean;
        };
        if (oscSet.value === undefined) {
          console.warn(
            `Invalid set OSC config for reward '${mapping.reward.title}': missing 'value'. Skipping.`
          );
          continue;
        }

        const entry: RewardMapEntry = {
          reward: matchedReward,
          osc: {
            type: "set",
            address: oscSet.address,
            value: oscSet.value,
          },
        };

        if (mapping.timeout) {
          entry.timeout = {
            delayMs: mapping.timeout.delayMs,
          };
        }

        mappedEntries.push(entry);
      }
    }

    return mappedEntries;
  }

  public getFullConfig(): IAppConfig {
    return this.config;
  }

  public async reloadConfig(): Promise<void> {
    try {
      const fileContent = await fsPromises.readFile(this.configPath, "utf-8");
      const parsedConfig = JSON.parse(fileContent);
      this.config = parsedConfig as IAppConfig;
      this.emit("config_updated", this.config);
    } catch (error) {
      console.error("Failed to reload config:", error);
      this.emit("config_error", error);
    }
  }
}
