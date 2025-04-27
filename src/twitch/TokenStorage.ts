import { writeFile, readFile } from "fs/promises";
import { AccessToken } from "@twurple/auth";

export async function saveTokens(
  filePath: string,
  tokenData: AccessToken
): Promise<void> {
  try {
    const jsonData = JSON.stringify(tokenData);
    await writeFile(filePath, jsonData, "utf-8");
  } catch (error: unknown) {
    console.error(`Error saving tokens to ${filePath}:`, error);
  }
}

export async function loadTokens(
  filePath: string
): Promise<AccessToken | null> {
  try {
    const data = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(data);
    return parsed as AccessToken;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      // File does not exist
      return null;
    } else {
      console.error(`Error loading tokens from ${filePath}:`, error);
      return null;
    }
  }
}
