import { Client, Server } from "node-osc";
import * as fs from "fs";

import { OSCQAccess } from "oscquery";

const client = new Client("127.0.0.1", 9000);

import { DiscoveredService, OSCQueryDiscovery } from "oscquery";

interface FlatEntry {
  path: string;
  hasAccess: boolean;
  value: any[]; // the raw array from VALUE
}

function flattenNodes(
  nodes: Record<string, SerializedNode> | undefined
): FlatEntry[] {
  const result: FlatEntry[] = [];

  if (!nodes) return result;

  for (const key of Object.keys(nodes)) {
    const node = nodes[key];

    // If this node holds a VALUE, emit it
    if (node.VALUE !== undefined) {
      result.push({
        path: node.FULL_PATH,
        hasAccess:
          node.ACCESS === OSCQAccess.READONLY ||
          node.ACCESS === OSCQAccess.WRITEONLY ||
          node.ACCESS === OSCQAccess.READWRITE,
        value: node.VALUE,
      });
    }

    // Recurse into any nested CONTENTS
    if (node.CONTENTS) {
      result.push(...flattenNodes(node.CONTENTS));
    }
  }

  return result;
}

const discovery = new OSCQueryDiscovery();
discovery.on("up", (service: DiscoveredService) => {
  const params = service.resolvePath("/avatar/parameters");
  const all = flattenNodes(params?.serialize().CONTENTS).filter(
    (e) => e.hasAccess
  );

  console.log(`Got a total of ${all.length} params`);

  fs.writeFileSync("output.json", JSON.stringify(all, null, 2));
});

discovery.start();
setTimeout(() => {
  discovery.stop();
}, 2000);

// twitch websocket thing

import {
  AppTokenAuthProvider,
  RefreshingAuthProvider,
  StaticAuthProvider,
} from "@twurple/auth";
import { ApiClient } from "@twurple/api";
import { EventSubWsListener } from "@twurple/eventsub-ws";
import { SerializedNode } from "oscquery/dist/lib/serialized_node.js";

const clientId = "jblxly7aztet49984hjw4lyhjc7526";
const clientSecret = "0c4ytiffmtbqx5ebbhov3l7nzq44ja";
const accessToken = "i7qyfptm1nbt30l9jb1oj0sw8on02p";

const authProvider = new StaticAuthProvider(
  "gp762nuuoqcoxypju8c569th9wz7q5",
  accessToken
);
const apiClient = new ApiClient({ authProvider });

// get all redeems
const userId = "67844880";
const redeems = await apiClient.channelPoints.getCustomRewards(userId);
console.log(
  redeems.map((r) => {
    return {
      b: r.title,
    };
  })
);

const listener = new EventSubWsListener({
  apiClient,
});

listener.onStreamOnline(userId, (e) => {
  // setup listening for redeems, e.g. Hydrate!

  listener.onChannelRedemptionUpdate(userId, (data) => {
    if (data.rewardTitle === "Hydrate!") {
      console.log("[onChannelRedemptionUpdate] got hydrate!");
      client.send("/avatar/parameters/Phone", true);
      setTimeout(() => {
        client.send("/avatar/parameters/Phone", false);
      }, 5000);
    } else {
      console.log("Got some weird redeem: ", data.rewardTitle);
    }
  });
});

listener.onChannelRedemptionUpdate(userId, (data) => {
  if (data.rewardTitle === "Hydrate!") {
    console.log("[onChannelRedemptionUpdate] got hydrate!");
    client.send("/avatar/parameters/Phone", true);
    setTimeout(() => {
      client.send("/avatar/parameters/Phone", false);
    }, 5000);
  } else {
    console.log("Got some weird redeem: ", data.rewardTitle);
  }
});

console.log("ready");
listener.start();
