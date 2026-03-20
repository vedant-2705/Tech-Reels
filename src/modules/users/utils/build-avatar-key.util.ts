import { uuidv7 } from "@common/utils/uuidv7.util";

export const buildAvatarKey = (userId: string, ext: string) => {
    return `avatars/${userId}/${uuidv7()}.${ext}`;
}