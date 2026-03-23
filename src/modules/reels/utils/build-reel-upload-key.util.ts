export const buildReelUploadKey = (userId: string, reelId: string) => {
    return `reels/${userId}/${reelId}/raw.mp4`;
}