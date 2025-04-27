import { ApiClient } from "@twurple/api";

export async function getUserIdByUsername(
  apiClient: ApiClient,
  username: string
): Promise<string | null> {
  try {
    const user = await apiClient.users.getUserByName(username);
    if (user) {
      return user.id;
    }
    return null;
  } catch (error) {
    console.error("Error fetching user ID for username:", username, error);
    return null;
  }
}
