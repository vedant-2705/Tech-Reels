/**
 * Builds a shareable URL for a reel based on the application base URL and the reel ID.
 * @param appBaseUrl Application base URL, e.g. "https://app.techreel.io"
 * @param reelId UUID of the reel to be shared
 * @returns Shareable URL for the reel
 */
export const buildReelShareUrl = (appBaseUrl: string, reelId: string) => {
    return `${appBaseUrl}/reels/${reelId}`;
}