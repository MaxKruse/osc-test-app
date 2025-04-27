import { ApiClient } from "@twurple/api";
import { RefreshingAuthProvider } from "@twurple/auth";

export function getApiClient(authProvider: RefreshingAuthProvider): ApiClient {
  return new ApiClient({ authProvider });
}
