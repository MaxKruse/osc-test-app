import { DiscoveredService, OSCQAccess, OSCQueryDiscovery } from "oscquery";
import { SerializedNode } from "oscquery/dist/lib/serialized_node.js";

export interface FlatEntry {
  path: string;
  hasAccess: boolean;
  value: any[]; // the raw array from VALUE
}

/**
 * Discover OSCQuery entries containing avatar parameters.
 * Connects to the OSCQuery service at the specified address and port,
 * retrieves all FlatEntries, filters those with paths including "/avatar/parameters/",
 * and returns them.
 *
 * @param address The IP address or hostname of the OSCQuery service.
 * @param port The port number of the OSCQuery service.
 * @returns Promise resolving to an array of FlatEntry objects containing avatar parameters.
 */
export async function discoverAvatarParameters(): Promise<FlatEntry[]> {
  try {
    const discovery = new OSCQueryDiscovery();
    console.log("Discovering...");

    const resp: Record<string, SerializedNode> | undefined = await new Promise(
      (resolve) => {
        discovery.on("up", (service: DiscoveredService) => {
          resolve(service.nodes.serialize().CONTENTS);
        });

        discovery.start();
      }
    );

    // Flatten the namespace entries into a flat array of entries with full paths
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
              node.ACCESS == OSCQAccess.WRITEONLY ||
              node.ACCESS == OSCQAccess.READWRITE,
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

    const flatEntries = flattenNodes(resp);

    // Filter entries containing "/avatar/parameters/" in their path
    const avatarEntries = flatEntries.filter((entry) =>
      entry.path.includes("/avatar/parameters/")
    );

    return avatarEntries;
  } catch (error) {
    console.error(`Error during OSCQuery discovery:`, error);
    return [];
  }
}
