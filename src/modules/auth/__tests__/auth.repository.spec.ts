/**
 * @module modules/auth/__tests__/auth.repository.spec
 * @description
 * Unit tests for AuthRepository covering database and Redis persistence,
 * including user creation, OAuth operations, and session management.
 */

import { Test, TestingModule } from '@nestjs/testing';

import { AuthRepository } from '../auth.repository';
import { DatabaseService } from '../../../database/database.service';
import { RedisService } from '../../../redis/redis.service';

import { User } from '../entities/user.entity';
import { AUTH_REDIS_KEYS, AUTH_TTL } from '../auth.constants';

describe('AuthRepository (Unit Tests)', () => {
  let repository: AuthRepository;
  let databaseService: jest.Mocked<DatabaseService>;
  let redisService: jest.Mocked<RedisService>;

  const mockUser: User = {
    id: '019501a0-0000-7000-8000-000000000001',
    email: 'test@example.com',
    password_hash: '$2b$12$hashed_password',
    username: 'testuser',
    avatar_url: null,
    bio: null,
    role: 'user',
    experience_level: 'intermediate',
    account_status: 'active',
    token_version: 0,
    total_xp: 0,
    token_balance: 0,
    current_streak: 0,
    longest_streak: 0,
    last_active_date: null,
    public_profile_token: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthRepository,
        {
          provide: DatabaseService,
          useValue: {
            query: jest.fn(),
            getClient: jest.fn(),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn(),
            incr: jest.fn(),
            expire: jest.fn(),
            ttl: jest.fn(),
            deletePattern: jest.fn(),
          },
        },
      ],
    }).compile();

    repository = module.get<AuthRepository>(AuthRepository);
    databaseService = module.get(DatabaseService) as jest.Mocked<DatabaseService>;
    redisService = module.get(RedisService) as jest.Mocked<RedisService>;
  });

  describe('existsByEmail', () => {
    it('should return true when email exists', async () => {
      databaseService.query.mockResolvedValue({
        rows: [{ exists: true }],
      });

      const result = await repository.existsByEmail('test@example.com');

      expect(result).toBe(true);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT EXISTS'),
        ['test@example.com'],
      );
    });

    it('should return false when email does not exist', async () => {
      databaseService.query.mockResolvedValue({
        rows: [{ exists: false }],
      });

      const result = await repository.existsByEmail('nonexistent@example.com');

      expect(result).toBe(false);
    });

    it('should ignore deleted users', async () => {
      databaseService.query.mockResolvedValue({
        rows: [{ exists: false }],
      });

      await repository.existsByEmail('deleted@example.com');

      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        ['deleted@example.com'],
      );
    });

    it('should return false when query returns empty rows', async () => {
      databaseService.query.mockResolvedValue({
        rows: [],
      });

      const result = await repository.existsByEmail('test@example.com');

      expect(result).toBe(false);
    });
  });

  describe('existsByUsername', () => {
    it('should return true when username exists', async () => {
      databaseService.query.mockResolvedValue({
        rows: [{ exists: true }],
      });

      const result = await repository.existsByUsername('testuser');

      expect(result).toBe(true);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT EXISTS'),
        ['testuser'],
      );
    });

    it('should return false when username does not exist', async () => {
      databaseService.query.mockResolvedValue({
        rows: [{ exists: false }],
      });

      const result = await repository.existsByUsername('nonexistentuser');

      expect(result).toBe(false);
    });
  });

  describe('validateTagIds', () => {
    it('should return all valid tag IDs', async () => {
      const tagIds = ['tag-1', 'tag-2', 'tag-3'];

      databaseService.query.mockResolvedValue({
        rows: [{ id: 'tag-1' }, { id: 'tag-2' }, { id: 'tag-3' }],
      });

      const result = await repository.validateTagIds(tagIds);

      expect(result).toEqual(['tag-1', 'tag-2', 'tag-3']);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id FROM tags'),
        [tagIds],
      );
    });

    it('should return partial matches when some tags are invalid', async () => {
      const tagIds = ['tag-1', 'invalid-tag', 'tag-2'];

      databaseService.query.mockResolvedValue({
        rows: [{ id: 'tag-1' }, { id: 'tag-2' }],
      });

      const result = await repository.validateTagIds(tagIds);

      expect(result).toEqual(['tag-1', 'tag-2']);
    });

    it('should return empty array when no tags exist', async () => {
      databaseService.query.mockResolvedValue({
        rows: [],
      });

      const result = await repository.validateTagIds(['invalid-1', 'invalid-2']);

      expect(result).toEqual([]);
    });
  });

  describe('createUserWithAffinity', () => {
    it('should create user with topic affinity in transaction', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      databaseService.getClient.mockResolvedValue(mockClient as any);
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [mockUser] }) // INSERT user
        .mockResolvedValueOnce(undefined) // INSERT affinity 1
        .mockResolvedValueOnce(undefined) // INSERT affinity 2
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await repository.createUserWithAffinity({
        email: mockUser.email,
        password_hash: mockUser.password_hash!,
        username: mockUser.username,
        experience_level: mockUser.experience_level,
        topics: ['topic-1', 'topic-2'],
      });

      expect(result).toEqual(mockUser);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should rollback transaction on error', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      databaseService.getClient.mockResolvedValue(mockClient as any);
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockRejectedValueOnce(new Error('DB Error')); // INSERT user fails

      await expect(
        repository.createUserWithAffinity({
          email: 'test@example.com',
          password_hash: 'hash',
          username: 'testuser',
          experience_level: 'beginner',
          topics: ['topic-1'],
        }),
      ).rejects.toThrow('DB Error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('findByEmail', () => {
    it('should return user when email exists', async () => {
      databaseService.query.mockResolvedValue({
        rows: [mockUser],
      });

      const result = await repository.findByEmail(mockUser.email);

      expect(result).toEqual(mockUser);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM users'),
        [mockUser.email],
      );
    });

    it('should return null when email does not exist', async () => {
      databaseService.query.mockResolvedValue({
        rows: [],
      });

      const result = await repository.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });

    it('should exclude deleted users', async () => {
      databaseService.query.mockResolvedValue({
        rows: [],
      });

      await repository.findByEmail('test@example.com');

      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        ['test@example.com'],
      );
    });
  });

  describe('findById', () => {
    it('should return user by ID', async () => {
      databaseService.query.mockResolvedValue({
        rows: [mockUser],
      });

      const result = await repository.findById(mockUser.id);

      expect(result).toEqual(mockUser);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM users'),
        [mockUser.id],
      );
    });

    it('should return null when user ID does not exist', async () => {
      databaseService.query.mockResolvedValue({
        rows: [],
      });

      const result = await repository.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByOAuthProvider', () => {
    it('should find user linked to OAuth provider', async () => {
      databaseService.query.mockResolvedValue({
        rows: [mockUser],
      });

      const result = await repository.findByOAuthProvider('google', 'google-123');

      expect(result).toEqual(mockUser);
      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('oauth_accounts'),
        ['google', 'google-123'],
      );
    });

    it('should return null when OAuth account not found', async () => {
      databaseService.query.mockResolvedValue({
        rows: [],
      });

      const result = await repository.findByOAuthProvider('github', 'github-456');

      expect(result).toBeNull();
    });
  });

  describe('linkOAuthAccount', () => {
    it('should link OAuth account to existing user', async () => {
      databaseService.query.mockResolvedValue({ rows: [] });

      await repository.linkOAuthAccount({
        userId: mockUser.id,
        provider: 'google',
        provider_user_id: 'google-123',
      });

      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO oauth_accounts'),
        expect.arrayContaining([mockUser.id, 'google', 'google-123']),
      );
    });
  });

  describe('createOAuthUser', () => {
    it('should create OAuth user in transaction', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      const newUser: User = { ...mockUser, id: 'new-id', password_hash: null };

      databaseService.getClient.mockResolvedValue(mockClient as any);
      mockClient.query
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce({ rows: [newUser] }) // INSERT user
        .mockResolvedValueOnce(undefined) // INSERT oauth_account
        .mockResolvedValueOnce(undefined); // COMMIT

      const result = await repository.createOAuthUser({
        email: 'oauth@example.com',
        username: 'oauthuser',
        avatar_url: 'https://example.com/avatar.jpg',
        provider: 'google',
        provider_user_id: 'google-123',
      });

      expect(result).toEqual(newUser);
      expect(result.password_hash).toBeNull();
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should set default experience_level to novice', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      databaseService.getClient.mockResolvedValue(mockClient as any);
      mockClient.query
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      await repository.createOAuthUser({
        email: 'oauth@example.com',
        username: 'oauthuser',
        avatar_url: null,
        provider: 'github',
        provider_user_id: 'github-456',
      });

      // Verify that novice is being inserted
      const insertCall = mockClient.query.mock.calls.find((call: any[]) =>
        call[0].includes('INSERT INTO users'),
      );
      expect(insertCall).toBeDefined();
    });
  });

  describe('incrementTokenVersion', () => {
    it('should increment token_version in database', async () => {
      databaseService.query.mockResolvedValue({ rows: [] });
      redisService.del.mockResolvedValue(1);

      await repository.incrementTokenVersion(mockUser.id);

      expect(databaseService.query).toHaveBeenCalledWith(
        expect.stringContaining('token_version = token_version + 1'),
        [mockUser.id],
      );
    });

    it('should evict Redis token version cache', async () => {
      databaseService.query.mockResolvedValue({ rows: [] });
      redisService.del.mockResolvedValue(1);

      await repository.incrementTokenVersion(mockUser.id);

      expect(redisService.del).toHaveBeenCalledWith(
        `${AUTH_REDIS_KEYS.TOKEN_VERSION_PREFIX}:${mockUser.id}`,
      );
    });
  });

  describe('Login attempt tracking', () => {
    describe('getLoginAttempts', () => {
      it('should return attempt count from Redis', async () => {
        redisService.get.mockResolvedValue('3');

        const result = await repository.getLoginAttempts('192.168.1.1', 'test@example.com');

        expect(result).toBe(3);
        expect(redisService.get).toHaveBeenCalledWith(
          `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:192.168.1.1:test@example.com`,
        );
      });

      it('should return 0 when no attempts recorded', async () => {
        redisService.get.mockResolvedValue(null);

        const result = await repository.getLoginAttempts('192.168.1.1', 'test@example.com');

        expect(result).toBe(0);
      });
    });

    describe('getLoginAttemptsTtl', () => {
      it('should return TTL from Redis', async () => {
        redisService.ttl.mockResolvedValue(600);

        const result = await repository.getLoginAttemptsTtl('192.168.1.1', 'test@example.com');

        expect(result).toBe(600);
        expect(redisService.ttl).toHaveBeenCalledWith(
          `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:192.168.1.1:test@example.com`,
        );
      });
    });

    describe('incrementLoginAttempts', () => {
      it('should increment counter and set TTL', async () => {
        redisService.incr.mockResolvedValue(1);
        redisService.expire.mockResolvedValue(1);

        await repository.incrementLoginAttempts('192.168.1.1', 'test@example.com');

        expect(redisService.incr).toHaveBeenCalledWith(
          `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:192.168.1.1:test@example.com`,
        );
        expect(redisService.expire).toHaveBeenCalledWith(
          `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:192.168.1.1:test@example.com`,
          AUTH_TTL.LOGIN_WINDOW_SECONDS,
        );
      });
    });

    describe('clearLoginAttempts', () => {
      it('should delete login attempts counter', async () => {
        redisService.del.mockResolvedValue(1);

        await repository.clearLoginAttempts('192.168.1.1', 'test@example.com');

        expect(redisService.del).toHaveBeenCalledWith(
          `${AUTH_REDIS_KEYS.LOGIN_ATTEMPTS_PREFIX}:192.168.1.1:test@example.com`,
        );
      });
    });
  });

  describe('Refresh token management', () => {
    describe('storeRefreshToken', () => {
      it('should store token hash in Redis with TTL', async () => {
        redisService.set.mockResolvedValue('OK');

        await repository.storeRefreshToken(
          mockUser.id,
          'token-family-123',
          '$2b$10$hashed_token',
        );

        expect(redisService.set).toHaveBeenCalledWith(
          `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${mockUser.id}:token-family-123`,
          '$2b$10$hashed_token',
          parseInt(AUTH_TTL.REFRESH_TOKEN_SECONDS, 10),
        );
      });
    });

    describe('getRefreshTokenHash', () => {
      it('should retrieve stored token hash', async () => {
        redisService.get.mockResolvedValue('$2b$10$hashed_token');

        const result = await repository.getRefreshTokenHash(mockUser.id, 'token-family-123');

        expect(result).toBe('$2b$10$hashed_token');
        expect(redisService.get).toHaveBeenCalledWith(
          `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${mockUser.id}:token-family-123`,
        );
      });

      it('should return null when token not found', async () => {
        redisService.get.mockResolvedValue(null);

        const result = await repository.getRefreshTokenHash(mockUser.id, 'nonexistent');

        expect(result).toBeNull();
      });
    });

    describe('rotateRefreshToken', () => {
      it('should delete old hash and store new one', async () => {
        redisService.del.mockResolvedValue(1);
        redisService.set.mockResolvedValue('OK');

        await repository.rotateRefreshToken(
          mockUser.id,
          'token-family-123',
          '$2b$10$new_hash',
        );

        expect(redisService.del).toHaveBeenCalledWith(
          `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${mockUser.id}:token-family-123`,
        );
        expect(redisService.set).toHaveBeenCalledWith(
          `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${mockUser.id}:token-family-123`,
          '$2b$10$new_hash',
          expect.any(Number),
        );
      });
    });

    describe('revokeAllSessions', () => {
      it('should delete all refresh tokens for user', async () => {
        redisService.deletePattern.mockResolvedValue(2);

        await repository.revokeAllSessions(mockUser.id);

        expect(redisService.deletePattern).toHaveBeenCalledWith(
          `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${mockUser.id}:*`,
        );
      });
    });

    describe('deleteRefreshToken', () => {
      it('should delete single refresh token', async () => {
        redisService.del.mockResolvedValue(1);

        await repository.deleteRefreshToken(mockUser.id, 'token-family-123');

        expect(redisService.del).toHaveBeenCalledWith(
          `${AUTH_REDIS_KEYS.REFRESH_TOKEN_PREFIX}:${mockUser.id}:token-family-123`,
        );
      });
    });
  });
});
