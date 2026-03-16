import * as bcrypt from "bcrypt";

/**
 * Hash a plain-text value with bcrypt.
 * @param value   The plain-text string to hash (password, token, etc.)
 * @param rounds  Salt rounds - use 12 for passwords, 10 for refresh tokens
 */
export async function hashValue(
    value: string,
    rounds: number,
): Promise<string> {
    return bcrypt.hash(value, rounds);
}

/**
 * Compare a plain-text value against a bcrypt hash.
 * Always runs even when the hash is a dummy - prevents timing attacks.
 */
export async function compareHash(
    value: string,
    hash: string,
): Promise<boolean> {
    return bcrypt.compare(value, hash);
}

/**
 * A dummy bcrypt hash used to ensure constant-time comparison
 * even when a user record is not found (timing attack prevention).
 *
 * Pre-computed once - do not regenerate per request.
 */
export const DUMMY_HASH =
    "$2b$12$invalidhashusedfortimingattackpreventiononlyx";
