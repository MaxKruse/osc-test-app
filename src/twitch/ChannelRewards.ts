import { ApiClient } from "@twurple/api";

export async function getChannelPointRewards(
  apiClient: ApiClient,
  broadcasterId: string
): Promise<{ title: string; id: string }[]> {
  try {
    const rewards = await apiClient.channelPoints.getCustomRewards(
      broadcasterId
    );
    return rewards.map((reward) => {
      return { title: reward.title, id: reward.id };
    });
  } catch (error) {
    console.error("Failed to fetch channel point rewards:", error);
    return [];
  }
}
